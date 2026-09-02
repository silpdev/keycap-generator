import { buildCapShell, buildStem, buildPrism, transformRings, ringsBounds, Mesh,
         triStats, resetTriStats } from './geom.mjs';
import { build3mf, buildStl } from './export3mf.mjs';

export const PRESETS = {
  clicker22: {
    label: 'Fidget clicker 22.4 mm',
    capW: 22.4, capD: 22.4, topW: 20.1, topD: 20.1, capH: 9.0, cornerR: 1.4,
    wall: 2.2, cavityH: 4.0,
    stemSpan: 4.20, stemArm: 1.30, stemSlotDepth: 4.0, stemDia: 5.6, leadIn: 0, leadInH: 0.6,
    logoSize: 17.8, logoDepth: 1.0, logoMode: 'raised',
    capColor: '#C05A2B', logoColor: '#F5F3EE',
  },
  mx1u: {
    label: 'Bàn phím 1u — 18.0 mm',
    capW: 18.0, capD: 18.0, topW: 13.2, topD: 13.2, capH: 9.5, cornerR: 1.0,
    wall: 1.5, cavityH: 6.4,
    stemSpan: 4.25, stemArm: 1.36, stemSlotDepth: 4.0, stemDia: 5.6, leadIn: 0.15, leadInH: 0.6,
    logoSize: 10.0, logoDepth: 0.8, logoMode: 'recessed',
    capColor: '#1C1C1E', logoColor: '#F2F2F2',
  },
  // Measured switch pitch on a 5-switch fidget clicker body:
  // 18.062 / 18.062 / 17.959 mm.  Sized off the tightest pair (17.959) minus
  // 0.46 mm so adjacent caps still have a gap after the first layers spread.
  clicker5: {
    label: 'Clicker 5 switch (pitch 17.96)',
    capW: 17.5, capD: 17.5, topW: 12.5, topD: 12.5, capH: 9.5, cornerR: 1.2,
    wall: 1.6, cavityH: 6.4,
    stemSpan: 4.25, stemArm: 1.36, stemSlotDepth: 4.5, stemDia: 5.6, leadIn: 0.15, leadInH: 0.6,
    logoSize: 10.5, logoDepth: 0.8, logoMode: 'recessed',
    capColor: '#F5820B', logoColor: '#FFFFFF',
  },
};

/**
 * The transform that fits a legend onto the cap top: scale to logoSize about the
 * artwork's centre, then rotate and offset.  Split out from placeLogo so several
 * ink groups can share ONE fit — computing it per group would scale and centre
 * each colour separately and pull the logo apart.
 */
export function logoFit(rings, p) {
  const b = ringsBounds(rings);
  const span = Math.max(b.w, b.h) || 1;
  return {
    scale: p.logoSize / span,
    cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2,
    rot: p.logoRot || 0, dx: p.logoDx || 0, dy: p.logoDy || 0, mirror: !!p.mirror,
  };
}

export function applyFit(rings, fit) {
  const centred = rings.map((r) => ({
    outer: r.outer.map((q) => [q[0] - fit.cx, q[1] - fit.cy]),
    holes: (r.holes || []).map((h) => h.map((q) => [q[0] - fit.cx, q[1] - fit.cy])),
  }));
  return transformRings(centred, fit);
}

/** Fit one ring set onto the cap top. */
export function placeLogo(rings, p) {
  return applyFit(rings, logoFit(rings, p));
}

/**
 * The legend may be one set of rings (one ink, the old shape) or an array of
 * ring sets, one per ink colour.  Normalising here means every caller — the
 * exporters, the preview, the checks — sees the same thing.
 */
export function inkGroups(logoRings) {
  if (!logoRings || !logoRings.length) return [];
  // a ring set is [{outer, holes}, ..]; a group list is [[{outer..}], [..]]
  const nested = Array.isArray(logoRings[0]);
  const groups = nested ? logoRings : [logoRings];
  return groups.filter((g) => g && g.length);
}

/** Returns { parts, preview, info } — parts feed the 3MF, preview feeds the 3D view. */
export function buildKeycap(p, logoRings) {
  resetTriStats();
  const stemTop = Math.max(p.stemSlotDepth, p.cavityH) + 0.3;
  const cap = buildCapShell(p).weld();
  const stem = buildStem({ ...p, stemTop }).weld();

  const parts = [
    { id: 1, name: 'Cap', mesh: cap, extruder: 1, subtype: 'normal_part' },
    { id: 2, name: `MX stem ${p.stemSpan}x${p.stemArm}`, mesh: stem, extruder: 1, subtype: 'normal_part' },
  ];
  const preview = [{ mesh: cap, kind: 'cap' }, { mesh: stem, kind: 'cap' }];
  const info = { stemTop, roofT: p.capH - p.cavityH };

  const groups = inkGroups(logoRings);
  if (groups.length) {
    // Each ink is placed with the SAME transform, computed from all inks together,
    // or the colours would be scaled and centred independently and come apart.
    const all = groups.flat();
    const fit = logoFit(all, p);
    const placed = groups.map((g) => applyFit(g, fit));
    let id = 3;
    info.inks = groups.length;

    if (p.logoMode === 'raised') {
      placed.forEach((rings, i) => {
        const prism = buildPrism(rings, p.capH - 0.01, p.capH + p.logoDepth).weld();
        parts.push({ id: id++, name: groups.length > 1 ? `Legend ink ${i + 1}` : 'Legend',
                     mesh: prism, extruder: 2 + i, subtype: 'normal_part' });
        preview.push({ mesh: prism, kind: 'logo', ink: i });
      });
    } else {
      const roofT = p.capH - p.cavityH;
      const d = p.logoMode === 'through' ? roofT : Math.min(p.logoDepth, roofT - 0.4);
      const z0 = p.capH - d;
      // one cutout for every ink together: the recess is the same pocket
      // whatever colour goes in it, and one negative part is one boolean
      const cut = buildPrism(all.map((r) => applyFit([r], fit)[0]),
        z0 - (p.logoMode === 'through' ? 0.4 : 0), p.capH + 0.3).weld();
      parts.push({ id: id++, name: 'Legend cutout', mesh: cut, subtype: 'negative_part' });
      placed.forEach((rings, i) => {
        const fill = buildPrism(rings, z0, p.capH).weld();
        parts.push({ id: id++, name: groups.length > 1 ? `Legend ink ${i + 1}` : 'Legend',
                     mesh: fill, extruder: 2 + i, subtype: 'normal_part' });
        // flush with the cap's top face -> nudge the preview copy so the depth
        // buffer has a winner (the exported geometry stays exact)
        preview.push({ mesh: fill, kind: 'logo', ink: i, zBias: 0.012 });
      });
      info.legendDepth = d;
    }
  }
  info.holesDropped = triStats.dropped;
  info.triFailed = triStats.failed;
  return { parts, preview, info };
}

/**
 * Printing orientation.
 *
 * The cap is modelled sitting on its open rim, which is also the worst way to
 * print it: the switch cavity's roof becomes one ~300 mm² internal bridge and
 * the slicer asks for supports — which would end up inside the cavity and the
 * stem slot, wrecking the fit.  Turned top-face-down the same cap has almost no
 * overhang (~4 mm²), the top surface comes out glossy off the build plate, and
 * a recessed legend prints as the first layers, which is exactly what makes a
 * clean two-colour inlay.  A raised legend cannot be flipped — it would be
 * under the plate — so that mode stays face-up.
 */
export function orientForPrint(parts, logoMode, flip = 'auto') {
  const down = flip === 'down' || (flip === 'auto' && logoMode !== 'raised');
  if (!down) return { parts, down: false };
  let H = -Infinity;
  for (const p of parts) if (p.subtype === 'normal_part') H = Math.max(H, p.mesh.bounds.hi[2]);
  return { parts: parts.map((p) => ({ ...p, mesh: p.mesh.flipped(H) })), down: true };
}

/** Grid of copies centred on the plate. */
export function layout(count, capW, capD, plate = 256) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const sx = capW + 3, sy = capD + 3;
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push({ x: plate / 2 + (c - (cols - 1) / 2) * sx, y: plate / 2 + (r - (rows - 1) / 2) * sy });
  }
  return out;
}

export function exportKeycap3mf(p, logoRings, count = 1, plate = 256) {
  const { parts } = orientForPrint(buildKeycap(p, logoRings).parts, p.logoMode, p.flip);
  // one filament slot per extruder actually used, in order
  const top = parts.reduce((m, x) => Math.max(m, x.extruder || 1), 1);
  const inks = p.inkColors && p.inkColors.length
    ? p.inkColors : [p.logoColor || '#FFFFFF'];
  const filaments = [p.capColor || '#F5820B'];
  for (let i = 0; i + 1 < top; i++) filaments.push(inks[i] || inks[inks.length - 1] || '#FFFFFF');
  return build3mf({
    parts,
    copies: layout(count, p.capW, p.capD, plate),
    title: p.name || 'Keycap',
    filaments: p.embedFilaments !== false && top > 1 ? filaments : null,
  });
}

export function exportKeycapStl(p, logoRings) {
  const { parts } = orientForPrint(buildKeycap(p, logoRings).parts, p.logoMode, p.flip);
  return buildStl(parts.filter((x) => x.subtype === 'normal_part').map((x) => x.mesh), p.name || 'keycap');
}
