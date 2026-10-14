  // ---- player ------------------------------------------------------------------
  function currentItem() {
    try { return (Spicetify.Player.data && Spicetify.Player.data.item) || null; } catch (e) { return null; }
  }

  // ---- output device (its automatic "Sincronia") ------------------------------
  /** where the sound comes out: another Connect device (phone, speaker, web
      player) or this computer's own output (Spotify's selected one, else the
      default). Cached for DEV_POLL_MS. */
  function outputDevice(force) {
    const t = now();
    if (!force && S.dev && t - S.dev.at < DEV_POLL_MS) return S.dev;
    const d = { key: "local", name: "This computer", remote: false, bt: false, at: t };
    try {
      const ad = Spicetify.Platform.ConnectAPI.state.activeDevice;
      if (ad && ad.isLocal === false) {
        d.remote = true;
        d.key = "connect:" + String(ad.id || ad.name || "?");
        d.name = String(ad.name || "Other device");
      }
    } catch (e) { /* ignore */ }
    if (!d.remote) {
      try {
        const A = Spicetify.Platform.AudioOutputDevicesAPI;
        const list = A && Array.isArray(A.devices) ? A.devices : [];
        const o = (S.outSel && list.find((x) => x && x.id === S.outSel)) || list.find((x) => x && x.isDefaultDevice) || null;
        if (o && o.id) {
          d.key = "out:" + o.id;
          d.name = String(o.fullName || o.name || d.name);
          d.short = String(o.name || o.fullName || d.name);
          d.bt = /bluetooth/i.test(String(o.transportType || "")) ||
            /bluetooth|hands-?free|airpods|galaxy buds|\bbuds\b|\bbt\b|wh-1000|wf-1000|jbl (tune|live)/i.test(d.name);
        }
      } catch (e) { /* ignore */ }
    }
    S.dev = d;
    return d;
  }
  let outSelAt = -1e9;
  /** Spotify's own output choice (Configurações > Reprodução), async; cheap, at most every 10 s */
  function refreshOutSel(force) {
    if (!force && now() - outSelAt < 10000) return;
    outSelAt = now();
    try {
      const E = Spicetify.Platform.ExclusiveModeAPI;
      if (!E || typeof E.getSelectedAudioOutputDevice !== "function") return;
      Promise.resolve(E.getSelectedAudioOutputDevice()).then((id) => {
        const v = typeof id === "string" && id ? id : null;
        if (v !== S.outSel) { S.outSel = v; S.dev = null; }
      }, () => {});
    } catch (e) { /* ignore */ }
  }
  /** the automatic "Sincronia" (audio output latency, ms) of an output: another Connect device, a Bluetooth output
      of this computer, or its own output (wired / USB / 2.4 GHz wireless headsets). No manual value and no
      calibration (they did not work well in practice); the visual itself never waits for anything else. */
  function deviceDefault(d) { return d.remote ? REMOTE_LATENCY_MS : d.bt ? BT_LATENCY_MS : LATENCY_MS; }
  const latencyFor = deviceDefault;

  function onSongChange() {
    syncClock(true);
    S.pdemo = null;
    if (CFG.wallpaper.mode === "cover") {                        // "Capa do álbum" follows the track
      // without the NeonDrift theme only the overlay / the panel show it: loaded when one of them needs it
      if (THEME.on || S.phase !== "off" || S.panelOpen) applyWallpaper("song");
      else WP.stale = true;
    } else if (S.panelOpen) syncLook();                          // the cover thumbnail of the "Wallpaper" tab
    if (S.phase === "off" && !S.panelOpen) return;
    const item = currentItem();
    if (item) ensureAnalysis(item.uri);
    if (S.phase !== "off") updateMeta(false);
  }
  function onPlayPause() {
    syncClock(true);
    S.pdemo = null;
    if (S.demo && S.clock.playing) S.demo = null;      // real playback replaces the test clock
  }
  function onProgress() { if (S.phase !== "off" || S.panelOpen) syncClock(false); }

  /** Playback clock: Spicetify's progress, interpolated with performance.now();
      small drift is eased out, seeks / pauses / track changes snap. */
  function syncClock(hard) {
    const C = S.clock, t = now();
    let p = 0, playing = false, speed = 1;
    try {
      p = S.test && S.test.sim ? S.test.sim.pos + (t - S.test.sim.at) : num(Spicetify.Player.getProgress(), 0);
      playing = isPlaying();
      const st = Spicetify.Player.origin && Spicetify.Player.origin._state;
      speed = num(st && st.speed, 1) || 1;
    } catch (e) { /* ignore */ }
    const predicted = C.playing ? C.pos + (t - C.at) * C.speed : C.pos;
    if (hard || !C.valid || playing !== C.playing || Math.abs(p - predicted) > 150) C.pos = p;
    else C.pos = predicted + (p - predicted) * 0.2;
    C.at = t; C.playing = playing; C.speed = speed; C.valid = true; C.syncedAt = t;
  }
  function positionAt(t) {
    const C = S.clock;
    return C.playing ? C.pos + (t - C.at) * C.speed : C.pos;
  }

