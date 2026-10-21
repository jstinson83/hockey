import { bounceOffBoards, collideCircles } from './collide';
import type { Intent } from './input';
import { RINK, TUNING } from './sim-constants';

export { RINK, TUNING };

export interface Skater {
  x: number; y: number;
  vx: number; vy: number;
  facing: number;      // radians
  charge: number;      // seconds the action button has been held with the puck
  actionHeld: boolean; // previous frame's action state, for release detection
  lockout: number;     // s before this skater can pick up the puck
  color: string;
}

export interface Puck {
  x: number; y: number;
  vx: number; vy: number;
  carrier: number; // index into skaters, or -1 when loose
}

export interface World {
  skaters: Skater[];
  puck: Puck;
}

function makeSkater(x: number, y: number, facing: number, color: string): Skater {
  return { x, y, vx: 0, vy: 0, facing, charge: 0, actionHeld: false, lockout: 0, color };
}

export function createWorld(): World {
  return {
    skaters: [
      makeSkater(RINK.w / 2, RINK.h / 2 + 30, -Math.PI / 2, '#d33'), // P1 starts below, facing up
      makeSkater(RINK.w / 2, RINK.h / 2 - 30, Math.PI / 2, '#36c'),
    ],
    puck: { x: RINK.w / 2, y: RINK.h / 2, vx: 0, vy: 0, carrier: -1 },
  };
}

/** Fixed-timestep step. Deterministic: same world + same intents => same result. */
export function step(world: World, intents: Intent[], dt: number): void {
  const { skaters, puck } = world;

  skaters.forEach((s, i) => moveSkater(s, intents[i], dt));

  // Skater vs. skater: separate, bounce, and let a hard hit knock the puck loose.
  for (let i = 0; i < skaters.length; i++) {
    for (let j = i + 1; j < skaters.length; j++) {
      const closing = collideCircles(
        skaters[i], skaters[j], TUNING.skaterRadius, TUNING.skaterRadius, TUNING.skaterBounce,
      );
      if (closing >= TUNING.checkSpeed && (puck.carrier === i || puck.carrier === j)) {
        knockLoose(world, puck.carrier === i ? j : i);
      }
    }
  }
  skaters.forEach((s) => bounceOffBoards(s, TUNING.skaterRadius, TUNING.wallBounce));

  updatePuck(world, dt);
  skaters.forEach((_, i) => handleShot(world, i, intents[i], dt));
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

function updatePuck(world: World, dt: number): void {
  const { puck, skaters } = world;

  if (puck.carrier >= 0) {
    const c = skaters[puck.carrier];
    puck.x = c.x + Math.cos(c.facing) * TUNING.carryOffset;
    puck.y = c.y + Math.sin(c.facing) * TUNING.carryOffset;
    puck.vx = c.vx;
    puck.vy = c.vy;
    // Carrying into the boards: the puck is still a physical object.
    bounceOffBoards(puck, TUNING.puckRadius, 0);
    return;
  }

  const damp = Math.pow(TUNING.puckFriction, dt);
  puck.vx *= damp;
  puck.vy *= damp;
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  bounceOffBoards(puck, TUNING.puckRadius, TUNING.puckBounce);

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
