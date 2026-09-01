// ---------------------------------------------------------------------------
// Minimal 3MF writer in the flavour Bambu Studio / OrcaSlicer expect.
// Stored (uncompressed) zip - no dependencies, works in Node and the browser.
// Parts are handed over separately (cap / stem / legend), so the slicer performs
// the union and we never need a boolean here.
// ---------------------------------------------------------------------------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const utf8 = (s) => new TextEncoder().encode(s);

/** files: [{name, data:Uint8Array}] -> zip bytes (STORE). */
export function zipStore(files) {
  const chunks = [], central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = utf8(f.name), crc = crc32(f.data), n = f.data.length;
    const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
                   ...u32(crc), ...u32(n), ...u32(n), ...u16(name.length), ...u16(0)];
    chunks.push(new Uint8Array(local), name, f.data);
    central.push({ name, crc, n, offset });
    offset += local.length + name.length + n;
  }
  const cdir = [];
  for (const c of central) {
    cdir.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
              ...u32(c.crc), ...u32(c.n), ...u32(c.n), ...u16(c.name.length),
              ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.offset));
    cdir.push(...c.name);
  }
  const cd = new Uint8Array(cdir);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(central.length), ...u16(central.length), ...u32(cd.length), ...u32(offset), ...u16(0)]);
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total + cd.length + end.length);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  out.set(cd, o); o += cd.length;
  out.set(end, o);
  return out;
}

const f6 = (v) => (Math.abs(v) < 1e-9 ? '0' : v.toFixed(6).replace(/\.?0+$/, ''));

function meshXml(id, mesh) {
  const L = [`  <object id="${id}" type="model">`, '   <mesh>', '    <vertices>'];
  for (const v of mesh.V) L.push(`     <vertex x="${f6(v[0])}" y="${f6(v[1])}" z="${f6(v[2])}"/>`);
  L.push('    </vertices>', '    <triangles>');
  for (const t of mesh.F) L.push(`     <triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`);
  L.push('    </triangles>', '   </mesh>', '  </object>');
  return L.join('\n');
}

/**
 * parts: [{ id, name, mesh, extruder, subtype }]  subtype: normal_part | negative_part
 * copies: [{x, y}] plate positions in mm (one object instance per entry)
 * filaments: ['#rrggbb', ...] — when given, a minimal project_settings.config
 *   declares that many filament slots.  Without it a 3MF inherits whatever the
 *   open project has, and a project with one filament flattens the part that
 *   asks for filament 2 back to filament 1: the legend loses its colour.
 *   Only the filament arrays are written — no printer or print preset — so the
 *   machine profile the user already has selected is left alone.
 */
export function build3mf({ parts, copies, title = 'Keycap', filaments = null }) {
  const PARTS_PATH = '/3D/Objects/parts.model';
  const partsModel = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"' +
      ' xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"' +
      ' xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">',
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
    ' <resources>',
    ...parts.map((p) => meshXml(p.id, p.mesh)),
    ' </resources>',
    ' <build/>',
    '</model>', ''
  ].join('\n');

  const objs = [], items = [];
  copies.forEach((c, i) => {
    const oid = 100 + i;
    objs.push(
      `  <object id="${oid}" type="model">`,
      '   <components>',
      ...parts.map((p) => `    <component p:path="${PARTS_PATH}" objectid="${p.id}" transform="1 0 0 0 1 0 0 0 1 0 0 0" />`),
      '   </components>',
      '  </object>');
    items.push(`  <item objectid="${oid}" transform="1 0 0 0 1 0 0 0 1 ${f6(c.x)} ${f6(c.y)} 0" printable="1" />`);
  });

  const mainModel = [
    "<?xml version='1.0' encoding='UTF-8'?>",
    '<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"' +
      ' xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"' +
      ' unit="millimeter" xml:lang="en-US" requiredextensions="p"' +
      ' xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">',
    ' <metadata name="Application">Keycap Generator</metadata>',
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
    ` <metadata name="Title">${title}</metadata>`,
    ' <resources>', ...objs, ' </resources>',
    ' <build>', ...items, ' </build>',
    '</model>', ''
  ].join('\n');

  const settings = [
    '<?xml version="1.0" encoding="UTF-8"?>', '<config>',
    ...copies.flatMap((c, i) => {
      const oid = 100 + i;
      return [
        `  <object id="${oid}">`,
        `    <metadata key="name" value="${title}"/>`,
        '    <metadata key="extruder" value="1"/>',
        ...parts.flatMap((p) => [
          `    <part id="${p.id}" subtype="${p.subtype}">`,
          `      <metadata key="name" value="${p.name}"/>`,
          ...(p.extruder ? [`      <metadata key="extruder" value="${p.extruder}"/>`] : []),
          '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>',
          `      <mesh_stat face_count="${p.mesh.F.length}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>`,
          '    </part>'
        ]),
        '  </object>'
      ];
    }),
    '  <plate>',
    '    <metadata key="plater_id" value="1"/>',
    '    <metadata key="plater_name" value=""/>',
    '    <metadata key="locked" value="false"/>',
    '    <metadata key="filament_map_mode" value="Auto For Flush"/>',
    ...copies.map((c, i) =>
      ['    <model_instance>',
       `      <metadata key="object_id" value="${100 + i}"/>`,
       '      <metadata key="instance_id" value="0"/>',
       '    </model_instance>'].join('\n')),
    '  </plate>',
    '</config>', ''
  ].join('\n');

  const extra = [];
  if (filaments && filaments.length > 1) {
    const n = filaments.length;
    const rep = (v) => Array(n).fill(v);
    extra.push({ name: 'Metadata/project_settings.config', data: utf8(JSON.stringify({
      from: 'project',
      filament_colour: filaments,
      filament_multi_colour: filaments,
      filament_type: rep('PLA'),
      filament_ids: rep('GFA00'),
      filament_diameter: rep('1.75'),
      filament_density: rep('1.24'),
      filament_soluble: rep('0'),
      filament_is_support: rep('0'),
    }, null, 1)) });
    extra.push({ name: 'Metadata/slice_info.config', data: utf8(
      '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <header>\n' +
      '    <header_item key="X-BBL-Client-Type" value="slicer"/>\n' +
      '    <header_item key="X-BBL-Client-Version" value="02.00.00.00"/>\n' +
      '  </header>\n</config>\n') });
  }

  return zipStore([
    { name: '[Content_Types].xml', data: utf8(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
      ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
      ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
      ' <Default Extension="png" ContentType="image/png"/>\n</Types>\n') },
    { name: '_rels/.rels', data: utf8(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n') },
    { name: '3D/3dmodel.model', data: utf8(mainModel) },
    { name: '3D/_rels/3dmodel.model.rels', data: utf8(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      ` <Relationship Target="${PARTS_PATH}" Id="rel-2" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n`) },
    { name: '3D/Objects/parts.model', data: utf8(partsModel) },
    { name: 'Metadata/model_settings.config', data: utf8(settings) },
    ...extra,
  ]);
}

/** Binary STL of one or more meshes concatenated (slicers union overlapping solids). */
export function buildStl(meshes, name = 'keycap') {
  let n = 0;
  for (const m of meshes) n += m.F.length;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  new Uint8Array(buf, 0, 80).set(utf8(name.slice(0, 79)));
  dv.setUint32(80, n, true);
  let o = 84;
  for (const m of meshes) for (const t of m.F) {
    const a = m.V[t[0]], b = m.V[t[1]], c = m.V[t[2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const L = Math.hypot(nx, ny, nz) || 1;
    for (const val of [nx / L, ny / L, nz / L, ...a, ...b, ...c]) { dv.setFloat32(o, val, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}
