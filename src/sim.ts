import { aiIntent, newAi, type Role } from './ai';
import { collideCircles, collideNet, collideStatic, defendedNet, bounceOffBoards, NETS } from './collide';
import { handleButtons } from './actions';
import { advancePhase, checkGoal, placeForFaceoff } from './flow';
import { goalieRadius, makeGoalie, updateGoalie } from './goalie';
import type { Intent } from './input';
import { knockLoose, updatePuck } from './puck';
import { moveSkater, stunAndShove, updateControlled } from './skater';
import { GAME, RINK, TEAM_COLORS, TUNING, type Team } from './sim-constants';
import type { Skater, World } from './sim-types';

export { RINK, TUNING, defendedNet, goalieRadius };
export type { Team };
export type { Game, Goalie, Phase, Puck, Skater, World } from './sim-types';

const ROLES: Role[] = ['C', 'L', 'R'];

function makeSkater(team: Team, slot: number): Skater {
  return {
    x: RINK.w / 2, y: RINK.h / 2, vx: 0, vy: 0, facing: 0, team, role: ROLES[slot % 3], ai: newAi(),
    charge: 0, actionHeld: false, passHeld: false, pressedWithoutPuck: false, lockout: 0,
    boost: 0, checking: 0, stun: 0, color: TEAM_COLORS[team],
  };
}

/**
 * A fresh game. `perTeam` skaters a side (3v3 by default); skaters[0..perTeam-1] are red,
 * the rest blue, centre first. Both teams start human-driven; the caller sets `humans`.
 */
export function createWorld(seed = 1, opts: { perTeam?: number } = {}): World {
  const perTeam = opts.perTeam ?? 3;
  const skaters: Skater[] = [];
  for (const team of [0, 1] as const) for (let k = 0; k < perTeam; k++) skaters.push(makeSkater(team, k));
  const world: World = {
    skaters,
    goalies: [makeGoalie(0), makeGoalie(1)],
    puck: { x: RINK.w / 2, y: RINK.h / 2, vx: 0, vy: 0, carrier: -1 },
    game: {
      phase: 'faceoff', timer: GAME.faceoffSeconds, period: 1, overtime: false,
      clock: GAME.periodSeconds, score: [0, 0], lastScorer: null,
    },
    rng: seed | 0,
    humans: [true, true],
    controlled: [0, perTeam],
    switchHeld: [false, false],
    switchRank: [0, 0],
    switchSince: [99, 99],
  };
  placeForFaceoff(world);
  return world;
}

/** Add a skater (tests and scenarios). It starts with no human and takes the next free role. */
export function addSkater(world: World, team: Team, x: number, y: number): Skater {
  const slot = world.skaters.filter((s) => s.team === team).length;
  const s = makeSkater(team, slot);
  s.x = x;
  s.y = y;
  world.skaters.push(s);
  return s;
}

/**
 * Fixed-timestep step. Deterministic: same world + same human inputs => same result.
 * `human` is the stick input per team (red, blue) for that team's controlled skater;
 * every other skater (or every skater on a team with no human) is driven by the AI.
 */
export function step(world: World, human: Intent[], dt: number): void {
  const { skaters, goalies, game } = world;
  const controllable = game.phase === 'play' || game.phase === 'goal';

  updateControlled(world, human, dt);
  const intents: (Intent | undefined)[] = skaters.map((s, i) =>
    world.humans[s.team] && world.controlled[s.team] === i ? human[s.team] : aiIntent(world, i, dt),
  );

  skaters.forEach((s, i) => moveSkater(s, controllable ? intents[i] : undefined, dt));

  // Skater vs. skater: separate and bounce. A tap of the shoot button opens a check window;
  // a hit inside it lands at a low closing speed, shoves and stuns the victim, and knocks
  // the puck loose. Plain contact only knocks the puck loose when it is hard enough.
  for (let i = 0; i < skaters.length; i++) {
    for (let j = i + 1; j < skaters.length; j++) {
      const a = skaters[i];
      const b = skaters[j];
      const checking = a.checking > 0 || b.checking > 0;
      const closing = collideCircles(
        a, b, TUNING.skaterRadius, TUNING.skaterRadius, checking ? TUNING.checkBounce : TUNING.skaterBounce,
      );
      if (game.phase !== 'play') continue;
      const carrier = world.puck.carrier;
      const threshold = checking ? TUNING.checkMinSpeed : TUNING.checkSpeed;
      if (closing >= threshold && (carrier === i || carrier === j)) knockLoose(world, carrier === i ? j : i);
      if (checking && closing >= TUNING.checkMinSpeed) {
        if (a.checking > 0) stunAndShove(b, a);
        if (b.checking > 0) stunAndShove(a, b);
      }
    }
  }
  skaters.forEach((s) => {
    NETS.forEach((net) => collideNet(s, TUNING.skaterRadius, net, 0.2, true));
    bounceOffBoards(s, TUNING.skaterRadius, TUNING.wallBounce);
  });

  goalies.forEach((g) => updateGoalie(world, g, dt));
  skaters.forEach((s) => goalies.forEach((g) => collideStatic(s, TUNING.skaterRadius, g, goalieRadius(g), 0.2)));

  updatePuck(world, dt);
  skaters.forEach((_, i) => handleButtons(world, i, controllable ? intents[i] : undefined, dt));

  checkGoal(world);
  advancePhase(world, dt);
}
