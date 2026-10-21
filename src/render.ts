import type { Camera } from './camera';
import { FACEOFF, GOAL, RINK, TUNING, VIEW } from './sim-constants';
import type { World } from './sim';

const S = VIEW.pxPerUnit;
const T = VIEW.tilt;
const OFFSET_X = (VIEW.width - RINK.w * S) / 2;
const CX = RINK.w / 2;
const MID = RINK.h / 2;

// Glass is drawn opaque on a scratch layer, then composited translucently, so
// the overlapping sweep strokes don't accumulate alpha.
const glassLayer = document.createElement('canvas');
const glassCtx = glassLayer.getContext('2d')!;

/** Backing-store pixels per logical VIEW unit; drawing code stays in logical units. */
let pxScale = 1;
const HINT_HEIGHT = 28;
const MAX_BACKING_WIDTH = 2560;

/** Fit the 3:2 canvas to the window and render at the screen's native sharpness. */
export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const fit = () => {
    const availW = window.innerWidth;
    const availH = window.innerHeight - (document.fullscreenElement ? 0 : HINT_HEIGHT);
    const cssW = Math.min(availW, availH * (VIEW.width / VIEW.height));
    const cssH = cssW * (VIEW.height / VIEW.width);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const backingW = Math.min(Math.round(cssW * (window.devicePixelRatio || 1)), MAX_BACKING_WIDTH);
    canvas.width = backingW;
    canvas.height = Math.round(backingW * (VIEW.height / VIEW.width));
    glassLayer.width = canvas.width;
    glassLayer.height = canvas.height;
    pxScale = canvas.width / VIEW.width;
  };
  fit();
  addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', fit);
  return canvas.getContext('2d')!;
}

/** Ground point -> screen pixels. */
function project(cam: Camera, x: number, y: number): { sx: number; sy: number } {
  return { sx: OFFSET_X + x * S, sy: VIEW.height / 2 + (y - cam.y) * S * T };
}

export function render(ctx: CanvasRenderingContext2D, world: World, cam: Camera): void {
  ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  ctx.fillStyle = '#1a1d22';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  drawIce(ctx, cam);
  drawWalls(ctx, cam, 'far'); // behind the action
  drawEntities(ctx, world, cam);
  drawWalls(ctx, cam, 'near'); // in front of the action
  drawOffscreenArrows(ctx, world, cam);
}

/**
 * The camera follows the puck, so a skater can end up off-screen. Mark where
 * they are with an arrow on the edge nearest them (the full rink width is
 * always visible, so only top/bottom are possible). Once the AI teammates
 * exist this should be limited to the skater each human controls.
 */
function drawOffscreenArrows(ctx: CanvasRenderingContext2D, world: World, cam: Camera): void {
  const bodyPx = (VIEW.bodyHeight + TUNING.skaterRadius) * S * T;
  const m = VIEW.arrowMargin;
  for (const s of world.skaters) {
    const { sx, sy } = project(cam, s.x, s.y);
    const dir = sy < 0 ? -1 : sy - bodyPx > VIEW.height ? 1 : 0;
    if (dir === 0) continue;

    const ay = dir < 0 ? m : VIEW.height - m;
    const ax = Math.min(Math.max(sx, m), VIEW.width - m);
    const size = 11;
    ctx.beginPath();
    ctx.moveTo(ax, ay + dir * size);
    ctx.lineTo(ax - size, ay - dir * size * 0.6);
    ctx.lineTo(ax + size, ay - dir * size * 0.6);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- ice

function drawIce(ctx: CanvasRenderingContext2D, cam: Camera): void {
  ctx.save();
  // Draw in world units; the non-uniform scale is what tilts the view.
  ctx.translate(OFFSET_X, VIEW.height / 2 - cam.y * S * T);
  ctx.scale(S, S * T);

  ctx.fillStyle = '#eef5f9';
  ctx.beginPath();
  ctx.roundRect(0, 0, RINK.w, RINK.h, RINK.corner);
  ctx.fill();

  ctx.lineWidth = 0.6;
  hline(ctx, MID, '#c33');
  hline(ctx, MID - FACEOFF.blueLine, '#36c');
  hline(ctx, MID + FACEOFF.blueLine, '#36c');
  hline(ctx, GOAL.line, '#c33');
  hline(ctx, RINK.h - GOAL.line, '#c33');

  // Centre circle and dot
  ctx.strokeStyle = '#36c';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(CX, MID, FACEOFF.radius, 0, Math.PI * 2);
  ctx.stroke();
  dot(ctx, CX, MID, 1, '#36c');

  // End-zone faceoff circles + spots
  for (const gy of [GOAL.line + FACEOFF.endZoneFromGoalLine, RINK.h - GOAL.line - FACEOFF.endZoneFromGoalLine]) {
    for (const sx of [CX - FACEOFF.dx, CX + FACEOFF.dx]) faceoffCircle(ctx, sx, gy);
  }
  // Neutral-zone spots, just outside each blue line
  for (const ny of [MID - FACEOFF.blueLine + FACEOFF.neutralFromBlueLine, MID + FACEOFF.blueLine - FACEOFF.neutralFromBlueLine]) {
    for (const sx of [CX - FACEOFF.dx, CX + FACEOFF.dx]) dot(ctx, sx, ny, 0.9, '#c33');
  }

  // Creases
  ctx.strokeStyle = '#c33';
  ctx.fillStyle = 'rgba(80,140,200,0.25)';
  ctx.lineWidth = 0.4;
  for (const [gy, dir] of [[GOAL.line, 1], [RINK.h - GOAL.line, -1]] as const) {
    ctx.beginPath();
    ctx.arc(CX, gy, GOAL.crease, dir === 1 ? 0 : Math.PI, dir === 1 ? Math.PI : Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function faceoffCircle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const r = FACEOFF.radius;
  ctx.strokeStyle = '#c33';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  dot(ctx, x, y, 1.1, '#c33');
  // Hash marks: short ticks flanking the circle top and bottom.
  ctx.lineWidth = 0.5;
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const hx = x + side * 1.4;
      ctx.beginPath();
      ctx.moveTo(hx, y + end * (r - 0.2));
      ctx.lineTo(hx, y + end * (r + 3));
      ctx.stroke();
    }
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function hline(ctx: CanvasRenderingContext2D, y: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(RINK.w, y);
  ctx.stroke();
}

// ---------------------------------------------------------------- boards + glass

/**
 * Stroke the rink outline lifted `lift` px above the ice. Sweeping this over a
 * range of lifts extrudes the boards upward, which is all a tilted view needs
 * to read as a wall. `half` keeps only the far or near half of the rink
 * (split at the centre line) so each half can be layered around the players.
 */
function strokeOutline(
  c: CanvasRenderingContext2D, cam: Camera, lift: number, half: 'far' | 'near',
  inflate: number, thickness: number, color: string,
): void {
  c.save();
  c.translate(OFFSET_X, VIEW.height / 2 - cam.y * S * T - lift);
  c.scale(S, S * T);
  c.beginPath();
  if (half === 'far') c.rect(-10, -50, RINK.w + 20, MID + 50);
  else c.rect(-10, MID, RINK.w + 20, MID + 50);
  c.clip();
  c.beginPath();
  c.roundRect(-inflate, -inflate, RINK.w + inflate * 2, RINK.h + inflate * 2, RINK.corner + inflate);
  c.lineWidth = thickness;
  c.strokeStyle = color;
  c.stroke();
  c.restore();
}

function drawWalls(ctx: CanvasRenderingContext2D, cam: Camera, half: 'far' | 'near'): void {
  const t = VIEW.boardThickness;
  const H = VIEW.boardHeight;
  const G = VIEW.glassHeight;

  // Dasher boards: dark inner face, light cap on top.
  for (let k = 0; k <= H; k++) strokeOutline(ctx, cam, k, half, t / 2, t, '#26395f');
  strokeOutline(ctx, cam, H, half, t / 2, t, '#d9dee5');

  // Glass: translucent panel rising from the cap's inner edge.
  glassCtx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  glassCtx.clearRect(0, 0, VIEW.width, VIEW.height);
  for (let k = H; k <= H + G; k++) strokeOutline(glassCtx, cam, k, half, 0.15, 0.3, '#bfe3ff');
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.setTransform(1, 0, 0, 1, 0, 0); // the layer is already in backing-store pixels
  ctx.drawImage(glassLayer, 0, 0);
  ctx.restore();
  // Bright top rail on the glass.
  ctx.save();
  ctx.globalAlpha = 0.7;
  strokeOutline(ctx, cam, H + G, half, 0.15, 0.3, '#ffffff');
  ctx.restore();
}

// ---------------------------------------------------------------- entities

function drawEntities(ctx: CanvasRenderingContext2D, world: World, cam: Camera): void {
  // Painter's algorithm: things lower on the ice are nearer the viewer.
  type Item = { y: number; draw: () => void };
  const items: Item[] = world.skaters.map((s) => ({ y: s.y, draw: () => drawSkater(ctx, cam, s) }));
  items.push({ y: world.puck.y, draw: () => drawPuck(ctx, cam, world.puck) });
  // Far net is behind everything; near net's back is the closest thing on the ice.
  items.push({ y: GOAL.line - GOAL.depth, draw: () => drawNet(ctx, cam, GOAL.line, -1) });
  items.push({ y: RINK.h - GOAL.line + GOAL.depth, draw: () => drawNet(ctx, cam, RINK.h - GOAL.line, 1) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
}

/** A box on the ice: front opening on the goal line, extending `dir` (-1 up the screen, +1 down) by GOAL.depth. */
function drawNet(ctx: CanvasRenderingContext2D, cam: Camera, gy: number, dir: -1 | 1): void {
  const hh = GOAL.height * S * T; // net height in px
  const x0 = CX - GOAL.width / 2;
  const x1 = CX + GOAL.width / 2;
  const fL = project(cam, x0, gy);
  const fR = project(cam, x1, gy);
  const bL = project(cam, x0, gy + dir * GOAL.depth);
  const bR = project(cam, x1, gy + dir * GOAL.depth);
  const up = (p: { sx: number; sy: number }) => ({ sx: p.sx, sy: p.sy - hh });
  const fLt = up(fL), fRt = up(fR), bLt = up(bL), bRt = up(bR);

  const poly = (pts: { sx: number; sy: number }[], fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
    ctx.closePath();
    ctx.fill();
  };

  // Floor, then back/side netting (the far side of the box first).
  poly([fL, fR, bR, bL], 'rgba(120,130,150,0.25)');
  poly([bL, bR, bRt, bLt], 'rgba(90,100,120,0.35)');
  poly([fL, bL, bLt, fLt], 'rgba(90,100,120,0.22)');
  poly([fR, bR, bRt, fRt], 'rgba(90,100,120,0.22)');

  // Mesh hatch on the back panel.
  ctx.strokeStyle = 'rgba(60,70,90,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const n = 9;
  for (let i = 1; i < n; i++) {
    const f = i / n;
    ctx.moveTo(bL.sx + (bR.sx - bL.sx) * f, bL.sy);
    ctx.lineTo(bLt.sx + (bRt.sx - bLt.sx) * f, bLt.sy);
  }
  for (let i = 1; i < 4; i++) {
    const f = i / 4;
    ctx.moveTo(bL.sx, bL.sy - hh * f);
    ctx.lineTo(bR.sx, bR.sy - hh * f);
  }
  ctx.stroke();

  // Frame: back edges thin, front posts and crossbar bold.
  ctx.strokeStyle = '#8a8f99';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bLt.sx, bLt.sy); ctx.lineTo(bRt.sx, bRt.sy);
  ctx.moveTo(fLt.sx, fLt.sy); ctx.lineTo(bLt.sx, bLt.sy);
  ctx.moveTo(fRt.sx, fRt.sy); ctx.lineTo(bRt.sx, bRt.sy);
  ctx.stroke();

  ctx.strokeStyle = '#d33';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fL.sx, fL.sy); ctx.lineTo(fLt.sx, fLt.sy);
  ctx.lineTo(fRt.sx, fRt.sy); ctx.lineTo(fR.sx, fR.sy);
  ctx.stroke();
  ctx.lineCap = 'butt';
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
