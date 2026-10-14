
  // -- style 3: "Onda" ------------------------------------------------------------
  // layered neon ribbons; the main one (bass) is a twisting ribbon with a
  // liquid body, the others follow energy and the hats
  const RIBBONS = [
    // colours: PAL.waveGlow / waveShadow[i] (a2, a1, their mix)
    { k: [1.55, 2.85, 4.6], c: [0.56, 0.3, 0.14], sp: [0.9, -1.25, 1.85], core: 3.0, mirror: true },
    { k: [1.1, 2.3, 3.75], c: [0.52, 0.33, 0.15], sp: [-0.62, 1.05, -1.5], core: 2.1, mirror: false },
    { k: [2.35, 3.9, 6.1], c: [0.45, 0.35, 0.2], sp: [1.4, -2.05, 2.7], core: 1.4, mirror: false },
  ];
  const WAVE = {
    reads: ["gate", "kickPk", "kickSh", "kickVis", "kickId", "low", "bass", "hat", "energy", "groove", "sway"],
    layout(v, prev) {
      const w = v.w, h = v.h, small = v.kind === "preview";
      // "Alcance": the main ribbon's amplitude unit (styleSize; three sines rarely line up past ~0.9 of their sum)
      const room = (h / 2 - (small ? 4 : 12)) / (1.15 * SAT_HI);
      const G = { cy: h / 2, H: Math.min(room, small ? Math.max(5, (h / 2 - 6) * v.alc) : styleSize("wave", v.H0, 0, v.alc, v.zmax)) };
      G.pts = clamp(Math.round(w / (small ? 6 : 9)), 40, 180);
      G.x = new Float32Array(G.pts); G.X = new Float32Array(G.pts); G.taper = new Float32Array(G.pts);
      for (let i = 0; i < G.pts; i++) {
        const f = i / (G.pts - 1);
        G.x[i] = f * w;
        G.X[i] = f * TAU;
        G.taper[i] = Math.pow(Math.sin(Math.PI * f), 1.35) * (0.75 + 0.25 * Math.exp(-((f - 0.5) * (f - 0.5)) / 0.04));
      }
      G.y = RIBBONS.map(() => new Float32Array(G.pts));
      G.kw = new Float32Array(G.pts); G.ampC = [0, 0, 0];   // v6: the kick's centre weight (ND_WKS)
      { let sw = 0, st = 0; for (let i = 0; i < G.pts; i++) { const d = (i / (G.pts - 1) - 0.5) / Math.max(1e-3, ND_WKS); G.kw[i] = ND_WKS > 0 ? Math.exp(-0.5 * d * d) : 1; sw += G.kw[i] * G.taper[i]; st += G.taper[i]; } G.kwM = st > 0 ? sw / st : 1; }
      // r2: a re-layout carries the whole state (the hit part, the rest and the hit id), not the drawn amplitude
      const keep = prev && prev.dyn && prev.ampR;
      G.amp = keep ? prev.amp.slice() : [0, 0, 0];
      G.ampR = keep ? prev.ampR.slice() : [0, 0, 0];   // the rest (energy / hats), smoothed on its own
      G.dyn = keep ? dynResample(prev.dyn, 3, (r) => r) : dynState(3);
      G.ph = prev ? prev.ph.map((a) => a.slice()) : RIBBONS.map((r, i) => r.k.map((_, j) => i * 1.7 + j * 2.1));
      const c = v.ctx;
      const fg = c.createLinearGradient(0, G.cy - G.H, 0, G.cy + G.H);
      [0, 0.35, 0.5, 0.65, 1].forEach((o, i) => fg.addColorStop(o, PAL.waveFill[i]));
      G.fill = fg;
      const edge = c.createLinearGradient(0, 0, w, 0);
      edge.addColorStop(0, "rgba(255, 255, 255, 0.15)");
      edge.addColorStop(0.18, "#ffffff");
      edge.addColorStop(0.82, "#ffffff");
      edge.addColorStop(1, "rgba(255, 255, 255, 0.15)");
      G.core = edge;
      v.g = G;
    },
    update(v, sig, dt, gain, t, fallMs) {
      // r2: past 200% the in-between keeps its 200% level (gR) and the two upper ribbons take more of each hit
      const G = v.g, playing = sig.gate > 0.5, gR = Math.min(gain, 2), gM = Math.sqrt(gR), over = overOf(gain), D = G.dyn, V = fallOf("wave", fallMs);
      const EL0 = elOf(sig), hk = EL0 ? num(EL0.E.hitK, 1) : 1, vk = num(sig.kickVis, 1);   // v5b-r2: x the breakdown's calm (hitK); r3: x the hit's size
      const hit = (w) => softClip(ndKc(sig.kickPk) * w * gain * ND_KM * 0.935) * sig.kickSh * hk * vk;   // the hit: amplitude saturates, shape stays linear
      const hits = [hit(1.15), hit((0.4 + 0.15 * over) * 0.3), hit((0.2 + 0.12 * over) * 0.3)];
      const drives = [                               // the rest: sustained low end (full gain), energy / hats (square root)
        sig.low * 1.15 * gR + sig.energy * 0.1 * gM,
        Math.pow(sig.energy, 1.3) * 0.48 * gM + sig.low * 0.4 * gR,
        sig.hat * 0.55 * gM + Math.pow(sig.energy, 1.4) * 0.26 * gM + sig.low * 0.2 * gR,
      ];
      // v5b "Camadas por elemento": ribbon 1 = "Grave" (LOW), 2 = "Voz e melodia" (MID), 3 = "Agudos e chimbal" (AIR +
      // the hat ticks); a camada that is off keeps its v5 drive. Riser: higher spatial frequency; calm: lower, slower
      const EL = elOf(sig), EK = EL && EL.K, EE = EL && EL.E;
      let elFq = 1, elAm = 1, elSp = 1, elBul = 0, elXf = 0, elOff = 0, elGrave = 0;
      if (EL) {
        if (EK.G) { elGrave = elRestK(EE.low * ND_G_IN * 1.3 * gR + sig.energy * 0.05 * gM, EK.G, EL_GRAVE_MAX * 1.2) * EE.duck; drives[0] = 0; }
        // v6-r2: under restSoft's knee (v6: x 2 into a x 1.8 ceiling pinned ribbon 2 at ~0.74 for any voice above ~0.3)
        if (EK.V) drives[1] = elRestK(0.62 * ND_V_IN * ND_VW * EE.mid * gM, EK.V, EL_REST_MAX * ND_VWC);
        // r3: v5's own hat term rides on top (r2 had only 0.30 x the layer's hat envelope: ribbon 3 moved less with the hats
        // than with the layers off)
        if (EK.A) drives[2] = elRestK((0.40 * EE.air * gM + 0.30 * EE.hatEnv * gM) * ND_A_IN * 1.6, EK.A, EL_REST_MAX * 1.3) + sig.hat * 0.55 * gM;
        elFq = 1 + Math.min(1.2, 0.8 * EK.M * EE.rise * EE.rise);
        elAm = 1 - Math.min(0.6, 0.3 * EK.M * EE.calm);
        elSp = 1 - Math.min(0.7, 0.4 * EK.M * EE.calm);
        if (EK.E && EE.ent > 0.003 && EE.entAge < EL_ENTRY_MS) {   // "Quando o grave entra": a bulge runs along the ribbons
          elBul = 0.6 * ND_E_A * EK.E * EE.ent;
          elXf = S.reducedMotion ? 0 : Math.min(1, EE.entAge / EL_SHOCK_MS) * (v.w / 2);
        }
        // r3: the soft entries swell their own ribbon for EL_FLASH_MS (with the white core in elOver)
        if (EK.V && EE.fMid > 0.01) drives[1] += 0.3 * Math.min(1.5, elKin(EK.V)) * EE.fMid;
        if (EK.A && EE.fAir > 0.01) drives[2] += 0.3 * Math.min(1.5, elKin(EK.A)) * EE.fAir;
        if (EK.V) elOff = -0.06 * G.H * Math.sin(S.reducedMotion ? EE.gHome : EE.gAng) * EE.glint;
      }
      // r3: the bulge is a WIDE swell (r2: an 80 px kernel, ~6 polyline points, times up to 1 + 3 x ent and clipped hard by
      // min(): at 300-500 % the ribbons broke into spikes and flat plateaus, 41-85 degree corners): >= 9 % of the width,
      // wider with the amount, a soft tanh ceiling, and only 0.4 x on ribbons 2 / 3
      const bw80 = Math.max(v.kind === "preview" ? 30 : 80, 0.09 * v.w) * Math.sqrt(Math.min(4, Math.max(1, EL ? EL.K.E : 1)));
      const fresh = sig.kickId !== D.id;
      D.id = sig.kickId;
      D.sm = satMaxOf(gain);
      const downR = 1 - Math.exp(-dt / (playing ? clamp(V * REST_FALL_SHARE, 120, 500) : 500));
      const speed = 0.55 + 0.9 * sig.energy + 0.9 * (sig.bass - (1 - 0.2) * sig.kick);
      const ds = dt / 1000;
      // v5 "Balanço no ritmo": the baseline lifts on the beat and the ribbons swing their phase (a pendulum over two
      // beats, the upper ribbons against the main one), on top of their own drift
      const grA = grooveAmt(), lift = GROOVE_LIFT * ND_GR * grA * sig.groove, swing = GROOVE_WAVE * ND_GR * grA * sig.sway;
      for (let r = 0; r < RIBBONS.length; r++) {
        const R = RIBBONS[r];
        const tR = softClip(drives[r]) * sig.gate + 0.05 * (1 - sig.gate), aR = G.ampR[r];
        const hH = dynStep(D, r, hits[r] * sig.gate, fresh, dt, V);
        G.ampR[r] = tR > aR ? tR : aR + (tR - aR) * downR;
        const restW = EL && r === 0 ? G.ampR[r] + lift + elGrave : G.ampR[r] + lift * (r === 0 ? 1 : 0.7);
        G.amp[r] = blendA(hH, D.sm, restW);
        let aK = 0;                                // v6: the kick's part, drawn centre-weighted (ND_WKS)
        if (ND_WKS > 0) { const a0 = blendA(0, D.sm, restW); aK = G.amp[r] > a0 ? G.amp[r] - a0 : 0; G.ampC[r] = G.amp[r]; G.amp[r] = a0 + aK * G.kwM; }
        const ph = G.ph[r];
        if (!EL) for (let j = 0; j < 3; j++) ph[j] = (ph[j] + ds * R.sp[j] * speed) % (TAU * 100);
        else {                                     // v5b: ribbon 2 drifts lazily with the voice, ribbon 3 runs with the air
          const sp = (r === 1 && EK.V ? 0.35 + ND_VSP * EE.mid : r === 2 && EK.A ? 1.2 + 1.5 * 1.8 * EE.air : speed) * elSp;
          for (let j = 0; j < 3; j++) ph[j] = (ph[j] + ds * R.sp[j] * sp) % (TAU * 100);
        }
        const p0 = ph[0] + swing * (r === 0 ? 1 : -0.6);
        const hS = G.H * (r === 0 ? 1.15 : r === 1 ? 0.92 : 0.7), aKw = 0.92 * aK * hS, kw = G.kw;
        const y = G.y[r], amp = (0.08 + 0.92 * (G.amp[r] - aK * (ND_WKS > 0 ? G.kwM : 0))) * hS;   // v6: without the centre-weighted kick part
        if (!EL) {
          for (let i = 0; i < G.pts; i++) {
            const X = G.X[i];
            y[i] = G.cy + (amp + aKw * kw[i]) * G.taper[i] * (R.c[0] * Math.sin(R.k[0] * X + p0) + R.c[1] * Math.sin(R.k[1] * X + ph[1]) + R.c[2] * Math.sin(R.k[2] * X + ph[2]));
          }
        } else {
          const am = amp * elAm, amK = aKw * elAm, k0 = R.k[0] * elFq, k1 = R.k[1] * elFq, k2 = R.k[2] * elFq, off = r === 1 ? elOff : 0, cx = v.w / 2;
          const bMax = (0.08 + 0.92 * SAT_HI) / (0.08 + 0.92 * Math.min(SAT_HI, ND_WKS > 0 ? G.ampC[r] : G.amp[r])), bR = Math.max(1e-3, bMax - 1);   // the bulge stays inside the budget
          const bul = elBul * (r === 0 ? 1 : 0.4);
          for (let i = 0; i < G.pts; i++) {
            const X = G.X[i];
            let b = 1;
            if (bul) { const dx = Math.min(Math.abs(G.x[i] - (cx - elXf)), Math.abs(G.x[i] - (cx + elXf))) / bw80; b = 1 + bR * Math.tanh(bul * Math.exp(-dx * dx) / bR); }
            y[i] = G.cy + off + (am + amK * kw[i]) * b * G.taper[i] * (R.c[0] * Math.sin(k0 * X + p0) + R.c[1] * Math.sin(k1 * X + ph[1]) + R.c[2] * Math.sin(k2 * X + ph[2]));
          }
        }
      }
      return ND_WKS > 0 ? G.ampC[0] : G.amp[0];   // v6: the kick zone (the centre)
    },
    draw(v, sig, fx) {
      const c = v.ctx, G = v.g, w = v.w, h = v.h, gk = Math.min(1.6, fx.glow), over = fx.over || 0, small = v.kind === "preview";
      // 1) haze
      const ha = v.hctxA, hw = v.hazeA.width, hh = v.hazeA.height, sx = hw / w, sy = hh / h;
      ha.clearRect(0, 0, hw, hh);
      ha.lineCap = "round";
      // v5b: with the layers each ribbon wears its element's colour (1 a1 = grave, 2 the halo colour = voz, 3 a2 = agudos)
      const EC = fx.el ? fx.el.cols : null, glowCol = EC ? [EC.glow0, elRgba(fx.el.halo, 0.9), EC.glow2] : PAL.waveGlow;
      for (let r = RIBBONS.length - 1; r >= 0; r--) {
        ha.strokeStyle = glowCol[r];
        ha.lineWidth = Math.max(1, (RIBBONS[r].core * 4 + 16 * G.amp[r]) * sx);
        ha.beginPath();
        curve(ha, G.x, G.y[r], G.pts, sx, sy, false, G.cy);
        if (RIBBONS[r].mirror) curve(ha, G.x, G.y[r], G.pts, sx, sy, true, G.cy);
        ha.stroke();
      }
      drawLayers(v, sig, fx, "haze");                  // v5b: ribbon 2's halo glow (none when off)
      blitHaze(v, fx.el ? (0.34 + 0.36 * gk + 0.12 * over) * fx.el.hazeK : 0.34 + 0.36 * gk + 0.12 * over);
      // 2) liquid body of the main ribbon (between it and its mirror)
      c.beginPath();
      curve(c, G.x, G.y[0], G.pts, 1, 1, false, G.cy);
      for (let i = G.pts - 1; i >= 0; i--) c.lineTo(G.x[i], 2 * G.cy - G.y[0][i]);
      c.closePath();
      c.globalAlpha = Math.min(1, 0.55 + 0.45 * G.amp[0]);
      c.fillStyle = G.fill;
      c.fill();
      c.globalAlpha = 1;
      // 3) cores
      c.lineCap = "round";
      c.lineJoin = "round";
      c.strokeStyle = G.core;
      for (let r = RIBBONS.length - 1; r >= 0; r--) {
        const R = RIBBONS[r];
        c.beginPath();
        curve(c, G.x, G.y[r], G.pts, 1, 1, false, G.cy);
        if (R.mirror) curve(c, G.x, G.y[r], G.pts, 1, 1, true, G.cy);
        c.lineWidth = R.core * (0.55 + 1.1 * Math.min(1, G.amp[r])) * (small ? 0.6 : 1);
        // one shadow pass (the main ribbon); the others get their glow from the haze
        c.shadowColor = r === 0 ? (EC ? EC.waveShadow0 : PAL.waveShadow[0]) : "transparent";
        c.shadowBlur = r === 0 ? (7 + 12 * gk + 7 * over) * v.dpr * (small ? 0.5 : 1) : 0;
        c.globalAlpha = r === 0 ? 1 : 0.88;
        c.stroke();
      }
      c.globalAlpha = 1;
      c.shadowBlur = 0;
      c.shadowColor = "transparent";
    },
  };
  /** smooth polyline through the points (quadratic through the midpoints) */
  function curve(c, xs, ys, n, sx, sy, mirror, cy) {
    const Y = (i) => (mirror ? 2 * cy - ys[i] : ys[i]) * sy;
    c.moveTo(xs[0] * sx, Y(0));
    for (let i = 1; i < n - 1; i++) {
      const mx = ((xs[i] + xs[i + 1]) / 2) * sx, my = (Y(i) + Y(i + 1)) / 2;
      c.quadraticCurveTo(xs[i] * sx, Y(i), mx, my);
    }
    c.lineTo(xs[n - 1] * sx, Y(n - 1));
  }

  const IMPL = { bars: BARS, ring: RING, wave: WAVE };

