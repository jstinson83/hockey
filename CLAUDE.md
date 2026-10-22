# Hockey

Browser hockey game in the spirit of NHL 94: classic feel, improved gameplay.
TypeScript + Vite + Canvas 2D. See `README.md` for controls and the file
layout.

## Session continuity (`.claude/context.md` and `.claude/current.md`)

- `.claude/context.md` is the stable project overview (architecture, what's
  built, decisions already made).
- `.claude/current.md` holds the maintainer's **plan**: the active task
  checklist plus the roadmap. It's maintainer-authored — when they describe a
  plan or reprioritize, write it down; don't add tasks on your own initiative.
- Don't rewrite `current.md` at the start of every task — it persists across
  tasks/sessions untouched by default. It only changes when:
  - The maintainer communicates a new or updated plan — write it down.
  - A task gets finished — check the plan for a matching item and remove it
    (or tick it under "Done" in context.md if it's a milestone). If the
    finished task isn't on the plan, leave the file alone.
- If the maintainer asks you to "consult the plan," read `current.md` to see
  what's left and use it to decide what's next.
- Keep entries as a short checklist (one line per task), not a narrative —
  commit history and PR descriptions capture "what happened".
- Update `context.md` (separately) when a task changed architecture, added a
  major feature, or made a decision worth not relitigating.
- Keep `context.md` high-level: architecture, decisions, concrete facts.
  Operational gotchas — what breaks, how it bit us, how to debug it — belong
  in this file instead. Don't restate each other's facts; reference them.
- Keep both files to the "what future tasks actually need" bar.

## Workflow conventions

- Develop on the branch the session assigns; push there, never elsewhere.
- After pushing commits to a feature branch, open a PR against `main` — don't
  wait to be asked. The maintainer merges from the PR link.
- Feature branches get reused across tasks. If the branch's previous PR has
  already merged, rebuild it from `origin/main` before adding new commits
  (`git checkout -B <branch> origin/main`), rather than stacking on merged
  history.
- Before pushing: `npm test` and `npm run build` (typecheck) must pass.

## Gotchas

- **Determinism.** `src/sim.ts` and `src/ai.ts` must stay deterministic: no
  `Math.random`, no wall-clock reads. Use the seeded RNG (`rng.ts`). This keeps
  tests, replays and future rollback netcode possible. Rendering, camera and
  input may use whatever they like; they never mutate the sim.
- **Fixed timestep.** Gameplay changes go through `step()`, not the render loop.
- **Tuning values.** Feel constants live in `TUNING` (`sim-constants.ts`). A
  new `TUNING` key must also be added to `tuning-meta.ts`; `tuning.test.ts`
  fails otherwise. Prefer a new tunable to a magic number in the sim.
- **Tests.** Sim behavior is tested in `sim.test.ts` against the sim directly
  (no DOM, no canvas). Add a test with each rule/mechanic change.
- **Rink orientation.** The long axis is y (goals top and bottom); the oblique
  view (`VIEW.tilt`) is presentation only.
- **Static scene baking.** `render.ts` bakes crowd/ice/markings/boards into
  offscreen images on load/resize; new static art goes there, not in the
  per-frame draw.
- **Gamepads.** Browsers report a pad only after a button press on it.

## Deploy

Cloud Build (`cloudbuild.yaml`) builds the Dockerfile (Vite build served by
nginx on `$PORT`) and deploys the `hockey` Cloud Run service. The image goes to
the shared `foodie-503510` project's Artifact Registry.
