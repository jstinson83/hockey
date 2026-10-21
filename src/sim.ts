import {
  bounceOffBoards, collideCircles, collideNet, collideStatic, firstNetCrossing, NETS, type Net,
} from './collide';
import type { Intent } from './input';
import { GAME, GOAL, RINK, TEAM_COLORS, TUNING } from './sim-constants';

export { RINK, TUNING };

export type Team = 0 | 1;

export interface Skater {
  x: number; y: number;
  vx: number; vy: number;
  facing: number;      // radians
  team: Team;
  charge: number;      // seconds the action button has been held with the puck
  actionHeld: boolean; // previous frame's action state, for release detection
  lockout: number;     // s before this skater can pick up the puck
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
}

/** The net a team defends: red defends the bottom net, blue the top. */
export function defendedNet(team: Team): Net {
  return team === 0 ? NETS[1] : NETS[0];
}

function makeSkater(team: Team, y: number, facing: number): Skater {
  return {
    x: RINK.w / 2, y, vx: 0, vy: 0, facing, team,
    charge: 0, actionHeld: false, lockout: 0, color: TEAM_COLORS[team],
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

export function createWorld(): World {
  const world: World = {
    skaters: [makeSkater(0, 0, -Math.PI / 2), makeSkater(1, 0, Math.PI / 2)],
    goalies: [makeGoalie(0), makeGoalie(1)],
    puck: { x: RINK.w / 2, y: RINK.h / 2, vx: 0, vy: 0, carrier: -1 },
    game: {
      phase: 'faceoff', timer: GAME.faceoffSeconds, period: 1, overtime: false,
      clock: GAME.periodSeconds, score: [0, 0], lastScorer: null,
    },
  };
  placeForFaceoff(world);
  return world;
}

/** Everyone back to their faceoff spots with the puck at centre ice. */
function placeForFaceoff(world: World): void {
  const mid = RINK.h / 2;
  world.skaters.forEach((s, i) => {
    const below = i === 0;
    s.x = RINK.w / 2;
    s.y = mid + (below ? 14 : -14);
    s.vx = s.vy = 0;
    s.facing = below ? -Math.PI / 2 : Math.PI / 2;
    s.charge = 0;
    s.actionHeld = false;
    s.lockout = 0;
  });
  world.goalies.forEach((g, i) => Object.assign(g, makeGoalie(i as Team)));
  Object.assign(world.puck, { x: RINK.w / 2, y: mid, vx: 0, vy: 0, carrier: -1 });
}

function startFaceoff(world: World): void {
  placeForFaceoff(world);
  world.game.phase = 'faceoff';
  world.game.timer = GAME.faceoffSeconds;
}

/** Fixed-timestep step. Deterministic: same world + same intents => same result. */
export function step(world: World, intents: Intent[], dt: number): void {
  const { skaters, goalies, game } = world;
  const controllable = game.phase === 'play' || game.phase === 'goal';

  skaters.forEach((s, i) => moveSkater(s, controllable ? intents[i] : undefined, dt));

  // Skater vs. skater: separate, bounce, and let a hard hit knock the puck loose.
  for (let i = 0; i < skaters.length; i++) {
    for (let j = i + 1; j < skaters.length; j++) {
      const closing = collideCircles(
        skaters[i], skaters[j], TUNING.skaterRadius, TUNING.skaterRadius, TUNING.skaterBounce,
      );
      const carrier = world.puck.carrier;
      if (game.phase === 'play' && closing >= TUNING.checkSpeed && (carrier === i || carrier === j)) {
        knockLoose(world, carrier === i ? j : i);
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
  skaters.forEach((_, i) => handleShot(world, i, controllable ? intents[i] : undefined, dt));

  checkGoal(world);
  advancePhase(world, dt);
}

function moveSkater(s: Skater, intent: Intent | undefined, dt: number): void {
  s.lockout = Math.max(0, s.lockout - dt);
  if (intent) {
    s.vx += intent.x * TUNING.accel * dt;
    s.vy += intent.y * TUNING.accel * dt;
    if (intent.x !== 0 || intent.y !== 0) s.facing = Math.atan2(intent.y, intent.x);
  }
  const damp = Math.pow(TUNING.friction, dt);
  s.vx *= damp;
  s.vy *= damp;

  const speed = Math.hypot(s.vx, s.vy);
  if (speed > TUNING.maxSpeed) {
    s.vx = (s.vx / speed) * TUNING.maxSpeed;
    s.vy = (s.vy / speed) * TUNING.maxSpeed;
  }
  s.x += s.vx * dt;
  s.y += s.vy * dt;
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

function handleShot(world: World, i: number, intent: Intent | undefined, dt: number): void {
  const s = world.skaters[i];
  const held = !!intent?.action;
  const hasPuck = world.puck.carrier === i;

  if (hasPuck && held) s.charge += dt;

  if (hasPuck && s.actionHeld && !held) {
    const t = Math.min(s.charge / TUNING.chargeTime, 1);
    const power = TUNING.wristSpeed + (TUNING.slapSpeed - TUNING.wristSpeed) * t;
    const p = world.puck;
    p.carrier = -1;
    p.vx = Math.cos(s.facing) * power + s.vx * 0.5;
    p.vy = Math.sin(s.facing) * power + s.vy * 0.5;
    s.lockout = TUNING.shooterLockout;
    s.charge = 0;
  }
  if (!hasPuck) s.charge = 0;
  s.actionHeld = held;
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
