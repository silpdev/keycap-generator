// ---------------------------------------------------------------------------
// Turn a coverage raster (alpha from an SVG or PNG drawn to a canvas) into
// closed polygon rings, ready to extrude.  Marching squares on the antialiased
// alpha field gives smooth sub-pixel contours; Douglas-Peucker trims them down.
// ---------------------------------------------------------------------------

const KEY = (x, y) => `${Math.round(x * 4096)},${Math.round(y * 4096)}`;

/**
 * field: Float32Array/Array of w*h coverage values 0..1 (row major, y down)
 * Returns loops in pixel coordinates with y still pointing down.
 */
export function marchingSquares(field, w, h, iso = 0.5) {
  // pad with 0 so shapes touching the border still close
  const W = w + 2, H = h + 2;
  const f = new Float32Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[(y + 1) * W + (x + 1)] = field[y * w + x];
  const at = (i, j) => f[j * W + i];

  const segs = [];
  const lerp = (i0, j0, i1, j1) => {
    const v0 = at(i0, j0), v1 = at(i1, j1);
    let t = (iso - v0) / (v1 - v0);
    if (!isFinite(t)) t = 0.5;
    t = Math.max(0, Math.min(1, t));
    return [i0 + (i1 - i0) * t - 1, j0 + (j1 - j0) * t - 1];
  };
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const bl = at(i, j) >= iso, br = at(i + 1, j) >= iso,
          tr = at(i + 1, j + 1) >= iso, tl = at(i, j + 1) >= iso;
    const code = (bl ? 1 : 0) | (br ? 2 : 0) | (tr ? 4 : 0) | (tl ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const L = () => lerp(i, j, i, j + 1);
    const B = () => lerp(i, j, i + 1, j);
    const R = () => lerp(i + 1, j, i + 1, j + 1);
    const T = () => lerp(i, j + 1, i + 1, j + 1);
    const push = (a, b) => segs.push([a, b]);
    switch (code) {
      case 1: case 14: push(L(), B()); break;
      case 2: case 13: push(B(), R()); break;
      case 3: case 12: push(L(), R()); break;
      case 4: case 11: push(R(), T()); break;
      case 6: case 9:  push(B(), T()); break;
      case 7: case 8:  push(L(), T()); break;
      case 5:  push(L(), B()); push(R(), T()); break;
      case 10: push(B(), R()); push(T(), L()); break;
    }
  }

  // chain segments into closed loops through shared endpoints
  const adj = new Map();
  const add = (p, q) => {
    const k = KEY(p[0], p[1]);
    let e = adj.get(k);
    if (!e) { e = { p, n: [] }; adj.set(k, e); }
    e.n.push(q);
  };
  for (const [a, b] of segs) { add(a, b); add(b, a); }

  // Walk the point graph into loops.  Where a thin feature pinches, one point
  // can carry four segments instead of two; pick the straightest continuation
  // so the two strands passing through stay separate instead of cross-linking.
  const seen = new Set();
  const loops = [];
  for (const [k0] of adj) {
    if (seen.has(k0)) continue;
    const loop = [];
    let curK = k0, prevK = null, prevPt = null, guard = 0;
    while (guard++ < adj.size * 4) {
      const e = adj.get(curK);
      if (!e || seen.has(curK)) break;
      seen.add(curK);
      loop.push(e.p);
      let nextK = null, bestScore = -Infinity;
      for (const q of e.n) {
        const qk = KEY(q[0], q[1]);
        if (qk === prevK || seen.has(qk)) continue;
        if (!prevPt) { nextK = qk; break; }
        const ax = e.p[0] - prevPt[0], ay = e.p[1] - prevPt[1];
        const bx = q[0] - e.p[0], by = q[1] - e.p[1];
        const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
        const sc = (ax * bx + ay * by) / (la * lb);
        if (sc > bestScore) { bestScore = sc; nextK = qk; }
      }
      if (!nextK) break;
      prevK = curK; prevPt = e.p; curK = nextK;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Douglas-Peucker on a closed ring. */
export function simplify(ring, tol) {
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  const stack = [[0, ring.length - 1]];
  const d2 = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    if (L < 1e-12) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L;
    t = Math.max(0, Math.min(1, t));
    const qx = a[0] + t * dx - p[0], qy = a[1] + t * dy - p[1];
    return qx * qx + qy * qy;
  };
  keep[ring.length - 1] = 1;
  while (stack.length) {
    const [i0, i1] = stack.pop();
    let worst = -1, wd = tol * tol;
    for (let i = i0 + 1; i < i1; i++) {
      const d = d2(ring[i], ring[i0], ring[i1]);
      if (d > wd) { wd = d; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([i0, worst], [worst, i1]); }
  }
  const out = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  return out.length >= 3 ? out : ring;
}

const area2 = (p) => {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
};
function inside(pt, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) &&
        pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/**
 * Group loops into {outer, holes} by nesting depth, drop specks, and map
 * pixel space -> millimetres with Y flipped so the legend reads right side up.
 */
export function loopsToRings(loops, { pxPerMM = 1, minArea = 0.02 } = {}) {
  const rings = loops.map((l) => ({ pts: l, a: Math.abs(area2(l)) }))
    .filter((r) => r.a / (pxPerMM * pxPerMM) >= minArea)
    .sort((a, b) => b.a - a.a)
    .map((r) => r.pts);

  const depth = rings.map((r, i) => {
    let d = 0;
    for (let j = 0; j < rings.length; j++) if (j !== i && inside(r[0], rings[j])) d++;
    return d;
  });
  const out = [];
  rings.forEach((r, i) => {
    if (depth[i] % 2 === 0) out.push({ outer: r, holes: [], _i: i });
  });
  rings.forEach((r, i) => {
    if (depth[i] % 2 === 0) return;
    let best = null, bestA = Infinity;
    for (const o of out) {
      if (depth[o._i] !== depth[i] - 1) continue;
      if (!inside(r[0], rings[o._i])) continue;
      const a = Math.abs(area2(rings[o._i]));
      if (a < bestA) { bestA = a; best = o; }
    }
    (best || out[0])?.holes.push(r);
  });
  const conv = (p) => [p[0] / pxPerMM, -p[1] / pxPerMM];
  return out.map((r) => ({ outer: r.outer.map(conv), holes: r.holes.map((h) => h.map(conv)) }));
}

/** Full pipeline: coverage raster -> mm rings. */
export function rasterToRings(field, w, h, { pxPerMM = 1, tolPx = 0.35, minArea = 0.02, iso = 0.5 } = {}) {
  const loops = marchingSquares(field, w, h, iso).map((l) => simplify(l, tolPx));
  return loopsToRings(loops, { pxPerMM, minArea });
}
