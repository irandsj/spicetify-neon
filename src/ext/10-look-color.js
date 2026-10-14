  // ---- look: colour maths --------------------------------------------------------
  const WHITE = [255, 255, 255], NAVY = [2, 7, 19], SURF_HI = [21, 48, 90], ICE = [234, 252, 255];
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const to255 = (v) => clamp(Math.round(v), 0, 255);
  const rgbHex = (c) => "#" + c.map((v) => to255(v).toString(16).padStart(2, "0")).join("");
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const chan = (c) => to255(c[0]) + ", " + to255(c[1]) + ", " + to255(c[2]);
  const rgbaS = (c, a) => "rgba(" + chan(c) + ", " + a + ")";
  function lum(c) {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  /** c moved towards `to` just enough to reach `ratio` against bg (c itself when it already does) */
  function towards(c, to, bg, ratio) {
    if (contrast(c, bg) >= ratio) return c;
    let lo = 0, hi = 1;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (contrast(mixc(c, to, m), bg) >= ratio) hi = m; else lo = m; }
    return mixc(c, to, hi);
  }
  /** a colour made light enough to read on bg by raising its HSL lightness
      (the hue and saturation stay, so a dark pick becomes a vivid light
      version of itself instead of a grey); c itself when it already reads */
  function lift(c, bg, ratio) {
    if (contrast(c, bg) >= ratio) return c;
    const [h, sat] = rgbHsl(c);
    let lo = rgbHsl(c)[2], hi = 1;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (contrast(hslRgb(h, sat, m), bg) >= ratio) hi = m; else lo = m; }
    return hslRgb(h, sat, hi);
  }
  /** CSS filter maths (sRGB, clamped per step, as Chromium paints <img> filters) */
  function filterHueSat(c, deg, sat, bri) {
    const r = (deg * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
    const H = [
      0.213 + co * 0.787 - si * 0.213, 0.715 - co * 0.715 - si * 0.715, 0.072 - co * 0.072 + si * 0.928,
      0.213 - co * 0.213 + si * 0.143, 0.715 + co * 0.285 + si * 0.14, 0.072 - co * 0.072 - si * 0.283,
      0.213 - co * 0.213 - si * 0.787, 0.715 - co * 0.715 + si * 0.715, 0.072 + co * 0.928 + si * 0.072,
    ];
    const S = [
      0.213 + 0.787 * sat, 0.715 - 0.715 * sat, 0.072 - 0.072 * sat,
      0.213 - 0.213 * sat, 0.715 + 0.285 * sat, 0.072 - 0.072 * sat,
      0.213 - 0.213 * sat, 0.715 - 0.715 * sat, 0.072 + 0.928 * sat,
    ];
    const mul = (M, v) => [0, 1, 2].map((i) => clamp(M[i * 3] * v[0] + M[i * 3 + 1] * v[1] + M[i * 3 + 2] * v[2], 0, 255));
    return mul(S, mul(H, c)).map((v) => clamp(v * bri, 0, 255));
  }
  /** hue-rotate / saturate / brightness that turn Spotify's green (#1ed760,
      baked into some images) into `target`: the angle that gives the right
      hue, then the saturation and brightness that come closest (CSS
      hue-rotate is an approximation, so the plain hue difference misses by
      20-26 degrees on blue / pink pairs) */
  const SPOTIFY_GREEN = [30, 215, 96];
  function greenFilter(target) {
    const th = rgbHsv(target)[0], dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const hd = (x) => { const d = Math.abs(rgbHsv(x)[0] - th) % 360; return d > 180 ? 360 - d : d; };
    let best = { deg: 0, d: Infinity };
    for (let deg = -180; deg <= 180; deg += 1) {
      const o = filterHueSat(SPOTIFY_GREEN, deg, 1.3, 1);
      const d = hd(o);
      if (d < best.d) best = { deg, d };
    }
    let fit = { sat: 1.3, bri: 1.1, d: Infinity };
    for (let deg = best.deg - 6; deg <= best.deg + 6; deg += 1) {
      for (let sat = 1; sat <= 3.01; sat += 0.1) {
        for (let bri = 0.85; bri <= 1.35; bri += 0.05) {
          const d = dist(filterHueSat(SPOTIFY_GREEN, deg, sat, bri), target);
          if (d < fit.d) fit = { deg, sat, bri, d };
        }
      }
    }
    let deg = fit.deg;
    if (deg > 180) deg -= 360;
    if (deg < -180) deg += 360;
    return { deg, sat: +fit.sat.toFixed(2), bri: +fit.bri.toFixed(2) };
  }
  function rgbHsv(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
  }
  function hsvRgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; };
    return [f(5), f(3), f(1)];
  }
  function rgbHsl(c) {
    const [h, s, v] = rgbHsv(c), l = v * (1 - s / 2);
    return [h, l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l];
  }
  function hslRgb(h, s, l) {
    const v = l + s * Math.min(l, 1 - l);
    return hsvRgb(h, v ? 2 * (1 - l / v) : 0, v);
  }
  const hueDist = (a, b) => { const d = Math.abs(rgbHsv(a)[0] - rgbHsv(b)[0]) % 360; return d > 180 ? 360 - d : d; };

  /** everything that follows from the two accents: the CSS variables of
      user.css section 1 that CSS cannot compute (channels, contrast-safe
      text versions, the text colour on accent fills) and the canvas colours
      of the visualizers. Default pair = the v1-v3 values (+-3 per channel). */
  function makePalette(h1, h2) {
    const a1 = hexRgb(h1), a2 = hexRgb(h2), mid = mixc(a1, a2, 0.5);
    const a1fg = lift(a1, SURF_HI, 4.55), a2fg = lift(a2, SURF_HI, 4.55);                   // as text / icons on the lightest navy (4.5:1 after rounding)
    const ink = towards(mixc(a2, NAVY, 0.45), NAVY, ICE, 4.6);                               // as text on the ice-white pills
    const fills = [a1, a2, mid];                                                              // the gradient: both ends and the middle
    const worst = (fg) => Math.min(contrast(fills[0], fg), contrast(fills[1], fg), contrast(fills[2], fg));
    const on = worst(NAVY) >= worst(WHITE) ? NAVY : WHITE;
    const text = mixc(WHITE, a2, 0.1), sub = mixc([231, 216, 255], a2, 0.35), muted = mixc([180, 167, 211], a2, 0.2);
    // Spotify's baked-in green images -> a2-fg (the default pair keeps its hand-tuned 47deg / 1.3 / 1.1)
    const isDefault = h1.toLowerCase() === PRESETS[0].a1 && h2.toLowerCase() === PRESETS[0].a2;
    const gf = isDefault ? { deg: 47, sat: 1.3, bri: 1.1 } : greenFilter(a2fg);
    // "announcement" (notification dots, "Novo" badges, Spicetify notifications):
    // a2 turned ~31 deg, which gives v1's own #4a8dff / #7db8ff for the default cyan
    const [ah, as, av] = rgbHsv(a2);
    const ann = hsvRgb((ah + 31) % 360, clamp(as * 0.9, 0, 1), Math.max(av, 0.75));            // dots / badges (fills)
    const annHi = lift(hsvRgb((ah + 26) % 360, clamp(as * 0.65, 0, 1), av), SURF_HI, 4.55);     // text
    const vars = {
      "--nd-a1": h1, "--nd-a2": h2, "--nd-a1-rgb": chan(a1), "--nd-a2-rgb": chan(a2),
      "--nd-a1-fg": rgbHex(a1fg), "--nd-a2-fg": rgbHex(a2fg), "--nd-a2-ink": rgbHex(ink), "--nd-on-accent": rgbHex(on),
      "--nd-line-rgb": chan(mixc(a2fg, WHITE, 0.3)),
      "--nd-a1-soft-rgb": chan(mixc(a1, WHITE, 0.55)), "--nd-a2-soft-rgb": chan(mixc(a2, WHITE, 0.6)),
      "--nd-text": rgbHex(text), "--nd-text-rgb": chan(text), "--nd-subtext": rgbHex(sub), "--nd-subtext-rgb": chan(sub),
      "--nd-muted": rgbHex(muted), "--nd-muted-rgb": chan(muted),
      "--nd-green-rotate": gf.deg + "deg", "--nd-green-sat": String(gf.sat), "--nd-green-bright": String(gf.bri),
      "--nd-announce": rgbHex(ann), "--nd-announce-rgb": chan(ann), "--nd-announce-hi": rgbHex(annHi),
    };
    const pal = {
      a1, a2, mid,
      barsCore: [rgbaS(mixc(a2, WHITE, 0.63), 1), rgbHex(mixc(a2, WHITE, 0.94)), "#ffffff", rgbHex(mixc(a1, WHITE, 0.94)), rgbaS(mixc(a1, WHITE, 0.67), 1)],
      line: rgbaS(mixc(a2, WHITE, 0.9), 0.2),
      haze: [rgbaS(a1, 0.95), rgbaS(mid, 0.85), rgbaS(a2, 0.95)],
      shadowRgb: chan(mixc(a2, WHITE, 0.55)),          // bar / ring halo (alpha added per frame)
      ringCore: ["#ffffff", rgbHex(mixc(a2, WHITE, 0.95)), rgbaS(mixc(a2, WHITE, 0.75), 0.9)],
      rim: rgbaS(mixc(a2, WHITE, 0.93), 0.9),
      coverRing: rgbaS(mixc(a2, WHITE, 0.9), 0.28),
      waveGlow: [rgbaS(a2, 0.95), rgbaS(a1, 0.95), rgbaS(mixc(mid, WHITE, 0.1), 0.9)],
      waveShadow: [rgbaS(mixc(a2, WHITE, 0.33), 0.95), rgbaS(mixc(a1, WHITE, 0.24), 0.9), rgbaS(mixc(mid, WHITE, 0.35), 0.85)],
      waveFill: [rgbaS(a2, 0), rgbaS(mixc(a2, WHITE, 0.48), 0.16), rgbaS(mixc(a2, WHITE, 0.93), 0.24), rgbaS(mixc(a1, WHITE, 0.4), 0.16), rgbaS(a1, 0)],
      flash: [chan(mixc(a2, WHITE, 0.7)), chan(a2), chan(a1)],
      ver: 0,
    };
    return { vars, pal };
  }

