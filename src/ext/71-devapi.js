
  // ---- dev build only: test, trace and measuring hooks (not in the release file) -------------------------------
  function startTrace(ms, every) {
    if (S.trace) finishTrace();
    return new Promise((resolve) => {
      const t = now();
      S.trace = { until: t + (ms || 8000), every: every || 50, next: t, samples: [], resolve, timer: 0 };
      setTimeout(() => { if (S.trace && S.trace.resolve === resolve) finishTrace(); }, (ms || 8000) + 3000);
      if (!S.raf) {                    // window hidden / loop not running: sample with a timer
        S.trace.timer = setInterval(() => {
          const tt = now();
          if (tt - S.clock.syncedAt > 250) syncClock(false);
          build();
          renderMain(mainPosition(tt), every || 50, tt);
        }, every || 50);
      }
    });
  }

  function perfStats() {
    const P = S.perf, n = P.n;
    if (!n) return { frames: 0 };
    const cost = Array.from(P.cost.slice(0, n)).sort((a, b) => a - b);
    const gaps = Array.from(P.gap.slice(0, n)).filter((g) => g > 0).sort((a, b) => a - b);
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
    return {
      frames: n,
      jsAvgMs: +avg(cost).toFixed(3), jsP95Ms: +pct(cost, 0.95).toFixed(3), jsMaxMs: +cost[cost.length - 1].toFixed(3),
      frameAvgMs: +avg(gaps).toFixed(2), frameP95Ms: +pct(gaps, 0.95).toFixed(2), frameMaxMs: gaps.length ? +gaps[gaps.length - 1].toFixed(2) : 0,
    };
  }

  /** render a few frames ending at playback position ms (window hidden: no rAF) */
  function renderAt(ms, opts) {
    opts = opts || {};
    build();
    resizeMain();
    const saved = S.clock.playing, k = Math.max(1, opts.frames || 30);
    if (opts.playing !== undefined) { S.clock.playing = !!opts.playing; SIG.main.gate = S.clock.playing ? 1 : 0; }
    const t = now();
    for (let i = k - 1; i >= 0; i--) {
      S.sampleNext = i === 0;
      renderMain(ms - i * 16.667, 16.667, t - i * 16.667);
    }
    S.sampleNext = false;
    S.clock.playing = saved;
    return S.lastSample;
  }

  Object.assign(API, {
    __dev: true,
    IDLE_MS,
    reset() {                          // everything back to default (a stored picture stays stored)
      applySettings(Object.assign(clone(DEFAULTS), { wallpaper: Object.assign(clone(DEFAULTS.wallpaper), { file: CFG.wallpaper.file }) }), true);
      return clone(CFG);
    },
    /** colours + wallpaper as applied: settings, the pair, the CSS variables, the picture source */
    look() {
      return {
        colors: clone(CFG.colors), wallpaper: clone(CFG.wallpaper), pair: lookPair(), vars: Object.assign({}, LOOK.vars),
        wall: { kind: WP.kind, type: WP.type, url: String(WP.url).slice(0, 96), note: WP.note, fileUrl: !!WP.fileUrl, overlay: S.wall, bootAttr: document.documentElement.getAttribute("data-nd-wall") },
        palVer: PAL ? PAL.ver : 0,
      };
    },
    setTab(id) { buildPanel(); setTab(id, false); return S.tab; },
    _palette(h1, h2) { return makePalette(h1, h2).vars; },
    _extract() { return wallPixels().then(extractPair); },
    _wallRecord() {
      return idbGet(IDB_WALL_KEY).then((r) => (r ? { name: r.name, type: r.type, w: r.w, h: r.h, size: r.size, at: r.at, blobSize: r.blob && r.blob.size, blobType: r.blob && r.blob.type } : null));
    },
    _importWall: importWallFile,       // (File) - the same path as the file input
    setIdleMs(ms) {
      S.idleOverride = ms == null ? 0 : Math.max(1000, Number(ms) || IDLE_MS);
      S.lastActivity = now();
      return idleMs();
    },
    // test hooks
    _renderAt: renderAt,
    _simulate(fromMs, durMs, everyMs) { // synchronous 60 fps trace with a simulated playing clock
      build();
      resizeMain();
      const saved = S.clock.playing, out = [], every = everyMs || 50;
      S.clock.playing = true;
      SIG.main.gate = 1;
      const t = now();
      let next = fromMs;
      for (let p = fromMs - 600; p <= fromMs + (durMs || 8000); p += 16.667) {
        S.sampleNext = p >= next;
        renderMain(p, 16.667, t + (p - fromMs));
        if (S.sampleNext) { out.push(S.lastSample); next += every; }
      }
      S.sampleNext = false;
      S.clock.playing = saved;
      return out;
    },
    _step() {                          // one live frame driven from outside (rAF paused while hidden)
      build();
      resizeMain();
      const t1 = now();
      const from = S.lastStep && t1 - S.lastStep < 500 ? S.lastStep : t1 - 16.7;
      if (t1 - S.clock.syncedAt > 250) syncClock(false);
      const steps = Math.min(12, Math.max(1, Math.round((t1 - from) / 16.7)));
      const dt = (t1 - from) / steps;
      const c0 = now();
      for (let i = steps - 1; i >= 0; i--) {
        S.sampleNext = i === 0;
        renderMain(mainPosition(t1 - i * dt), dt, t1 - i * dt);
      }
      S.sampleNext = false;
      S.lastStep = t1;
      const out = S.lastSample;
      out.costMs = +((now() - c0) / steps).toFixed(3);
      out.phase = S.phase;
      return out;
    },
    _stepPreview(frames) {             // render the panel preview by hand (window hidden)
      const k = Math.max(1, frames || 1), t = now();
      for (let i = k - 1; i >= 0; i--) renderPreview(16.667, t - i * 16.667);
      return { previewFrames: S.stats.previewFrames };
    },
    _bench(frames, style) {            // JS cost of signal + update + draw, synchronous
      build();
      const saved = CFG.style;
      if (style && IMPL[style]) CFG.style = style;
      setRootStyle();
      resizeMain();
      const k = Math.max(1, frames || 300), costs = [];
      const t = now(), p0 = mainPosition(t);
      for (let i = 0; i < k; i++) {
        const c0 = now();
        renderMain(p0 + i * 16.7, 16.7, t + i * 16.7);
        costs.push(now() - c0);
      }
      CFG.style = saved;
      setRootStyle();
      resizeMain();
      costs.sort((a, b) => a - b);
      return { style: style || saved, frames: k, avgMs: +(costs.reduce((s, v) => s + v, 0) / k).toFixed(3), p95Ms: +pct(costs, 0.95).toFixed(3), maxMs: +costs[k - 1].toFixed(3) };
    },
    /** GPU-side proxy while the window is hidden (no rAF): for each sample a
        fresh canvas the size of the overlay canvas draws one full frame of
        the style (effects on, a strong hit) and is read back once (1 px),
        which waits for the GPU to finish it. One readback per canvas, so
        Chromium never moves it to the CPU path. Debug only. */
    _gpuProbe(style, samples) {
      build();
      const st = IMPL[style] ? style : CFG.style, box = vizBox(st), w = box.w, h = box.h;
      const sig = newSig();
      Object.assign(sig, { gate: 1, bass: 0.95, kick: 0.95, kickPk: 0.95, kickSh: 1, kickCam: 1, kickZ: 1, kickId: 1, energy: 0.8, hat: 0.5, bright: 0.5, body: 0.6, mode: "probe" });
      for (let j = 0; j < 12; j++) sig.P12[j] = 0.5 + 0.5 * Math.sin(j * 1.3);
      const fx = { zoom: 1.06, focus: 0.7, glow: 0.95, gk: 0.95, over: 0, glowOn: true };
      const res = [], keep = [cover.img, cover.prev];
      cover.img = cover.prev = null;          // the cover is cross-origin: it would block the readback
      for (let i = 0; i < Math.max(1, samples || 20); i++) {
        const cv = document.createElement("canvas"), v = makeView(cv, "main");
        layoutView(v, st, w, h, box);
        for (let k = 0; k < 8; k++) IMPL[st].update(v, sig, 16.7, CFG.intensity[st] / 100, now() + k * 16.7);
        const c0 = now();
        v.ctx.clearRect(0, 0, v.w, v.h);
        IMPL[st].draw(v, sig, fx);
        v.ctx.getImageData(Math.round(v.w / 2), Math.round(v.h / 2), 1, 1);
        res.push(now() - c0);
        cv.width = cv.height = 0;
      }
      cover.img = keep[0]; cover.prev = keep[1];
      res.sort((a, b) => a - b);
      return { style: st, canvas: w + "x" + h + "@" + Math.min(2, window.devicePixelRatio || 1), samples: res.length, avgMs: +(res.reduce((s, v) => s + v, 0) / res.length).toFixed(3), p50Ms: +pct(res, 0.5).toFixed(3), p95Ms: +pct(res, 0.95).toFixed(3) };
    },
    /** resolves on the first rendered frame with level >= min (or, with
        { below: x }, level <= x and kick < 0.12), then freezes rendering
        until _release() so a screenshot shows exactly that frame */
    _holdWhen(opts, timeoutMs) {
      opts = opts || {};
      const t0 = now();
      return new Promise((resolve) => {
        const info = () => Object.assign({ waitedMs: Math.round(now() - t0) }, S.lastSample || {}, { level: r3(S.level), bass: r3(SIG.main.bass), kick: r3(SIG.main.kick), zoom: +S.lastFx.zoom.toFixed(4), glow: r3(S.lastFx.glow), positionMs: Math.round(mainPosition(now())) });
        S.sampleNext = true;
        S.holdReq = {
          resolve,
          info,
          test() {
            S.sampleNext = true;
            if (now() - t0 > (timeoutMs || 8000)) return true;
            if (opts.below !== undefined) return S.level <= opts.below && SIG.main.kick < 0.12;
            return S.level >= (opts.min || 0.8);
          },
        };
      });
    },
    _release() { S.hold = false; S.holdReq = null; S.sampleNext = false; return true; },
    /** r2: freeze / unfreeze the live loop (then _renderAt draws a chosen moment, for same-hit screenshot series) */
    _hold(on) { S.hold = !!on; S.holdReq = null; return S.hold; },
    /** "Volta" probe: one isolated synthetic hit (strength s, attack 15 ms, decay 150 ms) through a fresh copy of a
        style's renderer at its current settings (or fallMs), 60 fps; returns the centre level's peak and the time
        from the peak until it is <= 10% of the peak (the "fall time"), plus the curve every 50 ms */
    _fallTest(style, fallMs, s) {
      const st = IMPL[style] ? style : CFG.style, k = num(s, 0.8), b = vizBox(st);
      const v = makeView(document.createElement("canvas"), "main");
      layoutView(v, st, b.w, b.h, b);
      const sig = newSig();
      Object.assign(sig, { gate: 1, energy: 0, hat: 0, low: 0, bass: 0, kickPk: k, kickZ: 1, kickCam: 0, kickId: -1 });
      const dt = 1000 / 60, curve = [];
      let pk = 0, pkT = 0, fallT = null;
      for (let t = -200; t < 4000; t += dt) {
        const on = t >= 0;
        sig.kickId = on ? 1 : -1;
        sig.kickSh = on ? hitShape(t, 15, 150, 0) : 0;
        sig.kick = sig.kickPk * sig.kickSh;
        const lv = IMPL[st].update(v, sig, dt, CFG.intensity[st] / 100, 10000 + t, fallMs);
        if (lv > pk) { pk = lv; pkT = t; }
        if (on && fallT == null && t > pkT && lv <= 0.1 * pk) fallT = t - pkT;
        if (on && Math.round(t) % 50 < dt) curve.push([Math.round(t), +lv.toFixed(3)]);
      }
      return { style: st, fallSetting: fallOf(st, fallMs), strength: k, peak: +pk.toFixed(3), peakAtMs: Math.round(pkT), fallTo10Ms: fallT == null ? null : Math.round(fallT), curve };
    },
    /** every blur on the way to the screen: the layout wallpaper layer, the panels' glass, the overlay canvases
        (CSS px) and its CSS fallback layer, as computed now */
    _blurReport() {
      const cs = (n, pseudo) => (n ? getComputedStyle(n, pseudo || null) : null);
      const top = document.querySelector(".Root__top-container");
      const glass = ["#Desktop_LeftSidebar_Id", "#main-view", 'aside[data-testid="now-playing-bar"]'].map((q) => { const c = cs(document.querySelector(q), "::before"); return c ? q + " " + c.backdropFilter : q + " -"; });
      const css = el.root ? cs(el.root.querySelector(".nd-amb__wall-css")) : null;
      return {
        settings: { layoutBlur: CFG.wallpaper.layoutBlur, ambBlur: CFG.wallpaper.ambBlur, coverLayoutBlur: CFG.wallpaper.coverLayoutBlur, coverAmbBlur: CFG.wallpaper.coverAmbBlur, inUse: wallBlur() },
        vars: { ndBlur: cs(document.documentElement).getPropertyValue("--nd-blur").trim(), wallBlur: cs(document.documentElement).getPropertyValue("--nd-wall-blur").trim(), ambWallBlur: cs(document.documentElement).getPropertyValue("--nd-amb-wall-blur").trim() },
        layoutWallFilter: top ? cs(top, "::before").filter : null,
        layoutWallInset: top ? cs(top, "::before").top : null,
        glass,
        overlay: el.wall ? { blurCanvasPx: el.wall.dataset.blur, blurCanvasFilter: el.wall.dataset.filter, blurCanvasSize: el.wall.width + "x" + el.wall.height, focusCanvasPx: el.sharp.dataset.blur, focusCanvasFilter: el.sharp.dataset.filter, focusCanvasSize: el.sharp.width + "x" + el.sharp.height, cssLayerFilter: css && css.filter, wall: S.wall } : null,
        coverPreblur: "none (v4)",
      };
    },
    /** the overlay's geometry for the current style (px): bars half-height, ring r0 / len, wave amplitude unit, box */
    _geo() {
      build();
      resizeMain();
      const G = V.main.g;
      return { style: CFG.style, half: G.half, r0: G.r0, len: G.len, H: G.H, reach: styleReach(CFG.style, G), box: S.vizBox, vh: el.cam.offsetHeight };
    },
    /** the panel preview's current geometry (the "Alcance" it draws with) */
    _previewGeo() {
      const v = V.preview, G = v && v.g;
      if (!G) return null;
      return { style: v.style, alc: v.alc, half: G.half != null ? +G.half.toFixed(1) : undefined, len: G.len != null ? +G.len.toFixed(1) : undefined, H: G.H != null ? +G.H.toFixed(1) : undefined, h: v.h };
    },
    /** biggest extents of the frame on screen: the visualizer's tip above / below the centre (px, zoom included),
        the camera zoom and the title gap */
    _extent() {
      const G = V.main && V.main.g, z = S.lastFx.zoom;
      if (!G) return null;
      let up;
      if (CFG.style === "ring") { let hm = 0; for (let m = 0; m < G.m; m++) hm = Math.max(hm, G.hgt[m]); up = G.r0 * G.kick + 2 + hm * G.len; }
      else if (CFG.style === "bars") { let hm = 0; for (let i = 0; i < G.n; i++) hm = Math.max(hm, G.hgt[i]); up = hm * G.half; }
      else { let y = 0; for (const ys of G.y) for (let i = 0; i < ys.length; i++) y = Math.max(y, Math.abs(ys[i] - G.cy)); up = y; }
      const H = el.cam.offsetHeight, zv = vizZoom(z) * (S.lastFx.gs || 1);    // the visualizer's own scale (zoom share x groove)
      return { style: CFG.style, zoom: +z.toFixed(4), vizZoom: +zv.toFixed(4), tipPx: +(up * zv).toFixed(1), tipShareOfHeight: +((up * zv) / H).toFixed(3), level: r3(S.level), glow: r3(S.lastFx.glow), over: r3(S.lastFx.over || 0), box: S.vizBox, metaClear: S.metaClear };
    },
    _analysis(fromMs, toMs) {          // summary of the cached analysis (no network), optional window
      const item = currentItem(), A = analysisFor(item && item.uri);
      if (!A) return null;
      const lo = fromMs == null ? -Infinity : fromMs, hi = toMs == null ? Infinity : toMs;
      const pick = (times, vals) => {
        const r = [];
        for (let i = 0; i < times.length; i++) if (times[i] >= lo && times[i] <= hi) r.push(vals ? [Math.round(times[i]), +vals[i].toFixed(2)] : Math.round(times[i]));
        return r;
      };
      return {
        uri: item.uri, segments: A.n, beats: A.beatT.length, hits: A.hitT.length, hats: A.hatT.length, tempo: A.tempo, decayMs: +A.decay.toFixed(0),
        loudLo: +A.lo.toFixed(2), loudHi: +A.hi.toFixed(2), latencyMs: S.latDev, effectiveLatencyMs: +num(S.latEff, 0).toFixed(1),
        beats_: pick(A.beatT, A.beatC), bassHits: pick(A.hitT, A.hitS), bassHitAttackMs: pick(A.hitT, A.hitA),
        beatOnsets: pick(A.bOn, A.bAuto), modelHits: pick(A.mHitT, A.mHitS), four: A.four, beatLeadMs: Math.round(A.beatLead), rhythm: rhythmMode(),
        kickClockShifted: A.kShift ? +(A.kShift.reduce((x, y) => x + y, 0) / Math.max(1, A.kShift.length)).toFixed(3) : 0,   // v5b: share of beats on the midpoints
        drumRuns: A.drS ? Array.from(A.drS, (s, k) => [Math.round(s), Math.round(A.drE[k]), Math.round(A.drF[k])]) : null,   // v6: drums present
      };
    },
    // sync / calibration hooks
    _device(force) { const d = outputDevice(!!force); return Object.assign({ latencyMs: latencyFor(d), defaultMs: deviceDefault(d) }, d); },
    /** v5 signal bus: the main view's named channels now (SIGNAL_CHANNELS; P12 as an array) + the groove effect */
    _channels(which) {
      const Z = SIG[which === "preview" ? "preview" : "main"], o = {};
      for (const k of Object.keys(SIGNAL_CHANNELS)) o[k] = k === "P12" ? Array.from(Z.P12, r3) : k === "ext" ? clone(Z.ext || {}) : typeof Z[k] === "number" ? r3(Z[k]) : Z[k];
      const fx = S.lastFx || {};
      return { channels: o, fx: { groove: fx.groove, gs: fx.gs, gb: fx.gb, sway: fx.sway, zoom: fx.zoom, glow: fx.glow, over: fx.over }, taps: SIGNAL_TAPS.map((t) => t.id), layers: LAYERS.map((l) => l.id) };
    },
    /** v5b "Camadas por elemento": the amounts, the view's channels now (Z.ext.el) and the track's digest summary */
    _el(which) {
      const Z = SIG[which === "preview" ? "preview" : "main"], E = Z.ext && Z.ext.el, A = analysisFor(currentItem() && currentItem().uri), d = A && A.el;
      const r = (x) => (typeof x === "number" ? r3(x) : x), e = {};
      if (E) for (const k of Object.keys(E)) if (typeof E[k] === "number" || typeof E[k] === "string") e[k] = r(E[k]);
      if (E) e.hats = Array.from(E.hatId.slice(0, E.hatN));
      return { K: elK(), E: E ? e : null, digest: d ? { ms: +num(d.ms, 0).toFixed(2), msParts: d.msParts || null, N: d.N, bars: d.bs.length, entries: d.entT.length, midEntries: d.mEntT.length, airEntries: d.aEntT.length,
        hats: d.hatT.length, snares: d.snT.length, snareCand: d.snCT.length, riserBars: d.build.reduce((a, b) => a + (b > 0 ? 1 : 0), 0), mode: d.mode, home: r(d.home) } : null,
        err: A && A.elErr ? A.elErr : undefined, layerErr: S.layerErr, layers: LAYERS.map((l) => l.id), taps: SIGNAL_TAPS.map((t) => t.id),
        view: V.main && V.main.el ? { style: V.main.el.style, dots: V.main.el.N || 0, phi: +num(V.main.el.phi, 0).toFixed(5) } : null };
    },
    /** v5b: the layers' event lists of the current track in [fromMs, toMs] (analysis time): bass entries, soft entries,
        riser bars, snares, hats (count) */
    _elEvents(fromMs, toMs) {
      const A = analysisFor(currentItem() && currentItem().uri), d = A && A.el;
      if (!d) return null;
      const lo = fromMs == null ? -Infinity : fromMs, hi = toMs == null ? Infinity : toMs;
      const pick = (T, Sv) => { const o = []; for (let i = 0; i < T.length; i++) if (T[i] >= lo && T[i] <= hi) o.push(Sv ? [Math.round(T[i]), +Sv[i].toFixed(2)] : Math.round(T[i])); return o; };
      const riser = [];
      for (let k = 0; k < d.bs.length; k++) if (d.build[k] > 0 && d.bs[k] >= lo && d.bs[k] <= hi) riser.push([Math.round(d.bs[k]), +d.build[k].toFixed(2)]);
      const calm = [];                     // breakdowns: runs of the calm curve > 0.6 lasting >= 2 s
      for (let i = 0, s0 = -1; i <= d.N; i++) {
        const on = i < d.N && d.calm[i] > 0.6;
        if (on && s0 < 0) s0 = i;
        if (!on && s0 >= 0) { if ((i - s0) * d.hop >= 2000 && s0 * d.hop >= lo && i * d.hop <= hi) calm.push([s0 * d.hop, i * d.hop]); s0 = -1; }
      }
      return { entries: pick(d.entT, d.entS), mid: pick(d.mEntT, d.mEntS), air: pick(d.aEntT, d.aEntS), snares: pick(d.snT, d.snS), hats: pick(d.hatT).length, hatList: pick(d.hatT, d.hatS).slice(0, 400), riser, calm };
    },
    /** v5b: the layer curves at analysis time ms: LOW / MID / AIR levels, calm, riser ramp of the bar */
    _elAt(ms) {
      const A = analysisFor(currentItem() && currentItem().uri), d = A && A.el;
      if (!d) return null;
      const k = lastAtOrBefore(d.bs, ms);
      return { low: r3(elSample(d.lev.low, ms)), mid: r3(elSample(d.lev.mid, ms)), air: r3(elSample(d.lev.air, ms)), calm: r3(elSample(d.calm, ms)), build: k >= 0 ? r3(d.build[k]) : 0 };
    },
    /** v5 extension points (tests / future layers): register a channel producer / a reactive layer; returns its id */
    _addSignalTap(tap) { if (tap && tap.id && typeof tap.fn === "function" && !SIGNAL_TAPS.some((t) => t.id === tap.id)) SIGNAL_TAPS.push(tap); return SIGNAL_TAPS.map((t) => t.id); },
    _addLayer(layer) { if (layer && layer.id && typeof layer.draw === "function" && !LAYERS.some((l) => l.id === layer.id)) { LAYERS.push(layer); if (V.main) V.main.key = ""; if (V.preview) V.preview.key = ""; } return LAYERS.map((l) => l.id); },
    _removeLayer(id) { const i = LAYERS.findIndex((l) => l.id === id); if (i >= 0) LAYERS.splice(i, 1); const j = SIGNAL_TAPS.findIndex((t) => t.id === id); if (j >= 0) SIGNAL_TAPS.splice(j, 1); return true; },
    /** "Balanço no ritmo": the beat grid around analysis time ms (no rendering): pos / ph / pulse per step ms */
    _groove(fromMs, toMs, stepMs) {
      const A = analysisFor(currentItem() && currentItem().uri), out = [], o = { pos: 0, ph: 0, ms: 0, acc0: 1, acc1: 1 };
      for (let t = fromMs || 0; t <= (toMs == null ? (fromMs || 0) + 4000 : toMs); t += stepMs || 20) {
        grooveAt(A, t, A ? A.tempo : FALLBACK_BPM, o);
        const acc = o.ph < 1 - GROOVE_RISE ? o.acc0 : o.acc1;
        out.push([Math.round(t), +o.pos.toFixed(3), +(groovePulse(o.ph) * acc / (1 + GROOVE_DOWN)).toFixed(3)]);
      }
      return { analysis: !!A, beats: A ? A.beatT.length : 0, downbeats: A ? A.beatDown.reduce((a, b) => a + b, 0) : 0, beatLeadMs: A ? Math.round(A.beatLead) : null, rows: out };
    },
    /** r2: the main view's layout key / colour-pair version against the current pair (gradients follow the cover) */
    _elTops() { const fx = S.lastFx || {}; return V.main ? { title: elTitleTop(V.main, fx), win: elTitleTop(V.main, fx, true), h: V.main.h, box: S.vizBox, geo: S.metaGeo } : null; },
    _viewKey() { return { main: V.main ? { key: V.main.key, palVer: V.main.palVer } : null, pal: PAL ? PAL.ver : null, pair: lookPair() }; },
    _deviceDefaults() { return { local: deviceDefault({ remote: false, bt: false }), bluetooth: deviceDefault({ remote: false, bt: true }), remote: deviceDefault({ remote: true, bt: false }) }; },
    /** the title clearance of the frame on screen: the lowest bar / ribbon tip (zoomed) vs the title's top */
    _metaGap() {
      const G = V.main && V.main.g, w = el.metaWrap;
      if (!G || !w) return null;
      let vy = 0;
      for (let n = el.viz; n && n !== el.cam; n = n.offsetParent) vy += n.offsetTop;
      const z = S.lastFx.zoom, oy = el.cam.offsetHeight * 0.47, cy = vy + el.viz.offsetHeight / 2;
      let reach;
      if (CFG.style === "ring") { let h = 0; for (let m = 0; m < G.m; m++) if (G.u[m] > 0.85) h = Math.max(h, G.hgt[m]); reach = G.r0 * G.kick + 2 + Math.max(1.5, h * G.len) + G.barW / 2; }
      else if (CFG.style === "bars") { let h = 0; for (let i = 0; i < G.n; i++) h = Math.max(h, G.hgt[i]); reach = Math.max(1.25, h * G.half); }
      else { let y = 0; for (const ys of G.y) for (let i = 0; i < ys.length; i++) y = Math.max(y, Math.abs(ys[i] - G.cy)); reach = y; }
      const tip = oy + (cy + reach - oy) * vizZoom(z) * (S.lastFx.gs || 1) + (S.lastFx.gb || 0) * el.cam.offsetHeight * z, title = w.getBoundingClientRect().top;
      return { style: CFG.style, zoom: +z.toFixed(4), tipY: +tip.toFixed(1), titleTop: +title.toFixed(1), gap: +(title - tip).toFixed(1), clear: S.metaClear || null, vh: innerHeight };
    },
    _test(overrides) {               // { playing, hidden, fallback, simulateFromMs }
      S.test = overrides ? Object.assign({}, overrides) : null;
      if (S.test && S.test.simulateFromMs !== undefined) {
        S.test.sim = { pos: Number(S.test.simulateFromMs) || 0, at: now() };   // fake progress source
        S.test.playing = true;
      }
      S.lastActivity = now();
      syncClock(true);
      return S.test;
    },
    _refreshMeta() { S.metaUri = null; return true; },   // next frame cross-fades like a track change
    _trace: startTrace,
    _perf: perfStats,
    _resetPerf() { S.perf.i = 0; S.perf.n = 0; },
    _blockedReason: blockedReason,
    /** fault drills: { getAudioData, cosmos, menu, locale, topbarHost } = true makes that API look missing */
    _fault(f) { Object.keys(FAULT).forEach((k) => delete FAULT[k]); Object.assign(FAULT, f || {}); return Object.assign({}, FAULT); },
    _theme() { checkTheme(); return { on: THEME.on, version: THEME.ver, source: THEME.source }; },
    _lang(v) { try { if (v) localStorage.setItem(LANG_KEY, v); else localStorage.removeItem(LANG_KEY); } catch (e) { /* ignore */ } if (resolveLang()) relabel(); return { lang: LANG, source: LANG_SRC }; },
    _entryFallback() { entryFallback(); return entryState(); },
  });
