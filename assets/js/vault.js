/* vault.js — localStorage persistence, optionally encrypted.
   Two keys:
     anchor:meta  { v, protected, salt, iterations, verifier:{iv,ct}, hint }   (plaintext)
     anchor:data  { plain:{...} }  |  { iv, ct }                               (payload)
   A backup of the previous good payload is kept at anchor:data.bak. */

import { deriveKey, deriveKeyAndAuth, encryptJSON, decryptJSON, randomB64, ITERATIONS } from './crypto.js';

const K_META = 'anchor:meta';
const K_DATA = 'anchor:data';
const K_BAK  = 'anchor:data.bak';

let key = null;             // CryptoKey when protected + unlocked
let auth = null;            // sync token derived alongside it
let meta = null;

export function readMeta() {
  if (meta) return meta;
  try { meta = JSON.parse(localStorage.getItem(K_META) || 'null'); } catch { meta = null; }
  if (!meta) meta = { v: 1, protected: false };
  return meta;
}
function writeMeta(m) { meta = m; localStorage.setItem(K_META, JSON.stringify(m)); }

export const isProtected = () => readMeta().protected === true;
export const isUnlocked  = () => !isProtected() || key !== null;
export const getHint     = () => readMeta().hint || '';

function rawPayload() {
  try { return JSON.parse(localStorage.getItem(K_DATA) || 'null'); } catch { return null; }
}

/** Verify a passphrase and hold the derived key for this session. */
export async function unlock(passphrase) {
  const m = readMeta();
  if (!m.protected) return true;
  const { key: k, auth: a } = await deriveKeyAndAuth(passphrase, m.salt, m.iterations || ITERATIONS);
  try {
    const probe = await decryptJSON(k, m.verifier);
    if (probe && probe.anchor === true) { key = k; auth = a; return true; }
    return false;
  } catch { return false; }
}

export function lock() { key = null; auth = null; }

/** The sync token for this session. Null unless unlocked. */
export const getAuth = () => auth;

/** Meta a second device needs before it can derive the same key. */
export function syncMeta() {
  const m = readMeta();
  return m.protected
    ? { salt: m.salt, iterations: m.iterations, verifier: m.verifier, hint: m.hint || '' }
    : null;
}

/** Adopt another device's KDF parameters so the same passphrase opens its vault. */
export function adoptMeta(m) {
  if (!m || !m.salt || !m.verifier) throw new Error('Incomplete vault meta.');
  writeMeta({ v: 1, protected: true, salt: m.salt,
              iterations: m.iterations || ITERATIONS, verifier: m.verifier, hint: m.hint || '' });
  key = null; auth = null;
}

/** Turn protection on (first time) or change the passphrase. Re-encrypts current data. */
export async function protect(passphrase, currentData, hint = '') {
  const salt = randomB64(16);
  const { key: k, auth: a } = await deriveKeyAndAuth(passphrase, salt, ITERATIONS);
  const verifier = await encryptJSON(k, { anchor: true, at: Date.now() });
  key = k; auth = a;
  writeMeta({ v: 1, protected: true, salt, iterations: ITERATIONS, verifier, hint });
  await save(currentData);
}

/** Remove protection, writing data back as plaintext. */
export async function unprotect(currentData) {
  key = null; auth = null;
  writeMeta({ v: 1, protected: false });
  await save(currentData);
}

/** Encrypt without touching localStorage — used to build the sync payload. */
export async function sealForSync(data) {
  if (!key) throw new Error('locked');
  return encryptJSON(key, data);
}
export async function openFromSync(payload) {
  if (!key) throw new Error('locked');
  return decryptJSON(key, payload);
}

export async function load() {
  const p = rawPayload();
  if (!p) return null;
  if (p.plain !== undefined) return p.plain;
  if (!key) throw new Error('locked');
  return decryptJSON(key, p);
}

const isCiphertext = raw => {
  try { const p = JSON.parse(raw); return !!p && typeof p.ct === 'string'; } catch { return false; }
};

export async function save(data) {
  // Absence of a key means LOCKED, not UNENCRYPTED. Deciding by `key` alone let
  // the beforeunload/visibilitychange flush that fires after an idle auto-lock
  // write blank plaintext straight over the encrypted vault, destroying it.
  if (isProtected() && !key) throw new Error('locked');

  const prev = localStorage.getItem(K_DATA);
  const payload = key ? await encryptJSON(key, data) : { plain: data };
  try {
    localStorage.setItem(K_DATA, JSON.stringify(payload));
    // Never let a plaintext write bury an encrypted backup — that backup may be
    // the only surviving copy if anything ever goes wrong again.
    if (prev && (key || !isCiphertext(prev))) localStorage.setItem(K_BAK, prev);
  } catch (e) {
    throw new Error('Storage write failed — browser storage may be full or blocked. ' + e.message);
  }
}

/** The previous payload, decrypted if possible. Null when there is nothing usable. */
export async function readBackup() {
  const raw = localStorage.getItem(K_BAK);
  if (!raw) return null;
  let p;
  try { p = JSON.parse(raw); } catch { return null; }
  if (p.plain !== undefined) return p.plain;
  if (!key) return null;
  try { return await decryptJSON(key, p); } catch { return null; }
}
export const hasBackup = () => !!localStorage.getItem(K_BAK);

/** Portable export. If a passphrase is given the file itself is encrypted. */
export async function exportBlob(data, passphrase) {
  if (!passphrase) {
    return { format: 'anchor-export', v: 1, encrypted: false, exportedAt: new Date().toISOString(), data };
  }
  const salt = randomB64(16);
  const k = await deriveKey(passphrase, salt, ITERATIONS);
  const payload = await encryptJSON(k, data);
  return { format: 'anchor-export', v: 1, encrypted: true, salt, iterations: ITERATIONS,
           exportedAt: new Date().toISOString(), payload };
}

export async function importBlob(blob, passphrase) {
  if (!blob || blob.format !== 'anchor-export') throw new Error('Not an Anchor export file.');
  if (!blob.encrypted) return blob.data;
  if (!passphrase) throw new Error('This export is encrypted — a passphrase is required.');
  const k = await deriveKey(passphrase, blob.salt, blob.iterations || ITERATIONS);
  try { return await decryptJSON(k, blob.payload); }
  catch { throw new Error('Wrong passphrase for this export file.'); }
}

export function hasData() { return rawPayload() !== null; }
