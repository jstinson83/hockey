/** Slider ranges and labels for the live tuning panel. Every key of TUNING must appear exactly once (a test enforces it). */
export interface Param {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  hint?: string;
}

export interface Group {
  title: string;
  params: Param[];
}

export const TUNING_GROUPS: Group[] = [
  {
    title: 'Skating',
    params: [
      { key: 'accel', label: 'Acceleration', min: 30, max: 200, step: 1, hint: 'units/s² while pushing' },
      { key: 'maxSpeed', label: 'Top speed', min: 15, max: 70, step: 0.5, hint: 'units/s' },
      { key: 'friction', label: 'Coast: speed kept /s', min: 0.2, max: 1, step: 0.01, hint: 'lower = more drag' },
      { key: 'skaterRadius', label: 'Skater size', min: 1.5, max: 4, step: 0.025 },
      { key: 'skaterBounce', label: 'Skater-skater bounce', min: 0, max: 1, step: 0.05 },
      { key: 'wallBounce', label: 'Skater-boards bounce', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    title: 'Burst (tap shoot, no puck)',
    params: [
      { key: 'boostPerTap', label: 'Top speed per tap', min: 0, max: 15, step: 0.5 },
      { key: 'boostMax', label: 'Max extra top speed', min: 0, max: 40, step: 1 },
      { key: 'boostImpulse', label: 'Kick per tap', min: 0, max: 25, step: 0.5 },
      { key: 'boostDecay', label: 'Boost decay /s', min: 1, max: 30, step: 0.5 },
    ],
  },
  {
    title: 'Puck',
    params: [
      { key: 'puckRadius', label: 'Puck size', min: 0.5, max: 2, step: 0.1 },
      { key: 'puckFriction', label: 'Slide: speed kept /s', min: 0.3, max: 1, step: 0.01 },
      { key: 'puckBounce', label: 'Boards bounce', min: 0, max: 1, step: 0.05 },
      { key: 'carryOffset', label: 'Carry distance', min: 2, max: 6, step: 0.1 },
      { key: 'pickupSpeed', label: 'Max pickup speed', min: 20, max: 150, step: 1 },
      { key: 'pickupRadius', label: 'Pickup reach', min: 2, max: 8, step: 0.1 },
      { key: 'shooterLockout', label: 'Shooter lockout (s)', min: 0, max: 1, step: 0.05 },
      { key: 'maxPuckSpeed', label: 'Puck speed cap', min: 80, max: 300, step: 5 },
      { key: 'puckMaxStep', label: 'Puck collision step', min: 0.2, max: 2, step: 0.1 },
    ],
  },
  {
    title: 'Shooting',
    params: [
      { key: 'wristSpeed', label: 'Wrist shot speed', min: 30, max: 120, step: 1 },
      { key: 'slapSpeed', label: 'Slapshot speed', min: 60, max: 200, step: 1 },
      { key: 'chargeTime', label: 'Slapshot charge (s)', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'aimAssistCone', label: 'Aim assist cone (rad)', min: 0, max: 2.5, step: 0.05 },
      { key: 'aimAssist', label: 'Aim assist pull', min: 0, max: 1, step: 0.05 },
      { key: 'aimNear', label: 'Full accuracy within', min: 0, max: 100, step: 1 },
      { key: 'aimFar', label: 'Worst accuracy at', min: 20, max: 200, step: 1 },
      { key: 'aimFarAssist', label: 'Aim assist at far range', min: 0, max: 1, step: 0.05 },
      { key: 'farSpreadMult', label: 'Far spread multiplier', min: 1, max: 10, step: 0.25 },
      { key: 'aimInset', label: 'Aim inside posts', min: 0, max: 6, step: 0.1 },
      { key: 'wristSpread', label: 'Wrist spread (rad)', min: 0, max: 0.2, step: 0.005 },
      { key: 'slapSpread', label: 'Slap spread (rad)', min: 0, max: 0.3, step: 0.005 },
    ],
  },
  {
    title: 'Passing & switching',
    params: [
      { key: 'passSpeed', label: 'Pass speed', min: 20, max: 100, step: 1 },
      { key: 'passCone', label: 'Pass target cone (rad)', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'passLead', label: 'Pass lead (s)', min: 0, max: 1, step: 0.05 },
      { key: 'switchChain', label: 'Switch cycle window (s)', min: 0.2, max: 2, step: 0.05 },
    ],
  },
  {
    title: 'Goalie & nets',
    params: [
      { key: 'goalieRadius', label: 'Goalie size', min: 1.5, max: 4, step: 0.1 },
      { key: 'goalieDownRadius', label: 'Goalie size (down)', min: 2, max: 6, step: 0.1 },
      { key: 'goalieSpeed', label: 'Goalie speed', min: 10, max: 60, step: 1 },
      { key: 'goalieReaction', label: 'Goalie reaction (s)', min: 0.02, max: 0.5, step: 0.01 },
      { key: 'goalieDiveTrigger', label: 'Shot speed to dive', min: 20, max: 100, step: 1 },
      { key: 'goalieDiveRange', label: 'Dive range', min: 10, max: 60, step: 1 },
      { key: 'goalieDiveSpeed', label: 'Dive speed', min: 10, max: 90, step: 1 },
      { key: 'goalieDiveTime', label: 'Dive time (s)', min: 0.1, max: 0.8, step: 0.05 },
      { key: 'goalieDownTime', label: 'Time down (s)', min: 0.2, max: 1.5, step: 0.05 },
      { key: 'goalieBounce', label: 'Rebound bounce', min: 0, max: 1, step: 0.05 },
      { key: 'postRadius', label: 'Net frame thickness', min: 0.2, max: 2, step: 0.1 },
      { key: 'netBounce', label: 'Net frame bounce', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    title: 'Checking',
    params: [
      { key: 'checkSpeed', label: 'Plain-contact knock-off speed', min: 5, max: 60, step: 1 },
      { key: 'checkWindow', label: 'Check window (s)', min: 0.1, max: 1, step: 0.05 },
      { key: 'pokeReach', label: 'Poke reach', min: 3, max: 15, step: 0.5 },
      { key: 'pokeCone', label: 'Poke cone (rad)', min: 0.1, max: 1.5, step: 0.05 },
      { key: 'pokeChance', label: 'Poke strips puck chance', min: 0, max: 1, step: 0.05 },
      { key: 'pokeCooldown', label: 'Poke cooldown (s)', min: 0.1, max: 2, step: 0.05 },
      { key: 'pokeLunge', label: 'Poke lunge', min: 0, max: 20, step: 0.5 },
      { key: 'knockChance', label: 'Chance a hit strips the puck', min: 0, max: 1, step: 0.05 },
      { key: 'checkMinSpeed', label: 'Check min speed', min: 2, max: 40, step: 1 },
      { key: 'checkBounce', label: 'Check bounce', min: 0, max: 1, step: 0.05 },
      { key: 'checkImpulse', label: 'Check shove', min: 0, max: 40, step: 1 },
      { key: 'checkStun', label: 'Stun (s)', min: 0, max: 2, step: 0.05 },
      { key: 'stunAccel', label: 'Accel while stunned', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    title: 'AI',
    params: [
      { key: 'aiSpeed', label: 'AI speed (× top speed)', min: 0.5, max: 1.2, step: 0.01 },
      { key: 'aiArrive', label: 'AI braking', min: 1, max: 8, step: 0.1 },
      { key: 'aiShootRange', label: 'Shoot range', min: 20, max: 100, step: 1 },
      { key: 'aiShootChance', label: 'Shoot chance', min: 0, max: 1, step: 0.05 },
      { key: 'aiAimMistake', label: 'Aim mistake chance', min: 0, max: 1, step: 0.05 },
      { key: 'aiLaneRadius', label: 'Lane blocked within', min: 1, max: 8, step: 0.5 },
      { key: 'aiPassCooldown', label: 'Pass cooldown (s)', min: 0.2, max: 3, step: 0.1 },
      { key: 'aiPressure', label: 'Pressure distance', min: 3, max: 20, step: 1 },
      { key: 'aiBreakoutDepth', label: 'Breakout zone depth', min: 10, max: 90, step: 1, hint: 'units inside own half' },
      { key: 'aiDefenceGap', label: 'Defence gap', min: 0.2, max: 1, step: 0.05, hint: 'fraction of net-to-puck distance' },
      { key: 'aiDefenceChase', label: 'Defence chase range', min: 0, max: 80, step: 1, hint: 'beyond this they hold position' },
      { key: 'aiPointDepth', label: 'Point depth (O-zone)', min: 28, max: 70, step: 1, hint: 'units past centre; blue line is 28' },
      { key: 'aiCentreGap', label: 'Centre gap', min: 0.2, max: 1, step: 0.05, hint: 'fraction of net-to-puck distance' },
      { key: 'aiTrapLine', label: 'Trap line depth', min: 0, max: 24, step: 1, hint: 'units on our side of centre' },
      { key: 'aiTrapGap', label: 'Trap: step-up gap', min: 8, max: 60, step: 1, hint: 'wall stays this far ahead of a carrier deep in their end' },
      { key: 'aiPressGap', label: 'Press: defence gap', min: 8, max: 45, step: 1, hint: 'units behind the carrier' },
      { key: 'aiBurstCooldown', label: 'Burst cooldown (s)', min: 0.2, max: 2, step: 0.05 },
      { key: 'aiCheckChance', label: 'Check chance', min: 0, max: 1, step: 0.05 },
    ],
  },
];
