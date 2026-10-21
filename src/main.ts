import { P1_KEYS, readIntent } from './input';
import { render, setupCanvas } from './render';
import { createWorld, step } from './sim';

const DT = 1 / 60; // fixed simulation timestep
const MAX_FRAME = 0.25; // avoid spiral of death after tab switches

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = setupCanvas(canvas);
let world = createWorld();
addEventListener('keydown', (e) => { if (e.code === 'KeyR') world = createWorld(); });

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  acc += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  while (acc >= DT) {
    step(world, [readIntent(P1_KEYS, 0), readIntent(null, 1)], DT);
    acc -= DT;
  }

  render(ctx, world);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
