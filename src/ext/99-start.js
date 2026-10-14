
  // boot: wait for Spicetify's player (see spicetifyReady); give up silently after ~3 min (the theme still works)
  (function waitForSpicetify(tries) {
    if (S.destroyed) return;
    if (spicetifyReady(tries)) {
      try { init(); } catch (e) { console.error("[NeonDrift] start failed:", e); }
      return;
    }
    if (tries > 900) { dbg("Spicetify's player never became ready: giving up"); return; }
    setTimeout(waitForSpicetify, 200, tries + 1);
  })(0);
