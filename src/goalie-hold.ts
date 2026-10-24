import { defendedNet } from './collide';
import { whistleFrozenPuck } from './flow';
import type { Intent } from './input';
import { nextRandom } from './rng';
import { clamp } from './mathutil';
import { TUNING } from './sim-constants';
import type { Goalie, World } from './sim-types';

export function holdingGoalie(world: World): Goalie | undefined {
  return world.goalies.find((g) => g.holding);
}

/**
 * A puck that reaches the goalie may stick: the slower it arrives, the likelier (a hard shot can
 * still be smothered, just rarely). Returns true if the goalie now holds it.
 */
export function tryCatch(world: World, g: Goalie, speed: number): boolean {
  if (world.game.phase !== 'play' || g.holding || g.cool > 0) return false;
  const t = clamp((speed - TUNING.goalieCatchLow) / (TUNING.goalieCatchHigh - TUNING.goalieCatchLow), 0, 1);
  const chance = TUNING.goalieCatchSlow + (TUNING.goalieCatchFast - TUNING.goalieCatchSlow) * t;
  if (nextRandom(world) >= chance) return false;
  g.holding = true;
  g.holdT = 0;
  g.holdFor = TUNING.goalieHoldMin + nextRandom(world) * TUNING.goalieHoldAi;
  g.down = 0;
  g.diveLeft = 0;
  g.threat = 0;
  // Buttons already down when the puck sticks don't count; the player has to press again.
  g.passHeld = g.actionHeld = g.pokeHeld = true;
  world.puck.carrier = -1;
  world.puck.passTime = 0;
  world.puck.vx = world.puck.vy = 0;
  return true;
}

/** Aim a throw from the goalie: always up-ice (a goalie can't throw it into their own net), leaning where the stick points. */
function aimOf(g: Goalie, intent: Intent | undefined): { x: number; y: number } {
  const up = -defendedNet(g.team).dir;
  const ix = intent?.x ?? 0;
  const iy = (intent?.y ?? 0) * up; // 1 = up-ice
  const y = Math.max(0.3, iy);
  const len = Math.hypot(ix, y);
  return { x: ix / len, y: (y / len) * up };
}

/** Teammate nearest the aim line, within `cone` radians. */
function outlet(world: World, g: Goalie, aim: { x: number; y: number }, cone: number): { x: number; y: number; vx: number; vy: number } | null {
  let best: { x: number; y: number; vx: number; vy: number } | null = null;
  let bestScore = Infinity;
  const aimAngle = Math.atan2(aim.y, aim.x);
  for (const m of world.skaters) {
    if (m.team !== g.team) continue;
    let off = Math.atan2(m.y - g.y, m.x - g.x) - aimAngle;
    off = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
    if (off > cone) continue;
    const score = off * 40 + Math.hypot(m.x - g.x, m.y - g.y);
    if (score < bestScore) { best = m; bestScore = score; }
  }
  return best;
}

function release(world: World, g: Goalie, angle: number, speed: number): void {
  const p = world.puck;
  p.vx = Math.cos(angle) * speed;
  p.vy = Math.sin(angle) * speed;
  g.holding = false;
  g.cool = TUNING.goalieRecatch;
}

function pass(world: World, g: Goalie, aim: { x: number; y: number }, cone: number): boolean {
  const mate = outlet(world, g, aim, cone);
  const angle = mate
    ? Math.atan2(mate.y + mate.vy * TUNING.passLead - g.y, mate.x + mate.vx * TUNING.passLead - g.x)
    : Math.atan2(aim.y, aim.x);
  release(world, g, angle, TUNING.passSpeed);
  return !!mate;
}

/**
 * While a goalie holds the puck: a human (stick = walk and aim; pass = pass to the teammate you aim
 * at, shoot = hard clear, poke = freeze it for a whistle) or the AI (after a short hold either
 * passes to an open teammate or freezes it). Held too long, it is a whistle regardless.
 */
export function updateHold(world: World, g: Goalie, intent: Intent | undefined, human: boolean, dt: number): void {
  if (!g.holding) return;
  g.holdT += dt;
  if (human) {
    const passPressed = !!intent?.pass && !g.passHeld;
    const actionPressed = !!intent?.action && !g.actionHeld;
    const pokePressed = !!intent?.poke && !g.pokeHeld;
    g.passHeld = !!intent?.pass;
    g.actionHeld = !!intent?.action;
    g.pokeHeld = !!intent?.poke;
    const aim = aimOf(g, intent);
    if (pokePressed || g.holdT >= TUNING.goalieHoldMax) whistleFrozenPuck(world, g.team);
    else if (passPressed) pass(world, g, aim, 0.6);
    else if (actionPressed) release(world, g, Math.atan2(aim.y, aim.x), TUNING.goalieClearSpeed);
  } else if (g.holdT >= g.holdFor) {
    const aim = aimOf(g, undefined);
    const wantsFreeze = nextRandom(world) < TUNING.goalieAiFreeze;
    if (wantsFreeze || !outlet(world, g, aim, 1.2)) whistleFrozenPuck(world, g.team);
    else pass(world, g, aim, 1.2);
  }
}
