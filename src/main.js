// Dev entry for `npm run dev`.  The UI reads the core off the global scope so
// one app.js serves both this module build and the single-file bundle.
import { PRESETS, buildKeycap, placeLogo, exportKeycap3mf, exportKeycapStl } from './build.mjs';
import { rasterToRings } from './vectorize.mjs';
import { calSpans, exportCalibration3mf, exportCalibrationStl } from './calibration.mjs';
import { DEFAULT_LOGO } from './logo_default.mjs';

Object.assign(globalThis, {
  PRESETS, buildKeycap, placeLogo, exportKeycap3mf, exportKeycapStl, rasterToRings,
  calSpans, exportCalibration3mf, exportCalibrationStl, DEFAULT_LOGO,
});
await import('./app.js');
