/* themes.js — the accent ladder.
 *
 * Themes unlock against your LONGEST clean run, not your current one. Once
 * earned, a theme is yours permanently: taking it back after a relapse would
 * turn a reward into a punishment, which is the opposite of what this app is
 * for. A slip costs you the streak counter — it should not also strip the
 * colours off the walls.
 *
 * The palettes themselves live in app.css under html[data-accent="…"].
 */

export const THEMES = [
  { id: 'aurora', label: 'Aurora', req: 0, c: ['#7c5cff', '#00d6c2'],
    note: 'Where everyone starts.' },
  { id: 'tide', label: 'Tide', req: 0, c: ['#2f9bff', '#61e8ff'],
    note: 'Also yours from day one.' },
  { id: 'moss', label: 'Moss', req: 7, c: ['#3ddc97', '#a8e05f'],
    note: 'One clean week.' },
  { id: 'ember', label: 'Ember', req: 15, c: ['#ff7a45', '#ffc861'],
    note: 'A fortnight and then some.' },
  { id: 'rose', label: 'Rose', req: 30, c: ['#ff5c9d', '#c17bff'],
    note: 'A month. No longer a fluke.' },
  { id: 'ash', label: 'Ash', req: 60, c: ['#9aa6bd', '#d7e0f0'],
    note: 'Two months.' },
  { id: 'glacier', label: 'Glacier', req: 90, c: ['#4fd8ff', '#d6f4ff'],
    note: 'Ninety days. Most of the rewiring happens in here.' },
  { id: 'copper', label: 'Copper', req: 180, c: ['#d9784f', '#f0b98c'],
    note: 'Half a year. The whole room warms up.' },
  { id: 'aurelian', label: 'Aurelian', req: 365, c: ['#e0b04a', '#ffe6a6'],
    note: 'One year. Nothing else in here looks like this.' },

  // Not on the ladder, and not listed until it is found.
  { id: 'terminal', label: 'Terminal', req: null, secret: true, c: ['#3ef58b', '#c9ffdf'],
    note: 'You were not supposed to find that yet.' },
];

export const DEFAULT_THEME = 'aurora';

export const theme = id => THEMES.find(t => t.id === id) || null;

/** Ladder entries only, in the order they are earned. */
export const ladder = () => THEMES.filter(t => t.req !== null);

export function isUnlocked(t, bestDays, manual = []) {
  if (!t) return false;
  if (manual.includes(t.id)) return true;      // found rather than earned
  if (t.req === null) return false;            // secret, and not found yet
  return bestDays >= t.req;
}

export const unlockedCount = (bestDays, manual = []) =>
  THEMES.filter(t => isUnlocked(t, bestDays, manual)).length;

/** The next rung, or null once the ladder is finished. */
export function nextLocked(bestDays, manual = []) {
  return ladder().find(t => !isUnlocked(t, bestDays, manual)) || null;
}

/**
 * Themes crossed by growing from `was` to `now` days. Used to celebrate at the
 * moment one is earned rather than the next time Settings happens to be opened.
 */
export function newlyEarned(was, now) {
  return ladder().filter(t => t.req > was && t.req <= now);
}

/** A theme the user is not entitled to should never stay applied. */
export function safeAccent(id, bestDays, manual = []) {
  const t = theme(id);
  return isUnlocked(t, bestDays, manual) ? t.id : DEFAULT_THEME;
}
