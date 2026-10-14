  // ---- settings ----------------------------------------------------------------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function sanitize(o) {
    const d = clone(DEFAULTS);
    if (!o || typeof o !== "object") return d;
    const pctv = (v, def) => clamp(Math.round(num(Number(v), def) / 5) * 5, 0, INT_MAX);
    d.enabled = o.enabled !== false;
    d.style = STYLE_IDS.includes(o.style) ? o.style : d.style;
    for (const id of STYLE_IDS) {
      d.intensity[id] = pctv(o.intensity && o.intensity[id], DEFAULTS.intensity[id]);
      d.reach[id] = reachStep(o.reach && o.reach[id], DEFAULTS.reach[id]);
      d.fall[id] = fallStep(o.fall && o.fall[id], DEFAULTS.fall[id]);
      if (id in d.caps) d.caps[id] = !(o.caps && o.caps[id] === false);
    }
    for (const k of ["zoom", "glow", "groove"]) {
      const s = o[k] || {};
      d[k].on = s.on !== false;
      d[k].amount = pctv(s.amount, DEFAULTS[k].amount);
    }
    // "Camadas por elemento": settings v5 only ADD this box (every older choice is kept); saved once at boot
    const ly = o.layers && typeof o.layers === "object" ? o.layers : null;
    if (!ly) SETTINGS_MIGRATED = true;
    d.layers.on = !(ly && ly.on === false);
    for (const k of ["low", "voice", "air", "entry", "snare", "mood"]) {
      const s = (ly && ly[k] && typeof ly[k] === "object") ? ly[k] : {};
      d.layers[k].on = s.on !== false;
      d.layers[k].amount = pctv(s.amount, DEFAULTS.layers[k].amount);
    }
    d.layers.hue = !(ly && ly.hue === false);
    // settings v6: the core mix changed (the kick ~1.2 x each other element, a small kick zoom and a big one on
    // the bass entry, no beat motion without drums), so settings saved by v5 or older restart from the defaults for every
    // style's "Intensidade" / "Alcance" / "Volta" and every effect / layer amount. Kept: style, colours, wallpaper,
    // rhythm, caps, idle time and every on / off choice. Saved once at boot (SETTINGS_MIGRATED). An object without a
    // version (debug API / offline tools) is taken as it is.
    const ver = Number(o.v);
    if (isFinite(ver) && ver < 6) {
      for (const id of STYLE_IDS) { d.intensity[id] = DEFAULTS.intensity[id]; d.reach[id] = DEFAULTS.reach[id]; d.fall[id] = DEFAULTS.fall[id]; }
      for (const k of ["zoom", "glow", "groove"]) d[k].amount = DEFAULTS[k].amount;
      for (const k of ["low", "voice", "air", "entry", "snare", "mood"]) d.layers[k].amount = DEFAULTS.layers[k].amount;
      SETTINGS_MIGRATED = true;
    }
    d.idleSec = IDLE_CHOICES.includes(Number(o.idleSec)) ? Number(o.idleSec) : d.idleSec;
    d.rhythm = RHYTHMS.includes(o.rhythm) ? o.rhythm : d.rhythm;
    // settings v5: the manual / calibrated "Sincronia" values (older "latency", "latencyDev") are dropped: every output
    // gets its automatic value again (deviceDefault). Saved once at boot without them.
    if ("latency" in o || "latencyDev" in o) SETTINGS_MIGRATED = true;
    const c = o.colors && typeof o.colors === "object" ? o.colors : {};
    const pair = (v) => (Array.isArray(v) && v.length === 2 && isHex(v[0]) && isHex(v[1]) ? [v[0].toLowerCase(), v[1].toLowerCase()] : null);
    d.colors.preset = PRESET_IDS.includes(c.preset) || c.preset === "custom" || c.preset === "wall" ? c.preset : d.colors.preset;
    d.colors.custom = pair(c.custom) || d.colors.custom;
    d.colors.auto = pair(c.auto);
    const w = o.wallpaper && typeof o.wallpaper === "object" ? o.wallpaper : {};
    d.wallpaper.mode = WALL_MODES.includes(w.mode) ? w.mode : d.wallpaper.mode;
    d.wallpaper.dim = clamp(Math.round(num(Number(w.dim), 0) / 5) * 5, 0, 80);
    const blurPx = (v) => clamp(Math.round(Number(v)), 0, BLUR_MAX);
    const has = (v) => v !== null && v !== "" && v !== undefined && isFinite(Number(v));
    const hasL = has(w.layoutBlur), hasA = has(w.ambBlur), hasCL = has(w.coverLayoutBlur), hasCA = has(w.coverAmbBlur);
    if (!hasL || !hasA) {
      // settings v3: one "Desfoque" b (0..30 px) = the layout wallpaper's own blur, on top of the panels' fixed 3 px
      // glass; the overlay pre-blurred a 960 px canvas by 10 + 0.45 b px and stretched it over 110% of the window
      // (the album cover was pre-blurred 18 px at 640 px on top: ~72 px on screen, the slider's 40 px is the closest).
      // Migrated to what that looked like on screen (the screen width too, in case Spotify boots minimised).
      const b = clamp(num(Number(w.blur), 0), 0, 30);
      const winW = clamp(Math.max((typeof innerWidth === "number" && innerWidth) || 0, (typeof screen === "object" && screen && (screen.availWidth || screen.width)) || 0) || 1920, 1280, 3840);
      if (!hasL) d.wallpaper.layoutBlur = blurPx(Math.hypot(b, GLASS_BLUR));
      if (!hasA) d.wallpaper.ambBlur = blurPx((10 + b * 0.45) * (1.1 * winW / 960));
      SETTINGS_MIGRATED = true;
    } else if (!hasCL && !hasCA && w.mode === "cover") {
      // settings v4.0 on "Capa do álbum": the pair was set for the cover (40 / 40 by the v3 migration, or what was
      // chosen since); it becomes the cover's own pair, the other wallpapers get the defaults
      d.wallpaper.coverLayoutBlur = blurPx(w.layoutBlur);
      d.wallpaper.coverAmbBlur = blurPx(w.ambBlur);
      d.wallpaper.layoutBlur = DEFAULTS.wallpaper.layoutBlur;
      d.wallpaper.ambBlur = DEFAULTS.wallpaper.ambBlur;
      SETTINGS_MIGRATED = true;
      return finishWall(d, w);
    }
    if (hasL) d.wallpaper.layoutBlur = blurPx(w.layoutBlur);
    if (hasA) d.wallpaper.ambBlur = blurPx(w.ambBlur);
    if (hasCL) d.wallpaper.coverLayoutBlur = blurPx(w.coverLayoutBlur);
    if (hasCA) d.wallpaper.coverAmbBlur = blurPx(w.coverAmbBlur);
    return finishWall(d, w);
  }
  function finishWall(d, w) {
    const f = w.file;
    d.wallpaper.file = f && typeof f === "object" && typeof f.name === "string" ? {
      name: f.name.slice(0, 120), type: String(f.type || "").slice(0, 40), w: Math.round(num(f.w, 0)), h: Math.round(num(f.h, 0)),
      size: Math.round(num(f.size, 0)), at: Math.round(num(f.at, 0)), anim: !!f.anim,
    } : null;
    if (d.wallpaper.mode === "file" && !d.wallpaper.file) d.wallpaper.mode = DEFAULTS.wallpaper.mode;
    return d;
  }
  function isHex(v) { return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v); }
  function reachStep(v, def) { return clamp(Math.round(num(Number(v), def) / 5) * 5, REACH_MIN, REACH_MAX); }
  function fallStep(v, def) { return clamp(Math.round(num(Number(v), def) / 10) * 10, FALL_MIN, FALL_MAX); }
  /** "Volta": the slider steps through FALL_STEPS (roughly logarithmic, every step a round value, 0,7 s included),
      the setting is in ms */
  const fallFromPos = (p) => FALL_STEPS[clamp(Math.round(num(Number(p), 10)), 0, FALL_STEPS.length - 1)];
  const fallToPos = (ms) => {
    let k = 0;
    for (let i = 1; i < FALL_STEPS.length; i++) if (Math.abs(Math.log(FALL_STEPS[i] / ms)) < Math.abs(Math.log(FALL_STEPS[k] / ms))) k = i;
    return k;
  };
  let SETTINGS_MIGRATED = false;   // sanitize() converted old values (older "Desfoque" / "Sincronia"): saved once at boot
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    const s = clone(DEFAULTS);                          // first run: migrate the old on / off flag
    try { if (localStorage.getItem(LEGACY_KEY) === "0") s.enabled = false; } catch (e) { /* ignore */ }
    return s;
  }
  /** a new install: nothing saved by any version yet (read before anything is written). Only then does the first
      ambient mode that starts by itself show a one-time hint (how to go back, where the settings are; INTRO_KEY) */
  const FIRST_RUN = (() => {
    try { return localStorage.getItem(SETTINGS_KEY) === null && localStorage.getItem(LEGACY_KEY) === null; } catch (e) { return false; }
  })();
  let CFG = loadSettings();
  let saveTimer = 0;
  function saveSettings(immediate) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    const write = () => {
      saveTimer = 0;
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(CFG));
        localStorage.setItem(LEGACY_KEY, CFG.enabled ? "1" : "0");   // the old on / off flag stays consistent
      } catch (e) { /* ignore */ }
    };
    if (immediate) write(); else saveTimer = setTimeout(write, 250);
  }

