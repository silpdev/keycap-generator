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
// Printing decides the orientation.  Modelled plate-down, the cutout lands in
// the first layer, the clip well opens towards the nozzle, and the walls are
// vertical — so nothing overhangs and there is no support to dig out of the
// well.  Turn it over after printing and the plate is on top where the switch
// goes in.
//
// The far end of the well is closed by a floor, which the slicer prints as one
// bridge across the cavity.  Leaving it open — as the first version did — makes
// the base a tube: the switch and its pins show through both faces, and on a
// keyring the pins catch on everything.  The floor costs one bridged layer and
// no support; support inside a sealed cavity is unremovable, so don't enable it.
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
  wellH: 7.5,          // deep enough for housing + pins with a little room
  // The back has to be closed.  Left open, the well cuts clean through and the
  // base is a tube: you see the switch and its pins from both faces, the pins
  // catch on things in a pocket, and it reads as unfinished.  0 = open frame,
  // which is still the right thing for a bench tester you want to poke wires into.
  floor: 1.2,
  // Optional hole through that floor.  A sealed box has no way to get the switch
  // out again — the clips are unreachable — so this leaves a way to push it out
  // with a rod.  Off by default: it puts the pins back within reach.
  floorHole: 0,
  bodyW: 21.0,         // plate footprint per cell
  // Straight sides by default.  A flared foot is steadier on a bench and looks
  // like a doorstop on a keyring; either way it is not a printing requirement —
  // a vertical wall is just as self-supporting as one leaning outward.
  footGrow: 0,         // how much wider the foot is than the plate, total
  cornerR: 2.0,
  // Keyring lug.  It has to be a tab sticking out, not a hole through the plate:
  // between the switch cutout and the rim there are only (bodyW - cut)/2 ≈ 3.4 mm
  // of plate, and 1.5 mm of PLA with a 3 mm hole in it is a hinge, not a lug.
  loop: true,
  loopOut: 7.0,        // how far past the body the tab reaches
  loopW: 8.0,          // tab width
  loopT: 3.0,          // tab thickness — twice the plate, and it prints flat
  loopHole: 3.2,       // ⌀ for a standard split ring
  loopEdge: 1.6,       // material left beyond the hole
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
  return { W: span + o.bodyW, D: o.bodyW,
           H: o.plateT + o.wellH + Math.max(0, o.floor), cells: c };
}

/**
 * The solid body: plate footprint at z=0, optionally widening towards the foot at
 * the top of the print.  It must never get *narrower* as z rises — that is the
 * direction that needs support — so footGrow is clamped at 0.
 */
function buildBody(p) {
  const o = { ...HOLDER_DEFAULTS, ...p };
  const { W, D, H } = holderSize(o);
  const grow = Math.max(0, o.footGrow);
  const m = new Mesh();
  const lo = roundedRect(W, D, o.cornerR, 8);
  const hi = roundedRect(W + grow, D + grow, o.cornerR + grow / 2, 8);
  const rLo = m.ring(lo, 0), rHi = m.ring(hi, H);
  m.loft(rLo, rHi, true);
  m.face(lo, [], 0, false);
  m.face(hi, [], H, true);
  return m;
}

/**
 * Where the keyring tab lives, in the model's own frame.  It hangs off +x at
 * plate level, overlapping 2 mm into the body so the union has something to hold
 * on to, and its outer end is a semicircle around the hole.
 */
export function loopGeom(p = {}) {
  const o = { ...HOLDER_DEFAULTS, ...p };
  const { W } = holderSize(o);
  const x0 = W / 2 - 2, x1 = W / 2 + o.loopOut;
  const len = x1 - x0;
  const hole = x1 - (o.loopHole / 2 + o.loopEdge);
  return { x0, x1, len, cx: (x0 + x1) / 2, hole, t: o.loopT, w: o.loopW };
}

function circle(d, cx, n = 32) {
  const r = d / 2;
  return { outer: Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), r * Math.sin(a)];
  }), holes: [] };
}

/** { parts, info } in the same shape buildKeycap returns. */
export function buildHolder(p = {}) {
  const o = { ...HOLDER_DEFAULTS, ...p };
  const { H, cells } = holderSize(o);

  const floor = Math.max(0, o.floor);
  const cuts = buildPrism(cells.map((cx) => cell(o.cut, cx)), -0.3, o.plateT).weld();
  // With a floor the well stops short of the top face; without one it runs past it
  // so the back stays open.
  const wells = buildPrism(cells.map((cx) => cell(o.well, cx, 0.8)),
    o.plateT, floor > 0 ? o.plateT + o.wellH : H + 0.3).weld();

  const parts = [
    { name: `Holder ${cells.length}x`, mesh: buildBody(o).weld(), extruder: 1, subtype: 'normal_part' },
    { name: 'Switch cutouts', mesh: cuts, subtype: 'negative_part' },
    { name: 'Clip clearance', mesh: wells, subtype: 'negative_part' },
  ];

  if (floor > 0 && o.floorHole > 0) {
    const holes = buildPrism(cells.map((cx) => circle(o.floorHole, cx, 40)),
      o.plateT + o.wellH - 0.3, H + 0.3).weld();
    parts.push({ name: 'Push-out holes', mesh: holes, subtype: 'negative_part' });
  }

  if (o.loop) {
    const g = loopGeom(o);
    const tab = buildPrism(
      [{ outer: roundedRect(g.len, g.w, Math.min(g.w / 2, g.len / 2) - 1e-4, 10)
          .map((q) => [q[0] + g.cx, q[1]]), holes: [] }], 0, g.t).weld();
    // The lug sits entirely clear of the switch cutout and the clip well, so its
    // hole cuts only the tab and the two cannot interfere.
    const eye = buildPrism([circle(o.loopHole, g.hole)], -0.3, g.t + 0.3).weld();
    parts.push({ name: 'Keyring tab', mesh: tab, extruder: 1, subtype: 'normal_part' });
    parts.push({ name: 'Keyring hole', mesh: eye, subtype: 'negative_part' });
  }

  return { parts, info: holderInfo(o) };
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

  const floor = Math.max(0, o.floor);
  if (floor > 0 && floor < 0.8)
    warn.push(`đáy dày ${floor.toFixed(2)} mm — dưới 0.8 mm thì lớp bắc cầu qua hốc không kín, đáy sẽ rỗ`);
  if (floor > 0 && o.floorHole > 0 && o.floorHole > o.well - 3)
    warn.push(`lỗ đẩy ⌀${o.floorHole.toFixed(1)} mm gần bằng cả hốc — đáy gần như không còn gì`);

  let loop = null;
  if (o.loop) {
    const g = loopGeom(o);
    const side = (o.loopW - o.loopHole) / 2;     // material each side of the hole
    // The body flares as it rises, so the wall is closest to the hole at the top
    // of the tab, not at the plate — measure it there.
    const wallAt = (W + Math.max(0, o.footGrow) * (o.loopT / H)) / 2;
    const clear = g.hole - o.loopHole / 2 - wallAt;
    loop = { out: o.loopOut, w: o.loopW, t: o.loopT, hole: o.loopHole,
             side, edge: o.loopEdge, reach: g.x1 - W / 2, clear };
    if (side < 1.6) warn.push(`hai bên lỗ móc chỉ còn ${side.toFixed(2)} mm — nới "bề tai" hoặc giảm đường kính lỗ`);
    if (o.loopEdge < 1.2) warn.push(`đầu tai sau lỗ chỉ còn ${o.loopEdge.toFixed(2)} mm — tai sẽ đứt ở đó`);
    if (o.loopT < 2.0) warn.push(`tai dày ${o.loopT.toFixed(1)} mm — dưới 2 mm là bẻ mấy lần sẽ gãy`);
    if (o.loopHole < 2.4) warn.push(`lỗ ⌀${o.loopHole.toFixed(1)} mm — khoen chìa khoá thường cần ⌀3 mm trở lên`);
    if (clear < 0.8) warn.push(`lỗ móc nằm sát thành đế (${clear.toFixed(2)} mm) — tăng "tai nhô ra"`);
  }

  return { W, D, H, n: cells.length, clr, ledge, wall, under, need, seat, gap,
           floor, floorHole: floor > 0 ? o.floorHole : 0, loop, warn };
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
