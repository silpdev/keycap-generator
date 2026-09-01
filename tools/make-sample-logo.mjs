// Generates the sample legend that ships with the tool: a keycap outline with an
// MX cross inside it.  On purpose it is an outer ring + a hole + a separate
// island, so the default view already exercises hole nesting and multi-ring
// extrusion — and it is our own shape, not somebody's trademark.
import fs from 'fs';
import { roundedRect, crossPoly } from '../src/geom.mjs';

const outer = roundedRect(20, 20, 4.2, 14);
const hole = roundedRect(14.4, 14.4, 2.8, 12).slice().reverse();   // CW = hole
const cross = crossPoly(9.6, 3.1);                                  // island

const rings = [
  { outer, holes: [hole] },
  { outer: cross, holes: [] },
];

const round = (r) => ({
  outer: r.outer.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)]),
  holes: r.holes.map((h) => h.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)])),
});
const out = rings.map(round);

fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync('assets/sample-logo.json', JSON.stringify(out));
fs.writeFileSync('src/logo_default.mjs',
  'export const DEFAULT_LOGO=' + JSON.stringify(out) + ';\n');
console.log('rings', out.length,
  '| points', out.reduce((s, r) => s + r.outer.length + r.holes.reduce((a, h) => a + h.length, 0), 0),
  '| bytes', fs.statSync('assets/sample-logo.json').size);
