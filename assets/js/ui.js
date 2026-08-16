/* ui.js — modals, toasts, tooltips, confetti, command palette, breathing overlay. */

import { $, el, clear } from './util.js';

/* ── toasts ─────────────────────────────────────────────────── */
export function toast(msg, { sub = '', kind = '', ms = 3800 } = {}) {
  const t = el('div.toast' + (kind ? '.' + kind : ''), el('i'),
    el('div', el('b', msg), sub ? el('small', sub) : null));
  $('#toasts').appendChild(t);
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 320); };
  const timer = setTimeout(kill, ms);
  t.addEventListener('click', () => { clearTimeout(timer); kill(); });
  return kill;
}

/* ── modal ──────────────────────────────────────────────────── */
let modalStack = [];

export function modal({ title, sub, body, footer = [], wide = false, onClose } = {}) {
  const root = $('#modal-root'), box = $('#modal-box');
  clear(box);
  box.classList.toggle('wide', !!wide);

  const close = (v) => {
    modalStack = modalStack.filter(m => m.close !== close);
    if (!modalStack.length) {
      root.classList.add('hidden');
      clear(box);   // don't leave notes and half-typed entries sitting in the DOM
      // let the app pick up any state changes made while the dialog was open
      document.dispatchEvent(new CustomEvent('anchor:modalclosed'));
    } else modalStack[modalStack.length - 1].render();
    onClose?.(v);
  };

  const render = () => {
    clear(box);
    box.appendChild(el('div.modal-h',
      el('div', el('h3', title), sub ? el('p', sub) : null),
      el('button.modal-x', { onclick: () => close(), 'aria-label': 'Close' },
        el('svg', { html: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', viewBox: '0 0 24 24' }))
    ));
    const content = typeof body === 'function' ? body(close) : body;
    if (content) box.appendChild(content);
    if (footer.length) {
      box.appendChild(el('div.modal-f', footer.map(f =>
        el('button.btn.' + (f.cls || 'btn-ghost'), { onclick: () => f.onClick?.(close), type: 'button' }, f.label))));
    }
    const first = box.querySelector('input:not([type=hidden]), textarea, select');
    setTimeout(() => first?.focus(), 60);
  };

  modalStack.push({ close, render });
  root.classList.remove('hidden');
  render();
  return close;
}

export function closeTopModal() {
  if (modalStack.length) modalStack[modalStack.length - 1].close();
  return modalStack.length > 0;
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  return modal({
    title,
    body: el('p.hint', { style: { fontSize: '13.5px', color: 'var(--text-2)', margin: 0 } }, message),
    footer: [
      { label: 'Cancel', cls: 'btn-ghost', onClick: c => c() },
      { label: confirmLabel, cls: danger ? 'btn-danger' : 'btn-primary', onClick: c => { c(); onConfirm?.(); } },
    ],
  });
}

/* wire scrim click once */
document.addEventListener('DOMContentLoaded', () => {
  $('#modal-root')?.querySelector('.modal-scrim')
    ?.addEventListener('click', () => closeTopModal());
});

/* ── tooltip ────────────────────────────────────────────────── */
let tipEl = null;
export function showTip(target, html) {
  hideTip();
  tipEl = el('div.tip', { html });
  document.body.appendChild(tipEl);
  const r = target.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  let x = r.left + r.width / 2 - t.width / 2;
  let y = r.top - t.height - 9;
  if (y < 8) y = r.bottom + 9;
  tipEl.style.left = Math.max(8, Math.min(x, innerWidth - t.width - 8)) + 'px';
  tipEl.style.top = y + 'px';
}
/** Tooltip pinned to a point rather than an element — for canvas hit-testing. */
export function showTipAt(x, y, html) {
  if (!tipEl) { tipEl = el('div.tip'); document.body.appendChild(tipEl); }
  tipEl.innerHTML = html;
  const t = tipEl.getBoundingClientRect();
  let top = y - t.height - 14;
  if (top < 8) top = y + 18;
  tipEl.style.left = Math.max(8, Math.min(x - t.width / 2, innerWidth - t.width - 8)) + 'px';
  tipEl.style.top = top + 'px';
}

export function hideTip() { tipEl?.remove(); tipEl = null; }
export function attachTip(node, htmlFn) {
  node.addEventListener('pointerenter', () => showTip(node, typeof htmlFn === 'function' ? htmlFn() : htmlFn));
  node.addEventListener('pointerleave', hideTip);
}

/* ── confetti / burst ───────────────────────────────────────── */
export function confetti({ count = 130, colors = ['#7c5cff', '#00d6c2', '#ffb454', '#ff5c9d', '#a8e05f'],
                           origin = { x: 0.5, y: 0.35 }, spread = 1, gravity = 0.34 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#fx'), ctx = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const ps = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2, sp = (2.5 + Math.random() * 9) * spread;
    return { x: origin.x * innerWidth, y: origin.y * innerHeight,
             vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4,
             w: 4 + Math.random() * 7, h: 3 + Math.random() * 6,
             r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.34,
             c: colors[(Math.random() * colors.length) | 0], life: 1 };
  });
  let raf;
  (function step() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let live = 0;
    for (const p of ps) {
      if (p.life <= 0) continue;
      live++;
      p.vy += gravity; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      p.life -= 0.0072;
      if (p.y > innerHeight + 40) p.life = 0;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * (0.4 + 0.6 * Math.abs(Math.cos(p.r))));
      ctx.restore();
    }
    if (live) raf = requestAnimationFrame(step);
    else { ctx.clearRect(0, 0, innerWidth, innerHeight); cancelAnimationFrame(raf); }
  })();
}

/* ── command palette ────────────────────────────────────────── */
let paletteCmds = [], paletteSel = 0, paletteOpen = false;

export function openPalette(commands) {
  paletteCmds = commands;
  paletteOpen = true;
  const p = $('#palette'), input = $('#palette-input');
  p.classList.remove('hidden');
  input.value = ''; paletteSel = 0;
  renderPalette('');
  setTimeout(() => input.focus(), 30);
}
export function closePalette() { paletteOpen = false; $('#palette').classList.add('hidden'); }
export const isPaletteOpen = () => paletteOpen;

function score(q, c) {
  const hay = (c.label + ' ' + (c.keywords || '')).toLowerCase();
  if (!q) return 1;
  let i = 0, s = 0;
  for (const ch of q) { const k = hay.indexOf(ch, i); if (k < 0) return 0; s += k === i ? 2 : 1; i = k + 1; }
  if (hay.startsWith(q)) s += 40;
  if (hay.includes(q)) s += 20;
  return s;
}
function renderPalette(q) {
  const list = $('#palette-list');
  const items = paletteCmds.map(c => ({ c, s: score(q.toLowerCase().trim(), c) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map(x => x.c);
  paletteSel = Math.min(paletteSel, Math.max(0, items.length - 1));
  clear(list);
  if (!items.length) { list.appendChild(el('div.pitem.muted', 'No matches')); return; }
  items.forEach((c, i) => {
    const node = el('div.pitem' + (i === paletteSel ? '.sel' : ''),
      { onclick: () => { closePalette(); c.run(); },
        onpointerenter: () => { paletteSel = i; [...list.children].forEach((n, j) => n.classList.toggle('sel', j === i)); } },
      el('div.pico', c.icon || '›'), el('span', c.label),
      c.hint ? el('span.psub', c.hint) : null);
    list.appendChild(node);
  });
  list._items = items;
}
export function paletteKey(e) {
  const list = $('#palette-list');
  const items = list._items || [];
  if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
    e.preventDefault(); paletteSel = (paletteSel + 1) % Math.max(1, items.length);
  } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
    e.preventDefault(); paletteSel = (paletteSel - 1 + items.length) % Math.max(1, items.length);
  } else if (e.key === 'Enter') {
    e.preventDefault(); const c = items[paletteSel]; if (c) { closePalette(); c.run(); } return;
  } else if (e.key === 'Escape') { closePalette(); return; }
  else { setTimeout(() => renderPalette($('#palette-input').value), 0); return; }
  [...list.children].forEach((n, j) => n.classList.toggle('sel', j === paletteSel));
  list.children[paletteSel]?.scrollIntoView({ block: 'nearest' });
}
document.addEventListener('DOMContentLoaded', () => {
  $('#palette')?.querySelector('.palette-scrim')?.addEventListener('click', closePalette);
  $('#palette-input')?.addEventListener('keydown', paletteKey);
  $('#palette-input')?.addEventListener('input', e => renderPalette(e.target.value));
});

/* ── breathing / urge overlay ───────────────────────────────── */
let breatheTimer = null;
const PATTERN = [['Breathe in', 4, 'inh'], ['Hold', 7, 'hold'], ['Breathe out', 8, 'exh']];

export function openBreathe(contextNode) {
  const b = $('#breathe');
  b.classList.remove('hidden');
  const ctx = $('#breathe-ctx');
  clear(ctx);
  if (contextNode) ctx.appendChild(contextNode);
  let phase = 0, left = PATTERN[0][1], cycles = 0;
  const apply = () => {
    const [label, secs, cls] = PATTERN[phase];
    b.classList.remove('inh', 'hold', 'exh'); b.classList.add(cls);
    $('#breathe-phase').textContent = label;
    left = secs;
    $('#breathe-count').textContent = left;
  };
  apply();
  clearInterval(breatheTimer);
  breatheTimer = setInterval(() => {
    left--;
    if (left <= 0) {
      phase = (phase + 1) % PATTERN.length;
      if (phase === 0) {
        cycles++;
        if (cycles === 4) $('#breathe-phase').dataset.done = '1';
      }
      apply();
    } else $('#breathe-count').textContent = left;
  }, 1000);
  return closeBreathe;
}
export function closeBreathe() {
  clearInterval(breatheTimer); breatheTimer = null;
  const b = $('#breathe');
  b.classList.add('hidden'); b.classList.remove('inh', 'hold', 'exh');
}
export const isBreatheOpen = () => !$('#breathe').classList.contains('hidden');

/* ── shortcuts sheet ────────────────────────────────────────── */
const KEYS = [
  ['1 – 6', 'Jump to view'], ['Ctrl K', 'Command palette'],
  ['L', 'Log a relapse'], ['P', 'Urge support'],
  ['N', 'New habit'], ['G', 'New goal'],
  ['T', 'Today / this month'], ['← →', 'Previous / next period'],
  ['Q', 'Shuffle the quote'], ['F', 'Favourite the quote'],
  ['Ctrl L', 'Lock the vault'], ['E', 'Jump to settings'],
  ['?', 'This list'], ['Esc', 'Close anything'],
];
export function toggleShortcuts() {
  const s = $('#shortcuts');
  if (!s.classList.contains('hidden')) { s.classList.add('hidden'); return; }
  clear(s);
  s.appendChild(el('div.sheet-box',
    el('div.modal-h', el('div',
      el('h3', 'Keyboard shortcuts'),
      el('p', 'Anchor is built to be driven without the mouse.')),
      el('button.modal-x', { onclick: () => s.classList.add('hidden') }, '✕')),
    el('div.sc-grid', KEYS.map(([k, d]) =>
      el('div.sc', el('span', d), el('div', k.split(' ').map(x => el('span.kbd', x))))))
  ));
  s.classList.remove('hidden');
  s.onclick = e => { if (e.target === s) s.classList.add('hidden'); };
}
export const isSheetOpen = () => !$('#shortcuts').classList.contains('hidden');
export const closeSheet = () => $('#shortcuts').classList.add('hidden');

/* ── small form helpers ─────────────────────────────────────── */
export function field(label, control, hint) {
  return el('div', el('label.fl', label), control, hint ? el('p.hint', { style: { marginTop: '6px' } }, hint) : null);
}
export function segmented(options, value, onPick) {
  const wrap = el('div.seg-full');
  options.forEach(o => {
    const b = el('button' + (o.value === value ? '.on' : ''), { type: 'button' }, o.label);
    b.onclick = () => {
      [...wrap.children].forEach(c => c.classList.remove('on'));
      b.classList.add('on'); onPick(o.value);
    };
    wrap.appendChild(b);
  });
  return wrap;
}
export function swatches(colors, value, onPick) {
  const wrap = el('div.swatches');
  colors.forEach(c => {
    const b = el('button.sw' + (c === value ? '.on' : ''),
      { type: 'button', style: { background: c }, 'aria-label': c });
    b.onclick = () => { [...wrap.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); onPick(c); };
    wrap.appendChild(b);
  });
  return wrap;
}
export function emojiPicker(list, value, onPick) {
  const wrap = el('div.emoji-pick');
  list.forEach(e2 => {
    const b = el('button.emo' + (e2 === value ? '.on' : ''), { type: 'button' }, e2);
    b.onclick = () => { [...wrap.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); onPick(e2); };
    wrap.appendChild(b);
  });
  return wrap;
}
export function switchRow(label, checked, onChange) {
  const input = el('input', { type: 'checkbox' });
  input.checked = checked;
  input.onchange = () => onChange(input.checked);
  return el('label.switch', input, el('span.track'), el('span', { style: { fontSize: '13.5px' } }, label));
}
