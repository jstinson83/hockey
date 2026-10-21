import { RINK, TUNING, type World } from './sim';

const SCALE = 6; // pixels per world unit
const PAD = 16;

export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas.width = RINK.w * SCALE + PAD * 2;
  canvas.height = RINK.h * SCALE + PAD * 2;
  return canvas.getContext('2d')!;
}

export function render(ctx: CanvasRenderingContext2D, world: World): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(PAD, PAD);
  ctx.scale(SCALE, SCALE);

  // Boards
  ctx.fillStyle = '#f4f9fc';
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.roundRect(0, 0, RINK.w, RINK.h, RINK.corner);
  ctx.fill();
  ctx.stroke();

  // Center red line + circle, blue lines, goal lines
  ctx.lineWidth = 0.5;
  line(ctx, RINK.w / 2, 0, RINK.w / 2, RINK.h, '#c33');
  line(ctx, RINK.w / 2 - 25, 0, RINK.w / 2 - 25, RINK.h, '#36c');
  line(ctx, RINK.w / 2 + 25, 0, RINK.w / 2 + 25, RINK.h, '#36c');
  line(ctx, 11, 0, 11, RINK.h, '#c33');
  line(ctx, RINK.w - 11, 0, RINK.w - 11, RINK.h, '#c33');
  ctx.strokeStyle = '#36c';
  ctx.beginPath();
  ctx.arc(RINK.w / 2, RINK.h / 2, 15, 0, Math.PI * 2);
  ctx.stroke();

  // Goals
  ctx.fillStyle = '#999';
  ctx.fillRect(11 - 4, RINK.h / 2 - 3, 4, 6);
  ctx.fillRect(RINK.w - 11, RINK.h / 2 - 3, 4, 6);

  // Skaters
  for (const s of world.skaters) {
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, TUNING.skaterRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
