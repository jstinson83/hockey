/** Rink size in world units (feet-ish). Long axis is y: goals at the top and bottom, like NHL 94. */
export const RINK = { w: 85, h: 200, corner: 28 };

/** Goal geometry. Nets sit behind the goal line, centred on the rink. Oversized vs. the real thing on purpose. */
export const GOAL = { line: 11, width: 14, depth: 6, height: 4, crease: 9 };

/** Faceoff spots sit this far either side of the centre line. */
export const FACEOFF = { dx: 22, radius: 15, endZoneFromGoalLine: 20, neutralFromBlueLine: 5, blueLine: 25 };

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

  // Shooting: tap = wrist shot, hold to charge toward slapshot
  wristSpeed: 70,
  slapSpeed: 130,
  chargeTime: 0.6,    // s of holding for a full slapshot

  // Checking
  checkSpeed: 22,     // closing speed that knocks the puck off a carrier
};

/** Presentation only: nothing here affects the simulation. */
export const VIEW = {
  width: 720,         // logical canvas units, 3:2 like the Dragonfly's screen; scaled to fit the window
  height: 480,
  pxPerUnit: 7.7,     // horizontal scale; the full rink width (plus boards) stays on screen
  tilt: 0.8,          // vertical foreshortening (1 = straight top-down, lower = flatter / more angled)
  boardThickness: 2.2, // world units, outside the ice
  boardHeight: 14,    // px the dasher boards rise
  glassHeight: 13,    // px of glass above the boards
  arrowMargin: 20,    // px from the screen edge for off-screen skater arrows
  bodyHeight: 5,      // how tall skaters stand above their shadow, in world units
  followRate: 5,      // camera catch-up speed (higher = snappier)
  lookahead: 0.35,    // seconds of puck velocity the camera leads by
  endOverscan: 8,     // how far past the end boards the camera may show
};
