  function cachedTempo(item) {
    const e = item && cache.get(item.uri);
    return e && e.a ? e.a.tempo : 0;
  }

  /** bass / kick / hat / energy at playback position posMs (ms). Z.lat is the
      "Sincronia" for the current output minus the display lead: the frame
      shows what will be HEARD when it reaches the screen. */
  function computeSignal(Z, A, posMs, dt, playing, item) {
    Z.gate += ((playing ? 1 : 0) - Z.gate) * (1 - Math.exp(-dt / (playing ? 140 : 480)));
    const gate = Z.gate;
    const pA = posMs - num(Z.lat, LATENCY_MS), tA = pA / 1000;  // what is audible right now
    Z.drums = A ? drumsAt(A, pA) : drumsFallback(item);         // v6: drums present
    // final-build "modo ambiente suave": its weight eases in (SOFT_IN_MS) while there is no analysis and out (SOFT_OUT_MS)
    // once there is one; the drives below blend towards softGen() by it, and a late analysis's kicks / drums fade in by
    // 1 - it (on analysed music it is 0 and nothing below changes)
    const so0 = num(Z.soft, 0), soT = A ? 0 : softTarget(item);
    let so = so0 + (soT - so0) * (1 - Math.exp(-dt / (soT > so0 ? SOFT_IN_MS : SOFT_OUT_MS)));
    if (soT === 0 && so < 1e-3) so = 0;
    Z.soft = so;
    if (so > 0) Z.sT = num(Z.sT, 0) + dt * (playing ? 1 : 0.35);
    const SG = so > 0 ? softGen(Z) : null;
    if (SG && A) Z.drums *= 1 - so;
    let kick, hat, energy, bright, body;
    if (A) {
      Z.mode = "analysis";
      const db = dbAt(A, tA);
      Z.db = db;
      energy = Math.pow(norm01(A, db), 1.4);
      bright = pitchesAt(A, tA, Z.P12);
      // v6-r3: without drums the chroma breathes. Each segment brings its own pitch vector (cross-faded in 60 ms); in rap
      // every syllable is a segment, so the crown's sides (voice x chroma, texture) and the bars' texture were re-weighted
      // on every syllable: 34-45 side jumps a minute in an a cappella rap test track at ring 500 %. A ND_PCH_MS follower of the
      // vector takes over by 1 - drums present (eased in like the groove, ND_DRG_MS); with drums: the segment's own
      if (ND_PCH_MS > 0) {
        const Ps = Z.P12s || (Z.P12s = Float32Array.from(Z.P12)), kp = 1 - Math.exp(-dt / ND_PCH_MS);
        const w0 = num(Z.pcW, 1), w = Z.drums > w0 ? w0 + (Z.drums - w0) * (1 - Math.exp(-dt / ND_DRG_MS)) : Z.drums;
        Z.pcW = w;
        for (let j = 0; j < 12; j++) { Ps[j] += (Z.P12[j] - Ps[j]) * kp; Z.P12[j] = Ps[j] + (Z.P12[j] - Ps[j]) * w; }
      }
      buildHits(A, rhythmMode());                  // "Ritmo do visual" (cheap no-op unless it changed)
      kick = kickAt(A, pA, Z.k).v;
      hat = envAt(A.hatT, A.hatS, pA, HAT_ATTACK_MS, HAT_DECAY_MS) * Z.drums;
      body = A.body[Math.max(0, segIndex(A, tA))];
      if (SG) {                                    // final-build: a late analysis takes over from the soft mode (no jump)
        energy += (SG.energy - energy) * so; bright += (SG.bright - bright) * so; body += (SG.body - body) * so; kick *= 1 - so;
        for (let j = 0; j < 12; j++) Z.P12[j] += (SG.P12[j] - Z.P12[j]) * so;
      }
    } else {
      // procedural fallback at the track tempo (or 120 BPM): kick on 1 and 3,
      // a lighter one on 2 / 4, a syncopated push before 3, 8th-note hats
      Z.mode = "fallback";
      Z.db = null;
      const bpm = cachedTempo(item) || FALLBACK_BPM, beatMs = 60000 / bpm;
      const decay = clamp(beatMs * 0.36, 120, 200);
      const p = pA, k = Math.floor(p / beatMs);
      kick = 0;
      let pk = 0, kt = -1;
      for (let b = k - 1; b <= k + 1; b++) {
        const pos = ((b % 4) + 4) % 4, t0 = b * beatMs;
        const acc = pos === 0 ? 1 : pos === 2 ? 0.82 : 0.3;
        const e1 = hitEnv(p - t0, 20, decay) * acc;
        if (e1 > kick) { kick = e1; pk = acc; kt = t0; }
        if (pos === 1) { const e2 = hitEnv(p - t0 - beatMs * 0.5, 20, decay * 0.8) * 0.5; if (e2 > kick) { kick = e2; pk = 0.5; kt = t0 + beatMs * 0.5; } }
      }
      kick *= Z.drums; pk *= Z.drums;                          // v6: a podcast gets no procedural beat
      const K = Z.k; K.v = kick; K.pk = pk; K.sh = pk > 0 ? kick / pk : 0; K.z = 1; K.f = K.c = K.sh; K.t = kt; K.g = 0; K.m = pk; K.vk = 1;
      const half = beatMs / 2, hk = Math.floor(p / half);
      hat = hitEnv(p - hk * half, HAT_ATTACK_MS, HAT_DECAY_MS) * (hk % 2 ? 0.75 : 0.4) * Z.drums;
      const tS = posMs / 1000;
      energy = 0.42 + 0.07 * Math.sin(tS * 0.31) + 0.05 * Math.sin(tS * 0.83 + 1.7) + 0.2 * kick;
      for (let j = 0; j < 12; j++) {
        Z.P12[j] = 0.5 + 0.5 * (0.55 * Math.sin(j * 0.9 + tS * 0.9) + 0.45 * Math.sin(j * 0.37 - tS * 0.55 + 2.0));
      }
      bright = 0.5 + 0.3 * Math.sin(tS * 0.2);
      body = 0.45;
      if (SG) {                                    // final-build "modo ambiente suave": the slow drives take over
        energy += (SG.energy - energy) * so; bright += (SG.bright - bright) * so; body += (SG.body - body) * so;
        for (let j = 0; j < 12; j++) Z.P12[j] += (SG.P12[j] - Z.P12[j]) * so;
      }
    }
    // final-fix: what the layers do not cover gets its own share of the soft drives (x so: it fades with the soft mode, so a
    // late analysis takes it over without a jump; on analysed music SG is null and nothing here runs)
    const nl = SG ? softUncovered() : null;
    if (nl && nl.V > 0) energy = clamp(energy + so * nl.V * SOFT_NL_EN * SG.nMid, 0.02, 1);
    Z.body += (body - Z.body) * (1 - Math.exp(-dt / 160));
    Z.bright += (bright - Z.bright) * (1 - Math.exp(-dt / 420));
    Z.kick = kick * gate;
    // amplitude x shape: the renderers saturate the hit's amplitude (kickPk), never its shape (kickSh)
    Z.kickPk = Z.k.pk * (A ? 1 - (rhythmMode() === "bass" ? 0.25 /* v6-r2: Graves */ : 0.5) * num(A.four, 0) : 1); Z.kickSh = Z.k.sh * gate; Z.kickCam = Z.k.c * gate; Z.kickZ = Z.k.z; Z.kickVis = num(Z.k.vk, 1);
    // final-build: the hand-over's kicks fade in: their SHAPE (linear after the renderers' saturation; at 500 % a smaller
    // amplitude still saturates) and the camera's
    if (SG && A) { Z.kickSh *= 1 - so; Z.kickCam *= 1 - so; }
    Z.four = A ? num(A.four, 0) : 0;                       // r3: how four-on-the-floor this track is (0..1)
    Z.kickId = Z.k.t;                                     // onset of the dominant hit: a new one = a new additive impulse
    Z.slow = A ? Z.kickPk * Z.k.f * gate : Math.max(Z.kick, Z.slow * Math.exp(-dt / FOCUS_DECAY_MS));
    if (SG && A) Z.slow *= 1 - so;                 // final-build: the focus pull too
    Z.low = (1 - kick) * 0.12 * Z.body * gate;            // the sustained low end alone
    Z.bass = (kick + (1 - kick) * 0.12 * Z.body) * gate;  // hits + a little sustained low end
    Z.hat = hat * gate;
    if (nl) {                                      // final-fix: the soft low end / hat level of the uncovered parts
      const lo = so * nl.G * SOFT_NL_LOW * (0.5 + 0.5 * SG.nLow) * gate;
      Z.low += lo; Z.bass += lo;
      Z.hat += so * nl.A * SOFT_NL_AIR * (0.5 + 0.5 * SG.nAir) * gate;
    }
    Z.softJ = SG ? so * (nl && nl.L ? 1 : 0) : 0;   // final-fix: the calmer shimmer only where the layers carry the motion
    Z.softB = nl ? so * nl.V * SOFT_NL_BARS * (0.5 + 0.5 * SG.nMid) * gate : 0;   // final-fix: "Barras": the whole field swells
    Z.energy = energy * gate;
    // r3: the energy's ONSETS alone (energy minus a 200 ms follower of it, x 2.5, 0..1): what the crown / bars keep of v5's
    // energy term in BR trap / funk (the onsets of the 808s and snares) without lifting the rest between the kicks
    Z.eSlow = num(Z.eSlow, 0) + (Z.energy - num(Z.eSlow, 0)) * (1 - Math.exp(-dt / 200));
    Z.eOn = clamp(2.5 * (Z.energy - Z.eSlow), 0, 1) * Z.drums;   // v6: x drums present (without drums these onsets are the voice's)
    // "Balanço no ritmo" (v5): the beat grid at the same audible position as the hits; the pulse never waits for a
    // detected kick, so the rhythm stays visible where kick detection misses (dense passages, soft kicks)
    const g = grooveAt(A, pA, A ? A.tempo : cachedTempo(item) || FALLBACK_BPM, Z.gr);
    const envT = gate * (GROOVE_ENV_FLOOR + (1 - GROOVE_ENV_FLOOR) * clamp(energy / 0.45, 0, 1));
    Z.grooveEnv += (envT - Z.grooveEnv) * (1 - Math.exp(-dt / GROOVE_ENV_MS));
    const acc = g.ph < 1 - GROOVE_RISE ? g.acc0 : g.acc1;
    Z.groove = (groovePulse(g.ph) * acc / (1 + GROOVE_DOWN)) * Z.grooveEnv;
    Z.sway = Math.cos(Math.PI * g.pos) * Z.grooveEnv;
    // v6-r2: the groove / sway follow an EASED copy of the gate on its way up (ND_DRG_MS; the fall is the gate's own 1-bar
    // cosine): a drum run opens on a beat, where the pendulum is at +-1, and v6 snapped the crown's sway / the ribbons'
    // phase in one frame. The hit list keeps the instant gate (the first kick lands in full)
    const dG0 = num(Z.drG, 0), dG = Z.drums > dG0 ? dG0 + (Z.drums - dG0) * (1 - Math.exp(-dt / ND_DRG_MS)) : Z.drums;
    Z.drG = dG;
    Z.groove *= dG; Z.sway *= dG;                          // v6: no drums, no groove
    Z.beatPos = g.pos; Z.beatPh = g.ph; Z.beatMs = g.ms; Z.down = acc > 1 ? 1 : 0;
    for (let i = 0; i < SIGNAL_TAPS.length; i++) {          // extension point (v5b: "el")
      try { SIGNAL_TAPS[i].fn(Z, A, pA, dt, playing); } catch (e) { /* a broken tap never stops the visualizer */ }
    }
    return Z;
  }

  /** effect drives from the signal channels: camera zoom (concave, so a median kick already kicks hard), focus pull
      (a gentler, slower "lens breath"), glow, and (v5) the groove's breathing / nod / sway of the visualizer */
  function effectsFrom(sig) {
    // per hit: a concave AMPLITUDE (a median kick already kicks hard), scaled down in dense runs, times the hit's
    // linear shape, so the camera falls back between dense hits instead of hovering (^0.7 no longer lifts the valley)
    // v5b "Camadas por elemento": the scene part (null when off: every value below is exactly v5); "Quando o grave
    // entra" adds a camera punch (inside the zoom budget, zoomMax) and a flash (still capped by glowLayers); r2: a
    // breakdown's calm shrinks the soft hits' camera / focus / flash too (hitK)
    const L = elScene(sig), ent = L && L.K.E ? L.K.E * L.E.ent : 0, hk = L ? num(L.E.hitK, 1) : 1;
    const zd = (sig.kickPk > 0.04 ? Math.pow((sig.kickPk - 0.04) / 0.96, 0.7) : 0) * sig.kickZ * sig.kickCam * hk;
    const fd = (sig.slow > 0.04 ? Math.pow((sig.slow - 0.04) / 0.96, 0.9) : 0) * hk * ND_FK + ND_FE * ent;
    const zAmt = CFG.zoom.on && !S.reducedMotion ? CFG.zoom.amount / 100 : 0;
    const gAmt = CFG.glow.on ? CFG.glow.amount / 100 : 0;
    const glow = gAmt * ND_GK * sig.kickPk * sig.kickCam * (0.4 + 0.6 * sig.kickZ) * hk + EL_GLOW * gAmt * ent;   // 0..5; dense runs flash a little softer
    const grAmt = grooveAmt(), gr = num(sig.groove, 0);
    // final-build "modo ambiente suave": the camera breathes slowly (<= SOFT_CAM, x the zoom setting up to 100 %) and the crown
    // sways on its own slow pendulum; neither with reduced motion (zAmt is 0 then) nor on any beat
    const so = num(sig.soft, 0), SGx = so > 0 ? sig.sg : null;
    const zoom = 1 + ZOOM_MAX * zAmt * zd + (SGx ? SOFT_CAM * Math.min(1, zAmt) * so * SGx.cam : 0);
    return {
      // r2: the entry's punch stays inside v5's zoom budget (it shows when the kick zoom is not at its peak), so
      // "Alcance" sizes are v5a's (v5b reserved it in zoomMax: the crown 5-13 % shorter all the time)
      zoom: ent > 0 ? Math.min(zoomMaxOf(zAmt), zoom + EL_ZOOM * zAmt * ent) : zoom,   // linear in the setting: 1.33 at 500%
      el: L,
      // <= 0.5 at 100%, 0.75 at 150-200% (as v3), then up to 0.9 (medium hits keep growing up to 500%)
      focus: zAmt ? clamp(fd * (0.5 * Math.min(1.5, zAmt) + 0.15 * Math.max(0, zAmt - 2)), 0, 0.9) : 0,
      glow,
      gk: Math.min(GLOW_HOT_FROM, glow),                                    // v3's glow look (bloom, haze, shadows) ...
      over: clamp((glow - GLOW_HOT_FROM) / (INT_MAX / 100 - GLOW_HOT_FROM), 0, 1),   // ... and how far past it (0 at 160%, 1 at 500%)
      glowOn: gAmt > 0,
      groove: grAmt,
      gs: 1 + GROOVE_SCALE * ND_GR * grAmt * gr,                                    // the visualizer's breathing scale
      gb: GROOVE_BOB * ND_GR * grAmt * gr,                                          // its nod (share of the window height, down)
      sway: GROOVE_SWAY * ND_GR * grAmt * num(sig.sway, 0) + (SGx && !S.reducedMotion ? SOFT_SWAY * so * SGx.sway : 0),   // "Anel neon": crown rotation (rad)
    };
  }
  /** layer opacities of a glow: v3's curves up to gk 1.6, then a hotter core that keeps growing, capped so the
      centre never turns white (bloom + flash + hot core are screen-blended tints of at most ~0.34 + 0.34 + 0.2) */
  function glowLayers(fx) {
    if (!fx.glowOn) return { bloom: 0.14, flash: 0, hot: 0 };
    const gk = fx.gk, o = fx.over;
    return { bloom: Math.min(1, 0.14 + 0.5 * gk + 0.06 * o), flash: Math.min(1, 0.42 * Math.pow(gk, 1.5) + 0.15 * o), hot: 0.9 * o };
  }

  /** linear up to 0.75, then eases towards 1 (no flat-topped clusters) */
  function softClip(x) {
    if (x <= 0) return 0;
    return x < 0.75 ? x : 0.75 + 0.25 * (1 - Math.exp(-(x - 0.75) / 0.25));
  }
  const chroma = (P12, q) => {
    const i0 = Math.floor(q), f = q - i0, fc = (1 - Math.cos(f * Math.PI)) / 2;
    return lerp(P12[i0], P12[Math.min(11, i0 + 1)], fc);
  };
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

