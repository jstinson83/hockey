import { describe, expect, it } from 'vitest';
import type { Intent } from './input';
import { addSkater, createWorld, step, type World } from './sim';
import { GAME, GOAL, RINK, TUNING } from './sim-constants';
import { NETS } from './collide';

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
      const [red, blue] = w.skaters;
      blue.x = CX; blue.y = 100; blue.vx = blue.vy = 0; w.puck.carrier = 1;
      red.x = CX; red.y = 100 + 9; red.vx = 0; red.vy = -14; // closing ~14: above checkMinSpeed, below checkSpeed
      step(w, [tap(checkerTaps, false, 0, -1), idle], DT);
      for (let i = 0; i < 30; i++) step(w, [idle, idle], DT);
      return w.puck.carrier;
    };
    expect(run1(false)).toBe(1);   // plain bump: blue keeps the puck
    expect(run1(true)).not.toBe(1); // checked: puck comes off blue (the checker may then pick it up)
  });

  it('a check stuns the victim and shoves them', () => {
    const w = liveWorld();
    const [red, blue] = w.skaters;
    blue.x = CX; blue.y = 100; red.x = CX; red.y = 108; red.vy = -20;
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

  it('control never switches by itself, even when a teammate gets the puck', () => {
    const w = createWorld(1);
    w.humans = [true, false];
    w.game.phase = 'play';
    const start = w.controlled[0];
    const mate = w.skaters.findIndex((s, i) => s.team === 0 && i !== start);
    w.skaters[mate].x = w.puck.x; w.skaters[mate].y = w.puck.y;
    w.puck.carrier = mate;
    for (let i = 0; i < 120; i++) step(w, [idle, idle], DT);
    expect(w.controlled[0]).toBe(start);
  });

  /** A 3v3 world with red's skaters at known distances from the puck: [0] nearest ... [2] farthest. */
  function switchWorld(): { w: World; red: number[] } {
    const w = createWorld(1);
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
