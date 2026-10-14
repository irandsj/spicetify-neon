  // ---- look: palette + wallpaper state ---------------------------------------------
  const LOOK = { pairKey: "", ver: 0, vars: null, palCss: "", wallCss: "", ndaCss: "", ndaWallCss: "", wallKey: "", raf: 0, timer: 0, lastAt: 0, bootTimer: 0, matchToken: 0, paintKey: "", paintTimer: 0 };
  let PAL = null;                   // canvas colours of the current pair (makePalette().pal)
  const WP = {                      // the wallpaper being shown
    url: "", kind: "default", type: "",   // kind: default | file | cover | cover-raw (cross-origin: the raw cover URL)
    fileUrl: "", fileType: "", fileToken: 0,
    coverSrc: "", coverObj: "", coverBmp: null, coverThumb: "",
    token: 0, note: "",
    stale: false,                   // without the NeonDrift theme the picture is (re)loaded only when it is shown
  };

  function lookPair() {
    const c = CFG.colors;
    if (c.preset === "custom") return c.custom;
    if (c.preset === "wall" && c.auto) return c.auto;
    const p = PRESETS.find((x) => x.id === c.preset) || PRESETS[0];
    return [p.a1, p.a2];
  }
  /** the theme contract (<style id="nd-look-vars">, html:root: only while the NeonDrift theme is on) and our own
      nodes' colours / overlay wallpaper (<style id="nda-vars">, always) */
  function writeLookVars() {
    let st = document.getElementById("nd-look-vars");
    if (THEME.on) {
      if (!st) {
        st = document.createElement("style");
        st.id = "nd-look-vars";
        (document.head || document.documentElement).appendChild(st);
      }
      const css = "html:root{" + LOOK.palCss + LOOK.wallCss + "}";
      if (st.textContent !== css) st.textContent = css;
    } else if (st) st.remove();
    const v = CSS_NODES.vars;
    if (v) {
      const css = "#nd-ambient,#nd-amb-panel,.nd-amb-topbtn,.nd-amb-tippop{" + LOOK.ndaCss + "}#nd-ambient{" + LOOK.ndaWallCss + "}";
      if (v.textContent !== css) v.textContent = css;
    }
  }
  /** writes the accent variables (the whole theme with the NeonDrift theme, our own nodes always) and refreshes the
      canvas colours */
  function applyPalette(force) {
    const [h1, h2] = lookPair(), key = h1 + h2;
    if (!force && key === LOOK.pairKey) return false;
    LOOK.pairKey = key;
    const P = makePalette(h1, h2);
    P.pal.ver = ++LOOK.ver;          // part of the views' layout key: gradients are rebuilt on the next frame
    PAL = P.pal;
    LOOK.vars = P.vars;
    LOOK.palCss = Object.keys(P.vars).map((k) => k + ":" + P.vars[k] + ";").join("");
    LOOK.ndaCss = Object.keys(P.vars).map((k) => "--nda-" + k.slice(5) + ":" + P.vars[k] + ";").join("");
    writeLookVars();
    return true;
  }
  /** "Desfoque do layout" (px) split into the panels' glass (the first GLASS_BLUR px, a backdrop blur behind
      each panel) and the wallpaper layer itself, in quadrature, so the wallpaper seen behind a panel is blurred
      by exactly that many px and 0 means sharp everywhere (v3's look = 3) */
  function layoutBlurParts(px) {
    const glass = Math.min(px, GLASS_BLUR);
    return { glass, wall: px > GLASS_BLUR ? Math.sqrt(px * px - GLASS_BLUR * GLASS_BLUR) : 0 };
  }
  /** r2: the two "Desfoque" values in use and their settings keys: "Capa do álbum" keeps its own pair
      (coverLayoutBlur / coverAmbBlur, default 40 px, v3's soft colour wash), the other wallpapers share one */
  function wallBlur() {
    const W = CFG.wallpaper, c = W.mode === "cover";
    return { layout: c ? W.coverLayoutBlur : W.layoutBlur, amb: c ? W.coverAmbBlur : W.ambBlur, cover: c,
      kL: c ? "coverLayoutBlur" : "layoutBlur", kA: c ? "coverAmbBlur" : "ambBlur" };
  }
  /** "Escurecer" / "Desfoque" and the picture, as CSS variables: the layout's (theme contract) and the overlay's
      CSS layer (GIFs / animated pictures) */
  function setWallVars() {
    const W = CFG.wallpaper, B = wallBlur(), dim = W.dim / 100, L = layoutBlurParts(B.layout);
    const pic = WP.url ? 'url("' + String(WP.url).replace(/["\\\n\r]/g, "") + '")' : "none";
    LOOK.wallCss =
      "--nd-wallpaper:" + pic + ";" +
      "--nd-wall-dim:" + dim + ";--nd-wall-blur:" + +L.wall.toFixed(2) + "px;--nd-blur:" + L.glass + "px;";
    LOOK.ndaWallCss =
      "--nda-wallpaper:" + pic + ";" +
      "--nda-amb-wall-blur:" + B.amb + "px;" +
      "--nda-amb-wall-bright:" + (0.72 * (1 - dim * 0.55)).toFixed(3) + ";";
    writeLookVars();
  }
  const wallPaintKey = () => CFG.wallpaper.dim + "|" + wallBlur().amb + "|" + innerWidth + "x" + innerHeight;
  /** what the settings say vs what is applied: palette now, wallpaper when its source changed */
  function applyLook() {
    applyPalette(false);
    const W = CFG.wallpaper, key = W.mode + "|" + (W.file ? W.file.at : 0);
    if (key !== LOOK.wallKey) { LOOK.wallKey = key; applyWallpaper("settings"); }
    else setWallVars();
    if (S.wall === "ready" && S.wallImg && LOOK.paintKey !== wallPaintKey()) scheduleWallPaint();
  }
  /** with the NeonDrift theme a new pair restyles Spotify's whole page (~6,400 elements, 50-100 ms),
      so while a slider is dragged (S.lookDrag) it happens at most every
      LOOK_THROTTLE_MS; the panel's own chips / gradient bar / thumbs follow
      every input at once, and the slider's "change" (release) applies the
      final value right away */
  const LOOK_THROTTLE_MS = 125;
  function scheduleLook() {
    if (document.hidden) { applyLook(); return; }
    if (LOOK.raf || LOOK.timer) return;
    const go = () => { LOOK.timer = 0; LOOK.raf = requestAnimationFrame(() => { LOOK.raf = 0; LOOK.lastAt = now(); applyLook(); }); };
    const wait = S.lookDrag ? LOOK_THROTTLE_MS - (now() - (LOOK.lastAt || 0)) : 0;
    if (wait > 0) LOOK.timer = setTimeout(go, wait); else go();
  }

  function preloadImage(url) {
    return new Promise((res) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = () => res(img);
      img.src = url;
      setTimeout(() => res(img), 5000);
    });
  }
  /** shows the wallpaper of CFG.wallpaper.mode (async: IndexedDB / cover fetch) */
  function applyWallpaper(reason) {
    const token = ++WP.token, mode = CFG.wallpaper.mode;
    const done = (url, kind, type) => {
      if (token !== WP.token) return;
      preloadImage(url).then(() => {        // the old picture stays until the new one is decoded
        if (token !== WP.token) return;
        const changed = url !== WP.url || kind !== WP.kind;
        const oldCover = WP.kind === "cover" && WP.url !== url ? WP.url : "";
        WP.url = url; WP.kind = kind; WP.type = type || "";
        setWallVars();
        endWallBoot();
        if (oldCover && oldCover !== WP.coverObj) setTimeout(() => URL.revokeObjectURL(oldCover), 1500);
        if (changed) onWallChanged();
        syncLook();
      });
    };
    WP.note = "";
    if (mode === "file") {
      loadFileWall().then((f) => {
        if (!f) WP.note = "nofile";
        done(f ? f.url : builtinWall(), f ? "file" : "default", f ? f.type : "");
      }, () => { WP.note = "nofile"; done(builtinWall(), "default"); });
    } else if (mode === "cover") {
      const item = currentItem(), u = item ? metaOf(item).cover : "";
      if (!u) {
        if (reason === "boot" || (reason === "init" && !item)) return;   // the player is not ready yet: songchange / the boot timer decide
        WP.note = "nocover";
        fallbackWall(done);                                              // the stored picture, else the neon gradient
        return;
      }
      WP.coverThumb = thumbOf(item) || u;
      coverWall(u).then((c) => {
        if (token !== WP.token) { releaseCover(c); return; }       // a newer track won meanwhile
        commitCover(c);
        done(c.url, c.kind);
      }, () => done(u, "cover-raw"));
    } else done(builtinWall(), "default");
  }
  function endWallBoot() {
    clearTimeout(LOOK.bootTimer);
    if (document.documentElement.hasAttribute("data-nd-wall")) document.documentElement.removeAttribute("data-nd-wall");
  }
  function onWallChanged() {
    if (el.root && S.wall !== "none") ensureWallpaper();          // the overlay repaints its blurred copies
    if (CFG.colors.preset === "wall") matchWallpaper(false);      // colours that follow the wallpaper
  }

  /** the album cover as a 16:9 picture (cropped once per track, same-origin so "Combinar com o
      wallpaper" can read it; not pre-blurred: the "Desfoque" sliders blur it like any other wallpaper, so 0 is
      sharp; 1920 x 1080 with high-quality smoothing, so a low blur shows a smooth enlargement instead of the stair
      steps of a 2x CSS upscale); its ImageBitmap feeds the overlay */
  async function coverWall(u) {
    if (WP.coverSrc === u && WP.coverObj) return { url: WP.coverObj, kind: "cover", cached: true };
    const r = await fetch(u, { mode: "cors", credentials: "omit" });
    if (!r.ok) throw new Error("cover " + r.status);
    const bmp = await createImageBitmap(await r.blob());
    const W = 1920, H = 1080, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    c.fillStyle = "#020713";
    c.fillRect(0, 0, W, H);
    const s = Math.max(W / bmp.width, H / bmp.height);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.filter = "saturate(1.15)";
    c.drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    c.filter = "none";
    const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", 0.92));
    if (!blob) { try { bmp.close(); } catch (e) { /* ignore */ } throw new Error("toBlob"); }
    return { url: URL.createObjectURL(blob), kind: "cover", bmp, src: u };
  }
  /** the new cover becomes the current one; the previous bitmap / URL are
      released unless they are what is on screen (done() revokes that one
      once the new picture shows) */
  function commitCover(c) {
    if (c.cached) return;
    if (WP.coverBmp && WP.coverBmp !== c.bmp && S.wallImg !== WP.coverBmp) try { WP.coverBmp.close(); } catch (e) { /* ignore */ }
    if (WP.coverObj && WP.coverObj !== WP.url && WP.coverObj !== c.url) URL.revokeObjectURL(WP.coverObj);
    WP.coverBmp = c.bmp;
    WP.coverSrc = c.src;
    WP.coverObj = c.url;
  }
  /** a cover made for a track that was skipped before it could show */
  function releaseCover(c) {
    if (c.cached) return;
    try { c.bmp.close(); } catch (e) { /* ignore */ }
    URL.revokeObjectURL(c.url);
  }
  function thumbOf(item) {
    if (!item || !Array.isArray(item.images)) return "";
    const s = item.images.find((i) => i && i.label === "standard") || item.images.find((i) => i && i.label === "large") || item.images[0];
    return imageUrl(s && s.url);
  }

