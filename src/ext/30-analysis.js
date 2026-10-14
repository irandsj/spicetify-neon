  // ---- audio analysis (one request per track, failures cached) ----------------
  function ensureAnalysis(uri) {
    if (!uri) return null;
    let e = cache.get(uri), tries = 0;
    if (e) {
      if (e.st === "fail" && now() - e.at > failRetryMs(e)) { tries = (e.tries | 0) + 1; cache.delete(uri); }
      else { cache.delete(uri); cache.set(uri, e); return e; }     // LRU touch
    }
    if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) {             // podcasts, local files, ads
      e = { st: "none", at: now(), a: null };
      cache.set(uri, e);
      trimCache(uri);
      return e;
    }
    e = { st: "pending", at: now(), a: null, tries };
    cache.set(uri, e);
    S.stats.requests++;
    let timer = 0;
    const timeout = new Promise((_, rej) => { timer = setTimeout(rej, ANALYSIS_TIMEOUT_MS, new Error("timeout")); });
    Promise.race([Promise.resolve().then(() => audioData(uri)), timeout])
      .then((d) => {
        e.a = digest(d);
        e.st = e.a ? "ok" : "fail";
        if (!e.a) {                                // final-fix: Spicetify answers an HTTP error as { code, error, message }
          const c = d && typeof d === "object" ? Math.round(Number(d.code)) : 0;
          e.code = c > 0 ? c : 0;
          e.kind = failKind(e.code);
          e.err = e.code ? "http " + e.code : "no segments";
        } else anOkAt = now();
        e.at = now();
        // v5b "Camadas por elemento": their digest runs in its own task, off the frame (the layers fade in when done)
        if (e.a) elAttachDeferred(d, e.a);
      })
      .catch((err) => {
        e.st = "fail";
        e.at = now();
        e.err = String((err && err.message) || err).slice(0, 120);
        e.kind = /timeout/i.test(e.err) ? "timeout" : "net";
      })
      .finally(() => clearTimeout(timer));
    trimCache(uri);
    return e;
  }
  function trimCache(keep) {
    while (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest === keep) break;
      cache.delete(oldest);
    }
  }

  function analysisFor(uri) {
    if (S.test && S.test.fallback) return null;
    const e = uri && cache.get(uri);
    return e && e.st === "ok" ? e.a : null;
  }

  /** Compact typed-array copy of what the renderer needs, plus the bass /
      kick hits. Spotify's analysis has no frequency bands (pitches are chroma
      classes), so "bass" is inferred with a model FITTED ON REAL AUDIO: an
      audio capture recorded what left the system mixer (band envelopes only)
      while a set of test tracks played; the ground truth is
      every PERCEPTUAL bass onset (the < 120 Hz band rising >= 5 dB from its
      local valley, also an 808 re-trigger on a tail), not only the big
      ">= 10 dB from silence" hits. bassHits(): candidates are segment starts
      plus the late loudness peak of segments a hat / clap opened; a logistic
      model on per-track ranks (quiet and loud masters behave the same) and
      +-1.5 s local ranks scores them, and an ABSOLUTE probability gate
      (BASS_GATE) maps them to 0..1, so dense passages are no longer rationed
      to the track's top 20 % of segments. Hits closer than HIT_MERGE_MS fuse.
      Hit times are the onsets (segment.start, measured against the real mixer
      output to ~1 ms); each hit rises in min(loudness_max_time, 30 ms), holds
      one frame and decays with its own LOOK-AHEAD time constant
      (finishHits()): musical (0.36 beat, 120-200 ms, x1.3) when the next hit
      is far, but always down to a clear valley one frame before the next hit,
      so dense 808 runs pulse hit by hit. The "Sincronia" latency is applied at
      lookup. */
  // bass-hit model (see bassHits()): logistic on per-track ranks (centred) of segment features, local ranks (+-1.5 s),
  // grid flags and late-peak candidates. Fitted on recorded ground truth (56 tracks / 106 windows, 7 genres, perceptual
  // bass onsets) and validated leave-one-track-out and leave-one-genre-out (an offline fit); new input: the segment's chroma entropy (pent: flat chroma = drum / noise-like, peaky = a
  // tonal note), also for late candidates. k = ((p - BASS_GATE) / (p1 - BASS_GATE))^0.6: an absolute probability gate,
  // not a per-track "top 20 %" cut, so busy passages are not rationed. BASS_GATE: the held-out precision equals v5a's.
  const BASS_GATE = 0.4142;
  const BASS_MODEL = {
    b: -1.625, p1: 0.75, gamma: 0.6, lateMs: 40, lateLead: 6, lateAttack: 10,   // p1 0.75: real hits keep v5a's strengths
    w: { t2: -2.0559, lmt: -0.8353, t5: -0.4597, t4: -0.7571, t10: 0.2828, pmax2: 0.153, att: 1.2778, t6: 0.7421, t0: 0.9138,
         ctx: -0.0124, lmax: 0.0467, t3: -0.885, pt1: 0.9817, pt2: 0.9416, dlmax: 0.4847, dt2: -0.6397, t1: -1.4509, dur: 0.6635, pent: 0.5388 },
    wGrid: { onBeat: 0.0285, onTat: 0.5739 },
    wLocal: { lr_t2: -0.2156, lr_lmax: 0.1476 },
    wLate: { LATE: -0.7089, t2: -0.5782, lmt: 1.54, att: -1.2301, lmax: 0.3831, lr_t2: 1.069, onBeat: 0.0828, pent: 1.6966 },
  };
  /** average rank (ties share it) of every value, 0..1 */
  function avgRanks(arr) {
    const n = arr.length, s = Float64Array.from(arr).sort(), r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = arr[i];
      let lo = 0, hi = n;
      while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < x) lo = m + 1; else hi = m; }
      let lo2 = lo, hi2 = n;
      while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; if (s[m] <= x) lo2 = m + 1; else hi2 = m; }
      r[i] = n > 1 ? (lo + (lo2 - lo - 1) / 2) / (n - 1) : 0.5;
    }
    return r;
  }
  /** rank of x[i] among the values whose time is within +-win/2 of t[i] (ties averaged), 0..1 */
  function localRanks(x, t, win) {
    const n = x.length, r = new Float32Array(n);
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      while (a < n && t[a] < t[i] - win / 2) a++;
      while (b < n && t[b] <= t[i] + win / 2) b++;
      const m = b - a;
      if (m < 2) { r[i] = 0.5; continue; }
      let lt = 0, eq = 0;
      for (let j = a; j < b; j++) { if (x[j] < x[i]) lt++; else if (x[j] === x[i]) eq++; }
      r[i] = (lt + 0.5 * (eq - 1)) / (m - 1);
    }
    return r;
  }
  /** distance (ms) from ms to the nearest time of a sorted array (1e9 if empty) */
  function nearestDist(times, ms) {
    const j = nearestIdx(times, ms);
    return j < 0 ? 1e9 : Math.abs(times[j] - ms);
  }
  /** bass hits from the analysis (BASS_MODEL). Candidates: every segment start, plus the loudness peak
      (start + loudness_max_time - 6 ms) of segments that peak late (> 40 ms): the 808 arriving inside a segment a
      hat / clap opened. Features: per-track average ranks of timbre[0..6, 10], loudness_max, its attack, local
      contrast, loudness_max_time, duration, 2nd pitch peak, chroma entropy, the previous segment's timbre[1] / [2] and
      the change from it; ranks within +-1.5 s of timbre[2] and loudness_max (the bass cue weakens in busy mixes); on a beat /
      tatum. Returns the merged hit list (onset ms, strength, attack ms); fills A.kick / A.z (segment-start
      candidates) for the debug sample. */
  function bassHits(segs, d, A) {
    const M = BASS_MODEL, n = segs.length;
    const st = new Float64Array(n), dur = new Float64Array(n), lmtRaw = new Float64Array(n), pmax2 = new Float64Array(n), pent = new Float64Array(n);
    const lmax = new Float64Array(n), att = new Float64Array(n), ctx = new Float64Array(n);   // double precision (no float32 ties)
    const T = []; for (let k = 0; k < 12; k++) T.push(new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const s = segs[i] || {}, tb = Array.isArray(s.timbre) ? s.timbre : [], p = Array.isArray(s.pitches) ? s.pitches : [];
      st[i] = A.start[i] * 1000; dur[i] = num(s.duration, 0.1) * 1000; lmtRaw[i] = num(s.loudness_max_time, 0) * 1000;
      lmax[i] = num(s.loudness_max, -60); att[i] = Math.max(0, lmax[i] - num(s.loudness_start, -60));
      for (let k = 0; k < 12; k++) T[k][i] = num(tb[k], 0);
      let p1 = -1, p2 = -1, ps = 0;
      for (let k = 0; k < 12; k++) { const v = num(p[k], 0); ps += v; if (v > p1) { p2 = p1; p1 = v; } else if (v > p2) p2 = v; }
      pmax2[i] = p2;
      let e = 0;                                     // chroma entropy (nats): ~2.48 = flat (drums, noise) .. low = one clear note
      for (let k = 0; k < 12; k++) { const q = num(p[k], 0) / (ps + 1e-9); e -= q * Math.log(q + 1e-9); }
      pent[i] = e;
    }
    for (let i = 0, j0 = 0, sum = 0; i < n; i++) {   // loudness_max against the mean of the previous 300 ms (= A.ctx)
      while (j0 < i && st[j0] < st[i] - 300) { sum -= lmax[j0]; j0++; }
      const c = i - j0; ctx[i] = c ? lmax[i] - sum / c : att[i]; sum += lmax[i];
    }
    const prev = (a) => Float64Array.from(a, (_, i) => a[i ? i - 1 : 0]);
    const diffPrev = (a) => Float64Array.from(a, (_, i) => a[i] - a[i ? i - 1 : 0]);
    const F = { t0: T[0], t1: T[1], t2: T[2], t3: T[3], t4: T[4], t5: T[5], t6: T[6], t10: T[10], lmt: lmtRaw, att, ctx, lmax, pmax2, pent,
                pt1: prev(T[1]), pt2: prev(T[2]), dlmax: diffPrev(lmax), dt2: diffPrev(T[2]), dur };
    const R = {}; for (const f of Object.keys(M.w)) R[f] = avgRanks(F[f]);
    const LR = { lr_t2: localRanks(T[2], st, 3000), lr_lmax: localRanks(lmax, st, 3000) };
    const beats = A.beatT;
    const tats = Float64Array.from((Array.isArray(d.tatums) ? d.tatums : []).filter((b) => b && isFinite(b.start)), (b) => b.start * 1000);
    const cand = [];
    for (let i = 0; i < n; i++) {
      const lmt = Math.min(lmtRaw[i], dur[i]);
      cand.push({ t: st[i], i, late: 0, lmt, k: 0 });
      if (lmt > M.lateMs) cand.push({ t: st[i] + lmt - M.lateLead, i, late: 1, lmt, k: 0 });
    }
    cand.sort((a, b) => a.t - b.t || a.late - b.late);
    A.z = new Float32Array(n);
    for (const c of cand) {
      const i = c.i, onB = nearestDist(beats, c.t) < 60 ? 1 : 0, onT = nearestDist(tats, c.t) < 40 ? 1 : 0;
      let z = M.b;
      for (const f of Object.keys(M.w)) z += M.w[f] * (R[f][i] - 0.5);
      z += M.wGrid.onBeat * (onB - 0.5) + M.wGrid.onTat * (onT - 0.5);
      for (const f of Object.keys(M.wLocal)) z += M.wLocal[f] * (LR[f][i] - 0.5);
      z += M.wLate.LATE * (c.late - 0.5);
      if (c.late) z += M.wLate.t2 * (R.t2[i] - 0.5) + M.wLate.lmt * (R.lmt[i] - 0.5) + M.wLate.att * (R.att[i] - 0.5) + M.wLate.lmax * (R.lmax[i] - 0.5)
                     + M.wLate.lr_t2 * (LR.lr_t2[i] - 0.5) + M.wLate.onBeat * (onB - 0.5) + M.wLate.pent * (R.pent[i] - 0.5);
      const p = 1 / (1 + Math.exp(-z));
      c.k = Math.pow(clamp((p - BASS_GATE) / (M.p1 - BASS_GATE), 0, 1), M.gamma);
      if (!c.late) { A.kick[i] = c.k; A.z[i] = z; }
    }
    const ht = [], hs = [], ha = [];
    for (const c of cand) {
      if (!(c.k > 0.06)) continue;
      const a = c.late ? M.lateAttack : clamp(c.lmt, KICK_ATTACK_MIN_MS, KICK_ATTACK_MAX_MS);
      const last = ht.length - 1;
      if (last >= 0 && c.t - ht[last] < HIT_MERGE_MS) { if (c.k > hs[last]) { ht[last] = c.t; hs[last] = c.k; ha[last] = a; } }
      else { ht.push(c.t); hs.push(c.k); ha.push(a); }
    }
    return { ht, hs, ha };
  }
  function digest(d) {
    const segs = d && d.segments;
    if (!Array.isArray(segs) || segs.length < 4) return null;
    const n = segs.length;
    const A = {
      n,
      start: new Float64Array(n), dur: new Float32Array(n), l0: new Float32Array(n),
      lmax: new Float32Array(n), lmt: new Float32Array(n), pit: new Float32Array(n * 12),
      bri: new Float32Array(n), t0: new Float32Array(n), t3: new Float32Array(n),
      att: new Float32Array(n), ctx: new Float32Array(n), kick: new Float32Array(n), body: new Float32Array(n), hat: new Float32Array(n),
      lo: -40, hi: 0, briLo: 0, briHi: 1, tempo: 0, seg: 0, decay: 180,
      beatT: null, beatC: null, hitT: null, hitS: null, hitA: null, hitD: null, hatT: null, hatS: null,
    };
    for (let i = 0; i < n; i++) {
      const s = segs[i] || {};
      A.start[i] = num(s.start, i ? A.start[i - 1] : 0);
      A.dur[i] = Math.max(0.001, num(s.duration, 0.1));
      A.l0[i] = num(s.loudness_start, -60);
      A.lmax[i] = num(s.loudness_max, -60);
      A.lmt[i] = clamp(num(s.loudness_max_time, 0), 0, A.dur[i]);
      const p = Array.isArray(s.pitches) ? s.pitches : [];
      for (let k = 0; k < 12; k++) A.pit[i * 12 + k] = clamp(num(p[k], 0), 0, 1);
      const tb = Array.isArray(s.timbre) ? s.timbre : [];
      A.t0[i] = num(tb[0], 0);
      A.bri[i] = num(tb[1], 0);
      A.t3[i] = num(tb[3], 0);
      A.att[i] = Math.max(0, A.lmax[i] - A.l0[i]);
    }
    // local contrast: loudness_max against the mean loudness_max of the previous 300 ms
    for (let i = 0, j0 = 0, sum = 0; i < n; i++) {
      while (j0 < i && A.start[j0] < A.start[i] - 0.3) { sum -= A.lmax[j0]; j0++; }
      const c = i - j0;
      A.ctx[i] = c ? A.lmax[i] - sum / c : A.att[i];
      sum += A.lmax[i];
    }
    const L = sortedOf(A.lmax), B = sortedOf(A.bri), AT = sortedOf(A.att), CT = sortedOf(A.ctx), T0 = sortedOf(A.t0), T3 = sortedOf(A.t3);
    A.hi = pct(L, 0.97) + 0.5;
    A.lo = Math.min(pct(L, 0.10) - 8, A.hi - 14);
    A.briLo = pct(B, 0.08);
    A.briHi = Math.max(A.briLo + 1, pct(B, 0.92));
    const attLo = pct(AT, 0.30), attHi = Math.max(attLo + 2, pct(AT, 0.92));
    const ctxLo = pct(CT, 0.50), ctxHi = Math.max(ctxLo + 1, pct(CT, 0.95));
    const t0Lo = pct(T0, 0.15), t0Hi = Math.max(t0Lo + 1, pct(T0, 0.97));
    const t3Lo = pct(T3, 0.10), t3Hi = Math.max(t3Lo + 1, pct(T3, 0.90));
    const lmLo = pct(L, 0.25), lmHi = Math.max(lmLo + 2, pct(L, 0.97));
    A.tempo = num(d.track && d.track.tempo, 0);
    const beatMs = A.tempo > 40 ? 60000 / A.tempo : 500;
    A.decay = clamp(beatMs * 0.36, 120, 200);       // musical decay: ~170 ms at 120 BPM

    const beats = Array.isArray(d.beats) ? d.beats.filter((b) => b && isFinite(b.start)) : [];
    A.beatT = new Float64Array(beats.map((b) => b.start * 1000));
    A.beatC = new Float32Array(beats.map((b) => clamp(num(b.confidence, 0), 0, 1)));
    // v5 "Balanço no ritmo": the downbeats = the beats a bar (bars[]) starts on
    const barList = Array.isArray(d.bars) ? d.bars.filter((b) => b && isFinite(b.start)) : [];
    A.barT = new Float64Array(barList.map((b) => b.start * 1000));
    A.beatDown = new Uint8Array(A.beatT.length);
    for (let k = 0; k < A.barT.length; k++) {
      const j = nearestIdx(A.beatT, A.barT[k]);
      if (j < 0) continue;
      const per = j + 1 < A.beatT.length ? A.beatT[j + 1] - A.beatT[j] : j > 0 ? A.beatT[j] - A.beatT[j - 1] : 500;
      if (Math.abs(A.beatT[j] - A.barT[k]) <= GROOVE_DOWN_WIN * per) A.beatDown[j] = 1;
    }

    const rawHat = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const loud = 0.5 * n01(A.lmax[i], lmLo, lmHi) + 0.5 * n01(A.t0[i], t0Lo, t0Hi);
      const bright = n01(A.bri[i], A.briLo, A.briHi), dark = 1 - bright;
      const sharp = 0.5 * (1 - clamp((A.lmt[i] * 1000 - 12) / 110, 0, 1)) + 0.5 * n01(A.t3[i], t3Lo, t3Hi);
      const aN = Math.max(n01(A.att[i], attLo, attHi), 0.9 * n01(A.ctx[i], ctxLo, ctxHi));
      rawHat[i] = Math.pow(aN, 0.7) * (0.3 + 0.7 * loud) * Math.pow(bright, 1.5) * (0.4 + 0.6 * sharp);   // bright transients
      A.body[i] = loud * loud * (0.2 + 0.8 * dark);
    }
    // bright transients ("hats"): per track p50 -> 0, p96 -> 1
    const RH = sortedOf(rawHat);
    const hLo = pct(RH, 0.5), hHi = Math.max(hLo + 1e-3, pct(RH, 0.96));
    const tt = [], ts = [];
    for (let i = 0; i < n; i++) {
      const h = n01(rawHat[i], hLo, hHi);
      A.hat[i] = h;
      if (h > 0.1) { tt.push(A.start[i] * 1000); ts.push(h); }
    }
    // "Graves" hits (the model, BASS_MODEL): 808s, kicks, bass attacks
    const H = bassHits(segs, d, A);
    A.mHitT = Float64Array.from(H.ht); A.mHitS = Float32Array.from(H.hs); A.mHitA = Float32Array.from(H.ha);
    A.hatT = Float64Array.from(tt); A.hatS = Float32Array.from(ts);
    beatPulse(A, d);
    drumsDigest(A, d);                              // v6: drums present (gates every beat-driven motion)
    A.hitMode = "";
    buildHits(A, rhythmMode());
    return A;
  }

  /** "Cada batida" (four on the floor: trance, house, techno). The model above
      was fitted on 808 / trap ground truth; in dense electronic mixes Spotify's
      segments often do not even mark the kicks (a supersaw drop is one long
      segment), so the kick on every beat would mostly be missed (measured: on
      12 test trance tracks only 0-27% of the beats carried a strong
      hit). The beat grid is the reliable kick clock there. For every beat:
      - its onset: the most kick-like segment starting in [beat - 90, beat + 25]
        ms (Spotify's beat times sit ~6-45 ms after the sound starts), else
        the beat minus this track's median beat -> onset lead;
      - "punch": max(model rank, 0.85 x attack rank) of that onset; >= 0.6 is
        a kick-like onset;
      - steadiness: the share of kick-like onsets over +-6 beats (or 0.92 x
        over +-16 beats, so a drop where the segments lose the kicks stays a
        drop): a run of kicks, not a chord change on the bar. Measured with
        the recorded ground truth of a trance test track: 26 of 28 drop beats get >= 0.5 in
        "Automático" (7 of 28 with the model alone), the breakdown 4 of 17;
      - the section's loudness (quieter sections pulse a little softer).
      A.four is how much this track looks like four on the floor: Spotify's
      tempo confidence is high and its beat confidence low on steady electronic
      tracks, the other way round on trap / funk (12 trance tracks: tc - bc
      0.03..0.56, 11 of them > 0.15; 17 rap / trap / funk: -0.66..0.19, 16 of
      them < 0.1), within 105-165 BPM. "Automático" blends by A.four; the
      panel can force "Cada batida" or "Graves". */
  const PUNCH_ATT = 0.85, SOFT_BEAT = 0.22;        // attack weight in the kick evidence; soft tick outside kick runs
  const OFF_Z = 0.6, OFF_K = 0.5, OFF_MIN = 0.25;  // v5b-r2: the off-beat bass tick of a kick run (beatPulse)
  /** v5b-r3: the TICK GATE. Of the r2 tick candidates (a rank >= OFF_Z onset near a kick run's midpoint) only half sat on
      a real bass onset (reference set +-40 ms: trance .49, house .33; on one test track the bass came a 16th later). A
      linear probability (logistic, lambda 1) on 7 features of the candidate segment: [model rank zR, timbre t1 / t2 / t3,
      onset - midpoint (ms), attack (loudness_max - loudness_start, dB), attack rank]; a tick needs p >= thr. Fit on the 538
      trance / house candidates of the reference sets (an offline fit). Leave one track out at 0.6:
      trance 138 of 449 kept, precision .49 -> .75; house 24 of 89, .33 -> .58. (A gate on the run's share of strong
      midpoints, as the kick clock counts them, did not separate them: P .45-.55 at every setting.) */
  const TICK_MODEL = {
    mu: [0.7304, 42.7633, -32.3093, 0.5972, -16.789, 8.6418, 0.648],
    sd: [0.0894, 57.7475, 33.2484, 31.4048, 13.3981, 4.5196, 0.2279],
    w: [-0.0313, 0.5842, -0.5332, -0.2573, 0.4272, 0.4766, 1.1822, -0.9131],
    thr: 0.6,
  };
  // v5b-r3: the VISUAL size of a hit, applied after the renderers' saturation (at 200-500 % every hit >= ~0.15 saturates,
  // so the strength alone no longer told a tick from a kick): an off-beat tick OFF_VIS, a beat-grid soft tick (no kick-like
  // onset, outside a steady run) down to SOFT_VIS; a real bass-model kick (merged strength >= HIT_REAL) always 1
  const OFF_VIS = 0.5, SOFT_VIS = 0.3, HIT_REAL = 0.45;
  /** v5b: the KICK CLOCK. On four-on-the-floor tracks Spotify's beat grid is often half a beat off the kick: it
      locked on the offbeat open hats (recorded ground truth, 6-band kick signature: 10 of 24 trance / house windows with a
      clear kick phase, e.g. "Land Of Freedom", "Attraction", "Silence", "It Feels So Good"; the analysis' own
      kick-like segments sit at phase ~0.47 of Spotify's beats there). Then "Cada batida", Automático's beat hits and
      "Balanço no ritmo" pulsed on the hats, between the kicks. Evidence, per beat and per midpoint between beats:
      is the most kick-like onset in [t - 90, t + 25] ms (as below) a strong bass-model one (rank >= KICK_PH_Z)?
      Over +-KICK_PH_W beats, log((midpoints + 1) / (beats + 1)) > KICK_PH_THR (+-KICK_PH_HYST hysteresis) moves
      the kick clock to the midpoints there (Spotify can also flip phase between sections). Only when A.four >=
      KICK_PH_FOUR: outside four on the floor (trap 808s, a snare backbeat) Spotify's grid stays. Held-out (leave
      one track out, 56 GT tracks, 41 windows with a clear kick phase): kick clock on the real kick 0.71 -> 0.93 of
      beats; "Cada batida" onsets on the true kick 0.55 -> 0.84; groove lock on the kicks +0.25 -> +0.82 (wrong
      half-beat 35 % -> 6 %). Fills A.kShift (1 = midpoint). */
  const KICK_PH_Z = 0.8, KICK_PH_W = 48, KICK_PH_THR = 0.3, KICK_PH_HYST = 0.05, KICK_PH_FOUR = 0.5;
  const KICK_PH_MIN = 16;   // v5b-r2: the shortest phase run (beats). (Holding the phase while the window has few strong
  // onsets was tried too: it cost 0.5-1 pt of the labelled kick clock, so it is not used.)
  function kickClock(A, zR, aR) {
    const B = A.beatT, nb = B.length, n = A.n;
    A.kShift = new Uint8Array(nb);
    if (nb < 8 || !(A.four >= KICK_PH_FOUR)) return B;
    const M = new Float64Array(nb);
    for (let j = 0; j < nb; j++) M[j] = j + 1 < nb ? (B[j] + B[j + 1]) / 2 : B[j] + (B[j] - B[j - 1]) / 2;
    const strong = (T) => {                         // running count of grid points carrying a strong kick-like onset
      const c = new Float64Array(nb + 1);
      let i0 = 0;
      for (let j = 0; j < nb; j++) {
        const t = T[j];
        while (i0 < n && A.start[i0] * 1000 < t - 90) i0++;
        let best = -1, ba = -Infinity;
        for (let i = i0; i < n && A.start[i] * 1000 <= t + 25; i++) { const v = zR[i] + 0.15 * aR[i]; if (v > ba) { ba = v; best = i; } }
        c[j + 1] = c[j] + (best >= 0 && zR[best] >= KICK_PH_Z ? 1 : 0);
      }
      return c;
    };
    const c0 = strong(B), c5 = strong(M), K = new Float64Array(B), S = A.kShift;
    let state = 0;
    for (let j = 0; j < nb; j++) {
      const a = Math.max(0, j - KICK_PH_W), b = Math.min(nb, j + KICK_PH_W + 1);
      const lr = Math.log((c5[b] - c5[a] + 1) / (c0[b] - c0[a] + 1));
      if (!state && lr > KICK_PH_THR + KICK_PH_HYST) state = 1;
      else if (state && lr < KICK_PH_THR - KICK_PH_HYST) state = 0;
      S[j] = state;
    }
    // v5b-r2: every switch puts one 0.5- or 1.5-beat interval into the clock; runs shorter than KICK_PH_MIN beats take
    // their neighbours' phase (v5b: 12 of 75 switches came within 8 beats of the previous one, 2-beat islands)
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (let i = 0; i < nb; ) {
        let k = i;
        while (k < nb && S[k] === S[i]) k++;
        if (k - i < KICK_PH_MIN && (i > 0 || k < nb)) { const v = i > 0 ? S[i - 1] : S[k]; for (let q = i; q < k; q++) S[q] = v; changed = true; }
        i = k;
      }
      if (!changed) break;
    }
    for (let j = 0; j < nb; j++) if (S[j]) K[j] = M[j];
    return K;
  }
  function beatPulse(A, d) {
    const nb = A.beatT.length, n = A.n;
    A.bOn = new Float64Array(nb); A.bAuto = new Float32Array(nb); A.bForce = new Float32Array(nb); A.bAtt = new Float32Array(nb);
    A.bSteady = new Float32Array(nb); A.four = 0; A.beatLead = 35; A.kT = A.beatT; A.kShift = new Uint8Array(nb);
    if (nb < 8) return;
    const rank = (arr) => avgRanks(arr);
    const aR = rank(A.att), cR = rank(A.ctx), zR = rank(A.z);
    const tc = num(d.track && d.track.tempo_confidence, 0), bc = median(A.beatC), bpm = A.tempo;
    const tempoGate = smooth(n01(bpm, 100, 110)) * (1 - smooth(n01(bpm, 160, 170)));
    A.four = +(smooth(n01(tc - bc, 0.05, 0.25)) * tempoGate).toFixed(3);
    const B = (A.kT = kickClock(A, zR, aR));       // v5b: the beats the kick pulse / groove follow
    const on = new Int32Array(nb).fill(-1), punch = new Float32Array(nb), lead = [];
    let i0 = 0;
    for (let j = 0; j < nb; j++) {
      const b = B[j];
      while (i0 < n && A.start[i0] * 1000 < b - 90) i0++;
      let best = -1, ba = -Infinity;            // the most kick-like onset (model rank) near the beat
      for (let i = i0; i < n && A.start[i] * 1000 <= b + 25; i++) { const v = zR[i] + 0.15 * aR[i]; if (v > ba) { ba = v; best = i; } }
      on[j] = best;
      if (best >= 0) { punch[j] = Math.max(zR[best], PUNCH_ATT * aR[best]); lead.push(b - A.start[best] * 1000); }
    }
    A.beatLead = lead.length >= 8 ? clamp(median(lead), 0, 60) : 35;
    // sections: loudness relative to the loudest / quietest one
    const secs = Array.isArray(d.sections) ? d.sections.filter((s) => s && isFinite(s.start) && isFinite(s.loudness)) : [];
    let sLo = Infinity, sHi = -Infinity;
    for (const s of secs) { sLo = Math.min(sLo, s.loudness); sHi = Math.max(sHi, s.loudness); }
    const secLoud = (t) => {
      if (!secs.length || sHi - sLo < 0.5) return 1;
      let L = secs[0].loudness;
      for (const s of secs) { if (s.start * 1000 <= t) L = s.loudness; else break; }
      return clamp((L - sLo) / Math.max(3, sHi - sLo), 0, 1);
    };
    const cnt = new Uint8Array(nb);
    for (let j = 0; j < nb; j++) cnt[j] = on[j] >= 0 && punch[j] >= 0.6 ? 1 : 0;   // a kick-like onset on this beat
    const cum = new Float32Array(nb + 1);
    for (let j = 0; j < nb; j++) cum[j + 1] = cum[j] + cnt[j];
    const share = (j, w) => { const a = Math.max(0, j - w), b = Math.min(nb, j + w + 1); return (cum[b] - cum[a]) / (b - a); };
    for (let j = 0; j < nb; j++) {
      // a run of kicks: +-6 beats, or +-16 (4 bars) so a stretch where the
      // segments lose the kicks does not drop out of a drop
      const F = Math.max(share(j, 6), 0.92 * share(j, 16));
      const steady = smooth(n01(F, 0.28, 0.55)), lf = secLoud(B[j]);
      const i = on[j], p = i >= 0 ? punch[j] : 0;
      A.bOn[j] = i >= 0 ? A.start[i] * 1000 : B[j] - A.beatLead;
      A.bAtt[j] = i >= 0 ? clamp(A.lmt[i] * 1000, KICK_ATTACK_MIN_MS, KICK_ATTACK_MAX_MS) : 18;
      A.bSteady[j] = steady;
      (A.bF || (A.bF = new Float32Array(nb)))[j] = F;
      // inside a run of kicks a beat without its own onset still has its kick
      // (dense drops: Spotify's segments miss them, the recorded audio shows them)
      const body = cnt[j] ? 0.8 + 0.2 * p : 0.66 + 0.1 * p;
      // outside a run of kicks (a breakdown) the beat still ticks softly
      A.bAuto[j] = A.four * (steady * body + (1 - steady) * SOFT_BEAT) * (0.8 + 0.2 * lf);
      A.bForce[j] = (cnt[j] ? 0.8 + 0.2 * p : 0.55 + 0.25 * steady) * (0.6 + 0.4 * lf);
    }
    // v5b-r2: the OFF-BEAT BASS of a rolling trance / house drop. With the kick clock on the kick, the bass notes between
    // the kicks lost their pulse (reference trance off-beat onset recall .33 -> .08; v4 / v5a pulsed on them because Spotify's
    // grid sat there). Between two beats of a kick run, a bass-like onset (model rank >= OFF_Z) near the midpoint adds a
    // secondary grid hit, OFF_K x the beat's strength (at least OFF_MIN): the kick stays the bigger pulse.
    A.oOn = new Float64Array(nb); A.oS = new Float32Array(nb); A.oAtt = new Float32Array(nb);
    if (A.four > 0) {
      const segs = Array.isArray(d.segments) ? d.segments : [], TM = TICK_MODEL;
      let i1 = 0;
      for (let j = 0; j + 1 < nb; j++) {
        if (A.bSteady[j] < 0.5 || A.bSteady[j + 1] < 0.5) continue;
        const m = (B[j] + B[j + 1]) / 2;
        while (i1 < n && A.start[i1] * 1000 < m - 90) i1++;
        let best = -1, ba = -Infinity;
        for (let i = i1; i < n && A.start[i] * 1000 <= m + 25; i++) { const v = zR[i] + 0.15 * aR[i]; if (v > ba) { ba = v; best = i; } }
        if (best < 0 || zR[best] < OFF_Z) continue;
        // v5b-r3: the tick gate (TICK_MODEL)
        const sg = segs[best] || {}, tv = Array.isArray(sg.timbre) ? sg.timbre : [];
        const x = [zR[best], num(tv[1], 0), num(tv[2], 0), num(tv[3], 0), A.start[best] * 1000 - m,
          num(sg.loudness_max, -60) - num(sg.loudness_start, -60), aR[best]];
        let z = TM.w[0];
        for (let q = 0; q < 7; q++) z += TM.w[q + 1] * (x[q] - TM.mu[q]) / TM.sd[q];
        if (1 / (1 + Math.exp(-z)) < TM.thr) continue;
        A.oOn[j] = A.start[best] * 1000;
        A.oS[j] = Math.max(OFF_MIN, OFF_K * A.bAuto[j] / Math.max(1e-6, A.four)) * (0.75 + 0.25 * zR[best]);
        A.oAtt[j] = clamp(A.lmt[best] * 1000, KICK_ATTACK_MIN_MS, KICK_ATTACK_MAX_MS);
      }
    }
    // v5b-r3: per beat, how far its grid hit is a real kick for the visual (1 = a kick-like onset on it or a steady
    // kick run; SOFT_VIS = the soft tick of a breakdown / an intro). buildHits turns it into the hit's visual scale
    A.bVis = new Float32Array(nb);
    for (let j = 0; j < nb; j++) A.bVis[j] = cnt[j] ? 1 : SOFT_VIS + (1 - SOFT_VIS) * smooth(n01(A.bSteady[j], 0.25, 0.75));
  }
  /** v6 "tem bateria?" (user: "tem partes da música em que não tem batida nenhuma e fica só voz. E mesmo assim, os volumes
      ficam pulsando"). Every beat-driven motion (the hit list: kicks, grid ticks and off-beat ticks; the "Balanço no ritmo"
      groove / sway; the v5 hat envelope; the Grave sidechain (it follows the hits); the snare snaps; the hat ticks; the dots'
      beat steps) is scaled by drumsAt(A, t), 0..1, computed once per track from the analysis only:
      - a logistic model (DRUM_MODEL) every 50 ms on +-1 / +-2 s windows: the bass model's hit strength and its strong
        hits, the segment rate, kick-like (A.kick >= 0.3) and sharp (attack >= 6 dB) segments that repeat at +-1 / 2 / 4
        beats, the kick-run share (bF), the time to the loudness peak and the sub / bass band rows (EL_BAND). Fitted on the
        93 recorded ground-truth windows (43 tracks, 7 genres: beat-periodic percussive transients in < 150 Hz, 2-6 kHz,
        > 6 kHz; an offline fit); held out (leave one track / genre out) frame AUC .96;
      - since the whole analysis is known in advance: hysteresis (on >= DRUM_ON, stays on while >= DRUM_OFF), OFF gaps
        under DRUM_OFF_MIN bars bridged (a fill, a one-bar break), ON islands under DRUM_ON_MIN bars dropped (a vocal burst);
      - each drum run opens DRUM_LEAD_MS before its first bass-model hit (>= DRUM_HIT_MIN) or strong beat onset (A.bAuto >=
        DRUM_GRID_START), up to 1 bar before the run, so
        the first kick back lands in full, and fades out (cosine) over DRUM_FADE_BARS bar from its last hit.
      A.drS / A.drE / A.drF: run starts, last hits, fade lengths (ms). No analysis: 1 (unknown music), 0 for podcasts. */
  const DRUM_MODEL = { names: ["mk2000", "mk5_2000", "segRate", "perK_2000", "bF", "att6_2000", "per6_2000", "lmt", "lv_sub", "lv_bass"],
    mu: [0.687316, 0.708997, 4.2893, 0.477913, 0.557011, 2.66031, 1.79091, 56.3574, -8.9414, -6.40408],
    sd: [0.621206, 0.695458, 1.30652, 0.728999, 0.255723, 1.65121, 1.5902, 28.9711, 8.59788, 6.40413],
    b: 6.41709, w: [6.81459, -3.86773, 1.03893, 1.50701, 0.033146, -0.268633, 2.00386, -0.551745, -0.067478, 1.10664] };
  const DRUM_HOP = 50, DRUM_ON = 0.5, DRUM_OFF = 0.3, DRUM_OFF_MIN = 1, DRUM_ON_MIN = 2;   // bars
  const DRUM_LEAD_BARS = 3, DRUM_END_BARS = 0.5, DRUM_HIT_MIN = 0.15, DRUM_FADE_BARS = 1, DRUM_LEAD_MS = 40, DRUM_PER_TOL = 25;
  // a bass-model hit this strong is its own evidence (an impact, a lone kick in a breakdown): it lands whatever the gate
  // says (one pulse, not a pulsing pattern). On the reference drumless passages the only one sits on a real sub transient; the
  // 10 weaker model hits there (0.06-0.8) sit on none and stay gated
  const DRUM_SOLO = 0.8;
  const DRUM_GRID_START = 0.45;   // a beat onset this strong (A.bAuto) may open a run (held out: strong-hit keep .9925 -> .9941, drumless unchanged)
  /** sum of v[i] over the sorted times T within +-w of every grid point (two pointers); v null = count */
  function drWin(T, v, N, w) {
    const out = new Float64Array(N), n = T.length;
    let a = 0, b = 0, s = 0;
    for (let i = 0; i < N; i++) {
      const t = i * DRUM_HOP;
      while (b < n && T[b] <= t + w) { s += v ? v[b] : 1; b++; }
      while (a < b && T[a] < t - w) { s -= v ? v[a] : 1; a++; }
      out[i] = s;
    }
    return out;
  }
  /** an interpolated length (ms) at t from sorted starts S (their gaps at the midpoints; numpy interp clamps), or dflt */
  function drLenAt(S, dflt) {
    if (!S || S.length < 3) return () => dflt;
    const n = S.length - 1, mid = new Float64Array(n), d = new Float64Array(n);
    for (let i = 0; i < n; i++) { mid[i] = (S[i] + S[i + 1]) / 2; d[i] = S[i + 1] - S[i]; }
    return (t) => {
      if (t <= mid[0]) return d[0];
      if (t >= mid[n - 1]) return d[n - 1];
      const j = lastAtOrBefore(mid, t);
      return d[j] + (d[j + 1] - d[j]) * (t - mid[j]) / (mid[j + 1] - mid[j]);
    };
  }
  /** 1 for the segment starts T[i] (ok) that have >= 2 other ok starts at +-1, 2 or 4 beats (+-DRUM_PER_TOL ms) */
  function drPeriodic(st, ok, beat) {
    const T = [];
    for (let i = 0; i < st.length; i++) if (ok(i)) T.push(st[i]);
    const out = new Float64Array(T.length);
    if (T.length < 3) return { T: Float64Array.from(T), v: out };
    for (let i = 0; i < T.length; i++) {
      const x = T[i], L = beat(x);
      let c = 0;
      for (const m of [1, 2, 4]) for (const sg of [-1, 1]) {
        const y = x + sg * m * L, j = elLB(T, y);
        if ((j < T.length && Math.abs(T[j] - y) <= DRUM_PER_TOL) || (j > 0 && Math.abs(T[j - 1] - y) <= DRUM_PER_TOL)) c++;
      }
      out[i] = c >= 2 ? 1 : 0;
    }
    return { T: Float64Array.from(T), v: out };
  }
  /** the per-track drum runs (digest(), after beatPulse) */
  function drumsDigest(A, d) {
    A.drS = A.drE = A.drF = null;
    if (A.n < 16) return;                           // a degenerate analysis: unknown, the beat stays (drumsAt -> 1)
    const n = A.n, segs = d.segments, dur = num(d.track && d.track.duration, 0) * 1000 || (A.start[n - 1] + A.dur[n - 1]) * 1000;
    const N = Math.max(1, Math.ceil(dur / DRUM_HOP)), st = new Float64Array(n), du = new Float64Array(n);
    for (let i = 0; i < n; i++) { st[i] = A.start[i] * 1000; du[i] = A.dur[i] * 1000; }
    const beatLen = drLenAt(A.beatT, 60000 / Math.max(60, A.tempo || 120));
    const mk = drWin(A.mHitT, A.mHitS, N, 2000), mk5 = drWin(A.mHitT, Float64Array.from(A.mHitS, (x) => (x >= 0.5 ? 1 : 0)), N, 2000);
    const seg1 = drWin(st, null, N, 1000);
    const pk = drPeriodic(st, (i) => A.kick[i] >= 0.3, beatLen), p6 = drPeriodic(st, (i) => A.att[i] >= 6, beatLen);
    const perK = drWin(pk.T, pk.v, N, 2000), per6 = drWin(p6.T, p6.v, N, 2000);
    const att6 = drWin(st, Float64Array.from(A.att, (x) => (x >= 6 ? 1 : 0)), N, 2000);
    const lmtW = drWin(st, Float64Array.from(st, (_, i) => Math.min(A.lmt[i] * 1000, 200) * du[i]), N, 1000), duW = drWin(st, du, N, 1000);
    // the sub / bass band rows (EL_BAND, as elDigest2), power-mean over +-1 s against the track's p95
    const LV = [new Float64Array(n), new Float64Array(n)], X = new Float64Array(17);
    for (let i = 0; i < n; i++) {
      const sg = segs[i] || {}, tv = Array.isArray(sg.timbre) ? sg.timbre : [];
      const dms = num(sg.duration, 0) * 1000, lm = num(sg.loudness_max, -60), l0 = num(sg.loudness_start, -60), d1 = Math.max(dms, 1);
      for (let j = 0; j < 12; j++) X[j] = num(tv[j], 0);
      X[12] = lm; X[13] = l0; X[14] = Math.max(0, lm - l0); X[15] = Math.log(d1); X[16] = clamp(num(sg.loudness_max_time, 0) * 1000 / d1, 0, 1);
      ["sub", "bass"].forEach((b, k) => {
        const w = EL_BAND.W[b];
        let s = w[0];
        for (let j = 0; j < 17; j++) s += w[j + 1] * (X[j] - EL_BAND.mu[j]) / EL_BAND.sd[j];
        LV[k][i] = X[12] + s;
      });
    }
    const lv = LV.map((L) => {
      const p95 = elPct(L, 0.95), pw = drWin(st, Float64Array.from(L, (x, i) => Math.pow(10, (x - p95) / 10) * du[i]), N, 1000);
      return Float64Array.from(pw, (x, i) => 10 * Math.log10(x / Math.max(1, duW[i]) + 1e-6));
    });
    const B = A.beatT, nb = B ? B.length : 0, bF = new Float64Array(N);
    for (let i = 0, j = 0; i < N; i++) {             // the kick-run share of the first beat at or after t
      while (j < nb && B[j] < i * DRUM_HOP) j++;
      bF[i] = nb && A.bF ? A.bF[Math.min(nb - 1, j)] : 0;
    }
    const lmtF = Float64Array.from(lmtW, (x, i) => x / (duW[i] + 1e-6));
    const C = { mk2000: [mk, 1 / 4], mk5_2000: [mk5, 1 / 4], segRate: [seg1, 1 / 2], perK_2000: [perK, 1 / 4], bF: [bF, 1], att6_2000: [att6, 1 / 4],
      per6_2000: [per6, 1 / 4], lmt: [lmtF, 1], lv_sub: [lv[0], 1], lv_bass: [lv[1], 1] };
    const z = new Float64Array(N).fill(DRUM_MODEL.b);
    for (let k = 0; k < DRUM_MODEL.names.length; k++) {
      const [col, sc] = C[DRUM_MODEL.names[k]], c = DRUM_MODEL.w[k] / DRUM_MODEL.sd[k], m = DRUM_MODEL.mu[k];
      for (let i = 0; i < N; i++) z[i] += c * (col[i] * sc - m);
    }
    for (let i = 0; i < N; i++) z[i] = 1 / (1 + Math.exp(-z[i]));
    const p = z, on = new Uint8Array(N), barLen = drLenAt(elStarts(d.bars), 4 * 60000 / Math.max(60, A.tempo || 120));
    for (let i = 0, s = 0; i < N; i++) { s = p[i] >= (s ? DRUM_OFF : DRUM_ON) ? 1 : 0; on[i] = s; }
    const runs = (v) => { const r = []; for (let i = 0; i < N; ) { if (on[i] === v) { let j = i; while (j < N && on[j] === v) j++; r.push([i, j]); i = j; } else i++; } return r; };
    for (const [a, b] of runs(0)) if (a > 0 && b < N && (b - a) * DRUM_HOP < DRUM_OFF_MIN * barLen(a * DRUM_HOP)) on.fill(1, a, b);
    for (const [a, b] of runs(1)) if ((b - a) * DRUM_HOP < DRUM_ON_MIN * barLen(a * DRUM_HOP)) on.fill(0, a, b);
    const S = [], E = [], FL = [], H = [];
    for (let i = 0; i < A.mHitT.length; i++) if (A.mHitS[i] >= DRUM_HIT_MIN) H.push(A.mHitT[i]);
    // a run may also START on a strong "Automático" beat onset (a drop whose first kicks the bass model misses)
    const H0 = H.slice();
    if (A.bAuto) for (let j = 0; j < A.bAuto.length; j++) if (A.bAuto[j] >= DRUM_GRID_START) H0.push(A.bOn[j]);
    H0.sort((x, y) => x - y);
    for (const [a, b] of runs(1)) {
      const t0 = a * DRUM_HOP, t1 = (b - 1) * DRUM_HOP + DRUM_HOP, B0 = barLen(t0), B1 = barLen((b - 1) * DRUM_HOP);
      let k = elLB(H0, t0 - DRUM_LEAD_BARS * B0);
      const s = (k < H0.length && H0[k] <= t0 + 0.5 * B0 ? H0[k] : t0) - DRUM_LEAD_MS;
      k = lastAtOrBefore(H, t1 + DRUM_END_BARS * B1);
      const e = k >= 0 && H[k] >= t1 - B1 ? H[k] : t1;
      S.push(s); E.push(e); FL.push(DRUM_FADE_BARS * B1);
    }
    A.drS = Float64Array.from(S); A.drE = Float64Array.from(E); A.drF = Float64Array.from(FL);
  }
  /** 0..1: drums present at analysis time t (ms) */
  function drumsAt(A, t) {
    if (!A || !A.drS) return 1;
    const k = lastAtOrBefore(A.drS, t);
    if (k < 0) return 0;
    if (t <= A.drE[k]) return 1;
    const x = (t - A.drE[k]) / A.drF[k];
    return x >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * x);
  }
  /** no analysis: no procedural beat. v6-r2 removed it while the analysis is on its way; v6-r3: also for a failed analysis,
      a local file or an ad (its 120 BPM grid has nothing to do with the song: it pulsed over voice-only parts, and the
      "no segments" retry 4 s after a failure cut it off in one frame). Only nothing playing (the panel's demo preview)
      or a test fallback keeps it; the rest of the visual still breathes (slow energy / colour, the layers' levels) */
  const drumsFallback = (item) => {
    if (!item) return 1;
    const uri = String(item.uri || "");
    if (/^spotify:(episode|show|audiobook|chapter):/.test(uri)) return 0;
    const e = cache.get(uri);
    return e && e.st === "ok" ? 1 : 0;
  };
  /** final-build: 1 when the music playing gets the "modo ambiente suave": no usable analysis (failed, a local file, an ad,
      a podcast, or a request still pending after SOFT_PEND_MS / a retry); 0 for nothing playing (the panel's demo keeps its
      procedural beat), a test fallback, or a fresh track change whose analysis is on its way */
  function softTarget(item) {
    if (!item || (S.test && S.test.fallback)) return 0;
    const uri = String(item.uri || "");
    if (/^spotify:(episode|show|audiobook|chapter):/.test(uri)) return 1;
    const e = cache.get(uri);
    if (!e || e.st === "ok") return 0;
    if (e.st === "pending") return (e.tries | 0) > 0 || now() - e.at > SOFT_PEND_MS ? 1 : 0;
    return 1;
  }
  /** final-fix: the soft mode's note for the item now ("" = none yet). A local file / an ad / a podcast: at once; a failed
      request: only once a retry has failed too (tries >= 1: Spotify's passing empty answers, ~1 in 15 track changes, come
      back on the 4 s retry; final-build showed the note on them for 6.5 s); a pending request: nothing is known yet. A login /
      network / server failure does not say the track has no analysis */
  function softNoteText(item) {
    if (!item) return "";
    const uri = String(item.uri || "");
    if (/^spotify:(episode|show|audiobook|chapter):/.test(uri)) return tr(SOFT_NOTE);
    const e = cache.get(uri);
    if (!e) return "";
    if (e.st === "none") return tr(SOFT_NOTE);
    if (e.st !== "fail" || (e.tries | 0) < 1) return "";
    return e.kind === "missing" || e.kind === "empty" || !e.kind ? tr(SOFT_NOTE) : tr(SOFT_NOTE_NA);
  }
  /** smooth noise in -1..1: three incommensurate sines (a, b, c in Hz) */
  const softN = (t, a, b, c, p) => 0.5 * Math.sin(TAU * a * t + p) + 0.3 * Math.sin(TAU * b * t + 1.7 * p + 0.9) + 0.2 * Math.sin(TAU * c * t + 2.3 * p + 2.1);
  /** final-build: the soft mode's slow drives at its own clock Z.sT (ms): energy / body / brightness; the chroma (two bumps
      that turn slowly round the 12 classes, so the crown's shape flows from the top to the bottom and the bars' texture
      drifts); the layers (low / mid / air); the halo colour (within the chosen two colours); the glint's angle; the crown's
      own sway; the camera's breath. Everything under 0.4 Hz and unrelated to any beat grid */
  function softGen(Z) {
    const g = Z.sg || (Z.sg = { P12: new Float32Array(12) }), t = num(Z.sT, 0) / 1000, tf = t * SOFT_FS;
    g.energy = SOFT_EN[0] + SOFT_EN[1] * softN(tf, 0.07, 0.17, 0.31, 0.3);
    g.body = 0.45 + 0.1 * softN(tf, 0.05, 0.12, 0.19, 1.1);
    g.bright = 0.5 + 0.25 * softN(t, 0.03, 0.07, 0.13, 2.0);
    const f1 = TAU * SOFT_PR * t, f2 = TAU * 1.6 * SOFT_PR * t + 1.3;
    for (let j = 0; j < 12; j++) g.P12[j] = clamp(0.5 + 0.32 * Math.cos((TAU * j) / 12 - f1) + 0.18 * Math.cos((2 * TAU * j) / 12 + f2), 0, 1);
    g.nLow = softN(tf, 0.09, 0.21, 0.37, 0.7); g.nMid = softN(tf, 0.11, 0.24, 0.43, 1.9); g.nAir = softN(tf, 0.13, 0.29, 0.49, 2.8);
    g.low = SOFT_LOW[0] + SOFT_LOW[1] * g.nLow;
    g.mid = SOFT_MID[0] + SOFT_MID[1] * g.nMid;
    g.air = SOFT_AIR[0] + SOFT_AIR[1] * g.nAir;
    g.harm = 0.5 - 0.5 * Math.cos(TAU * 0.018 * t + 0.8);
    g.gAng = -Math.PI / 2 + TAU * 0.025 * t;
    g.sway = softN(t, 0.022, 0.05, 0.09, 0.4);
    g.cam = 0.5 + 0.5 * softN(t, 0.03, 0.07, 0.11, 1.4);
    return g;
  }
  /** v5 "Balanço no ritmo": where the beat grid is at analysis time pA (ms). With beats[] (2 or more): the phase
      inside the current beat, (t - beat_i) / (beat_i+1 - beat_i), so tempo changes are followed; before the first /
      after the last beat the nearest interval goes on. Without beats: a steady grid at the tempo (bpm; the procedural
      fallback's own grid, so the groove and its kicks agree). The grid is shifted to where a hit on the beat PEAKS:
      the beat's sound starts A.beatLead before Spotify's beat time and peaks GROOVE_PEAK_LAG_MS later. Fills o:
      pos (beats, continuous), ph (0..1 inside the beat), ms (beat length), acc0 / acc1 (1, or 1 + GROOVE_DOWN when the
      current / next beat is a downbeat). */
  function grooveAt(A, pA, bpm, o) {
    const B = A && (A.kT || A.beatT), nb = B ? B.length : 0;   // v5b: the kick clock (beats, or their midpoints)
    let x, per;
    if (nb >= 2) {
      const t = pA + num(A.beatLead, 35) - GROOVE_PEAK_LAG_MS;   // in Spotify's beat time
      const j = lastAtOrBefore(B, t);
      if (j < 0) { per = Math.max(1, B[1] - B[0]); x = (t - B[0]) / per; }
      else if (j >= nb - 1) { per = Math.max(1, B[nb - 1] - B[nb - 2]); x = nb - 1 + (t - B[nb - 1]) / per; }
      else { per = Math.max(1, B[j + 1] - B[j]); x = j + (t - B[j]) / per; }
      const n = Math.floor(x), D = A.beatDown;
      o.acc0 = n >= 0 && n < nb && D[n] ? 1 + GROOVE_DOWN : 1;
      o.acc1 = n + 1 >= 0 && n + 1 < nb && D[n + 1] ? 1 + GROOVE_DOWN : 1;
    } else {
      per = 60000 / clamp(bpm > 0 ? bpm : FALLBACK_BPM, 40, 240);
      x = (pA - GROOVE_PEAK_LAG_MS) / per;
      const n = Math.floor(x), m = ((n % 4) + 4) % 4;           // beat 1 of every 4 (the fallback's accent)
      o.acc0 = m === 0 ? 1 + GROOVE_DOWN : 1;
      o.acc1 = m === 3 ? 1 + GROOVE_DOWN : 1;
    }
    o.pos = x;
    o.ph = x - Math.floor(x);
    o.ms = per;
    return o;
  }
  /** the groove pulse at phase ph (0..1 inside a beat): 1 on the beat, a cosine fall to 0 over the first
      1 - GROOVE_RISE of the beat, then a cosine rise into the next beat (continuous, with a continuous slope) */
  function groovePulse(ph) {
    const f = 1 - GROOVE_RISE, u = ph < f ? (0.5 * ph) / f : 0.5 + (0.5 * (ph - f)) / GROOVE_RISE;
    return 0.5 + 0.5 * Math.cos(TAU * u);
  }
  /** "Ritmo do visual" setting -> the hit list the renderers use */
  function rhythmMode() { return CFG.rhythm === "beat" || CFG.rhythm === "bass" ? CFG.rhythm : "auto"; }
  /** the hit list for a rhythm mode: "bass" = the model's hits; "beat" = a hit
      on every beat (+ the model's on-beat hits, off-beat ones much softer);
      "auto" = the model's hits plus the beat hits weighted by A.four x
      steadiness, the model's off-beat hits (a rolling trance bass) softened by
      the same weight. Close hits (< 95 ms) merge. Each hit decays with its
      own time constant (never more than half the gap to the next real hit). */
  function buildHits(A, mode) {
    if (A.hitMode === mode) return;
    A.hitMode = mode;
    const ev = [];                                  // [onset, strength, attack]
    const B = A.kT || A.beatT, nb = B ? B.length : 0;   // v5b: the kick clock
    const nearBeat = (t) => {                       // index of the beat this onset belongs to (-1: off-beat)
      const j = nearestIdx(B, t + A.beatLead);
      return j >= 0 && Math.abs(B[j] - (t + A.beatLead)) <= 55 ? j : -1;
    };
    const dr = (t) => drumsAt(A, t);               // v6: drums present
    for (let i = 0; i < A.mHitT.length; i++) {
      let s = A.mHitS[i] >= DRUM_SOLO ? A.mHitS[i] : A.mHitS[i] * dr(A.mHitT[i]);
      if (mode !== "bass" && nb) {
        const j = nearBeat(A.mHitT[i]);
        if (j < 0) {
          const k = nearestIdx(B, A.mHitT[i]);
          const w = mode === "beat" ? 1 : A.four * (k >= 0 ? A.bSteady[k] : 0);
          s *= 1 - 0.6 * w;
        }
      }
      if (s > 0.06) ev.push([A.mHitT[i], s, A.mHitA[i], 0, 1]);
    }
    if (mode !== "bass") {
      const src = mode === "beat" ? A.bForce : A.bAuto;
      for (let j = 0; j < nb; j++) { const v = src[j] * dr(A.bOn[j]); if (v > 0.06) ev.push([A.bOn[j], v, A.bAtt[j], 1, mode === "auto" && A.bVis ? A.bVis[j] : 1]); }
      if (mode === "auto" && A.oS) for (let j = 0; j < nb; j++) { const k = A.oS[j] > 0 ? dr(A.oOn[j]) : 0; if (k > 0) ev.push([A.oOn[j], A.four * A.oS[j] * k, A.oAtt[j], 2, OFF_VIS]); }   // r2: off-beat bass
    }
    ev.sort((a, b) => a[0] - b[0]);
    // hg: 1 = the hit's strength comes from the beat grid (v5b-r2), 2 = from an off-beat tick (r3); hm (r3): the largest
    // bass-MODEL strength merged into the hit (r2 kept only the winner's source: on four-on-the-floor tracks the grid's
    // 0.92-0.96 usually beat the model's 0.6-0.9 on the same kick, so a real kick counted as a grid hit and the breakdown
    // calm shrank it, a sawtooth on steady kicks); hv: the winner's visual size (OFF_VIS / SOFT_VIS / 1)
    const ht = [], hs = [], ha = [], hg = [], hm = [], hv = [];
    for (const [t, s, a, g, vk] of ev) {
      const last = ht.length - 1;
      if (last >= 0 && t - ht[last] < HIT_MERGE_MS) {
        if (s > hs[last]) { ht[last] = t; ha[last] = a; hg[last] = g; hv[last] = vk; }
        hs[last] = Math.max(hs[last], s);
        if (!g) hm[last] = Math.max(hm[last], s);
      } else { ht.push(t); hs.push(s); ha.push(a); hg.push(g); hm.push(g ? 0 : s); hv.push(vk); }
    }
    for (let i = 0; i < hv.length; i++) if (hm[i] >= HIT_REAL) hv[i] = 1;   // a real bass-model kick lands in full
    A.hitG = Uint8Array.from(hg); A.hitM = Float32Array.from(hm); A.hitVK = Float32Array.from(hv);
    finishHits(A, ht, hs, ha);                      // look-ahead decays, density scale, retrigger starts
  }

  /** per-hit arrays from the hit list (onset ms, strength, attack ms). LOOK-AHEAD: the analysis knows every
      upcoming hit, so each hit's decay time constant is solved so that, one frame (VALLEY_LEAD_MS) before the
      next hit that counts, it has fallen to <= VALLEY_REL of its own peak and <= VALLEY_NEXT of the next peak:
      dense 808 runs drop to a clear valley between hits instead of merging; isolated hits keep (up to 1.3 x)
      the musical decay (x SPARSE_DECAY_MUL for the renderers; hitDC = the camera / glow decay, capped at the
      plain musical decay like v3). hitDF: the same for the focus pull (shallower valley); hitZ: per-hit amplitude scale
      for zoom / glow / cover (DENSE_MIN_SCALE at <= 110 ms gaps -> 1 at >= 320 ms); hitV0: where the previous
      hits have decayed to when this one starts (the new hit rises from there: no max-merge plateau). */
  function finishHits(A, ht, hs, ha) {
    const N = ht.length;
    A.hitT = Float64Array.from(ht); A.hitS = Float32Array.from(hs); A.hitA = Float32Array.from(ha);
    A.hitD = new Float32Array(N); A.hitDC = new Float32Array(N); A.hitDF = new Float32Array(N); A.hitZ = new Float32Array(N); A.hitV0 = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let j = i + 1;
      while (j < N && hs[j] < Math.max(NEXT_MIN, NEXT_REL * hs[i])) j++;   // tiny followers do not cut a big hit short
      const room = (j < N ? ht[j] - ht[i] : 1e9) - ha[i] - PEAK_HOLD_MS - VALLEY_LEAD_MS;
      const target = Math.min(VALLEY_REL * hs[i], VALLEY_NEXT * (j < N ? hs[j] : 1));
      A.hitD[i] = clamp(room > 0 ? room / Math.log(hs[i] / Math.max(1e-3, target)) : DECAY_MIN_MS, DECAY_MIN_MS, A.decay * SPARSE_DECAY_MUL);
      A.hitDC[i] = Math.min(A.hitD[i], A.decay);
      A.hitDF[i] = clamp(room > 0 ? room / Math.log(1 / FOCUS_VALLEY) : DECAY_MIN_MS, DECAY_MIN_MS, FOCUS_DECAY_MS);
      const gap = Math.min(i ? ht[i] - ht[i - 1] : 1e9, i + 1 < N ? ht[i + 1] - ht[i] : 1e9);
      A.hitZ[i] = DENSE_MIN_SCALE + (1 - DENSE_MIN_SCALE) * n01(gap, DENSE_MIN_MS, DENSE_FULL_MS);
    }
    const o = { v: 0, pk: 0, sh: 0, z: 1, f: 0, c: 0 };
    for (let i = 1; i < N; i++) A.hitV0[i] = Math.min(hs[i], kickAt(A, ht[i] - 1e-3, o, i - 1).v);
    return A;
  }
  /** normalised hit shape (peak 1, d = ms since the onset): rises from v0 (0..1) to the peak in `attack`,
      holds one frame, then decays exponentially */
  function hitShape(d, attack, decay, v0) {
    if (d < 0) return 0;
    if (d < attack) { const x = 1 - d / attack; return v0 + (1 - v0) * (1 - x * x); }
    d -= attack + PEAK_HOLD_MS;
    return d <= 0 ? 1 : Math.exp(-d / decay);
  }
  /** bass-hit state at ms: the dominant of the last 3 hits (largest strength x shape). o.v = value (= o.pk x o.sh),
      o.pk = its strength, o.sh = its shape 0..1, o.z = its density scale, o.f = its focus shape, o.c = its camera shape.
      upto: only hits with index <= upto (finishHits chains the retrigger start values with it) */
  function kickAt(A, ms, o, upto) {
    o.v = 0; o.pk = 0; o.sh = 0; o.z = 1; o.f = 0; o.c = 0; o.t = -1; o.g = 0; o.m = 0; o.vk = 1;
    const T = A.hitT, HG = A.hitG, HM = A.hitM, HV = A.hitVK;
    if (!T || !T.length) return o;
    let k = lastAtOrBefore(T, ms);
    if (upto != null && k > upto) k = upto;
    for (let j = k; j >= 0 && j >= k - 2; j--) {
      const s = A.hitS[j], v0 = s > 0 ? A.hitV0[j] / s : 0, d = ms - T[j];
      const e = hitShape(d, A.hitA[j], A.hitD[j], v0);
      if (e * s > o.v) { o.v = e * s; o.pk = s; o.sh = e; o.z = A.hitZ[j]; o.f = hitShape(d, A.hitA[j], A.hitDF[j], v0); o.c = hitShape(d, A.hitA[j], A.hitDC[j], v0); o.t = T[j]; o.g = HG ? HG[j] : 0; o.m = HM ? HM[j] : 0; o.vk = HV ? HV[j] : 1; }
    }
    return o;
  }

  /** last segment starting at or before t (-1 before the first one) */
  function segIndex(A, t) {
    const i = A.seg;
    if (i < A.n && A.start[i] <= t && (i + 1 >= A.n || A.start[i + 1] > t)) return i;
    if (i + 1 < A.n && A.start[i + 1] <= t && (i + 2 >= A.n || A.start[i + 2] > t)) return (A.seg = i + 1);
    if (t < A.start[0]) { A.seg = 0; return -1; }
    let lo = 0, hi = A.n - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (A.start[m] <= t) lo = m; else hi = m - 1;
    }
    return (A.seg = lo);
  }

  /** loudness (dB) at t: loudness_start -> loudness_max (at loudness_max_time)
      -> the next segment's loudness_start */
  function dbAt(A, t) {
    const i = segIndex(A, t);
    if (i < 0) return A.lo;
    const s0 = A.start[i], tm = s0 + A.lmt[i];
    if (t < tm) return lerp(A.l0[i], A.lmax[i], (t - s0) / Math.max(0.001, A.lmt[i]));
    const end = i + 1 < A.n ? A.start[i + 1] : s0 + A.dur[i];
    const next = i + 1 < A.n ? A.l0[i + 1] : A.lo;
    if (t >= end) return next;
    return lerp(A.lmax[i], next, (t - tm) / Math.max(0.001, end - tm));
  }
  function norm01(A, db) { return clamp((db - A.lo) / (A.hi - A.lo), 0, 1); }

  /** pitches at t, cross-faded over the first 60 ms of each segment;
      returns the segment brightness (timbre[1]) normalised to 0..1 */
  function pitchesAt(A, t, out) {
    const i = Math.max(0, segIndex(A, t));
    const f = i > 0 ? clamp((t - A.start[i]) / 0.06, 0, 1) : 1;
    const k = smooth(f), o = i * 12, p = (i - 1) * 12;
    for (let j = 0; j < 12; j++) out[j] = i > 0 ? lerp(A.pit[p + j], A.pit[o + j], k) : A.pit[o + j];
    return clamp((A.bri[i] - A.briLo) / (A.briHi - A.briLo), 0, 1);
  }

  function lastAtOrBefore(times, ms) {
    let lo = 0, hi = times.length - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (times[m] <= ms) { k = m; lo = m + 1; } else hi = m - 1; }
    return k;
  }
  /** d = ms since the onset: nothing before it, an ease-out rise to the peak
      (most of it in the first frame), a one-frame hold, then exponential decay */
  function hitEnv(d, attack, decay) {
    if (d < 0) return 0;
    if (d < attack) { const x = 1 - d / attack; return 1 - x * x; }
    d -= attack + PEAK_HOLD_MS;
    return d <= 0 ? 1 : Math.exp(-d / decay);
  }
  /** max of the envelopes of the hits that started at or before ms;
      attack and decay are numbers or per-hit arrays */
  function envAt(times, strengths, ms, attack, decay) {
    if (!times || !times.length) return 0;
    const k = lastAtOrBefore(times, ms), pa = typeof attack !== "number", pd = typeof decay !== "number";
    let v = 0;
    for (let j = k; j >= 0 && j >= k - 3; j--) v = Math.max(v, hitEnv(ms - times[j], pa ? attack[j] : attack, pd ? decay[j] : decay) * strengths[j]);
    return v;
  }

  /** index of the nearest time in a sorted array (-1 if empty) */
  function nearestIdx(times, ms) {
    if (!times || !times.length) return -1;
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < ms) lo = m + 1; else hi = m; }
    if (lo > 0 && Math.abs(times[lo - 1] - ms) < Math.abs(times[lo] - ms)) lo--;
    return lo;
  }
  const median = (a) => {
    if (!a.length) return NaN;
    const s = Array.from(a).sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

