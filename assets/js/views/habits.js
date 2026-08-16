/* views/habits.js */

import { el, clear, plural, relDate, fmtDate, humanDays, rgba, iso } from '../util.js';
import * as S from '../store.js';
import { attachTip, toast } from '../ui.js';
import { habitDialog, relapseDialog, dayDialog } from '../forms.js';

export function render(root, ctx) {
  clear(root);
  const all = S.habits({ all: true });
  const active = all.filter(h => !h.archived);
  const archived = all.filter(h => h.archived);
  ctx.setSub(active.length ? `${plural(active.length, 'habit')} tracked` : '');

  root.appendChild(el('div.row-b', { style: { marginBottom: '18px' } },
    el('div',
      el('div', { style: { fontSize: '15px', fontWeight: 600, letterSpacing: '-.02em' } }, 'Tracked behaviours'),
      el('p.hint', { style: { marginTop: '3px' } },
        'Each habit owns a colour. That colour is what you see on the calendar.')),
    el('button.btn.btn-primary', { onclick: () => habitDialog() }, '+ New habit')));

  if (!active.length && !archived.length) {
    root.appendChild(el('div.card', el('div.empty',
      el('h3', 'No habits yet'),
      el('p', 'Start with one. Tracking three things badly is worse than tracking one thing honestly.'),
      el('button.btn.btn-primary', { onclick: () => habitDialog() }, 'Create a habit'))));
    return;
  }

  root.appendChild(el('div.grid.g-2', active.map(h => card(h, ctx))));

  if (archived.length) {
    root.appendChild(el('div', { style: { marginTop: '28px' } },
      el('div.card-t', { style: { marginBottom: '12px' } }, `Archived · ${archived.length}`),
      el('div.grid.g-2', archived.map(h => card(h, ctx, true)))));
  }
}

function card(h, ctx, dim = false) {
  const list = S.forHabit(h.id);
  const st = S.currentStreak(h.id);
  const longest = S.longestStreak(h.id);
  const last30 = S.lastNDays(30, h.id);
  const totals = S.totalCleanDays(h.id);

  const node = el('div.hcard', { style: { '--hc': h.color, opacity: dim ? .55 : 1 } },
    el('div.hcard-top',
      el('div',
        el('div.hcard-name', el('span.hemoji', h.emoji), el('span', h.name)),
        el('div.hcard-sub', list.length
          ? `${plural(list.length, 'entry', 'entries')} · last ${relDate(st.since)}`
          : `nothing logged since ${fmtDate(iso(new Date(h.createdAt)), 'short')}`)),
      el('div.row', { style: { gap: '4px' } },
        el('button.icon-btn', { title: 'Edit', onclick: () => habitDialog(h.id) },
          el('svg', { viewBox: '0 0 24 24', html: '<path d="M4 20h4l10-10-4-4L4 16v4zM14.5 5.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' })),
        !dim ? el('button.icon-btn', { title: 'Log a slip for this habit', onclick: () => relapseDialog({ habitId: h.id }) },
          el('svg', { viewBox: '0 0 24 24', html: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' })) : null)),

    h.note ? el('p.hint', { style: { marginBottom: '4px', fontStyle: 'italic',
      borderLeft: `2px solid ${rgba(h.color, .5)}`, paddingLeft: '10px' } }, h.note) : null,

    el('div.hstats',
      el('div.hstat', el('b', st.days), el('span', 'Clean now')),
      el('div.hstat', el('b', humanDays(longest.days)), el('span', 'Best run')),
      el('div.hstat', el('b', `${Math.round((totals.clean / Math.max(1, totals.span)) * 100)}%`), el('span', 'Clean rate'))),

    el('div',
      el('div.row-b', { style: { marginBottom: '6px' } },
        el('span.hint', 'Last 30 days'),
        el('span.hint', `${last30.reduce((a, d) => a + d.n, 0)} in window`)),
      el('div.mini-heat', last30.map(d => {
        const i = el('i', { style: { background: d.n ? rgba(h.color, Math.min(1, .35 + d.n * .25)) : 'var(--surface-3)',
          cursor: 'pointer' } });
        attachTip(i, `<b>${fmtDate(d.date, 'short')}</b>${d.n ? plural(d.n, 'entry', 'entries') : 'clean'}`);
        i.onclick = () => dayDialog(d.date);
        return i;
      }))),

    (h.costPerRelapse || h.minutesPerRelapse)
      ? el('p.hint', { style: { marginTop: '12px' } },
          `Each slip costs about ${[h.costPerRelapse ? S.setting('currency') + h.costPerRelapse : null,
            h.minutesPerRelapse ? h.minutesPerRelapse + ' min' : null].filter(Boolean).join(' and ')}.`)
      : null);

  return node;
}
