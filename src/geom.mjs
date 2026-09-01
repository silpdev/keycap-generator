// ---------------------------------------------------------------------------
// keycap generator - core geometry.  No dependencies, runs in Node and browser.
// Every builder returns a closed, watertight solid {V:[[x,y,z]..], F:[[a,b,c]..]}
// with outward-facing normals, so the 3MF can hand the slicer separate parts and
// never needs a CSG boolean.
// ---------------------------------------------------------------------------

// ----------------------------------------------------------------- 2D basics
export function signedArea(p) {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
const ccw = (p) => (signedArea(p) < 0 ? p.slice().reverse() : p);
const cw = (p) => (signedArea(p) > 0 ? p.slice().reverse() : p);

/** Rounded rectangle centred on the origin, CCW. */
export function roundedRect(w, d, r, seg = 8) {
  const hw = w / 2, hd = d / 2;
  r = Math.max(0, Math.min(r, Math.min(hw, hd) - 1e-4));
  if (r < 1e-4) return [[hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]];
  const pts = [];
  const corners = [[hw - r, -hd + r, -Math.PI / 2], [hw - r, hd - r, 0],
                   [-hw + r, hd - r, Math.PI / 2], [-hw + r, -hd + r, Math.PI]];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (Math.PI / 2) * (i / seg);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  return pts;
}

/** MX cross ("+") slot outline, CCW.  span = tip to tip, arm = bar width. */
export function crossPoly(span, arm) {
  const h = span / 2, w = arm / 2;
  return [[h, -w], [h, w], [w, w], [w, h], [-w, h], [-w, w],
          [-h, w], [-h, -w], [-w, -w], [-w, -h], [w, -h], [w, -w]];
}

// ------------------------------------------------------- triangulation (2D)
const EPS = 1e-9;
function segIntersect(a, b, c, d) {
  const d1 = cross3(a, b, c), d2 = cross3(a, b, d),
        d3 = cross3(c, d, a), d4 = cross3(c, d, b);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
         ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}
const cross3 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * Can `from` see `target` without crossing any edge?
 * Rings are tested separately — concatenating them would invent an edge from the
 * last point of one ring to the first point of the next.
 */
function visible(rings, from, target) {
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (a === from || b === from || a === target || b === target) continue;
      if (segIntersect(from, target, a, b)) return false;
    }
  return true;
}

/**
 * Merge one hole ring into the outer ring with a double bridge.
 * `rest` are the holes not bridged yet: the bridge must not cut through them
 * either, or the merged ring self-intersects and a hole ends up filled.
 */
function bridgeHole(poly, hole, rest) {
  let m = 0;
  for (let i = 1; i < hole.length; i++) if (hole[i][0] > hole[m][0]) m = i;
  const M = hole[m];
  const rings = [poly, hole, ...rest];
  let best = -1, bestD = Infinity;
  // prefer bridging towards +x (the hole's own rightmost point faces open space),
  // then fall back to any visible vertex
  for (const rightOnly of [true, false]) {
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i];
      if (rightOnly && P[0] < M[0]) continue;
      const dx = P[0] - M[0], dy = P[1] - M[1];
      const dist = dx * dx + dy * dy;
      if (dist >= bestD) continue;
      if (!visible(rings, M, P)) continue;
      best = i; bestD = dist;
    }
    if (best >= 0) break;
  }
  if (best < 0) return null;   // caller keeps the hole out rather than corrupting the ring
  const rot = hole.slice(m).concat(hole.slice(0, m));
  return [...poly.slice(0, best + 1), ...rot, rot[0], ...poly.slice(best)];
}

function pointInTri(p, a, b, c) {
  const d1 = cross3(a, b, p), d2 = cross3(b, c, p), d3 = cross3(c, a, p);
  return d1 >= -EPS && d2 >= -EPS && d3 >= -EPS;
}
const eq = (p, q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;

/**
 * Ear clipping over an index ring.
 *
 * Bridging a hole into the outer ring duplicates two vertices (the bridge is a
 * zero-width channel), and a naive ear test rejects every ear that geometrically
 * contains the twin of one of its own corners — the clipper stalls and, if it
 * then clips blindly, silently fills the hole.  So: ignore vertices that are
 * geometric duplicates of the ear's corners, and when genuinely stuck, split the
 * ring on a duplicate pair (or any valid diagonal) and recurse.
 */
function earClipIdx(poly, idx, out, depth = 0) {
  if (idx.length < 3) return true;
  let guard = 0;
  const limit = idx.length * idx.length + 64;
  while (idx.length > 3) {
    if (guard++ > limit) break;
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i - 1 + idx.length) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      const a = poly[ia], b = poly[ib], c = poly[ic];
      if (cross3(a, b, c) <= EPS) continue;                  // reflex or degenerate
      let ok = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        const p = poly[j];
        if (eq(p, a) || eq(p, b) || eq(p, c)) continue;       // bridge twin
        if (pointInTri(p, a, b, c)) { ok = false; break; }
      }
      if (!ok) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (clipped) continue;

    if (depth > 24) return false;
    // stuck: split on a duplicated vertex pair, else on any valid diagonal
    const n = idx.length;
    let cut = null;
    for (let i = 0; i < n && !cut; i++)
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (eq(poly[idx[i]], poly[idx[j]])) { cut = [i, j]; break; }
      }
    if (!cut) {
      for (let i = 0; i < n && !cut; i++)
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue;
          if (validDiagonal(poly, idx, i, j)) { cut = [i, j]; break; }
        }
    }
    if (!cut) return false;
    const [i, j] = cut;
    const left = idx.slice(i, j + 1);
    const right = idx.slice(j).concat(idx.slice(0, i + 1));
    const okL = earClipIdx(poly, left, out, depth + 1);
    const okR = earClipIdx(poly, right, out, depth + 1);
    return okL && okR;
  }
  // Never drop a triangle: a degenerate one is harmless to a slicer, an open
  // surface is not.  If the clipper stalled with more than three vertices left,
  // close the remainder with a fan and let triStats.failed surface it.
  if (idx.length === 3) { out.push([idx[0], idx[1], idx[2]]); return true; }
  if (idx.length > 3) {
    for (let i = 1; i + 1 < idx.length; i++) out.push([idx[0], idx[i], idx[i + 1]]);
    return false;
  }
  return true;
}

/** Is the segment idx[i]-idx[j] a diagonal that stays inside the ring? */
function validDiagonal(poly, idx, i, j) {
  const n = idx.length, A = poly[idx[i]], B = poly[idx[j]];
  if (eq(A, B)) return false;
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    if (k === i || k === j || k2 === i || k2 === j) continue;
    if (segIntersect(A, B, poly[idx[k]], poly[idx[k2]])) return false;
  }
  // midpoint must be inside the ring
  const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
  let inside = false;
  for (let k = 0, l = n - 1; k < n; l = k++) {
    const p = poly[idx[k]], q = poly[idx[l]];
    if ((p[1] > my) !== (q[1] > my) &&
        mx < ((q[0] - p[0]) * (my - p[1])) / (q[1] - p[1]) + p[0]) inside = !inside;
  }
  return inside;
}

export const triStats = { dropped: 0, failed: 0 };
export function resetTriStats() { triStats.dropped = 0; triStats.failed = 0; }

function earClip(poly) {
  const out = [];
  if (!earClipIdx(poly, [...Array(poly.length).keys()], out)) triStats.failed++;
  return out;
}

/**
 * Triangulate one outer ring with any number of hole rings.
 * Returns {pts, tris} where tris index into pts and wind CCW.
 */
export function triangulate(outer, holes = []) {
  let poly = ccw(outer).map((p) => [p[0], p[1]]);
  const hs = holes.map((h) => cw(h).map((p) => [p[0], p[1]]));
  const maxX = (r) => r.reduce((m, p) => (p[0] > m ? p[0] : m), -Infinity);
  hs.sort((a, b) => maxX(b) - maxX(a));
  let dropped = 0;
  for (let k = 0; k < hs.length; k++) {
    const next = bridgeHole(poly, hs[k], hs.slice(k + 1));
    if (next) poly = next; else dropped++;
  }
  triStats.dropped += dropped;
  return { pts: poly, tris: earClip(poly) };
}

// ------------------------------------------------------------- mesh builder
export class Mesh {
  constructor() { this.V = []; this.F = []; }
  vert(x, y, z) { this.V.push([x, y, z]); return this.V.length - 1; }
  tri(a, b, c) { this.F.push([a, b, c]); }
  ring(pts, z) { return pts.map((p) => this.vert(p[0], p[1], z)); }

  /** Side wall between two equal-length rings.  `out` flips the facing. */
  loft(lo, hi, out = true) {
    const n = lo.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (out) { this.tri(lo[i], lo[j], hi[j]); this.tri(lo[i], hi[j], hi[i]); }
      else     { this.tri(lo[i], hi[j], lo[j]); this.tri(lo[i], hi[i], hi[j]); }
    }
  }

  /**
   * Flat horizontal face at `z` from an outer ring plus holes.
   * `up` true -> normal +Z, false -> normal -Z.
   */
  face(outer, holes, z, up) {
    const { pts, tris } = triangulate(outer, holes);
    const ids = pts.map((p) => this.vert(p[0], p[1], z));
    for (const [a, b, c] of tris) up ? this.tri(ids[a], ids[b], ids[c]) : this.tri(ids[a], ids[c], ids[b]);
  }

  merge(other) {
    const o = this.V.length;
    for (const v of other.V) this.V.push(v);
    for (const f of other.F) this.F.push([f[0] + o, f[1] + o, f[2] + o]);
  }
  /**
   * Fuse coincident vertices so the solid is properly manifold (each builder
   * emits its own ring copies, which would otherwise leave every shared edge
   * split and force the slicer to repair the mesh).
   */
  weld(tol = 1e-4) {
    const map = new Map(), remap = new Int32Array(this.V.length);
    const V = [];
    const q = (v) => Math.round(v / tol);
    for (let i = 0; i < this.V.length; i++) {
      const v = this.V[i], k = `${q(v[0])},${q(v[1])},${q(v[2])}`;
      let j = map.get(k);
      if (j === undefined) { j = V.length; V.push(v); map.set(k, j); }
      remap[i] = j;
    }
    const F = [];
    for (const f of this.F) {
      const a = remap[f[0]], b = remap[f[1]], c = remap[f[2]];
      if (a !== b && b !== c && a !== c) F.push([a, b, c]);
    }
    this.V = V; this.F = F;
    return this;
  }

  /** Copy rotated 180° about X and lifted so the model sits on z=0..H. */
  flipped(H) {
    const m = new Mesh();
    m.V = this.V.map((v) => [v[0], -v[1], H - v[2]]);
    m.F = this.F.map((f) => [f[0], f[1], f[2]]);   // proper rotation -> winding kept
    return m;
  }

  get bounds() {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of this.V) for (let k = 0; k < 3; k++) {
      if (v[k] < lo[k]) lo[k] = v[k];
      if (v[k] > hi[k]) hi[k] = v[k];
    }
    return { lo, hi };
  }
}

// ------------------------------------------------------------------ the cap
/**
 * Hollow tapered cap shell.  Sits on z=0, flat top at z=capH.
 * The cavity is a straight-walled well of depth cavityH; everything above it is solid.
 */
export function buildCapShell(p) {
  const seg = p.cornerSeg ?? 10;
  const m = new Mesh();
  const lerp = (a, b, t) => a + (b - a) * t;
  const t = p.cavityH / p.capH;

  const outLo = roundedRect(p.capW, p.capD, p.cornerR, seg);
  const outHi = roundedRect(p.topW, p.topD, Math.max(0.2, p.cornerR * (p.topW / p.capW)), seg);

  // The cavity follows the outer taper instead of running straight up, so the
  // wall keeps its thickness all the way.  A straight cavity under a tapered
  // shell pinches the wall to nothing near the roof — the slicer then prints no
  // wall there at all and the skirt comes off the cap as a separate ring.
  const rIn = Math.max(0.3, p.cornerR - p.wall * 0.5);
  const innLo = roundedRect(p.capW - 2 * p.wall, p.capD - 2 * p.wall, rIn, seg);
  const innHi = roundedRect(
    Math.max(1, lerp(p.capW, p.topW, t) - 2 * p.wall),
    Math.max(1, lerp(p.capD, p.topD, t) - 2 * p.wall),
    Math.max(0.2, rIn * 0.9), seg);

  const rOutLo = m.ring(outLo, 0);
  const rOutHi = m.ring(outHi, p.capH);
  m.loft(rOutLo, rOutHi, true);          // outer skirt
  m.face(outHi, [], p.capH, true);       // flat top

  const rInLo = m.ring(innLo, 0);
  const rInHi = m.ring(innHi, p.cavityH);
  m.loft(rInLo, rInHi, false);           // cavity wall (normals point inward)
  m.face(innHi, [], p.cavityH, false);   // cavity ceiling, facing down
  m.face(outLo, [innLo], 0, false);      // bottom rim, facing down
  return m;
}

// ----------------------------------------------------------------- the stem
/**
 * MX stem: round tube on z=0 carrying a cross slot.  Reaches `top` so that it
 * welds into the cap roof when the slicer unions the parts.
 *   span/arm   cross slot, tip-to-tip and bar width
 *   depth      slot depth from z=0
 *   dia        tube outer diameter
 *   leadIn     extra span+arm for the first leadInH mm (push-on chamfer, 0 = none)
 */
export function buildStem(p) {
  const m = new Mesh();
  const n = p.tubeSeg ?? 64;
  const R = p.stemDia / 2;
  const top = p.stemTop;
  const circle = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    circle.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  const cLo = m.ring(circle, 0), cHi = m.ring(circle, top);
  m.loft(cLo, cHi, true);
  m.face(circle, [], top, true);

  const small = crossPoly(p.stemSpan, p.stemArm);
  const lead = p.leadIn > 0 ? p.leadInH : 0;

  if (lead > 0) {
    const big = crossPoly(p.stemSpan + 2 * p.leadIn, p.stemArm + 2 * p.leadIn);
    m.face(circle, [big], 0, false);                 // bottom rim around the wide entry
    const bLo = m.ring(big, 0), bHi = m.ring(big, lead);
    m.loft(bLo, bHi, false);                         // wide entry wall
    m.face(big, [small], lead, false);               // step shoulder, facing down
    const sLo = m.ring(small, lead), sHi = m.ring(small, p.stemSlotDepth);
    m.loft(sLo, sHi, false);
    m.face(small, [], p.stemSlotDepth, false);       // slot ceiling
  } else {
    m.face(circle, [small], 0, false);
    const sLo = m.ring(small, 0), sHi = m.ring(small, p.stemSlotDepth);
    m.loft(sLo, sHi, false);
    m.face(small, [], p.stemSlotDepth, false);
  }
  return m;
}

// ------------------------------------------------------------ legend prisms
/**
 * Extrude a set of rings into a prism between z0 and z1.
 * `rings` = [{outer:[[x,y]..], holes:[[[x,y]..]..]}, ..]
 */
export function buildPrism(rings, z0, z1) {
  const m = new Mesh();
  for (const r of rings) {
    const outer = ccw(r.outer), holes = (r.holes || []).map(cw);
    m.face(outer, holes, z1, true);
    m.face(outer, holes, z0, false);
    const oLo = m.ring(outer, z0), oHi = m.ring(outer, z1);
    m.loft(oLo, oHi, true);
    for (const h of holes) {
      const hLo = m.ring(h, z0), hHi = m.ring(h, z1);
      m.loft(hLo, hHi, true);   // hole rings are CW, so the same winding faces inward
    }
  }
  return m;
}

// -------------------------------------------------------- ring transforming
export function transformRings(rings, { scale = 1, rot = 0, dx = 0, dy = 0, mirror = false }) {
  const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180);
  const f = (p) => {
    let x = p[0] * scale * (mirror ? -1 : 1), y = p[1] * scale;
    return [x * c - y * s + dx, x * s + y * c + dy];
  };
  return rings.map((r) => ({
    outer: mirror ? r.outer.map(f).reverse() : r.outer.map(f),
    holes: (r.holes || []).map((h) => (mirror ? h.map(f).reverse() : h.map(f))),
  }));
}

/** Bounding box of a ring set. */
export function ringsBounds(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r.outer) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
