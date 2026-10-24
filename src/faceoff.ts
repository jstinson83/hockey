import type { Intent } from './input';
import { nextRandom } from './rng';
import { TUNING, type Team } from './sim-constants';
import type { Faceoff, World } from './sim-types';

/** A fresh draw: a count-in, then the ref holds the puck a random moment before dropping it. */
export function newFaceoff(world: World): Faceoff {
  const hold = TUNING.faceoffHoldMin + nextRandom(world) * (TUNING.faceoffHoldMax - TUNING.faceoffHoldMin);
  return {
    t: 0,
    dropAt: TUNING.faceoffCount + hold,
    pressAt: [null, null],
    early: [false, false],
    dir: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    held: [true, true], // a button already down must be released and pressed again
    aiAt: [
      TUNING.faceoffAiMin + nextRandom(world) * (TUNING.faceoffAiMax - TUNING.faceoffAiMin),
      TUNING.faceoffAiMin + nextRandom(world) * (TUNING.faceoffAiMax - TUNING.faceoffAiMin),
    ],
    result: null,
    since: 0,
  };
}

/** Time of the last moment a press still counts. */
export function faceoffEnd(f: Faceoff): number {
  return f.dropAt + TUNING.faceoffWindow;
}

/** Longest a faceoff can last, for callers that need to wait one out. */
export function faceoffMaxSeconds(): number {
  return TUNING.faceoffCount + TUNING.faceoffHoldMax + TUNING.faceoffWindow;
}

/**
 * One tick of the draw. Pass is the timing button: before the drop is a false start (that
 * side forfeits), within the window after it wins the draw (earliest press wins), and the stick
 * direction held at the press is where the winner sends the puck. AI sides press at a seeded
 * reaction time after the drop. Resolves once both have pressed or the window closes.
 */
export function updateFaceoff(world: World, human: Intent[], dt: number): void {
  const f = world.game.faceoff;
  if (f.result) return;
  f.t += dt;
  for (const team of [0, 1] as const) {
    if (f.pressAt[team] !== null || f.early[team]) continue;
    const intent = human[team];
    if (world.humans[team]) {
      const down = !!intent?.pass;
      const edge = down && !f.held[team];
      f.held[team] = down;
      if (!edge) continue;
      if (f.t < f.dropAt) f.early[team] = true;
      else {
        f.pressAt[team] = f.t;
        f.dir[team] = { x: intent.x, y: intent.y };
      }
    } else if (f.t >= f.dropAt + f.aiAt[team]) {
      f.pressAt[team] = f.t;
      const k = nextRandom(world);
      f.dir[team] = { x: k < 0.33 ? -1 : k < 0.66 ? 1 : 0, y: 0 }; // sideways to a winger, or straight back
    }
  }
  const settled = [0, 1].every((t) => f.pressAt[t] !== null || f.early[t]);
  if (settled || f.t >= faceoffEnd(f)) resolveFaceoff(world);
}

/** Decide the draw and send the puck. */
function resolveFaceoff(world: World): void {
  const f = world.game.faceoff;
  const { puck } = world;
  const [a, b] = f.pressAt;
  let winner: Team | null = null;
  if (a !== null && (b === null || a < b)) winner = 0;
  else if (b !== null && (a === null || b < a)) winner = 1;
  else if (a !== null) winner = nextRandom(world) < 0.5 ? 0 : 1; // dead heat

  if (winner === null) {
    // Nobody won it: the puck squirts out in a random direction.
    const ang = nextRandom(world) * Math.PI * 2;
    const sp = TUNING.faceoffSpeed * TUNING.faceoffMissSpeed;
    puck.vx = Math.cos(ang) * sp;
    puck.vy = Math.sin(ang) * sp;
    f.result = { winner: null, clean: false };
    return;
  }

  // Quicker reactions win cleaner.
  const late = Math.min(1, ((f.pressAt[winner] as number) - f.dropAt) / TUNING.faceoffWindow);
  const chance = TUNING.faceoffCleanBest + (TUNING.faceoffCleanWorst - TUNING.faceoffCleanBest) * late;
  const clean = nextRandom(world) < chance;

  // Back is toward the winner's own net (team 0 defends the bottom, so +y); no stick = straight back.
  const back = winner === 0 ? 1 : -1;
  let dx = f.dir[winner].x;
  let dy = f.dir[winner].y;
  if (Math.hypot(dx, dy) < 0.3) { dx = 0; dy = back; }
  let ang = Math.atan2(dy, dx);
  let speed = TUNING.faceoffSpeed;
  if (!clean) {
    const err = TUNING.faceoffMissAngle * (0.4 + 0.6 * nextRandom(world));
    ang += nextRandom(world) < 0.5 ? -err : err;
    speed *= TUNING.faceoffMissSpeed;
  }
  puck.vx = Math.cos(ang) * speed;
  puck.vy = Math.sin(ang) * speed;
  f.result = { winner, clean };
}
