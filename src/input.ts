export interface Intent {
  x: number; // -1..1
  y: number; // -1..1
  action: boolean; // shoot with the puck; burst / bodycheck without it (X on a PS5 pad)
  pass: boolean;   // pass (Square on a PS5 pad)
  switchPlayer?: boolean; // take control of the teammate nearest the puck (Circle on a PS5 pad)
}

export interface KeyMap {
  up: string; down: string; left: string; right: string; action: string; pass: string; switchPlayer: string;
}

/** P1 plays on the keyboard; P2 is gamepad-only (nobody shares one keyboard). */
export const P1_KEYS: KeyMap = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', action: 'Space', pass: 'KeyZ', switchPlayer: 'KeyX' };

const held = new Set<string>();
addEventListener('keydown', (e) => {
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  held.add(e.code);
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

const DEADZONE = 0.2;

/** Keyboard first (if the player has keys); falls back to the gamepad at `padIndex` if idle. */
export function readIntent(keys: KeyMap | null, padIndex: number): Intent {
  let x = keys ? (held.has(keys.right) ? 1 : 0) - (held.has(keys.left) ? 1 : 0) : 0;
  let y = keys ? (held.has(keys.down) ? 1 : 0) - (held.has(keys.up) ? 1 : 0) : 0;
  let action = keys ? held.has(keys.action) : false;
  let pass = keys ? held.has(keys.pass) : false;
  let switchPlayer = keys ? held.has(keys.switchPlayer) : false;

  const pad = navigator.getGamepads()[padIndex];
  if (pad) {
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    if (Math.hypot(ax, ay) > DEADZONE && x === 0 && y === 0) {
      x = ax;
      y = ay;
    }
    // Standard mapping: 0 = bottom face button (Cross / A), 2 = left face button (Square / X).
    action = action || !!pad.buttons[0]?.pressed;
    pass = pass || !!pad.buttons[2]?.pressed;
    switchPlayer = switchPlayer || !!pad.buttons[1]?.pressed; // 1 = right face button (Circle / B)
  }

  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y, action, pass, switchPlayer };
}
