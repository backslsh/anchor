#!/usr/bin/env node
/* build.js — package Anchor into a single self-contained executable.
 *
 *   node build.js
 *
 * Uses Node's built-in Single Executable Application support: the web assets
 * and serve.js are embedded into a copy of the Node binary, so the result needs
 * no Node installation, no npm, and no runtime dependencies at all.
 *
 * The one build-time dependency is `postject`, fetched via npx, which performs
 * the injection. Nothing from it ships in the output.
 *
 * SEA cannot cross-compile: run this on Windows for a .exe, on macOS for a mac
 * binary, on Linux for a Linux one. .github/workflows/release.yml does all
 * three automatically when you push a tag.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const WORK = path.join(DIST, '.build');

const PLATFORM = {
  win32:  { name: 'Anchor-windows.exe', exe: '.exe' },
  darwin: { name: 'Anchor-macos',       exe: '' },
  linux:  { name: 'Anchor-linux',       exe: '' },
}[process.platform];

if (!PLATFORM) {
  console.error(`Unsupported platform: ${process.platform}`);
  process.exit(1);
}

/* ── collect the web assets ─────────────────────────────────── */
function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

const assets = { 'index.html': path.join(ROOT, 'index.html') };
for (const rel of walk(path.join(ROOT, 'assets'))) {
  assets['assets/' + rel] = path.join(ROOT, 'assets', rel);
}

const assetCount = Object.keys(assets).length;
const assetBytes = Object.values(assets).reduce((n, p) => n + fs.statSync(p).size, 0);

console.log(`\n  Packaging Anchor for ${process.platform}`);
console.log('  ─────────────────────────────────────────────');
console.log(`  Embedding ${assetCount} files (${(assetBytes / 1024).toFixed(0)} KB)`);

/* ── generate the SEA blob ──────────────────────────────────── */
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const cfgPath = path.join(WORK, 'sea-config.json');
fs.writeFileSync(cfgPath, JSON.stringify({
  main: path.join(ROOT, 'serve.js'),
  output: path.join(WORK, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,          // code cache is tied to the exact Node build
  assets,
}, null, 2));

run(process.execPath, ['--experimental-sea-config', cfgPath], 'generating bundle');

/* ── copy the Node binary and inject ────────────────────────── */
const outPath = path.join(DIST, PLATFORM.name);
fs.copyFileSync(process.execPath, outPath);

// A copied signed binary fails to launch on macOS until the signature is
// stripped; re-signing ad-hoc afterwards is what makes it runnable.
if (process.platform === 'darwin') {
  try { execFileSync('codesign', ['--remove-signature', outPath], { stdio: 'pipe' }); } catch {}
}

const postjectArgs = [
  '--yes', 'postject', outPath, 'NODE_SEA_BLOB', path.join(WORK, 'sea-prep.blob'),
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];
if (process.platform === 'darwin') postjectArgs.push('--macho-segment-name', 'NODE_SEA');

run('npx', postjectArgs, 'injecting into the binary');

if (process.platform === 'darwin') {
  try { execFileSync('codesign', ['--sign', '-', outPath], { stdio: 'pipe' }); } catch {}
}
if (process.platform !== 'win32') fs.chmodSync(outPath, 0o755);

fs.rmSync(WORK, { recursive: true, force: true });

const mb = (fs.statSync(outPath).size / 1048576).toFixed(0);
console.log('  ─────────────────────────────────────────────');
console.log(`  ✓ dist/${PLATFORM.name}  (${mb} MB)`);
console.log('');
console.log('  Self-contained: no Node, no npm, nothing to install.');
console.log('  Double-click it and Anchor opens in the default browser.');
console.log('');

function run(cmd, args, label) {
  process.stdout.write(`  … ${label}`);
  try {
    execFileSync(cmd, args, { stdio: 'pipe', shell: process.platform === 'win32' });
    process.stdout.write('\r  ✓ ' + label + '\n');
  } catch (e) {
    process.stdout.write('\r  ✗ ' + label + '\n\n');
    console.error((e.stderr || e.stdout || Buffer.from(e.message)).toString().trim());
    process.exit(1);
  }
}
