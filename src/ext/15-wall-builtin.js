
  // ---- the built-in wallpaper ("Gradiente neon") ------------------------------------------------
  /** a 960 x 540 neon gradient (navy, soft pink / cyan glows in the default Neon Drift pair, light grain against
      banding), drawn once and kept as a small JPEG blob URL. Made synchronously, so "Gradiente neon" shows at once.
      Used for "Gradiente neon" and whenever the chosen source has nothing to show. */
  let BUILTIN_URL = "";
  function builtinWall() {
    if (BUILTIN_URL) return BUILTIN_URL;
    try {
      const W = 960, H = 540, cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      const c = cv.getContext("2d");
      const base = c.createLinearGradient(0, 0, W * 0.35, H);
      base.addColorStop(0, "#020713");
      base.addColorStop(0.55, "#04102a");
      base.addColorStop(1, "#031025");
      c.fillStyle = base;
      c.fillRect(0, 0, W, H);
      const glow = (x, y, rx, ry, rgb, a) => {
        c.save();
        c.translate(x, y);
        c.scale(rx, ry);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, "rgba(" + rgb + "," + a + ")");
        g.addColorStop(0.45, "rgba(" + rgb + "," + (a * 0.45).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + rgb + ",0)");
        c.fillStyle = g;
        c.fillRect(-1, -1, 2, 2);
        c.restore();
      };
      c.globalCompositeOperation = "lighter";
      glow(W * 0.16, H * 0.22, W * 0.6, H * 0.8, "255,77,255", 0.42);    // pink, top left
      glow(W * 0.86, H * 0.80, W * 0.58, H * 0.78, "53,231,255", 0.36);    // cyan, bottom right
      glow(W * 0.58, H * 0.36, W * 0.36, H * 0.42, "122,92,255", 0.2);    // violet haze between them
      glow(W * 0.30, H * 0.95, W * 0.40, H * 0.30, "53,231,255", 0.08);
      c.globalCompositeOperation = "source-over";
      const dark = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, W * 0.75);   // a soft vignette
      dark.addColorStop(0, "rgba(2,7,19,0)");
      dark.addColorStop(1, "rgba(2,7,19,0.45)");
      c.fillStyle = dark;
      c.fillRect(0, 0, W, H);
      const img = c.getImageData(0, 0, W, H), d = img.data;               // grain (deterministic)
      let seed = 0x2f6e2b1;
      for (let i = 0; i < d.length; i += 4) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const n = ((seed >>> 24) - 128) / 128 * 3;
        d[i] = to255(d[i] + n); d[i + 1] = to255(d[i + 1] + n); d[i + 2] = to255(d[i + 2] + n);
      }
      c.putImageData(img, 0, 0);
      const data = cv.toDataURL("image/jpeg", 0.9), bin = atob(data.slice(data.indexOf(",") + 1));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      cv.width = cv.height = 0;
      BUILTIN_URL = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
    } catch (e) {
      BUILTIN_URL = "";
    }
    return BUILTIN_URL;
  }
  /** the picture shown when the chosen source has none right now (no cover playing, the stored picture is gone):
      the picture from the computer if one is stored, else the neon gradient */
  function fallbackWall(done) {
    if (CFG.wallpaper.file) {
      loadFileWall().then((f) => (f ? done(f.url, "file", f.type) : done(builtinWall(), "default")), () => done(builtinWall(), "default"));
    } else done(builtinWall(), "default");
  }
