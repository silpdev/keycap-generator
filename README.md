# Keycap Generator

Parametric Cherry MX keycap generator that runs in the browser. Type the millimetres
you actually measured with calipers, drop in an SVG or PNG, and export a two-colour
`.3mf` that opens in Bambu Studio ready to print.

**[▶ Open the tool](https://silpdev.github.io/keycap-generator/)** — no install, no
sign-up. One HTML file that also works offline: save the page and open it from disk.

![The generator: parameter rail, 3D preview, section drawing and tolerance table](docs/screenshot-light.png)

> The interface is in Vietnamese. Every control is a number in millimetres, so it
> stays usable either way — and the tolerance table tells you in plain terms when a
> value will not print. Translations are welcome.

## Why another one

Most keycap generators lock you to keyboard units (1u, 1.25u, …) and hide the stem
behind a vague ± button. That is fine for a keyboard and useless for a fidget
clicker, a macropad shell, or any enclosure where you measured the switch pitch
yourself. This one asks for the numbers directly and then checks them:

- **Free dimensions.** Bottom footprint, top face, height, corner radius, wall
  thickness, cavity depth — all typed in mm. Non-square caps included.
- **The MX stem in numbers.** Cross span, arm width, slot depth, tube diameter,
  push-on chamfer. A real Cherry MX post measures **4.10 × 1.30 mm**; a printed slot
  wants **0.10–0.20 mm** more than that to survive shrinkage. The table flags a slot
  that is too tight *before* you waste an hour of print time.
- **Legend from any image.** SVG or PNG/JPG/WebP, traced to real contours with
  holes and islands preserved. Raised, recessed inlay, or cut all the way through.
- **Two-colour 3MF.** Cap and legend become separate parts with their own filament,
  and the file declares two filament slots so the assignment survives the import.

## What it checks for you

The tolerance table on the right is the point of the tool. It recomputes on every
keystroke and explains each failure with the number you need to change:

| Check | Fails when |
|---|---|
| Cross slot | clearance over the 4.10 mm post is under 0.05 mm or over 0.40 mm |
| Stem wall | tube wall thinner than 0.50 mm — one extrusion, cracks off |
| Slot depth | shallower than 3.4 mm, the cap works loose |
| Switch cavity | narrower than 13.4 mm at the rim, the cap bottoms out on the housing |
| Cap wall | thinner than 0.80 mm, the skirt prints hollow and separates |
| Cavity at the ceiling | under 9.5 mm, the switch's upper housing fouls the taper |
| Roof | under 1.2 mm, or too thin for the engraving depth |
| Legend vs top face | legend wider than the top face |
| Print orientation | face-up when it does not have to be (see below) |

## Three things it gets right that are easy to get wrong

**The cavity follows the taper.** A tapered shell with a straight vertical cavity
pinches the wall as it rises: on a 17.5 mm cap tapering to 12.5 mm, a 1.6 mm wall at
the rim becomes **0.34 mm** at the top of the cavity. That is thinner than one
extrusion, the slicer prints nothing there, and the skirt comes off the cap as a
separate ring. Here the cavity is lofted parallel to the outside, so the wall keeps
its thickness for the full height — the way commercial caps are built.

**It flips the cap for printing.** Modelled sitting on its open rim, the cap's
cavity roof is a ~300 mm² internal bridge and the slicer asks for supports — which
would land inside the cavity and the stem slot and ruin the fit. Exported top-face
down, the same cap has **3.6 mm²** of overhang (measured layer by layer at 0.2 mm),
the top surface comes off the build plate glossy, and a recessed legend prints as
the first layers, which is what makes a crisp two-colour inlay. A raised legend
cannot be flipped, so that mode stays face-up and says so.

**No CSG, and no repair needed.** Cap, stem and legend are written as separate parts
of one 3MF object — normal parts add, `negative_part` subtracts, and the slicer does
the booleans. So there is no WASM CSG kernel to load, and every part only has to be
a closed solid on its own. They are: the test suite audits each part's edges without
letting any mesh library repair them first.

## Tests

```bash
npm test      # no dependencies — the core and the tests use only Node builtins
```

- **`test_tri.mjs`** — triangulation with holes. Compares the *summed triangle area*
  against the true area (outer minus holes) over 9 cases: 1, 2, 4, 20 and 30 holes,
  a ring with thin radial slits, a 60-point star hole. Deviation must be 0.00% —
  a positive deviation means a hole got filled in.
- **`test_vec.mjs`** — image tracing. Rasterises a known polygon and recovers it:
  area within 0.1%, worst-case geometric deviation under 0.02 mm. Plus a donut and
  a separate island to cover hole nesting.
- **`test_export.mjs`** — every part destined for the 3MF, over **27 combinations**
  of preset × legend mode × print orientation: each edge must appear exactly twice,
  no face may repeat a vertex, and the signed volume must be positive. Deliberately
  without mesh repair — a slicer quietly repairing a hole is how one reached the
  printer during development.
- **`test_mesh.mjs`** — writes each part to `out/*.stl` and prints the dimensions.

## Development

```bash
npm install     # only for the dev server
npm run dev     # vite, hot reload

npm run bundle  # rebuild docs/index.html (the site and the offline copy)
npm test
```

CI runs the tests and then fails if `docs/index.html` does not match `src/`.

| File | Does |
|---|---|
| `src/geom.mjs` | Rounded rects, the MX cross, ear-clipping triangulation with hole bridging, the `Mesh` class, cap shell / stem / legend prism builders |
| `src/vectorize.mjs` | Marching squares over the alpha field, Douglas–Peucker, hole classification by nesting depth |
| `src/export3mf.mjs` | Zip writer (STORE + CRC32), Bambu-flavoured 3MF, binary STL |
| `src/build.mjs` | Presets, part assembly, print orientation, plate layout |
| `src/app.js` | UI: WebGL preview, section drawing, tolerance table |
| `src/shell.html` | Markup and CSS, shared by the dev build and the bundle |
| `bundle.mjs` | Inlines everything into `docs/index.html` |
| `tools/make-sample-logo.mjs` | Regenerates the bundled sample legend |

Nothing is vendored: the triangulation, the image tracing, the zip writer and the
3MF writer are all in the four files above.

## Two colours in Bambu Studio

The legend part carries `<metadata key="extruder" value="2"/>` in
`model_settings.config`, which is how Bambu assigns a filament per part. But a
project with only one filament flattens that back to filament 1 and the cap comes
out one colour — so the export also embeds a minimal `project_settings.config`
declaring two filament slots in the colours you picked. It contains only the
filament arrays, no printer or print preset, so your machine profile is untouched.
If Bambu asks whether to load the project's settings, say yes.

Two colours still need two filaments in the project. Without an AMS or a second
slot, no file can produce them.

## Credits

The idea came from [vostoklabs/SVG-keycap-generator](https://github.com/vostoklabs/SVG-keycap-generator),
which is worth a look if you want authored keycap profiles and keyboard-standard
sizes. No code is shared between the two projects — this one is written from scratch
around typed dimensions and a tolerance check.

Preset dimensions were taken with calipers from caps that fit real switches. The
bundled sample legend is generated by `tools/make-sample-logo.mjs`; bring your own
artwork and check its licence before printing or sharing it.

## Tiếng Việt

[README.vi.md](README.vi.md) — bản tiếng Việt đầy đủ.

## Licence

MIT — see [LICENSE](LICENSE).
