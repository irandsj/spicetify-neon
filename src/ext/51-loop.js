  // ---- render loop (only while the overlay or the panel preview is shown) ------
  const loopWanted = () => !S.destroyed && !document.hidden && (S.phase !== "off" || S.panelOpen);
  function startLoop() {
    if (S.raf || !loopWanted()) return;
    S.lastFrame = 0;
    S.raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
  }
  /** a bass hit starts between the last drawn frame and this vsync: draw now
      instead of waiting for the next 60 fps slot (up to 16.7 ms late) */
  function hitDue(t) {
    if (S.phase === "off" || S.lastPA == null) return false;
    const item = currentItem(), A = analysisFor(item && item.uri);
    if (!A || !A.hitT || !A.hitT.length) return false;
    const pNow = mainPosition(t) - num(S.latEff, LATENCY_MS);
    const k = lastAtOrBefore(A.hitT, pNow);
    return k >= 0 && A.hitT[k] > S.lastPA && A.hitS[k] >= 0.25;
  }
  function frame(ts) {
    S.raf = 0;
    if (!loopWanted()) return;
    S.raf = requestAnimationFrame(frame);
    const t0 = now();
    // the cap and the refresh estimate use the frame's own vsync time (ts), so
    // a late callback (other extensions' work) cannot skip or double a frame
    const tf = typeof ts === "number" && ts > 0 && ts <= t0 + 1 ? ts : t0;
    if (S.lastTick) { const g = tf - S.lastTick; if (g > 2 && g < 50) S.vsync += (g - S.vsync) * 0.1; }   // display refresh
    S.lastTick = tf;
    if (S.lastFrame && tf - S.lastFrame < FRAME_BUDGET_MS - S.vsync / 2 && !hitDue(t0)) return;   // 60 fps cap (240 Hz displays: every 4th vsync)
    const gap = S.lastFrame ? tf - S.lastFrame : 0;
    const dt = S.lastFrame ? Math.min(100, gap) : 16.7;
    S.lastFrame = tf;
    if (S.hold) return;                               // debug: frozen frame for a screenshot
    if (t0 - S.clock.syncedAt > 250) syncClock(false);
    if (S.phase !== "off") renderMain(mainPosition(t0), dt, t0);
    if (S.panelOpen) renderPreview(dt, t0);
    const P = S.perf;
    P.cost[P.i] = now() - t0;
    P.gap[P.i] = gap;
    P.i = (P.i + 1) % P.cost.length;
    P.n = Math.min(P.n + 1, P.cost.length);
    if (S.holdReq && S.holdReq.test()) { S.hold = true; const r = S.holdReq; S.holdReq = null; r.resolve(r.info()); }
  }
  const mainPosition = (t) => (S.demo ? S.demo.pos + (t - S.demo.at) : positionAt(t));

  function onResize() {
    if (S.phase !== "off") resizeMain();
    if (S.panelOpen) positionPanel();
    if (S.wall === "ready" && S.wallImg && LOOK.paintKey !== wallPaintKey()) scheduleWallPaint();   // the sharp copy follows the window size
  }
  /** the strongest camera zoom of the current "Zoom na batida" setting (1 = off), and what the visualizer itself
      gets of a camera zoom z (VIZ_ZOOM_SHARE; applyFxDom gives it the inverse of the rest) */
  const zoomMax = () => 1 + ND_ZBUD * (CFG.zoom.on && !S.reducedMotion ? CFG.zoom.amount / 100 : 0);   // v5b-r2: the entry punch stays inside it
  const vizZoom = (z) => 1 + VIZ_ZOOM_SHARE * (z - 1);
  /** v5: the visualizer's strongest own scale = its share of the strongest camera kick x the groove's breathing
      (both can peak on the same beat), so "Alcance" 100 % still fits the window at 500 % zoom + 500 % groove */
  const vizScaleMax = () => vizZoom(zoomMax()) * (1 + GROOVE_SCALE * grooveAmt());
  /** the visualizer canvas: centred on the camera's zoom origin (VIS_CY of the window) and just big enough for
      the style's "Alcance" plus the overshoot and the glow (styleSize: the biggest hit, zoom included, stays inside
      the window; r2: the ring's side bars may be RING_SIDE_X longer, so its canvas is wider) */
  function vizBox(style) {
    const W = (el.cam && el.cam.offsetWidth) || innerWidth || 1600, H = (el.cam && el.cam.offsetHeight) || innerHeight || 900;
    const alc = CFG.reach[style] / 100, cy = VIS_CY * H, zmax = vizScaleMax();   // the visualizer's own strongest scale
    let w, h, S0 = 0;
    if (style === "bars") {
      const half = styleSize("bars", H, 0, alc, zmax);
      w = Math.min(W * 0.92, Math.max(Math.min(1180, W * 0.84), half * 2.6));
      h = 2 * (half * SAT_HI + 46);                     // + room for the glow
    } else if (style === "ring") {
      S0 = Math.min(Math.min(1180, W * 0.84), Math.min(620, H * 0.66));   // v3's ring box: the cover keeps its size
      const Z = styleSize("ring", H, S0, alc, zmax), base = Z.r0 * 1.1 + 2;
      w = Math.min(W, 2 * (base + Z.len * RING_SIDE_X * SAT_HI + 36));
      h = 2 * (base + Z.len * SAT_HI + 36);
    } else {
      w = W;
      h = 2 * (styleSize("wave", H, 0, alc, zmax) * 1.15 * SAT_HI + 40);
    }
    w = Math.round(w);
    h = Math.round(Math.min(h, 2 * H));
    return { w, h, left: Math.round((W - w) / 2), top: Math.round(cy - h / 2), W, H0: H, S0: Math.round(S0), alc, zmax: +zmax.toFixed(4) };
  }
  function resizeMain() {
    if (!el.viz) return;
    const b = vizBox(CFG.style), st = el.viz.style;
    st.width = b.w + "px"; st.height = b.h + "px"; st.left = b.left + "px"; st.top = b.top + "px";
    S.vizBox = b;
    layoutView(V.main, CFG.style, b.w, b.h, b);
    metaClearance();
    S.metaGeo = null;
  }
  /** how far below its centre the style reaches at level lv (px, camera zoom not included); lv defaults to the
      biggest hit (SAT_HI) */
  function styleReach(style, G, lv) {
    const L = lv == null ? SAT_HI : lv;
    if (style === "ring") return G.r0 * (lv == null ? 1.1 : 1.05) + 2 + G.len * L + G.barW / 2;
    if (style === "bars") return G.half * L + 2;
    return G.H * L * 1.15 * 0.9 + 3;                   // "Onda": three sines rarely line up past ~0.9 of their sum
  }
  /** keeps the title block clear of the visualizer: r2: under a strong hit (level 0.85) at a typical strong zoom
      (half of the setting's strongest kick), plus 18 px, instead of under the absolute biggest one (that left it
      ~300 px below the ring most of the time). The title itself does not move with the zoom (applyFxDom gives it
      the inverse transform, it only grows by META_ZOOM_SHARE), so only the visualizer's reach counts; the camera's
      origin is the visualizer's centre, so a tip is at cy + reach x zoom. The rarer bigger hits pass behind the
      title: maskTitle fades the visualizer out under it, and when they can reach it a soft dark scrim
      (--nda-meta-scrim, src/css/ambient.css) backs the text. When a big "Alcance" leaves no room above the bottom margin, the
      title stays at the bottom. */
  function metaClearance() {
    const w = el.metaWrap, G = V.main && V.main.g;
    if (!w || !G || !el.cam) return;
    const style = CFG.style, H = el.cam.offsetHeight || innerHeight, cy = VIS_CY * H;
    const zcam = zoomMax(), zmax = vizScaleMax(), zt = 1 + 0.5 * (zmax - 1);   // the visualizer's own scale
    const bob = GROOVE_BOB * grooveAmt() * H * zcam;     // v5: the groove's nod moves it down on the beat
    const reach = styleReach(style, G), typ = styleReach(style, G, 0.85);
    const mh = w.offsetHeight || 60;
    const grow = (mh / 2) * META_ZOOM_SHARE * (zcam - 1);
    const want = cy + typ * zt + 0.5 * bob + 18 + grow;
    const bottom = H - mh - Math.max(24, 0.04 * H);
    const top = Math.max(cy, Math.min(want, bottom));
    w.style.top = top.toFixed(1) + "px";
    // how far the biggest hit can reach into the title block; over a sharp wallpaper ("Desfoque no modo ambiente"
    // below ~10 px) the title gets most of that backing too
    const into = cy + reach * zmax + bob - (top - grow);
    const scrim = Math.max(clamp(into / 240, 0, 1), clamp((10 - wallBlur().amb) / 10, 0, 1) * 0.75);
    if (el.root) el.root.style.setProperty("--nda-meta-scrim", scrim.toFixed(2));
    S.metaClear = { style, reach: Math.round(reach), typ: Math.round(typ), zmax: +zmax.toFixed(3), want: Math.round(want), top: Math.round(top), into: Math.round(into), scrim: +scrim.toFixed(2) };
    S.metaGeo = null;
  }
  /** r2: the visualizer fades out under the title block (destination-out, a soft ellipse over the text's box), so
      the biggest hits pass behind the title instead of through it. The title does not follow the camera, so its
      box on screen is mapped into the zoomed canvas. One small gradient fill per frame. */
  function maskTitle(v, fx) {
    const g = S.metaGeo || (S.metaGeo = metaGeometry()), b = S.vizBox;
    if (!g || !b || !g.mw) return;
    // the visualizer's own scale on screen (its share of the camera kick x the groove's breathing) and the nod
    const zc = fx.zoom || 1, z = vizZoom(zc) * (fx.gs || 1), dy = (fx.gb || 0) * b.H0 * zc, ox = g.ox, oy = g.oy;
    const mx = ox + (g.mx - ox) / z - b.left, my = oy + (g.my - oy - dy) / z - b.top;
    const rx = (g.mw / 2 + 64) / z, ry = (g.mh / 2 + 26) / z;
    if (my - ry > v.h || my + ry < 0) return;
    const c = v.ctx;
    c.save();
    c.globalCompositeOperation = "destination-out";
    c.translate(mx, my);
    c.scale(rx, ry);
    const gr = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, "rgba(0, 0, 0, 0.9)");
    gr.addColorStop(0.55, "rgba(0, 0, 0, 0.78)");
    gr.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = gr;
    c.fillRect(-1, -1, 2, 2);
    c.restore();
  }

  /** the frame drawn now reaches the screen ~1.5 refresh intervals later */
  const displayLead = () => clamp(1.5 * S.vsync, 4, 30);
  /** "Sincronia" of the current output, and what the renderers use (minus the display lead) */
  function updateLatency() {
    S.latDev = latencyFor(outputDevice(false));
    S.latEff = S.latDev - displayLead();
    SIG.main.lat = SIG.preview.lat = S.latEff;
  }

  /** one overlay frame at playback position posMs (dt = ms since the previous frame) */
  function renderMain(posMs, dt, t) {
    updateLatency();
    const item = currentItem();
    if (item && analysisDue(item.uri)) ensureAnalysis(item.uri);    // missed songchange, or a quick retry after a failure
    if (item && item.uri !== S.metaUri && S.phase !== "off") updateMeta(false);
    const A = analysisFor(item && item.uri);
    const playing = S.demo ? true : S.clock.playing;
    const sig = computeSignal(SIG.main, A, posMs, dt, playing, item);
    S.lastPA = posMs - num(sig.lat, LATENCY_MS);   // the analysis time this frame shows (hitDue)
    softNote(sig, item);
    const v = V.main, style = CFG.style;
    // r2: a new colour pair ("Combinar com o wallpaper" + "Capa do álbum" re-picks it on every cover) re-lays the view,
    // so its gradients (crown, bars' zone colours, wave fill, haze) follow like the per-frame colours (v5b kept the first
    // track's pair in them for the whole session: two palettes at once)
    if (v.style !== style || !v.g || v.palVer !== PAL.ver) resizeMain();
    const impl = IMPL[style];
    const fx = effectsFrom(sig);
    const level = impl.update(v, sig, dt, CFG.intensity[style] / 100, t);
    v.ctx.clearRect(0, 0, v.w, v.h);
    drawLayers(v, sig, fx, "under");                // v5 extension point (v5b: the per-element layers)
    impl.draw(v, sig, fx);
    drawLayers(v, sig, fx, "over");
    maskTitle(v, fx);
    applyFxDom(fx);
    S.level = level;
    S.lastFx = fx;
    S.stats.framesRendered++;
    if (S.trace) traceSample(t, posMs, A, sig, fx, level);
    if (S.sampleNext) S.lastSample = makeSample(posMs, A, sig, fx, level);
  }

  /** the note of the "modo ambiente suave" in the overlay's corner: once per track and overlay entry, as
      soon as the soft mode is mostly in; it fades in, stays SOFT_NOTE_MS and fades out (src/css/ambient.css), and goes at once (fading)
      when an analysis arrives */
  function softNote(sig, item) {
    const n = el.note, root = el.root;
    if (!n || !root) return;
    const so = num(sig.soft, 0), key = item ? item.uri : "", shown = root.classList.contains("nd-amb--note");
    const txt = so > 0.6 && S.noteKey !== key ? softNoteText(item) : "";   // final-fix: its text, once it is known
    if (txt) {
      S.noteKey = key;
      S.noteAt = now();
      if (n.textContent !== txt) n.textContent = txt;
      root.classList.add("nd-amb--note");
    } else if (shown && (so < 0.3 || now() - num(S.noteAt, 0) > SOFT_NOTE_MS)) root.classList.remove("nd-amb--note");
  }

  /** zoom (camera + focus pull) and glow on composited layers only. The title
      block sits inside the camera, so it gets the inverse transform plus a
      quarter of the kick: it nudges instead of jumping (readable at 200%). */
  function applyFxDom(fx) {
    const D = el.dom;
    const zoom = Math.round(fx.zoom * 10000) / 10000;
    // r2: the visualizer only follows VIZ_ZOOM_SHARE of the kick (its box is centred on the camera's origin);
    // v5: times the groove's breathing, plus its nod (camera px, down)
    const vs = Math.round(((vizZoom(zoom) * (fx.gs || 1)) / zoom) * 100000) / 100000;
    const bob = Math.round((fx.gb || 0) * ((S.vizBox && S.vizBox.H0) || innerHeight || 900) * 10) / 10;
    if (vs !== D.vs || bob !== D.bob) {
      el.viz.style.transform = (bob ? "translateY(" + bob + "px) " : "") + (vs !== 1 ? "scale(" + vs + ")" : "");
      D.vs = vs; D.bob = bob;
    }
    if (zoom !== D.zoom) {
      el.cam.style.transform = zoom === 1 ? "" : "scale(" + zoom + ")";
      D.zoom = zoom;
      const g = S.metaGeo || (S.metaGeo = metaGeometry());
      if (zoom === 1 || !g) el.metaWrap.style.transform = "";
      else {
        const k = 1 - 1 / zoom, s = (1 + META_ZOOM_SHARE * (zoom - 1)) / zoom;
        el.metaWrap.style.transform = "translate(" + ((g.ox - g.cx) * k).toFixed(2) + "px," + ((g.oy - g.cy) * k).toFixed(2) + "px) scale(" + s.toFixed(5) + ")";
      }
    }
    const focus = S.wall === "ready" ? r3(fx.focus) : 0;
    if (focus !== D.focus) { el.sharp.style.opacity = String(focus); D.focus = focus; }
    const L = glowLayers(fx), X = fx.el;
    const bloom = X ? r3(L.bloom * X.bloomK) : r3(L.bloom);        // v5b: a breakdown blooms less
    if (bloom !== D.bloom) { el.bloom.style.opacity = String(bloom); D.bloom = bloom; }
    // v5b "Subidas e calmarias": the breakdown veil, the riser's vignette and the wallpaper creeping in (not with
    // reduced motion); all three stay untouched (0 / 0 / none) when the layers are off
    const ec = X ? r3(X.veil) : 0, ev = X ? r3(X.vig) : 0, cr = X ? Math.round(X.creep * 10000) / 10000 : 1;
    if (ec !== D.elCalm) { el.elCalm.style.opacity = ec ? String(ec) : ""; D.elCalm = ec; }
    if (ev !== D.elVig) { el.elVig.style.opacity = ev ? String(ev) : ""; D.elVig = ev; }
    if (cr !== D.creep) { el.drift.style.scale = cr !== 1 ? String(cr) : ""; D.creep = cr; }
    const flash = r3(L.flash);
    if (flash !== D.flash) { el.flash.style.opacity = String(flash); D.flash = flash; }
    const hot = r3(L.hot);
    if (hot !== D.hot) { el.flashHot.style.opacity = String(hot); D.hot = hot; }
  }
  /** camera origin and title-block centre in the camera's (untransformed) layout space */
  function metaGeometry() {
    const w = el.metaWrap, cam = el.cam;
    if (!w || !cam || !w.offsetWidth) return null;
    let x = 0, y = 0;
    for (let n = w; n && n !== cam; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    const cs = getComputedStyle(cam).transformOrigin.split(" ").map(parseFloat);
    // r2: + the title block itself (centre, size): maskTitle fades the visualizer out under it
    const m = el.meta && el.meta.offsetParent === w ? el.meta : null, mw = m ? m.offsetWidth : w.offsetWidth, mh = m ? m.offsetHeight : w.offsetHeight;
    return { cx: x + w.offsetWidth / 2, cy: y + w.offsetHeight / 2, ox: num(cs[0], cam.offsetWidth / 2), oy: num(cs[1], cam.offsetHeight * 0.47),
      mx: x + (m ? m.offsetLeft : 0) + mw / 2, my: y + (m ? m.offsetTop : 0) + mh / 2, mw, mh };
  }

  /** panel preview: the selected style + effects, drawn into one small canvas */
  function renderPreview(dt, t) {
    const v = V.preview;
    if (!v || !v.cv.isConnected) return;
    const w = v.cv.clientWidth, h = v.cv.clientHeight;
    if (!w || !h) return;
    updateLatency();
    refreshOutSel(false);                           // at most every 10 s (the automatic "Sincronia" of the output)
    if (t - (S.rhythmAt || 0) > 500) { S.rhythmAt = t; syncRhythm(); }
    const style = CFG.style;                        // v5: the style box always edits (and shows) the selected style
    layoutView(v, style, w, h);
    const item = currentItem();
    if (item && analysisDue(item.uri)) ensureAnalysis(item.uri);
    // the shared ring cover may have been switched by the overlay meanwhile
    if (item && (item.uri !== S.pvUri || S.pvCover !== cover.url)) { S.pvUri = item.uri; S.pvCover = metaOf(item).cover; setCanvasCover(S.pvCover); }
    const A = analysisFor(item && item.uri);
    let posMs;
    if (S.clock.playing) { posMs = positionAt(t); S.pdemo = null; }
    else {                                          // paused: demo clock from the current position
      if (!S.pdemo) S.pdemo = { pos: S.clock.pos, at: t };
      posMs = S.pdemo.pos + (t - S.pdemo.at);
    }
    const sig = computeSignal(SIG.preview, A, posMs, dt, true, item);
    // the highlight ("solo") of the part being changed: the other layers / the beat / the other effects dim
    const T = now(), sv = soloLevel(T), SP = sv > 0 ? S.pvSolo : null, sk = SP ? SP.k : "";
    const layerSolo = !!SP && (Object.values(SOLO_LAYER).includes(sk) || sk === "hue"), sd = 1 - SOLO_DIM * sv;
    if (layerSolo) { sig.kickPk *= sd; sig.kickCam *= sd; sig.kick *= sd; sig.slow *= sd; sig.groove *= sd; sig.sway *= sd; }
    EL_OVR = soloK(sv);
    try {
      renderPreviewView(v, sig, dt, t, sv, sk, sd, style);
    } finally { EL_OVR = null; }
    if (S.docked || T - num(S.dockOffAt, -1e9) < 450) drawDock(v);
    const R = el.pRef;
    if (R && R.pvChip) {
      const txt = SP ? tr(SP.demo && S.pvKick ? "pv.chip.example" : "pv.chip.highlight", { name: soloName(sk) }) : "";
      if (txt && R.pvChip.textContent !== txt) { R.pvChip.textContent = txt; R.dockChip.textContent = txt; }
      const on = !!txt && sv > 0.05;
      if (R.pvChip.classList.contains("nd-ap__chip--on") !== on) {
        R.pvChip.classList.toggle("nd-ap__chip--on", on); R.dockChip.classList.toggle("nd-ap__chip--on", on);
        R.pvBox.classList.toggle("nd-ap__preview--solo", on);   // the chip takes the badge's place
      }
      // the soft mode's note: once per panel opening and track, SOFT_NOTE_MS, then it fades out
      const soOn = num(sig.soft, 0) > 0.6, nk = (item ? item.uri : "") + "|" + num(S.panelOpenAt, 0);
      const ntx = soOn && S.pvNoteKey !== nk ? softNoteText(item) : "";   // final-fix: the same text as the overlay's
      if (ntx) { S.pvNoteKey = nk; S.pvNoteAt = T; if (R.pvNote.textContent !== ntx) R.pvNote.textContent = ntx; R.pvNote.classList.add("nd-ap__pvnote--on"); }
      else if (R.pvNote.classList.contains("nd-ap__pvnote--on") && (!soOn || T - num(S.pvNoteAt, 0) > SOFT_NOTE_MS)) R.pvNote.classList.remove("nd-ap__pvnote--on");
    }
    S.stats.previewFrames++;
    if (el.pBadge) {
      const txt = tr(!S.clock.playing ? "pv.badge.demo" : num(sig.soft, 0) > 0.5 ? "pv.badge.soft" : "pv.badge.live");
      if (el.pBadge.textContent !== txt) el.pBadge.textContent = txt;
    }
  }
  /** the preview's drawing (wallpaper, visualizer, flash) for one frame; the highlight's dims on the effects */
  function renderPreviewView(v, sig, dt, t, sv, sk, sd, style) {
    const fx = effectsFrom(sig);
    if (sv > 0 && (sk === "zoom" || sk === "glow" || sk === "groove")) {   // an effect: the other two dim
      if (sk !== "zoom") { fx.zoom = 1 + (fx.zoom - 1) * sd; fx.focus *= sd; }
      if (sk !== "glow") { fx.glow *= sd; fx.gk = Math.min(GLOW_HOT_FROM, fx.glow); fx.over = clamp((fx.glow - GLOW_HOT_FROM) / (INT_MAX / 100 - GLOW_HOT_FROM), 0, 1); }
      if (sk !== "groove") { fx.gs = 1 + (fx.gs - 1) * sd; fx.gb *= sd; fx.sway *= sd; }
    }
    const c = v.ctx, W = v.w, H = v.h;
    // background: the same wallpaper canvases, zoomed like the overlay
    c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    c.fillStyle = "#020713";
    c.fillRect(0, 0, W, H);
    if (S.wall === "css" && WP.url) {                // GIF / animated picture: its current frame, blurred
      if (S.pvWallKey !== WP.url) { S.pvWallKey = WP.url; S.pvWall = new Image(); S.pvWall.decoding = "async"; S.pvWall.src = WP.url; }
      const im = S.pvWall;
      if (im && im.complete && im.naturalWidth) {
        const s = Math.max(W / im.naturalWidth, H / im.naturalHeight) * 1.1 * fx.zoom, dw = im.naturalWidth * s, dh = im.naturalHeight * s;
        const pb = wallBlur().amb * (W / Math.max(1, innerWidth || W));   // the overlay's blur, scaled to the preview
        c.filter = (pb > 0.05 ? "blur(" + pb.toFixed(2) + "px) " : "") + "brightness(" + (0.72 * (1 - (CFG.wallpaper.dim / 100) * 0.55)).toFixed(3) + ")";
        c.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
        c.filter = "none";
      }
    } else if (S.wall === "ready") {
      const iw = el.wall.width, ih = el.wall.height;
      const s = Math.max(W / iw, H / ih) * 1.06 * fx.zoom;
      const dw = iw * s, dh = ih * s;
      c.drawImage(el.wall, (W - dw) / 2, (H - dh) / 2, dw, dh);
      if (fx.focus > 0.01) {
        c.globalAlpha = fx.focus;
        c.drawImage(el.sharp, (W - dw) / 2, (H - dh) / 2, dw, dh);
        c.globalAlpha = 1;
      }
    }
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, "rgba(2, 7, 19, 0.1)");
    vg.addColorStop(1, "rgba(2, 7, 19, 0.7)");
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    // visualizer, zoomed around the centre (+ the groove's breathing and nod)
    const z = fx.zoom * (fx.gs || 1), by = (fx.gb || 0) * H;
    c.setTransform(v.dpr * z, 0, 0, v.dpr * z, (W / 2) * (1 - z) * v.dpr, ((H / 2) * (1 - z) + by) * v.dpr);
    const impl = IMPL[style];
    impl.update(v, sig, dt, CFG.intensity[style] / 100, t);
    drawLayers(v, sig, fx, "under");
    impl.draw(v, sig, fx);
    drawLayers(v, sig, fx, "over");
    c.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    if (fx.glowOn && fx.glow > 0.02) {               // flash (+ the hot core past 160%)
      const L = glowLayers(fx), a = L.flash;
      const fl = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.55);
      fl.addColorStop(0, "rgba(" + PAL.flash[0] + ", " + (0.32 * a + 0.16 * L.hot).toFixed(3) + ")");
      fl.addColorStop(0.5, "rgba(" + PAL.flash[1] + ", " + (0.12 * a + 0.05 * L.hot).toFixed(3) + ")");
      fl.addColorStop(1, "rgba(" + PAL.flash[2] + ", 0)");
      c.fillStyle = fl;
      c.fillRect(0, 0, W, H);
    }
  }

