import { aiIntent, newAi, type AiState, type Role } from './ai';
import {
  attackedNet, bounceOffBoards, collideCircles, collideNet, collideStatic, defendedNet,
  firstNetCrossing, NETS,
} from './collide';
import type { Intent } from './input';
import { nextRandom } from './rng';
import { GAME, GOAL, RINK, TEAM_COLORS, TUNING, type Team } from './sim-constants';

export { RINK, TUNING, defendedNet };
export type { Team };

export interface Skater {
  x: number; y: number;
  vx: number; vy: number;
  facing: number;      // radians
  team: Team;
  role: Role;
  ai: AiState;         // memory for when the AI is driving this skater
  charge: number;      // seconds the action button has been held with the puck
  actionHeld: boolean; // previous frame's shoot-button state, for press/release detection
  passHeld: boolean;
  pressedWithoutPuck: boolean; // this press began without the puck, so it is a burst, not a shot
  lockout: number;     // s before this skater can pick up the puck
  boost: number;       // extra top speed from burst taps; decays
  checking: number;    // s left in the check window opened by a tap
  stun: number;        // s left of reduced control after being checked
  color: string;
}

export interface Goalie {
  team: Team;
  x: number; y: number;
  vx: number; vy: number;
  watchX: number; watchY: number; // reaction-delayed view of the puck
  threat: number;   // s the puck has been on target
  down: number;     // s left in the butterfly (0 = standing)
  diveLeft: number; // s left of the sideways slide
  diveX: number;
}

export interface Puck {
  x: number; y: number;
  vx: number; vy: number;
  carrier: number; // index into skaters, or -1 when loose
}

export type Phase = 'faceoff' | 'play' | 'goal' | 'end';

export interface Game {
  phase: Phase;
  timer: number;      // s left in a faceoff or goal pause
  period: number;     // 1-based; the overtime period is periods + 1
  overtime: boolean;
  clock: number;      // s left in the period
  score: [number, number];
  lastScorer: Team | null;
}

export interface World {
  skaters: Skater[];
  goalies: Goalie[]; // indexed by team
  puck: Puck;
  game: Game;
  rng: number; // PRNG state; shot spread and AI decisions draw from it, keeping the sim deterministic per seed
  humans: [boolean, boolean]; // does a person drive each team's controlled skater? (false = AI plays that team)
  controlled: [number, number]; // skater index each team's human controls; changes only when they switch
  switchHeld: [boolean, boolean]; // previous frame's switch button, for press detection
}

const ROLES: Role[] = ['C', 'L', 'R'];

function makeSkater(team: Team, slot: number): Skater {
  return {
    x: RINK.w / 2, y: RINK.h / 2, vx: 0, vy: 0, facing: 0, team, role: ROLES[slot % 3], ai: newAi(),
    charge: 0, actionHeld: false, passHeld: false, pressedWithoutPuck: false, lockout: 0,
    boost: 0, checking: 0, stun: 0, color: TEAM_COLORS[team],
  };
}

function makeGoalie(team: Team): Goalie {
  const net = defendedNet(team);
  const y = net.gy - net.dir * 3.2;
  return {
    team, x: RINK.w / 2, y, vx: 0, vy: 0, watchX: RINK.w / 2, watchY: RINK.h / 2,
    threat: 0, down: 0, diveLeft: 0, diveX: RINK.w / 2,
  };
}

/**
 * A fresh game. `perTeam` skaters a side (3v3 by default); skaters[0..perTeam-1] are red,
 * the rest blue, centre first. Both teams start human-driven; the caller sets `humans`.
 */
export function createWorld(seed = 1, opts: { perTeam?: number } = {}): World {
  const perTeam = opts.perTeam ?? 3;
  const skaters: Skater[] = [];
  for (const team of [0, 1] as const) for (let k = 0; k < perTeam; k++) skaters.push(makeSkater(team, k));
  const world: World = {
    skaters,
    goalies: [makeGoalie(0), makeGoalie(1)],
    puck: { x: RINK.w / 2, y: RINK.h / 2, vx: 0, vy: 0, carrier: -1 },
    game: {
      phase: 'faceoff', timer: GAME.faceoffSeconds, period: 1, overtime: false,
      clock: GAME.periodSeconds, score: [0, 0], lastScorer: null,
    },
    rng: seed | 0,
    humans: [true, true],
    controlled: [0, perTeam],
    switchHeld: [false, false],
  };
  placeForFaceoff(world);
  return world;
}

/** Add a skater (tests and scenarios). It starts with no human and takes the next free role. */
export function addSkater(world: World, team: Team, x: number, y: number): Skater {
  const slot = world.skaters.filter((s) => s.team === team).length;
  const s = makeSkater(team, slot);
  s.x = x;
  s.y = y;
  world.skaters.push(s);
  return s;
}

/** Everyone back to their faceoff spots with the puck at centre ice. */
function placeForFaceoff(world: World): void {
  const mid = RINK.h / 2;
  const slots = [0, 0];
  world.skaters.forEach((s) => {
    const k = slots[s.team]++;
    const sign = s.team === 0 ? 1 : -1; // red starts below centre, blue above
    s.x = RINK.w / 2 + (k === 0 ? 0 : k === 1 ? -20 : 20);
    s.y = mid + sign * (k === 0 ? 14 : 30);
    s.vx = s.vy = 0;
    s.facing = s.team === 0 ? -Math.PI / 2 : Math.PI / 2;
    s.charge = 0;
    s.actionHeld = false;
    s.passHeld = false;
    s.pressedWithoutPuck = false;
    s.lockout = 0;
    s.boost = 0;
    s.checking = 0;
    s.stun = 0;
    s.ai = newAi();
  });
  world.goalies.forEach((g, i) => Object.assign(g, makeGoalie(i as Team)));
  Object.assign(world.puck, { x: RINK.w / 2, y: mid, vx: 0, vy: 0, carrier: -1 });
  // Each human starts on their centre.
  world.controlled = [world.skaters.findIndex((s) => s.team === 0), world.skaters.findIndex((s) => s.team === 1)];
}

function startFaceoff(world: World): void {
  placeForFaceoff(world);
  world.game.phase = 'faceoff';
  world.game.timer = GAME.faceoffSeconds;
}

/**
 * Fixed-timestep step. Deterministic: same world + same human inputs => same result.
 * `human` is the stick input per team (red, blue) for that team's controlled skater;
 * every other skater (or every skater on a team with no human) is driven by the AI.
 */
export function step(world: World, human: Intent[], dt: number): void {
  const { skaters, goalies, game } = world;
  const controllable = game.phase === 'play' || game.phase === 'goal';

  updateControlled(world, human);
  const intents: (Intent | undefined)[] = skaters.map((s, i) =>
    world.humans[s.team] && world.controlled[s.team] === i ? human[s.team] : aiIntent(world, i, dt),
  );

  skaters.forEach((s, i) => moveSkater(s, controllable ? intents[i] : undefined, dt));

  // Skater vs. skater: separate and bounce. A tap of the shoot button opens a check window;
  // a hit inside it lands at a low closing speed, shoves and stuns the victim, and knocks
  // the puck loose. Plain contact only knocks the puck loose when it is hard enough.
  for (let i = 0; i < skaters.length; i++) {
    for (let j = i + 1; j < skaters.length; j++) {
      const a = skaters[i];
      const b = skaters[j];
      const checking = a.checking > 0 || b.checking > 0;
      const closing = collideCircles(
        a, b, TUNING.skaterRadius, TUNING.skaterRadius, checking ? TUNING.checkBounce : TUNING.skaterBounce,
      );
      if (game.phase !== 'play') continue;
      const carrier = world.puck.carrier;
      const threshold = checking ? TUNING.checkMinSpeed : TUNING.checkSpeed;
      if (closing >= threshold && (carrier === i || carrier === j)) knockLoose(world, carrier === i ? j : i);
      if (checking && closing >= TUNING.checkMinSpeed) {
        if (a.checking > 0) stunAndShove(b, a);
        if (b.checking > 0) stunAndShove(a, b);
      }
    }
  }
  skaters.forEach((s) => {
    NETS.forEach((net) => collideNet(s, TUNING.skaterRadius, net, 0.2, true));
    bounceOffBoards(s, TUNING.skaterRadius, TUNING.wallBounce);
  });

  goalies.forEach((g) => updateGoalie(world, g, dt));
  skaters.forEach((s) => goalies.forEach((g) => collideStatic(s, TUNING.skaterRadius, g, goalieRadius(g), 0.2)));

  updatePuck(world, dt);
  skaters.forEach((_, i) => handleButtons(world, i, controllable ? intents[i] : undefined, dt));

  checkGoal(world);
  advancePhase(world, dt);
}

/**
 * Control only changes when a human presses switch: it moves to the teammate nearest the
 * puck (never auto-switching, so the skater you're driving doesn't change under you). The
 * held-button state moves with control so a held shoot button doesn't read as a fresh tap
 * on the new skater.
 */
function updateControlled(world: World, human: Intent[]): void {
  const { skaters, puck } = world;
  for (const team of [0, 1] as const) {
    const pressed = !!human[team]?.switchPlayer;
    const edge = pressed && !world.switchHeld[team];
    world.switchHeld[team] = pressed;
    if (!edge || !world.humans[team]) continue;

    const cur = world.controlled[team];
    let best = cur;
    let bd = Infinity;
    skaters.forEach((s, j) => {
      if (s.team !== team || j === cur) return;
      const d = Math.hypot(s.x - puck.x, s.y - puck.y);
      if (d < bd) { bd = d; best = j; }
    });
    if (best === cur) continue;

    const a = skaters[cur];
    const b = skaters[best];
    b.actionHeld = a.actionHeld; b.passHeld = a.passHeld; b.pressedWithoutPuck = a.pressedWithoutPuck;
    a.actionHeld = false; a.passHeld = false; a.pressedWithoutPuck = false; a.charge = 0;
    world.controlled[team] = best;
  }
}

function moveSkater(s: Skater, intent: Intent | undefined, dt: number): void {
  s.lockout = Math.max(0, s.lockout - dt);
  s.checking = Math.max(0, s.checking - dt);
  s.stun = Math.max(0, s.stun - dt);
  s.boost = Math.max(0, s.boost - TUNING.boostDecay * dt);
  if (intent) {
    const accel = TUNING.accel * (s.stun > 0 ? TUNING.stunAccel : 1);
    s.vx += intent.x * accel * dt;
    s.vy += intent.y * accel * dt;
    if (intent.x !== 0 || intent.y !== 0) s.facing = Math.atan2(intent.y, intent.x);
  }
  const damp = Math.pow(TUNING.friction, dt);
  s.vx *= damp;
  s.vy *= damp;

  const cap = TUNING.maxSpeed + s.boost;
  const speed = Math.hypot(s.vx, s.vy);
  if (speed > cap) {
    s.vx = (s.vx / speed) * cap;
    s.vy = (s.vy / speed) * cap;
  }
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

/** The checked skater is shoved away from the checker and loses control for a moment. */
function stunAndShove(victim: Skater, checker: Skater): void {
  const dx = victim.x - checker.x;
  const dy = victim.y - checker.y;
  const d = Math.hypot(dx, dy) || 1;
  victim.vx += (dx / d) * TUNING.checkImpulse;
  victim.vy += (dy / d) * TUNING.checkImpulse;
  victim.stun = TUNING.checkStun;
  victim.charge = 0;
}

export function goalieRadius(g: Goalie): number {
  return g.down > 0 ? TUNING.goalieDownRadius : TUNING.goalieRadius;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * The goalie is a physical blocker, not a dice roll: it tracks the puck with a
 * lag, stands out to cut the angle, and commits to a butterfly slide when a
 * shot is on target. Saves come out of the collision with the puck.
 */
function updateGoalie(world: World, g: Goalie, dt: number): void {
  const net = defendedNet(g.team);
  const { puck } = world;
  const cx = RINK.w / 2;
  const hw = GOAL.width / 2;

  const k = 1 - Math.exp(-dt / TUNING.goalieReaction);
  g.watchX += (puck.x - g.watchX) * k;
  g.watchY += (puck.y - g.watchY) * k;

  // Is a shot heading for the mouth? Only commits once it has been on target for the reaction time.
  const speed = Math.hypot(puck.vx, puck.vy);
  const distToLine = (puck.y - net.gy) * -net.dir;
  let xCross = 0;
  let onTarget = false;
  if (
    world.game.phase === 'play' && puck.carrier < 0 && puck.vy * net.dir > 0 &&
    speed > TUNING.goalieDiveTrigger && distToLine > 0 && distToLine < TUNING.goalieDiveRange
  ) {
    xCross = puck.x + puck.vx * (distToLine / Math.abs(puck.vy));
    onTarget = Math.abs(xCross - cx) < hw + 2;
  }
  g.threat = onTarget ? g.threat + dt : 0;
  if (g.down <= 0 && g.threat > TUNING.goalieReaction) {
    g.down = TUNING.goalieDownTime;
    g.diveLeft = TUNING.goalieDiveTime;
    g.diveX = clamp(xCross, cx - hw + 1, cx + hw - 1);
    g.threat = 0;
  }

  let wantVx = 0;
  let wantVy = 0;
  if (g.down > 0) {
    g.down -= dt;
    if (g.diveLeft > 0) {
      g.diveLeft -= dt;
      wantVx = clamp((g.diveX - g.x) * 10, -TUNING.goalieDiveSpeed, TUNING.goalieDiveSpeed);
    }
  } else {
    // Stand on the line from the net's mouth toward the puck, further out the closer it is.
    const rx = cx;
    const ry = net.gy + net.dir * 1.5;
    const dx = g.watchX - rx;
    const dy = g.watchY - ry;
    const dist = Math.hypot(dx, dy) || 1;
    const stand = 3.2 + 3.0 * clamp(1 - (dist - 12) / 45, 0, 1);
    const tx = clamp(rx + (dx / dist) * stand, cx - hw - 0.5, cx + hw + 0.5);
    const front = clamp((ry + (dy / dist) * stand - net.gy) * -net.dir, 0.8, GOAL.crease - 1);
    const ty = net.gy - net.dir * front;
    wantVx = clamp((tx - g.x) * 8, -TUNING.goalieSpeed, TUNING.goalieSpeed);
    wantVy = clamp((ty - g.y) * 8, -TUNING.goalieSpeed, TUNING.goalieSpeed);
  }
  const blend = Math.min(1, 15 * dt);
  g.vx += (wantVx - g.vx) * blend;
  g.vy += (wantVy - g.vy) * blend;
  g.x = clamp(g.x + g.vx * dt, cx - hw - 0.5, cx + hw + 0.5);
  const front = clamp((g.y + g.vy * dt - net.gy) * -net.dir, 0.8, GOAL.crease - 1);
  g.y = net.gy - net.dir * front;
}

function updatePuck(world: World, dt: number): void {
  const { puck, skaters, goalies } = world;
  const r = TUNING.puckRadius;

  if (puck.carrier >= 0) {
    const c = skaters[puck.carrier];
    puck.x = c.x + Math.cos(c.facing) * TUNING.carryOffset;
    puck.y = c.y + Math.sin(c.facing) * TUNING.carryOffset;
    puck.vx = c.vx;
    puck.vy = c.vy;

    // The puck stays on the skater's side of any net frame: if the carry line crosses
    // one (skating into the back of the net, say), shorten the carry so it rests against it.
    const crossing = Math.min(...NETS.map((net) => firstNetCrossing(c.x, c.y, puck.x, puck.y, net)));
    if (crossing < 1) {
      const d = Math.max(0.8, crossing * TUNING.carryOffset - (r + TUNING.postRadius));
      puck.x = c.x + Math.cos(c.facing) * d;
      puck.y = c.y + Math.sin(c.facing) * d;
    }

    // A carried puck can't go through the nets or a goalie: push the skater back instead.
    const px = puck.x;
    const py = puck.y;
    NETS.forEach((net) => collideNet(puck, r, net, 0, true));
    goalies.forEach((g) => collideStatic(puck, r, g, goalieRadius(g), 0));
    const dx = puck.x - px;
    const dy = puck.y - py;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      c.x += dx;
      c.y += dy;
      const vn = (c.vx * dx + c.vy * dy) / len;
      if (vn < 0) {
        c.vx -= (vn * dx) / len;
        c.vy -= (vn * dy) / len;
      }
    }
    // Carrying into the boards: the puck is still a physical object.
    bounceOffBoards(puck, r, 0);
    return;
  }

  const damp = Math.pow(TUNING.puckFriction, dt);
  puck.vx *= damp;
  puck.vy *= damp;
  const sp = Math.hypot(puck.vx, puck.vy);
  if (sp > TUNING.maxPuckSpeed) {
    puck.vx *= TUNING.maxPuckSpeed / sp;
    puck.vy *= TUNING.maxPuckSpeed / sp;
  }
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  bounceOffBoards(puck, r, TUNING.puckBounce);
  NETS.forEach((net) => collideNet(puck, r, net, TUNING.netBounce, false));
  goalies.forEach((g) => collideStatic(puck, r, g, goalieRadius(g), TUNING.goalieBounce));

  if (world.game.phase !== 'play') return;

  // Pickup: nearest eligible skater wins.
  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed > TUNING.pickupSpeed) return;
  let best = -1;
  let bestDist = TUNING.pickupRadius;
  skaters.forEach((s, i) => {
    if (s.lockout > 0) return;
    const d = Math.hypot(s.x - puck.x, s.y - puck.y);
    if (d < bestDist) { best = i; bestDist = d; }
  });
  if (best >= 0) {
    puck.carrier = best;
    skaters[best].charge = 0;
  }
}

/** Knock the puck off its carrier, toward the skater who hit them. */
function knockLoose(world: World, hitter: number): void {
  const { puck, skaters } = world;
  const victim = skaters[puck.carrier];
  const h = skaters[hitter];
  const dx = victim.x - h.x;
  const dy = victim.y - h.y;
  const d = Math.hypot(dx, dy) || 1;
  puck.carrier = -1;
  puck.vx = victim.vx + (dx / d) * 25;
  puck.vy = victim.vy + (dy / d) * 25;
  victim.lockout = 0.4;
  victim.charge = 0;
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Buttons per skater. With the puck: the shoot button charges a shot (released = shoot),
 * the pass button passes. Without it: a tap of the shoot button is a speed burst that also
 * opens a check window.
 */
function handleButtons(world: World, i: number, intent: Intent | undefined, dt: number): void {
  const s = world.skaters[i];
  const held = !!intent?.action;
  const passHeld = !!intent?.pass;
  const hasPuck = world.puck.carrier === i;
  const pressed = held && !s.actionHeld;
  const released = !held && s.actionHeld;
  const passPressed = passHeld && !s.passHeld;
  s.actionHeld = held;
  s.passHeld = passHeld;

  if (pressed && !hasPuck) {
    s.pressedWithoutPuck = true;
    burst(s, intent);
  }
  // A press that began without the puck stays a burst even if the puck arrives mid-press.
  const shotPress = !s.pressedWithoutPuck;
  if (!held) s.pressedWithoutPuck = false;

  if (hasPuck && world.game.phase === 'play') {
    if (passPressed) {
      passPuck(world, i);
      return;
    }
    if (held && shotPress) s.charge += dt;
    if (released && shotPress) shoot(world, i);
  }
  if (world.puck.carrier !== i) s.charge = 0;
}

/** Kick forward and raise top speed (up to a cap); the check window opens too. */
function burst(s: Skater, intent: Intent | undefined): void {
  let dx = intent?.x ?? 0;
  let dy = intent?.y ?? 0;
  if (dx === 0 && dy === 0) {
    dx = Math.cos(s.facing);
    dy = Math.sin(s.facing);
  }
  const len = Math.hypot(dx, dy) || 1;
  s.boost = Math.min(TUNING.boostMax, s.boost + TUNING.boostPerTap);
  s.vx += (dx / len) * TUNING.boostImpulse;
  s.vy += (dy / len) * TUNING.boostImpulse;
  s.checking = TUNING.checkWindow;
}

/**
 * Shot direction: where the skater faces, pulled toward the net when it is roughly ahead
 * (the pull keeps the lateral aim, only clamping to inside the posts), then jittered.
 * Aim assist gets the puck to the net; the goalie decides whether it goes in.
 */
function shotAngle(world: World, s: Skater, charge01: number): number {
  // Aim from where the puck actually leaves (the carry point), not the skater's centre:
  // on a steep angle the 3.4-unit carry offset is several units of error at the net.
  const o = world.puck;
  let angle = s.facing;
  const net = attackedNet(s.team);
  const dy = net.gy - o.y;
  const inFront = (o.y - net.gy) * -net.dir > 0;
  const toNet = Math.atan2(dy, RINK.w / 2 - o.x);
  const fy = Math.sin(s.facing);
  if (inFront && Math.abs(wrapAngle(toNet - s.facing)) < TUNING.aimAssistCone && fy * dy > 0) {
    const xCross = o.x + Math.cos(s.facing) * (dy / fy);
    const reach = GOAL.width / 2 - TUNING.aimInset;
    const targetX = Math.min(Math.max(xCross, RINK.w / 2 - reach), RINK.w / 2 + reach);
    const target = Math.atan2(dy, targetX - o.x);
    angle += wrapAngle(target - s.facing) * TUNING.aimAssist;
  }
  const spread = TUNING.wristSpread + (TUNING.slapSpread - TUNING.wristSpread) * charge01;
  return angle + (nextRandom(world) * 2 - 1) * spread;
}

function shoot(world: World, i: number): void {
  const s = world.skaters[i];
  const t = clamp01(s.charge / TUNING.chargeTime);
  const power = TUNING.wristSpeed + (TUNING.slapSpeed - TUNING.wristSpeed) * t;
  const angle = shotAngle(world, s, t);
  const p = world.puck;
  p.carrier = -1;
  p.vx = Math.cos(angle) * power + s.vx * 0.5;
  p.vy = Math.sin(angle) * power + s.vy * 0.5;
  s.lockout = TUNING.shooterLockout;
  s.charge = 0;
}

/** Teammate (if any) nearest to where the skater is facing, within the pass cone. */
function passTarget(world: World, i: number): Skater | null {
  const s = world.skaters[i];
  let best: Skater | null = null;
  let bestScore = Infinity;
  world.skaters.forEach((m, j) => {
    if (j === i || m.team !== s.team) return;
    const off = Math.abs(wrapAngle(Math.atan2(m.y - s.y, m.x - s.x) - s.facing));
    if (off > TUNING.passCone) return;
    const score = off * 40 + Math.hypot(m.x - s.x, m.y - s.y); // prefer on-line, then near
    if (score < bestScore) { best = m; bestScore = score; }
  });
  return best;
}

/** A flat pass: to the teammate in front (led by their velocity), else straight ahead. */
function passPuck(world: World, i: number): void {
  const s = world.skaters[i];
  const mate = passTarget(world, i);
  let angle = s.facing;
  if (mate) {
    angle = Math.atan2(
      mate.y + mate.vy * TUNING.passLead - s.y,
      mate.x + mate.vx * TUNING.passLead - s.x,
    );
  }
  const p = world.puck;
  p.carrier = -1;
  p.vx = Math.cos(angle) * TUNING.passSpeed + s.vx * 0.5;
  p.vy = Math.sin(angle) * TUNING.passSpeed + s.vy * 0.5;
  s.lockout = TUNING.shooterLockout;
  s.charge = 0;
}

/**
 * A puck inside the net - wholly past the goal line, between the posts, and
 * still in front of the back - is a goal for the other team. (Behind the net
 * is not in the net.)
 */
function checkGoal(world: World): void {
  const { puck, game } = world;
  if (game.phase !== 'play') return;
  NETS.forEach((net, i) => {
    const inMouth = puck.x > net.x0 && puck.x < net.x1;
    const depth = (puck.y - net.gy) * net.dir; // how far past the goal line, toward the back
    const inside = depth > TUNING.puckRadius && depth < GOAL.depth;
    if (!inMouth || !inside) return;
    const scorer: Team = i === 0 ? 0 : 1; // the far net is red's target
    game.score[scorer]++;
    game.lastScorer = scorer;
    game.phase = 'goal';
    game.timer = GAME.goalSeconds;
    puck.carrier = -1;
  });
}

function advancePhase(world: World, dt: number): void {
  const g = world.game;
  if (g.phase === 'play') {
    g.clock = Math.max(0, g.clock - dt);
    if (g.clock === 0) endPeriod(world);
  } else if (g.phase === 'faceoff') {
    g.timer -= dt;
    if (g.timer <= 0) g.phase = 'play';
  } else if (g.phase === 'goal') {
    g.timer -= dt;
    if (g.timer <= 0) {
      if (g.overtime) g.phase = 'end'; // sudden death
      else startFaceoff(world);
    }
  }
}

function endPeriod(world: World): void {
  const g = world.game;
  if (g.overtime) {
    g.phase = 'end'; // overtime expired: a tie
  } else if (g.period < GAME.periods) {
    g.period++;
    g.clock = GAME.periodSeconds;
    startFaceoff(world);
  } else if (g.score[0] !== g.score[1]) {
    g.phase = 'end';
  } else {
    g.overtime = true;
    g.period++;
    g.clock = GAME.overtimeSeconds;
    startFaceoff(world);
  }
}
