# Hockey

Browser hockey game in the spirit of NHL 94: classic feel, improved gameplay.
TypeScript + Vite + Canvas 2D. Local vs. AI and local 1v1 (two gamepads).

## Develop

    npm install
    npm run dev      # http://localhost:5173
    npm test         # sim unit tests (vitest)
    npm run build    # typecheck + production bundle in dist/

Controls: P1 arrows + Space (shoot) + Z (pass; switch player without the puck) + X (poke check), or gamepad 1; P2 gamepad 2 only. On a
PS5 pad: X = shoot, Square = pass, and without the puck Square switches player. Circle = poke check (stab the stick at an opposing carrier in front of you; strips the puck some of the time, with a cooldown). With the puck, tap shoot = wrist shot, hold = charge a
slapshot (aim assist pulls shots toward the net; spread keeps them from being automatic).
Without the puck, tapping shoot is a speed burst (stacks to a cap) and opens a short
bodycheck window. P / Esc / the Options button pauses (it also pauses when the tab loses
focus). R resets, F toggles fullscreen. Each game starts both teams on the cycle offence, swing breakout and press neutral zone (shown above the scoreboard; change them from the pause menu or the keys below);
B / N cycle red's / blue's breakout (carry, boards, swing, stretch), V / M their neutral-zone defence (man, trap, press),
O / L their offensive-zone play (set, shoot, cycle, overload).
Browsers only report a gamepad after a button press on it.

## Layout

- `src/sim.ts` - game state and the fixed-timestep `step()`. Keep it
  deterministic (no `Math.random`, no wall-clock reads) so replays, tests and
  rollback netcode stay possible. Tuning constants live in `TUNING`.
- `src/sim.ts` also owns the game flow (faceoff -> play -> goal -> faceoff, 3x2:00 periods,
  sudden-death overtime, final) and the goalies: physical blockers with a reaction delay and a
  butterfly dive, so saves come from collisions and are tunable via `TUNING.goalie*`.
- `src/ai.ts` - skater AI (5v5 by default: C, L, R, LD, RD). Team plan (support / defend / chase / press anchors by
  role: C, L, R), carrier decisions (shoot / pass / carry, a few times a second, seeded random), and
  steering that emits the same `Intent` a human would. Each human controls one skater per team
  (control changes only two ways: when a teammate picks up the puck you're switched to them, and the pass button without the puck switches to the teammate nearest it, or the next nearest if you already are); everyone else is AI. Blue is AI unless a second pad
  is connected; `D` toggles an AI-vs-AI demo.
- `src/tuning-panel.ts` / `tuning-meta.ts` / `tuning-store.ts` - the live tuning overlay (`T`): a slider per
  `TUNING` value, saved in the browser, with "Copy changes" to export what differs from the code's defaults.
  Add a new `TUNING` value to `tuning-meta.ts` too (a test fails if one is missing).
- `src/strategy-menu.ts` - the pause-screen dropdowns for each team's breakout / neutral-zone / offensive-zone plan
  (same fields the B/N, V/M, O/L keys cycle).
- `src/sim-constants.ts` - rink dimensions and every feel-related `TUNING` value.
- `src/collide.ts` - circle-vs-boards (rounded rink) and circle-vs-circle. No physics
  engine on purpose: arcade feel and determinism matter more than realism.
- `src/render.ts` bakes the static scene (crowd, ice, markings, boards/glass) into offscreen
  images on load/resize and scrolls them; only skaters, puck and nets are drawn per frame.
- `src/camera.ts` / `src/render.ts` - presentation only. Rink long axis is y (goals top and
  bottom); the view is an oblique projection (`VIEW.tilt` foreshortens y) and the camera
  scrolls along the ice following the puck. `VIEW` in `sim-constants.ts` holds the scale,
  tilt and camera feel; none of it touches the simulation.
- `src/sprite-poses.ts` / `sprite-rig.ts` / `sprite-select.ts` - placeholder player sprites. The poses file is the frame
  list (which animations, how many frames, fps; the spec for real art), the rig bakes any pose to any of 8 facings
  procedurally, and the selector maps sim state to an animation and frame. `sprites.html` (`/sprites.html` in dev) is the
  sprite lab: every animation as a contact sheet plus a live preview, and "Export sheet PNG" for an art template.
- `src/input.ts` - keyboard + Gamepad API -> per-player `Intent`.
- `src/render.ts` - Canvas drawing; reads the world, never mutates it.

## Deploy

Cloud Build (`cloudbuild.yaml`) builds the Dockerfile (Vite build served by
nginx on `$PORT`) and deploys the `hockey` Cloud Run service.
