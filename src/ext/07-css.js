
  // ---- the extension's own styles ----------------------------------------------------------------
  // src/css (overlay, panel, top-bar button, own tooltip), embedded by the build. Appended as the LAST children of
  // <body>: after Spotify's stylesheets (<head>, also the ones it adds per route) and after the theme's user.css, so an
  // equal-specificity rule of ours wins as it did inside user.css. <style id="nda-vars"> follows with the colours
  // (written by applyPalette / setWallVars, scoped to our own nodes).
  const ND_CSS = __ND_CSS__;
  const CSS_NODES = { css: null, vars: null };
  function injectCss() {
    const host = document.body || document.documentElement;
    if (!CSS_NODES.css) {
      const st = document.createElement("style");
      st.id = "nda-css";
      st.textContent = ND_CSS;
      CSS_NODES.css = st;
    }
    if (!CSS_NODES.vars) {
      const st = document.createElement("style");
      st.id = "nda-vars";
      CSS_NODES.vars = st;
    }
    // a newer copy (dev hot swap) replaces the nodes in place
    for (const k of ["css", "vars"]) {
      const old = document.getElementById(CSS_NODES[k].id);
      if (old && old !== CSS_NODES[k]) old.replaceWith(CSS_NODES[k]);
      else if (!CSS_NODES[k].isConnected) host.appendChild(CSS_NODES[k]);
    }
  }
  function removeCss() {
    for (const k of ["css", "vars"]) { if (CSS_NODES[k]) CSS_NODES[k].remove(); }
  }
  injectCss();
