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
  Players are procedural placeholder sprites (puppet rig baked to 8 facings, `sprite-*.ts`; two-handed stick grip, IK arms and legs, styled after the reference action-frames image); real art
  replaces `getSprite` and keeps the frame set in `sprite-poses.ts`.
- Art, sound and online play come last.

## Built so far

- Rink, boards/glass, oblique camera following the puck, off-screen arrows.
- Skater with momentum; puck pickup/carry; pass, aim-assisted shot (tap =
  wrist, hold = slapshot); burst and bodycheck.
- Nets, goals, physical goalies (reaction delay, butterfly dive), scoreboard,
  game flow (faceoff -> play -> goal -> faceoff, 3x2:00 periods, sudden-death
  overtime, final).
- Faceoffs are a timing minigame (`faceoff.ts`, `Game.faceoff`): count-in, random ref hold, drop; pass in the window after the drop wins (early = forfeit),
  stick direction aims the puck, win quality falls with lateness. Pass is the faceoff button, so it doesn't switch players during the draw. HUD indicator is top right.
- Goalie holds: a puck reaching the goalie sticks with a chance that falls with its speed (`goalieCatch*`); the goalie is then steerable
  (human: pass / clear / freeze; AI: pass or freeze after a moment). A freeze or a hold past `goalieHoldMax` whistles an end-zone faceoff.
- One-timers: a shoot press while a teammate's pass is in flight (`Puck.passTo`) arms `Skater.oneTimer` on the receiver, who shoots on pickup (`actions.ts`); AI carriers feed an open slot teammate (`slotPass`, `inSlot`) and AI receivers in the slot get it armed automatically.
- Skater AI: 5v5 teams, roles (C/L/R/LD/RD), carrier decisions, switching.
- AI strategies, first slice: per-team breakout plans (`World.breakout`: carry / boards / swing /
  stretch) that change support anchors and the carrier's designated outlet pass while it is deep in
  its own end. Plans are switches inside `ai.ts`; every new game defaults both teams to swing / press / cycle (`main.ts`); B / N override. The AI does not choose plans itself yet.
  Swing is a real loop: the centre skates down to the far side of its own goal line (`aiSwingLow`), then up that wing
  (`AiState.swung`), and the carrier only passes to him once he's coming back up.
  Offensive-zone plans too (`World.offence`: set / shoot / cycle / overload; O / L override): they move the
  support anchors once the carrier is past the blue line and bias the carrier's shot range and chance.
- Neutral-zone defence plans per team (`World.neutral`: man / trap / press), active while the puck is out
  of the defending team's end; inside it the team collapses toward the slot, never into the crease.
  The loose puck moves in substeps (`puckMaxStep`) so hard shots can't tunnel through the net or goalie.
  Contact strips the puck only with probability `knockChance` once past the speed threshold.
  Skaters are ~27% smaller in radius than the original (`skaterRadius` 2.5 -> 1.82); sprites draw at `VIEW.skaterScale` 0.8.
- Off-puck skaters react to other players, not just the puck (`reactToPlayers` in `ai.ts`, layered over every
  role anchor): spread from teammates (`aiSpacing`), defence/centre/zone walls shade goal side of the most
  dangerous nearby opponent (`aiCover*`), support skaters step off opponents to get open (`aiOpen*`), and a
  slow idle drift (`aiWeave*`, `AiState.weave`) keeps them moving. Breakout loops and the shoot / overload
  net-crowding plans are exempt on purpose.
- Pause menu has per-team strategy dropdowns (`strategy-menu.ts`); defaults are swing breakout, press neutral zone, cycle offence.
- Live tuning panel (`T`) with copy-out of changed values.
- Player sprites: skater (idle, skate, burst, faceoff, wind, wrist, slap, pass, poke, check, hit, celebrate; with-puck variants) and goalie
  (stand, drop, slide, butterfly, getup), driven by sim state; sprite lab page (`sprites.html`) to review the frames.
- Pause screen, fullscreen, AI-vs-AI demo (`D`).
