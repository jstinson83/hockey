import { bounceOffBoards, collideNet, collideStatic, defendedNet, firstNetCrossing, NETS } from './collide';
import { goalieRadius } from './goalie';
import { holdingGoalie, tryCatch } from './goalie-hold';
import { TUNING } from './sim-constants';
import type { World } from './sim-types';

export function updatePuck(world: World, dt: number): void {
  const { puck, skaters, goalies } = world;
  const r = TUNING.puckRadius;

  if (puck.carrier >= 0) {
    const c = skaters[puck.carrier];
    puck.x = c.x + Math.cos(c.facing) * TUNING.carryOffset;
    puck.y = c.y + Math.sin(c.facing) * TUNING.carryOffset;
    puck.vx = c.vx;
    puck.vy = c.vy;

    // The puck stays on the skater's side of any net frame: if the carry line crosses
    // one (skating into the back of the net, say), shorten the carry so it rests against it.
    const crossing = Math.min(...NETS.map((net) => firstNetCrossing(c.x, c.y, puck.x, puck.y, net)));
    if (crossing < 1) {
      const d = Math.max(0.8, crossing * TUNING.carryOffset - (r + TUNING.postRadius));
      puck.x = c.x + Math.cos(c.facing) * d;
      puck.y = c.y + Math.sin(c.facing) * d;
    }

    // A carried puck can't go through the nets or a goalie: push the skater back instead.
    const px = puck.x;
    const py = puck.y;
    NETS.forEach((net) => collideNet(puck, r, net, 0, true));
    goalies.forEach((g) => collideStatic(puck, r, g, goalieRadius(g), 0));
    const dx = puck.x - px;
    const dy = puck.y - py;
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      c.x += dx;
      c.y += dy;
      const vn = (c.vx * dx + c.vy * dy) / len;
      if (vn < 0) {
        c.vx -= (vn * dx) / len;
        c.vy -= (vn * dy) / len;
      }
    }
    // Carrying into the boards: the puck is still a physical object.
    bounceOffBoards(puck, r, 0);
    return;
  }

  // A held puck sits in the goalie's glove.
  const holder = holdingGoalie(world);
  if (holder) {
    const net = defendedNet(holder.team);
    puck.x = holder.x;
    puck.y = holder.y - net.dir * (goalieRadius(holder) + r + 0.25);
    puck.vx = puck.vy = 0;
    return;
  }

  const damp = Math.pow(TUNING.puckFriction, dt);
  puck.vx *= damp;
  puck.vy *= damp;
  const sp = Math.hypot(puck.vx, puck.vy);
  if (sp > TUNING.maxPuckSpeed) {
    puck.vx *= TUNING.maxPuckSpeed / sp;
    puck.vy *= TUNING.maxPuckSpeed / sp;
  }
  // Move in substeps no longer than the net frame is thick, or a hard shot tunnels through the
  // back of the net (and the goalie) between one step and the next.
  const n = Math.max(1, Math.ceil((Math.hypot(puck.vx, puck.vy) * dt) / TUNING.puckMaxStep));
  for (let k = 0; k < n; k++) {
    puck.x += (puck.vx * dt) / n;
    puck.y += (puck.vy * dt) / n;
    bounceOffBoards(puck, r, TUNING.puckBounce);
    NETS.forEach((net) => collideNet(puck, r, net, TUNING.netBounce, false));
    for (const g of goalies) {
      const sp = Math.hypot(puck.vx, puck.vy);
      if (collideStatic(puck, r, g, goalieRadius(g), TUNING.goalieBounce) && tryCatch(world, g, sp)) break;
    }
    if (holdingGoalie(world)) return;
  }

  if (world.game.phase !== 'play') return;

  // A pass is protected for a moment: opponents reach for it with a shorter stick, so the receiver
  // usually gets there first unless a defender is squarely in the lane.
  if (puck.passTime > 0) puck.passTime = Math.max(0, puck.passTime - dt);
  // Pickup: nearest eligible skater wins.
  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed > TUNING.pickupSpeed) return;
  let best = -1;
  let bestDist = TUNING.pickupRadius;
  skaters.forEach((s, i) => {
    if (s.lockout > 0) return;
    const d = Math.hypot(s.x - puck.x, s.y - puck.y);
    const reach = puck.passTime > 0 && s.team !== puck.passTeam ? TUNING.pickupRadius * TUNING.passInterceptReach : TUNING.pickupRadius;
    if (d < reach && d < bestDist) { best = i; bestDist = d; }
  });
  if (best >= 0) {
    puck.carrier = best;
    puck.passTime = 0;
    skaters[best].charge = 0;
  }
}

/** Knock the puck off its carrier, toward the skater who hit them. */
export function knockLoose(world: World, hitter: number): void {
  const { puck, skaters } = world;
  const victim = skaters[puck.carrier];
  const h = skaters[hitter];
  const dx = victim.x - h.x;
  const dy = victim.y - h.y;
  const d = Math.hypot(dx, dy) || 1;
  puck.carrier = -1;
  puck.passTime = 0;
  puck.vx = victim.vx + (dx / d) * 25;
  puck.vy = victim.vy + (dy / d) * 25;
  victim.lockout = 0.4;
  victim.charge = 0;
}
