import crowdUrl from './assets/crowd-loop.wav?url';

// Background arena crowd. Web Audio rather than <audio loop> so the loop is gapless; the clip
// itself is pre-crossfaded to loop seamlessly. Browsers block audio until a user gesture, so
// nothing is created until the first key press or click.
const LEVEL = 0.35; // crowd bed sits under the action
const MUTE_KEY = 'hockey.muted';

export interface Ambience {
  /** True while play is running; the crowd fades out when false (paused). */
  setActive(active: boolean): void;
  toggleMute(): void;
}

export function initAmbience(): Ambience {
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage unavailable */ }
  let active = true;
  let ctx: AudioContext | null = null;
  let gain: GainNode | null = null;

  const apply = () => {
    if (ctx && gain) gain.gain.setTargetAtTime(active && !muted ? LEVEL : 0, ctx.currentTime, 0.15);
  };

  async function start(): Promise<void> {
    ctx = new AudioContext();
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    const buffer = await ctx.decodeAudioData(await (await fetch(crowdUrl)).arrayBuffer());
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    src.start();
    apply();
  }

  const unlock = () => {
    removeEventListener('keydown', unlock);
    removeEventListener('pointerdown', unlock);
    start().catch(() => { ctx = null; gain = null; }); // no audio is better than a broken game
  };
  addEventListener('keydown', unlock);
  addEventListener('pointerdown', unlock);

  return {
    setActive(a) {
      if (a === active) return;
      active = a;
      apply();
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
      apply();
    },
  };
}
