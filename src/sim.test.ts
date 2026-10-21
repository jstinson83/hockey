import { describe, expect, it } from 'vitest';
import type { Intent } from './input';
import { createWorld, step, type World } from './sim';
import { GAME, GOAL, RINK } from './sim-constants';
import { NETS } from './collide';

const DT = 1 / 60;
const idle: Intent = { x: 0, y: 0, action: false };
const CX = RINK.w / 2;

function run(world: World, seconds: number, intents: Intent[] = [idle, idle]): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(world, intents, DT);
}

/** A world already in open play, skaters out of the way. */
function liveWorld(): World {
  const w = createWorld();
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
      step(w, [{ x: 0, y: -1, action: false }, idle], DT);
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
    const intent = { x: 0, y: -net.dir, action: false };
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
  function shoot(targetX: number, speed: number): World {
    const w = liveWorld();
    const fromX = CX - 18;
    const fromY = 42;
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
    for (let tx = CX - 6.5; tx <= CX + 6.5; tx += 1.3) results.push(shoot(tx, 125).game.score[0] > 0);
    expect(results.some(Boolean)).toBe(true);
    expect(results.some((g) => !g)).toBe(true);
  });
});

describe('game flow', () => {
  it('plays three periods, then overtime, then ends tied', () => {
    const w = createWorld();
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
