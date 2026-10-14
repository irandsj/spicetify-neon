  // ---- input / idle detection -------------------------------------------------
  const isActive = () => S.phase === "entering" || S.phase === "on";

  function onMouseMove(e) {
    const x = e.clientX, y = e.clientY;
    if (isActive()) {
      if (S.anchorX !== S.anchorX || now() < S.graceUntil) { S.anchorX = x; S.anchorY = y; return; }   // first move / test grace
      if (Math.hypot(x - S.anchorX, y - S.anchorY) < JITTER_PX) return;
      S.mouseX = x; S.mouseY = y;
      exit("mousemove");
      return;
    }
    if (x === S.mouseX && y === S.mouseY) return;      // synthetic move, nothing changed
    S.mouseX = x; S.mouseY = y;
    S.lastActivity = now();
  }

  function onActivity(e) {
    S.lastActivity = now();
    if (!isActive()) return;
    // "Testar agora" grace: the rest of a double click (2nd press) and the
    // wheel do not end the test; the overlay swallows those presses anyway
    if (now() < S.graceUntil && e.type !== "touchmove") return;
    exit(e.type);
  }

  function onKeyDown(e) {
    const t = now();
    S.lastActivity = t;
    S.lastKey = t;
    if (isActive()) {
      if (e.repeat && t < S.graceUntil) {             // held Enter from "Testar agora"
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      S.swallowKeyUp = e.code || e.key;
      e.preventDefault();
      e.stopImmediatePropagation();
      exit("keydown");
      return;
    }
    if (S.panelOpen && el.panel && el.panel.contains(e.target) && onPanelKey(e)) return;
    // the last way in when no button / menu entry could be added (entryFallback): Ctrl+Alt+N
    if (S.shortcut && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && (e.code === "KeyN" || /^n$/i.test(e.key || ""))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      togglePanel(true);
      return;
    }
    if (S.panelOpen && (e.key === "Escape" || e.key === "Esc")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closePanel(true);
      return;
    }
    shieldPanelKey(e);
  }

  function onKeyUp(e) {
    if (S.swallowKeyUp && (e.code || e.key) === S.swallowKeyUp) {
      S.swallowKeyUp = null;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    shieldPanelKey(e);
  }

  /** keys typed inside the panel (Space on a button, arrows on a slider...)
      must not also reach Spotify's own shortcuts (Space = play / pause).
      Their default actions (activate, move the slider, Tab) still happen;
      modified shortcuts (Ctrl+L...) pass through. */
  function shieldPanelKey(e) {
    if (!S.panelOpen || !el.panel || !el.panel.contains(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopPropagation();
  }

  function onWindowFocus(e) {
    if (e.target !== window) return;
    S.lastActivity = now();
    if (isActive()) exit("focus");
  }

  function onVisibility() {
    armEntryFallback();                 // hidden: the wait for the other ways in starts again once it is shown
    if (document.hidden) { stopLoop(); return; }
    S.lastActivity = now();             // window restored: the full idle time again
    if (S.phase !== "off" || S.panelOpen) { syncClock(true); startLoop(); }
  }

  function isPlaying() {
    if (S.test && S.test.playing !== undefined) return S.test.playing;
    try { return !!(Spicetify.Player.data && Spicetify.Player.data.item && Spicetify.Player.isPlaying()); } catch (e) { return false; }
  }
  function isHidden() {
    return S.test && S.test.hidden !== undefined ? S.test.hidden : document.hidden;
  }

  function idleCheck() {
    const t0 = now();
    S.stats.idleChecks++;
    if (topBtn && !topBtn.element.isConnected) mountTopbar();
    if (!S.entryDone) armEntryFallback();
    else if ((playBtn || S.shortcut) && topShown()) dropFallbackEntry();
    idleStep(t0);
    S.stats.idleCheckMs += now() - t0;
  }
  function idleStep(t) {
    if (!CFG.enabled || S.phase !== "off") return;
    if (S.panelOpen) { S.blockedBy = "panel"; return; }
    if (isHidden()) { S.blockedBy = "hidden"; return; }
    const idle = t - S.lastActivity, wait = idleMs();
    if (idle < wait * PREPARE_AT) { S.blockedBy = null; return; }
    if (!isPlaying()) { S.blockedBy = "paused"; return; }
    prepare();
    if (idle < wait) return;
    S.blockedBy = blockedReason();
    if (!S.blockedBy) enter("idle");
  }

  const MENU_SEL = '#context-menu, [role="menu"], .main-contextMenu-menu';
  const DIALOG_SEL = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], .ReactModal__Overlay, .GenericModal';

  /** a rendered node of sel that is not ours (nodes without boxes do not block); remembered for diagnostics */
  function anyVisible(sel) {
    for (const node of document.querySelectorAll(sel)) {
      if (el.root && el.root.contains(node)) continue;
      if (el.panel && el.panel.contains(node)) continue;
      if (isTooltipPopper(node)) continue;
      if (node.getClientRects().length) {
        S.blockedDetail = { sel, tag: String(node.tagName || "").toLowerCase(), id: node.id || "", role: node.getAttribute("role") || "", cls: String(node.className || "").slice(0, 80) };
        return true;
      }
    }
    return false;
  }
  /** Spotify's own tooltips live in a #context-menu popper too
      (<span role="tooltip">): a cursor resting on a button must not block the
      ambient mode as if a menu were open */
  function isTooltipPopper(node) {
    if (node.id !== "context-menu") return false;
    if (node.querySelector('[role="menu"], [role="listbox"], [role="dialog"], ul, .main-contextMenu-menu')) return false;
    const c = node.firstElementChild;
    return !c || c.classList.contains("main-contextMenu-tippy") || c.getAttribute("role") === "tooltip" || !!node.querySelector('[role="tooltip"]');
  }

  function isEditable(node) {
    if (!node || node === document.body) return false;
    if (node.isContentEditable) return true;
    const tag = node.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag !== "INPUT") return false;
    return !/^(button|checkbox|radio|range|submit|reset|color|file|image|hidden)$/i.test(node.type || "");
  }

  /** why ambient mode may not start right now (null = it may) */
  function blockedReason() {
    S.blockedDetail = null;
    if (S.panelOpen) return "panel";
    if (isEditable(document.activeElement) && now() - S.lastKey < TYPING_GRACE_MS) return "typing";
    const html = document.documentElement;
    if (document.fullscreenElement || html.classList.contains("fullscreen")) return "fullscreen";
    try {
      const st = Spicetify.Platform.History.location.state;
      const cs = st && st.cinemaState;
      if (cs && cs !== "closed" && cs !== "library") return "cinema";
    } catch (e) { /* ignore */ }
    for (const a of html.attributes) {
      if (a.name.startsWith("data-cinema-") && a.name.endsWith("-postenter") && a.name !== "data-cinema-library-postenter") return "cinema";
    }
    try {
      if (/lyrics/i.test(Spicetify.Platform.History.location.pathname || "")) return "lyrics";
    } catch (e) { /* ignore */ }
    if (anyVisible(MENU_SEL)) return "menu";
    if (anyVisible(DIALOG_SEL)) return "dialog";
    return null;
  }

