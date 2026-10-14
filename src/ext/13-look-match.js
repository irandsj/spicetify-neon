  // ---- look: "Combinar com o wallpaper" ---------------------------------------------
  /** two vivid, distinct colours of a picture: weighted k-means (k = 6) on a
      56 px copy, saturated / bright pixels weigh more, near-greys and
      near-blacks are skipped; the strongest cluster is a1, the strongest one
      at least ~38 deg of hue away is a2 (else a1 turned by 42 deg). Both are
      pushed to a vivid range (HSL S >= .6, L .55-.7), so they read on navy. */
  function extractPair(src) {
    const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
    if (!iw || !ih) return null;
    const n = 56, w = iw >= ih ? n : Math.max(8, Math.round((n * iw) / ih)), h = iw >= ih ? Math.max(8, Math.round((n * ih) / iw)) : n;
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const c = cv.getContext("2d", { willReadFrequently: true });
    c.drawImage(src, 0, 0, w, h);
    const d = c.getImageData(0, 0, w, h).data;       // throws on a cross-origin picture
    const px = [], wt = [];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const v = mx / 255, s = mx ? (mx - mn) / mx : 0;
      if (v < 0.14 || s < 0.16) continue;
      px.push(r, g, b);
      wt.push(Math.pow(s, 1.6) * (0.3 + v));
    }
    const N = wt.length;
    if (N < 12) return null;
    const K = 6, sq = (i, C) => { const a = px[i * 3] - C[0], b = px[i * 3 + 1] - C[1], e = px[i * 3 + 2] - C[2]; return a * a + b * b + e * e; };
    const cen = [];
    let best = 0;
    for (let i = 1; i < N; i++) if (wt[i] > wt[best]) best = i;
    cen.push([px[best * 3], px[best * 3 + 1], px[best * 3 + 2]]);
    const dist = new Float64Array(N).fill(Infinity);
    while (cen.length < K) {                        // farthest-point seeding (deterministic)
      const C = cen[cen.length - 1];
      let far = 0, fv = -1;
      for (let i = 0; i < N; i++) { const dd = sq(i, C); if (dd < dist[i]) dist[i] = dd; const v = dist[i] * wt[i]; if (v > fv) { fv = v; far = i; } }
      cen.push([px[far * 3], px[far * 3 + 1], px[far * 3 + 2]]);
    }
    let acc = null;
    for (let it = 0; it < 10; it++) {
      acc = cen.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < N; i++) {
        let bk = 0, bd = Infinity;
        for (let k = 0; k < K; k++) { const dd = sq(i, cen[k]); if (dd < bd) { bd = dd; bk = k; } }
        const a = acc[bk], q = wt[i];
        a[0] += px[i * 3] * q; a[1] += px[i * 3 + 1] * q; a[2] += px[i * 3 + 2] * q; a[3] += q;
      }
      for (let k = 0; k < K; k++) if (acc[k][3] > 0) cen[k] = [acc[k][0] / acc[k][3], acc[k][1] / acc[k][3], acc[k][2] / acc[k][3]];
    }
    const cl = cen.map((C, k) => ({ c: C, score: acc[k][3] * (0.4 + rgbHsv(C)[1]) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!cl.length) return null;
    const first = cl[0].c;
    const other = cl.slice(1).find((x) => x.score > cl[0].score * 0.1 && hueDist(x.c, first) >= 38);
    const hv = rgbHsv(first);
    const second = other ? other.c : hsvRgb((hv[0] + 42) % 360, hv[1], hv[2]);
    const vivid = (C) => { const [H, S2, L] = rgbHsl(C); return hslRgb(H, clamp(Math.max(S2, 0.6), 0, 0.95), clamp(L, 0.55, 0.7)); };
    return [rgbHex(vivid(first)), rgbHex(vivid(second))];
  }
  /** the picture behind the current wallpaper, readable by a canvas */
  function wallPixels() {
    if (WP.kind === "cover" && WP.coverBmp) return Promise.resolve(WP.coverBmp);
    return new Promise((res, rej) => {
      const img = new Image();
      if (WP.kind === "cover-raw") img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("load"));
      img.src = WP.url;
    });
  }
  function matchWallpaper(fromClick) {
    const token = ++LOOK.matchToken;
    return wallPixels().then((img) => {
      if (token !== LOOK.matchToken) return null;
      const pair = extractPair(img);
      if (!pair) {
        if (fromClick) try { Spicetify.showNotification(tr("toast.match.noColors")); } catch (e) { /* ignore */ }
        return null;
      }
      if (!fromClick) {
        if (CFG.colors.preset !== "wall") return pair;
        CFG.colors.auto = pair;                      // automatic: not a user action
        scheduleLook();
        saveSettings(false);
        if (el.panel && S.panelOpen) syncLook();
        return pair;
      }
      const next = clone(CFG);
      next.colors.auto = pair;
      next.colors.preset = "wall";
      applySettings(next, true);
      return pair;
    }).catch(() => {
      if (fromClick) try { Spicetify.showNotification(tr("toast.match.fail")); } catch (e) { /* ignore */ }
      return null;
    });
  }

  /** at load: the saved pair at once (before Spotify paints); a saved picture or cover hides the layout's wallpaper
      layer until it is ready (at most 4 s). Without the NeonDrift theme the wallpaper only shows in ambient mode, so it
      is loaded when it is needed (prepare) */
  function bootLook() {
    applyPalette(true);
    LOOK.wallKey = CFG.wallpaper.mode + "|" + (CFG.wallpaper.file ? CFG.wallpaper.file.at : 0);
    if (CFG.wallpaper.mode === "default" && THEME.on) WP.url = builtinWall();
    setWallVars();
    THEME.ready = true;
    if (!THEME.on) { WP.stale = true; return; }
    if (CFG.wallpaper.mode !== "default") {
      document.documentElement.setAttribute("data-nd-wall", "loading");
      LOOK.bootTimer = setTimeout(() => {
        if (CFG.wallpaper.mode === "cover" && WP.kind === "default") applyWallpaper("timeout");
        endWallBoot();
      }, 4000);
      applyWallpaper("boot");
    }
  }
  bootLook();

