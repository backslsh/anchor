/* views/goals.js */

import { el, clear, plural, fmtDate, relDate } from '../util.js';
import * as S from '../store.js';
import { toast, confetti } from '../ui.js';
import { goalDialog } from '../forms.js';

export function render(root, ctx) {
  clear(root);
  const all = S.goals();
  const open = all.filter(g => !g.completedAt);
  const done = all.filter(g => g.completedAt);
  ctx.setSub(open.length ? `${plural(open.length, 'goal')} in flight` : '');

  root.appendChild(el('div.row-b', { style: { marginBottom: '18px' } },
    el('div',
      el('div', { style: { fontSize: '15px', fontWeight: 600, letterSpacing: '-.02em' } }, 'Goals'),
      el('p.hint', { style: { marginTop: '3px' } },
        'Clean runs count up, budgets count down, milestones you tick yourself.')),
    el('button.btn.btn-primary', { onclick: () => goalDialog() }, '+ New goal')));

  if (!all.length) {
    root.appendChild(el('div.card', el('div.empty',
      el('h3', 'No goals yet'),
      el('p', 'A goal turns the calendar into something with a direction. Try “14 clean days” — it is close enough to feel real.'),
      el('button.btn.btn-primary', { onclick: () => goalDialog() }, 'Set your first goal'))));
    return;
  }

  if (open.length) root.appendChild(el('div.grid.g-2', open.map(g => card(g, ctx))));

  if (done.length) {
    root.appendChild(el('div', { style: { marginTop: '28px' } },
      el('div.card-t', { style: { marginBottom: '12px' } }, `Completed · ${done.length}`),
      el('div.grid.g-2', done.map(g => card(g, ctx)))));
  }
}

function card(g, ctx) {
  const p = S.goalProgress(g);
  const finished = !!g.completedAt;
  const pctClass = p.inverse ? (p.state === 'bad' ? ' bad' : '') : (p.pct >= 1 ? ' ok' : '');

  return el('div.gcard' + (finished ? '.done' : ''),
    el('div.row-b',
      el('div',
        el('div.gtitle', g.title),
        el('div.gmeta', [
          g.habitId ? S.habitName(g.habitId) : 'All habits',
          g.kind === 'streak' ? 'clean run' : g.kind === 'cap' ? `budget per ${g.window}` : 'milestone',
          finished ? `completed ${relDate(g.completedAt.slice(0, 10))}` : null,
          !finished && g.kind === 'milestone' && g.due ? `due ${fmtDate(g.due, 'short')}` : null,
        ].filter(Boolean).join(' · '))),
      el('span.badge.' + (finished ? 'good' : p.state === 'bad' ? 'bad' : 'mute'),
        finished ? '✓ done' : p.label)),

    el('div.pbar' + pctClass, growBar(finished ? 1 : p.pct)),
    el('div.pinfo', el('span', p.sub),
      el('div.row', { style: { gap: '6px' } },
        g.kind === 'milestone' && !finished
          ? el('button.btn.btn-ghost.btn-sm', { onclick: () => {
              S.updateGoal(g.id, { done: true, completedAt: new Date().toISOString() });
              confetti({ count: 120 });
              toast('Milestone reached', { sub: g.title, kind: 'ok' });
            } }, 'Mark done')
          : null,
        el('button.btn.btn-ghost.btn-sm', { onclick: () => goalDialog(g.id) }, 'Edit'))));
}

/* The bar is laid out at its true width immediately and the fill is a CSS
   scaleX animation on top. If animations never run — background tab, reduced
   motion — it simply appears already correct rather than stuck at zero. */
function growBar(pct) {
  return el('i.grow', { style: { width: Math.min(100, pct * 100) + '%' } });
}
