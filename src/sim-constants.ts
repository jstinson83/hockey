/** Rink size in world units (feet-ish). Long axis is y: goals at the top and bottom, like NHL 94. */
export const RINK = { w: 85, h: 200, corner: 28 };

/** Goal geometry. Nets sit behind the goal line, centred on the rink. Oversized vs. the real thing on purpose. */
export const GOAL = { line: 12, width: 14, depth: 5, height: 4, crease: 12 };

export type Team = 0 | 1;

/** Game flow. Team 0 (red, P1) defends the bottom net and attacks the top; team 1 (blue) the reverse. */
export const GAME = { skatersPerTeam: 5, periods: 3, periodSeconds: 120, overtimeSeconds: 120, goalSeconds: 2.5, intermissionSeconds: 12 };
export const TEAM_COLORS = ['#d33', '#36c'] as const;
export const TEAM_NAMES = ['RED', 'BLUE'] as const;

/** Faceoff spots sit this far either side of the centre line. */
export const FACEOFF = { dx: 22, radius: 14, endZoneFromGoalLine: 19, neutralFromBlueLine: 5, blueLine: 28 };

/** Everything feel-related. A future dev panel will edit this object live. */
export const TUNING = {
  // Skaters
  accel: 90,          // units/s^2 while pushing a direction
  maxSpeed: 38,       // units/s
  friction: 0.6,      // fraction of velocity kept after 1s of coasting
  skaterRadius: 2.1375, // 10% under the previous 2.375 (5% under the original 2.5)
  skaterBounce: 0.5,  // restitution between skaters
  wallBounce: 0.1,    // skaters mostly stop on the boards

  // Puck
  puckRadius: 1,
  puckFriction: 0.85, // fraction of speed kept after 1s sliding
  puckBounce: 0.75,   // restitution off the boards
  carryOffset: 3.4,   // puck distance from skater centre while carried
  pickupSpeed: 70,    // free puck faster than this can't be picked up
  pickupRadius: 4.2,  // skater centre -> puck centre
  passProtectTime: 1.0, // s after a pass during which opponents have a shorter reach on the puck
  passInterceptReach: 0.55, // opponents' pickup reach on a pass in flight, as a fraction of pickupRadius
  oneTimerWindow: 1.2, // s after pressing shoot in advance during which the receiver shoots the pass first time
  oneTimerCharge: 0.7, // charge fraction a one-timer is struck with (0 = wrist, 1 = full slapshot)
  oneTimerSpread: 0.05, // extra rad of random error on a one-timer
  shooterLockout: 0.35, // s before the shooter can re-collect their own shot

  // Burst: tapping the shoot button without the puck. Each tap kicks the skater forward
  // and raises their top speed (up to boostMax over maxSpeed), which then decays.
  boostPerTap: 5,
  boostMax: 14,
  boostImpulse: 8,
  boostDecay: 7,       // units/s of top speed lost per second

  // Shooting: tap = wrist shot, hold to charge toward slapshot
  wristSpeed: 70,
  slapSpeed: 130,
  chargeTime: 0.6,    // s of holding for a full slapshot
  aimAssistCone: 1.4, // rad (~80deg): shots within this of the net get pulled toward it
  aimAssist: 1.0,     // how far toward the (post-clamped) net a shot is pulled, 0..1
  aimCloseRange: 40,  // inside this distance (in front of the net) shots go at the net whichever way you face
  aimNear: 30,        // shot distance (to the net) up to which accuracy is full
  aimFar: 110,        // distance at which aim assist and spread reach their worst
  aimFarAssist: 0.35, // aim assist pull left at aimFar (fraction of aimAssist)
  farSpreadMult: 4,   // spread multiplier at aimFar
  aimInset: 1.5,      // assisted shots aim this far inside the posts
  wristSpread: 0.02,   // rad of random error per shot
  slapSpread: 0.04,   // slapshots are faster but sloppier

  // Passing
  passSpeed: 55,
  passCone: 0.6,      // rad: a teammate this close to where you face is the target
  passLead: 0.25,     // s of teammate velocity to lead

  // Faceoffs: count-in, then the ref holds the puck a random moment and drops it; pass in the window after the drop wins the draw
  faceoffCount: 2.6,     // s of count-in before the ref's hold
  faceoffTick: 1.3,      // s each number of the count-in stays up
  faceoffHoldMin: 0.3,   // s the ref holds the puck after the count, at least
  faceoffHoldMax: 0.9,   // ... and at most (random, so the drop can't be counted)
  faceoffWindow: 0.47,   // s after the drop in which a press wins; before the drop it's a false start
  faceoffAiMin: 0.12,    // s after the drop the AI reacts, at the quickest
  faceoffAiMax: 0.3,     // ... and the slowest
  faceoffCleanBest: 0.95, // chance the winner gets the puck where they aimed it, pressing right on the drop
  faceoffCleanWorst: 0.5, // ... pressing at the end of the window
  faceoffSpeed: 30,      // speed the puck is pushed out at
  faceoffMissAngle: 1.2, // rad: how far a sloppy win is off line (up to)
  faceoffMissSpeed: 0.6, // fraction of speed on a sloppy win or a scramble

  // Nets and goalies
  postRadius: 0.6,      // net frame thickness (puck and skaters collide with it)
  netBounce: 0.3,       // puck restitution off the net frame
  maxPuckSpeed: 160,
  puckMaxStep: 0.6,     // longest distance the loose puck moves between collision checks (keeps it from tunnelling)
  goalieRadius: 2.4,
  goalieDownRadius: 3.2, // butterfly: wider, can't move sideways
  goalieSpeed: 28,
  goalieReaction: 0.13,  // s: lag in tracking the puck, and delay before committing to a dive
  goalieDiveTrigger: 45, // puck speed that counts as a shot
  goalieDiveRange: 30,  // only dives to shots this close to the goal line
  goalieDiveSpeed: 32,
  goalieDiveTime: 0.3,  // s of sideways slide
  goalieDownTime: 0.75, // s spent down before recovering
  goalieBounce: 0.35,   // restitution off the goalie (rebounds)
  goalieCatchSlow: 0.95, // chance to freeze a puck at goalieCatchLow speed or slower
  goalieCatchFast: 0.25, // chance to freeze a puck at goalieCatchHigh speed or faster
  goalieCatchLow: 25,   // puck speed (units/s) at or below which the slow chance applies
  goalieCatchHigh: 130, // puck speed at or above which the fast chance applies (a full slapshot)
  goalieHoldSpeed: 12,  // walking speed while holding the puck
  goalieHoldMax: 3,     // s a human goalie can hold before the whistle goes on its own
  goalieHoldMin: 0.6,   // s the AI goalie holds at least before passing or freezing
  goalieHoldAi: 1.0,    // extra s (random) the AI goalie holds
  goalieAiFreeze: 0.35, // chance the AI goalie freezes the puck rather than passing when it has an outlet
  goalieClearSpeed: 80, // speed of a goalie's hard clear
  goalieRecatch: 0.6,   // s after letting go before the goalie can catch again

  // Switching players (the pass button without the puck)
  switchChain: 0.7,     // s: presses closer together than this keep cycling down the list

  // AI (skaters the human isn't controlling)
  aiSpeed: 0.92,        // fraction of maxSpeed the AI steers for
  aiArrive: 3.0,        // slows to a stop within maxSpeed*aiSpeed/aiArrive units of its target
  aiShootRange: 52,     // carrier considers shooting inside this distance to the net
  aiShootChance: 0.45,  // per decision (a few per second) once in range with a lane
  aiSlotRange: 38,      // a teammate this close to the net, in front of it, is in the slot
  aiSlotWidth: 22,      // ...and within this of the net's centre line
  aiSlotOpen: 9,        // an opponent this close takes the slot teammate off for a one-timer
  aiSlotPassChance: 0.85, // per decision, chance to feed an open slot teammate
  aiOneTimerChance: 0.85, // chance an AI receiver in the slot shoots a pass first time
  aiAimMistake: 0.3,    // chance a shot is aimed at the goalie's side instead of away from it
  aiLaneRadius: 3,      // an opponent this close to a shot/pass line blocks it
  aiPassCooldown: 0.9,  // s between passes
  aiPressure: 9,        // an opponent this close means the carrier is under pressure
  aiBreakoutDepth: 40,  // a carrier this far inside its own half (from centre ice) is breaking out
  aiSwingLow: 8,        // the swing breakout's centre loops this far up-ice of his own goal line
  aiDefenceGap: 0.55,   // defence stand this fraction of the way from their net to the puck (14..55 units out)
  aiDefenceChase: 22,   // defence only chase a loose puck / carrier within this distance; otherwise they hold position
  aiPointDepth: 36,     // offensive-zone points stand this far past centre ice (the blue line is 28)
  aiCentreGap: 0.75,    // the centre stands this fraction of the way (20..75 units out)
  aiTrapLine: 8,        // the trap's wall stands this far on our side of centre ice
  aiTrapGap: 28,        // the trap's wall steps up to stay this far in front of a carrier who is deep in their own end
  aiPressGap: 24,       // under the press, defence stand this far behind the puck carrier
  aiSpacing: 16,        // off-puck skaters keep their spot this far from teammates
  aiSpacingPush: 0.8,   // fraction of the overlap they are pushed out of
  aiCoverRange: 30,     // defence / centre shade toward an opponent this close to their spot
  aiCoverShade: 0.5,    // how far toward that opponent (goal side) they move
  aiCoverDefenceDepth: 40, // an opponent is only marked inside this distance of our net; out at the points they are left open
  aiOpenRange: 14,      // with the puck, support skaters move off opponents this close to their spot
  aiOpenPush: 0.6,      // fraction of the overlap they are pushed out of
  aiWeave: 3,           // radius of the idle drift (units)
  aiWeavePeriod: 3.5,   // s per drift loop
  aiBurstCooldown: 0.55,
  aiCheckChance: 0.5,   // per decision, when within reach of the carrier

  // Checking. A tap of the shoot button without the puck opens a check window: a hit
  // inside it knocks the puck loose at a much lower closing speed, shoves the victim and
  // briefly stuns them. Plain contact still knocks the puck loose at checkSpeed.
  checkSpeed: 32,     // closing speed that knocks the puck off a carrier in plain contact
  checkWindow: 0.35,  // s after a tap during which contact counts as a check
  checkMinSpeed: 13,  // closing speed a check needs to land
  knockChance: 0.55,  // chance that a contact hard enough to count actually strips the carrier
  pokeReach: 7.5,     // centre-to-centre distance a poke check reaches (a skater is ~4.3 wide)
  pokeCone: 0.7,      // rad either side of facing the carrier must be within
  pokeChance: 0.6,    // chance a poke that reaches the carrier knocks the puck loose
  pokeCooldown: 0.7,  // s before the next poke, hit or miss
  pokeLunge: 6,       // forward speed added by the stab
  checkBounce: 0.8,
  checkImpulse: 14,   // extra shove on the victim
  checkStun: 0.6,     // s of reduced control
  stunAccel: 0.25,    // fraction of normal acceleration while stunned
};

/** Presentation only: nothing here affects the simulation. */
export const VIEW = {
  width: 720,         // logical canvas units, 3:2 like the Dragonfly's screen; scaled to fit the window
  height: 480,
  pxPerUnit: 7.0,     // horizontal scale; the full rink width (plus boards) stays on screen, with room for stands
  tilt: 0.8,          // vertical foreshortening (1 = straight top-down, lower = flatter / more angled)
  boardThickness: 2.2, // world units, outside the ice
  boardHeight: 17,    // px the dasher boards rise
  glassHeight: 20,    // px of glass above the boards
  arrowMargin: 20,    // px from the screen edge for off-screen skater arrows
  strideUnits: 36,    // world units skated per full left+right stride cycle in the sprites
  bodyHeight: 5,      // how tall skaters stand above their shadow, in world units
  followRate: 5,      // camera catch-up speed (higher = snappier)
  lookahead: 0.35,    // seconds of puck velocity the camera leads by
  endOverscan: 20,    // how far past the end boards the camera may show (the crowd lives there)
  arenaPad: 26,       // world units of arena baked beyond each end (>= endOverscan)
  perspective: 0.0016, // horizontal spread per px of height; shows the inner face of the side walls
};
