import { aiIntent, newAi, type Breakout, type Neutral, type Offence, type Role } from './ai';
import { collideCircles, collideNet, collideStatic, defendedNet, bounceOffBoards, NETS } from './collide';
import { handleButtons } from './actions';
import { newFaceoff, updateFaceoff } from './faceoff';
import { advancePhase, checkGoal, placeForFaceoff } from './flow';
import { updateHold } from './goalie-hold';
import { goalieRadius, makeGoalie, updateGoalie } from './goalie';
import type { Intent } from './input';
import { knockLoose, updatePuck } from './puck';
import { nextRandom } from './rng';
import { moveSkater, stunAndShove, updateControlled } from './skater';
import { GAME, RINK, TEAM_COLORS, TUNING, type Team } from './sim-constants';
import type { Skater, World } from './sim-types';

export { RINK, TUNING, defendedNet, goalieRadius };
export type { Team };
export type { Breakout, Neutral };
export { BREAKOUTS, NEUTRALS, OFFENCES } from './ai';
export type { Act, Game, Goalie, Phase, Puck, Skater, World } from './sim-types';

const IDLE: Intent = { x: 0, y: 0, action: false, pass: false };
const ROLES: Role[] = ['C', 'L', 'R', 'LD', 'RD'];

function makeSkater(team: Team, slot: number): Skater {
  return {
    x: RINK.w / 2, y: RINK.h / 2, vx: 0, vy: 0, facing: 0, team, role: ROLES[slot % ROLES.length], ai: newAi(),
    charge: 0, actionHeld: false, passHeld: false, pressedWithoutPuck: false, lockout: 0,
    boost: 0, checking: 0, poking: 0, pokeCd: 0, pokeHeld: false, stun: 0, act: 'none', actT: 99, color: TEAM_COLORS[team],
  };
}

/**
 * A fresh game. `perTeam` skaters a side (5v5 by default); skaters[0..perTeam-1] are red,
 * the rest blue, centre first. Both teams start human-driven; the caller sets `humans`.
 */
export function createWorld(seed = 1, opts: { perTeam?: number; breakout?: [Breakout, Breakout]; neutral?: [Neutral, Neutral]; offence?: [Offence, Offence] } = {}): World {
  const perTeam = opts.perTeam ?? GAME.skatersPerTeam;
  const skaters: Skater[] = [];
  for (const team of [0, 1] as const) for (let k = 0; k < perTeam; k++) skaters.push(makeSkater(team, k));
  const world: World = {
    skaters,
    goalies: [makeGoalie(0), makeGoalie(1)],
    puck: { x: RINK.w / 2, y: RINK.h / 2, vx: 0, vy: 0, carrier: -1, passTeam: -1, passTime: 0 },
    game: {
      phase: 'faceoff', timer: 0, faceoff: undefined as never, period: 1, overtime: false,
      clock: GAME.periodSeconds, score: [0, 0], lastScorer: null, froze: null,
    },
    rng: seed | 0,
    humans: [true, true],
    controlled: [0, perTeam],
    switchHeld: [false, false],
    switchRank: [0, 0],
    switchSince: [99, 99],
    breakout: opts.breakout ?? ['carry', 'carry'],
    neutral: opts.neutral ?? ['man', 'man'],
    offence: opts.offence ?? ['set', 'set'],
  };
  world.game.faceoff = newFaceoff(world);
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

  if (game.phase === 'faceoff') {
    updateFaceoff(world, human, dt);
    // Pass is the faceoff button; a press must not carry over as a pass or switch once play starts.
    skaters.forEach((s) => { s.passHeld = !!human[s.team]?.pass; });
  }

  // While a goalie holds the puck its human drives the goalie, so the buttons don't also switch skaters.
  updateControlled(world, human.map((h, t) => (goalies[t].holding ? IDLE : h)), dt);
  // A human whose goalie is holding the puck steers the goalie instead; their skater is left to the AI.
  const intents: (Intent | undefined)[] = skaters.map((s, i) =>
    world.humans[s.team] && world.controlled[s.team] === i && !goalies[s.team].holding ? human[s.team] : aiIntent(world, i, dt),
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
      if (closing >= threshold && (carrier === i || carrier === j) && nextRandom(world) < TUNING.knockChance) {
        knockLoose(world, carrier === i ? j : i);
      }
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

  goalies.forEach((g) => {
    const isHuman = world.humans[g.team];
    updateGoalie(world, g, dt, isHuman ? human[g.team] : undefined);
    updateHold(world, g, human[g.team], isHuman, dt);
  });
  skaters.forEach((s) => goalies.forEach((g) => collideStatic(s, TUNING.skaterRadius, g, goalieRadius(g), 0.2)));

  updatePuck(world, dt);
  skaters.forEach((_, i) => handleButtons(world, i, controllable ? intents[i] : undefined, dt));

  checkGoal(world);
  advancePhase(world, dt);
}
