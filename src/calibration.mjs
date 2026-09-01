// ---------------------------------------------------------------------------
// Stem-slot calibration plate.
//
// The one number that decides whether a printed cap fits is the cross slot
// width, and it cannot be derived: it depends on the filament, the nozzle, the
// flow calibration and how the slicer rounds a 1.3 mm feature.  So instead of
// guessing, print a strip of small pieces whose slots step through a range,
// push each onto a real switch, and read the winner off the engraved number.
//
// Every piece is built from the very same buildCapShell + buildStem the
// generator uses for a real cap, so what the strip measures is what the cap
// will do — no separate test geometry to drift out of sync.
// ---------------------------------------------------------------------------
import { buildCapShell, buildStem, buildPrism, Mesh } from './geom.mjs';
import { build3mf, buildStl } from './export3mf.mjs';

// ------------------------------------------------------- seven-segment digits
// A bundled font would be the obvious way to letter these, and the wrong one:
// it is a dependency, and glyph outlines at 3 mm come out as unprintable hair.
// Seven bars per digit read cleanly at any size and cost forty lines.
//        a
//      f   b
//        g
//      e   c
//        d
const SEG = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

/**
 * Rings for one digit in a box (0,0)..(w,h), as separate non-touching bars.
 * The gap matters: bars that met would weld into a non-manifold edge, and each
 * ring has to stay a closed loop of its own for the prism to be watertight.
 */
export function digitRings(ch, w, h, t) {
  const on = SEG[ch];
  if (!on) return [];
  const g = t * 0.28;                       // visual gap between bars
  const mid = h / 2;
  const hx0 = t + g, hx1 = w - t - g;       // horizontal bars stop short of the posts
  const box = (x0, y0, x1, y1) => ({
    outer: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], holes: [],
  });
  const out = [];
  if (on.includes('a')) out.push(box(hx0, h - t, hx1, h));
  if (on.includes('g')) out.push(box(hx0, mid - t / 2, hx1, mid + t / 2));
  if (on.includes('d')) out.push(box(hx0, 0, hx1, t));
  if (on.includes('f')) out.push(box(0, mid + t / 2 + g, t, h - t - g));
  if (on.includes('b')) out.push(box(w - t, mid + t / 2 + g, w, h - t - g));
  if (on.includes('e')) out.push(box(0, t + g, t, mid - t / 2 - g));
  if (on.includes('c')) out.push(box(w - t, t + g, w, mid - t / 2 - g));

  // '1' is only the two right-hand posts, so on a monospaced advance it hangs off
  // to the right and "410" reads as "4 10".  Slide it into the middle of its cell.
  if (ch === '1') {
    const dx = -(w - t) / 2;
    return out.map((r) => ({ outer: r.outer.map((q) => [q[0] + dx, q[1]]), holes: [] }));
  }
  return out;
}

/** Rings for a short digit string, centred on the origin. */
export function numberRings(text, h, t) {
  const w = h * 0.58;
  const adv = w + t * 1.5;
  const chars = [...String(text)];
  const total = chars.length * adv - t * 1.5;
  const out = [];
  chars.forEach((ch, i) => {
    const x = -total / 2 + i * adv;
    for (const r of digitRings(ch, w, h, t))
      out.push({
        outer: r.outer.map((q) => [q[0] + x, q[1] - h / 2]),
        holes: [],
      });
  });
  return out;
}

// ------------------------------------------------------------- one test piece
export const CAL_DEFAULTS = {
  from: 4.05, to: 4.35, step: 0.05,
  stemArm: 1.36, stemSlotDepth: 4.5, stemDia: 5.6, leadIn: 0.15, leadInH: 0.6,
  pieceW: 15.0, cavityH: 6.4, roof: 1.6, wall: 1.6, cornerR: 1.5,
  // A seven-segment digit only reads as a digit when the bars are three to four
  // times longer than they are thick: at h/6 the bars come out square and the
  // number turns into a scatter of dots.  h/10 with the width at 0.58h is the
  // classic proportion, and a 0.62 mm engraved channel still prints cleanly
  // through a 0.4 mm nozzle because it is a gap in solid material, not a wall.
  digitH: 6.0, digitT: 0.62, digitDepth: 0.6,
};

/**
 * One calibration piece: a squat straight-sided cap carrying the real stem, with
 * the slot width engraved in hundredths of a millimetre on the closed face.
 * "425" means a 4.25 mm slot.  Returns { parts } in the same shape buildKeycap
 * returns, so the exporter and the orientation code need no special case.
 */
export function calShell(o = {}) {
  const p = { ...CAL_DEFAULTS, ...o };
  return buildCapShell({
    capW: p.pieceW, capD: p.pieceW, topW: p.pieceW, topD: p.pieceW,
    capH: p.cavityH + p.roof, cornerR: p.cornerR, wall: p.wall,
    cavityH: p.cavityH, cornerSeg: 8,
  }).weld();
}

export function buildCalPiece(span, o = {}, sharedShell = null) {
  const p = { ...CAL_DEFAULTS, ...o };
  const capH = p.cavityH + p.roof;
  const stemTop = Math.max(p.stemSlotDepth, p.cavityH) + 0.3;
  // Every piece has the same body; only the slot and the number differ.  Passing
  // one shell in lets the 3MF store that mesh once instead of seven times.
  const cap = sharedShell || calShell(p);
  const stem = buildStem({ ...p, stemSpan: span, stemTop }).weld();

  const label = String(Math.round(span * 100));
  const rings = numberRings(label, p.digitH, p.digitT);
  const cut = buildPrism(rings, capH - p.digitDepth, capH + 0.3).weld();

  return {
    label, span, capH,
    parts: [
      { id: 1, name: `Piece ${label}`, mesh: cap, extruder: 1, subtype: 'normal_part' },
      { id: 2, name: `Stem ${span.toFixed(2)}`, mesh: stem, extruder: 1, subtype: 'normal_part' },
      { id: 3, name: 'Number', mesh: cut, subtype: 'negative_part' },
    ],
  };
}

/** Slot widths from..to inclusive, guarded against a silly step. */
export function calSpans(o = {}) {
  const p = { ...CAL_DEFAULTS, ...o };
  const step = Math.max(0.01, Math.abs(p.step));
  const n = Math.min(24, Math.max(1, Math.round((p.to - p.from) / step) + 1));
  return Array.from({ length: n }, (_, i) => +(p.from + i * step).toFixed(3));
}

/**
 * The whole plate as one 3MF.  Each piece is its own object so the slicer keeps
 * the pieces separate (and so a failed one can be deleted before slicing), laid
 * out in a row-major grid on the plate.
 *
 * Printed slot-up: the cavity and the slot open towards the nozzle, so nothing
 * bridges and no support is ever offered inside the slot — support in there is
 * exactly what would falsify the measurement.  The engraved number then lands
 * on the build plate, which is the crispest surface the printer has.
 */
export function exportCalibration3mf(o = {}, plate = 256) {
  const p = { ...CAL_DEFAULTS, ...o };
  const spans = calSpans(p);
  const objects = [];
  const pitch = p.pieceW + 3;
  const cols = Math.min(spans.length, Math.max(1, Math.floor((plate - 20) / pitch)));
  const rows = Math.ceil(spans.length / cols);
  const H = p.cavityH + p.roof;
  const shell = calShell(p);
  const shellDown = shell.flipped(H);         // one mesh, referenced by every piece

  spans.forEach((span, i) => {
    const piece = buildCalPiece(span, p, shell);
    const c = i % cols, r = Math.floor(i / cols);
    objects.push({
      name: `Khe ${span.toFixed(2)} mm`,
      parts: piece.parts.map((q) =>
        ({ ...q, mesh: q.mesh === shell ? shellDown : q.mesh.flipped(H) })),
      at: { x: plate / 2 + (c - (cols - 1) / 2) * pitch,
            y: plate / 2 + (r - (rows - 1) / 2) * pitch },
    });
  });
  return build3mf({ objects, title: 'Khay hieu chuan khe chan MX',
                    filaments: null });
}

export function exportCalibrationStl(o = {}) {
  const p = { ...CAL_DEFAULTS, ...o };
  const spans = calSpans(p);
  const meshes = [];
  const pitch = p.pieceW + 3;
  spans.forEach((span, i) => {
    const piece = buildCalPiece(span, p);
    const dx = (i - (spans.length - 1) / 2) * pitch;
    for (const q of piece.parts) {
      if (q.subtype !== 'normal_part') continue;
      const m = q.mesh.flipped(piece.capH);
      const t = new Mesh();
      t.V = m.V.map((v) => [v[0] + dx, v[1], v[2]]);
      t.F = m.F.map((f) => f.slice());
      meshes.push(t);
    }
  });
  return buildStl(meshes, 'calibration');
}
