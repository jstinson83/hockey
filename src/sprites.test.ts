import { describe, expect, it } from 'vitest';
import type { Intent } from './input';
import { createWorld, step, type World } from './sim';
import { RINK, TUNING, VIEW } from './sim-constants';
import { framePose, GOALIE_ANIMS, SKATER_ANIMS } from './sprite-poses';
import { pickGoalie, pickSkater, type SkaterCtx } from './sprite-select';

const DT = 1 / 60;
const idle: Intent = { x: 0, y: 0, action: false, pass: false };
const ctx: SkaterCtx = { hasPuck: false, phase: 'play', celebrating: false, dist: 0, clock: 0 };

function live(): World {
  const w = createWorld(1, { perTeam: 1 });
  w.game.phase = 'play';
  w.skaters[0].x = 15; w.skaters[0].y = 30; // clear of the puck, so it isn't picked up
  w.skaters[1].x = RINK.w - 10; w.skaters[1].y = 30;
  return w;
}

describe('animation events in the sim', () => {
  it('a wrist shot, a slapshot and a pass each record their act', () => {
    for (const [hold, act] of [[0.05, 'wrist'], [TUNING.chargeTime, 'slap']] as const) {
      const w = live();
      w.puck.carrier = 0;
      for (let t = 0; t < hold; t += DT) step(w, [{ ...idle, action: true }, idle], DT);
      step(w, [idle, idle], DT);
      expect(w.skaters[0].act).toBe(act);
    }
    const w = live();
    w.puck.carrier = 0;
    step(w, [{ ...idle, pass: true }, idle], DT);
    expect(w.skaters[0].act).toBe('pass');
    expect(w.skaters[0].actT).toBeLessThan(0.05);
  });

  it('a burst tap without the puck records a check', () => {
    const w = live();
    expect(w.puck.carrier).toBe(-1);
    step(w, [{ ...idle, action: true }, idle], DT);
    expect(w.skaters[0].act).toBe('check');
  });
});

describe('animation picking', () => {
  const w = live();
  const s = w.skaters[0];

  it('one-shots play from the start, then fall back to idle', () => {
    s.act = 'wrist'; s.actT = 0;
    expect(pickSkater(s, ctx)).toMatchObject({ anim: 'wrist', frame: 0 });
    s.actT = 5;
    expect(pickSkater(s, ctx).anim).toBe('idle');
  });

  it('charging with the puck shows the wind-up, fuller as it charges', () => {
    s.act = 'none'; s.charge = 0.01;
    const lo = pickSkater(s, { ...ctx, hasPuck: true });
    s.charge = TUNING.chargeTime;
    const hi = pickSkater(s, { ...ctx, hasPuck: true });
    expect(lo.anim).toBe('wind');
    expect(hi.frame).toBe(SKATER_ANIMS.wind.frames - 1);
    expect(hi.frame).toBeGreaterThan(lo.frame);
    s.charge = 0;
  });

  it('stun beats everything, and the frame follows the stun timer', () => {
    s.stun = TUNING.checkStun;
    expect(pickSkater(s, ctx)).toMatchObject({ anim: 'hit', frame: 0 });
    s.stun = 0.01;
    expect(pickSkater(s, ctx).frame).toBe(SKATER_ANIMS.hit.frames - 1);
    s.stun = 0;
  });

  it('skating advances the stride frame with distance, not time', () => {
    s.vx = 20;
    const a = pickSkater(s, { ...ctx, dist: 0 });
    const b = pickSkater(s, { ...ctx, dist: VIEW.strideUnits / 2 });
    expect(a.anim).toBe('skate');
    expect(b.frame).not.toBe(a.frame);
    s.vx = 0;
  });

  it('the goalie stands, slides toward the dive, then sits in the butterfly', () => {
    const g = w.goalies[0];
    expect(pickGoalie(g, { clock: 0 }).anim).toBe('stand');
    g.down = TUNING.goalieDownTime; g.diveLeft = TUNING.goalieDiveTime; g.diveX = g.x + 6;
    expect(pickGoalie(g, { clock: 0 })).toMatchObject({ anim: 'slide', toward: 1 });
    g.diveLeft = 0; g.down = 0.5;
    expect(pickGoalie(g, { clock: 0 }).anim).toBe('butterfly');
  });
});

describe('pose catalogue', () => {
  it('every frame of every animation yields a finite pose', () => {
    for (const def of [...Object.values(SKATER_ANIMS), ...Object.values(GOALIE_ANIMS)]) {
      for (let f = 0; f < def.frames; f++) {
        for (const carry of [false, true]) {
          const p = framePose(def, f, { carry });
          expect([p.pitch, p.roll, p.crouch, p.lean, ...p.top, ...p.blade, ...p.lf, ...p.rf].every(Number.isFinite)).toBe(true);
        }
      }
    }
  });
});
