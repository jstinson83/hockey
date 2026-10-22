import { P1_KEYS, readIntent } from './input';
import { createCamera, updateCamera } from './camera';
import { render, setupCanvas } from './render';
import { createWorld, step } from './sim';

const DT = 1 / 60; // fixed simulation timestep
const MAX_FRAME = 0.25; // avoid spiral of death after tab switches

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = setupCanvas(canvas);
const newWorld = () => createWorld((Math.random() * 2 ** 31) | 0); // random seed: shot spread differs each game
let world = newWorld();
let camera = createCamera(world);
addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }
  if (e.code === 'KeyR') {
    world = newWorld();
    camera = createCamera(world);
  }
});

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
  acc += frameDt;
  last = now;

  while (acc >= DT) {
    step(world, [readIntent(P1_KEYS, 0), readIntent(null, 1)], DT);
    acc -= DT;
  }

  updateCamera(camera, world, frameDt);
  render(ctx, world, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Dev-only handle so headless checks can pose the world.
if (import.meta.env.DEV) {
  Object.assign(window, {
    hockey: {
      get world() { return world; },
      get camera() { return camera; },
    },
  });
}
