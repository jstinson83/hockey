import { isTextEntry, P1_KEYS, readIntent } from './input';
import { createCamera, updateCamera } from './camera';
import { drawPause, render, setupCanvas } from './render';
import { BREAKOUTS, createWorld, step, TUNING } from './sim';
import { initTuningPanel } from './tuning-panel';

const DT = 1 / 60; // fixed simulation timestep
const MAX_FRAME = 0.25; // avoid spiral of death after tab switches
const OPTIONS_BUTTON = 9; // Options / Start in the standard gamepad mapping

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = setupCanvas(canvas);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
// Random seed (shot spread differs each game) and a random breakout plan per team, for trying them out.
const newWorld = () => createWorld((Math.random() * 2 ** 31) | 0, { breakout: [pick(BREAKOUTS), pick(BREAKOUTS)] });
let world = newWorld();
let camera = createCamera(world);
const tuning = initTuningPanel(document.getElementById('tuning')!);
let paused = false;
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
