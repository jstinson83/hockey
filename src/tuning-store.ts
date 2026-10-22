/**
 * Persistence for live tuning edits (pure functions over a storage-like object, so they test
 * without a browser). Only values that differ from the code's defaults are stored, each with the
 * default it was based on: if the code's default for that value changes later, the stale saved
 * value is dropped and the new default wins.
 */
export type Numbers = Record<string, number>;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'hockey.tuning.v1';

interface Saved {
  v: 1;
  overrides: Record<string, { value: number; base: number }>;
}

/** Values that differ from the defaults. */
export function changedValues(current: Numbers, defaults: Numbers): Numbers {
  const out: Numbers = {};
  for (const key of Object.keys(defaults)) if (current[key] !== defaults[key]) out[key] = current[key];
  return out;
}

export function saveOverrides(storage: StorageLike, current: Numbers, defaults: Numbers): void {
  try {
    const changed = changedValues(current, defaults);
    const keys = Object.keys(changed);
    if (keys.length === 0) {
      storage.removeItem(STORAGE_KEY);
      return;
    }
    const saved: Saved = { v: 1, overrides: {} };
    for (const key of keys) saved.overrides[key] = { value: changed[key], base: defaults[key] };
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Storage can be blocked or full; tuning just won't persist.
  }
}

/** Apply saved overrides onto `target`; returns the keys applied. */
export function loadOverrides(storage: StorageLike, target: Numbers, defaults: Numbers): string[] {
  const applied: string[] = [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return applied;
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (saved.v !== 1 || typeof saved.overrides !== 'object' || saved.overrides === null) return applied;
    for (const [key, o] of Object.entries(saved.overrides)) {
      if (!(key in defaults) || !o || !Number.isFinite(o.value)) continue;
      if (o.base !== defaults[key]) continue; // the code's default moved on; don't resurrect the old edit
      target[key] = o.value;
      applied.push(key);
    }
  } catch {
    // Corrupt or inaccessible storage: ignore it.
  }
  return applied;
}
