/**
 * Procedural placeholder sprites. A small 3D puppet (joints from a `Pose`) is rotated to one of 8
 * facings, projected with the game's oblique tilt, and drawn back-to-front with an outline. Each
 * frame is baked once to an offscreen canvas and cached.
 *
 * To swap in real art, replace `getSprite` with a lookup into a sheet that has the same frames as
 * `SKATER_ANIMS` / `GOALIE_ANIMS` x 8 facings (see `SpriteFrame` for the anchor convention).
 * Nothing else in the renderer needs to change.
 */
import { VIEW } from './sim-constants';
import { framePose, GOALIE_ANIMS, mirrorPose, SKATER_ANIMS, type AnimDef, type GoalieAnimName, type Pose, type SkaterAnimName, type Vec3 } from './sprite-poses';

export interface SpriteSpec {
  kind: 'skater' | 'goalie';
  anim: SkaterAnimName | GoalieAnimName;
  frame: number;
  dir: number;      // facing in 45 degree steps: 0 = +x (east), 2 = +y (down the screen), 4 = west, 6 = up the screen
  color: string;    // jersey colour
  carry?: boolean;  // with the puck
  side?: 1 | -1;    // for 'sided' anims: which way (+1 = the sprite's right)
}

/** A baked frame: draw `img` at (x - ax, y - ay) at its logical size w x h so the feet land on (x, y). */
export interface SpriteFrame { img: CanvasImageSource; w: number; h: number; ax: number; ay: number }

export const DIRS = 8;
export function dirOf(angle: number): number {
  return ((Math.round(angle / (Math.PI / 4)) % DIRS) + DIRS) % DIRS;
}

export function animDef(spec: Pick<SpriteSpec, 'kind' | 'anim'>): AnimDef {
  return spec.kind === 'goalie' ? GOALIE_ANIMS[spec.anim as GoalieAnimName] : SKATER_ANIMS[spec.anim as SkaterAnimName];
}

const K = 42;          // px per pose unit at 1x
const SS = 2;          // supersampling
const W = 112;
const H = 104;
const AX = 56;
const AY = 76;
const STICK = 0.74;    // stick length, pose units
const OUTLINE = '#12151c';

const cache = new Map<string, SpriteFrame>();

export function getSprite(spec: SpriteSpec): SpriteFrame {
  const def = animDef(spec);
  const carry = !!(def.carry && spec.carry);
  const side = def.sided ? spec.side ?? 1 : 1;
  const frame = ((spec.frame % def.frames) + def.frames) % def.frames;
  const dir = ((spec.dir % DIRS) + DIRS) % DIRS;
  const key = `${spec.kind}|${spec.anim}|${frame}|${dir}|${spec.color}|${carry ? 1 : 0}|${side}`;
  let hit = cache.get(key);
  if (!hit) {
    let pose = framePose(def, frame, { carry });
    if (side < 0) pose = mirrorPose(pose);
    hit = bake(pose, dir, spec.kind, spec.color);
    cache.set(key, hit);
  }
  return hit;
}

// ---------------------------------------------------------------- colour

function shade(hex: string, f: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// ---------------------------------------------------------------- rig

interface Pt { x: number; y: number; d: number }
interface Part { d: number; draw: (c: CanvasRenderingContext2D) => void }

function bake(pose: Pose, dir: number, kind: 'skater' | 'goalie', color: string): SpriteFrame {
  const goalie = kind === 'goalie';
  const a = (dir * Math.PI) / 4;
  const fx = Math.cos(a), fy = Math.sin(a);   // forward, in the world
  const rx = -Math.sin(a), ry = Math.cos(a);  // the skater's right
  const T = VIEW.tilt;

  // Pose-local (forward, right, up) -> screen px relative to the feet; d = depth (bigger = nearer the camera).
  const P = (x: number, l: number, z: number): Pt => {
    let x1 = x * Math.cos(pose.pitch) + z * Math.sin(pose.pitch);
    let z1 = z * Math.cos(pose.pitch) - x * Math.sin(pose.pitch);
    const l1 = l * Math.cos(pose.roll) + z1 * Math.sin(pose.roll) + pose.shift;
    z1 = Math.max(0, z1 * Math.cos(pose.roll) - l * Math.sin(pose.roll));
    x1 = Math.round(x1 * 1e6) / 1e6;
    const wx = x1 * fx + l1 * rx;
    const wy = x1 * fy + l1 * ry;
    return { x: wx * K, y: wy * T * K - z1 * K, d: wy };
  };
  const V = (v: Vec3): Pt => P(v[0], v[1], v[2]);
  const mid = (p: Pt, q: Pt, t = 0.5): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, d: p.d + (q.d - p.d) * t });

  const jersey = color;
  const pants = shade(color, 0.45);
  const helmet = goalie ? '#f2f4f7' : shade(color, 0.7);
  const skin = '#e9b98f';
  const glove = '#1b1f27';
  const pad = '#eef0f3';
  const parts: Part[] = [];

  const limb = (p: Pt, q: Pt, w: number, fill: string, rim = 2.4): void => {
    parts.push({ d: (p.d + q.d) / 2, draw: (c) => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y);
      c.strokeStyle = OUTLINE; c.lineWidth = w * K + rim; c.stroke();
      c.strokeStyle = fill; c.lineWidth = w * K; c.stroke();
    } });
  };
  const ball = (p: Pt, r: number, fill: string, bias = 0): void => {
    parts.push({ d: p.d + bias, draw: (c) => {
      c.beginPath(); c.arc(p.x, p.y, r * K, 0, Math.PI * 2);
      c.fillStyle = fill; c.fill();
      c.strokeStyle = OUTLINE; c.lineWidth = 1.2; c.stroke();
    } });
  };
  const quad = (pts: Pt[], w: number, fill: string): void => {
    const d = pts.reduce((s, p) => s + p.d, 0) / pts.length;
    parts.push({ d, draw: (c) => {
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath();
      c.strokeStyle = OUTLINE; c.lineWidth = w * K + 2.4; c.stroke();
      c.fillStyle = fill; c.fill();
      c.strokeStyle = fill; c.lineWidth = w * K; c.stroke();
    } });
  };

  // ----- joints
  const hipZ = 0.5 - pose.crouch;
  const hipW = goalie ? 0.1 : 0.085;
  const torsoLen = 0.4;
  const sinL = Math.sin(pose.lean), cosL = Math.cos(pose.lean);
  const shW = goalie ? 0.19 : 0.15;
  const shZ = hipZ + torsoLen * cosL;
  const shX = torsoLen * sinL;
  const tw = (l: number): [number, number] => [-l * Math.sin(pose.twist) + shX, l * Math.cos(pose.twist)]; // [x, l] of a shoulder
  const [slx, sll] = tw(-shW);
  const [srx, srl] = tw(shW);
  const hipL = P(0, -hipW, hipZ), hipR = P(0, hipW, hipZ);
  const shL = P(slx, sll, shZ), shR = P(srx, srl, shZ);

  // ----- legs and skates
  const leg = (hip: Pt, foot: Vec3, lat: number): void => {
    const ankle = P(foot[0], foot[1], foot[2] + 0.07);
    const kneeLocal = (hz: number): Vec3 => [
      (foot[0]) / 2 + 0.09 + pose.crouch * 0.4, (lat * hipW + foot[1]) / 2, (hz + foot[2] + 0.07) / 2,
    ];
    const knee = V(kneeLocal(hipZ));
    limb(hip, knee, goalie ? 0.16 : 0.13, pants);
    limb(knee, ankle, goalie ? 0.21 : 0.11, goalie ? pad : pants);
    if (goalie) ball(knee, 0.1, pad, 0.001);
    // skate: boot, then the blade underneath
    limb(P(foot[0] - 0.04, foot[1], foot[2] + 0.06), P(foot[0] + 0.1, foot[1], foot[2] + 0.05), 0.09, '#2b2f38', 1.6);
    limb(P(foot[0] - 0.1, foot[1], foot[2] + 0.005), P(foot[0] + 0.15, foot[1], foot[2] + 0.005), 0.03, '#c9ced6', 1.2);
  };
  leg(hipL, pose.lf, -1);
  leg(hipR, pose.rf, 1);

  // ----- torso (and a stripe across the chest)
  quad([hipL, hipR, shR, shL], goalie ? 0.2 : 0.16, jersey);
  if (!goalie) {
    const sl = mid(hipL, shL, 0.62), sr = mid(hipR, shR, 0.62);
    parts.push({ d: (sl.d + sr.d) / 2 + 0.002, draw: (c) => {
      c.lineCap = 'butt';
      c.beginPath(); c.moveTo(sl.x, sl.y); c.lineTo(sr.x, sr.y);
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 0.05 * K; c.stroke();
    } });
  }

  // ----- stick, hands, arms
  const topP = V(pose.top);
  const dv: Vec3 = [pose.blade[0] - pose.top[0], pose.blade[1] - pose.top[1], pose.blade[2] - pose.top[2]];
  const dl = Math.hypot(...dv) || 1;
  const bladeV: Vec3 = [pose.top[0] + (dv[0] / dl) * STICK, pose.top[1] + (dv[1] / dl) * STICK, Math.max(0, pose.top[2] + (dv[2] / dl) * STICK)];
  const heel = V(bladeV);
  const toe = P(bladeV[0] + 0.13, bladeV[1], bladeV[2] + 0.005);
  const lowV: Vec3 = [pose.top[0] + (dv[0] / dl) * 0.3, pose.top[1] + (dv[1] / dl) * 0.3, pose.top[2] + (dv[2] / dl) * 0.3];
  limb(topP, heel, goalie ? 0.05 : 0.035, '#c79a5b', 1.4);
  limb(heel, toe, 0.05, '#20242b', 1.4);

  const arm = (sh: Pt, hand: Vec3, out: number): void => {
    const h = V(hand);
    const m = mid(sh, h);
    // Elbow: out to the side and a little down.
    const elbow = { x: m.x + out * 0.05 * K * rx, y: m.y + 0.05 * K + out * 0.05 * K * ry * T, d: m.d + out * 0.05 * ry };
    limb(sh, elbow, 0.09, jersey);
    limb(elbow, h, 0.08, jersey);
    ball(h, goalie && out < 0 ? 0.09 : 0.055, goalie && out < 0 ? '#c9a468' : glove, 0.003);
    if (goalie && out > 0) ball(h, 0.085, '#3a4150', 0.004); // blocker
  };
  arm(shL, goalie ? pose.glove : pose.top, -1);
  arm(shR, goalie ? pose.top : lowV, 1);

  // ----- head
  const headL: Vec3 = [shX + 0.07 * sinL + 0.03, 0, shZ + 0.15];
  const head = V(headL);
  ball(head, goalie ? 0.125 : 0.105, helmet, 0.004);
  if (!goalie && fy > -0.35) ball(V([headL[0] + 0.07, 0, headL[2] - 0.01]), 0.055, skin, 0.01);
  if (goalie) ball(V([headL[0] + 0.07, 0, headL[2] - 0.01]), 0.06, '#c9ced6', 0.01);

  // ----- paint, far to near
  const cv = document.createElement('canvas');
  cv.width = W * SS;
  cv.height = H * SS;
  const c = cv.getContext('2d')!;
  c.scale(SS, SS);
  c.translate(AX, AY);
  parts.sort((p, q) => p.d - q.d);
  for (const part of parts) part.draw(c);
  return { img: cv, w: W, h: H, ax: AX, ay: AY };
}
