import type { Camera } from './camera';
import { faceoffEnd } from './faceoff';
import { FACEOFF, GAME, GOAL, RINK, TEAM_COLORS, TEAM_NAMES, TUNING, VIEW } from './sim-constants';
import { goalieRadius, type Goalie, type Skater, type World } from './sim';
import { dirOf, getSprite } from './sprite-rig';
import { pickGoalie, pickSkater } from './sprite-select';

const S = VIEW.pxPerUnit;
const T = VIEW.tilt;
const OFFSET_X = (VIEW.width - RINK.w * S) / 2;
const CX = RINK.w / 2;
const MID = RINK.h / 2;
const PAD = VIEW.arenaPad;

// The static scene is baked once into two tall offscreen images ("arena"
// coordinates: logical px, world y = 0 sits at ARENA_Y0) and scrolled each
// frame: `arena` is everything behind the skaters (crowd, ice, markings, far
// walls); `front` is the near walls and glass, drawn over the skaters.
const ARENA_Y0 = PAD * S * T;
const ARENA_H = (RINK.h + 2 * PAD) * S * T;
const FRONT_TOP = (MID + PAD) * S * T - 80; // 80px of margin for lifted overhang

const arena = document.createElement('canvas');
const front = document.createElement('canvas');
const scratch = document.createElement('canvas'); // opaque glass, composited translucently

/** Backing-store pixels per logical VIEW unit; drawing code stays in logical units. */
let pxScale = 1;
let frontOffsetDev = 0; // front's top edge in arena device px (integer so blits stay crisp)
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
    pxScale = canvas.width / VIEW.width;
    bake();
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
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  // Snap the scroll to whole device pixels and project entities from the
  // snapped value, so sprites and the baked scene never drift apart.
  const maxY = arena.height - h;
  const srcY = Math.min(Math.max(Math.round(((cam.y + PAD) * S * T - VIEW.height / 2) * pxScale), 0), maxY);
  const view: Camera = { y: (srcY / pxScale + VIEW.height / 2) / (S * T) - PAD };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(arena, 0, srcY, w, h, 0, 0, w, h);

  ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  drawEntities(ctx, world, view);

  // Near walls and glass go over the skaters.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const y0 = Math.max(srcY, frontOffsetDev);
  const y1 = Math.min(srcY + h, frontOffsetDev + front.height);
  if (y1 > y0) ctx.drawImage(front, 0, y0 - frontOffsetDev, w, y1 - y0, 0, y0 - srcY, w, y1 - y0);

  ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  drawOffscreenArrows(ctx, world, view);
  drawHud(ctx, world);
}

// ---------------------------------------------------------------- baking

function bake(): void {
  arena.width = pxScale > 0 ? Math.round(VIEW.width * pxScale) : 1;
  arena.height = Math.ceil(ARENA_H * pxScale);
  frontOffsetDev = Math.round(FRONT_TOP * pxScale);
  front.width = arena.width;
  front.height = arena.height - frontOffsetDev;
  scratch.width = arena.width;
  scratch.height = Math.max(front.height, frontOffsetDev + Math.round(90 * pxScale));

  const a = arena.getContext('2d')!;
  a.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  drawCrowd(a, VIEW.width, ARENA_H);
  drawConcourse(a);
  drawIce(a);
  bakeWalls(a, 'far', 0);

  const f = front.getContext('2d')!;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.clearRect(0, 0, front.width, front.height);
  bakeWalls(f, 'near', frontOffsetDev / pxScale);
}

/** Enter world units (feet-ish) on an arena-space context. */
function inWorld(c: CanvasRenderingContext2D, fn: () => void): void {
  c.save();
  c.translate(OFFSET_X, ARENA_Y0);
  c.scale(S, S * T);
  fn();
  c.restore();
}

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pixel crowd in rows with aisles; the rink is painted over it. */
function drawCrowd(c: CanvasRenderingContext2D, w: number, h: number): void {
  const rand = mulberry32(94);
  const rowH = 10;
  const pw = 7;
  const shirts = ['#c0392b', '#2c5fa8', '#d9a82b', '#e8e8e8', '#3d8f55', '#7d4aa0', '#555b66', '#d9792b'];
  const skin = ['#e0b08a', '#c98e65', '#8d5a3c', '#f0c9a4'];
  c.fillStyle = '#14161b';
  c.fillRect(0, 0, w, h);
  for (let r = 0, y = 0; y < h; r++, y += rowH) {
    if (r % 7 === 6) {
      c.fillStyle = '#1a1c21'; // aisle
      c.fillRect(0, y, w, rowH);
      continue;
    }
    const shift = (r % 2) * (pw / 2);
    for (let x = -shift; x < w; x += pw) {
      c.fillStyle = shirts[(rand() * shirts.length) | 0];
      c.fillRect(x + 0.5, y + 4, pw - 1, rowH - 4);
      c.fillStyle = skin[(rand() * skin.length) | 0];
      c.fillRect(x + 2, y + 1, 3, 3.5);
    }
  }
  c.fillStyle = 'rgba(8,10,14,0.35)'; // keep the crowd quieter than the game
  c.fillRect(0, 0, w, h);
}

/** Dark ring between the boards and the stands. */
function drawConcourse(c: CanvasRenderingContext2D): void {
  inWorld(c, () => {
    const g = VIEW.boardThickness + 1.5;
    c.strokeStyle = '#202329';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(-g, -g, RINK.w + g * 2, RINK.h + g * 2, RINK.corner + g);
    c.stroke();
  });
}

// ---------------------------------------------------------------- ice

const ICE = '#d3e6f2';
const LINE_RED = '#d2554f';
const LINE_BLUE = '#6f84d4';

function drawIce(c: CanvasRenderingContext2D): void {
  inWorld(c, () => {
    c.fillStyle = ICE;
    c.beginPath();
    c.roundRect(0, 0, RINK.w, RINK.h, RINK.corner);
    c.fill();

    c.save();
    c.clip();
    scratchesAndGlints(c);
    c.restore();

    // Kickplate edge
    c.strokeStyle = '#e4d78a';
    c.lineWidth = 0.5;
    c.beginPath();
    c.roundRect(0, 0, RINK.w, RINK.h, RINK.corner);
    c.stroke();

    markings(c);
  });
}

/** Faint diagonal skate scratches plus the arena-light glints from the original. */
function scratchesAndGlints(c: CanvasRenderingContext2D): void {
  const rand = mulberry32(7);
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 0.12;
  for (let i = 0; i < 260; i++) {
    const x = rand() * RINK.w;
    const y = rand() * RINK.h;
    const len = 3 + rand() * 7;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + len * 0.7, y - len * 0.7);
    c.stroke();
  }

  const xs = [CX - 26.5, CX - 18.8, CX + 18.8, CX + 26.5];
  for (const gy of [55, 98.4, RINK.h - 55]) {
    for (let row = 0; row < 4; row++) {
      for (const x of xs) glint(c, x, gy + (row - 1.5) * 5.4);
    }
  }
}

function glint(c: CanvasRenderingContext2D, x: number, y: number): void {
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.beginPath();
  c.arc(x, y, 0.4, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 0.16;
  c.beginPath();
  c.moveTo(x - 1.5, y); c.lineTo(x + 1.5, y);
  c.moveTo(x, y - 1.5); c.lineTo(x, y + 1.5);
  c.stroke();
}

function markings(c: CanvasRenderingContext2D): void {
  // Blue lines, goal lines
  for (const by of [MID - FACEOFF.blueLine, MID + FACEOFF.blueLine]) hline(c, by, LINE_BLUE, 1.0);
  for (const gy of [GOAL.line, RINK.h - GOAL.line]) hline(c, gy, LINE_RED, 0.5);

  // Centre red line, dashed white overlay like the original
  hline(c, MID, LINE_RED, 1.0);
  c.save();
  c.setLineDash([1.4, 1.4]);
  hline(c, MID, 'rgba(255,255,255,0.8)', 0.45);
  c.restore();

  // Centre circle + generic emblem (placeholder for a team logo)
  c.strokeStyle = LINE_BLUE;
  c.lineWidth = 0.5;
  c.beginPath();
  c.arc(CX, MID, FACEOFF.radius, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = '#f4f8fb';
  c.beginPath();
  c.arc(CX, MID, 6, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = LINE_RED;
  c.lineWidth = 0.9;
  c.stroke();
  c.strokeStyle = LINE_BLUE;
  c.lineWidth = 0.7;
  c.beginPath();
  c.arc(CX, MID, 3.6, 0, Math.PI * 2);
  c.stroke();

  // Creases: dotted periwinkle half-discs
  for (const [gy, dir] of [[GOAL.line, 1], [RINK.h - GOAL.line, -1]] as const) {
    c.save();
    c.beginPath();
    c.arc(CX, gy, GOAL.crease, dir === 1 ? 0 : Math.PI, dir === 1 ? Math.PI : Math.PI * 2);
    c.closePath();
    c.fillStyle = '#a9c0ea';
    c.fill();
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.45)';
    for (let dx = -GOAL.crease; dx <= GOAL.crease; dx += 1.2) {
      for (let dy = 0; dy <= GOAL.crease; dy += 1.2) {
        c.fillRect(CX + dx + (Math.round(dy / 1.2) % 2) * 0.6, gy + dir * dy, 0.28, 0.28);
      }
    }
    c.restore();
    c.strokeStyle = LINE_RED;
    c.lineWidth = 0.5;
    c.beginPath();
    c.arc(CX, gy, GOAL.crease, dir === 1 ? 0 : Math.PI, dir === 1 ? Math.PI : Math.PI * 2);
    c.closePath();
    c.stroke();
  }

  // End-zone faceoff circles
  for (const gy of [GOAL.line + FACEOFF.endZoneFromGoalLine, RINK.h - GOAL.line - FACEOFF.endZoneFromGoalLine]) {
    for (const sx of [CX - FACEOFF.dx, CX + FACEOFF.dx]) faceoffCircle(c, sx, gy);
  }
  // Neutral-zone spots, just inside each blue line
  for (const ny of [MID - FACEOFF.blueLine + FACEOFF.neutralFromBlueLine, MID + FACEOFF.blueLine - FACEOFF.neutralFromBlueLine]) {
    for (const sx of [CX - FACEOFF.dx, CX + FACEOFF.dx]) dot(c, sx, ny, 1.1, LINE_RED);
  }
}

function faceoffCircle(c: CanvasRenderingContext2D, x: number, y: number): void {
  const r = FACEOFF.radius;
  c.strokeStyle = LINE_RED;
  c.lineWidth = 0.5;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  dot(c, x, y, 1.3, LINE_RED);
  // Hash ticks flank the circle left and right, as in the original.
  c.lineWidth = 0.5;
  for (const side of [-1, 1]) {
    for (const up of [-1, 1]) {
      c.beginPath();
      c.moveTo(x + side * (r - 0.2), y + up * 1.4);
      c.lineTo(x + side * (r + 2.8), y + up * 1.4);
      c.stroke();
    }
  }
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function hline(c: CanvasRenderingContext2D, y: number, color: string, width: number): void {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(0, y);
  c.lineTo(RINK.w, y);
  c.stroke();
}

// ---------------------------------------------------------------- boards + glass

/** Arena-space point `lift` px above the ice, spread outward by perspective. */
function lifted(x: number, y: number, lift: number): { ax: number; ay: number } {
  const spread = 1 + VIEW.perspective * lift;
  return { ax: OFFSET_X + CX * S + (x - CX) * S * spread, ay: ARENA_Y0 + y * S * T - lift };
}

/**
 * Stroke the rink outline lifted `lift` px above the ice. Sweeping this over a
 * range of lifts extrudes the boards upward, and the slight outward spread
 * exposes the inner faces of the side walls. `half` keeps only the far or near
 * half of the rink (split at the centre line) so each can be layered around
 * the skaters.
 */
function strokeOutline(
  c: CanvasRenderingContext2D, lift: number, half: 'far' | 'near',
  inflate: number, thickness: number, color: string,
): void {
  c.save();
  const spread = 1 + VIEW.perspective * lift;
  c.translate(OFFSET_X + CX * S, ARENA_Y0 - lift);
  c.scale(S * spread, S * T);
  c.translate(-CX, 0);
  c.beginPath();
  if (half === 'far') c.rect(-20, -60, RINK.w + 40, MID + 60);
  else c.rect(-20, MID, RINK.w + 40, MID + 60);
  c.clip();
  c.beginPath();
  c.roundRect(-inflate, -inflate, RINK.w + inflate * 2, RINK.h + inflate * 2, RINK.corner + inflate);
  c.lineWidth = thickness;
  c.strokeStyle = color;
  c.stroke();
  c.restore();
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

/** Points along the outline where glass posts stand. */
function postPositions(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const c = RINK.corner;
  for (const y of [0, RINK.h]) {
    for (let i = 0; i <= 3; i++) pts.push({ x: c + (i * (RINK.w - 2 * c)) / 3, y });
  }
  for (const x of [0, RINK.w]) {
    for (let y = c + 12; y < RINK.h - c; y += 12) pts.push({ x, y });
  }
  for (const [cx, cy, a0] of [
    [c, c, Math.PI], [RINK.w - c, c, Math.PI * 1.5],
    [c, RINK.h - c, Math.PI * 0.5], [RINK.w - c, RINK.h - c, 0],
  ] as const) {
    for (let i = 1; i <= 2; i++) {
      const a = a0 + (i * Math.PI) / 6;
      pts.push({ x: cx + Math.cos(a) * c, y: cy + Math.sin(a) * c });
    }
  }
  return pts;
}

function bakeWalls(target: CanvasRenderingContext2D, half: 'far' | 'near', oy: number): void {
  const t = VIEW.boardThickness;
  const H = VIEW.boardHeight;
  const G = VIEW.glassHeight;
  const place = (c: CanvasRenderingContext2D) => c.setTransform(pxScale, 0, 0, pxScale, 0, -oy * pxScale);

  place(target);
  // Dasher boards: shaded dark-to-light up the face, light cap on top.
  for (let k = 0; k <= H; k++) {
    strokeOutline(target, k, half, t / 2, t, mix([70, 74, 82], [128, 133, 142], k / H));
  }
  strokeOutline(target, H, half, t / 2, t, '#b9bec5');

  // Glass: drawn opaque on a scratch layer so overlapping sweeps don't stack alpha.
  const s = scratch.getContext('2d')!;
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.clearRect(0, 0, scratch.width, scratch.height);
  place(s);
  for (let k = H; k <= H + G; k++) strokeOutline(s, k, half, 0.15, 0.3, '#c3ccd6');
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalAlpha = 0.38;
  target.drawImage(scratch, 0, 0);
  target.restore();

  // Posts and top rail
  place(target);
  target.strokeStyle = '#7d838b';
  target.lineWidth = 1.6;
  target.beginPath();
  for (const p of postPositions()) {
    if ((half === 'far') !== (p.y < MID)) continue;
    const a = lifted(p.x, p.y, H);
    const b = lifted(p.x, p.y, H + G);
    target.moveTo(a.ax, a.ay);
    target.lineTo(b.ax, b.ay);
  }
  target.stroke();
  strokeOutline(target, H + G, half, 0.15, 0.35, '#d0d5da');
}

// ---------------------------------------------------------------- entities

function drawEntities(ctx: CanvasRenderingContext2D, world: World, cam: Camera): void {
  // Painter's algorithm: things lower on the ice are nearer the viewer.
  type Item = { y: number; draw: () => void };
  const items: Item[] = world.skaters.map((s, i) => ({
    y: s.y,
    draw: () => drawSkater(ctx, cam, world, s, world.humans[s.team] && world.controlled[s.team] === i),
  }));
  for (const g of world.goalies) items.push({ y: g.y, draw: () => drawGoalie(ctx, cam, g) });
  items.push({ y: world.puck.y, draw: () => drawPuck(ctx, cam, world.puck) });
  // Far net is behind everything; near net's back is the closest thing on the ice.
  items.push({ y: GOAL.line - GOAL.depth, draw: () => drawNet(ctx, cam, GOAL.line, -1) });
  items.push({ y: RINK.h - GOAL.line + GOAL.depth, draw: () => drawNet(ctx, cam, RINK.h - GOAL.line, 1) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.draw();
}

/**
 * The camera follows the puck, so a skater can end up off-screen. Mark where
 * they are with an arrow on the edge nearest them (the full rink width is
 * always visible, so only top/bottom are possible). Only for the skater each
 * human controls.
 */
function drawOffscreenArrows(ctx: CanvasRenderingContext2D, world: World, cam: Camera): void {
  const bodyPx = (VIEW.bodyHeight + TUNING.skaterRadius) * S * T;
  const m = VIEW.arrowMargin;
  for (const team of [0, 1] as const) {
    if (!world.humans[team]) continue;
    const s = world.skaters[world.controlled[team]];
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
  poly([fL, fR, bR, bL], 'rgba(255,255,255,0.4)');
  poly([bL, bR, bRt, bLt], 'rgba(255,255,255,0.5)');
  poly([fL, bL, bLt, fLt], 'rgba(255,255,255,0.3)');
  poly([fR, bR, bRt, fRt], 'rgba(255,255,255,0.3)');

  // Mesh hatch on the back panel.
  ctx.strokeStyle = 'rgba(110,120,140,0.55)';
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

/** The green star the original puts under the skater you control. */
function controlStar(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const outer = 3.2;
  const inner = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    const px = sx + Math.cos(a) * r * S;
    const py = sy + Math.sin(a) * r * S * T;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#2ecc55';
  ctx.fill();
  ctx.strokeStyle = '#0b5d1e';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/** Distance each skater has skated, for stride phase. Presentation state only. */
const skated = new WeakMap<Skater, { x: number; y: number; dist: number }>();

function skatedDistance(s: Skater): number {
  const m = skated.get(s);
  if (!m) {
    skated.set(s, { x: s.x, y: s.y, dist: 0 });
    return 0;
  }
  const d = Math.hypot(s.x - m.x, s.y - m.y);
  m.dist += d < 10 ? d : 0; // a teleport (faceoff reset) isn't skating
  m.x = s.x;
  m.y = s.y;
  return m.dist;
}

function drawSkater(ctx: CanvasRenderingContext2D, cam: Camera, world: World, s: Skater, controlled: boolean): void {
  const r = TUNING.skaterRadius;
  const { sx, sy } = project(cam, s.x, s.y);
  if (controlled) controlStar(ctx, sx, sy);
  shadow(ctx, cam, s.x, s.y, r);

  const show = pickSkater(s, {
    hasPuck: world.puck.carrier >= 0 && world.skaters[world.puck.carrier] === s,
    phase: world.game.phase,
    celebrating: world.game.phase === 'goal' && world.game.lastScorer === s.team,
    dist: skatedDistance(s),
    clock: performance.now() / 1000,
  });
  const spr = getSprite({ kind: 'skater', anim: show.anim, frame: show.frame, dir: dirOf(s.facing), color: s.color, carry: show.carry });
  ctx.drawImage(spr.img, sx - spr.ax, sy - spr.ay, spr.w, spr.h);

  // The sprite has 8 facings but aim is continuous: show the exact facing for the skater you control.
  if (controlled) {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(s.facing) * r * 1.8 * S, sy + Math.sin(s.facing) * r * 1.8 * S * T);
    ctx.stroke();
  }

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

function drawGoalie(ctx: CanvasRenderingContext2D, cam: Camera, g: Goalie): void {
  const r = goalieRadius(g);
  const { sx, sy } = project(cam, g.x, g.y);
  shadow(ctx, cam, g.x, g.y, r);

  const show = pickGoalie(g, { clock: performance.now() / 1000 });
  const dir = g.y < RINK.h / 2 ? 2 : 6; // faces up-ice from its own net
  // Slides are drawn for the sprite's right; which way that is in the world depends on the facing.
  const side = show.toward * (dir === 2 ? -1 : 1) as 1 | -1;
  const spr = getSprite({ kind: 'goalie', anim: show.anim, frame: show.frame, dir, color: TEAM_COLORS[g.team], side });
  ctx.drawImage(spr.img, sx - spr.ax, sy - spr.ay, spr.w, spr.h);
}

// ---------------------------------------------------------------- HUD

function periodLabel(world: World): string {
  const g = world.game;
  return g.overtime ? 'OT' : ['1ST', '2ND', '3RD'][g.period - 1] ?? `P${g.period}`;
}

function formatClock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string): void {
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(10,12,16,0.85)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawHud(ctx: CanvasRenderingContext2D, world: World): void {
  const g = world.game;
  const font = (px: number) => `800 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  // Scoreboard: bottom right, out of the way of the action
  const bw = 250;
  const bh = 42;
  const bx = OFFSET_X + RINK.w * S - bw - 8; // inside the boards
  const by = VIEW.height - bh - 12;
  const mid = bx + bw / 2;
  ctx.fillStyle = 'rgba(15,18,24,0.85)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 9);
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.font = font(17);
  ctx.textAlign = 'right';
  ctx.fillStyle = TEAM_COLORS[0];
  ctx.fillText(`${TEAM_NAMES[0]}  ${g.score[0]}`, mid - 32, by + bh / 2);
  ctx.textAlign = 'left';
  ctx.fillStyle = TEAM_COLORS[1];
  ctx.fillText(`${g.score[1]}  ${TEAM_NAMES[1]}`, mid + 32, by + bh / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f4f7';
  ctx.font = font(18);
  ctx.fillText(formatClock(g.clock), mid, by + 15);
  ctx.font = font(11);
  ctx.fillStyle = '#9aa3ad';
  ctx.fillText(periodLabel(world), mid, by + 33);
  ctx.font = font(10);
  ctx.textAlign = 'right';
  ctx.fillStyle = TEAM_COLORS[0];
  ctx.fillText(`BREAKOUT ${world.breakout[0].toUpperCase()}`, mid - 32, by - 8);
  ctx.fillText(`NEUTRAL ${world.neutral[0].toUpperCase()}`, mid - 32, by - 20);
  ctx.fillText(`OFFENCE ${world.offence[0].toUpperCase()}`, mid - 32, by - 32);
  ctx.textAlign = 'left';
  ctx.fillStyle = TEAM_COLORS[1];
  ctx.fillText(`BREAKOUT ${world.breakout[1].toUpperCase()}`, mid + 32, by - 8);
  ctx.fillText(`NEUTRAL ${world.neutral[1].toUpperCase()}`, mid + 32, by - 20);
  ctx.fillText(`OFFENCE ${world.offence[1].toUpperCase()}`, mid + 32, by - 32);
  ctx.textAlign = 'center';

  drawFaceoffHud(ctx, world);

  const cx = VIEW.width / 2;
  const cy = VIEW.height / 2 - 40;
  if (g.phase === 'goal' && g.lastScorer !== null) {
    ctx.font = font(64);
    outlinedText(ctx, 'GOAL!', cx, cy, TEAM_COLORS[g.lastScorer]);
    ctx.font = font(22);
    outlinedText(ctx, `${TEAM_NAMES[g.lastScorer]} SCORES`, cx, cy + 44, '#f2f4f7');
  } else if (g.phase === 'faceoff') {
    ctx.font = font(30);
    const fresh = g.clock === (g.overtime ? GAME.overtimeSeconds : GAME.periodSeconds);
    outlinedText(ctx, fresh ? `${periodLabel(world)} PERIOD` : g.froze !== null ? 'WHISTLE' : 'FACEOFF', cx, cy, '#f2f4f7');
    ctx.font = font(16);
    outlinedText(ctx, 'PASS as the ref drops the puck  (hold a direction to aim it)', cx, cy + 30, '#c8ced6');
    if (g.froze !== null) {
      ctx.font = font(18);
      outlinedText(ctx, `${TEAM_NAMES[g.froze]} GOALIE FREEZES THE PUCK`, cx, cy + 58, '#f2f4f7');
    }
  } else if (g.phase === 'play' && world.goalies.some((gl) => gl.holding && world.humans[gl.team])) {
    ctx.font = font(16);
    outlinedText(ctx, 'GOALIE HAS IT:  PASS = pass   SHOOT = clear   POKE = freeze', cx, VIEW.height - 40, '#f2f4f7');
  } else if (g.phase === 'end') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const [a, b] = g.score;
    ctx.font = font(54);
    outlinedText(ctx, 'FINAL', cx, cy - 20, '#f2f4f7');
    ctx.font = font(30);
    if (a === b) outlinedText(ctx, `TIE  ${a} - ${b}`, cx, cy + 36, '#f2f4f7');
    else outlinedText(ctx, `${TEAM_NAMES[a > b ? 0 : 1]} WINS  ${Math.max(a, b)} - ${Math.min(a, b)}`, cx, cy + 36, TEAM_COLORS[a > b ? 0 : 1]);
    ctx.font = font(16);
    outlinedText(ctx, 'Press R for a new game', cx, cy + 82, '#c8ced6');
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

/** Top right: the ref with the puck, a count-in, then the drop and the window to press pass. */
function drawFaceoffHud(ctx: CanvasRenderingContext2D, world: World): void {
  const g = world.game;
  const f = g.faceoff;
  const showVerdict = g.phase === 'play' && f.result !== null && f.since < 1.4;
  if (g.phase !== 'faceoff' && !showVerdict) return;
  const font = (px: number) => `800 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const w = 168;
  const h = 118;
  const x = VIEW.width - w - 10;
  const y = 10;
  ctx.fillStyle = 'rgba(15,18,24,0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 9);
  ctx.fill();

  const dropped = f.t >= f.dropAt;
  const sinceDrop = Math.max(0, f.t - f.dropAt);
  // The ref: striped shirt, head, and the arm that holds the puck out, then lets it go.
  const rx = x + 34;
  const ry = y + 44;
  ctx.fillStyle = '#e9d2b0';
  ctx.beginPath();
  ctx.arc(rx, ry - 20, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#15171c';
  ctx.fillRect(rx - 9, ry - 29, 18, 5); // cap
  ctx.fillStyle = '#f2f4f7';
  ctx.fillRect(rx - 11, ry - 11, 22, 30); // shirt
  ctx.fillStyle = '#15171c';
  for (let i = 0; i < 5; i++) ctx.fillRect(rx - 11, ry - 9 + i * 6, 22, 3);
  ctx.fillRect(rx - 9, ry + 19, 7, 14); // legs
  ctx.fillRect(rx + 2, ry + 19, 7, 14);
  const lowered = dropped || f.result !== null;
  const hx = rx + 34;
  const hy = lowered ? ry + 4 : ry - 6;
  ctx.strokeStyle = '#f2f4f7';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(rx + 8, ry - 6);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.lineCap = 'butt';
  // The puck stays in the hand, then falls to the ice.
  const fall = dropped ? Math.min(1, sinceDrop / 0.18) : 0;
  const py = hy + 6 + fall * (ry + 34 - hy - 6);
  ctx.fillStyle = '#0b0c0f';
  ctx.beginPath();
  ctx.ellipse(hx, py, 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6b7380';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tx = x + w - 44;
  if (f.result) {
    const r = f.result;
    ctx.font = font(15);
    const label = r.winner === null ? 'SCRAMBLE' : `${TEAM_NAMES[r.winner]} WINS`;
    outlinedText(ctx, label, tx, y + 36, r.winner === null ? '#f2f4f7' : TEAM_COLORS[r.winner]);
    ctx.font = font(12);
    if (r.winner !== null) outlinedText(ctx, r.clean ? 'CLEAN' : 'SLOPPY', tx, y + 56, r.clean ? '#7be07b' : '#f0b050');
  } else if (dropped) {
    ctx.font = font(24);
    outlinedText(ctx, 'DROP!', tx, y + 40, '#ffd24a');
  } else if (f.t < TUNING.faceoffCount) {
    ctx.font = font(44);
    outlinedText(ctx, String(Math.ceil((TUNING.faceoffCount - f.t) / TUNING.faceoffTick)), tx, y + 42, '#f2f4f7');
  } else {
    ctx.font = font(18);
    outlinedText(ctx, 'READY', tx, y + 40, f.t % 0.3 < 0.15 ? '#f2f4f7' : '#9aa3ad');
  }

  // Bottom strip: the press window drains after the drop; a jumped drop is called out for each side.
  const bx = x + 12;
  const bw2 = w - 24;
  const by = y + h - 28;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(bx, by, bw2, 8);
  if (dropped && !f.result) {
    const left = 1 - sinceDrop / (faceoffEnd(f) - f.dropAt);
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(bx, by, bw2 * Math.max(0, left), 8);
  }
  ctx.font = font(10);
  ctx.textBaseline = 'middle';
  ([0, 1] as const).forEach((t) => {
    ctx.textAlign = t === 0 ? 'left' : 'right';
    const text = f.early[t] ? 'JUMPED IT' : f.pressAt[t] !== null ? 'GOT IT' : '';
    ctx.fillStyle = TEAM_COLORS[t];
    ctx.fillText(text, t === 0 ? bx : bx + bw2, by + 17);
  });
  ctx.textAlign = 'center';
}

/** Dim the frozen game and show the pause menu. */
export function drawPause(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
  ctx.fillStyle = 'rgba(8,10,14,0.62)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const cx = VIEW.width / 2;
  const cy = VIEW.height / 2 - 30;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 56px system-ui, -apple-system, "Segoe UI", sans-serif';
  outlinedText(ctx, 'PAUSED', cx, cy, '#f2f4f7');
  ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", sans-serif';
  const lines = ['Resume: P / Esc / Options', 'Restart: R', 'Fullscreen: F'];
  lines.forEach((l, i) => outlinedText(ctx, l, cx, cy + 52 + i * 28, '#c8ced6'));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
