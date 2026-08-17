/* views/insights.js — hand-rolled SVG charts, no chart library. */

import { el, clear, MON, DOW, plural, humanDays, fmtDate, rgba, todayISO } from '../util.js';
import * as S from '../store.js';
import { attachTip, tipBody } from '../ui.js';

export const state = { habitId: null, year: new Date().getFullYear() };

export function render(root, ctx) {
  clear(root);
  const hs = S.habits({ all: true });
  const all = S.relapses();
  ctx.setSub(all.length ? `${plural(all.length, 'entry', 'entries')} analysed` : '');

  if (!all.length) {
    root.appendChild(el('div.card', el('div.empty',
      el('h3', 'Nothing to analyse yet'),
      el('p', 'Insights appear once there is data. Ironically, this page gets better the worse things go — and then it gets useful.'))));
    return;
  }

  /* filter bar */
  const bar = el('div.row-b.wrap', { style: { marginBottom: '20px', gap: '12px' } },
    el('div.tags',
      el('button.tag' + (state.habitId === null ? '.on' : ''), { onclick: () => { state.habitId = null; ctx.rerender(); } }, 'All habits'),
      hs.map(h => el('button.tag' + (state.habitId === h.id ? '.on' : ''),
        { style: state.habitId === h.id ? { borderColor: h.color, background: rgba(h.color, .18) } : {},
          onclick: () => { state.habitId = h.id; ctx.rerender(); } }, `${h.emoji} ${h.name}`))),
    yearPicker(ctx));
  root.appendChild(bar);

  const hid = state.habitId;
  const list = S.forHabit(hid);
  const st = S.currentStreak(hid);
  const longest = S.longestStreak(hid);
  const totals = S.totalCleanDays(hid);
  const runs = S.allStreaks(hid);
  const avgRun = runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : 0;
  const color = hid ? S.habitColor(hid) : getComputedStyle(document.documentElement).getPropertyValue('--a1').trim();

  /* KPIs */
  root.appendChild(el('div.kpi',
    kpi(String(st.days), 'Current run', st.fresh ? 'nothing logged yet' : `since ${fmtDate(st.since, 'short')}`),
    kpi(humanDays(longest.days), 'Longest run', `${fmtDate(longest.from, 'short')} → ${fmtDate(longest.to, 'short')}`),
    kpi(avgRun.toFixed(1), 'Average run', `${plural(runs.length, 'run')} recorded`),
    kpi(`${Math.round((totals.clean / Math.max(1, totals.span)) * 100)}%`, 'Days clean', `${totals.clean} of ${totals.span}`),
    kpi(String(list.length), 'Total entries', trendLine(hid))));

  const grid = el('div.grid.g-2', { style: { marginTop: '18px' } });

  /* by month for the chosen year */
  const months = S.countsByMonth(state.year, hid);
  grid.appendChild(chartCard(`Relapses by month · ${state.year}`,
    barChart(months.map((n, i) => ({ label: MON[i], value: n })), color,
      i => `${MON[i]} ${state.year}`),
    months.some(Boolean) ? null : 'Nothing recorded in this year.'));

  /* by weekday */
  const wd = S.countsByWeekday(hid);
  const worstDay = wd.indexOf(Math.max(...wd));
  grid.appendChild(chartCard('Relapses by day of week',
    barChart(wd.map((n, i) => ({ label: DOW[i], value: n })), color, i => DOW[i]),
    wd.some(Boolean) ? `${DOW[worstDay]} is your heaviest day — ${Math.round(wd[worstDay] / Math.max(1, list.length) * 100)}% of all entries.` : null));

  /* by hour */
  const hours = S.countsByHour(hid);
  const timed = hours.reduce((a, b) => a + b, 0);
  grid.appendChild(chartCard('Time of day',
    timed ? clockChart(hours, color)
          : el('div.empty', { style: { padding: '30px' } }, el('p', 'Add times when you log and this fills in.')),
    timed ? `${peakWindow(hours)} is your danger window.` : null));

  /* per habit split */
  if (!hid && hs.length > 1) {
    const counts = S.countsByHabit();
    const rows = hs.map(h => ({ label: h.name, value: counts.get(h.id) || 0, color: h.color, emoji: h.emoji }))
                   .sort((a, b) => b.value - a.value);
    grid.appendChild(chartCard('Split by habit', hbars(rows, list.length)));
  }

  /* streak history */
  if (runs.length > 1) {
    grid.appendChild(chartCard('Every clean run, oldest to newest',
      barChart(runs.map((n, i) => ({ label: '', value: n })), color, i => `Run ${i + 1}`, true),
      trendVerdict(runs)));
  }

  /* triggers */
  const trig = S.triggerTally(hid);
  if (trig.length) {
    const max = trig[0][1];
    grid.appendChild(chartCard('Triggers you have named',
      el('div.tags', trig.map(([t, n]) =>
        el('span.tag', { style: { background: rgba(color, .07 + (n / max) * .28), borderColor: rgba(color, .25 + (n / max) * .5) } },
          `${t} · ${n}`))),
      `Named in ${Math.round(trig.reduce((a, b) => a + b[1], 0) / Math.max(1, list.length) * 100)}% of entries.`));
  }

  /* intensity */
  const inten = [1, 2, 3, 4, 5].map(v => list.filter(r => r.intensity === v).length);
  if (inten.some(Boolean)) {
    grid.appendChild(chartCard('How strong they felt',
      barChart(inten.map((n, i) => ({ label: String(i + 1), value: n })), color,
        i => ['Barely', 'Mild', 'Medium', 'Strong', 'Overwhelming'][i])));
  }

  root.appendChild(grid);

  /* last 90 days strip */
  root.appendChild(el('div.card', { style: { marginTop: '18px' } },
    el('div.card-t', { style: { marginBottom: '14px' } }, 'The last 90 days'),
    el('div.mini-heat', { style: { gap: '3px' } }, S.lastNDays(90, hid).map(d => {
      const i = el('i', { style: { height: '34px', borderRadius: '3px',
        background: d.n ? rgba(color, Math.min(1, .35 + d.n * .25)) : 'var(--surface-3)' } });
      attachTip(i, tipBody(fmtDate(d.date, 'short'), d.n ? plural(d.n, 'entry', 'entries') : 'clean'));
      return i;
    })),
    el('p.hint', { style: { marginTop: '10px' } }, 'Oldest on the left. Gaps are the point.')));
}

/* ── pieces ─────────────────────────────────────────────── */

function yearPicker(ctx) {
  const years = [...S.countsByYear().keys()];
  const set = [...new Set([...years, new Date().getFullYear()])].sort((a, b) => b - a);
  const s = el('select.inp', { style: { width: 'auto', minWidth: '110px' } },
    set.map(y => el('option', { value: y, selected: y === state.year }, y)));
  s.value = state.year;
  s.onchange = () => { state.year = +s.value; ctx.rerender(); };
  return s;
}

function kpi(value, label, sub) {
  return el('div.kbox', el('b', value), el('span', label), sub ? el('em', sub) : null);
}

function chartCard(title, content, footnote) {
  return el('div.card',
    el('div.card-t', { style: { marginBottom: '16px' } }, title),
    content,
    footnote ? el('p.hint', { style: { marginTop: '12px' } }, footnote) : null);
}

function barChart(data, color, tipFn, dense = false) {
  const W = 520, H = 170, padB = dense ? 8 : 22, padL = 26;
  const max = Math.max(1, ...data.map(d => d.value));
  const n = data.length;
  const gap = dense ? 2 : 6;
  const bw = (W - padL - 6 - gap * (n - 1)) / n;
  const svg = el('svg.chart', { viewBox: `0 0 ${W} ${H}`,
    style: { width: '100%', height: 'auto' } });

  /* gridlines */
  const ticks = 3;
  for (let i = 0; i <= ticks; i++) {
    const y = 10 + ((H - padB - 16) * i) / ticks;
    svg.appendChild(svgEl('line', { x1: padL, x2: W - 2, y1: y, y2: y, stroke: 'var(--line-soft)', 'stroke-width': 1 }));
    svg.appendChild(svgEl('text', { x: 0, y: y + 3.5 }, String(Math.round(max * (1 - i / ticks)))));
  }

  data.forEach((d, i) => {
    const h = (d.value / max) * (H - padB - 26);
    const x = padL + i * (bw + gap);
    const y = H - padB - h;
    // Drawn at final geometry; the rise is a CSS scaleY animation anchored to
    // the baseline, so the chart is still correct if animations never run.
    const rect = svgEl('rect', { class: 'bar grow-bar', x, y: Math.max(0, y), width: bw,
      height: Math.max(0, h), rx: Math.min(4, bw / 2.5),
      fill: d.value ? color : 'var(--surface-3)', opacity: d.value ? .9 : .5 });
    rect.style.animationDelay = i * 22 + 'ms';
    svg.appendChild(rect);
    attachTip(rect, () => tipBody(tipFn ? tipFn(i) : d.label, String(d.value)));
    if (!dense && d.label) svg.appendChild(svgEl('text', { x: x + bw / 2, y: H - 4, 'text-anchor': 'middle' }, d.label));
  });
  return svg;
}

function hbars(rows, total) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return el('div', { style: { display: 'grid', gap: '12px' } }, rows.map(r =>
    el('div',
      el('div.row-b', { style: { marginBottom: '5px' } },
        el('span', { style: { fontSize: '13px' } }, `${r.emoji} ${r.label}`),
        el('span.hint', `${r.value} · ${Math.round(r.value / Math.max(1, total) * 100)}%`)),
      el('div.pbar', { style: { margin: 0, height: '7px' } },
        el('i', { style: { width: (r.value / max * 100) + '%', background: r.color } })))));
}

function clockChart(hours, color) {
  const R = 74, C = 92, max = Math.max(1, ...hours);
  const svg = el('svg.chart', { viewBox: '0 0 184 184', style: { height: '184px', margin: '0 auto', display: 'block', width: '184px' } });
  svg.appendChild(svgEl('circle', { cx: C, cy: C, r: R, fill: 'none', stroke: 'var(--line-soft)' }));
  svg.appendChild(svgEl('circle', { cx: C, cy: C, r: R * .5, fill: 'none', stroke: 'var(--line-soft)', 'stroke-dasharray': '2 4' }));
  hours.forEach((n, h) => {
    const a0 = (h / 24) * Math.PI * 2 - Math.PI / 2, a1 = ((h + 1) / 24) * Math.PI * 2 - Math.PI / 2;
    const len = 16 + (n / max) * (R - 18);
    const p = wedge(C, C, 15, n ? len : 15.5, a0 + 0.012, a1 - 0.012);
    const path = svgEl('path', { d: p, fill: n ? color : 'var(--surface-3)', opacity: n ? .55 + (n / max) * .45 : .4, class: 'bar' });
    attachTip(path, tipBody(`${String(h).padStart(2, '0')}:00 – ${String((h + 1) % 24).padStart(2, '0')}:00`, `${n} logged`));
    svg.appendChild(path);
  });
  [0, 6, 12, 18].forEach(h => {
    const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
    svg.appendChild(svgEl('text', { x: C + Math.cos(a) * (R + 9), y: C + Math.sin(a) * (R + 9) + 3.5, 'text-anchor': 'middle' },
      h === 0 ? '12a' : h === 12 ? '12p' : h === 6 ? '6a' : '6p'));
  });
  return svg;
}
function wedge(cx, cy, r0, r1, a0, a1) {
  const p = (r, a) => `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
}

function svgEl(tag, attrs, text) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (text != null) n.textContent = text;
  return n;
}

function trendLine(hid) {
  const a = S.lastNDays(30, hid).reduce((s, d) => s + d.n, 0);
  const b = S.lastNDays(60, hid).slice(0, 30).reduce((s, d) => s + d.n, 0);
  if (!a && !b) return 'quiet on both counts';
  if (b === 0) return `${a} in the last 30 days`;
  const delta = Math.round(((a - b) / b) * 100);
  if (delta === 0) return 'flat vs. the 30 days before';
  return `${Math.abs(delta)}% ${delta < 0 ? 'lower' : 'higher'} than the 30 days before`;
}

function trendVerdict(runs) {
  if (runs.length < 4) return null;
  const half = Math.floor(runs.length / 2);
  const early = runs.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const late = runs.slice(half).reduce((a, b) => a + b, 0) / (runs.length - half);
  if (late > early * 1.15) return `Your runs are getting longer — ${early.toFixed(1)} days early on, ${late.toFixed(1)} more recently.`;
  if (late < early * 0.85) return `Your runs are getting shorter — ${early.toFixed(1)} days early on, ${late.toFixed(1)} more recently. Worth a look at the triggers.`;
  return `Holding steady around ${late.toFixed(1)} days per run.`;
}

function peakWindow(hours) {
  let best = 0, bi = 0;
  for (let i = 0; i < 24; i++) {
    const s = hours[i] + hours[(i + 1) % 24] + hours[(i + 2) % 24];
    if (s > best) { best = s; bi = i; }
  }
  const f = h => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
  return `${f(bi)}–${f((bi + 3) % 24)}`;
}
