import { defendedNet } from './collide';
import { clamp } from './mathutil';
import { GOAL, RINK, TUNING, type Team } from './sim-constants';
import type { Goalie, World } from './sim-types';

export function makeGoalie(team: Team): Goalie {
  const net = defendedNet(team);
  const y = net.gy - net.dir * 3.2;
  return {
    team, x: RINK.w / 2, y, vx: 0, vy: 0, watchX: RINK.w / 2, watchY: RINK.h / 2,
    threat: 0, down: 0, diveLeft: 0, diveX: RINK.w / 2,
  };
}

export function goalieRadius(g: Goalie): number {
  return g.down > 0 ? TUNING.goalieDownRadius : TUNING.goalieRadius;
}

/**
 * The goalie is a physical blocker, not a dice roll: it tracks the puck with a
 * lag, stands out to cut the angle, and commits to a butterfly slide when a
 * shot is on target. Saves come out of the collision with the puck.
 */
export function updateGoalie(world: World, g: Goalie, dt: number): void {
  const net = defendedNet(g.team);
  const { puck } = world;
  const cx = RINK.w / 2;
  const hw = GOAL.width / 2;

  const k = 1 - Math.exp(-dt / TUNING.goalieReaction);
  g.watchX += (puck.x - g.watchX) * k;
  g.watchY += (puck.y - g.watchY) * k;

  // Is a shot heading for the mouth? Only commits once it has been on target for the reaction time.
  const speed = Math.hypot(puck.vx, puck.vy);
  const distToLine = (puck.y - net.gy) * -net.dir;
  let xCross = 0;
  let onTarget = false;
  if (
    world.game.phase === 'play' && puck.carrier < 0 && puck.vy * net.dir > 0 &&
    speed > TUNING.goalieDiveTrigger && distToLine > 0 && distToLine < TUNING.goalieDiveRange
  ) {
    xCross = puck.x + puck.vx * (distToLine / Math.abs(puck.vy));
    onTarget = Math.abs(xCross - cx) < hw + 2;
  }
  g.threat = onTarget ? g.threat + dt : 0;
  if (g.down <= 0 && g.threat > TUNING.goalieReaction) {
    g.down = TUNING.goalieDownTime;
    g.diveLeft = TUNING.goalieDiveTime;
    g.diveX = clamp(xCross, cx - hw + 1, cx + hw - 1);
    g.threat = 0;
  }

  let wantVx = 0;
  let wantVy = 0;
  if (g.down > 0) {
    g.down -= dt;
    if (g.diveLeft > 0) {
      g.diveLeft -= dt;
      wantVx = clamp((g.diveX - g.x) * 10, -TUNING.goalieDiveSpeed, TUNING.goalieDiveSpeed);
    }
  } else {
    // Stand on the line from the net's mouth toward the puck, further out the closer it is.
    const rx = cx;
    const ry = net.gy + net.dir * 1.5;
    const dx = g.watchX - rx;
    const dy = g.watchY - ry;
    const dist = Math.hypot(dx, dy) || 1;
    const stand = 3.2 + 3.0 * clamp(1 - (dist - 12) / 45, 0, 1);
    const tx = clamp(rx + (dx / dist) * stand, cx - hw - 0.5, cx + hw + 0.5);
    const front = clamp((ry + (dy / dist) * stand - net.gy) * -net.dir, 0.8, GOAL.crease - 1);
    const ty = net.gy - net.dir * front;
    wantVx = clamp((tx - g.x) * 8, -TUNING.goalieSpeed, TUNING.goalieSpeed);
    wantVy = clamp((ty - g.y) * 8, -TUNING.goalieSpeed, TUNING.goalieSpeed);
  }
  const blend = Math.min(1, 15 * dt);
  g.vx += (wantVx - g.vx) * blend;
  g.vy += (wantVy - g.vy) * blend;
  g.x = clamp(g.x + g.vx * dt, cx - hw - 0.5, cx + hw + 0.5);
  const front = clamp((g.y + g.vy * dt - net.gy) * -net.dir, 0.8, GOAL.crease - 1);
  g.y = net.gy - net.dir * front;
}
