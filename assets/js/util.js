/* util.js — DOM + date helpers, zero deps */

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const SVG_NS = 'http://www.w3.org/2000/svg';
/* SVG elements must be created in their own namespace or the browser builds an
   unknown HTML element that renders nothing. */
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline',
  'polygon', 'text', 'tspan', 'g', 'defs', 'linearGradient', 'radialGradient', 'stop',
  'use', 'clipPath', 'mask', 'pattern', 'filter', 'marker', 'symbol', 'image', 'textPath']);

/** Tiny hyperscript. el('div.card', {onclick}, child, 'text') — supports tag#id.cls */
export function el(spec, props, ...kids) {
  let [tagPart, ...classes] = String(spec).split('.');
  let id = '';
  const hash = tagPart.indexOf('#');
  if (hash >= 0) { id = tagPart.slice(hash + 1); tagPart = tagPart.slice(0, hash); }
  const tag = tagPart || 'div';
  const isSvg = SVG_TAGS.has(tag);
  const node = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (id) node.id = id;
  // SVGElement.className is a read-only SVGAnimatedString, so go via the attribute
  const addClass = v => isSvg
    ? node.setAttribute('class', [node.getAttribute('class'), v].filter(Boolean).join(' '))
    : (node.className += (node.className ? ' ' : '') + v);
  if (classes.length) addClass(classes.join(' '));
  if (props && (typeof props !== 'object' || props.nodeType || Array.isArray(props))) {
    kids.unshift(props); props = null;
  }
  for (const k in props || {}) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') addClass(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  append(node, kids);
  return node;
}
function append(node, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(node, k);
    else node.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export const frag = (...kids) => { const f = document.createDocumentFragment(); append(f, kids); return f; };
export const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };

export const uid = () =>
  Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const escapeHtml = s => String(s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── dates (all local-time, ISO = YYYY-MM-DD) ───────────────── */

export const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December'];
export const MON = MONTHS.map(m => m.slice(0, 3));
export const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const DOW_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => iso(new Date());
export function parseISO(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export const addDays = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
export const startOfMonth = (y, m) => new Date(y, m, 1);
export const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

/** Whole days between two ISO dates (b - a). */
export function dayDiff(a, b) {
  const A = parseISO(a), B = parseISO(b);
  return Math.round((B - A) / 86400000);
}
export const daysSince = isoStr => dayDiff(isoStr, todayISO());

export function fmtDate(isoStr, style = 'med') {
  const d = parseISO(isoStr);
  if (style === 'short') return `${MON[d.getMonth()]} ${d.getDate()}`;
  if (style === 'long')  return `${DOW_FULL[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "today" / "3 days ago" / "Mar 4" */
export function relDate(isoStr) {
  const n = daysSince(isoStr);
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 0)   return fmtDate(isoStr, 'short');
  if (n < 7)   return `${n} days ago`;
  if (n < 30)  return `${Math.floor(n / 7)}w ago`;
  if (n < 365) return `${Math.floor(n / 30)}mo ago`;
  return `${(n / 365).toFixed(1)}y ago`;
}

export function fmt12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m || 0)} ${ap}`;
}

export const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + 's')}`;

/** Big-number formatting for durations: 412 → "1y 47d" */
export function humanDays(n) {
  if (n < 365) return `${n}d`;
  const y = Math.floor(n / 365), d = n % 365;
  return d ? `${y}y ${d}d` : `${y}y`;
}

/* ── colour ─────────────────────────────────────────────────── */

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
export const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

export const PALETTE = ['#ff5d6e','#ff7a45','#ffb454','#ffe066','#a8e05f','#3ddc97',
  '#00d6c2','#39b6ff','#5c7cff','#7c5cff','#b56cff','#ff5c9d','#8d99ae','#c9a227'];

export const EMOJI = ['🌫️','🔥','🍺','🚬','🎰','📱','🍩','💸','😶‍🌫️','🌙','🧊','⚡','🕳️','🎮','☕','🛒','💊','🥃'];
