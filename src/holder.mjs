// ---------------------------------------------------------------------------
// Switch holder — a base you press a real MX switch into.
//
// Cherry's plate-mount spec is the same for every MX and MX clone: a 14 × 14 mm
// square cutout in a plate 1.5 ±0.1 mm thick, with two clips on the bottom
// housing that spring outward and latch under the plate.  Plate top to PCB top
// is 5 mm, so about 3.5 mm of housing hangs below a 1.5 mm plate, and the pins
// of a plate-mount switch add roughly 3 mm more.  Everything below the plate
// therefore needs to be empty.
//
// Printing decides the shape.  Modelled plate-down, the cutout lands in the
// first layer, the clearance well opens towards the nozzle, and the outer wall
// leans *outward* as it rises — which is the self-supporting direction — so the
// finished part has a wide, stable foot with no overhang anywhere and no
// support to dig out of the well.  Turn it over after printing and the plate is
// on top where the switch goes in.
// ---------------------------------------------------------------------------
import { roundedRect, buildPrism, Mesh } from './geom.mjs';
import { build3mf } from './export3mf.mjs';

export const MX = {
  cutout: 14.0,        // plate cutout, per Cherry's plate-mount spec
  plateT: 1.5,         // nominal plate thickness the clips are cut for
  housing: 15.6,       // top housing footprint, sits on the plate
  belowPlate: 3.5,     // bottom housing below a 1.5 mm plate (5 mm from plate top)
  pins: 3.0,           // plate-mount pins below that
};

export const HOLDER_DEFAULTS = {
  count: 1,
  pitch: 19.05,        // standard keyboard spacing; irrelevant when count is 1
  // 14.0 nominal + 0.15: an FDM hole comes out undersize, and a cutout that is
  // 0.1 mm tight will not take the switch at all.
  cut: 14.15,
  plateT: 1.5,
  well: 16.4,          // clearance under the plate — the clips spring outward
  wellH: 9.0,          // deep enough for housing + pins with room to spare
  bodyW: 21.0,         // plate footprint per cell
  footGrow: 7.0,       // how much wider the foot is than the plate, total
  cornerR: 2.0,
};

/** Square cutout ring, centred at (cx, 0), with a small corner radius. */
const cell = (size, cx, r = 0.4) =>
  ({ outer: roundedRect(size, size, r, 3).map((p) => [p[0] + cx, p[1]]), holes: [] });

/** Centres of the cells along x, the row centred on the origin. */
export function cellCentres(p = {}) {
  const o = { ...HOLDER_DEFAULTS, ...p };
  const n = Math.max(1, Math.min(12, Math.round(o.count)));
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * o.pitch);
}

export function holderSize(p = {}) {
  const o = { ...HOLDER_DEFAULTS, ...p };
  const c = cellCentres(o);
  const span = c.length > 1 ? c[c.length - 1] - c[0] : 0;
  return { W: span + o.bodyW, D: o.bodyW, H: o.plateT + o.wellH, cells: c };
}

/**
 * The solid body: plate footprint at z=0 growing to the foot at the top of the
 * print.  Leaning outward at ~25° from vertical, so every layer is supported by
 * the one below it.
 */
function buildBody(p) {
  const o = { ...HOLDER_DEFAULTS, ...p };
  const { W, D, H } = holderSize(o);
  const m = new Mesh();
  const lo = roundedRect(W, D, o.cornerR, 8);
  const hi = roundedRect(W + o.footGrow, D + o.footGrow, o.cornerR + o.footGrow / 2, 8);
  const rLo = m.ring(lo, 0), rHi = m.ring(hi, H);
  m.loft(rLo, rHi, true);
  m.face(lo, [], 0, false);
  m.face(hi, [], H, true);
  return m;
}

/** { parts, info } in the same shape buildKeycap returns. */
export function buildHolder(p = {}) {
  const o = { ...HOLDER_DEFAULTS, ...p };
  const { H, cells } = holderSize(o);

  const cuts = buildPrism(cells.map((cx) => cell(o.cut, cx)), -0.3, o.plateT).weld();
  const wells = buildPrism(cells.map((cx) => cell(o.well, cx, 0.8)), o.plateT, H + 0.3).weld();

  return {
    parts: [
      { name: `Holder ${cells.length}x`, mesh: buildBody(o).weld(), extruder: 1, subtype: 'normal_part' },
      { name: 'Switch cutouts', mesh: cuts, subtype: 'negative_part' },
      { name: 'Clip clearance', mesh: wells, subtype: 'negative_part' },
    ],
    info: holderInfo(o),
  };
}

/**
 * The numbers worth checking before spending filament.  `warn` entries are the
 * ones that mean the switch will not go in, or will not stay in.
 */
export function holderInfo(p = {}) {
  const o = { ...HOLDER_DEFAULTS, ...p };
  const { W, D, H, cells } = holderSize(o);
  const clr = o.cut - MX.cutout;
  const ledge = (o.well - o.cut) / 2;          // how much plate the clips grab
  const wall = (o.bodyW - o.well) / 2;         // wall left beside the well
  const under = o.wellH;                        // free depth below the plate
  const need = MX.belowPlate + MX.pins;
  const seat = (o.bodyW - o.cut) / 2;          // plate ledge the housing rests on
  const gap = cells.length > 1 ? o.pitch - o.well : Infinity;

  const warn = [];
  if (clr < 0.05) warn.push(`cutout ${o.cut.toFixed(2)} mm chỉ hơn chuẩn ${clr.toFixed(2)} mm — lỗ in ra sẽ co lại và switch không vào được`);
  if (clr > 0.45) warn.push(`cutout ${o.cut.toFixed(2)} mm rộng hơn chuẩn ${clr.toFixed(2)} mm — ngàm không bám, switch rơi ra`);
  if (o.plateT < 1.2 || o.plateT > 1.8) warn.push(`tấm dày ${o.plateT.toFixed(2)} mm — ngàm MX cắt cho 1.5 ±0.1 mm, ngoài 1.2–1.8 là không kẹp`);
  if (ledge < 0.6) warn.push(`gờ cho ngàm bám chỉ ${ledge.toFixed(2)} mm — nới "hốc dưới tấm" rộng ra`);
  if (wall < 1.2) warn.push(`thành cạnh hốc còn ${wall.toFixed(2)} mm — mỏng, đẩy cap mạnh là nứt`);
  if (under < need) warn.push(`dưới tấm chỉ trống ${under.toFixed(1)} mm, switch cần ${need.toFixed(1)} mm (vỏ dưới + chân) — đế sẽ chặn switch`);
  if (seat < 1.2) warn.push(`gờ đỡ vỏ switch còn ${seat.toFixed(2)} mm — vỏ trên 15.6 mm gần như không có chỗ tựa`);
  if (gap < 1.0) warn.push(`hai hốc kề nhau chỉ cách ${gap.toFixed(2)} mm — giảm "hốc dưới tấm" hoặc tăng pitch`);

  return { W, D, H, n: cells.length, clr, ledge, wall, under, need, seat, gap, warn };
}

export function exportHolder3mf(p = {}, plate = 256) {
  const { parts } = buildHolder(p);
  return build3mf({
    parts,
    copies: [{ x: plate / 2, y: plate / 2 }],
    title: 'De giu switch MX',
    filaments: null,
  });
}
