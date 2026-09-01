import fs from 'fs';
import { rasterToRings } from '../src/vectorize.mjs';
import { buildPrism, ringsBounds, signedArea } from '../src/geom.mjs';
import { buildStl } from '../src/export3mf.mjs';

// ---- rasterise a polygon set with 4x4 supersampled coverage (stand-in for canvas)
function raster(polys, w, h, toPx) {
  const f = new Float32Array(w * h);
  const S = 4;
  const insid = (x, y, ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const px = polys.map((p) => p.map(toPx));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let hit = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const X = x + (sx + 0.5) / S, Y = y + (sy + 0.5) / S;
      let n = 0;
      for (const r of px) if (insid(X, Y, r)) n++;
      if (n % 2 === 1) hit++;
    }
    f[y * w + x] = hit / (S * S);
  }
  return f;
}

const logo = JSON.parse(fs.readFileSync('./assets/sample-logo.json', 'utf8'))[0].outer;

// ---- case A: the sample legend's outer ring, no holes
const PPM = 40;                      // px per mm
const pad = 4;
const bx = [Math.min(...logo.map((p) => p[0])), Math.max(...logo.map((p) => p[0]))];
const by = [Math.min(...logo.map((p) => p[1])), Math.max(...logo.map((p) => p[1]))];
const W = Math.ceil((bx[1] - bx[0]) * PPM) + pad * 2;
const H = Math.ceil((by[1] - by[0]) * PPM) + pad * 2;
const toPx = (p) => [(p[0] - bx[0]) * PPM + pad, (by[1] - p[1]) * PPM + pad]; // y down
const fieldA = raster([logo], W, H, toPx);
const ringsA = rasterToRings(fieldA, W, H, { pxPerMM: PPM, tolPx: 0.35 });

const origArea = Math.abs(signedArea(logo));
let recArea = 0;
for (const r of ringsA) {
  recArea += Math.abs(signedArea(r.outer));
  for (const h of r.holes) recArea -= Math.abs(signedArea(h));
}
const bA = ringsBounds(ringsA);
console.log('=== A: vong ngoai hinh mau ===');
console.log(`  raster ${W}x${H}px @ ${PPM}px/mm`);
console.log(`  rings=${ringsA.length} holes=${ringsA.map((r) => r.holes.length)} pts=${ringsA.map((r) => r.outer.length)}`);
console.log(`  area  goc ${origArea.toFixed(3)}  truy hoi ${recArea.toFixed(3)}  lech ${(100 * (recArea / origArea - 1)).toFixed(2)}%`);
console.log(`  bbox  goc ${(bx[1] - bx[0]).toFixed(3)} x ${(by[1] - by[0]).toFixed(3)}   truy hoi ${bA.w.toFixed(3)} x ${bA.h.toFixed(3)}`);

// max deviation: every recovered point to the nearest original edge
function distToPoly(p, ring) {
  let best = Infinity;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = dx * dx + dy * dy;
    let t = L < 1e-12 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
  }
  return best;
}
// recovered rings are centred on the raster origin; shift back to logo coords
const shifted = ringsA[0].outer.map((p) => [p[0] + bx[0] - pad / PPM, p[1] + by[1] + pad / PPM]);
let maxd = 0;
for (const p of shifted) maxd = Math.max(maxd, distToPoly(p, logo));
console.log(`  do lech hinh hoc lon nhat: ${maxd.toFixed(4)} mm`);

// ---- case B: ring with a hole + a second island (tests nesting)
const donutOut = [], donutIn = [], island = [];
for (let i = 0; i < 96; i++) {
  const a = (2 * Math.PI * i) / 96;
  donutOut.push([6 * Math.cos(a), 6 * Math.sin(a)]);
  donutIn.push([3 * Math.cos(a), 3 * Math.sin(a)]);
}
for (let i = 0; i < 4; i++) island.push([[9, -1], [11, -1], [11, 1], [9, 1]][i]);
const polysB = [donutOut, donutIn, island];
const bx2 = [-7, 12], by2 = [-7, 7];
const W2 = Math.ceil((bx2[1] - bx2[0]) * PPM) + pad * 2, H2 = Math.ceil((by2[1] - by2[0]) * PPM) + pad * 2;
const toPx2 = (p) => [(p[0] - bx2[0]) * PPM + pad, (by2[1] - p[1]) * PPM + pad];
const ringsB = rasterToRings(raster(polysB, W2, H2, toPx2), W2, H2, { pxPerMM: PPM });
console.log('\n=== B: donut + dao rieng (test lo va nesting) ===');
console.log(`  rings=${ringsB.length}  holes per ring=${ringsB.map((r) => r.holes.length)}`);
let aB = 0;
for (const r of ringsB) { aB += Math.abs(signedArea(r.outer)); for (const h of r.holes) aB -= Math.abs(signedArea(h)); }
const expB = Math.PI * (36 - 9) + 4;
console.log(`  area mong doi ${expB.toFixed(3)}  truy hoi ${aB.toFixed(3)}  lech ${(100 * (aB / expB - 1)).toFixed(2)}%`);

// ---- extrude both and check they are solid
fs.mkdirSync('out', { recursive: true });
fs.writeFileSync('out/vec_asterisk.stl', buildStl([buildPrism(ringsA, 0, 1)], 'asterisk'));
fs.writeFileSync('out/vec_donut.stl', buildStl([buildPrism(ringsB, 0, 1)], 'donut'));
console.log('\nwrote out/vec_asterisk.stl, out/vec_donut.stl');
