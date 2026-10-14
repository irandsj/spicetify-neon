  // -- style 2: "Anel neon" -----------------------------------------------------
  // radial mirrored bars around the album cover (a speaker cone): bass kicks
  // the cover + ring outwards and drives the top / bottom bars; the sides carry
  // energy x chroma; random bars sparkle with the hats
  const RING = {
    reads: ["gate", "kickPk", "kickSh", "kickZ", "kickVis", "kickId", "low", "hat", "energy", "P12", "groove", "four"],   // + fx.sway
    layout(v, prev) {
      const w = v.w, h = v.h, small = v.kind === "preview";
      const G = { cx: w / 2, cy: h / 2 };
      // v5b-r2: the length budget is v5a's again (the dot ring fades near the edges instead of shrinking the crown)
      const dk = SAT_HI, dp = 0;
      if (small) {                               // the preview: a smaller cover, so "Alcance" shows
        const S0 = Math.min(w, h);
        G.rc = S0 * 0.15;
        G.r0 = G.rc + S0 * 0.03;
        G.len = Math.max(4, ((S0 / 2 - 4 - G.r0 * 1.1 - dp) / dk) * v.alc);
      } else {
        // the cover keeps v3's size (its box: 1180 x 620 at most); "Alcance": styleSize (zoom and overshoot included)
        const Z = styleSize("ring", v.H0 || h, v.S0 || Math.min(w, h), v.alc, v.zmax);
        G.rc = Z.rc;                             // cover radius
        G.r0 = Z.r0;                             // bars start here
        const fit = (h / 2 - 10 - G.r0 * 1.1 - dp) / dk;
        G.len = Math.max(16, Math.min(fit, Z.len));
      }
      G.n = small ? 64 : 120;                     // full circle
      G.m = G.n / 2;                              // mirrored halves
      G.barW = clamp((TAU * G.r0 / G.n) * 0.36, small ? 1.4 : 2, 5);
      G.capL = small ? 1.6 : 3.2;                 // peak cap: a short dash past the tip
      // r2: an elliptical length budget: the side bars may be up to RING_SIDE_X longer (a 16:9 window is wider than
      // tall), so a big hit bursts round / wide instead of as a tall vase; as much as the canvas width allows
      const EX = clamp((w / 2 - (small ? 3 : 30) - G.r0 * 1.1 - 2 - dp) / (G.len * dk), 1, RING_SIDE_X);
      G.cos = new Float32Array(G.n); G.sin = new Float32Array(G.n);
      for (let k = 0; k < G.n; k++) {
        const ang = -Math.PI / 2 + ((k + 0.5) / G.n) * TAU;
        G.cos[k] = Math.cos(ang); G.sin[k] = Math.sin(ang);
      }
      G.u = new Float32Array(G.m); G.q = new Float32Array(G.m); G.r = new Float32Array(G.m * 4);
      G.tb = new Float32Array(G.m); G.hgt = new Float32Array(G.m); G.ex = new Float32Array(G.m);
      G.hr = new Float32Array(G.m);               // the rest (mids / hats), smoothed on its own
      const rnd = seeded(0x2f6b1d3);
      const map = prev && prev.dyn ? (m) => Math.min(prev.m - 1, Math.floor(((m + 0.5) / G.m) * prev.m)) : null;
      for (let m = 0; m < G.m; m++) {
        const u = (m + 0.5) / G.m;                // 0 top -> 1 bottom
        G.u[m] = u;
        G.tb[m] = 0.5 + 0.5 * Math.cos(u * TAU);  // 1 at top / bottom, 0 at the sides
        G.ex[m] = 1 + (EX - 1) * G.cos[m] * G.cos[m];
        G.q[m] = clamp(u * 11 + (rnd() - 0.5) * 0.8, 0, 11);
        for (let k = 0; k < 4; k++) G.r[m * 4 + k] = rnd();
        if (map) { G.hgt[m] = prev.hgt[map(m)]; G.hr[m] = prev.hr[map(m)]; }
      }
      G.EX = EX;
      G.dyn = map ? dynResample(prev.dyn, G.m, map) : dynState(G.m);
      G.caps = map ? capResample(prev.caps, G.m, map) : capState(G.m);
      G.kick = prev ? prev.kick : 1;
      G.jOff = prev ? num(prev.jOff, 0) : 0;      // final-build: the soft mode's shimmer offset (kept across re-layouts)
      const hw = v.hazeA.width, hh = v.hazeA.height;
      const cg = v.hctxA.createConicGradient(-Math.PI / 2, hw / 2, hh / 2);
      cg.addColorStop(0, PAL.haze[2]);          // a2 at the top, a1 at the bottom
      cg.addColorStop(0.25, PAL.haze[1]);
      cg.addColorStop(0.5, PAL.haze[0]);
      cg.addColorStop(0.75, PAL.haze[1]);
      cg.addColorStop(1, PAL.haze[2]);
      G.haze = cg;
      const c = v.ctx;
      const rg = c.createRadialGradient(G.cx, G.cy, G.r0, G.cx, G.cy, G.r0 + G.len * (1 + 0.5 * (EX - 1)));
      rg.addColorStop(0, PAL.ringCore[0]);
      rg.addColorStop(0.6, PAL.ringCore[1]);
      rg.addColorStop(1, PAL.ringCore[2]);
      G.core = rg;
      if (elK()) elRingLayout(v, G, EX);         // v5b: the crown's tips lean to a1
      v.g = G;
    },
    update(v, sig, dt, gain, t, fallMs) {
      const G = v.g, P12 = sig.P12, playing = sig.gate > 0.5, gate = sig.gate, D = G.dyn, V = fallOf("ring", fallMs);
      const down = 1 - Math.exp(-dt / (playing ? clamp(V * REST_FALL_SHARE, 65, 500) : 420));   // attack: instant
      const fresh = sig.kickId !== D.id;
      D.id = sig.kickId;
      D.sm = satMaxOf(gain);
      setCapTiming(G.caps, V);
      // r2: past 200% the in-between keeps its 200% level (gR) and the sides take more of each hit (side share)
      const tS = t / 1000, mid = Math.pow(sig.energy, 1.35), gR = Math.min(gain, 2), gM = Math.sqrt(gR), over = overOf(gain);
      if (num(sig.softJ, 0) > 0) G.jOff = num(G.jOff, 0) + (dt / 1000) * SOFT_JIT * sig.softJ;   // final-build: calmer shimmer (final-fix: with the layers on)
      const tJ = tS - num(G.jOff, 0);
      const side = 0.32 + 0.12 * over;
      const lift = GROOVE_LIFT * ND_GR * grooveAmt() * sig.groove;    // v5 "Balanço no ritmo" (as BARS)
      // v5b "Camadas por elemento": the crown's rest = "Grave" (LOW, after the rest smoothing, with its sidechain dip);
      // the mids go to the halo, the hats mostly to the dots (EL_CROWN_HATS stays); a camada that is off hands its v5
      // term back to the crown
      const EL = elOf(sig), EK = EL && EL.K, EE = EL && EL.E, hk = EL ? num(EE.hitK, 1) : 1, vk = num(sig.kickVis, 1);
      const nf = 1 - clamp(num(sig.four, 0), 0, 1), kM = EL_KEEP_MID * nf, kH = EL_CROWN_HATS + (EL_KEEP_HATS - EL_CROWN_HATS) * nf;   // r3
      let sum = 0, cnt = 0;
      for (let m = 0; m < G.m; m++) {
        const r0 = G.r[m * 4], r1 = G.r[m * 4 + 1], r2 = G.r[m * 4 + 2];
        const p = chroma(P12, G.q[m]), tb = G.tb[m];
        const wob = 1 + 0.12 * Math.sin(tS * (0.8 + r0 * 1.5) + r1 * TAU);
        const jit = 0.5 + 0.5 * Math.sin(tJ * (5 + r2 * 6) + r0 * TAU);
        // three slowly turning lobes per side: every kick blooms into petals
        const lobe = 0.5 + 0.5 * Math.cos(3 * G.u[m] * TAU + tS * 0.45);
        // bass pushes the top / bottom hardest; the sides carry energy x chroma
        // (r2: the sides get more of the hit than v3 (0.12 + 0.88 tb^1.6) or v4.0 (0.24 + 0.76 tb^1.3), and their
        // bars may be longer (G.ex), so long bars burst round, not as a capsule)
        const bwU = (side + (1 - side) * Math.pow(tb, 1.3)) * (0.8 + 0.2 * p) * (0.78 + 0.32 * lobe) * 1.7;
        const sK = ND_RSIDE + 0.12 * over, bwK = ND_RSIDE < 0 ? bwU : (sK + (1 - sK) * smooth(clamp((tb - ND_RT0) / (ND_RT1 - ND_RT0), 0, 1))) * (0.8 + 0.2 * p) * (0.78 + 0.32 * lobe) * 1.7;   // v6: the kick's zone
        const midV = mid * (0.3 + 0.7 * p) * (0.25 + 0.75 * (1 - tb)) * wob * 0.42 * gM;
        // the hit: its AMPLITUDE saturates, its shape stays linear (200% still drops between dense hits)
        const hitV = softClip(ndKc(sig.kickPk) * bwK * gain * ND_KM * 0.925) * sig.kickSh * hk * vk;   // v5b-r2: x the breakdown's calm (hitK); r3: x the hit's size
        const restV = !EL ? softClip(sig.low * bwU * gR + midV + sig.hat * (r2 > 0.55 ? 0.34 : 0.08) * (0.4 + 0.6 * r0) * gM)
          : softClip((EK.G ? 0 : sig.low * bwU * gR) +
            (EK.V ? kM * smooth(n01(tb, 0.35, 0.75)) * num(sig.eOn, 0) : 1) * midV + (EK.A ? kH : 1) * sig.hat * (r2 > 0.55 ? 0.34 : 0.08) * (0.4 + 0.6 * r0) * gM);
        const grave = (EL && EK.G ? elRestK(EE.low * 0.50 * ND_G_IN * 1 * (0.6 + 0.4 * p) * (0.78 + 0.32 * lobe) * (0.8 + 0.4 * tb) * gR, EK.G, EL_GRAVE_MAX * 1) * EE.duck : 0) +
          // v6-r3 "Caixa e palmas": a short lift of the whole crown (sides a bit more) on each snare / clap, so a snare has area
          // on screen too (r2: a hairline + the crown flash, ~1/4 of a kick); it follows the snap's own 160 ms flick, not "Volta"
          (EL && EK.S && ND_S_RL > 0 && EE.snap > 0.003 ? ND_S_RL * Math.min(1.5, elKin(EK.S)) * EE.snap * (0.7 + 0.3 * (1 - tb)) * gM : 0) +
          (EL && EK.V && ND_V_CR > 0 ? elRestK(EE.mid * ND_V_CR * (ND_V_CR0 + (1 - ND_V_CR0) * clamp(num(sig.drums, 1), 0, 1)) * (0.3 + 0.7 * p) * (0.25 + 0.75 * (1 - tb)) * wob * gM, EK.V) : 0);
        const rest = 0.035 + 0.02 * Math.sin(tS * 0.7 + r1 * TAU);
        // the per-bar texture comes after the saturation (r2), so saturated hits keep it
        const tex = 0.68 + 0.32 * (0.55 * p + 0.45 * jit);
        const tR = restV * tex * gate + rest * (1 - gate);
        const hH = dynStep(D, m, hitV, fresh, dt, V) * tex;
        G.hr[m] = tR > G.hr[m] ? tR : G.hr[m] + (tR - G.hr[m]) * down;
        G.hgt[m] = blendA(hH, D.sm, EL ? G.hr[m] + lift * (0.45 + 0.55 * tb) + grave * tex : G.hr[m] + lift * (0.45 + 0.55 * tb));
        capStep(G.caps, m, G.hgt[m], dt);
        if (tb > 0.6) { sum += G.hgt[m]; cnt++; }
      }
      // cover / cone: a short per-hit pulse (amplitude saturated, linear shape, softer in dense runs) or the
      // sustained low end; it does not follow "Volta" (like the zoom and the glow)
      const kt = 1 + ND_KCOV * (1 - (1 - softClip(ndKc(sig.kickPk) * gain * ND_KM) * sig.kickSh * sig.kickZ * hk * vk) * (1 - softClip(sig.low * gR)));
      G.kick = kt > G.kick ? kt : G.kick + (kt - G.kick) * (1 - Math.exp(-dt / (playing ? HIT_SMOOTH_MS : 90)));
      return cnt ? sum / cnt : 0;
    },
    draw(v, sig, fx) {
      const c = v.ctx, G = v.g, w = v.w, h = v.h, n = G.n, gk = Math.min(1.6, fx.glow), over = fx.over || 0;
      const cx = G.cx, cy = G.cy, r0 = G.r0 * G.kick, rc = G.rc * G.kick, len = G.len, ex = G.ex;
      // v5 "Balanço no ritmo": the crown (bars, haze, caps) sways around the cover like a pendulum over two beats;
      // the cover and its rim stay still. Rotating the direction vectors costs 4 multiplications per bar.
      const sw = fx.sway || 0, ca = Math.cos(sw), sa = Math.sin(sw);
      const COS = (k) => G.cos[k] * ca - G.sin[k] * sa, SIN = (k) => G.sin[k] * ca + G.cos[k] * sa;
      // 1) haze (cyan top -> pink bottom)
      const ha = v.hctxA, hw = v.hazeA.width, hh = v.hazeA.height, sx = hw / w, sy = hh / h;
      ha.clearRect(0, 0, hw, hh);
      ha.strokeStyle = G.haze;
      ha.lineWidth = Math.max(1, G.barW * 3.2 * sx);
      ha.lineCap = "round";
      ha.beginPath();
      for (let k = 0; k < n; k++) {
        const m = k < G.m ? k : n - 1 - k, L = Math.max(1, G.hgt[m] * len * ex[m] * 1.08), co = COS(k), si = SIN(k);
        ha.moveTo((cx + co * r0) * sx, (cy + si * r0) * sy);
        ha.lineTo((cx + co * (r0 + L)) * sx, (cy + si * (r0 + L)) * sy);
      }
      ha.stroke();
      ha.beginPath();
      ha.lineWidth = Math.max(1, 4 * sx);
      ha.arc(cx * sx, cy * sy, r0 * 0.96 * sx, 0, TAU);
      ha.stroke();
      drawLayers(v, sig, fx, "haze");                  // v5b: the shockwave's glow (none when off)
      blitHaze(v, fx.el ? (0.32 + 0.38 * gk + 0.12 * over) * fx.el.hazeK : 0.32 + 0.38 * gk + 0.12 * over);
      // 2) bars + their falling peak caps (a short dash past the tip): one stroke, one shadow
      c.beginPath();
      const C = G.caps.v, cl = G.capL, gap = G.barW * 0.9 + 1, capsOn = !CFG.caps || CFG.caps.ring !== false;
      for (let k = 0; k < n; k++) {
        const m = k < G.m ? k : n - 1 - k, lm = len * ex[m], L = Math.max(1.5, G.hgt[m] * lm), co = COS(k), si = SIN(k);
        c.moveTo(cx + co * (r0 + 2), cy + si * (r0 + 2));
        c.lineTo(cx + co * (r0 + 2 + L), cy + si * (r0 + 2 + L));
        const cap = C[m] * lm;
        if (capsOn && cap - L > gap + cl) {
          c.moveTo(cx + co * (r0 + 2 + cap), cy + si * (r0 + 2 + cap));
          c.lineTo(cx + co * (r0 + 2 + cap + cl), cy + si * (r0 + 2 + cap + cl));
        }
      }
      c.lineCap = "round";
      c.lineWidth = G.barW;
      c.strokeStyle = fx.el && G.coreEl ? G.coreEl : G.core;
      c.shadowColor = "rgba(" + PAL.shadowRgb + ", " + Math.min(1, 0.5 + 0.4 * gk).toFixed(3) + ")";
      c.shadowBlur = (8 + 14 * gk + 8 * over) * v.dpr * (v.kind === "preview" ? 0.5 : 1);
      c.stroke();
      // 3) the cone rim
      c.beginPath();
      c.arc(cx, cy, r0 - 3, 0, TAU);
      c.lineWidth = v.kind === "preview" ? 1.2 : 2;
      c.strokeStyle = PAL.rim;
      c.stroke();
      c.shadowBlur = 0;
      c.shadowColor = "transparent";
      // 4) the cover (cross-fades on track change)
      drawCover(c, cx, cy, rc - (v.kind === "preview" ? 2 : 7));
    },
  };

  function drawCover(c, cx, cy, r) {
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.closePath();
    c.fillStyle = "#0b1a36";
    c.fill();
    c.clip();
    const k = cover.prev ? clamp((now() - cover.swapAt) / 320, 0, 1) : 1;
    if (k >= 1) cover.prev = null;
    if (cover.prev && ready(cover.prev)) { c.globalAlpha = 1; fitImage(c, cover.prev, cx, cy, r); }
    if (cover.img && ready(cover.img)) { c.globalAlpha = k; fitImage(c, cover.img, cx, cy, r); }
    c.globalAlpha = 1;
    const sh = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    sh.addColorStop(0, "rgba(2, 7, 19, 0)");
    sh.addColorStop(1, "rgba(2, 7, 19, 0.35)");
    c.fillStyle = sh;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
    c.restore();
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.lineWidth = 1;
    c.strokeStyle = PAL.coverRing;
    c.stroke();
  }
  const ready = (img) => img.complete && img.naturalWidth > 0;
  function fitImage(c, img, cx, cy, r) {
    const iw = img.naturalWidth, ih = img.naturalHeight, s = (r * 2) / Math.min(iw, ih);
    c.drawImage(img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
  }
