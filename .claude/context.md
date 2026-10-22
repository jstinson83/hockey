# Hockey — Project Context

Stable overview. Update when architecture, infra or major decisions change —
not for day-to-day status (see `current.md`). Operational gotchas live in
`CLAUDE.md`; controls and file layout live in `README.md`. Don't duplicate them.

## What this is

Browser hockey game in the spirit of NHL 94 — classic feel, improved
gameplay. Solo project. Local vs. AI and local 1v1 (two gamepads). TypeScript
+ Vite + Canvas 2D, no physics engine (arcade feel and determinism over
realism), deployed to Cloud Run (nginx serving the Vite build).

## Decisions already made

- Sim is deterministic and fixed-timestep, so online play stays possible later.
- 5v5 (C, L, R, LD, RD; `GAME.skatersPerTeam`); each human controls one skater per team.
- Player switching is manual: the pass button without the puck, or automatic
  when a teammate picks the puck up.
- Visual target is the NHL 94 look (oblique view, crowd, scratched ice).
  Skater sprites are not needed yet.
- Art, sound and online play come last.

## Built so far

- Rink, boards/glass, oblique camera following the puck, off-screen arrows.
- Skater with momentum; puck pickup/carry; pass, aim-assisted shot (tap =
  wrist, hold = slapshot); burst and bodycheck.
- Nets, goals, physical goalies (reaction delay, butterfly dive), scoreboard,
  game flow (faceoff -> play -> goal -> faceoff, 3x2:00 periods, sudden-death
  overtime, final).
- Skater AI: 5v5 teams, roles (C/L/R/LD/RD), carrier decisions, switching.
- AI strategies, first slice: per-team breakout plans (`World.breakout`: carry / boards / swing /
  stretch) that change support anchors and the carrier's designated outlet pass while it is deep in
  its own end. Plans are switches inside `ai.ts`; each new game rolls one per team at random (`main.ts`), B / N override. The AI does not choose plans itself yet.
- Live tuning panel (`T`) with copy-out of changed values.
- Pause screen, fullscreen, AI-vs-AI demo (`D`).
