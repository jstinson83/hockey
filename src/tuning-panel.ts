import { TUNING } from './sim-constants';
import { TUNING_GROUPS } from './tuning-meta';
import { changedValues, loadOverrides, saveOverrides, type Numbers } from './tuning-store';

/**
 * Live tuning overlay: a slider and number box per TUNING value. Edits apply immediately,
 * persist in this browser (see tuning-store), and "Copy changes" exports what differs from
 * the code's defaults so it can be folded back into sim-constants.ts.
 */
export interface TuningPanel {
  toggle(): void;
  /** True while the panel is open and "Pause while open" is checked. */
  pausesGame(): boolean;
}

const live = TUNING as unknown as Numbers;
const DEFAULTS: Numbers = { ...live };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function decimals(step: number): number {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function initTuningPanel(root: HTMLElement): TuningPanel {
  const store = storage();
  if (store) loadOverrides(store, live, DEFAULTS);

  root.innerHTML = `
    <header>
      <strong>Tuning</strong>
      <label class="pause"><input type="checkbox" id="tuning-pause" /> pause while open</label>
      <span class="grow"></span>
      <button type="button" id="tuning-copy" title="Copy the values that differ from the defaults">Copy changes</button>
      <button type="button" id="tuning-reset" title="Back to the code's defaults">Reset all</button>
      <button type="button" id="tuning-close" title="Close (T)">✕</button>
    </header>
    <div class="body"></div>
    <textarea id="tuning-export" readonly hidden rows="8"></textarea>
    <footer>Saved in this browser. <b>T</b> toggles. “Copy changes” gives the values to send back as new defaults.</footer>`;

  const body = root.querySelector<HTMLElement>('.body')!;
  const pauseBox = root.querySelector<HTMLInputElement>('#tuning-pause')!;
  const exportBox = root.querySelector<HTMLTextAreaElement>('#tuning-export')!;

  type Row = { key: string; range: HTMLInputElement; num: HTMLInputElement; undo: HTMLButtonElement; row: HTMLElement; group: HTMLElement; step: number };
  const rows: Row[] = [];
  const groupBadges = new Map<HTMLElement, HTMLElement>();

  const persist = () => { if (store) saveOverrides(store, live, DEFAULTS); };

  function refresh(r: Row): void {
    const v = live[r.key];
    const d = decimals(r.step);
    r.range.value = String(v);
    r.num.value = Number.isInteger(v) ? String(v) : String(+v.toFixed(Math.max(d, 3)));
    const changed = v !== DEFAULTS[r.key];
    r.row.classList.toggle('changed', changed);
    r.undo.hidden = !changed;
  }

  function refreshBadges(): void {
    for (const [group, badge] of groupBadges) {
      const n = group.querySelectorAll('.row.changed').length;
      badge.textContent = n ? `${n} changed` : '';
    }
  }

  function set(r: Row, value: number): void {
    if (!Number.isFinite(value)) return;
    live[r.key] = value;
    refresh(r);
    refreshBadges();
    persist();
  }

  TUNING_GROUPS.forEach((g, gi) => {
    const details = document.createElement('details');
    details.open = gi === 0;
    const summary = document.createElement('summary');
    summary.innerHTML = `<span>${g.title}</span><em></em>`;
    details.appendChild(summary);
    groupBadges.set(details, summary.querySelector('em')!);

    for (const p of g.params) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <span class="name" title="${p.hint ?? p.key}">${p.label}<small>${p.key}${p.hint ? ' · ' + p.hint : ''}</small></span>
        <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" />
        <input type="number" step="${p.step}" />
        <button type="button" class="undo" title="Reset to ${DEFAULTS[p.key]}" hidden>↺</button>`;
      const [range, num] = Array.from(row.querySelectorAll('input')) as HTMLInputElement[];
      const undo = row.querySelector<HTMLButtonElement>('.undo')!;
      const r: Row = { key: p.key, range, num, undo, row, group: details, step: p.step };
      range.addEventListener('input', () => set(r, parseFloat(range.value)));
      num.addEventListener('input', () => { const v = parseFloat(num.value); if (Number.isFinite(v)) { live[r.key] = v; r.range.value = String(v); row.classList.toggle('changed', v !== DEFAULTS[r.key]); undo.hidden = v === DEFAULTS[r.key]; refreshBadges(); persist(); } });
      num.addEventListener('change', () => { refresh(r); num.blur(); });
      range.addEventListener('change', () => range.blur()); // hand the arrow keys back to the game
      undo.addEventListener('click', () => set(r, DEFAULTS[r.key]));
      details.appendChild(row);
      rows.push(r);
      refresh(r);
    }
    body.appendChild(details);
  });
  refreshBadges();

  root.querySelector('#tuning-reset')!.addEventListener('click', () => {
    for (const r of rows) { live[r.key] = DEFAULTS[r.key]; refresh(r); }
    refreshBadges();
    persist();
  });

  root.querySelector('#tuning-copy')!.addEventListener('click', () => {
    const changed = changedValues(live, DEFAULTS);
    const text = Object.keys(changed).length
      ? JSON.stringify(changed, null, 2)
      : '{}  // nothing differs from the defaults';
    exportBox.value = text;
    exportBox.hidden = false;
    exportBox.select();
    void navigator.clipboard?.writeText(text).catch(() => { /* the box is selected for a manual copy */ });
  });

  const close = () => { root.hidden = true; exportBox.hidden = true; };
  root.querySelector('#tuning-close')!.addEventListener('click', close);

  return {
    toggle() { root.hidden = !root.hidden; if (root.hidden) exportBox.hidden = true; },
    pausesGame() { return !root.hidden && pauseBox.checked; },
  };
}
