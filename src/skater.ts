import type { Intent } from './input';
import { TUNING, type Team } from './sim-constants';
import type { Skater, World } from './sim-types';

/**
 * Who a human controls. Two ways control changes, and no others:
 *  - the puck: if a teammate (AI) picks it up, control moves to them, so the skater with the
 *    puck on a human's team is always the human's;
 *  - the pass button without the puck (with it, it's a pass): goes to the teammate closest to
 *    the puck, or the second closest if you already are the closest; presses in quick
 *    succession keep working down the ranking.
 * The held-button state moves with control so a held shoot button doesn't read as a fresh tap
 * on the new skater, and any pass press in progress is consumed so switching onto the carrier
 * doesn't also pass.
 */
export function updateControlled(world: World, human: Intent[], dt: number): void {
  const { skaters, puck } = world;
  for (const team of [0, 1] as const) {
    world.switchSince[team] += dt;
    const pressed = !!human[team]?.pass;
    const edge = pressed && !world.switchHeld[team];
    world.switchHeld[team] = pressed;
    if (!world.humans[team]) continue;
    const cur = world.controlled[team];

    // A teammate has the puck: they're yours now.
    if (puck.carrier >= 0 && puck.carrier !== cur && skaters[puck.carrier].team === team) {
      handOverControl(world, team, puck.carrier, pressed);
      continue;
    }
    if (!edge || puck.carrier === cur) continue; // with the puck it's a pass

    const mates = skaters
      .map((s, j) => ({ j, team: s.team, d: Math.hypot(s.x - puck.x, s.y - puck.y) }))
      .filter((m) => m.team === team)
      .sort((a, b) => a.d - b.d || a.j - b.j)
      .map((m) => m.j);
    if (mates.length < 2) continue;

    let rank: number;
    if (world.switchSince[team] < TUNING.switchChain) rank = (world.switchRank[team] + 1) % mates.length;
    else rank = mates[0] === cur ? 1 : 0;
    if (mates[rank] === cur) rank = (rank + 1) % mates.length;
    world.switchRank[team] = rank;
    world.switchSince[team] = 0;
    handOverControl(world, team, mates[rank], true);
  }
}

function handOverControl(world: World, team: Team, to: number, passPressed: boolean): void {
  const a = world.skaters[world.controlled[team]];
  const b = world.skaters[to];
  b.actionHeld = a.actionHeld;
  b.pressedWithoutPuck = a.pressedWithoutPuck;
  b.passHeld = passPressed; // a press in progress is spent on the switch
  a.actionHeld = false; a.passHeld = false; a.pressedWithoutPuck = false; a.charge = 0;
  world.controlled[team] = to;
}

export function moveSkater(s: Skater, intent: Intent | undefined, dt: number): void {
  s.lockout = Math.max(0, s.lockout - dt);
  s.checking = Math.max(0, s.checking - dt);
  s.poking = Math.max(0, s.poking - dt);
  s.pokeCd = Math.max(0, s.pokeCd - dt);
  s.stun = Math.max(0, s.stun - dt);
  s.actT += dt;
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
export function stunAndShove(victim: Skater, checker: Skater): void {
  const dx = victim.x - checker.x;
  const dy = victim.y - checker.y;
  const d = Math.hypot(dx, dy) || 1;
  victim.vx += (dx / d) * TUNING.checkImpulse;
  victim.vy += (dy / d) * TUNING.checkImpulse;
  victim.stun = TUNING.checkStun;
  victim.charge = 0;
}
