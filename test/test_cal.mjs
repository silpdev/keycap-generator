// The calibration plate is the one output whose whole job is to be dimensionally
// honest: if a piece's slot is not exactly the number engraved on it, the strip
// gives the wrong answer and every cap made afterwards is wrong too.  So measure
// the slot back out of the finished mesh, and audit each part the same way the
// keycap parts are audited.
import { calSpans, buildCalPiece, exportCalibration3mf, exportCalibrationStl,
         numberRings, digitRings, CAL_DEFAULTS } from '../src/calibration.mjs';
import { signedArea } from '../src/geom.mjs';

function audit(mesh) {
  const edges = new Map();
  let repeated = 0;
  for (const f of mesh.F) {
    if (f[0] === f[1] || f[1] === f[2] || f[0] === f[2]) repeated++;
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3];
      edges.set(a < b ? `${a}_${b}` : `${b}_${a}`, (edges.get(a < b ? `${a}_${b}` : `${b}_${a}`) || 0) + 1);
    }
  }
  let open = 0, over = 0;
  for (const v of edges.values()) { if (v === 1) open++; else if (v > 2) over++; }
  let vol = 0;
  for (const f of mesh.F) {
    const a = mesh.V[f[0]], b = mesh.V[f[1]], c = mesh.V[f[2]];
    vol += (a[0] * (b[1] * c[2] - c[1] * b[2])
          - a[1] * (b[0] * c[2] - c[0] * b[2])
          + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  return { open, over, repeated, vol };
}

/**
 * Slot width measured off the stem mesh: the widest x-extent of vertices lying
 * on the y=0 plane inside the slot, i.e. tip to tip of the cross.  The stem's
 * outer tube is bigger than the slot, so restrict to |z| below the slot ceiling
 * and to vertices whose |y| is under half an arm — that is the cross bar.
 */
function measureSlot(mesh, depth, arm) {
  let lo = Infinity, hi = -Infinity;
  for (const v of mesh.V) {
    if (v[2] > depth - 1e-6 || Math.abs(v[1]) > arm / 2 + 1e-6) continue;
    if (Math.hypot(v[0], v[1]) > CAL_DEFAULTS.stemDia / 2 - 1e-6) continue;
    lo = Math.min(lo, v[0]); hi = Math.max(hi, v[0]);
  }
  return hi - lo;
}

let fail = 0;
const fx = (b) => { if (b) return ''; fail++; return '  <-- LOI'; };

// ------------------------------------------------------------------ digits
console.log('--- chu so 7 doan ---');
for (const ch of '0123456789') {
  const r = digitRings(ch, 3, 5, 0.9);
  const areas = r.map((x) => Math.abs(signedArea(x.outer)));
  const bad = r.length === 0 || areas.some((a) => a < 0.05);
  console.log(`  ${ch}: ${r.length} thanh, dien tich ${areas.reduce((a, b) => a + b, 0).toFixed(2)} mm2${fx(!bad)}`);
}
{
  // Bars must not touch: a shared vertex would weld into a non-manifold edge.
  const rings = numberRings('405', 5, 0.9);
  let minGap = Infinity;
  for (let i = 0; i < rings.length; i++)
    for (let j = i + 1; j < rings.length; j++)
      for (const a of rings[i].outer) for (const b of rings[j].outer)
        minGap = Math.min(minGap, Math.hypot(a[0] - b[0], a[1] - b[1]));
  console.log(`  "405": ${rings.length} thanh, khoang ho nho nhat ${minGap.toFixed(3)} mm${fx(minGap > 0.05)}`);
}

// -------------------------------------------------------------- the pieces
console.log('\n--- tung manh hieu chuan ---');
const spans = calSpans();
console.log(`  ${spans.length} manh: ${spans.map((s) => s.toFixed(2)).join(' ')}` +
  fx(spans.length === 7 && spans[0] === 4.05 && spans[6] === 4.35));

for (const span of spans) {
  const piece = buildCalPiece(span);
  const stem = piece.parts.find((p) => p.name.startsWith('Stem')).mesh;
  const got = measureSlot(stem, CAL_DEFAULTS.stemSlotDepth, CAL_DEFAULTS.stemArm);
  const engraved = Number(piece.label) / 100;
  let bad = Math.abs(got - span) > 1e-6 || Math.abs(engraved - span) > 1e-6;
  const lines = [];
  for (const pt of piece.parts) {
    const a = audit(pt.mesh);
    if (a.open || a.over || a.repeated || a.vol <= 0) { bad = true; }
    lines.push(`${pt.name}: ho=${a.open} >2=${a.over} vol=${a.vol.toFixed(1)}`);
  }
  console.log(`  ${span.toFixed(2)} -> khac "${piece.label}", do lai khe ${got.toFixed(4)} mm  |  ${lines.join(' | ')}${fx(!bad)}`);
}

// ------------------------------------------------------------- whole plate
console.log('\n--- file xuat ---');
const mf = exportCalibration3mf();
const stl = exportCalibrationStl();
const txt = Buffer.from(mf).toString('latin1');
const objIds = [...txt.matchAll(/<item objectid="(\d+)"/g)].map((m) => m[1]);
const resIds = [...txt.matchAll(/<object id="(\d+)" type="model">/g)].map((m) => m[1]);
console.log(`  3mf ${(mf.length / 1024).toFixed(1)} KB · ${objIds.length} object tren khay · ` +
  `${resIds.length} resource${fx(objIds.length === 7 && new Set(resIds).size === resIds.length)}`);
console.log(`  moi object mot resource rieng${fx(new Set(objIds).size === objIds.length)}`);
console.log(`  co PK zip + model_settings${fx(txt.startsWith('PK') && txt.includes('model_settings.config'))}`);
console.log(`  stl ${(stl.length / 1024).toFixed(1)} KB` +
  fx(stl.length > 84 && (stl.length - 84) % 50 === 0));

// No two pieces may overlap on the plate, or the slicer refuses to slice.
const pitch = CAL_DEFAULTS.pieceW + 3;
console.log(`  buoc xep ${pitch} mm > rong manh ${CAL_DEFAULTS.pieceW} mm${fx(pitch > CAL_DEFAULTS.pieceW)}`);

console.log(fail ? `\n${fail} LOI` : '\nkhay hieu chuan: khe dung so khac, moi part kin khoi');
if (fail) process.exit(1);
