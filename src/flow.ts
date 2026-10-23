import { newAi } from './ai';
import { NETS } from './collide';
import { makeGoalie } from './goalie';
import { GAME, GOAL, RINK, TUNING, type Team } from './sim-constants';
import type { World } from './sim-types';

/** Everyone back to their faceoff spots with the puck at centre ice. */
export function placeForFaceoff(world: World): void {
  const mid = RINK.h / 2;
  const slots = [0, 0];
  world.skaters.forEach((s) => {
    const k = slots[s.team]++;
    const sign = s.team === 0 ? 1 : -1; // red starts below centre, blue above
    // Slots: C, L, R, LD, RD (see ROLES in sim.ts); defence line up behind the forwards.
    s.x = RINK.w / 2 + [0, -20, 20, -12, 12][k % 5];
    s.y = mid + sign * [14, 30, 30, 46, 46][k % 5];
    s.vx = s.vy = 0;
    s.facing = s.team === 0 ? -Math.PI / 2 : Math.PI / 2;
    s.charge = 0;
    s.actionHeld = false;
    s.passHeld = false;
    s.pressedWithoutPuck = false;
    s.lockout = 0;
    s.boost = 0;
    s.checking = 0;
    s.poking = 0;
    s.pokeCd = 0;
    s.pokeHeld = false;
    s.stun = 0;
    s.ai = newAi();
  });
  world.goalies.forEach((g, i) => Object.assign(g, makeGoalie(i as Team)));
  Object.assign(world.puck, { x: RINK.w / 2, y: mid, vx: 0, vy: 0, carrier: -1 });
  // Each human starts on their centre.
  world.controlled = [world.skaters.findIndex((s) => s.team === 0), world.skaters.findIndex((s) => s.team === 1)];
}

export function startFaceoff(world: World): void {
  placeForFaceoff(world);
  world.game.phase = 'faceoff';
  world.game.timer = GAME.faceoffSeconds;
}

/**
 * A puck inside the net - wholly past the goal line, between the posts, and
 * still in front of the back - is a goal for the other team. (Behind the net
 * is not in the net.)
 */
export function checkGoal(world: World): void {
  const { puck, game } = world;
  if (game.phase !== 'play') return;
  NETS.forEach((net, i) => {
    const inMouth = puck.x > net.x0 && puck.x < net.x1;
    const depth = (puck.y - net.gy) * net.dir; // how far past the goal line, toward the back
    const inside = depth > TUNING.puckRadius && depth < GOAL.depth;
    if (!inMouth || !inside) return;
    const scorer: Team = i === 0 ? 0 : 1; // the far net is red's target
    game.score[scorer]++;
    game.lastScorer = scorer;
    game.phase = 'goal';
    game.timer = GAME.goalSeconds;
    puck.carrier = -1;
  });
}

export function advancePhase(world: World, dt: number): void {
  const g = world.game;
  if (g.phase === 'play') {
    g.clock = Math.max(0, g.clock - dt);
    if (g.clock === 0) endPeriod(world);
  } else if (g.phase === 'faceoff') {
    g.timer -= dt;
    if (g.timer <= 0) g.phase = 'play';
  } else if (g.phase === 'goal') {
    g.timer -= dt;
    if (g.timer <= 0) {
      if (g.overtime) g.phase = 'end'; // sudden death
      else startFaceoff(world);
    }
  }
}

function endPeriod(world: World): void {
  const g = world.game;
  if (g.overtime) {
    g.phase = 'end'; // overtime expired: a tie
  } else if (g.period < GAME.periods) {
    g.period++;
    g.clock = GAME.periodSeconds;
    startFaceoff(world);
  } else if (g.score[0] !== g.score[1]) {
    g.phase = 'end';
  } else {
    g.overtime = true;
    g.period++;
    g.clock = GAME.overtimeSeconds;
    startFaceoff(world);
  }
}
