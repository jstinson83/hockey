import { P1_KEYS, readIntent } from './input';
import { createCamera, updateCamera } from './camera';
import { drawPause, render, setupCanvas } from './render';
import { createWorld, step } from './sim';

const DT = 1 / 60; // fixed simulation timestep
const MAX_FRAME = 0.25; // avoid spiral of death after tab switches
const OPTIONS_BUTTON = 9; // Options / Start in the standard gamepad mapping

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = setupCanvas(canvas);
const newWorld = () => createWorld((Math.random() * 2 ** 31) | 0); // random seed: shot spread differs each game
let world = newWorld();
let camera = createCamera(world);
let paused = false;
let demo = false; // AI plays both teams; handy for watching without a controller

addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }
  if (e.code === 'KeyP' || (e.code === 'Escape' && !e.repeat)) paused = !paused;
  if (e.code === 'KeyD') demo = !demo;
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

  if (!paused) {
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
    },
  });
}
