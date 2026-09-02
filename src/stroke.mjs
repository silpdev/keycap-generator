// ---------------------------------------------------------------------------
// How thin is the legend, really?
//
// A two-colour legend fails in a way that looks like nothing went wrong: the
// geometry is perfect, the slicer accepts it, and the thin strokes come out in
// the *cap's* colour because a region narrower than the nozzle can lay down
// cannot be printed as its own filament.  You get faint relief where the letters
// should be — the shape is there, the colour is not.
//
// The number that decides it is the width of each region at its WIDEST point.
// If even the widest point of a letter is under a couple of extrusion widths,
// that letter has no chance, and no amount of slicer tuning will save it.  That
// is the max inscribed circle diameter, which is the maximum of the Euclidean
// distance transform over the region — cheap and exact enough on a fine raster.
// ---------------------------------------------------------------------------

/** Exact 1D squared-distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f, n) {
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  return d;
}

/** Squared Euclidean distance from every set pixel to the nearest unset pixel. */
function edt2d(mask, w, h) {
  const INF = 1e12;
  const g = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = mask[i] ? INF : 0;
  const col = new Float64Array(h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) col[y] = g[y * w + x];
    const d = edt1d(col, h);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  const row = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) row[x] = g[y * w + x];
    const d = edt1d(row, w);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
  return g;
}

/** Even-odd scanline fill of one ring set into a mask. */
function rasterRings(rings, x0, y0, px, w, h) {
  const mask = new Uint8Array(w * h);
  const edges = [];
  for (const r of rings)
    for (const loop of [r.outer, ...(r.holes || [])])
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        if (a[1] !== b[1]) edges.push([a[0], a[1], b[0], b[1]]);
      }
  const xs = [];
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) * px;
    xs.length = 0;
    for (const [ax, ay, bx, by] of edges) {
      if ((ay > y) === (by > y)) continue;
      xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    if (!xs.length) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      let i0 = Math.ceil((xs[k] - x0) / px - 0.5);
      let i1 = Math.floor((xs[k + 1] - x0) / px - 0.5);
      if (i1 < 0 || i0 >= w) continue;
      if (i0 < 0) i0 = 0;
      if (i1 >= w) i1 = w - 1;
      for (let i = i0; i <= i1; i++) mask[j * w + i] = 1;
    }
  }
  return mask;
}

/**
 * Per-region width at the widest point, in mm, largest region first.
 *   rings — placed legend rings, already in millimetres
 *   px    — raster pitch.  0.01 mm keeps the error inside 0.007 mm on a 0.4 mm
 *           stroke, which matters: the whole point is deciding whether a stroke
 *           clears 0.42 mm, and a 0.02 mm pitch was reading 0.378 as 0.396.
 * Returns { widths, min, px, regions }.
 */
export function strokeWidths(rings, { px = 0.01, maxPx = 2600 } = {}) {
  if (!rings || !rings.length) return { widths: [], min: Infinity, px, regions: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r.outer) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[1] > y1) y1 = p[1];
  }
  const pad = 4;
  // keep the raster bounded on very large logos
  const need = Math.max((x1 - x0), (y1 - y0)) / px + 2 * pad;
  if (need > maxPx) px = Math.max((x1 - x0), (y1 - y0)) / (maxPx - 2 * pad);
  const w = Math.ceil((x1 - x0) / px) + 2 * pad;
  const h = Math.ceil((y1 - y0) / px) + 2 * pad;
  const ox = x0 - pad * px, oy = y0 - pad * px;

  const mask = rasterRings(rings, ox, oy, px, w, h);
  const d2 = edt2d(mask, w, h);

  // connected components (4-neighbour), tracking the max distance in each
  const lab = new Int32Array(w * h).fill(-1);
  const stack = [];
  const widths = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s] >= 0) continue;
    const id = widths.length;
    let best = 0, area = 0;
    stack.length = 0; stack.push(s); lab[s] = id;
    while (stack.length) {
      const q = stack.pop();
      area++;
      if (d2[q] > best) best = d2[q];
      const qx = q % w, qy = (q - qx) / w;
      if (qx > 0 && mask[q - 1] && lab[q - 1] < 0) { lab[q - 1] = id; stack.push(q - 1); }
      if (qx < w - 1 && mask[q + 1] && lab[q + 1] < 0) { lab[q + 1] = id; stack.push(q + 1); }
      if (qy > 0 && mask[q - w] && lab[q - w] < 0) { lab[q - w] = id; stack.push(q - w); }
      if (qy < h - 1 && mask[q + w] && lab[q + w] < 0) { lab[q + w] = id; stack.push(q + w); }
    }
    // maxD is the max inscribed radius in pixel units, so the width is 2·maxD·px.
    // Discretisation costs up to about one raster pitch, in either direction: the
    // widest point of a stroke need not sit on a pixel centre.  Checked against
    // shapely's exact erosion on a real two-tier logo — see test_stroke.mjs.
    widths.push({ w: 2 * Math.sqrt(best) * px, area: area * px * px });
  }
  widths.sort((a, b) => b.area - a.area);
  return {
    widths, px, regions: widths.length,
    min: widths.length ? Math.min(...widths.map((r) => r.w)) : Infinity,
  };
}

/**
 * Turn that into a verdict for a two-colour legend.
 *   line — extrusion width (about 1.05 × nozzle; 0.42 for a 0.4 mm nozzle)
 * A region needs two extrusions across it to print as its own filament: one for
 * the perimeter it shares with the cap and one to actually show its colour.
 */
export function legendPrintability(rings, { line = 0.42, logoSize = 0 } = {}) {
  const s = strokeWidths(rings);
  if (!isFinite(s.min)) return null;
  const need = 2 * line;
  const lost = s.widths.filter((r) => r.w < line);          // no colour at all
  const risky = s.widths.filter((r) => r.w >= line && r.w < need);
  // Widths scale linearly with logoSize, so the size that would work is just a
  // ratio — but scale it off the *conservative* end of the measurement.  Using
  // the measured value directly returns a size that lands a raster pitch short,
  // and advice that is 5% short of working is worse than no advice.
  const floorW = Math.max(s.min - s.px, 1e-6);
  const sizeFor = logoSize > 0 ? logoSize * (need / floorW) : 0;
  return { ...s, line, need, lost: lost.length, risky: risky.length, sizeFor };
}
