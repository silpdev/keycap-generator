import fs from 'fs';
import { PRESETS, buildKeycap, exportKeycap3mf, exportKeycapStl } from '../src/build.mjs';
import { buildStl } from '../src/export3mf.mjs';

const logo = JSON.parse(fs.readFileSync('./assets/sample-logo.json', 'utf8'));

function report(name, p, rings) {
  const { parts, info } = buildKeycap(p, rings);
  console.log(`\n=== ${name} ===  roofT=${info.roofT.toFixed(2)} stemTop=${info.stemTop.toFixed(2)}` +
              (info.legendDepth ? ` legendDepth=${info.legendDepth.toFixed(2)}` : ''));
  for (const pt of parts) {
    const b = pt.mesh.bounds;
    console.log(`  ${pt.subtype === 'negative_part' ? '[-]' : '[+]'} ${pt.name.padEnd(22)} ` +
      `tri=${String(pt.mesh.F.length).padStart(6)}  ` +
      `X ${b.lo[0].toFixed(2)}..${b.hi[0].toFixed(2)}  Y ${b.lo[1].toFixed(2)}..${b.hi[1].toFixed(2)}  Z ${b.lo[2].toFixed(2)}..${b.hi[2].toFixed(2)}`);
    fs.writeFileSync(`out/${name}_${pt.id}_${pt.name.replace(/[^a-z0-9]+/gi, '-')}.stl`, buildStl([pt.mesh], pt.name));
  }
  return parts;
}

fs.mkdirSync('out', { recursive: true });

const c22 = { ...PRESETS.clicker22, logoRot: 0, logoDx: 0, logoDy: 0 };
report('clicker22', c22, logo);
fs.writeFileSync('out/clicker22.3mf', exportKeycap3mf(c22, logo, 1));

const c5 = { ...PRESETS.clicker5, logoSize: 10.5, logoMode: 'recessed', logoDepth: 0.8 };
report('clicker5', c5, logo);
fs.writeFileSync('out/clicker5_x5.3mf', exportKeycap3mf(c5, logo, 5));

const noLogo = { ...PRESETS.mx1u };
report('mx1u_blank', noLogo, null);

const thru = { ...PRESETS.mx1u, logoMode: 'through' };
report('mx1u_through', thru, logo);
fs.writeFileSync('out/mx1u.stl', exportKeycapStl(noLogo, null));
console.log('\nwrote', fs.readdirSync('out').length, 'files');
