  // ---- overlay DOM ---------------------------------------------------------------
  function build() {
    if (el.root) return;
    const root = document.createElement("div");
    root.id = "nd-ambient";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="nd-amb__cam">' +
        '<div class="nd-amb__drift"><canvas class="nd-amb__wall nd-amb__wall--blur"></canvas>' +
        '<canvas class="nd-amb__wall nd-amb__wall--sharp"></canvas><div class="nd-amb__wall-css"></div></div>' +
        '<div class="nd-amb__veil"></div><div class="nd-amb__elcalm"></div><div class="nd-amb__elvig"></div>' +
        '<div class="nd-amb__flash"></div><div class="nd-amb__flash nd-amb__flash--hot"></div>' +
        '<div class="nd-amb__stage"><div class="nd-amb__viz"><div class="nd-amb__bloom"></div><canvas class="nd-amb__bars"></canvas></div>' +
        '<div class="nd-amb__metawrap"><div class="nd-amb__meta"><img class="nd-amb__cover" alt="" decoding="async" draggable="false">' +
        '<div class="nd-amb__text"><div class="nd-amb__title"></div><div class="nd-amb__artist"></div></div></div></div></div>' +
      '</div>' +
      '<div class="nd-amb__hint"></div>' +
      '<div class="nd-amb__note" aria-hidden="true"></div>';
    el.root = root;
    el.cam = root.querySelector(".nd-amb__cam");
    el.metaWrap = root.querySelector(".nd-amb__metawrap");
    el.wall = root.querySelector(".nd-amb__wall--blur");
    el.sharp = root.querySelector(".nd-amb__wall--sharp");
    el.flash = root.querySelector(".nd-amb__flash");
    el.flashHot = root.querySelector(".nd-amb__flash--hot");
    el.drift = root.querySelector(".nd-amb__drift");
    el.elCalm = root.querySelector(".nd-amb__elcalm");      // v5b: breakdown veil / riser vignette (opacity 0 when off)
    el.elVig = root.querySelector(".nd-amb__elvig");
    el.viz = root.querySelector(".nd-amb__viz");
    el.bloom = root.querySelector(".nd-amb__bloom");
    el.bars = root.querySelector(".nd-amb__bars");
    el.meta = root.querySelector(".nd-amb__meta");
    el.cover = root.querySelector(".nd-amb__cover");
    el.title = root.querySelector(".nd-amb__title");
    el.artist = root.querySelector(".nd-amb__artist");
    el.note = root.querySelector(".nd-amb__note");      // the soft mode's note
    el.hint = root.querySelector(".nd-amb__hint");
    setRootLang();
    V.main = makeView(el.bars, "main");
    // the overlay swallows the wake-up click / right click
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
    root.addEventListener("mousedown", swallow);
    root.addEventListener("click", swallow);
    root.addEventListener("dblclick", swallow);
    root.addEventListener("contextmenu", swallow);
    el.dom = { bloom: -1, zoom: -1, focus: -1, flash: -1, hot: -1, vs: -1, bob: -1, elCalm: 0, elVig: 0, creep: 1 };
    setRootStyle();
    document.body.appendChild(root);
  }

  /** the overlay's texts and lang attribute follow the language */
  function setRootLang() {
    if (!el.root) return;
    el.root.setAttribute("lang", LANG);
    el.root.setAttribute("dir", "ltr");   // only LTR languages ship; don't inherit Spotify's dir="rtl"
    if (el.hint) el.hint.textContent = tr("overlay.testHint");
  }
  function setRootStyle() {
    if (!el.root) return;
    let changed = false;
    for (const id of STYLE_IDS) {
      const on = CFG.style === id;
      if (el.root.classList.contains("nd-amb--style-" + id) !== on) { el.root.classList.toggle("nd-amb--style-" + id, on); changed = true; }
    }
    if (changed) S.metaGeo = null;      // the title block moves with the layout
  }

  /** pre-blur the current wallpaper (WP: default / picture from the computer /
      album cover) once into two small canvases: the soft one shown all the
      time and a sharper one that the "focus pull" fades in on hits. Called
      again when the wallpaper changes (e.g. "Capa do álbum" on a new track):
      the old picture stays until the new one is decoded, then (overlay on
      screen) it fades through dark into the new one. GIFs use the CSS layer
      (.nd-amb__wall-css), which keeps them animated. */
  function ensureWallpaper() {
    const key = WP.url;
    if (S.wall !== "none" && S.wallKey === key) return;
    build();
    S.wallKey = key;
    const token = S.wallToken = (S.wallToken || 0) + 1;
    const root = el.root;
    const toCss = () => {
      if (token !== S.wallToken) return;
      S.wall = "css";
      S.wallImg = null;
      root.classList.remove("nd-amb--wall-ready");
      root.classList.add("nd-amb--wall-css");
    };
    if (WP.type === "image/gif" || (WP.kind === "file" && CFG.wallpaper.file && CFG.wallpaper.file.anim)) { toCss(); return; }
    const wasReady = S.wall === "ready";
    if (!wasReady) S.wall = "loading";
    let pick;
    if (WP.kind === "cover" && WP.coverBmp) pick = Promise.resolve(WP.coverBmp);
    else {
      const img = new Image();
      img.decoding = "async";
      img.src = key;
      pick = img.decode().then(() => img);
    }
    pick.then((img) => {
      if (token !== S.wallToken) return;
      const show = () => {
        if (token !== S.wallToken) return;
        S.wallImg = img;
        paintWall();
        S.wall = "ready";
        root.classList.remove("nd-amb--wall-css");
        root.classList.add("nd-amb--wall-ready");
      };
      if (wasReady && isActive() && !root.classList.contains("nd-amb--wall-css")) {
        root.classList.remove("nd-amb--wall-ready");   // 600 ms opacity transition (src/css/ambient.css)
        setTimeout(show, 320);
      } else show();
    }).catch(toCss);
  }
  /** paints S.wallImg into the two overlay canvases with "Escurecer" / "Desfoque no modo ambiente".
      The canvases are shown with object-fit: cover over the drift layer (110% of the window), so a
      blur of A window px is A x (canvas width / shown width) canvas px. A soft picture does not need
      the full resolution (cheaper); a sharp one gets it (0 px = the picture as it is, no filter). The
      focus-pull copy is 0.45 x as soft (v3's ratio), so at 0 px both are equal and the pull is a no-op. */
  function paintWall() {
    const img = S.wallImg;
    if (!img || !el.wall) return;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const W = CFG.wallpaper, A = wallBlur().amb, b = 1 - (W.dim / 100) * 0.55;
    LOOK.paintKey = wallPaintKey();
    const vw = (el.root && el.root.offsetWidth) || innerWidth || 1920, vh = (el.root && el.root.offsetHeight) || innerHeight || 1080;
    const shownW = Math.max(vw * 1.1, vh * 1.1 * (iw / ih));          // CSS px across the canvas once it is shown
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const padFrac = A > 0 ? (2.2 * A) / shownW : 0;                     // overscan hides the blur's soft edge (same in both)
    const paint = (cv, blurPx, filter) => {
      const q = blurPx < 2 ? 1 : clamp(5 / blurPx, 0.32, 1);           // a 20 px blur hides a 3x upscale
      const w = Math.max(64, Math.round(Math.min(iw, 4096, shownW * dpr * q)));
      const h = Math.max(1, Math.round((w * ih) / iw));
      const c = cv.getContext("2d");
      cv.width = w;
      cv.height = h;
      const k = w / shownW, pad = padFrac * w;                           // canvas px per CSS px
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      const f = (blurPx > 0 ? "blur(" + (blurPx * k).toFixed(2) + "px) " : "") + filter;
      c.filter = f;
      c.drawImage(img, -pad, -pad, w + pad * 2, h + pad * 2);
      c.filter = "none";
      cv.dataset.blur = String(+(blurPx).toFixed(2));                    // CSS px (debug / tests)
      cv.dataset.filter = f;
    };
    paint(el.wall, A, "saturate(1.18) brightness(" + (0.74 * b).toFixed(3) + ")");
    // the focus pull: 0.45 x as soft, a lens breathing, not a strobe
    paint(el.sharp, A * 0.45, "saturate(" + (1.18 + 0.02 * Math.min(1, A / 10)).toFixed(3) + ") brightness(" + ((0.74 + 0.04 * Math.min(1, A / 10)) * b).toFixed(3) + ")");
    paintAmbPreview();
  }
  /** the "Wallpaper" tab's preview of the ambient background ("Desfoque no modo ambiente", "Escurecer"): a 1:1
      crop of the overlay's own blurred copy around the middle of the screen, so 29 px look like 29 px on screen
      (a scaled-down picture would hide the blur); a GIF / animated picture: its current frame, blurred the same way */
  function paintAmbPreview() {
    const R = el.pRef;
    if (!R || !R.ambPv || !S.panelOpen || S.tab !== "wall") return;
    const cv = R.ambPv, w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = "#020713";
    c.fillRect(0, 0, w, h);
    const vw = (el.root && el.root.offsetWidth) || innerWidth || 1920, vh = (el.root && el.root.offsetHeight) || innerHeight || 1080;
    let kind = "none";
    if (S.wall === "ready" && el.wall && el.wall.width) {
      const iw = el.wall.width, ih = el.wall.height, k = Math.max((vw * 1.1) / iw, (vh * 1.1) / ih);   // CSS px per canvas px
      const sw = Math.min(iw, w / k), sh = Math.min(ih, h / k), spot = detailSpot(S.wallImg, sw / iw, sh / ih);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(el.wall, clamp(spot.fx * iw - sw / 2, 0, iw - sw), clamp(spot.fy * ih - sh / 2, 0, ih - sh), sw, sh, 0, 0, w, h);
      kind = "canvas";
    } else if (S.wall === "css" && WP.url) {
      if (S.pvWallKey !== WP.url) { S.pvWallKey = WP.url; S.pvWall = new Image(); S.pvWall.decoding = "async"; S.pvWall.onload = () => paintAmbPreview(); S.pvWall.src = WP.url; }
      const im = S.pvWall;
      if (im && im.complete && im.naturalWidth) {
        const s = Math.max((vw * 1.1) / im.naturalWidth, (vh * 1.1) / im.naturalHeight), A = wallBlur().amb;
        c.filter = (A > 0 ? "blur(" + A + "px) " : "") + "brightness(" + (0.72 * (1 - (CFG.wallpaper.dim / 100) * 0.55)).toFixed(3) + ")";
        c.drawImage(im, (w - im.naturalWidth * s) / 2, (h - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s);
        c.filter = "none";
        kind = "css";
      }
    }
    cv.dataset.kind = kind;
    cv.dataset.blur = String(wallBlur().amb);
  }
  /** where the ambient preview looks: the part of the picture with the most detail (edges), so the blur shows; a
      96 px thumbnail of the source is scored once per picture and crop size (fw / fh = the crop's share) */
  function detailSpot(img, fw, fh) {
    const key = fw.toFixed(3) + "x" + fh.toFixed(3);
    if (S.pvSpot && S.pvSpot.img === img && S.pvSpot.key === key) return S.pvSpot;
    let spot = { fx: 0.5, fy: 0.5 };
    try {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, W = 96, H = Math.max(8, Math.round((96 * ih) / iw));
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const c = cv.getContext("2d", { willReadFrequently: true });
      c.drawImage(img, 0, 0, W, H);
      const d = c.getImageData(0, 0, W, H).data, L = new Float32Array(W * H), I = new Float64Array((W + 1) * (H + 1));
      for (let i = 0; i < W * H; i++) L[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // gradient energy, summed into an integral image
        const i = y * W + x, g = (x + 1 < W ? Math.abs(L[i + 1] - L[i]) : 0) + (y + 1 < H ? Math.abs(L[i + W] - L[i]) : 0);
        I[(y + 1) * (W + 1) + x + 1] = g + I[y * (W + 1) + x + 1] + I[(y + 1) * (W + 1) + x] - I[y * (W + 1) + x];
      }
      const bw = clamp(Math.round(fw * W), 2, W), bh = clamp(Math.round(fh * H), 2, H);
      let best = -1;
      for (let y0 = Math.round(0.08 * H); y0 + bh <= Math.round(0.92 * H); y0++) for (let x0 = Math.round(0.08 * W); x0 + bw <= Math.round(0.92 * W); x0++) {
        const sum = I[(y0 + bh) * (W + 1) + x0 + bw] - I[y0 * (W + 1) + x0 + bw] - I[(y0 + bh) * (W + 1) + x0] + I[y0 * (W + 1) + x0];
        const cx = (x0 + bw / 2) / W - 0.5, cy = (y0 + bh / 2) / H - 0.5, sc = sum * (1 - 0.6 * Math.hypot(cx, cy));   // a little bias to the middle
        if (sc > best) { best = sc; spot = { fx: (x0 + bw / 2) / W, fy: (y0 + bh / 2) / H }; }
      }
    } catch (e) { /* a tainted / undecodable picture: the middle */ }
    S.pvSpot = Object.assign(spot, { img, key });
    return spot;
  }
  function scheduleWallPaint() {
    clearTimeout(LOOK.paintTimer);
    LOOK.paintTimer = setTimeout(() => { if (S.wall === "ready") paintWall(); }, 120);
  }

  function prepare() {
    build();
    if (WP.stale) { WP.stale = false; applyWallpaper("prepare"); }   // without the NeonDrift theme: loaded when needed
    ensureWallpaper();
    const item = currentItem();
    if (item) ensureAnalysis(item.uri);
    refreshOutSel(false);
  }

  function imageUrl(u) {
    if (!u || typeof u !== "string") return "";
    if (u.startsWith("spotify:image:")) return "https://i.scdn.co/image/" + u.slice(14);
    if (/^https:\/\//.test(u)) return u;
    return "";
  }

  function metaOf(item) {
    const m = (item && item.metadata) || {};
    const title = (item && item.name) || m.title || "";
    let artist = "";
    if (item && Array.isArray(item.artists) && item.artists.length) artist = item.artists.map((a) => a && a.name).filter(Boolean).join(", ");
    if (!artist) artist = m.artist_name || m.album_title || "";
    let url = "";
    if (item && Array.isArray(item.images)) {
      const big = item.images.find((i) => i && i.label === "xlarge") || item.images.find((i) => i && i.label === "large") ||
        item.images.find((i) => i && i.label === "standard") || item.images[0];
      url = imageUrl(big && big.url);
    }
    if (!url) url = imageUrl(m.image_xlarge_url || m.image_large_url || m.image_url);
    return { title, artist, cover: url };
  }

  function setCanvasCover(url) {
    if (url === cover.url) return;
    cover.prev = cover.img && ready(cover.img) ? cover.img : null;
    cover.swapAt = now();
    cover.url = url;
    if (!url) { cover.img = null; return; }
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    cover.img = img;
  }

  function applyMeta(info) {
    el.title.textContent = info.title;
    el.artist.textContent = info.artist;
    S.metaGeo = null;                   // the title's width changed (maskTitle)
    if (info.cover) {
      if (el.cover.getAttribute("src") !== info.cover) el.cover.src = info.cover;
      el.cover.classList.remove("nd-amb--nocover");
    } else {
      el.cover.removeAttribute("src");
      el.cover.classList.add("nd-amb--nocover");
    }
    setCanvasCover(info.cover);
  }

  /** cover / title / artist; on a track change while visible: cross-fade
      (fade out, wait for the new cover to decode, fade in) */
  function updateMeta(immediate) {
    build();
    const item = currentItem();
    const uri = item ? item.uri : null;
    if (uri === S.metaUri && !immediate) return;
    S.metaUri = uri;
    const info = metaOf(item);
    const token = ++S.metaToken;
    if (immediate || S.phase === "off") {
      el.meta.classList.remove("nd-amb--swap");
      applyMeta(info);
      return;
    }
    el.meta.classList.add("nd-amb--swap");
    const pre = new Promise((res) => {
      if (!info.cover) return res();
      const img = new Image();
      img.src = info.cover;
      img.decode().then(res, res);
      setTimeout(res, 2500);
    });
    Promise.all([pre, new Promise((r) => setTimeout(r, 240))]).then(() => {
      if (token !== S.metaToken) return;
      applyMeta(info);
      setTimeout(() => { if (token === S.metaToken) el.meta.classList.remove("nd-amb--swap"); }, 30);
    });
  }

  // ---- the first-run hint ------------------------------------------------------------
  /** true once: on a new install (FIRST_RUN), the first time ambient mode starts by itself (marked in INTRO_KEY) */
  function introWanted() {
    if (!FIRST_RUN || S.introShown) return false;
    try {
      if (localStorage.getItem(INTRO_KEY)) return false;
      localStorage.setItem(INTRO_KEY, "1");
    } catch (e) { return false; }
    S.introShown = true;
    return true;
  }
  const INTRO_WHERE = { top: "overlay.introWhere.top", playbar: "overlay.introWhere.playbar", menu: "overlay.introWhere.menu", shortcut: "overlay.introWhere.shortcut" };
  /** "Ambient mode · move the mouse to go back · settings: <the way in that exists here>" */
  function introText() {
    const k = topShown() ? "top" : playBtn ? "playbar" : menuSettings ? "menu" : "shortcut";
    return tr("overlay.intro", { where: tr(INTRO_WHERE[k]) });
  }

  // ---- enter / exit ----------------------------------------------------------------
  function enter(reason) {
    if (S.destroyed || isActive()) return false;
    if (S.panelOpen) closePanel(false);
    prepare();
    clearTimeout(S.fadeTimer);
    const wasExiting = S.phase === "exiting";
    S.phase = "entering";
    S.enterReason = reason || "api";
    S.stats.enters++;
    S.anchorX = S.mouseX;
    S.anchorY = S.mouseY;
    S.blockedBy = null;
    syncClock(true);
    S.demo = reason === "test" && !S.clock.playing ? { pos: S.clock.pos, at: now() } : null;
    updateMeta(true);
    const root = el.root;
    setRootStyle();
    root.classList.toggle("nd-amb--test", reason === "test" && S.reopenPanel > now());
    const intro = reason === "idle" && introWanted();     // a new install: the one-time hint
    root.classList.toggle("nd-amb--intro", intro);
    if (el.hint) el.hint.textContent = intro ? introText() : tr("overlay.testHint");
    root.classList.add("nd-amb--mounted");
    S.metaGeo = null;
    resizeMain();
    if (!wasExiting) {
      resetDyn(V.main);               // every part of the bars' state, the peak caps included
      SIG.main.gate = S.clock.playing || S.demo ? 1 : 0;
      void root.offsetWidth;          // commit display: block so the fade runs
    }
    root.classList.remove("nd-amb--leaving", "nd-amb--note");
    S.noteKey = null;                 // the soft mode's note shows once per entry and track
    root.classList.add("nd-amb--visible");
    S.fadeTimer = setTimeout(() => { if (S.phase === "entering") S.phase = "on"; }, FADE_IN_MS);
    startLoop();
    return true;
  }

  function exit(reason) {
    if (!isActive()) return false;
    S.phase = "exiting";
    S.lastExit = reason || "api";
    S.stats.exits++;
    S.lastActivity = now();
    S.graceUntil = 0;
    // still catches input while it fades, so the rest of the wake-up click
    // (mouseup / click) never lands on the app underneath
    el.root.classList.add("nd-amb--leaving");
    el.root.classList.remove("nd-amb--visible");
    clearTimeout(S.fadeTimer);
    S.fadeTimer = setTimeout(finishExit, FADE_OUT_MS + 50);
    return true;
  }

  function finishExit() {
    if (S.phase === "exiting") hardOff();
  }

  function hardOff() {
    clearTimeout(S.fadeTimer);
    const wasOn = S.phase !== "off";
    S.phase = "off";
    S.demo = null;
    S.lastPA = null;
    if (!S.panelOpen) stopLoop();
    if (el.root) el.root.classList.remove("nd-amb--visible", "nd-amb--leaving", "nd-amb--mounted", "nd-amb--test", "nd-amb--intro", "nd-amb--note");
    if (S.trace) finishTrace();
    // a test started from the panel ends back in the panel (test -> tune -> test)
    const reopen = wasOn && S.reopenPanel > now() && !S.destroyed && S.lastExit !== "disabled" && S.lastExit !== "panel";
    S.reopenPanel = 0;
    if (reopen) setTimeout(() => {
      if (S.destroyed || S.phase !== "off" || S.panelOpen) return;
      openPanel(false);
      const tab = S.testTab || "amb";             // the tab the test was started from
      setTab(tab, false);
      try { (tab === "wall" ? el.pRef.ambTest : el.pRef.test).focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }, 0);
  }

