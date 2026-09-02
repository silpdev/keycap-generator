// Splitting a logo by ink colour has to be boringly reliable: you drop the same
// file in twice and print the result, so the same file must give the same
// colours, the same number of them, and geometry that still lines up.
import fs from 'fs';
import { inkColours, inkFields } from '../src/palette.mjs';
import { rasterToRings } from '../src/vectorize.mjs';
import { PRESETS, buildKeycap, exportKeycap3mf, inkGroups, logoFit, applyFit } from '../src/build.mjs';
import { strokeWidths } from '../src/stroke.mjs';

let fail = 0;
const chk = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'ok  ' : 'LOI '} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) fail++;
};

/** Paint a synthetic two-ink mark: a red bar and a navy bar on transparency. */
function synth(w, h, cols) {
  const d = new Uint8ClampedArray(w * h * 4);
  cols.forEach(([rgb, y0, y1], i) => {
    for (let y = y0; y < y1; y++) for (let x = 2; x < w - 2; x++) {
      const p = (y * w + x) * 4;
      d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = 255;
    }
  });
  return d;
}

// ------------------------------------------------------------ known colours
console.log('--- tach mau tu anh biet truoc ---');
{
  const RED = [226, 32, 32], NAVY = [17, 24, 39];
  const w = 80, h = 60;
  const d = synth(w, h, [[RED, 5, 25], [NAVY, 35, 55]]);
  const { inks } = inkColours(d, 2);
  chk('tim dung 2 mau', inks.length === 2, inks.map((x) => x.hex).join(' '));
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const got = inks.map((x) => x.rgb);
  chk('mau khop voi mau ve vao', Math.min(near(got[0], RED), near(got[1], RED)) < 3 &&
      Math.min(near(got[0], NAVY), near(got[1], NAVY)) < 3,
      inks.map((x) => x.hex + ' ' + (x.share * 100).toFixed(0) + '%').join('  '));
  chk('ty le dien tich dung', Math.abs(inks[0].share - 0.5) < 0.02,
      inks.map((x) => (x.share * 100).toFixed(1) + '%').join(' / '));

  // the fields must be disjoint where the colour is flat, and cover everything
  const f = inkFields(d, w, h, inks);
  let both = 0, neither = 0, opaque = 0;
  for (let p = 0; p < w * h; p++) {
    if (d[p * 4 + 3] < 128) continue;
    opaque++;
    const a = f[0][p] > 0.5, b = f[1][p] > 0.5;
    if (a && b) both++;
    if (!a && !b) neither++;
  }
  chk('khong pixel nao thuoc 2 muc', both === 0, `${both} pixel`);
  chk('khong pixel nao bi bo roi', neither === 0, `${neither}/${opaque} pixel`);
}

// --------------------------------------------------------------- stability
console.log('\n--- on dinh va deterministic ---');
{
  const d = synth(60, 60, [[[200, 30, 30], 4, 28], [[20, 30, 50], 32, 56]]);
  const a = JSON.stringify(inkColours(d, 2).inks);
  const b = JSON.stringify(inkColours(d, 2).inks);
  chk('goi 2 lan ra y het', a === b);
  // asking for more inks than the artwork has must not invent them
  const three = inkColours(d, 3);
  chk('xin 3 mau tren anh 2 mau -> chi 2', three.k === 2,
      `k=${three.k}, bo ${three.dropped} nhom`);
  const one = inkColours(d, 1);
  chk('xin 1 mau -> 1 mau', one.k === 1, one.inks.map((x) => x.hex).join());
}

// ------------------------------------------------------ the real brand mark
console.log('\n--- logo that (VNG Games) ---');
const real = fs.existsSync('./assets/logo-rgba-fixture.json')
  ? JSON.parse(fs.readFileSync('./assets/logo-rgba-fixture.json', 'utf8')) : null;
if (!real) {
  console.log('  (bo qua: khong co assets/logo-rgba-fixture.json)');
} else {
  const data = Uint8ClampedArray.from(real.data);
  const { inks } = inkColours(data, 2);
  chk('2 mau muc', inks.length === 2,
      inks.map((x) => `${x.hex} ${(x.share * 100).toFixed(1)}%`).join('  '));
  chk('mot do mot xanh tham', inks.some((x) => x.rgb[0] > 150 && x.rgb[1] < 90) &&
      inks.some((x) => x.rgb[0] < 90 && x.rgb[2] < 110), inks.map((x) => x.hex).join(' '));

  const fields = inkFields(data, real.w, real.h, inks);
  const groups = fields.map((f) => rasterToRings(f, real.w, real.h,
    { pxPerMM: 1, tolPx: 0.35, minArea: 24, iso: 0.5 })).filter((g) => g.length);
  chk('moi muc ra it nhat 1 vung', groups.length === 2,
      groups.map((g) => g.length + ' vung').join(' | '));

  // one shared fit: the two colours must stay registered with each other
  const P = { ...PRESETS.mx1u, logoMode: 'raised', logoSize: 13, logoRot: 0,
              logoDx: 0, logoDy: 0, capColor: '#FFFFFF',
              inkColors: inks.map((x) => x.hex) };
  const fit = logoFit(groups.flat(), P);
  const placed = groups.map((g) => applyFit(g, fit));
  const bb = (rs) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rs) for (const q of r.outer) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
      y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    return { x0, y0, x1, y1 };
  };
  const all = bb(placed.flat());
  chk('ca logo dung co logoSize', Math.abs(Math.max(all.x1 - all.x0, all.y1 - all.y0) - P.logoSize) < 0.02,
      `${(all.x1 - all.x0).toFixed(2)} × ${(all.y1 - all.y0).toFixed(2)} mm`);
  // scaling each ink on its own would make every group fill logoSize — the bug
  // this guards is exactly that
  const each = placed.map((g) => bb(g));
  chk('tung muc KHONG bi keo day khung', each.some((b) =>
      Math.max(b.x1 - b.x0, b.y1 - b.y0) < P.logoSize - 0.5),
      each.map((b) => `${(b.x1 - b.x0).toFixed(1)}×${(b.y1 - b.y0).toFixed(1)}`).join(' | '));

  // parts and filament slots
  for (const mode of ['raised', 'recessed']) {
    const { parts, info } = buildKeycap({ ...P, logoMode: mode }, groups);
    const ex = parts.filter((x) => x.subtype === 'normal_part').map((x) => x.extruder);
    chk(`${mode}: extruder 1,1,2,3`, JSON.stringify(ex) === '[1,1,2,3]' && info.inks === 2,
        `[${ex.join(',')}] inks=${info.inks}`);
    const negs = parts.filter((x) => x.subtype === 'negative_part');
    chk(`${mode}: ${mode === 'raised' ? 'khong' : 'mot'} part tru`,
        negs.length === (mode === 'raised' ? 0 : 1), `${negs.length} part tru`);
  }
  {
    const mf = exportKeycap3mf({ ...P, name: 'x' }, groups, 1, 256);
    const txt = Buffer.from(mf).toString('latin1');
    const m = /"filament_colour": \[([^\]]*)\]/.exec(txt);
    const cols = m ? m[1].match(/#[0-9a-fA-F]{6}/g) : null;
    chk('3mf khai bao 3 filament dung mau', !!cols && cols.length === 3 &&
        cols[0] === '#FFFFFF' && cols.slice(1).join() === inks.map((x) => x.hex).join(),
        cols ? cols.join(' ') : 'khong thay filament_colour');
  }
  // each ink has to clear the nozzle on its own
  placed.forEach((g, i) => {
    const w = strokeWidths(g).min;
    chk(`muc ${i + 1} du net o logo 13 mm`, w >= 0.84, `${w.toFixed(2)} mm`);
  });
}

// ------------------------------------------------- the old shape still works
console.log('\n--- tuong thich nguoc ---');
{
  const logo = JSON.parse(fs.readFileSync('./assets/sample-logo.json', 'utf8'));
  chk('rings phang = 1 nhom', inkGroups(logo).length === 1);
  chk('rings long nhau = n nhom', inkGroups([logo, logo]).length === 2);
  chk('rong = 0 nhom', inkGroups([]).length === 0 && inkGroups(null).length === 0);
  const P = { ...PRESETS.clicker22, logoRot: 0, logoDx: 0, logoDy: 0 };
  const flat = buildKeycap(P, logo).parts.filter((x) => x.subtype === 'normal_part');
  const nested = buildKeycap(P, [logo]).parts.filter((x) => x.subtype === 'normal_part');
  chk('rings phang va [rings] ra y het',
      flat.length === nested.length &&
      flat.every((p, i) => p.mesh.F.length === nested[i].mesh.F.length &&
                           p.extruder === nested[i].extruder),
      `${flat.length} part`);
  chk('1 muc thi part ten "Legend"', flat.some((x) => x.name === 'Legend'));
}

console.log(fail ? `\n${fail} LOI` : '\ntach mau: dung mau brand, deterministic, cac muc van khop nhau');
if (fail) process.exit(1);
