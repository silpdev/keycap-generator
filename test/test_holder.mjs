// The holder either takes a real switch or it is landfill, and the only numbers
// that decide that are the cutout, the plate thickness and the free depth below
// the plate.  So measure all three back out of the finished mesh rather than
// trusting the parameters that went in, and check the print orientation really
// is overhang-free.
import { buildHolder, holderInfo, holderSize, cellCentres, exportHolder3mf,
         HOLDER_DEFAULTS, MX } from '../src/holder.mjs';

function audit(mesh) {
  const e = new Map();
  let repeated = 0;
  for (const f of mesh.F) {
    if (f[0] === f[1] || f[1] === f[2] || f[0] === f[2]) repeated++;
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      e.set(k, (e.get(k) || 0) + 1);
    }
  }
  let open = 0, over = 0;
  for (const v of e.values()) { if (v === 1) open++; else if (v > 2) over++; }
  let vol = 0;
  for (const f of mesh.F) {
    const a = mesh.V[f[0]], b = mesh.V[f[1]], c = mesh.V[f[2]];
    vol += (a[0] * (b[1] * c[2] - c[1] * b[2])
          - a[1] * (b[0] * c[2] - c[0] * b[2])
          + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  return { open, over, repeated, vol };
}

/** Extent of the vertices of one part within a z slice, per axis. */
function extent(mesh, z0, z1) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const v of mesh.V) {
    if (v[2] < z0 - 1e-6 || v[2] > z1 + 1e-6) continue;
    x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]);
    y0 = Math.min(y0, v[1]); y1 = Math.max(y1, v[1]);
  }
  return { w: x1 - x0, d: y1 - y0, x0, x1 };
}

let fail = 0;
const chk = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'ok  ' : 'LOI '} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) fail++;
};

// -------------------------------------------------------- the default holder
console.log('--- de 1 switch (mac dinh) ---');
{
  const h = buildHolder();
  const o = HOLDER_DEFAULTS;
  const cut = h.parts.find((p) => p.name === 'Switch cutouts').mesh;
  const well = h.parts.find((p) => p.name === 'Clip clearance').mesh;
  const body = h.parts.find((p) => p.name.startsWith('Holder')).mesh;
  const { H } = holderSize();

  // The cutout is what the switch actually passes through: measure it, and
  // measure how tall the cutout stays that size — that is the plate thickness
  // the clips see.
  const cutXY = extent(cut, 0, o.plateT);
  const cutZ = cut.bounds;
  chk('cutout do lai', Math.abs(cutXY.w - o.cut) < 1e-6 && Math.abs(cutXY.d - o.cut) < 1e-6,
      `${cutXY.w.toFixed(3)} × ${cutXY.d.toFixed(3)} mm (chuan MX ${MX.cutout})`);
  chk('cutout xuyen het tam', Math.abs(cutZ.hi[2] - o.plateT) < 1e-6 && cutZ.lo[2] < 0,
      `z ${cutZ.lo[2].toFixed(2)}..${cutZ.hi[2].toFixed(2)} vs tam day ${o.plateT}`);

  const wellXY = extent(well, o.plateT, H);
  const wellZ = well.bounds;
  chk('hoc duoi tam rong hon cutout', wellXY.w > cutXY.w + 1.2,
      `${wellXY.w.toFixed(2)} mm, go cho ngam bam ${((wellXY.w - cutXY.w) / 2).toFixed(2)} mm moi ben`);
  chk('hoc bat dau ngay duoi tam', Math.abs(wellZ.lo[2] - o.plateT) < 1e-6,
      `z ${wellZ.lo[2].toFixed(2)}`);

  // Does a real switch physically fit?
  const free = H - o.plateT;
  chk('du sau cho vo duoi + chan switch', free >= MX.belowPlate + MX.pins,
      `trong ${free.toFixed(1)} mm, switch can ${(MX.belowPlate + MX.pins).toFixed(1)} mm`);
  const seat = (o.bodyW - o.cut) / 2;
  chk('go do vo tren 15.6 mm', o.bodyW >= MX.housing && seat >= 1.2,
      `de ${o.bodyW} mm, go ${seat.toFixed(2)} mm moi ben`);

  // Print orientation: the body must never get narrower as z rises, or the foot
  // taper is pointing the wrong way and the whole thing needs support.
  const bot = extent(body, 0, 0.01), top = extent(body, H - 0.01, H);
  chk('vo ngoai loe ra khi len cao (tu do)', top.w > bot.w && top.d > bot.d,
      `${bot.w.toFixed(1)} mm o tam -> ${top.w.toFixed(1)} mm o chan de`);
  const lean = Math.atan2((top.w - bot.w) / 2, H) * 180 / Math.PI;
  chk('do nghieng thanh trong khoang in duoc', lean > 0 && lean < 50, `${lean.toFixed(1)}° so voi thang dung`);

  for (const pt of h.parts) {
    const a = audit(pt.mesh);
    chk(`kin khoi: ${pt.name}`, !a.open && !a.over && !a.repeated && a.vol > 0,
        `ho=${a.open} >2=${a.over} lap=${a.repeated} vol=${a.vol.toFixed(1)}`);
  }
  console.log(`  kich thuoc: ${holderSize().W.toFixed(1)} × ${holderSize().D.toFixed(1)} × ${H.toFixed(1)} mm`);
}

// ---------------------------------------------------------------- multi-cell
console.log('\n--- nhieu switch ---');
for (const [n, pitch] of [[2, 19.05], [5, 19.05], [5, 18.0]]) {
  const info = holderInfo({ count: n, pitch });
  const c = cellCentres({ count: n, pitch });
  const spacing = c.length > 1 ? +(c[1] - c[0]).toFixed(3) : 0;
  const h = buildHolder({ count: n, pitch });
  let bad = info.warn.length > 0;
  for (const pt of h.parts) {
    const a = audit(pt.mesh);
    if (a.open || a.over || a.repeated || a.vol <= 0) bad = true;
  }
  chk(`${n} switch @ ${pitch}`, !bad,
      `${info.W.toFixed(1)} × ${info.D.toFixed(1)} mm, buoc ${spacing}, ho cach nhau ${info.gap.toFixed(2)} mm` +
      (info.warn.length ? ' | ' + info.warn.join(' | ') : ''));
}

// ------------------------------------------------------- the checks must bite
console.log('\n--- canh bao phai bat duoc loi ---');
const cases = [
  ['cutout dung sat chuan 14.00', { cut: 14.0 }, /không vào được/],
  ['cutout rong 14.8', { cut: 14.8 }, /rơi ra/],
  ['tam day 2.5 mm', { plateT: 2.5 }, /không kẹp/],
  ['hoc duoi tam chi sau 4 mm', { wellH: 4.0 }, /chặn switch/],
  ['hoc rong 20 mm trong de 21', { well: 20.0 }, /mỏng/],
  ['5 switch @ pitch 16.5', { count: 5, pitch: 16.5 }, /cách/],
];
for (const [label, over, re] of cases) {
  const w = holderInfo(over).warn;
  chk(label, w.some((s) => re.test(s)), w.join(' | ') || 'khong canh bao gi');
}
chk('mac dinh thi khong canh bao', holderInfo().warn.length === 0, holderInfo().warn.join(' | '));

// ------------------------------------------------------------------ the file
console.log('\n--- file xuat ---');
const mf = exportHolder3mf();
const txt = Buffer.from(mf).toString('latin1');
chk('3mf hop le', txt.startsWith('PK') && txt.includes('model_settings.config'),
    `${(mf.length / 1024).toFixed(1)} KB`);
chk('2 part tru + 1 part cong',
    (txt.match(/subtype="negative_part"/g) || []).length === 2 &&
    (txt.match(/subtype="normal_part"/g) || []).length === 1);
chk('mot object tren khay', (txt.match(/<item objectid=/g) || []).length === 1);

console.log(fail ? `\n${fail} LOI` : '\nde giu switch: dung chuan MX plate-mount, in khong can support');
if (fail) process.exit(1);
