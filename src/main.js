// Dev entry for `npm run dev`.  The UI reads the core off the global scope so
// one app.js serves both this module build and the single-file bundle.
import { PRESETS, buildKeycap, placeLogo, logoFit, applyFit, inkGroups,
         exportKeycap3mf, exportKeycapStl } from './build.mjs';
import { rasterToRings } from './vectorize.mjs';
import { calSpans, exportCalibration3mf } from './calibration.mjs';
import { holderInfo, exportHolder3mf } from './holder.mjs';
import { legendPrintability } from './stroke.mjs';
import { inkColours, inkFields } from './palette.mjs';
import { DEFAULT_LOGO } from './logo_default.mjs';

Object.assign(globalThis, {
  PRESETS, buildKeycap, placeLogo, logoFit, applyFit, inkGroups,
  exportKeycap3mf, exportKeycapStl, rasterToRings, inkColours, inkFields,
  calSpans, exportCalibration3mf, holderInfo, exportHolder3mf, legendPrintability, DEFAULT_LOGO,
});
await import('./app.js');
