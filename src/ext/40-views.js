  // ---- views: one canvas each (overlay, panel preview) -------------------------
  function makeView(canvas, kind) {
    const hazeA = document.createElement("canvas"), hazeB = document.createElement("canvas");
    return {
      cv: canvas, ctx: canvas.getContext("2d"), kind, key: "", style: null,
      w: 0, h: 0, dpr: 1, g: null, level: 0,
      hazeA, hazeB, hctxA: hazeA.getContext("2d"), hctxB: hazeB.getContext("2d"),
    };
  }
  const V = { main: null, preview: null };

  /** geo (main view): { H0: stage height, S0: v3's ring box (cover size), alc: "Alcance" 0.2..1 };
      preview / offline callers may omit it (then the canvas itself is the stage) */
  function layoutView(v, style, w, h, geo) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(v.kind === "preview" ? 120 : 200, Math.round(w));
    h = Math.max(v.kind === "preview" ? 60 : 120, Math.round(h));
    const alc = clamp(num(geo && geo.alc, (CFG.reach && CFG.reach[style] != null ? CFG.reach[style] : DEFAULTS.reach[style]) / 100), REACH_MIN / 100, REACH_MAX / 100);
    const H0 = Math.round(num(geo && geo.H0, h)), S0 = Math.round(num(geo && geo.S0, 0)), zmax = Math.max(1, num(geo && geo.zmax, 1));
    const key = style + ":" + w + "x" + h + "@" + dpr + "#" + PAL.ver + "|" + alc + "|" + H0 + "|" + S0 + "|" + zmax + elGeoKey();   // a new colour pair rebuilds the gradients; v5b: the layers' own layout parts
    if (v.key === key) return false;
    const prev = v.style === style ? v.g : null;     // r2: the layouts carry its whole state (dynResample / capResample)
    v.key = key; v.style = style; v.w = w; v.h = h; v.dpr = dpr; v.alc = alc; v.H0 = H0; v.S0 = S0; v.zmax = zmax; v.palVer = PAL.ver;
    v.cv.width = Math.round(w * dpr);
    v.cv.height = Math.round(h * dpr);
    v.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hw = Math.max(16, Math.round(w / 8)), hh = Math.max(8, Math.round(h / 8));
    v.hazeA.width = v.hazeB.width = hw;
    v.hazeA.height = v.hazeB.height = hh;
    IMPL[style].layout(v, prev);
    layoutLayers(v);                                // v5 extension point (v5b: the per-element layers)
    return true;
  }

  /** blur the small haze canvas and stretch it back over the view */
  function blitHaze(v, alpha) {
    const hb = v.hctxB, hw = v.hazeA.width, hh = v.hazeA.height, c = v.ctx;
    hb.clearRect(0, 0, hw, hh);
    hb.filter = "blur(2px)";
    hb.drawImage(v.hazeA, 0, 0);
    hb.filter = "none";
    c.globalAlpha = clamp(alpha, 0, 1);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "low";        // bilinear is enough for a blurred haze (and much cheaper)
    c.drawImage(v.hazeB, 0, 0, v.w, v.h);
    c.globalAlpha = 1;
  }

  // ---- v4 bar dynamics: "Volta" (slow fall) + additive hits ------------------------
  /** x up to SAT_KNEE, then eases into sm (a slight overshoot past the "Alcance" range: SAT_MAX, up to SAT_HI at 500%) */
  function sat(x, sm) {
    if (x <= SAT_KNEE) return x > 0 ? x : 0;
    const r = (sm || SAT_MAX) - SAT_KNEE;
    return SAT_KNEE + r * (1 - Math.exp(-(x - SAT_KNEE) / r));
  }
  function satInv(y, sm) {
    if (y <= SAT_KNEE) return y > 0 ? y : 0;
    const M = sm || SAT_MAX, r = M - SAT_KNEE;
    return SAT_KNEE - r * Math.log(Math.max(1e-4, 1 - (Math.min(y, M - 1e-4) - SAT_KNEE) / r));
  }
  /** r2: what an "Intensidade" above 200% adds (0 at <= OVER_FROM, v5: 1 at INT_MAX 500%, so 400 -> 500% still
      grows): the hits get wider (more bars at full height) and overshoot more (up to SAT_HI); the in-between movement
      keeps its 200% level, so the bars do not just sit higher and the kicks stay as big */
  const overOf = (gain) => clamp((gain * 100 - OVER_FROM) / (INT_MAX - OVER_FROM), 0, 1);
  const satMaxOf = (gain) => SAT_MAX + (SAT_HI - SAT_MAX) * overOf(gain);
  /** the slowly falling body never fills the range: above 0.6 it eases into BODY_MAX (room for the next kick) */
  function bodyCap(x) {
    const k = 0.6, r = BODY_MAX - k;
    return x <= k ? x : k + r * (1 - Math.exp(-(x - k) / r));
  }
  /** "Volta" of a style (ms): the argument, else the setting */
  const fallOf = (id, ms) => clamp(num(ms, CFG.fall && CFG.fall[id] != null ? CFG.fall[id] : 700), FALL_MIN, FALL_MAX);
  const DYN_KEYS = ["base", "R", "X", "slope", "body", "rate", "h", "ip"];
  /** per-bar state of the hit part: base (the level the current hit adds to), R / X / slope (the falling ceiling
      of the hit: its part below RAMP_KNEE, the part above it, R's fall rate), body (the slow part) and its fall
      rate, h (the hit part's height, before the texture), ip (the previous frame's impulse); id = the hit, sm =
      the overshoot ceiling */
  function dynState(n) {
    const D = { id: -1, sm: SAT_MAX };
    for (const k of DYN_KEYS) D[k] = new Float32Array(n);
    return D;
  }
  /** r2: the same state resampled to n bars (map(i) = the old index). A re-layout ("Alcance", a colour pair, the
      window size) keeps every part of it, the hit id included, so nothing jumps and no hit is counted twice
      (v4.0 copied the blended height into both the hit and the rest part and fired a fake "new hit") */
  function dynResample(D, n, map) {
    const N = dynState(n);
    for (const k of DYN_KEYS) { const s = D[k], d = N[k]; for (let i = 0; i < n; i++) d[i] = s[map(i)]; }
    N.id = D.id; N.sm = D.sm;
    return N;
  }
  /** one frame of bar i. imp = the hit impulse now (the dense design's per-hit shape x this bar's amplitude, without
      the per-bar texture: that is applied to the result, after the saturation, so saturated hits stay ragged),
      fresh = a new dominant hit started (its attack is often over by this frame: the level under it is what the bar
      showed minus the previous frame's impulse, which a retriggered hit starts from). ADDITIVE: the impulse rides on
      the level under it (base), so a hit on top of high bars still kicks up; the hit's peak falls back (R / X) and
      as the impulse decays a slow body (<= BODY_MAX) keeps the bar up, falling the same way. The part above the body
      falls with the impulse (the dense look-ahead valleys), which leaves room for the next kick. */
  function dynStep(D, i, imp, fresh, dt, fallMs) {
    const sm = D.sm, ip0 = D.ip[i];
    if (fresh) D.base[i] = Math.max(0, satInv(D.h[i], sm) - ip0);
    D.ip[i] = imp;
    const T = sat(D.base[i] + imp, sm);
    // the hit's peak falling back: the part above RAMP_KNEE (the kick zone) in about 0.3 x "Volta" (25..260 ms), the
    // rest linearly to 10% in "Volta", so between dense hits the bar settles below ~0.8 and the next kick has room
    // while the visible return stays as slow as "Volta" says. r2: a falling STATE that only a higher target lifts
    // (v4.0 restarted a ramp whenever "T >= its peak", and a Float32 peak equals a constant T: a new hit id with no
    // impulse - a track change before the new track's first hit, the fallback handing over to the analysis -
    // restarted it every frame and froze the bars for the whole intro). Only a RISING impulse (an attack) lifts it:
    // the level a hit adds to (base) is a constant, so a falling ceiling is what brings it down
    let R = D.R[i] - D.slope[i] * dt, X = D.X[i] * Math.exp(-dt / clamp(0.3 * fallMs, 25, 260));
    if (R < 0) R = 0;
    if (imp > ip0 + 1e-5 && T > R + X + 1e-4) { R = T < RAMP_KNEE ? T : RAMP_KNEE; X = T - R; D.slope[i] = (0.9 * R) / fallMs; }
    D.R[i] = R; D.X[i] = X;
    const top = R + X, Te = T < top ? T : top;
    let B = D.body[i];
    // a real new peak sets the body's fall rate (to 10% in "Volta"); a ceiling that merely catches up with the
    // falling body lifts it without slowing it down (r2: v4.0 reset the rate to the lower level each time, so the
    // last part of the fall took ever longer)
    if (Te > B) { const c = bodyCap(Te); if (c > B + 0.01) { B = c; D.rate[i] = (0.9 * B) / fallMs; } else if (c > B) { B = c; if (D.rate[i] < (0.9 * B) / fallMs) D.rate[i] = (0.9 * B) / fallMs; } }   // v6: no stuck body
    B -= D.rate[i] * dt;
    if (B < 0) B = 0;
    D.body[i] = B;
    const H = Te > B ? Te : B;
    D.h[i] = H;
    return H;
  }
  /** falling peak caps ("tracinhos"): jump to a new height, hold, then fall with gravity onto the bar; r2: the hold
      and the fall follow "Volta" (setCapTiming), so with "Rápida" they do not hang above bars that are already down */
  function capState(n) {
    return { v: new Float32Array(n), vel: new Float32Array(n), hold: new Float32Array(n), hold0: CAP_HOLD_MS, g: 2 / (CAP_FALL_MS * CAP_FALL_MS) };
  }
  function capResample(C, n, map) {
    const N = capState(n);
    for (const k of ["v", "vel", "hold"]) { const s = C[k], d = N[k]; for (let i = 0; i < n; i++) d[i] = s[map(i)]; }
    N.hold0 = C.hold0; N.g = C.g;
    return N;
  }
  function setCapTiming(C, fallMs) {
    const F = clamp(1.3 * fallMs, 250, 2600);
    C.hold0 = Math.min(CAP_HOLD_MS, 0.3 * fallMs);
    C.g = 2 / (F * F);
  }
  function capStep(C, i, h, dt) {
    if (h >= C.v[i]) { C.v[i] = h; C.vel[i] = 0; C.hold[i] = C.hold0; return; }
    if (C.hold[i] > 0) { C.hold[i] -= dt; return; }
    C.vel[i] += C.g * dt;
    C.v[i] -= C.vel[i] * dt;
    if (C.v[i] < h) { C.v[i] = h; C.vel[i] = 0; }
  }
  /** r2: the rest (mids / hats) alone eases into REST_MAX, so it cannot fill the headroom the hits need */
  function restSoft(x) {
    if (x <= REST_KNEE) return x;
    const r = REST_MAX - REST_KNEE;
    return REST_KNEE + r * (1 - Math.exp(-(x - REST_KNEE) / r));
  }
  /** displayed height: the hit part screen-blended with the rest (mids / hats), that blend capped softly at
      REST_MAX; a hit above it shows as it is (the overshoot kept) */
  /** v6: the hit part ON TOP of the rest (see ND_KADD): rest + hit x (1 - ND_KOV x rest), softly capped (sat) */
  function blendA(hH, sm, hR) {
    if (!ND_KADD) return blendH(hH, hR);
    if (hH >= 1) return hH;
    const r = restSoft(hR), x = sat(r + hH * (1 - ND_KOV * r), sm);
    return x > hH ? x : hH;
  }
  function blendH(hH, hR) {
    if (hH >= 1) return hH;
    const b = restSoft(1 - (1 - hH) * (1 - hR));
    return b > hH ? b : hH;
  }
  /** r2: a fresh start for a view's visualizer (entering ambient mode, opening the panel): every part of the state,
      not only the drawn height (v4.0 only cleared hgt, which is rebuilt from the rest every frame) */
  function resetDyn(v) {
    // v5b: the per-element layers start fresh too (no envelope, entry age or tick carried over; the orbit restarts)
    const Z = v && (v === V.main ? SIG.main : v === V.preview ? SIG.preview : null);
    if (Z && Z.ext) Z.ext.el = null;
    if (v && v.el) v.el.e0 = null;
    const G = v && v.g;
    if (!G) return;
    if (G.dyn) G.dyn = dynState(G.dyn.h.length);
    if (G.caps) G.caps = capState(G.caps.v.length);
    for (const k of ["hr", "hgt", "ampR", "amp"]) if (G[k]) G[k].fill(0);
    if (G.kick) G.kick = 1;
  }
  /** r2: the size of a style's level 1 in the overlay (px) at "Alcance" alc: as v4 up to 60% (lin x alc), then
      growing to the largest size whose biggest hit (SAT_HI overshoot x the strongest camera zoom zmax) still ends
      TOP_MARGIN below the window's top (v4.0 sized 100% with the zoom off, so the zoom pushed it off the window).
      H0 = window height, S0 = v3's ring box (the cover keeps its size). Bars: half-height; ring: { rc, r0, len };
      wave: the main ribbon's amplitude unit (three sines rarely line up past ~0.9 of their sum) */
  function styleSize(style, H0, S0, alc, zmax) {
    const up = VIS_CY * H0, z = Math.max(1, zmax || 1);
    const grow = (lin, fit) => {
      const a = lin * 0.6, b = Math.max(fit, a);
      return alc <= 0.6 ? lin * alc : a + (b - a) * ((alc - 0.6) / 0.4);
    };
    if (style === "ring") {
      // v5b-r2: the dot ring ("Agudos e chimbal", 1.12 x len) no longer shrinks the budget (v5b: -13 % crown at
      // Alcance 100 %): its dots fade before the window top and the title instead (elOver), as in v5a
      const rc = S0 * 0.205, r0 = rc + S0 * 0.035, dk = SAT_HI, dp = 0;
      const lin = (up - r0 * 1.1 - 14) / SAT_MAX, fit = ((up - TOP_MARGIN) / z - r0 * 1.1 - 2 - dp) / dk;
      return { rc, r0, len: Math.max(16, grow(lin, fit)) };
    }
    if (style === "bars") return Math.max(8, grow(REACH_H * H0, (up - TOP_MARGIN) / (SAT_HI * z)));
    return Math.max(8, grow(REACH_H * H0, (up - TOP_MARGIN) / (z * 1.15 * SAT_HI * 0.9)));
  }

