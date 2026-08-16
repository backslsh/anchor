/* sync.js — keeps this device and the PC's sync store in step.
 *
 * The server holds one AES-GCM blob and a revision number. It cannot read it.
 * Everything here happens after decryption, in the browser.
 *
 * Merge rule: relapses are append-only, so the merged set is the *union* by id
 * — a sync can never drop an entry, which is the same promise the rest of the
 * app makes. Where the same entry exists on both sides, the copy carrying more
 * amendments wins. Habits and goals union by id with last-edit-wins; settings
 * come from whichever document was saved more recently.
 */

import * as vault from './vault.js';
import * as S from './store.js';

const POLL_MS = 20000;

let available = null;      // null = not probed yet
let enabled = false;
let rev = 0;
let timer = null;
let pushTimer = null;
let inFlight = false;
let listeners = new Set();
let lastError = null;
let lastSyncAt = null;

export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { for (const fn of listeners) fn(status()); };

export const status = () => ({
  available, enabled, rev, lastError, lastSyncAt,
  busy: inFlight,
});

const api = p => new URL(p, location.href).toString();

/** Does this origin have a sync store behind it? */
export async function probe() {
  try {
    const r = await fetch(api('./api/bootstrap'), { cache: 'no-store' });
    if (!r.ok) { available = false; emit(); return null; }
    const info = await r.json();
    available = !!info.sync;
    emit();
    return info;
  } catch {
    available = false; emit();
    return null;
  }
}

export function isEnabled() { return enabled && available; }

export function setEnabled(on) {
  enabled = !!on;
  S.setSetting('syncEnabled', enabled);
  if (enabled) { start(); pull({ silent: true }); }
  else stop();
  emit();
}

export function start() {
  if (!enabled || !available) return;
  stop();
  timer = setInterval(() => { if (!document.hidden) pull({ silent: true }); }, POLL_MS);
  window.addEventListener('focus', onFocus);
}
export function stop() {
  clearInterval(timer); timer = null;
  clearTimeout(pushTimer); pushTimer = null;
  window.removeEventListener('focus', onFocus);
}
const onFocus = () => pull({ silent: true });

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const tok = vault.getAuth();
  if (tok) h.Authorization = 'Bearer ' + tok;
  return h;
}

/* ── pull ────────────────────────────────────────────────────── */
export async function pull({ silent = false } = {}) {
  if (!isEnabled() || inFlight) return null;
  inFlight = true; emit();
  try {
    const r = await fetch(api('./api/vault'), { headers: headers(), cache: 'no-store' });
    if (r.status === 404) { rev = 0; lastError = null; await push({ force: true }); return 'seeded'; }
    if (r.status === 401) { lastError = 'This device is not authorised — the PC vault uses a different passphrase.'; return 'denied'; }
    if (!r.ok) { lastError = `Sync store returned ${r.status}.`; return 'error'; }

    const doc = await r.json();
    const remote = await vault.openFromSync(doc.payload);
    const merged = merge(S.S, remote);
    rev = doc.rev;
    lastError = null;
    lastSyncAt = new Date().toISOString();

    if (changed(S.S, merged)) {
      S.hydrate(merged);
      await push({ force: false });      // our additions go back up
      return 'merged';
    }
    // remote already contains everything we have?
    if (changed(remote, merged)) { await push({ force: false }); return 'pushed'; }
    return 'in-sync';
  } catch (e) {
    lastError = e.message === 'locked' ? 'Unlock to sync.' : e.message;
    return 'error';
  } finally {
    inFlight = false; emit();
  }
}

/* ── push ────────────────────────────────────────────────────── */
export async function push({ force = false } = {}) {
  if (!isEnabled()) return null;
  const meta = vault.syncMeta();
  if (!meta) { lastError = 'Sync needs a passphrase — the store only accepts encrypted data.'; emit(); return 'nopass'; }
  try {
    const payload = await vault.sealForSync(S.S);
    const r = await fetch(api('./api/vault'), {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ rev: force ? undefined : rev, payload, meta, auth: vault.getAuth() }),
    });

    if (r.status === 409) {
      // Someone wrote while we were editing. Take their copy, fold ours in, retry once.
      const doc = await r.json();
      const remote = await vault.openFromSync(doc.payload);
      const merged = merge(S.S, remote);
      rev = doc.rev;
      S.hydrate(merged);
      const retry = await fetch(api('./api/vault'), {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ rev, payload: await vault.sealForSync(merged), meta, auth: vault.getAuth() }),
      });
      if (!retry.ok) { lastError = `Could not resolve a conflict (${retry.status}).`; emit(); return 'conflict'; }
      rev = (await retry.json()).rev;
      lastError = null; lastSyncAt = new Date().toISOString(); emit();
      return 'resolved';
    }
    if (r.status === 401) { lastError = 'This device is not authorised for the PC vault.'; emit(); return 'denied'; }
    if (!r.ok) { lastError = `Sync store returned ${r.status}.`; emit(); return 'error'; }

    rev = (await r.json()).rev;
    lastError = null; lastSyncAt = new Date().toISOString(); emit();
    return 'ok';
  } catch (e) {
    lastError = e.message === 'locked' ? 'Unlock to sync.' : e.message;
    emit();
    return 'error';
  }
}

/** Coalesce bursts of edits into one upload. */
export function schedulePush() {
  if (!isEnabled()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(), 1200);
}

/* ── merge ───────────────────────────────────────────────────── */
const amendCount = r => (r.history || []).length;
const lastTouch = r => {
  const h = r.history || [];
  return h.length ? h[h.length - 1].at : (r.createdAt || '');
};

function unionById(a = [], b = [], pick) {
  const out = new Map();
  for (const x of a) out.set(x.id, x);
  for (const y of b) {
    const x = out.get(y.id);
    out.set(y.id, x ? pick(x, y) : y);
  }
  return [...out.values()];
}

export function merge(local, remote) {
  if (!remote) return local;
  const newer = (a, b) => ((b.savedAt || '') > (a.savedAt || '') ? b : a);
  const primary = newer(local, remote);

  return {
    ...primary,
    createdAt: [local.createdAt, remote.createdAt].filter(Boolean).sort()[0] || primary.createdAt,

    // never drop an entry; richer amendment history wins a tie
    relapses: unionById(local.relapses, remote.relapses, (x, y) => {
      if (amendCount(y) > amendCount(x)) return y;
      if (amendCount(x) > amendCount(y)) return x;
      return lastTouch(y) > lastTouch(x) ? y : x;
    }),

    habits: unionById(local.habits, remote.habits, (x, y) =>
      (y.updatedAt || '') > (x.updatedAt || '') ? y : x),

    goals: unionById(local.goals, remote.goals, (x, y) => {
      if (y.completedAt && !x.completedAt) return y;
      if (x.completedAt && !y.completedAt) return x;
      return (y.updatedAt || '') > (x.updatedAt || '') ? y : x;
    }),

    settings: {
      ...primary.settings,
      // union the sets rather than letting one device forget the other's
      favoriteQuotes: [...new Set([...(local.settings.favoriteQuotes || []),
                                   ...(remote.settings.favoriteQuotes || [])])],
      customQuotes: unionById(local.settings.customQuotes, remote.settings.customQuotes, (x) => x),
      unlocked: [...new Set([...(local.settings.unlocked || []), ...(remote.settings.unlocked || [])])],
      seen: { ...(remote.settings.seen || {}), ...(local.settings.seen || {}) },
    },
  };
}

function changed(a, b) {
  return a.relapses.length !== b.relapses.length
      || a.habits.length !== b.habits.length
      || a.goals.length !== b.goals.length;
}

/* ── first-run adoption on a new device ──────────────────────── */
/**
 * A phone opening the PC's URL for the first time has no vault of its own.
 * Take the PC's KDF parameters so the same passphrase unlocks the same data.
 * Returns true when the lock screen should be shown.
 */
export async function bootstrapFromServer() {
  const info = await probe();
  if (!info || !info.sync || !info.hasVault || !info.meta) return false;
  if (vault.isProtected() || vault.hasData()) return false;   // this device already has its own
  vault.adoptMeta(info.meta);
  enabled = true;
  return true;
}

export function restoreEnabled() {
  enabled = S.setting('syncEnabled') === true;
  return enabled;
}
