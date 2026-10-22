import { describe, expect, it } from 'vitest';
import { TUNING } from './sim-constants';
import { TUNING_GROUPS } from './tuning-meta';
import { changedValues, loadOverrides, saveOverrides, STORAGE_KEY, type Numbers, type StorageLike } from './tuning-store';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

describe('tuning panel metadata', () => {
  const params = TUNING_GROUPS.flatMap((g) => g.params);

  it('has a control for every TUNING value, exactly once (add new values to tuning-meta.ts)', () => {
    const keys = params.map((p) => p.key).sort();
    expect(keys).toEqual(Object.keys(TUNING).sort());
  });

  it('has sensible ranges that contain each default', () => {
    const t = TUNING as unknown as Numbers;
    for (const p of params) {
      expect(p.min, p.key).toBeLessThan(p.max);
      expect(p.step, p.key).toBeGreaterThan(0);
      expect(t[p.key], p.key).toBeGreaterThanOrEqual(p.min);
      expect(t[p.key], p.key).toBeLessThanOrEqual(p.max);
      expect(p.label.length, p.key).toBeGreaterThan(0);
    }
  });
});

describe('tuning persistence', () => {
  const defaults: Numbers = { a: 1, b: 2, c: 3 };

  it('stores only what differs from the defaults, and restores it', () => {
    const s = fakeStorage();
    saveOverrides(s, { a: 1, b: 5, c: 3 }, defaults);
    expect(JSON.parse(s.data[STORAGE_KEY]).overrides).toEqual({ b: { value: 5, base: 2 } });

    const target = { ...defaults };
    expect(loadOverrides(s, target, defaults)).toEqual(['b']);
    expect(target).toEqual({ a: 1, b: 5, c: 3 });
  });

  it('clears storage when everything is back to the defaults', () => {
    const s = fakeStorage();
    saveOverrides(s, { a: 9, b: 2, c: 3 }, defaults);
    expect(s.data[STORAGE_KEY]).toBeDefined();
    saveOverrides(s, { ...defaults }, defaults);
    expect(s.data[STORAGE_KEY]).toBeUndefined();
  });

  it('drops a saved edit whose default has since changed in the code', () => {
    const s = fakeStorage();
    saveOverrides(s, { a: 1, b: 5, c: 3 }, defaults); // saved against b's default of 2
    const target = { a: 1, b: 4, c: 3 };               // the code's default for b is now 4
    expect(loadOverrides(s, target, { a: 1, b: 4, c: 3 })).toEqual([]);
    expect(target.b).toBe(4);
  });

  it('ignores unknown keys, non-numbers, and corrupt data', () => {
    const bad = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({ v: 1, overrides: { zzz: { value: 1, base: 1 }, a: { value: 'x', base: 1 }, b: { value: 7, base: 2 } } }),
    });
    const target = { ...defaults };
    expect(loadOverrides(bad, target, defaults)).toEqual(['b']);
    expect(target).toEqual({ a: 1, b: 7, c: 3 });

    for (const junk of ['not json', '{"v":2}', 'null', '[]']) {
      const s = fakeStorage({ [STORAGE_KEY]: junk });
      expect(() => loadOverrides(s, { ...defaults }, defaults)).not.toThrow();
      expect(loadOverrides(s, { ...defaults }, defaults)).toEqual([]);
    }
  });

  it('survives storage that throws', () => {
    const boom: StorageLike = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('full'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(() => saveOverrides(boom, { a: 2, b: 2, c: 3 }, defaults)).not.toThrow();
    expect(loadOverrides(boom, { ...defaults }, defaults)).toEqual([]);
  });

  it('changedValues lists only the differences', () => {
    expect(changedValues({ a: 1, b: 9, c: 3 }, defaults)).toEqual({ b: 9 });
  });
});
