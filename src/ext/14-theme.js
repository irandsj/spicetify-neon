
  // ---- the NeonDrift theme (theme contract v1) -------------------------------------------------
  // The theme's user.css says it is there with ":root { --neondrift-theme: 1 }" (the number is the contract version;
  // any version >= 1 is accepted). The theme's name in Spicetify's config is a second signal. Only while the theme is
  // on does this extension write the contract: <style id="nd-look-vars"> (html:root: the palette inputs and the layout
  // wallpaper variables, see applyPalette / setWallVars) and html[data-nd-wall="loading"]. Without the theme nothing is
  // written outside our own nodes: the colours and the wallpaper then only change the ambient mode, the panel and the
  // top-bar button. A Marketplace install adds the theme's CSS a little later, so the check runs again at init, after
  // 1.5 / 5 / 15 / 60 s and whenever the panel opens.
  const THEME = { on: false, ver: 0, source: "none", ready: false, timers: [] };
  function readTheme() {
    let ver = 0, name = "";
    try { ver = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--neondrift-theme"), 10) || 0; } catch (e) { /* ignore */ }
    try { name = String((window.Spicetify && Spicetify.Config && Spicetify.Config.current_theme) || ""); } catch (e) { /* ignore */ }
    const byName = /^neondrift$/i.test(name.trim());
    return { on: ver >= 1 || byName, ver, source: ver >= 1 ? "marker" : byName ? "config" : "none" };
  }
  /** re-reads the theme; true when it changed (then the contract is written / removed) */
  function checkTheme() {
    if (S.destroyed) return false;
    const r = readTheme(), changed = r.on !== THEME.on;
    THEME.ver = r.ver;
    THEME.source = r.source;
    THEME.on = r.on;
    if (changed && THEME.ready) onThemeChange();
    return changed;
  }
  function onThemeChange() {
    dbg("theme", THEME.on ? "on (" + THEME.source + ", v" + THEME.ver + ")" : "off");
    if (THEME.on) {
      if (CFG.wallpaper.mode === "default" && !WP.url) { WP.url = builtinWall(); WP.kind = "default"; }
      setWallVars();                                   // writes the contract (writeLookVars)
      if (WP.stale || !WP.url) { WP.stale = false; applyWallpaper("theme"); }
    } else {
      writeLookVars();                                 // removes it
      endWallBoot();
    }
    if (el.panel) { syncPanel(); }
  }
  function scheduleThemeChecks() {
    for (const ms of [1500, 5000, 15000, 60000]) THEME.timers.push(setTimeout(checkTheme, ms));
  }
  checkTheme();
