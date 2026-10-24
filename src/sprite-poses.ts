/**
 * The animation catalogue: which frames the players need, and the (procedural) pose behind each one.
 * Presentation only; nothing here touches the sim. `SKATER_ANIMS` / `GOALIE_ANIMS` double as the
 * spec for real art: each entry is one animation, `frames` frames in each of the 8 facings (or the
 * goalie's 2). The sprite lab (`sprites.html`) renders them all.
 *
 * Poses are in a skater-local frame: x forward, l to the skater's right, z up, in units of roughly
 * one skater height (a standing skater is about 1.1 tall). The rig in `sprite-rig.ts` turns a pose
 * into pixels for any facing.
 *
 * The stick is held the way a player holds it: both hands on the shaft, the top (left) hand at the
 * belt in front of the body, the lower (right) hand about a third of the way down, and the butt end
 * poking out past the top hand. A pose gives the top hand (`top`) and a point to aim the shaft at
 * (`blade`); the rig fixes the stick's length and the grip spacing. `free` takes the lower hand off
 * the stick (it goes to `glove`), for fist pumps and flailing.
 */

export type Vec3 = [number, number, number]; // forward, right, up

export interface Pose {
  pitch: number;  // whole body tips about the feet (rad); + = forward
  roll: number;   // whole body tips sideways about the feet (rad); + = toward the skater's right
  shift: number;  // whole body slides sideways (+ = right)
  crouch: number; // hips drop this far
  lean: number;   // torso forward lean (rad)
  twist: number;  // shoulders turn about vertical (rad); + pulls the right shoulder back
  lf: Vec3; rf: Vec3;   // left / right foot (z = lift off the ice)
  top: Vec3;            // top hand, which is where the stick is held
  blade: Vec3;          // a point to aim the shaft at, from the top hand
  glove: Vec3;          // the other hand when it is off the stick (goalie's glove; `free` for skaters)
  free: number;         // 1 = skater's lower hand is off the stick, at `glove`
}

export interface PoseOpts {
  carry: boolean; // has the puck: stick out front, blade working side to side
}

export interface AnimDef {
  frames: number;
  fps: number;       // playback rate; for skate it is ignored (strides follow distance travelled)
  loop: boolean;
  carry?: boolean;   // has a with-puck variant
  sided?: boolean;   // direction-dependent (goalie slide); the rig mirrors the pose for side = -1
  pose: (t: number, o: PoseOpts) => Pose; // t in 0..1 over the animation
  note: string;      // what the frames show / when the game plays it
}

const TAU = Math.PI * 2;

export const BASE: Pose = {
  pitch: 0, roll: 0, shift: 0, crouch: 0.05, lean: 0.22, twist: 0,
  lf: [0, -0.12, 0], rf: [0, 0.12, 0],
  top: [0.28, 0.06, 0.62], blade: [0.72, 0.2, 0], glove: [0.3, -0.3, 0.62], free: 0,
};

const pose = (over: Partial<Pose>): Pose => ({ ...BASE, ...over });

function mix<T extends number | number[]>(a: T, b: T, t: number): T {
  if (typeof a === 'number') return (a + ((b as number) - a) * t) as T;
  return (a as number[]).map((v, i) => v + ((b as number[])[i] - v) * t) as T;
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = {} as Record<string, number | number[]>;
  for (const k of Object.keys(a) as (keyof Pose)[]) out[k] = mix(a[k], b[k], t);
  return out as unknown as Pose;
}

/** Piecewise-eased path through key poses; t = 0 is the first key, t = 1 the last. */
function track(...keys: Pose[]): (t: number) => Pose {
  return (t) => {
    const x = Math.min(Math.max(t, 0), 1) * (keys.length - 1);
    const i = Math.min(Math.floor(x), keys.length - 2);
    const f = x - i;
    return lerpPose(keys[i], keys[i + 1], f * f * (3 - 2 * f));
  };
}

/** Mirror a pose left-right (used for the goalie's slide to the other side). */
export function mirrorPose(p: Pose): Pose {
  const m = (v: Vec3): Vec3 => [v[0], -v[1], v[2]];
  return { ...p, roll: -p.roll, shift: -p.shift, twist: -p.twist, lf: m(p.rf), rf: m(p.lf), top: m(p.top), blade: m(p.blade), glove: m(p.glove) };
}

/** A skating stride; `t` is one full left+right cycle. */
function stride(t: number, o: { amp: number; lift: number; push: number; lean: number; crouch: number; hands: number }, carry: boolean): Pose {
  const ph = t * TAU;
  const foot = (off: number, side: number): Vec3 => {
    const a = ph + off;
    return [o.amp * Math.sin(a), side * (0.12 + o.push * Math.max(0, -Math.cos(a))), o.lift * Math.max(0, Math.cos(a))];
  };
  const sway = Math.sin(ph);
  return pose({
    crouch: o.crouch + 0.02 * Math.cos(2 * ph), lean: o.lean, twist: 0.1 * sway,
    lf: foot(0, -1), rf: foot(Math.PI, 1),
    // Stick out front; carrying, the blade works side to side across the puck.
    top: [0.3, 0.05, o.hands],
    blade: carry ? [0.8, 0.08 + 0.2 * sway, 0] : [0.72 + 0.04 * sway, 0.2, 0],
  });
}

export type SkaterAnimName =
  | 'idle' | 'skate' | 'burst' | 'faceoff' | 'wind' | 'wrist' | 'slap' | 'pass' | 'poke' | 'check' | 'hit' | 'celebrate';
export type GoalieAnimName = 'stand' | 'drop' | 'slide' | 'butterfly' | 'getup';

// The shot's drawn-back and raised poses. The slapshot wind-up has the stick up over the shoulder.
const DRAWN = pose({ lean: 0.34, twist: 0.3, top: [0.18, 0.1, 0.58], blade: [-0.5, 0.3, 0] });
const RAISED = pose({ lean: 0.25, twist: 0.6, crouch: 0.04, top: [0.08, 0.1, 0.95], blade: [-0.1, 0.2, 1.9] });

export const SKATER_ANIMS: Record<SkaterAnimName, AnimDef> = {
  idle: {
    frames: 2, fps: 2, loop: true, carry: true,
    note: 'Gliding or standing: ready stance, both hands on the stick in front of the belt, a little breathing bob. Played when barely moving.',
    pose: (t, o) => pose({
      crouch: 0.06 + 0.014 * Math.sin(t * TAU), lean: 0.2,
      top: [o.carry ? 0.3 : 0.28, 0.05, 0.6], blade: o.carry ? [0.8, 0.1, 0] : BASE.blade,
    }),
  },
  skate: {
    frames: 8, fps: 0, loop: true, carry: true,
    note: 'One full left+right stride. Played by distance travelled, so it never moonwalks. With the puck the blade works side to side.',
    pose: (t, o) => stride(t, { amp: 0.2, lift: 0.1, push: 0.07, lean: 0.3, crouch: 0.08, hands: 0.62 }, o.carry),
  },
  burst: {
    frames: 6, fps: 0, loop: true, carry: true,
    note: 'Hard skating after burst taps: deeper crouch, longer wider stride, hands dropped.',
    pose: (t, o) => stride(t, { amp: 0.3, lift: 0.17, push: 0.12, lean: 0.5, crouch: 0.15, hands: 0.52 }, o.carry),
  },
  faceoff: {
    frames: 1, fps: 1, loop: true,
    note: 'Crouched over the dot, blade flat on the ice. Played during the faceoff pause.',
    pose: () => pose({ crouch: 0.2, lean: 0.62, lf: [0.02, -0.21, 0], rf: [0.02, 0.21, 0], top: [0.32, 0.05, 0.46], blade: [0.8, 0.1, 0] }),
  },
  wind: {
    frames: 4, fps: 0, loop: false,
    note: 'Shot charge (button held with the puck). Frame = how charged: stick draws back, then rises over the shoulder. Hold the last frame at full charge.',
    pose: track(
      pose({ lean: 0.32, twist: 0.1, top: [0.3, 0.05, 0.6], blade: [0.8, 0.1, 0] }),
      DRAWN,
      pose({ lean: 0.3, twist: 0.45, top: [0.12, 0.1, 0.8], blade: [-0.4, 0.25, 0.5] }),
      RAISED,
    ),
  },
  wrist: {
    frames: 4, fps: 16, loop: false,
    note: 'Wrist shot / snap shot release: draw back, sweep, flick, follow-through.',
    pose: track(
      DRAWN,
      pose({ lean: 0.4, twist: -0.1, top: [0.35, 0.14, 0.6], blade: [0.85, 0.22, 0] }),
      pose({ lean: 0.42, twist: -0.25, top: [0.45, 0.1, 0.64], blade: [1.0, 0.1, 0.25] }),
      pose({ lean: 0.35, twist: -0.3, top: [0.4, 0.04, 0.8], blade: [0.8, -0.1, 0.95] }),
    ),
  },
  slap: {
    frames: 5, fps: 12, loop: false,
    note: 'Slapshot release from the raised stick: downswing, impact (hard lean), follow-through, recover.',
    pose: track(
      RAISED,
      pose({ lean: 0.5, twist: 0.2, crouch: 0.1, top: [0.1, 0.12, 0.8], blade: [0.35, 0.25, 0.2] }),
      pose({ lean: 0.7, twist: -0.35, crouch: 0.14, top: [0.32, 0.1, 0.55], blade: [0.8, 0.2, 0] }),
      pose({ lean: 0.55, twist: -0.55, top: [0.35, 0, 0.85], blade: [0.5, -0.2, 1.4] }),
      pose({ lean: 0.4, twist: -0.3, top: [0.32, 0.06, 0.7], blade: [0.78, 0.15, 0.1] }),
    ),
  },
  pass: {
    frames: 3, fps: 15, loop: false,
    note: 'Pass: pull back, push through, follow-through along the pass line.',
    pose: track(
      pose({ twist: 0.3, top: [0.2, 0.12, 0.58], blade: [-0.2, 0.34, 0] }),
      pose({ lean: 0.4, twist: -0.1, top: [0.4, 0.1, 0.58], blade: [0.9, 0.18, 0] }),
      pose({ lean: 0.35, top: [0.45, 0.08, 0.6], blade: [0.95, 0.1, 0.12] }),
    ),
  },
  poke: {
    frames: 4, fps: 22, loop: false,
    note: 'Poke check: stick shoots out along the facing, lunging forward, then pulls back (0.18s in the sim).',
    pose: track(
      pose({ top: [0.3, 0.05, 0.6], blade: [0.8, 0.1, 0] }),
      pose({ lean: 0.5, lf: [0.15, -0.12, 0], rf: [-0.1, 0.12, 0], top: [0.5, 0.08, 0.56], blade: [1.3, 0.14, 0.1] }),
      pose({ lean: 0.6, crouch: 0.12, lf: [0.28, -0.12, 0], rf: [-0.2, 0.13, 0], top: [0.62, 0.06, 0.5], blade: [1.45, 0.1, 0.05] }),
      pose({ lean: 0.4, top: [0.4, 0.06, 0.6], blade: [0.95, 0.14, 0.1] }),
    ),
  },
  check: {
    frames: 4, fps: 11.4, loop: false,
    note: 'Body check (the window a burst tap opens): drop the shoulder and lean in, stick tucked behind in one hand, the other arm braced forward. Plays over the 0.35s check window.',
    pose: track(
      pose({ lean: 0.4, twist: 0.4, crouch: 0.08, top: [0.1, 0.2, 0.6], blade: [-0.5, 0.35, 0] }),
      pose({ pitch: 0.1, lean: 0.55, twist: 0.6, crouch: 0.1, lf: [0.28, -0.15, 0], rf: [-0.25, 0.14, 0], top: [0.02, 0.25, 0.5], blade: [-0.55, 0.4, 0], free: 1, glove: [0.5, 0.12, 0.75] }),
      pose({ pitch: 0.14, lean: 0.62, twist: 0.6, crouch: 0.12, lf: [0.32, -0.15, 0], rf: [-0.3, 0.14, 0], top: [0.02, 0.25, 0.5], blade: [-0.55, 0.4, 0], free: 1, glove: [0.52, 0.12, 0.72] }),
      pose({ lean: 0.5, twist: 0.2, crouch: 0.1 }),
    ),
  },
  hit: {
    frames: 4, fps: 0, loop: false,
    note: 'Knocked back by a check (the stun, 0.6s): jolt, stagger with arms flung, scramble back up. Frame follows the stun timer.',
    pose: track(
      pose({ pitch: -0.15, lean: 0.1, roll: 0.1, lf: [0.1, -0.16, 0.04], rf: [-0.1, 0.16, 0], top: [0.2, 0.3, 0.75], blade: [0.2, 0.7, 0.4], free: 1, glove: [0.1, 0.5, 0.8] }),
      pose({ pitch: -0.4, lean: -0.15, crouch: 0, roll: 0.15, lf: [-0.25, -0.2, 0.1], rf: [0.2, 0.2, 0], top: [0.05, 0.4, 0.95], blade: [-0.2, 0.8, 0.6], free: 1, glove: [-0.1, 0.55, 1.0] }),
      pose({ pitch: -0.3, lean: 0, roll: 0.1, lf: [-0.15, -0.18, 0.05], rf: [0.15, 0.18, 0], top: [0.12, 0.35, 0.85], blade: [0.2, 0.8, 0.5], free: 1, glove: [0.05, 0.5, 0.9] }),
      pose({ pitch: -0.08, lean: 0.25, top: [0.25, 0.1, 0.62], blade: [0.7, 0.3, 0] }),
    ),
  },
  celebrate: {
    frames: 4, fps: 6, loop: true,
    note: 'Goal celebration for the scoring team: stick overhead in one hand, fist pumping. Loops through the goal pause.',
    pose: (t) => pose({
      crouch: 0.02 + 0.02 * Math.sin(t * TAU), lean: 0.05, twist: 0.3 * Math.sin(t * TAU),
      lf: [0, -0.14, 0], rf: [0, 0.14, 0],
      top: [0.12, 0.05, 0.9 + 0.06 * Math.sin(t * TAU)], blade: [0.2, 0.1, 2], free: 1,
      glove: [0.15, 0.25, 1.1 + 0.1 * Math.sin(t * TAU)],
    }),
  },
};

const GOALIE_STAND = pose({
  crouch: 0.14, lean: 0.2, lf: [0, -0.18, 0], rf: [0, 0.18, 0],
  top: [0.34, 0.26, 0.46], blade: [0.92, 0.28, 0], glove: [0.32, -0.34, 0.66],
});
const GOALIE_FLY = pose({
  crouch: 0.3, lean: 0.12, lf: [-0.15, -0.45, 0], rf: [-0.15, 0.45, 0],
  top: [0.3, 0.34, 0.36], blade: [0.85, 0.36, 0], glove: [0.25, -0.55, 0.35],
});

export const GOALIE_ANIMS: Record<GoalieAnimName, AnimDef> = {
  stand: {
    frames: 2, fps: 2, loop: true,
    note: 'Ready stance in the crease: crouched, blocker on the stick, glove up, stick flat on the ice out front. Faces up- or down-ice (2 facings).',
    pose: (t) => ({ ...GOALIE_STAND, crouch: 0.14 - 0.015 * Math.sin(t * TAU), glove: [0.32, -0.34, 0.66 + 0.04 * Math.sin(t * TAU)] }),
  },
  drop: {
    frames: 3, fps: 20, loop: false,
    note: 'Straight drop into the butterfly (a shot at the goalie\'s own spot): knees splay, pads flatten.',
    pose: track(
      pose({ ...GOALIE_STAND, crouch: 0.22, lf: [0.1, -0.25, 0], rf: [0.1, 0.25, 0] }),
      pose({ ...GOALIE_STAND, crouch: 0.3, lean: 0.1, lf: [-0.05, -0.38, 0], rf: [-0.05, 0.38, 0], glove: [0.3, -0.5, 0.5] }),
      GOALIE_FLY,
    ),
  },
  slide: {
    frames: 3, fps: 10, loop: false, sided: true,
    note: 'Sideways butterfly dive (the 0.3s slide). Drawn for a dive to the goalie\'s right; the rig mirrors it for the other side.',
    pose: track(
      pose({ ...GOALIE_FLY, roll: 0.3, shift: 0.2 }),
      pose({ ...GOALIE_FLY, roll: 0.75, shift: 0.45, crouch: 0.2, rf: [0, 0.75, 0], lf: [-0.1, 0.1, 0.08], glove: [0.3, -0.2, 0.2], top: [0.3, 0.55, 0.3], blade: [0.8, 0.7, 0] }),
      pose({ ...GOALIE_FLY, roll: 0.55, shift: 0.6, crouch: 0.22, rf: [0, 0.8, 0], lf: [-0.1, 0.15, 0.05] }),
    ),
  },
  butterfly: {
    frames: 1, fps: 1, loop: true,
    note: 'Down in the butterfly, held until the goalie recovers.',
    pose: () => GOALIE_FLY,
  },
  getup: {
    frames: 3, fps: 12, loop: false,
    note: 'Back up from the butterfly: the reverse of the drop. Plays over the last moments of the goalie being down.',
    pose: track(
      GOALIE_FLY,
      pose({ ...GOALIE_STAND, crouch: 0.3, lf: [-0.05, -0.38, 0], rf: [-0.05, 0.38, 0] }),
      GOALIE_STAND,
    ),
  },
};

/** The pose for frame `frame` of `def`: loops sample 0..1 exclusive of the end; one-shots run first key to last. */
export function framePose(def: AnimDef, frame: number, o: PoseOpts): Pose {
  const n = def.frames;
  const f = ((frame % n) + n) % n;
  return def.pose(def.loop ? f / n : n > 1 ? f / (n - 1) : 0, o);
}
