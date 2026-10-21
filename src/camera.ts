import { RINK, VIEW } from './sim-constants';
import type { World } from './sim';

/** Follows the puck along the ice (y axis only; the full rink width is always visible). */
export interface Camera {
  y: number; // world y at the vertical centre of the screen
}

/** How many world units of ice fit on screen top to bottom. */
export const VISIBLE_LENGTH = VIEW.height / (VIEW.pxPerUnit * VIEW.tilt);

export function createCamera(world: World): Camera {
  return { y: targetY(world) };
}

function targetY(world: World): number {
  const { puck } = world;
  const half = VISIBLE_LENGTH / 2;
  const want = puck.y + puck.vy * VIEW.lookahead;
  return Math.min(Math.max(want, half - VIEW.endOverscan), RINK.h - half + VIEW.endOverscan);
}

export function updateCamera(cam: Camera, world: World, dt: number): void {
  cam.y += (targetY(world) - cam.y) * (1 - Math.exp(-VIEW.followRate * dt));
}
