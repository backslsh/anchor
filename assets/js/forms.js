/* forms.js — the dialogs shared by every view. */

import { el, clear, todayISO, pad, fmtDate, fmt12, PALETTE, EMOJI, relDate } from './util.js';
import * as S from './store.js';
import { modal, toast, field, segmented, swatches, emojiPicker, confetti, confirmDialog } from './ui.js';

const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const SUGGESTED_TRIGGERS = ['stress', 'bored', 'lonely', 'tired', 'angry', 'anxious', 'celebrating',
  'social', 'late night', 'hungry', 'argument', 'phone', 'alcohol', 'payday', 'weekend', 'unstructured'];

/* ── tag input ──────────────────────────────────────────────── */
function tagInput(initial, onChange) {
  let picked = [...initial];
  const wrap = el('div');
  const chips = el('div.tags', { style: { marginBottom: '8px' } });
  const input = el('input.inp', { placeholder: 'Add a trigger and press Enter…' });

  const known = [...new Set([...SUGGESTED_TRIGGERS, ...S.allTriggers()])];
  const suggest = el('div.tags', { style: { marginTop: '8px' } });

  const sync = () => {
    clear(chips);
    picked.forEach(t => chips.appendChild(el('button.tag.on', { type: 'button',
      onclick: () => { picked = picked.filter(x => x !== t); sync(); onChange(picked); } }, t + ' ✕')));
    clear(suggest);
    known.filter(k => !picked.includes(k)).slice(0, 12).forEach(k =>
      suggest.appendChild(el('button.tag', { type: 'button',
        onclick: () => { picked.push(k); sync(); onChange(picked); } }, k)));
  };
  input.onkeydown = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = input.value.trim().toLowerCase();
    if (v && !picked.includes(v)) { picked.push(v); onChange(picked); }
    input.value = ''; sync();
  };
  sync();
  wrap.append(chips, input, suggest);
  return wrap;
}

/* ── habit picker (colour chips) ────────────────────────────── */
function habitPicker(value, onPick) {
  const wrap = el('div', { style: { display: 'grid', gap: '7px' } });
  const draw = () => {
    clear(wrap);
    for (const h of S.habits()) {
      const on = h.id === value;
      const btn = el('button.hbar', {
        type: 'button',
        style: { '--hc': h.color, borderColor: on ? h.color : '', background: on ? 'var(--surface-2)' : '' },
      },
        el('span.hswatch', { style: { background: h.color } }),
        el('span.hbar-main',
          el('span.hbar-name', `${h.emoji}  ${h.name}`),
          el('div.hbar-meta', `${S.forHabit(h.id).length} logged · ${S.currentStreak(h.id).days}d clean`)),
        on ? el('span', { style: { color: h.color, fontSize: '16px' } }, '✓') : null);
      btn.onclick = () => { value = h.id; onPick(h.id); draw(); };
      wrap.appendChild(btn);
    }
  };
  draw();
  return wrap;
}

/* ── log / amend a relapse ──────────────────────────────────── */
export function relapseDialog({ id = null, date = todayISO(), habitId = null } = {}) {
  const existing = id ? S.relapse(id) : null;
  const hs = S.habits();

  if (!hs.length) {
    return modal({
      title: 'Add a habit first',
      sub: 'Relapses are always attached to a habit, so there is something to colour-code.',
      body: el('p.hint', 'Create your first habit — give it a name and a colour — then come back and log against it.'),
      footer: [{ label: 'Create a habit', cls: 'btn-primary', onClick: c => { c(); habitDialog(); } }],
    });
  }

  const d = {
    habitId: existing?.habitId ?? habitId ?? hs[0].id,
    date: existing?.date ?? date,
    time: existing?.time ?? (existing ? '' : nowTime()),
    intensity: existing?.intensity ?? 3,
    triggers: [...(existing?.triggers ?? [])],
    note: existing?.note ?? '',
    lesson: existing?.lesson ?? '',
  };

  const body = el('div.form',
    existing
      ? el('div.notice', el('span', '🔒'), el('span',
          'This entry is permanent. You can correct any detail below — every change is timestamped and kept in the record.'))
      : null,

    field('Which habit', habitPicker(d.habitId, v => (d.habitId = v))),

    el('div.f2',
      field('Date', (() => {
        const i = el('input.inp', { type: 'date', value: d.date, max: todayISO() });
        i.onchange = () => (d.date = i.value || todayISO());
        return i;
      })()),
      field('Time (optional)', (() => {
        const i = el('input.inp', { type: 'time', value: d.time });
        i.onchange = () => (d.time = i.value);
        return i;
      })())
    ),

    field('How strong was it', segmented(
      [1, 2, 3, 4, 5].map(n => ({ value: n, label: ['Barely', 'Mild', 'Medium', 'Strong', 'Overwhelming'][n - 1] })),
      d.intensity, v => (d.intensity = v))),

    field('Triggers', tagInput(d.triggers, v => (d.triggers = v)),
      'Tagging these is what makes the Insights view worth reading later.'),

    field('What happened', (() => {
      const t = el('textarea.inp', { placeholder: 'Where were you, what preceded it, how did you feel after?' }, d.note);
      t.oninput = () => (d.note = t.value);
      return t;
    })()),

    field('A note to yourself for next time', (() => {
      const t = el('textarea.inp', { placeholder: 'Written now, shown to you the next time you open Urge support.',
        style: { minHeight: '58px' } }, d.lesson);
      t.oninput = () => (d.lesson = t.value);
      return t;
    })(), 'This is the single most useful field in the app. Future-you is a stranger — leave them something.'),

    existing?.history?.length
      ? el('div.audit',
          el('div.card-t', { style: { marginBottom: '8px' } }, `Amendment history · ${existing.history.length}`),
          existing.history.slice().reverse().map(h =>
            el('div.audit-item',
              el('time', new Date(h.at).toLocaleString()),
              el('span', h.changes.map(c => describeChange(c)).join(' · ')))))
      : null,

    existing
      ? el('p.hint', { style: { marginTop: '4px' } },
          `Logged ${new Date(existing.createdAt).toLocaleString()}.`)
      : null
  );

  return modal({
    title: existing ? 'Amend this entry' : 'Log a relapse',
    sub: existing ? fmtDate(existing.date, 'long') + (existing.time ? ` · ${fmt12(existing.time)}` : '')
                  : 'Honest data beats flattering data. This takes twenty seconds.',
    body,
    footer: [
      { label: 'Cancel', onClick: c => c() },
      {
        label: existing ? 'Save amendment' : 'Log it',
        cls: 'btn-primary',
        onClick: c => {
          if (existing) {
            const ch = S.amendRelapse(id, d);
            c();
            toast(ch.length ? 'Amendment recorded' : 'Nothing changed',
              { sub: ch.length ? `${ch.length} field${ch.length > 1 ? 's' : ''} updated and logged` : '', kind: ch.length ? 'ok' : '' });
          } else {
            const before = S.currentStreak(d.habitId).days;
            S.addRelapse(d);
            c();
            toast('Logged. That is the hard part done.', {
              sub: before >= 7 ? `A ${before}-day run ends here — it still counts, and it still happened.`
                               : 'Tomorrow is day one again.',
              kind: 'warn', ms: 6000,
            });
            S.reconcileGoals();
          }
        },
      },
    ],
  });
}

function describeChange(c) {
  const val = v => {
    if (c.field === 'habitId') return S.habitName(v);
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    return v === '' || v == null ? '—' : String(v);
  };
  return `${c.label}: ${val(c.from)} → ${val(c.to)}`;
}

/* ── habit create / edit ────────────────────────────────────── */
export function habitDialog(id = null) {
  const ex = id ? S.habit(id) : null;
  const used = new Set(S.habits({ all: true }).map(h => h.color));
  const d = {
    name: ex?.name ?? '',
    emoji: ex?.emoji ?? EMOJI[0],
    color: ex?.color ?? (PALETTE.find(c => !used.has(c)) || PALETTE[0]),
    note: ex?.note ?? '',
    costPerRelapse: ex?.costPerRelapse ?? 0,
    minutesPerRelapse: ex?.minutesPerRelapse ?? 0,
  };

  const nameInput = el('input.inp', { placeholder: 'Late-night scrolling, vaping, doomspending…', value: d.name });
  nameInput.oninput = () => (d.name = nameInput.value);

  const preview = el('div.hcard', { style: { '--hc': d.color, marginBottom: '4px' } },
    el('div.hcard-top', el('div',
      el('div.hcard-name', el('span.hemoji', d.emoji), el('span', d.name || 'Untitled habit')),
      el('div.hcard-sub', 'Live preview'))));
  const refresh = () => {
    preview.style.setProperty('--hc', d.color);
    preview.querySelector('.hemoji').textContent = d.emoji;
    preview.querySelector('.hcard-name span:last-child').textContent = d.name || 'Untitled habit';
  };
  nameInput.addEventListener('input', refresh);

  const body = el('div.form',
    preview,
    field('Name', nameInput),
    el('div.f2',
      field('Colour', swatches(PALETTE, d.color, v => { d.color = v; refresh(); }),
        'This is the colour it takes on the calendar.'),
      field('Icon', emojiPicker(EMOJI, d.emoji, v => { d.emoji = v; refresh(); }))),
    field('Why you are tracking it', (() => {
      const t = el('textarea.inp', { placeholder: 'The reason, in your own words. You will read this on a bad night.',
        style: { minHeight: '62px' } }, d.note);
      t.oninput = () => (d.note = t.value);
      return t;
    })()),
    el('div.f2',
      field('Cost per slip', (() => {
        const i = el('input.inp', { type: 'number', min: '0', step: '0.5', value: d.costPerRelapse });
        i.oninput = () => (d.costPerRelapse = +i.value || 0);
        return i;
      })(), 'Optional — powers the “reclaimed” figure.'),
      field('Minutes per slip', (() => {
        const i = el('input.inp', { type: 'number', min: '0', step: '5', value: d.minutesPerRelapse });
        i.oninput = () => (d.minutesPerRelapse = +i.value || 0);
        return i;
      })(), 'Optional.')),
    ex ? el('p.hint', `Created ${fmtDate(new Date(ex.createdAt).toISOString().slice(0, 10))} · ${S.forHabit(ex.id).length} entries logged.`) : null
  );

  return modal({
    title: ex ? 'Edit habit' : 'New habit',
    sub: ex ? 'Renaming or recolouring is safe — existing entries follow along.'
            : 'One habit per behaviour you want to see separately on the calendar.',
    body,
    footer: [
      ex ? { label: ex.archived ? 'Unarchive' : 'Archive', cls: 'btn-ghost',
             onClick: c => { S.archiveHabit(ex.id, !ex.archived); c();
               toast(ex.archived ? 'Habit restored' : 'Habit archived', { sub: 'Its history stays intact.' }); } } : null,
      { label: 'Cancel', onClick: c => c() },
      {
        label: ex ? 'Save' : 'Create habit', cls: 'btn-primary',
        onClick: c => {
          if (!d.name.trim()) { nameInput.focus(); nameInput.style.borderColor = 'var(--danger)'; return; }
          if (ex) { S.updateHabit(ex.id, d); toast('Habit updated', { kind: 'ok' }); }
          else { S.addHabit(d); toast(`“${d.name}” is being tracked`, { sub: 'It now has a colour on the calendar.', kind: 'ok' }); }
          c();
        },
      },
    ].filter(Boolean),
  });
}

/* ── goal create / edit ─────────────────────────────────────── */
export function goalDialog(id = null) {
  const ex = id ? S.goals({ all: true }).find(g => g.id === id) : null;
  const hs = S.habits();
  const d = {
    kind: ex?.kind ?? 'streak',
    title: ex?.title ?? '',
    habitId: ex?.habitId ?? null,
    target: ex?.target ?? 30,
    window: ex?.window ?? 'month',
    due: ex?.due ?? '',
  };

  const dyn = el('div', { style: { display: 'grid', gap: '15px' } });
  const titleInput = el('input.inp', { value: d.title });
  titleInput.oninput = () => (d.title = titleInput.value);

  const autoTitle = () => {
    const who = d.habitId ? S.habitName(d.habitId) : 'everything';
    if (d.kind === 'streak') return `${d.target} clean days from ${who}`;
    if (d.kind === 'cap')    return `At most ${d.target} slips of ${who} per ${d.window}`;
    return 'Milestone';
  };
  const maybeAutoTitle = () => { if (!d.title.trim() || titleInput.dataset.auto === '1') {
    titleInput.value = autoTitle(); d.title = titleInput.value; titleInput.dataset.auto = '1'; } };
  titleInput.addEventListener('input', () => (titleInput.dataset.auto = '0'));

  const habitSelect = () => {
    const s = el('select.inp');
    s.appendChild(el('option', { value: '' }, 'All habits combined'));
    hs.forEach(h => s.appendChild(el('option', { value: h.id, selected: h.id === d.habitId }, `${h.emoji} ${h.name}`)));
    s.value = d.habitId || '';
    s.onchange = () => { d.habitId = s.value || null; maybeAutoTitle(); };
    return s;
  };

  function renderDyn() {
    clear(dyn);
    if (d.kind === 'streak') {
      dyn.append(
        field('Applies to', habitSelect()),
        field('Target run (days)', (() => {
          const i = el('input.inp', { type: 'number', min: '1', value: d.target });
          i.oninput = () => { d.target = Math.max(1, +i.value || 1); maybeAutoTitle(); };
          return i;
        })()),
        el('div.notice.info', el('span', 'ℹ'), el('span',
          'Completes itself the moment your clean run reaches the target. You will get a small celebration.')));
    } else if (d.kind === 'cap') {
      dyn.append(
        field('Applies to', habitSelect()),
        el('div.f2',
          field('At most', (() => {
            const i = el('input.inp', { type: 'number', min: '0', value: d.target });
            i.oninput = () => { d.target = Math.max(0, +i.value || 0); maybeAutoTitle(); };
            return i;
          })()),
          field('Per', segmented([{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }],
            d.window, v => { d.window = v; maybeAutoTitle(); }))),
        el('div.notice.info', el('span', 'ℹ'), el('span',
          'A budget rather than a streak. Useful when going from a lot to a little is the realistic next step.')));
    } else {
      dyn.append(
        field('Applies to', habitSelect()),
        field('Deadline (optional)', (() => {
          const i = el('input.inp', { type: 'date', value: d.due });
          i.onchange = () => (d.due = i.value);
          return i;
        })()),
        el('div.notice.info', el('span', 'ℹ'), el('span', 'A free-form goal you tick off yourself.')));
    }
  }
  renderDyn();
  if (!ex) maybeAutoTitle();

  const body = el('div.form',
    field('Kind of goal', segmented([
      { value: 'streak', label: 'Clean run' },
      { value: 'cap', label: 'Budget' },
      { value: 'milestone', label: 'Milestone' },
    ], d.kind, v => { d.kind = v; renderDyn(); maybeAutoTitle(); })),
    dyn,
    field('Title', titleInput));

  return modal({
    title: ex ? 'Edit goal' : 'New goal',
    sub: ex ? null : 'Goals are the only thing here you are allowed to delete.',
    body,
    footer: [
      ex ? { label: 'Delete', cls: 'btn-danger', onClick: c => {
              c(); confirmDialog({ title: 'Delete this goal?', message: 'Goals are not part of the permanent record, so this is fine to remove.',
                confirmLabel: 'Delete', danger: true, onConfirm: () => { S.removeGoal(ex.id); toast('Goal deleted'); } }); } } : null,
      { label: 'Cancel', onClick: c => c() },
      {
        label: ex ? 'Save' : 'Create goal', cls: 'btn-primary',
        onClick: c => {
          if (!d.title.trim()) d.title = autoTitle();
          if (ex) { S.updateGoal(ex.id, d); toast('Goal updated', { kind: 'ok' }); }
          else {
            S.addGoal(d);
            toast('Goal set', { sub: d.kind === 'streak' ? 'It will tick over on its own.' : '', kind: 'ok' });
            confetti({ count: 40, spread: .6, origin: { x: .5, y: .4 } });
          }
          c();
        },
      },
    ].filter(Boolean),
  });
}

/* ── a day's entries ────────────────────────────────────────── */
export function dayDialog(dateISO) {
  const build = () => {
    const list = S.onDate(dateISO).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return el('div',
      list.length
        ? el('div.dlist', list.map(r => {
            const h = S.habit(r.habitId);
            return el('div.drow', { style: { '--hc': h?.color } },
              el('span.hswatch', { style: { background: h?.color || '#666', height: '30px', width: '8px' } }),
              el('div.drow-main',
                el('div.drow-t', `${h?.emoji || ''} ${S.habitName(r.habitId)}`),
                el('div.drow-s',
                  [r.time ? fmt12(r.time) : null,
                   `intensity ${r.intensity}/5`,
                   (r.triggers || []).length ? r.triggers.join(', ') : null,
                   r.history?.length ? `amended ×${r.history.length}` : null].filter(Boolean).join(' · '))),
              el('button.btn.btn-ghost.btn-sm', { onclick: () => { close(); relapseDialog({ id: r.id }); } }, 'Amend'));
          }))
        : el('div.empty', el('h3', 'Clean day'), el('p', 'Nothing was logged on this date.')),
      list.length && list.some(r => r.note)
        ? el('div', { style: { marginTop: '16px' } },
            el('div.card-t', { style: { marginBottom: '8px' } }, 'Notes'),
            list.filter(r => r.note).map(r => el('p.hint', { style: { marginBottom: '10px' } },
              `${S.habitName(r.habitId)} — ${r.note}`)))
        : null);
  };

  const close = modal({
    title: fmtDate(dateISO, 'long'),
    sub: relDate(dateISO),
    body: build(),
    footer: [
      { label: 'Close', onClick: c => c() },
      { label: 'Log for this day', cls: 'btn-primary',
        onClick: c => { c(); relapseDialog({ date: dateISO }); } },
    ],
  });
  return close;
}
