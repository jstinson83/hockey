import { attackedNet, defendedNet, NETS } from './collide';
import type { Intent } from './input';
import { nextRandom } from './rng';
import type { Skater, World } from './sim-types';
import { GOAL, RINK, TUNING } from './sim-constants';

/**
 * Skater AI, in three layers:
 *  1. Team plan: what state is the game in (we have the puck / they do / it's loose)
 *     and which role does this skater play in it. Each role has an anchor point that
 *     depends on the puck and the nets; the nearest skater chases or presses instead.
 *  2. Carrier decisions: a few times a second, shoot / pass / carry, with some randomness.
 *  3. Execution: steer toward a target with separation from other skaters, using the same
 *     Intent (stick + buttons) a human would, so the AI obeys the same physics.
 * Everything is a pure function of the world (and its seeded RNG), so it stays deterministic.
 */

export type Role = 'C' | 'L' | 'R' | 'LD' | 'RD';

/**
 * How a team gets the puck out of its own end (while its carrier is deep in it):
 *  - carry:   no plan; the carrier skates it out and the wings run the lanes ahead (the original behaviour).
 *  - boards:  the wing on the carrier's side holds the boards for an outlet pass; the other wing
 *             stays in the middle lane.
 *  - swing:   the centre drops low and wide for a short pass, then leads the rush; the wings spread.
 *  - stretch: the far wing flies to the far blue line and the carrier looks for the long pass.
 */
export const BREAKOUTS = ['carry', 'boards', 'swing', 'stretch'] as const;
export type Breakout = (typeof BREAKOUTS)[number];

/**
 * How a team defends the neutral zone, i.e. while the other team has the puck anywhere outside
 * our own end (inside it the team always collapses toward the slot):
 *  - man:   no plan; the nearest skater presses and the rest mark (the original behaviour).
 *  - trap:  wait. Four skaters form a wall just on our side of centre ice and the centre angles the
 *           carrier toward the boards; nobody forechecks, the wall engages whoever reaches it.
 *  - press: attack. The centre and the carrier-side wing go straight at the puck, the far wing
 *           covers the middle and the defence step up behind them.
 */
export const NEUTRALS = ['man', 'trap', 'press'] as const;
export type Neutral = (typeof NEUTRALS)[number];

/**
 * How a team works the puck once it is set up in the offensive zone (carrier past the blue line):
 *  - set:      no plan; the centre takes the slot, wings stay wide and low (the original behaviour).
 *  - shoot:    shoot first. The defence walk to the points, the centre screens the goalie and the
 *              wings crash the posts for rebounds; the carrier shoots from much further out.
 *  - cycle:    the carrier works the strong-side boards and the wing and centre rotate low behind
 *              the play, swinging the puck down low rather than shooting from the perimeter.
 *  - overload: three skaters crowd the strong side low, the far wing waits at the back post and the
 *              far defence slides to the middle for a seam pass.
 */
export const OFFENCES = ['set', 'shoot', 'cycle', 'overload'] as const;
export type Offence = (typeof OFFENCES)[number];

export interface AiState {
  think: number;         // s until the next decision
  shotHold: number;      // s left holding the shoot button on a shot
  releaseFrames: number; // frames of "released" to send after a hold so the shot fires
  aimX: number;
  aimY: number;          // where the current shot is aimed
  pulse: number;         // frames left holding a burst / check tap
  burstCd: number;
  passCd: number;
}

export function newAi(): AiState {
  return { think: 0, shotHold: 0, releaseFrames: 0, aimX: 0, aimY: 0, pulse: 0, burstCd: 0, passCd: 0 };
}

const CX = RINK.w / 2;
const MID = RINK.h / 2;

type Point = { x: number; y: number };

const intent = (x: number, y: number, action = false, pass = false): Intent => ({ x, y, action, pass });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** How far toward the attacked end a y is, in world units from centre ice. */
function progress(team: Skater['team'], y: number): number {
  return (y - MID) * attackedNet(team).dir;
}

function segDist(p: Point, a: Point, b: Point): number {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const len2 = sx * sx + sy * sy;
  const t = len2 === 0 ? 0 : clamp(((p.x - a.x) * sx + (p.y - a.y) * sy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + sx * t), p.y - (a.y + sy * t));
}

/** Is an opponent close enough to the line a -> b to block a shot or pass? */
function laneBlocked(world: World, team: Skater['team'], a: Point, b: Point): boolean {
  return world.skaters.some((o) => o.team !== team && segDist(o, a, b) < TUNING.aiLaneRadius);
}

function nearestOpponent(world: World, team: Skater['team'], p: Point): number {
  let best = Infinity;
  for (const o of world.skaters) if (o.team !== team) best = Math.min(best, dist(o, p));
  return best;
}

/** Closest skater of `team` to a point; skaters still locked out of the puck are skipped unless `eligibleOnly` is off. */
function closestTo(world: World, team: Skater['team'], p: Point, eligibleOnly = true, holdD = false): number {
  let best = -1;
  let bd = Infinity;
  world.skaters.forEach((m, j) => {
    if (m.team !== team || (eligibleOnly && m.lockout > 0)) return;
    const d = dist(m, p);
    if (holdD && isDefence(m.role) && d > TUNING.aiDefenceChase) return; // defence hold their spots rather than chase far
    if (d < bd) { bd = d; best = j; }
  });
  if (best >= 0) return best;
  return eligibleOnly ? closestTo(world, team, p, false, holdD) : holdD ? closestTo(world, team, p, false) : best;
}

/** Keep an anchor on the ice and out of (and away from the mouth of) the nets. */
function keepIn(x: number, y: number): Point {
  let px = clamp(x, 8, RINK.w - 8);
  let py = clamp(y, 8, RINK.h - 8);
  for (const net of NETS) {
    if (Math.abs(px - CX) < GOAL.width / 2 + 4 && (py - net.gy) * net.dir > -5) py = net.gy - net.dir * 6;
  }
  return { x: px, y: py };
}

const sideOf = (role: Role): number => (role === 'L' || role === 'LD' ? -1 : role === 'C' ? 0 : 1);
const isDefence = (role: Role): boolean => role === 'LD' || role === 'RD';

/** Is `carrier` deep enough in its own end that the team should be breaking out? */
function breakingOut(world: World, team: Skater['team'], carrier: Point): boolean {
  return world.breakout[team] !== 'carry' && progress(team, carrier.y) < -TUNING.aiBreakoutDepth;
}

/** Who the carrier is trying to find in the current breakout, or -1. */
function breakoutTarget(world: World, i: number): number {
  const s = world.skaters[i];
  const plan = world.breakout[s.team];
  const strong = s.x < CX ? 'L' : 'R'; // the wing on the carrier's side
  const role: Role | null = plan === 'boards' ? strong : plan === 'swing' ? 'C' : plan === 'stretch' ? (strong === 'L' ? 'R' : 'L') : null;
  if (!role) return -1;
  return world.skaters.findIndex((m, j) => j !== i && m.team === s.team && m.role === role);
}

/** Where a skater stands during a breakout; the carrier's side decides which wing is "strong". */
function breakoutAnchor(plan: Breakout, s: Skater, carrier: Point): Point {
  const fwd = attackedNet(s.team).dir;
  const cSide = carrier.x < CX ? -1 : 1;
  const wide = (side: number, inset: number): number => (side < 0 ? inset : RINK.w - inset);
  const side = sideOf(s.role);
  const strong = side === cSide;
  if (isDefence(s.role)) return keepIn(CX + side * 16, carrier.y - fwd * 4); // the partner: an outlet behind/beside the carrier
  switch (plan) {
    case 'boards':
      if (s.role === 'C') return keepIn(CX - cSide * 14, carrier.y - fwd * 6);
      return strong ? keepIn(wide(side, 7), carrier.y + fwd * 24) : keepIn(CX, carrier.y + fwd * 38);
    case 'swing':
      if (s.role === 'C') return keepIn(CX - cSide * 18, carrier.y - fwd * 9);
      return keepIn(wide(side, 12), carrier.y + fwd * 30);
    default: // stretch
      if (s.role === 'C') return keepIn(CX - cSide * 12, carrier.y - fwd * 6);
      return strong ? keepIn(wide(side, 10), carrier.y + fwd * 14) : keepIn(wide(side, 14), MID + fwd * 38);
  }
}

/** Where a skater stands once the team is set up in the offensive zone; the carrier's side decides the strong side. */
function offenceAnchor(plan: Offence, s: Skater, carrier: Point): Point {
  const net = attackedNet(s.team);
  const fwd = net.dir;
  const side = sideOf(s.role);
  const cSide = carrier.x < CX ? -1 : 1;
  const wide = (sd: number, inset: number): number => (sd < 0 ? inset : RINK.w - inset);
  const behind = net.gy + fwd * (GOAL.depth + 4); // just past the goal line, in the corner
  const point = keepIn(CX + side * 20, MID + fwd * TUNING.aiPointDepth);
  switch (plan) {
    case 'shoot':
      if (isDefence(s.role)) return point;
      if (s.role === 'C') return keepIn(CX, net.gy - fwd * 9); // screen the goalie
      return keepIn(CX + side * (GOAL.width / 2 + 3), net.gy - fwd * 8); // crash the posts
    case 'cycle': {
      if (isDefence(s.role)) return keepIn(CX + side * 26, MID + fwd * (TUNING.aiPointDepth - 6));
      const strongWing = s.role === (cSide < 0 ? 'L' : 'R');
      // Strong-side wing stays low in the corner, the centre supports high on the wall, the far wing is the slot option.
      if (s.role === 'C') return keepIn(wide(cSide, 14), carrier.y - fwd * 12);
      return strongWing ? keepIn(wide(cSide, 9), behind - fwd * 2) : keepIn(CX, net.gy - fwd * 16);
    }
    case 'overload': {
      if (isDefence(s.role)) {
        const strongD = side === cSide;
        return strongD ? keepIn(CX + side * 14, MID + fwd * TUNING.aiPointDepth) : keepIn(CX, net.gy - fwd * 26); // far D slides to the seam
      }
      if (s.role === 'C') return keepIn(wide(cSide, 22), net.gy - fwd * 10);
      const strongWing = side === cSide;
      return strongWing ? keepIn(wide(cSide, 9), behind - fwd * 2) : keepIn(CX - cSide * 6, net.gy - fwd * 6); // far wing at the back post
    }
    default: // set
      if (isDefence(s.role)) return point;
      if (s.role === 'C') return keepIn(CX, net.gy - fwd * 20);
      return keepIn(CX + side * 24, net.gy - fwd * 16);
  }
}

/** Where the support roles stand when we have (or are about to have) the puck. */
function supportAnchor(world: World, s: Skater, carrier: Point): Point {
  const net = attackedNet(s.team);
  const fwd = net.dir; // toward the attacked end
  const side = sideOf(s.role);
  if (breakingOut(world, s.team, carrier)) return breakoutAnchor(world.breakout[s.team], s, carrier);
  if (isDefence(s.role)) {
    // Defence hold the points when we are set up in their end, otherwise trail the play.
    if (progress(s.team, carrier.y) > 25) return offenceAnchor(world.offence[s.team], s, carrier);
    return keepIn(CX + side * 18, carrier.y - fwd * 14);
  }
  if (progress(s.team, carrier.y) > 25) return offenceAnchor(world.offence[s.team], s, carrier);
  // Rush / breakout: wings take the lanes just ahead of the puck, C trails.
  if (s.role === 'C') return keepIn(CX, carrier.y - fwd * 10);
  return keepIn(CX + side * 22, carrier.y + fwd * 6);
}

/**
 * Where the defending roles stand when they don't have the puck. Defence and the centre hold a
 * line on the goal-to-puck axis that moves up with the puck (defence in front, centre higher and
 * central), so the team collapses on the net only when the puck is already close to it. Wings
 * mark opponents.
 */
function defendAnchor(world: World, s: Skater, puck: Point, carrierIdx: number): Point {
  const own = defendedNet(s.team);
  const goal = { x: CX, y: own.gy };
  if (isDefence(s.role) || s.role === 'C') {
    const d = dist(puck, goal) || 1;
    const depth = isDefence(s.role)
      ? clamp(d * TUNING.aiDefenceGap, GOAL.crease + 12, 55)
      : clamp(d * TUNING.aiCentreGap, GOAL.crease + 20, 75);
    const x = goal.x + ((puck.x - goal.x) / d) * depth + sideOf(s.role) * 10;
    return keepIn(x, goal.y + ((puck.y - goal.y) / d) * depth);
  }
  const marks = world.skaters.filter((o, j) => o.team !== s.team && j !== carrierIdx).sort((a, b) => a.x - b.x);
  const mark = s.role === 'L' ? marks[0] : marks[marks.length - 1];
  if (!mark) return keepIn(CX + (s.role === 'L' ? -16 : 16), own.gy - own.dir * 20);
  const d = dist(mark, goal) || 1;
  return keepIn(mark.x + ((goal.x - mark.x) / d) * 5, mark.y + ((goal.y - mark.y) / d) * 5);
}

/** Does the neutral-zone plan run? The puck is out of our end (a little short of centre ice counts as out). */
function neutralActive(world: World, team: Skater['team'], p: Point): boolean {
  return world.neutral[team] !== 'man' && progress(team, p.y) >= -(TUNING.aiTrapLine + 2);
}

/** Where a skater stands (and whether it goes for the carrier) under a neutral-zone plan. */
function neutralAnchor(world: World, s: Skater, carrier: Point, carrierIdx: number): { target: Point; press: boolean } {
  const fwd = attackedNet(s.team).dir;
  const plan = world.neutral[s.team];
  const cSide = carrier.x < CX ? 'L' : 'R';
  const onCarrier = { x: carrier.x + (carrierIdx >= 0 ? world.skaters[carrierIdx].vx * 0.3 : 0), y: carrier.y + (carrierIdx >= 0 ? world.skaters[carrierIdx].vy * 0.3 : 0) };
  if (plan === 'press') {
    if (s.role === 'C' || s.role === cSide) return { target: routeAroundNet(s, onCarrier), press: true };
    if (isDefence(s.role)) return { target: keepIn(CX + sideOf(s.role) * 14, carrier.y - fwd * TUNING.aiPressGap), press: false };
    return { target: keepIn(CX, carrier.y - fwd * 14), press: false };
  }
  // trap
  const wallY = MID - fwd * TUNING.aiTrapLine;
  if (s.role === 'C') {
    // Angle the carrier: stand between it and the middle of the ice, a little on our side of it.
    const t = keepIn(carrier.x + (CX - carrier.x) * 0.4, carrier.y - fwd * 8);
    return { target: t, press: dist(s, carrier) < TUNING.aiPressure + 4 };
  }
  if (closestTo(world, s.team, carrier, false) === world.skaters.indexOf(s) && dist(s, carrier) < 14) {
    return { target: routeAroundNet(s, onCarrier), press: true }; // the wall engages whoever reaches it
  }
  const slotX = s.role === 'L' ? 12 : s.role === 'LD' ? 31 : s.role === 'RD' ? 54 : 73;
  const shade = clamp((carrier.x - CX) * 0.25, -8, 8);
  return { target: keepIn(slotX + shade, wallY), press: false };
}

/**
 * Chasing something behind a net from the front: go round the side first, or the skater just
 * pushes into the frame. (No real pathfinding; this is the one obstacle that matters.)
 */
function routeAroundNet(s: Skater, t: Point): Point {
  for (const net of NETS) {
    const targetBehind = (t.y - net.gy) * net.dir > 0;
    const inFront = (s.y - net.gy) * net.dir < -3;
    if (targetBehind && inFront) {
      const side = s.x < CX ? -1 : 1;
      return { x: CX + side * (GOAL.width / 2 + 6), y: net.gy };
    }
  }
  return t;
}

function separation(world: World, s: Skater): Point {
  let sx = 0;
  let sy = 0;
  for (const o of world.skaters) {
    if (o === s) continue;
    const d = dist(s, o);
    if (d > 0 && d < 7) {
      const w = (7 - d) / 7;
      sx += ((s.x - o.x) / d) * w;
      sy += ((s.y - o.y) / d) * w;
    }
  }
  return { x: sx, y: sy };
}

/** Stick input that steers `s` toward a point, arriving smoothly, with separation mixed in. */
function steer(world: World, s: Skater, t: Point, avoid = true): { x: number; y: number } {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const d = Math.hypot(dx, dy);
  const top = TUNING.maxSpeed * TUNING.aiSpeed;
  const sp = Math.min(top, d * TUNING.aiArrive);
  let wx = d > 1e-6 ? (dx / d) * sp : 0;
  let wy = d > 1e-6 ? (dy / d) * sp : 0;
  if (avoid) {
    const sep = separation(world, s);
    wx += sep.x * 12;
    wy += sep.y * 12;
  }
  let ix = (wx - s.vx) * 0.12;
  let iy = (wy - s.vy) * 0.12;
  const m = Math.hypot(ix, iy);
  if (m > 1) { ix /= m; iy /= m; }
  return { x: ix, y: iy };
}

export function aiIntent(world: World, i: number, dt: number): Intent {
  const s = world.skaters[i];
  const ai = s.ai;
  if (world.game.phase !== 'play') {
    ai.shotHold = 0; ai.releaseFrames = 0; ai.pulse = 0;
    return intent(0, 0);
  }
  ai.burstCd = Math.max(0, ai.burstCd - dt);
  ai.passCd = Math.max(0, ai.passCd - dt);
  ai.think -= dt;

  if (world.puck.carrier === i) return carrierIntent(world, i, dt);
  ai.shotHold = 0;
  ai.releaseFrames = 0;
  return offPuckIntent(world, i);
}

function aimIntent(s: Skater, ai: AiState, action: boolean): Intent {
  const dx = ai.aimX - s.x;
  const dy = ai.aimY - s.y;
  const d = Math.hypot(dx, dy) || 1;
  return intent((dx / d) * 0.6, (dy / d) * 0.6, action);
}

function carrierIntent(world: World, i: number, dt: number): Intent {
  const s = world.skaters[i];
  const ai = s.ai;
  const net = attackedNet(s.team);

  // Mid-shot: keep aiming, hold the button, then release for a frame so it fires.
  if (ai.releaseFrames > 0) {
    ai.releaseFrames--;
    return aimIntent(s, ai, false);
  }
  if (ai.shotHold > 0) {
    ai.shotHold -= dt;
    if (ai.shotHold <= 0) ai.releaseFrames = 1;
    return aimIntent(s, ai, true);
  }

  if (ai.think <= 0) {
    ai.think = 0.12 + nextRandom(world) * 0.12;

    // Shoot? In range, in front of the net, with a lane (or very close), some of the time.
    const d = dist(s, { x: CX, y: net.gy });
    const inFront = (s.y - net.gy) * -net.dir > 0;
    const plan = world.offence[s.team];
    const range = plan === 'shoot' ? TUNING.aiShootRange * 1.25 : plan === 'cycle' ? TUNING.aiShootRange * 0.7 : TUNING.aiShootRange;
    if (inFront && d < range) {
      // Usually aim at the far side from the goalie, but not perfectly: a varying distance
      // inside the posts, and now and then the wrong side.
      const goalie = world.goalies[s.team === 0 ? 1 : 0];
      const away = goalie.x < CX ? 1 : -1;
      const side = nextRandom(world) < TUNING.aiAimMistake ? -away : away;
      const aim = { x: CX + side * (1.5 + nextRandom(world) * 5), y: net.gy };
      const clear = d < 22 || !laneBlocked(world, s.team, s, aim);
      if (clear && nextRandom(world) < TUNING.aiShootChance * (plan === 'shoot' ? 1.5 : plan === 'cycle' ? 0.6 : 1)) {
        ai.aimX = aim.x;
        ai.aimY = aim.y;
        ai.shotHold = d > 32 ? 0.45 : 0.04; // slapshot from range, wrister up close
        return aimIntent(s, ai, true);
      }
    }

    // Pass? A breakout outlet first, then the usual read.
    const mate = breakoutPass(world, i) ?? choosePass(world, i);
    if (mate) {
      ai.passCd = TUNING.aiPassCooldown;
      const dx = mate.x - s.x;
      const dy = mate.y - s.y;
      const l = Math.hypot(dx, dy) || 1;
      return intent(dx / l, dy / l, false, true); // face the receiver and pass
    }
  }
  return carryIntent(world, i);
}

/** The breakout's designated outlet, if the carrier is breaking out and the lane to them is open. */
function breakoutPass(world: World, i: number): Point | null {
  const s = world.skaters[i];
  if (s.ai.passCd > 0 || !breakingOut(world, s.team, s)) return null;
  const j = breakoutTarget(world, i);
  if (j < 0) return null;
  const m = world.skaters[j];
  const d = dist(s, m);
  if (d < 8 || d > (world.breakout[s.team] === 'stretch' ? 130 : 70)) return null;
  if (laneBlocked(world, s.team, s, m) || nearestOpponent(world, s.team, m) < 6) return null;
  return m;
}

/** Best open teammate to pass to, or null. Prefers up-ice and open; passes out of pressure. */
function choosePass(world: World, i: number): Point | null {
  const s = world.skaters[i];
  if (s.ai.passCd > 0) return null;
  const myProg = progress(s.team, s.y);
  const pressured = nearestOpponent(world, s.team, s) < TUNING.aiPressure;
  let best: Point | null = null;
  let bestScore = 0;
  for (let j = 0; j < world.skaters.length; j++) {
    const m = world.skaters[j];
    if (j === i || m.team !== s.team) continue;
    const d = dist(s, m);
    if (d < 8 || d > 75) continue;
    if (laneBlocked(world, s.team, s, m)) continue;
    const open = Math.min(15, nearestOpponent(world, s.team, m));
    if (open < 6) continue;
    const gain = progress(s.team, m.y) - myProg;
    if (!(gain > 6 || (pressured && gain > -4))) continue;
    const score = gain + open * 0.5 + (pressured ? 8 : 0);
    if (score > bestScore) { best = m; bestScore = score; }
  }
  return best;
}

/** Skate the puck toward the slot in front of the net, bending around opponents in the way. */
function carryIntent(world: World, i: number): Intent {
  const s = world.skaters[i];
  const net = attackedNet(s.team);
  let tx = CX;
  let ty = net.gy - net.dir * 18;
  const d = Math.hypot(tx - s.x, ty - s.y) || 1;
  const ux = (tx - s.x) / d;
  const uy = (ty - s.y) / d;
  for (const o of world.skaters) {
    if (o.team === s.team) continue;
    const rx = o.x - s.x;
    const ry = o.y - s.y;
    const od = Math.hypot(rx, ry);
    const along = rx * ux + ry * uy;
    if (od < 14 && along > 0) {
      const lateral = ux * ry - uy * rx; // which side of my line the opponent is on
      const away = lateral > 0 ? -1 : 1;
      const w = 1 - od / 14;
      tx += -uy * away * 9 * w;
      ty += ux * away * 9 * w;
    }
  }
  const t = keepIn(tx, ty);
  const st = steer(world, s, t);
  return intent(st.x, st.y);
}

/** Everything a skater does without the puck: chase, press, support, defend. */
function offPuckIntent(world: World, i: number): Intent {
  const s = world.skaters[i];
  const ai = s.ai;
  const puck = world.puck;
  const carrier = puck.carrier >= 0 ? world.skaters[puck.carrier] : null;
  const mineHas = !!carrier && carrier.team === s.team;
  const pred = { x: clamp(puck.x + puck.vx * 0.25, 2, RINK.w - 2), y: clamp(puck.y + puck.vy * 0.25, 2, RINK.h - 2) };

  let target: Point;
  let chase = false;
  let press = false;
  if (!carrier) {
    if (closestTo(world, s.team, pred, true, true) === i) {
      target = routeAroundNet(s, pred);
      chase = true;
    } else {
      target = progress(s.team, puck.y) > 0 ? supportAnchor(world, s, puck)
        : neutralActive(world, s.team, puck) ? neutralAnchor(world, s, puck, -1).target
        : defendAnchor(world, s, puck, -1);
    }
  } else if (mineHas) {
    target = supportAnchor(world, s, carrier);
  } else if (neutralActive(world, s.team, carrier)) {
    ({ target, press } = neutralAnchor(world, s, carrier, puck.carrier));
  } else if (closestTo(world, s.team, carrier, false, true) === i) {
    target = routeAroundNet(s, { x: carrier.x + carrier.vx * 0.3, y: carrier.y + carrier.vy * 0.3 });
    press = true;
  } else {
    target = defendAnchor(world, s, carrier, puck.carrier);
  }

  const st = steer(world, s, target, !(chase || press));

  // Burst to close distance; tap to check when in reach of the carrier.
  let action = false;
  if (ai.pulse > 0) {
    ai.pulse--;
    action = true;
  } else if (ai.think <= 0) {
    ai.think = 0.12 + nextRandom(world) * 0.12;
    if (ai.burstCd <= 0 && (chase || press)) {
      const d = dist(s, target);
      const reach = press && d < TUNING.aiPressure + 1;
      if ((reach && nextRandom(world) < TUNING.aiCheckChance) || d > 16) {
        ai.pulse = 2;
        ai.burstCd = TUNING.aiBurstCooldown;
      }
    }
  }
  return intent(st.x, st.y, action);
}
