/* scene.js — the 3D pieces.
 *
 * `mountGem`   : the dashboard crystal. Height is your current clean run; a
 *                satellite crystal accretes for every milestone that run has
 *                cleared; a hollow ghost spire stands at your personal best
 *                until you outgrow it. Logging a relapse shatters it and it
 *                regrows from a chip.
 * `mountField` : perspective particle field behind the lock screen.
 *
 * Both degrade to canvas-2D if WebGL is unavailable. No libraries.
 */

import { hexToRgb } from './util.js';
import { buildCluster, tessellate, wireframe } from './crystal.js';

/* ── tiny mat4 ──────────────────────────────────────────────── */
const M4 = {
  ident: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  persp(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  },
  trans(x, y, z) { const m = M4.ident(); m[12] = x; m[13] = y; m[14] = z; return m; },
  rotX(r) { const c = Math.cos(r), s = Math.sin(r), m = M4.ident(); m[5]=c;m[6]=s;m[9]=-s;m[10]=c; return m; },
  rotY(r) { const c = Math.cos(r), s = Math.sin(r), m = M4.ident(); m[0]=c;m[2]=-s;m[8]=s;m[10]=c; return m; },
};

const CAM_Z = 3.4;
const FOV = 0.85;
const norm = p => { const l = Math.hypot(...p) || 1; return [p[0]/l, p[1]/l, p[2]/l]; };

/* ── shaders ────────────────────────────────────────────────────
   Both stages declare the same float precision. Without that, a uniform
   shared between them (uPulse) is highp in the vertex stage and mediump in
   the fragment stage, and linking fails with a precision mismatch. */
const PREC = 'precision mediump float;\n';

const VS = PREC + `
attribute vec3 aPos, aNrm, aCen, aVel, aSpin;
attribute float aGrow, aKind;
uniform mat4 uProj, uView, uModel;
uniform float uTime, uPulse, uGrow, uShatter, uSpan;
varying vec3 vN, vW; varying float vKind, vAlive, vY, vShard;

/* Rodrigues rotation — turn v about a unit axis by angle a. */
vec3 spinAbout(vec3 v, vec3 axis, float a){
  float c = cos(a), s = sin(a);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

void main(){
  // each piece eases in on its own delay, so satellites appear in sequence
  float t = clamp((uGrow - aGrow) / 0.42, 0.0, 1.0);
  float e = t * t * (3.0 - 2.0 * t);
  vAlive = e;

  vec3 p = aPos * e;
  p.y += sin(uTime * 0.8 + aGrow * 6.0) * 0.012;      // a slow drift, barely there
  vec3 n = aNrm;

  /* ── shatter ──
     Every triangle leaves on its own trajectory: tumbling about its own
     centroid, travelling along its own velocity, arcing down under gravity.
     Moving the whole mesh as one unit only ever reads as shrinking. */
  float sh = uShatter;
  if (sh > 0.0001) {
    vec3 cen   = aCen * e;
    vec3 local = p - cen;

    vec3 axis = normalize(aSpin + vec3(0.0, 0.0001, 0.0));
    float ang = length(aSpin) * sh;
    local = spinAbout(local, axis, ang);
    n     = spinAbout(n,     axis, ang);

    cen += aVel * sh * 1.15;          // outward, fastest at the moment of impact
    cen.y -= 2.1 * sh * sh;           // and falling
    p = cen + local;
  }
  vShard = sh;

  vec4 world = uModel * vec4(p, 1.0);
  vN = normalize(mat3(uModel) * n);
  vW = world.xyz; vKind = aKind;
  vY = clamp(aPos.y / max(uSpan, 0.001) + 0.5, 0.0, 1.0);   // 0 at the base, 1 at the tip
  gl_Position = uProj * uView * world;
}`;

const FS = PREC + `
varying vec3 vN, vW; varying float vKind, vAlive, vY, vShard;
uniform vec3 uEye, uA, uB;
uniform float uPulse, uTime, uShatter;

void main(){
  vec3 V = normalize(uEye - vW);
  vec3 L = normalize(vec3(0.5, 0.9, 0.75));
  float d = max(dot(vN, L), 0.0);
  float fres = pow(1.0 - max(dot(vN, V), 0.0), 2.2);

  // facet shading: hard steps read as cut planes rather than a smooth ball
  float facet = floor(d * 5.0) / 5.0;
  // deep and cloudy at the base, clear and bright toward the tip
  vec3 tint = mix(uA * 0.55, uB, pow(vY, 1.4));
  vec3 base = mix(tint, uB, clamp(facet * 0.65, 0.0, 1.0));

  vec3 col = base * (0.30 + 0.85 * facet);
  col += fres * mix(uB, vec3(1.0), 0.5) * 0.85;          // rim light
  col += uB * 0.10 * (0.5 + 0.5 * sin(uTime * 1.3));      // faint inner life
  col += uPulse * 0.55 * uB;
  col *= mix(1.0, 1.25, vKind);                           // satellites read brighter

  // A shard flares white-hot as it breaks, then fades. Holding full opacity
  // through the first third keeps the fracture readable before it disperses.
  col += vShard * 0.65 * mix(uB, vec3(1.0), 0.4);
  float fade = 1.0 - smoothstep(0.32, 1.0, vShard);

  float a = (0.80 + fres * 0.20) * vAlive * fade;
  gl_FragColor = vec4(col * a, a);                        // premultiplied
}`;

const VS_LINE = PREC + `
attribute vec3 aPos;
uniform mat4 uProj, uView, uModel; uniform float uGrow;
varying float vD;
void main(){
  vec4 world = uModel * vec4(aPos * clamp(uGrow, 0.0, 1.0), 1.0);
  vec4 eye = uView * world; vD = -eye.z;
  gl_Position = uProj * eye;
}`;
const FS_LINE = PREC + `
varying float vD; uniform vec3 uC; uniform float uAlpha;
void main(){
  float f = clamp((4.4 - vD) / 2.4, 0.0, 1.0);
  gl_FragColor = vec4(uC * f * uAlpha, f * uAlpha);
}`;

function program(gl, vs, fs) {
  const c = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, c(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, c(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (gl.getProgramParameter(p, gl.LINK_STATUS)) return p;
  console.warn('[anchor] shader link failed:', gl.getProgramInfoLog(p));
  return null;
}
const mkBuf = (gl, data) => {
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b;
};
const bindAttr = (gl, p, name, b, n = 3) => {
  const loc = gl.getAttribLocation(p, name); if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 0, 0);
};
const lin = hex => hexToRgb(hex).map(c => Math.pow(c / 255, 2.2));

/** A canvas' context type is permanent once acquired, so falling back from
    WebGL to 2D needs a genuinely new element or getContext('2d') returns null. */
function recycle(canvas) {
  const fresh = canvas.cloneNode(false);
  if (canvas.parentNode) canvas.replaceWith(fresh);
  return fresh;
}

/* ── the crystal ────────────────────────────────────────────── */
/**
 * opts: { streakDays, bestDays, satellites, a, b, spin, shatter, onHover, onPick }
 */
let gemSerial = 0;

export function mountGem(canvas, opts = {}) {
  // Stamped so a rebuild is observable even if the element is replaced within
  // a single frame — which is exactly how an earlier bug hid itself.
  canvas.dataset.gemId = String(++gemSerial);
  let gl = null;
  try { gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true }); } catch {}
  if (!gl) return mountGem2D(canvas, opts);

  const pTri = program(gl, VS, FS), pLine = program(gl, VS_LINE, FS_LINE);
  if (!pTri || !pLine) return mountGem2D(recycle(canvas), opts);

  const st = { a: '#3a2f6b', b: '#7c5cff', spin: 0.16, streakDays: 0, bestDays: 0,
               satellites: [], shatter: false, ...opts };

  let cluster, live, breaking = null;

  /** Upload one cluster's triangles; returns the handles the draw call needs. */
  function upload(pieces) {
    const m = tessellate(pieces);
    return {
      count: m.count,
      pos: mkBuf(gl, m.pos), nrm: mkBuf(gl, m.nrm),
      grow: mkBuf(gl, m.grow), kind: mkBuf(gl, m.kind),
      cen: mkBuf(gl, m.cen), vel: mkBuf(gl, m.vel), spin: mkBuf(gl, m.spin),
    };
  }
  const release = b => {
    if (!b) return;
    for (const k of ['pos','nrm','grow','kind','cen','vel','spin']) if (b[k]) gl.deleteBuffer(b[k]);
  };

  let bGhost = null, ghostCount = 0;

  function rebuild() {
    cluster = buildCluster(st);
    release(live);
    live = upload(cluster.pieces);
    if (bGhost) { gl.deleteBuffer(bGhost); bGhost = null; ghostCount = 0; }
    if (cluster.ghost) {
      const w = wireframe(cluster.ghost.tris);
      bGhost = mkBuf(gl, w); ghostCount = w.length / 3;
    }
  }
  rebuild();

  /* Shattering has to break the crystal the user was looking at, not the small
     one that replaces it — so build the pre-relapse cluster and fly that apart,
     then hand over to the new one and grow it from nothing. */
  function beginShatter(fromDays) {
    release(breaking);
    const old = buildCluster({ ...st, streakDays: fromDays, bestDays: Math.max(st.bestDays, fromDays) });
    breaking = upload(old.pieces);
    shatter = 0;
    grow = 0;          // the replacement waits until the pieces are gone
  }

  let pulse = 0, shatter = 0, grow = 0;
  if (st.shatter && st.shatterFrom > st.streakDays) beginShatter(st.shatterFrom);
  let t = 0, rx = -0.08, ry = 0.5, vrx = 0, vry = 0, tx = 0, ty = 0;
  let raf = 0, alive = true, dragging = false, last = null, moved = 0;
  let hovered = -1, model = M4.ident();

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 250;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    return (canvas.width / canvas.height) || 1;
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const aspect = size();
    t = now / 1000;

    /* Two phases. While pieces are in the air the replacement stays at zero;
       once they have faded, the new crystal grows in. */
    if (breaking) {
      shatter += 0.016 / 1.15;                   // ~1.15s for the break
      if (shatter >= 1) { release(breaking); breaking = null; shatter = 0; }
    } else {
      grow = Math.min(1.45, grow + 0.016);       // runs past 1 so the last piece finishes
    }
    pulse *= 0.92;
    if (!dragging) {
      ry += st.spin * 0.016 + vry; rx += vrx; vry *= 0.94; vrx *= 0.94;
      rx += (ty * 0.35 - 0.08 - rx) * 0.02;
    }

    const proj = M4.persp(FOV, aspect, 0.1, 60);
    const view = M4.trans(0, 0, -CAM_Z);
    model = M4.mul(M4.rotY(ry + tx * 0.28), M4.rotX(rx));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied

    /* ghost first, behind everything — hidden while the crystal is in pieces */
    if (ghostCount && !breaking) {
      gl.useProgram(pLine);
      bindAttr(gl, pLine, 'aPos', bGhost);
      gl.uniformMatrix4fv(gl.getUniformLocation(pLine, 'uProj'), false, proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(pLine, 'uView'), false, view);
      gl.uniformMatrix4fv(gl.getUniformLocation(pLine, 'uModel'), false, model);
      gl.uniform3fv(gl.getUniformLocation(pLine, 'uC'), lin(st.b).map(c => Math.min(1, c + 0.45)));
      gl.uniform1f(gl.getUniformLocation(pLine, 'uAlpha'), 0.42 + 0.10 * Math.sin(t * 1.6));
      gl.uniform1f(gl.getUniformLocation(pLine, 'uGrow'), Math.min(1, grow));
      gl.drawArrays(gl.LINES, 0, ghostCount);
    }

    /* solid, two-pass so a translucent body still resolves depth correctly */
    const draw = breaking || live;
    gl.useProgram(pTri);
    bindAttr(gl, pTri, 'aPos', draw.pos);  bindAttr(gl, pTri, 'aNrm', draw.nrm);
    bindAttr(gl, pTri, 'aCen', draw.cen);  bindAttr(gl, pTri, 'aVel', draw.vel);
    bindAttr(gl, pTri, 'aSpin', draw.spin);
    bindAttr(gl, pTri, 'aGrow', draw.grow, 1); bindAttr(gl, pTri, 'aKind', draw.kind, 1);
    const u = n => gl.getUniformLocation(pTri, n);
    gl.uniformMatrix4fv(u('uProj'), false, proj);
    gl.uniformMatrix4fv(u('uView'), false, view);
    gl.uniformMatrix4fv(u('uModel'), false, model);
    gl.uniform3fv(u('uA'), lin(st.a));
    gl.uniform3fv(u('uB'), lin(st.b));
    gl.uniform3f(u('uEye'), 0, 0, CAM_Z);
    gl.uniform1f(u('uTime'), t);
    gl.uniform1f(u('uPulse'), pulse);
    gl.uniform1f(u('uGrow'), breaking ? 1.45 : grow);
    gl.uniform1f(u('uShatter'), breaking ? shatter : 0);
    gl.uniform1f(u('uSpan'), cluster.span || 1);

    // Two-pass so a translucent body still resolves depth. Shards tumble, so
    // back-face culling would blink them; draw them double-sided instead.
    if (breaking) {
      gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLES, 0, draw.count);
    } else {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.FRONT); gl.drawArrays(gl.TRIANGLES, 0, draw.count);
      gl.cullFace(gl.BACK);  gl.drawArrays(gl.TRIANGLES, 0, draw.count);
      gl.disable(gl.CULL_FACE);
    }
  }

  /* ── picking: ray vs each piece's bounding sphere ── */
  function pieceAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const aspect = (r.width / r.height) || 1;
    const ndcX = ((clientX - r.left) / r.width) * 2 - 1;
    const ndcY = 1 - ((clientY - r.top) / r.height) * 2;
    const tanH = Math.tan(FOV / 2);
    const d = norm([ndcX * aspect * tanH, ndcY * tanH, -1]);
    const o = [0, 0, CAM_Z];

    // world → model (pure rotation, so the transpose inverts it)
    const toLocal = v => [
      v[0]*model[0] + v[1]*model[1] + v[2]*model[2],
      v[0]*model[4] + v[1]*model[5] + v[2]*model[6],
      v[0]*model[8] + v[1]*model[9] + v[2]*model[10],
    ];
    const lo = toLocal(o), ld = toLocal(d);

    let best = -1, bestT = Infinity;
    cluster.pieces.forEach((p, i) => {
      const oc = [lo[0]-p.centre[0], lo[1]-p.centre[1], lo[2]-p.centre[2]];
      const b = 2 * (oc[0]*ld[0] + oc[1]*ld[1] + oc[2]*ld[2]);
      const c = oc[0]**2 + oc[1]**2 + oc[2]**2 - p.bound * p.bound;
      const disc = b*b - 4*c;
      if (disc < 0) return;
      const tHit = (-b - Math.sqrt(disc)) / 2;
      if (tHit > 0 && tHit < bestT) { bestT = tHit; best = i; }
    });
    return best;
  }

  function setHover(i, ev) {
    if (i === hovered) return;
    hovered = i;
    canvas.style.cursor = i >= 0 ? 'pointer' : 'grab';
    st.onHover?.(i >= 0 ? cluster.pieces[i] : null, ev, cluster.ghost);
  }

  const onMove = e => {
    const r = canvas.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (dragging && last) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      moved += Math.abs(dx) + Math.abs(dy);
      ry += dx * 0.008; rx += dy * 0.005;
      vry = dx * 0.0007; vrx = dy * 0.0004;
      last = { x: e.clientX, y: e.clientY };
      setHover(-1, e);
    } else setHover(pieceAt(e.clientX, e.clientY), e);
  };
  const onDown = e => { dragging = true; moved = 0; last = { x: e.clientX, y: e.clientY };
                        canvas.setPointerCapture?.(e.pointerId); };
  const onUp = e => {
    if (dragging && moved < 5) { pulse = 1; st.onPick?.(hovered >= 0 ? cluster.pieces[hovered] : null); }
    dragging = false; last = null;
  };
  const onLeave = e => { tx = 0; ty = 0; dragging = false; setHover(-1, e); };

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  raf = requestAnimationFrame(frame);

  // Readable animation state. Inferring this from the outside cost several
  // wrong diagnoses; a shard phase is not visible in the DOM.
  canvas.__gemState = () => ({
    alive,
    breaking: !!breaking, shatter: +shatter.toFixed(3), grow: +grow.toFixed(3),
    streakDays: st.streakDays, shatterFrom: st.shatterFrom, wantedShatter: !!st.shatter,
  });

  return {
    set(next) {
      const needsGeom = ['streakDays', 'bestDays', 'satellites'].some(k => k in next);
      Object.assign(st, next);
      if (needsGeom) { rebuild(); grow = 0; }
    },
    pulse() { pulse = 1; },
    shatter(fromDays) { beginShatter(fromDays ?? st.streakDays); },
    destroy() {
      alive = false; cancelAnimationFrame(raf);
      release(live); release(breaking);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
    },
  };
}

/* ── canvas-2D fallback: same cluster, painter-sorted ────────── */
function mountGem2D(canvas, opts) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { set() {}, pulse() {}, shatter() {}, destroy() {} };
  const st = { a: '#3a2f6b', b: '#7c5cff', spin: 0.16, streakDays: 0, bestDays: 0, satellites: [], ...opts };
  let cluster = buildCluster(st), raf = 0, alive = true, ry = 0.5, pulse = 0;

  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 250;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ry += st.spin * 0.016; pulse *= 0.92;
    const R = Math.min(w, h) * 0.36 * (1 + pulse * 0.12);
    const cx = w / 2, cy = h / 2;
    const cos = Math.cos(ry), sin = Math.sin(ry);

    const tris = [];
    for (const p of cluster.pieces)
      for (const t of p.tris) {
        const proj = t.map(([x, y, z]) => {
          const a = x * cos + z * sin, c = -x * sin + z * cos;
          const k = CAM_Z / (CAM_Z - c);
          return { x: cx + a * R * k, y: cy - y * R * k, z: c };
        });
        tris.push({ proj, z: (proj[0].z + proj[1].z + proj[2].z) / 3, kind: p.kind });
      }
    tris.sort((m, n) => m.z - n.z);
    for (const { proj, z, kind } of tris) {
      const shade = 0.35 + 0.65 * ((z + 1) / 2);
      ctx.beginPath();
      ctx.moveTo(proj[0].x, proj[0].y); ctx.lineTo(proj[1].x, proj[1].y); ctx.lineTo(proj[2].x, proj[2].y);
      ctx.closePath();
      ctx.fillStyle = shadeHex(kind === 'sat' ? st.b : st.a, shade);
      ctx.fill();
      ctx.strokeStyle = st.b + '44'; ctx.lineWidth = 0.6; ctx.stroke();
    }
  }
  canvas.addEventListener('click', () => { pulse = 1; });
  raf = requestAnimationFrame(frame);
  return {
    set(next) { Object.assign(st, next); cluster = buildCluster(st); },
    pulse() { pulse = 1; }, shatter() {},
    destroy() { alive = false; cancelAnimationFrame(raf); },
  };
}
function shadeHex(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r*k)},${Math.round(g*k)},${Math.round(b*k)})`;
}

/* ── lock-screen particle field ─────────────────────────────── */
export function mountField(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { destroy() {} };
  let raf = 0, alive = true, t = 0, mx = 0, my = 0;
  const N = 130;
  const pts = Array.from({ length: N }, () => ({
    x: (Math.random() - 0.5) * 3.2, y: (Math.random() - 0.5) * 3.2,
    z: Math.random() * 5 + 0.4, s: 0.15 + Math.random() * 0.55,
  }));
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const accent = () => css('--a1') || '#7c5cff';
  const accent2 = () => css('--a2') || '#00d6c2';

  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    t += 0.004;
    const cx = w / 2 + mx * 26, cy = h / 2 + my * 26, F = Math.min(w, h) * 0.95;
    const proj = [];
    for (const p of pts) {
      p.z -= p.s * 0.006;
      if (p.z < 0.35) { p.z = 5.4; p.x = (Math.random() - 0.5) * 3.2; p.y = (Math.random() - 0.5) * 3.2; }
      const a = p.x * Math.cos(t) + p.y * Math.sin(t);
      const b = -p.x * Math.sin(t) + p.y * Math.cos(t);
      const k = F / p.z;
      proj.push({ x: cx + a * k, y: cy + b * k, r: Math.max(0.4, 2.1 / p.z * 1.4), z: p.z });
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < proj.length; i++) {
      const A = proj[i];
      for (let j = i + 1; j < proj.length; j++) {
        const Bp = proj[j], d = Math.hypot(A.x - Bp.x, A.y - Bp.y);
        if (d < 92) {
          ctx.strokeStyle = accent() + Math.round((1 - d / 92) * 26).toString(16).padStart(2, '0');
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(Bp.x, Bp.y); ctx.stroke();
        }
      }
      ctx.fillStyle = A.z < 2.2 ? accent2() + 'cc' : accent() + '99';
      ctx.beginPath(); ctx.arc(A.x, A.y, A.r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const onMove = e => { mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5; };
  window.addEventListener('pointermove', onMove);
  raf = requestAnimationFrame(frame);
  return { destroy() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); } };
}

/** Streak → motion. A long clean run turns slowly; a fresh slip is restless. */
export function gemMotionFor(days) {
  const heat = Math.max(0, 1 - days / 45);
  return { spin: 0.09 + heat * 0.30 };
}
