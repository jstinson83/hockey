/** Rink size in world units (feet-ish). */
export const RINK = { w: 200, h: 85, corner: 28 };

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
