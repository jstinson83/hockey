import { isTextEntry, P1_KEYS, readIntent } from './input';
import { createCamera, updateCamera } from './camera';
import { drawPause, render, setupCanvas } from './render';
import { BREAKOUTS, createWorld, NEUTRALS, OFFENCES, step, TUNING } from './sim';
import { initStrategyMenu } from './strategy-menu';
import { initTuningPanel } from './tuning-panel';

const DT = 1 / 60; // fixed simulation timestep
const MAX_FRAME = 0.25; // avoid spiral of death after tab switches
const OPTIONS_BUTTON = 9; // Options / Start in the standard gamepad mapping

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = setupCanvas(canvas);
// Random seed (shot spread differs each game); both teams default to a cycling offence, swing breakout and pressing neutral zone (changeable from the pause menu).
const newWorld = () => createWorld((Math.random() * 2 ** 31) | 0, { breakout: ['swing', 'swing'], neutral: ['press', 'press'], offence: ['cycle', 'cycle'] });
let world = newWorld();
let camera = createCamera(world);
const tuning = initTuningPanel(document.getElementById('tuning')!);
const strategies = initStrategyMenu(document.getElementById('strategies')!, () => world);
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

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  pollPauseButton();

  if (!paused && !tuning.pausesGame()) {
    acc += frameDt;
    // Red is always you (keyboard or pad 1); blue is a second human only if pad 2 is connected.
    world.humans[0] = !demo;
    world.humans[1] = !demo && !!navigator.getGamepads()[1];
    while (acc >= DT) {
      step(world, [readIntent(P1_KEYS, 0), readIntent(null, 1)], DT);
      acc -= DT;
    }
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
