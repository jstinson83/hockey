export interface Intent {
  x: number; // -1..1
  y: number; // -1..1
  action: boolean;
}

export interface KeyMap {
  up: string; down: string; left: string; right: string; action: string;
}

export const P1_KEYS: KeyMap = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: 'Space' };
export const P2_KEYS: KeyMap = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', action: 'Enter' };

const held = new Set<string>();
addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  held.add(e.code);
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

const DEADZONE = 0.2;

/** Keyboard first; falls back to the gamepad at `padIndex` if the keys are idle. */
export function readIntent(keys: KeyMap, padIndex: number): Intent {
  let x = (held.has(keys.right) ? 1 : 0) - (held.has(keys.left) ? 1 : 0);
  let y = (held.has(keys.down) ? 1 : 0) - (held.has(keys.up) ? 1 : 0);
  let action = held.has(keys.action);

  const pad = navigator.getGamepads()[padIndex];
  if (pad) {
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    if (Math.hypot(ax, ay) > DEADZONE && x === 0 && y === 0) {
      x = ax;
      y = ay;
    }
    action = action || !!pad.buttons[0]?.pressed;
  }

  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y, action };
}
