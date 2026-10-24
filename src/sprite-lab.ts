/**
 * Sprite lab (sprites.html): every animation as a contact sheet (rows = facings, columns = frames)
 * plus a live-playing column, so the frame set can be judged and tuned before real art exists.
 */
import { TEAM_COLORS } from './sim-constants';
import { GOALIE_ANIMS, SKATER_ANIMS, type AnimDef } from './sprite-poses';
import { DIRS, getSprite, type SpriteSpec } from './sprite-rig';

type Entry = { kind: 'skater' | 'goalie'; name: string; def: AnimDef };
const entries: Entry[] = [
  ...Object.entries(SKATER_ANIMS).map(([name, def]) => ({ kind: 'skater' as const, name, def })),
  ...Object.entries(GOALIE_ANIMS).map(([name, def]) => ({ kind: 'goalie' as const, name, def })),
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('sheet');
const ctx = canvas.getContext('2d')!;
const DIR_NAMES = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const GOALIE_DIRS = [2, 6];
const LIVE_FPS_FALLBACK = 12; // skate / burst are driven by distance in the game; the lab just plays them

let current = entries[1];
let paused = false;
let clock = 0;
let last = performance.now();

const list = $('list');
function buildList(): void {
  list.innerHTML = '';
  for (const kind of ['skater', 'goalie'] as const) {
    const h = document.createElement('h2');
    h.textContent = kind === 'skater' ? 'Skater' : 'Goalie';
    list.append(h);
    for (const e of entries.filter((x) => x.kind === kind)) {
      const b = document.createElement('button');
      b.className = e === current ? 'on' : '';
      b.innerHTML = `<span>${e.name}</span><small>${e.def.frames}f</small>`;
      b.onclick = () => { current = e; buildList(); describe(); };
      list.append(b);
    }
  }
}

function describe(): void {
  const d = current.def;
  $('title').textContent = `${current.kind} / ${current.name}`;
  $('note').textContent =
    `${d.frames} frame${d.frames > 1 ? 's' : ''}, ${d.loop ? 'loops' : 'one-shot'}, ` +
    `${d.fps ? d.fps + ' fps' : 'paced by game state'}${d.carry ? ', with-puck variant' : ''}${d.sided ? ', mirrored for the other side' : ''}. ${d.note}`;
}

const team = $<HTMLSelectElement>('team');
const carry = $<HTMLInputElement>('carry');
const speed = $<HTMLInputElement>('speed');
const zoom = $<HTMLSelectElement>('zoom');

function spec(dir: number, frame: number): SpriteSpec {
  return { kind: current.kind, anim: current.name as SpriteSpec['anim'], frame, dir, color: TEAM_COLORS[Number(team.value) as 0 | 1], carry: carry.checked, side: 1 };
}

function dirsFor(): number[] {
  return current.kind === 'goalie' ? GOALIE_DIRS : Array.from({ length: DIRS }, (_, i) => i);
}

function draw(): void {
  const z = Number(zoom.value);
  const d = current.def;
  const dirs = dirsFor();
  const probe = getSprite(spec(0, 0));
  const cw = probe.w * z;
  const ch = probe.h * z;
  const cols = d.frames + 1; // + the live column
  const lw = 34;
  canvas.width = lw + cols * cw;
  canvas.height = dirs.length * ch + 22;
  ctx.imageSmoothingEnabled = true;
  ctx.font = '11px system-ui';
  ctx.textBaseline = 'top';

  const liveFps = (d.fps || LIVE_FPS_FALLBACK) * Number(speed.value);
  const liveFrame = Math.floor(clock * liveFps) % d.frames;

  ctx.fillStyle = '#7d8696';
  for (let f = 0; f < d.frames; f++) ctx.fillText(`${f}`, lw + f * cw + 4, 4);
  ctx.fillText('live', lw + d.frames * cw + 4, 4);

  dirs.forEach((dir, row) => {
    const y0 = 22 + row * ch;
    ctx.fillStyle = '#7d8696';
    ctx.fillText(DIR_NAMES[dir], 6, y0 + 4);
    for (let col = 0; col < cols; col++) {
      const x0 = lw + col * cw;
      ctx.fillStyle = col === d.frames ? '#232a36' : '#1f2630';
      ctx.fillRect(x0 + 1, y0 + 1, cw - 2, ch - 2);
      const frame = col === d.frames ? liveFrame : col;
      const s = getSprite(spec(dir, frame));
      // Feet marker, then the sprite.
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.ellipse(x0 + s.ax * z, y0 + s.ay * z, 8 * z, 6 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(s.img, x0, y0, s.w * z, s.h * z);
    }
  });
}

function frame(now: number): void {
  if (!paused) clock += (now - last) / 1000;
  last = now;
  draw();
  requestAnimationFrame(frame);
}

$('pause').onclick = (e) => {
  paused = !paused;
  (e.target as HTMLButtonElement).textContent = paused ? 'Play' : 'Pause';
};

/** A raw sheet at the bake resolution: columns = frames, rows = facings. Hand this to an artist as the template. */
$('export').onclick = () => {
  const dirs = dirsFor();
  const d = current.def;
  const probe = getSprite(spec(0, 0)).img as HTMLCanvasElement;
  const out = document.createElement('canvas');
  out.width = probe.width * d.frames;
  out.height = probe.height * dirs.length;
  const c = out.getContext('2d')!;
  dirs.forEach((dir, row) => {
    for (let f = 0; f < d.frames; f++) c.drawImage(getSprite(spec(dir, f)).img, f * probe.width, row * probe.height);
  });
  out.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${current.kind}-${current.name}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
};

buildList();
describe();
requestAnimationFrame(frame);
