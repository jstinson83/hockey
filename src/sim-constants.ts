/** Rink size in world units (feet-ish). Long axis is y: goals at the top and bottom, like NHL 94. */
export const RINK = { w: 85, h: 200, corner: 28 };

/** Goal geometry. Nets sit behind the goal line, centred on the rink. Oversized vs. the real thing on purpose. */
export const GOAL = { line: 12, width: 14, depth: 5, height: 4, crease: 12 };

/** Game flow. Team 0 (red, P1) defends the bottom net and attacks the top; team 1 (blue) the reverse. */
export const GAME = { periods: 3, periodSeconds: 120, overtimeSeconds: 120, faceoffSeconds: 1.5, goalSeconds: 2.5 };
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
  skaterRadius: 2.5,
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
  aimInset: 1.5,      // assisted shots aim this far inside the posts
  wristSpread: 0.035,  // rad of random error per shot
  slapSpread: 0.07,   // slapshots are faster but sloppier

  // Passing
  passSpeed: 55,
  passCone: 0.6,      // rad: a teammate this close to where you face is the target
  passLead: 0.25,     // s of teammate velocity to lead

  // Nets and goalies
  postRadius: 0.6,      // net frame thickness (puck and skaters collide with it)
  netBounce: 0.3,       // puck restitution off the net frame
  maxPuckSpeed: 160,
  goalieRadius: 2.4,
  goalieDownRadius: 3.0, // butterfly: wider, can't move sideways
  goalieSpeed: 28,
  goalieReaction: 0.15,  // s: lag in tracking the puck, and delay before committing to a dive
  goalieDiveTrigger: 45, // puck speed that counts as a shot
  goalieDiveRange: 30,  // only dives to shots this close to the goal line
  goalieDiveSpeed: 30,
  goalieDiveTime: 0.3,  // s of sideways slide
  goalieDownTime: 0.75, // s spent down before recovering
  goalieBounce: 0.35,   // restitution off the goalie (rebounds)

  // Checking. A tap of the shoot button without the puck opens a check window: a hit
  // inside it knocks the puck loose at a much lower closing speed, shoves the victim and
  // briefly stuns them. Plain contact still knocks the puck loose at checkSpeed.
  checkSpeed: 22,     // closing speed that knocks the puck off a carrier in plain contact
  checkWindow: 0.35,  // s after a tap during which contact counts as a check
  checkMinSpeed: 10,  // closing speed a check needs to land
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
