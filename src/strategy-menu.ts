import { BREAKOUTS, NEUTRALS, OFFENCES, type World } from './sim';
import { TEAM_COLORS, TEAM_NAMES } from './sim-constants';

/**
 * Strategy picker shown under the canvas pause screen: one dropdown per team for each of the
 * AI's plans (breakout, neutral zone, offensive zone). Changes write straight into the world's
 * plan fields, the same ones the B/N, V/M and O/L keys cycle, so the two stay in step via sync().
 */
export interface StrategyMenu {
  show(visible: boolean): void;
  /** Re-read the world into the dropdowns (after a key cycled a plan or the world was reset). */
  sync(): void;
}

const PLANS = [
  { field: 'breakout', label: 'Breakout', options: BREAKOUTS, hint: 'how the team gets out of its own end' },
  { field: 'neutral', label: 'Neutral zone', options: NEUTRALS, hint: 'how the team defends the neutral zone' },
  { field: 'offence', label: 'Offensive zone', options: OFFENCES, hint: 'how the team works the puck once set up' },
] as const;

export function initStrategyMenu(root: HTMLElement, getWorld: () => World): StrategyMenu {
  const selects: { sel: HTMLSelectElement; field: (typeof PLANS)[number]['field']; team: 0 | 1 }[] = [];

  const head = (team: 0 | 1) => `<span class="team" style="color:${TEAM_COLORS[team]}">${TEAM_NAMES[team]}</span>`;
  root.innerHTML = `
    <div class="grid">
      <span></span>${head(0)}${head(1)}
      ${PLANS.map((p) => `<label title="${p.hint}">${p.label}</label><span data-cell="${p.field}-0"></span><span data-cell="${p.field}-1"></span>`).join('')}
    </div>
    <small>AI strategies. Keys while paused: B/N breakout · V/M neutral · O/L offence (red/blue)</small>`;

  for (const p of PLANS) {
    for (const team of [0, 1] as const) {
      const sel = document.createElement('select');
      sel.innerHTML = p.options.map((o) => `<option value="${o}">${o}</option>`).join('');
      sel.addEventListener('change', () => {
        (getWorld()[p.field] as string[])[team] = sel.value;
        sel.blur(); // so P / Esc work again straight away
      });
      root.querySelector(`[data-cell="${p.field}-${team}"]`)!.appendChild(sel);
      selects.push({ sel, field: p.field, team });
    }
  }

  const sync = () => {
    const w = getWorld();
    for (const s of selects) {
      const v = w[s.field][s.team];
      if (s.sel.value !== v) s.sel.value = v;
    }
  };

  return {
    show(visible) { root.hidden = !visible; if (visible) sync(); },
    sync,
  };
}
