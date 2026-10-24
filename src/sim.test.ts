import { describe, expect, it, onTestFinished } from 'vitest';
import type { Intent } from './input';
import { addSkater, createWorld, step, type World } from './sim';
import { FACEOFF, GAME, GOAL, RINK, TUNING } from './sim-constants';
import { NETS } from './collide';
import { reactToPlayers } from './ai';

const DT = 1 / 60;
const idle: Intent = { x: 0, y: 0, action: false, pass: false };
const CX = RINK.w / 2;

function run(world: World, seconds: number, intents: Intent[] = [idle, idle]): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(world, intents, DT);
}

/** A world already in open play, skaters out of the way. */
function liveWorld(): World {
  const w = createWorld(1, { perTeam: 1 });
  w.game.phase = 'play';
  w.skaters[0].x = 10; w.skaters[0].y = RINK.h / 2;
  w.skaters[1].x = RINK.w - 10; w.skaters[1].y = RINK.h / 2;
  return w;
}

describe('goals', () => {
  it('a puck in the far net scores for red, and in the near net for blue', () => {
    const far = liveWorld();
    far.puck.x = CX; far.puck.y = NETS[0].gy - 3;
    step(far, [idle, idle], DT);
    expect(far.game.score).toEqual([1, 0]);
    expect(far.game.phase).toBe('goal');

    const near = liveWorld();
    near.puck.x = CX; near.puck.y = NETS[1].gy + 3;
    step(near, [idle, idle], DT);
    expect(near.game.score).toEqual([0, 1]);
  });

  it('resets to a faceoff after the goal pause', () => {
    const w = liveWorld();
    w.puck.x = CX; w.puck.y = NETS[0].gy - 3;
    run(w, GAME.goalSeconds + 0.1);
    expect(w.game.phase).toBe('faceoff');
    expect(w.puck.y).toBeCloseTo(RINK.h / 2);
  });

  it('the net frame is solid: a puck sliding into the side post bounces away', () => {
    const w = liveWorld();
    const net = NETS[0];
    w.puck.x = net.x0 - 6; w.puck.y = net.gy - 2; w.puck.vx = 60; w.puck.vy = 0;
    run(w, 1);
    expect(w.game.score).toEqual([0, 0]);
    expect(w.puck.x).toBeLessThan(net.x0);
  });

  it('a skater cannot carry the puck (or skate) into the net', () => {
    const w = liveWorld();
    const net = NETS[0];
    const s = w.skaters[0];
    s.x = CX; s.y = 40; s.facing = -Math.PI / 2;
    w.puck.carrier = 0;
    for (let i = 0; i < 3 * 60; i++) {
      step(w, [{ x: 0, y: -1, action: false, pass: false }, idle], DT);
      const inNet = s.x > net.x0 && s.x < net.x1 && s.y < net.gy;
      expect(inNet).toBe(false);
    }
    expect(w.game.score).toEqual([0, 0]);
  });
});

describe('wrapping behind the net', () => {
  it.each([0, 1])('carrying the puck into the back of net %i from behind does not score', (n) => {
    const w = liveWorld();
    const net = NETS[n];
    const s = w.skaters[n === 0 ? 0 : 1];
    // Behind the net, facing it, as close to the boards as a skater can get.
    s.x = CX; s.y = net.gy + net.dir * (GOAL.depth + 3.2); s.facing = net.dir === -1 ? Math.PI / 2 : -Math.PI / 2;
    w.puck.carrier = w.skaters.indexOf(s);
    const intent = { x: 0, y: -net.dir, action: false, pass: false };
    for (let i = 0; i < 3 * 60; i++) {
      step(w, n === 0 ? [intent, idle] : [idle, intent], DT);
      expect(w.game.phase).toBe('play');
    }
    expect(w.game.score).toEqual([0, 0]);
  });

  it('a puck shot into the back of the net from behind bounces off', () => {
    const w = liveWorld();
    const net = NETS[0];
    w.puck.x = CX; w.puck.y = net.backY - 3; w.puck.vx = 0; w.puck.vy = 60;
    run(w, 1);
    expect(w.game.score).toEqual([0, 0]);
  });
});

describe('goalie', () => {
  function shoot(targetX: number, speed: number, fromX = CX - 18, fromY = 42): World {
    const w = liveWorld();
    const dx = targetX - fromX;
    const dy = GOAL.line - fromY;
    const len = Math.hypot(dx, dy);
    w.puck.x = fromX; w.puck.y = fromY;
    w.puck.vx = (dx / len) * speed; w.puck.vy = (dy / len) * speed;
    run(w, 2);
    return w;
  }

  it('saves a slow shot at the middle of the net', () => {
    expect(shoot(CX, 60).game.score[0]).toBe(0);
  });

  it('can be beaten, and also makes saves, across a sweep of slap shots', () => {
    const results: boolean[] = [];
    // From close in on the side: beatable with placement, but the goalie still gets some.
    for (let tx = CX - 6.5; tx <= CX + 6.5; tx += 1.3) results.push(shoot(tx, 125, CX - 20, 24).game.score[0] > 0);
    expect(results.some(Boolean)).toBe(true);
    expect(results.some((g) => !g)).toBe(true);
  });
});

describe('goalie holding the puck', () => {
  /** Shot straight at blue's goalie (top net) from `fromY`; returns once the first contact has resolved. */
  function shotAtGoalie(seed: number, speed: number): World {
    const w = liveWorld();
    w.rng = seed;
    w.puck.x = CX; w.puck.y = 28; w.puck.vx = 0; w.puck.vy = -speed;
    w.goalies[1].x = CX;
    for (let i = 0; i < 120 && !w.goalies[1].holding; i++) step(w, [idle, idle], DT);
    return w;
  }
  const heldRate = (speed: number): number => {
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) if (shotAtGoalie(seed, speed).goalies[1].holding) n++;
    return n / 60;
  };

  it('holds slow shots almost always, and hard shots less often but still sometimes', () => {
    const slow = heldRate(30);
    const hard = heldRate(125);
    expect(slow).toBeGreaterThan(0.8);
    expect(hard).toBeGreaterThan(0);
    expect(hard).toBeLessThan(slow - 0.3);
  });

  it('pins the puck in front of the goalie, which the other team cannot pick up', () => {
    const w = shotAtGoalie(1, 30);
    expect(w.goalies[1].holding).toBe(true);
    w.skaters[0].x = CX; w.skaters[0].y = w.puck.y + 3; // right next to the puck
    run(w, 1, [idle, { x: 1, y: 0, action: false, pass: false }]);
    expect(w.puck.carrier).toBe(-1);
    expect(Math.abs(w.puck.x - w.goalies[1].x)).toBeLessThan(0.01);
    expect(w.goalies[1].x).toBeGreaterThan(CX); // the human walked the goalie along the crease
    expect(w.game.phase).toBe('play');
  });

  it('a human goalie can pass the puck out to a teammate', () => {
    const w = shotAtGoalie(1, 30);
    w.humans = [true, true];
    const mate = w.skaters[1];
    mate.x = CX; mate.y = 70;
    step(w, [idle, idle], DT);
    step(w, [idle, { x: 0, y: 1, action: false, pass: true }], DT);
    expect(w.goalies[1].holding).toBe(false);
    expect(w.puck.vy).toBeGreaterThan(0); // away from its own (top) net
    run(w, 1.2, [idle, idle]);
    expect(w.puck.carrier).toBe(1);
  });

  it('a human goalie can freeze the puck: whistle and a faceoff on the dot in their zone', () => {
    const w = shotAtGoalie(1, 30);
    w.puck.x = CX + 3;
    w.goalies[1].x = CX + 3;
    step(w, [idle, idle], DT);
    step(w, [idle, { x: 0, y: 0, action: false, pass: false, poke: true }], DT);
    expect(w.game.phase).toBe('faceoff');
    expect(w.game.froze).toBe(1);
    expect(w.puck.x).toBeCloseTo(CX + FACEOFF.dx);
    expect(w.puck.y).toBeCloseTo(NETS[0].gy + FACEOFF.endZoneFromGoalLine);
    expect(w.goalies[1].holding).toBe(false);
    expect(w.skaters[0].y).toBeGreaterThan(w.puck.y); // attackers on the centre-ice side, defenders on the net side
    expect(w.skaters[1].y).toBeLessThan(w.puck.y);
    run(w, GAME.faceoffSeconds + 0.1);
    expect(w.game.phase).toBe('play');
  });

  it('a hold that goes on too long is whistled dead', () => {
    const w = shotAtGoalie(1, 30);
    run(w, TUNING.goalieHoldMax + 0.2, [idle, idle]);
    expect(w.game.phase).toBe('faceoff');
    expect(w.game.froze).toBe(1);
  });

  it('the AI goalie lets go on its own: passes it out or freezes it', () => {
    const w = shotAtGoalie(1, 30);
    w.humans = [true, false];
    w.skaters[1].x = CX; w.skaters[1].y = 60;
    run(w, TUNING.goalieHoldMin + TUNING.goalieHoldAi + 0.3);
    expect(w.goalies[1].holding).toBe(false);
  });
});

describe('game flow', () => {
  it('plays three periods, then overtime, then ends tied', () => {
    const w = createWorld(1, { perTeam: 1 });
    run(w, GAME.faceoffSeconds + 0.1);
    expect(w.game.phase).toBe('play');
    run(w, GAME.periodSeconds + 0.1);
    expect(w.game.period).toBe(2);
    expect(w.game.phase).toBe('faceoff');
    run(w, (GAME.periodSeconds + GAME.faceoffSeconds) * 2 + 1);
    expect(w.game.overtime).toBe(true);
    run(w, GAME.overtimeSeconds + GAME.faceoffSeconds + 1);
    expect(w.game.phase).toBe('end');
    expect(w.game.score).toEqual([0, 0]);
  });

  it('a goal in overtime ends the game', () => {
    const w = liveWorld();
    w.game.overtime = true; w.game.period = 4;
    w.puck.x = CX; w.puck.y = NETS[0].gy - 3;
    run(w, GAME.goalSeconds + 0.1);
    expect(w.game.phase).toBe('end');
  });
});

describe('buttons', () => {
  const tap = (action: boolean, pass = false, x = 0, y = 0): Intent => ({ x, y, action, pass });

  it('tapping shoot without the puck bursts the skater up to a capped top speed', () => {
    const w = liveWorld();
    const s = w.skaters[0];
    s.x = CX; s.y = RINK.h - 30;
    for (let n = 0; n < 12; n++) {
      step(w, [tap(true, false, 0, -1), idle], DT);
      step(w, [tap(false, false, 0, -1), idle], DT);
    }
    const speed = Math.hypot(s.vx, s.vy);
    expect(speed).toBeGreaterThan(TUNING.maxSpeed + 4);
    expect(speed).toBeLessThanOrEqual(TUNING.maxSpeed + TUNING.boostMax + 1e-6);
    expect(s.boost).toBeLessThanOrEqual(TUNING.boostMax);
  });

  it('the boost decays back to normal top speed', () => {
    const w = liveWorld();
    const s = w.skaters[0];
    s.x = CX; s.y = RINK.h - 30;
    for (let n = 0; n < 6; n++) {
      step(w, [tap(true, false, 0, -1), idle], DT);
      step(w, [tap(false, false, 0, -1), idle], DT);
    }
    s.y = RINK.h - 30;
    for (let i = 0; i < 4 * 60; i++) {
      s.y = Math.max(s.y, 120); // keep it clear of the far end
      step(w, [tap(false, false, 0, -1), idle], DT);
    }
    expect(s.boost).toBe(0);
    expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(TUNING.maxSpeed + 1e-6);
  });

  it('a press that began without the puck never shoots, even if the puck arrives mid-press', () => {
    const w = liveWorld();
    const s = w.skaters[0];
    step(w, [tap(true), idle], DT); // press with no puck
    w.puck.carrier = 0;             // puck arrives while still held
    for (let i = 0; i < 20; i++) step(w, [tap(true), idle], DT);
    step(w, [tap(false), idle], DT);
    expect(w.puck.carrier).toBe(0);
    expect(s.charge).toBe(0);
  });

  it('a tap-initiated check knocks the puck off a carrier at a speed plain contact would not', () => {
    const run1 = (checkerTaps: boolean): number => {
      const w = liveWorld();
      w.rng = 1;
      const was = TUNING.knockChance;
      TUNING.knockChance = 1;
      onTestFinished(() => { TUNING.knockChance = was; });
      const [red, blue] = w.skaters;
      blue.x = CX; blue.y = 100; blue.vx = blue.vy = 0; w.puck.carrier = 1;
      red.x = CX; red.y = 100 + 9; red.vx = 0; red.vy = -16; // closing ~16: above checkMinSpeed, below checkSpeed
      step(w, [tap(checkerTaps, false, 0, -1), idle], DT);
      for (let i = 0; i < 30; i++) step(w, [idle, idle], DT);
      return w.puck.carrier;
    };
    expect(run1(false)).toBe(1);   // plain bump: blue keeps the puck
    expect(run1(true)).not.toBe(1); // checked: puck comes off blue (the checker may then pick it up)
  });

  it('a poke check strips a carrier in front, not one behind or out of reach, and has a cooldown', () => {
    const poke = (dy: number, pokeChance = 1): { carrier: number; w: World } => {
      const w = liveWorld();
      const was = TUNING.pokeChance;
      TUNING.pokeChance = pokeChance;
      onTestFinished(() => { TUNING.pokeChance = was; });
      const [red, blue] = w.skaters;
      blue.x = CX; blue.y = 100; blue.vx = blue.vy = 0; w.puck.carrier = 1;
      red.x = CX; red.y = 100 + dy; red.vx = red.vy = 0;
      step(w, [{ x: 0, y: -1, action: false, pass: false, poke: true }, idle], DT);
      return { carrier: w.puck.carrier, w };
    };
    expect(poke(6).carrier).toBe(-1);             // in reach, in front: stripped
    expect(poke(TUNING.pokeReach + 3).carrier).toBe(1); // out of reach
    expect(poke(-6).carrier).toBe(1);             // carrier is behind the poker
    expect(poke(6, 0).carrier).toBe(1);           // a miss leaves them with it
    const { w } = poke(6, 0);
    expect(w.skaters[0].pokeCd).toBeGreaterThan(0);
  });

  it('a check stuns the victim and shoves them', () => {
    const w = liveWorld();
    const [red, blue] = w.skaters;
    blue.x = CX; blue.y = 100; red.x = CX; red.y = 100 + 2 * TUNING.skaterRadius + 3; red.vy = -20;
    step(w, [tap(true, false, 0, -1), idle], DT);
    for (let i = 0; i < 6; i++) step(w, [idle, idle], DT);
    expect(blue.stun).toBeGreaterThan(0);
    expect(blue.vy).toBeLessThan(0); // shoved away from the checker (up the ice)
  });

  it('pass goes in the facing direction at pass speed, and cancels a charged shot', () => {
    const w = liveWorld();
    const s = w.skaters[0];
    s.x = CX; s.y = 120; s.facing = -Math.PI / 2; w.puck.carrier = 0;
    step(w, [tap(true), idle], DT);              // starts charging... (press with puck)
    for (let i = 0; i < 10; i++) step(w, [tap(true), idle], DT);
    step(w, [tap(true, true), idle], DT);        // pass while charging
    expect(w.puck.carrier).toBe(-1);
    expect(Math.hypot(w.puck.vx, w.puck.vy)).toBeCloseTo(TUNING.passSpeed, 0);
    expect(w.puck.vy).toBeLessThan(0);
  });

  it('a pass leads toward a teammate in the cone', () => {
    const w = liveWorld();
    addSkater(w, 0, CX + 12, 90); // a red teammate, AI-driven
    const s = w.skaters[0];
    s.x = CX; s.y = 120; s.facing = -Math.PI / 2 + 0.2; w.puck.carrier = 0;
    step(w, [tap(false, true), idle], DT);
    const ang = Math.atan2(w.puck.vy, w.puck.vx);
    const want = Math.atan2(90 - 120, 12);
    expect(Math.abs(ang - want)).toBeLessThan(0.08);
  });
});

describe('shots', () => {
  /** Red shoots from (x, y) facing `facing`, returns the world with the puck just released. */
  function release(seed: number, x: number, y: number, facing: number, holdSeconds = 0): World {
    const w = createWorld(seed, { perTeam: 1 });
    w.game.phase = 'play';
    const s = w.skaters[0];
    s.x = x; s.y = y; s.facing = facing; w.puck.carrier = 0;
    w.skaters[1].x = RINK.w - 10; w.skaters[1].y = RINK.h / 2;
    const hold: Intent = { x: 0, y: 0, action: true, pass: false };
    const up: Intent = { x: 0, y: 0, action: false, pass: false };
    step(w, [hold, idle], DT);
    for (let i = 0; i < Math.round(holdSeconds / DT); i++) step(w, [hold, idle], DT);
    step(w, [up, idle], DT);
    return w;
  }

  /** Where a released puck crosses the far goal line (x), assuming a straight path. */
  const crossX = (w: World): number => {
    const t = (GOAL.line - w.puck.y) / w.puck.vy;
    return w.puck.x + w.puck.vx * t;
  };

  it('pulls a shot that would miss wide back inside the posts', () => {
    // Facing slightly wide of the right post from the slot.
    const aimWide = -Math.PI / 2 + Math.atan2(GOAL.width / 2 + 5, 40);
    const unassisted = CX + GOAL.width / 2 + 5; // where the raw aim crosses the line
    const x = crossX(release(3, CX, 52, aimWide));
    expect(x).toBeLessThan(unassisted - 3); // pulled substantially toward the net
  });

  it('assists steep-angle shots from beside the net, even when facing straight up the ice', () => {
    const w = release(4, CX + 25, 25, -Math.PI / 2); // near the goal line, well off to the side
    expect(Math.abs(crossX(w) - CX)).toBeLessThan(GOAL.width / 2 + 2);
  });

  it('does not touch the aim of a shot facing away from the net', () => {
    const w = release(3, CX, 80, Math.PI / 2); // facing down the ice, away from red's target
    expect(Math.atan2(w.puck.vy, w.puck.vx)).toBeGreaterThan(Math.PI / 2 - TUNING.wristSpread - 0.01);
    expect(Math.atan2(w.puck.vy, w.puck.vx)).toBeLessThan(Math.PI / 2 + TUNING.wristSpread + 0.01);
  });

  it('keeps the shooter\'s chosen corner when already aimed inside the posts', () => {
    const aim = -Math.PI / 2 + Math.atan2(4, 40); // aimed 4 units right of centre
    const x = crossX(release(9, CX, 52, aim));
    expect(Math.abs(x - (CX + 4))).toBeLessThan(40 * TUNING.wristSpread + 0.5);
  });

  it('shots from right in front of the net go on net whichever way the skater faces (dekes)', () => {
    for (const facing of [0, Math.PI, -0.2, Math.PI + 0.2, -0.45, Math.PI + 0.45, -Math.PI / 2 - 1.2]) {
      for (let seed = 1; seed <= 20; seed++) {
        const x = crossX(release(seed, CX + 3, 30, facing));
        expect(Math.abs(x - CX)).toBeLessThan(GOAL.width / 2);
      }
    }
  });

  it('is more accurate near the net than far from it', () => {
    const onNet = (y: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const aim = -Math.PI / 2 + Math.atan2(GOAL.width / 2 - 2, y - GOAL.line);
        if (Math.abs(crossX(release(seed, CX, y, aim)) - CX) < GOAL.width / 2) n++;
      }
      return n;
    };
    expect(onNet(30)).toBe(60); // close in: every shot hits the net
    expect(onNet(150)).toBeLessThan(onNet(30));
  });

  it('is deterministic per seed but not identical across seeds', () => {
    const a = release(5, CX, 60, -Math.PI / 2);
    const b = release(5, CX, 60, -Math.PI / 2);
    const c = release(6, CX, 60, -Math.PI / 2);
    expect(a.puck.vx).toBe(b.puck.vx);
    expect(a.puck.vx).not.toBe(c.puck.vx);
  });

  it('is never an automatic goal: across seeds, aimed shots are saved or missed some of the time', () => {
    let goals = 0;
    const n = 30;
    for (let seed = 1; seed <= n; seed++) {
      const w = release(seed, CX, 55, -Math.PI / 2, 0); // wrist shot, dead centre: goalie's strength
      run(w, 2);
      if (w.game.score[0] > 0) goals++;
    }
    expect(goals).toBeLessThan(n);
  });
});

describe('5v5', () => {
  it('is the default: C, two wings and two defence a side, all on the ice and apart at the faceoff', () => {
    const w = createWorld(1);
    expect(w.skaters.length).toBe(10);
    for (const team of [0, 1] as const) {
      expect(w.skaters.filter((s) => s.team === team).map((s) => s.role)).toEqual(['C', 'L', 'R', 'LD', 'RD']);
    }
    w.skaters.forEach((s, i) => {
      expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(RINK.w);
      expect(s.y).toBeGreaterThan(0); expect(s.y).toBeLessThan(RINK.h);
      w.skaters.slice(i + 1).forEach((o) => expect(Math.hypot(s.x - o.x, s.y - o.y)).toBeGreaterThan(2 * TUNING.skaterRadius));
    });
  });

  it('defence hold the points when their team is set up in the offensive zone, and guard the slot without the puck', () => {
    const w = createWorld(3);
    w.humans = [false, false];
    w.game.phase = 'play';
    const red = w.skaters.map((s, i) => ({ s, i })).filter((o) => o.s.team === 0);
    const carrier = red[0]; // red attacks up the ice (towards y = 0)
    Object.assign(carrier.s, { x: CX, y: 30, vx: 0, vy: 0 });
    w.puck.carrier = carrier.i;
    w.skaters.filter((s) => s.team === 1).forEach((s) => { s.x = 8; s.y = 20; }); // out of the way
    for (let i = 0; i < 180; i++) { step(w, [idle, idle], DT); Object.assign(carrier.s, { x: CX, y: 30, vx: 0, vy: 0 }); w.puck.carrier = carrier.i; }
    const ld = red.find((o) => o.s.role === 'LD')!.s;
    const rd = red.find((o) => o.s.role === 'RD')!.s;
    expect(ld.y).toBeGreaterThan(30 + 10); expect(rd.y).toBeGreaterThan(30 + 10); // behind the carrier, out at the point
    expect(ld.x).toBeLessThan(CX); expect(rd.x).toBeGreaterThan(CX);

    // Blue has it up the ice: a red defender collapses to the slot in front of their own net (the bottom, y near RINK.h).
    const blue = w.skaters.findIndex((s) => s.team === 1);
    Object.assign(w.skaters[blue], { x: CX, y: 150, vx: 0, vy: 0 });
    w.puck.carrier = blue;
    for (let i = 0; i < 240; i++) { step(w, [idle, idle], DT); Object.assign(w.skaters[blue], { x: CX, y: 150, vx: 0, vy: 0 }); w.puck.carrier = blue; }
    // (The nearest red skater presses the carrier, so at most one of the pair steps up; the other guards the slot.)
    const guard = ld.y > rd.y ? ld : rd;
    expect(guard.y).toBeGreaterThan(RINK.h - 40);
    expect(Math.abs(guard.x - CX)).toBeLessThan(20);
  });
});

describe('defending', () => {
  it('does not park the whole team on its own net while the puck is far away', () => {
    const w = createWorld(4);
    w.humans = [false, false];
    w.game.phase = 'play';
    const blue = w.skaters.map((s, i) => ({ s, i })).filter((o) => o.s.team === 1);
    // Blue spread around centre ice, carrier on the puck at centre; red must defend.
    blue.forEach((o, k) => Object.assign(o.s, { x: 15 + k * 14, y: RINK.h / 2 - 15 - (k % 2) * 10, vx: 0, vy: 0 }));
    const carrier = blue[0];
    Object.assign(carrier.s, { x: CX, y: RINK.h / 2, vx: 0, vy: 0 });
    for (let i = 0; i < 300; i++) {
      step(w, [idle, idle], DT);
      w.puck.carrier = carrier.i;
      blue.forEach((o) => { o.s.vx = o.s.vy = 0; });
    }
    const goal = { x: CX, y: RINK.h - GOAL.line };
    const near = w.skaters.filter((s) => s.team === 0 && Math.hypot(s.x - goal.x, s.y - goal.y) < 30).length;
    expect(near).toBeLessThanOrEqual(1);
  });

  it('collapses toward the net as the puck comes in', () => {
    const w = createWorld(4);
    w.humans = [false, false];
    w.game.phase = 'play';
    const blue = w.skaters.findIndex((s) => s.team === 1);
    const redDefence = w.skaters.filter((s) => s.team === 0 && (s.role === 'LD' || s.role === 'RD'));
    const meanY = (puckY: number): number => {
      Object.assign(w.skaters[blue], { x: CX, y: puckY, vx: 0, vy: 0 });
      for (let i = 0; i < 240; i++) { step(w, [idle, idle], DT); Object.assign(w.skaters[blue], { x: CX, y: puckY, vx: 0, vy: 0 }); w.puck.carrier = blue; }
      return redDefence.reduce((a, s) => a + s.y, 0) / redDefence.length;
    };
    const far = meanY(RINK.h / 2);
    const close = meanY(RINK.h - 50);
    expect(close).toBeGreaterThan(far); // larger y = nearer red's own (bottom) net
  });
});

describe('neutral zone', () => {
  /** Blue carrier holding the puck at (x, y); the rest of blue spread up their half; red defends with `plan`. */
  const setUp = (plan: 'man' | 'trap' | 'press', x: number, y: number, seconds: number): World => {
    const w = createWorld(6, { neutral: [plan, 'man'] });
    w.humans = [false, false];
    w.game.phase = 'play';
    const blue = w.skaters.map((s, i) => ({ s, i })).filter((o) => o.s.team === 1);
    blue.forEach((o, k) => Object.assign(o.s, { x: 12 + k * 15, y: 40 + (k % 2) * 12, vx: 0, vy: 0 }));
    const hold = () => { Object.assign(blue[0].s, { x, y, vx: 0, vy: 0 }); w.puck.carrier = blue[0].i; blue.slice(1).forEach((o) => { o.s.vx = o.s.vy = 0; }); };
    hold();
    for (let i = 0; i < seconds * 60; i++) { step(w, [idle, idle], DT); hold(); }
    return w;
  };
  const red = (w: World) => w.skaters.filter((s) => s.team === 0);

  it('trap: four skaters wall up just on their side of centre ice, spread across it; the centre closes on the carrier', () => {
    const w = setUp('trap', CX + 25, RINK.h / 2 - 5, 5);
    const wall = red(w).filter((s) => s.role !== 'C');
    wall.forEach((s) => expect(Math.abs(s.y - (RINK.h / 2 + TUNING.aiTrapLine))).toBeLessThan(10));
    const xs = wall.map((s) => s.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
    const c = red(w).find((s) => s.role === 'C')!;
    expect(Math.hypot(c.x - (CX + 25), c.y - (RINK.h / 2 - 5))).toBeLessThan(25);
  });

  it('press: the centre and the carrier-side wing close on the carrier, defence step up behind them', () => {
    const w = setUp('press', CX - 20, RINK.h / 2 - 15, 5);
    const carrier = { x: CX - 20, y: RINK.h / 2 - 15 };
    const d = (s: { x: number; y: number }) => Math.hypot(s.x - carrier.x, s.y - carrier.y);
    const byRole = (r: string) => red(w).find((s) => s.role === r)!;
    expect(d(byRole('C'))).toBeLessThan(15);
    expect(d(byRole('L'))).toBeLessThan(15); // the carrier is on the left
    expect(d(byRole('R'))).toBeGreaterThan(15);
    for (const r of ['LD', 'RD']) expect(byRole(r).y).toBeGreaterThan(carrier.y + 8); // behind the pressers, toward their own net
  });

  it('the plans only apply while the puck is out of their end: deeper in, they play like man', () => {
    const play = (plan: 'man' | 'trap' | 'press') => JSON.stringify(red(setUp(plan, CX, 150, 3)).map((s) => [s.x.toFixed(2), s.y.toFixed(2)]));
    expect(play('trap')).toBe(play('man'));
    expect(play('press')).toBe(play('man'));
  });

  it('nobody camps in the crease even with the puck close to the net', () => {
    const w = setUp('man', CX, 165, 5);
    const goal = { x: CX, y: RINK.h - GOAL.line };
    red(w).forEach((s) => expect(Math.hypot(s.x - goal.x, s.y - goal.y)).toBeGreaterThan(GOAL.crease + 8));
  });
});

describe('breakouts', () => {
  /** Red (attacking up the ice from y=200) with `carrier` on the puck deep in its own end, left of centre; blue far away. */
  const breakWorld = (plan: 'carry' | 'boards' | 'swing' | 'stretch', carrier: number): World => {
    const w = createWorld(5, { perTeam: 3, breakout: [plan, 'carry'] });
    w.humans = [false, false];
    w.game.phase = 'play';
    const spots = [[CX, 172], [CX - 20, 168], [CX + 20, 168]]; // C, L, R
    spots.forEach(([x, y], k) => { Object.assign(w.skaters[k], { x, y, vx: 0, vy: 0, facing: -Math.PI / 2 }); });
    Object.assign(w.skaters[carrier], { x: CX - 20, y: 170 });
    w.skaters.forEach((s) => { if (s.team === 1) { s.x = CX + 30; s.y = 40; } });
    w.puck.carrier = carrier;
    return w;
  };
  /** Who first takes the puck from `carrier` (-1 if nobody does within `seconds`). */
  const firstReceiver = (w: World, carrier: number, seconds = 4): number => {
    for (let i = 0; i < seconds * 60; i++) {
      step(w, [idle, idle], DT);
      if (w.puck.carrier >= 0 && w.puck.carrier !== carrier) return w.puck.carrier;
    }
    return -1;
  };

  it('each plan looks for its own outlet: boards = strong wing, swing = centre, stretch = far wing', () => {
    expect(firstReceiver(breakWorld('boards', 0), 0)).toBe(1);  // C carries on the left: left wing is strong
    expect(firstReceiver(breakWorld('swing', 2), 2)).toBe(0);   // anyone but C passes to C
    expect(firstReceiver(breakWorld('stretch', 0), 0)).toBe(2); // left side: right wing is the far one
    // With no plan the outlet is whatever the usual read finds, not a designated player.
    const carry = [0, 2].map((c) => firstReceiver(breakWorld('carry', c), c));
    expect(carry).not.toEqual([1, 0]);
  });

  it('swing: the centre loops down to the far goal line and comes back up that wing while the carrier waits', () => {
    const w = breakWorld('swing', 1); // the left wing holds the puck; make red's puck carrier human-held (never passes)
    w.skaters[1].ai.passCd = 99;
    let low = 0;
    for (let i = 0; i < 240; i++) {
      step(w, [idle, idle], DT);
      w.puck.carrier = 1; w.skaters[1].vx = w.skaters[1].vy = 0;
      low = Math.max(low, w.skaters[0].y);
    }
    const c = w.skaters[0];
    expect(low).toBeGreaterThan(NETS[1].gy - TUNING.aiSwingLow - 8); // dropped to the bottom of the loop
    expect(c.x).toBeGreaterThan(CX + 20);                           // far side from the carrier
    expect(c.y).toBeLessThan(170);                                  // then came back up ice
    expect(c.ai.swung).toBe(true);
  });

  it('the wings take different lanes under different plans', () => {
    const wingX = (plan: 'boards' | 'swing' | 'stretch'): number => {
      const w = breakWorld(plan, 0);
      w.puck.carrier = 0;
      for (let i = 0; i < 60; i++) { step(w, [idle, idle], DT); w.puck.carrier = 0; w.skaters[0].vx = w.skaters[0].vy = 0; }
      return w.skaters[1].x; // left wing: strong side
    };
    expect(new Set([wingX('boards'), wingX('swing'), wingX('stretch')].map((x) => x.toFixed(0))).size).toBeGreaterThan(1);
  });

  it('only applies in the breakout zone: further up the ice a plan plays exactly like carry', () => {
    const play = (plan: 'carry' | 'stretch', y: number): string => {
      const w = breakWorld(plan, 0);
      w.skaters[0].y = y;
      for (let i = 0; i < 120; i++) step(w, [idle, idle], DT);
      return JSON.stringify(w.skaters.map((s) => [s.x.toFixed(3), s.y.toFixed(3)]));
    };
    expect(play('stretch', RINK.h / 2 - 20)).toBe(play('carry', RINK.h / 2 - 20));
    expect(play('stretch', 170)).not.toBe(play('carry', 170));
  });
});

describe('AI and control', () => {
  const aiWorld = (seed = 1): World => {
    const w = createWorld(seed);
    w.humans = [false, false];
    w.game.phase = 'play';
    return w;
  };

  it('plays on its own: the puck changes hands, nobody leaves the ice or enters a net', () => {
    const w = aiWorld(2);
    let carriers = 0;
    let last = -2;
    for (let i = 0; i < 60 * 60; i++) {
      step(w, [idle, idle], DT);
      if (w.puck.carrier !== last) { carriers++; last = w.puck.carrier; }
      for (const s of w.skaters) {
        expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
        expect(s.x).toBeGreaterThan(0); expect(s.x).toBeLessThan(RINK.w);
        expect(s.y).toBeGreaterThan(0); expect(s.y).toBeLessThan(RINK.h);
        for (const net of NETS) {
          const depth = (s.y - net.gy) * net.dir;
          expect(s.x > net.x0 && s.x < net.x1 && depth > 0 && depth < GOAL.depth).toBe(false);
        }
      }
    }
    expect(carriers).toBeGreaterThan(5);
  });

  it('off-puck teammates spread out: less bunching with spacing on than off', () => {
    // Mean distance from each skater to its nearest teammate, sampled over a long AI-vs-AI game.
    // Averaged over several seeds: a single game's trajectory is chaotic and the margin is small.
    const meanGap = (): number => {
      let sum = 0;
      let n = 0;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const w = aiWorld(seed);
        for (let i = 0; i < 60 * 60; i++) {
          step(w, [idle, idle], DT);
          if (i % 30 || w.game.phase !== 'play') continue; // faceoff huddles aren't what spacing governs
          w.skaters.forEach((a, ai) => {
            if (ai === w.puck.carrier) return;
            let best = Infinity;
            w.skaters.forEach((b, bi) => { if (bi !== ai && b.team === a.team) best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y)); });
            sum += best; n++;
          });
        }
      }
      return sum / n;
    };
    const saved = { s: TUNING.aiSpacing, p: TUNING.aiSpacingPush };
    onTestFinished(() => { TUNING.aiSpacing = saved.s; TUNING.aiSpacingPush = saved.p; });
    TUNING.aiSpacing = 0; TUNING.aiSpacingPush = 0;
    const off = meanGap();
    TUNING.aiSpacing = saved.s; TUNING.aiSpacingPush = saved.p;
    expect(meanGap()).toBeGreaterThan(off);
  });

  it('a defender shades off its puck line toward an opponent near its spot, goal side of them', () => {
    const w = aiWorld(4);
    w.skaters.forEach((s) => { s.x = CX; s.y = RINK.h / 2; s.vx = s.vy = 0; });
    const red = w.skaters.find((s) => s.team === 0 && s.role === 'C')!;
    const threat = w.skaters.find((s) => s.team === 1 && s.role === 'L')!;
    threat.x = CX - 12; threat.y = RINK.h - 40; // red defends the bottom net
    const anchor = { x: CX + 6, y: RINK.h - 38 };
    const i = w.skaters.indexOf(red);
    const saved = { w: TUNING.aiWeave, c: TUNING.aiCoverShade };
    onTestFinished(() => { TUNING.aiWeave = saved.w; TUNING.aiCoverShade = saved.c; });
    TUNING.aiWeave = 0;
    TUNING.aiCoverShade = 0;
    const plain = reactToPlayers(w, i, anchor, false, -1, true);
    TUNING.aiCoverShade = 0.8;
    const covered = reactToPlayers(w, i, anchor, false, -1, true);
    expect(covered.x).toBeLessThan(plain.x - 3);  // slid toward the opponent
    expect(covered.y).toBeGreaterThan(plain.y);   // and toward our own net
  });

  it('a defender leaves an opposing defenceman at the points unmarked', () => {
    const w = aiWorld(4);
    w.skaters.forEach((s) => { s.x = CX; s.y = RINK.h / 2; s.vx = s.vy = 0; });
    const red = w.skaters.find((s) => s.team === 0 && s.role === 'C')!;
    const point = w.skaters.find((s) => s.team === 1 && s.role === 'LD')!;
    w.skaters.forEach((s) => { if (s !== point && s !== red) s.y = 0; }); // everyone else well out of cover range
    point.x = CX - 30; point.y = RINK.h - 130; // red defends the bottom net; this is well out at the point
    const anchor = { x: CX + 6, y: RINK.h - 128 };
    const i = w.skaters.indexOf(red);
    const saved = { w: TUNING.aiWeave, c: TUNING.aiCoverShade };
    onTestFinished(() => { TUNING.aiWeave = saved.w; TUNING.aiCoverShade = saved.c; });
    TUNING.aiWeave = 0;
    TUNING.aiCoverShade = 0;
    const plain = reactToPlayers(w, i, anchor, false, -1, true);
    TUNING.aiCoverShade = 0.8;
    const covered = reactToPlayers(w, i, anchor, false, -1, true);
    expect(covered.x).toBeCloseTo(plain.x, 5);
    expect(covered.y).toBeCloseTo(plain.y, 5);
  });

  it('a defender also leaves an opposing forward out at the point unmarked', () => {
    const w = aiWorld(4);
    w.skaters.forEach((s) => { s.x = CX; s.y = RINK.h / 2; s.vx = s.vy = 0; });
    const red = w.skaters.find((s) => s.team === 0 && s.role === 'C')!;
    const point = w.skaters.find((s) => s.team === 1 && s.role === 'R')!;
    w.skaters.forEach((s) => { if (s !== point && s !== red) s.y = 0; });
    point.x = CX + 30; point.y = RINK.h - 130;
    const anchor = { x: CX + 6, y: RINK.h - 128 };
    const i = w.skaters.indexOf(red);
    const saved = { w: TUNING.aiWeave, c: TUNING.aiCoverShade };
    onTestFinished(() => { TUNING.aiWeave = saved.w; TUNING.aiCoverShade = saved.c; });
    TUNING.aiWeave = 0;
    TUNING.aiCoverShade = 0;
    const plain = reactToPlayers(w, i, anchor, false, -1, true);
    TUNING.aiCoverShade = 0.8;
    const covered = reactToPlayers(w, i, anchor, false, -1, true);
    expect(covered.x).toBeCloseTo(plain.x, 5);
    expect(covered.y).toBeCloseTo(plain.y, 5);
  });

  it('is deterministic per seed', () => {
    const play = (seed: number): string => {
      const w = aiWorld(seed);
      for (let i = 0; i < 60 * 30; i++) step(w, [idle, idle], DT);
      return JSON.stringify([w.game.score, w.puck.x.toFixed(3), w.skaters.map((s) => s.x.toFixed(3))]);
    };
    expect(play(7)).toBe(play(7));
    expect(play(7)).not.toBe(play(8));
  });

  it('the nearest skater goes for a loose puck and picks it up', () => {
    const w = aiWorld();
    // Red's wing is the nearest red skater to a puck deep in red's right side.
    w.puck.x = CX + 25; w.puck.y = RINK.h / 2 + 22; w.puck.vx = w.puck.vy = 0;
    for (let i = 0; i < 60 * 4 && w.puck.carrier < 0; i++) step(w, [idle, idle], DT);
    expect(w.puck.carrier).toBeGreaterThanOrEqual(0);
  });

  it('a carrier in range with a clear lane shoots (or scores) within a couple of seconds', () => {
    const w = aiWorld(3);
    const c = w.skaters[0]; // red centre
    c.x = CX; c.y = 36; c.vx = c.vy = 0; c.facing = -Math.PI / 2;
    w.puck.carrier = 0;
    // Clear the ice of defenders so the lane is open.
    w.skaters.forEach((s) => { if (s.team === 1) { s.x = 8; s.y = RINK.h - 20; } });
    let released = false;
    for (let i = 0; i < 60 * 2 && !released; i++) {
      step(w, [idle, idle], DT);
      released = w.puck.carrier !== 0;
    }
    expect(released).toBe(true);
  });

  it('control never switches on its own while the puck is loose or the other team has it', () => {
    const w = createWorld(1);
    w.humans = [true, false];
    w.game.phase = 'play';
    const start = w.controlled[0];
    for (let i = 0; i < 180; i++) step(w, [idle, idle], DT);
    expect(w.controlled[0]).toBe(start);
    // The other team has it.
    const blue = w.skaters.findIndex((s) => s.team === 1);
    w.skaters[blue].x = w.puck.x; w.skaters[blue].y = w.puck.y; w.puck.carrier = blue;
    for (let i = 0; i < 30; i++) {
      step(w, [idle, idle], DT);
      w.puck.carrier = blue; // keep it there for the check
    }
    expect(w.controlled[0]).toBe(start);
  });

  it('when an AI teammate picks up the puck, the human is switched to them', () => {
    const w = createWorld(1);
    w.humans = [true, false];
    w.game.phase = 'play';
    const start = w.controlled[0];
    const mate = w.skaters.findIndex((s, i) => s.team === 0 && i !== start);
    w.skaters[mate].x = w.puck.x; w.skaters[mate].y = w.puck.y; w.puck.carrier = mate;
    step(w, [idle, idle], DT);
    expect(w.controlled[0]).toBe(mate);
  });

  it('a teammate picking up the puck does not switch a team with no human', () => {
    const w = createWorld(1);
    w.humans = [false, false];
    w.game.phase = 'play';
    const before = w.controlled[0];
    const mate = w.skaters.findIndex((s, i) => s.team === 0 && i !== before);
    w.puck.carrier = mate;
    step(w, [idle, idle], DT);
    expect(w.controlled[0]).toBe(before);
  });

  it('the human who passes ends up controlling the receiver once they have the puck', () => {
    const w = createWorld(1);
    w.humans = [true, false];
    w.game.phase = 'play';
    const start = w.controlled[0];
    const mate = w.skaters.findIndex((s, i) => s.team === 0 && i !== start);
    const s = w.skaters[start];
    s.x = CX; s.y = 120; s.facing = -Math.PI / 2; w.puck.carrier = start;
    w.skaters[mate].x = CX; w.skaters[mate].y = 80; // dead ahead
    w.skaters.filter((o) => o.team === 1).forEach((o) => { o.x = 8; o.y = 20; });
    step(w, [{ x: 0, y: 0, action: false, pass: true }, idle], DT);
    expect(w.controlled[0]).toBe(start); // the pass itself doesn't switch
    for (let i = 0; i < 120 && w.puck.carrier !== mate; i++) step(w, [idle, idle], DT);
    expect(w.puck.carrier).toBe(mate);
    step(w, [idle, idle], DT);
    expect(w.controlled[0]).toBe(mate);
  });

  /** A 3v3 world with red's skaters at known distances from the puck: [0] nearest ... [2] farthest. */
  function switchWorld(): { w: World; red: number[] } {
    const w = createWorld(1, { perTeam: 3 });
    w.humans = [true, false];
    w.game.phase = 'play';
    w.puck.x = CX; w.puck.y = 100; w.puck.vx = w.puck.vy = 0;
    const red = w.skaters.map((s, i) => ({ s, i })).filter((o) => o.s.team === 0);
    red.forEach((o, k) => { o.s.x = CX; o.s.y = 100 + 12 + k * 14; o.s.vx = o.s.vy = 0; }); // 12, 26, 40 away
    w.skaters.filter((s) => s.team === 1).forEach((s) => { s.x = 8; s.y = 20; });
    return { w, red: red.map((o) => o.i) };
  }
  const press: Intent = { x: 0, y: 0, action: false, pass: true };
  const release: Intent = { x: 0, y: 0, action: false, pass: false };

  it('the pass button without the puck switches to the closest teammate to the puck', () => {
    const { w, red } = switchWorld();
    w.controlled[0] = red[2]; // driving the farthest
    step(w, [press, idle], DT);
    expect(w.controlled[0]).toBe(red[0]);
  });

  it('when already controlling the closest, it goes to the second closest', () => {
    const { w, red } = switchWorld();
    w.controlled[0] = red[0];
    step(w, [press, idle], DT);
    expect(w.controlled[0]).toBe(red[1]);
  });

  it('quick repeated presses keep working down the ranking, then wrap; a pause starts over', () => {
    const { w, red } = switchWorld();
    w.controlled[0] = red[0];
    const tap = () => { step(w, [press, idle], DT); step(w, [release, idle], DT); };
    tap(); expect(w.controlled[0]).toBe(red[1]);
    tap(); expect(w.controlled[0]).toBe(red[2]);
    tap(); expect(w.controlled[0]).toBe(red[0]);
    // After a pause the chain resets: controlling the closest -> second closest again.
    for (let i = 0; i < 60; i++) step(w, [release, idle], DT);
    tap(); expect(w.controlled[0]).toBe(red[1]);
  });

  it('holding the button does not keep switching', () => {
    const { w, red } = switchWorld();
    w.controlled[0] = red[0];
    for (let i = 0; i < 30; i++) step(w, [press, idle], DT);
    expect(w.controlled[0]).toBe(red[1]);
  });

  it('with the puck, the same button passes and does not switch', () => {
    const { w, red } = switchWorld();
    w.controlled[0] = red[0];
    const s = w.skaters[red[0]];
    s.x = CX; s.y = 100; w.puck.carrier = red[0];
    step(w, [press, idle], DT);
    expect(w.controlled[0]).toBe(red[0]);
    expect(w.puck.carrier).toBe(-1); // passed
  });

  it('switching to the puck carrier does not also pass', () => {
    const { w, red } = switchWorld();
    w.controlled[0] = red[2];
    w.skaters[red[0]].x = CX; w.skaters[red[0]].y = 100; w.puck.carrier = red[0]; // a teammate has it
    step(w, [press, idle], DT);
    expect(w.controlled[0]).toBe(red[0]);
    expect(w.puck.carrier).toBe(red[0]); // still carrying: the press was spent on the switch
  });

  it('switching does not work on a team with no human', () => {
    const w = createWorld(1);
    w.humans = [false, false];
    const before = w.controlled[0];
    step(w, [press, idle], DT);
    expect(w.controlled[0]).toBe(before);
  });

  it('a held shoot button follows a switch to the new skater instead of firing a burst', () => {
    const { w, red } = switchWorld();
    w.controlled[0] = red[0];
    const hold: Intent = { x: 0, y: 0, action: true, pass: false };
    step(w, [hold, idle], DT);
    expect(w.skaters[red[0]].actionHeld).toBe(true);
    step(w, [{ ...hold, pass: true }, idle], DT);
    const now = w.controlled[0];
    expect(now).not.toBe(red[0]);
    expect(w.skaters[now].boost).toBe(0); // no burst from the handover
  });
});

describe('puck vs. net', () => {
  it('a hard shot into the net stays in or in front of it, never out the back (no tunnelling)', () => {
    for (const speed of [100, 130, 160]) {
      for (let k = 0; k < 12; k++) {
        const w = createWorld(3, { perTeam: 1 });
        w.humans = [false, false];
        w.game.phase = 'play';
        w.skaters.forEach((s) => { s.x = 10; s.y = RINK.h / 2; });
        Object.assign(w.puck, { x: CX, y: 60 + k * 0.2, vx: 0, vy: -speed, carrier: -1 });
        for (let i = 0; i < 90; i++) { w.goalies[1].x = 5; step(w, [idle, idle], DT); }
        expect(w.game.score[0], `speed ${speed} k ${k}`).toBe(1);
        expect(w.puck.y, `speed ${speed} k ${k}`).toBeGreaterThan(NETS[0].backY);
      }
    }
  });
});

describe('contact', () => {
  it('only some hard-enough bumps strip the puck', () => {
    let stripped = 0;
    const trials = 60;
    for (let t = 0; t < trials; t++) {
      const w = liveWorld();
      w.rng = t + 1;
      const [red, blue] = w.skaters;
      blue.x = CX; blue.y = 100; blue.vx = blue.vy = 0; w.puck.carrier = 1;
      red.x = CX; red.y = 100 + 2 * TUNING.skaterRadius - 0.2; red.vx = 0; red.vy = -(TUNING.checkSpeed + 6);
      step(w, [idle, idle], DT);
      if (w.puck.carrier !== 1) stripped++;
    }
    expect(stripped).toBeGreaterThan(trials * 0.25);
    expect(stripped).toBeLessThan(trials * 0.85);
  });
});

describe('offensive zone', () => {
  /** Red attacks the top net; its right wing carries the puck on the left side of the zone, blue stays out of the way. */
  const setUp = (plan: 'set' | 'shoot' | 'cycle' | 'overload'): World => {
    const w = createWorld(8, { offence: [plan, 'set'] });
    w.humans = [false, false];
    w.game.phase = 'play';
    w.skaters.forEach((s) => { if (s.team === 1) { s.x = CX + 40; s.y = 150; } });
    const reds = w.skaters.map((s, i) => ({ s, i })).filter((o) => o.s.team === 0);
    reds.forEach((o, k) => Object.assign(o.s, { x: 20 + k * 12, y: 60 + k * 4, vx: 0, vy: 0 }));
    const hold = () => { Object.assign(reds[2].s, { x: 30, y: 45, vx: 0, vy: 0 }); w.puck.carrier = reds[2].i; w.goalies.forEach((g) => { g.x = CX; }); };
    hold();
    for (let i = 0; i < 6 * 60; i++) { step(w, [idle, idle], DT); hold(); if (w.puck.carrier !== reds[2].i) break; }
    return w;
  };
  const role = (w: World, r: string) => w.skaters.find((s) => s.team === 0 && s.role === r)!;

  it('shoot: defence on the points, centre screens the goalie, wings at the posts', () => {
    const w = setUp('shoot');
    const net = NETS[0];
    expect(Math.abs(role(w, 'C').x - CX)).toBeLessThan(16);
    expect(Math.abs(role(w, 'C').y - net.gy)).toBeLessThan(20);
    expect(role(w, 'RD').y).toBeGreaterThan(role(w, 'C').y + 20); // the point is up the ice from the slot
  });

  it('cycle: the strong-side wing is low in the corner on the carrier\'s side', () => {
    const w = setUp('cycle');
    expect(role(w, 'L').x).toBeLessThan(CX - 20);
    expect(role(w, 'L').y).toBeLessThan(NETS[0].gy + 15);
  });

  it('overload: three skaters crowd the carrier\'s side of the net', () => {
    const w = setUp('overload');
    const strong = w.skaters.filter((s) => s.team === 0 && s.x < CX).length;
    expect(strong).toBeGreaterThanOrEqual(3);
  });

  it('points: defence stand just inside the blue line, not deep in the zone', () => {
    const w = setUp('shoot');
    const depth = role(w, 'RD').y; // red attacks toward y = 0
    expect(Math.abs(depth - (RINK.h / 2 - TUNING.aiPointDepth))).toBeLessThan(3);
    expect(RINK.h / 2 - depth).toBeLessThan(FACEOFF.blueLine + 12);
  });
});

describe('defence discipline', () => {
  /** Blue's RD sits just outside the default chase range of a loose puck, a winger a bit further; returns how far each closed on the puck. */
  const run = (chase: number) => {
    const saved = TUNING.aiDefenceChase;
    TUNING.aiDefenceChase = chase;
    try {
      const w = createWorld(5);
      w.humans = [false, false];
      w.game.phase = 'play';
      w.puck.carrier = -1;
      Object.assign(w.puck, { x: CX, y: 100, vx: 0, vy: 0 });
      const blue = w.skaters.filter((s) => s.team === 1);
      const place = (role: string, y: number) => { const s = blue.find((o) => o.role === role)!; Object.assign(s, { x: CX, y, vx: 0, vy: 0, lockout: 0 }); return s; };
      const rd = place('RD', 125);
      const r = place('R', 132);
      place('LD', 190); place('C', 190); place('L', 190);
      for (let i = 0; i < 30; i++) step(w, [idle, idle], DT);
      return { rd: 125 - rd.y, r: 132 - r.y };
    } finally {
      TUNING.aiDefenceChase = saved;
    }
  };

  it('a defender beyond its chase range holds position and a forward goes for the puck instead', () => {
    const limited = run(22);
    const free = run(1000);
    expect(limited.r).toBeGreaterThan(free.r + 3); // the winger takes the chase
    expect(limited.rd).toBeLessThan(free.rd - 1); // the defender no longer charges (it still drifts up with its hold line)
  });
});

describe('trap forecheck', () => {
  it('the wall steps up into the carrier\'s end instead of waiting at centre ice while they are deep in it', () => {
    const w = createWorld(7, { neutral: ['man', 'trap'], breakout: ['boards', 'carry'] });
    w.humans = [false, false];
    w.game.phase = 'play';
    const c = w.skaters.findIndex((s) => s.team === 0 && s.role === 'LD');
    // Red's defenceman sits deep in red's own end (the bottom); blue is trapping.
    const hold = () => { Object.assign(w.skaters[c], { x: CX, y: 175, vx: 0, vy: 0 }); w.puck.carrier = c; };
    hold();
    for (let i = 0; i < 360; i++) { step(w, [idle, idle], DT); hold(); }
    const wall = w.skaters.filter((s) => s.team === 1 && s.role !== 'C');
    const centreIce = RINK.h / 2;
    wall.forEach((s) => expect(s.y).toBeGreaterThan(centreIce + 15)); // well into red's half, not parked at the red line
  });
});
