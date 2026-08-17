/* store.js — state, mutators, selectors.
   ── Permanence rule ──────────────────────────────────────────────
   There is deliberately no removeRelapse(). A relapse can be amended
   (habit, date, time, note, intensity, triggers) and every amendment is
   appended to that record's `history`. Nothing about a logged relapse can
   be erased short of wiping the whole vault from Settings. */

import { uid, todayISO, iso, parseISO, dayDiff, daysSince, addDays, pad } from './util.js';
import * as vault from './vault.js';

export const MILESTONES = [1, 3, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365, 500, 730, 1000];

const listeners = new Set();
let saveTimer = null;
let onSaveError = () => {};
/* Set by wipe(). The reload that follows fires beforeunload → flush(), which
   would otherwise write the still-populated in-memory state straight back and
   silently undo the erase. Once sealed, nothing persists again. */
let sealed = false;

export let S = blank();

export function blank() {
  return {
    v: 1,
    createdAt: new Date().toISOString(),
    habits: [],
    relapses: [],
    goals: [],
    settings: {
      accent: 'aurora',
      weekStart: 0,
      autoLockMin: 15,
      favoriteQuotes: [],
      customQuotes: [],
      pinnedQuote: null,
      quoteSeed: 0,
      unlocked: [],
      seen: {},
      showClean: true,
      currency: '$',
      // null = never decided, so sync switches itself on as soon as a
      // passphrase exists. true/false is an explicit choice and is respected.
      syncEnabled: null,
    },
    savedAt: null,        // stamped on every write; arbitrates a sync merge
  };
}

/* ── plumbing ──────────────────────────────────────────────── */

export function hydrate(data) {
  S = migrate(data || blank());
  emit();
}
export function setSaveErrorHandler(fn) { onSaveError = fn; }

function migrate(d) {
  const base = blank();
  const out = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  out.habits   = (out.habits   || []).map(h => ({ archived: false, emoji: '🌫️', costPerRelapse: 0, minutesPerRelapse: 0, note: '', ...h }));
  out.relapses = (out.relapses || []).map(r => ({ time: '', note: '', lesson: '', intensity: 3, triggers: [], history: [], ...r }));
  out.goals    = (out.goals    || []).map(g => ({ archived: false, completedAt: null, done: false, ...g }));
  return out;
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() { for (const fn of listeners) fn(S); }

/* Set by app.js once sync is wired, so the store does not have to import it. */
let afterSave = () => {};
export function setSaveHook(fn) { afterSave = fn; }

/** Mutate + persist + notify. */
export function commit(fn) {
  const r = fn(S);
  S.savedAt = new Date().toISOString();
  emit();
  schedule();
  return r;
}
/* Never write while the vault is locked. After lock() the in-memory state is
   blank by design, and persisting that would overwrite the real record — the
   same guard load() already applies in the other direction. */
const canPersist = () => !sealed && vault.isUnlocked();

function schedule() {
  if (!canPersist()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!canPersist()) return;
    vault.save(S).then(() => afterSave()).catch(e => onSaveError(e));
  }, 220);
}
export function flush() {
  clearTimeout(saveTimer);
  if (!canPersist()) return Promise.resolve();
  return vault.save(S);
}

/* ── habits ────────────────────────────────────────────────── */

export const habits = ({ all = false } = {}) =>
  S.habits.filter(h => all || !h.archived);

export const habit = id => S.habits.find(h => h.id === id) || null;
export const habitName = id => habit(id)?.name || 'Deleted habit';
export const habitColor = id => habit(id)?.color || '#8d99ae';

export const addHabit = data => commit(s => {
  const h = { id: uid(), createdAt: new Date().toISOString(), archived: false,
              emoji: '🌫️', color: '#7c5cff', note: '', costPerRelapse: 0, minutesPerRelapse: 0, ...data };
  s.habits.push(h);
  return h;
});

export const updateHabit = (id, patch) => commit(s => {
  const h = s.habits.find(x => x.id === id);
  if (h) Object.assign(h, patch, { updatedAt: new Date().toISOString() });
  return h;
});

/** Habits are archived, never deleted — relapse records must keep pointing somewhere. */
export const archiveHabit = (id, on = true) => updateHabit(id, { archived: on });

/* ── relapses (append + amend only) ────────────────────────── */

export const relapses = () => S.relapses;

export const sortedRelapses = () =>
  [...S.relapses].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

export const addRelapse = data => commit(s => {
  const r = {
    id: uid(),
    habitId: data.habitId,
    date: data.date || todayISO(),
    time: data.time || '',
    note: data.note || '',
    lesson: data.lesson || '',
    intensity: data.intensity ?? 3,
    triggers: data.triggers || [],
    createdAt: new Date().toISOString(),
    history: [],
  };
  s.relapses.push(r);
  return r;
});

const AMENDABLE = ['habitId', 'date', 'time', 'note', 'lesson', 'intensity', 'triggers'];
const LABEL = { habitId: 'habit', date: 'date', time: 'time', note: 'note',
                lesson: 'note to self', intensity: 'intensity', triggers: 'triggers' };

/** Amend a relapse. Returns the change list that was recorded (possibly empty). */
export const amendRelapse = (id, patch) => commit(s => {
  const r = s.relapses.find(x => x.id === id);
  if (!r) return [];
  const changes = [];
  for (const f of AMENDABLE) {
    if (!(f in patch)) continue;
    const before = r[f], after = patch[f];
    const same = Array.isArray(before) ? before.join('|') === (after || []).join('|') : before === after;
    if (same) continue;
    changes.push({ field: f, label: LABEL[f], from: before, to: after });
    r[f] = after;
  }
  if (changes.length) (r.history ||= []).push({ at: new Date().toISOString(), changes });
  return changes;
});

export const relapse = id => S.relapses.find(r => r.id === id) || null;

/** { 'YYYY-MM-DD': [relapse, …] } */
export function byDate() {
  const m = new Map();
  for (const r of S.relapses) {
    if (!m.has(r.date)) m.set(r.date, []);
    m.get(r.date).push(r);
  }
  return m;
}

export const onDate = d => S.relapses.filter(r => r.date === d);

export function forHabit(habitId) {
  return habitId ? S.relapses.filter(r => r.habitId === habitId) : S.relapses;
}

/* ── streaks & stats ───────────────────────────────────────── */

/** Start of the tracked window: whichever came first, the habit being created
    or the oldest entry filed against it. Entries can be backdated, so the
    creation timestamp alone is not a safe floor. */
function originFor(habitId) {
  const candidates = [];
  if (habitId) {
    const h = habit(habitId);
    if (h) candidates.push(iso(new Date(h.createdAt)));
  } else {
    candidates.push(iso(new Date(S.createdAt)));
    for (const h of S.habits) candidates.push(iso(new Date(h.createdAt)));
  }
  for (const r of forHabit(habitId)) candidates.push(r.date);
  candidates.sort();
  return candidates[0] || todayISO();
}

/** Days since the most recent relapse (0 = relapsed today). */
export function currentStreak(habitId = null) {
  const list = forHabit(habitId);
  if (!list.length) return { days: daysSince(originFor(habitId)), since: originFor(habitId), fresh: true };
  const last = list.reduce((a, r) => (r.date > a ? r.date : a), '0000-00-00');
  return { days: Math.max(0, daysSince(last)), since: last, fresh: false };
}

/** Longest clean run in days, plus the window it spanned. */
export function longestStreak(habitId = null) {
  const list = forHabit(habitId);
  const start = originFor(habitId);
  if (!list.length) return { days: daysSince(start), from: start, to: todayISO() };
  const days = [...new Set(list.map(r => r.date))].sort();
  let best = { days: dayDiff(start, days[0]), from: start, to: days[0] };
  for (let i = 0; i < days.length - 1; i++) {
    const gap = dayDiff(days[i], days[i + 1]) - 1;
    if (gap > best.days) best = { days: gap, from: days[i], to: days[i + 1] };
  }
  const tail = daysSince(days[days.length - 1]);
  if (tail > best.days) best = { days: tail, from: days[days.length - 1], to: todayISO() };
  return best;
}

/** Every clean run, oldest→newest (used for the streak history chart). */
export function allStreaks(habitId = null) {
  const list = forHabit(habitId);
  if (!list.length) return [];
  const days = [...new Set(list.map(r => r.date))].sort();
  const runs = [];
  for (let i = 0; i < days.length - 1; i++) runs.push(dayDiff(days[i], days[i + 1]) - 1);
  runs.push(daysSince(days[days.length - 1]));
  return runs;
}

export const totalCleanDays = (habitId = null) => {
  const start = originFor(habitId);
  const span = daysSince(start) + 1;
  const hit = new Set(forHabit(habitId).map(r => r.date)).size;
  return { clean: Math.max(0, span - hit), span, hit };
};

export function countsByYear(habitId = null) {
  const m = new Map();
  for (const r of forHabit(habitId)) {
    const y = +r.date.slice(0, 4);
    m.set(y, (m.get(y) || 0) + 1);
  }
  return m;
}
export function countsByMonth(year, habitId = null) {
  const out = Array(12).fill(0);
  for (const r of forHabit(habitId)) if (+r.date.slice(0, 4) === year) out[+r.date.slice(5, 7) - 1]++;
  return out;
}
export function countsByWeekday(habitId = null) {
  const out = Array(7).fill(0);
  for (const r of forHabit(habitId)) out[parseISO(r.date).getDay()]++;
  return out;
}
export function countsByHour(habitId = null) {
  const out = Array(24).fill(0);
  for (const r of forHabit(habitId)) if (r.time) out[+r.time.slice(0, 2)]++;
  return out;
}
export function countsByHabit() {
  const m = new Map();
  for (const r of S.relapses) m.set(r.habitId, (m.get(r.habitId) || 0) + 1);
  return m;
}
/** Relapses per day over the last n days, oldest first. */
export function lastNDays(n, habitId = null) {
  const map = new Map();
  for (const r of forHabit(habitId)) map.set(r.date, (map.get(r.date) || 0) + 1);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = iso(addDays(new Date(), -i));
    out.push({ date: d, n: map.get(d) || 0 });
  }
  return out;
}
export function triggerTally(habitId = null) {
  const m = new Map();
  for (const r of forHabit(habitId)) for (const t of r.triggers || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
export const allTriggers = () => [...new Set(S.relapses.flatMap(r => r.triggers || []))].sort();

/** Money + time reclaimed vs. a pre-tracking baseline (worst 30-day window). */
export function reclaimed() {
  let money = 0, minutes = 0;
  for (const h of S.habits) {
    const n = forHabit(h.id).length;
    if (!n) continue;
    const st = currentStreak(h.id);
    // Rate is measured over the tracked window *excluding* the current clean
    // run, otherwise a long run deflates the very baseline it is beating.
    const span = daysSince(originFor(h.id)) + 1;
    const rate = n / Math.max(1, span - st.days);
    money   += rate * st.days * (h.costPerRelapse || 0);
    minutes += rate * st.days * (h.minutesPerRelapse || 0);
  }
  return { money, minutes };
}

export function nextMilestone(days) {
  return MILESTONES.find(m => m > days) ?? null;
}
export function hitMilestone(days) {
  return MILESTONES.includes(days) ? days : null;
}

/* ── goals ─────────────────────────────────────────────────── */

export const goals = ({ all = false } = {}) => S.goals.filter(g => all || !g.archived);

export const addGoal = data => commit(s => {
  const g = { id: uid(), createdAt: new Date().toISOString(), archived: false,
              completedAt: null, done: false, habitId: null, ...data };
  s.goals.push(g);
  return g;
});
export const updateGoal = (id, patch) => commit(s => {
  const g = s.goals.find(x => x.id === id);
  if (g) Object.assign(g, patch, { updatedAt: new Date().toISOString() });
  return g;
});
export const removeGoal = id => commit(s => { s.goals = s.goals.filter(g => g.id !== id); });

/** Evaluate a goal → { pct, label, sub, state:'ok'|'bad'|'done' } */
export function goalProgress(g) {
  if (g.kind === 'streak') {
    const st = currentStreak(g.habitId);
    const pct = Math.min(1, st.days / g.target);
    return { pct, value: st.days, target: g.target,
             label: `${st.days} / ${g.target} days`,
             sub: pct >= 1 ? 'Reached' : `${g.target - st.days} to go`,
             state: pct >= 1 ? 'done' : 'ok' };
  }
  if (g.kind === 'cap') {
    const { from, label: win } = windowStart(g.window);
    const n = forHabit(g.habitId).filter(r => r.date >= from).length;
    const pct = Math.min(1, n / Math.max(1, g.target));
    const over = n > g.target;
    return { pct, value: n, target: g.target,
             label: `${n} / ${g.target} this ${win}`,
             sub: over ? `${n - g.target} over the cap` : `${g.target - n} left in budget`,
             state: over ? 'bad' : 'ok', inverse: true };
  }
  // milestone
  const pct = g.done ? 1 : 0;
  const left = g.due ? dayDiff(todayISO(), g.due) : null;
  return { pct, label: g.done ? 'Complete' : 'In progress',
           sub: g.done ? 'Marked done' : (left == null ? 'No deadline'
                : left < 0 ? `${-left} days overdue` : `${left} days left`),
           state: g.done ? 'done' : (left != null && left < 0 ? 'bad' : 'ok') };
}

export function windowStart(win) {
  const now = new Date();
  if (win === 'week')  return { from: iso(addDays(now, -6)), label: 'week' };
  if (win === 'year')  return { from: `${now.getFullYear()}-01-01`, label: 'year' };
  return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, label: 'month' };
}

/** Auto-complete streak goals; returns goals newly finished this tick. */
export function reconcileGoals() {
  const done = [];
  commit(s => {
    for (const g of s.goals) {
      if (g.archived || g.completedAt) continue;
      const p = goalProgress(g);
      if (p.state === 'done' && p.pct >= 1) {
        g.completedAt = new Date().toISOString();
        done.push(g);
      }
    }
  });
  return done;
}

/* ── settings ──────────────────────────────────────────────── */

export const setSetting = (k, v) => commit(s => { s.settings[k] = v; });
export const setting = k => S.settings[k];

export const toggleFavorite = qid => commit(s => {
  const f = s.settings.favoriteQuotes;
  const i = f.indexOf(qid);
  i < 0 ? f.push(qid) : f.splice(i, 1);
  return i < 0;
});

export const addCustomQuote = (text, by) => commit(s => {
  s.settings.customQuotes.push({ id: 'c-' + uid(), text, by: by || 'You' });
});
export const removeCustomQuote = id => commit(s => {
  s.settings.customQuotes = s.settings.customQuotes.filter(q => q.id !== id);
});

export const unlockTheme = name => commit(s => {
  if (!s.settings.unlocked.includes(name)) { s.settings.unlocked.push(name); return true; }
  return false;
});

export const markSeen = k => commit(s => { s.settings.seen[k] = Date.now(); });
export const wasSeen  = k => !!S.settings.seen[k];

export function wipe() {
  sealed = true;
  clearTimeout(saveTimer);
  S = blank();
  localStorage.removeItem('anchor:data');
  localStorage.removeItem('anchor:data.bak');
  localStorage.removeItem('anchor:meta');
}
