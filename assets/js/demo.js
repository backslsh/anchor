/* demo.js — generates a realistic sample vault, for screenshots and for the
 * public "try it" demo.
 *
 * The shape is deliberate rather than random: fourteen months of history with a
 * real improvement arc, a 62-day personal best set a few months back, and a
 * 54-day run in progress. That puts the dashboard crystal near the top of its
 * record ghost — visibly earned, with the remaining gap still legible.
 *
 * Seeded, so every run produces the same vault and screenshots stay stable.
 */

import { uid, iso, addDays } from './util.js';
import * as S from './store.js';
import { THEMES, ladder } from './themes.js';

/* mulberry32 — small, fast, deterministic */
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPAN         = 430;   // days of history
const CURRENT_RUN  = 54;    // last relapse this many days ago
const RECORD_FROM  = 152;   // record gap runs between these two relapses
const RECORD_TO    = 89;    // → 62 clean days, still ahead of the current run

/* 54 against a 62-day record puts the spire at ~87% of its ghost: a big,
   well-earned crystal with eight satellites, while still leaving a visible
   gap to close. Raising the run any further starts hiding the ghost, which
   is the part that shows what the object is actually measuring. */

const TRIGGERS = ['stress', 'bored', 'tired', 'late night', 'lonely', 'anxious',
  'social', 'argument', 'payday', 'weekend', 'unstructured', 'phone'];

const NOTES = [
  'Told myself it would be ten minutes. It was two hours.',
  'Skipped dinner, got irritable, and went looking for a reward.',
  'Nothing dramatic — just drifted into it while avoiding an email.',
  'Bad day at work. Did not even pretend to resist this one.',
  'Woke up at 3am and reached for it before I was properly awake.',
  'Friday. Everyone else was out. Felt owed something.',
  'Kept it in the room with me, which was the actual mistake.',
  'Was fine all week and then lost the whole evening.',
];

const LESSONS = [
  'It was never worth it by morning. Not once.',
  'Put the phone in the kitchen at 11 and this does not happen.',
  'Eat something first. Half of these start as hunger.',
  'The urge peaked at about four minutes. Four minutes.',
  'Text someone instead. Anyone. It breaks the loop.',
  'Boredom is the real trigger, not stress. Plan the evening.',
];

/**
 * @param unlockAll  Opt in to every theme, including the off-ladder secret.
 *                   Off by default: a public demo should show the ladder
 *                   honestly, with the rungs this streak has not reached still
 *                   locked, because the progression is part of what is being
 *                   demonstrated. Useful locally for looking at the palettes.
 */
export function buildDemoVault({ unlockAll = false } = {}) {
  const rand = rng(20260816);
  const day = n => iso(addDays(new Date(), -n));
  const pick = arr => arr[Math.floor(rand() * arr.length)];

  const habits = [
    { id: 'h-scroll', name: 'Late-night scrolling', color: '#7c5cff', emoji: '📱',
      note: 'It eats the next morning, every time. I want my mornings back.',
      minutesPerRelapse: 95, costPerRelapse: 0, base: 0.20 },
    { id: 'h-vape', name: 'Vaping', color: '#00d6c2', emoji: '🌫️',
      note: 'Started as a way to quit smoking. Now it is just the thing I quit smoking for.',
      costPerRelapse: 9, minutesPerRelapse: 0, base: 0.12 },
    { id: 'h-spend', name: 'Impulse spending', color: '#ff7a45', emoji: '💸',
      note: 'Buying things at midnight I would not buy at midday.',
      costPerRelapse: 48, minutesPerRelapse: 0, base: 0.035 },
  ].map(h => ({
    ...h,
    createdAt: new Date(Date.now() - SPAN * 86400000).toISOString(),
    archived: false,
  }));

  /* ── relapses ────────────────────────────────────────────────
     Rate decays toward the present, so the calendar and the streak
     chart both show someone who is genuinely getting better. */
  const relapses = [];
  const addOne = (habit, daysAgo, force = false) => {
    const hour = 18 + Math.floor(rand() * 6);              // evenings, mostly
    const trig = [];
    const nTrig = 1 + Math.floor(rand() * 2);
    while (trig.length < nTrig) {
      const t = pick(TRIGGERS);
      if (!trig.includes(t)) trig.push(t);
    }
    relapses.push({
      id: 'r-' + uid(),
      habitId: habit.id,
      date: day(daysAgo),
      time: `${String(hour).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}`,
      intensity: 1 + Math.floor(rand() * 5),
      triggers: trig,
      note: rand() < 0.45 || force ? pick(NOTES) : '',
      lesson: rand() < 0.3 ? pick(LESSONS) : '',
      createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      history: [],
    });
  };

  const blocked = d =>
    d < CURRENT_RUN ||                       // the run in progress
    (d < RECORD_FROM && d > RECORD_TO);      // the record gap

  for (let d = SPAN; d >= 0; d--) {
    if (blocked(d)) continue;
    const decay = 0.22 + 0.78 * Math.pow(d / SPAN, 1.4);   // worse further back
    for (const h of habits) {
      if (rand() < h.base * decay) addOne(h, d);
    }
  }

  // anchor the three dates the story depends on
  addOne(habits[0], CURRENT_RUN, true);
  addOne(habits[0], RECORD_FROM, true);
  addOne(habits[1], RECORD_TO, true);

  // one amended entry, so the audit trail is visible in screenshots
  const amended = relapses.find(r => r.date === day(RECORD_TO));
  if (amended) {
    amended.history = [{
      at: new Date(Date.now() - (RECORD_TO - 1) * 86400000).toISOString(),
      changes: [{ field: 'intensity', label: 'intensity', from: 2, to: 4 },
                { field: 'triggers', label: 'triggers', from: ['bored'], to: ['bored', 'tired'] }],
    }];
    amended.intensity = 4;
    amended.triggers = ['bored', 'tired'];
  }

  /* ── goals ── */
  const goals = [
    { id: 'g-1', kind: 'streak', habitId: 'h-scroll', target: 75,
      title: '75 clean days from scrolling',
      createdAt: new Date(Date.now() - 44 * 86400000).toISOString(),
      archived: false, completedAt: null, done: false },
    { id: 'g-2', kind: 'cap', habitId: null, target: 4, window: 'month',
      title: 'At most 4 slips in a month',
      createdAt: new Date(Date.now() - 70 * 86400000).toISOString(),
      archived: false, completedAt: null, done: false },
    { id: 'g-3', kind: 'milestone', habitId: 'h-spend', due: day(-12),
      title: 'Delete the shopping apps from my phone',
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
      archived: false, completedAt: null, done: false },
    { id: 'g-4', kind: 'streak', habitId: 'h-scroll', target: 30,
      title: '30 clean days from scrolling',
      createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
      archived: false, done: false,
      completedAt: new Date(Date.now() - 11 * 86400000).toISOString() },
  ];

  const base = S.blank();
  return {
    ...base,
    createdAt: new Date(Date.now() - SPAN * 86400000).toISOString(),
    habits: habits.map(({ base: _b, ...h }) => h),
    relapses,
    goals,
    settings: {
      ...base.settings,
      favoriteQuotes: ['q56', 'q78'],
      unlocked: unlockAll ? THEMES.map(t => t.id) : [],
      // Lets the app disable anything a stranger could use to lock themselves
      // out of a vault they never intended to own.
      demoMode: true,
      seen: {
        welcome: Date.now(), 'tip:shift': Date.now(), 'tip:palette': Date.now(),
        'tip:gem': Date.now(), 'tip:lesson': Date.now(), 'tip:live': Date.now(),
        'tip:keys': Date.now(),
        // pre-acknowledge the ladder so browsing the demo does not fire a
        // celebration for a streak nobody actually ran
        ...Object.fromEntries(ladder().map(t => ['theme:' + t.id, Date.now()])),
      },
      syncEnabled: false,
    },
    savedAt: new Date().toISOString(),
  };
}

/**
 * Load the sample vault. Refuses if there is anything real here, so it can
 * never overwrite a genuine record.
 */
export function seedDemo({ force = false, unlockAll = false } = {}) {
  if (!force && (S.relapses().length || S.habits({ all: true }).length)) {
    console.warn('[anchor] demo: this vault already has data. seedDemo({force:true}) to replace it.');
    return false;
  }
  S.hydrate(buildDemoVault({ unlockAll }));
  S.flush();
  const st = S.currentStreak(), best = S.longestStreak();
  console.info(`[anchor] demo vault loaded — ${S.relapses().length} entries, ` +
               `${st.days}-day run against a ${best.days}-day record` +
               (unlockAll ? ', all themes unlocked.' : '.'));
  return true;
}
