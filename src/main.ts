import { initAmbience } from './audio';
import { isTextEntry, P1_KEYS, readIntent } from './input';
import { createCamera, updateCamera } from './camera';
import { drawPause, render, setupCanvas } from './render';
import { BREAKOUTS, createWorld, NEUTRALS, OFFENCES, step, TUNING } from './sim';
import { initStrategyMenu } from './strategy-menu';
import { initTuningPanel } from './tuning-panel';

const DT = 1 / 60; // fixed simulation timestep
const MAX_FRAME = 0.25; // avoid spiral of death after tab switches
const ORGAN_FACEOFF_CHANCE = 0.5; // share of faceoffs that get the organ riff
const CHEER_HIT_CHANCE = 0.3; // share of checks that draw a cheer
const CHEER_SAVE_CHANCE = 0.5; // share of goalie dives that draw a cheer
const ORGAN_PLAY_GAP: [number, number] = [25, 60]; // s of live play between random organ riffs (min, max)
const OPTIONS_BUTTON = 9; // Options / Start in the standard gamepad mapping

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = setupCanvas(canvas);
// Random seed (shot spread differs each game); both teams default to a cycling offence, swing breakout and pressing neutral zone (changeable from the pause menu).
const newWorld = () => createWorld((Math.random() * 2 ** 31) | 0, { breakout: ['swing', 'swing'], neutral: ['press', 'press'], offence: ['cycle', 'cycle'] });
let world = newWorld();
let camera = createCamera(world);
const tuning = initTuningPanel(document.getElementById('tuning')!);
const strategies = initStrategyMenu(document.getElementById('strategies')!, () => world);
const ambience = initAmbience();
let paused = false;
let menuShown = false;
let demo = false; // AI plays both teams; handy for watching without a controller

addEventListener('keydown', (e) => {
  if (isTextEntry(e.target)) return;
  if (e.code === 'KeyT') tuning.toggle();
  if (e.code === 'KeyF') {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }
  if (e.code === 'KeyP' || (e.code === 'Escape' && !e.repeat)) paused = !paused;
  if (e.code === 'KeyD') demo = !demo;
  if (e.code === 'KeyS' && !e.repeat) ambience.toggleMute();
  // B / N cycle red's / blue's breakout plan (a reset rerolls them).
  if (e.code === 'KeyB' || e.code === 'KeyN') {
    const team = e.code === 'KeyB' ? 0 : 1;
    world.breakout[team] = BREAKOUTS[(BREAKOUTS.indexOf(world.breakout[team]) + 1) % BREAKOUTS.length];
  }
  // V / M do the same for the neutral-zone plans.
  if (e.code === 'KeyV' || e.code === 'KeyM') {
    const team = e.code === 'KeyV' ? 0 : 1;
    world.neutral[team] = NEUTRALS[(NEUTRALS.indexOf(world.neutral[team]) + 1) % NEUTRALS.length];
  }
  // O / L do the same for the offensive-zone plans.
  if (e.code === 'KeyO' || e.code === 'KeyL') {
    const team = e.code === 'KeyO' ? 0 : 1;
    world.offence[team] = OFFENCES[(OFFENCES.indexOf(world.offence[team]) + 1) % OFFENCES.length];
  }
  if (e.code === 'KeyR') {
    world = newWorld();
    camera = createCamera(world);
    paused = false;
  }
});

// Don't let the clock run while the player is elsewhere.
addEventListener('blur', () => { paused = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden) paused = true; });

let optionsWasDown = false;
function pollPauseButton(): void {
  const down = navigator.getGamepads().some((pad) => !!pad?.buttons[OPTIONS_BUTTON]?.pressed);
  if (down && !optionsWasDown) paused = !paused;
  optionsWasDown = down;
}

let lastPhase = world.game.phase;
let lastPeriod = world.game.period;
let lastRedScore = world.game.score[0];
let lastScoreTotal = world.game.score[0] + world.game.score[1];
let lastStun = world.skaters.map((s) => s.stun);
let lastDown = world.goalies.map((g) => g.down);
const nextOrganGap = () => ORGAN_PLAY_GAP[0] + Math.random() * (ORGAN_PLAY_GAP[1] - ORGAN_PLAY_GAP[0]);
let organCountdown = nextOrganGap(); // s of live play until the next random riff
let organRecent = false; // the goal riff already played; skip the faceoff roll that follows it
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  pollPauseButton();
  ambience.setActive(!paused);

  if (!paused && !tuning.pausesGame()) {
    acc += frameDt;
    // Red is always you (keyboard or pad 1); blue is a second human only if pad 2 is connected.
    world.humans[0] = !demo;
    world.humans[1] = !demo && !!navigator.getGamepads()[1];
    while (acc >= DT) {
      step(world, [readIntent(P1_KEYS, 0), readIntent(null, 1)], DT);
      acc -= DT;
    }
    // A stoppage caused by a goalie freezing the puck gets the whistle.
    if (world.game.phase === 'faceoff' && lastPhase === 'play' && world.game.froze !== null) ambience.whistle();
    // Horn when a period runs out (the clock hitting zero advances the period or ends the game).
    const g = world.game;
    if (g.period !== lastPeriod || (g.phase === 'end' && lastPhase !== 'end' && g.clock === 0)) ambience.horn();
    // The organ plays for red (the home side) scoring, and on half of the faceoffs (render-side randomness, never the sim's).
    const redScored = g.score[0] > lastRedScore;
    if (redScored || (g.phase === 'faceoff' && lastPhase !== 'faceoff' && !organRecent && Math.random() < ORGAN_FACEOFF_CHANCE)) ambience.organ();
    if (g.phase === 'faceoff' && lastPhase !== 'faceoff') organRecent = false;
    else if (redScored) organRecent = true;
    // The crowd roars for every goal, and now and then for a hit (a skater newly stunned) or a goalie's diving save.
    const scored = g.score[0] + g.score[1] > lastScoreTotal;
    const hit = world.skaters.some((s, i) => s.stun > 0 && lastStun[i] <= 0);
    const dive = world.goalies.some((gl, i) => gl.down > 0 && lastDown[i] <= 0);
    if (scored || (hit && Math.random() < CHEER_HIT_CHANCE) || (dive && Math.random() < CHEER_SAVE_CHANCE)) ambience.cheer();
    lastScoreTotal = g.score[0] + g.score[1];
    lastStun = world.skaters.map((s) => s.stun);
    lastDown = world.goalies.map((gl) => gl.down);
    // And every so often while the puck is live.
    if (g.phase === 'play' && (organCountdown -= frameDt) <= 0) {
      ambience.organ();
      organCountdown = nextOrganGap();
    }
    lastRedScore = g.score[0];
    lastPhase = g.phase;
    lastPeriod = g.period;
    updateCamera(camera, world, frameDt);
  }

  render(ctx, world, camera);
  if (paused) drawPause(ctx);
  if (paused !== menuShown) { menuShown = paused; strategies.show(paused); }
  else if (paused) strategies.sync(); // a key may have cycled a plan
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Dev-only handle so headless checks can pose the world.
if (import.meta.env.DEV) {
  Object.assign(window, {
    hockey: {
      get world() { return world; },
      get camera() { return camera; },
      get paused() { return paused; },
      tuning: TUNING,
    },
  });
}
