import type { Intent } from './input';

/** Rink size in world units (feet-ish). Tuning lives here so it's easy to find. */
export const RINK = { w: 200, h: 85, corner: 28 };

export const TUNING = {
  accel: 90,       // units/s^2 when pushing a direction
  maxSpeed: 38,    // units/s
  friction: 0.6,   // fraction of velocity kept after 1s of coasting
  skaterRadius: 2.5,
};

export interface Skater {
  x: number; y: number;
  vx: number; vy: number;
  color: string;
}

export interface World {
  skaters: Skater[];
}

export function createWorld(): World {
  return {
    skaters: [
      { x: RINK.w / 2 - 20, y: RINK.h / 2, vx: 0, vy: 0, color: '#d33' },
      { x: RINK.w / 2 + 20, y: RINK.h / 2, vx: 0, vy: 0, color: '#36c' },
    ],
  };
}

/** Fixed-timestep step. Deterministic: same world + same intents => same result. */
export function step(world: World, intents: Intent[], dt: number): void {
  world.skaters.forEach((s, i) => {
    const intent = intents[i];
    if (intent) {
      s.vx += intent.x * TUNING.accel * dt;
      s.vy += intent.y * TUNING.accel * dt;
    }
    const damp = Math.pow(TUNING.friction, dt);
    s.vx *= damp;
    s.vy *= damp;

    const speed = Math.hypot(s.vx, s.vy);
    if (speed > TUNING.maxSpeed) {
      s.vx = (s.vx / speed) * TUNING.maxSpeed;
      s.vy = (s.vy / speed) * TUNING.maxSpeed;
    }

    s.x += s.vx * dt;
    s.y += s.vy * dt;

    const r = TUNING.skaterRadius;
    if (s.x < r) { s.x = r; s.vx = 0; }
    if (s.x > RINK.w - r) { s.x = RINK.w - r; s.vx = 0; }
    if (s.y < r) { s.y = r; s.vy = 0; }
    if (s.y > RINK.h - r) { s.y = RINK.h - r; s.vy = 0; }
  });
}
