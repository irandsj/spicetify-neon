  // ---- look: the picture from the computer (IndexedDB) ------------------------------
  let idbP = null;
  function idb() {
    if (idbP) return idbP;
    idbP = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("no IndexedDB"));
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error("blocked"));
    });
    idbP.catch(() => { idbP = null; });
    return idbP;
  }
  function idbDo(mode, fn) {
    return idb().then((db) => new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, mode), q = fn(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => res(q ? q.result : undefined);
      tx.onerror = tx.onabort = () => rej(tx.error || new Error("idb"));
    }));
  }
  const idbGet = (k) => idbDo("readonly", (st) => st.get(k));
  const idbPut = (k, v) => idbDo("readwrite", (st) => st.put(v, k));
  const idbDel = (k) => idbDo("readwrite", (st) => st.delete(k));

  /** the stored picture as an object URL (created once, revoked when replaced / removed) */
  function loadFileWall() {
    const f = CFG.wallpaper.file;
    if (!f) return Promise.resolve(null);
    if (WP.fileUrl && WP.fileToken === f.at) return Promise.resolve({ url: WP.fileUrl, type: WP.fileType });
    if (WP.fileP && WP.filePAt === f.at) return WP.fileP;       // already loading this picture
    const at = f.at;
    WP.filePAt = at;
    WP.fileP = idbGet(IDB_WALL_KEY).then((rec) => {
      if (WP.filePAt === at) WP.fileP = null;
      if (!rec || !(rec.blob instanceof Blob)) return null;
      if (!CFG.wallpaper.file || CFG.wallpaper.file.at !== at) return null;   // removed / replaced meanwhile
      if (WP.fileUrl && WP.fileToken === at) return { url: WP.fileUrl, type: WP.fileType };
      if (WP.fileUrl) { const old = WP.fileUrl; setTimeout(() => URL.revokeObjectURL(old), 1500); }   // still on screen for a moment
      WP.fileUrl = URL.createObjectURL(rec.blob);
      WP.fileType = rec.type || rec.blob.type || "";
      WP.fileToken = at;
      return { url: WP.fileUrl, type: WP.fileType };
    }, (err) => { if (WP.filePAt === at) WP.fileP = null; throw err; });
    return WP.fileP;
  }
  const WALL_TYPES = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  const fmtBytes = (n) => (n >= 1048576 ? dec((n / 1048576).toFixed(1)) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  /** "Escolher imagem…": checks, downscales big stills (WebP), keeps GIFs as they are,
      stores the Blob in IndexedDB and shows it */
  async function importWallFile(file) {
    if (!file) return;
    const ext = (String(file.name).split(".").pop() || "").toLowerCase();
    const type = /^image\/(jpeg|png|webp|gif)$/.test(file.type) ? file.type : WALL_TYPES[ext] || "";
    if (!type) return wallNote(tr("wall.err.format"), true);
    if (type === "image/gif" && file.size > GIF_MAX_BYTES) return wallNote(tr("wall.err.gifBig", { size: fmtBytes(file.size) }), true);
    if (file.size > FILE_MAX_BYTES) return wallNote(tr("wall.err.imgBig", { size: fmtBytes(file.size) }), true);
    wallNote(tr("wall.loading"), false);
    const anim = await isAnimated(file, type);
    if (anim && file.size > GIF_MAX_BYTES) return wallNote(tr("wall.err.animBig", { size: fmtBytes(file.size) }), true);
    const dims = anim ? null : await imageSize(file);
    let bmp;
    try {
      if (dims && Math.max(dims[0], dims[1]) > WALL_MAX_SIDE) {     // decoded straight to the stored size (a 12000 px photo never sits in memory at full size)
        const k = WALL_MAX_SIDE / Math.max(dims[0], dims[1]);
        bmp = await createImageBitmap(file, { resizeWidth: Math.round(dims[0] * k), resizeHeight: Math.round(dims[1] * k), resizeQuality: "high" });
      } else bmp = await createImageBitmap(file);
    } catch (e) { return wallNote(tr("wall.err.open"), true); }
    let blob = file, w = dims ? dims[0] : bmp.width, h = dims ? dims[1] : bmp.height, outType = type;
    if (!anim && Math.max(w, h) > WALL_MAX_SIDE) {
      w = bmp.width; h = bmp.height;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const c = cv.getContext("2d");
      c.imageSmoothingQuality = "high";            // (only scales when the size could not be read first)
      c.drawImage(bmp, 0, 0, w, h);
      blob = await new Promise((res) => cv.toBlob(res, "image/webp", 0.92));
      cv.width = cv.height = 0;
      if (!blob) { try { bmp.close(); } catch (e) { /* ignore */ } return wallNote(tr("wall.err.shrink"), true); }
      outType = "image/webp";
    }
    const bright = meanLuma(bmp);
    try { bmp.close(); } catch (e) { /* ignore */ }
    const at = Date.now();
    try {
      await idbPut(IDB_WALL_KEY, { blob, name: String(file.name).slice(0, 120), type: outType, w, h, size: blob.size, at, anim });
    } catch (e) {
      return wallNote(tr("wall.err.save", { err: e && e.name ? e.name : tr("wall.err.saveUnknown") }), true);
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* ignore */ }   // not evicted when the disk fills up
    const next = clone(CFG);
    next.wallpaper.file = { name: String(file.name).slice(0, 120), type: outType, w, h, size: blob.size, at, anim };
    next.wallpaper.mode = "file";
    let msg = "";
    if (bright > 0.42 && next.wallpaper.dim < 30) {      // a light picture: keep the text readable
      next.wallpaper.dim = 30;
      msg = tr("wall.autoDim");
    }
    applySettings(next, true);
    wallNote(msg, false);
  }
  /** an animated WebP ("ANIM" chunk) / APNG ("acTL" before the image data); GIFs always count */
  async function isAnimated(file, type) {
    if (type === "image/gif") return true;
    if (type !== "image/webp" && type !== "image/png") return false;
    try {
      const b = new Uint8Array(await file.slice(0, 1 << 18).arrayBuffer());
      const tag = type === "image/webp" ? [65, 78, 73, 77] : [97, 99, 84, 76];   // "ANIM" / "acTL"
      for (let i = 12; i + 4 <= b.length; i++) if (b[i] === tag[0] && b[i + 1] === tag[1] && b[i + 2] === tag[2] && b[i + 3] === tag[3]) return true;
    } catch (e) { /* ignore */ }
    return false;
  }
  /** a picture's size without decoding all of it (the <img> reads the header) */
  function imageSize(file) {
    return new Promise((res) => {
      const u = URL.createObjectURL(file), img = new Image();
      const end = (v) => { URL.revokeObjectURL(u); res(v); };
      img.onload = () => end(img.naturalWidth && img.naturalHeight ? [img.naturalWidth, img.naturalHeight] : null);
      img.onerror = () => end(null);
      img.src = u;
    });
  }
  /** average luma (0..1) of a picture, from a 24 px copy */
  function meanLuma(src) {
    try {
      const cv = document.createElement("canvas");
      cv.width = 24; cv.height = 14;
      const c = cv.getContext("2d", { willReadFrequently: true });
      c.drawImage(src, 0, 0, 24, 14);
      const d = c.getImageData(0, 0, 24, 14).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += lum([d[i], d[i + 1], d[i + 2]]);
      return s / (d.length / 4);
    } catch (e) { return 0; }
  }
  async function removeWallFile() {
    try { await idbDel(IDB_WALL_KEY); } catch (e) { /* ignore */ }
    const next = clone(CFG);
    next.wallpaper.file = null;
    if (next.wallpaper.mode === "file") next.wallpaper.mode = DEFAULTS.wallpaper.mode;
    applySettings(next, true);
    if (WP.fileUrl) { const u = WP.fileUrl; WP.fileUrl = ""; WP.fileToken = 0; setTimeout(() => URL.revokeObjectURL(u), 1500); }
    wallNote(tr("wall.removed"), false);
  }
  function wallNote(text, warn) {
    WP.noteText = text || "";
    WP.noteWarn = !!warn;
    if (!el.pRef || !el.pRef.wallNote) return;
    el.pRef.wallNote.textContent = WP.noteText;
    el.pRef.wallNote.hidden = !WP.noteText;
    el.pRef.wallNote.classList.toggle("nd-ap__note--warn", WP.noteWarn);
  }

