/**
 * Which animation and frame a player shows, from sim state. Pure and DOM-free (presentation only:
 * reads the world, never changes it). The renderer supplies the bits that aren't in the sim: the
 * distance travelled (stride phase) and a wall-clock for ambient loops.
 */
import { TUNING, VIEW } from './sim-constants';
import type { Goalie, Phase, Skater } from './sim-types';
import { GOALIE_ANIMS, SKATER_ANIMS, type AnimDef, type GoalieAnimName, type SkaterAnimName } from './sprite-poses';

export const POKE_SECONDS = 0.18; // matches `s.poking` in actions.ts

export interface SkaterShow { anim: SkaterAnimName; frame: number; carry: boolean }
export interface GoalieShow { anim: GoalieAnimName; frame: number; toward: 1 | -1 } // toward: world x direction of a slide

export interface SkaterCtx {
  hasPuck: boolean;
  phase: Phase;
  celebrating: boolean; // the goal pause, for the scoring team
  dist: number;         // distance this skater has skated, for stride phase
  clock: number;        // seconds, for ambient loops
}

const DEFS: Record<string, AnimDef> = { ...SKATER_ANIMS, ...GOALIE_ANIMS }; // names don't overlap

/** Frame `progress` (0..1) of the way through an animation. */
const at = (anim: SkaterAnimName | GoalieAnimName, progress: number): number => {
  const n = DEFS[anim].frames;
  return Math.min(n - 1, Math.max(0, Math.floor(progress * n)));
};

function oneShot(anim: SkaterAnimName, t: number): number | null {
  const d = SKATER_ANIMS[anim];
  const f = Math.floor(t * d.fps * VIEW.animSpeed);
  return f < d.frames ? f : null;
}

export function pickSkater(s: Skater, c: SkaterCtx): SkaterShow {
  const carry = c.hasPuck;
  const show = (anim: SkaterAnimName, frame: number): SkaterShow => ({ anim, frame, carry });
  const speed = Math.hypot(s.vx, s.vy);

  if (s.stun > 0) return show('hit', at('hit', 1 - s.stun / TUNING.checkStun));
  if (s.poking > 0) return show('poke', at('poke', 1 - s.poking / POKE_SECONDS));
  if (s.act !== 'none') {
    const f = oneShot(s.act, s.actT);
    if (f !== null) return show(s.act, f);
  }
  if (c.hasPuck && s.charge > 0) return show('wind', at('wind', s.charge / TUNING.chargeTime));
  if (c.celebrating) return show('celebrate', Math.floor(c.clock * VIEW.animSpeed * SKATER_ANIMS.celebrate.fps) % SKATER_ANIMS.celebrate.frames);
  if (c.phase === 'faceoff' && speed < 2) return show('faceoff', 0);

  if (speed > 2.5) {
    const anim = s.boost > 1 && speed > TUNING.maxSpeed * 0.85 ? 'burst' : 'skate';
    const n = SKATER_ANIMS[anim].frames;
    return show(anim, Math.floor((c.dist * VIEW.animSpeed / VIEW.strideUnits) * n) % n);
  }
  return show('idle', Math.floor(c.clock * VIEW.animSpeed * SKATER_ANIMS.idle.fps) % SKATER_ANIMS.idle.frames);
}

export interface GoalieCtx { clock: number }

export function pickGoalie(g: Goalie, c: GoalieCtx): GoalieShow {
  const toward: 1 | -1 = 1;
  if (g.diveLeft > 0) {
    // diveX is where the slide is heading; a near-zero slide is just a drop.
    const dx = g.diveX - g.x;
    const progress = 1 - g.diveLeft / TUNING.goalieDiveTime;
    if (Math.abs(dx) > 3) return { anim: 'slide', frame: at('slide', progress), toward: dx > 0 ? 1 : -1 };
    return { anim: 'drop', frame: at('drop', progress), toward };
  }
  if (g.down > 0) {
    const up = GOALIE_ANIMS.getup;
    if (g.down < up.frames / up.fps) return { anim: 'getup', frame: at('getup', 1 - g.down / (up.frames / up.fps)), toward };
    return { anim: 'butterfly', frame: 0, toward };
  }
  return { anim: 'stand', frame: Math.floor(c.clock * VIEW.animSpeed * GOALIE_ANIMS.stand.fps) % GOALIE_ANIMS.stand.frames, toward };
}
