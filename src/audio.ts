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
  /** True once the browser has let audio start; until then the player needs to press a key or click. */
  readonly running: boolean;
  /** Called every frame: retries unlocking, since a gamepad press alone may not count as a gesture. */
  poll(): void;
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

  let loading = false;
  async function load(): Promise<void> {
    const c = ctx!;
    const buffer = await c.decodeAudioData(await (await fetch(crowdUrl)).arrayBuffer());
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain!);
    src.start();
  }

  // Runs on every key press / click / pad press until the context is actually running.
  const unlock = () => {
    if (!ctx) {
      ctx = new AudioContext();
      gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
    }
    void ctx.resume().then(() => {
      if (ctx!.state !== 'running') return;
      apply();
      if (loading) return;
      loading = true;
      load().catch(() => { loading = false; }); // no audio is better than a broken game
    }).catch(() => {});
  };
  for (const ev of ['keydown', 'pointerdown', 'touchend']) addEventListener(ev, unlock);

  return {
    setActive(a) {
      if (a === active) return;
      active = a;
      apply();
    },
    get running() { return ctx?.state === 'running'; },
    poll() {
      if (ctx?.state === 'running') return;
      if (navigator.getGamepads().some((pad) => pad?.buttons.some((b) => b.pressed))) unlock();
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
      apply();
    },
  };
}
