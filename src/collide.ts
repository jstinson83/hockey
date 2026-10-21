import { RINK } from './sim-constants';

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
