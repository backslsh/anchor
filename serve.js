#!/usr/bin/env node
/* serve.js — static server for Anchor, plus an optional encrypted sync store.
 *
 *   node serve.js              loopback HTTP on 127.0.0.1 — just this machine
 *   node serve.js --lan        HTTPS on your LAN, sync enabled, for phone access
 *
 * The sync store never sees plaintext. It holds the AES-GCM blob the browser
 * produced and nothing else; the passphrase and the key stay in the browser.
 * Writes are authenticated with a token derived from the same passphrase
 * (a separate half of the PBKDF2 output — it cannot be turned back into the key).
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');   // only used to open the browser

/* ── packaged or not ─────────────────────────────────────────
   Built with `node build.js`, the whole app is embedded in a single
   executable and the web assets are read out of the bundle instead of
   off disk. Everything below has to work either way. */
let sea = null;
try { sea = require('node:sea'); } catch {}
const PACKAGED = !!(sea && sea.isSea());

const args = process.argv.slice(2);
const has = n => args.includes('--' + n);
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const LAN     = has('lan');
const PORT    = Number(flag('port', process.env.PORT || (LAN ? 4443 : 4321)));
const HOST    = flag('host', LAN ? '0.0.0.0' : '127.0.0.1');
const USE_TLS = LAN || has('https');
// On by default: it is what keeps the browser and this machine in step, and it
// gives the vault a home on disk that survives the browser clearing storage.
// The store only ever holds ciphertext, so this costs nothing in privacy.
const SYNC    = !has('no-sync');
const ROOT    = PACKAGED ? path.dirname(process.execPath) : __dirname;

/* An npm install lives in node_modules, and `npx` runs from a throwaway cache
   that gets cleaned. Writing the vault next to the code there would lose it on
   the next update — the same trap as storing it beside a downloaded exe. */
const INSTALLED = /[\\/](node_modules|_npx)[\\/]/.test(ROOT + path.sep);

// Neither a packaged app nor `npx anchor-tracker` leaves a terminal the user is
// watching, so open the browser for them. Must be evaluated after INSTALLED.
const OPEN    = has('open') || ((PACKAGED || INSTALLED) && !has('no-open'));

/**
 * Where the vault lives.
 *
 * A packaged or installed build stores it in the home directory, NOT beside the
 * code. The executable is a download: people move it, browsers rename it to
 * "Anchor (1).exe" in another folder, and a new version arrives as a separate
 * file — and an npx cache is deleted outright. Tying years of history to either
 * location is a silent data-loss trap. `--portable` opts into beside-the-code
 * for USB sticks.
 *
 * Running from a clone keeps it in the project folder, which is what a
 * developer expects and what .gitignore already covers.
 */

function resolveDataDir() {
  const beside = path.join(ROOT, '.anchor-data');
  const home = path.join(os.homedir(), '.anchor');
  const portable = has('portable');
  const order = (PACKAGED || INSTALLED) && !portable ? [home, beside] : [beside, home];
  for (const dir of order) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch { /* try the next one */ }
  }
  return path.join(os.tmpdir(), 'anchor-data');
}
const DATA    = resolveDataDir();
const CERTS   = path.join(DATA, 'certs');
const VAULT   = path.join(DATA, 'vault.json');
const BACKUPS = path.join(DATA, 'backups');
const MAX_BODY = 8 * 1024 * 1024;

/* ── local addresses ─────────────────────────────────────────── */
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces() || {}))
    for (const a of addrs || [])
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
  return out;
}

/* ── DER encoding, just enough for one X.509 certificate ──────
   Node can make an RSA keypair and sign with it, but has no certificate
   builder. Shelling out to OpenSSL is not an option: it is absent from a
   default Windows PATH and from every machine running the packaged download.
   So the certificate is assembled by hand here — no tools, no dependencies. */

function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const b = [];
  for (let v = n; v > 0; v >>>= 8) b.unshift(v & 0xff);
  return Buffer.from([0x80 | b.length, ...b]);
}
const tlv = (tag, parts) => {
  const body = Buffer.isBuffer(parts) ? parts : Buffer.concat(parts.filter(Boolean));
  return Buffer.concat([Buffer.from([tag]), derLen(body.length), body]);
};
const SEQ  = (...p) => tlv(0x30, p.flat());
const SET  = (...p) => tlv(0x31, p.flat());
const BITS = buf => tlv(0x03, Buffer.concat([Buffer.from([0x00]), buf]));  // 0 unused bits
const OCT  = buf => tlv(0x04, buf);
const NUL  = () => Buffer.from([0x05, 0x00]);
const BOOL = v => tlv(0x01, Buffer.from([v ? 0xff : 0x00]));
const CTX  = (n, p) => tlv(0xa0 | n, [].concat(p));

function INT(buf) {
  let b = Buffer.from(buf);
  let i = 0;
  while (i < b.length - 1 && b[i] === 0 && !(b[i + 1] & 0x80)) i++;   // strip leading zeros
  b = b.subarray(i);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);          // keep it positive
  return tlv(0x02, b);
}
function OID(dotted) {
  const a = dotted.split('.').map(Number);
  const out = [a[0] * 40 + a[1]];
  for (const n of a.slice(2)) {
    const chunk = [n & 0x7f];
    for (let v = n >>> 7; v > 0; v >>>= 7) chunk.unshift((v & 0x7f) | 0x80);
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}
const utcTime = d => {
  const p = n => String(n).padStart(2, '0');
  return tlv(0x17, Buffer.from(
    p(d.getUTCFullYear() % 100) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z', 'ascii'));
};
const algSha256Rsa = () => SEQ(OID('1.2.840.113549.1.1.11'), NUL());
const extension = (oid, critical, value) =>
  SEQ(OID(oid), critical ? BOOL(true) : null, OCT(value));

const pem = (label, der) =>
  `-----BEGIN ${label}-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;

/** A self-signed server certificate covering localhost plus every local IPv4. */
function makeSelfSignedCert(ips) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spki = publicKey.export({ type: 'spki', format: 'der' });

  const name = SEQ(SET(SEQ(OID('2.5.4.3'), tlv(0x0c, Buffer.from('Anchor Local', 'utf8')))));
  const now = new Date(Date.now() - 60_000);                 // a minute of clock slack
  const until = new Date(now.getTime() + 824 * 86400_000);   // iOS rejects anything over 825 days

  // subjectAltName: dNSName is [2] primitive, iPAddress is [7] primitive
  const dns = host => tlv(0x82, Buffer.from(host, 'ascii'));
  const ip = addr => tlv(0x87, Buffer.from(addr.split('.').map(Number)));
  const san = SEQ(dns('localhost'), ip('127.0.0.1'), ...ips.map(ip));

  const tbs = SEQ(
    CTX(0, INT(Buffer.from([2]))),                           // v3
    INT(crypto.randomBytes(16)),                             // serial
    algSha256Rsa(),
    name,
    SEQ(utcTime(now), utcTime(until)),
    name,                                                    // self-signed: issuer === subject
    spki,
    CTX(3, SEQ(
      extension('2.5.29.17', false, san),
      extension('2.5.29.19', true, SEQ(BOOL(true))),         // basicConstraints CA:TRUE
      extension('2.5.29.15', true, BITS(Buffer.from([0xa0]))), // digitalSignature|keyEncipherment
      extension('2.5.29.37', false, SEQ(OID('1.3.6.1.5.5.7.3.1'))), // serverAuth
    )),
  );

  const sig = crypto.sign('sha256', tbs, privateKey);
  const cert = SEQ(tbs, algSha256Rsa(), BITS(sig));

  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    cert: pem('CERTIFICATE', cert),
  };
}

/* ── self-signed certificate ─────────────────────────────────── */
function ensureCert() {
  const keyPath = path.join(CERTS, 'key.pem');
  const crtPath = path.join(CERTS, 'cert.pem');
  const ips = lanAddresses().map(a => a.address).sort();
  const stamp = path.join(CERTS, 'issued-for.txt');
  const want = ips.join(',');

  const fresh = fs.existsSync(keyPath) && fs.existsSync(crtPath)
             && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === want;

  if (!fresh) {
    try {
      fs.mkdirSync(CERTS, { recursive: true });
      const { key, cert } = makeSelfSignedCert(ips);
      fs.writeFileSync(keyPath, key, { mode: 0o600 });
      fs.writeFileSync(crtPath, cert);
      fs.writeFileSync(stamp, want);
      console.log('  Generated a certificate for: ' + ['localhost', ...ips].join(', '));
    } catch (e) {
      console.error('\n  Could not create the HTTPS certificate.');
      console.error('  ' + e.message);
      console.error('\n  Without HTTPS the browser withholds crypto.subtle, so the');
      console.error('  passphrase and encryption cannot work off localhost.\n');
      process.exit(1);
    }
  }
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(crtPath) };
}

/* ── sync store ──────────────────────────────────────────────── */
function readVault() {
  try { return JSON.parse(fs.readFileSync(VAULT, 'utf8')); } catch { return null; }
}
function writeVault(doc) {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = VAULT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc));
  fs.renameSync(tmp, VAULT);                    // atomic-ish: never a half-written vault
}
function backup(doc) {
  if (!doc) return;
  try {
    fs.mkdirSync(BACKUPS, { recursive: true });
    fs.writeFileSync(path.join(BACKUPS, `vault-${doc.rev}-${Date.now()}.json`), JSON.stringify(doc));
    const files = fs.readdirSync(BACKUPS).filter(f => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 40)))
      fs.unlinkSync(path.join(BACKUPS, f));     // keep the last 40 revisions
  } catch {}
}
const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
/** Constant-time compare so the auth check cannot be probed by timing. */
function sameToken(a, b) {
  const A = Buffer.from(String(a)), B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function authorised(req, doc) {
  if (!doc || !doc.authHash) return true;       // unclaimed store: first writer claims it
  const hdr = req.headers.authorization || '';
  const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
  return tok && sameToken(sha256(tok), doc.authHash);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', c => {
      n += c.length;
      if (n > MAX_BODY) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, urlPath) {
  const json = (code, obj) => {
    const b = Buffer.from(JSON.stringify(obj));
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': b.length, 'Cache-Control': 'no-store' });
    res.end(b);
  };

  if (!SYNC) return json(404, { sync: false });

  /* Capability + bootstrap. Unauthenticated by necessity: a new device needs
     the KDF salt before it can derive the token that authenticates it. The
     salt is not a secret, and the verifier is the same AES-GCM ciphertext the
     vault itself is protected by. */
  if (urlPath === '/api/bootstrap' && req.method === 'GET') {
    const doc = readVault();
    return json(200, {
      sync: true,
      hasVault: !!doc,
      rev: doc?.rev || 0,
      updatedAt: doc?.updatedAt || null,
      meta: doc?.meta || null,
    });
  }

  if (urlPath === '/api/vault' && req.method === 'GET') {
    const doc = readVault();
    if (!doc) return json(404, { error: 'No vault stored yet.' });
    if (!authorised(req, doc)) return json(401, { error: 'Bad or missing token.' });
    return json(200, { rev: doc.rev, updatedAt: doc.updatedAt, payload: doc.payload, meta: doc.meta });
  }

  if (urlPath === '/api/vault' && req.method === 'PUT') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch (e) { return json(400, { error: 'Unreadable body: ' + e.message }); }

    const current = readVault();
    if (!authorised(req, current)) return json(401, { error: 'Bad or missing token.' });

    if (!body || !body.payload || typeof body.payload.ct !== 'string' || typeof body.payload.iv !== 'string')
      return json(400, { error: 'Refusing to store anything that is not an encrypted envelope.' });
    if (!body.meta || !body.meta.salt)
      return json(400, { error: 'Missing vault meta.' });

    const expected = current?.rev || 0;
    if (typeof body.rev === 'number' && body.rev !== expected) {
      // Someone else wrote since this client last read. Hand back the current
      // copy so the client can merge rather than clobber.
      return json(409, { error: 'Revision conflict.', rev: current.rev,
        updatedAt: current.updatedAt, payload: current.payload, meta: current.meta });
    }

    backup(current);
    const doc = {
      rev: expected + 1,
      updatedAt: new Date().toISOString(),
      payload: body.payload,
      meta: body.meta,
      authHash: current?.authHash || (body.auth ? sha256(body.auth) : null),
    };
    writeVault(doc);
    return json(200, { rev: doc.rev, updatedAt: doc.updatedAt });
  }

  return json(404, { error: 'Unknown endpoint.' });
}

/* ── static files ────────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

async function onRequest(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { return send(res, 400, 'Bad request'); }

  if (urlPath.startsWith('/api/')) {
    try { return await handleApi(req, res, urlPath); }
    catch (e) { return send(res, 500, 'Sync error: ' + e.message); }
  }

  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const rel = path.normalize(urlPath).replace(/^([/\\])+/, '');

  // Refuse anything aimed at the data directory outright. readStatic() would
  // decline it anyway and fall through to index.html, but a silent 200 hides
  // the intent — better that this fails loudly if the guard ever regresses.
  if (/^\.anchor-data([/\\]|$)/.test(rel)) return send(res, 403, 'Forbidden');

  const buf = readStatic(rel);
  if (buf) return respond(res, 200, buf, path.extname(rel));

  const fallback = readStatic('index.html');            // single-page app
  return fallback ? respond(res, 200, fallback, '.html') : send(res, 404, 'Not found');
}

/** Read a web asset, from the bundle when packaged and from disk otherwise. */
function readStatic(rel) {
  const key = rel.split(path.sep).join('/');
  if (PACKAGED) {
    try {
      const ab = sea.getRawAsset(key);
      return ab ? Buffer.from(ab) : null;
    } catch { return null; }                            // not bundled
  }
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT)) return null;              // no traversal out of the root
  if (full.startsWith(DATA)) return null;               // never serve the vault
  try {
    return fs.statSync(full).isFile() ? fs.readFileSync(full) : null;
  } catch { return null; }
}

function respond(res, code, buf, ext) {
  res.writeHead(code, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(buf);
}
const send = (res, code, msg) => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(msg); };

/* ── start ───────────────────────────────────────────────────── */
const server = USE_TLS ? https.createServer(ensureCert(), onRequest) : http.createServer(onRequest);

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use.`);
    console.error(`  Try:  node serve.js ${LAN ? '--lan ' : ''}--port ${PORT + 1}\n`);
  } else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const scheme = USE_TLS ? 'https' : 'http';
  const line = '  ─────────────────────────────────────────────';
  console.log('');
  console.log('  ⚓  Anchor is running');
  console.log(line);
  console.log(`     On this PC:  ${scheme}://localhost:${PORT}/`);
  if (HOST === '0.0.0.0') {
    const addrs = lanAddresses();
    if (addrs.length) {
      console.log('');
      console.log('     On your phone (same Wi-Fi):');
      for (const a of addrs) console.log(`       ${scheme}://${a.address}:${PORT}/   (${a.name})`);
    } else {
      console.log('     No network adapter found — is Wi-Fi connected?');
    }
  }
  console.log(line);
  console.log(`     Your data:  ${SYNC ? DATA : 'in the browser only (--no-sync)'}`);
  if (SYNC) {
    const doc = readVault();
    if (doc) {
      console.log(`     Stored:     revision ${doc.rev}, updated ${doc.updatedAt}`);
    } else {
      console.log('     Stored:     nothing yet — set a passphrase in the app and it will seed');
    }
    console.log('     The store only ever holds ciphertext. This process cannot read your entries.');
  }
  if (USE_TLS) {
    console.log('');
    console.log('  ⚠  The certificate is self-signed, so each device warns once.');
    console.log('     Phone: tap Advanced → Continue / Visit this website.');
    console.log('     Accept it, or the browser withholds the crypto the passphrase needs.');
  }
  if (HOST === '0.0.0.0' && !USE_TLS) {
    console.log('');
    console.log('  ⚠  Serving plain HTTP off localhost — encryption will NOT work.');
    console.log('     Use --lan instead of --host 0.0.0.0.');
  }
  console.log('');
  console.log(PACKAGED ? '  Closing this window stops Anchor. Your data stays where it is.'
                       : '  Ctrl+C to stop.');
  console.log('');
  if (OPEN) {
    const url = `${scheme}://localhost:${PORT}/`;
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
              : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    execFile(cmd[0], cmd[1], () => {});
  }
});
