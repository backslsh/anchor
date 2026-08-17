/* app.js — boot, routing, lock flow, keyboard layer, easter eggs. */

import { $, el, clear, todayISO, plural, relDate } from './util.js';
import * as S from './store.js';
import * as vault from './vault.js';
import * as sync from './sync.js';
import { hasSubtle } from './crypto.js';
import { THEMES, ladder, isUnlocked, safeAccent, theme as themeById } from './themes.js';
import { mountField } from './scene.js';
import * as UI from './ui.js';
import { relapseDialog, habitDialog, goalDialog, dayDialog } from './forms.js';
import * as Dashboard from './views/dashboard.js';
import * as Calendar from './views/calendar.js';
import * as Habits from './views/habits.js';
import * as Goals from './views/goals.js';
import * as Insights from './views/insights.js';
import * as Settings from './views/settings.js';

const VIEWS = {
  dashboard: { mod: Dashboard, title: 'Dashboard' },
  calendar:  { mod: Calendar,  title: 'Calendar' },
  habits:    { mod: Habits,    title: 'Habits' },
  goals:     { mod: Goals,     title: 'Goals' },
  insights:  { mod: Insights,  title: 'Insights' },
  settings:  { mod: Settings,  title: 'Settings' },
};
const ORDER = Object.keys(VIEWS);

let current = 'dashboard';
let cleanup = null;
let field = null;
let idleTimer = null;

const isRemote = !['localhost', '127.0.0.1', '::1', ''].includes(location.hostname)
              && location.protocol !== 'file:';

/* ══════════════ context handed to every view ══════════════ */
const ctx = {
  go, rerender, lock, resetIdle, replayTour,
  enableSync: () => enableSyncIfPossible(),
  setSub: t => { $('#view-sub').textContent = t || ''; },
};

/* ══════════════ boot (invoked at the foot of this file) ══════════════ */
async function boot() {
  // A device opening the PC's URL for the first time has no vault of its own.
  // Adopt the PC's KDF parameters so the same passphrase opens the same data.
  try {
    if (!vault.isProtected() && !vault.hasData()) await sync.bootstrapFromServer();
  } catch { /* no sync store here — carry on standalone */ }

  if (vault.isProtected()) return showLock();
  try {
    S.hydrate(await vault.load());
  } catch {
    S.hydrate(null);
  }

  // ?demo fills an *empty* vault with sample data. It cannot touch a real one:
  // seedDemo() bails if any habit or entry already exists.
  // ?demo=locked keeps authentic theme lock states, for screenshots of the
  // ladder; the plain form unlocks every theme so they can be looked at.
  const demoParam = new URLSearchParams(location.search).get('demo');
  if (demoParam !== null) {
    try {
      const { seedDemo } = await import('./demo.js');
      seedDemo({ unlockAll: demoParam !== 'locked' });
    } catch (e) { console.warn('[anchor] demo seed failed', e); }
  }

  startApp();
}

/* ── lock screen ────────────────────────────────────────── */
function showLock() {
  const lock = $('#lock');
  $('#shell').classList.add('hidden');
  lock.classList.remove('hidden');
  lock.setAttribute('aria-hidden', 'false');
  field ||= mountField($('#lock-bg'));

  // Built as DOM rather than markup: the hint is user text, and on a synced
  // device it is text that arrived from somewhere else.
  const hint = vault.getHint();
  const foot = clear($('#lock-foot'));
  if (hint) {
    foot.append('Hint: ' + hint, el('br'), 'Encrypted with AES-256-GCM on this device.');
  } else {
    foot.append('Encrypted with AES-256-GCM on this device. Nothing leaves your browser.');
  }

  const form = $('#lock-form'), pass = $('#lock-pass'), err = $('#lock-err'), btn = $('#lock-submit');
  pass.value = '';
  setTimeout(() => pass.focus(), 200);

  $('#lock-peek').onclick = () => {
    pass.type = pass.type === 'password' ? 'text' : 'password';
    pass.focus();
  };

  form.onsubmit = async e => {
    e.preventDefault();
    err.textContent = ''; err.classList.remove('shake');
    btn.disabled = true; btn.textContent = 'Deriving key…';
    const ok = await vault.unlock(pass.value);
    btn.disabled = false; btn.textContent = 'Unlock';
    if (!ok) {
      err.textContent = 'That is not the passphrase.';
      err.classList.add('shake');
      pass.select();
      return;
    }
    try {
      S.hydrate(await vault.load());
    } catch {
      err.textContent = 'Unlocked, but the vault could not be read.';
      return;
    }
    lock.classList.add('hidden');
    lock.setAttribute('aria-hidden', 'true');
    field?.destroy(); field = null;
    pass.value = '';
    startApp();
  };
}

function lock() {
  if (!vault.isProtected()) {
    UI.toast('No passphrase set', { sub: 'Set one in Settings to enable locking.', kind: 'warn' });
    return;
  }
  // Persist before dropping the key, then tear the UI down before clearing state
  // so no plaintext is left rendered behind the lock screen.
  S.flush().finally(() => {
    vault.lock();
    UI.closePalette(); UI.closeBreathe(); UI.closeSheet();
    $('#modal-root').classList.add('hidden');
    $('#shell').classList.add('hidden');
    clearTimeout(idleTimer);
    cleanup?.(); cleanup = null;
    clear($('#viewport'));
    S.hydrate(null);
    showLock();
  });
}

/* ── app start ──────────────────────────────────────────── */
let wired = false;

function startApp() {
  applyAccent();
  $('#shell').classList.remove('hidden');

  S.setSaveErrorHandler(e =>
    UI.toast('Could not save', { sub: e.message, kind: 'bad', ms: 9000 }));

  // These attach to document/window, so they must only ever be wired once —
  // startApp() runs again on every unlock.
  if (!wired) {
    wired = true;
    wireChrome();
    wireKeyboard();
    scheduleMidnight();
    window.addEventListener('beforeunload', () => { S.flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) S.flush(); });
  }

  resetIdle();
  S.reconcileGoals();
  go(current, true);
  startSync();
  setTimeout(offerRecovery, 500);
  setTimeout(checkThemeUnlocks, 1400);

  if (!hasSubtle()) setTimeout(insecureWarning, 900);
  else if (isRemote && !vault.isProtected()) setTimeout(remoteWarning, 900);
  else setTimeout(firstRun, 700);
}

/* ── sync ───────────────────────────────────────────────────── */
async function startSync() {
  S.setSaveHook(() => sync.schedulePush());
  const info = await sync.probe();
  if (!info || !info.sync) return;

  sync.restoreEnabled();
  sync.onChange(() => { if (current === 'settings') rerender(); });

  // Turn sync on unless the user has explicitly switched it off. It only needs
  // a passphrase — waiting for the server to already hold a vault was a
  // deadlock, because nothing could seed one until sync was running.
  const choice = S.setting('syncEnabled');
  if (choice !== false && vault.isProtected()) sync.setEnabled(true);
  else if (sync.isEnabled()) sync.start();

  if (sync.isEnabled()) {
    const r = await sync.pull();
    if (r === 'merged') UI.toast('Synced', { sub: 'Entries from this machine merged in.', kind: 'ok' });
    else if (r === 'seeded') UI.toast('Sync started', { sub: 'Your vault now also lives on this machine, encrypted.', kind: 'ok' });
    else if (r === 'denied') UI.toast('Sync refused', { sub: sync.status().lastError, kind: 'bad', ms: 8000 });
  }
}

/* ── themes ─────────────────────────────────────────────────── */

/** Apply the stored accent, falling back if it is not actually unlocked. */
function applyAccent() {
  const best = S.longestStreak().days;
  const id = safeAccent(S.setting('accent'), best, S.setting('unlocked'));
  if (id !== S.setting('accent')) S.setSetting('accent', id);
  document.documentElement.dataset.accent = id;
}

/**
 * Announce any theme the current record has earned but that has not been
 * acknowledged yet. Keyed on longest streak, so this fires once when the rung
 * is reached and never un-fires afterwards.
 */
function checkThemeUnlocks() {
  const best = S.longestStreak().days;
  const manual = S.setting('unlocked');
  const earned = ladder().filter(t =>
    t.req > 0 && isUnlocked(t, best, manual) && !S.wasSeen('theme:' + t.id));
  if (!earned.length) return;

  // On a first run with existing history, mark the backlog quietly and only
  // celebrate the highest — nobody wants six popups in a row.
  const show = earned[earned.length - 1];
  for (const t of earned) S.markSeen('theme:' + t.id);

  UI.confetti({ count: 130, colors: [show.c[0], show.c[1], '#ffffff'] });
  UI.toast(`${show.label} unlocked`, {
    sub: `${show.req} clean days. ${earned.length > 1 ? `${earned.length} themes are now open. ` : ''}Settings → Appearance.`,
    kind: 'ok', ms: 9000,
  });
}

/**
 * If the vault opened empty but the previous payload still holds a real record,
 * offer to put it back. Earlier builds could overwrite an encrypted vault with
 * blank plaintext on lock; this is the way out for anyone that happened to.
 */
async function offerRecovery() {
  if (S.relapses().length || S.habits({ all: true }).length) return;
  let backup = null;
  try { backup = await vault.readBackup(); } catch { return; }
  const n = backup?.relapses?.length || 0;
  const h = backup?.habits?.length || 0;
  if (!n && !h) return;

  UI.modal({
    title: 'Recover your record?',
    sub: 'This vault is empty, but the previous copy is not.',
    body: el('div', { style: { display: 'grid', gap: '14px' } },
      el('div.notice', el('span', '⚠'), el('span',
        `Anchor found an earlier copy holding ${plural(n, 'entry', 'entries')} across ` +
        `${plural(h, 'habit')}. A bug in an older build could blank a vault when it locked. ` +
        'Restoring puts that copy back.')),
      el('p.hint', { style: { fontSize: '13px', lineHeight: 1.7 } },
        'If you genuinely meant to erase everything, dismiss this — the empty vault stays as it is.')),
    footer: [
      { label: 'Leave it empty', onClick: c => c() },
      { label: 'Restore', cls: 'btn-primary', onClick: async c => {
          S.hydrate(backup);
          await S.flush();
          c();
          UI.toast('Record restored', { sub: `${plural(n, 'entry', 'entries')} back in place.`, kind: 'ok', ms: 7000 });
          rerender();
        } },
    ],
  });
}

/** Called once a passphrase exists, so sync can begin without a page reload. */
async function enableSyncIfPossible() {
  if (!sync.status().available) return;
  if (S.setting('syncEnabled') === false) return;
  if (!vault.isProtected()) return;
  sync.setEnabled(true);
  const r = await sync.pull();
  if (r === 'seeded' || r === 'ok') {
    UI.toast('Sync started', { sub: 'Changes now save to this machine too, encrypted.', kind: 'ok' });
  }
}

function scheduleMidnight() {
  const n = new Date();
  const ms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 8) - n;
  setTimeout(() => { rerender(); scheduleMidnight(); }, Math.min(ms, 2 ** 31 - 1));
}

/* ── routing ────────────────────────────────────────────── */
function go(name, force = false) {
  if (!VIEWS[name]) return;
  if (name === current && !force) return rerender();
  current = name;
  [...$('#rail-nav').children].forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('#view-title').textContent = VIEWS[name].title;
  $('#view-sub').textContent = '';
  rerender();
}

let rendering = false, dirty = false;

function rerender() {
  // A view that writes to the store mid-render would otherwise re-enter here
  // and interleave two passes into the same container.
  if (rendering) { dirty = true; return; }
  rendering = true;
  try {
    const vp = $('#viewport');
    cleanup?.(); cleanup = null;
    UI.hideTip();
    clear(vp);
    cleanup = VIEWS[current].mod.render(vp, ctx) || null;
    vp.scrollTop = 0;
  } finally {
    rendering = false;
  }
  if (dirty) { dirty = false; rerender(); }
}

const modalOpen = () => !$('#modal-root').classList.contains('hidden');

/* Re-render on state change — but not mid-dialog, or the form under the
   user's cursor gets rebuilt. Deferred changes land when the dialog closes. */
let staleUnderModal = false;
S.subscribe(() => {
  if ($('#shell').classList.contains('hidden')) return;
  if (modalOpen()) { staleUnderModal = true; return; }
  rerender();
});
document.addEventListener('anchor:modalclosed', () => {
  if (!staleUnderModal) return;
  staleUnderModal = false;
  if (!$('#shell').classList.contains('hidden')) rerender();
});

/* ── chrome wiring ──────────────────────────────────────── */
function wireChrome() {
  [...$('#rail-nav').children].forEach(b => (b.onclick = () => go(b.dataset.view)));
  $('#btn-log').onclick = () => relapseDialog();
  $('#btn-lock').onclick = lock;
  $('#btn-panic').onclick = urgeMode;
  $('#btn-palette').onclick = () => UI.openPalette(commands());
  $('#breathe-close').onclick = () => {
    UI.closeBreathe();
    UI.toast('Still here.', { sub: 'That counts for something.', kind: 'ok' });
  };
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));
}

/* ── idle auto-lock ─────────────────────────────────────── */
function resetIdle() {
  clearTimeout(idleTimer);
  const mins = S.setting('autoLockMin');
  if (!mins || !vault.isProtected()) return;
  idleTimer = setTimeout(() => {
    UI.toast('Locked after inactivity', { kind: 'warn' });
    lock();
  }, mins * 60000);
}

/* ── keyboard ───────────────────────────────────────────── */
let konami = [];
const KONAMI = 'ArrowUp,ArrowUp,ArrowDown,ArrowDown,ArrowLeft,ArrowRight,ArrowLeft,ArrowRight,b,a';
let typed = '';

function wireKeyboard() {
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

    if (e.key === 'Escape') {
      if (UI.isPaletteOpen()) return UI.closePalette();
      if (UI.isBreatheOpen()) return UI.closeBreathe();
      if (UI.isSheetOpen())   return UI.closeSheet();
      if (UI.closeTopModal()) return;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); return UI.openPalette(commands());
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault(); return lock();
    }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('#modal-root').classList.contains('hidden')) return;

    /* konami */
    konami.push(e.key);
    if (konami.length > 10) konami.shift();
    if (konami.join(',') === KONAMI) { konami = []; secretTheme(); return; }

    /* type-to-summon */
    if (/^[a-z]$/i.test(e.key)) {
      typed = (typed + e.key.toLowerCase()).slice(-6);
      if (typed.endsWith('calm')) { typed = ''; UI.openBreathe(el('div', 'Four in. Seven hold. Eight out.')); return; }
      if (typed.endsWith('why'))  { typed = ''; showWhy(); return; }
    }

    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '6') return go(ORDER[+k - 1]);
    switch (k) {
      case 'l': e.preventDefault(); return relapseDialog();
      case 'p': return urgeMode();
      case 'n': return habitDialog();
      case 'g': return goalDialog();
      case 'e': return go('settings');
      case '?': return UI.toggleShortcuts();
      case 'q': if (current === 'dashboard') { S.setSetting('quoteSeed', (S.setting('quoteSeed') || 0) + 1); S.setSetting('pinnedQuote', null); } return;
      case 'f': if (current === 'dashboard') $('.quote-acts .icon-btn')?.click(); return;
      case 't':
        if (current === 'calendar') { Calendar.goToday(); rerender(); }
        else go('dashboard');
        return;
      case 'arrowleft':  if (current === 'calendar') { Calendar.nav(-1); rerender(); } return;
      case 'arrowright': if (current === 'calendar') { Calendar.nav(1);  rerender(); } return;
    }
    if (e.key === '/') { e.preventDefault(); UI.openPalette(commands()); }
    if (e.key === 'ArrowLeft'  && current === 'calendar') { Calendar.nav(-1); rerender(); }
    if (e.key === 'ArrowRight' && current === 'calendar') { Calendar.nav(1);  rerender(); }
  });
}

/* ── command palette ────────────────────────────────────── */
function commands() {
  const base = [
    { label: 'Log a relapse', icon: '＋', hint: 'L', keywords: 'add slip record entry', run: () => relapseDialog() },
    { label: 'Urge support', icon: '♥', hint: 'P', keywords: 'panic craving breathe help', run: urgeMode },
    { label: 'New habit', icon: '★', hint: 'N', keywords: 'create track behaviour', run: () => habitDialog() },
    { label: 'New goal', icon: '◎', hint: 'G', keywords: 'target streak budget', run: () => goalDialog() },
    { label: 'Breathing exercise', icon: '◌', keywords: 'calm 478 relax', run: () => UI.openBreathe(el('div', 'Four in. Seven hold. Eight out.')) },
    ...ORDER.map(v => ({ label: 'Go to ' + VIEWS[v].title, icon: '→', hint: String(ORDER.indexOf(v) + 1),
      keywords: 'view navigate', run: () => go(v) })),
    { label: 'Shuffle the daily quote', icon: '❝', keywords: 'another inspiration',
      run: () => { S.setSetting('pinnedQuote', null); S.setSetting('quoteSeed', (S.setting('quoteSeed') || 0) + 1); go('dashboard'); } },
    { label: 'Keyboard shortcuts', icon: '⌘', hint: '?', run: () => UI.toggleShortcuts() },
    { label: 'Lock the vault', icon: '🔒', hint: 'Ctrl L', keywords: 'sign out secure', run: lock },
    { label: 'Why am I doing this?', icon: '?', keywords: 'reasons motivation notes', run: showWhy },
  ];
  for (const h of S.habits()) {
    base.push({ label: `Log: ${h.name}`, icon: h.emoji, keywords: 'relapse slip ' + h.name,
      hint: `${S.currentStreak(h.id).days}d clean`, run: () => relapseDialog({ habitId: h.id }) });
  }
  const t = todayISO();
  base.push({ label: 'Open today', icon: '▣', keywords: 'calendar day detail', run: () => dayDialog(t) });
  return base;
}

/* ── urge support ───────────────────────────────────────── */
function urgeMode() {
  const st = S.currentStreak();
  const lessons = S.sortedRelapses().filter(r => r.lesson).slice(0, 3);
  const goals = S.goals().filter(g => !g.completedAt).slice(0, 2);
  const longest = S.longestStreak();

  const node = el('div',
    el('div', { style: { fontSize: '15px' } },
      st.fresh
        ? 'Nothing logged yet. Keep it that way tonight.'
        : el('span', 'You are ', el('b', plural(st.days, 'day')), ' into this run.',
            longest.days > st.days ? ` Your best was ${longest.days}.` : ' That is your best yet.')),

    goals.length ? el('div', { style: { marginTop: '10px', fontSize: '13px', color: 'var(--text-3)' } },
      'Riding on it: ' + goals.map(g => g.title).join(' · ')) : null,

    lessons.length
      ? el('div',
          el('div', { style: { marginTop: '18px', fontSize: '12px', letterSpacing: '.1em',
            textTransform: 'uppercase', color: 'var(--text-3)' } }, 'You wrote this for right now'),
          lessons.map(r => el('span.note', `“${r.lesson}”`,
            el('span', { style: { display: 'block', marginTop: '6px', fontStyle: 'normal', fontSize: '11.5px',
              color: 'var(--text-3)' } }, `— you, ${relDate(r.date)}, after ${S.habitName(r.habitId)}`))))
      : el('p', { style: { marginTop: '16px', fontSize: '13px', color: 'var(--text-3)' } },
          'Next time you log something, leave yourself a note. It shows up here.'));

  UI.openBreathe(node);
}

function showWhy() {
  const hs = S.habits().filter(h => h.note);
  UI.modal({
    title: 'Why you are doing this',
    sub: 'In your own words, from when you were thinking clearly.',
    body: hs.length
      ? el('div.dlist', hs.map(h => el('div.drow', { style: { alignItems: 'flex-start' } },
          el('span.hswatch', { style: { background: h.color, height: '38px' } }),
          el('div.drow-main',
            el('div.drow-t', `${h.emoji} ${h.name}`),
            el('div', { style: { fontSize: '13px', color: 'var(--text-2)', marginTop: '4px',
              lineHeight: 1.6, whiteSpace: 'normal' } }, h.note)))))
      : el('div.empty', el('h3', 'Nothing written down'),
          el('p', 'Add a reason to each habit — you will be glad of it at 1am.')),
    footer: [{ label: 'Close', onClick: c => c() }],
  });
}

/* ── secrets ────────────────────────────────────────────── */
/* The Konami code grants Terminal, which is deliberately not on the ladder —
   the ladder is earned, this one is found. It must never hand out a rung
   somebody else is still working toward. */
function secretTheme() {
  const t = themeById('terminal');
  const fresh = S.unlockTheme('terminal');
  S.setSetting('accent', 'terminal');
  document.documentElement.dataset.accent = 'terminal';
  UI.confetti({ count: 110, colors: [t.c[0], t.c[1], '#ffffff'] });
  UI.toast(fresh ? 'Terminal unlocked' : 'Terminal again', {
    sub: fresh ? 'Not on the ladder. You found it instead of earning it.' : 'Welcome back.',
    kind: 'ok', ms: 7000,
  });
  rerender();
}

/* ── first-run nudges & tips ────────────────────────────── */
const TIPS = [
  ['tip:shift', 'Shift-click any calendar day', 'Logs straight to that date, skipping the day view.'],
  ['tip:palette', 'Ctrl K opens the command palette', 'Everything in the app is reachable from there.'],
  ['tip:gem', 'The shape on the dashboard is yours', 'It settles and brightens the longer your run gets. Drag it.'],
  ['tip:lesson', 'The “note to yourself” field', 'Whatever you write there is what Urge support shows you later.'],
  ['tip:live', 'Click the big streak number', 'It switches to hours, minutes and seconds.'],
  ['tip:keys', 'Press ? at any time', 'The full keyboard map.'],
];

function firstRun() {
  if (!S.wasSeen('welcome')) {
    S.markSeen('welcome');
    UI.modal({
      title: 'Anchor',
      sub: 'A private, permanent record — and a few things to help you not add to it.',
      body: el('div', { style: { display: 'grid', gap: '14px' } },
        el('p.hint', { style: { fontSize: '13.5px', lineHeight: 1.7 } },
          'Everything stays on your own machine. No account, no server, nothing uploaded. Start by naming one behaviour you want to see on a calendar.'),
        el('div.notice', el('span', '🔒'), el('span',
          'Relapses cannot be deleted once logged — only amended, with a record of the change. That is the whole point of the thing.')),
        el('div.notice.info', el('span', '🔑'), el('span',
          'Set a passphrase in Settings when you are ready. It encrypts everything with a key only you hold — and it is what switches on syncing between your devices.'))),
      footer: [
        { label: 'Look around', onClick: c => c() },
        { label: 'Set a passphrase', onClick: c => { c(); go('settings'); } },
        { label: 'Create a habit', cls: 'btn-primary', onClick: c => { c(); habitDialog(); } },
      ],
    });
    return;
  }
  dripTip();
}

function dripTip() {
  const next = TIPS.find(([k]) => !S.wasSeen(k));
  if (!next) return;
  const [k, title, sub] = next;
  setTimeout(() => {
    if (!$('#modal-root').classList.contains('hidden')) return;
    S.markSeen(k);
    UI.toast(title, { sub, ms: 8500 });
  }, 6000 + Math.random() * 6000);
}
setInterval(() => { if (!$('#shell').classList.contains('hidden')) dripTip(); }, 240000);

function replayTour() {
  S.commit(s => { for (const [k] of TIPS) delete s.settings.seen[k]; delete s.settings.seen.welcome; });
  UI.toast('Tips reset', { sub: 'They will show up again as you use the app.', kind: 'ok' });
}

/* ── insecure-context warning ───────────────────────────── */
function insecureWarning() {
  UI.modal({
    title: 'Encryption is unavailable here',
    sub: location.origin,
    body: el('div', { style: { display: 'grid', gap: '14px' } },
      el('div.notice', el('span', '⚠'), el('span',
        'This page is not in a secure context, so the browser withholds the WebCrypto API. ' +
        'Passphrases, encryption and sync cannot work here — anything you log stays in plain text on this device.')),
      el('p.hint', { style: { fontSize: '13px', lineHeight: 1.7 } },
        'Browsers grant crypto only to https:// pages and to localhost; a bare LAN address over ' +
        'http:// falls outside that. Start the server with --lan and it will serve HTTPS with a ' +
        'self-signed certificate, which is enough to satisfy the browser.'),
      el('p.hint', { style: { fontSize: '13px', lineHeight: 1.7 } },
        'You can keep using it as-is, but treat this device as unprotected.')),
    footer: [{ label: 'Understood', cls: 'btn-primary', onClick: c => c() }],
  });
}

/* ── remote-host warning ────────────────────────────────── */
function remoteWarning() {
  UI.modal({
    title: 'This copy is on the internet',
    sub: location.hostname,
    body: el('div', { style: { display: 'grid', gap: '14px' } },
      el('div.notice', el('span', '⚠'), el('span',
        'Anchor is being served from a public host and no passphrase is set. Anyone who finds this URL can read and change your record.')),
      el('p.hint', { style: { fontSize: '13px', lineHeight: 1.7 } },
        'Setting a passphrase encrypts the vault with AES-256-GCM before it is written to storage — so even with the URL and the device, the data is unreadable without it.')),
    footer: [
      { label: 'Later', onClick: c => c() },
      { label: 'Set a passphrase', cls: 'btn-primary', onClick: c => { c(); go('settings'); } },
    ],
  });
}

/* expose a little surface for the console-curious */
window.anchor = {
  get state() { return S.S; },
  export: () => JSON.stringify(S.S, null, 2),
  version: '1.0.0',
  note: 'Relapses are append-and-amend only. Even from here.',
  /** Load the sample vault — for screenshots and for trying the app out. */
  async demo(opts) {
    const { seedDemo } = await import('./demo.js');
    const ok = seedDemo(opts);
    if (ok) rerender();
    return ok;
  },
};

/* Boot last: everything above must be initialised before the first render,
   or top-level `const`s are still in their temporal dead zone. */
boot();
