// ---------------------------------------------------------------------------
// Splitting a logo into ink colours.
//
// A brand mark already carries its own colours — the VNG wordmark is one navy
// and one red — so asking the user which regions are which colour would be
// asking them to re-enter information the file already has.  Cluster the
// artwork's colours instead, and vectorise each cluster separately.
//
// Two things make this behave:
//
// Determinism.  k-means seeded at random gives a different answer every time
// you drop the same file in, which is intolerable in a tool whose output you
// print.  So the seeds come from the most populated buckets of a coarse colour
// histogram, chosen farthest-first — no randomness anywhere.
//
// Soft edges.  A hard per-pixel label puts the boundary between two inks on a
// pixel edge, and marching squares then traces a staircase.  Each cluster gets
// an inverse-distance membership instead, so a pixel exactly between navy and
// red counts 0.5 towards each and the iso-0.5 contour lands on the true colour
// boundary with sub-pixel accuracy — the same way alpha gives smooth outer
// edges.
// ---------------------------------------------------------------------------

const BITS = 4, LEV = 1 << BITS, SHIFT = 8 - BITS;   // 16³ histogram

/** Populated colour buckets of the opaque pixels, as [{rgb, n}] . */
function histogram(data, alphaMin) {
  const bins = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaMin) continue;
    const r = data[i] >> SHIFT, g = data[i + 1] >> SHIFT, b = data[i + 2] >> SHIFT;
    const k = (r * LEV + g) * LEV + b;
    const e = bins.get(k);
    if (e) { e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2]; }
    else bins.set(k, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  const out = [];
  for (const e of bins.values())
    out.push({ rgb: [e.r / e.n, e.g / e.n, e.b / e.n], n: e.n });
  out.sort((a, b) => b.n - a.n);
  return out;
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * Cluster the artwork into `k` ink colours.
 *   data     — RGBA bytes (Uint8ClampedArray from getImageData)
 *   k        — how many inks
 *   alphaMin — below this the pixel is background
 * Returns { inks:[{rgb, hex, share}], k } ordered by coverage, largest first.
 */
export function inkColours(data, k = 2, { alphaMin = 128 } = {}) {
  const hist = histogram(data, alphaMin);
  if (!hist.length) return { inks: [], k: 0 };
  k = Math.max(1, Math.min(k, hist.length));

  // seed farthest-first among the populated buckets, starting from the biggest
  const seeds = [hist[0].rgb];
  while (seeds.length < k) {
    let best = null, bestD = -1;
    for (const h of hist) {
      let near = Infinity;
      for (const s of seeds) near = Math.min(near, d2(h.rgb, s));
      // weight by population so a big block of colour beats a stray pixel
      const score = near * Math.log2(1 + h.n);
      if (score > bestD) { bestD = score; best = h.rgb; }
    }
    if (!best) break;
    seeds.push(best);
  }

  // Lloyd over the histogram (weighted) — a few dozen buckets, converges fast
  let cen = seeds.map((s) => s.slice());
  for (let it = 0; it < 24; it++) {
    const acc = cen.map(() => [0, 0, 0, 0]);
    for (const h of hist) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < cen.length; i++) {
        const d = d2(h.rgb, cen[i]);
        if (d < bd) { bd = d; bi = i; }
      }
      const a = acc[bi];
      a[0] += h.rgb[0] * h.n; a[1] += h.rgb[1] * h.n; a[2] += h.rgb[2] * h.n; a[3] += h.n;
    }
    let moved = 0;
    const next = cen.map((c, i) => {
      const a = acc[i];
      if (!a[3]) return c;
      const p = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
      moved += d2(p, c);
      return p;
    });
    cen = next;
    if (moved < 1e-4) break;
  }

  // final coverage per centre, so they can be ordered by how much ink they are
  const share = cen.map(() => 0);
  let total = 0;
  for (const h of hist) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < cen.length; i++) {
      const d = d2(h.rgb, cen[i]);
      if (d < bd) { bd = d; bi = i; }
    }
    share[bi] += h.n; total += h.n;
  }
  const hex = (c) => '#' + c.map((v) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  // Drop clusters that are only antialiasing.  Asking for 3 inks on a two-colour
  // logo otherwise yields a third "colour" made of the blended pixels along the
  // boundary — a part with 0.0% coverage, a wasted filament slot and a tool
  // change per layer for nothing.  Better to report that only 2 were found.
  const MIN_SHARE = 0.01;
  const inks = cen.map((rgb, i) => ({ rgb, hex: hex(rgb), share: total ? share[i] / total : 0 }))
    .filter((x) => x.share >= MIN_SHARE)
    .sort((a, b) => b.share - a.share);
  return { inks, k: inks.length, asked: k, dropped: cen.length - inks.length };
}

/**
 * One coverage field per ink, ready for rasterToRings.
 *
 * Membership is inverse-distance so the contour between two inks lands where
 * the colours actually meet, not on a pixel edge; multiplied by alpha so the
 * outer edge keeps the sub-pixel softness the single-colour path already had.
 */
export function inkFields(data, w, h, inks) {
  const n = inks.length;
  const out = Array.from({ length: n }, () => new Float32Array(w * h));
  if (!n) return out;
  const inv = new Float64Array(n);
  for (let p = 0, i = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3] / 255;
    if (a <= 0) continue;
    const c = [data[i], data[i + 1], data[i + 2]];
    let sum = 0, exact = -1;
    for (let j = 0; j < n; j++) {
      const d = d2(c, inks[j].rgb);
      if (d < 1) { exact = j; break; }          // sitting on a centre
      inv[j] = 1 / d;
      sum += inv[j];
    }
    if (exact >= 0) { out[exact][p] = a; continue; }
    for (let j = 0; j < n; j++) out[j][p] = a * (inv[j] / sum);
  }
  return out;
}
