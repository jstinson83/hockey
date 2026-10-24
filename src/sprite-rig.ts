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

const K = 48;          // px per pose unit at 1x
const SS = 2;          // supersampling
const W = 128;
const H = 120;
const AX = 64;
const AY = 90;
const STICK = 0.86;    // stick length, pose units (about 0.8 of a skater's height, like the reference art)
const BUTT = 0.1;      // how far the stick pokes out past the top hand
const GRIP = 0.32;     // gap between the hands on the shaft
const OUTLINE = '#12151c';
const TRIM = '#1c2440'; // helmet, gloves and jersey stripes

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

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Two-bone limb: where the middle joint (elbow / knee) goes so a limb with segment lengths l1, l2
 * reaches from a to b, bending toward `pole`. If b is out of reach the limb is lengthened a little
 * rather than stretched off the body.
 */
function ik(a: Vec3, b: Vec3, l1: number, l2: number, pole: Vec3): Vec3 {
  const d = sub(b, a);
  const dist = len(d) || 1e-6;
  const s = Math.max(1, dist / ((l1 + l2) * 0.97));
  const m1 = l1 * s, m2 = l2 * s;
  const u: Vec3 = [d[0] / dist, d[1] / dist, d[2] / dist];
  const along = (m1 * m1 - m2 * m2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, m1 * m1 - along * along));
  const perp = unit(add(pole, u, -dot(pole, u)));
  return add(add(a, u, along), perp, h);
}

function bake(pose: Pose, dir: number, kind: 'skater' | 'goalie', color: string): SpriteFrame {
  const goalie = kind === 'goalie';
  const a = (dir * Math.PI) / 4;
  const fx = Math.cos(a), fy = Math.sin(a);   // forward, in the world
  const rx = -Math.sin(a), ry = Math.cos(a);  // the skater's right
  const T = VIEW.tilt;

  // Pose-local (forward, right, up) -> screen px relative to the feet; d = depth (bigger = nearer the camera).
  const P = (x: number, l: number, z: number): Pt => {
    const x1 = x * Math.cos(pose.pitch) + z * Math.sin(pose.pitch);
    let z1 = z * Math.cos(pose.pitch) - x * Math.sin(pose.pitch);
    const l1 = l * Math.cos(pose.roll) + z1 * Math.sin(pose.roll) + pose.shift;
    z1 = Math.max(0, z1 * Math.cos(pose.roll) - l * Math.sin(pose.roll));
    const wx = x1 * fx + l1 * rx;
    const wy = x1 * fy + l1 * ry;
    return { x: wx * K, y: wy * T * K - z1 * K, d: wy };
  };
  const V = (v: Vec3): Pt => P(v[0], v[1], v[2]);
  const mid = (p: Pt, q: Pt, t = 0.5): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, d: p.d + (q.d - p.d) * t });

  const jersey = color;
  const pants = shade(color, 0.8);
  const sock = shade(color, 0.9);
  const helmet = goalie ? '#f2f4f7' : TRIM;
  const skin = '#e9b98f';
  const glove = TRIM;
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
  /** A stripe across part of a limb: from fraction t0 to t1 along p -> q. */
  const band = (p: Pt, q: Pt, t0: number, t1: number, w: number, fill: string): void => {
    const s = mid(p, q, t0), e = mid(p, q, t1);
    parts.push({ d: (p.d + q.d) / 2 + 0.0005, draw: (c) => {
      c.lineCap = 'butt';
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(e.x, e.y);
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
  const hipZ = 0.56 - pose.crouch;
  const hipW = goalie ? 0.11 : 0.1;
  const torsoLen = 0.44;
  const sinL = Math.sin(pose.lean), cosL = Math.cos(pose.lean);
  const shW = goalie ? 0.2 : 0.17;
  const shZ = hipZ + torsoLen * cosL;
  const shX = torsoLen * sinL;
  const tw = (l: number): [number, number] => [-l * Math.sin(pose.twist) + shX, l * Math.cos(pose.twist)]; // [x, l] of a shoulder
  const [slx, sll] = tw(-shW);
  const [srx, srl] = tw(shW);
  const shL = P(slx, sll, shZ), shR = P(srx, srl, shZ);
  const shLv: Vec3 = [slx, sll, shZ], shRv: Vec3 = [srx, srl, shZ];

  // ----- legs: thigh, shin (a striped sock), skate
  const leg = (hipV: Vec3, foot: Vec3, side: number): void => {
    const ankleV: Vec3 = [foot[0], foot[1], foot[2] + 0.07];
    const kneeV = ik(hipV, ankleV, 0.28, 0.28, [1, side * 0.25, 0.1]);
    const hip = V(hipV), knee = V(kneeV), ankle = V(ankleV);
    limb(hip, knee, goalie ? 0.17 : 0.14, pants);
    limb(knee, ankle, goalie ? 0.22 : 0.11, goalie ? pad : sock);
    if (goalie) ball(knee, 0.11, pad, 0.001);
    else {
      band(knee, ankle, 0.5, 0.65, 0.12, TRIM);
      band(knee, ankle, 0.7, 0.8, 0.12, '#f1f3f6');
    }
    // skate: boot, then the blade underneath
    limb(P(foot[0] - 0.04, foot[1], foot[2] + 0.065), P(foot[0] + 0.11, foot[1], foot[2] + 0.055), 0.1, '#dfe2e8', 1.8);
    limb(P(foot[0] - 0.11, foot[1], foot[2] + 0.008), P(foot[0] + 0.16, foot[1], foot[2] + 0.008), 0.03, '#454b57', 1.4);
  };
  leg([0, -hipW, hipZ], pose.lf, -1);
  leg([0, hipW, hipZ], pose.rf, 1);

  // ----- torso: jersey with waist stripes and shoulder pads
  const hemL = P(0, -hipW - 0.03, hipZ - 0.05), hemR = P(0, hipW + 0.03, hipZ - 0.05);
  quad([hemL, hemR, shR, shL], goalie ? 0.22 : 0.15, jersey);
  if (!goalie) {
    for (const f of [0.14, 0.26]) {
      const sl = mid(hemL, shL, f), sr = mid(hemR, shR, f);
      parts.push({ d: (sl.d + sr.d) / 2 + 0.002, draw: (c) => {
        c.lineCap = 'butt';
        c.beginPath(); c.moveTo(sl.x, sl.y); c.lineTo(sr.x, sr.y);
        c.strokeStyle = f < 0.2 ? TRIM : '#f1f3f6'; c.lineWidth = 0.045 * K; c.stroke();
      } });
    }
  }
  ball(shL, goalie ? 0.095 : 0.08, jersey, 0.0015);
  ball(shR, goalie ? 0.095 : 0.08, jersey, 0.0015);

  // ----- stick: the top hand sets the position, `blade` the aim; both hands sit on the shaft
  const dirV = unit(sub(pose.blade, pose.top));
  const buttV = add(pose.top, dirV, -BUTT);
  const heelV = add(buttV, dirV, STICK);
  heelV[2] = Math.max(0, heelV[2]);
  const hz = Math.hypot(dirV[0], dirV[1]) || 1;
  const bladeDir: [number, number] = hz > 0.25 ? [dirV[0] / hz, dirV[1] / hz] : [1, 0]; // toe points along the shaft's ground track
  const toeV: Vec3 = [heelV[0] + bladeDir[0] * 0.18, heelV[1] + bladeDir[1] * 0.18, heelV[2] + 0.005];
  const butt = V(buttV), heel = V(heelV), toe = V(toeV);
  limb(butt, heel, goalie ? 0.055 : 0.04, '#d6ad6c', 1.4);
  limb(heel, toe, goalie ? 0.09 : 0.06, '#b98a4b', 1.4);
  band(heel, toe, 0.35, 1, goalie ? 0.09 : 0.06, '#23262d');

  // ----- arms: shoulder -> elbow -> hand, elbows out and down
  const hands = (): { l: Vec3; r: Vec3 } => {
    if (goalie) return { l: pose.glove, r: pose.top }; // blocker holds the stick, glove is free
    const lower = add(pose.top, dirV, GRIP);
    return { l: pose.top, r: pose.free > 0.5 ? pose.glove : lower };
  };
  const h = hands();
  const arm = (shV: Vec3, handV: Vec3, side: number): void => {
    const elbowV = ik(shV, handV, 0.22, 0.22, [-0.2, side * 0.8, -0.7]);
    const sh = V(shV), elbow = V(elbowV), hand = V(handV);
    limb(sh, elbow, 0.1, jersey);
    limb(elbow, hand, 0.085, jersey);
    if (!goalie) band(elbow, hand, 0.45, 0.65, 0.085, TRIM);
    if (goalie && side < 0) ball(hand, 0.1, '#c9a468', 0.02); // catching glove
    else if (goalie) ball(hand, 0.09, '#3a4150', 0.02);       // blocker
    else ball(hand, 0.07, glove, 0.02);
  };
  arm(shLv, h.l, -1);
  arm(shRv, h.r, 1);

  // ----- head: helmet with a visor over the face
  const headL: Vec3 = [shX + 0.07 * sinL + 0.03, 0, shZ + 0.2];
  const head = V(headL);
  ball(head, goalie ? 0.14 : 0.13, helmet, 0.004);
  if (!goalie && fy > -0.35) {
    ball(V([headL[0] + 0.09, 0, headL[2] - 0.03]), 0.065, skin, 0.01);
    limb(V([headL[0] + 0.115, -0.07, headL[2] - 0.01]), V([headL[0] + 0.115, 0.07, headL[2] - 0.01]), 0.055, 'rgba(190,230,255,0.6)', 0);
  }
  if (goalie) ball(V([headL[0] + 0.08, 0, headL[2] - 0.01]), 0.065, '#c9ced6', 0.01);

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
