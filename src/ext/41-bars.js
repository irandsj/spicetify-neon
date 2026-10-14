  // -- style 1: "Barras espelhadas" -------------------------------------------
  // bass drives the centre bars hardest; the shoulders carry energy x chroma,
  // the outer bars the hats
  const BARS = {
    // signal channels this renderer reads (SIGNAL_CHANNELS)
    reads: ["gate", "kickPk", "kickSh", "kickVis", "kickId", "low", "hat", "energy", "P12", "groove", "four"],
    layout(v, prev) {
      const w = v.w, h = v.h, small = v.kind === "preview";
      const margin = Math.round(w * 0.04);
      let n = Math.round((w - margin * 2) / (small ? 9 : 15));
      n = clamp(n - (n % 2), 24, 84);
      const G = { n, pitch: (w - margin * 2) / n };
      G.barW = clamp(G.pitch * 0.32, small ? 2 : 3, 6);
      G.x0 = margin + (G.pitch - G.barW) / 2;
      // "Alcance": styleSize (the canvas is sized for it, overshoot and zoom included); the preview spans its own height
      const room = (h / 2 - (small ? 3 : 8)) / SAT_HI;
      G.half = Math.min(room, small ? Math.max(5, (h / 2 - 7) * v.alc) : styleSize("bars", v.H0, 0, v.alc, v.zmax));
      G.capH = small ? 1.5 : 3;
      G.a = new Float32Array(n); G.q = new Float32Array(n); G.r = new Float32Array(n * 4); G.hgt = new Float32Array(n);
      G.hr = new Float32Array(n);                 // the rest (mids / hats), smoothed on its own
      G.cw = new Float32Array(n); G.ck = new Float32Array(n); G.sw = new Float32Array(n); G.shape = new Float32Array(n); G.ow = new Float32Array(n);
      const rnd = seeded(0x6d2b79f5);
      // r2: a re-layout carries the whole state (dynResample), not the drawn height
      const map = prev && prev.dyn ? (i) => Math.min(prev.n - 1, Math.floor(((i + 0.5) / n) * prev.n)) : null;
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n) * 2 - 1, a = Math.abs(u);
        G.a[i] = a;
        G.q[i] = clamp(a * 11 + (rnd() - 0.5) * 0.7, 0, 11);
        for (let k = 0; k < 4; k++) G.r[i * 4 + k] = rnd();
        G.cw[i] = Math.exp(-(a * a) / (2 * 0.2 * 0.2));                    // centre: bass
        G.ck[i] = ND_BFLAT < 0 ? G.cw[i] : a <= ND_BFLAT ? 1 : Math.exp(-((a - ND_BFLAT) * (a - ND_BFLAT)) / (2 * ND_BSIG * ND_BSIG));   // v6: the kick's zone
        G.sw[i] = Math.exp(-((a - 0.42) * (a - 0.42)) / (2 * 0.28 * 0.28)); // shoulders: mids
        G.ow[i] = Math.exp(-((a - 0.72) * (a - 0.72)) / (2 * 0.17 * 0.17));  // outer third: hats (tapers at the very edge)
        G.shape[i] = 0.32 + 0.68 * Math.exp(-(a * a) / 0.5);
        if (map) { G.hgt[i] = prev.hgt[map(i)]; G.hr[i] = prev.hr[map(i)]; }
      }
      G.dyn = map ? dynResample(prev.dyn, n, map) : dynState(n);
      G.jOff = prev ? num(prev.jOff, 0) : 0;      // final-build: the soft mode's shimmer offset (kept across re-layouts)
      G.caps = map ? capResample(prev.caps, n, map) : capState(n);
      const c = v.ctx;
      const g = c.createLinearGradient(0, h / 2 - G.half, 0, h / 2 + G.half);
      [0, 0.3, 0.5, 0.7, 1].forEach((o, i) => g.addColorStop(o, PAL.barsCore[i]));   // white core, a2-tinted top, a1-tinted bottom
      G.core = g;
      const l = c.createLinearGradient(0, 0, w, 0);
      l.addColorStop(0, "rgba(255, 255, 255, 0)");
      l.addColorStop(0.5, PAL.line);
      l.addColorStop(1, "rgba(255, 255, 255, 0)");
      G.line = l;
      const hg = v.hctxA.createLinearGradient(0, 0, v.hazeA.width, 0);
      hg.addColorStop(0, PAL.haze[0]);
      hg.addColorStop(0.5, PAL.haze[1]);
      hg.addColorStop(1, PAL.haze[2]);
      G.haze = hg;
      if (elK()) elBarsLayout(v, G, margin);       // v5b: zone colours (a1 centre, mix shoulders, a2 tips) + hairlines
      v.g = G;
    },
    update(v, sig, dt, gain, t, fallMs) {
      const G = v.g, n = G.n, P12 = sig.P12, playing = sig.gate > 0.5, D = G.dyn, V = fallOf("bars", fallMs);
      // the mids / hats part falls with a share of "Volta" (v3: 60 ms); the attack is instant everywhere
      const down = 1 - Math.exp(-dt / (playing ? clamp(V * REST_FALL_SHARE, 60, 500) : 420));
      const fresh = sig.kickId !== D.id;
      D.id = sig.kickId;
      D.sm = satMaxOf(gain);
      setCapTiming(G.caps, V);
      const tS = t / 1000, mid = Math.pow(sig.energy, 1.35), gate = sig.gate;
      if (num(sig.softJ, 0) > 0) G.jOff = num(G.jOff, 0) + (dt / 1000) * SOFT_JIT * sig.softJ;   // final-build: calmer shimmer (final-fix: with the layers on)
      const tJ = tS - num(G.jOff, 0);
      // intensity: the bass hits get the full gain, the in-between movement
      // (mids, hats) only its square root, so 200% hits harder without mush; r2: past 200% the in-between keeps
      // its 200% level (gR) and the hits get wider instead (cwX: the centre's Gaussian widens up to x1.34 at 500%)
      const gR = Math.min(gain, 2), gM = Math.sqrt(gR), over = overOf(gain), cwX = 1 / (1 + 0.8 * over);
      // v5 "Balanço no ritmo": the baseline (rest layer) pumps on the beat, centre-weighted; added after the rest's
      // own smoothing so it stays exactly on the beat whatever "Volta" is, and capped with it (restSoft)
      const lift = GROOVE_LIFT * ND_GR * grooveAmt() * sig.groove;
      // v5b "Camadas por elemento": the rest is a mirrored virtual spectrum (centre LOW, shoulders MID, tips AIR); a
      // camada that is off hands its v5 term back; a riser narrows the bass's Gaussian (rest only, the kick is v5)
      const EL = elOf(sig), EK = EL && EL.K, EE = EL && EL.E;
      const cwW = EL && !S.reducedMotion ? Math.max(0.6, 1 - 0.4 * EK.M * EE.rise) : 1;
      const hk = EL ? num(EE.hitK, 1) : 1, vk = num(sig.kickVis, 1);   // r3: a tick / soft tick stays smaller after the saturation
      // v6-r2: without drums the centre is the voice's too (v6: a bow-tie with an empty middle in voice-only parts)
      const dzB = clamp(num(sig.drums, 1), 0, 1), vC = ND_BVC * (1 - dzB);
      const kM = EL_KEEP_MID * (1 - clamp(num(sig.four, 0), 0, 1));   // r3: the centre keeps part of v5's energy term (EL_KEEP_MID)
      const sB = num(sig.softB, 0);               // final-fix: the soft mode's swell of the uncovered field (0 on analysed music)
      let csum = 0, cn = 0;
      for (let i = 0; i < n; i++) {
        const r0 = G.r[i * 4], r1 = G.r[i * 4 + 1], r2 = G.r[i * 4 + 2], r3 = G.r[i * 4 + 3];
        const p = chroma(P12, G.q[i]);
        const wob = 1 + 0.12 * Math.sin(tS * (0.9 + r0 * 1.4) + r1 * TAU) + 0.06 * Math.sin(tJ * (5.1 + r2 * 3.3) + r3 * TAU);
        // per-bar jitter so a kick is a ragged burst, not a smooth bell
        const jit = 0.5 + 0.5 * Math.sin(tJ * (6 + r3 * 5) + r0 * TAU);
        const bwU = G.shape[i] * (0.78 + 0.14 * jit + 0.16 * p) * 1.45;
        const bw = bwU * (over > 0 ? Math.pow(G.ck[i], cwX) : G.ck[i]) * gain;
        const midV = mid * (0.3 + 0.7 * p) * (0.15 + 0.85 * G.sw[i]) * wob * 0.5 * gM;
        // the hit: its AMPLITUDE saturates, its shape stays linear (200% still drops between dense hits)
        const hitV = softClip(ndKc(sig.kickPk) * bw * ND_KM * 0.97) * sig.kickSh * hk * vk;     // v5b-r2: x the breakdown's calm (hitK); r3: x the hit's size
        let restV, grave = 0;
        if (!EL) restV = softClip(sig.low * bwU * G.cw[i] * gR + G.shape[i] * midV + sig.hat * G.ow[i] * (0.35 + 0.65 * r2) * 0.34 * gM + sB * G.shape[i] * (0.55 + 0.45 * p) * wob * gM);
        else {
          const sh = G.shape[i] * (0.62 + 0.38 * p) * wob, a = G.a[i], cwR = cwW < 1 ? Math.exp(-(a * a) / (0.08 * cwW * cwW)) : G.cw[i];
          // the layer part (one soft cap; its own followers, so it skips the rest smoothing) dips before each hit where
          // the hits are (centre Gaussian), the handed-back v5 terms go through the rest smoothing as in v5
          // r2: one ceiling per camada (Grave: its own lower one), so each slider still grows past 200 %; the voice keeps off
          // the centre bars (they show the bass and its kick: punch over the body >= 0.85 x v5)
          grave = ((EK.G ? elRestK(sh * EE.low * 0.62 * ND_G_IN * 1 * cwR * gR, EK.G, EL_GRAVE_MAX * 1) : 0) + (EK.V ? elRestK(sh * EE.mid * 0.50 * ND_V_IN * 1.8 * (G.sw[i] * (1 - 0.9 * G.cw[i] * dzB) + vC * G.cw[i]) * gM, EK.V) +
            0.12 * Math.min(1.5, elKin(EK.V)) * EE.fMid * (G.sw[i] * (1 - 0.9 * G.cw[i] * dzB) + vC * G.cw[i]) : 0) +   // r3: "a voz entrou" lifts the shoulders
            (EK.A ? elRestK(sh * EE.air * 0.42 * ND_A_IN * 3.5 * G.ow[i] * (0.55 + 0.45 * r2) * gM, EK.A) : 0)) * (1 - (1 - EE.duck) * G.cw[i]);
          restV = softClip((EK.G ? 0 : sig.low * bwU * G.cw[i] * gR) + (EK.V ? kM * G.cw[i] * num(sig.eOn, 0) : 1) * G.shape[i] * midV +
            (EK.A ? EL_BARS_HATS : 1) * sig.hat * G.ow[i] * (0.35 + 0.65 * r2) * 0.34 * gM + sB * G.shape[i] * (0.55 + 0.45 * p) * wob * gM);
        }
        const rest = G.shape[i] * (0.03 + 0.015 * Math.sin(tS * 0.8 + r1 * TAU));
        // r2: the per-bar texture multiplies the hit part AFTER the saturation, so a saturated burst stays ragged
        // (v4.0 put it inside: every centre bar reached the same height, a flat-topped slab)
        const tex = 0.76 + 0.24 * (0.55 * p + 0.45 * jit);
        const tR = restV * tex * gate + rest * (1 - gate);
        const hH = dynStep(D, i, hitV, fresh, dt, V) * tex;
        G.hr[i] = tR > G.hr[i] ? tR : G.hr[i] + (tR - G.hr[i]) * down;
        G.hgt[i] = blendA(hH, D.sm, EL ? G.hr[i] + lift * G.shape[i] + grave * tex : G.hr[i] + lift * G.shape[i]);
        capStep(G.caps, i, G.hgt[i], dt);
        if (G.a[i] < 0.2) { csum += G.hgt[i]; cn++; }
      }
      return cn ? csum / cn : 0;
    },
    draw(v, sig, fx) {
      const c = v.ctx, G = v.g, w = v.w, h = v.h, cy = h / 2, n = G.n;
      const gk = Math.min(1.6, fx.glow), over = fx.over || 0;
      // v5b-r3 "Subidas e calmarias" in "Barras": in a riser the bar field closes in towards the centre (x 1 - 0.15 T) and the
      // caps float higher; the drop releases both (r2: only the small "Grave" rest term narrowed, 0.8 % of the screen changed)
      const EL = fx.el, tR = EL && !EL.rm ? Math.min(1, EL.K.M) * EL.T : 0, cmp = 1 - 0.15 * tR, X = (x) => w / 2 + (x - w / 2) * cmp;
      G.cmp = cmp; G.capLift = (v.kind === "preview" ? 4 : 12) * tR;
      const bw = G.barW * cmp;
      // 1) coloured haze behind the bars
      const ha = v.hctxA, hw = v.hazeA.width, hh = v.hazeA.height, sx = hw / w, sy = hh / h;
      ha.clearRect(0, 0, hw, hh);
      ha.fillStyle = G.haze;
      for (let i = 0; i < n; i++) {
        const x = X(G.x0 + i * G.pitch - G.pitch * 0.35) * sx;
        const half = Math.max(1, G.hgt[i] * G.half * 1.06) * sy;
        ha.fillRect(x, cy * sy - half, G.pitch * 1.1 * cmp * sx, half * 2);
      }
      drawLayers(v, sig, fx, "haze");                  // v5b: glows that ride the haze's free blur (none when off)
      blitHaze(v, fx.el ? (0.3 + 0.38 * gk + 0.12 * over) * fx.el.hazeK : 0.3 + 0.38 * gk + 0.12 * over);
      // 2) hairline through the centre
      c.fillStyle = G.line;
      c.fillRect(0, cy - 0.5, w, 1);
      // 3) the bars (white core with a tight cyan halo) + their falling peak caps: one path, one shadow
      c.beginPath();
      const C = G.caps.v, ch = G.capH, capsOn = !CFG.caps || CFG.caps.bars !== false;
      for (let i = 0; i < n; i++) {
        const half = Math.max(1.25, G.hgt[i] * G.half), x = X(G.x0 + i * G.pitch);
        c.roundRect(x, cy - half, bw, half * 2, Math.min(bw / 2, half));
        const cap = C[i] * G.half + G.capLift;
        if (capsOn && cap - half > ch * 0.8) {
          c.roundRect(x, cy - cap - ch, bw, ch, ch / 2);
          c.roundRect(x, cy + cap, bw, ch, ch / 2);
        }
      }
      // r3 "Caixa e palmas" in "Barras": the bars' glow flashes white and wider on each snare / clap (elOver adds the tips)
      const snF = EL && EL.K.S && EL.E.snap > 0.003 ? Math.min(1, elPk(EL.K.S, 0.8, 1) * EL.E.snap) : 0;
      c.shadowColor = snF > 0.01 ? "rgba(" + elShadowMix(PAL.shadowRgb, 0.8 * snF) + ", " + Math.min(1, 0.45 + 0.4 * gk + 0.4 * snF).toFixed(3) + ")"
        : "rgba(" + PAL.shadowRgb + ", " + Math.min(1, 0.45 + 0.4 * gk).toFixed(3) + ")";
      c.shadowBlur = (9 + 14 * gk + 8 * over + 16 * snF) * v.dpr * (v.kind === "preview" ? 0.5 : 1);
      c.fillStyle = fx.el && G.coreEl ? G.coreEl : G.core;   // v5b: the zone colours (one pattern fill, one shadow)
      c.fill();
      c.shadowBlur = 0;
      c.shadowColor = "transparent";
    },
  };

