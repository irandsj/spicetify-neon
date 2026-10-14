  // ---- boot --------------------------------------------------------------------
  /** everything the extension used to wait for: kept for the first ~10 s so the boot happens at the same moment as
      before; after that only the player (and the page) are needed: every other API is looked up when it is used */
  function spicetifyReady(tries) {
    const s = window.Spicetify;
    const core = !!(s && s.Player && typeof s.Player.addEventListener === "function" && typeof s.Player.getProgress === "function" && document.body);
    if (!core) return false;
    if (tries > 50) return true;
    return !!(s.Platform && s.Platform.History && typeof s.getAudioData === "function" && s.Menu && s.Menu.Item && s.React && s.ReactJSX && s.ContextMenuV2);
  }

  const LISTEN_PASSIVE = { capture: true, passive: true };
  const LISTEN_ACTIVE = { capture: true, passive: false };
  const ACTIVITY_EVENTS = ["mousedown", "pointerdown", "wheel", "touchstart", "touchmove"];

  let reducedMq = null;
  function onReducedMotion() { S.reducedMotion = !!(reducedMq && reducedMq.matches); syncPanel(); }
  function init() {
    resolveLang();                     // Spicetify.Locale is there now: before the menu / the button get their labels
    checkTheme();
    scheduleThemeChecks();
    try {
      reducedMq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
      S.reducedMotion = !!(reducedMq && reducedMq.matches);
      if (reducedMq && reducedMq.addEventListener) reducedMq.addEventListener("change", onReducedMotion);
    } catch (e) { /* ignore */ }

    window.addEventListener("mousemove", onMouseMove, LISTEN_PASSIVE);
    for (const t of ACTIVITY_EVENTS) window.addEventListener(t, onActivity, LISTEN_PASSIVE);
    // keys are not passive: the key that wakes the app up is swallowed so it
    // cannot also press the focused button or toggle play/pause
    window.addEventListener("keydown", onKeyDown, LISTEN_ACTIVE);
    window.addEventListener("keyup", onKeyUp, LISTEN_ACTIVE);
    window.addEventListener("keypress", shieldPanelKey, LISTEN_ACTIVE);
    window.addEventListener("pointerdown", onPanelOutside, LISTEN_PASSIVE);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    Spicetify.Player.addEventListener("songchange", onSongChange);
    Spicetify.Player.addEventListener("onplaypause", onPlayPause);
    Spicetify.Player.addEventListener("onprogress", onProgress);

    S.interval = setInterval(idleCheck, CHECK_EVERY_MS);

    registerMenu(0);
    registerTopbar(0);
    armEntryFallback();               // no button host / no menu 30 s after the UI shows up: the other ways in
    if (CFG.wallpaper.mode === "cover" && THEME.on) applyWallpaper("init");   // the cover needs the player (ready now)
    if (SETTINGS_MIGRATED) { SETTINGS_MIGRATED = false; saveSettings(true); }   // older settings converted: saved once
    dbg("init", { lang: LANG, langSource: LANG_SRC, theme: THEME.on, version: ND_VERSION });
  }

  /** profile menu: "Modo ambiente" (check mark = on / off) and "Personalizar NeonDrift" (opens the panel); retried
      while Spicetify's React bits are still loading */
  function registerMenu(tries) {
    if (S.destroyed || menuItem) return;
    try {
      if (FAULT.menu) throw new Error("fault drill");
      const item = new Spicetify.Menu.Item(tr(MENU_LABEL), CFG.enabled, () => setEnabled(!CFG.enabled, true), ICON_EQ);
      const more = new Spicetify.Menu.Item(tr(MENU_SETTINGS_LABEL), false, () => setTimeout(openPanel, 0, true), ICON_EQ);
      item.register();
      more.register();
      menuItem = item;
      menuSettings = more;
    } catch (e) {
      if (tries < 30) S.menuTimer = setTimeout(registerMenu, 1000, tries + 1);
    }
  }
  /** the language changed after the menu / the button / the panel got their texts (a late Spicetify.Locale): every
      label follows, and a panel that was already built is built again in the new language (same tab) */
  function relabel() {
    try { if (menuItem && menuItem.setName) menuItem.setName(tr(MENU_LABEL)); } catch (e) { /* ignore */ }
    try { if (menuSettings && menuSettings.setName) menuSettings.setName(tr(MENU_SETTINGS_LABEL)); } catch (e) { /* ignore */ }
    syncTopbtn();
    try { if (playBtn) playBtn.label = tr(PANEL_LABEL); } catch (e) { /* ignore */ }
    if (el.root) setRootLang();
    if (el.panel) rebuildPanel();
  }

  /** top-bar button (right side, next to "Novidades") that opens the panel */
  function registerTopbar(tries) {
    if (S.destroyed || topBtn) return;
    try {
      if (!Spicetify.Topbar || typeof Spicetify.Topbar.Button !== "function") throw new Error("no Topbar");
      const b = new Spicetify.Topbar.Button(tr(PANEL_LABEL), ICON_EQ, () => togglePanel(true), false, true);
      b.element.classList.add("nd-amb-topbtn");
      b.button.type = "button";
      b.button.setAttribute("aria-haspopup", "dialog");
      b.button.setAttribute("aria-expanded", "false");
      b.button.setAttribute("aria-controls", "nd-amb-panel");
      // Spicetify's tooltip is a bare <div class="main-contextMenu-tippy"> in a tippy popper (id "tippy-N"): tagged,
      // so our own CSS gives it colours (the NeonDrift theme styles every such tooltip like Spotify's own)
      try {
        const pop = b.tippy && b.tippy.popper;
        if (pop) { pop.classList.add("nd-amb-tippop"); if (pop.firstElementChild) pop.firstElementChild.classList.add("nd-amb-tip"); }
      } catch (e) { /* ignore */ }
      topBtn = b;
      mountTopbar();
      syncTopbtn();
    } catch (e) {
      if (tries < 30) S.topTimer = setTimeout(registerTopbar, 1000, tries + 1);
    }
  }
  /** Spicetify 2.45.3 waits for .main-globalNav-historyButtons, which Spotify 1.3.4 no longer has, so it never mounts
      right-side buttons: put ours just before "Novidades" (same group, so the same spacing), with that button's class.
      Hosts, in order: where Spicetify itself mounted it; .main-actionButtons; the global nav group of the profile
      button. A host that is not rendered counts as missing. Re-checked by the idle timer (cheap). */
  // the readable names exist only when Spicetify's class map was fresh at "spicetify backup"; else the 1.3.4 hashes
  const ACTION_BUTTONS = ".main-actionButtons, .uf2x5WzM1lLLCLSQdMFB";
  const ACTION_BUTTON = ".main-actionButtons-button, .IP9nbmlAqlYRK9fq8Mll";
  const topShown = () => !!(topBtn && topBtn.element.isConnected && topBtn.element.getClientRects().length);
  function mountTopbar() {
    if (!topBtn) return;
    if (topShown()) { S.topHost = S.topHost || "spicetify"; S.entry = S.entry || S.topHost; return; }
    const cls = topBtn.button.className;
    const shown = (n) => !!(n && n.getClientRects().length);
    const host = FAULT.topbarHost ? null : document.querySelector(ACTION_BUTTONS);
    if (shown(host)) {
      const ref = host.querySelector(ACTION_BUTTON);
      if (ref && (!cls || cls === "undefined")) topBtn.button.className = ref.className;
      (ref && ref.parentElement ? ref.parentElement : host).prepend(topBtn.element);
      S.entry = S.topHost = "actionButtons";
      return;
    }
    const user = FAULT.topbarHost ? null : document.querySelector('[id="global-nav-bar"] [data-testid="user-widget-link"]');
    const group = user && user.parentElement;
    if (shown(group) && group !== topBtn.element.parentElement) {
      const ref = [...group.querySelectorAll("button")].find((x) => x !== user && !topBtn.element.contains(x));
      if (ref && (!cls || cls === "undefined")) topBtn.button.className = ref.className;
      group.insertBefore(topBtn.element, user);
      S.entry = S.topHost = "globalNav";
    }
  }
  /** Spotify's UI is on screen: a Spotify that starts minimised / hidden mounts nothing until its window is shown.
      The page counts as mounted once its main view is there, or after a minute on screen (a layout without it) */
  function uiShown() {
    if (document.hidden) { S.shownAt = 0; return false; }
    if (!S.shownAt) S.shownAt = now();
    return !!document.getElementById("main-view") || now() - S.shownAt > 60000;
  }
  /** the other ways in are decided 30 s after the UI is first on screen (re-checked by the idle timer until then; a
      window hidden meanwhile starts the wait again) */
  function armEntryFallback() {
    if (S.destroyed || S.entryDone) return;
    if (!uiShown()) { if (S.entryTimer) { clearTimeout(S.entryTimer); S.entryTimer = 0; } return; }
    if (!S.entryTimer) S.entryTimer = setTimeout(entryFallback, ENTRY_FALLBACK_MS);
  }
  /** no top-bar host was found -> a button in the player bar; no button and no menu entry -> Ctrl+Alt+N opens the
      panel (said once in a notification) */
  function entryFallback() {
    S.entryTimer = 0;
    if (S.destroyed || S.entryDone) return;
    if (!uiShown()) return;                       // hidden meanwhile: armEntryFallback starts the wait again
    S.entryDone = true;
    const hasTop = topShown();
    if (!hasTop && !playBtn) {
      try {
        if (Spicetify.Playbar && typeof Spicetify.Playbar.Button === "function") {
          playBtn = new Spicetify.Playbar.Button(tr(PANEL_LABEL), ICON_EQ, () => togglePanel(true), false, false, true);
          S.entry = "playbar";
        }
      } catch (e) { playBtn = null; }
    }
    S.shortcut = !hasTop && !playBtn && !menuItem;
    if (S.shortcut) {
      S.entry = "shortcut";
      try { Spicetify.showNotification(tr("toast.shortcut")); } catch (e) { /* ignore */ }
    }
    dbg("entry", S.entry || "menu", { topbar: hasTop, playbar: !!playBtn, menu: !!menuItem });
  }
  /** the top-bar button showed up after all (a late host): the fallback ways in go, so there is only one button */
  function dropFallbackEntry() {
    if (!topShown()) return;
    if (playBtn) {
      try { playBtn.deregister(); } catch (e) { /* ignore */ }
      playBtn = null;
      if (S.panelOpen) positionPanel();
    }
    S.shortcut = false;
    S.entry = S.topHost || "spicetify";
    dbg("entry", S.entry, { late: true });
  }
  function entryState() {
    return { entry: S.entry || (menuItem ? "menu" : "none"), topbar: !!(topBtn && topBtn.element.isConnected), playbar: !!playBtn, menu: !!menuItem, shortcut: S.shortcut };
  }
  /** the button opens the whole panel (colours, wallpaper, ambient mode), so it always reads "Personalizar NeonDrift";
      --off still marks the mode for CSS */
  function syncTopbtn() {
    if (!topBtn) return;
    const label = tr(PANEL_LABEL);
    topBtn.element.classList.toggle("nd-amb-topbtn--off", !CFG.enabled);
    if (topBtn.button.getAttribute("aria-label") === label) return;
    try { topBtn.label = label; } catch (e) { topBtn.button.setAttribute("aria-label", label); }   // also the tooltip text
  }

  /** everything this instance added goes. A hand-over (a newer copy takes over) keeps the theme contract
      (<style id="nd-look-vars">, html[data-nd-wall]) so the layout does not flash meanwhile. */
  function destroy(opts) {
    if (S.destroyed) return;
    const handoff = !!(opts && opts.handoff);
    try { if (saveTimer) saveSettings(true); } catch (e) { /* ignore */ }   // a pending save is written now
    S.destroyed = true;
    try { if (reducedMq && reducedMq.removeEventListener) reducedMq.removeEventListener("change", onReducedMotion); } catch (e) { /* ignore */ }
    closePanel(false);
    hardOff();
    disarm();
    clearInterval(S.interval);
    for (const k of ["entryTimer", "menuTimer", "topTimer"]) clearTimeout(S[k]);
    for (const tm of THEME.timers) clearTimeout(tm);
    THEME.timers.length = 0;
    if (S.dockRaf) cancelAnimationFrame(S.dockRaf);
    S.dockRaf = 0;
    window.removeEventListener("mousemove", onMouseMove, LISTEN_PASSIVE);
    for (const t of ACTIVITY_EVENTS) window.removeEventListener(t, onActivity, LISTEN_PASSIVE);
    window.removeEventListener("keydown", onKeyDown, LISTEN_ACTIVE);
    window.removeEventListener("keyup", onKeyUp, LISTEN_ACTIVE);
    window.removeEventListener("keypress", shieldPanelKey, LISTEN_ACTIVE);
    window.removeEventListener("pointerdown", onPanelOutside, LISTEN_PASSIVE);
    window.removeEventListener("focus", onWindowFocus);
    window.removeEventListener("resize", onResize, { passive: true });
    document.removeEventListener("visibilitychange", onVisibility);
    try {
      Spicetify.Player.removeEventListener("songchange", onSongChange);
      Spicetify.Player.removeEventListener("onplaypause", onPlayPause);
      Spicetify.Player.removeEventListener("onprogress", onProgress);
    } catch (e) { /* ignore */ }
    try { if (menuItem) menuItem.deregister(); } catch (e) { /* ignore */ }
    try { if (menuSettings) menuSettings.deregister(); } catch (e) { /* ignore */ }
    menuItem = menuSettings = null;
    if (topBtn) {
      // Spicetify.Topbar has no deregister: hide it so its re-mount on navigation stays invisible
      try { if (topBtn.tippy) topBtn.tippy.destroy(); } catch (e) { /* ignore */ }
      topBtn.element.style.display = "none";
      topBtn.element.remove();
      topBtn = null;
    }
    try { if (playBtn) playBtn.deregister(); } catch (e) { /* ignore */ }
    playBtn = null;
    if (el.root) el.root.remove();
    if (el.panel) el.panel.remove();
    clearTimeout(LOOK.bootTimer);
    clearTimeout(LOOK.paintTimer);
    clearTimeout(LOOK.timer);
    if (LOOK.raf) cancelAnimationFrame(LOOK.raf);
    WP.token++;
    S.wallToken++;
    LOOK.matchToken++;
    removeCss();
    if (!handoff) {
      const lv = document.getElementById("nd-look-vars");
      if (lv) lv.remove();
      document.documentElement.removeAttribute("data-nd-wall");
    }
    // our object URLs: the one the layout may still show (a hand-over keeps #nd-look-vars a moment) goes a bit later
    const urls = [WP.fileUrl, WP.coverObj, BUILTIN_URL].filter(Boolean);
    if (handoff) setTimeout(() => { for (const u of urls) URL.revokeObjectURL(u); }, 5000);
    else for (const u of urls) URL.revokeObjectURL(u);
    try { if (WP.coverBmp) WP.coverBmp.close(); } catch (e) { /* ignore */ }
    try { if (S.wallImg && S.wallImg.close) S.wallImg.close(); } catch (e) { /* ignore */ }
    WP.coverBmp = null;
    S.wallImg = null;
    cover.img = cover.prev = null;
    cache.clear();
    if (idbP) idbP.then((db) => db.close(), () => {});
    if (window.NeonDriftAmbient === API) { try { delete window.NeonDriftAmbient; } catch (e) { window.NeonDriftAmbient = undefined; } }
  }

  function setEnabled(v, notify) {
    CFG.enabled = !!v;
    saveSettings(true);
    if (menuItem) menuItem.setState(CFG.enabled);
    S.lastActivity = now();
    if (!CFG.enabled) exit("disabled");
    syncPanel();
    syncTopbtn();
    if (notify) {
      try { Spicetify.showNotification(tr(CFG.enabled ? "toast.ambientOn" : "toast.ambientOff")); } catch (e) { /* ignore */ }
    }
  }

  /** applies a (partial) settings object at once and saves it */
  function applySettings(next, immediate) {
    const prevEnabled = CFG.enabled;
    CFG = sanitize(next);
    scheduleLook();                   // colours / wallpaper (no-op when they did not change)
    if (menuItem && prevEnabled !== CFG.enabled) menuItem.setState(CFG.enabled);
    if (!CFG.enabled) exit("disabled");
    if (el.root) { setRootStyle(); if (S.phase !== "off") resizeMain(); }
    S.lastActivity = now();
    saveSettings(immediate);
    syncPanel();
    syncTopbtn();
  }
