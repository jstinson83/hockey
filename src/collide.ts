import { GOAL, RINK, TUNING, type Team } from './sim-constants';

export interface Contact {
  nx: number; // unit normal pointing from the wall into the rink
  ny: number;
  depth: number; // how far the circle is past the wall
}

/**
 * Circle vs. the rink's rounded-rectangle boards. Returns null when the circle
 * (radius r at x,y) is fully inside.
 */
export function wallContact(x: number, y: number, r: number): Contact | null {
  const c = RINK.corner;

  // Corner arcs: inside a corner square, the boards are a circle of radius c.
  const cx = x < c ? c : x > RINK.w - c ? RINK.w - c : null;
  const cy = y < c ? c : y > RINK.h - c ? RINK.h - c : null;
  if (cx !== null && cy !== null) {
    const dx = cx - x;
    const dy = cy - y;
    const dist = Math.hypot(dx, dy);
    const depth = dist + r - c;
    if (depth <= 0 || dist === 0) return null;
    return { nx: dx / dist, ny: dy / dist, depth };
  }

  // Straight boards.
  if (x < r) return { nx: 1, ny: 0, depth: r - x };
  if (x > RINK.w - r) return { nx: -1, ny: 0, depth: x - (RINK.w - r) };
  if (y < r) return { nx: 0, ny: 1, depth: r - y };
  if (y > RINK.h - r) return { nx: 0, ny: -1, depth: y - (RINK.h - r) };
  return null;
}

export interface Body {
  x: number; y: number; vx: number; vy: number;
}

/** Push a body out of the boards and reflect its velocity (restitution 0 = dead stop). */
export function bounceOffBoards(b: Body, r: number, restitution: number): void {
  const hit = wallContact(b.x, b.y, r);
  if (!hit) return;
  b.x += hit.nx * hit.depth;
  b.y += hit.ny * hit.depth;
  const vn = b.vx * hit.nx + b.vy * hit.ny;
  if (vn < 0) {
    b.vx -= (1 + restitution) * vn * hit.nx;
    b.vy -= (1 + restitution) * vn * hit.ny;
  }
}

/**
 * Two circles of equal mass. Separates them and applies a bounce impulse along
 * the contact normal. Returns the closing speed (>0 means they were colliding),
 * which callers use to decide whether a hit was a check.
 */
export function collideCircles(a: Body, b: Body, ra: number, rb: number, restitution: number): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = ra + rb;
  if (dist >= minDist || dist === 0) return 0;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = (minDist - dist) / 2;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;

  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing <= 0) return 0;
  const j = ((1 + restitution) * closing) / 2;
  a.vx -= j * nx;
  a.vy -= j * ny;
  b.vx += j * nx;
  b.vy += j * ny;
  return closing;
}

/**
 * Circle vs. an immovable (or externally driven) circle, e.g. a goalie. Pushes
 * `b` out and reflects its velocity relative to the other body.
 */
export function collideStatic(
  b: Body, rb: number, o: Body, ro: number, restitution: number,
): boolean {
  const dx = b.x - o.x;
  const dy = b.y - o.y;
  const dist = Math.hypot(dx, dy);
  const minDist = rb + ro;
  if (dist >= minDist || dist === 0) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  b.x += nx * (minDist - dist);
  b.y += ny * (minDist - dist);
  const rel = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny;
  if (rel < 0) {
    b.vx -= (1 + restitution) * rel * nx;
    b.vy -= (1 + restitution) * rel * ny;
  }
  return true;
}

/** A net: opening on the goal line, extending `dir` (-1 toward y=0, +1 toward y=h) by GOAL.depth. */
export interface Net {
  gy: number;
  dir: -1 | 1;
  x0: number;
  x1: number;
  backY: number;
}

function makeNet(gy: number, dir: -1 | 1): Net {
  return { gy, dir, x0: RINK.w / 2 - GOAL.width / 2, x1: RINK.w / 2 + GOAL.width / 2, backY: gy + dir * GOAL.depth };
}

/** [0] is the far (top) net, [1] the near (bottom) net. */
export const NETS: [Net, Net] = [makeNet(GOAL.line, -1), makeNet(RINK.h - GOAL.line, 1)];

/** Circle vs. one segment with a thickness; resolves the overlap and reflects velocity. */
function collideSegment(
  b: Body, r: number, ax: number, ay: number, bx: number, by: number, thickness: number, restitution: number,
): void {
  const sx = bx - ax;
  const sy = by - ay;
  const len2 = sx * sx + sy * sy;
  const tt = len2 === 0 ? 0 : Math.min(Math.max(((b.x - ax) * sx + (b.y - ay) * sy) / len2, 0), 1);
  const px = ax + sx * tt;
  const py = ay + sy * tt;
  let dx = b.x - px;
  let dy = b.y - py;
  const dist = Math.hypot(dx, dy);
  const minDist = r + thickness;
  if (dist >= minDist) return;
  if (dist === 0) {
    dx = -sy;
    dy = sx;
  }
  const d = Math.hypot(dx, dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  b.x += nx * (minDist - dist);
  b.y += ny * (minDist - dist);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + restitution) * vn * nx;
    b.vy -= (1 + restitution) * vn * ny;
  }
}

/** Net frame segments as [ax, ay, bx, by, thickness]; `door` adds the closed mouth. */
function netSegments(net: Net, door: boolean): [number, number, number, number, number][] {
  const post = TUNING.postRadius;
  const segs: [number, number, number, number, number][] = [
    [net.x0, net.gy, net.x0, net.backY, post],
    [net.x0, net.backY, net.x1, net.backY, post],
    [net.x1, net.backY, net.x1, net.gy, post],
  ];
  if (door) segs.push([net.x0, net.gy, net.x1, net.gy, 0.3]);
  return segs;
}

/**
 * Circle vs. a net's frame (two sides and the back, thickened by the post
 * radius). `door` also closes the mouth: skaters, and a puck they carry, can't
 * enter the net; a loose puck can.
 */
export function collideNet(b: Body, r: number, net: Net, restitution: number, door: boolean): void {
  for (const [ax, ay, bx, by, thickness] of netSegments(net, door)) {
    collideSegment(b, r, ax, ay, bx, by, thickness, restitution);
  }
}

/**
 * Where (0..1) the line from (sx,sy) to (px,py) first crosses any part of the
 * net, mouth included; 1 when it doesn't. Used to stop a carried puck from
 * being dragged through the frame: a circle test alone can't tell which side
 * of a wall the puck belongs on once its centre has crossed it.
 */
export function firstNetCrossing(sx: number, sy: number, px: number, py: number, net: Net): number {
  const dx = px - sx;
  const dy = py - sy;
  let best = 1;
  for (const [ax, ay, bx, by] of netSegments(net, true)) {
    const ex = bx - ax;
    const ey = by - ay;
    const denom = dx * ey - dy * ex;
    if (denom === 0) continue;
    const t = ((ax - sx) * ey - (ay - sy) * ex) / denom;
    const s = ((ax - sx) * dy - (ay - sy) * dx) / denom;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1 && t < best) best = t;
  }
  return best;
}

/** The net a team shoots at: red attacks the top net, blue the bottom. */
export function attackedNet(team: Team): Net {
  return team === 0 ? NETS[0] : NETS[1];
}

/** The net a team defends: red defends the bottom net, blue the top. */
export function defendedNet(team: Team): Net {
  return team === 0 ? NETS[1] : NETS[0];
}
