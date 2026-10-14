  // ---- tracing / test hooks ------------------------------------------------------
  function traceSample(t, posMs, A, sig, fx, level) {
    const T = S.trace;
    if (!T || t < T.next) return;
    T.next = t + T.every * 0.9;
    T.samples.push(makeSample(posMs, A, sig, fx, level));
    if (t >= T.until) finishTrace();
  }
  /** one trace sample. t = playback clock (ms); pA = t - lat = the analysis
      time being shown; nearestBeatMs / nearestKickOnsetMs = pA - that event
      (so a hit that is on time shows 0..attack ms here). */
  function makeSample(posMs, A, sig, fx, level) {
    const lat = num(sig.lat, LATENCY_MS), pA = posMs - lat;
    let nb = null, bc = null, nk = null, nkS = null, segAttack = null, segBright = null, segKick = null, segHat = null, dark = null;
    if (A) {
      const j = nearestIdx(A.beatT, pA);
      if (j >= 0) { nb = Math.round(pA - A.beatT[j]); bc = +A.beatC[j].toFixed(3); }
      const k = lastAtOrBefore(A.hitT, pA + 60);   // the hit being shown (or about to start)
      if (k >= 0) { nk = Math.round(pA - A.hitT[k]); nkS = +A.hitS[k].toFixed(3); }
      const i = Math.max(0, segIndex(A, pA / 1000));
      segAttack = +A.att[i].toFixed(2);
      segBright = +A.bri[i].toFixed(1);
      segKick = +A.kick[i].toFixed(3);
      segHat = +A.hat[i].toFixed(3);
      dark = +(1 - n01(A.bri[i], A.briLo, A.briHi)).toFixed(3);
    }
    return {
      t: Math.round(posMs), pA: Math.round(pA), lat: Math.round(lat), latDev: S.latDev,
      bass: r3(sig.bass), kick: r3(sig.kick), energy: r3(sig.energy), hat: r3(sig.hat),
      zoom: +fx.zoom.toFixed(4), glow: r3(fx.glow), focus: r3(fx.focus),
      groove: r3(num(sig.groove, 0)), drums: r3(num(sig.drums, 1)), beatPh: r3(num(sig.beatPh, 0)), down: sig.down || 0, grooveScale: +num(fx.gs, 1).toFixed(4),
      nearestBeatMs: nb, beatConfidence: bc, nearestKickOnsetMs: nk, kickStrength: nkS,
      segAttack, segBrightness: segBright, darkness: dark, segKick, segHat,
      mainVisualLevel: r3(level),
      style: CFG.style, mode: sig.mode, playing: S.demo ? "demo" : S.clock.playing,
    };
  }
  function finishTrace() {
    const T = S.trace;
    if (!T) return;
    S.trace = null;
    if (T.timer) clearInterval(T.timer);
    T.resolve(T.samples);
  }
  function state() {
    const item = currentItem();
    const e = item && cache.get(item.uri);
    const sig = SIG.main;
    return {
      enabled: CFG.enabled,
      phase: S.phase,
      active: S.phase !== "off",
      idleMs: idleMs(),
      idleForMs: Math.round(now() - S.lastActivity),
      blockedBy: S.phase === "off" ? (CFG.enabled ? S.blockedBy : "disabled") : null,
      playing: isPlaying(),
      hidden: document.hidden,
      uri: item ? item.uri : null,
      analysis: e ? e.st : "none",
      analysisError: e && e.err ? e.err : undefined,
      analysisKind: e && e.kind ? e.kind : undefined,   // missing / empty / auth / rate / server / net / timeout
      analysisTries: e && e.tries ? e.tries : undefined,   // quick retries after a failed request
      retryInMs: e && e.st === "fail" ? Math.max(0, Math.round(failRetryMs(e) - (now() - e.at))) : undefined,   // the back-off
      soft: r3(num(SIG.main.soft, 0)), softPreview: r3(num(SIG.preview.soft, 0)),   // "modo ambiente suave"
      docked: !!S.docked, solo: S.pvSolo ? S.pvSolo.k : null,
      mode: analysisFor(item && item.uri) ? "analysis" : "fallback",
      positionMs: Math.round(mainPosition(now())),
      style: CFG.style,
      bass: r3(sig.bass), kick: r3(sig.kick), energy: r3(sig.energy),
      level: r3(S.level), zoom: +S.lastFx.zoom.toFixed(4), glow: r3(S.lastFx.glow),
      pulse: r3(sig.kick),
      wallpaper: S.wall,
      rafRunning: !!S.raf,
      hold: S.hold,
      panelOpen: S.panelOpen,
      menu: !!menuItem, menuSettings: !!menuSettings, topbar: !!(topBtn && topBtn.element.isConnected),
      demo: !!S.demo,
      cacheSize: cache.size,
      stats: Object.assign({}, S.stats, { idleCheckMs: +S.stats.idleCheckMs.toFixed(3) }),
      test: S.test || undefined,
      enterReason: S.enterReason,
      lastExit: S.lastExit,
      blockedDetail: S.phase === "off" && S.blockedBy && S.blockedDetail ? Object.assign({}, S.blockedDetail) : undefined,
      version: ND_VERSION,
      theme: { on: THEME.on, version: THEME.ver, source: THEME.source },
      lang: LANG, langSource: LANG_SRC,
      entry: entryState(),
      sync: { device: S.dev ? { key: S.dev.key, name: S.dev.name, remote: S.dev.remote, bt: S.dev.bt } : null, latencyMs: S.latDev, effectiveMs: +num(S.latEff, 0).toFixed(1), vsyncMs: +S.vsync.toFixed(2), displayLeadMs: +displayLead().toFixed(1) },
    };
  }

  /** window.NeonDriftAmbient: a small public API (debugging / other extensions). enter / exit / test start or end
      ambient mode; state() / settings() / theme() / compat() report; set(patch) changes settings (sanitised, saved). */
  const API = {
    version: ND_VERSION,
    __ext: true,
    enter() { enter("api"); return state(); },
    exit() { exit("api"); return state(); },
    test() { testNow(); return state(); },
    state,
    settings() { return clone(CFG); },
    set(patch) {                       // e.g. set({ style: "ring", zoom: { amount: 150 } })
      const next = clone(CFG);
      for (const k of Object.keys(patch || {})) {
        if (patch[k] && typeof patch[k] === "object" && next[k] && typeof next[k] === "object") Object.assign(next[k], patch[k]);
        else next[k] = patch[k];
      }
      applySettings(next, true);
      return clone(CFG);
    },
    openPanel() { openPanel(false); return state(); },
    closePanel() { closePanel(false); return state(); },
    get enabled() { return CFG.enabled; },
    set enabled(v) { setEnabled(v, false); },
    _destroy(opts) { destroy(opts); },
    theme() { return { on: THEME.on, version: THEME.ver, source: THEME.source }; },
    compat() { return compatProbe(); },
  };
  window.NeonDriftAmbient = API;
