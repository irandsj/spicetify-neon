
  // ---- one instance ------------------------------------------------------------
  // The newest copy wins, whatever the load order (a local install, a Marketplace install, the theme's "include", an
  // older theme.js-based NeonDrift): a release build steps aside for a running extension of the same or a newer
  // version; otherwise the running copy hands over (its _destroy) and this one takes its place. A dev build always
  // takes over (hot swap while developing).
  const ND_VERSION = __ND_VERSION__;
  const ND_DEV = __ND_DEV__;
  const FAULT = {};                 // dev build fault drills (_fault): an API that looks missing
  const verNum = (v) => String(v || "0").split(/[.+-]/).slice(0, 3).reduce((a, x) => a * 1000 + (parseInt(x, 10) || 0), 0);
  {
    const prev = window.NeonDriftAmbient;
    if (prev && prev.__ext && !ND_DEV && verNum(prev.version) >= verNum(ND_VERSION)) return;
    if (prev && typeof prev._destroy === "function") {
      try { prev._destroy({ handoff: true }); } catch (e) { /* ignore */ }
    }
  }
