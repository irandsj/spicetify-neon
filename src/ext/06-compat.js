
  // ---- compatibility: every Spotify / Spicetify feature is looked up when it is used ----------------
  // Tested on Spotify 1.3.4.258 with Spicetify 2.45.3. Anything missing degrades on its own (no analysis: soft mode;
  // no top-bar host: other entry points; no menu: the shortcut) and never stops the boot.
  const TESTED_SPOTIFY = ["1.3.4.258"];
  const COMPAT_NOTE_KEY = "NeonDrift:compat-note";
  const DEBUG = (() => { try { return localStorage.getItem("NeonDrift:debug") === "1"; } catch (e) { return false; } })();
  const dbg = (...a) => { if (DEBUG || ND_DEV) try { console.debug("[NeonDrift]", ...a); } catch (e) { /* ignore */ } };
  /** Spotify's audio analysis of a track: Spicetify.getAudioData, else the same endpoint through CosmosAsync */
  function audioData(uri) {
    const s = window.Spicetify || {};
    if (typeof s.getAudioData === "function" && !FAULT.getAudioData) return s.getAudioData(uri);
    if (s.CosmosAsync && typeof s.CosmosAsync.get === "function" && !FAULT.cosmos) {
      const id = String(uri).split(":").pop();
      return s.CosmosAsync.get("https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/" + id + "?format=json");
    }
    return Promise.reject(new Error("no analysis API"));
  }
  /** Spotify / Spicetify versions (report only) */
  function versions() {
    let spotify = "", spicetify = "";
    try { spotify = String((Spicetify.Platform && Spicetify.Platform.version) || ""); } catch (e) { /* ignore */ }
    if (!spotify) { const m = /Spotify\/(\d+\.\d+\.\d+\.\d+)/.exec(navigator.userAgent || ""); spotify = m ? m[1] : ""; }
    try { spicetify = String((Spicetify.Config && Spicetify.Config.version) || ""); } catch (e) { /* ignore */ }
    return { spotify: spotify || "unknown", spicetify: spicetify || "unknown", tested: TESTED_SPOTIFY.some((v) => spotify.startsWith(v)) };
  }
  /** read-only probe of what this Spotify offers (NeonDriftAmbient.compat()) */
  function compatProbe() {
    const s = window.Spicetify || {}, q = (sel) => { try { return !!document.querySelector(sel); } catch (e) { return false; } };
    const api = {
      player: !!(s.Player && typeof s.Player.addEventListener === "function" && typeof s.Player.getProgress === "function"),
      getAudioData: typeof s.getAudioData === "function",
      cosmos: !!(s.CosmosAsync && typeof s.CosmosAsync.get === "function"),
      history: !!(s.Platform && s.Platform.History),
      menu: !!(s.Menu && typeof s.Menu.Item === "function"),
      topbar: !!(s.Topbar && typeof s.Topbar.Button === "function"),
      playbar: !!(s.Playbar && typeof s.Playbar.Button === "function"),
      locale: !!(s.Locale && (typeof s.Locale.getLocale === "function" || s.Locale._locale)),
    };
    const dom = {
      actionButtons: q(".main-actionButtons, .uf2x5WzM1lLLCLSQdMFB, .ERwUgK0ZJ6qV1QmdLcWt"),   // readable name or the 1.3.4 / 1.3.6 scrambled one
      globalNav: q('[id="global-nav-bar"]'),
      userWidget: q('[data-testid="user-widget-link"]'),
      mainView: q("#main-view"),
      nowPlayingBar: q('aside[data-testid="now-playing-bar"]'),
      rightPanel: q("#Desktop_PanelContainer_Id"),
      topContainer: q(".Root__top-container, .bokji1jrN2MBe7RA0384, .LiEjwLua6RNBCvlysAT2") || q(".Root > div:has(#main-view)"),
    };
    return Object.assign({ versions: versions(), theme: { on: THEME.on, version: THEME.ver, source: THEME.source }, lang: { lang: LANG, source: LANG_SRC }, api, dom,
      entry: entryState() });
  }
  /** a one-time note in the panel (dismissed per Spotify version): a missing API ({ why: "api" }, any version, with or
      without the theme), else an untested Spotify version with the NeonDrift theme ({ why: "version" }: its layout
      may look different); null = no note */
  function compatNoteWanted() {
    const v = versions(), p = compatProbe();
    const apiOk = p.api.player && (p.api.getAudioData || p.api.cosmos) && p.api.menu;
    if ((v.tested || !THEME.on) && apiOk) return null;
    let seen = "";
    try { seen = localStorage.getItem(COMPAT_NOTE_KEY) || ""; } catch (e) { /* ignore */ }
    return seen === v.spotify ? null : { v: v.spotify, why: apiOk ? "version" : "api" };
  }
