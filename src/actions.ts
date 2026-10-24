import { attackedNet } from './collide';
import type { Intent } from './input';
import { nextRandom } from './rng';
import { clamp01, wrapAngle } from './mathutil';
import { GOAL, RINK, TUNING } from './sim-constants';
import { knockLoose } from './puck';
import type { Act, Skater, World } from './sim-types';

/** Charge fraction from which a release is drawn as a slapshot rather than a wrist shot (animation only). */
const SLAP_FRACTION = 0.5;

function setAct(s: Skater, act: Act): void {
  s.act = act;
  s.actT = 0;
}

/**
 * Buttons per skater. With the puck: the shoot button charges a shot (released = shoot),
 * the pass button passes. Without it: a tap of the shoot button is a speed burst that also
 * opens a check window.
 */
export function handleButtons(world: World, i: number, intent: Intent | undefined, dt: number): void {
  const s = world.skaters[i];
  const held = !!intent?.action;
  const passHeld = !!intent?.pass;
  const hasPuck = world.puck.carrier === i;
  const pressed = held && !s.actionHeld;
  const released = !held && s.actionHeld;
  const passPressed = passHeld && !s.passHeld;
  s.actionHeld = held;
  const pokePressed = !!intent?.poke && !s.pokeHeld;
  s.pokeHeld = !!intent?.poke;
  if (pokePressed && !hasPuck && world.game.phase === 'play') pokeCheck(world, i);
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

/**
 * Poke check: a stab of the stick along the skater's facing. If the carrier is an opponent inside
 * the reach and cone, it strips the puck with probability pokeChance. Hit or miss, the stab
 * leaves the skater on cooldown (and lunging a little), so spamming it is a bad idea.
 */
function pokeCheck(world: World, i: number): void {
  const s = world.skaters[i];
  if (s.pokeCd > 0 || s.stun > 0) return;
  s.pokeCd = TUNING.pokeCooldown;
  s.poking = 0.18;
  s.vx += Math.cos(s.facing) * TUNING.pokeLunge;
  s.vy += Math.sin(s.facing) * TUNING.pokeLunge;
  const c = world.puck.carrier;
  const v = c >= 0 ? world.skaters[c] : null;
  if (!v || v.team === s.team) return;
  const dx = v.x - s.x;
  const dy = v.y - s.y;
  if (Math.hypot(dx, dy) > TUNING.pokeReach) return;
  if (Math.abs(wrapAngle(Math.atan2(dy, dx) - s.facing)) > TUNING.pokeCone) return;
  if (nextRandom(world) < TUNING.pokeChance) knockLoose(world, i);
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
  setAct(s, 'check');
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
  // Accuracy falls off with distance: 0 inside aimNear, 1 at aimFar. Far shots get less pull and more error.
  const dist = Math.hypot(RINK.w / 2 - o.x, dy);
  const far = clamp01((dist - TUNING.aimNear) / (TUNING.aimFar - TUNING.aimNear));
  // Right in front of the net (a deke, a one-timer while sliding across) the shot always goes at
  // the net, whatever way the skater is facing; further out the facing has to be roughly ahead.
  const close = inFront && dist < TUNING.aimCloseRange;
  const ahead = inFront && Math.abs(wrapAngle(toNet - s.facing)) < TUNING.aimAssistCone && fy * dy > 0;
  if (ahead || close) {
    const reach = GOAL.width / 2 - TUNING.aimInset;
    // Follow the facing ray's crossing when it points reasonably at the goal line; a near-parallel
    // ray crosses miles away and would clamp to a post, so lean toward the faced side instead.
    const xCross = ahead && Math.abs(fy) > 0.3
      ? o.x + Math.cos(s.facing) * (dy / fy)
      : RINK.w / 2 + Math.cos(s.facing) * reach * 0.5;
    const targetX = Math.min(Math.max(xCross, RINK.w / 2 - reach), RINK.w / 2 + reach);
    const target = Math.atan2(dy, targetX - o.x);
    angle += wrapAngle(target - s.facing) * (close && !ahead ? 1 : TUNING.aimAssist) * (1 - far * (1 - TUNING.aimFarAssist));
  }
  const spread = (TUNING.wristSpread + (TUNING.slapSpread - TUNING.wristSpread) * charge01) * (1 + far * (TUNING.farSpreadMult - 1));
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
  setAct(s, t >= SLAP_FRACTION ? 'slap' : 'wrist');
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
  setAct(s, 'pass');
  s.charge = 0;
}
