import type { AiState, Breakout, Neutral, Offence, Role } from './ai';
import type { Team } from './sim-constants';

/** What a skater last did, so the renderer can play the matching one-shot animation. */
export type Act = 'none' | 'wrist' | 'slap' | 'pass' | 'check';

export interface Skater {
  x: number; y: number;
  vx: number; vy: number;
  facing: number;      // radians
  team: Team;
  role: Role;
  ai: AiState;         // memory for when the AI is driving this skater
  charge: number;      // seconds the action button has been held with the puck
  actionHeld: boolean; // previous frame's shoot-button state, for press/release detection
  passHeld: boolean;
  pressedWithoutPuck: boolean; // this press began without the puck, so it is a burst, not a shot
  oneTimer: number;    // s left in which a pass reaching this skater is shot first time (armed by a shoot press in advance)
  lockout: number;     // s before this skater can pick up the puck
  boost: number;       // extra top speed from burst taps; decays
  checking: number;    // s left in the check window opened by a tap
  poking: number;      // s left of the poke animation (presentation only)
  pokeCd: number;      // s before another poke is allowed
  pokeHeld: boolean;   // previous frame's poke-button state, for press detection
  stun: number;        // s left of reduced control after being checked
  act: Act;            // last discrete action, for animation (presentation only)
  actT: number;        // s since `act` began
  color: string;
}

export interface Goalie {
  team: Team;
  x: number; y: number;
  vx: number; vy: number;
  watchX: number; watchY: number; // reaction-delayed view of the puck
  threat: number;   // s the puck has been on target
  down: number;     // s left in the butterfly (0 = standing)
  diveLeft: number; // s left of the sideways slide
  diveX: number;
  holding: boolean; // has the puck in its glove (controllable; the puck is pinned in front of it)
  holdT: number;    // s the puck has been held
  holdFor: number;  // s the AI waits before passing or freezing
  cool: number;     // s after letting go before it can catch again
  passHeld: boolean; // previous frame's buttons while holding, for press detection
  actionHeld: boolean;
  pokeHeld: boolean;
}

export interface Puck {
  x: number; y: number;
  vx: number; vy: number;
  carrier: number; // index into skaters, or -1 when loose
  passTeam: -1 | 0 | 1; // team that just passed it, or -1; opponents have a shorter reach while passTime runs
  passTime: number;     // s of pass protection left
  passTo: number;       // skater a pass in flight was aimed at, or -1
  z: number;            // height above the ice; an airborne puck can't be picked up or frozen
  vz: number;           // vertical speed
}

export type Phase = 'faceoff' | 'play' | 'goal' | 'intermission' | 'end';

/** The draw at a faceoff: a count-in, the ref's drop, and a short window to time the pass button. */
export interface Faceoff {
  t: number;                               // s since the faceoff began
  dropAt: number;                          // s when the puck is dropped
  pressAt: [number | null, number | null]; // s each side's valid press (after the drop), if any
  early: [boolean, boolean];               // jumped the drop: forfeits the draw
  dir: [{ x: number; y: number }, { x: number; y: number }]; // stick direction held at the press
  held: [boolean, boolean];                // previous frame's pass button, for press detection
  aiAt: [number, number];                  // s after the drop an AI side reacts
  result: { winner: Team | null; clean: boolean } | null; // set when the puck is dropped
  since: number;                           // s since `result` was set (for the on-screen verdict)
}

export interface Game {
  phase: Phase;
  timer: number;      // s left in a goal pause or period intermission
  faceoff: Faceoff;   // the current (or last) draw
  period: number;     // 1-based; the overtime period is periods + 1
  overtime: boolean;
  clock: number;      // s left in the period
  score: [number, number];
  lastScorer: Team | null;
  froze: Team | null; // team whose goalie froze the puck to cause the current faceoff
}

export interface World {
  skaters: Skater[];
  goalies: Goalie[]; // indexed by team
  puck: Puck;
  game: Game;
  rng: number; // PRNG state; shot spread and AI decisions draw from it, keeping the sim deterministic per seed
  humans: [boolean, boolean]; // does a person drive each team's controlled skater? (false = AI plays that team)
  controlled: [number, number]; // skater index each team's human controls; changes only when they switch
  switchHeld: [boolean, boolean]; // previous frame's pass button per team, for press detection
  switchRank: [number, number];   // rank (by distance to the puck) the last switch chose
  switchSince: [number, number];  // s since each team's last switch
  neutral: [Neutral, Neutral];    // each team's plan for defending the neutral zone (AI skaters only)
  offence: [Offence, Offence];    // each team's plan for working the puck in the offensive zone (AI skaters only)
  breakout: [Breakout, Breakout]; // each team's plan for getting out of its own end (AI skaters only)
}
