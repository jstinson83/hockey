import { newFaceoff } from './faceoff';
import { newAi } from './ai';
import { defendedNet, NETS } from './collide';
import { makeGoalie } from './goalie';
import { FACEOFF, GAME, GOAL, RINK, TUNING, type Team } from './sim-constants';
import type { World } from './sim-types';

/** Everyone back to their faceoff spots with the puck at centre ice. */
export function placeForFaceoff(world: World, spot?: { x: number; y: number }): void {
  const mid = RINK.h / 2;
  const sx = spot?.x ?? RINK.w / 2;
  const sy = spot?.y ?? mid;
  const slots = [0, 0];
  // Centres square off over the dot; wingers stand just outside the circle either side, and the
  // defence sit back and in from them. Each team lines up on its own side of the dot.
  const r = FACEOFF.radius;
  const lineup = [
    { dx: 0, dy: 4.6 },        // C, just outside pickup reach of the dot
    { dx: -(r + 3), dy: 5 },   // L
    { dx: r + 3, dy: 5 },      // R
    { dx: -(r - 2), dy: 17 },  // LD
    { dx: r - 2, dy: 17 },     // RD
  ];
  world.skaters.forEach((s) => {
    const k = slots[s.team]++;
    const sign = s.team === 0 ? 1 : -1; // red starts below the dot, blue above
    const slot = lineup[k % 5];
    const edge = TUNING.skaterRadius + 2; // an end-zone dot is near the boards: keep wingers on the ice
    s.x = Math.min(RINK.w - edge, Math.max(edge, sx + slot.dx * (s.team === 0 ? 1 : -1)));
    s.y = sy + sign * slot.dy;
    s.facing = Math.atan2(sy - s.y, sx - s.x); // everyone watches the dot
    s.vx = s.vy = 0;
    s.charge = 0;
    s.actionHeld = false;
    s.passHeld = false;
    s.pressedWithoutPuck = false;
    s.oneTimer = 0;
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
  Object.assign(world.puck, { x: sx, y: sy, vx: 0, vy: 0, carrier: -1, passTeam: -1, passTime: 0, passTo: -1, z: 0, vz: 0 });
  // Each human starts on their centre.
  world.controlled = [world.skaters.findIndex((s) => s.team === 0), world.skaters.findIndex((s) => s.team === 1)];
}

/** Stop play for a faceoff: at centre ice, or at `spot` after a whistle (`froze` = the team whose goalie held the puck). */
export function startFaceoff(world: World, spot?: { x: number; y: number }, froze: Team | null = null): void {
  placeForFaceoff(world, spot);
  world.game.phase = 'faceoff';
  world.game.faceoff = newFaceoff(world);
  world.game.froze = froze;
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
    if (!inMouth || !inside || puck.z > GOAL.height) return;
    const scorer: Team = i === 0 ? 0 : 1; // the far net is red's target
    game.score[scorer]++;
    game.lastScorer = scorer;
    game.phase = 'goal';
    game.timer = GAME.goalSeconds;
    puck.carrier = -1;
  });
}

/** The goalie smothers the puck and the play is stopped: faceoff on the dot in their zone, on the puck's side. */
export function whistleFrozenPuck(world: World, team: Team): void {
  const net = defendedNet(team);
  const x = world.puck.x < RINK.w / 2 ? RINK.w / 2 - FACEOFF.dx : RINK.w / 2 + FACEOFF.dx;
  startFaceoff(world, { x, y: net.gy - net.dir * FACEOFF.endZoneFromGoalLine }, team);
}

export function advancePhase(world: World, dt: number): void {
  const g = world.game;
  if (g.phase === 'play') {
    g.faceoff.since += dt;
    g.clock = Math.max(0, g.clock - dt);
    if (g.clock === 0) endPeriod(world);
  } else if (g.phase === 'faceoff') {
    if (g.faceoff.result) g.phase = 'play'; // the drop is resolved by updateFaceoff
  } else if (g.phase === 'intermission') {
    g.timer -= dt;
    if (g.timer <= 0) startFaceoff(world);
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
    startIntermission(world);
  } else if (g.score[0] !== g.score[1]) {
    g.phase = 'end';
  } else {
    g.overtime = true;
    g.period++;
    g.clock = GAME.overtimeSeconds;
    startIntermission(world);
  }
}

/** Between periods: play stops for a breather (the horn sounds as it starts), then the next period's faceoff. */
function startIntermission(world: World): void {
  placeForFaceoff(world);
  world.game.phase = 'intermission';
  world.game.timer = GAME.intermissionSeconds;
  world.game.froze = null;
}
