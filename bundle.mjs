// Inlines the ES modules and the UI into one self-contained HTML page.
// That page is both the GitHub Pages site (docs/index.html) and the offline copy
// — no build step is needed to use the tool, only to rebuild it.
import fs from 'fs';

const strip = (f) => fs.readFileSync(f, 'utf8')
  .replace(/^\s*import[^;]*;\s*$/gm, '')
  .replace(/^export\s+/gm, '');

const core = ['src/geom.mjs', 'src/vectorize.mjs', 'src/export3mf.mjs', 'src/build.mjs']
  .map((f) => `/* ---- ${f} ---- */\n${strip(f)}`).join('\n');
const shell = fs.readFileSync('src/shell.html', 'utf8');
const logo = strip('src/logo_default.mjs');
const app = fs.readFileSync('src/app.js', 'utf8');

const page = '<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
  + '<meta name="description" content="Parametric MX keycap generator - type your own millimetres, drop in an SVG, export a two-colour 3MF.">\n'
  + shell.replace(/^([\s\S]*?<\/style>)/, '$1\n</head>\n<body>')
  + `\n<script>\n"use strict";\n${core}\n${logo}\n${app}\n<\/script>\n</body>\n</html>\n`;

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/index.html', page);
console.log('docs/index.html', (page.length / 1024).toFixed(1) + ' KB');
