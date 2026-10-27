import crowdUrl from './assets/crowd-loop.wav?url';
import whistleUrl from './assets/whistle.wav?url';
import hornUrl from './assets/horn.mp3?url';
import organUrl from './assets/organ-charge.mp3?url';
import cheerUrl from './assets/crowd-cheer.mp3?url';

// Background arena crowd. Web Audio rather than <audio loop> so the loop is gapless; the clip
// itself is pre-crossfaded to loop seamlessly. Browsers block audio until a user gesture, so
// nothing is created until the first key press or click.
const LEVEL = 0.35; // crowd bed sits under the action
const WHISTLE_LEVEL = 0.5;
const HORN_LEVEL = 0.6;
const ORGAN_LEVEL = 0.5;
const CHEER_LEVEL = 0.6; // the 1 s cheer layers over the crowd bed
const CHEER_FADE_IN = 0.25; // s ramp up from silence
const CHEER_FADE_OUT = 0.4; // s ramp down to silence at the end of the clip
const ORGAN_LOOPS = [2, 3]; // the riff repeats this many times (picked at random)
const MUTE_KEY = 'hockey.muted';

export interface Ambience {
  /** True while play is running; the crowd fades out when false (paused). */
  setActive(active: boolean): void;
  toggleMute(): void;
  /** The referee's whistle (a goalie froze the puck). */
  whistle(): void;
  /** The scoreboard horn at the end of a period. */
  horn(): void;
  /** The arena organ's "charge" riff (home goal, faceoffs, now and then in play), repeated 2-3 times; ignored while it is still playing. */
  organ(): void;
  /** A one-second crowd cheer layered over the bed (goals, now and then a hit or big save). */
  cheer(): void;
}

export function initAmbience(): Ambience {
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage unavailable */ }
  let active = true;
  let ctx: AudioContext | null = null;
  let gain: GainNode | null = null;
  let whistleBuffer: AudioBuffer | null = null;
  let hornBuffer: AudioBuffer | null = null;
  let organBuffer: AudioBuffer | null = null;
  let cheerBuffer: AudioBuffer | null = null;
  let organGain: GainNode | null = null; // so pausing or muting silences a riff already under way
  let organUntil = 0; // ctx time the current riff ends

  const apply = () => {
    if (ctx && gain) gain.gain.setTargetAtTime(active && !muted ? LEVEL : 0, ctx.currentTime, 0.15);
    if (ctx && organGain) organGain.gain.setTargetAtTime(active && !muted ? ORGAN_LEVEL : 0, ctx.currentTime, 0.15);
  };

  async function start(): Promise<void> {
    ctx = new AudioContext();
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    organGain = ctx.createGain();
    organGain.gain.value = 0;
    organGain.connect(ctx.destination);
    const buffer = await ctx.decodeAudioData(await (await fetch(crowdUrl)).arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    src.start();
    apply();
    whistleBuffer = await ctx.decodeAudioData(await (await fetch(whistleUrl)).arrayBuffer());
    hornBuffer = await ctx.decodeAudioData(await (await fetch(hornUrl)).arrayBuffer());
    organBuffer = await ctx.decodeAudioData(await (await fetch(organUrl)).arrayBuffer());
    cheerBuffer = await ctx.decodeAudioData(await (await fetch(cheerUrl)).arrayBuffer());
  }

  const unlock = () => {
    removeEventListener('keydown', unlock);
    removeEventListener('pointerdown', unlock);
    start().catch(() => { ctx = null; gain = null; }); // no audio is better than a broken game
  };
  addEventListener('keydown', unlock);
  addEventListener('pointerdown', unlock);

  const playOnce = (buffer: AudioBuffer | null, level: number) => {
    if (!ctx || !buffer || muted || !active) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = level;
    src.connect(gainNode).connect(ctx.destination);
    src.start();
  };

  return {
    setActive(a) {
      if (a === active) return;
      active = a;
      apply();
    },
    whistle() { playOnce(whistleBuffer, WHISTLE_LEVEL); },
    horn() { playOnce(hornBuffer, HORN_LEVEL); },
    cheer() {
      if (!ctx || !cheerBuffer || muted || !active) return;
      const src = ctx.createBufferSource();
      src.buffer = cheerBuffer;
      const env = ctx.createGain();
      const t0 = ctx.currentTime;
      const end = t0 + cheerBuffer.duration;
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(CHEER_LEVEL, t0 + CHEER_FADE_IN);
      env.gain.setValueAtTime(CHEER_LEVEL, end - CHEER_FADE_OUT);
      env.gain.linearRampToValueAtTime(0, end);
      src.connect(env).connect(ctx.destination);
      src.start(t0);
    },
    organ() {
      if (!ctx || !organGain || !organBuffer || muted || !active || ctx.currentTime < organUntil) return;
      const loops = ORGAN_LOOPS[Math.floor(Math.random() * ORGAN_LOOPS.length)];
      const t0 = ctx.currentTime + 0.05;
      for (let i = 0; i < loops; i++) {
        const src = ctx.createBufferSource();
        src.buffer = organBuffer;
        src.connect(organGain);
        src.start(t0 + i * organBuffer.duration);
      }
      organUntil = t0 + loops * organBuffer.duration;
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
      apply();
    },
  };
}
