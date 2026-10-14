  // ==== v5b "Camadas por elemento" (per-element layers) =========================================================
  // the per-element design (a merge of a visual-first and a music-first design). Every channel comes from
  // the Spotify analysis only and is sampled at the audible time pA (the hits' own latency path, Z.gate):
  //   LOW / MID / AIR    virtual bands (visual-first elDigest: ridge EL_W on per-track z-scored segment features)
  //   "o grave entrou"   bar rule on the music-first band rows (sub / bass, EL_BAND), snapped onto the kick
  //   riser ramp         look-ahead, anchored on those entries (the analysis knows where the bass comes back)
  //   breakdown calm     the bass level out for ~2 s (visual-first)
  //   MID / AIR entries  soft flourishes (visual-first rule, 8 s refractory)
  //   hats / snares      music-first tick classifiers (EL_CLS); a snare never within 45 ms of a hit >= 0.2
  //   harmony / melody   circle-of-fifths drift of the halo colour, the chroma's circular mean for the glint
  // Digest-time work runs once per track, deferred off the frame (elAttach after digest(), setTimeout 0); the frame
  // tap elFrame() is O(1) (binary searches, <= 8 tick slots). The kick pipeline (hits, kickAt, dynStep / "Volta",
  // caps, zoom, glow, groove) is untouched: the layers replace only the renderers' between-hit "rest" terms and add
  // drawn layers. Master off (or no channels yet) = exactly the v5 look, line by line.
  const EL_HOP = 50;                 // ms grid of the per-track layer curves
  const EL_FEAT_BOX = 3;             // grid points (150 ms) of feature smoothing (odd)
  const EL_ATT_BOX = 5;              // grid points (250 ms) for the attack density
  const EL_AR = { low: [40, 300], mid: [150, 800], air: [60, 400] };   // per-layer attack / release (ms)
  const EL_ENTRY_THR = 0.35, EL_ENTRY_WIN = 3000, EL_ENTRY_SMOOTH = 600, EL_ENTRY_HALF = 2000, EL_ENTRY_SNAP = 250;
  const EL_ENTRY_TOP = 0.55, EL_QUIET_LO = 0.25, EL_QUIET_MEAN = 0.35;
  // MID / AIR soft entries: at most one per 20 s per band. The spec's 8 s (visual-first: 6 s) failed acceptance A9 on
  // the built code (lo-fi MID 2.9 / house + lo-fi AIR 2.6 per min > 2); 10-15 s still failed lo-fi; 20 s passes every
  // genre (max 1.7 per min) and raises the truth confirmation (GT-B: MID .74 -> .78, AIR .73 -> .80)
  const EL_ENTRY_REFR = 20000;
  const EL_ENTRY_MS = 900;           // an entry's envelope: 40 ms rise, then a squared fall
  const EL_CALM_SMOOTH = 2000, EL_CALM_HI = 0.4, EL_CALM_SPAN = 0.3;   // breakdown: the bass level over 2 s
  const EL_BAR_DB = { sub: 7.5, bass: 8 };   // "o grave entrou": a band's bar level rose this much (dB) over the louder
  const EL_BAR_PB = 0.35;                    // of the two bars before, the next bar holds, and the band is present
  const EL_BUILD_BARS = 8;           // the riser ramp looks back at most 8 bars before an entry
  const EL_HAT_MIN = 0.25, EL_SNR_MIN = 0.3, EL_SNR_KICK_MS = 45;   // tick lists (classifier score, normalised locally)
  const EL_SNR_RUN_MIN = 0.6;        // v5b-r2: a snare / clap inside a four-on-the-floor kick run needs this score
  const EL_TICK_NORM_MS = 30000;     // v5b-r2: ... over the segments within +-30 s (v5b: the whole track)
  // v5b-r2: the entry's anchor (elDigest2): the segment start in [bar - EL_ANC_LO, bar + EL_ANC_HI] beats with the biggest
  // sub + bass band-row step (EL_ANC_WIN ms after vs before), then the strongest hit >= 0.2 within +-EL_ANC_SNAP ms.
  // (v5b: the bar line +-120 ms, moved with the kick clock: on the low-end step 33 % of the reference entries, trance 25 %)
  // v5b-r3: up to 4 beats after the bar line (r2: 2; a drop whose bass lands on beat 4 fired 1.2 s early), near-ties go to the
  // EARLIEST candidate within EL_ANC_TIE dB of the best (r2: the later one won a 4.0 vs 4.1 dB tie, 270 ms after the 808), and
  // an entry whose anchor step is under EL_ENT_CONF_DB with no hit >= EL_ENT_CONF_HIT on it fires at EL_ENT_WEAK (the shock and
  // its camera / glow punch: on the reference set, the well-timed shockwaves have a step p50 16 dB and a hit .99 on them, the off / false ones
  // 6 dB and .22; LOGO: 22 of 23 good ones stay full, 8 of 13 bad ones shrink; a hard gate lost A6 recall)
  const EL_ANC_LO = 1, EL_ANC_HI = 4, EL_ANC_WIN = 300, EL_ANC_SNAP = 30, EL_ANC_TIE = 1.5;
  const EL_ENT_CONF_DB = 9, EL_ENT_CONF_HIT = 0.45, EL_ENT_WEAK = 0.35;
  const EL_ENT_GAP_BARS = 4, EL_ENT_GAP_MS = 8000;    // one drop, one shockwave (v5b fired twice on 6 bar pairs)
  const EL_ENT_WIN_DB = 6;                             // ... a later one wins only with a band-row step this much bigger
  const EL_RAMP_OUT_DB = 3;                           // riser: only over bars whose band rows are >= 3 dB under the entry bar
  const EL_SEEK_MS = 250;            // the audible time jumped more than this: a seek, no event before it fires
  const EL_FADE_MS = 400;            // the layers fade in once the deferred digest is there
  // r3: the twinkle decays in 140 ms (r2: 90 ms: a hat lit 3-4 px dots by +0.2 for ~3 frames, on screen barely visible)
  const EL_TICKS = 8, EL_TICK_WIN = 450, EL_TWINKLE_MS = 140;   // hat tick slots, their window, the twinkle decay
  // v5b-r3: the soft entries' FLASH ("a voz entrou" / "os agudos entraram"): 40 ms rise, a squared fall over EL_FLASH_MS (r2
  // drew them only as a 1.5 px ring in "Anel neon", nothing in "Barras" / "Onda": 0.0-0.1 % of the screen changed)
  const EL_FLASH_MS = 600, EL_SWEEP_RAD = 0.6, EL_CASCADE_MS = 500;
  // v5b-r3: while hats play, the dots / sparks never fall under EL_HAT_FLOOR (a low AIR reading blanked the ring in a drop)
  const EL_HAT_FLOOR = 0.3;
  const EL_SNAP_MS = 160;            // snare / clap flick decay
  const EL_SHOCK_MS = 700;           // the bass-entry shockwave travels this long
  const EL_DOT_R = 1.12;             // "Anel neon" dots: radius r0 + 2 + 1.12 x len x ex (outside the caps' 1.09)
  const EL_ZOOM = 0.065, EL_GLOW = 0.6;      // the entry's camera punch / glow at 100 % (x "Zoom" / "Brilho na batida")
  // the layer-driven part of the between-hit rest eases into EL_REST_MAX (of the "Alcance" range): the spec's terms alone
  // reach REST_MAX (0.8) on a loud bass, where blendH() hides every hit below it (per-hit kick test, H1: bars 79 %); under
  // this cap a 0.2 hit still lifts >= 15 % (calibrated with test/kick.cjs, out/v5b/kick-*.txt)
  const EL_REST_MAX = 0.6;          // r2: the ceiling of Voz / Agudos (elRestK: knee at 2/3 of it)
  // v5b-r2: "Grave" (the bass body between kicks) has its own, lower ceiling (v5b shared 0.45: with the layers on the
  // body between beats doubled, trance ring p50 .21 -> .43, and the kick stood out ~37 % less against it; r2: ring body p50 .24, the
  // punch over the body >= 0.86 x v5 in every style and genre at typical settings)
  const EL_GRAVE_MAX = 0.3;
  // "Grave" skips the rest smoothing (it has its own 40 / 300 ms follower, like the groove's lift). v5b-r2: its
  // SIDECHAIN comes after the kick, as in a trance / trap mix: from the hit's peak (attack + hold) the body dips by up to
  // EL_SC and swells back with EL_SC_MS, so every kick rises from the full body and pumps it (v5b dipped in the 80 ms
  // BEFORE every hit: a "blink" before each kick)
  const EL_SC = 0.8, EL_SC_MS = 220, EL_DUCK_HIT = 0.12;
  // "Anel neon": with "Agudos e chimbal" on, the crown keeps half of v5's hat sparkle (the dots carry the hats); the dense
  // acceptance needs crown transients on dense onsets (measured: ring dense recall .277 with none, .287 with half)
  const EL_CROWN_HATS = 2.5;
  const ND_V_CR0 = 0.67;   // v6-r2: the share of ND_V_CR kept without drums
  const ND_V_CR = 0.9;   // v6-r2: ND_V_CR 0.6 -> 0.9
  // v5b-r3: with "Voz e melodia" on, the crown's top / the bars' centre keep EL_KEEP_MID of v5's energy term (the voice
  // has its own halo / band; r2 took the term off completely and in BR trap / funk the crown and bars pulsed 30-40 % less
  // often than with the layers off: dense bass-onset recall .330 -> .265, pulses 1.41 -> 0.97 / s); with "Agudos e
  // chimbal" on, the bars' tips keep EL_BARS_HATS of v5's per-hat flicker (r2: none, the hats showed less with the layers)
  // (x (1 - A.four): on four-on-the-floor tracks the kick clock carries the pulse and the energy term only filled the gaps
  // between the kicks: trance dense pairs distinct .87 -> .69 with it)
  // (measured at typical settings, reference BR trap / funk: ring dense recall .265 -> .328 of .330 off, matched pulses .72 ->
  // 1.03 of 1.03 / s; bars .264 -> .328 of .343, .70 -> .99 of 1.03; trance / house: unchanged by it)
  const EL_KEEP_MID = 1, EL_KEEP_HATS = 1, EL_BARS_HATS = 1;
  /** v5b-r2: a camada's rest term at amount K (0..5). Up to 100 % the amount scales the music's input; past it, the
      input grows with sqrt(K) and the CEILING with 1 + 0.3 log2(K) (x1.7 at 500 %), so 200..500 % still grow and the
      music keeps moving the layer under its ceiling (v5b multiplied the input by K into one fixed 0.45 cap: from ~200 %
      on, 'Grave' sat on the cap, 500 % looked like 200 %) */
  const elKin = (K) => (K <= 1 ? K : Math.sqrt(K));
  const elKcap = (K) => (K <= 1 ? 1 : 1 + 0.3 * Math.log2(K));
  function elRestK(x, K, cap) {
    const c = (cap || EL_REST_MAX) * elKcap(K), kn = 0.67 * c, y = x * elKin(K);
    return y <= kn ? (y > 0 ? y : 0) : kn + (c - kn) * (1 - Math.exp(-(y - kn) / (c - kn)));
  }
  const EL_IDS = ["low", "voice", "air", "entry", "snare", "mood"];

  // ---- layer models: weight blocks kept apart (like BASS_MODEL) so they can be swapped / retrained ---------------
  /** visual-first virtual bands: ridge (lambda 10) on 15 per-track z-scored features [loud, floor, t0..t11, attps],
      fit on 93 recorded windows / 43 tracks (an offline fit); leave-one-track-out cost <= .01 */
  const EL_W = {
    low: { b: 0.0, mu: [0.05088, 0.03899, 0.06731, -0.01826, 0.0068, -0.03182, -0.01995, 0.02567, 0.00482, -0.01919, 0.03292, 0.00514, -0.02799, -0.01542, 0.00832],
      w: [0.10586, -0.02122, 0.37378, -0.23424, -0.4109, -0.15609, -0.26905, -0.01351, 0.30137, -0.01217, 0.08253, 0.07972, -0.0421, -0.06947, -0.01807] },
    mid: { b: 0.0, mu: [0.05088, 0.03899, 0.06731, -0.01826, 0.0068, -0.03182, -0.01995, 0.02567, 0.00482, -0.01919, 0.03292, 0.00514, -0.02799, -0.01542, 0.00832],
      w: [0.47002, -0.12187, 0.17956, -0.25919, 0.42591, -0.04809, 0.17553, 0.02507, 0.07162, -0.11143, 0.04325, 0.0381, 0.01924, -0.00754, -0.07323] },
    air: { b: -0.0, mu: [0.05088, 0.03899, 0.06731, -0.01826, 0.0068, -0.03182, -0.01995, 0.02567, 0.00482, -0.01919, 0.03292, 0.00514, -0.02799, -0.01542, 0.00832],
      w: [0.40639, -0.06224, 0.21046, 0.32835, -0.17318, -0.23072, 0.20792, -0.03652, 0.0027, 0.0639, -0.10432, -0.03758, -0.0274, -0.03535, 0.03042] },
  };
  /** music-first band rows (m4_models.json "lv", ridge lambda 30): band level of a segment (dB) =
      loudness_max + [1, (x - mu) / sd] . W_b, x = [t0..t11, loudness_max, loudness_start, attack, ln dur ms, lmt / dur] */
  const EL_BAND = {
    mu: [48.8683, 25.3474, -6.2682, 0.2698, 25.0591, -30.685, 2.7154, -0.7526, -7.7025, 2.8774, -12.2145, -0.8943, -7.0003, -15.9208, 8.9204, 5.3403, 0.2232],
    sd: [5.8114, 69.1839, 53.9964, 47.1002, 32.014, 37.5585, 25.7758, 25.6391, 18.0488, 19.7797, 19.5541, 14.4308, 5.7276, 7.4528, 5.7961, 0.499, 0.1771],
    W: {
      sub: [-15.1042, 1.311, 0.7398, -5.3363, -0.5418, -3.007, -1.3763, 4.6206, 0.6832, 1.2034, 0.7106, -0.8621, -1.9264, 0.5275, 0.4659, -0.0778, 0.3157, 0.1937],
      bass: [-11.0683, 1.7737, -0.6725, -4.0612, -0.6892, -2.4436, -0.3855, 1.609, 0.551, 0.5685, 0.5914, -0.2047, -0.445, -0.6505, -0.0186, -0.6189, 0.7117, 0.0508],
      highmid: [-17.8815, -0.4726, 4.4675, 2.4462, 0.5087, -0.1941, 0.4964, -0.9733, -0.2185, 0.0605, -0.5021, 0.1021, 0.0396, 0.9098, 0.4091, 0.373, -0.1997, 0.0456],
      air: [-21.1995, -1.8084, 6.5786, -2.317, -0.7718, 3.058, -1.0012, 0.1993, 0.1589, -1.6158, -0.925, 0.0771, -0.4726, 2.708, 1.5241, 0.7162, -0.4324, -0.0105],
    },
  };
  /** music-first tick classifiers (m7_cls.json, linear probability, ridge lambda 10): score = [1, (f - mu) / sd] . W,
      f = the 29 tick features of a segment start (elTickF): the 17 band-row features, the change of t0..t3 /
      loudness_max / attack from the previous segment, beat / tatum phase, beat-in-bar one-hot */
  const EL_CLS = {
    mu: [48.8687, 25.46, -6.2798, 0.4153, 25.074, -30.657, 2.6835, -0.739, -7.7053, 2.8604, -12.2452, -0.902, -6.9966, -15.9144, 8.9179, 5.3428, 0.2231, 0.0109, 0.1375, -0.0433, 0.1838, 0.0154, 0.0026, 0.2419, 0.217, 0.0483, 0.0868, 0.0756, 0.1142],
    sd: [5.8353, 69.1118, 54.0217, 47.3723, 32.0079, 37.5603, 25.7994, 25.6813, 18.0456, 19.7872, 19.6003, 14.432, 5.7455, 7.4676, 5.7984, 0.5028, 0.1772, 3.179, 53.3445, 43.5103, 63.0462, 4.4916, 6.0848, 0.1598, 0.1448, 0.2143, 0.2815, 0.2644, 0.3181],
    hat: [0.47145, 0.14161, 0.00405, -0.07051, 0.03829, 0.01461, 0.00111, 0.04206, -0.06409, 0.00359, -0.0346, 0.0342, -0.02069, -0.00752, -0.13652, 0.16837, -0.03117, -0.03637, -0.05661, 0.06941, -0.03388, 0.00086, 0.02753, -0.02583, 0.00343, -0.03546, 0.01996, 0.00677, 0.01332, 0.01354],
    snare: [0.15887, 0.01614, 0.02393, -0.04737, 0.05401, 0.00774, 0.02646, 0.01583, 0.02302, -0.00077, 0.00993, 0.012, -0.0174, 0.02907, -0.0558, 0.10067, -0.02497, -0.00146, -0.0182, 0.0018, 0.08401, 0.05228, -0.01011, -0.0062, -0.00796, -0.01475, -0.01089, -0.00388, -0.00112, -0.00932],
  };

  // ---- digest-time helpers ----------------------------------------------------------------------------------------
  const elN01 = (v, lo, hi) => { const x = (v - lo) / Math.max(1e-9, hi - lo); return x < 0 ? 0 : x > 1 ? 1 : x; };
  /** centred box over an odd number of grid points, edge padded (numpy pad(edge) + convolve(same)) */
  function elBox(x, n) {
    if (n <= 1) return Float32Array.from(x);
    const N = x.length, h = n >> 1, out = new Float32Array(N);
    let s = 0;
    const at = (i) => x[i < 0 ? 0 : i >= N ? N - 1 : i];
    for (let i = -h; i <= h; i++) s += at(i);
    for (let i = 0; i < N; i++) { out[i] = s / n; s += at(i + h + 1) - at(i - h); }
    return out;
  }
  /** numpy's default (linear) percentile, p in 0..1 */
  function elPct(arr, p) {
    const s = Float64Array.from(arr).sort();
    if (!s.length) return 0;
    const r = p * (s.length - 1), i = Math.floor(r), f = r - i;
    return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * f : s[i];
  }
  function elNorm(x) {
    const lo = elPct(x, 0.10), hi = elPct(x, 0.97), k = 1 / Math.max(1e-6, hi - lo), out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = clamp((x[i] - lo) * k, 0, 1);
    return out;
  }
  /** x[i] - min(x over the trailing win) */
  function elRiseOver(x, win) {
    const n = Math.round(win / EL_HOP), out = new Float32Array(x.length), q = [];
    for (let i = 0; i < x.length; i++) {
      while (q.length && x[q[q.length - 1]] >= x[i]) q.pop();
      q.push(i);
      while (q[0] < i - n) q.shift();
      out[i] = x[i] - x[q[0]];
    }
    return out;
  }
  /** first index with a[i] >= x (numpy searchsorted, side left) */
  function elLB(a, x) {
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
    return lo;
  }
  /** linear interpolation on the 50 ms grid (t in ms) */
  function elSample(arr, t) {
    const x = t / EL_HOP, i = Math.floor(x);
    if (i < 0) return arr[0];
    if (i + 1 >= arr.length) return arr[arr.length - 1];
    return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
  }
  const elStarts = (list) => Float64Array.from((Array.isArray(list) ? list : []).filter((b) => b && isFinite(b.start)), (b) => b.start * 1000);

  /** the per-track layer channels (once per track; elAttach). M = optional model overrides { W, band, cls } (tests).
      Three stages, so the deferred digest runs as three short tasks (elAttachDeferred) */
  function elDigest(d, A, M) { return elDigest2(d, A, M, elDigest1(d, A, M, elFeatures(d, A))); }
  /** stage 0: the 15 grid features of the virtual bands (visual-first elDigest, unchanged), z-scored over the track */
  function elFeatures(d, A) {
    const segs = d.segments, n = A.n;
    const durMs = Math.max(1000, num(d.track && d.track.duration, 0) * 1000 || (A.start[n - 1] + A.dur[n - 1]) * 1000);
    const N = Math.ceil(durMs / EL_HOP), T = new Float64Array(N);
    for (let i = 0; i < N; i++) T[i] = i * EL_HOP;
    const F = [], loudP = new Float32Array(N), floor = new Float32Array(N), tb = [], imp = new Float32Array(N);
    for (let j = 0; j < 12; j++) tb.push(new Float32Array(N));
    let k = 0;
    for (let i = 0; i < N; i++) {
      const t = T[i] / 1000;
      while (k + 1 < n && A.start[k + 1] * 1000 <= T[i]) k++;      // compared in ms (a segment exactly on a grid point)
      const kk = A.start[k] * 1000 <= T[i] ? k : 0;
      const s0 = A.start[kk], tm = s0 + Math.max(0.0005, A.lmt[kk]);   // the theme's dbAt() without its segIndex cache
      let db;
      if (t < s0) db = A.l0[0];
      else if (t < tm) db = lerp(A.l0[kk], A.lmax[kk], (t - s0) / (tm - s0));
      else {
        const end = kk + 1 < n ? A.start[kk + 1] : s0 + A.dur[kk], next = kk + 1 < n ? A.l0[kk + 1] : A.lmax[kk];
        db = t >= end ? next : lerp(A.lmax[kk], next, (t - tm) / Math.max(0.001, end - tm));
      }
      loudP[i] = Math.pow(10, db / 10);
      floor[i] = A.l0[kk];
      const tbv = segs[kk] && Array.isArray(segs[kk].timbre) ? segs[kk].timbre : null;
      for (let j = 0; j < 12; j++) tb[j][i] = tbv ? num(tbv[j], 0) : 0;
    }
    for (let i = 0; i < n; i++) {
      const g = Math.min(N - 1, Math.max(0, Math.ceil(A.start[i] * 1000 / EL_HOP - 1e-9)));
      imp[g] += Math.max(0, A.lmax[i] - A.l0[i]);
    }
    const lp = elBox(loudP, EL_FEAT_BOX), loud = new Float32Array(N);
    for (let i = 0; i < N; i++) loud[i] = 10 * Math.log10(lp[i] + 1e-12);
    F.push(loud, elBox(floor, EL_FEAT_BOX));
    for (let j = 0; j < 12; j++) F.push(elBox(tb[j], EL_FEAT_BOX));
    const att = elBox(imp, Math.max(EL_FEAT_BOX, EL_ATT_BOX));
    for (let i = 0; i < N; i++) att[i] *= (1000 / EL_HOP) / 10;
    F.push(att);
    for (const f of F) {                                             // z-score every feature over the track
      let m = 0, v = 0;
      for (let i = 0; i < N; i++) m += f[i];
      m /= N;
      for (let i = 0; i < N; i++) v += (f[i] - m) * (f[i] - m);
      const sd = Math.sqrt(v / N) + 1e-9;
      for (let i = 0; i < N; i++) f[i] = (f[i] - m) / sd;
    }
    return { F, N, T };
  }
  /** stage 1: the virtual bands LOW / MID / AIR, the breakdown calm, the MID / AIR soft entries, the harmony / melody homes */
  function elDigest1(d, A, M, FP) {
    M = M || {};
    const WV = M.W || EL_W, n = A.n, F = FP.F, N = FP.N, T = FP.T;
    const el = { hop: EL_HOP, N, lev: {}, mode: "" };
    if (M.keepF) el.F = F;
    for (const b of ["low", "mid", "air"]) {
      const Wb = WV[b], v = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let s = Wb.b;
        for (let j = 0; j < F.length; j++) s += Wb.w[j] * (F[j][i] - Wb.mu[j]);
        v[i] = s;
      }
      el.lev[b] = elNorm(v);                                         // 0..1 of this track
    }
    // (e) breakdown calm: the bass has been (mostly) out for ~2 s
    const l2 = elBox(el.lev.low, (Math.round(EL_CALM_SMOOTH / EL_HOP)) | 1);
    el.calm = new Float32Array(N);
    for (let i = 0; i < N; i++) el.calm[i] = clamp((EL_CALM_HI - l2[i]) / EL_CALM_SPAN, 0, 1);
    // (f) MID / AIR soft entries ("a voz / os agudos entraram"): the 600 ms level was really out, then rose >= 0.35 of
    // the track's range to >= 0.55; the largest rise within +-2 s, one per EL_ENTRY_REFR, snapped onto the note
    const n3 = Math.round(EL_ENTRY_WIN / EL_HOP), n05 = Math.round(500 / EL_HOP), hh = Math.round(EL_ENTRY_HALF / EL_HOP);
    for (const b of ["mid", "air"]) {
      const s = elBox(el.lev[b], (Math.round(EL_ENTRY_SMOOTH / EL_HOP)) | 1), r3 = elRiseOver(s, EL_ENTRY_WIN), tt = [], ss = [];
      let last = -1e18;
      for (let i = n3; i < N - 1; i++) {
        if (r3[i] < EL_ENTRY_THR || s[i] < EL_ENTRY_TOP || r3[i] < r3[i - 1] || r3[i] <= r3[i + 1]) continue;
        let top = true;
        for (let j = Math.max(0, i - hh); j < Math.min(N, i + hh) && top; j++) if (r3[j] > r3[i]) top = false;
        if (!top) continue;
        let j = i;
        while (j > 0 && r3[j - 1] >= 0.5 * r3[i]) j--;
        let mn = 1, mean = 0, cnt = 0;
        for (let q = Math.max(0, i - n3); q <= i; q++) mn = Math.min(mn, s[q]);
        for (let q = Math.max(0, j - n3); q < Math.max(1, j - n05); q++) { mean += s[q]; cnt++; }
        if (mn > EL_QUIET_LO || (cnt ? mean / cnt : 1) > EL_QUIET_MEAN || T[j] - last < EL_ENTRY_REFR) continue;
        last = T[j];
        let tBest = T[j], aBest = -1;
        for (let q = elLB(A.start, (T[j] - EL_ENTRY_SNAP) / 1000 - 1e-9); q < n; q++) {
          const ts = A.start[q] * 1000;
          if (ts < T[j] - EL_ENTRY_SNAP) continue;
          if (ts > T[j] + EL_ENTRY_SNAP) break;
          const a = A.lmax[q] - A.l0[q];
          if (a > aBest) { aBest = a; tBest = ts; }
        }
        tt.push(tBest); ss.push(Math.min(1, r3[i] / 0.7));
      }
      el[b === "mid" ? "mEntT" : "aEntT"] = Float64Array.from(tt);
      el[b === "mid" ? "mEntS" : "aEntS"] = Float32Array.from(ss);
    }
    // (j) harmony home (circle of fifths, duration weighted) and the melody's mean angle (reduced motion: the glint
    // stays there)
    let cx = 0, cy = 0, mx = 0, my = 0;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, gx = 0, gy = 0, s2 = 0;
      for (let p = 0; p < 12; p++) {
        const v = A.pit[i * 12 + p], v2 = v * v;
        x += v * EL_FIFTH_COS[p]; y += v * EL_FIFTH_SIN[p];
        gx += v2 * EL_PC_COS[p]; gy += v2 * EL_PC_SIN[p]; s2 += v2;
      }
      cx += x * A.dur[i]; cy += y * A.dur[i];
      if (s2 > 1e-9) { mx += (gx / s2) * A.dur[i]; my += (gy / s2) * A.dur[i]; }
    }
    el.home = Math.atan2(cy, cx);
    el.gHome = mx || my ? Math.atan2(my, mx) : -Math.PI / 2;
    return el;
  }
  /** stage 2: the band rows, the bars ("o grave entrou", the riser ramp), the tick classifiers (hats / snares) */
  function elDigest2(d, A, M, el) {
    M = M || {};
    const BM = M.band || EL_BAND, CM = M.cls || EL_CLS, segs = d.segments, n = A.n;
    // (b) per-segment features + the band rows (sub, bass, highmid, air: dB)
    const X = new Float64Array(n * 17), st = new Float64Array(n), en = new Float64Array(n), satt = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = segs[i] || {}, tv = Array.isArray(s.timbre) ? s.timbre : [], o = i * 17;
      const du = num(s.duration, 0) * 1000, lm = num(s.loudness_max, -60), l0 = num(s.loudness_start, -60), d1 = Math.max(du, 1);
      for (let j = 0; j < 12; j++) X[o + j] = num(tv[j], 0);
      X[o + 12] = lm; X[o + 13] = l0; X[o + 14] = Math.max(0, lm - l0); X[o + 15] = Math.log(d1);
      X[o + 16] = clamp(num(s.loudness_max_time, 0) * 1000 / d1, 0, 1);
      st[i] = A.start[i] * 1000; en[i] = st[i] + du; satt[i] = X[o + 14];
    }
    const BN = ["sub", "bass", "highmid", "air"], LV = BN.map(() => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const o = i * 17;
      for (let b = 0; b < 4; b++) {
        const w = BM.W[BN[b]];
        let s = w[0];
        for (let j = 0; j < 17; j++) s += w[j + 1] * (X[o + j] - BM.mu[j]) / BM.sd[j];
        LV[b][i] = X[o + 12] + s;
      }
    }
    // (c) bars: duration-weighted power mean of each band row, present-ness PB (track's p10 -> 0, p95 -> 1), density
    const bs = elStarts(d.bars), nb = bs.length, bd = new Float64Array(nb);
    { const bl = (Array.isArray(d.bars) ? d.bars : []).filter((b) => b && isFinite(b.start)); for (let q = 0; q < nb; q++) bd[q] = num(bl[q].duration, 0) * 1000; }
    const BdB = BN.map(() => new Float64Array(nb)), dens = new Float64Array(nb);
    for (let q = 0; q < nb; q++) {
      const a = bs[q], e = a + bd[q];
      let i = Math.max(0, elLB(st, a) - 1);
      while (i > 0 && en[i - 1] > a) i--;
      let ov = 0, cntA = 0;
      const pw = [0, 0, 0, 0];
      for (; i < n && st[i] < e; i++) {
        if (st[i] >= a && satt[i] > 6) cntA++;
        const o = Math.min(en[i], e) - Math.max(st[i], a);
        if (!(o > 0)) continue;
        ov += o;
        for (let b = 0; b < 4; b++) pw[b] += Math.pow(10, LV[b][i] / 10) * o;
      }
      for (let b = 0; b < 4; b++) BdB[b][q] = ov > 0 ? 10 * Math.log10(pw[b] / ov + 1e-12) : NaN;
      dens[q] = cntA / Math.max(0.5, bd[q] / 1000);
    }
    const PB = BN.map(() => new Float64Array(nb));
    for (let b = 0; b < 4; b++) {
      const col = BdB[b];
      let mn = Infinity;
      for (let q = 0; q < nb; q++) if (isFinite(col[q]) && col[q] < mn) mn = col[q];
      for (let q = 0; q < nb; q++) if (!isFinite(col[q])) col[q] = isFinite(mn) ? mn : -60;
      const lo = elPct(col, 0.10), hi = elPct(col, 0.95);
      for (let q = 0; q < nb; q++) PB[b][q] = elN01(col[q], lo, hi);
    }
    const dLo = nb ? elPct(dens, 0.10) : 0, dHi = nb ? elPct(dens, 0.90) : 1, densN = new Float64Array(nb);
    for (let q = 0; q < nb; q++) densN[q] = elN01(dens[q], dLo, dHi);
    // "o grave entrou" (G3): sub or bass rose >= 7.5 / 8 dB over the louder of the two bars before, the next bar holds
    let entK = [], entS0 = [];
    for (let q = 2; q < nb - 1; q++) {
      let e = 0;
      for (const [b, th] of [[0, EL_BAR_DB.sub], [1, EL_BAR_DB.bass]]) {
        const B = BdB[b], r = B[q] - Math.max(B[q - 1], B[q - 2]), hold = B[q + 1] - B[q];
        if (r >= th && hold >= -th / 2 && PB[b][q] >= EL_BAR_PB) e = Math.max(e, Math.min(1, 0.5 + 0.5 * (r - th) / th));
      }
      if (e > 0) { entK.push(q); entS0.push(e); }
    }
    // v5b-r2: WHERE in that bar the low end comes in. Spotify's bar line is often not the drop (an impact or a silent
    // gap before it, the 808 landing a beat later): the anchor is the segment start in [bar - 1 beat, bar + 2 beats]
    // after which the sub + bass band rows step up most (power mean EL_ANC_WIN ms after vs before); elSyncHits then
    // lands it on the strongest hit >= 0.2 within +-EL_ANC_SNAP ms (reference set: on the real low-end step 33 % -> 65 %)
    const plow = new Float64Array(n);
    for (let i = 0; i < n; i++) plow[i] = Math.pow(10, LV[0][i] / 10) + Math.pow(10, LV[1][i] / 10);
    const segLvl = (a, b) => {
      let i = Math.max(0, elLB(st, a) - 1), s = 0, o = 0;
      while (i > 0 && en[i - 1] > a) i--;
      for (; i < n && st[i] < b; i++) { const ov = Math.min(en[i], b) - Math.max(st[i], a); if (ov > 0) { s += plow[i] * ov; o += ov; } }
      return o > 0 ? 10 * Math.log10(s / o + 1e-12) : NaN;
    };
    const BT = A.beatT || [];
    let entA = [], entStep = [];
    for (let q = 0; q < entK.length; q++) {
      const c = bs[entK[q]], j = nearestIdx(BT, c);
      const beat = j >= 0 && BT.length > 1 ? clamp(j + 1 < BT.length ? BT[j + 1] - BT[j] : BT[j] - BT[j - 1], 250, 1000) : 500;
      let best = c, bsc = -Infinity;
      for (let i = elLB(st, c - EL_ANC_LO * beat); i < n && st[i] <= c + EL_ANC_HI * beat; i++) {
        const sc = segLvl(st[i], st[i] + EL_ANC_WIN) - segLvl(st[i] - EL_ANC_WIN, st[i]);
        if (sc > bsc) { bsc = sc; best = st[i]; }
      }
      for (let i = elLB(st, c - EL_ANC_LO * beat); i < n && st[i] < best; i++) {   // r3: a near-tie goes to the earliest
        const sc = segLvl(st[i], st[i] + EL_ANC_WIN) - segLvl(st[i] - EL_ANC_WIN, st[i]);
        if (sc >= bsc - EL_ANC_TIE && sc >= 2) { best = st[i]; break; }
      }
      entA.push(best); entStep.push(isFinite(bsc) ? bsc : 0);
    }
    // one drop, one shockwave: of two entries closer than EL_ENT_GAP bars / ms the first stays (it is the drop and owns
    // the riser), unless the later one's band-row step is EL_ENT_WIN_DB bigger
    {
      const keep = entK.map(() => true);
      for (let q = 1; q < entK.length; q++) {
        let p = q - 1;
        while (p >= 0 && !keep[p]) p--;
        if (p < 0 || (entK[q] - entK[p] > EL_ENT_GAP_BARS && entA[q] - entA[p] > EL_ENT_GAP_MS)) continue;
        if (entStep[q] > entStep[p] + EL_ENT_WIN_DB) keep[p] = false; else keep[q] = false;
      }
      const f = (a) => a.filter((_, q) => keep[q]);
      entK = f(entK); entS0 = f(entS0); entA = f(entA); entStep = f(entStep);
    }
    // (d) riser ramp (G4): the bars before an entry whose low end is out (<= 8), when the highs / density climb or
    // the low end stays low; ((j - s + 1) / L)^1.5 up to the entry, which releases it (elFrame: at the entry's anchored
    // time). v5b-r2: the look-back only extends over bars whose band rows are >= EL_RAMP_OUT_DB under the entry bar (no
    // ramp while the bass plays). A gate on the anchor's band-row step was tried and dropped: on the reference set it removed 4 real
    // build-ups for 1 false one (the false ramps are band-row misreadings, not visible in the analysis)
    const lowB = new Float64Array(nb), topB = new Float64Array(nb), lowD = new Float64Array(nb), build = new Float32Array(nb);
    for (let q = 0; q < nb; q++) {
      lowB[q] = Math.max(PB[0][q], PB[1][q]); topB[q] = Math.max(PB[2][q], PB[3][q]);
      lowD[q] = 10 * Math.log10(Math.pow(10, BdB[0][q] / 10) + Math.pow(10, BdB[1][q] / 10));
    }
    for (let e = 0; e < entK.length; e++) {
      const kd = entK[e], out = (q) => lowB[q] < 0.5 && lowD[q] <= lowD[kd] - EL_RAMP_OUT_DB;
      if (kd < 2) continue;
      let s = kd - 1;
      while (s > Math.max(0, kd - EL_BUILD_BARS) && out(s - 1)) s--;
      const L = kd - s;
      if (L < 2) continue;
      let mean = 0;
      for (let q = s; q < kd; q++) mean += lowB[q];
      mean /= L;
      const rising = topB[kd - 1] - topB[s] >= 0.1 || densN[kd - 1] - densN[s] >= 0.15;
      if (rising || mean < 0.4) for (let q = 0; q < L; q++) build[s + q] = Math.max(build[s + q], Math.pow((q + 1) / L, 1.5));
    }
    el.bs = bs; el.bd = Float32Array.from(bd); el.build = build;
    el.entK = Int32Array.from(entK); el.entS0 = Float32Array.from(entS0); el.entA = Float64Array.from(entA); el.entStep = Float32Array.from(entStep);
    // (g-i) tick features of every segment start -> hats (G1) / snares (G2), scores normalised per track
    const bt = elStarts(d.beats), ta = elStarts(d.tatums), Fk = elTickF(X, st, n, bt, ta, bs);
    const pH = new Float64Array(n), pS = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let h = CM.hat[0], s = CM.snare[0];
      for (let j = 0; j < 29; j++) { const z = (Fk[i * 29 + j] - CM.mu[j]) / CM.sd[j]; h += CM.hat[j + 1] * z; s += CM.snare[j + 1] * z; }
      pH[i] = h; pS[i] = s;
    }
    // v5b-r2: normalised over the segments within +-EL_TICK_NORM_MS, not the whole track (that gave the twinkle budget
    // to the sections where the hats are exposed: reference trance drops 41 hats per min against 128 in the intros, with the
    // same or more hi-hats in the drop); the snares keep the whole-track range (local: trance lift +.34 < A5's +.35)
    // v5b-r3: the local range never drops below the track's own (p40 / p85): in a section without hi-hats the local
    // normalisation still marked its top third as hats (reference set: breakdown bars 34 -> 49 per min, P .74 -> .67; bars with no
    // air onset at all 24 -> 31 per min). LOGO (hatfix.py): trance breakdowns 77 -> 67 / min at P .855 -> .901, drops unchanged
    const hN = elLocalN01(pH, st, 0.55, 0.95, EL_TICK_NORM_MS, elPct(pH, 0.40), elPct(pH, 0.85)), s80 = elPct(pS, 0.80), s97 = elPct(pS, 0.97);
    const hT = [], hS = [], cT = [], cS = [];
    for (let i = 0; i < n; i++) {
      const h = hN[i], s = elN01(pS[i], s80, s97);
      if (h >= EL_HAT_MIN) { hT.push(st[i]); hS.push(h); }
      if (s >= EL_SNR_MIN) { cT.push(st[i]); cS.push(s); }
    }
    el.hatT = Float64Array.from(hT); el.hatS = Float32Array.from(hS);
    el.snCT = Float64Array.from(cT); el.snCS = Float32Array.from(cS);
    if (M.keepF) { el.tickF = Fk; el.pHat = pH; el.pSnr = pS; el.LV = LV; el.BdB = BdB; el.PB = PB; el.densN = densN; }
    elSyncHits(A, el);
    return el;
  }
  /** v5b-r2: per segment, its score between the lo / hi percentiles (numpy's linear one) of the segments starting within
      +-W ms (a sliding sorted window: O(n x window), ~2 ms for a 5 min track); r3: each bound at least loF / hiF */
  function elLocalN01(p, st, lo, hi, W, loF, hiF) {
    const n = p.length, out = new Float64Array(n), buf = new Float64Array(n);
    let a = 0, b = 0, m = 0;
    const at = (v) => { let l = 0, h = m; while (l < h) { const k = (l + h) >> 1; if (buf[k] < v) l = k + 1; else h = k; } return l; };
    const q = (pp) => { const r = pp * (m - 1), i = Math.floor(r), f = r - i; return i + 1 < m ? buf[i] + (buf[i + 1] - buf[i]) * f : buf[i]; };
    for (let i = 0; i < n; i++) {
      while (b < n && st[b] <= st[i] + W) { const v = p[b++], l = at(v); buf.copyWithin(l + 1, l, m); buf[l] = v; m++; }
      while (a < n && st[a] < st[i] - W) { const l = at(p[a++]); buf.copyWithin(l, l + 1, m); m--; }
      out[i] = elN01(p[i], loF != null ? Math.max(q(lo), loF) : q(lo), hiF != null ? Math.max(q(hi), hiF) : q(hi));
    }
    return out;
  }
  /** the 29 tick features (music-first tick_features) of every segment start; X = the 17 band-row features */
  function elTickF(X, st, n, bt, ta, bs) {
    const out = new Float64Array(n * 29), D = [0, 1, 2, 3, 12, 14];
    const ph = (g, t) => {
      if (g.length < 2) return 0;
      const j = elLB(g, t), a = g[Math.max(0, j - 1)], b = g[Math.min(g.length - 1, j)];
      const per = b > a ? Math.max(1, b - a) : 500;
      return Math.min(Math.abs(t - a), Math.abs(b - t)) / per;
    };
    for (let i = 0; i < n; i++) {
      const o = i * 29, x = i * 17, t = st[i];
      for (let j = 0; j < 17; j++) out[o + j] = X[x + j];
      for (let j = 0; j < 6; j++) out[o + 17 + j] = i ? X[x + D[j]] - X[x - 17 + D[j]] : 0;
      const pb = ph(bt, t);
      out[o + 23] = pb; out[o + 24] = ph(ta, t);
      const kbar = bs.length ? elLB(bs, t + 30) - 1 : -1;
      const bib = kbar >= 0 ? Math.max(0, elLB(bt, t - 30) - elLB(bt, bs[kbar] - 30)) : 0;
      out[o + 25 + Math.min(3, bib)] = pb < 0.12 ? 1 : 0;
    }
    return out;
  }
  /** the parts that depend on the hit list ("Ritmo do visual"): bar entries snapped onto the strongest hit >= 0.2
      within +-120 ms (they land on the kick), snares that are > 45 ms from every hit >= 0.2. Rebuilt when buildHits
      changed mode. */
  function elSyncHits(A, el) {
    const mode = A.hitMode || "";
    if (el.mode === mode && el.entT) return;
    el.mode = mode;
    const HT = A.hitT || [], HS = A.hitS || [];
    const eT = new Float64Array(el.entK.length), eS = new Float32Array(el.entK.length);
    // v5b-r2: from the low-end anchor (elDigest2), not from the bar line or the kick clock; the strongest hit >= 0.2
    // within +-EL_ANC_SNAP ms of it (the kick that carries the drop), else the anchor itself; r3: x EL_ENT_WEAK when the
    // anchor is unsure (a small band-row step and no strong hit on it)
    for (let q = 0; q < el.entK.length; q++) {
      const a = el.entA ? el.entA[q] : el.bs[el.entK[q]];
      let best = a, bs = -1;
      for (let h = elLB(HT, a - EL_ANC_SNAP); h < HT.length && HT[h] <= a + EL_ANC_SNAP; h++) if (HS[h] >= 0.2 && HS[h] > bs) { bs = HS[h]; best = HT[h]; }
      eT[q] = best;
      const sure = !el.entStep || el.entStep[q] >= EL_ENT_CONF_DB || bs >= EL_ENT_CONF_HIT;
      eS[q] = el.entS0[q] * (sure ? 1 : EL_ENT_WEAK);
    }
    el.entT = eT; el.entS = eS;
    // v5b-r2: inside a four-on-the-floor kick run (trance / house drops) a snap needs a much clearer score: there the
    // candidates off the kicks are mostly open hats and stabs (reference trance drops: P .22)
    const sT = [], sS = [], KB = A.kT || A.beatT, run = (t) => { const j = A.four >= 0.5 ? nearestIdx(KB, t) : -1; return j >= 0 && A.bSteady && A.bSteady[j] >= 0.5; };
    for (let q = 0; q < el.snCT.length; q++) {
      const t = el.snCT[q];
      if (el.snCS[q] < EL_SNR_RUN_MIN && run(t)) continue;
      let kick = false;
      for (let h = elLB(HT, t - EL_SNR_KICK_MS); h < HT.length && HT[h] <= t + EL_SNR_KICK_MS; h++) if (HS[h] >= 0.2) { kick = true; break; }
      if (!kick) { sT.push(t); sS.push(el.snCS[q]); }
    }
    el.snT = Float64Array.from(sT); el.snS = Float32Array.from(sS);
  }
  /** v5b: the layers' digest off the frame, in three short tasks (stages 0, 1, 2); A.el appears when all are
      done (until then the layers run on their gentle fallback, then fade in over EL_FADE_MS) */
  function elAttachDeferred(d, A) {
    const parts = [], fail = (e) => { A.elErr = String((e && e.message) || e).slice(0, 160); };
    const timed = (f) => { const t = now(), r = f(); parts.push(+(now() - t).toFixed(2)); return r; };
    setTimeout(() => {
      if (S.destroyed || !A || A.el) return;
      let FP, el;
      try { FP = timed(() => elFeatures(d, A)); } catch (e) { fail(e); return; }
      setTimeout(() => {
        if (S.destroyed || A.el) return;
        try { el = timed(() => elDigest1(d, A, null, FP)); } catch (e) { fail(e); return; }
        setTimeout(() => {
          if (S.destroyed || A.el) return;
          try { timed(() => elDigest2(d, A, null, el)); el.msParts = parts; el.ms = parts.reduce((a, b) => a + b, 0); A.el = el; } catch (e) { fail(e); }
        }, 0);
      }, 0);
    }, 0);
  }
  /** v5b: the layers' digest for a digested analysis A, synchronously (tests; the theme defers it: elAttachDeferred) */
  function elAttach(d, A, M) {
    if (!A) return null;
    const t0 = now();
    try { A.el = elDigest(d, A, M); A.el.ms = now() - t0; } catch (e) { A.el = null; A.elErr = String((e && e.message) || e).slice(0, 160); }
    return A.el;
  }
  const EL_FIFTH_COS = new Float64Array(12), EL_FIFTH_SIN = new Float64Array(12), EL_PC_COS = new Float64Array(12), EL_PC_SIN = new Float64Array(12);
  for (let p = 0; p < 12; p++) {
    const a = (((p * 7) % 12) / 12) * TAU, b = (TAU * p) / 12 - Math.PI / 2;   // circle of fifths; chroma wheel, C at the top
    EL_FIFTH_COS[p] = Math.cos(a); EL_FIFTH_SIN[p] = Math.sin(a); EL_PC_COS[p] = Math.cos(b); EL_PC_SIN[p] = Math.sin(b);
  }

  // ---- settings -> amounts ----------------------------------------------------------------------------------------
  /** the box's amounts (0..5 each, 0 when its toggle is off) or null when "Camadas por elemento" is off */
  function elAmounts(L) {
    if (!L || !L.on) return null;
    const a = (o) => (o && o.on ? clamp(num(Number(o.amount), 100), 0, INT_MAX) / 100 : 0);
    return { G: a(L.low), V: a(L.voice), A: a(L.air), E: a(L.entry), S: a(L.snare), M: a(L.mood), hue: L.hue !== false };
  }
  const EL_K = { cfg: null, k: null };
  // final-build: while S.pvSolo highlights a part in the preview, elK() returns the dimmed amounts (set / cleared around the
  // preview's own drawing only, in renderPreview)
  let EL_OVR = null;
  function elKcfg() {                             // final-fix: the saved amounts (never the preview's highlight)
    if (EL_K.cfg !== CFG) { EL_K.cfg = CFG; EL_K.k = elAmounts(CFG.layers); }
    return EL_K.k;
  }
  function elK() {
    if (EL_OVR) return EL_OVR;
    return elKcfg();
  }
  /** final-fix: how much of the soft mode's low end (G), energy (V) and hats (A) the layers leave uncovered (0..1 each);
      L: the layers are on at all */
  const EL_UNC = { k: undefined, o: null };
  function softUncovered() {
    const K = elKcfg();
    if (EL_UNC.k !== K) {
      EL_UNC.k = K;
      EL_UNC.o = K ? { L: 1, G: 1 - Math.min(1, K.G), V: 1 - Math.min(1, K.V), A: 1 - Math.min(1, K.A) } : { L: 0, G: 1, V: 1, A: 1 };
    }
    return EL_UNC.o;
  }
  /** the layers' drives for a view's frame ({ K, E }), or null: the renderers then draw exactly v5 */
  function elOf(sig) {
    const K = elK(), E = K && sig && sig.ext ? sig.ext.el : null;
    return E ? { K, E } : null;
  }
  /** layout parts that depend on the box: "" when off (the v5 key), else the layers' own layout parts (zone colours) */
  const elGeoKey = () => { const K = elK(); return K ? (K.A > 0 ? "|L2" : "|L1") : ""; };

  // ---- per frame: the "el" signal tap (SIGNAL_TAPS) writes Z.ext.el ----------------------------------------------
  function newElState() {
    return { low: 0, mid: 0, air: 0, ready: 0, src: "fallback",
      ent: 0, entAge: 1e9, entMid: 0, entMidAge: 1e9, entAir: 0, entAirAge: 1e9, fMid: 0, fAir: 0, hatAct: 0, demo: null,
      hatN: 0, hatEnv: 0, hatId: new Int32Array(EL_TICKS), hatAge: new Float32Array(EL_TICKS), hatS: new Float32Array(EL_TICKS),
      snap: 0, snapAge: 1e9, rise: 0, calm: 0, calmH: 0, calmHit: -1, hitK: 1, harm: 0, hx: 1, hy: 0, gx: 0, gy: -1e-3, gAng: -Math.PI / 2, gR: 0, glint: 0, gHome: -Math.PI / 2,
      duck: 1, lg: 1, seekAt: -1e18, seeks: 0, pPrev: null, track: null };
  }
  const elEnv = (age) => (age < 40 ? age / 40 : Math.pow(1 - (age - 40) / (EL_ENTRY_MS - 40), 2));
  const elFlash = (age) => (age < 40 ? age / 40 : age < EL_FLASH_MS ? Math.pow(1 - (age - 40) / (EL_FLASH_MS - 40), 2) : 0);
  function elFrame(Z, A, pA, dt, playing) {
    if (!elK()) { Z.ext.el = null; return; }
    let E = Z.ext.el;
    if (!E) E = Z.ext.el = newElState();
    // pause: the layers fade out within ~0.5 s (their own 85 ms gate on top of the scene's 480 ms one), every release
    // shortened to 85 ms, so nothing hangs on screen while the music is stopped
    E.lg += ((playing ? 1 : 0) - E.lg) * (1 - Math.exp(-dt / (playing ? 140 : 85)));
    const gate = Z.gate * E.lg, el = A && A.el, rel = playing ? 1e9 : 85;
    const fk = (up, dn, x, v) => 1 - Math.exp(-dt / (x > v ? up : Math.min(dn, rel)));
    // G7: a track change, a restart or a seek (> 250 ms jump of the audible time): no event before the jump fires, no
    // tick is kept, and nothing new fires in the 250 ms after it (E.seekAt = the jump + 250 ms)
    if (E.track !== (A || null)) { E.track = A || null; E.seekAt = pA + EL_SEEK_MS; E.ready = 0; E.hatN = 0; E.ent = E.entMid = E.entAir = E.snap = 0; }
    else if (E.pPrev != null && Math.abs(pA - E.pPrev - dt) > EL_SEEK_MS) { E.seekAt = pA + EL_SEEK_MS; E.seeks++; E.hatN = 0; }
    E.pPrev = pA;
    const so = num(Z.soft, 0), SG = so > 0 ? Z.sg : null;   // final-build "modo ambiente suave"
    if (!el) {                                     // no analysis (or its layers not digested yet): gentle levels, no events
      E.src = SG && so > 0.5 ? "soft" : "fallback";
      // (the soft drives are smooth already: their follower shortens to 150 ms, so the 0.1-0.5 Hz drift is not filtered away)
      for (const b of ["low", "mid", "air"]) E[b] += ((SG ? 0.25 + (SG[b] - 0.25) * so : 0.25) * gate - E[b]) * (1 - Math.exp(-dt / Math.min(SG ? 600 - 450 * so : 600, rel)));
      E.ent = E.entMid = E.entAir = E.snap = E.fMid = E.fAir = 0; E.entAge = E.entMidAge = E.entAirAge = E.snapAge = 1e9; E.hatN = 0; E.hatEnv = 0; E.duck = 1;
      E.hatAct += (0 - E.hatAct) * (1 - Math.exp(-dt / 300));
      E.rise += (0 - E.rise) * (1 - Math.exp(-dt / 250));
      E.calm += (0 - E.calm) * (1 - Math.exp(-dt / 250));
      E.calmH = 0; E.hitK = 1;
      if (SG) {                                    // final-build: the halo colour drifts, the glint turns slowly round the cover
        const kg = 1 - Math.exp(-dt / 900);
        E.gx += (0.45 * Math.cos(SG.gAng) - E.gx) * kg; E.gy += (0.45 * Math.sin(SG.gAng) - E.gy) * kg;
        E.gAng = Math.atan2(E.gy, E.gx); E.gR = Math.hypot(E.gx, E.gy);
        E.glint += (0.6 * E.mid * so - E.glint) * (1 - Math.exp(-dt / 400));
        E.harm += (SG.harm * so - E.harm) * (1 - Math.exp(-dt / 1500));
      } else {
        E.glint += (0 - E.glint) * (1 - Math.exp(-dt / 200));
        E.harm += (0 - E.harm) * (1 - Math.exp(-dt / 2500));
      }
      return;
    }
    E.src = "analysis";
    E.ready = Math.min(1, E.ready + dt / EL_FADE_MS);
    const r = E.ready;
    elSyncHits(A, el);                             // "Ritmo do visual" changed: snare list / entry snap follow the hits
    // LOW / MID / AIR: the layer's own attack / release. v6-r2: without drums (1 - drums present) the voice and the air
    // rise slower (ND_MID_ATT / ND_AIR_ATT more), so in a voice-only part they breathe instead of jumping on every
    // syllable / sibilant (rap a cappella: the ring's sides rose ~38 times a minute)
    const nd = 1 - clamp(num(Z.drums, 1), 0, 1);
    for (const b of ["low", "mid", "air"]) {
      let x = (el.lev[b] ? elSample(el.lev[b], pA) : 0) * gate * r + 0.25 * gate * (1 - r);
      const ar = EL_AR[b];
      if (SG) x += (SG[b] * gate - x) * so;        // final-build: a late analysis takes over from the soft mode
      const up = ar[0] + (b === "mid" ? ND_MID_ATT : b === "air" ? ND_AIR_ATT : ND_LOW_ATT) * nd;   // v6-r3: "Grave" too
      E[b] += (x - E[b]) * fk(up, ar[1], x, E[b]);
    }
    // "o grave entrou": the latest entry at or before pA (after the last seek), 40 ms rise then a squared fall
    let k = lastAtOrBefore(el.entT, pA);
    E.entAge = k >= 0 && el.entT[k] >= E.seekAt ? pA - el.entT[k] : 1e9;
    E.ent = E.entAge < EL_ENTRY_MS ? el.entS[k] * elEnv(E.entAge) * gate * r : 0;
    k = lastAtOrBefore(el.mEntT, pA);
    E.entMidAge = k >= 0 && el.mEntT[k] >= E.seekAt ? pA - el.mEntT[k] : 1e9;
    E.entMid = E.entMidAge < EL_ENTRY_MS ? 0.6 * el.mEntS[k] * elEnv(E.entMidAge) * gate * r : 0;
    E.fMid = E.entMidAge < EL_FLASH_MS ? el.mEntS[k] * elFlash(E.entMidAge) * gate * r : 0;   // r3: the entry's flash
    k = lastAtOrBefore(el.aEntT, pA);
    E.entAirAge = k >= 0 && el.aEntT[k] >= E.seekAt ? pA - el.aEntT[k] : 1e9;
    E.entAir = E.entAirAge < EL_ENTRY_MS ? 0.6 * el.aEntS[k] * elEnv(E.entAirAge) * gate * r : 0;
    E.fAir = E.entAirAge < EL_FLASH_MS ? el.aEntS[k] * elFlash(E.entAirAge) * gate * r : 0;
    // hat ticks: the last <= 8 within 450 ms (ids kept for the twinkle pattern), strength x (0.75 + 0.25 AIR) (r3; r2: 0.4 +
    // 0.6 AIR, so a low AIR reading - "Land Of Freedom" .10-.12 in its first drop - took the twinkles away)
    let h = lastAtOrBefore(el.hatT, pA), m = 0, env = 0;
    const dz = num(Z.drums, 1), hs = (0.75 + 0.25 * E.air) * gate * r * dz;   // v6: x drums present
    while (h >= 0 && m < EL_TICKS) {
      const t = el.hatT[h], age = pA - t;
      if (age >= EL_TICK_WIN || t < E.seekAt) break;
      const s = el.hatS[h] * hs;
      E.hatId[m] = h; E.hatAge[m] = age; E.hatS[m] = s;
      const e = s * Math.exp(-age / EL_TWINKLE_MS);
      if (e > env) env = e;
      m++; h--;
    }
    E.hatN = m; E.hatEnv = env;
    E.hatAct += (Math.min(1, m / 2) * gate * dz - E.hatAct) * (1 - Math.exp(-dt / (m >= 2 ? 120 : 600)));   // r3: hats are playing
    // snare / clap: a 160 ms flick
    k = lastAtOrBefore(el.snT, pA);
    E.snapAge = k >= 0 && el.snT[k] >= E.seekAt ? pA - el.snT[k] : 1e9;
    E.snap = E.snapAge < 640 ? el.snS[k] * Math.exp(-E.snapAge / EL_SNAP_MS) * gate * r * dz : 0;
    // riser: the bar ramp (interpolated inside a rising bar), released at once by the entry
    let R = 0;
    const bk = lastAtOrBefore(el.bs, pA);
    if (bk >= 0) {
      const b0 = el.build[bk], b1 = bk + 1 < el.bs.length ? el.build[bk + 1] : 0;
      R = b1 >= b0 ? b0 + (b1 - b0) * clamp((pA - el.bs[bk]) / Math.max(1, el.bd[bk]), 0, 1) : b0;
      // v5b-r2: the ramp is released by the drop itself (its anchored time), not by the bar line: it holds its top
      // into the entry bar until the entry fires, and an entry that lands before its bar line has already released it
      const ke = elLB(el.entT, pA);
      if (ke < el.entT.length && el.entK[ke] === bk && bk > 0) R = Math.max(R, el.build[bk - 1]);
      if (ke > 0 && el.entK[ke - 1] > bk) R = 0;
    }
    const xr = R * gate * r;
    E.rise += (xr - E.rise) * fk(250, 120, xr, E.rise);
    if (E.ent > 0.5) E.rise = 0;
    // the sidechain of "Grave" AFTER each hit >= 0.12 (the hit list of the current "Ritmo do visual"): from the hit's
    // peak, deeper for stronger hits, swelling back with EL_SC_MS; the last 3 hits (a dense run keeps it pumping)
    let du = 1;
    const HT = A.hitT, HS = A.hitS;
    if (HT && HT.length) {
      for (let j = lastAtOrBefore(HT, pA), m = 0; j >= 0 && m < 3; j--, m++) {
        if (HS[j] < EL_DUCK_HIT) continue;
        const age = pA - HT[j] - A.hitA[j] - PEAK_HOLD_MS;
        if (age > 8 * EL_SC_MS) break;
        if (age >= 0) du = Math.min(du, 1 - EL_SC * clamp((HS[j] - 0.08) / 0.25, 0, 1) * Math.exp(-age / EL_SC_MS));
      }
    }
    E.duck = 1 - (1 - du) * num(E.hitK, 1);
    if (SG) E.duck = 1 - (1 - E.duck) * (1 - so);   // final-build: the sidechain fades in with the hand-over's kicks
    // breakdown calm: fades in over ~0.9 s, the bass entry ends it at once (v5b: within ~0.2 s)
    const xc = elSample(el.calm, pA) * r * E.lg;
    E.calm += (xc - E.calm) * (1 - Math.exp(-dt / (xc > E.calm ? 900 : Math.min(rel, 900))));
    if (E.ent > 0.3) E.calm = 0;
    // v5b-r2 "Subidas e calmarias" on the HIT path: in a breakdown the beat-grid hits (the four-on-the-floor run and its
    // soft tick, carried into the breakdown by the run logic: on reference trance breakdowns 121 per min, 13 % on a real low
    // onset) and the weak model hits (< 0.35) shrink by up to 80 %, so the crown / bars / wave and the camera really
    // rest and the drop has contrast; a real bass-model kick (>= 0.45; there: 88 % on a low onset) lands in full. Its
    // own calm (calmH) restarts at 0 on every model hit >= 0.5 and on the entry, so the first drop kicks are never held
    // back by the 2 s calm smoothing.
    // v5b-r3: "a model hit" = the largest bass-MODEL strength merged into the dominant hit (Z.k.m), not the merge winner's
    // source (r2: a real kick that a stronger grid beat won counted as a grid hit; in a calm a steady kick then shrank
    // 1 -> .62 -> .41 -> .27 -> .19 -> .15 until the next one the model happened to win: 54 of 178 reference kicks)
    const km = Z.k ? num(Z.k.m, 0) : 0;
    if (E.ent > 0.3 || (km >= 0.5 && Z.k.t !== E.calmHit)) { E.calmH = 0; if (km >= 0.5) E.calmHit = Z.k.t; }
    else E.calmH += (Math.min(E.calm, xc) - E.calmH) * (1 - Math.exp(-dt / (E.calm > E.calmH ? 900 : 200)));
    const Km = elK(), wk = 1 - smooth(clamp((km - 0.35) / 0.1, 0, 1));
    E.hitK = 1 - Math.min(0.85, 0.95 * Math.min(1, Km ? Km.M : 0) * E.calmH) * wk;
    // v6-r3: a bass that enters under the voice, with the drums not back a bar later, punches softer (at a zoom of 180 %
    // / glow 205 % one such entry was an 11.5 % zoom + a white flash in the middle of a voice-only breakdown). Applied after
    // the calm / riser logic above, which keeps using the entry's own strength
    if (E.ent > 0 && ND_ENT_ND < 1) {
      const ke = lastAtOrBefore(el.entT, pA), bar = 240000 / clamp(num(A.tempo, 0) > 0 ? A.tempo : 120, 40, 240);
      E.ent *= ND_ENT_ND + (1 - ND_ENT_ND) * Math.max(clamp(num(Z.drums, 1), 0, 1), ke >= 0 ? drumsAt(A, el.entT[ke] + bar) : 1);
    }
    // harmony (circle of fifths, 2.5 s) relative to the track's home; melody glint (chroma circular mean, 120 ms)
    const P = Z.P12;
    let x = 0, y = 0, gx = 0, gy = 0, s2 = 0;
    for (let p = 0; p < 12; p++) {
      const v = P[p], v2 = v * v;
      x += v * EL_FIFTH_COS[p]; y += v * EL_FIFTH_SIN[p];
      gx += v2 * EL_PC_COS[p]; gy += v2 * EL_PC_SIN[p]; s2 += v2;
    }
    const L = Math.hypot(x, y) || 1, kh = 1 - Math.exp(-dt / 2500), kg = 1 - Math.exp(-dt / 120);
    E.hx += (x / L - E.hx) * kh; E.hy += (y / L - E.hy) * kh;
    E.harm = 0.5 - 0.5 * Math.cos(Math.atan2(E.hy, E.hx) - el.home);
    if (SG) E.harm += (SG.harm - E.harm) * so;     // final-build: the hand-over keeps the soft mode's colour, then lets go
    if (s2 > 1e-9) { E.gx += (gx / s2 - E.gx) * kg; E.gy += (gy / s2 - E.gy) * kg; }
    E.gAng = Math.atan2(E.gy, E.gx); E.gR = Math.hypot(E.gx, E.gy); E.gHome = el.gHome;
    E.glint = E.mid * clamp((E.gR - 0.15) / 0.5, 0, 1);
  }
  SIGNAL_TAPS.push({ id: "el", fn: elFrame });
  /** v5b-r3: a one-off SAMPLE in the panel's "Prévia ao vivo" while someone moves "Quando o grave entra" / "Subidas e
      calmarias" (both show only at a drop, a riser or a breakdown, so in the preview their sliders seemed to do nothing):
      the preview's layers get a shockwave now (entry), or a 1.2 s riser that drops into one (mood), at the slider's
      amount. Wall-clock time, the preview only (never the overlay); S.pvDemo = { k: "entry" | "mood", at } */
  const EL_DEMO_RISE = 1200;
  function elDemoFrame(Z) {
    const D = S.pvDemo, E = Z.ext && Z.ext.el;
    if (Z !== SIG.preview || !D || !E) return;
    const age = now() - D.at, ent = (a) => { E.entAge = a; E.ent = Math.max(E.ent, elEnv(a)); E.calm = 0; };
    if (D.k === "entry") { if (age > EL_ENTRY_MS) S.pvDemo = null; else ent(age); return; }
    if (age > EL_DEMO_RISE + EL_ENTRY_MS) { S.pvDemo = null; return; }
    if (age < EL_DEMO_RISE) E.rise = Math.max(E.rise, Math.pow(age / EL_DEMO_RISE, 1.5));
    else { E.rise = 0; ent(age - EL_DEMO_RISE); }
  }
  SIGNAL_TAPS.push({ id: "elDemo", fn: elDemoFrame });
  /** final-build: a SAMPLE beat in the panel's preview while a beat-driven control is moved ("Intensidade", "Volta",
      "Tracinhos", "Zoom / Brilho na batida", "Balanço no ritmo") and the music has no beat at that moment (no analysis, or a
      part without drums): 3 kicks 500 ms apart (0.85) and a 120 BPM groove, so the change shows. The preview only (never
      the overlay); S.pvKick = { at }. "Caixa e palmas" gets 2 sample snaps the same way (S.pvSnap) */
  const PV_KICK_N = 3, PV_KICK_GAP = 500;
  function pvKickFrame(Z) {
    if (Z !== SIG.preview) return;
    const D = S.pvKick, T = now();
    if (D) {
      const age = T - D.at;
      if (age < 0 || age > PV_KICK_N * PV_KICK_GAP) S.pvKick = null;
      else {
        const j = Math.floor(age / PV_KICK_GAP), sh = hitShape(age - j * PV_KICK_GAP, 15, 170, 0), pk = 0.85, env = Z.gate;
        if (pk * sh * env > Z.kick) {
          Z.kick = pk * sh * env; Z.kickPk = pk; Z.kickSh = sh * env; Z.kickCam = sh * env; Z.kickZ = 1; Z.kickVis = 1; Z.kickId = D.at + j * PV_KICK_GAP;
          Z.slow = Math.max(Z.slow, pk * sh * env); Z.bass = Math.max(Z.bass, Z.kick);
        }
        const ph = (age % PV_KICK_GAP) / PV_KICK_GAP, ge = 0.8 * env;
        Z.groove = Math.max(Z.groove, groovePulse(ph) * ge); Z.sway = Math.cos(Math.PI * (age / PV_KICK_GAP)) * ge;
      }
    }
    const N = S.pvSnap, E = Z.ext && Z.ext.el;
    if (N && E) {
      const age = T - N.at, j = age < 700 ? 0 : 1, a = age - j * 700;
      if (age < 0 || age > 1400) S.pvSnap = null;
      else if (a >= 0) { const sn = 0.9 * Math.exp(-a / EL_SNAP_MS) * Z.gate; if (sn > E.snap) { E.snap = sn; E.snapAge = a; } }
    }
  }
  SIGNAL_TAPS.push({ id: "pvKick", fn: pvKickFrame });

  // ---- scene effects (effectsFrom / applyFxDom) ------------------------------------------------------------------
  const elSz = (k) => (k > 1 ? Math.sqrt(k) : 1);                                                       // sizes past 100 %
  const EL_WHITE = [255, 255, 255];
  const elMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const elRgba = (c, a) => "rgba(" + Math.round(c[0]) + ", " + Math.round(c[1]) + ", " + Math.round(c[2]) + ", " + (a > 0 ? (a < 1 ? a : 1) : 0).toFixed(3) + ")";
  const elHash = (a, b) => {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const EL_COLS = { ver: -1, a1: [255, 77, 255], a2: [53, 231, 255] };
  /** the chosen pair (PAL: presets, "Personalizado", "Combinar com o wallpaper" keep working) */
  function elCols() {
    const v = PAL ? PAL.ver : 0;
    if (EL_COLS.ver !== v) {
      EL_COLS.ver = v;
      const ok = (c) => Array.isArray(c) && c.length === 3 && typeof c[0] === "number";
      if (PAL && ok(PAL.a1) && ok(PAL.a2)) { EL_COLS.a1 = PAL.a1; EL_COLS.a2 = PAL.a2; }
      EL_COLS.waveShadow0 = elRgba(elMix(EL_COLS.a1, EL_WHITE, 0.33), 0.95);
      EL_COLS.glow0 = elRgba(EL_COLS.a1, 0.95); EL_COLS.glow2 = elRgba(EL_COLS.a2, 0.95);
    }
    return EL_COLS;
  }
  /** the per-frame scene part of the layers (fx.el), or null (master off / no channels): camera / glow punch of
      the bass entry, riser vignette + wallpaper creep, breakdown veil / bloom / haze, the halo colour */
  function elScene(sig) {
    const L = elOf(sig);
    if (!L) return null;
    const { K, E } = L, C = elCols(), rm = !!S.reducedMotion, kM = K.M, T = E.rise, Cm = E.calm;
    const h = K.hue ? 0.3 + 0.5 * E.harm : 0.55;
    return {
      K, E, rm, T, C: Cm, cols: C,
      halo: elMix(C.a1, C.a2, h),
      hazeK: Math.max(0.25, 1 - 0.25 * kM * Cm),
      bloomK: Math.max(0.25, 1 - 0.3 * kM * Cm),
      veil: Math.min(0.5, 0.12 * kM * Cm),
      vig: Math.min(0.6, 0.25 * kM * T),
      creep: rm ? 1 : 1 + 0.02 * kM * T,
    };
  }

  // ---- drawn layers (LAYERS): under the style, into its haze canvas, over it --------------------------------------
  const EL_SX = new Float32Array(256), EL_SY = new Float32Array(256), EL_SR = new Float32Array(256), EL_SB = new Float32Array(256), EL_ST = new Float32Array(256), EL_SQ = new Uint8Array(256);
  const EL_TW = new Float32Array(EL_TICKS), EL_TH = new Float32Array(EL_TICKS);
  /** this frame's hat twinkles: weight and lit share per tick slot (a hat lights a pseudo-random part of the points) */
  function elTwinkles(E) {
    const n = E.hatN;
    for (let j = 0; j < n; j++) { const s = E.hatS[j]; EL_TW[j] = s * Math.exp(-E.hatAge[j] / EL_TWINKLE_MS); EL_TH[j] = 0.18 + 0.4 * s; }
    return n;
  }
  function elTw(E, n, i) {
    let tw = 0;
    for (let j = 0; j < n; j++) if (EL_TW[j] > 0.004 && elHash(E.hatId[j], i) < EL_TH[j]) tw += EL_TW[j];
    return tw;
  }
  /** points drawn in <= 8 buckets ("lighter"): 4 brightness levels x plain / twinkling (r3: a twinkling point turns
      white; r2 averaged the whiteness over its whole brightness bucket, so one lit dot among 30 stayed gold), one fill
      each; only the brightest buckets get a shadow */
  function elSparks(c, n, a2, blur) {
    const sb = [0, 0, 0, 0, 0, 0, 0, 0], stw = [0, 0, 0, 0, 0, 0, 0, 0], cn = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      if (EL_SB[i] < 0.01) { EL_SQ[i] = 9; continue; }
      const q = Math.min(3, (EL_SB[i] * 4) | 0) + (EL_ST[i] > 0.25 ? 4 : 0);
      EL_SQ[i] = q; sb[q] += EL_SB[i]; stw[q] += Math.min(1, EL_ST[i]); cn[q]++;
    }
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let q = 0; q < 8; q++) {
      if (!cn[q]) continue;
      c.beginPath();
      for (let i = 0; i < n; i++) if (EL_SQ[i] === q) { c.moveTo(EL_SX[i] + EL_SR[i], EL_SY[i]); c.arc(EL_SX[i], EL_SY[i], EL_SR[i], 0, TAU); }
      const tw = stw[q] / cn[q];
      c.fillStyle = elRgba(elMix(a2, EL_WHITE, q >= 4 ? Math.min(1, 0.45 + 0.55 * tw) : 0.8 * tw), sb[q] / cn[q]);
      if ((q === 3 || q === 7) && blur) { c.shadowColor = elRgba(q === 7 ? elMix(a2, EL_WHITE, 0.5) : a2, 0.85); c.shadowBlur = blur; } else c.shadowBlur = 0;
      c.fill();
    }
    c.restore();
  }
  function elLayout(v) {
    const st = v.el || (v.el = { phi: 0, e0: null });
    const G = v.g, pv = v.kind === "preview";
    st.style = v.style;
    if (v.style === "ring") {
      const N = pv ? 48 : 96;
      if (st.N !== N) { st.N = N; st.cos = new Float32Array(N); st.sin = new Float32Array(N); for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + (i / N) * TAU; st.cos[i] = Math.cos(a); st.sin[i] = Math.sin(a); } }
    } else if (v.style === "bars" && G) {
      st.sp = [];                                  // r2: the outer bars that carry sparks (they ride the tips, elOver)
      for (let i = 0; i < G.n; i++) if (G.a[i] > 0.5) st.sp.push(i);
    } else if (v.style === "wave" && G) {
      st.wk = new Int32Array(48);
      for (let i = 0; i < 48; i++) st.wk[i] = 1 + Math.floor(elHash(i, 3) * (G.pts - 2));
    }
  }
  /** "Barras espelhadas" with the layers on: the bars' fill becomes a colour LUT (one column per bar: a1 at the
      centre, the mix on the shoulders, a2 at the tips, white core), drawn as ONE pattern fill with one shadow like v5;
      plus the hairline flashes (a1 for the bass entry, white for the snare) */
  function elBarsLayout(v, G, margin) {
    try {
      const C = elCols(), c = v.ctx, H = 128, span = G.half * 1.2 + 8, n = G.n;
      const lut = document.createElement("canvas");
      lut.width = n; lut.height = H;
      const lc = lut.getContext("2d"), m = (o) => clamp(0.5 + (o - 0.5) * (G.half / span), 0, 1);
      for (let i = 0; i < n; i++) {
        const a = G.a[i], z = a < 0.25 ? C.a1 : a < 0.6 ? elMix(C.a1, C.a2, (a - 0.25) / 0.35) : C.a2;
        const g = lc.createLinearGradient(0, 0, 0, H), tip = elRgba(elMix(z, EL_WHITE, 0.52), 1), mid = elRgba(elMix(z, EL_WHITE, 0.9), 1);
        g.addColorStop(0, tip); g.addColorStop(m(0), tip); g.addColorStop(m(0.3), mid); g.addColorStop(0.5, "#ffffff");
        g.addColorStop(m(0.7), mid); g.addColorStop(m(1), tip); g.addColorStop(1, tip);
        lc.fillStyle = g;
        lc.fillRect(i, 0, 1, H);
      }
      const pat = c.createPattern(lut, "no-repeat");
      if (pat && typeof pat.setTransform === "function" && typeof DOMMatrix === "function") {
        pat.setTransform(new DOMMatrix([G.pitch, 0, 0, (2 * span) / H, margin, v.h / 2 - span]));
        G.coreEl = pat;
      }
      const line = (col) => {
        const l = c.createLinearGradient(0, 0, v.w, 0);
        l.addColorStop(0, elRgba(col, 0)); l.addColorStop(0.5, elRgba(col, 1)); l.addColorStop(1, elRgba(col, 0));
        return l;
      };
      G.elLineA1 = line(elMix(C.a1, EL_WHITE, 0.25));
      G.elLineW = line(EL_WHITE);
    } catch (e) { G.coreEl = null; }
  }
  /** "Anel neon" with the layers on: the crown's tips lean to a1 (the low layer's colour) */
  function elRingLayout(v, G, EX) {
    try {
      const C = elCols(), rg = v.ctx.createRadialGradient(G.cx, G.cy, G.r0, G.cx, G.cy, G.r0 + G.len * (1 + 0.5 * (EX - 1)));
      rg.addColorStop(0, "#ffffff");
      rg.addColorStop(0.6, elRgba(elMix(C.a1, EL_WHITE, 0.88), 1));
      rg.addColorStop(1, elRgba(elMix(C.a1, EL_WHITE, 0.6), 0.92));
      G.coreEl = rg;
    } catch (e) { G.coreEl = null; }
  }
  /** the ring canvas' inscribed radius for an ellipse with x scale xs (px): every ring layer stays inside it (a glow
      that leaves the canvas would be cut along its straight edge); edgeFade = 1 .. 0 over the last 18 % before it */
  const elRingLim = (v, xs) => Math.min(v.h / 2, v.w / (2 * xs)) - 6;
  const elEdgeFade = (R, lim) => clamp((lim - R) / (0.18 * lim), 0, 1);
  /** v5b-r2: a drawn layer's peak opacity at amount K: up to 100 % the amount scales it, past 100 % the peak only grows
      to x1.6 (and never past cap), and the music multiplies it below that, so a layer keeps a >= 3x range between a
      quiet and a loud passage at 500 % (v5b put K inside the soft clip: at 400-500 % the halo, the voice band and the
      dots sat at ~1 whatever the music did, flat plates and 96 identical dots) */
  const elPk = (K, a1, cap) => Math.min(cap, a1 * (K < 1.6 ? K : 1.6));
  /** past 100 % a layer gets bigger with sqrt(K), at most x1.5 (v5b: x2.24 at 500 %) */
  const elSzC = (K) => Math.min(1.5, elSz(K));
  /** the title block's top in the main view's canvas px (Infinity in the preview / without a title): the dots, the
      sparks and the shockwave fade out before it (maskTitle only clears the text's own box) */
  function elTitleTop(v, fx, win) {
    if (v.kind !== "main" || typeof metaGeometry !== "function" || !S.vizBox) return win ? -Infinity : Infinity;
    const g = S.metaGeo || (S.metaGeo = metaGeometry()), b = S.vizBox;
    if (!g || !g.mh) return win ? -Infinity : Infinity;
    const z = vizZoom(fx.zoom || 1) * (fx.gs || 1), dy = (fx.gb || 0) * b.H0 * (fx.zoom || 1);
    return g.oy + ((win ? 0 : g.my - g.mh / 2 - 10) - g.oy - dy) / z - b.top;   // win: where the window's top edge is
  }
  const elTitleFade = (y, top) => (top === Infinity ? 1 : clamp((top - y) / 36, 0, 1));
  const elWinFade = (y, top) => (top === -Infinity ? 1 : clamp((y - top - 6) / 24, 0, 1));
  /** a stroke colour that fades out over the 60 px above the title (only the part of a ring near the title fades) */
  function elTitleStroke(c, col, a, top, sy) {
    if (!(top < Infinity)) return elRgba(col, a);
    const g = c.createLinearGradient(0, (top - 60) * sy, 0, top * sy);
    g.addColorStop(0, elRgba(col, a)); g.addColorStop(1, elRgba(col, 0));
    return g;
  }
  /** r2: the shockwave's radius: from just past the crown's usual tips (0.72 x len) out to the canvas edge over its
      700 ms (v5b: from 0.65 to 2.45 x len, so it left the canvas after ~150 ms and was easy to miss) */
  const elShockR = (r0, len, tau) => r0 + len * (0.72 + 0.5 * tau);
  /** the bass entry's glow colour: a1, or (colours taken from the wallpaper / cover, where a1 IS the wallpaper's hue
      and a1 glow vanished on it) a1 pushed halfway to white */
  const elEntCol = (C) => (CFG.colors && CFG.colors.preset === "wall" ? elMix(C.a1, EL_WHITE, 0.55) : C.a1);
  /** r3: the colours are taken from the wallpaper / cover ("Combinar com o wallpaper"): a1 / a2 / the halo ARE the
      wallpaper's hues there, so an accent drawn in them vanishes on it; the accents push further towards white */
  const elWall = () => !!(CFG.colors && CFG.colors.preset === "wall");
  /** "r, g, b" (PAL.shadowRgb) mixed towards white by t */
  const elShadowMix = (rgb, t) => String(rgb).split(",").map((x) => Math.round(Number(x) + (255 - Number(x)) * t)).join(", ");
  function elUnder(v, sig, fx) {
    const L = fx && fx.el, G = v.g;
    if (!L || !G || !L.K.V) return;
    const { K, E } = L, c = v.ctx, pv = v.kind === "preview", M = E.mid, fM = E.fMid;
    // r3 "a voz entrou": the halo / the voice band FLASH (x1.8, towards white) for EL_FLASH_MS, on top of the travelling ring
    const halo = fM > 0.01 ? elMix(L.halo, EL_WHITE, (elWall() ? 0.55 : 0.35) * Math.min(1, fM)) : L.halo;
    if (v.style === "ring") {
      // "Voz e melodia": the halo around the cover breathes (an elliptical annulus, "lighter"); a glint follows the
      // melody. r2: from the cover's edge out (never over it); past 100 % wider (<= x1.5) and brighter (<= x1.6)
      const r0 = G.r0 * G.kick, len = G.len, tT = L.rm ? 0 : Math.min(1, K.M) * L.T, cC = Math.min(1, K.M) * L.C;
      const Rh = r0 + len * (0.32 + 0.24 * ND_V_S * M) * (1 - 0.25 * tT), wh = len * (0.42 + 0.34 * ND_V_S * M) * (1 - 0.30 * tT) * elSzC(K.V);
      const a = Math.min(0.95, elPk(K.V, 0.62 * ND_V_A, Math.min(0.95, 0.9 * ND_V_A)) * (0.06 + 0.94 * Math.pow(M, 1.3)) * (1 + 0.35 * L.T * Math.min(1, K.M)) * (1 - 0.15 * cC) * (1 + 0.3 * fM) +
        0.05 * Math.min(1, K.V) * fM) * (pv ? 0.8 : 1);
      const xs = 1 + 0.5 * (G.EX - 1), R0 = Math.max(G.rc * G.kick + 4, Rh - wh), R1 = Math.min(Rh + 1.2 * wh, elRingLim(v, xs));   // 500 %: inside the canvas
      c.save();
      c.globalCompositeOperation = "lighter";
      c.translate(G.cx, G.cy);
      c.scale(xs, 1);
      if (a > 0.002 && R1 > R0 + 1) {
        const g = c.createRadialGradient(0, 0, R0, 0, 0, R1);
        g.addColorStop(0, elRgba(halo, 0));
        g.addColorStop(clamp((Rh - R0) / (R1 - R0), 0.01, 0.99), elRgba(halo, a));
        g.addColorStop(1, elRgba(halo, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, R1, 0, TAU);
        c.arc(0, 0, R0, 0, TAU, true);
        c.fill();
      }
      if (E.entMid > 0.003) {                      // "a voz entrou": a ring travels out of the halo (r3: 3.5 px, near white)
        const Rm = Rh + (L.rm ? 0 : 0.7 * len * Math.min(1, E.entMidAge / EL_ENTRY_MS));
        c.strokeStyle = elRgba(elMix(L.halo, EL_WHITE, elWall() ? 0.75 : 0.6), Math.min(0.9, 0.6 * Math.min(1.5, K.V)) * (E.entMid / 0.6) * elEdgeFade(Rm, elRingLim(v, xs)));
        c.lineWidth = (pv ? 1.5 : 3.5) * Math.min(1.3, elSzC(K.V));
        c.beginPath();
        c.arc(0, 0, Rm, 0, TAU);
        c.stroke();
      }
      c.restore();
    } else if (v.style === "bars") {
      // "Voz e melodia": a breathing band of light behind the bars (calm: it narrows); the glint as a brighter spot;
      // r3: the voice entry widens it by 40 % and flashes it x1.8
      const w = v.w, cy = v.h / 2, cC = Math.min(1, K.M) * L.C, hb = Math.min(v.h / 2 - 4, G.half * (0.35 + 0.55 * ND_V_S * M) * elSzC(K.V) * (1 - 0.3 * cC) * (1 + 0.5 * fM));
      const a = Math.min(1, elPk(K.V, 0.56 * ND_V_A, Math.min(0.95, 0.85 * ND_V_A)) * (0.1 + 0.9 * Math.pow(M, 1.3)) * (1 + 0.8 * fM) + 0.3 * Math.min(1, K.V) * fM) * (pv ? 0.8 : 1), R = w * 0.5;
      if (hb < 1) return;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.translate(w / 2, cy);
      c.scale(1, hb / R);
      if (a > 0.002) {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
        g.addColorStop(0, elRgba(halo, a)); g.addColorStop(0.55, elRgba(halo, 0.5 * a)); g.addColorStop(1, elRgba(halo, 0));
        c.fillStyle = g;
        c.fillRect(-R, -R, 2 * R, 2 * R);
      }
      if (E.glint > 0.003) {
        const ga = elPk(K.V, 0.3, 0.5) * E.glint * (pv ? 0.8 : 1), ang = L.rm ? E.gHome : E.gAng;
        const u = 0.1 + 0.8 * ((((ang + Math.PI / 2) % TAU) + TAU) % TAU) / TAU, span = (G.n * G.pitch) / 2, rr = Math.max(8, 0.07 * w) * elSzC(K.V);
        const gc = elMix(halo, EL_WHITE, 0.35);
        for (const sg of [-1, 1]) {
          const x = sg * u * span, g = c.createRadialGradient(x, 0, 0, x, 0, rr);
          g.addColorStop(0, elRgba(gc, ga)); g.addColorStop(1, elRgba(gc, 0));
          c.fillStyle = g;
          c.fillRect(x - rr, -R, 2 * rr, 2 * R);
        }
      }
      c.restore();
    }
  }
  /** into the style's own haze canvas (it is blurred and stretched for free): the shockwave's wide glow, the voice
      entry's glow, the second ribbon's halo glow, r3: the snare's glow at the crown tip */
  function elHaze(v, sig, fx) {
    const L = fx && fx.el, G = v.g;
    if (!L || !G) return;
    const { K, E } = L, ha = v.hctxA, sx = v.hazeA.width / v.w, sy = v.hazeA.height / v.h, C = L.cols;
    ha.save();
    if (v.style === "ring") {
      const r0 = G.r0 * G.kick, len = G.len, xs = 1 + 0.5 * (G.EX - 1);
      if (K.E && E.ent > 0.003 && E.entAge < EL_SHOCK_MS) {
        const tau = L.rm ? 0 : E.entAge / EL_SHOCK_MS, R = elShockR(r0, len, tau);
        const a = Math.min(1, elPk(K.E, 1, 1) * E.ent * Math.pow(1 - E.entAge / EL_SHOCK_MS, 1.2)) * elEdgeFade(R, elRingLim(v, xs));
        ha.strokeStyle = elTitleStroke(ha, elEntCol(C), a, elTitleTop(v, fx), sy);
        ha.lineWidth = Math.max(1, 14 * ND_E_W * (1 - 0.6 * tau) * elSzC(K.E) * sx);
        ha.beginPath();
        ha.ellipse(G.cx * sx, G.cy * sy, R * xs * sx, R * sy, 0, 0, TAU);
        ha.stroke();
      }
      if (K.S && E.snap > 0.003) {                 // r3: the snare's glow along the crown tip (the crisp ring: elOver)
        const R = r0 + 2 + len * elCrownMean(G) + 6;
        ha.strokeStyle = elRgba(elMix(EL_WHITE, C.a2, 0.35), Math.min(1, elPk(K.S, 0.7, 0.9) * E.snap));
        ha.lineWidth = Math.max(1, 12 * sx);
        ha.beginPath();
        ha.ellipse(G.cx * sx, G.cy * sy, Math.min(R * G.EX, elRingLim(v, xs) * xs) * sx, Math.min(R, elRingLim(v, xs)) * sy, 0, 0, TAU);
        ha.stroke();
      }
      if (K.V && E.glint > 0.003) {                // the melody glint: a bright arc on the halo where the notes sit (C at the
        // top, clockwise), drawn here so the haze's blur softens it; the conic gradient fades its ends, two nested widths
        // its sides (reduced motion: it stays at the track's mean melody angle)
        const M = E.mid, tT = L.rm ? 0 : Math.min(1, K.M) * L.T;
        const Rh = r0 + len * (0.32 + 0.24 * M) * (1 - 0.25 * tT), wh = len * (0.42 + 0.34 * M) * (1 - 0.30 * tT) * elSzC(K.V);
        const ga = elPk(K.V, 0.35, 0.6) * E.glint * (v.kind === "preview" ? 0.8 : 1), ang = (L.rm ? E.gHome : E.gAng) + (fx.sway || 0);
        const hw = 0.35 + 0.5 * (1 - clamp(E.gR, 0, 1)), f = hw / TAU, gc = elMix(L.halo, EL_WHITE, 0.35);
        ha.save();
        ha.translate(G.cx * sx, G.cy * sy);
        ha.scale(xs * sx, sy);
        const cg = ha.createConicGradient(ang - Math.PI, 0, 0);
        cg.addColorStop(0.5 - f, elRgba(gc, 0)); cg.addColorStop(0.5, elRgba(gc, 1)); cg.addColorStop(0.5 + f, elRgba(gc, 0));
        ha.strokeStyle = cg;
        ha.lineCap = "butt";
        for (const [wk, ak] of [[0.6, 0.45], [0.3, 0.55]]) {
          ha.globalAlpha = Math.min(1, ga * ak * 2);
          ha.lineWidth = Math.max(1, wk * Math.min(wh, 2 * (Rh - 2)));
          ha.beginPath();
          ha.arc(0, 0, Rh, ang - hw, ang + hw);
          ha.stroke();
        }
        ha.restore();
      }
      if (K.A && E.fAir > 0.01) {                  // r3 "os agudos entraram": a bright comet runs round the dot orbit (blurred here)
        const R = r0 + 2 + EL_DOT_R * len, sw = L.rm ? 0 : (E.entAirAge / 700) * TAU, a = Math.min(1, 0.9 * Math.min(1.5, K.A) * E.fAir);
        ha.save();
        ha.translate(G.cx * sx, G.cy * sy);
        ha.scale(xs * sx, sy);
        ha.strokeStyle = elRgba(elMix(C.a2, EL_WHITE, 0.6), a);
        ha.lineWidth = Math.max(1, 14);
        ha.lineCap = "round";
        ha.beginPath();
        if (L.rm) ha.arc(0, 0, Math.min(R, elRingLim(v, xs)), 0, TAU);
        else ha.arc(0, 0, Math.min(R, elRingLim(v, xs)), sw - Math.PI / 2 - EL_SWEEP_RAD, sw - Math.PI / 2 + EL_SWEEP_RAD);
        ha.stroke();
        ha.restore();
      }
      if (K.V && E.entMid > 0.003) {
        const M = E.mid, Rh = r0 + len * (0.32 + 0.24 * M), Rm = Rh + (L.rm ? 0 : 0.7 * len * Math.min(1, E.entMidAge / EL_ENTRY_MS));
        ha.strokeStyle = elRgba(elMix(L.halo, EL_WHITE, elWall() ? 0.5 : 0.25), Math.min(1, elPk(K.V, 0.6, 0.9) * E.entMid / 0.6) * elEdgeFade(Rm, elRingLim(v, xs)));
        ha.lineWidth = Math.max(1, 18 * sx);
        ha.beginPath();
        ha.ellipse(G.cx * sx, G.cy * sy, Rm * xs * sx, Rm * sy, 0, 0, TAU);
        ha.stroke();
      }
    } else if (v.style === "bars") {
      if (K.E && E.ent > 0.003 && E.entAge < EL_ENTRY_MS) {    // the entry's two glints, as a warm glow
        const tau = L.rm ? 0 : Math.min(1, E.entAge / EL_SHOCK_MS), cy = v.h / 2, a = Math.min(1, elPk(K.E, 0.9, 1) * E.ent);
        ha.fillStyle = elRgba(elEntCol(C), a);
        for (const sg of [-1, 1]) {
          const x = v.w / 2 + sg * tau * (v.w / 2);
          ha.beginPath();
          ha.ellipse(x * sx, cy * sy, Math.max(1, 46 * elSzC(K.E) * sx), Math.max(1, 18 * sy), 0, 0, TAU);
          ha.fill();
        }
      }
    } else if (v.style === "wave") {
      if (K.V) {                                   // ribbon 2 ("Voz e melodia"): a glow stroke in the halo colour (r3: flashes on the entry)
        const fM = E.fMid;
        ha.strokeStyle = elRgba(fM > 0.01 ? elMix(L.halo, EL_WHITE, (elWall() ? 0.5 : 0.3) * Math.min(1, fM)) : L.halo,
          Math.min(1, elPk(K.V, 0.5 * ND_V_A, Math.min(0.95, 0.85 * ND_V_A)) * (0.1 + 0.9 * Math.pow(E.mid, 1.2)) * (1 + 0.8 * fM) + 0.3 * Math.min(1, K.V) * fM));
        ha.lineWidth = Math.max(1, 14 * elSzC(K.V) * (1 + 0.6 * fM) * sx);
        ha.lineCap = "round";
        ha.beginPath();
        curve(ha, G.x, G.y[1], G.pts, sx, sy, false, G.cy);
        ha.stroke();
      }
    }
    ha.restore();
  }
  /** the crown's mean height (0..~1.3 of len) */
  function elCrownMean(G) {
    let hm = 0;
    for (let m = 0; m < G.m; m++) hm += G.hgt[m];
    return Math.max(0.25, hm / G.m);
  }
  /** a white stroke along ribbon r of "Onda" (the soft entries' core, the snare's flash): alpha a, width wd, faded at both
      ends (x0..x1 of the width, as a share) */
  function elRibbonFlash(c, G, r, a, wd, mirror) {
    const g = c.createLinearGradient(G.x[0], 0, G.x[G.pts - 1], 0);
    g.addColorStop(0, elRgba(EL_WHITE, 0)); g.addColorStop(0.12, elRgba(EL_WHITE, a)); g.addColorStop(0.88, elRgba(EL_WHITE, a)); g.addColorStop(1, elRgba(EL_WHITE, 0));
    c.strokeStyle = g;
    c.lineWidth = wd;
    c.beginPath();
    curve(c, G.x, G.y[r], G.pts, 1, 1, false, G.cy);
    if (mirror) curve(c, G.x, G.y[r], G.pts, 1, 1, true, G.cy);
    c.stroke();
  }
  function elOver(v, sig, fx) {
    const L = fx && fx.el, G = v.g;
    if (!L || !G) return;
    const { K, E } = L, c = v.ctx, pv = v.kind === "preview", st = v.el || {}, C = L.cols, ns = elTwinkles(E);
    const tTop = (K.A || K.E) && v.style !== "wave" ? elTitleTop(v, fx) : Infinity, wTop = K.A && v.style === "ring" ? elTitleTop(v, fx, true) : -Infinity;
    // r3 "Agudos e chimbal": a twinkle adds up to 1 x min(K, 2) (r2: 0.45) and grows the point by up to 3.5 px (r2: 2.2);
    // while hats play the points keep >= EL_HAT_FLOOR (r2: a low AIR reading blanked them in a drop)
    const twK = 0.45 * ND_A_TW * Math.min(2, K.A), floor = EL_HAT_FLOOR * E.hatAct * Math.min(1, K.A);   // v6: as v6 on r2 (r3: 1 x min(2, K.A))
    if (v.style === "ring") {
      const cx = G.cx, cy = G.cy, r0 = G.r0 * G.kick, len = G.len, EX = G.EX, xs = 1 + 0.5 * (EX - 1);
      if (K.S && E.snap > 0.003) {                 // "Caixa e palmas": the cone rim flashes, a ring flicks just past the crown
        // r3: 4 px at alpha <= 1 at the crown's current tip, the rim 3 px (r2: 2.5 px / 2 px: on screen 0.15 % changed)
        const f = elCrownMean(G) * (1 + 0.15 * (1 - Math.exp(-E.snapAge / EL_SNAP_MS))), pad = pv ? 3 : 6;
        c.save();
        c.lineWidth = pv ? 1.5 : 3;
        c.strokeStyle = elRgba(EL_WHITE, Math.min(0.95, elPk(K.S, 0.7, 0.95) * E.snap));
        c.beginPath();
        c.arc(cx, cy, Math.max(1, r0 - 3), 0, TAU);
        c.stroke();
        c.lineWidth = (pv ? 2 : 4) * elSzC(K.S);
        c.strokeStyle = elRgba(elMix(EL_WHITE, C.a2, 0.15), Math.min(1, elPk(K.S, 0.9, 1) * E.snap));
        c.beginPath();
        c.ellipse(cx, cy, r0 + 2 + len * f * EX + pad, r0 + 2 + len * f + pad, 0, 0, TAU);
        c.stroke();
        c.restore();
      }
      if (K.S && E.snap > 0.003 && ND_S_CR > 0 && G.hgt) {   // v6-r2: "Caixa e palmas": the whole crown flashes white (area, not a hairline)
        const a = Math.min(ND_S_CRX, ND_S_CR * elPk(K.S, 0.8, 1) * E.snap);   // v6-r3: cap ND_S_CRX
        if (a > 0.004) {
          const sw = fx.sway || 0, ca = Math.cos(sw), sa = Math.sin(sw), n = G.n, ex = G.ex;
          c.save();
          c.globalCompositeOperation = "lighter";
          c.lineCap = "round";
          c.lineWidth = G.barW * 1.25;
          c.strokeStyle = elRgba(EL_WHITE, a);
          c.beginPath();
          for (let k = 0; k < n; k++) {
            const m = k < G.m ? k : n - 1 - k, Lb = Math.max(1.5, G.hgt[m] * len * ex[m]), co = G.cos[k] * ca - G.sin[k] * sa, si = G.sin[k] * ca + G.cos[k] * sa;
            c.moveTo(cx + co * (r0 + 2), cy + si * (r0 + 2));
            c.lineTo(cx + co * (r0 + 2 + Lb), cy + si * (r0 + 2 + Lb));
          }
          c.stroke();
          c.restore();
        }
      }
      if (K.A && st.N) {                           // "Agudos e chimbal": the outer dots glow with the air, twinkle on hats
        const N = st.N, bp = num(sig.beatPos, 0);
        if (!L.rm) {                               // the orbit: one slot per beat (eased), faster in a riser, slower calm
          const fr = bp - Math.floor(bp), e1 = Math.floor(bp) + fr + (Math.pow(fr, 3) - fr) * num(sig.drums, 1);   // v6: no drums, no steps
          if (st.e0 != null) {
            const dE = e1 - st.e0;
            if (dE > 0 && dE < 4) st.phi = (st.phi + (TAU / N) * dE * ND_ORB * (ND_ORB0 + (1 - ND_ORB0) * num(sig.drums, 1)) * (1 + 2 * L.T * Math.min(1, K.M)) * Math.max(0, 1 - 0.5 * L.C * Math.min(1, K.M))) % TAU;
          }
          st.e0 = e1;
        }
        const con = L.rm ? 0 : 0.14 * Math.min(1, K.M) * L.T, hb = EX - 1, cp = Math.cos(st.phi), sp = Math.sin(st.phi);
        // r2: the glow keeps the air's range at any amount (<= 0.85) and leaves room for the hat twinkles above it
        const base = Math.max(floor, elPk(K.A, 0.75 * ND_A_A, Math.min(0.95, 0.85 * ND_A_A)) * (0.12 + 0.88 * Math.pow(E.air, 1.2))), szA = elSzC(K.A) * ND_A_SZ * (pv ? 0.6 : 1);
        // r3 "os agudos entraram": a white sweep over +-EL_SWEEP_RAD (r2: +-0.3 rad, +0.45 x 0.6 at most, the dots' own colour)
        const fA = E.fAir, sweep = fA > 0.01, sw = (E.entAirAge / 700) * TAU;
        for (let i = 0; i < N; i++) {
          const co = st.cos[i] * cp - st.sin[i] * sp, si = st.sin[i] * cp + st.cos[i] * sp;
          const R = (r0 + 2 + EL_DOT_R * len * (1 + hb * co * co)) * (1 - con);
          const tw = ns ? elTw(E, ns, i) : 0;
          let swp = 0;
          if (sweep) {
            if (L.rm) swp = 0.5 * fA;
            else {
              let dd = Math.abs((((Math.atan2(si, co) + Math.PI / 2 - sw) % TAU) + TAU) % TAU);
              dd = Math.min(dd, TAU - dd);
              if (dd < EL_SWEEP_RAD) swp = fA * (1 - dd / EL_SWEEP_RAD);
            }
          }
          EL_SX[i] = cx + co * R; EL_SY[i] = cy + si * R;
          EL_SB[i] = Math.min(1, base + twK * tw + 0.6 * swp) * elTitleFade(EL_SY[i], tTop) * elWinFade(EL_SY[i], wTop); EL_ST[i] = tw + swp;
          EL_SR[i] = (1.6 + 1.1 * E.air + 3.5 * Math.min(1, tw)) * (1 + swp) * szA;
        }
        elSparks(c, N, C.a2, pv ? 0 : 8);
      }
      if (K.E && E.ent > 0.003 && E.entAge < EL_SHOCK_MS) {   // "Quando o grave entra": the shockwave's core
        // r2: 5 px, 75 % towards white (v5b: a 3 px pale line, easy to miss next to a crown at 400 %)
        const tau = L.rm ? 0 : E.entAge / EL_SHOCK_MS, R = elShockR(r0, len, tau);
        const a = Math.min(1, elPk(K.E, 1, 1) * E.ent * Math.pow(1 - E.entAge / EL_SHOCK_MS, 1.2)) * elEdgeFade(R, elRingLim(v, xs));
        c.save();
        c.lineWidth = (pv ? 2 : 5) * ND_E_W * Math.min(1.3, elSzC(K.E));
        c.strokeStyle = elTitleStroke(c, elMix(C.a1, EL_WHITE, 0.75), 0.9 * a, tTop, 1);
        c.beginPath();
        c.ellipse(cx, cy, R * xs, R, 0, 0, TAU);
        c.stroke();
        c.restore();
      }
    } else if (v.style === "bars") {
      const w = v.w, cy = v.h / 2, cmp = G.cmp || 1, X = (x) => w / 2 + (x - w / 2) * cmp, Cp = G.caps && G.caps.v;
      const capsOn = !CFG.caps || CFG.caps.bars !== false, lift = G.capLift || 0, tR = L.rm ? 0 : Math.min(1, K.M) * L.T;
      let m = 0;
      if (K.A && st.sp) {                          // sparks off the outer bars' tips (two mirrored rows)
        // r2: each spark rides its bar's tip or its falling cap (+6..12 px), brighter on the bars that move (v5b: two
        // fixed rows at 0.95-1.05 x the top, ~0.7 x half away from the short outer bars, one of them in the title band)
        // r3: brighter twinkles (white, +3.5 px) and the riser's climb brightens them
        const szA = elSzC(K.A) * ND_A_SZ * (pv ? 0.5 : 1), pk = elPk(K.A, 0.75 * ND_A_A, Math.min(0.95, 0.85 * ND_A_A));
        for (let q = 0; q < st.sp.length && m < 252; q++) {
          const i = st.sp[q], u = G.a[i], x = X(G.x0 + i * G.pitch + G.barW / 2), h = Math.max(G.hgt[i], Cp ? Cp[i] : 0);
          const tip = 0.3 + 0.7 * smooth(clamp((h - 0.12) / 0.28, 0, 1));
          const base = Math.max(floor * tip, pk * (0.08 + 0.92 * Math.pow(E.air * (u - 0.35) / 0.65, 1.1)) * tip + 0.35 * tR * tip);
          for (let rw = 0; rw < 2; rw++) {
            const tw = ns ? elTw(E, ns, i * 2 + rw) : 0;
            EL_SX[m] = x; EL_SY[m] = cy + (rw ? 1 : -1) * (h * G.half + (G.capH || 3) + 6 + 6 * elHash(i, 7 + rw) + lift);
            EL_SB[m] = Math.min(1, base + twK * tw * (0.5 + 0.5 * tip)) * (rw ? elTitleFade(EL_SY[m], tTop) : 1); EL_ST[m] = tw;
            EL_SR[m] = (1.8 + 1.2 * E.air + 3.5 * Math.min(1, tw)) * szA;
            m++;
          }
        }
        // r3 "os agudos entraram": a white front runs from the centre out to the tips over EL_CASCADE_MS, lighting the bar
        // tips it passes (reduced motion: all tips flash in place); r2 drew nothing for it in "Barras"
        const fA = E.fAir;
        if (fA > 0.01) {
          const f = L.rm ? -1 : Math.min(1, E.entAirAge / EL_CASCADE_MS);
          for (let i = 0; i < G.n && m < 252; i++) {
            const d = f < 0 ? 0 : Math.abs(G.a[i] - f), k = f < 0 ? 0.5 : 1 - d / 0.2;
            if (k <= 0) continue;
            const x = X(G.x0 + i * G.pitch + G.barW / 2), h = Math.max(G.hgt[i], Cp ? Cp[i] : 0), wgt = fA * k;
            for (let rw = 0; rw < 2; rw++) {
              EL_SX[m] = x; EL_SY[m] = cy + (rw ? 1 : -1) * (h * G.half + (G.capH || 3) + 5 + lift);
              EL_SB[m] = Math.min(1, 0.45 + 0.55 * wgt) * (rw ? elTitleFade(EL_SY[m], tTop) : 1); EL_ST[m] = 1;
              EL_SR[m] = (3 + 4.5 * wgt) * elSzC(K.A) * (pv ? 0.5 : 1);
              m++;
            }
            if (wgt > 0.15) (st.cas || (st.cas = [])).push(i, wgt);
          }
        }
        elSparks(c, m, C.a2, pv ? 0 : 6);
        if (st.cas && st.cas.length) {             // r3: the cascade front also lights the bar tips it passes
          c.save();
          c.globalCompositeOperation = "lighter";
          c.beginPath();
          let wmax = 0;
          for (let q = 0; q < st.cas.length; q += 2) {
            const i = st.cas[q], x = X(G.x0 + i * G.pitch), half = Math.max(1.25, G.hgt[i] * G.half);
            c.rect(x, cy - half - 2, G.barW * cmp, 10); c.rect(x, cy + half - 8, G.barW * cmp, 10);
            wmax = Math.max(wmax, st.cas[q + 1]);
          }
          c.fillStyle = elRgba(elMix(EL_WHITE, C.a2, 0.2), Math.min(1, 0.9 * wmax));
          if (!pv) { c.shadowColor = elRgba(elMix(C.a2, EL_WHITE, 0.5), 0.9); c.shadowBlur = 10 * v.dpr; }
          c.fill();
          c.restore();
          st.cas.length = 0;
        }
        // r3: a twinkling spark flares its bar's cap (or tip) white
        if (ns && !pv) {
          c.save();
          c.globalCompositeOperation = "lighter";
          for (const pass of [0, 1]) {
            c.beginPath();
            let any = false;
            for (let q = 0; q < st.sp.length; q++) {
              const i = st.sp[q], tw = Math.max(elTw(E, ns, i * 2), elTw(E, ns, i * 2 + 1));
              if ((pass ? tw < 0.5 : tw < 0.12 || tw >= 0.5)) continue;
              const x = X(G.x0 + i * G.pitch), half = Math.max(1.25, G.hgt[i] * G.half), cap = Cp ? Cp[i] * G.half + lift : 0, ch = G.capH || 3;
              const top = capsOn && cap - half > ch * 0.8 ? cap : half;
              c.rect(x, cy - top - ch, G.barW, ch); c.rect(x, cy + top, G.barW, ch);
              any = true;
            }
            if (any) { c.fillStyle = elRgba(EL_WHITE, pass ? 0.95 : 0.5); c.fill(); }
          }
          c.restore();
        }
      }
      // r3 "Caixa e palmas": the bar TIPS and caps flash white (r2: the centre hairline, hidden under the bars' white cores);
      // the riser's climb lights the tips too (r3: "Barras" had no riser of its own, 0.8 % of the screen changed)
      const sA = K.S && E.snap > 0.003 ? Math.min(1, elPk(K.S, 0.85, 1) * E.snap) : 0, rA = 0.45 * tR;
      if (sA > 0.003 || rA > 0.01) {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.beginPath();
        const ch = G.capH || 3;
        for (let i = 0; i < G.n; i++) {
          const x = X(G.x0 + i * G.pitch), half = Math.max(1.25, G.hgt[i] * G.half);
          c.rect(x, cy - half - 1, G.barW * cmp, 4); c.rect(x, cy + half - 3, G.barW * cmp, 4);
          if (sA > 0.003) { c.rect(x, cy - half - 9, G.barW * cmp, 3); c.rect(x, cy + half + 6, G.barW * cmp, 3); }   // a snap just past the tip
          const cap = Cp ? Cp[i] * G.half + lift : 0;
          if (capsOn && cap - half > ch * 0.8) { c.rect(x, cy - cap - ch, G.barW * cmp, ch); c.rect(x, cy + cap, G.barW * cmp, ch); }
        }
        c.fillStyle = elRgba(EL_WHITE, Math.min(1, sA + rA));
        if (!pv) { c.shadowColor = elRgba(elMix(EL_WHITE, C.a2, 0.4), 0.8); c.shadowBlur = 8 * v.dpr; }
        c.fill();
        if (sA > 0.003 && ND_S_BB > 0) {           // v6-r2: "Caixa e palmas": the bodies flash too (area, not only the tips)
          c.shadowBlur = 0;
          c.beginPath();
          for (let i = 0; i < G.n; i++) { const x = X(G.x0 + i * G.pitch), half = Math.max(1.25, G.hgt[i] * G.half); c.rect(x - 1, cy - half, G.barW * cmp + 2, half * 2); }
          c.fillStyle = elRgba(EL_WHITE, Math.min(0.6, ND_S_BB * sA));
          c.fill();
        }
        c.restore();
      }
      if (K.E && E.ent > 0.003 && E.entAge < EL_ENTRY_MS) {   // two glints race out along the hairline, which flashes a1
        const tau = L.rm ? 0 : Math.min(1, E.entAge / EL_SHOCK_MS), a = Math.min(1, elPk(K.E, 0.9, 1) * E.ent), rr = (pv ? 14 : 44) * elSzC(K.E);
        c.save();
        c.globalCompositeOperation = "lighter";
        if (G.elLineA1) { c.globalAlpha = a; c.fillStyle = G.elLineA1; c.fillRect(0, cy - 1, w, 2); c.globalAlpha = 1; }
        for (const sg of (tau > 0 ? [-1, 1] : [1])) {
          const x = w / 2 + sg * tau * (w / 2), g = c.createRadialGradient(x, cy, 0, x, cy, rr);
          g.addColorStop(0, elRgba(EL_WHITE, a)); g.addColorStop(0.25, elRgba(C.a1, 0.7 * a)); g.addColorStop(1, elRgba(C.a1, 0));
          c.fillStyle = g;
          c.fillRect(x - rr, cy - rr, 2 * rr, 2 * rr);
        }
        c.restore();
      }
    } else if (v.style === "wave") {
      if (K.A && st.wk) {                          // 48 sparks ride ribbon 3 and twinkle on the hats
        const szA = elSzC(K.A) * ND_A_SZ * (pv ? 0.5 : 1), base = Math.max(floor, elPk(K.A, 0.7 * ND_A_A, Math.min(0.95, 0.8 * ND_A_A)) * (0.15 + 0.85 * Math.pow(E.air, 1.2))), y2 = G.y[2];
        for (let i = 0; i < 48; i++) {
          const kq = st.wk[i], tw = ns ? elTw(E, ns, i) : 0;
          EL_SX[i] = G.x[kq]; EL_SY[i] = y2[kq];
          EL_SB[i] = Math.min(1, base + twK * tw); EL_ST[i] = tw;
          EL_SR[i] = (1.8 + 1.2 * E.air + 3.5 * Math.min(1, tw)) * szA;
        }
        elSparks(c, 48, C.a2, pv ? 0 : 6);
      }
      // r3: the soft entries light their ribbon's core white at x2 width ("Voz": ribbon 2, "Agudos": ribbon 3; r2: nothing);
      // "Caixa e palmas" flashes the full width of the three cores (r2: their centre third)
      const sA = K.S && E.snap > 0.003 ? Math.min(1, elPk(K.S, 0.8, 1) * E.snap) : 0;
      const mA = K.V ? Math.min(0.95, 0.9 * Math.min(1.3, K.V) * E.fMid) : 0, aA = K.A ? Math.min(0.95, 0.9 * Math.min(1.3, K.A) * E.fAir) : 0;
      if (sA > 0.003 || mA > 0.01 || aA > 0.01) {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.lineCap = "round";
        c.lineJoin = "round";
        const pw = pv ? 0.7 : 1;
        if (mA > 0.01) elRibbonFlash(c, G, 1, mA, RIBBONS[1].core * 2.2 * pw, false);
        if (aA > 0.01) elRibbonFlash(c, G, 2, aA, RIBBONS[2].core * 2.4 * pw, false);
        if (sA > 0.003) for (let r = 0; r < 3; r++) elRibbonFlash(c, G, r, sA, RIBBONS[r].core * 2.4 * ND_S_RW * pw, r === 0);   // v6-r2: x ND_S_RW
        c.restore();
      }
    }
  }
  LAYERS.push(
    { id: "el-under", order: "under", layout: elLayout, draw: elUnder },
    { id: "el-haze", order: "haze", draw: elHaze },
    { id: "el-over", order: "over", draw: elOver },
  );

