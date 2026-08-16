/* crystal.js — procedural crystal geometry.
 *
 * The dashboard object is a cluster: one main spire whose height is your
 * current clean run, one satellite for every milestone cleared on that run,
 * and a hollow "ghost" spire at the height of your personal best. Beating
 * your record means outgrowing the ghost.
 *
 * Everything is generated on the CPU into flat triangle buffers with the
 * per-piece transform already baked in, so the renderer draws it in one call.
 */

/** Height of a spire standing at 100% of its reference — the frame is sized
    to this, so nothing ever overflows and nothing gets inflated. */
const MAX_HEIGHT = 1.75;

/* deterministic jitter — the same streak always yields the same crystal */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function unit(v) { const l = Math.hypot(...v) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }

/**
 * One quartz-like solid: an n-sided prism capped by a pyramid at each end.
 * Returns triangles in local space, centred on the origin.
 */
function spire({ sides = 6, height = 1, radius = 0.2, capTop = 0.45, capBot = 0.18, seed = 1 }) {
  const rand = rng(seed);
  const half = height / 2;
  const ring = (y, jitter) => Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    const r = radius * (1 + (jitter ? (rand() - 0.5) * 0.22 : 0));
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });

  const lower = ring(-half, true);
  const upper = ring(half, true);
  const apexT = [(rand() - 0.5) * radius * 0.3, half + capTop * height, (rand() - 0.5) * radius * 0.3];
  const apexB = [(rand() - 0.5) * radius * 0.2, -half - capBot * height, (rand() - 0.5) * radius * 0.2];

  const tris = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    tris.push([lower[i], upper[i], upper[j]], [lower[i], upper[j], lower[j]]);  // shaft
    tris.push([upper[i], apexT, upper[j]]);                                      // top cap
    tris.push([lower[j], apexB, lower[i]]);                                      // bottom cap
  }
  return tris;
}

/* transform helpers — rotate about X then Y, scale, translate */
function place(tris, { scale = 1, rotX = 0, rotY = 0, at = [0, 0, 0] }) {
  const cx = Math.cos(rotX), sx = Math.sin(rotX), cy = Math.cos(rotY), sy = Math.sin(rotY);
  return tris.map(t => t.map(([x, y, z]) => {
    x *= scale; y *= scale; z *= scale;
    let y2 = y * cx - z * sx, z2 = y * sx + z * cx;
    let x2 = x * cy + z2 * sy; z2 = -x * sy + z2 * cy;
    return [x2 + at[0], y2 + at[1], z2 + at[2]];
  }));
}

/**
 * Build the whole cluster.
 *   streakDays  current clean run
 *   bestDays    longest run ever
 *   tier        how many milestones this run has cleared
 *   satellites  [{ days, label }] one per cleared milestone
 */
export function buildCluster({ streakDays = 0, bestDays = 0, satellites = [], fitTo = 2.5 }) {
  const pieces = [];
  const tier = satellites.length;

  /* ── main spire ──
     Height is measured against your record rather than on an absolute scale:
     the ghost sits at full height and the spire stands at streak/best of it,
     so the gap you still have to close is the thing you actually see. */
  const ref = Math.max(bestDays, streakDays, 7);
  const frac = Math.min(1, streakDays / ref);
  const h = 0.30 + frac * 1.45;
  const r = 0.20 + Math.min(0.13, tier * 0.010);      // chunky quartz, not a needle
  // Everything is built with its base on a common ground plane at y=0 and the
  // whole cluster is dropped by GROUND at the end. A crystal grows upward from
  // the rock; it must not also extend downward as the streak lengthens, or the
  // record ghost appears to sink while you are climbing toward it.
  pieces.push({
    kind: 'main',
    tris: place(spire({ sides: 6, height: h, radius: r, capTop: 0.5, capBot: 0.05, seed: 7 }),
      { at: [0, h / 2, 0] }),
    centre: [0, h * 0.65, 0],
    bound: h * 0.9,
    grow: 0,
    label: `${streakDays} day${streakDays === 1 ? '' : 's'} clean`,
    sub: streakDays === 0 ? 'The crystal regrows from here.' : null,
  });

  /* ── satellites: one per milestone cleared on this run ── */
  const shown = satellites.slice(-9);              // the most recent nine keep it readable
  shown.forEach((m, i) => {
    const a = (i / Math.max(1, shown.length)) * Math.PI * 2 + 0.6;
    const dist = 0.21 + (i % 3) * 0.045;
    const sh = 0.26 + Math.min(0.55, Math.log1p(m.days) * 0.13);
    // near-upright and clustered tight to the base: a druse, not a set of fins
    const y = sh / 2;
    pieces.push({
      kind: 'sat',
      tris: place(spire({ sides: 6, height: sh, radius: 0.075 + (i % 2) * 0.016,
                          capTop: 0.55, capBot: 0.06, seed: 31 + i * 17 }),
        { rotX: 0.06 + (i % 4) * 0.035, rotY: a,
          at: [Math.cos(a) * dist, y, Math.sin(a) * dist] }),
      centre: [Math.cos(a) * dist, y, Math.sin(a) * dist],
      bound: sh * 0.8,
      grow: (i + 1) / (shown.length + 1),
      label: `${m.days}-day milestone`,
      sub: m.label || null,
    });
  });

  /* ── ghost of the personal best, only while it is still ahead ── */
  let ghost = null;
  if (bestDays > streakDays && bestDays > 0) {
    const gh = 0.30 + Math.min(1, bestDays / ref) * 1.45;
    // shares the spire's base so the two are directly comparable
    ghost = {
      kind: 'ghost',
      tris: place(spire({ sides: 6, height: gh, radius: r * 1.06, capTop: 0.5, capBot: 0.05, seed: 7 }),
        { at: [0, gh / 2, 0] }),
      height: gh,
      label: `Your record: ${bestDays} days`,
      sub: `${bestDays - streakDays} more to beat it`,
    };
  }

  /* ── fit the frame ──
     A *constant* scale, sized so a full-height crystal exactly fills the
     viewport. It must not adapt to the current height, or a one-day chip
     would be blown up to the same size as a year-long spire and the growth
     would stop meaning anything. Small really does render small. */
  const fit = fitTo / (MAX_HEIGHT * 1.62);
  const drop = MAX_HEIGHT * 0.62;        // lower the ground plane to centre the frame
  const xf = v => [v[0] * fit, (v[1] - drop) * fit, v[2] * fit];

  for (const p of pieces) {
    p.tris = p.tris.map(t => t.map(xf));
    p.centre = xf(p.centre);
    p.bound *= fit;
  }
  if (ghost) ghost.tris = ghost.tris.map(t => t.map(xf));

  // real vertical extent, so every crystal gets the full base→tip gradient
  let lo = Infinity, hi = -Infinity;
  for (const p of pieces) for (const t of p.tris) for (const v of t) {
    if (v[1] < lo) lo = v[1];
    if (v[1] > hi) hi = v[1];
  }
  const span = Math.max(0.001, hi - lo);

  return { pieces, ghost, tier, fit, span };
}

/** Flatten pieces into interleaved arrays for the GPU. */
export function tessellate(pieces) {
  const pos = [], nrm = [], grow = [], kind = [], pid = [];
  pieces.forEach((p, index) => {
    const k = p.kind === 'sat' ? 1 : 0;
    for (const t of p.tris) {
      const n = unit(cross(sub(t[1], t[0]), sub(t[2], t[0])));
      for (const v of t) {
        pos.push(v[0], v[1], v[2]);
        nrm.push(n[0], n[1], n[2]);
        grow.push(p.grow || 0);
        kind.push(k);
        pid.push(index);
      }
    }
  });
  return {
    pos: new Float32Array(pos), nrm: new Float32Array(nrm),
    grow: new Float32Array(grow), kind: new Float32Array(kind),
    pid: new Float32Array(pid), count: pos.length / 3,
  };
}

/** Edge list for the ghost outline. */
export function wireframe(tris) {
  const out = [];
  for (const t of tris) {
    out.push(...t[0], ...t[1], ...t[1], ...t[2], ...t[2], ...t[0]);
  }
  return new Float32Array(out);
}
