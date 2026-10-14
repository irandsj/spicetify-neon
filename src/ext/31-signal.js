  // ---- per-frame signal (shared by every visualizer): the signal bus ------------
  /** v5 signal bus. computeSignal() fills these NAMED CHANNELS on a view's signal object (SIG.main / SIG.preview)
      once per frame; the renderers (BARS / RING / WAVE: see their `reads`), the effects (effectsFrom) and any future
      reactive layer only READ them, never the analysis itself. Values are per frame, already at the audible position
      (the output latency applied) and gated by play / pause. A new per-element layer (e.g. a lead synth, hats,
      sub-bass, vocals) adds its own producer to SIGNAL_TAPS and its drawing to LAYERS, without touching the rest. */
  const SIGNAL_CHANNELS = Object.freeze({
    gate: "0..1 playing (eased: 140 ms in, 480 ms out)",
    kick: "0..1 the dominant bass hit now (= kickPk x kickSh)",
    kickPk: "0..1 that hit's strength (the renderers saturate this amplitude, never the shape)",
    kickSh: "0..1 that hit's shape (attack, one-frame hold, look-ahead decay), gated",
    kickCam: "0..1 the hit's shape for the camera / glow (plain musical decay), gated",
    kickZ: "0.6..1 density scale (dense runs pulse softer on the camera / glow / cover)",
    four: "0..1 v5b-r3: how four-on-the-floor the track is (A.four; 0 without an analysis)",
    kickVis: "0.3..1 v5b-r3: the hit's visual size, applied AFTER the renderers' saturation (off-beat tick 0.5, a soft grid tick down to 0.3, a kick 1)",
    kickId: "onset time (ms) of the dominant hit: a new value = a new additive impulse (-1 before the first hit)",
    slow: "0..1 the focus-pull envelope (a slower lens breath)",
    bass: "0..1 hits + a little sustained low end",
    low: "0..~0.12 the sustained low end alone (between hits)",
    body: "0..1 segment body (loud and dark), eased 160 ms",
    hat: "0..1 bright transients (hats / claps), short envelope",
    energy: "0..1 broadband loudness",
    eOn: "0..1 v5b-r3: the energy's onsets (energy minus its 200 ms follower, x 2.5)",
    bright: "0..1 timbre brightness, eased 420 ms",
    P12: "Float32Array(12) chroma, cross-faded per segment",
    groove: "0..1 groove pulse (the groove effect): 1 on each beat (downbeats), x the energy envelope; independent of the setting",
    sway: "-1..1 pendulum over two beats (+-1 on the beats), x the same envelope",
    beatPos: "beats since the first one (continuous; tempo changes followed)",
    beatPh: "0..1 phase inside the current beat",
    beatMs: "length of the current beat (ms)",
    down: "1 while the pulse belongs to a downbeat (bars[]), else 0",
    grooveEnv: "0..1 the groove's envelope (gate x energy, eased GROOVE_ENV_MS)",
    drums: "0..1 v6 drums present (drumsAt: analysis look-ahead); the groove, sway and hat envelope here, the hit list, the snare / hat ticks and the dots' beat steps are already scaled by it",
    ext: "{ [tapId]: channels } of the SIGNAL_TAPS; v5b: ext.el = the per-element layers (elFrame): low / mid / air (0..1, " +
      "own attack / release), ent / entAge (the bass came in), entMid / entAir (soft entries), hatEnv + hat tick slots, snap / " +
      "snapAge (snare / clap), rise (riser ramp), calm (breakdown), harm (harmony drift), gAng / gR / glint (melody), seekAt; " +
      "null while 'Camadas por elemento' is off",
  });
  /** extension point: extra channel producers, run in order at the end of computeSignal(), each as
      tap.fn(Z, A, pA, dt, playing) writing its own channels into Z.ext[tap.id] (A = the digested analysis or null,
      pA = the audible analysis time in ms). v5b: "el" (elFrame, the per-element layers). */
  const SIGNAL_TAPS = [];
  /** extension point: per-element reactive layers, drawn into a view's canvas right under ("under") or over
      ("over") the style. { id, styles?: ["bars" | "ring" | "wave"], order: "under" | "over", layout?(v, state),
      draw(v, sig, fx, state) }; state = v.layers[id] (kept across re-layouts). v5b: order "haze" draws into the
      style's haze canvas just before it is blitted; "el-under" / "el-haze" / "el-over" are the per-element layers. */
  const LAYERS = [];
  function layoutLayers(v) {
    if (!LAYERS.length) return;
    v.layers = v.layers || {};
    for (const L of LAYERS) {
      if (L.styles && !L.styles.includes(v.style)) continue;
      const st = v.layers[L.id] || (v.layers[L.id] = {});
      if (L.layout) try { L.layout(v, st); } catch (e) { /* a broken layer never stops the visualizer */ }
    }
  }
  function drawLayers(v, sig, fx, order) {
    if (!LAYERS.length) return;
    for (const L of LAYERS) {
      if (L.order !== order || (L.styles && !L.styles.includes(v.style))) continue;
      try { L.draw(v, sig, fx, (v.layers && v.layers[L.id]) || {}); } catch (e) { S.layerErr = L.id + ": " + String((e && e.message) || e).slice(0, 160); }   // r2: kept for _el()
    }
  }
  function newSig() {
    return { gate: 0, bright: 0.5, body: 0, bass: 0, kick: 0, slow: 0, hat: 0, energy: 0, P12: new Float32Array(12), mode: "fallback", db: null, lat: LATENCY_MS,
      kickPk: 0, kickSh: 0, kickCam: 0, kickZ: 1, kickVis: 1, four: 0, eSlow: 0, eOn: 0, kickId: -1, low: 0, k: { v: 0, pk: 0, sh: 0, z: 1, f: 0, c: 0, t: -1, g: 0, m: 0, vk: 1 },
      groove: 0, sway: 0, beatPos: 0, beatPh: 0, beatMs: 500, down: 0, grooveEnv: 0, drums: 1, drG: 0, pcW: 1, P12s: null, gr: { pos: 0, ph: 0, ms: 500, acc0: 1, acc1: 1 }, ext: {} };
  }
  const SIG = { main: newSig(), preview: newSig() };
  /** "Balanço no ritmo" amount (0..5; 0 = off, and while Windows asks for less motion) */
  const grooveAmt = () => (CFG.groove && CFG.groove.on && !S.reducedMotion ? CFG.groove.amount / 100 : 0);

