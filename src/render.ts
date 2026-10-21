import type { Camera } from './camera';
import { RINK, TUNING, VIEW } from './sim-constants';
import type { World } from './sim';

const S = VIEW.pxPerUnit;
const T = VIEW.tilt;
const OFFSET_X = (VIEW.width - RINK.w * S) / 2;

export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  return canvas.getContext('2d')!;
}

/** Ground point -> screen pixels. */
function project(cam: Camera, x: number, y: number): { sx: number; sy: number } {
  return { sx: OFFSET_X + x * S, sy: VIEW.height / 2 + (y - cam.y) * S * T };
}

export function render(ctx: CanvasRenderingContext2D, world: World, cam: Camera): void {
  ctx.fillStyle = '#1a1d22';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  drawRink(ctx, cam);
  drawEntities(ctx, world, cam);
}

function drawRink(ctx: CanvasRenderingContext2D, cam: Camera): void {
  ctx.save();
  // Draw in world units; the non-uniform scale is what tilts the view.
  ctx.translate(OFFSET_X, VIEW.height / 2 - cam.y * S * T);
  ctx.scale(S, S * T);

  ctx.fillStyle = '#eef5f9';
  ctx.strokeStyle = '#2b2f36';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.roundRect(0, 0, RINK.w, RINK.h, RINK.corner);
  ctx.fill();
  ctx.stroke();

  const mid = RINK.h / 2;
  const goalLine = 11;
  ctx.lineWidth = 0.6;
  hline(ctx, mid, '#c33');
  hline(ctx, mid - 25, '#36c');
  hline(ctx, mid + 25, '#36c');
  hline(ctx, goalLine, '#c33');
  hline(ctx, RINK.h - goalLine, '#c33');

  ctx.strokeStyle = '#36c';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(RINK.w / 2, mid, 15, 0, Math.PI * 2);
  ctx.stroke();

  // Creases and nets
  ctx.strokeStyle = '#c33';
  ctx.fillStyle = 'rgba(80,140,200,0.25)';
  for (const [gy, dir] of [[goalLine, 1], [RINK.h - goalLine, -1]] as const) {
    ctx.beginPath();
    ctx.arc(RINK.w / 2, gy, 6, dir === 1 ? 0 : Math.PI, dir === 1 ? Math.PI : Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#888';
  ctx.fillRect(RINK.w / 2 - 3, goalLine - 4, 6, 4);
  ctx.fillRect(RINK.w / 2 - 3, RINK.h - goalLine, 6, 4);

  ctx.restore();
}

function hline(ctx: CanvasRenderingContext2D, y: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(RINK.w, y);
  ctx.stroke();
}

function drawEntities(ctx: CanvasRenderingContext2D, world: World, cam: Camera): void {
  // Painter's algorithm: things lower on the ice are nearer the viewer.
  type Item = { y: number; draw: () => void };
  const items: Item[] = world.skaters.map((s) => ({ y: s.y, draw: () => drawSkater(ctx, cam, s) }));
  items.push({ y: world.puck.y, draw: () => drawPuck(ctx, cam, world.puck) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
}

function shadow(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, r: number): void {
  const { sx, sy } = project(cam, x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(sx, sy, r * S, r * S * T, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkater(ctx: CanvasRenderingContext2D, cam: Camera, s: World['skaters'][number]): void {
  const r = TUNING.skaterRadius;
  const { sx, sy } = project(cam, s.x, s.y);
  shadow(ctx, cam, s.x, s.y, r);

  // Upright body: a rounded box standing on the shadow.
  const w = r * 2 * S * 0.85;
  const h = VIEW.bodyHeight * S * T + r * S * T;
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.roundRect(sx - w / 2, sy - h + r * S * T * 0.5, w, h, w * 0.3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Facing tick on the ground, projected so it reads in the tilted view.
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + Math.cos(s.facing) * r * 1.8 * S, sy + Math.sin(s.facing) * r * 1.8 * S * T);
  ctx.stroke();

  if (s.charge > 0) {
    const t = Math.min(s.charge / TUNING.chargeTime, 1);
    ctx.strokeStyle = t >= 1 ? '#e80' : '#777';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(sx, sy, (r + 1) * S, (r + 1) * S * T, 0, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
    ctx.stroke();
  }
}

function drawPuck(ctx: CanvasRenderingContext2D, cam: Camera, p: World['puck']): void {
  const { sx, sy } = project(cam, p.x, p.y);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(sx, sy - 1, TUNING.puckRadius * S, TUNING.puckRadius * S * T * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
}
