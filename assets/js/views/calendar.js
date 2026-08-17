/* views/calendar.js — the master calendar: month grid + year heatmap. */

import { el, clear, iso, todayISO, parseISO, daysInMonth, MONTHS, MON, DOW,
         addDays, plural, fmtDate, rgba } from '../util.js';
import * as S from '../store.js';
import { attachTip, tipBody, hideTip } from '../ui.js';
import { relapseDialog, dayDialog } from '../forms.js';

const now = new Date();
export const state = {
  mode: 'month',
  year: now.getFullYear(),
  month: now.getMonth(),
  hidden: new Set(),
};

let ctxRef = null;

export function render(root, ctx) {
  ctxRef = ctx;
  clear(root);
  const head = el('div.cal-head');
  const bodyWrap = el('div');

  const seg = el('div.seg',
    el('button' + (state.mode === 'month' ? '.on' : ''), { onclick: () => setMode('month') }, 'Month'),
    el('button' + (state.mode === 'year' ? '.on' : ''), { onclick: () => setMode('year') }, 'Year'));

  const title = el('div.cal-title', state.mode === 'month' ? `${MONTHS[state.month]} ${state.year}` : String(state.year));

  head.append(
    el('div.cal-nav',
      el('button.nav-btn', { onclick: () => step(-1), title: 'Previous (←)' },
        el('svg', { viewBox: '0 0 24 24', html: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' })),
      title,
      el('button.nav-btn', { onclick: () => step(1), title: 'Next (→)' },
        el('svg', { viewBox: '0 0 24 24', html: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' })),
      el('button.btn.btn-ghost.btn-sm', { style: { marginLeft: '8px' }, onclick: () => jumpToday(), title: 'Today (T)' }, 'Today')),
    el('div.row', seg));
  root.append(head, bodyWrap);

  state.mode === 'month' ? monthView(bodyWrap) : yearView(bodyWrap);
  root.appendChild(legend());
  ctx.setSub(subtitle());

  function setMode(m) { state.mode = m; ctx.rerender(); }
  function step(n) {
    if (state.mode === 'year') state.year += n;
    else {
      state.month += n;
      if (state.month < 0) { state.month = 11; state.year--; }
      if (state.month > 11) { state.month = 0; state.year++; }
    }
    ctx.rerender();
  }
  function jumpToday() {
    const d = new Date();
    state.year = d.getFullYear(); state.month = d.getMonth();
    ctx.rerender();
  }
}

export function nav(n) {
  if (state.mode === 'year') state.year += n;
  else {
    state.month += n;
    if (state.month < 0) { state.month = 11; state.year--; }
    if (state.month > 11) { state.month = 0; state.year++; }
  }
}
export function goToday() {
  const d = new Date();
  state.year = d.getFullYear(); state.month = d.getMonth();
}
export function toggleMode() { state.mode = state.mode === 'month' ? 'year' : 'month'; }

function visible(r) { return !state.hidden.has(r.habitId); }

function subtitle() {
  if (state.mode === 'month') {
    const n = S.relapses().filter(r => visible(r) && r.date.startsWith(`${state.year}-${String(state.month + 1).padStart(2, '0')}`)).length;
    const dm = daysInMonth(state.year, state.month);
    const hitDays = new Set(S.relapses().filter(r => visible(r) && r.date.startsWith(`${state.year}-${String(state.month + 1).padStart(2, '0')}`)).map(r => r.date)).size;
    return `${plural(n, 'entry', 'entries')} across ${plural(hitDays, 'day')} · ${dm - hitDays} clean`;
  }
  const n = S.relapses().filter(r => visible(r) && +r.date.slice(0, 4) === state.year).length;
  const hitDays = new Set(S.relapses().filter(r => visible(r) && +r.date.slice(0, 4) === state.year).map(r => r.date)).size;
  return `${plural(n, 'entry', 'entries')} in ${state.year} across ${plural(hitDays, 'day')}`;
}

/* ── month ──────────────────────────────────────────────── */
function monthView(root) {
  const map = S.byDate();
  const first = new Date(state.year, state.month, 1);
  const startPad = (first.getDay() - S.setting('weekStart') + 7) % 7;
  const dm = daysInMonth(state.year, state.month);
  const total = Math.ceil((startPad + dm) / 7) * 7;
  const today = todayISO();
  const showClean = S.setting('showClean');

  const grid = el('div.cal');
  const dows = [...DOW.slice(S.setting('weekStart')), ...DOW.slice(0, S.setting('weekStart'))];
  dows.forEach(d => grid.appendChild(el('div.cal-dow', d)));

  for (let i = 0; i < total; i++) {
    const date = addDays(first, i - startPad);
    const ds = iso(date);
    const out = date.getMonth() !== state.month;
    const future = ds > today;
    const list = (map.get(ds) || []).filter(visible);

    const cell = el('div.day' + (out ? '.out' : '') + (future ? '.future' : '') + (ds === today ? '.today' : '') +
      (list.length ? '.hit' : (showClean && !future && !out ? '.clean' : '')),
      { style: { animationDelay: Math.min(i * 5, 260) + 'ms' } },
      el('div.dnum', date.getDate()));

    if (list.length) {
      cell.style.setProperty('--d1', S.habitColor(list[0].habitId));
      if (list.length > 1) cell.appendChild(el('div.dcount', list.length));
      const seen = [];
      for (const r of list) if (!seen.includes(r.habitId)) seen.push(r.habitId);
      cell.appendChild(el('div.dmarks', seen.slice(0, 6).map(hid =>
        el('span.dmark', { style: { background: S.habitColor(hid), boxShadow: `0 0 8px -1px ${S.habitColor(hid)}` } }))));
      attachTip(cell, () => tipBody(fmtDate(ds), list.map(r => ({
        color: S.habitColor(r.habitId),
        text: S.habitName(r.habitId) + (r.time ? ' · ' + r.time : ''),
      }))));
    } else if (!future && !out) {
      attachTip(cell, tipBody(fmtDate(ds), 'Clean. Click to review, shift-click to log.'));
    }

    if (!future) {
      cell.onclick = e => {
        hideTip();
        if (e.shiftKey) relapseDialog({ date: ds });
        else if (list.length) dayDialog(ds);
        else dayDialog(ds);
      };
      const add = el('button.qadd', { title: 'Log on this day' }, '+');
      add.onclick = e => { e.stopPropagation(); hideTip(); relapseDialog({ date: ds }); };
      cell.appendChild(add);
      cell.oncontextmenu = e => { e.preventDefault(); hideTip(); relapseDialog({ date: ds }); };
    }
    grid.appendChild(cell);
  }
  root.appendChild(grid);
}

/* ── year ───────────────────────────────────────────────── */
function yearView(root) {
  const map = S.byDate();
  const today = todayISO();

  /* per-year totals strip */
  const years = S.countsByYear();
  const known = [...new Set([...years.keys(), new Date().getFullYear(), state.year])].sort();
  if (known.length > 1) {
    root.appendChild(el('div.kpi', { style: { marginBottom: '18px' } },
      known.map(y => {
        const n = S.relapses().filter(r => visible(r) && +r.date.slice(0, 4) === y).length;
        const box = el('div.kbox', { style: { cursor: 'pointer', opacity: y === state.year ? 1 : .62 } },
          el('b', n), el('span', y));
        box.onclick = () => { state.year = y; ctxRef.rerender(); };
        return box;
      })));
  }

  const wrap = el('div.year-wrap');
  for (let m = 0; m < 12; m++) {
    const dm = daysInMonth(state.year, m);
    const first = new Date(state.year, m, 1);
    const pad0 = (first.getDay() - S.setting('weekStart') + 7) % 7;
    const g = el('div.ygrid');
    let count = 0;
    for (let i = 0; i < pad0; i++) g.appendChild(el('div.ycell.pad'));
    for (let d = 1; d <= dm; d++) {
      const ds = iso(new Date(state.year, m, d));
      const list = (map.get(ds) || []).filter(visible);
      count += list.length;
      const cell = el('div.ycell' + (ds === today ? '.tday' : ''));
      if (list.length) {
        const c = S.habitColor(list[0].habitId);
        cell.style.background = rgba(c, Math.min(1, 0.38 + list.length * 0.22));
        cell.style.boxShadow = `0 0 8px -2px ${c}` + (ds === today ? `, 0 0 0 1.5px var(--accent)` : '');
        attachTip(cell, () => tipBody(fmtDate(ds), list.map(r => S.habitName(r.habitId))));
      } else if (ds > today) {
        cell.style.background = 'var(--surface-2)';
        cell.style.opacity = '.4';
      } else {
        attachTip(cell, tipBody(fmtDate(ds), 'Clean'));
      }
      cell.onclick = () => { if (ds <= today) dayDialog(ds); };
      cell.style.cursor = ds <= today ? 'pointer' : 'default';
      g.appendChild(cell);
    }
    const card = el('div.ymini',
      el('div.ymini-t', el('span', MONTHS[m]), el('em', count || '')), g);
    card.querySelector('.ymini-t span').style.cursor = 'pointer';
    card.querySelector('.ymini-t span').onclick = () => { state.mode = 'month'; state.month = m; ctxRef.rerender(); };
    wrap.appendChild(card);
  }
  root.appendChild(wrap);
}

/* ── legend / filter ────────────────────────────────────── */
function legend() {
  const hs = S.habits({ all: true }).filter(h => !h.archived || S.forHabit(h.id).length);
  if (!hs.length) return el('div');
  const wrap = el('div.legend');
  hs.forEach(h => {
    const off = state.hidden.has(h.id);
    const item = el('div.lg' + (off ? '.off' : ''),
      el('i', { style: { background: h.color, boxShadow: `0 0 10px -2px ${h.color}` } }),
      el('span', `${h.emoji} ${h.name}`),
      el('span.muted', { style: { fontSize: '11px' } }, S.forHabit(h.id).length));
    item.onclick = () => {
      state.hidden.has(h.id) ? state.hidden.delete(h.id) : state.hidden.add(h.id);
      ctxRef.rerender();
    };
    item.title = off ? 'Show on calendar' : 'Hide from calendar';
    wrap.appendChild(item);
  });
  if (state.hidden.size) {
    wrap.appendChild(el('button.btn.btn-ghost.btn-sm', { onclick: () => { state.hidden.clear(); ctxRef.rerender(); } },
      'Show all'));
  }
  return wrap;
}
