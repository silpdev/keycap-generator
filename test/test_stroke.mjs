// A two-colour legend fails silently: the mesh is perfect, the slicer says
// nothing, and the thin strokes come out in the cap's colour.  The only defence
// is measuring the stroke width before printing, so that measurement had better
// be right.
//
// The fixture is the real thing that failed — a two-tier wordmark sectioned out
// of a 3MF this tool exported, whose lower line printed with no colour at all —
// and the expected widths are shapely's exact max-inscribed-circle diameters,
// computed independently of the code under test.
import fs from 'fs';
import { strokeWidths, legendPrintability } from '../src/stroke.mjs';

const fx = JSON.parse(fs.readFileSync('./assets/stroke-fixture.json', 'utf8'));

let fail = 0;
const chk = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'ok  ' : 'LOI '} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) fail++;
};

// ------------------------------------------------- against exact geometry
console.log('--- do lai net, so voi shapely ---');
{
  const t0 = Date.now();
  const r = strokeWidths(fx.rings);
  const ms = Date.now() - t0;
  const got = r.widths.map((x) => x.w).sort((a, b) => b - a);
  chk('dung so vung', r.regions === fx.gt.length, `${r.regions} vs ${fx.gt.length}`);
  let worst = 0, worstPct = 0;
  for (let i = 0; i < fx.gt.length; i++) {
    worst = Math.max(worst, Math.abs(got[i] - fx.gt[i]));
    worstPct = Math.max(worstPct, Math.abs(got[i] - fx.gt[i]) / fx.gt[i] * 100);
  }
  console.log(`  do duoc: ${got.map((v) => v.toFixed(3)).join(' ')}`);
  console.log(`  shapely: ${fx.gt.map((v) => v.toFixed(3)).join(' ')}`);
  // one raster pitch is the honest tolerance for a distance transform
  chk('sai so trong mot buoc raster', worst <= r.px * 1.05,
      `lech lon nhat ${worst.toFixed(4)} mm (${worstPct.toFixed(1)}%), buoc raster ${r.px} mm`);
  chk('chay du nhanh de goi lai duoc', ms < 400, `${ms} ms`);
}

// ------------------------------------------------------- known-good shapes
// A bar of width w must measure w, and a disc of diameter d must measure d —
// these are the two cases where the answer is not open to interpretation.
console.log('\n--- hinh biet truoc dap an ---');
for (const w of [0.4, 0.85, 2.0, 5.0]) {
  const bar = [{ outer: [[-6, -w / 2], [6, -w / 2], [6, w / 2], [-6, w / 2]], holes: [] }];
  const got = strokeWidths(bar).min;
  chk(`thanh ngang rong ${w}`, Math.abs(got - w) <= 0.012, `do duoc ${got.toFixed(3)}`);
}
// A disc's widest point is its centre, which need not land on a pixel centre, so
// the tolerance here is a pitch and a half rather than one.
for (const d of [0.5, 3.0]) {
  const disc = [{ outer: Array.from({ length: 180 }, (_, i) => {
    const a = (2 * Math.PI * i) / 180;
    return [(d / 2) * Math.cos(a), (d / 2) * Math.sin(a)];
  }), holes: [] }];
  const got = strokeWidths(disc).min;
  chk(`dia ⌀${d}`, Math.abs(got - d) <= 0.02, `do duoc ${got.toFixed(3)}`);
}
{
  // a ring: the width is the wall, not the outer diameter
  const ring = (r, n = 180) => Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  const donut = [{ outer: ring(5), holes: [ring(4).reverse()] }];
  const got = strokeWidths(donut).min;
  chk('vanh khuyen thanh 1.0', Math.abs(got - 1.0) <= 0.02, `do duoc ${got.toFixed(3)}`);
}
{
  // two bars that do not touch must come back as two regions, not one
  const bar = (dy) => ({ outer: [[-4, dy - 0.4], [4, dy - 0.4], [4, dy + 0.4], [-4, dy + 0.4]], holes: [] });
  const r = strokeWidths([bar(-3), bar(3)]);
  chk('hai thanh roi nhau = 2 vung', r.regions === 2, `${r.regions} vung`);
}

// ------------------------------------------------------------- the verdict
console.log('\n--- ket luan in duoc hay khong ---');
{
  const v = legendPrintability(fx.rings, { line: 0.42, logoSize: 10.0 });
  chk('bat duoc cac vung mat mau', v.lost >= 3,
      `${v.lost} vung duoi 1 duong dun, ${v.risky} vung duoi 2`);
  chk('net nho nhat khop shapely', Math.abs(v.min - Math.min(...fx.gt)) <= 0.012,
      `${v.min.toFixed(3)} vs ${Math.min(...fx.gt).toFixed(3)}`);
  // widths scale linearly with the logo, so the suggested size must hit the target
  const scaled = fx.rings.map((r) => ({
    outer: r.outer.map((p) => [p[0] * v.sizeFor / 10, p[1] * v.sizeFor / 10]),
    holes: r.holes.map((h) => h.map((p) => [p[0] * v.sizeFor / 10, p[1] * v.sizeFor / 10])),
  }));
  const after = strokeWidths(scaled).min;
  chk('co logo goi y thi that su du net', after >= v.need,
      `goi y ${v.sizeFor.toFixed(1)} mm -> net ${after.toFixed(3)} mm, can ${v.need.toFixed(2)}`);

  // a 0.6 nozzle needs a bigger logo than a 0.4 — the advice must track the nozzle
  const v6 = legendPrintability(fx.rings, { line: 0.62, logoSize: 10.0 });
  chk('doi dau phun thi doi ket luan', v6.sizeFor > v.sizeFor,
      `0.42 -> ${v.sizeFor.toFixed(1)} mm, 0.62 -> ${v6.sizeFor.toFixed(1)} mm`);
}
{
  // the bundled sample must not itself trip the warning at a sane size
  const { PRESETS, placeLogo } = await import('../src/build.mjs');
  const logo = JSON.parse(fs.readFileSync('./assets/sample-logo.json', 'utf8'));
  const p = { ...PRESETS.clicker22, logoRot: 0, logoDx: 0, logoDy: 0 };
  const v = legendPrintability(placeLogo(logo, p), { line: 0.42, logoSize: p.logoSize });
  chk('hinh mau di kem khong bi bao dong', v.lost === 0 && v.risky === 0,
      `net nho nhat ${v.min.toFixed(2)} mm o co ${p.logoSize} mm`);
}
{
  chk('khong co logo thi khong ket luan', legendPrintability([], {}) === null);
}

console.log(fail ? `\n${fail} LOI` : '\ndo net logo: khop hinh hoc chinh xac, bat duoc ca ca that da in loi');
if (fail) process.exit(1);
