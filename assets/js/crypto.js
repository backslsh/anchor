/* crypto.js — real at-rest encryption for the vault.
   PBKDF2-SHA256 (600k) → AES-GCM-256. The passphrase is never stored;
   only a salt and a verifier ciphertext are, so a wrong passphrase simply
   fails to decrypt. Nothing here leaves the device. */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITERATIONS = 600000;

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function randomB64(bytes = 16) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** True when the browser exposes WebCrypto. Only secure contexts do — HTTPS or
    localhost — so plain http:// on a LAN address cannot encrypt anything. */
export const hasSubtle = () =>
  typeof crypto !== 'undefined' && !!crypto.subtle && !!globalThis.isSecureContext;

export function requireSubtle() {
  if (hasSubtle()) return;
  throw new Error(
    'This browser is not in a secure context, so encryption is unavailable. ' +
    'Open Anchor over https:// or on localhost.');
}

/**
 * One PBKDF2 pass, 512 bits out, split in two:
 *   bytes  0–31  → the AES-GCM key (identical to a 256-bit derivation, so
 *                  vaults written before sync existed still open)
 *   bytes 32–63  → a sync auth token, independent of the key and useless for
 *                  decryption even if the server is compromised
 */
export async function deriveKeyAndAuth(passphrase, saltB64, iterations = ITERATIONS) {
  requireSubtle();
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations, hash: 'SHA-256' }, base, 512);
  const all = new Uint8Array(bits);
  const key = await crypto.subtle.importKey(
    'raw', all.slice(0, 32), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const auth = [...all.slice(32)].map(b => b.toString(16).padStart(2, '0')).join('');
  return { key, auth };
}

export async function deriveKey(passphrase, saltB64, iterations = ITERATIONS) {
  return (await deriveKeyAndAuth(passphrase, saltB64, iterations)).key;
}

export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function decryptJSON(key, payload) {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.ct));
  return JSON.parse(dec.decode(pt));
}

/** Rough passphrase score 0..1 — length-dominant, which is what actually matters. */
export function strength(p) {
  if (!p) return 0;
  let pool = 0;
  if (/[a-z]/.test(p)) pool += 26;
  if (/[A-Z]/.test(p)) pool += 26;
  if (/[0-9]/.test(p)) pool += 10;
  if (/[^A-Za-z0-9]/.test(p)) pool += 32;
  const bits = p.length * Math.log2(pool || 1);
  return Math.min(1, bits / 90);
}
