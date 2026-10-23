import type { AiState, Breakout, Neutral, Offence, Role } from './ai';
import type { Team } from './sim-constants';

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
  lockout: number;     // s before this skater can pick up the puck
  boost: number;       // extra top speed from burst taps; decays
  checking: number;    // s left in the check window opened by a tap
  poking: number;      // s left of the poke animation (presentation only)
  pokeCd: number;      // s before another poke is allowed
  pokeHeld: boolean;   // previous frame's poke-button state, for press detection
  stun: number;        // s left of reduced control after being checked
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
}

export interface Puck {
  x: number; y: number;
  vx: number; vy: number;
  carrier: number; // index into skaters, or -1 when loose
}

export type Phase = 'faceoff' | 'play' | 'goal' | 'end';

export interface Game {
  phase: Phase;
  timer: number;      // s left in a faceoff or goal pause
  period: number;     // 1-based; the overtime period is periods + 1
  overtime: boolean;
  clock: number;      // s left in the period
  score: [number, number];
  lastScorer: Team | null;
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
