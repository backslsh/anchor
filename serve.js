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
const { execFileSync, execFile } = require('child_process');

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
const OPEN    = has('open');
const ROOT    = __dirname;
const DATA    = path.join(ROOT, '.anchor-data');
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

/* ── self-signed certificate ─────────────────────────────────── */
function ensureCert() {
  const keyPath = path.join(CERTS, 'key.pem');
  const crtPath = path.join(CERTS, 'cert.pem');
  const ips = lanAddresses().map(a => a.address);
  const stamp = path.join(CERTS, 'issued-for.txt');
  const want = ips.sort().join(',');

  const fresh = fs.existsSync(keyPath) && fs.existsSync(crtPath)
             && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === want;

  if (!fresh) {
    fs.mkdirSync(CERTS, { recursive: true });
    const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map(i => `IP:${i}`)].join(',');
    try {
      execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
        '-keyout', keyPath, '-out', crtPath,
        '-days', '825',                        // iOS refuses certificates longer than this
        '-subj', '/CN=Anchor Local',
        '-addext', `subjectAltName=${san}`,
        '-addext', 'basicConstraints=critical,CA:TRUE',
      ], { stdio: 'pipe' });
      fs.writeFileSync(stamp, want);
      console.log('  Generated a self-signed certificate for: ' + (ips.join(', ') || 'localhost'));
    } catch (e) {
      console.error('\n  Could not generate a certificate with OpenSSL.');
      console.error('  ' + (e.stderr ? e.stderr.toString().trim().split('\n').pop() : e.message));
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
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  if (filePath.startsWith(DATA)) return send(res, 403, 'Forbidden');   // never serve the store

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      return fs.readFile(path.join(ROOT, 'index.html'), (e2, buf) =>
        e2 ? send(res, 404, 'Not found') : respond(res, 200, buf, '.html'));
    }
    fs.readFile(filePath, (e3, buf) =>
      e3 ? send(res, 500, 'Read error') : respond(res, 200, buf, path.extname(filePath)));
  });
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
  console.log(`     Sync store: ${SYNC ? 'on  → ' + path.relative(ROOT, VAULT) : 'off (--no-sync)'}`);
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
  console.log('  Ctrl+C to stop.');
  console.log('');
  if (OPEN) {
    const url = `${scheme}://localhost:${PORT}/`;
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
              : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    execFile(cmd[0], cmd[1], () => {});
  }
});
