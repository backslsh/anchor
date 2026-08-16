/* views/dashboard.js */

import { el, clear, humanDays, plural, relDate, fmt12, fmtDate, todayISO, pad,
         iso, addDays, parseISO } from '../util.js';
import * as S from '../store.js';
import { quotePool, quoteFor } from '../quotes.js';
import { mountGem, gemMotionFor } from '../scene.js';
import { toast, confetti, attachTip, showTipAt, hideTip } from '../ui.js';
import { relapseDialog, habitDialog, goalDialog, dayDialog } from '../forms.js';

let gem = null, liveTimer = null, celebrating = null, lastSeenStreak = -1;

export function render(root, ctx) {
  clear(root);
  const streak = S.currentStreak();
  const hs = S.habits();
  const acc = getComputedStyle(document.documentElement);
  const a1 = acc.getPropertyValue('--a1').trim(), a2 = acc.getPropertyValue('--a2').trim();

  /* ── hero ─────────────────────────────────────────────── */
  const num = el('div.streak-num.tnum', String(streak.days));
  const unit = el('div.streak-unit',
    streak.fresh
      ? 'since you started tracking — nothing logged yet'
      : `clean since ${fmtDate(streak.since)}`);

  let live = false;
  num.title = 'Click for the exact count';
  num.onclick = () => {
    live = !live;
    num.classList.toggle('live', live);
    clearInterval(liveTimer);
    if (live) {
      const base = new Date(streak.since + 'T00:00:00');
      const tick = () => {
        const ms = Date.now() - base;
        const d = Math.floor(ms / 86400000);
        const h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
        num.textContent = `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
      };
      tick(); liveTimer = setInterval(tick, 1000);
      toast('Down to the second', { sub: 'Click again to go back.', ms: 2600 });
    } else num.textContent = String(streak.days);
  };

  const next = S.nextMilestone(streak.days);
  const longest = S.longestStreak();
  const totals = S.totalCleanDays();

  /* One satellite crystal per milestone this run has cleared. */
  const satellites = S.MILESTONES.filter(m => m <= streak.days)
    .map(m => ({ days: m, label: streak.fresh ? null : `cleared ${fmtDate(iso(addDays(parseISO(streak.since), m)), 'short')}` }));
  const canvas = el('canvas', { id: 'gem' });
  const hero = el('div.hero',
    el('div.hero-l',
      el('div.hero-eyebrow', hs.length ? 'Current clean run' : 'Welcome to Anchor'),
      num, unit,
      el('div.hero-stats',
        stat(humanDays(longest.days), 'Longest run',
          longest.days ? `${fmtDate(longest.from, 'short')} → ${fmtDate(longest.to, 'short')}` : null),
        stat(String(S.relapses().length), 'Total logged'),
        stat(next ? `${next - streak.days}d` : '—', 'To next milestone',
          next ? `${next}-day mark` : null),
        stat(`${Math.round((totals.clean / Math.max(1, totals.span)) * 100)}%`, 'Days clean',
          `${totals.clean} of ${totals.span} tracked`))),
    el('div.hero-r', canvas, el('div.gem-hint', gemHint(streak, longest, satellites.length))));
  root.appendChild(hero);

  /* It shatters and regrows when the run has just been broken. */
  const brokenToday = !streak.fresh && streak.days === 0;

  gem?.destroy();
  gem = mountGem(canvas, {
    a: a1, b: a2,
    ...gemMotionFor(streak.days),
    streakDays: streak.days,
    bestDays: longest.days,
    satellites,
    shatter: brokenToday && lastSeenStreak > 0,
    onHover: (piece, ev, ghost) => {
      if (!piece) return hideTip();
      showTipAt(ev.clientX, ev.clientY,
        `<b>${esc(piece.label)}</b>` +
        (piece.sub ? esc(piece.sub) : '') +
        (piece.kind === 'main' && ghost
          ? `<div style="margin-top:4px;opacity:.75">${esc(ghost.sub)}</div>` : ''));
    },
    onPick: () => hideTip(),
  });
  lastSeenStreak = streak.days;

  /* Milestone celebration, once per milestone. The markSeen() write happens
     after paint — writing to the store mid-render would re-enter render(). */
  const hit = S.hitMilestone(streak.days);
  if (hit && !streak.fresh && !S.wasSeen('ms:' + hit) && celebrating !== hit) {
    celebrating = hit;
    setTimeout(() => {
      celebrating = null;
      if (S.wasSeen('ms:' + hit)) return;
      S.markSeen('ms:' + hit);
      confetti({ count: 170, origin: { x: 0.5, y: 0.3 } });
      gem?.pulse();
      toast(`${hit} days.`, { sub: milestoneLine(hit), kind: 'ok', ms: 9000 });
    }, 600);
  }

  /* ── quote ────────────────────────────────────────────── */
  root.appendChild(quoteCard());

  /* ── two columns ──────────────────────────────────────── */
  const grid = el('div.grid.g-dash', { style: { marginTop: '16px' } });

  /* left: habits */
  const left = el('div.stack');
  const habitCard = el('div.card',
    el('div.card-h', el('div.card-t', 'Habits'),
      el('button.btn.btn-ghost.btn-sm', { onclick: () => habitDialog() }, '+ New')));
  if (!hs.length) {
    habitCard.appendChild(el('div.empty',
      el('h3', 'Nothing tracked yet'),
      el('p', 'Create a habit to give relapses a name and a colour. You can add more at any time.'),
      el('button.btn.btn-primary', { onclick: () => habitDialog() }, 'Create your first habit')));
  } else {
    habitCard.appendChild(el('div', { style: { display: 'grid', gap: '8px' } },
      hs.map(h => {
        const st = S.currentStreak(h.id);
        const n = S.forHabit(h.id).length;
        const row = el('div.hbar', { style: { '--hc': h.color } },
          el('span.hswatch', { style: { background: h.color } }),
          el('div.hbar-main',
            el('div.hbar-name', `${h.emoji}  ${h.name}`),
            el('div.hbar-meta', n ? `${plural(n, 'entry', 'entries')} · last ${relDate(st.since)}` : 'no entries yet')),
          sparkline(S.lastNDays(30, h.id), h.color),
          el('div.hbar-num', el('b', st.days), el('span', 'days')));
        row.onclick = () => ctx.go('habits');
        attachTip(row, () => `<b>${h.name}</b>${h.note ? h.note : 'Click to open the habits view.'}`);
        return row;
      })));
  }
  left.appendChild(habitCard);

  /* recent activity */
  const recent = S.sortedRelapses().slice(0, 7);
  left.appendChild(el('div.card',
    el('div.card-h', el('div.card-t', 'Recent entries'),
      recent.length ? el('button.btn.btn-ghost.btn-sm', { onclick: () => ctx.go('calendar') }, 'Calendar') : null),
    recent.length
      ? el('div.timeline', recent.map(r => {
          const h = S.habit(r.habitId);
          const item = el('div.tl-item',
            el('span.tl-dot', { style: { background: h?.color || '#666', boxShadow: `0 0 0 3px var(--bg), 0 0 12px ${h?.color || '#666'}` } }),
            el('div',
              el('div.tl-title', `${h?.emoji || ''} ${S.habitName(r.habitId)}`),
              el('div.tl-sub', [fmtDate(r.date, 'short'), r.time ? fmt12(r.time) : null,
                (r.triggers || []).slice(0, 2).join(', ') || null].filter(Boolean).join(' · '))),
            el('span.tl-time', relDate(r.date)));
          item.style.cursor = 'pointer';
          item.onclick = () => dayDialog(r.date);
          return item;
        }))
      : el('div.empty', el('h3', 'Nothing logged'), el('p', 'A blank slate. Long may it last.'))));

  /* right: goals + reclaimed */
  const right = el('div.stack');
  const gs = S.goals().filter(g => !g.completedAt).slice(0, 4);
  const goalCard = el('div.card',
    el('div.card-h', el('div.card-t', 'Active goals'),
      el('button.btn.btn-ghost.btn-sm', { onclick: () => goalDialog() }, '+ New')));
  if (!gs.length) {
    goalCard.appendChild(el('div.empty', { style: { padding: '30px 10px' } },
      el('h3', 'No goals yet'),
      el('p', 'Set a clean-run target or a monthly budget and watch it fill in.')));
  } else {
    goalCard.appendChild(el('div', { style: { display: 'grid', gap: '16px' } },
      gs.map(g => {
        const p = S.goalProgress(g);
        return el('div', { style: { cursor: 'pointer' }, onclick: () => ctx.go('goals') },
          el('div.row-b', el('div.gtitle', { style: { fontSize: '13.5px' } }, g.title),
            el('span.badge.' + (p.state === 'bad' ? 'bad' : p.state === 'done' ? 'good' : 'mute'), p.label)),
          el('div.pbar' + (p.inverse ? (p.state === 'bad' ? '.bad' : '') : (p.pct >= 1 ? '.ok' : '')),
            el('i', { style: { width: Math.min(100, p.pct * 100) + '%' } })),
          el('div.pinfo', el('span', p.sub), el('span', g.habitId ? S.habitName(g.habitId) : 'All habits')));
      })));
  }
  right.appendChild(goalCard);

  /* next milestone ring */
  if (next && !streak.fresh) {
    const prev = [0, ...S.MILESTONES].filter(m => m <= streak.days).pop() || 0;
    const pct = (streak.days - prev) / (next - prev);
    right.appendChild(el('div.card',
      el('div.card-t', { style: { marginBottom: '14px' } }, 'Next milestone'),
      el('div.row', { style: { gap: '18px' } },
        ring(pct, next - streak.days),
        el('div',
          el('div', { style: { fontSize: '17px', fontWeight: 620, letterSpacing: '-.02em' } }, `${next} days`),
          el('div.hint', { style: { marginTop: '4px' } },
            `${plural(next - streak.days, 'day')} away. Last milestone cleared: ${prev || 'none yet'}.`)))));
  }

  /* reclaimed */
  const rec = S.reclaimed();
  if (rec.money > 0.5 || rec.minutes > 20) {
    right.appendChild(el('div.card',
      el('div.card-t', { style: { marginBottom: '12px' } }, 'Reclaimed on this run'),
      el('div.row', { style: { gap: '26px' } },
        rec.money > 0.5 ? stat(S.setting('currency') + Math.round(rec.money).toLocaleString(), 'Not spent') : null,
        rec.minutes > 20 ? stat(rec.minutes > 600 ? `${(rec.minutes / 60).toFixed(0)}h` : `${Math.round(rec.minutes)}m`, 'Not lost') : null),
      el('p.hint', { style: { marginTop: '12px' } },
        'Estimated from your per-slip figures and your historical rate. Rough, but directionally honest.')));
  }

  grid.append(left, right);
  root.appendChild(grid);

  return () => { clearInterval(liveTimer); hideTip(); gem?.destroy(); gem = null; };
}

/* ── pieces ─────────────────────────────────────────────── */

const esc = s => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/** Caption under the crystal — says what the object is currently showing. */
function gemHint(streak, longest, tier) {
  if (streak.fresh) return 'your crystal — it grows with every clean day';
  if (streak.days === 0) return 'shattered today · it regrows from here';
  const bits = [`${plural(tier, 'facet')} earned`];
  if (longest.days > streak.days) bits.push(`ghost = your ${longest.days}-day record`);
  else bits.push('you are past your old record');
  return bits.join(' · ');
}

function stat(value, label, tip) {
  const n = el('div.hs', el('b', value), el('span', label));
  if (tip) attachTip(n, tip);
  return n;
}

function milestoneLine(d) {
  if (d <= 3)  return 'The first days are the steepest. You are through them.';
  if (d <= 7)  return 'A full week. The pattern is starting to bend.';
  if (d <= 30) return 'A month. This is no longer a fluke.';
  if (d <= 90) return 'Ninety days. Most of the rewiring happens in here.';
  if (d < 365) return 'This is what a changed habit looks like from the inside.';
  return 'A year. Whatever you are doing, keep doing it.';
}

function sparkline(days, color) {
  const w = 84, h = 30, max = Math.max(1, ...days.map(d => d.n));
  const step = w / (days.length - 1);
  const pts = days.map((d, i) => `${(i * step).toFixed(1)},${(h - (d.n / max) * (h - 4) - 2).toFixed(1)}`);
  return el('svg.spark', { viewBox: `0 0 ${w} ${h}`, style: { width: w + 'px', flex: 'none', opacity: .85 },
    html: `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6"
             stroke-linejoin="round" stroke-linecap="round" opacity=".95"/>
           ${days.map((d, i) => d.n ? `<circle cx="${(i * step).toFixed(1)}" cy="${(h - (d.n / max) * (h - 4) - 2).toFixed(1)}" r="1.9" fill="${color}"/>` : '').join('')}` });
}

function ring(pct, left) {
  const R = 34, C = 2 * Math.PI * R;
  return el('svg', { viewBox: '0 0 84 84', style: { width: '84px', height: '84px', flex: 'none' },
    html: `<circle cx="42" cy="42" r="${R}" fill="none" stroke="var(--surface-3)" stroke-width="7"/>
      <circle cx="42" cy="42" r="${R}" fill="none" stroke="url(#rg)" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.min(1, pct))}"
        transform="rotate(-90 42 42)" style="transition:stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)"/>
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="var(--a1)"/><stop offset="100%" stop-color="var(--a2)"/></linearGradient></defs>
      <text x="42" y="47" text-anchor="middle" style="fill:var(--text);font-size:17px;font-weight:650">${left}</text>` });
}

function quoteCard() {
  const pool = quotePool(S.setting('customQuotes'));
  const seed = S.setting('quoteSeed') || 0;
  const pinned = S.setting('pinnedQuote');
  const q = pinned ? (pool.find(x => x.id === pinned) || quoteFor(todayISO(), pool, seed))
                   : quoteFor(todayISO(), pool, seed);
  const fav = S.setting('favoriteQuotes').includes(q.id);

  const card = el('div.quote', { style: { marginTop: '16px' } },
    el('div.quote-acts',
      el('button.icon-btn' + (fav ? '.on' : ''), { title: 'Favourite (F)', onclick: e => {
          const on = S.toggleFavorite(q.id);
          e.currentTarget.classList.toggle('on', on);
          toast(on ? 'Saved to favourites' : 'Removed from favourites', { ms: 1800 });
        } },
        el('svg', { viewBox: '0 0 24 24', html: '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/>' })),
      el('button.icon-btn', { title: 'Another (Q)', onclick: () => { S.setSetting('quoteSeed', seed + 1); S.setSetting('pinnedQuote', null); } },
        el('svg', { viewBox: '0 0 24 24', html: '<path d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006.3 6.3M4 15a8 8 0 0013.7 2.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' }))),
    el('div.quote-body', q.text),
    el('div.quote-by', '— ' + q.by));
  return card;
}
