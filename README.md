# Hockey

Browser hockey game in the spirit of NHL 94: classic feel, improved gameplay.
TypeScript + Vite + Canvas 2D. Local vs. AI and local 1v1 (two gamepads).

## Develop

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # typecheck + production bundle in dist/

Controls: P1 WASD + Space (or gamepad 1), P2 arrows + Enter (or gamepad 2).
Tap the action button with the puck to shoot, hold it to charge a slapshot.
Hit the carrier hard enough to knock the puck loose. R resets.
Browsers only report a gamepad after a button press on it.

## Layout

- `src/sim.ts` - game state and the fixed-timestep `step()`. Keep it
  deterministic (no `Math.random`, no wall-clock reads) so replays, tests and
  rollback netcode stay possible. Tuning constants live in `TUNING`.
- `src/sim-constants.ts` - rink dimensions and every feel-related `TUNING` value.
- `src/collide.ts` - circle-vs-boards (rounded rink) and circle-vs-circle. No physics
  engine on purpose: arcade feel and determinism matter more than realism.
- `src/input.ts` - keyboard + Gamepad API -> per-player `Intent`.
- `src/render.ts` - Canvas drawing; reads the world, never mutates it.

## Deploy

Cloud Build (`cloudbuild.yaml`) builds the Dockerfile (Vite build served by
nginx on `$PORT`) and deploys the `hockey` Cloud Run service.
