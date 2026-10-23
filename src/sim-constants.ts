/** Rink size in world units (feet-ish). Long axis is y: goals at the top and bottom, like NHL 94. */
export const RINK = { w: 85, h: 200, corner: 28 };

/** Goal geometry. Nets sit behind the goal line, centred on the rink. Oversized vs. the real thing on purpose. */
export const GOAL = { line: 12, width: 14, depth: 5, height: 4, crease: 12 };

export type Team = 0 | 1;

/** Game flow. Team 0 (red, P1) defends the bottom net and attacks the top; team 1 (blue) the reverse. */
export const GAME = { skatersPerTeam: 5, periods: 3, periodSeconds: 120, overtimeSeconds: 120, faceoffSeconds: 1.5, goalSeconds: 2.5 };
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

  // Switching players (the pass button without the puck)
  switchChain: 0.7,     // s: presses closer together than this keep cycling down the list

  // AI (skaters the human isn't controlling)
  aiSpeed: 0.92,        // fraction of maxSpeed the AI steers for
  aiArrive: 3.0,        // slows to a stop within maxSpeed*aiSpeed/aiArrive units of its target
  aiShootRange: 52,     // carrier considers shooting inside this distance to the net
  aiShootChance: 0.45,  // per decision (a few per second) once in range with a lane
  aiAimMistake: 0.3,    // chance a shot is aimed at the goalie's side instead of away from it
  aiLaneRadius: 3,      // an opponent this close to a shot/pass line blocks it
  aiPassCooldown: 0.9,  // s between passes
  aiPressure: 9,        // an opponent this close means the carrier is under pressure
  aiBreakoutDepth: 40,  // a carrier this far inside its own half (from centre ice) is breaking out
  aiDefenceGap: 0.55,   // defence stand this fraction of the way from their net to the puck (14..55 units out)
  aiDefenceChase: 22,   // defence only chase a loose puck / carrier within this distance; otherwise they hold position
  aiPointDepth: 36,     // offensive-zone points stand this far past centre ice (the blue line is 28)
  aiCentreGap: 0.75,    // the centre stands this fraction of the way (20..75 units out)
  aiTrapLine: 8,        // the trap's wall stands this far on our side of centre ice
  aiTrapGap: 28,        // the trap's wall steps up to stay this far in front of a carrier who is deep in their own end
  aiPressGap: 24,       // under the press, defence stand this far behind the puck carrier
  aiBurstCooldown: 0.55,
  aiCheckChance: 0.5,   // per decision, when within reach of the carrier

  // Checking. A tap of the shoot button without the puck opens a check window: a hit
  // inside it knocks the puck loose at a much lower closing speed, shoves the victim and
  // briefly stuns them. Plain contact still knocks the puck loose at checkSpeed.
  checkSpeed: 32,     // closing speed that knocks the puck off a carrier in plain contact
  checkWindow: 0.35,  // s after a tap during which contact counts as a check
  checkMinSpeed: 13,  // closing speed a check needs to land
  knockChance: 0.55,  // chance that a contact hard enough to count actually strips the carrier
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
  bodyHeight: 5,      // how tall skaters stand above their shadow, in world units
  followRate: 5,      // camera catch-up speed (higher = snappier)
  lookahead: 0.35,    // seconds of puck velocity the camera leads by
  endOverscan: 20,    // how far past the end boards the camera may show (the crowd lives there)
  arenaPad: 26,       // world units of arena baked beyond each end (>= endOverscan)
  perspective: 0.0016, // horizontal spread per px of height; shows the inner face of the side walls
};
