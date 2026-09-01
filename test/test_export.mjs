// Every part that goes into the 3MF must be a closed, correctly wound solid —
// checked here without any mesh repair, because a slicer that silently repairs
// is exactly how a hole in the legend reached the printer once already.
import fs from 'fs';
import { PRESETS, buildKeycap, orientForPrint } from '../src/build.mjs';

const logo = JSON.parse(fs.readFileSync('./assets/sample-logo.json', 'utf8'));

function audit(mesh) {
  const edges = new Map();
  let repeated = 0;
  for (const f of mesh.F) {
    if (f[0] === f[1] || f[1] === f[2] || f[0] === f[2]) repeated++;
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  let open = 0, over = 0;
  for (const v of edges.values()) { if (v === 1) open++; else if (v > 2) over++; }
  // signed volume via the divergence theorem — positive means outward normals
  let vol = 0;
  for (const f of mesh.F) {
    const a = mesh.V[f[0]], b = mesh.V[f[1]], c = mesh.V[f[2]];
    vol += (a[0] * (b[1] * c[2] - c[1] * b[2])
          - a[1] * (b[0] * c[2] - c[0] * b[2])
          + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  return { open, over, repeated, vol, tris: mesh.F.length, verts: mesh.V.length };
}

let fail = 0;
const presets = Object.keys(PRESETS);
const modes = ['raised', 'recessed', 'through'];
const flips = ['auto', 'down', 'up'];
for (const pk of presets) for (const mode of modes) for (const flip of flips) {
  const p = { ...PRESETS[pk], logoMode: mode, flip, logoRot: 0, logoDx: 0, logoDy: 0 };
  const { parts } = orientForPrint(buildKeycap(p, logo).parts, mode, flip);
  for (const pt of parts) {
    const a = audit(pt.mesh);
    const bad = a.open || a.over || a.repeated || a.vol <= 0;
    if (bad) fail++;
    if (bad || process.env.VERBOSE)
      console.log('%s %s %s %s  tri=%d dinh=%d ho=%d >2=%d lap=%d vol=%s %s',
        pk.padEnd(8), mode.padEnd(9), flip.padEnd(5), pt.name.padEnd(22),
        a.tris, a.verts, a.open, a.over, a.repeated, a.vol.toFixed(2), bad ? '<-- LOI' : '');
  }
}
const n = presets.length * modes.length * flips.length;
console.log(`\n${n} to hop preset x che do x huong da kiem tra — ${fail ? fail + ' PART LOI' : 'moi part deu kin khoi, phap tuyen huong ra, the tich duong'}`);
if (fail) process.exit(1);
