// ===========================================================================
// Xưởng Keycap MX — UI layer.  Uses the tested core (geom / vectorize /
// export3mf / build) which the bundler inlines above this file.
// ===========================================================================
(function () {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MX_POST_SPAN = 4.10, MX_POST_ARM = 1.30;

  // downloads: a published artifact may only save allow-listed extensions,
  // and .3mf / .stl are not on that list — the offline copy handles those.
  const SANDBOXED = !!(window.claude && typeof window.claude.use === 'function');

  const NUM_KEYS = ['capW','capD','topW','topD','capH','cornerR','wall','cavityH',
    'stemSpan','stemArm','stemSlotDepth','stemDia','leadIn','leadInH',
    'logoSize','logoDepth','logoRot','logoDx','logoDy','count','plate'];

  let P = { ...PRESETS[Object.keys(PRESETS)[0]], logoRot: 0, logoDx: 0, logoDy: 0, mirror: false,
            count: 1, plate: 256, flip: 'auto', embedFilaments: true, name: 'Keycap' };
  let logoRings = DEFAULT_LOGO;      // rings in arbitrary units; placeLogo rescales
  let rawField = null;               // {f, w, h} coverage raster of an uploaded file
  let logoName = 'Hình mẫu có sẵn';
  let logoSlug = 'keycap';
  let logoInfo = '';
  let built = null;

  // ------------------------------------------------------------- presets
  const presetBox = $('presets');
  Object.entries(PRESETS).forEach(([k, v]) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = v.label;
    b.dataset.k = k; b.setAttribute('aria-pressed', k === Object.keys(PRESETS)[0]);
    b.onclick = () => {
      const { label, ...vals } = v;
      P = { ...P, ...vals };
      [...presetBox.children].forEach((c) => c.setAttribute('aria-pressed', c === b));
      syncInputs(); rebuild();
    };
    presetBox.appendChild(b);
  });

  // -------------------------------------------------------------- inputs
  function syncInputs() {
    for (const k of NUM_KEYS) if ($(k)) $(k).value = P[k];
    $('mirror').checked = !!P.mirror;
    $('logoRotV').textContent = P.logoRot + '°';
    $('logoDxV').textContent = Number(P.logoDx).toFixed(1);
    $('logoDyV').textContent = Number(P.logoDy).toFixed(1);
    [...$('logoMode').children].forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.v === P.logoMode));
    [...$('flip').children].forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.v === P.flip));
    $('capColor').value = P.capColor || '#7E8A7C';
    $('logoColor').value = P.logoColor || '#F2F4EC';
    $('embedFilaments').checked = P.embedFilaments !== false;
    $('logoDepth').previousElementSibling.textContent =
      P.logoMode === 'raised' ? 'Cao logo' : P.logoMode === 'through' ? 'Sâu (tự động)' : 'Sâu khắc';
    $('logoDepth').disabled = P.logoMode === 'through';
  }

  for (const k of NUM_KEYS) {
    const el = $(k);
    if (!el) continue;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      if (!isFinite(v)) return;
      P[k] = v;
      if (k === 'logoRot') $('logoRotV').textContent = v + '°';
      if (k === 'logoDx') $('logoDxV').textContent = v.toFixed(1);
      if (k === 'logoDy') $('logoDyV').textContent = v.toFixed(1);
      clearPreset(); rebuild();
    });
  }
  $('mirror').addEventListener('change', () => { P.mirror = $('mirror').checked; rebuild(); });
  for (const k of ['capColor', 'logoColor'])
    $(k).addEventListener('input', () => { P[k] = $(k).value; upload(); render(); });
  $('embedFilaments').addEventListener('change', () => { P.embedFilaments = $('embedFilaments').checked; });
  [...$('logoMode').children].forEach((b) => {
    b.onclick = () => { P.logoMode = b.dataset.v; syncInputs(); rebuild(); };
  });
  [...$('flip').children].forEach((b) => {
    b.onclick = () => { P.flip = b.dataset.v; syncInputs(); rebuild(); };
  });
  $('lineWidth').addEventListener('input', () => { drawSpec(); });
  $('thr').addEventListener('input', () => {
    $('thrV').textContent = parseFloat($('thr').value).toFixed(2);
    revectorize(); rebuild();
  });
  function clearPreset() { [...presetBox.children].forEach((c) => c.setAttribute('aria-pressed', false)); }

  // ---------------------------------------------------------- logo input
  $('logoFile').addEventListener('change', (e) => { if (e.target.files[0]) takeFile(e.target.files[0]); });
  $('clearLogo').onclick = () => {
    rawField = null; logoRings = null; logoName = ''; logoSlug = 'keycap'; logoInfo = '';
    $('legendText').value = ''; $('logoFile').value = ''; textJob++;
    $('fileName').textContent = 'Chọn file SVG hoặc PNG';
    $('logoInfo').textContent = '';
    rebuild();
  };
  const stage = document.querySelector('.stage');
  ['dragover', 'dragenter'].forEach((t) => stage.addEventListener(t, (e) => { e.preventDefault(); }));
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) takeFile(f);
  });

  const RASTER = 1100;   // long side of the coverage raster, in pixels

  /**
   * Rasterise the upload into a coverage field.
   *
   * SVG needs care: icon files usually carry only viewBox="0 0 24 24", and a
   * browser is free to rasterise an <img> SVG at that intrinsic size and then
   * upscale — which melts every thin channel (the ChatGPT knot turns into a
   * blob).  So for SVG we rewrite width/height on the root tag first, which
   * forces rasterisation at full size everywhere.
   */
  async function fileToField(file) {
    const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name);
    let url = null, srcNote = '', revoke = null;

    if (isSvg) {
      const txt = await file.text();
      const m = /<svg\b[^>]*?>/i.exec(txt);
      if (m) {
        const tag = m[0];
        const vb = /viewBox\s*=\s*["']\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
        const wA = /\bwidth\s*=\s*["']([\d.]+)/i.exec(tag);
        const hA = /\bheight\s*=\s*["']([\d.]+)/i.exec(tag);
        let vw = vb ? +vb[3] : wA ? +wA[1] : 0;
        let vh = vb ? +vb[4] : hA ? +hA[1] : 0;
        if (!(vw > 0 && vh > 0)) { vw = 100; vh = 100; }
        const k = RASTER / Math.max(vw, vh);
        const TW = Math.max(8, Math.round(vw * k)), TH = Math.max(8, Math.round(vh * k));
        let attrs = tag.replace(/^<svg/i, '').replace(/\/?>$/, '')
          .replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[\d.]+)/gi, '');
        if (!vb) attrs += ` viewBox="0 0 ${vw} ${vh}"`;
        const patched = txt.slice(0, m.index) +
          `<svg${attrs} width="${TW}" height="${TH}">` + txt.slice(m.index + tag.length);
        url = URL.createObjectURL(new Blob([patched], { type: 'image/svg+xml' }));
        srcNote = `SVG ${vw}×${vh} → raster ${TW}×${TH} px`;
      }
    }
    if (!url) { url = URL.createObjectURL(file); }
    revoke = url;

    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res; img.onerror = () => rej(new Error('load')); img.src = url;
    });
    const nw = img.naturalWidth || RASTER, nh = img.naturalHeight || RASTER;
    let k = RASTER / Math.max(nw, nh);
    if (!isSvg) {
      k = Math.min(k, 6);                       // upscaling a bitmap adds no detail
      srcNote = `ảnh ${nw}×${nh} px`;
    }
    const cw = Math.max(8, Math.round(nw * k)), ch = Math.max(8, Math.round(nh * k));
    const c = document.createElement('canvas');
    c.width = cw + 8; c.height = ch + 8;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 4, 4, cw, ch);
    URL.revokeObjectURL(revoke);

    const d = g.getImageData(0, 0, c.width, c.height).data;
    let hasAlpha = false;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { hasAlpha = true; break; }
    const f = new Float32Array(c.width * c.height);
    for (let p = 0, i = 0; i < d.length; i += 4, p++) {
      if (hasAlpha) f[p] = d[i + 3] / 255;
      else f[p] = 1 - (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    }
    return { f, w: c.width, h: c.height, srcNote, small: !isSvg && Math.max(nw, nh) < 256 };
  }

  /**
   * Rasterise typed text into the same coverage field an upload produces, so the
   * text path shares the tested marching-squares vectoriser rather than needing
   * a font-outline parser.  Drawn at a large pixel size and measured with the
   * glyphs' own ink box: a legend has to sit centred on the cap, and a font's
   * ascent/descent metrics describe the font, not the letters actually typed
   * ("F13" has no descender, and lining it up on the baseline would push it
   * visibly high).
   */
  async function textToField(text, opt) {
    const PX = 340;
    const font = `${opt.weight} ${PX}px ${opt.font}`;
    try { await document.fonts.load(font, text); } catch (e) { /* fallback face */ }

    const c = document.createElement('canvas');
    const g = c.getContext('2d', { willReadFrequently: true });
    const setup = (ctx) => {
      ctx.font = font;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${opt.track}em`;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    };
    setup(g);
    const m = g.measureText(text);
    const left = m.actualBoundingBoxLeft, right = m.actualBoundingBoxRight;
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    const iw = Math.ceil(right + left), ih = Math.ceil(asc + desc);
    if (!(iw > 0 && ih > 0)) return null;

    const pad = 10;
    c.width = iw + pad * 2; c.height = ih + pad * 2;
    setup(g);
    g.fillStyle = '#000';
    g.fillText(text, pad + left, pad + asc);

    const d = g.getImageData(0, 0, c.width, c.height).data;
    const f = new Float32Array(c.width * c.height);
    let ink = 0;
    for (let p = 0, i = 3; i < d.length; i += 4, p++) { f[p] = d[i] / 255; if (f[p] > 0.5) ink++; }
    if (!ink) return null;
    return { f, w: c.width, h: c.height,
             srcNote: `chữ “${text}” · ${iw}×${ih} px`, isText: true };
  }

  const legendOpts = () => ({
    text: $('legendText').value.trim(),
    font: $('legendFont').value,
    weight: $('legendWeight').value,
    track: parseFloat($('legendTrack').value) || 0,
  });

  let textJob = 0;
  async function applyText() {
    const o = legendOpts();
    const job = ++textJob;
    if (!o.text) return;
    const field = await textToField(o.text, o);
    if (job !== textJob) return;                   // a newer keystroke won
    if (!field) { toast('Font đang chọn không vẽ được ký tự này'); return; }
    rawField = field;
    logoName = `chữ “${o.text}”`; logoSlug = o.text;
    $('fileName').textContent = logoName;
    $('logoFile').value = '';
    revectorize();
    rebuild();
  }

  let textT = 0;
  for (const k of ['legendText', 'legendFont', 'legendWeight', 'legendTrack'])
    $(k).addEventListener('input', () => {
      if (k === 'legendTrack') $('legendTrackV').textContent = legendOpts().track.toFixed(2);
      clearTimeout(textT);
      textT = setTimeout(applyText, k === 'legendText' ? 220 : 60);
    });

  async function takeFile(file) {
    try {
      rawField = await fileToField(file);
      logoName = file.name; logoSlug = file.name;
      $('legendText').value = '';
      textJob++;
      $('fileName').textContent = file.name;
      revectorize();
      if (!logoRings || !logoRings.length) toast('Không tách được hình — thử kéo thanh “ngưỡng tách hình”');
      else if (rawField.small) toast('Ảnh nguồn nhỏ hơn 256 px nên chi tiết mảnh sẽ bị nhoè — dùng SVG hoặc ảnh lớn hơn');
      rebuild();
    } catch (err) {
      toast('Không đọc được file này. SVG cần có viewBox hoặc width/height.');
    }
  }

  function revectorize() {
    if (!rawField) { logoInfo = ''; return; }
    const iso = parseFloat($('thr').value);
    logoRings = rasterToRings(rawField.f, rawField.w, rawField.h,
      { pxPerMM: 1, tolPx: 0.35, minArea: 24, iso });
    const holes = logoRings.reduce((s, r) => s + r.holes.length, 0);
    const pts = logoRings.reduce((s, r) => s + r.outer.length +
      r.holes.reduce((a, h) => a + h.length, 0), 0);
    logoInfo = `${rawField.srcNote} · ${logoRings.length} vùng, ${holes} lỗ, ${pts} điểm`;
    $('logoInfo').textContent = logoInfo;
  }

  // ------------------------------------------------------------- rebuild
  let raf = 0;
  function rebuild() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      try { built = buildKeycap(P, logoRings); }
      catch (e) { toast('Thông số không dựng được hình — kiểm tra lại các ô'); return; }
      drawSpec(); drawSection(); upload(); render();
    });
  }

  // ------------------------------------------------------ derived numbers
  function derived() {
    const inW = P.capW - 2 * P.wall, inD = P.capD - 2 * P.wall;
    // cavity follows the outer taper, so the wall is constant and the cavity's
    // narrowest point is its ceiling
    const t = P.cavityH / P.capH;
    const capTopW = Math.min(P.capW + (P.topW - P.capW) * t, P.capD + (P.topD - P.capD) * t);
    const cavTop = capTopW - 2 * P.wall;
    const roofT = P.capH - P.cavityH;
    const stemWall = (P.stemDia - P.stemSpan) / 2;
    const clr = P.stemSpan - MX_POST_SPAN;
    const armClr = P.stemArm - MX_POST_ARM;
    const legDepth = P.logoMode === 'through' ? roofT
      : P.logoMode === 'recessed' ? Math.min(P.logoDepth, roofT - 0.4) : P.logoDepth;
    const totalH = P.capH + (P.logoMode === 'raised' && logoRings ? P.logoDepth : 0);
    const faceDown = P.flip === 'down' || (P.flip === 'auto' && P.logoMode !== 'raised');
    return { inW, inD, roofT, stemWall, clr, armClr, legDepth, totalH, faceDown, cavTop,
             stemTop: Math.max(P.stemSlotDepth, P.cavityH) + 0.3 };
  }

  // ------------------------------------------------- legend stroke widths
  // The analysis rasterises the placed rings, so it costs 50-150 ms — far too
  // much for every keystroke.  It only depends on the rings and how they are
  // placed, so cache on exactly that.
  let strokeKey = '', strokeVal = null;
  function strokeInfo() {
    if (!logoRings || !logoRings.length) return null;
    const line = parseFloat($('lineWidth').value) || 0.42;
    const key = [logoName, logoRings.length, P.logoSize, P.logoRot, P.logoDx, P.logoDy,
                 P.mirror ? 1 : 0, line].join('|');
    if (key !== strokeKey) {
      strokeKey = key;
      try { strokeVal = legendPrintability(placeLogo(logoRings, P), { line, logoSize: P.logoSize }); }
      catch (e) { strokeVal = null; }
    }
    return strokeVal;
  }

  // ------------------------------------------------------------ spec table
  function drawSpec() {
    const d = derived();
    const rows = [];
    const add = (label, val, ok, hint) => rows.push({ label, val, ok, hint });

    add('Khe chữ thập', `${P.stemSpan.toFixed(2)} × ${P.stemArm.toFixed(2)}`,
      d.clr >= 0.05 && d.clr <= 0.40 && d.armClr >= -0.05 && d.armClr <= 0.30,
      d.clr < 0.05 ? `Khe chỉ hơn chân switch ${d.clr.toFixed(2)} mm — in ra gần như chắc chắn không lắp vào được. Tăng “ngang chữ thập” lên tối thiểu 4.20.`
      : d.clr > 0.40 ? `Khe rộng hơn chân switch ${d.clr.toFixed(2)} mm — cap sẽ lỏng và lắc. Giảm về khoảng 4.20–4.30.`
      : d.armClr > 0.30 ? 'Bề cánh rộng quá, cap sẽ xoay nhẹ trên switch.' : null);

    add('Dư so với chân MX', `${d.clr >= 0 ? '+' : ''}${d.clr.toFixed(2)} mm`, d.clr >= 0.05 && d.clr <= 0.40, null);
    add('Thành chân', `${d.stemWall.toFixed(2)} mm`, d.stemWall >= 0.50,
      d.stemWall < 0.50 ? `Thành ống chân chỉ ${d.stemWall.toFixed(2)} mm — mỏng hơn 2 đường đùn, dễ nứt. Tăng đường kính ống lên ≥ ${(P.stemSpan + 1.0).toFixed(1)} mm.` : null);
    add('Sâu khe', `${P.stemSlotDepth.toFixed(1)} mm`, P.stemSlotDepth >= 3.4,
      P.stemSlotDepth < 3.4 ? 'Khe nông hơn 3.4 mm thì chân switch không ăn hết, cap dễ tuột.' : null);
    add('Hốc switch', `${d.inW.toFixed(1)} × ${d.inD.toFixed(1)} × ${P.cavityH.toFixed(1)}`,
      d.inW >= 13.4 && d.inD >= 13.4 && P.cavityH >= 3.6,
      (d.inW < 13.4 || d.inD < 13.4) ? `Hốc rộng ${Math.min(d.inW, d.inD).toFixed(1)} mm, nhỏ hơn vỏ trên switch MX (~13.4 mm) — cap sẽ chặn vào vỏ switch. Giảm “dày thành”.`
      : P.cavityH < 3.6 ? 'Hốc cạn hơn 3.6 mm, cap chạm vỏ switch trước khi ăn hết chân.' : null);
    add('Thành vỏ cap', `${P.wall.toFixed(2)} mm đều`, P.wall >= 0.8,
      P.wall < 0.8 ? `Thành ${P.wall.toFixed(2)} mm mỏng hơn 2 đường đùn — vỏ cap sẽ rỗng và bong khỏi mái khi in.` : null);
    add('Hốc ở đỉnh', `${d.cavTop.toFixed(1)} mm`, d.cavTop >= 9.5 && d.cavTop > P.stemDia + 2,
      d.cavTop < 9.5
        ? `Hốc thu còn ${d.cavTop.toFixed(1)} mm ở đỉnh, vỏ trên switch chạm vào. Giảm “sâu hốc switch”, giảm “dày thành”, hoặc nới “mặt trên”.`
        : d.cavTop <= P.stemDia + 2 ? 'Hốc ở đỉnh quá hẹp so với ống chân — chân gần chạm vách hốc.' : null);
    add('Mái cap', `${d.roofT.toFixed(1)} mm`, d.roofT >= 1.2 && (P.logoMode === 'raised' || d.legDepth >= 0.3),
      d.roofT < 1.2 ? 'Mái cap mỏng hơn 1.2 mm — bấm nhiều sẽ lún.'
      : (P.logoMode !== 'raised' && d.legDepth < 0.3) ? 'Mái cap quá mỏng để khắc logo sâu như vậy. Giảm “sâu khắc” hoặc giảm “sâu hốc switch”.' : null);

    if (logoRings) {
      const room = Math.min(P.topW, P.topD);
      add('Logo trên mặt trên', `${P.logoSize.toFixed(1)} / ${room.toFixed(1)} mm`,
        P.logoSize <= room - 0.8,
        P.logoSize > room - 0.8 ? `Logo ${P.logoSize.toFixed(1)} mm tràn khỏi mặt trên ${room.toFixed(1)} mm. Giảm còn ≤ ${(room - 0.8).toFixed(1)} mm.` : null);

      // The one that got away: a legend region narrower than the nozzle can lay
      // down is printed in the CAP's filament, not its own.  The geometry is
      // perfect and the slicer says nothing — the letters just come out the wrong
      // colour, as faint relief.  Nothing downstream can fix it, so it has to be
      // caught here, before the print.
      const pr = strokeInfo();
      if (pr) {
        const fits = pr.sizeFor <= room - 0.8;
        add('Nét mảnh nhất', `${pr.min.toFixed(2)} / ${pr.need.toFixed(2)} mm`,
          pr.min >= pr.need,
          pr.lost
            ? `${pr.lost} vùng của logo có nét mảnh nhất ${pr.min.toFixed(2)} mm — chưa tới một đường đùn ` +
              `${pr.line.toFixed(2)} mm, nên máy KHÔNG in được chúng bằng filament 2: mấy vùng đó sẽ ra ` +
              `màu thân cap, chỉ còn nổi mờ mờ (mất chữ). Cần logo rộng ${pr.sizeFor.toFixed(1)} mm mới đủ nét` +
              (fits ? '.' : `, mà mặt trên chỉ chứa được ${(room - 0.8).toFixed(1)} mm — ` +
                'cỡ cap này không in nổi phần chữ nhỏ đó. Dùng bản logo không có dòng chữ nhỏ, hoặc bỏ nó đi.')
            : pr.risky
              ? `${pr.risky} vùng chỉ rộng ${pr.min.toFixed(2)} mm, tức 1 đường đùn — in ra được nhưng nét ` +
                `sẽ đứt quãng. Cần ${pr.sizeFor.toFixed(1)} mm để chắc ăn.`
              : null);
      }
    }
    add('Hướng in khi xuất', d.faceDown ? 'úp mặt trên xuống' : 'ngửa mặt trên lên',
      d.faceDown || P.logoMode === 'raised',
      !d.faceDown && P.logoMode !== 'raised'
        ? 'In ngửa thì mái hốc switch phải bắc cầu qua khoang rỗng (~300 mm²) — chọn “Hướng tự động” hoặc “Úp xuống”.'
        : !d.faceDown
          ? 'Logo nổi buộc phải in ngửa, nên mái hốc switch là một cầu ~300 mm². Slicer sẽ báo “floating cantilever” — ' +
            'ĐỪNG bật support, nó sẽ chui vào hốc switch và khe chân, hỏng độ vừa. Bấm bỏ qua cảnh báo, hoặc đổi sang “Khắc lõm” để hết hẳn.'
          : null);
    add('Kích thước tổng', `${P.capW.toFixed(1)} × ${P.capD.toFixed(1)} × ${d.totalH.toFixed(1)}`, true, null);

    $('specBody').innerHTML = rows.map((r) =>
      `<tr><td>${r.label}</td><td class="n">${r.val}</td>` +
      `<td><span class="pill ${r.ok ? 'ok' : 'no'}">${r.ok ? 'đạt' : 'xem lại'}</span></td></tr>`).join('');

    const bad = rows.filter((r) => r.hint);
    const tinfo = built && built.info;
    if (tinfo && (tinfo.holesDropped || tinfo.triFailed))
      bad.unshift({ hint: `Logo có ${tinfo.holesDropped || 0} lỗ không ghép được và ${tinfo.triFailed || 0} vùng tam giác hoá lỗi — ` +
        'hình quá rối ở cỡ này. Tăng "bề rộng logo" hoặc dùng file logo đơn giản hơn.' });
    $('msgs').innerHTML = bad.length
      ? bad.map((r) => `<li>${r.hint}</li>`).join('')
      : '<li class="good">Mọi thông số nằm trong khoảng lắp được với switch Cherry MX.</li>';

    const tri = built ? built.parts.reduce((s, p) => s + p.mesh.F.length, 0) : 0;
    $('readout').innerHTML =
      `<span class="big mono">${P.capW.toFixed(1)} × ${P.capD.toFixed(1)} × ${d.totalH.toFixed(1)} mm</span>` +
      `<span class="mono">khe ${P.stemSpan.toFixed(2)} × ${P.stemArm.toFixed(2)} mm</span><br>` +
      `<span class="mono">${tri.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009')} tam giác</span>`;
  }

  // -------------------------------------------------- section drawing (2D)
  const secCv = $('section'), secCtx = secCv.getContext('2d');

  /** x-intervals where the placed legend rings cross the section plane y=0. */
  function legendSpansAtY0() {
    if (!logoRings) return [];
    const rings = placeLogo(logoRings, P);
    const xs = [];
    for (const r of rings) for (const ring of [r.outer, ...(r.holes || [])]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if ((a[1] > 0) !== (b[1] > 0)) xs.push(a[0] + ((0 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    const out = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.05) out.push([xs[i], xs[i + 1]]);
    return out;
  }

  function drawSection() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = secCv.clientWidth, H = secCv.clientHeight;
    secCv.width = W * dpr; secCv.height = H * dpr;
    const g = secCtx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.body);
    const ink = cs.getPropertyValue('--ink').trim();
    const ink3 = cs.getPropertyValue('--ink3').trim();
    const rule = cs.getPropertyValue('--rule').trim();
    const accent = cs.getPropertyValue('--accent').trim();

    const d = derived();
    const modelW = P.capW + 17, modelH = d.totalH + 13;
    const k = Math.min((W - 6) / modelW, (H - 6) / modelH);
    const ox = W / 2, oy = H / 2 + (d.totalH * k) / 2 - 4;
    const X = (mm) => ox + mm * k, Y = (mm) => oy - mm * k;
    const rect = (p, x0, x1, z0, z1) => {
      p.moveTo(X(x0), Y(z0)); p.lineTo(X(x1), Y(z0));
      p.lineTo(X(x1), Y(z1)); p.lineTo(X(x0), Y(z1)); p.closePath();
    };

    // ---- material region, even-odd: outer − cavity + stem tube − slot (− recess)
    const inW = d.inW, slotD = Math.min(P.stemSlotDepth, P.cavityH);
    const solid = new Path2D();
    solid.moveTo(X(-P.capW / 2), Y(0)); solid.lineTo(X(P.capW / 2), Y(0));
    solid.lineTo(X(P.topW / 2), Y(P.capH)); solid.lineTo(X(-P.topW / 2), Y(P.capH)); solid.closePath();
    rect(solid, -inW / 2, inW / 2, 0, P.cavityH);
    rect(solid, -P.stemDia / 2, P.stemDia / 2, 0, P.cavityH);
    rect(solid, -P.stemSpan / 2, P.stemSpan / 2, 0, slotD);
    const spans = legendSpansAtY0();
    if (P.logoMode !== 'raised' && logoRings)
      for (const [x0, x1] of spans) rect(solid, x0, x1, P.capH - d.legDepth, P.capH);

    // 45° section hatch inside the material
    g.save();
    g.clip(solid, 'evenodd');
    g.strokeStyle = rule; g.lineWidth = 1;
    const hatch = new Path2D();
    for (let s = -H; s < W + H; s += 5) { hatch.moveTo(s, 0); hatch.lineTo(s + H, H); }
    g.stroke(hatch);
    g.restore();
    g.strokeStyle = ink; g.lineWidth = 1.25;
    g.stroke(solid);
    // build-plate line
    g.strokeStyle = ink3; g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(-P.capW / 2 - 3), Y(0)); g.lineTo(X(P.capW / 2 + 3), Y(0)); g.stroke();

    // ---- legend
    if (logoRings && spans.length) {
      g.fillStyle = accent;
      for (const [x0, x1] of spans) {
        const z0 = P.logoMode === 'raised' ? P.capH : P.capH - d.legDepth;
        const z1 = P.logoMode === 'raised' ? P.capH + P.logoDepth : P.capH;
        g.fillRect(X(x0), Y(z1), (x1 - x0) * k, (z1 - z0) * k);
      }
    }

    // ---- dimensions
    g.font = '500 10px "IBM Plex Mono", monospace';
    g.strokeStyle = ink3; g.fillStyle = ink3; g.lineWidth = 1;
    const arrow = (x, y, dx, dy) => {
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + dx * 4 - dy * 2.2, y + dy * 4 + dx * 2.2);
      g.lineTo(x + dx * 4 + dy * 2.2, y + dy * 4 - dx * 2.2);
      g.closePath(); g.fill();
    };
    const dimH = (mmA, mmB, z, label, off) => {
      const y = Y(z) + off;
      g.beginPath(); g.moveTo(X(mmA), y); g.lineTo(X(mmB), y); g.stroke();
      arrow(X(mmA), y, 1, 0); arrow(X(mmB), y, -1, 0);
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(label, (X(mmA) + X(mmB)) / 2, y - 2);
    };
    const dimV = (x, z0, z1, label, off) => {
      const xx = X(x) + off;
      g.beginPath(); g.moveTo(xx, Y(z0)); g.lineTo(xx, Y(z1)); g.stroke();
      arrow(xx, Y(z0), 0, -1); arrow(xx, Y(z1), 0, 1);
      g.save(); g.translate(xx - 3, (Y(z0) + Y(z1)) / 2); g.rotate(-Math.PI / 2);
      g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(label, 0, 0); g.restore();
    };
    dimH(-P.capW / 2, P.capW / 2, 0, P.capW.toFixed(1), 15);
    dimH(-P.stemSpan / 2, P.stemSpan / 2, slotD / 2, P.stemSpan.toFixed(2), 5);
    dimV(P.capW / 2, 0, P.capH, P.capH.toFixed(1), 14);
    dimV(-P.capW / 2, 0, P.cavityH, P.cavityH.toFixed(1), -14);
    dimV(-P.capW / 2, P.cavityH, P.capH, d.roofT.toFixed(1), -14);
  }

  // ---------------------------------------------------- 3D preview (WebGL)
  // A real depth buffer: the cap is an open cup with a stem inside it, and
  // painter's-algorithm sorting shreds that (interior walls punch through the
  // skirt, the legend fights the top face).  WebGL settles it per pixel.
  const cv = $('view');
  // Default camera: front-left-above, near enough head-on that the cap's +x axis
  // stays roughly horizontal on screen.  The old default sat in the +x/+y quadrant,
  // i.e. behind the cap, which projected +x to screen-left and +y to screen-down —
  // the top face came up rotated 180°.  Nobody could see that while the bundled
  // sample logo was the only artwork, because it is symmetric; type "F13" on it
  // and the legend reads upside down.  Front-right also makes "dịch ngang +" move
  // the legend to the right on screen, which is the only thing the slider can
  // sensibly mean.
  let az = -1.20, el = 0.42, zoom = 1, drag = null;
  let gl = null, prog = null, vbo = null, gridVbo = null, nTri = 0, nGrid = 0, U = {}, A = {};

  const VS = `
    attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
    uniform vec3 uRight, uUp, uDir, uCenter;
    uniform vec2 uS; uniform float uSz;
    varying vec3 vNor; varying vec3 vCol;
    void main(){
      vec3 v = aPos - uCenter;
      gl_Position = vec4(dot(uRight,v)*uS.x, dot(uUp,v)*uS.y, -dot(uDir,v)*uSz, 1.0);
      vNor = aNor; vCol = aCol;
    }`;
  const FS = `
    precision mediump float;
    uniform vec3 uLight, uGround; uniform float uFlat;
    varying vec3 vNor; varying vec3 vCol;
    void main(){
      vec3 n = normalize(vNor);
      if (!gl_FrontFacing) n = -n;
      float lam = max(dot(n, uLight), 0.0);
      float t = uFlat > 0.5 ? 1.0 : 0.32 + 0.68 * lam;
      gl_FragColor = vec4(mix(uGround, vCol, t), 1.0);
    }`;

  function initGL() {
    gl = cv.getContext('webgl', { antialias: true, alpha: false, depth: true });
    if (!gl) return false;
    const sh = (type, src) => {
      const o = gl.createShader(type);
      gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    for (const n of ['aPos', 'aNor', 'aCol']) A[n] = gl.getAttribLocation(prog, n);
    for (const n of ['uRight','uUp','uDir','uCenter','uS','uSz','uLight','uGround','uFlat'])
      U[n] = gl.getUniformLocation(prog, n);
    vbo = gl.createBuffer(); gridVbo = gl.createBuffer();
    gl.enable(gl.DEPTH_TEST);
    return true;
  }
  const glOK = (() => { try { return initGL(); } catch (e) { return false; } })();
  if (!glOK) {
    const w = document.createElement('p');
    w.className = 'hint'; w.style.cssText = 'left:12px;top:12px;bottom:auto;max-width:60%';
    w.textContent = 'Trình duyệt này không bật WebGL nên không có xem trước 3D — bản vẽ mặt cắt bên dưới vẫn đúng.';
    document.querySelector('.viewwrap').appendChild(w);
  }

  const rgb = (s) => {
    s = (s || '').trim();
    if (s[0] === '#') {
      const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1);
      return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
    }
    const m = s.match(/-?\d+\.?\d*/g);
    return m ? [m[0]/255, m[1]/255, m[2]/255] : [0.5, 0.5, 0.5];
  };
  const cssVar = (n) => getComputedStyle(document.body).getPropertyValue(n);

  /** Expand the meshes to flat-shaded triangles + a build-plate grid. */
  function upload() {
    if (!glOK || !built) return;
    const capCol = rgb(P.capColor || cssVar('--cap-face'));
    const logoCol = rgb(P.logoColor || cssVar('--logo-lit'));
    const out = [];
    for (const item of built.preview) {
      const M = item.mesh, c = item.kind === 'logo' ? logoCol : capCol;
      for (const f of M.F) {
        const a = M.V[f[0]], b = M.V[f[1]], q = M.V[f[2]];
        const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], v = [q[0]-a[0], q[1]-a[1], q[2]-a[2]];
        let n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        const L = Math.hypot(n[0], n[1], n[2]) || 1;
        n = [n[0]/L, n[1]/L, n[2]/L];
        const zb = item.zBias || 0;
        for (const p of [a, b, q]) out.push(p[0], p[1], p[2] + zb, n[0], n[1], n[2], c[0], c[1], c[2]);
      }
    }
    nTri = out.length / 9;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);

    const gcol = rgb(cssVar('--grid')), gg = [];
    const G = Math.ceil(P.capW / 2 / 5) * 5 + 5;
    for (let i = -G; i <= G; i += 5) {
      gg.push(i, -G, 0, 0, 0, 1, gcol[0], gcol[1], gcol[2],  i, G, 0, 0, 0, 1, gcol[0], gcol[1], gcol[2]);
      gg.push(-G, i, 0, 0, 0, 1, gcol[0], gcol[1], gcol[2],  G, i, 0, 0, 0, 1, gcol[0], gcol[1], gcol[2]);
    }
    nGrid = gg.length / 9;
    gl.bindBuffer(gl.ARRAY_BUFFER, gridVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gg), gl.STATIC_DRAW);
  }

  function bindAttribs() {
    const S = 9 * 4;
    gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, S, 0);
    gl.vertexAttribPointer(A.aNor, 3, gl.FLOAT, false, S, 12);
    gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(A.aPos);
    gl.enableVertexAttribArray(A.aNor);
    gl.enableVertexAttribArray(A.aCol);
  }

  function render() {
    if (!glOK || !built) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    gl.viewport(0, 0, cv.width, cv.height);
    const ground = rgb(cssVar('--sunk'));
    gl.clearColor(ground[0], ground[1], ground[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const d = derived();
    const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    const dir = [ce*ca, ce*sa, se], right = [-sa, ca, 0], up = [-se*ca, -se*sa, ce];
    const k = (Math.min(W, H) / (P.capW * 1.5)) * zoom;
    const Lv = (() => { const v = [-0.42, -0.66, 0.62], n = Math.hypot(v[0],v[1],v[2]); return v.map((x)=>x/n); })();

    gl.useProgram(prog);
    gl.uniform3fv(U.uRight, right); gl.uniform3fv(U.uUp, up); gl.uniform3fv(U.uDir, dir);
    gl.uniform3fv(U.uCenter, [0, 0, d.totalH / 2]);
    gl.uniform2fv(U.uS, [2 * k / W, 2 * k / H]);
    gl.uniform1f(U.uSz, 1 / 90);
    gl.uniform3fv(U.uLight, Lv);
    gl.uniform3fv(U.uGround, ground);

    gl.uniform1f(U.uFlat, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, gridVbo); bindAttribs();
    gl.drawArrays(gl.LINES, 0, nGrid);

    gl.uniform1f(U.uFlat, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); bindAttribs();
    gl.drawArrays(gl.TRIANGLES, 0, nTri);
  }

  cv.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, az, el };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    az = drag.az + (e.clientX - drag.x) * 0.008;
    el = clamp(drag.el + (e.clientY - drag.y) * 0.008, -1.45, 1.45);
    render();
  });
  cv.addEventListener('pointerup', () => { drag = null; });
  cv.addEventListener('pointercancel', () => { drag = null; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = clamp(zoom * (e.deltaY > 0 ? 0.92 : 1.087), 0.4, 4);
    render();
  }, { passive: false });

  new ResizeObserver(() => { render(); drawSection(); }).observe(document.querySelector('.stage'));

  // ------------------------------------------------------------- download
  let toastT = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 3400);
  }

  // `note` is appended to the success toast rather than toasted separately: two
  // toasts in a row means the second overwrites the first, and the one that gets
  // overwritten is always the one that mattered.
  async function offer(filename, bytes, note = '') {
    const done = (verb) => toast(verb + ' ' + filename + (note ? ' — ' + note : ''));
    if (!SANDBOXED) {
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      done('Đã tải');
      return;
    }
    const dl = await window.claude.use('downloads');
    if (!dl) { toast('Bản này không tải file được — dùng bản HTML offline.'); return; }
    try {
      await dl.save({ filename, data: new Blob([bytes]) });
      done('Đã lưu');
    } catch (e) {
      if (e && e.code === 'declined') return;
      if (e && e.code === 'rejected_extension')
        toast('Trang đã publish chỉ lưu được .json — mở bản HTML offline để xuất ' + filename.split('.').pop());
      else toast('Không lưu được file: ' + (e && e.message ? e.message : 'lỗi không rõ'));
    }
  }

  const deburr = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const slug = () => (deburr(logoSlug || 'keycap').replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40)) || 'keycap';

  $('dl3mf').onclick = () => {
    const n = clamp(Math.round(P.count) || 1, 1, 40);
    offer(`${slug()}-${P.capW.toFixed(1)}mm-x${n}.3mf`,
      exportKeycap3mf({ ...P, name: slug() }, logoRings, n, P.plate));
  };
  // An STL is one solid with no negative parts, so the cutout that makes a
  // recessed or through legend simply is not in the file: what comes out is a
  // blank cap.  Say so instead of letting it look like an export that worked.
  $('dlstl').onclick = () => {
    const lost = logoRings && P.logoMode !== 'raised'
      ? (P.logoMode === 'through'
          ? '.stl không mang được phần khoét nên logo xuyên sáng mất hẳn, cap ra đặc. Dùng .3mf.'
          : '.stl không mang được phần khoét nên logo khắc lõm mất, cap ra trơn. Dùng .3mf.')
      : '';
    offer(`${slug()}-${P.capW.toFixed(1)}mm.stl`,
      exportKeycapStl({ ...P, name: slug() }, logoRings), lost);
  };
  // ------------------------------------------------- calibration plate
  const calOpts = () => ({
    from: parseFloat($('calFrom').value), to: parseFloat($('calTo').value),
    step: parseFloat($('calStep').value),
    // the strip has to test the stem the user is actually about to print
    stemArm: P.stemArm, stemSlotDepth: P.stemSlotDepth, stemDia: P.stemDia,
    leadIn: P.leadIn, leadInH: P.leadInH,
  });
  function drawCalInfo() {
    const o = calOpts();
    if (!isFinite(o.from) || !isFinite(o.to) || !isFinite(o.step)) { $('calInfo').textContent = ''; return; }
    const spans = calSpans(o);
    const over = Math.round((o.to - o.from) / Math.max(0.01, Math.abs(o.step))) + 1 > 24;
    $('calInfo').textContent = `${spans.length} mẩu: ` +
      spans.map((s) => s.toFixed(2)).join(' · ') + (over ? ' (giới hạn 24 mẩu)' : '');
  }
  for (const k of ['calFrom', 'calTo', 'calStep']) $(k).addEventListener('input', drawCalInfo);
  $('dlcal').onclick = () => {
    const o = calOpts();
    if (!isFinite(o.from) || !isFinite(o.to) || o.to < o.from) {
      toast('Khoảng khe không hợp lệ — “đến” phải lớn hơn hoặc bằng “từ”'); return;
    }
    const spans = calSpans(o);
    offer(`khe-hieu-chuan-${spans[0].toFixed(2)}-${spans[spans.length - 1].toFixed(2)}.3mf`,
      exportCalibration3mf(o, P.plate));
  };

  // ---------------------------------------------------- switch holder base
  const H_KEYS = { hCount: 'count', hPitch: 'pitch', hCut: 'cut', hPlateT: 'plateT',
                   hWell: 'well', hWellH: 'wellH', hBodyW: 'bodyW',
                   hFloor: 'floor', hFloorHole: 'floorHole', hFootGrow: 'footGrow',
                   hLoopHole: 'loopHole', hLoopOut: 'loopOut', hLoopW: 'loopW', hLoopT: 'loopT' };
  const holderOpts = () => {
    const o = { loop: $('hLoop').checked };
    for (const [id, key] of Object.entries(H_KEYS)) {
      const v = parseFloat($(id).value);
      if (isFinite(v)) o[key] = v;
    }
    return o;
  };
  function drawHolder() {
    const i = holderInfo(holderOpts());
    $('hInfo').textContent =
      `${i.n} switch · đế ${i.W.toFixed(1)} × ${i.D.toFixed(1)} × ${i.H.toFixed(1)} mm · ` +
      `dư so với lỗ chuẩn +${i.clr.toFixed(2)} mm · gờ cho ngàm ${i.ledge.toFixed(2)} mm · ` +
      `hốc sâu ${i.under.toFixed(1)}/${i.need.toFixed(1)} mm · ` +
      (i.floor > 0 ? `đáy kín ${i.floor.toFixed(1)} mm` : 'mặt sau HỞ') +
      (i.floorHole > 0 ? ` (lỗ đẩy ⌀${i.floorHole.toFixed(1)})` : '') +
      (i.loop ? ` · tai ⌀${i.loop.hole.toFixed(1)} mm, hai bên còn ${i.loop.side.toFixed(1)} mm` : '');
    for (const id of ['hLoopHole', 'hLoopOut', 'hLoopW', 'hLoopT'])
      $(id).disabled = !$('hLoop').checked;
    $('hFloorHole').disabled = !(i.floor > 0);
    $('hMsgs').innerHTML = i.warn.length
      ? i.warn.map((s) => `<li>${s}</li>`).join('')
      : '<li class="good">Đúng chuẩn MX plate-mount — switch sẽ ấn vào và kẹp được.</li>';
  }
  for (const id of Object.keys(H_KEYS)) $(id).addEventListener('input', drawHolder);
  $('hLoop').addEventListener('change', drawHolder);
  // A warning here means the switch will not go in or will not stay in, which is
  // a wasted print — so it takes a second click.  Two clicks, not a modal dialog:
  // a confirm() blocks the whole page and some embeddings refuse it outright.
  let holderArmed = false;
  $('dlholder').onclick = () => {
    const o = holderOpts();
    const i = holderInfo(o);
    if (i.warn.length && !holderArmed) {
      holderArmed = true;
      setTimeout(() => { holderArmed = false; }, 6000);
      toast('Đế đang có cảnh báo ở trên — bấm lần nữa nếu vẫn muốn xuất');
      return;
    }
    holderArmed = false;
    offer(`de-switch-mx-${i.n}x${o.loop ? '-mockhoa' : ''}.3mf`, exportHolder3mf(o, P.plate));
  };

  $('dljson').onclick = () => {
    const cfg = { app: 'xuong-keycap-mx', v: 1, params: P, logo: logoName || null,
                  logoRings: logoRings || null };
    offer(`${slug()}-thongso.json`, new TextEncoder().encode(JSON.stringify(cfg, null, 1)));
  };

  if (SANDBOXED) {
    $('dl3mf').disabled = true; $('dlstl').disabled = true;
    $('dlcal').disabled = true; $('dlholder').disabled = true;
    $('dlNote').innerHTML = 'Trang đã publish chỉ được lưu các định dạng trong danh sách cho phép, <b>không có .3mf/.stl</b>. ' +
      'Chỉnh xong ở đây rồi bấm <b>Lưu thông số .json</b>, mở file HTML offline và nạp lại — hoặc xuất trực tiếp trong bản offline.';
    const load = document.createElement('label');
    load.className = 'file'; load.style.marginTop = '8px';
    load.innerHTML = '<b>Nạp thông số .json</b>đã lưu từ trước<input type="file" accept=".json">';
    load.querySelector('input').addEventListener('change', (e) => loadCfg(e.target.files[0]));
    $('dlNote').parentNode.insertBefore(load, $('dlNote'));
  } else {
    $('dlNote').innerHTML = 'File .3mf chứa 2 part gán sẵn extruder 1 (thân) và 2 (logo) — mở Bambu Studio là in 2 màu được ngay.';
    const load = document.createElement('label');
    load.className = 'file'; load.style.marginTop = '8px';
    load.innerHTML = '<b>Nạp thông số .json</b>đã lưu từ trước<input type="file" accept=".json">';
    load.querySelector('input').addEventListener('change', (e) => loadCfg(e.target.files[0]));
    $('dlNote').parentNode.insertBefore(load, $('dlNote'));
  }

  async function loadCfg(file) {
    if (!file) return;
    try {
      const cfg = JSON.parse(await file.text());
      if (!cfg || !cfg.params) throw new Error('shape');
      P = { ...P, ...cfg.params };
      if (cfg.logoRings) { logoRings = cfg.logoRings; rawField = null; logoName = cfg.logo || 'logo'; logoSlug = logoName; $('fileName').textContent = logoName; }
      clearPreset(); syncInputs(); rebuild();
      toast('Đã nạp thông số');
    } catch (e) { toast('File .json không đúng định dạng của công cụ này'); }
  }

  // ------------------------------------------------------------------ boot
  $('fileName').textContent = logoName;
  syncInputs();
  drawCalInfo();
  drawHolder();
  rebuild();
})();
