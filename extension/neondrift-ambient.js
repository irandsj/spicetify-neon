/*! NeonDrift Ambient v1.0.2 | MIT License | (c) 2026 Iran
 *  Ambient mode, neon visualizer and settings panel for Spotify (Spicetify extension).
 *  Works with any Spicetify theme; pairs with the NeonDrift theme. 
 *  Built file: edit src/ and run `node tools/build/build.mjs`. */
(function NeonDriftAmbient() {
  "use strict";

  // ---- one instance ------------------------------------------------------------
  // The newest copy wins, whatever the load order (a local install, a Marketplace install, the theme's "include", an
  // older theme.js-based NeonDrift): a release build steps aside for a running extension of the same or a newer
  // version; otherwise the running copy hands over (its _destroy) and this one takes its place. A dev build always
  // takes over (hot swap while developing).
  const ND_VERSION = "1.0.2";
  const ND_DEV = false;
  const FAULT = {};                 // dev build fault drills (_fault): an API that looks missing
  const verNum = (v) => String(v || "0").split(/[.+-]/).slice(0, 3).reduce((a, x) => a * 1000 + (parseInt(x, 10) || 0), 0);
  {
    const prev = window.NeonDriftAmbient;
    if (prev && prev.__ext && !ND_DEV && verNum(prev.version) >= verNum(ND_VERSION)) return;
    if (prev && typeof prev._destroy === "function") {
      try { prev._destroy({ handoff: true }); } catch (e) { /* ignore */ }
    }
  }

  // ---- tunables ------------------------------------------------------------
  const IDLE_MS = 10000;            // default inactivity before ambient mode starts
  const FADE_IN_MS = 700;           // keep in sync with src/css/ambient.css
  const FADE_OUT_MS = 250;
  const JITTER_PX = 4;              // smaller mouse moves do not exit
  const CHECK_EVERY_MS = 750;       // idle check interval
  const ENTRY_FALLBACK_MS = 30000;  // no top-bar button this long after the UI shows up: the other ways in (entryFallback)
  const PREPARE_AT = 0.5;           // fetch analysis + wallpaper at 50% of the idle time
  const TYPING_GRACE_MS = 60000;    // a focused text field blocks entry this long after the last key
  const TEST_GRACE_MS = 1200;       // "Testar agora": mouse moves right after the click do not exit
  const FALLBACK_BPM = 120;         // procedural animation when there is no analysis
  const ANALYSIS_TIMEOUT_MS = 15000;
  const FAIL_RETRY_MS = 30 * 60 * 1000;   // final-build: after the back-off below, a failed analysis is asked again every 30 min
  // Spotify sometimes answers a fresh track's request with an empty body ("no segments", about 1 in 15 track changes):
  // retry soon after a failure, on a growing back-off (4 s, 20 s, 1 min, 3 min, 10 min, then FAIL_RETRY_MS), so a track
  // that has no analysis at all is not asked for ever
  const FAIL_RETRY_FAST_MS = [4000, 20000, 60000, 180000, 600000];
  // why a request failed (e.kind): "missing" (HTTP 404 / 400 / 410: Spotify has no analysis of it),
  // "empty" (an answer without segments), "auth" (401 / 403: the app's login token is stale, e.g. after a reload in a
  // minimised window every track can answer 401 for a while), "rate" (429), "server" (5xx), "net" / "timeout". Login /
  // server / network failures are asked again on a short back-off (4 s, 20 s, 1 min, 3 min, then every 5 min); "rate" waits
  // longer; "missing" / "empty" keep the back-off above. A passing failure (all but "missing" / "rate") is asked again at
  // once (one request) when another track's analysis has come back since: the login / the network works again
  const FAIL_RETRY_PASS_MS = [4000, 20000, 60000, 180000], FAIL_RETRY_PASS_EVERY = 5 * 60 * 1000;
  const FAIL_RETRY_RATE_MS = [30000, 120000, 600000];
  const FAIL_PASSING = { auth: 1, server: 1, net: 1, timeout: 1 }, FAIL_RECOVER = { auth: 1, server: 1, net: 1, timeout: 1, empty: 1 };
  let anOkAt = -1e18;                // final-fix: when an analysis last came back (any track)
  const failRetryMs = (e) => {
    const k = e.tries | 0, kind = e.kind || "empty";
    if (FAIL_RECOVER[kind] && e.at < anOkAt) return 0;
    if (kind === "rate") return k < FAIL_RETRY_RATE_MS.length ? FAIL_RETRY_RATE_MS[k] : FAIL_RETRY_MS;
    if (FAIL_PASSING[kind]) return k < FAIL_RETRY_PASS_MS.length ? FAIL_RETRY_PASS_MS[k] : FAIL_RETRY_PASS_EVERY;
    return k < FAIL_RETRY_FAST_MS.length ? FAIL_RETRY_FAST_MS[k] : FAIL_RETRY_MS;
  };
  /** final-fix: the kind of a failed answer's HTTP status (0: an answer without one) */
  const failKind = (code) => (!code ? "empty" : code === 401 || code === 403 ? "auth" : code === 429 ? "rate" : code >= 500 ? "server" : "missing");
  const analysisDue = (uri) => { const e = cache.get(uri); return !e || (e.st === "fail" && now() - e.at > failRetryMs(e)); };
  const CACHE_MAX = 24;             // analysed tracks kept in memory
  // v5: automatic output latency ("Sincronia") per kind of output; no manual setting any more
  const LATENCY_MS = 40;            // this computer's own output (wired / USB / 2.4 GHz headsets): mixer -> ear
  const REMOTE_LATENCY_MS = 250;    // another Spotify Connect device (phone, speaker, web player)
  const BT_LATENCY_MS = 200;        // a Bluetooth output of this computer
  const DEV_POLL_MS = 2000;         // output device re-checked at most this often
  const KICK_ATTACK_MIN_MS = 8, KICK_ATTACK_MAX_MS = 30;   // onset -> peak: loudness_max_time, clamped
  const PEAK_HOLD_MS = 12;          // the peak is held ~1 frame so a 60 fps frame always shows it
  const HAT_ATTACK_MS = 10, HAT_DECAY_MS = 70;
  const FOCUS_DECAY_MS = 320;       // the focus pull breathes out slower than the zoom kick
  // dense passages: the analysis knows every upcoming hit, so each hit's decay is fitted to the gap to the next one
  const HIT_MERGE_MS = 100;         // bass hits closer than this are one hit (v3: 95; < 100 ms apart they fuse perceptually)
  const VALLEY_REL = 0.25;          // a hit has fallen to <= 25% of its own peak ...
  const VALLEY_NEXT = 0.45;         // ... and to <= 45% of the next hit's peak ...
  const VALLEY_LEAD_MS = 18;        // ... one 60 fps frame before the next onset (that frame shows the valley)
  const NEXT_MIN = 0.12, NEXT_REL = 0.25;   // the "next hit" that shortens a decay: >= max(0.12, 0.25 x this hit)
  const DECAY_MIN_MS = 22;          // fastest per-hit decay time constant
  const SPARSE_DECAY_MUL = 1.3;     // isolated hits ring up to 1.3 x the musical decay in the renderers (they no longer add a tail);
                                    // the camera / glow keep the plain musical decay (hitDC), as in v3
  const FOCUS_VALLEY = 0.5;         // the focus pull (slower "lens breath") still halves between hits
  const DENSE_FULL_MS = 320, DENSE_MIN_MS = 110, DENSE_MIN_SCALE = 0.6;   // zoom / glow / cover amplitude vs the local gap
  const HIT_SMOOTH_MS = 12;         // decay smoothing of the ring cover's per-hit kick (v3: 90 ms); the bars use dynStep (v4)
  // v4: "Volta" (slow fall) with additive hits (dynStep): each hit's impulse (the dense design's per-hit pulse) adds
  // to the level under it; its peak falls back linearly to 10% in "Volta" at most, and a slow body (<= BODY_MAX of the
  // range) keeps the bar up meanwhile, so only the part above the body follows the fast per-hit decay
  const BODY_MAX = 0.78;            // the body stays below this (of the "Alcance" range): every hit has room to kick
  const SAT_KNEE = 0.84, SAT_MAX = 1.05;   // linear up to the knee, then eases into a slight overshoot
  const SAT_HI = 1.09;              // ... up to this overshoot at the top "Intensidade" (INT_MAX; the geometry leaves room for it)
  const RAMP_KNEE = 0.8;            // r2: a hit's peak above this (the "kick zone") falls back fast, the rest in "Volta"
  const REST_KNEE = 0.55, REST_MAX = 0.8;   // r2: the mids / hats layer alone never lifts a bar past ~0.8 (headroom)
  const REST_FALL_SHARE = 0.3;      // the mids / hats part falls with 30% of "Volta" (60..500 ms)
  const CAP_HOLD_MS = 160;          // peak caps ("tracinhos") hold (at most; r2: 0.3 x "Volta"), then fall with gravity
  const CAP_FALL_MS = 900;          // ... a full-height fall takes about this long at "Volta" 0,7 s (r2: 1.3 x "Volta")
  const TOP_MARGIN = 18;            // r2: px between the biggest hit (zoom included) and the window's top edge
  const INT_MAX = 500;              // "Intensidade" / "Zoom na batida" / "Brilho na batida" / "Balanço no ritmo" ceiling (%)
  const OVER_FROM = 200;            // past this "Intensidade" (%) the hits get wider / overshoot more (full at INT_MAX)
  const GLOW_HOT_FROM = 1.6;        // "Brilho" past 160 %: v3's glow layers are full, the hot core grows (full at INT_MAX)
  const REACH_MIN = 20, REACH_MAX = 100;   // "Alcance" (% of the style's farthest reach)
  const FALL_MIN = 80, FALL_MAX = 2000;    // "Volta" (ms, peak -> 10%)
  const BLUR_MAX = 40;              // both "Desfoque" sliders (px)
  const GLASS_BLUR = 3;             // the panels' glass takes the first 3 px of "Desfoque do layout" (v3: always 3 px)
  const VIS_CY = 0.47;              // the visualizer's centre = the camera's zoom origin (share of the window height)
  const REACH_H = 0.42;             // "Alcance" 60% and below: as v4 (bars / waves 0.42 x window height x Alcance);
                                    // r2: above 60% it grows to "the biggest hit, zoom included, just reaches the top"
  const RING_SIDE_X = 1.35;         // r2: the ring's side bars may be this much longer (a 16:9 window is wider than tall)
  const ZOOM_MAX = 0.006;   // v6 core: camera zoom per regular kick at 100 % (v5: 0.065); the bass entry punches EL_ZOOM
  const ND_ZBUD = 0.065, ND_KM = 0.68, ND_KCOV = 0.04, ND_FK = 0.12, ND_FE = 0.5, ND_GK = 0.16, ND_GR = 0.35;   // v6-r2: ND_GR (Balanço core) 1 -> 0.35
  const ND_G_IN = 1.4, ND_V_A = 1.5, ND_V_S = 3, ND_V_IN = 1.6, ND_A_A = 1.25, ND_A_TW = 4.5, ND_A_SZ = 2.4, ND_A_IN = 1.6;   // v6-r2: ND_V_S 2.4 -> 3   // v6-r2: ND_A_TW 3.5 -> 4.5   // v6-r2: ND_A_SZ 2 -> 2.4
  const ND_S_CR = 1.2, ND_S_BB = 0.35, ND_S_RW = 1.6;   // v6-r2: snare flash of the crown / the bar bodies / the ribbons' width; v6-r3: ND_S_CR 0.45 -> 1.2
  const ND_S_CRX = 0.85, ND_S_RL = 0.3;   // v6-r3: the crown flash's cap (r2: 0.6); the snare's all-round crown lift
  const ND_BVC = 0.5;   // v6-r2: "Barras" without drums: the centre's share of the voice
  const ND_S_A = 1.4, ND_S_W = 2, ND_E_A = 1.4, ND_E_W = 1.5, ND_DRUM = 0;
  const ND_D = { lo: 0.15, span: 0.5, hat: 0.5, ms: 3000, keep: 0.45 };
  const zoomMaxOf = (zAmt) => 1 + ND_ZBUD * zAmt;
  const ND_KG = 0.6, ND_KADD = 1, ND_KOV = 1;   // v6: kick amplitude curve, additive blend over the rest
  const ND_RSIDE = 0.03, ND_RT0 = 0.33, ND_RT1 = 0.85;   // v6: the ring kick's zone (side share, top ramp)
  const ND_BFLAT = 0.12, ND_BSIG = 0.08;   // v6: the bars kick's zone (flat centre, Gaussian edge)
  const ND_WKS = 0.055;   // v6: the wave kick's width (0 = whole ribbon)
  const ND_ORB = 0.4;   // v6-r2: the dots' orbit speed (v6: 1 slot per beat)
  const ND_ORB0 = 0.25;   // v6: the dots' orbit speed without drums (share of the beat speed)
  const ND_MID_ATT = 300, ND_AIR_ATT = 400;   // v6-r2: the voice / air attack without drums (+ms); v6-r3: 200 / 150 -> 300 / 400
  const ND_DRG_MS = 150;   // v6-r2: the groove / sway ease in over this when the drums come back
  const ND_PCH_MS = 450;   // v6-r3: without drums the chroma follows this (ms) instead of each new segment
  const ND_LOW_ATT = 400;   // v6-r3: "Grave" attack without drums (+ms)
  const ND_ENT_ND = 0.5;   // v6-r3: the bass entry's size when the drums are not back a bar later
  const ND_VW = 0.8, ND_VWC = 1.2, ND_VSP = 2.5;   // v6-r2: "Onda" ribbon 2 (voice) drive / ceiling / flow (v6: 2 / 1.8 / 4)
  // final-build "modo ambiente suave" (music without an analysis): its weight fades in / hands over with these time
  // constants; a request still pending after SOFT_PEND_MS counts (a normal track change takes ~0.3-1 s); the note's time on
  // screen; the crown's own slow sway (rad), the camera's slow breath (share), how much slower the per-bar shimmer runs
  const SOFT_IN_MS = 900, SOFT_OUT_MS = 700, SOFT_PEND_MS = 2500, SOFT_NOTE_MS = 6500;
  const SOFT_SWAY = 0.07, SOFT_CAM = 0.008, SOFT_JIT = 0.4, SOFT_FS = 1, SOFT_PR = 0.07;
  const SOFT_LOW = [0.24,0.22], SOFT_MID = [0.34,0.28], SOFT_AIR = [0.28,0.2], SOFT_EN = [0.4,0.13];
  // final-fix: the soft drives of the parts the layers do not cover ("Camadas por elemento" off, or Grave / Voz / Agudos off or
  // under 100 %): a slow low end (crown top / bar centres / ribbon 1), a wider energy swing (crown sides / bar shoulders) and a
  // slow hat level (sparkle bars / tips); each x (1 - that layer's amount), so with the layers on at 100 % nothing changes
  // (Barras: SOFT_NL_BARS more over the whole field, its centre Gaussian alone took the low end)
  const SOFT_NL_LOW = 0.12, SOFT_NL_EN = 0.28, SOFT_NL_AIR = 0.45, SOFT_NL_BARS = 0.2;
  const SOFT_NOTE = "soft.note";       // i18n keys: the track has no analysis / the analysis is unavailable right now (login /
  const SOFT_NOTE_NA = "soft.noteNA";  // network failures); shown through tr()
  const ndKc = (x) => (x > 0 ? (ND_KG === 1 ? x : Math.pow(x, ND_KG)) : 0);
  const META_ZOOM_SHARE = 0.25;     // the title / artist only follow 25% of the camera kick
  const VIZ_ZOOM_SHARE = 0.5;       // r2: the visualizer follows half of it (the wallpaper all of it: depth), so a big
                                    // "Alcance" keeps its size at a strong "Zoom na batida" without leaving the window
  // v5 "Balanço no ritmo" (groove): a smooth pulse phase-locked to the analysis beats (Cat-Jam's idea: a steady,
  // phase-locked pulse is what the brain tracks), always under the kick impulses; amplitudes at 100% (x5 at 500%)
  const GROOVE_PEAK_LAG_MS = 18;    // the pulse peaks this long after the beat's sound starts (a kick's typical attack)
  const GROOVE_RISE = 0.3;          // share of each beat the pulse uses to rise into the next beat (the rest: its fall)
  const GROOVE_DOWN = 0.35;         // a downbeat (first beat of a bar, bars[]) pulses this much stronger
  const GROOVE_DOWN_WIN = 0.3;      // a bar start within this share of a beat marks that beat as a downbeat
  const GROOVE_ENV_MS = 500;        // the groove follows the music's energy with this time constant ...
  const GROOVE_ENV_FLOOR = 0.4;     // ... from this share (quiet intros still keep the pulse) up to 1 (loud parts)
  const GROOVE_SCALE = 0.012;       // the visualizer breathes up to +1.2% on the beat (6% at 500%)
  const GROOVE_BOB = 0.004;         // ... and nods down by 0.4% of the window height (2% at 500%)
  const GROOVE_LIFT = 0.07;         // the bars' / ring's / waves' baseline (rest layer) lifts by 7% of the range
  const GROOVE_SWAY = 0.03;         // "Anel neon": the crown sways +-0.03 rad (1.7 deg) over two beats, a pendulum
  const GROOVE_WAVE = 0.3;          // "Onda": the ribbons swing their phase by +-0.3 rad over two beats
  const FPS_CAP = 60;               // render rate cap (the envelopes use dt, so the look does not change)
  const FRAME_BUDGET_MS = 1000 / FPS_CAP;                  // minus half a vsync: 60 fps on 60 / 120 / 240 Hz, 72 on 144 Hz
  const TEST_REOPEN_MS = 180000;    // after "Testar agora", the panel comes back if the test ends within this time
  const SETTINGS_KEY = "NeonDrift:ambient:v2";
  const LEGACY_KEY = "NeonDrift:ambient-mode";        // v1: "0" = off
  const INTRO_KEY = "NeonDrift:intro-seen";          // the first-run hint was shown (only ever written on a new install)
  const MENU_LABEL = "menu.ambient";                  // i18n keys (resolved by tr() where they are shown)
  const MENU_SETTINGS_LABEL = "panel.title";
  const PANEL_LABEL = "panel.title";                  // top-bar button tooltip + panel title
  const WALL_MAX_SIDE = 3840;       // bigger stills are downscaled before they are stored
  const GIF_MAX_BYTES = 15 * 1024 * 1024;
  const FILE_MAX_BYTES = 80 * 1024 * 1024;            // anything bigger is refused (it would not decode well anyway)
  const IDB_NAME = "NeonDrift", IDB_STORE = "files", IDB_WALL_KEY = "wallpaper";
  /** a list entry whose shown name is the i18n key prefix + id, resolved when it is read (the language is known by then) */
  const named = (prefix, o) => Object.defineProperty(o, "name", { get() { return tr(prefix + o.id); }, enumerable: true });
  const PRESETS = [                 // a1: fills / gradient start; a2: text accents, borders / gradient end
    { id: "neon", a1: "#ff4dff", a2: "#35e7ff" },
    { id: "roxoazul", a1: "#a855f7", a2: "#3b82f6" },
    { id: "sunset", a1: "#ff7a3d", a2: "#ff3d8b" },
    { id: "aurora", a1: "#2dd4bf", a2: "#a3e635" },
    { id: "cereja", a1: "#ff2d55", a2: "#8b5cf6" },
    { id: "gelo", a1: "#e0f2fe", a2: "#60a5fa" },
    { id: "ouro", a1: "#fbbf24", a2: "#f97316" },
  ].map((p) => named("preset.", p));
  const PRESET_IDS = PRESETS.map((p) => p.id);
  const WALL_MODES = ["default", "file", "cover"];
  const ICON_EQ =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<rect x="1" y="6.5" width="1.6" height="3" rx=".8"/><rect x="4.1" y="4.25" width="1.6" height="7.5" rx=".8"/>' +
    '<rect x="7.2" y="1.5" width="1.6" height="13" rx=".8"/><rect x="10.3" y="4.25" width="1.6" height="7.5" rx=".8"/>' +
    '<rect x="13.4" y="6.5" width="1.6" height="3" rx=".8"/></svg>';
  const ICON_X =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M3 3l10 10M13 3L3 13"/></svg>';

  const STYLES = [
    { id: "bars" },                 // "Barras espelhadas"
    { id: "ring" },                 // "Anel neon"
    { id: "wave" },                 // "Onda"
  ].map((x) => named("style.", x));
  const STYLE_IDS = STYLES.map((s) => s.id);
  const IDLE_CHOICES = [5, 10, 20, 30, 60];
  const RHYTHMS = ["auto", "beat", "bass"];
  const RHYTHM_OPTS = [
    { id: "auto" },                 // "Automático"
    { id: "beat" },                 // "Cada batida"
    { id: "bass" },                 // "Graves"
  ].map((x) => named("rhythm.", x));
  /** "Desfoque no modo ambiente" by default: ~11 px per 960 px of window width (~29 px on a 2560 px screen, 22 px at
      1920, 15 px at 1280). The screen width counts too, so a Spotify that boots minimised (innerWidth 0 / small) still
      gets the real value. */
  const AMB_BLUR_DEF = (() => {
    let w = 0;
    try { w = Math.max(typeof innerWidth === "number" ? innerWidth : 0, (typeof screen === "object" && screen && (screen.availWidth || screen.width)) || 0); } catch (e) { /* ignore */ }
    w = Math.min(3840, Math.max(1280, w || 1920));
    return Math.min(40, Math.round((11 * w) / 960));
  })();
  /** "Volta": the slider steps through these (ms); any 10 ms value from FALL_MIN to FALL_MAX stays valid in the settings */
  const FALL_STEPS = [80, 100, 120, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000, 1200, 1500, 2000];
  const DEFAULTS = Object.freeze({
    v: 6,
    enabled: true,
    style: "bars",
    intensity: { bars: 130, ring: 130, wave: 130 },
    reach: { bars: 60, ring: 60, wave: 60 },        // "Alcance" (%)
    fall: { bars: 700, ring: 700, wave: 700 },      // "Volta" (ms)
    caps: { bars: true, ring: true },               // r2: "Tracinhos de pico" (falling peak caps)
    zoom: { on: true, amount: 100 },
    glow: { on: true, amount: 100 },
    groove: { on: true, amount: 100 },              // v5: "Balanço no ritmo"
    // v5b: "Camadas por elemento" (master + the camadas Grave / Voz e melodia / Agudos e chimbal and the reações
    // Quando o grave entra / Caixa e palmas / Subidas e calmarias, each on / off + 0..500 %, and "Cor acompanha a harmonia")
    layers: {
      on: true,
      low: { on: true, amount: 100 }, voice: { on: true, amount: 100 }, air: { on: true, amount: 100 },
      entry: { on: true, amount: 100 }, snare: { on: true, amount: 100 }, mood: { on: true, amount: 100 },
      hue: true,
    },
    idleSec: 10,
    rhythm: "auto",               // "Ritmo do visual": auto | beat ("Cada batida") | bass ("Graves")
    // v5: no "Sincronia" settings (latency / latencyDev of v3 / v4 are dropped by sanitize(): automatic per output)
    // "Cores": preset id | "custom" | "wall" (auto = the pair last picked from the wallpaper)
    colors: { preset: "neon", custom: ["#ff4dff", "#35e7ff"], auto: null },
    // "Wallpaper": mode default ("Gradiente neon") | file | cover ("Capa do álbum", the default); dim 0..80 (%);
    // "Desfoque do layout" layoutBlur and "Desfoque no modo ambiente" ambBlur 0..40 (px, 0 = sharp; an older single
    // blur 0..30 is migrated); "Capa do álbum" keeps its own pair (coverLayoutBlur / coverAmbBlur, default 40 px: a
    // soft colour wash); file = meta of the stored picture
    wallpaper: { mode: "cover", dim: 0, layoutBlur: GLASS_BLUR, ambBlur: AMB_BLUR_DEF, coverLayoutBlur: BLUR_MAX, coverAmbBlur: BLUR_MAX, file: null },
  });


  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d);
  const now = () => performance.now();
  const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))] : 0);
  const sortedOf = (arr) => Float64Array.from(arr).sort();
  const n01 = (v, lo, hi) => clamp((v - lo) / Math.max(1e-6, hi - lo), 0, 1);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const smooth = (x) => x * x * (3 - 2 * x);


  // ---- language: Português (Brasil) + English ------------------------------------
  // Dictionaries: src/i18n/*.json (embedded by the build). The language follows Spotify's own (Spicetify.Locale):
  // pt* -> pt-BR, anything else -> en. localStorage "NeonDrift:lang" ("pt-BR" / "en") overrides it.
  const I18N = {"pt-BR":{"menu.ambient":"Modo ambiente","panel.title":"Personalizar NeonDrift","toast.ambientOn":"Modo ambiente ativado","toast.ambientOff":"Modo ambiente desativado","preset.neon":"Neon Drift","preset.roxoazul":"Roxo e azul","preset.sunset":"Pôr do sol","preset.aurora":"Aurora","preset.cereja":"Cereja","preset.gelo":"Gelo","preset.ouro":"Ouro","style.bars":"Barras espelhadas","style.ring":"Anel neon","style.wave":"Onda","rhythm.auto":"Automático","rhythm.beat":"Cada batida","rhythm.bass":"Graves","soft.note":"Esta faixa não tem análise do Spotify — modo ambiente suave","soft.noteNA":"Análise do Spotify indisponível agora — modo ambiente suave","wall.err.format":"Formato não suportado. Use uma imagem JPG, PNG, WebP ou GIF.","wall.err.gifBig":"GIF grande demais ({size}). O máximo é 15 MB.","wall.err.imgBig":"Imagem grande demais ({size}). O máximo é 80 MB.","wall.loading":"Carregando a imagem…","wall.err.animBig":"Imagem animada grande demais ({size}). O máximo é 15 MB.","wall.err.open":"Não deu para abrir esta imagem. Ela pode estar corrompida ou ser grande demais.","wall.err.shrink":"Não deu para reduzir esta imagem.","wall.err.save":"Não deu para guardar a imagem ({err}).","wall.err.saveUnknown":"erro","wall.autoDim":"Imagem clara: escureci 30% para o texto continuar legível. Ajuste em “Escurecer”.","wall.removed":"Imagem removida.","wall.pressEnter":"Aperte Enter (ou clique) para escolher uma imagem do computador.","toast.match.noColors":"Esta imagem quase não tem cores vivas: mantive as cores atuais","toast.match.fail":"Não deu para ler as cores desta imagem","overlay.testHint":"Mexa o mouse para voltar aos ajustes","pv.chip.highlight":"Destaque: {name}","pv.chip.example":"Exemplo: {name}","pv.badge.demo":"Prévia (demonstração)","pv.badge.soft":"Prévia · modo suave","pv.badge.live":"Prévia ao vivo","tab.amb":"Ambiente","tab.colors":"Cores","tab.wall":"Wallpaper","aria.tabs":"Seções do painel","aria.close":"Fechar","dock.title":"Voltar para a prévia grande","amb.master":"Ativar modo ambiente","amb.masterHint.on":"Entra após {n} s sem mexer, com música tocando","amb.masterHint.off":"Desligado: só entra com “Testar agora”","amb.h.viz":"Visualizador","style.active":"Ativo","sb.tag":"ajustes deste estilo","btn.resetShort":"Padrão","ctl.intensity":"Intensidade","ctl.reach":"Alcance","ctl.reach.lo":"Perto","ctl.reach.hi":"Longe","ctl.fall":"Volta","ctl.fall.lo":"Rápida","ctl.fall.hi":"Bem lenta","ctl.caps":"Tracinhos","ctl.caps.hint":"marcam o pico e caem devagar","fallWord.fast":"rápida","fallWord.medium":"média","fallWord.slow":"lenta","fallWord.vslow":"bem lenta","title.fall":"Volta {word}","aria.reach":"{n}% do máximo","aria.sharp":"0 px, nítido","val.sharp":"Nítido","aria.degrees":"{n} graus","sb.hint.bars":"Intensidade: quanto reagem aos graves. Alcance: até onde as barras sobem e descem. Volta: quanto tempo levam para descer depois de cada batida.","sb.hint.ring":"Intensidade: quanto reagem aos graves. Alcance: até onde as barras do anel chegam. Volta: quanto tempo levam para recolher depois de cada batida.","sb.hint.wave":"Intensidade: quanto reagem aos graves. Alcance: a altura das ondas. Volta: quanto tempo levam para baixar depois de cada batida.","sb.hint.over200":" Acima de 200 %, a Intensidade aumenta principalmente a batida","sb.hint.over200.maxReach":": para a batida não dominar, deixe a Intensidade entre 130 e 200 %.","sb.hint.over200.raiseReach":": para deixar tudo maior sem a batida dominar, aumente o Alcance e deixe a Intensidade entre 130 e 200 %.","sb.legend.ring":"Coroa: grave · Halo: voz · Pontos: agudos","sb.legend.bars":"Centro: grave · Ombros: voz · Pontas: agudos","sb.legend.wave":"Fita 1: grave · Fita 2: voz · Fita 3: agudos","sb.reset.isDefault":"Este estilo já está no padrão","sb.reset.title":"Volta só este estilo ao padrão: Intensidade 130 %, Alcance 60 %, Volta 0,7 s (pede um segundo clique para confirmar)","fx.h":"Efeitos","fx.zoom":"Zoom na batida","fx.zoom.hint":"Um zoom leve em cada batida e um maior quando o grave entra","fx.glow":"Brilho na batida","fx.glow.hint":"Um brilho leve em cada batida e um clarão quando o grave entra","fx.groove":"Balanço no ritmo","fx.groove.hint":"O visual balança no compasso da música, mesmo entre as batidas","aria.fxIntensity":"Intensidade: {name}","rm.hint":"Pausado: {os} está com os efeitos de animação desligados","el.h":"Camadas por elemento","el.master":"Ativar camadas","el.master.hint":"Cada parte da música acende uma parte diferente do visual. Quando um instrumento entra, você vê.","el.rm":"Pausado em parte: {os} está com os efeitos de animação desligados (nada corre nem gira; as camadas continuam acendendo com a música)","el.more.open":"Ajustar cada camada","el.more.close":"Fechar ajustes das camadas","el.sub.always":"Sempre ali","el.sub.always.tag":"respiram com a música","el.sub.sometimes":"De vez em quando","el.sub.sometimes.tag":"reagem a momentos da música","el.low":"Grave","el.voice":"Voz e melodia","el.air":"Agudos e chimbal","el.entry":"Quando o grave entra","el.snare":"Caixa e palmas","el.mood":"Subidas e calmarias","el.hue":"Cor acompanha a harmonia","aria.elIntensity":"Intensidade de {name}","el.hint.low.ring":"o grave contínuo (808, baixo) na coroa, entre as batidas","el.hint.low.bars":"o grave contínuo (808, baixo) nas barras do centro","el.hint.low.wave":"o grave contínuo (808, baixo) na fita principal","el.hint.voice.ring":"o halo em volta da capa respira; um brilho segue a melodia","el.hint.voice.bars":"a névoa atrás das barras e os ombros","el.hint.voice.wave":"a segunda fita","el.hint.air.ring":"os pontinhos de fora piscam a cada chimbal","el.hint.air.bars":"as pontas e as faíscas","el.hint.air.wave":"a fita fina de cima","el.hint.entry":"uma onda de choque corre para fora quando o grave entra no drop (mexa para ver na prévia)","el.hint.snare":"um estalo rápido a cada caixa ou palma","el.hint.mood":"na subida tudo se fecha e acelera; na calmaria tudo acalma; no drop solta (mexa para ver na prévia)","el.hint.hue.ring":"a cor do halo muda devagar com os acordes, sempre dentro das suas cores","el.hint.hue.bars":"a cor da névoa atrás das barras muda devagar com os acordes, sempre dentro das suas cores","el.hint.hue.wave":"a cor da segunda fita muda devagar com os acordes, sempre dentro das suas cores","el.hint.hue.needsVoice":" (precisa de Voz e melodia)","el.hintRM.entry":"no drop, um anel de luz acende e apaga no lugar","el.hintRM.mood":"na subida as bordas escurecem; na calmaria tudo acalma; no drop solta","el.reset.isDefault":"As camadas já estão no padrão","el.reset.title":"Volta todas as camadas e reações ao padrão: tudo ligado, 100 %, cor acompanha a harmonia (pede um segundo clique para confirmar)","rhythm.h":"Ritmo do visual","rhythm.hint.beat":"Pulsa em toda batida, como um bumbo 4×4 (trance, house, eletrônica).","rhythm.hint.bass":"Pulsa nos graves fortes: 808, bumbo e baixo (trap, funk, rap).","rhythm.hint.auto":"Escolhe sozinho para cada música: toda batida na eletrônica, os graves no trap e no funk.","rhythm.hint.autoFour":"Nesta música: toda batida (parece eletrônica, bumbo 4×4).","rhythm.hint.autoBass":"Nesta música: os graves fortes (808, bumbo e baixo).","idle.h":"Entrar após","idle.opt":"{n} s","amb.test":"Testar agora","amb.reset":"Restaurar padrão","amb.reset.title":"Volta tudo desta aba ao padrão (pede um segundo clique para confirmar): estilo, Intensidade / Alcance / Volta dos 3 estilos, efeitos, camadas por elemento, ritmo e tempo para entrar. Cores e wallpaper não mudam.","amb.foot":"Mexa o mouse ou aperte qualquer tecla para sair do modo ambiente.","arm.again":"Clique de novo","arm.confirm":"Confirmar?","toast.reset.amb":"Modo ambiente: padrão restaurado","toast.reset.colors":"Cores: padrão restaurado (Neon Drift)","toast.reset.wall":"Wallpaper: padrão restaurado","toast.reset.layers":"Camadas por elemento: padrão restaurado","toast.reset.style":"{name}: padrão restaurado","col.h":"Paleta de cores","col.original":"original","col.custom":"Personalizado","col.chip":"Cor {n}","col.swap.aria":"Inverter as duas cores","col.swap.title":"Inverter as cores","col.hue":"Matiz","col.sat":"Saturação","col.val":"Brilho","col.code":"Código","col.code.aria":"Código da cor em hexadecimal, por exemplo #FF4DFF","col.darkWarn":"Cor escura: botões e destaques vão aparecer menos.","col.match":"Combinar com o wallpaper","col.match.hint.off":"Pega duas cores vivas do papel de parede","col.match.hint.cover":"Ativo: as cores acompanham a capa de cada música","col.match.hint.on":"Ativo: cores tiradas do papel de parede","col.foot":"As cores mudam os destaques do Spotify inteiro e o modo ambiente. O fundo azul-marinho fica, para tudo continuar legível; para mudar o clima todo, troque também o wallpaper.","wall.h":"Papel de parede","wall.opt.default":"Gradiente neon","wall.opt.file":"Imagem do computador","wall.opt.cover":"Capa do álbum","wall.fileInfo.empty":"JPG, PNG, WebP ou GIF (GIF até 15 MB)","wall.pick":"Escolher imagem…","wall.change":"Trocar imagem…","wall.remove":"Remover","wall.hint.noCover.file":"Nada tocando com capa agora: usando a sua imagem até a próxima música.","wall.hint.noCover.default":"Nada tocando com capa agora: usando o Gradiente neon até a próxima música.","wall.hint.cover":"O fundo muda a cada música. Use os controles de Desfoque abaixo para suavizar a capa.","wall.hint.noFile":"Não achei a imagem guardada: escolha de novo.","wall.hint.file":"A sua imagem fica guardada neste computador.","wall.hint.default":"Um fundo neon suave, desenhado pelo próprio NeonDrift.","wall.adj.h":"Ajustes da imagem","wall.dim":"Escurecer","wall.layoutBlur":"Desfoque do layout","wall.ambBlur":"Desfoque no modo ambiente","wall.ambPv.badge":"Fundo do modo ambiente (tamanho real)","wall.ambTest":"Ver no modo ambiente","wall.blurHint.cover":"A Capa do álbum guarda os seus próprios Desfoques (padrão 40 px, bem suave). ","wall.blurHint.zero":"Em 0 (Nítido) a imagem fica sem nenhum desfoque; escureça ou desfoque se o texto ficar difícil de ler.","wall.reset.title":"Volta o wallpaper, o escurecer e os desfoques ao padrão (pede um segundo clique para confirmar). A imagem guardada continua guardada.","aria.fall":{"one":"{s} segundo, {word}","other":"{s} segundos, {word}"},"os.windows":"o Windows","os.mac":"o macOS","os.other":"o sistema","wall.blurHint.layout":"Desfoque do layout: o fundo atrás das telas do Spotify. ","wall.blurHint.amb":"Desfoque no modo ambiente: o fundo da tela cheia (prévia acima, em tamanho real). ","colors.note.noTheme":"O tema NeonDrift não está ativo: as cores mudam só o modo ambiente, este painel e o botão.","wall.note.noTheme":"O tema NeonDrift não está ativo: o papel de parede aparece só no modo ambiente.","compat.note":"Esta versão do Spotify ({v}) ainda não foi testada com o NeonDrift. O modo ambiente funciona; alguns detalhes do visual podem ficar diferentes.","compat.ok":"Entendi","compat.note.api":"Faltam alguns recursos do Spicetify que o NeonDrift usa. O modo ambiente continua funcionando (sem a análise das músicas, no modo suave).","toast.shortcut":"NeonDrift: aperte Ctrl+Alt+N para abrir os ajustes","overlay.intro":"Modo ambiente · mexa o mouse para voltar · ajustes: {where}","overlay.introWhere.top":"o botão de equalizador lá em cima","overlay.introWhere.playbar":"o botão de equalizador na barra do player","overlay.introWhere.menu":"“Personalizar NeonDrift” no menu do seu perfil","overlay.introWhere.shortcut":"Ctrl+Alt+N"},"en":{"menu.ambient":"Ambient mode","panel.title":"Customize NeonDrift","toast.ambientOn":"Ambient mode on","toast.ambientOff":"Ambient mode off","preset.neon":"Neon Drift","preset.roxoazul":"Purple & blue","preset.sunset":"Sunset","preset.aurora":"Aurora","preset.cereja":"Cherry","preset.gelo":"Ice","preset.ouro":"Gold","style.bars":"Mirrored bars","style.ring":"Neon ring","style.wave":"Wave","rhythm.auto":"Automatic","rhythm.beat":"Every beat","rhythm.bass":"Bass","soft.note":"This track has no Spotify analysis — soft ambient mode","soft.noteNA":"Spotify analysis unavailable right now — soft ambient mode","wall.err.format":"Unsupported format. Use a JPG, PNG, WebP or GIF image.","wall.err.gifBig":"GIF too large ({size}). The maximum is 15 MB.","wall.err.imgBig":"Image too large ({size}). The maximum is 80 MB.","wall.loading":"Loading the picture…","wall.err.animBig":"Animated image too large ({size}). The maximum is 15 MB.","wall.err.open":"Couldn't open this picture. It may be damaged or too large.","wall.err.shrink":"Couldn't shrink this picture.","wall.err.save":"Couldn't save the picture ({err}).","wall.err.saveUnknown":"error","wall.autoDim":"Bright picture: dimmed it by 30% so text stays readable. Adjust it under “Dim”.","wall.removed":"Picture removed.","wall.pressEnter":"Press Enter (or click) to choose a picture from your computer.","toast.match.noColors":"This picture has almost no vivid colors: kept the current colors","toast.match.fail":"Couldn't read the colors of this picture","overlay.testHint":"Move the mouse to go back to the settings","pv.chip.highlight":"Highlight: {name}","pv.chip.example":"Example: {name}","pv.badge.demo":"Preview (demo)","pv.badge.soft":"Preview · soft mode","pv.badge.live":"Live preview","tab.amb":"Ambient","tab.colors":"Colors","tab.wall":"Wallpaper","aria.tabs":"Panel sections","aria.close":"Close","dock.title":"Back to the large preview","amb.master":"Turn on ambient mode","amb.masterHint.on":"Starts after {n} s of no activity while music is playing","amb.masterHint.off":"Off: only starts with “Try it now”","amb.h.viz":"Visualizer","style.active":"Active","sb.tag":"settings for this style","btn.resetShort":"Reset","ctl.intensity":"Intensity","ctl.reach":"Reach","ctl.reach.lo":"Near","ctl.reach.hi":"Far","ctl.fall":"Fall","ctl.fall.lo":"Fast","ctl.fall.hi":"Very slow","ctl.caps":"Peak caps","ctl.caps.hint":"mark the peak and drift down slowly","fallWord.fast":"fast","fallWord.medium":"medium","fallWord.slow":"slow","fallWord.vslow":"very slow","title.fall":"Fall: {word}","aria.reach":"{n}% of maximum","aria.sharp":"0 px, sharp","val.sharp":"Sharp","aria.degrees":"{n} degrees","sb.hint.bars":"Intensity: how strongly they react to the bass. Reach: how far the bars go up and down. Fall: how long they take to come back down after each beat.","sb.hint.ring":"Intensity: how strongly they react to the bass. Reach: how far the ring's bars extend. Fall: how long they take to pull back after each beat.","sb.hint.wave":"Intensity: how strongly they react to the bass. Reach: the height of the waves. Fall: how long they take to settle after each beat.","sb.hint.over200":" Above 200%, Intensity mostly makes the beat bigger","sb.hint.over200.maxReach":": to keep the beat from taking over, keep Intensity between 130 and 200%.","sb.hint.over200.raiseReach":": to make everything bigger without the beat taking over, raise Reach and keep Intensity between 130 and 200%.","sb.legend.ring":"Crown: bass · Halo: vocals · Dots: highs","sb.legend.bars":"Center: bass · Shoulders: vocals · Tips: highs","sb.legend.wave":"Ribbon 1: bass · Ribbon 2: vocals · Ribbon 3: highs","sb.reset.isDefault":"This style is already at its defaults","sb.reset.title":"Resets only this style: Intensity 130%, Reach 60%, Fall 0.7 s (asks for a second click to confirm)","fx.h":"Effects","fx.zoom":"Beat zoom","fx.zoom.hint":"A light zoom on every beat and a bigger one when the bass kicks in","fx.glow":"Beat glow","fx.glow.hint":"A soft glow on every beat and a flash when the bass kicks in","fx.groove":"Groove sway","fx.groove.hint":"The visual sways in time with the music, even between beats","aria.fxIntensity":"Intensity: {name}","rm.hint":"Paused: {os} has animation effects turned off","el.h":"Per-element layers","el.master":"Turn on layers","el.master.hint":"Each part of the music lights up a different part of the visual. When an instrument comes in, you see it.","el.rm":"Partly paused: {os} has animation effects turned off (nothing travels or spins; the layers still light up with the music)","el.more.open":"Adjust each layer","el.more.close":"Close layer settings","el.sub.always":"Always there","el.sub.always.tag":"breathe with the music","el.sub.sometimes":"Now and then","el.sub.sometimes.tag":"react to moments in the music","el.low":"Bass","el.voice":"Vocals & melody","el.air":"Highs & hi-hats","el.entry":"When the bass kicks in","el.snare":"Snares & claps","el.mood":"Build-ups & breakdowns","el.hue":"Color follows the harmony","aria.elIntensity":"{name} intensity","el.hint.low.ring":"the sustained bass (808, bass line) in the crown, between beats","el.hint.low.bars":"the sustained bass (808, bass line) in the center bars","el.hint.low.wave":"the sustained bass (808, bass line) in the main ribbon","el.hint.voice.ring":"the halo around the cover breathes; a glint follows the melody","el.hint.voice.bars":"the haze behind the bars and the shoulders","el.hint.voice.wave":"the second ribbon","el.hint.air.ring":"the outer dots twinkle on every hi-hat","el.hint.air.bars":"the tips and the sparks","el.hint.air.wave":"the thin top ribbon","el.hint.entry":"a shockwave rushes outward when the bass comes in at the drop (move it to see it in the preview)","el.hint.snare":"a quick snap on every snare or clap","el.hint.mood":"on a build-up everything tightens and speeds up; in a breakdown everything calms down; at the drop it lets go (move it to see it in the preview)","el.hint.hue.ring":"the halo's color shifts slowly with the chords, always within your colors","el.hint.hue.bars":"the color of the haze behind the bars shifts slowly with the chords, always within your colors","el.hint.hue.wave":"the second ribbon's color shifts slowly with the chords, always within your colors","el.hint.hue.needsVoice":" (needs Vocals & melody)","el.hintRM.entry":"at the drop, a ring of light flashes on and off in place","el.hintRM.mood":"on a build-up the edges darken; in a breakdown everything calms down; at the drop it lets go","el.reset.isDefault":"The layers are already at their defaults","el.reset.title":"Resets all layers and reactions to their defaults: everything on, 100%, color follows the harmony (asks for a second click to confirm)","rhythm.h":"Visual rhythm","rhythm.hint.beat":"Pulses on every beat, like a four-on-the-floor kick (trance, house, electronic).","rhythm.hint.bass":"Pulses on the strong bass: 808s, kick drum and bass (trap, baile funk, rap).","rhythm.hint.auto":"Picks by itself for each song: every beat for electronic music, the strong bass for trap and baile funk.","rhythm.hint.autoFour":"This song: every beat (sounds electronic, four-on-the-floor kick).","rhythm.hint.autoBass":"This song: the strong bass (808s, kick drum and bass).","idle.h":"Start after","idle.opt":"{n} s","amb.test":"Try it now","amb.reset":"Restore defaults","amb.reset.title":"Resets everything on this tab (asks for a second click to confirm): style, Intensity / Reach / Fall of all 3 styles, effects, per-element layers, rhythm and start delay. Colors and wallpaper stay as they are.","amb.foot":"Move the mouse or press any key to leave ambient mode.","arm.again":"Click again","arm.confirm":"Confirm?","toast.reset.amb":"Ambient mode: defaults restored","toast.reset.colors":"Colors: defaults restored (Neon Drift)","toast.reset.wall":"Wallpaper: defaults restored","toast.reset.layers":"Per-element layers: defaults restored","toast.reset.style":"{name}: defaults restored","col.h":"Color palette","col.original":"original","col.custom":"Custom","col.chip":"Color {n}","col.swap.aria":"Swap the two colors","col.swap.title":"Swap colors","col.hue":"Hue","col.sat":"Saturation","col.val":"Brightness","col.code":"Hex","col.code.aria":"Hex color code, for example #FF4DFF","col.darkWarn":"Dark color: buttons and highlights will stand out less.","col.match":"Match the wallpaper","col.match.hint.off":"Picks two vivid colors from the wallpaper","col.match.hint.cover":"On: the colors follow each song's cover","col.match.hint.on":"On: colors taken from the wallpaper","col.foot":"The colors change the accents across all of Spotify and in ambient mode. The navy background stays so everything remains readable; to change the whole mood, change the wallpaper too.","wall.h":"Wallpaper","wall.opt.default":"Neon gradient","wall.opt.file":"Picture from computer","wall.opt.cover":"Album cover","wall.fileInfo.empty":"JPG, PNG, WebP or GIF (GIF up to 15 MB)","wall.pick":"Choose picture…","wall.change":"Change picture…","wall.remove":"Remove","wall.hint.noCover.file":"Nothing with a cover is playing right now: showing your picture until the next song.","wall.hint.noCover.default":"Nothing with a cover is playing right now: showing the neon gradient until the next song.","wall.hint.cover":"The background changes with every song. Use the Blur controls below to soften the cover.","wall.hint.noFile":"Couldn't find your saved picture: please choose it again.","wall.hint.file":"Your picture is stored on this computer only.","wall.hint.default":"A soft neon backdrop drawn by NeonDrift itself.","wall.adj.h":"Picture settings","wall.dim":"Dim","wall.layoutBlur":"Layout blur","wall.ambBlur":"Ambient mode blur","wall.ambPv.badge":"Ambient mode background (actual size)","wall.ambTest":"View in ambient mode","wall.blurHint.cover":"Album cover keeps its own blur settings (default 40 px, very soft). ","wall.blurHint.zero":"At 0 (Sharp) the picture has no blur at all; dim or blur it if text gets hard to read.","wall.reset.title":"Resets the wallpaper, dimming and blur to their defaults (asks for a second click to confirm). Your saved picture stays saved.","aria.fall":{"one":"{s} second, {word}","other":"{s} seconds, {word}"},"os.windows":"Windows","os.mac":"macOS","os.other":"your system","wall.blurHint.layout":"Layout blur: the background behind Spotify's screens. ","wall.blurHint.amb":"Ambient mode blur: the full-screen background (preview above, at actual size). ","colors.note.noTheme":"The NeonDrift theme isn't active: the colors only change ambient mode, this panel and its button.","wall.note.noTheme":"The NeonDrift theme isn't active: the wallpaper only shows in ambient mode.","compat.note":"This Spotify version ({v}) hasn't been tested with NeonDrift yet. Ambient mode works; some layout details may look different.","compat.ok":"Got it","compat.note.api":"Some Spicetify features NeonDrift uses are missing here. Ambient mode still works (without the track analysis, in soft mode).","toast.shortcut":"NeonDrift: press Ctrl+Alt+N to open its settings","overlay.intro":"Ambient mode · move the mouse to go back · settings: {where}","overlay.introWhere.top":"the equalizer button at the top","overlay.introWhere.playbar":"the equalizer button in the player bar","overlay.introWhere.menu":"“Customize NeonDrift” in your profile menu","overlay.introWhere.shortcut":"Ctrl+Alt+N"}};
  const LANG_KEY = "NeonDrift:lang";
  let LANG = "en", LANG_SRC = "default", PLURAL = null;
  let PCT = "%";                                   // "200 %" in pt-BR (no-break space, like "0,7 s"), "200%" in en
  const langOf = (v) => (/^pt(\b|[-_])/i.test(String(v || "").trim()) ? "pt-BR" : "en");
  /** reads the language (override > Spicetify.Locale > the page / the browser); true when it changed */
  function resolveLang() {
    let v = "", src = "default";
    try { const o = localStorage.getItem(LANG_KEY); if (o) { v = o; src = "override"; } } catch (e) { /* ignore */ }
    if (!v && !FAULT.locale) {
      try {
        const L = window.Spicetify && Spicetify.Locale;
        const g = L && ((typeof L.getLocale === "function" && L.getLocale()) || L._locale);
        if (g && typeof g === "string") { v = g; src = "spicetify"; }
      } catch (e) { /* ignore */ }
    }
    if (!v) {
      v = (navigator.languages && navigator.languages[0]) || navigator.language || document.documentElement.lang || "";
      src = "fallback";
    }
    const lang = langOf(v), changed = lang !== LANG || !PLURAL;
    LANG = lang;
    LANG_SRC = src;
    PCT = LANG === "pt-BR" ? " %" : "%";
    try { PLURAL = new Intl.PluralRules(LANG); } catch (e) { PLURAL = { select: (n) => (n === 1 ? "one" : "other") }; }
    return changed;
  }
  /** the text of key in the current language (en, then the key itself, when missing); {name} placeholders from p;
      a plural entry ({ one, other }) is picked by p.n */
  function tr(key, p) {
    const d = I18N[LANG] || {}, en = I18N.en || {};
    let s = Object.prototype.hasOwnProperty.call(d, key) ? d[key] : Object.prototype.hasOwnProperty.call(en, key) ? en[key] : null;
    if (s == null) { if (ND_DEV) console.warn("[NeonDrift] missing text: " + key); s = key; }
    if (typeof s === "object") s = s[PLURAL ? PLURAL.select(Number(p && p.n) || 0) : "other"] || s.other || "";
    if (p) s = s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(p, k) ? String(p[k]) : m));
    return s;
  }
  /** a decimal number as written in the current language ("0,7" / "0.7") */
  const dec = (s) => (LANG === "pt-BR" ? String(s).replace(".", ",") : String(s));
  /** the operating system in a sentence ("o Windows" / "Windows"...) */
  function osName() {
    let p = "";
    try { p = String((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ""); } catch (e) { /* ignore */ }
    return tr(/win/i.test(p) ? "os.windows" : /mac/i.test(p) ? "os.mac" : "os.other");
  }
  resolveLang();
  // ---- settings ----------------------------------------------------------------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function sanitize(o) {
    const d = clone(DEFAULTS);
    if (!o || typeof o !== "object") return d;
    const pctv = (v, def) => clamp(Math.round(num(Number(v), def) / 5) * 5, 0, INT_MAX);
    d.enabled = o.enabled !== false;
    d.style = STYLE_IDS.includes(o.style) ? o.style : d.style;
    for (const id of STYLE_IDS) {
      d.intensity[id] = pctv(o.intensity && o.intensity[id], DEFAULTS.intensity[id]);
      d.reach[id] = reachStep(o.reach && o.reach[id], DEFAULTS.reach[id]);
      d.fall[id] = fallStep(o.fall && o.fall[id], DEFAULTS.fall[id]);
      if (id in d.caps) d.caps[id] = !(o.caps && o.caps[id] === false);
    }
    for (const k of ["zoom", "glow", "groove"]) {
      const s = o[k] || {};
      d[k].on = s.on !== false;
      d[k].amount = pctv(s.amount, DEFAULTS[k].amount);
    }
    // "Camadas por elemento": settings v5 only ADD this box (every older choice is kept); saved once at boot
    const ly = o.layers && typeof o.layers === "object" ? o.layers : null;
    if (!ly) SETTINGS_MIGRATED = true;
    d.layers.on = !(ly && ly.on === false);
    for (const k of ["low", "voice", "air", "entry", "snare", "mood"]) {
      const s = (ly && ly[k] && typeof ly[k] === "object") ? ly[k] : {};
      d.layers[k].on = s.on !== false;
      d.layers[k].amount = pctv(s.amount, DEFAULTS.layers[k].amount);
    }
    d.layers.hue = !(ly && ly.hue === false);
    // settings v6: the core mix changed (the kick ~1.2 x each other element, a small kick zoom and a big one on
    // the bass entry, no beat motion without drums), so settings saved by v5 or older restart from the defaults for every
    // style's "Intensidade" / "Alcance" / "Volta" and every effect / layer amount. Kept: style, colours, wallpaper,
    // rhythm, caps, idle time and every on / off choice. Saved once at boot (SETTINGS_MIGRATED). An object without a
    // version (debug API / offline tools) is taken as it is.
    const ver = Number(o.v);
    if (isFinite(ver) && ver < 6) {
      for (const id of STYLE_IDS) { d.intensity[id] = DEFAULTS.intensity[id]; d.reach[id] = DEFAULTS.reach[id]; d.fall[id] = DEFAULTS.fall[id]; }
      for (const k of ["zoom", "glow", "groove"]) d[k].amount = DEFAULTS[k].amount;
      for (const k of ["low", "voice", "air", "entry", "snare", "mood"]) d.layers[k].amount = DEFAULTS.layers[k].amount;
      SETTINGS_MIGRATED = true;
    }
    d.idleSec = IDLE_CHOICES.includes(Number(o.idleSec)) ? Number(o.idleSec) : d.idleSec;
    d.rhythm = RHYTHMS.includes(o.rhythm) ? o.rhythm : d.rhythm;
    // settings v5: the manual / calibrated "Sincronia" values (older "latency", "latencyDev") are dropped: every output
    // gets its automatic value again (deviceDefault). Saved once at boot without them.
    if ("latency" in o || "latencyDev" in o) SETTINGS_MIGRATED = true;
    const c = o.colors && typeof o.colors === "object" ? o.colors : {};
    const pair = (v) => (Array.isArray(v) && v.length === 2 && isHex(v[0]) && isHex(v[1]) ? [v[0].toLowerCase(), v[1].toLowerCase()] : null);
    d.colors.preset = PRESET_IDS.includes(c.preset) || c.preset === "custom" || c.preset === "wall" ? c.preset : d.colors.preset;
    d.colors.custom = pair(c.custom) || d.colors.custom;
    d.colors.auto = pair(c.auto);
    const w = o.wallpaper && typeof o.wallpaper === "object" ? o.wallpaper : {};
    d.wallpaper.mode = WALL_MODES.includes(w.mode) ? w.mode : d.wallpaper.mode;
    d.wallpaper.dim = clamp(Math.round(num(Number(w.dim), 0) / 5) * 5, 0, 80);
    const blurPx = (v) => clamp(Math.round(Number(v)), 0, BLUR_MAX);
    const has = (v) => v !== null && v !== "" && v !== undefined && isFinite(Number(v));
    const hasL = has(w.layoutBlur), hasA = has(w.ambBlur), hasCL = has(w.coverLayoutBlur), hasCA = has(w.coverAmbBlur);
    if (!hasL || !hasA) {
      // settings v3: one "Desfoque" b (0..30 px) = the layout wallpaper's own blur, on top of the panels' fixed 3 px
      // glass; the overlay pre-blurred a 960 px canvas by 10 + 0.45 b px and stretched it over 110% of the window
      // (the album cover was pre-blurred 18 px at 640 px on top: ~72 px on screen, the slider's 40 px is the closest).
      // Migrated to what that looked like on screen (the screen width too, in case Spotify boots minimised).
      const b = clamp(num(Number(w.blur), 0), 0, 30);
      const winW = clamp(Math.max((typeof innerWidth === "number" && innerWidth) || 0, (typeof screen === "object" && screen && (screen.availWidth || screen.width)) || 0) || 1920, 1280, 3840);
      if (!hasL) d.wallpaper.layoutBlur = blurPx(Math.hypot(b, GLASS_BLUR));
      if (!hasA) d.wallpaper.ambBlur = blurPx((10 + b * 0.45) * (1.1 * winW / 960));
      SETTINGS_MIGRATED = true;
    } else if (!hasCL && !hasCA && w.mode === "cover") {
      // settings v4.0 on "Capa do álbum": the pair was set for the cover (40 / 40 by the v3 migration, or what was
      // chosen since); it becomes the cover's own pair, the other wallpapers get the defaults
      d.wallpaper.coverLayoutBlur = blurPx(w.layoutBlur);
      d.wallpaper.coverAmbBlur = blurPx(w.ambBlur);
      d.wallpaper.layoutBlur = DEFAULTS.wallpaper.layoutBlur;
      d.wallpaper.ambBlur = DEFAULTS.wallpaper.ambBlur;
      SETTINGS_MIGRATED = true;
      return finishWall(d, w);
    }
    if (hasL) d.wallpaper.layoutBlur = blurPx(w.layoutBlur);
    if (hasA) d.wallpaper.ambBlur = blurPx(w.ambBlur);
    if (hasCL) d.wallpaper.coverLayoutBlur = blurPx(w.coverLayoutBlur);
    if (hasCA) d.wallpaper.coverAmbBlur = blurPx(w.coverAmbBlur);
    return finishWall(d, w);
  }
  function finishWall(d, w) {
    const f = w.file;
    d.wallpaper.file = f && typeof f === "object" && typeof f.name === "string" ? {
      name: f.name.slice(0, 120), type: String(f.type || "").slice(0, 40), w: Math.round(num(f.w, 0)), h: Math.round(num(f.h, 0)),
      size: Math.round(num(f.size, 0)), at: Math.round(num(f.at, 0)), anim: !!f.anim,
    } : null;
    if (d.wallpaper.mode === "file" && !d.wallpaper.file) d.wallpaper.mode = DEFAULTS.wallpaper.mode;
    return d;
  }
  function isHex(v) { return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v); }
  function reachStep(v, def) { return clamp(Math.round(num(Number(v), def) / 5) * 5, REACH_MIN, REACH_MAX); }
  function fallStep(v, def) { return clamp(Math.round(num(Number(v), def) / 10) * 10, FALL_MIN, FALL_MAX); }
  /** "Volta": the slider steps through FALL_STEPS (roughly logarithmic, every step a round value, 0,7 s included),
      the setting is in ms */
  const fallFromPos = (p) => FALL_STEPS[clamp(Math.round(num(Number(p), 10)), 0, FALL_STEPS.length - 1)];
  const fallToPos = (ms) => {
    let k = 0;
    for (let i = 1; i < FALL_STEPS.length; i++) if (Math.abs(Math.log(FALL_STEPS[i] / ms)) < Math.abs(Math.log(FALL_STEPS[k] / ms))) k = i;
    return k;
  };
  let SETTINGS_MIGRATED = false;   // sanitize() converted old values (older "Desfoque" / "Sincronia"): saved once at boot
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) { /* ignore */ }
    const s = clone(DEFAULTS);                          // first run: migrate the old on / off flag
    try { if (localStorage.getItem(LEGACY_KEY) === "0") s.enabled = false; } catch (e) { /* ignore */ }
    return s;
  }
  /** a new install: nothing saved by any version yet (read before anything is written). Only then does the first
      ambient mode that starts by itself show a one-time hint (how to go back, where the settings are; INTRO_KEY) */
  const FIRST_RUN = (() => {
    try { return localStorage.getItem(SETTINGS_KEY) === null && localStorage.getItem(LEGACY_KEY) === null; } catch (e) { return false; }
  })();
  let CFG = loadSettings();
  let saveTimer = 0;
  function saveSettings(immediate) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    const write = () => {
      saveTimer = 0;
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(CFG));
        localStorage.setItem(LEGACY_KEY, CFG.enabled ? "1" : "0");   // the old on / off flag stays consistent
      } catch (e) { /* ignore */ }
    };
    if (immediate) write(); else saveTimer = setTimeout(write, 250);
  }

  // ---- state -----------------------------------------------------------------
  const S = {
    get enabled() { return CFG.enabled; },
    idleOverride: 0,            // debug setIdleMs()
    phase: "off",               // off | entering | on | exiting
    lastActivity: now(),
    lastKey: -Infinity,
    mouseX: NaN, mouseY: NaN, anchorX: NaN, anchorY: NaN,
    swallowKeyUp: null,
    graceUntil: 0,
    blockedBy: null,
    blockedDetail: null,        // what blocked it last: { sel, tag, id } (diagnostics)
    shortcut: false,            // Ctrl+Alt+N opens the panel (only when no button / menu entry could be added)
    raf: 0, lastFrame: 0, lastTick: 0, fadeTimer: 0, interval: 0,
    vsync: 16.7,                // measured display refresh interval (ms)
    latEff: LATENCY_MS,         // device latency minus the display lead, used by the renderers
    dev: null, outSel: null,    // current output device (cached) / Spotify's explicitly selected output
    clock: { pos: 0, at: 0, playing: false, speed: 1, valid: false, syncedAt: -1e9 },
    demo: null,                 // { pos, at }: "Testar agora" while paused
    pdemo: null,                // panel preview clock while paused
    metaUri: null, metaToken: 0, pvUri: null, pvCover: null,
    metaGeo: null,              // layout of the title block (counter-zoom)
    wall: "none",               // none | loading | ready | css
    reducedMotion: false,
    panelOpen: false,
    reopenPanel: 0,             // "Testar agora": reopen the panel when the test ends before this time
    tab: "amb",                 // panel tab: amb | colors | wall
    cEdit: 0, hsv: null, hsvHex: null,   // "Personalizado": colour being edited + its HSV (sliders)
    filePicking: false,         // the file dialog of "Imagem do computador" is open
    wallKey: "", wallToken: 0, wallImg: null,   // overlay wallpaper: source shown, load token, decoded picture
    hold: false, holdReq: null,  // debug: freeze on a chosen frame (screenshots)
    level: 0, lastFx: { zoom: 1, focus: 0, glow: 0 },
    stats: { requests: 0, framesRendered: 0, previewFrames: 0, enters: 0, exits: 0, idleChecks: 0, idleCheckMs: 0 },
    test: null,                 // test overrides { playing, hidden, fallback } (debug API only)
    perf: { cost: new Float32Array(600), gap: new Float32Array(600), i: 0, n: 0 },
    trace: null,
    sampleNext: false, lastSample: null, lastStep: 0,
    enterReason: null,
    lastExit: null,
    destroyed: false,
  };
  const idleMs = () => S.idleOverride || CFG.idleSec * 1000;
  const cache = new Map();     // uri -> { st: pending | ok | fail | none, a, at }
  const el = {};               // overlay + panel DOM
  const cover = { img: null, url: "", prev: null, swapAt: 0 };   // cover for the canvas-drawn ring
  let menuItem = null, menuSettings = null, topBtn = null, playBtn = null;


  // ---- compatibility: every Spotify / Spicetify feature is looked up when it is used ----------------
  // Tested on Spotify 1.3.4.258 with Spicetify 2.45.3. Anything missing degrades on its own (no analysis: soft mode;
  // no top-bar host: other entry points; no menu: the shortcut) and never stops the boot.
  const TESTED_SPOTIFY = ["1.3.4.258"];
  const COMPAT_NOTE_KEY = "NeonDrift:compat-note";
  const DEBUG = (() => { try { return localStorage.getItem("NeonDrift:debug") === "1"; } catch (e) { return false; } })();
  const dbg = (...a) => { if (DEBUG || ND_DEV) try { console.debug("[NeonDrift]", ...a); } catch (e) { /* ignore */ } };
  /** Spotify's audio analysis of a track: Spicetify.getAudioData, else the same endpoint through CosmosAsync */
  function audioData(uri) {
    const s = window.Spicetify || {};
    if (typeof s.getAudioData === "function" && !FAULT.getAudioData) return s.getAudioData(uri);
    if (s.CosmosAsync && typeof s.CosmosAsync.get === "function" && !FAULT.cosmos) {
      const id = String(uri).split(":").pop();
      return s.CosmosAsync.get("https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/" + id + "?format=json");
    }
    return Promise.reject(new Error("no analysis API"));
  }
  /** Spotify / Spicetify versions (report only) */
  function versions() {
    let spotify = "", spicetify = "";
    try { spotify = String((Spicetify.Platform && Spicetify.Platform.version) || ""); } catch (e) { /* ignore */ }
    if (!spotify) { const m = /Spotify\/(\d+\.\d+\.\d+\.\d+)/.exec(navigator.userAgent || ""); spotify = m ? m[1] : ""; }
    try { spicetify = String((Spicetify.Config && Spicetify.Config.version) || ""); } catch (e) { /* ignore */ }
    return { spotify: spotify || "unknown", spicetify: spicetify || "unknown", tested: TESTED_SPOTIFY.some((v) => spotify.startsWith(v)) };
  }
  /** read-only probe of what this Spotify offers (NeonDriftAmbient.compat()) */
  function compatProbe() {
    const s = window.Spicetify || {}, q = (sel) => { try { return !!document.querySelector(sel); } catch (e) { return false; } };
    const api = {
      player: !!(s.Player && typeof s.Player.addEventListener === "function" && typeof s.Player.getProgress === "function"),
      getAudioData: typeof s.getAudioData === "function",
      cosmos: !!(s.CosmosAsync && typeof s.CosmosAsync.get === "function"),
      history: !!(s.Platform && s.Platform.History),
      menu: !!(s.Menu && typeof s.Menu.Item === "function"),
      topbar: !!(s.Topbar && typeof s.Topbar.Button === "function"),
      playbar: !!(s.Playbar && typeof s.Playbar.Button === "function"),
      locale: !!(s.Locale && (typeof s.Locale.getLocale === "function" || s.Locale._locale)),
    };
    const dom = {
      actionButtons: q(".main-actionButtons, .uf2x5WzM1lLLCLSQdMFB, .ERwUgK0ZJ6qV1QmdLcWt"),   // readable name or the 1.3.4 / 1.3.6 scrambled one
      globalNav: q('[id="global-nav-bar"]'),
      userWidget: q('[data-testid="user-widget-link"]'),
      mainView: q("#main-view"),
      nowPlayingBar: q('aside[data-testid="now-playing-bar"]'),
      rightPanel: q("#Desktop_PanelContainer_Id"),
      topContainer: q(".Root__top-container, .bokji1jrN2MBe7RA0384, .LiEjwLua6RNBCvlysAT2") || q(".Root > div:has(#main-view)"),
    };
    return Object.assign({ versions: versions(), theme: { on: THEME.on, version: THEME.ver, source: THEME.source }, lang: { lang: LANG, source: LANG_SRC }, api, dom,
      entry: entryState() });
  }
  /** a one-time note in the panel (dismissed per Spotify version): a missing API ({ why: "api" }, any version, with or
      without the theme), else an untested Spotify version with the NeonDrift theme ({ why: "version" }: its layout
      may look different); null = no note */
  function compatNoteWanted() {
    const v = versions(), p = compatProbe();
    const apiOk = p.api.player && (p.api.getAudioData || p.api.cosmos) && p.api.menu;
    if ((v.tested || !THEME.on) && apiOk) return null;
    let seen = "";
    try { seen = localStorage.getItem(COMPAT_NOTE_KEY) || ""; } catch (e) { /* ignore */ }
    return seen === v.spotify ? null : { v: v.spotify, why: apiOk ? "version" : "api" };
  }

  // ---- the extension's own styles ----------------------------------------------------------------
  // src/css (overlay, panel, top-bar button, own tooltip), embedded by the build. Appended as the LAST children of
  // <body>: after Spotify's stylesheets (<head>, also the ones it adds per route) and after the theme's user.css, so an
  // equal-specificity rule of ours wins as it did inside user.css. <style id="nda-vars"> follows with the colours
  // (written by applyPalette / setWallVars, scoped to our own nodes).
  const ND_CSS = "#nd-ambient :where(:not(button, input, select, textarea, svg *)),\n#nd-amb-panel :where(:not(button, input, select, textarea, svg *)) {\n  color: inherit !important;\n  font-family: inherit !important;\n  font-size: inherit !important;\n  font-style: inherit !important;\n  font-weight: inherit !important;\n  line-height: inherit !important;\n  letter-spacing: inherit !important;\n  word-spacing: inherit !important;\n  text-transform: inherit !important;\n}\n#nd-ambient,\n#nd-amb-panel {\n  font-style: normal !important;\n  font-weight: 400 !important;\n  letter-spacing: normal !important;\n  word-spacing: 0 !important;\n  text-transform: none !important;\n  text-shadow: none !important;\n  white-space: normal !important;\n}\n#nd-ambient {\n  font-size: 16px !important;\n  line-height: normal !important;\n}\n#nd-ambient :where(button, input, select, textarea),\n#nd-amb-panel :where(button, input, select, textarea) {\n  font-style: normal !important;\n  font-weight: 400 !important;\n  line-height: normal !important;\n  letter-spacing: normal !important;\n  word-spacing: 0 !important;\n  text-transform: none !important;\n}\n#nd-ambient,\n#nd-amb-panel {\n  direction: ltr !important;\n  unicode-bidi: isolate !important;\n}\n#nd-ambient,\n#nd-amb-panel,\n.nd-amb-topbtn,\n.nd-amb-tippop {\n  --nda-a1: #ff4dff;                --nda-a1-rgb: 255, 77, 255;\n  --nda-a2: #35e7ff;                --nda-a2-rgb: 53, 231, 255;\n  --nda-a1-fg: #ff4dff;\n  --nda-a2-fg: #35e7ff;\n  --nda-a2-ink: #1d7c8e;\n  --nda-on-accent: #020713;\n  --nda-line-rgb: 114, 238, 255;\n  --nda-a1-soft-rgb: 255, 175, 255;\n  --nda-a2-soft-rgb: 174, 245, 255;\n  --nda-text: #ebfdff;              --nda-text-rgb: 235, 253, 255;\n  --nda-subtext: #a9ddff;           --nda-subtext-rgb: 169, 221, 255;\n  --nda-muted: #9bb4dc;             --nda-muted-rgb: 155, 180, 220;\n  --nda-a1-hi: color-mix(in srgb, var(--nda-a1) 75%, #fff);\n  --nda-a2-hi: color-mix(in srgb, var(--nda-a2) 70%, #fff);\n  --nda-a1-press: color-mix(in srgb, var(--nda-a1) 85%, #000);\n  --nda-a2-press: color-mix(in srgb, var(--nda-a2) 85%, #000);\n  --nda-a2-fg-hi: color-mix(in srgb, var(--nda-a2-fg) 70%, #fff);\n  --nda-bg: #020713;\n  --nda-surface: #0b1a36;\n  --nda-border: rgba(var(--nda-line-rgb), 0.30);\n  --nda-border-soft: rgba(var(--nda-line-rgb), 0.16);\n  --nda-grad: linear-gradient(135deg, var(--nda-a1) 0%, var(--nda-a2) 100%);\n  --nda-grad-hi: linear-gradient(135deg, var(--nda-a1-hi) 0%, var(--nda-a2-hi) 100%);\n  --nda-grad-press: linear-gradient(135deg, var(--nda-a1-press) 0%, var(--nda-a2-press) 100%);\n  --nda-glow: 0 0 14px rgba(var(--nda-a1-rgb), 0.38), 0 0 22px rgba(var(--nda-a2-rgb), 0.18);\n  --nda-font: SpotifyMixUI, var(--encore-body-font-stack, sans-serif);\n}\n.nd-amb-tippop > .main-contextMenu-tippy {\n  box-sizing: border-box !important;\n  max-width: 320px !important;\n  padding: 4px 8px !important;\n  border-radius: 4px !important;\n  color: var(--nda-text) !important;\n  background: var(--nda-surface) !important;\n  box-shadow: 0 0 0 1px var(--nda-border), 0 8px 18px rgba(0, 0, 0, 0.45) !important;\n  font-family: var(--nda-font) !important;\n  font-size: 14px !important;\n  font-weight: 400 !important;\n  line-height: 20px !important;\n  white-space: nowrap !important;\n}\n#nd-ambient {\n  position: fixed !important;\n  inset: 0;\n  z-index: 2147483000 !important;\n  display: none !important;\n  overflow: hidden !important;\n  contain: strict !important;\n  isolation: isolate !important;\n  opacity: 0;\n  pointer-events: none !important;\n  background: var(--nda-bg) !important;\n  color: var(--nda-text) !important;\n  font-family: var(--nda-font) !important;\n  user-select: none !important;\n  -webkit-user-select: none !important;\n  transition: opacity 250ms cubic-bezier(0.4, 0, 1, 1) !important;\n}\n#nd-ambient.nd-amb--mounted {\n  display: block !important;\n}\n#nd-ambient.nd-amb--visible {\n  opacity: 1;\n  pointer-events: auto !important;\n  cursor: none !important;\n  transition: opacity 700ms cubic-bezier(0.22, 0.61, 0.36, 1) !important;\n}\n#nd-ambient.nd-amb--leaving {\n  pointer-events: auto !important;\n}\n#nd-ambient .nd-amb__cam {\n  position: absolute !important;\n  inset: 0;\n  transform-origin: 50% 47% !important;\n  will-change: transform !important;\n}\n#nd-ambient .nd-amb__drift {\n  position: absolute !important;\n  inset: -5%;\n  animation: nd-amb-drift 46s ease-in-out infinite alternate !important;\n}\n#nd-ambient .nd-amb__wall {\n  position: absolute !important;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  object-fit: cover !important;\n  opacity: 0;\n}\n#nd-ambient .nd-amb__wall--blur {\n  transition: opacity 600ms ease !important;\n}\n#nd-ambient.nd-amb--wall-ready .nd-amb__wall--blur {\n  opacity: 1;\n}\n#nd-ambient .nd-amb__wall--sharp {\n  will-change: opacity !important;\n}\n#nd-ambient .nd-amb__wall-css {\n  position: absolute !important;\n  inset: 0;\n  display: none !important;\n  background: var(--nda-wallpaper, none) center / cover no-repeat !important;\n  filter: blur(var(--nda-amb-wall-blur, 18px)) saturate(1.15) brightness(var(--nda-amb-wall-bright, 0.72)) !important;\n}\n#nd-ambient.nd-amb--wall-css .nd-amb__wall-css {\n  display: block !important;\n}\n@keyframes nd-amb-drift {\n  0%   { transform: scale(1.0) translate3d(-0.9%, -0.5%, 0); }\n  100% { transform: scale(1.045) translate3d(0.9%, 0.6%, 0); }\n}\n#nd-ambient .nd-amb__veil {\n  position: absolute !important;\n  inset: 0;\n  background:\n    radial-gradient(115% 80% at 50% 46%, rgba(2, 7, 19, 0.08) 0%, rgba(2, 7, 19, 0.38) 55%, rgba(2, 7, 19, 0.78) 100%),\n    linear-gradient(180deg, rgba(2, 7, 19, 0.38) 0%, rgba(2, 7, 19, 0) 28%, rgba(2, 7, 19, 0) 66%, rgba(2, 7, 19, 0.50) 100%) !important;\n}\n#nd-ambient .nd-amb__elcalm,\n#nd-ambient .nd-amb__elvig {\n  position: absolute !important;\n  inset: 0;\n  opacity: 0;\n  pointer-events: none !important;\n}\n#nd-ambient .nd-amb__elcalm {\n  background: rgb(2, 7, 19) !important;\n}\n#nd-ambient .nd-amb__elvig {\n  background: radial-gradient(118% 84% at 50% 47%, rgba(2, 7, 19, 0) 34%, rgba(2, 7, 19, 0.55) 70%, rgba(2, 7, 19, 0.92) 100%) !important;\n}\n#nd-ambient .nd-amb__flash.nd-amb__flash--hot {\n  background: radial-gradient(42% 38% at 50% 47%, rgba(var(--nda-a2-soft-rgb), 0.20) 0%, rgba(var(--nda-a2-rgb), 0.12) 38%, rgba(var(--nda-a1-rgb), 0.06) 66%, rgba(var(--nda-a1-rgb), 0) 100%) !important;\n}\n#nd-ambient .nd-amb__flash {\n  position: absolute !important;\n  inset: 0;\n  background: radial-gradient(62% 58% at 50% 45%, rgba(var(--nda-a2-soft-rgb), 0.34) 0%, rgba(var(--nda-a2-rgb), 0.16) 42%, rgba(var(--nda-a1-rgb), 0.10) 68%, rgba(var(--nda-a1-rgb), 0) 100%) !important;\n  mix-blend-mode: screen !important;\n  opacity: 0;\n  pointer-events: none !important;\n  will-change: opacity !important;\n}\n#nd-ambient .nd-amb__stage {\n  position: absolute !important;\n  inset: 0;\n}\n#nd-ambient .nd-amb__viz {\n  position: absolute !important;\n  left: calc(50% - min(590px, 42vw));\n  top: calc(47% - min(250px, 26vh));\n  width: min(1180px, 84vw);\n  height: min(500px, 52vh);\n  transform-origin: 50% 50% !important;\n  will-change: transform !important;\n}\n#nd-ambient .nd-amb__bars {\n  position: absolute !important;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n}\n#nd-ambient .nd-amb__bloom {\n  position: absolute !important;\n  left: 50%;\n  top: 50%;\n  width: 116%;\n  height: 112%;\n  transform: translate(-50%, -50%);\n  background: radial-gradient(closest-side, rgba(var(--nda-a2-soft-rgb), 0.34) 0%, rgba(var(--nda-a2-rgb), 0.20) 34%, rgba(var(--nda-a1-rgb), 0.12) 62%, rgba(var(--nda-a1-rgb), 0) 100%) !important;\n  mix-blend-mode: screen !important;\n  opacity: 0;\n  pointer-events: none !important;\n  will-change: opacity !important;\n}\n#nd-ambient.nd-amb--style-ring .nd-amb__bloom {\n  width: 96%;\n  height: 84%;\n}\n#nd-ambient .nd-amb__metawrap {\n  position: absolute !important;\n  left: 0;\n  right: 0 !important;\n  top: 80%;\n  display: flex !important;\n  justify-content: center !important;\n  max-width: 100% !important;\n  will-change: transform !important;\n}\n#nd-ambient .nd-amb__hint {\n  position: absolute !important;\n  left: 50%;\n  bottom: 4.5vh !important;\n  display: none !important;\n  padding: 6px 14px !important;\n  border: 1px solid var(--nda-border-soft) !important;\n  border-radius: 999px !important;\n  color: var(--nda-text) !important;\n  background: rgba(2, 7, 19, 0.58) !important;\n  font-size: 13px !important;\n  font-weight: 600 !important;\n  letter-spacing: 0.01em !important;\n  white-space: nowrap !important;\n  opacity: 0;\n  transform: translateX(-50%);\n  pointer-events: none !important;\n}\n#nd-ambient.nd-amb--test .nd-amb__hint {\n  display: block !important;\n  animation: nd-amb-hint 4.4s ease 0.7s both !important;\n}\n#nd-ambient.nd-amb--intro .nd-amb__hint {\n  display: block !important;\n  width: max-content;\n  max-width: min(760px, calc(100vw - 48px)) !important;\n  border-radius: 18px !important;\n  white-space: normal !important;\n  text-align: center !important;\n  animation: nd-amb-hint 7s ease 1.2s both !important;\n}\n@keyframes nd-amb-hint {\n  0%   { opacity: 0; transform: translate(-50%, 6px); }\n  12%  { opacity: 1; transform: translate(-50%, 0); }\n  78%  { opacity: 1; transform: translate(-50%, 0); }\n  100% { opacity: 0; transform: translate(-50%, 0); }\n}\n#nd-ambient .nd-amb__meta {\n  position: relative !important;\n  isolation: isolate !important;\n  display: flex !important;\n  align-items: center !important;\n  gap: 14px !important;\n  max-width: min(720px, 80vw) !important;\n  opacity: 0;\n  transform: translateY(8px);\n  transition: opacity 240ms ease, transform 600ms cubic-bezier(0.22, 0.61, 0.36, 1) !important;\n}\n#nd-ambient.nd-amb--visible .nd-amb__meta {\n  opacity: 1;\n  transform: none;\n  transition: opacity 520ms ease 260ms, transform 700ms cubic-bezier(0.22, 0.61, 0.36, 1) 260ms !important;\n}\n#nd-ambient.nd-amb--visible .nd-amb__meta.nd-amb--swap {\n  opacity: 0;\n  transform: translateY(4px);\n  transition: opacity 220ms ease, transform 220ms ease !important;\n}\n#nd-ambient .nd-amb__meta::before {\n  content: \"\" !important;\n  position: absolute !important;\n  inset: -30px -70px;\n  z-index: -1 !important;\n  border-radius: 999px !important;\n  background: radial-gradient(closest-side, rgba(2, 7, 19, 0.66) 0%, rgba(2, 7, 19, 0.48) 52%, rgba(2, 7, 19, 0) 100%) !important;\n  opacity: var(--nda-meta-scrim, 0);\n  transition: opacity 400ms ease !important;\n  pointer-events: none !important;\n}\n#nd-ambient .nd-amb__cover {\n  flex: none !important;\n  width: 56px;\n  height: 56px;\n  border-radius: 8px !important;\n  object-fit: cover !important;\n  background: var(--nda-surface) center / 22px no-repeat !important;\n  box-shadow:\n    0 0 0 1px rgba(var(--nda-text-rgb), 0.16),\n    0 10px 26px rgba(0, 0, 0, 0.50),\n    0 0 22px rgba(var(--nda-a2-rgb), 0.22) !important;\n}\n#nd-ambient .nd-amb__cover.nd-amb--nocover,\n#nd-ambient.nd-amb--style-ring .nd-amb__cover {\n  display: none !important;\n}\n#nd-ambient .nd-amb__text {\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 3px !important;\n  min-width: 0 !important;\n}\n#nd-ambient.nd-amb--style-ring .nd-amb__text {\n  align-items: center !important;\n  gap: 5px !important;\n  text-align: center !important;\n}\n#nd-ambient.nd-amb--style-ring .nd-amb__title {\n  font-size: 25px !important;\n  letter-spacing: 0.01em !important;\n}\n#nd-ambient.nd-amb--style-ring .nd-amb__artist {\n  font-size: 15.5px !important;\n}\n#nd-ambient .nd-amb__title,\n#nd-ambient .nd-amb__artist {\n  overflow: hidden !important;\n  white-space: nowrap !important;\n  text-overflow: ellipsis !important;\n  max-width: 100% !important;\n}\n#nd-ambient .nd-amb__title {\n  color: #ffffff !important;\n  font-size: 18px !important;\n  font-weight: 700 !important;\n  letter-spacing: 0.005em !important;\n  line-height: 1.25 !important;\n  text-shadow: 0 1px 3px rgba(2, 7, 19, 0.85), 0 0 16px rgba(var(--nda-a2-rgb), 0.28) !important;\n}\n#nd-ambient .nd-amb__artist {\n  color: var(--nda-subtext) !important;\n  font-size: 14px !important;\n  line-height: 1.3 !important;\n  text-shadow: 0 1px 3px rgba(2, 7, 19, 0.85) !important;\n}\n@media (prefers-reduced-motion: reduce) {\n  #nd-ambient .nd-amb__drift {\n    animation: none !important;\n  }\n  #nd-ambient.nd-amb--test .nd-amb__hint,\n  #nd-ambient.nd-amb--intro .nd-amb__hint {\n    animation: none !important;\n    opacity: 1;\n  }\n}\n.nd-amb-topbtn.nd-amb-topbtn--open > button {\n  color: var(--nda-a2-fg-hi) !important;\n}\n.nd-amb-topbtn.nd-amb-topbtn--open > button svg {\n  filter: drop-shadow(0 0 5px rgba(var(--nda-a2-rgb), 0.7)) !important;\n}\n#nd-amb-panel {\n  position: fixed !important;\n  z-index: 2147482000 !important;\n  top: 64px;\n  left: 50%;\n  display: flex !important;\n  flex-direction: column !important;\n  width: 400px;\n  max-width: calc(100vw - 16px) !important;\n  box-sizing: border-box !important;\n  color: var(--nda-text) !important;\n  font-family: var(--nda-font) !important;\n  font-size: 13px !important;\n  line-height: 1.35 !important;\n  text-align: left !important;\n  background: linear-gradient(180deg, rgba(17, 38, 76, 0.97) 0%, rgba(9, 24, 52, 0.97) 100%) !important;\n  border: 1px solid var(--nda-border) !important;\n  border-radius: 14px !important;\n  box-shadow:\n    0 0 0 1px rgba(var(--nda-a1-rgb), 0.07),\n    0 0 26px rgba(var(--nda-a2-rgb), 0.14),\n    0 26px 64px rgba(0, 0, 0, 0.62) !important;\n  opacity: 0;\n  transform: translateY(-6px) scale(0.985);\n  transform-origin: calc(100% - 24px) 0 !important;\n  transition: opacity 140ms ease, transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1) !important;\n  outline: none !important;\n}\n#nd-amb-panel.nd-ap--open {\n  opacity: 1;\n  transform: none;\n}\n#nd-amb-panel *,\n#nd-amb-panel *::before,\n#nd-amb-panel *::after {\n  box-sizing: border-box !important;\n}\n#nd-amb-panel::before {\n  content: \"\" !important;\n  position: absolute !important;\n  top: -6px;\n  left: calc(var(--nda-ap-arrow, 370px) - 6px);\n  width: 11px;\n  height: 11px;\n  background: rgb(17, 38, 76) !important;\n  border-left: 1px solid var(--nda-border) !important;\n  border-top: 1px solid var(--nda-border) !important;\n  border-top-left-radius: 3px !important;\n  transform: rotate(45deg);\n}\n#nd-amb-panel.nd-ap--center::before,\n#nd-amb-panel.nd-ap--above::before {\n  display: none !important;\n}\n#nd-amb-panel .nd-ap__head {\n  position: relative !important;\n  display: flex !important;\n  align-items: center !important;\n  gap: 10px !important;\n  padding: 13px 12px 11px 16px !important;\n  border-bottom: 1px solid var(--nda-border-soft) !important;\n}\n#nd-amb-panel .nd-ap__logo {\n  display: grid !important;\n  place-items: center !important;\n  flex: none !important;\n  width: 26px;\n  height: 26px;\n  border-radius: 8px !important;\n  color: var(--nda-on-accent) !important;\n  background: var(--nda-grad) !important;\n  box-shadow: 0 0 12px rgba(var(--nda-a1-rgb), 0.35) !important;\n}\n#nd-amb-panel .nd-ap__title {\n  flex: 1 !important;\n  margin: 0 !important;\n  color: #ffffff !important;\n  font-size: 15px !important;\n  font-weight: 700 !important;\n  letter-spacing: 0.005em !important;\n}\n#nd-amb-panel .nd-ap__close {\n  display: grid !important;\n  place-items: center !important;\n  width: 30px;\n  height: 30px;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 50% !important;\n  color: var(--nda-subtext) !important;\n  background: transparent !important;\n  cursor: pointer !important;\n}\n#nd-amb-panel .nd-ap__close:hover {\n  color: #ffffff !important;\n  background: rgba(var(--nda-a2-rgb), 0.12) !important;\n}\n#nd-amb-panel .nd-ap__body {\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 12px !important;\n  min-height: 0 !important;\n  padding: 12px 16px 14px !important;\n  overflow-y: auto !important;\n  overscroll-behavior: contain !important;\n  scrollbar-width: thin !important;\n  scrollbar-color: rgba(var(--nda-line-rgb), 0.35) transparent !important;\n}\n#nd-amb-panel .nd-ap__row {\n  display: flex !important;\n  align-items: center !important;\n  justify-content: space-between !important;\n  gap: 12px !important;\n  cursor: pointer !important;\n}\n#nd-amb-panel .nd-ap__rowtext {\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 1px !important;\n  min-width: 0 !important;\n}\n#nd-amb-panel .nd-ap__label {\n  color: #ffffff !important;\n  font-size: 13.5px !important;\n  font-weight: 700 !important;\n}\n#nd-amb-panel .nd-ap__hint {\n  color: var(--nda-muted) !important;\n  font-size: 11.5px !important;\n}\n#nd-amb-panel .nd-ap__master {\n  padding: 10px 12px !important;\n  border: 1px solid var(--nda-border-soft) !important;\n  border-radius: 10px !important;\n  background: rgba(var(--nda-a2-rgb), 0.06) !important;\n}\n#nd-amb-panel .nd-ap__switch {\n  position: relative !important;\n  flex: none !important;\n  width: 38px;\n  height: 22px;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 999px !important;\n  background: #3b5180 !important;\n  -webkit-appearance: none !important;\n  appearance: none !important;\n  cursor: pointer !important;\n  transition: background-color 160ms ease, box-shadow 160ms ease !important;\n}\n#nd-amb-panel .nd-ap__switch::before {\n  content: \"\" !important;\n  position: absolute !important;\n  top: 3px;\n  left: 3px;\n  width: 16px;\n  height: 16px;\n  border-radius: 50% !important;\n  background: var(--nda-text) !important;\n  transition: transform 160ms cubic-bezier(0.22, 0.61, 0.36, 1), background-color 160ms ease !important;\n}\n#nd-amb-panel .nd-ap__row:hover .nd-ap__switch:not(:checked) {\n  background: #56709f !important;\n}\n#nd-amb-panel .nd-ap__switch:checked {\n  background: var(--nda-grad) !important;\n  box-shadow: 0 0 10px rgba(var(--nda-a2-rgb), 0.40) !important;\n}\n#nd-amb-panel .nd-ap__switch:checked::before {\n  transform: translateX(16px);\n  background: var(--nda-on-accent) !important;\n}\n#nd-amb-panel .nd-ap__preview {\n  position: relative !important;\n  flex: none !important;\n  height: 128px;\n  overflow: hidden !important;\n  border: 1px solid var(--nda-border-soft) !important;\n  border-radius: 10px !important;\n  background: #020713 !important;\n}\n#nd-amb-panel .nd-ap__preview canvas {\n  display: block !important;\n  width: 100%;\n  height: 100%;\n}\n#nd-amb-panel .nd-ap__badge {\n  position: absolute !important;\n  top: 7px;\n  left: 7px;\n  padding: 2px 8px 2px 18px !important;\n  border: 1px solid rgba(var(--nda-a2-rgb), 0.30) !important;\n  border-radius: 999px !important;\n  color: var(--nda-a2-fg-hi) !important;\n  background: rgba(2, 7, 19, 0.62) !important;\n  font-size: 10.5px !important;\n  font-weight: 700 !important;\n  letter-spacing: 0.02em !important;\n}\n#nd-amb-panel .nd-ap__badge::before {\n  content: \"\" !important;\n  position: absolute !important;\n  top: 50%;\n  left: 7px;\n  width: 6px;\n  height: 6px;\n  margin-top: -3px !important;\n  border-radius: 50% !important;\n  background: var(--nda-a1) !important;\n  box-shadow: 0 0 6px var(--nda-a1) !important;\n}\n#nd-amb-panel .nd-ap__h {\n  margin: 0 0 7px !important;\n  color: var(--nda-subtext) !important;\n  font-size: 11px !important;\n  font-weight: 700 !important;\n  letter-spacing: 0.08em !important;\n  text-transform: uppercase !important;\n}\n#nd-amb-panel .nd-ap__section--inline {\n  display: flex !important;\n  align-items: center !important;\n  justify-content: space-between !important;\n  gap: 12px !important;\n}\n#nd-amb-panel .nd-ap__section--inline .nd-ap__h {\n  margin: 0 !important;\n}\n#nd-amb-panel .nd-ap__styles {\n  display: grid !important;\n  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;\n  gap: 8px !important;\n  padding-top: 6px !important;\n}\n#nd-amb-panel .nd-ap__card {\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 6px !important;\n  padding: 7px 8px 6px !important;\n  border: 1px solid var(--nda-border-soft) !important;\n  border-radius: 10px !important;\n  background: rgba(var(--nda-text-rgb), 0.035) !important;\n  transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease !important;\n}\n#nd-amb-panel .nd-ap__card:hover {\n  border-color: var(--nda-border) !important;\n  background: rgba(var(--nda-a2-rgb), 0.07) !important;\n}\n#nd-amb-panel .nd-ap__card--on,\n#nd-amb-panel .nd-ap__card--on:hover {\n  padding: 6px 7px 5px !important;\n  border: 2px solid transparent !important;\n  background:\n    linear-gradient(rgb(15, 35, 70), rgb(15, 35, 70)) padding-box,\n    var(--nda-grad) border-box !important;\n  box-shadow: 0 0 16px rgba(var(--nda-a1-rgb), 0.28), 0 0 22px rgba(var(--nda-a2-rgb), 0.16) !important;\n}\n#nd-amb-panel .nd-ap__card:has(.nd-ap__radio:focus-visible) {\n  outline: 1.5px dashed var(--nda-a2-fg-hi) !important;\n  outline-offset: 3px !important;\n}\n#nd-amb-panel .nd-ap__card:not(.nd-ap__card--on) .nd-ap__thumb svg {\n  opacity: 0.5;\n  filter: saturate(0.7) !important;\n  transition: opacity 140ms ease !important;\n}\n#nd-amb-panel .nd-ap__card:not(.nd-ap__card--on):hover .nd-ap__thumb svg {\n  opacity: 0.85;\n}\n#nd-amb-panel .nd-ap__card {\n  position: relative !important;\n}\n#nd-amb-panel .nd-ap__active {\n  position: absolute !important;\n  top: -15px;\n  right: 2px !important;\n  z-index: 1 !important;\n  display: none !important;\n  padding: 1px 6px !important;\n  border-radius: 999px !important;\n  color: var(--nda-on-accent) !important;\n  background: var(--nda-grad) !important;\n  box-shadow: 0 0 8px rgba(var(--nda-a1-rgb), 0.35) !important;\n  font-size: 9px !important;\n  font-weight: 800 !important;\n  line-height: 13px !important;\n  letter-spacing: 0.04em !important;\n  text-transform: uppercase !important;\n}\n#nd-amb-panel .nd-ap__card--on .nd-ap__active {\n  display: block !important;\n}\n#nd-amb-panel .nd-ap__pick {\n  position: relative !important;\n  display: flex !important;\n  flex-direction: column !important;\n  align-items: center !important;\n  gap: 5px !important;\n  cursor: pointer !important;\n  text-align: center !important;\n}\n#nd-amb-panel .nd-ap__radio,\n#nd-amb-panel .nd-ap__segopt input {\n  position: absolute !important;\n  width: 1px;\n  height: 1px;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n  opacity: 0;\n  pointer-events: none !important;\n}\n#nd-amb-panel .nd-ap__thumb {\n  position: relative !important;\n  display: grid !important;\n  place-items: center !important;\n  width: 100%;\n  height: 38px;\n  border-radius: 7px !important;\n  background: rgba(2, 7, 19, 0.5) !important;\n}\n#nd-amb-panel .nd-ap__thumb svg {\n  width: 56px;\n  height: 32px;\n  overflow: visible !important;\n}\n#nd-amb-panel .nd-ap__card--on .nd-ap__thumb svg {\n  filter: drop-shadow(0 0 4px rgba(var(--nda-a2-rgb), 0.55)) !important;\n}\n#nd-amb-panel .nd-ap__name {\n  display: flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  min-height: 2.4em !important;\n  color: var(--nda-text) !important;\n  font-size: 12px !important;\n  font-weight: 700 !important;\n  line-height: 1.2 !important;\n}\n#nd-amb-panel .nd-ap__card--on .nd-ap__name {\n  color: #ffffff !important;\n}\n#nd-amb-panel .nd-ap__stylebox {\n  position: relative !important;\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 6px !important;\n  margin-top: 9px !important;\n  padding: 9px 11px 8px !important;\n  border: 1px solid rgba(var(--nda-a2-rgb), 0.42) !important;\n  border-radius: 10px !important;\n  background: rgb(15, 35, 70) !important;\n  box-shadow: 0 0 14px rgba(var(--nda-a1-rgb), 0.14) !important;\n}\n#nd-amb-panel .nd-ap__stylebox::before {\n  content: \"\" !important;\n  position: absolute !important;\n  top: -6px;\n  left: var(--nda-sb-x, 50%);\n  width: 10px;\n  height: 10px;\n  border-top: 1px solid rgba(var(--nda-a2-rgb), 0.42) !important;\n  border-left: 1px solid rgba(var(--nda-a2-rgb), 0.42) !important;\n  background: rgb(15, 35, 70) !important;\n  transform: translateX(-50%) rotate(45deg);\n  transition: left 180ms cubic-bezier(0.22, 0.61, 0.36, 1) !important;\n}\n#nd-amb-panel .nd-ap__sbhead {\n  display: flex !important;\n  align-items: baseline !important;\n  justify-content: space-between !important;\n  gap: 8px !important;\n}\n#nd-amb-panel .nd-ap__sbname {\n  color: #ffffff !important;\n  font-size: 12.5px !important;\n  font-weight: 700 !important;\n}\n#nd-amb-panel .nd-ap__sbtag {\n  color: var(--nda-muted) !important;\n  font-size: 10.5px !important;\n}\n#nd-amb-panel .nd-ap__srow {\n  display: grid !important;\n  grid-template-columns: 70px minmax(0, 1fr) 44px !important;\n  align-items: center !important;\n  gap: 0 10px !important;\n}\n#nd-amb-panel .nd-ap__srow .nd-ap__rlabel {\n  color: var(--nda-text) !important;\n  font-size: 11.5px !important;\n}\n#nd-amb-panel .nd-ap__srow .nd-ap__val {\n  font-size: 11.5px !important;\n}\n#nd-amb-panel .nd-ap__ends {\n  grid-column: 2 !important;\n  display: flex !important;\n  justify-content: space-between !important;\n  margin-top: 1px !important;\n  padding: 0 2px !important;\n  color: var(--nda-muted) !important;\n  font-size: 9.5px !important;\n  font-weight: 600 !important;\n  line-height: 1.1 !important;\n}\n#nd-amb-panel .nd-ap__stylebox > .nd-ap__hint {\n  font-size: 10.5px !important;\n  line-height: 1.35 !important;\n}\n#nd-amb-panel .nd-ap__sbright {\n  display: inline-flex !important;\n  align-items: center !important;\n  gap: 8px !important;\n}\n#nd-amb-panel .nd-ap__sbreset {\n  height: 20px;\n  padding: 0 8px !important;\n  border: 1px solid rgba(var(--nda-a2-rgb), 0.40) !important;\n  border-radius: 999px !important;\n  color: var(--nda-a2-fg-hi) !important;\n  background: rgba(2, 7, 19, 0.35) !important;\n  font: inherit !important;\n  font-size: 10.5px !important;\n  font-weight: 700 !important;\n  line-height: 18px !important;\n  cursor: pointer !important;\n}\n#nd-amb-panel .nd-ap__sbreset:hover:not(:disabled) {\n  border-color: rgba(var(--nda-a2-rgb), 0.75) !important;\n  color: #ffffff !important;\n}\n#nd-amb-panel .nd-ap__sbreset:disabled {\n  opacity: 0.45;\n  cursor: default !important;\n}\n#nd-amb-panel .nd-ap__sbreset:focus-visible {\n  outline: 2px solid var(--nda-a2) !important;\n  outline-offset: 2px !important;\n}\n#nd-amb-panel .nd-ap__srow--caps {\n  cursor: pointer !important;\n}\n#nd-amb-panel .nd-ap__srow--caps[hidden] {\n  display: none !important;\n}\n#nd-amb-panel .nd-ap__capshint {\n  min-width: 0 !important;\n  color: var(--nda-muted) !important;\n  font-size: 10.5px !important;\n  line-height: 1.25 !important;\n}\n#nd-amb-panel .nd-ap__srow--caps .nd-ap__switch {\n  justify-self: end !important;\n  transform: scale(0.86);\n  transform-origin: right center !important;\n}\n#nd-amb-panel .nd-ap__ambpv {\n  position: relative !important;\n  height: 112px;\n  margin-top: 2px !important;\n  overflow: hidden !important;\n  border: 1px solid var(--nda-border-soft) !important;\n  border-radius: 10px !important;\n  background: #020713 !important;\n}\n#nd-amb-panel .nd-ap__ambpv canvas {\n  display: block !important;\n  width: 100%;\n  height: 100%;\n}\n#nd-amb-panel .nd-ap__ambpv .nd-ap__badge {\n  padding-left: 8px !important;\n}\n#nd-amb-panel .nd-ap__ambpv .nd-ap__badge::before {\n  display: none !important;\n}\n#nd-amb-panel .nd-ap__ambtest {\n  position: absolute !important;\n  right: 8px !important;\n  bottom: 8px !important;\n  height: 26px;\n  padding: 0 10px !important;\n  font-size: 11.5px !important;\n  background: rgba(2, 7, 19, 0.72) !important;\n}\n#nd-amb-panel .nd-ap__range {\n  display: grid !important;\n  grid-template-columns: 1fr auto !important;\n  align-items: center !important;\n  gap: 0 6px !important;\n}\n#nd-amb-panel .nd-ap__range .nd-ap__slider {\n  grid-column: 1 / -1 !important;\n}\n#nd-amb-panel .nd-ap__range--row {\n  grid-template-columns: auto 1fr 40px !important;\n  gap: 0 10px !important;\n}\n#nd-amb-panel .nd-ap__range--wall {\n  grid-template-columns: 148px minmax(0, 1fr) 46px !important;\n}\n#nd-amb-panel .nd-ap__range--row .nd-ap__slider {\n  grid-column: auto !important;\n}\n#nd-amb-panel .nd-ap__rlabel {\n  color: var(--nda-muted) !important;\n  font-size: 10.5px !important;\n  font-weight: 600 !important;\n}\n#nd-amb-panel .nd-ap__val {\n  color: var(--nda-a2-fg-hi) !important;\n  font-size: 11px !important;\n  font-weight: 700 !important;\n  font-variant-numeric: tabular-nums !important;\n  text-align: right !important;\n}\n#nd-amb-panel .nd-ap__slider {\n  width: 100%;\n  height: 18px;\n  margin: 0 !important;\n  padding: 0 !important;\n  border: 0 !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  -webkit-appearance: none !important;\n  appearance: none !important;\n  cursor: pointer !important;\n}\n#nd-amb-panel .nd-ap__slider::-webkit-slider-runnable-track {\n  height: 4px;\n  border-radius: 999px !important;\n  background:\n    linear-gradient(90deg, var(--nda-a1) 0%, var(--nda-a2) 100%) 0 0 / var(--nda-fill, 50%) 100% no-repeat,\n    rgba(var(--nda-muted-rgb), 0.26) !important;\n}\n#nd-amb-panel .nd-ap__slider::-webkit-slider-thumb {\n  width: 14px;\n  height: 14px;\n  margin-top: -5px !important;\n  border: 0 !important;\n  border-radius: 50% !important;\n  background: #ffffff !important;\n  box-shadow: 0 0 0 2px rgba(var(--nda-a2-rgb), 0.55), 0 0 10px rgba(var(--nda-a2-rgb), 0.55) !important;\n  -webkit-appearance: none !important;\n  appearance: none !important;\n}\n#nd-amb-panel .nd-ap__slider:hover::-webkit-slider-thumb {\n  box-shadow: 0 0 0 2px color-mix(in srgb, var(--nda-a1-hi) 75%, transparent), 0 0 12px rgba(var(--nda-a1-rgb), 0.55) !important;\n}\n#nd-amb-panel .nd-ap__slider:focus-visible {\n  outline: none !important;\n}\n#nd-amb-panel .nd-ap__slider:focus-visible::-webkit-slider-thumb {\n  box-shadow: 0 0 0 3px var(--nda-a2-fg), 0 0 14px rgba(var(--nda-a2-rgb), 0.8) !important;\n}\n#nd-amb-panel .nd-ap__slider:disabled {\n  cursor: default !important;\n}\n#nd-amb-panel .nd-ap__fx {\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 6px !important;\n  padding: 9px 11px 7px !important;\n  border: 1px solid var(--nda-border-soft) !important;\n  border-radius: 10px !important;\n  background: rgba(var(--nda-text-rgb), 0.035) !important;\n}\n#nd-amb-panel .nd-ap__fx + .nd-ap__fx {\n  margin-top: 8px !important;\n}\n#nd-amb-panel .nd-ap__fx--off .nd-ap__range {\n  opacity: 0.42;\n}\n#nd-amb-panel .nd-ap__elbox {\n  gap: 7px !important;\n}\n#nd-amb-panel .nd-ap__elbody {\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 5px !important;\n  transition: opacity 160ms ease !important;\n}\n#nd-amb-panel .nd-ap__elbox--off .nd-ap__elbody {\n  opacity: 0.45;\n}\n#nd-amb-panel .nd-ap__elsub {\n  display: flex !important;\n  align-items: baseline !important;\n  gap: 8px !important;\n  margin-top: 4px !important;\n  padding-top: 6px !important;\n  border-top: 1px solid var(--nda-border-soft) !important;\n}\n#nd-amb-panel .nd-ap__elsubname {\n  color: var(--nda-subtext) !important;\n  font-size: 10.5px !important;\n  font-weight: 700 !important;\n  letter-spacing: 0.07em !important;\n  text-transform: uppercase !important;\n}\n#nd-amb-panel .nd-ap__elsubtag {\n  flex: 1 !important;\n  min-width: 0 !important;\n  color: var(--nda-muted) !important;\n  font-size: 11.5px !important;\n}\n#nd-amb-panel .nd-ap__elrow {\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 2px !important;\n  padding: 3px 0 2px !important;\n}\n#nd-amb-panel .nd-ap__ellabel {\n  color: #ffffff !important;\n  font-size: 12.5px !important;\n  font-weight: 700 !important;\n}\n#nd-amb-panel .nd-ap__elhead .nd-ap__hint,\n#nd-amb-panel .nd-ap__elhue .nd-ap__hint {\n  font-size: 11.5px !important;\n  line-height: 1.3 !important;\n}\n#nd-amb-panel .nd-ap__switch--sm {\n  transform: scale(0.86);\n  transform-origin: right center !important;\n}\n#nd-amb-panel .nd-ap__range--el {\n  grid-template-columns: 62px minmax(0, 1fr) 44px !important;\n}\n#nd-amb-panel .nd-ap__elrow--off .nd-ap__range {\n  opacity: 0.42;\n}\n#nd-amb-panel .nd-ap__elhue {\n  margin-top: 2px !important;\n  padding-top: 6px !important;\n  border-top: 1px solid var(--nda-border-soft) !important;\n}\n#nd-amb-panel .nd-ap__elbox > .nd-ap__hint[hidden],\n#nd-amb-panel .nd-ap__elbody[hidden] {\n  display: none !important;\n}\n#nd-amb-panel .nd-ap__elbar {\n  display: flex !important;\n  align-items: center !important;\n  justify-content: space-between !important;\n  gap: 8px !important;\n}\n#nd-amb-panel .nd-ap__elmore {\n  display: inline-flex !important;\n  align-items: center !important;\n  gap: 6px !important;\n  height: 24px;\n  padding: 0 10px !important;\n  border: 1px solid rgba(var(--nda-a2-rgb), 0.40) !important;\n  border-radius: 999px !important;\n  color: var(--nda-a2-fg-hi) !important;\n  background: rgba(2, 7, 19, 0.35) !important;\n  font: inherit !important;\n  font-size: 12px !important;\n  font-weight: 700 !important;\n  cursor: pointer !important;\n}\n#nd-amb-panel .nd-ap__elmore:hover {\n  border-color: rgba(var(--nda-a2-rgb), 0.75) !important;\n  color: #ffffff !important;\n}\n#nd-amb-panel .nd-ap__elmore:focus-visible {\n  outline: 2px solid var(--nda-a2) !important;\n  outline-offset: 2px !important;\n}\n#nd-amb-panel .nd-ap__elchev {\n  width: 6px;\n  height: 6px;\n  border-right: 2px solid currentColor !important;\n  border-bottom: 2px solid currentColor !important;\n  transform: rotate(-45deg);\n  transition: transform 160ms ease !important;\n}\n#nd-amb-panel .nd-ap__elmore--open .nd-ap__elchev {\n  transform: rotate(45deg) translate(-1px, -1px);\n}\n#nd-amb-panel .nd-ap__elhue.nd-ap__elrow--off .nd-ap__rowtext {\n  opacity: 0.55;\n}\n#nd-amb-panel .nd-ap__btn--armed {\n  border-color: rgba(255, 196, 92, 0.85) !important;\n  color: #ffe2a8 !important;\n}\n#nd-amb-panel .nd-ap__sblegend {\n  color: var(--nda-a2-fg-hi) !important;\n  font-size: 10.5px !important;\n  font-weight: 600 !important;\n  letter-spacing: 0.01em !important;\n}\n#nd-amb-panel .nd-ap__sblegend[hidden] {\n  display: none !important;\n}\n#nd-amb-panel .nd-ap__seg {\n  display: flex !important;\n  flex: 1 !important;\n  max-width: 250px !important;\n  gap: 3px !important;\n  padding: 3px !important;\n  border: 1px solid var(--nda-border-soft) !important;\n  border-radius: 999px !important;\n  background: rgba(2, 7, 19, 0.45) !important;\n}\n#nd-amb-panel .nd-ap__segopt {\n  position: relative !important;\n  flex: 1 !important;\n}\n#nd-amb-panel .nd-ap__segopt span {\n  display: block !important;\n  padding: 4px 0 !important;\n  border-radius: 999px !important;\n  color: var(--nda-subtext) !important;\n  font-size: 12px !important;\n  font-weight: 700 !important;\n  text-align: center !important;\n  white-space: nowrap !important;\n  cursor: pointer !important;\n}\n#nd-amb-panel .nd-ap__segopt:hover span {\n  color: #ffffff !important;\n}\n#nd-amb-panel .nd-ap__segopt input:checked + span {\n  color: var(--nda-on-accent) !important;\n  background: var(--nda-grad) !important;\n  box-shadow: 0 0 10px rgba(var(--nda-a1-rgb), 0.30) !important;\n}\n#nd-amb-panel .nd-ap__segopt input:focus-visible + span {\n  outline: 2px solid var(--nda-a2-fg) !important;\n  outline-offset: 1px !important;\n}\n#nd-amb-panel .nd-ap__actions {\n  display: flex !important;\n  gap: 8px !important;\n}\n#nd-amb-panel .nd-ap__btn {\n  flex: 1 !important;\n  height: 34px;\n  padding: 0 14px !important;\n  border: 1px solid var(--nda-border) !important;\n  border-radius: 999px !important;\n  color: var(--nda-text) !important;\n  background: transparent !important;\n  font-family: inherit !important;\n  font-size: 13px !important;\n  font-weight: 700 !important;\n  cursor: pointer !important;\n  transition: background-color 140ms ease, box-shadow 140ms ease !important;\n}\n#nd-amb-panel .nd-ap__btn:hover {\n  background: rgba(var(--nda-a2-rgb), 0.10) !important;\n}\n#nd-amb-panel .nd-ap__btn--primary {\n  border-color: transparent !important;\n  color: var(--nda-on-accent) !important;\n  background: var(--nda-grad) !important;\n  box-shadow: var(--nda-glow) !important;\n}\n#nd-amb-panel .nd-ap__btn--primary:hover {\n  background: var(--nda-grad-hi) !important;\n  box-shadow: 0 0 18px rgba(var(--nda-a1-rgb), 0.55), 0 0 30px rgba(var(--nda-a2-rgb), 0.30) !important;\n}\n#nd-amb-panel .nd-ap__btn--primary:active {\n  background: var(--nda-grad-press) !important;\n}\n#nd-amb-panel .nd-ap__foot {\n  margin: -2px 0 0 !important;\n  color: var(--nda-muted) !important;\n  font-size: 11px !important;\n  text-align: center !important;\n}\n#nd-amb-panel .nd-ap__foot:empty {\n  display: none !important;\n}\n#nd-amb-panel .nd-ap__sticky {\n  position: sticky !important;\n  bottom: -14px !important;\n  z-index: 2 !important;\n  display: flex !important;\n  flex-direction: column !important;\n  gap: 8px !important;\n  margin: 0 -16px -14px !important;\n  padding: 10px 16px 12px !important;\n  border-top: 1px solid var(--nda-border-soft) !important;\n  background: linear-gradient(180deg, rgba(10, 26, 56, 0.96), rgb(9, 24, 52) 40%) !important;\n}\n#nd-amb-panel :is(.nd-ap__close, .nd-ap__btn, .nd-ap__switch):focus-visible {\n  outline: 2px solid var(--nda-a2-fg) !important;\n  outline-offset: 2px !important;\n}\n#nd-amb-panel .nd-ap__hint--warn {\n  color: color-mix(in srgb, var(--nda-a1-fg) 45%, #fff) !important;\n}\n#nd-amb-panel .nd-ap__rhythm {\n  gap: 7px !important;\n  padding: 9px 11px 9px !important;\n}\n#nd-amb-panel .nd-ap__seg--wide {\n  max-width: none !important;\n}\n#nd-amb-panel .nd-ap__btn--small {\n  flex: none !important;\n  height: 30px;\n  padding: 0 12px !important;\n  font-size: 12px !important;\n}\n#nd-amb-panel .nd-ap__note {\n  margin: 0 !important;\n  padding: 6px 9px !important;\n  border: 1px solid rgba(var(--nda-a1-rgb), 0.28) !important;\n  border-radius: 8px !important;\n  color: color-mix(in srgb, var(--nda-a1-fg) 28%, #fff) !important;\n  background: rgba(var(--nda-a1-rgb), 0.10) !important;\n  font-size: 11.5px !important;\n}\n#nd-amb-panel .nd-ap__tabs {\n  display: flex !important;\n  flex: none !important;\n  gap: 4px !important;\n  padding: 2px 12px 0 !important;\n  border-bottom: 1px solid var(--nda-border-soft) !important;\n}\n#nd-amb-panel .nd-ap__tab {\n  position: relative !important;\n  display: flex !important;\n  flex: 1 !important;\n  align-items: center !important;\n  justify-content: center !important;\n  gap: 7px !important;\n  height: 36px;\n  padding: 0 6px !important;\n  border: 0 !important;\n  border-radius: 9px 9px 0 0 !important;\n  color: var(--nda-subtext) !important;\n  background: transparent !important;\n  font-family: inherit !important;\n  font-size: 13px !important;\n  font-weight: 700 !important;\n  cursor: pointer !important;\n  transition: color 120ms ease, background-color 120ms ease !important;\n}\n#nd-amb-panel .nd-ap__tab svg {\n  flex: none !important;\n}\n#nd-amb-panel .nd-ap__tab:hover {\n  color: #ffffff !important;\n  background: rgba(var(--nda-line-rgb), 0.07) !important;\n}\n#nd-amb-panel .nd-ap__tab[aria-selected=\"true\"] {\n  color: #ffffff !important;\n}\n#nd-amb-panel .nd-ap__tab[aria-selected=\"true\"] svg {\n  color: var(--nda-a2-fg) !important;\n  filter: drop-shadow(0 0 4px rgba(var(--nda-a2-rgb), 0.6)) !important;\n}\n#nd-amb-panel .nd-ap__tab[aria-selected=\"true\"]::after {\n  content: \"\" !important;\n  position: absolute !important;\n  left: 12%;\n  right: 12% !important;\n  bottom: -1px !important;\n  height: 3px;\n  border-radius: 3px 3px 0 0 !important;\n  background: var(--nda-grad) !important;\n  box-shadow: 0 0 10px rgba(var(--nda-a1-rgb), 0.45) !important;\n}\n#nd-amb-panel .nd-ap__tab:focus-visible {\n  outline: 2px solid var(--nda-a2-fg) !important;\n  outline-offset: -3px !important;\n}\n#nd-amb-panel .nd-ap__head {\n  border-bottom: 0 !important;\n  padding-bottom: 6px !important;\n}\n#nd-amb-panel .nd-ap__opt {\n  position: relative !important;\n  display: flex !important;\n  flex-direction: column !important;\n  align-items: center !important;\n  gap: 6px !important;\n  min-width: 0 !important;\n  margin: 0 !important;\n  padding: 7px 6px 6px !important;\n  border: 1px solid var(--nda-border-soft) !important;\n  border-radius: 10px !important;\n  color: var(--nda-text) !important;\n  background: rgba(var(--nda-text-rgb), 0.035) !important;\n  cursor: pointer !important;\n  text-align: center !important;\n  transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease !important;\n}\n#nd-amb-panel .nd-ap__opt:hover {\n  border-color: var(--nda-border) !important;\n  background: rgba(var(--nda-line-rgb), 0.07) !important;\n}\n#nd-amb-panel .nd-ap__opt--on,\n#nd-amb-panel .nd-ap__opt--on:hover {\n  padding: 6px 5px 5px !important;\n  border: 2px solid transparent !important;\n  background:\n    linear-gradient(rgb(15, 35, 70), rgb(15, 35, 70)) padding-box,\n    var(--nda-opt-ring, var(--nda-grad)) border-box !important;\n  box-shadow: 0 0 16px rgba(var(--nda-a1-rgb), 0.24), 0 0 22px rgba(var(--nda-a2-rgb), 0.14) !important;\n}\n#nd-amb-panel .nd-ap__opt:has(.nd-ap__radio:focus-visible),\n#nd-amb-panel .nd-ap__match:focus-visible {\n  outline: 1.5px dashed var(--nda-a2-fg-hi) !important;\n  outline-offset: 3px !important;\n}\n#nd-amb-panel .nd-ap__pname {\n  display: flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  max-width: 100% !important;\n  min-height: 2.4em !important;\n  color: var(--nda-text) !important;\n  font-size: 11.5px !important;\n  font-weight: 700 !important;\n  line-height: 1.2 !important;\n}\n#nd-amb-panel .nd-ap__opt--on .nd-ap__pname {\n  color: #ffffff !important;\n}\n#nd-amb-panel .nd-ap__check {\n  display: none !important;\n  place-items: center !important;\n  width: 18px;\n  height: 18px;\n  border-radius: 50% !important;\n  color: #020713 !important;\n  background: #ffffff !important;\n  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45) !important;\n}\n#nd-amb-panel .nd-ap__check svg {\n  width: 12px;\n  height: 12px;\n}\n#nd-amb-panel .nd-ap__opt--on .nd-ap__check {\n  display: grid !important;\n}\n#nd-amb-panel .nd-ap__pals {\n  display: grid !important;\n  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;\n  gap: 8px !important;\n}\n#nd-amb-panel .nd-ap__pal {\n  --nda-opt-ring: linear-gradient(135deg, var(--c1), var(--c2));\n}\n#nd-amb-panel .nd-ap__pal.nd-ap__opt--on {\n  box-shadow: 0 0 14px color-mix(in srgb, var(--c1) 34%, transparent), 0 0 20px color-mix(in srgb, var(--c2) 22%, transparent) !important;\n}\n#nd-amb-panel .nd-ap__pal {\n  padding-inline: 3px !important;\n}\n#nd-amb-panel .nd-ap__pal.nd-ap__opt--on {\n  padding-inline: 2px !important;\n}\n#nd-amb-panel .nd-ap__pal .nd-ap__pname {\n  display: block !important;\n  min-height: 0 !important;\n  overflow: hidden !important;\n  font-size: 10.5px !important;\n  letter-spacing: -0.01em !important;\n  white-space: nowrap !important;\n  text-overflow: ellipsis !important;\n}\n#nd-amb-panel .nd-ap__pal .nd-ap__sw {\n  width: calc(100% - 4px);\n}\n#nd-amb-panel .nd-ap__swtag {\n  position: absolute !important;\n  left: 3px;\n  bottom: 2px !important;\n  padding: 0 4px !important;\n  border-radius: 4px !important;\n  color: #ffffff !important;\n  background: rgba(2, 7, 19, 0.62) !important;\n  font-size: 8px !important;\n  font-weight: 800 !important;\n  line-height: 11px !important;\n  letter-spacing: 0.05em !important;\n  text-transform: uppercase !important;\n}\n#nd-amb-panel .nd-ap__sw {\n  position: relative !important;\n  display: grid !important;\n  place-items: center !important;\n  width: 100%;\n  height: 30px;\n  border-radius: 7px !important;\n  background: linear-gradient(135deg, var(--c1, var(--nda-a1)) 0%, var(--c2, var(--nda-a2)) 100%) !important;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16), 0 3px 10px rgba(0, 0, 0, 0.35) !important;\n}\n#nd-amb-panel .nd-ap__sw--sm {\n  flex: none !important;\n  width: 52px;\n  height: 28px;\n}\n#nd-amb-panel .nd-ap__pen {\n  position: absolute !important;\n  inset: 0;\n  display: grid !important;\n  place-items: center !important;\n  color: rgba(255, 255, 255, 0.95) !important;\n  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7)) !important;\n}\n#nd-amb-panel .nd-ap__opt--on .nd-ap__pen {\n  display: none !important;\n}\n#nd-amb-panel .nd-ap__custom {\n  gap: 9px !important;\n  padding: 10px 11px 9px !important;\n}\n#nd-amb-panel .nd-ap__cpair {\n  display: grid !important;\n  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important;\n  align-items: center !important;\n  gap: 8px !important;\n}\n#nd-amb-panel .nd-ap__cchip {\n  display: flex !important;\n  align-items: center !important;\n  gap: 9px !important;\n  min-width: 0 !important;\n  height: 42px;\n  padding: 0 10px 0 6px !important;\n  border: 1px solid var(--nda-border-soft) !important;\n  border-radius: 10px !important;\n  color: var(--nda-text) !important;\n  background: rgba(2, 7, 19, 0.45) !important;\n  font-family: inherit !important;\n  text-align: left !important;\n  cursor: pointer !important;\n  transition: border-color 120ms ease, box-shadow 120ms ease !important;\n}\n#nd-amb-panel .nd-ap__cchip:hover {\n  border-color: var(--nda-border) !important;\n}\n#nd-amb-panel .nd-ap__cchip[aria-pressed=\"true\"] {\n  border-color: rgba(255, 255, 255, 0.9) !important;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.9), 0 0 12px rgba(var(--nda-line-rgb), 0.25) !important;\n}\n#nd-amb-panel .nd-ap__cdot {\n  flex: none !important;\n  width: 28px;\n  height: 28px;\n  border-radius: 8px !important;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22), 0 2px 8px rgba(0, 0, 0, 0.4) !important;\n}\n#nd-amb-panel .nd-ap__ctext {\n  display: flex !important;\n  flex-direction: column !important;\n  min-width: 0 !important;\n  line-height: 1.25 !important;\n}\n#nd-amb-panel .nd-ap__clabel {\n  color: #ffffff !important;\n  font-size: 12.5px !important;\n  font-weight: 700 !important;\n}\n#nd-amb-panel .nd-ap__chex {\n  color: var(--nda-muted) !important;\n  font-size: 11px !important;\n  font-weight: 600 !important;\n  letter-spacing: 0.03em !important;\n  font-variant-numeric: tabular-nums !important;\n}\n#nd-amb-panel .nd-ap__iconbtn {\n  display: grid !important;\n  place-items: center !important;\n  width: 32px;\n  height: 32px;\n  padding: 0 !important;\n  border: 1px solid var(--nda-border) !important;\n  border-radius: 50% !important;\n  color: var(--nda-text) !important;\n  background: transparent !important;\n  cursor: pointer !important;\n}\n#nd-amb-panel .nd-ap__iconbtn:hover {\n  color: #ffffff !important;\n  background: rgba(var(--nda-line-rgb), 0.1) !important;\n}\n#nd-amb-panel .nd-ap__gradbar {\n  height: 12px;\n  border-radius: 999px !important;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14) !important;\n}\n#nd-amb-panel .nd-ap__hsv {\n  grid-template-columns: 62px 1fr 40px !important;\n}\n#nd-amb-panel .nd-ap__slider--paint::-webkit-slider-runnable-track {\n  height: 8px;\n  background: var(--nda-track, rgba(var(--nda-muted-rgb), 0.26)) !important;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12) !important;\n}\n#nd-amb-panel .nd-ap__slider--paint::-webkit-slider-thumb {\n  width: 16px;\n  height: 16px;\n  margin-top: -4px !important;\n  background: var(--nda-thumb, #ffffff) !important;\n  box-shadow: 0 0 0 2px #ffffff, 0 2px 6px rgba(0, 0, 0, 0.5) !important;\n}\n#nd-amb-panel .nd-ap__slider--paint:hover::-webkit-slider-thumb {\n  box-shadow: 0 0 0 2px #ffffff, 0 0 10px rgba(255, 255, 255, 0.5) !important;\n}\n#nd-amb-panel .nd-ap__slider--paint:focus-visible::-webkit-slider-thumb {\n  box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px var(--nda-a2-fg) !important;\n}\n#nd-amb-panel .nd-ap__hexrow {\n  display: flex !important;\n  align-items: center !important;\n  gap: 10px !important;\n}\n#nd-amb-panel .nd-ap__hexrow .nd-ap__rlabel {\n  width: 62px;\n  flex: none !important;\n}\n#nd-amb-panel .nd-ap__hexin {\n  flex: none !important;\n  width: 96px;\n  height: 30px;\n  padding: 0 9px !important;\n  border: 1px solid var(--nda-border) !important;\n  border-radius: 8px !important;\n  color: var(--nda-text) !important;\n  background: rgba(2, 7, 19, 0.55) !important;\n  font-family: inherit !important;\n  font-size: 12.5px !important;\n  font-weight: 700 !important;\n  letter-spacing: 0.04em !important;\n  text-transform: uppercase !important;\n  outline: none !important;\n}\n#nd-amb-panel .nd-ap__hexin:focus {\n  border-color: var(--nda-a2-fg) !important;\n  box-shadow: 0 0 10px rgba(var(--nda-a2-rgb), 0.25) !important;\n}\n#nd-amb-panel .nd-ap__hexrow .nd-ap__hint {\n  min-width: 0 !important;\n  color: color-mix(in srgb, var(--nda-a1-fg) 45%, #fff) !important;\n}\n#nd-amb-panel .nd-ap__match {\n  flex-direction: row !important;\n  gap: 11px !important;\n  width: 100%;\n  padding: 9px 11px !important;\n  font-family: inherit !important;\n  text-align: left !important;\n}\n#nd-amb-panel .nd-ap__match.nd-ap__opt--on {\n  padding: 8px 10px !important;\n}\n#nd-amb-panel .nd-ap__match .nd-ap__rowtext {\n  flex: 1 !important;\n}\n#nd-amb-panel .nd-ap__matchicon {\n  display: grid !important;\n  place-items: center !important;\n  flex: none !important;\n  width: 30px;\n  height: 30px;\n  border-radius: 9px !important;\n  color: var(--nda-on-accent) !important;\n  background: var(--nda-grad) !important;\n  box-shadow: 0 0 12px rgba(var(--nda-a1-rgb), 0.35) !important;\n}\n#nd-amb-panel .nd-ap__walls {\n  display: grid !important;\n  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;\n  gap: 8px !important;\n}\n#nd-amb-panel .nd-ap__wthumb {\n  position: relative !important;\n  display: grid !important;\n  place-items: center !important;\n  width: 100%;\n  aspect-ratio: 16 / 9 !important;\n  overflow: hidden !important;\n  border-radius: 7px !important;\n  color: var(--nda-muted) !important;\n  background-color: #06142b !important;\n  background-position: center !important;\n  background-size: cover !important;\n  background-repeat: no-repeat !important;\n  box-shadow: inset 0 0 0 1px rgba(var(--nda-line-rgb), 0.16) !important;\n}\n#nd-amb-panel .nd-ap__opt:not(.nd-ap__opt--on) .nd-ap__wthumb--img {\n  filter: saturate(0.85) brightness(0.85) !important;\n}\n#nd-amb-panel .nd-ap__wthumb--img .nd-ap__wph {\n  display: none !important;\n}\n#nd-amb-panel .nd-ap__wph {\n  display: grid !important;\n  place-items: center !important;\n  width: 30px;\n  height: 30px;\n  border-radius: 50% !important;\n  background: rgba(var(--nda-line-rgb), 0.08) !important;\n  box-shadow: inset 0 0 0 1px var(--nda-border) !important;\n}\n#nd-amb-panel .nd-ap__wthumb .nd-ap__check {\n  position: absolute !important;\n  top: 4px;\n  right: 4px !important;\n}\n#nd-amb-panel .nd-ap__whint {\n  margin: 8px 0 0 !important;\n  color: var(--nda-muted) !important;\n  font-size: 11.5px !important;\n}\n#nd-amb-panel .nd-ap__filebox {\n  gap: 8px !important;\n}\n#nd-amb-panel .nd-ap__filebox [data-ref=\"fileInfo\"] {\n  overflow: hidden !important;\n  white-space: nowrap !important;\n  text-overflow: ellipsis !important;\n}\n#nd-amb-panel .nd-ap__btnrow {\n  display: flex !important;\n  gap: 8px !important;\n}\n#nd-amb-panel .nd-ap__btnrow .nd-ap__btn {\n  flex: 1 !important;\n}\n#nd-amb-panel .nd-ap__btn:disabled,\n#nd-amb-panel .nd-ap__btn:disabled:hover {\n  border-color: var(--nda-border-soft) !important;\n  color: var(--nda-muted) !important;\n  background: transparent !important;\n  cursor: default !important;\n}\n#nd-amb-panel .nd-ap__note--warn {\n  border-color: rgba(255, 110, 140, 0.5) !important;\n  color: #ffd3dc !important;\n  background: rgba(255, 70, 110, 0.13) !important;\n}\n#nd-amb-panel .nd-ap__file {\n  display: none !important;\n}\n@media (prefers-reduced-motion: reduce) {\n  #nd-amb-panel,\n  #nd-amb-panel .nd-ap__switch,\n  #nd-amb-panel .nd-ap__switch::before,\n  #nd-amb-panel .nd-ap__tab,\n  #nd-amb-panel .nd-ap__opt,\n  #nd-amb-panel .nd-ap__cchip {\n    transition: none !important;\n  }\n}\n#nd-ambient .nd-amb__note {\n  position: absolute !important;\n  left: 28px;\n  bottom: 26px !important;\n  z-index: 3 !important;\n  display: flex !important;\n  align-items: center !important;\n  gap: 9px !important;\n  max-width: min(560px, 62vw) !important;\n  padding: 7px 15px 7px 12px !important;\n  border: 1px solid rgba(var(--nda-a2-rgb), 0.30) !important;\n  border-radius: 999px !important;\n  color: var(--nda-text) !important;\n  background: rgba(2, 7, 19, 0.62) !important;\n  font-size: 13px !important;\n  font-weight: 600 !important;\n  line-height: 1.3 !important;\n  letter-spacing: 0.01em !important;\n  text-shadow: 0 1px 2px rgba(2, 7, 19, 0.8) !important;\n  opacity: 0;\n  transform: translateY(6px);\n  transition: opacity 1200ms ease, transform 1200ms ease !important;\n  pointer-events: none !important;\n}\n#nd-ambient .nd-amb__note:empty {\n  display: none !important;\n}\n#nd-ambient .nd-amb__note::before {\n  content: \"\" !important;\n  flex: none !important;\n  width: 7px;\n  height: 7px;\n  border-radius: 50% !important;\n  background: var(--nda-a2) !important;\n  box-shadow: 0 0 8px var(--nda-a2) !important;\n}\n#nd-ambient.nd-amb--note .nd-amb__note {\n  opacity: 1;\n  transform: none;\n  transition: opacity 700ms ease 500ms, transform 700ms cubic-bezier(0.22, 0.61, 0.36, 1) 500ms !important;\n}\n#nd-amb-panel .nd-ap__dockwrap {\n  position: sticky !important;\n  top: -12px;\n  z-index: 4 !important;\n  flex: none !important;\n  height: 0;\n  margin: 0 0 -12px !important;\n  pointer-events: none !important;\n}\n#nd-amb-panel .nd-ap__dockwrap::before {\n  content: \"\" !important;\n  position: absolute !important;\n  top: 0;\n  left: -16px;\n  right: -16px !important;\n  height: 112px;\n  background: linear-gradient(180deg, rgba(15, 34, 70, 0.94) 0%, rgba(15, 34, 70, 0.82) 72%, rgba(15, 34, 70, 0) 100%) !important;\n  opacity: 0;\n  transition: opacity 220ms ease !important;\n}\n#nd-amb-panel .nd-ap__dock {\n  position: absolute !important;\n  top: 7px;\n  left: 0;\n  right: 0 !important;\n  width: 265px;\n  height: 92px;\n  margin: 0 auto !important;\n  overflow: hidden !important;\n  border: 1px solid rgba(var(--nda-a2-rgb), 0.45) !important;\n  border-radius: 12px !important;\n  background: #020713 !important;\n  box-shadow:\n    0 0 0 1px rgba(var(--nda-a1-rgb), 0.10),\n    0 0 18px rgba(var(--nda-a2-rgb), 0.24),\n    0 12px 28px rgba(0, 0, 0, 0.55) !important;\n  opacity: 0;\n  transform: translateY(-30px) scale(0.84);\n  transform-origin: 50% 0 !important;\n  transition: opacity 160ms ease, transform 220ms cubic-bezier(0.4, 0, 1, 1) !important;\n  cursor: pointer !important;\n  pointer-events: none !important;\n}\n#nd-amb-panel .nd-ap__dock canvas {\n  display: block !important;\n  width: 100%;\n  height: 100%;\n}\n#nd-amb-panel .nd-ap__body--docked {\n  scroll-padding-top: 112px !important;\n}\n#nd-amb-panel .nd-ap__body--docked .nd-ap__dockwrap::before {\n  opacity: 1;\n}\n#nd-amb-panel .nd-ap__body--docked .nd-ap__dock {\n  opacity: 1;\n  transform: none;\n  pointer-events: auto !important;\n  transition: opacity 240ms ease, transform 380ms cubic-bezier(0.18, 0.9, 0.24, 1.08) !important;\n}\n#nd-amb-panel .nd-ap__body--docked .nd-ap__dock:hover {\n  border-color: rgba(var(--nda-a2-rgb), 0.75) !important;\n}\n#nd-amb-panel .nd-ap__chip {\n  position: absolute !important;\n  top: 7px;\n  left: 7px;\n  max-width: calc(100% - 14px) !important;\n  padding: 2px 9px !important;\n  overflow: hidden !important;\n  border: 1px solid rgba(var(--nda-a1-rgb), 0.50) !important;\n  border-radius: 999px !important;\n  color: #ffffff !important;\n  background: rgba(2, 7, 19, 0.72) !important;\n  box-shadow: 0 0 10px rgba(var(--nda-a1-rgb), 0.30) !important;\n  font-size: 10.5px !important;\n  font-weight: 700 !important;\n  letter-spacing: 0.02em !important;\n  white-space: nowrap !important;\n  text-overflow: ellipsis !important;\n  opacity: 0;\n  transform: translateY(-3px);\n  transition: opacity 160ms ease, transform 200ms ease !important;\n  pointer-events: none !important;\n}\n#nd-amb-panel .nd-ap__chip--on {\n  opacity: 1;\n  transform: none;\n}\n#nd-amb-panel .nd-ap__chip--dock {\n  top: auto;\n  right: 0 !important;\n  bottom: 5px !important;\n  left: 0;\n  width: max-content;\n  max-width: 92% !important;\n  margin: 0 auto !important;\n  font-size: 10px !important;\n  transform: translateY(3px);\n}\n#nd-amb-panel .nd-ap__badge {\n  transition: opacity 160ms ease !important;\n}\n#nd-amb-panel .nd-ap__preview--solo .nd-ap__badge {\n  opacity: 0;\n}\n#nd-amb-panel .nd-ap__pvnote {\n  position: absolute !important;\n  right: 7px !important;\n  bottom: 6px !important;\n  left: 7px;\n  padding: 3px 9px !important;\n  border: 1px solid rgba(var(--nda-a2-rgb), 0.28) !important;\n  border-radius: 8px !important;\n  color: var(--nda-text) !important;\n  background: rgba(2, 7, 19, 0.70) !important;\n  font-size: 10.5px !important;\n  font-weight: 600 !important;\n  line-height: 1.3 !important;\n  text-align: center !important;\n  opacity: 0;\n  transform: translateY(4px);\n  transition: opacity 900ms ease, transform 900ms ease !important;\n  pointer-events: none !important;\n}\n#nd-amb-panel .nd-ap__pvnote--on {\n  opacity: 1;\n  transform: none;\n  transition: opacity 500ms ease 250ms, transform 500ms ease 250ms !important;\n}\n@media (prefers-reduced-motion: reduce) {\n  #nd-ambient .nd-amb__note,\n  #nd-ambient.nd-amb--note .nd-amb__note,\n  #nd-amb-panel .nd-ap__dock,\n  #nd-amb-panel .nd-ap__body--docked .nd-ap__dock,\n  #nd-amb-panel .nd-ap__chip,\n  #nd-amb-panel .nd-ap__chip--on,\n  #nd-amb-panel .nd-ap__pvnote,\n  #nd-amb-panel .nd-ap__pvnote--on {\n    transform: none;\n  }\n  #nd-amb-panel .nd-ap__dock,\n  #nd-amb-panel .nd-ap__body--docked .nd-ap__dock {\n    transition: opacity 160ms linear !important;\n  }\n}\n@media (max-width: 1365px) {\n  #nd-ambient .nd-amb__note {\n    top: 24px;\n    bottom: auto !important;\n    max-width: min(520px, calc(100vw - 56px)) !important;\n    transform: translateY(-6px);\n  }\n}\n@media (max-width: 1365px) and (prefers-reduced-motion: reduce) {\n  #nd-ambient .nd-amb__note {\n    transform: none;\n  }\n}\n#nd-amb-panel .nd-ap__compat {\n  display: flex !important;\n  align-items: center !important;\n  gap: 10px !important;\n  margin: 8px 16px 0 !important;\n  padding: 8px 10px !important;\n  border-radius: 10px !important;\n  background: rgba(var(--nda-a2-rgb), 0.08) !important;\n  box-shadow: inset 0 0 0 1px var(--nda-border-soft) !important;\n}\n#nd-amb-panel .nd-ap__compat .nd-ap__hint {\n  flex: 1 !important;\n  margin: 0 !important;\n}\n#nd-amb-panel .nd-ap__compat .nd-ap__btn {\n  flex: none !important;\n}\n#nd-amb-panel .nd-ap__notheme {\n  display: block !important;\n  margin: 0 0 10px !important;\n}\n#nd-amb-panel#nd-amb-panel[hidden],\n#nd-amb-panel#nd-amb-panel [hidden] {\n  display: none !important;\n}\n";
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
  // ---- look: colour maths --------------------------------------------------------
  const WHITE = [255, 255, 255], NAVY = [2, 7, 19], SURF_HI = [21, 48, 90], ICE = [234, 252, 255];
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const to255 = (v) => clamp(Math.round(v), 0, 255);
  const rgbHex = (c) => "#" + c.map((v) => to255(v).toString(16).padStart(2, "0")).join("");
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const chan = (c) => to255(c[0]) + ", " + to255(c[1]) + ", " + to255(c[2]);
  const rgbaS = (c, a) => "rgba(" + chan(c) + ", " + a + ")";
  function lum(c) {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  /** c moved towards `to` just enough to reach `ratio` against bg (c itself when it already does) */
  function towards(c, to, bg, ratio) {
    if (contrast(c, bg) >= ratio) return c;
    let lo = 0, hi = 1;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (contrast(mixc(c, to, m), bg) >= ratio) hi = m; else lo = m; }
    return mixc(c, to, hi);
  }
  /** a colour made light enough to read on bg by raising its HSL lightness
      (the hue and saturation stay, so a dark pick becomes a vivid light
      version of itself instead of a grey); c itself when it already reads */
  function lift(c, bg, ratio) {
    if (contrast(c, bg) >= ratio) return c;
    const [h, sat] = rgbHsl(c);
    let lo = rgbHsl(c)[2], hi = 1;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (contrast(hslRgb(h, sat, m), bg) >= ratio) hi = m; else lo = m; }
    return hslRgb(h, sat, hi);
  }
  /** CSS filter maths (sRGB, clamped per step, as Chromium paints <img> filters) */
  function filterHueSat(c, deg, sat, bri) {
    const r = (deg * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
    const H = [
      0.213 + co * 0.787 - si * 0.213, 0.715 - co * 0.715 - si * 0.715, 0.072 - co * 0.072 + si * 0.928,
      0.213 - co * 0.213 + si * 0.143, 0.715 + co * 0.285 + si * 0.14, 0.072 - co * 0.072 - si * 0.283,
      0.213 - co * 0.213 - si * 0.787, 0.715 - co * 0.715 + si * 0.715, 0.072 + co * 0.928 + si * 0.072,
    ];
    const S = [
      0.213 + 0.787 * sat, 0.715 - 0.715 * sat, 0.072 - 0.072 * sat,
      0.213 - 0.213 * sat, 0.715 + 0.285 * sat, 0.072 - 0.072 * sat,
      0.213 - 0.213 * sat, 0.715 - 0.715 * sat, 0.072 + 0.928 * sat,
    ];
    const mul = (M, v) => [0, 1, 2].map((i) => clamp(M[i * 3] * v[0] + M[i * 3 + 1] * v[1] + M[i * 3 + 2] * v[2], 0, 255));
    return mul(S, mul(H, c)).map((v) => clamp(v * bri, 0, 255));
  }
  /** hue-rotate / saturate / brightness that turn Spotify's green (#1ed760,
      baked into some images) into `target`: the angle that gives the right
      hue, then the saturation and brightness that come closest (CSS
      hue-rotate is an approximation, so the plain hue difference misses by
      20-26 degrees on blue / pink pairs) */
  const SPOTIFY_GREEN = [30, 215, 96];
  function greenFilter(target) {
    const th = rgbHsv(target)[0], dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const hd = (x) => { const d = Math.abs(rgbHsv(x)[0] - th) % 360; return d > 180 ? 360 - d : d; };
    let best = { deg: 0, d: Infinity };
    for (let deg = -180; deg <= 180; deg += 1) {
      const o = filterHueSat(SPOTIFY_GREEN, deg, 1.3, 1);
      const d = hd(o);
      if (d < best.d) best = { deg, d };
    }
    let fit = { sat: 1.3, bri: 1.1, d: Infinity };
    for (let deg = best.deg - 6; deg <= best.deg + 6; deg += 1) {
      for (let sat = 1; sat <= 3.01; sat += 0.1) {
        for (let bri = 0.85; bri <= 1.35; bri += 0.05) {
          const d = dist(filterHueSat(SPOTIFY_GREEN, deg, sat, bri), target);
          if (d < fit.d) fit = { deg, sat, bri, d };
        }
      }
    }
    let deg = fit.deg;
    if (deg > 180) deg -= 360;
    if (deg < -180) deg += 360;
    return { deg, sat: +fit.sat.toFixed(2), bri: +fit.bri.toFixed(2) };
  }
  function rgbHsv(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
  }
  function hsvRgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; };
    return [f(5), f(3), f(1)];
  }
  function rgbHsl(c) {
    const [h, s, v] = rgbHsv(c), l = v * (1 - s / 2);
    return [h, l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l];
  }
  function hslRgb(h, s, l) {
    const v = l + s * Math.min(l, 1 - l);
    return hsvRgb(h, v ? 2 * (1 - l / v) : 0, v);
  }
  const hueDist = (a, b) => { const d = Math.abs(rgbHsv(a)[0] - rgbHsv(b)[0]) % 360; return d > 180 ? 360 - d : d; };

  /** everything that follows from the two accents: the CSS variables of
      user.css section 1 that CSS cannot compute (channels, contrast-safe
      text versions, the text colour on accent fills) and the canvas colours
      of the visualizers. Default pair = the v1-v3 values (+-3 per channel). */
  function makePalette(h1, h2) {
    const a1 = hexRgb(h1), a2 = hexRgb(h2), mid = mixc(a1, a2, 0.5);
    const a1fg = lift(a1, SURF_HI, 4.55), a2fg = lift(a2, SURF_HI, 4.55);                   // as text / icons on the lightest navy (4.5:1 after rounding)
    const ink = towards(mixc(a2, NAVY, 0.45), NAVY, ICE, 4.6);                               // as text on the ice-white pills
    const fills = [a1, a2, mid];                                                              // the gradient: both ends and the middle
    const worst = (fg) => Math.min(contrast(fills[0], fg), contrast(fills[1], fg), contrast(fills[2], fg));
    const on = worst(NAVY) >= worst(WHITE) ? NAVY : WHITE;
    const text = mixc(WHITE, a2, 0.1), sub = mixc([231, 216, 255], a2, 0.35), muted = mixc([180, 167, 211], a2, 0.2);
    // Spotify's baked-in green images -> a2-fg (the default pair keeps its hand-tuned 47deg / 1.3 / 1.1)
    const isDefault = h1.toLowerCase() === PRESETS[0].a1 && h2.toLowerCase() === PRESETS[0].a2;
    const gf = isDefault ? { deg: 47, sat: 1.3, bri: 1.1 } : greenFilter(a2fg);
    // "announcement" (notification dots, "Novo" badges, Spicetify notifications):
    // a2 turned ~31 deg, which gives v1's own #4a8dff / #7db8ff for the default cyan
    const [ah, as, av] = rgbHsv(a2);
    const ann = hsvRgb((ah + 31) % 360, clamp(as * 0.9, 0, 1), Math.max(av, 0.75));            // dots / badges (fills)
    const annHi = lift(hsvRgb((ah + 26) % 360, clamp(as * 0.65, 0, 1), av), SURF_HI, 4.55);     // text
    const vars = {
      "--nd-a1": h1, "--nd-a2": h2, "--nd-a1-rgb": chan(a1), "--nd-a2-rgb": chan(a2),
      "--nd-a1-fg": rgbHex(a1fg), "--nd-a2-fg": rgbHex(a2fg), "--nd-a2-ink": rgbHex(ink), "--nd-on-accent": rgbHex(on),
      "--nd-line-rgb": chan(mixc(a2fg, WHITE, 0.3)),
      "--nd-a1-soft-rgb": chan(mixc(a1, WHITE, 0.55)), "--nd-a2-soft-rgb": chan(mixc(a2, WHITE, 0.6)),
      "--nd-text": rgbHex(text), "--nd-text-rgb": chan(text), "--nd-subtext": rgbHex(sub), "--nd-subtext-rgb": chan(sub),
      "--nd-muted": rgbHex(muted), "--nd-muted-rgb": chan(muted),
      "--nd-green-rotate": gf.deg + "deg", "--nd-green-sat": String(gf.sat), "--nd-green-bright": String(gf.bri),
      "--nd-announce": rgbHex(ann), "--nd-announce-rgb": chan(ann), "--nd-announce-hi": rgbHex(annHi),
    };
    const pal = {
      a1, a2, mid,
      barsCore: [rgbaS(mixc(a2, WHITE, 0.63), 1), rgbHex(mixc(a2, WHITE, 0.94)), "#ffffff", rgbHex(mixc(a1, WHITE, 0.94)), rgbaS(mixc(a1, WHITE, 0.67), 1)],
      line: rgbaS(mixc(a2, WHITE, 0.9), 0.2),
      haze: [rgbaS(a1, 0.95), rgbaS(mid, 0.85), rgbaS(a2, 0.95)],
      shadowRgb: chan(mixc(a2, WHITE, 0.55)),          // bar / ring halo (alpha added per frame)
      ringCore: ["#ffffff", rgbHex(mixc(a2, WHITE, 0.95)), rgbaS(mixc(a2, WHITE, 0.75), 0.9)],
      rim: rgbaS(mixc(a2, WHITE, 0.93), 0.9),
      coverRing: rgbaS(mixc(a2, WHITE, 0.9), 0.28),
      waveGlow: [rgbaS(a2, 0.95), rgbaS(a1, 0.95), rgbaS(mixc(mid, WHITE, 0.1), 0.9)],
      waveShadow: [rgbaS(mixc(a2, WHITE, 0.33), 0.95), rgbaS(mixc(a1, WHITE, 0.24), 0.9), rgbaS(mixc(mid, WHITE, 0.35), 0.85)],
      waveFill: [rgbaS(a2, 0), rgbaS(mixc(a2, WHITE, 0.48), 0.16), rgbaS(mixc(a2, WHITE, 0.93), 0.24), rgbaS(mixc(a1, WHITE, 0.4), 0.16), rgbaS(a1, 0)],
      flash: [chan(mixc(a2, WHITE, 0.7)), chan(a2), chan(a1)],
      ver: 0,
    };
    return { vars, pal };
  }

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

  // ---- boot --------------------------------------------------------------------
  /** everything the extension used to wait for: kept for the first ~10 s so the boot happens at the same moment as
      before; after that only the player (and the page) are needed: every other API is looked up when it is used */
  function spicetifyReady(tries) {
    const s = window.Spicetify;
    const core = !!(s && s.Player && typeof s.Player.addEventListener === "function" && typeof s.Player.getProgress === "function" && document.body);
    if (!core) return false;
    if (tries > 50) return true;
    return !!(s.Platform && s.Platform.History && typeof s.getAudioData === "function" && s.Menu && s.Menu.Item && s.React && s.ReactJSX && s.ContextMenuV2);
  }

  const LISTEN_PASSIVE = { capture: true, passive: true };
  const LISTEN_ACTIVE = { capture: true, passive: false };
  const ACTIVITY_EVENTS = ["mousedown", "pointerdown", "wheel", "touchstart", "touchmove"];

  let reducedMq = null;
  function onReducedMotion() { S.reducedMotion = !!(reducedMq && reducedMq.matches); syncPanel(); }
  function init() {
    resolveLang();                     // Spicetify.Locale is there now: before the menu / the button get their labels
    checkTheme();
    scheduleThemeChecks();
    try {
      reducedMq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
      S.reducedMotion = !!(reducedMq && reducedMq.matches);
      if (reducedMq && reducedMq.addEventListener) reducedMq.addEventListener("change", onReducedMotion);
    } catch (e) { /* ignore */ }

    window.addEventListener("mousemove", onMouseMove, LISTEN_PASSIVE);
    for (const t of ACTIVITY_EVENTS) window.addEventListener(t, onActivity, LISTEN_PASSIVE);
    // keys are not passive: the key that wakes the app up is swallowed so it
    // cannot also press the focused button or toggle play/pause
    window.addEventListener("keydown", onKeyDown, LISTEN_ACTIVE);
    window.addEventListener("keyup", onKeyUp, LISTEN_ACTIVE);
    window.addEventListener("keypress", shieldPanelKey, LISTEN_ACTIVE);
    window.addEventListener("pointerdown", onPanelOutside, LISTEN_PASSIVE);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    Spicetify.Player.addEventListener("songchange", onSongChange);
    Spicetify.Player.addEventListener("onplaypause", onPlayPause);
    Spicetify.Player.addEventListener("onprogress", onProgress);

    S.interval = setInterval(idleCheck, CHECK_EVERY_MS);

    registerMenu(0);
    registerTopbar(0);
    armEntryFallback();               // no button host / no menu 30 s after the UI shows up: the other ways in
    if (CFG.wallpaper.mode === "cover" && THEME.on) applyWallpaper("init");   // the cover needs the player (ready now)
    if (SETTINGS_MIGRATED) { SETTINGS_MIGRATED = false; saveSettings(true); }   // older settings converted: saved once
    dbg("init", { lang: LANG, langSource: LANG_SRC, theme: THEME.on, version: ND_VERSION });
  }

  /** profile menu: "Modo ambiente" (check mark = on / off) and "Personalizar NeonDrift" (opens the panel); retried
      while Spicetify's React bits are still loading */
  function registerMenu(tries) {
    if (S.destroyed || menuItem) return;
    try {
      if (FAULT.menu) throw new Error("fault drill");
      const item = new Spicetify.Menu.Item(tr(MENU_LABEL), CFG.enabled, () => setEnabled(!CFG.enabled, true), ICON_EQ);
      const more = new Spicetify.Menu.Item(tr(MENU_SETTINGS_LABEL), false, () => setTimeout(openPanel, 0, true), ICON_EQ);
      item.register();
      more.register();
      menuItem = item;
      menuSettings = more;
    } catch (e) {
      if (tries < 30) S.menuTimer = setTimeout(registerMenu, 1000, tries + 1);
    }
  }
  /** the language changed after the menu / the button / the panel got their texts (a late Spicetify.Locale): every
      label follows, and a panel that was already built is built again in the new language (same tab) */
  function relabel() {
    try { if (menuItem && menuItem.setName) menuItem.setName(tr(MENU_LABEL)); } catch (e) { /* ignore */ }
    try { if (menuSettings && menuSettings.setName) menuSettings.setName(tr(MENU_SETTINGS_LABEL)); } catch (e) { /* ignore */ }
    syncTopbtn();
    try { if (playBtn) playBtn.label = tr(PANEL_LABEL); } catch (e) { /* ignore */ }
    if (el.root) setRootLang();
    if (el.panel) rebuildPanel();
  }

  /** top-bar button (right side, next to "Novidades") that opens the panel */
  function registerTopbar(tries) {
    if (S.destroyed || topBtn) return;
    try {
      if (!Spicetify.Topbar || typeof Spicetify.Topbar.Button !== "function") throw new Error("no Topbar");
      const b = new Spicetify.Topbar.Button(tr(PANEL_LABEL), ICON_EQ, () => togglePanel(true), false, true);
      b.element.classList.add("nd-amb-topbtn");
      b.button.type = "button";
      b.button.setAttribute("aria-haspopup", "dialog");
      b.button.setAttribute("aria-expanded", "false");
      b.button.setAttribute("aria-controls", "nd-amb-panel");
      // Spicetify's tooltip is a bare <div class="main-contextMenu-tippy"> in a tippy popper (id "tippy-N"): tagged,
      // so our own CSS gives it colours (the NeonDrift theme styles every such tooltip like Spotify's own)
      try {
        const pop = b.tippy && b.tippy.popper;
        if (pop) { pop.classList.add("nd-amb-tippop"); if (pop.firstElementChild) pop.firstElementChild.classList.add("nd-amb-tip"); }
      } catch (e) { /* ignore */ }
      topBtn = b;
      mountTopbar();
      syncTopbtn();
    } catch (e) {
      if (tries < 30) S.topTimer = setTimeout(registerTopbar, 1000, tries + 1);
    }
  }
  /** Spicetify 2.45.3 waits for .main-globalNav-historyButtons, which Spotify 1.3.4 no longer has, so it never mounts
      right-side buttons: put ours just before "Novidades" (same group, so the same spacing), with that button's class.
      Hosts, in order: where Spicetify itself mounted it; .main-actionButtons; the global nav group of the profile
      button. A host that is not rendered counts as missing. Re-checked by the idle timer (cheap). */
  // the readable names exist only when Spicetify's class map was fresh at "spicetify backup"; else the 1.3.4 / 1.3.6 hashes
  const ACTION_BUTTONS = ".main-actionButtons, .uf2x5WzM1lLLCLSQdMFB, .ERwUgK0ZJ6qV1QmdLcWt";
  const ACTION_BUTTON = ".main-actionButtons-button, .IP9nbmlAqlYRK9fq8Mll, .LybVpBCvA8pEFVale0jg";
  const topShown = () => !!(topBtn && topBtn.element.isConnected && topBtn.element.getClientRects().length);
  function mountTopbar() {
    if (!topBtn) return;
    if (topShown()) { S.topHost = S.topHost || "spicetify"; S.entry = S.entry || S.topHost; return; }
    const cls = topBtn.button.className;
    const shown = (n) => !!(n && n.getClientRects().length);
    const host = FAULT.topbarHost ? null : document.querySelector(ACTION_BUTTONS);
    if (shown(host)) {
      const ref = host.querySelector(ACTION_BUTTON);
      if (ref && (!cls || cls === "undefined")) topBtn.button.className = ref.className;
      (ref && ref.parentElement ? ref.parentElement : host).prepend(topBtn.element);
      S.entry = S.topHost = "actionButtons";
      return;
    }
    const user = FAULT.topbarHost ? null : document.querySelector('[id="global-nav-bar"] [data-testid="user-widget-link"]');
    const group = user && user.parentElement;
    if (shown(group) && group !== topBtn.element.parentElement) {
      const ref = [...group.querySelectorAll("button")].find((x) => x !== user && !topBtn.element.contains(x));
      if (ref && (!cls || cls === "undefined")) topBtn.button.className = ref.className;
      group.insertBefore(topBtn.element, user);
      S.entry = S.topHost = "globalNav";
    }
  }
  /** Spotify's UI is on screen: a Spotify that starts minimised / hidden mounts nothing until its window is shown.
      The page counts as mounted once its main view is there, or after a minute on screen (a layout without it) */
  function uiShown() {
    if (document.hidden) { S.shownAt = 0; return false; }
    if (!S.shownAt) S.shownAt = now();
    return !!document.getElementById("main-view") || now() - S.shownAt > 60000;
  }
  /** the other ways in are decided 30 s after the UI is first on screen (re-checked by the idle timer until then; a
      window hidden meanwhile starts the wait again) */
  function armEntryFallback() {
    if (S.destroyed || S.entryDone) return;
    if (!uiShown()) { if (S.entryTimer) { clearTimeout(S.entryTimer); S.entryTimer = 0; } return; }
    if (!S.entryTimer) S.entryTimer = setTimeout(entryFallback, ENTRY_FALLBACK_MS);
  }
  /** no top-bar host was found -> a button in the player bar; no button and no menu entry -> Ctrl+Alt+N opens the
      panel (said once in a notification) */
  function entryFallback() {
    S.entryTimer = 0;
    if (S.destroyed || S.entryDone) return;
    if (!uiShown()) return;                       // hidden meanwhile: armEntryFallback starts the wait again
    S.entryDone = true;
    const hasTop = topShown();
    if (!hasTop && !playBtn) {
      try {
        if (Spicetify.Playbar && typeof Spicetify.Playbar.Button === "function") {
          playBtn = new Spicetify.Playbar.Button(tr(PANEL_LABEL), ICON_EQ, () => togglePanel(true), false, false, true);
          S.entry = "playbar";
        }
      } catch (e) { playBtn = null; }
    }
    S.shortcut = !hasTop && !playBtn && !menuItem;
    if (S.shortcut) {
      S.entry = "shortcut";
      try { Spicetify.showNotification(tr("toast.shortcut")); } catch (e) { /* ignore */ }
    }
    dbg("entry", S.entry || "menu", { topbar: hasTop, playbar: !!playBtn, menu: !!menuItem });
  }
  /** the top-bar button showed up after all (a late host): the fallback ways in go, so there is only one button */
  function dropFallbackEntry() {
    if (!topShown()) return;
    if (playBtn) {
      try { playBtn.deregister(); } catch (e) { /* ignore */ }
      playBtn = null;
      if (S.panelOpen) positionPanel();
    }
    S.shortcut = false;
    S.entry = S.topHost || "spicetify";
    dbg("entry", S.entry, { late: true });
  }
  function entryState() {
    return { entry: S.entry || (menuItem ? "menu" : "none"), topbar: !!(topBtn && topBtn.element.isConnected), playbar: !!playBtn, menu: !!menuItem, shortcut: S.shortcut };
  }
  /** the button opens the whole panel (colours, wallpaper, ambient mode), so it always reads "Personalizar NeonDrift";
      --off still marks the mode for CSS */
  function syncTopbtn() {
    if (!topBtn) return;
    const label = tr(PANEL_LABEL);
    topBtn.element.classList.toggle("nd-amb-topbtn--off", !CFG.enabled);
    if (topBtn.button.getAttribute("aria-label") === label) return;
    try { topBtn.label = label; } catch (e) { topBtn.button.setAttribute("aria-label", label); }   // also the tooltip text
  }

  /** everything this instance added goes. A hand-over (a newer copy takes over) keeps the theme contract
      (<style id="nd-look-vars">, html[data-nd-wall]) so the layout does not flash meanwhile. */
  function destroy(opts) {
    if (S.destroyed) return;
    const handoff = !!(opts && opts.handoff);
    try { if (saveTimer) saveSettings(true); } catch (e) { /* ignore */ }   // a pending save is written now
    S.destroyed = true;
    try { if (reducedMq && reducedMq.removeEventListener) reducedMq.removeEventListener("change", onReducedMotion); } catch (e) { /* ignore */ }
    closePanel(false);
    hardOff();
    disarm();
    clearInterval(S.interval);
    for (const k of ["entryTimer", "menuTimer", "topTimer"]) clearTimeout(S[k]);
    for (const tm of THEME.timers) clearTimeout(tm);
    THEME.timers.length = 0;
    if (S.dockRaf) cancelAnimationFrame(S.dockRaf);
    S.dockRaf = 0;
    window.removeEventListener("mousemove", onMouseMove, LISTEN_PASSIVE);
    for (const t of ACTIVITY_EVENTS) window.removeEventListener(t, onActivity, LISTEN_PASSIVE);
    window.removeEventListener("keydown", onKeyDown, LISTEN_ACTIVE);
    window.removeEventListener("keyup", onKeyUp, LISTEN_ACTIVE);
    window.removeEventListener("keypress", shieldPanelKey, LISTEN_ACTIVE);
    window.removeEventListener("pointerdown", onPanelOutside, LISTEN_PASSIVE);
    window.removeEventListener("focus", onWindowFocus);
    window.removeEventListener("resize", onResize, { passive: true });
    document.removeEventListener("visibilitychange", onVisibility);
    try {
      Spicetify.Player.removeEventListener("songchange", onSongChange);
      Spicetify.Player.removeEventListener("onplaypause", onPlayPause);
      Spicetify.Player.removeEventListener("onprogress", onProgress);
    } catch (e) { /* ignore */ }
    try { if (menuItem) menuItem.deregister(); } catch (e) { /* ignore */ }
    try { if (menuSettings) menuSettings.deregister(); } catch (e) { /* ignore */ }
    menuItem = menuSettings = null;
    if (topBtn) {
      // Spicetify.Topbar has no deregister: hide it so its re-mount on navigation stays invisible
      try { if (topBtn.tippy) topBtn.tippy.destroy(); } catch (e) { /* ignore */ }
      topBtn.element.style.display = "none";
      topBtn.element.remove();
      topBtn = null;
    }
    try { if (playBtn) playBtn.deregister(); } catch (e) { /* ignore */ }
    playBtn = null;
    if (el.root) el.root.remove();
    if (el.panel) el.panel.remove();
    clearTimeout(LOOK.bootTimer);
    clearTimeout(LOOK.paintTimer);
    clearTimeout(LOOK.timer);
    if (LOOK.raf) cancelAnimationFrame(LOOK.raf);
    WP.token++;
    S.wallToken++;
    LOOK.matchToken++;
    removeCss();
    if (!handoff) {
      const lv = document.getElementById("nd-look-vars");
      if (lv) lv.remove();
      document.documentElement.removeAttribute("data-nd-wall");
    }
    // our object URLs: the one the layout may still show (a hand-over keeps #nd-look-vars a moment) goes a bit later
    const urls = [WP.fileUrl, WP.coverObj, BUILTIN_URL].filter(Boolean);
    if (handoff) setTimeout(() => { for (const u of urls) URL.revokeObjectURL(u); }, 5000);
    else for (const u of urls) URL.revokeObjectURL(u);
    try { if (WP.coverBmp) WP.coverBmp.close(); } catch (e) { /* ignore */ }
    try { if (S.wallImg && S.wallImg.close) S.wallImg.close(); } catch (e) { /* ignore */ }
    WP.coverBmp = null;
    S.wallImg = null;
    cover.img = cover.prev = null;
    cache.clear();
    if (idbP) idbP.then((db) => db.close(), () => {});
    if (window.NeonDriftAmbient === API) { try { delete window.NeonDriftAmbient; } catch (e) { window.NeonDriftAmbient = undefined; } }
  }

  function setEnabled(v, notify) {
    CFG.enabled = !!v;
    saveSettings(true);
    if (menuItem) menuItem.setState(CFG.enabled);
    S.lastActivity = now();
    if (!CFG.enabled) exit("disabled");
    syncPanel();
    syncTopbtn();
    if (notify) {
      try { Spicetify.showNotification(tr(CFG.enabled ? "toast.ambientOn" : "toast.ambientOff")); } catch (e) { /* ignore */ }
    }
  }

  /** applies a (partial) settings object at once and saves it */
  function applySettings(next, immediate) {
    const prevEnabled = CFG.enabled;
    CFG = sanitize(next);
    scheduleLook();                   // colours / wallpaper (no-op when they did not change)
    if (menuItem && prevEnabled !== CFG.enabled) menuItem.setState(CFG.enabled);
    if (!CFG.enabled) exit("disabled");
    if (el.root) { setRootStyle(); if (S.phase !== "off") resizeMain(); }
    S.lastActivity = now();
    saveSettings(immediate);
    syncPanel();
    syncTopbtn();
  }
  // ---- input / idle detection -------------------------------------------------
  const isActive = () => S.phase === "entering" || S.phase === "on";

  function onMouseMove(e) {
    const x = e.clientX, y = e.clientY;
    if (isActive()) {
      if (S.anchorX !== S.anchorX || now() < S.graceUntil) { S.anchorX = x; S.anchorY = y; return; }   // first move / test grace
      if (Math.hypot(x - S.anchorX, y - S.anchorY) < JITTER_PX) return;
      S.mouseX = x; S.mouseY = y;
      exit("mousemove");
      return;
    }
    if (x === S.mouseX && y === S.mouseY) return;      // synthetic move, nothing changed
    S.mouseX = x; S.mouseY = y;
    S.lastActivity = now();
  }

  function onActivity(e) {
    S.lastActivity = now();
    if (!isActive()) return;
    // "Testar agora" grace: the rest of a double click (2nd press) and the
    // wheel do not end the test; the overlay swallows those presses anyway
    if (now() < S.graceUntil && e.type !== "touchmove") return;
    exit(e.type);
  }

  function onKeyDown(e) {
    const t = now();
    S.lastActivity = t;
    S.lastKey = t;
    if (isActive()) {
      if (e.repeat && t < S.graceUntil) {             // held Enter from "Testar agora"
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      S.swallowKeyUp = e.code || e.key;
      e.preventDefault();
      e.stopImmediatePropagation();
      exit("keydown");
      return;
    }
    if (S.panelOpen && el.panel && el.panel.contains(e.target) && onPanelKey(e)) return;
    // the last way in when no button / menu entry could be added (entryFallback): Ctrl+Alt+N
    if (S.shortcut && e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey && (e.code === "KeyN" || /^n$/i.test(e.key || ""))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      togglePanel(true);
      return;
    }
    if (S.panelOpen && (e.key === "Escape" || e.key === "Esc")) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closePanel(true);
      return;
    }
    shieldPanelKey(e);
  }

  function onKeyUp(e) {
    if (S.swallowKeyUp && (e.code || e.key) === S.swallowKeyUp) {
      S.swallowKeyUp = null;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    shieldPanelKey(e);
  }

  /** keys typed inside the panel (Space on a button, arrows on a slider...)
      must not also reach Spotify's own shortcuts (Space = play / pause).
      Their default actions (activate, move the slider, Tab) still happen;
      modified shortcuts (Ctrl+L...) pass through. */
  function shieldPanelKey(e) {
    if (!S.panelOpen || !el.panel || !el.panel.contains(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopPropagation();
  }

  function onWindowFocus(e) {
    if (e.target !== window) return;
    S.lastActivity = now();
    if (isActive()) exit("focus");
  }

  function onVisibility() {
    armEntryFallback();                 // hidden: the wait for the other ways in starts again once it is shown
    if (document.hidden) { stopLoop(); return; }
    S.lastActivity = now();             // window restored: the full idle time again
    if (S.phase !== "off" || S.panelOpen) { syncClock(true); startLoop(); }
  }

  function isPlaying() {
    if (S.test && S.test.playing !== undefined) return S.test.playing;
    try { return !!(Spicetify.Player.data && Spicetify.Player.data.item && Spicetify.Player.isPlaying()); } catch (e) { return false; }
  }
  function isHidden() {
    return S.test && S.test.hidden !== undefined ? S.test.hidden : document.hidden;
  }

  function idleCheck() {
    const t0 = now();
    S.stats.idleChecks++;
    if (topBtn && !topBtn.element.isConnected) mountTopbar();
    if (!S.entryDone) armEntryFallback();
    else if ((playBtn || S.shortcut) && topShown()) dropFallbackEntry();
    idleStep(t0);
    S.stats.idleCheckMs += now() - t0;
  }
  function idleStep(t) {
    if (!CFG.enabled || S.phase !== "off") return;
    if (S.panelOpen) { S.blockedBy = "panel"; return; }
    if (isHidden()) { S.blockedBy = "hidden"; return; }
    const idle = t - S.lastActivity, wait = idleMs();
    if (idle < wait * PREPARE_AT) { S.blockedBy = null; return; }
    if (!isPlaying()) { S.blockedBy = "paused"; return; }
    prepare();
    if (idle < wait) return;
    S.blockedBy = blockedReason();
    if (!S.blockedBy) enter("idle");
  }

  const MENU_SEL = '#context-menu, [role="menu"], .main-contextMenu-menu';
  const DIALOG_SEL = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], .ReactModal__Overlay, .GenericModal';

  /** a rendered node of sel that is not ours (nodes without boxes do not block); remembered for diagnostics */
  function anyVisible(sel) {
    for (const node of document.querySelectorAll(sel)) {
      if (el.root && el.root.contains(node)) continue;
      if (el.panel && el.panel.contains(node)) continue;
      if (isTooltipPopper(node)) continue;
      if (node.getClientRects().length) {
        S.blockedDetail = { sel, tag: String(node.tagName || "").toLowerCase(), id: node.id || "", role: node.getAttribute("role") || "", cls: String(node.className || "").slice(0, 80) };
        return true;
      }
    }
    return false;
  }
  /** Spotify's own tooltips live in a #context-menu popper too
      (<span role="tooltip">): a cursor resting on a button must not block the
      ambient mode as if a menu were open */
  function isTooltipPopper(node) {
    if (node.id !== "context-menu") return false;
    if (node.querySelector('[role="menu"], [role="listbox"], [role="dialog"], ul, .main-contextMenu-menu')) return false;
    const c = node.firstElementChild;
    return !c || c.classList.contains("main-contextMenu-tippy") || c.getAttribute("role") === "tooltip" || !!node.querySelector('[role="tooltip"]');
  }

  function isEditable(node) {
    if (!node || node === document.body) return false;
    if (node.isContentEditable) return true;
    const tag = node.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag !== "INPUT") return false;
    return !/^(button|checkbox|radio|range|submit|reset|color|file|image|hidden)$/i.test(node.type || "");
  }

  /** why ambient mode may not start right now (null = it may) */
  function blockedReason() {
    S.blockedDetail = null;
    if (S.panelOpen) return "panel";
    if (isEditable(document.activeElement) && now() - S.lastKey < TYPING_GRACE_MS) return "typing";
    const html = document.documentElement;
    if (document.fullscreenElement || html.classList.contains("fullscreen")) return "fullscreen";
    try {
      const st = Spicetify.Platform.History.location.state;
      const cs = st && st.cinemaState;
      if (cs && cs !== "closed" && cs !== "library") return "cinema";
    } catch (e) { /* ignore */ }
    for (const a of html.attributes) {
      if (a.name.startsWith("data-cinema-") && a.name.endsWith("-postenter") && a.name !== "data-cinema-library-postenter") return "cinema";
    }
    try {
      if (/lyrics/i.test(Spicetify.Platform.History.location.pathname || "")) return "lyrics";
    } catch (e) { /* ignore */ }
    if (anyVisible(MENU_SEL)) return "menu";
    if (anyVisible(DIALOG_SEL)) return "dialog";
    return null;
  }

  // ---- player ------------------------------------------------------------------
  function currentItem() {
    try { return (Spicetify.Player.data && Spicetify.Player.data.item) || null; } catch (e) { return null; }
  }

  // ---- output device (its automatic "Sincronia") ------------------------------
  /** where the sound comes out: another Connect device (phone, speaker, web
      player) or this computer's own output (Spotify's selected one, else the
      default). Cached for DEV_POLL_MS. */
  function outputDevice(force) {
    const t = now();
    if (!force && S.dev && t - S.dev.at < DEV_POLL_MS) return S.dev;
    const d = { key: "local", name: "This computer", remote: false, bt: false, at: t };
    try {
      const ad = Spicetify.Platform.ConnectAPI.state.activeDevice;
      if (ad && ad.isLocal === false) {
        d.remote = true;
        d.key = "connect:" + String(ad.id || ad.name || "?");
        d.name = String(ad.name || "Other device");
      }
    } catch (e) { /* ignore */ }
    if (!d.remote) {
      try {
        const A = Spicetify.Platform.AudioOutputDevicesAPI;
        const list = A && Array.isArray(A.devices) ? A.devices : [];
        const o = (S.outSel && list.find((x) => x && x.id === S.outSel)) || list.find((x) => x && x.isDefaultDevice) || null;
        if (o && o.id) {
          d.key = "out:" + o.id;
          d.name = String(o.fullName || o.name || d.name);
          d.short = String(o.name || o.fullName || d.name);
          d.bt = /bluetooth/i.test(String(o.transportType || "")) ||
            /bluetooth|hands-?free|airpods|galaxy buds|\bbuds\b|\bbt\b|wh-1000|wf-1000|jbl (tune|live)/i.test(d.name);
        }
      } catch (e) { /* ignore */ }
    }
    S.dev = d;
    return d;
  }
  let outSelAt = -1e9;
  /** Spotify's own output choice (Configurações > Reprodução), async; cheap, at most every 10 s */
  function refreshOutSel(force) {
    if (!force && now() - outSelAt < 10000) return;
    outSelAt = now();
    try {
      const E = Spicetify.Platform.ExclusiveModeAPI;
      if (!E || typeof E.getSelectedAudioOutputDevice !== "function") return;
      Promise.resolve(E.getSelectedAudioOutputDevice()).then((id) => {
        const v = typeof id === "string" && id ? id : null;
        if (v !== S.outSel) { S.outSel = v; S.dev = null; }
      }, () => {});
    } catch (e) { /* ignore */ }
  }
  /** the automatic "Sincronia" (audio output latency, ms) of an output: another Connect device, a Bluetooth output
      of this computer, or its own output (wired / USB / 2.4 GHz wireless headsets). No manual value and no
      calibration (they did not work well in practice); the visual itself never waits for anything else. */
  function deviceDefault(d) { return d.remote ? REMOTE_LATENCY_MS : d.bt ? BT_LATENCY_MS : LATENCY_MS; }
  const latencyFor = deviceDefault;

  function onSongChange() {
    syncClock(true);
    S.pdemo = null;
    if (CFG.wallpaper.mode === "cover") {                        // "Capa do álbum" follows the track
      // without the NeonDrift theme only the overlay / the panel show it: loaded when one of them needs it
      if (THEME.on || S.phase !== "off" || S.panelOpen) applyWallpaper("song");
      else WP.stale = true;
    } else if (S.panelOpen) syncLook();                          // the cover thumbnail of the "Wallpaper" tab
    if (S.phase === "off" && !S.panelOpen) return;
    const item = currentItem();
    if (item) ensureAnalysis(item.uri);
    if (S.phase !== "off") updateMeta(false);
  }
  function onPlayPause() {
    syncClock(true);
    S.pdemo = null;
    if (S.demo && S.clock.playing) S.demo = null;      // real playback replaces the test clock
  }
  function onProgress() { if (S.phase !== "off" || S.panelOpen) syncClock(false); }

  /** Playback clock: Spicetify's progress, interpolated with performance.now();
      small drift is eased out, seeks / pauses / track changes snap. */
  function syncClock(hard) {
    const C = S.clock, t = now();
    let p = 0, playing = false, speed = 1;
    try {
      p = S.test && S.test.sim ? S.test.sim.pos + (t - S.test.sim.at) : num(Spicetify.Player.getProgress(), 0);
      playing = isPlaying();
      const st = Spicetify.Player.origin && Spicetify.Player.origin._state;
      speed = num(st && st.speed, 1) || 1;
    } catch (e) { /* ignore */ }
    const predicted = C.playing ? C.pos + (t - C.at) * C.speed : C.pos;
    if (hard || !C.valid || playing !== C.playing || Math.abs(p - predicted) > 150) C.pos = p;
    else C.pos = predicted + (p - predicted) * 0.2;
    C.at = t; C.playing = playing; C.speed = speed; C.valid = true; C.syncedAt = t;
  }
  function positionAt(t) {
    const C = S.clock;
    return C.playing ? C.pos + (t - C.at) * C.speed : C.pos;
  }

  // ---- audio analysis (one request per track, failures cached) ----------------
  function ensureAnalysis(uri) {
    if (!uri) return null;
    let e = cache.get(uri), tries = 0;
    if (e) {
      if (e.st === "fail" && now() - e.at > failRetryMs(e)) { tries = (e.tries | 0) + 1; cache.delete(uri); }
      else { cache.delete(uri); cache.set(uri, e); return e; }     // LRU touch
    }
    if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) {             // podcasts, local files, ads
      e = { st: "none", at: now(), a: null };
      cache.set(uri, e);
      trimCache(uri);
      return e;
    }
    e = { st: "pending", at: now(), a: null, tries };
    cache.set(uri, e);
    S.stats.requests++;
    let timer = 0;
    const timeout = new Promise((_, rej) => { timer = setTimeout(rej, ANALYSIS_TIMEOUT_MS, new Error("timeout")); });
    Promise.race([Promise.resolve().then(() => audioData(uri)), timeout])
      .then((d) => {
        e.a = digest(d);
        e.st = e.a ? "ok" : "fail";
        if (!e.a) {                                // final-fix: Spicetify answers an HTTP error as { code, error, message }
          const c = d && typeof d === "object" ? Math.round(Number(d.code)) : 0;
          e.code = c > 0 ? c : 0;
          e.kind = failKind(e.code);
          e.err = e.code ? "http " + e.code : "no segments";
        } else anOkAt = now();
        e.at = now();
        // v5b "Camadas por elemento": their digest runs in its own task, off the frame (the layers fade in when done)
        if (e.a) elAttachDeferred(d, e.a);
      })
      .catch((err) => {
        e.st = "fail";
        e.at = now();
        e.err = String((err && err.message) || err).slice(0, 120);
        e.kind = /timeout/i.test(e.err) ? "timeout" : "net";
      })
      .finally(() => clearTimeout(timer));
    trimCache(uri);
    return e;
  }
  function trimCache(keep) {
    while (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest === keep) break;
      cache.delete(oldest);
    }
  }

  function analysisFor(uri) {
    if (S.test && S.test.fallback) return null;
    const e = uri && cache.get(uri);
    return e && e.st === "ok" ? e.a : null;
  }

  /** Compact typed-array copy of what the renderer needs, plus the bass /
      kick hits. Spotify's analysis has no frequency bands (pitches are chroma
      classes), so "bass" is inferred with a model FITTED ON REAL AUDIO: an
      audio capture recorded what left the system mixer (band envelopes only)
      while a set of test tracks played; the ground truth is
      every PERCEPTUAL bass onset (the < 120 Hz band rising >= 5 dB from its
      local valley, also an 808 re-trigger on a tail), not only the big
      ">= 10 dB from silence" hits. bassHits(): candidates are segment starts
      plus the late loudness peak of segments a hat / clap opened; a logistic
      model on per-track ranks (quiet and loud masters behave the same) and
      +-1.5 s local ranks scores them, and an ABSOLUTE probability gate
      (BASS_GATE) maps them to 0..1, so dense passages are no longer rationed
      to the track's top 20 % of segments. Hits closer than HIT_MERGE_MS fuse.
      Hit times are the onsets (segment.start, measured against the real mixer
      output to ~1 ms); each hit rises in min(loudness_max_time, 30 ms), holds
      one frame and decays with its own LOOK-AHEAD time constant
      (finishHits()): musical (0.36 beat, 120-200 ms, x1.3) when the next hit
      is far, but always down to a clear valley one frame before the next hit,
      so dense 808 runs pulse hit by hit. The "Sincronia" latency is applied at
      lookup. */
  // bass-hit model (see bassHits()): logistic on per-track ranks (centred) of segment features, local ranks (+-1.5 s),
  // grid flags and late-peak candidates. Fitted on recorded ground truth (56 tracks / 106 windows, 7 genres, perceptual
  // bass onsets) and validated leave-one-track-out and leave-one-genre-out (an offline fit); new input: the segment's chroma entropy (pent: flat chroma = drum / noise-like, peaky = a
  // tonal note), also for late candidates. k = ((p - BASS_GATE) / (p1 - BASS_GATE))^0.6: an absolute probability gate,
  // not a per-track "top 20 %" cut, so busy passages are not rationed. BASS_GATE: the held-out precision equals v5a's.
  const BASS_GATE = 0.4142;
  const BASS_MODEL = {
    b: -1.625, p1: 0.75, gamma: 0.6, lateMs: 40, lateLead: 6, lateAttack: 10,   // p1 0.75: real hits keep v5a's strengths
    w: { t2: -2.0559, lmt: -0.8353, t5: -0.4597, t4: -0.7571, t10: 0.2828, pmax2: 0.153, att: 1.2778, t6: 0.7421, t0: 0.9138,
         ctx: -0.0124, lmax: 0.0467, t3: -0.885, pt1: 0.9817, pt2: 0.9416, dlmax: 0.4847, dt2: -0.6397, t1: -1.4509, dur: 0.6635, pent: 0.5388 },
    wGrid: { onBeat: 0.0285, onTat: 0.5739 },
    wLocal: { lr_t2: -0.2156, lr_lmax: 0.1476 },
    wLate: { LATE: -0.7089, t2: -0.5782, lmt: 1.54, att: -1.2301, lmax: 0.3831, lr_t2: 1.069, onBeat: 0.0828, pent: 1.6966 },
  };
  /** average rank (ties share it) of every value, 0..1 */
  function avgRanks(arr) {
    const n = arr.length, s = Float64Array.from(arr).sort(), r = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = arr[i];
      let lo = 0, hi = n;
      while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < x) lo = m + 1; else hi = m; }
      let lo2 = lo, hi2 = n;
      while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; if (s[m] <= x) lo2 = m + 1; else hi2 = m; }
      r[i] = n > 1 ? (lo + (lo2 - lo - 1) / 2) / (n - 1) : 0.5;
    }
    return r;
  }
  /** rank of x[i] among the values whose time is within +-win/2 of t[i] (ties averaged), 0..1 */
  function localRanks(x, t, win) {
    const n = x.length, r = new Float32Array(n);
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      while (a < n && t[a] < t[i] - win / 2) a++;
      while (b < n && t[b] <= t[i] + win / 2) b++;
      const m = b - a;
      if (m < 2) { r[i] = 0.5; continue; }
      let lt = 0, eq = 0;
      for (let j = a; j < b; j++) { if (x[j] < x[i]) lt++; else if (x[j] === x[i]) eq++; }
      r[i] = (lt + 0.5 * (eq - 1)) / (m - 1);
    }
    return r;
  }
  /** distance (ms) from ms to the nearest time of a sorted array (1e9 if empty) */
  function nearestDist(times, ms) {
    const j = nearestIdx(times, ms);
    return j < 0 ? 1e9 : Math.abs(times[j] - ms);
  }
  /** bass hits from the analysis (BASS_MODEL). Candidates: every segment start, plus the loudness peak
      (start + loudness_max_time - 6 ms) of segments that peak late (> 40 ms): the 808 arriving inside a segment a
      hat / clap opened. Features: per-track average ranks of timbre[0..6, 10], loudness_max, its attack, local
      contrast, loudness_max_time, duration, 2nd pitch peak, chroma entropy, the previous segment's timbre[1] / [2] and
      the change from it; ranks within +-1.5 s of timbre[2] and loudness_max (the bass cue weakens in busy mixes); on a beat /
      tatum. Returns the merged hit list (onset ms, strength, attack ms); fills A.kick / A.z (segment-start
      candidates) for the debug sample. */
  function bassHits(segs, d, A) {
    const M = BASS_MODEL, n = segs.length;
    const st = new Float64Array(n), dur = new Float64Array(n), lmtRaw = new Float64Array(n), pmax2 = new Float64Array(n), pent = new Float64Array(n);
    const lmax = new Float64Array(n), att = new Float64Array(n), ctx = new Float64Array(n);   // double precision (no float32 ties)
    const T = []; for (let k = 0; k < 12; k++) T.push(new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const s = segs[i] || {}, tb = Array.isArray(s.timbre) ? s.timbre : [], p = Array.isArray(s.pitches) ? s.pitches : [];
      st[i] = A.start[i] * 1000; dur[i] = num(s.duration, 0.1) * 1000; lmtRaw[i] = num(s.loudness_max_time, 0) * 1000;
      lmax[i] = num(s.loudness_max, -60); att[i] = Math.max(0, lmax[i] - num(s.loudness_start, -60));
      for (let k = 0; k < 12; k++) T[k][i] = num(tb[k], 0);
      let p1 = -1, p2 = -1, ps = 0;
      for (let k = 0; k < 12; k++) { const v = num(p[k], 0); ps += v; if (v > p1) { p2 = p1; p1 = v; } else if (v > p2) p2 = v; }
      pmax2[i] = p2;
      let e = 0;                                     // chroma entropy (nats): ~2.48 = flat (drums, noise) .. low = one clear note
      for (let k = 0; k < 12; k++) { const q = num(p[k], 0) / (ps + 1e-9); e -= q * Math.log(q + 1e-9); }
      pent[i] = e;
    }
    for (let i = 0, j0 = 0, sum = 0; i < n; i++) {   // loudness_max against the mean of the previous 300 ms (= A.ctx)
      while (j0 < i && st[j0] < st[i] - 300) { sum -= lmax[j0]; j0++; }
      const c = i - j0; ctx[i] = c ? lmax[i] - sum / c : att[i]; sum += lmax[i];
    }
    const prev = (a) => Float64Array.from(a, (_, i) => a[i ? i - 1 : 0]);
    const diffPrev = (a) => Float64Array.from(a, (_, i) => a[i] - a[i ? i - 1 : 0]);
    const F = { t0: T[0], t1: T[1], t2: T[2], t3: T[3], t4: T[4], t5: T[5], t6: T[6], t10: T[10], lmt: lmtRaw, att, ctx, lmax, pmax2, pent,
                pt1: prev(T[1]), pt2: prev(T[2]), dlmax: diffPrev(lmax), dt2: diffPrev(T[2]), dur };
    const R = {}; for (const f of Object.keys(M.w)) R[f] = avgRanks(F[f]);
    const LR = { lr_t2: localRanks(T[2], st, 3000), lr_lmax: localRanks(lmax, st, 3000) };
    const beats = A.beatT;
    const tats = Float64Array.from((Array.isArray(d.tatums) ? d.tatums : []).filter((b) => b && isFinite(b.start)), (b) => b.start * 1000);
    const cand = [];
    for (let i = 0; i < n; i++) {
      const lmt = Math.min(lmtRaw[i], dur[i]);
      cand.push({ t: st[i], i, late: 0, lmt, k: 0 });
      if (lmt > M.lateMs) cand.push({ t: st[i] + lmt - M.lateLead, i, late: 1, lmt, k: 0 });
    }
    cand.sort((a, b) => a.t - b.t || a.late - b.late);
    A.z = new Float32Array(n);
    for (const c of cand) {
      const i = c.i, onB = nearestDist(beats, c.t) < 60 ? 1 : 0, onT = nearestDist(tats, c.t) < 40 ? 1 : 0;
      let z = M.b;
      for (const f of Object.keys(M.w)) z += M.w[f] * (R[f][i] - 0.5);
      z += M.wGrid.onBeat * (onB - 0.5) + M.wGrid.onTat * (onT - 0.5);
      for (const f of Object.keys(M.wLocal)) z += M.wLocal[f] * (LR[f][i] - 0.5);
      z += M.wLate.LATE * (c.late - 0.5);
      if (c.late) z += M.wLate.t2 * (R.t2[i] - 0.5) + M.wLate.lmt * (R.lmt[i] - 0.5) + M.wLate.att * (R.att[i] - 0.5) + M.wLate.lmax * (R.lmax[i] - 0.5)
                     + M.wLate.lr_t2 * (LR.lr_t2[i] - 0.5) + M.wLate.onBeat * (onB - 0.5) + M.wLate.pent * (R.pent[i] - 0.5);
      const p = 1 / (1 + Math.exp(-z));
      c.k = Math.pow(clamp((p - BASS_GATE) / (M.p1 - BASS_GATE), 0, 1), M.gamma);
      if (!c.late) { A.kick[i] = c.k; A.z[i] = z; }
    }
    const ht = [], hs = [], ha = [];
    for (const c of cand) {
      if (!(c.k > 0.06)) continue;
      const a = c.late ? M.lateAttack : clamp(c.lmt, KICK_ATTACK_MIN_MS, KICK_ATTACK_MAX_MS);
      const last = ht.length - 1;
      if (last >= 0 && c.t - ht[last] < HIT_MERGE_MS) { if (c.k > hs[last]) { ht[last] = c.t; hs[last] = c.k; ha[last] = a; } }
      else { ht.push(c.t); hs.push(c.k); ha.push(a); }
    }
    return { ht, hs, ha };
  }
  function digest(d) {
    const segs = d && d.segments;
    if (!Array.isArray(segs) || segs.length < 4) return null;
    const n = segs.length;
    const A = {
      n,
      start: new Float64Array(n), dur: new Float32Array(n), l0: new Float32Array(n),
      lmax: new Float32Array(n), lmt: new Float32Array(n), pit: new Float32Array(n * 12),
      bri: new Float32Array(n), t0: new Float32Array(n), t3: new Float32Array(n),
      att: new Float32Array(n), ctx: new Float32Array(n), kick: new Float32Array(n), body: new Float32Array(n), hat: new Float32Array(n),
      lo: -40, hi: 0, briLo: 0, briHi: 1, tempo: 0, seg: 0, decay: 180,
      beatT: null, beatC: null, hitT: null, hitS: null, hitA: null, hitD: null, hatT: null, hatS: null,
    };
    for (let i = 0; i < n; i++) {
      const s = segs[i] || {};
      A.start[i] = num(s.start, i ? A.start[i - 1] : 0);
      A.dur[i] = Math.max(0.001, num(s.duration, 0.1));
      A.l0[i] = num(s.loudness_start, -60);
      A.lmax[i] = num(s.loudness_max, -60);
      A.lmt[i] = clamp(num(s.loudness_max_time, 0), 0, A.dur[i]);
      const p = Array.isArray(s.pitches) ? s.pitches : [];
      for (let k = 0; k < 12; k++) A.pit[i * 12 + k] = clamp(num(p[k], 0), 0, 1);
      const tb = Array.isArray(s.timbre) ? s.timbre : [];
      A.t0[i] = num(tb[0], 0);
      A.bri[i] = num(tb[1], 0);
      A.t3[i] = num(tb[3], 0);
      A.att[i] = Math.max(0, A.lmax[i] - A.l0[i]);
    }
    // local contrast: loudness_max against the mean loudness_max of the previous 300 ms
    for (let i = 0, j0 = 0, sum = 0; i < n; i++) {
      while (j0 < i && A.start[j0] < A.start[i] - 0.3) { sum -= A.lmax[j0]; j0++; }
      const c = i - j0;
      A.ctx[i] = c ? A.lmax[i] - sum / c : A.att[i];
      sum += A.lmax[i];
    }
    const L = sortedOf(A.lmax), B = sortedOf(A.bri), AT = sortedOf(A.att), CT = sortedOf(A.ctx), T0 = sortedOf(A.t0), T3 = sortedOf(A.t3);
    A.hi = pct(L, 0.97) + 0.5;
    A.lo = Math.min(pct(L, 0.10) - 8, A.hi - 14);
    A.briLo = pct(B, 0.08);
    A.briHi = Math.max(A.briLo + 1, pct(B, 0.92));
    const attLo = pct(AT, 0.30), attHi = Math.max(attLo + 2, pct(AT, 0.92));
    const ctxLo = pct(CT, 0.50), ctxHi = Math.max(ctxLo + 1, pct(CT, 0.95));
    const t0Lo = pct(T0, 0.15), t0Hi = Math.max(t0Lo + 1, pct(T0, 0.97));
    const t3Lo = pct(T3, 0.10), t3Hi = Math.max(t3Lo + 1, pct(T3, 0.90));
    const lmLo = pct(L, 0.25), lmHi = Math.max(lmLo + 2, pct(L, 0.97));
    A.tempo = num(d.track && d.track.tempo, 0);
    const beatMs = A.tempo > 40 ? 60000 / A.tempo : 500;
    A.decay = clamp(beatMs * 0.36, 120, 200);       // musical decay: ~170 ms at 120 BPM

    const beats = Array.isArray(d.beats) ? d.beats.filter((b) => b && isFinite(b.start)) : [];
    A.beatT = new Float64Array(beats.map((b) => b.start * 1000));
    A.beatC = new Float32Array(beats.map((b) => clamp(num(b.confidence, 0), 0, 1)));
    // v5 "Balanço no ritmo": the downbeats = the beats a bar (bars[]) starts on
    const barList = Array.isArray(d.bars) ? d.bars.filter((b) => b && isFinite(b.start)) : [];
    A.barT = new Float64Array(barList.map((b) => b.start * 1000));
    A.beatDown = new Uint8Array(A.beatT.length);
    for (let k = 0; k < A.barT.length; k++) {
      const j = nearestIdx(A.beatT, A.barT[k]);
      if (j < 0) continue;
      const per = j + 1 < A.beatT.length ? A.beatT[j + 1] - A.beatT[j] : j > 0 ? A.beatT[j] - A.beatT[j - 1] : 500;
      if (Math.abs(A.beatT[j] - A.barT[k]) <= GROOVE_DOWN_WIN * per) A.beatDown[j] = 1;
    }

    const rawHat = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const loud = 0.5 * n01(A.lmax[i], lmLo, lmHi) + 0.5 * n01(A.t0[i], t0Lo, t0Hi);
      const bright = n01(A.bri[i], A.briLo, A.briHi), dark = 1 - bright;
      const sharp = 0.5 * (1 - clamp((A.lmt[i] * 1000 - 12) / 110, 0, 1)) + 0.5 * n01(A.t3[i], t3Lo, t3Hi);
      const aN = Math.max(n01(A.att[i], attLo, attHi), 0.9 * n01(A.ctx[i], ctxLo, ctxHi));
      rawHat[i] = Math.pow(aN, 0.7) * (0.3 + 0.7 * loud) * Math.pow(bright, 1.5) * (0.4 + 0.6 * sharp);   // bright transients
      A.body[i] = loud * loud * (0.2 + 0.8 * dark);
    }
    // bright transients ("hats"): per track p50 -> 0, p96 -> 1
    const RH = sortedOf(rawHat);
    const hLo = pct(RH, 0.5), hHi = Math.max(hLo + 1e-3, pct(RH, 0.96));
    const tt = [], ts = [];
    for (let i = 0; i < n; i++) {
      const h = n01(rawHat[i], hLo, hHi);
      A.hat[i] = h;
      if (h > 0.1) { tt.push(A.start[i] * 1000); ts.push(h); }
    }
    // "Graves" hits (the model, BASS_MODEL): 808s, kicks, bass attacks
    const H = bassHits(segs, d, A);
    A.mHitT = Float64Array.from(H.ht); A.mHitS = Float32Array.from(H.hs); A.mHitA = Float32Array.from(H.ha);
    A.hatT = Float64Array.from(tt); A.hatS = Float32Array.from(ts);
    beatPulse(A, d);
    drumsDigest(A, d);                              // v6: drums present (gates every beat-driven motion)
    A.hitMode = "";
    buildHits(A, rhythmMode());
    return A;
  }

  /** "Cada batida" (four on the floor: trance, house, techno). The model above
      was fitted on 808 / trap ground truth; in dense electronic mixes Spotify's
      segments often do not even mark the kicks (a supersaw drop is one long
      segment), so the kick on every beat would mostly be missed (measured: on
      12 test trance tracks only 0-27% of the beats carried a strong
      hit). The beat grid is the reliable kick clock there. For every beat:
      - its onset: the most kick-like segment starting in [beat - 90, beat + 25]
        ms (Spotify's beat times sit ~6-45 ms after the sound starts), else
        the beat minus this track's median beat -> onset lead;
      - "punch": max(model rank, 0.85 x attack rank) of that onset; >= 0.6 is
        a kick-like onset;
      - steadiness: the share of kick-like onsets over +-6 beats (or 0.92 x
        over +-16 beats, so a drop where the segments lose the kicks stays a
        drop): a run of kicks, not a chord change on the bar. Measured with
        the recorded ground truth of a trance test track: 26 of 28 drop beats get >= 0.5 in
        "Automático" (7 of 28 with the model alone), the breakdown 4 of 17;
      - the section's loudness (quieter sections pulse a little softer).
      A.four is how much this track looks like four on the floor: Spotify's
      tempo confidence is high and its beat confidence low on steady electronic
      tracks, the other way round on trap / funk (12 trance tracks: tc - bc
      0.03..0.56, 11 of them > 0.15; 17 rap / trap / funk: -0.66..0.19, 16 of
      them < 0.1), within 105-165 BPM. "Automático" blends by A.four; the
      panel can force "Cada batida" or "Graves". */
  const PUNCH_ATT = 0.85, SOFT_BEAT = 0.22;        // attack weight in the kick evidence; soft tick outside kick runs
  const OFF_Z = 0.6, OFF_K = 0.5, OFF_MIN = 0.25;  // v5b-r2: the off-beat bass tick of a kick run (beatPulse)
  /** v5b-r3: the TICK GATE. Of the r2 tick candidates (a rank >= OFF_Z onset near a kick run's midpoint) only half sat on
      a real bass onset (reference set +-40 ms: trance .49, house .33; on one test track the bass came a 16th later). A
      linear probability (logistic, lambda 1) on 7 features of the candidate segment: [model rank zR, timbre t1 / t2 / t3,
      onset - midpoint (ms), attack (loudness_max - loudness_start, dB), attack rank]; a tick needs p >= thr. Fit on the 538
      trance / house candidates of the reference sets (an offline fit). Leave one track out at 0.6:
      trance 138 of 449 kept, precision .49 -> .75; house 24 of 89, .33 -> .58. (A gate on the run's share of strong
      midpoints, as the kick clock counts them, did not separate them: P .45-.55 at every setting.) */
  const TICK_MODEL = {
    mu: [0.7304, 42.7633, -32.3093, 0.5972, -16.789, 8.6418, 0.648],
    sd: [0.0894, 57.7475, 33.2484, 31.4048, 13.3981, 4.5196, 0.2279],
    w: [-0.0313, 0.5842, -0.5332, -0.2573, 0.4272, 0.4766, 1.1822, -0.9131],
    thr: 0.6,
  };
  // v5b-r3: the VISUAL size of a hit, applied after the renderers' saturation (at 200-500 % every hit >= ~0.15 saturates,
  // so the strength alone no longer told a tick from a kick): an off-beat tick OFF_VIS, a beat-grid soft tick (no kick-like
  // onset, outside a steady run) down to SOFT_VIS; a real bass-model kick (merged strength >= HIT_REAL) always 1
  const OFF_VIS = 0.5, SOFT_VIS = 0.3, HIT_REAL = 0.45;
  /** v5b: the KICK CLOCK. On four-on-the-floor tracks Spotify's beat grid is often half a beat off the kick: it
      locked on the offbeat open hats (recorded ground truth, 6-band kick signature: 10 of 24 trance / house windows with a
      clear kick phase, e.g. "Land Of Freedom", "Attraction", "Silence", "It Feels So Good"; the analysis' own
      kick-like segments sit at phase ~0.47 of Spotify's beats there). Then "Cada batida", Automático's beat hits and
      "Balanço no ritmo" pulsed on the hats, between the kicks. Evidence, per beat and per midpoint between beats:
      is the most kick-like onset in [t - 90, t + 25] ms (as below) a strong bass-model one (rank >= KICK_PH_Z)?
      Over +-KICK_PH_W beats, log((midpoints + 1) / (beats + 1)) > KICK_PH_THR (+-KICK_PH_HYST hysteresis) moves
      the kick clock to the midpoints there (Spotify can also flip phase between sections). Only when A.four >=
      KICK_PH_FOUR: outside four on the floor (trap 808s, a snare backbeat) Spotify's grid stays. Held-out (leave
      one track out, 56 GT tracks, 41 windows with a clear kick phase): kick clock on the real kick 0.71 -> 0.93 of
      beats; "Cada batida" onsets on the true kick 0.55 -> 0.84; groove lock on the kicks +0.25 -> +0.82 (wrong
      half-beat 35 % -> 6 %). Fills A.kShift (1 = midpoint). */
  const KICK_PH_Z = 0.8, KICK_PH_W = 48, KICK_PH_THR = 0.3, KICK_PH_HYST = 0.05, KICK_PH_FOUR = 0.5;
  const KICK_PH_MIN = 16;   // v5b-r2: the shortest phase run (beats). (Holding the phase while the window has few strong
  // onsets was tried too: it cost 0.5-1 pt of the labelled kick clock, so it is not used.)
  function kickClock(A, zR, aR) {
    const B = A.beatT, nb = B.length, n = A.n;
    A.kShift = new Uint8Array(nb);
    if (nb < 8 || !(A.four >= KICK_PH_FOUR)) return B;
    const M = new Float64Array(nb);
    for (let j = 0; j < nb; j++) M[j] = j + 1 < nb ? (B[j] + B[j + 1]) / 2 : B[j] + (B[j] - B[j - 1]) / 2;
    const strong = (T) => {                         // running count of grid points carrying a strong kick-like onset
      const c = new Float64Array(nb + 1);
      let i0 = 0;
      for (let j = 0; j < nb; j++) {
        const t = T[j];
        while (i0 < n && A.start[i0] * 1000 < t - 90) i0++;
        let best = -1, ba = -Infinity;
        for (let i = i0; i < n && A.start[i] * 1000 <= t + 25; i++) { const v = zR[i] + 0.15 * aR[i]; if (v > ba) { ba = v; best = i; } }
        c[j + 1] = c[j] + (best >= 0 && zR[best] >= KICK_PH_Z ? 1 : 0);
      }
      return c;
    };
    const c0 = strong(B), c5 = strong(M), K = new Float64Array(B), S = A.kShift;
    let state = 0;
    for (let j = 0; j < nb; j++) {
      const a = Math.max(0, j - KICK_PH_W), b = Math.min(nb, j + KICK_PH_W + 1);
      const lr = Math.log((c5[b] - c5[a] + 1) / (c0[b] - c0[a] + 1));
      if (!state && lr > KICK_PH_THR + KICK_PH_HYST) state = 1;
      else if (state && lr < KICK_PH_THR - KICK_PH_HYST) state = 0;
      S[j] = state;
    }
    // v5b-r2: every switch puts one 0.5- or 1.5-beat interval into the clock; runs shorter than KICK_PH_MIN beats take
    // their neighbours' phase (v5b: 12 of 75 switches came within 8 beats of the previous one, 2-beat islands)
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (let i = 0; i < nb; ) {
        let k = i;
        while (k < nb && S[k] === S[i]) k++;
        if (k - i < KICK_PH_MIN && (i > 0 || k < nb)) { const v = i > 0 ? S[i - 1] : S[k]; for (let q = i; q < k; q++) S[q] = v; changed = true; }
        i = k;
      }
      if (!changed) break;
    }
    for (let j = 0; j < nb; j++) if (S[j]) K[j] = M[j];
    return K;
  }
  function beatPulse(A, d) {
    const nb = A.beatT.length, n = A.n;
    A.bOn = new Float64Array(nb); A.bAuto = new Float32Array(nb); A.bForce = new Float32Array(nb); A.bAtt = new Float32Array(nb);
    A.bSteady = new Float32Array(nb); A.four = 0; A.beatLead = 35; A.kT = A.beatT; A.kShift = new Uint8Array(nb);
    if (nb < 8) return;
    const rank = (arr) => avgRanks(arr);
    const aR = rank(A.att), cR = rank(A.ctx), zR = rank(A.z);
    const tc = num(d.track && d.track.tempo_confidence, 0), bc = median(A.beatC), bpm = A.tempo;
    const tempoGate = smooth(n01(bpm, 100, 110)) * (1 - smooth(n01(bpm, 160, 170)));
    A.four = +(smooth(n01(tc - bc, 0.05, 0.25)) * tempoGate).toFixed(3);
    const B = (A.kT = kickClock(A, zR, aR));       // v5b: the beats the kick pulse / groove follow
    const on = new Int32Array(nb).fill(-1), punch = new Float32Array(nb), lead = [];
    let i0 = 0;
    for (let j = 0; j < nb; j++) {
      const b = B[j];
      while (i0 < n && A.start[i0] * 1000 < b - 90) i0++;
      let best = -1, ba = -Infinity;            // the most kick-like onset (model rank) near the beat
      for (let i = i0; i < n && A.start[i] * 1000 <= b + 25; i++) { const v = zR[i] + 0.15 * aR[i]; if (v > ba) { ba = v; best = i; } }
      on[j] = best;
      if (best >= 0) { punch[j] = Math.max(zR[best], PUNCH_ATT * aR[best]); lead.push(b - A.start[best] * 1000); }
    }
    A.beatLead = lead.length >= 8 ? clamp(median(lead), 0, 60) : 35;
    // sections: loudness relative to the loudest / quietest one
    const secs = Array.isArray(d.sections) ? d.sections.filter((s) => s && isFinite(s.start) && isFinite(s.loudness)) : [];
    let sLo = Infinity, sHi = -Infinity;
    for (const s of secs) { sLo = Math.min(sLo, s.loudness); sHi = Math.max(sHi, s.loudness); }
    const secLoud = (t) => {
      if (!secs.length || sHi - sLo < 0.5) return 1;
      let L = secs[0].loudness;
      for (const s of secs) { if (s.start * 1000 <= t) L = s.loudness; else break; }
      return clamp((L - sLo) / Math.max(3, sHi - sLo), 0, 1);
    };
    const cnt = new Uint8Array(nb);
    for (let j = 0; j < nb; j++) cnt[j] = on[j] >= 0 && punch[j] >= 0.6 ? 1 : 0;   // a kick-like onset on this beat
    const cum = new Float32Array(nb + 1);
    for (let j = 0; j < nb; j++) cum[j + 1] = cum[j] + cnt[j];
    const share = (j, w) => { const a = Math.max(0, j - w), b = Math.min(nb, j + w + 1); return (cum[b] - cum[a]) / (b - a); };
    for (let j = 0; j < nb; j++) {
      // a run of kicks: +-6 beats, or +-16 (4 bars) so a stretch where the
      // segments lose the kicks does not drop out of a drop
      const F = Math.max(share(j, 6), 0.92 * share(j, 16));
      const steady = smooth(n01(F, 0.28, 0.55)), lf = secLoud(B[j]);
      const i = on[j], p = i >= 0 ? punch[j] : 0;
      A.bOn[j] = i >= 0 ? A.start[i] * 1000 : B[j] - A.beatLead;
      A.bAtt[j] = i >= 0 ? clamp(A.lmt[i] * 1000, KICK_ATTACK_MIN_MS, KICK_ATTACK_MAX_MS) : 18;
      A.bSteady[j] = steady;
      (A.bF || (A.bF = new Float32Array(nb)))[j] = F;
      // inside a run of kicks a beat without its own onset still has its kick
      // (dense drops: Spotify's segments miss them, the recorded audio shows them)
      const body = cnt[j] ? 0.8 + 0.2 * p : 0.66 + 0.1 * p;
      // outside a run of kicks (a breakdown) the beat still ticks softly
      A.bAuto[j] = A.four * (steady * body + (1 - steady) * SOFT_BEAT) * (0.8 + 0.2 * lf);
      A.bForce[j] = (cnt[j] ? 0.8 + 0.2 * p : 0.55 + 0.25 * steady) * (0.6 + 0.4 * lf);
    }
    // v5b-r2: the OFF-BEAT BASS of a rolling trance / house drop. With the kick clock on the kick, the bass notes between
    // the kicks lost their pulse (reference trance off-beat onset recall .33 -> .08; v4 / v5a pulsed on them because Spotify's
    // grid sat there). Between two beats of a kick run, a bass-like onset (model rank >= OFF_Z) near the midpoint adds a
    // secondary grid hit, OFF_K x the beat's strength (at least OFF_MIN): the kick stays the bigger pulse.
    A.oOn = new Float64Array(nb); A.oS = new Float32Array(nb); A.oAtt = new Float32Array(nb);
    if (A.four > 0) {
      const segs = Array.isArray(d.segments) ? d.segments : [], TM = TICK_MODEL;
      let i1 = 0;
      for (let j = 0; j + 1 < nb; j++) {
        if (A.bSteady[j] < 0.5 || A.bSteady[j + 1] < 0.5) continue;
        const m = (B[j] + B[j + 1]) / 2;
        while (i1 < n && A.start[i1] * 1000 < m - 90) i1++;
        let best = -1, ba = -Infinity;
        for (let i = i1; i < n && A.start[i] * 1000 <= m + 25; i++) { const v = zR[i] + 0.15 * aR[i]; if (v > ba) { ba = v; best = i; } }
        if (best < 0 || zR[best] < OFF_Z) continue;
        // v5b-r3: the tick gate (TICK_MODEL)
        const sg = segs[best] || {}, tv = Array.isArray(sg.timbre) ? sg.timbre : [];
        const x = [zR[best], num(tv[1], 0), num(tv[2], 0), num(tv[3], 0), A.start[best] * 1000 - m,
          num(sg.loudness_max, -60) - num(sg.loudness_start, -60), aR[best]];
        let z = TM.w[0];
        for (let q = 0; q < 7; q++) z += TM.w[q + 1] * (x[q] - TM.mu[q]) / TM.sd[q];
        if (1 / (1 + Math.exp(-z)) < TM.thr) continue;
        A.oOn[j] = A.start[best] * 1000;
        A.oS[j] = Math.max(OFF_MIN, OFF_K * A.bAuto[j] / Math.max(1e-6, A.four)) * (0.75 + 0.25 * zR[best]);
        A.oAtt[j] = clamp(A.lmt[best] * 1000, KICK_ATTACK_MIN_MS, KICK_ATTACK_MAX_MS);
      }
    }
    // v5b-r3: per beat, how far its grid hit is a real kick for the visual (1 = a kick-like onset on it or a steady
    // kick run; SOFT_VIS = the soft tick of a breakdown / an intro). buildHits turns it into the hit's visual scale
    A.bVis = new Float32Array(nb);
    for (let j = 0; j < nb; j++) A.bVis[j] = cnt[j] ? 1 : SOFT_VIS + (1 - SOFT_VIS) * smooth(n01(A.bSteady[j], 0.25, 0.75));
  }
  /** v6 "tem bateria?" (user: "tem partes da música em que não tem batida nenhuma e fica só voz. E mesmo assim, os volumes
      ficam pulsando"). Every beat-driven motion (the hit list: kicks, grid ticks and off-beat ticks; the "Balanço no ritmo"
      groove / sway; the v5 hat envelope; the Grave sidechain (it follows the hits); the snare snaps; the hat ticks; the dots'
      beat steps) is scaled by drumsAt(A, t), 0..1, computed once per track from the analysis only:
      - a logistic model (DRUM_MODEL) every 50 ms on +-1 / +-2 s windows: the bass model's hit strength and its strong
        hits, the segment rate, kick-like (A.kick >= 0.3) and sharp (attack >= 6 dB) segments that repeat at +-1 / 2 / 4
        beats, the kick-run share (bF), the time to the loudness peak and the sub / bass band rows (EL_BAND). Fitted on the
        93 recorded ground-truth windows (43 tracks, 7 genres: beat-periodic percussive transients in < 150 Hz, 2-6 kHz,
        > 6 kHz; an offline fit); held out (leave one track / genre out) frame AUC .96;
      - since the whole analysis is known in advance: hysteresis (on >= DRUM_ON, stays on while >= DRUM_OFF), OFF gaps
        under DRUM_OFF_MIN bars bridged (a fill, a one-bar break), ON islands under DRUM_ON_MIN bars dropped (a vocal burst);
      - each drum run opens DRUM_LEAD_MS before its first bass-model hit (>= DRUM_HIT_MIN) or strong beat onset (A.bAuto >=
        DRUM_GRID_START), up to 1 bar before the run, so
        the first kick back lands in full, and fades out (cosine) over DRUM_FADE_BARS bar from its last hit.
      A.drS / A.drE / A.drF: run starts, last hits, fade lengths (ms). No analysis: 1 (unknown music), 0 for podcasts. */
  const DRUM_MODEL = { names: ["mk2000", "mk5_2000", "segRate", "perK_2000", "bF", "att6_2000", "per6_2000", "lmt", "lv_sub", "lv_bass"],
    mu: [0.687316, 0.708997, 4.2893, 0.477913, 0.557011, 2.66031, 1.79091, 56.3574, -8.9414, -6.40408],
    sd: [0.621206, 0.695458, 1.30652, 0.728999, 0.255723, 1.65121, 1.5902, 28.9711, 8.59788, 6.40413],
    b: 6.41709, w: [6.81459, -3.86773, 1.03893, 1.50701, 0.033146, -0.268633, 2.00386, -0.551745, -0.067478, 1.10664] };
  const DRUM_HOP = 50, DRUM_ON = 0.5, DRUM_OFF = 0.3, DRUM_OFF_MIN = 1, DRUM_ON_MIN = 2;   // bars
  const DRUM_LEAD_BARS = 3, DRUM_END_BARS = 0.5, DRUM_HIT_MIN = 0.15, DRUM_FADE_BARS = 1, DRUM_LEAD_MS = 40, DRUM_PER_TOL = 25;
  // a bass-model hit this strong is its own evidence (an impact, a lone kick in a breakdown): it lands whatever the gate
  // says (one pulse, not a pulsing pattern). On the reference drumless passages the only one sits on a real sub transient; the
  // 10 weaker model hits there (0.06-0.8) sit on none and stay gated
  const DRUM_SOLO = 0.8;
  const DRUM_GRID_START = 0.45;   // a beat onset this strong (A.bAuto) may open a run (held out: strong-hit keep .9925 -> .9941, drumless unchanged)
  /** sum of v[i] over the sorted times T within +-w of every grid point (two pointers); v null = count */
  function drWin(T, v, N, w) {
    const out = new Float64Array(N), n = T.length;
    let a = 0, b = 0, s = 0;
    for (let i = 0; i < N; i++) {
      const t = i * DRUM_HOP;
      while (b < n && T[b] <= t + w) { s += v ? v[b] : 1; b++; }
      while (a < b && T[a] < t - w) { s -= v ? v[a] : 1; a++; }
      out[i] = s;
    }
    return out;
  }
  /** an interpolated length (ms) at t from sorted starts S (their gaps at the midpoints; numpy interp clamps), or dflt */
  function drLenAt(S, dflt) {
    if (!S || S.length < 3) return () => dflt;
    const n = S.length - 1, mid = new Float64Array(n), d = new Float64Array(n);
    for (let i = 0; i < n; i++) { mid[i] = (S[i] + S[i + 1]) / 2; d[i] = S[i + 1] - S[i]; }
    return (t) => {
      if (t <= mid[0]) return d[0];
      if (t >= mid[n - 1]) return d[n - 1];
      const j = lastAtOrBefore(mid, t);
      return d[j] + (d[j + 1] - d[j]) * (t - mid[j]) / (mid[j + 1] - mid[j]);
    };
  }
  /** 1 for the segment starts T[i] (ok) that have >= 2 other ok starts at +-1, 2 or 4 beats (+-DRUM_PER_TOL ms) */
  function drPeriodic(st, ok, beat) {
    const T = [];
    for (let i = 0; i < st.length; i++) if (ok(i)) T.push(st[i]);
    const out = new Float64Array(T.length);
    if (T.length < 3) return { T: Float64Array.from(T), v: out };
    for (let i = 0; i < T.length; i++) {
      const x = T[i], L = beat(x);
      let c = 0;
      for (const m of [1, 2, 4]) for (const sg of [-1, 1]) {
        const y = x + sg * m * L, j = elLB(T, y);
        if ((j < T.length && Math.abs(T[j] - y) <= DRUM_PER_TOL) || (j > 0 && Math.abs(T[j - 1] - y) <= DRUM_PER_TOL)) c++;
      }
      out[i] = c >= 2 ? 1 : 0;
    }
    return { T: Float64Array.from(T), v: out };
  }
  /** the per-track drum runs (digest(), after beatPulse) */
  function drumsDigest(A, d) {
    A.drS = A.drE = A.drF = null;
    if (A.n < 16) return;                           // a degenerate analysis: unknown, the beat stays (drumsAt -> 1)
    const n = A.n, segs = d.segments, dur = num(d.track && d.track.duration, 0) * 1000 || (A.start[n - 1] + A.dur[n - 1]) * 1000;
    const N = Math.max(1, Math.ceil(dur / DRUM_HOP)), st = new Float64Array(n), du = new Float64Array(n);
    for (let i = 0; i < n; i++) { st[i] = A.start[i] * 1000; du[i] = A.dur[i] * 1000; }
    const beatLen = drLenAt(A.beatT, 60000 / Math.max(60, A.tempo || 120));
    const mk = drWin(A.mHitT, A.mHitS, N, 2000), mk5 = drWin(A.mHitT, Float64Array.from(A.mHitS, (x) => (x >= 0.5 ? 1 : 0)), N, 2000);
    const seg1 = drWin(st, null, N, 1000);
    const pk = drPeriodic(st, (i) => A.kick[i] >= 0.3, beatLen), p6 = drPeriodic(st, (i) => A.att[i] >= 6, beatLen);
    const perK = drWin(pk.T, pk.v, N, 2000), per6 = drWin(p6.T, p6.v, N, 2000);
    const att6 = drWin(st, Float64Array.from(A.att, (x) => (x >= 6 ? 1 : 0)), N, 2000);
    const lmtW = drWin(st, Float64Array.from(st, (_, i) => Math.min(A.lmt[i] * 1000, 200) * du[i]), N, 1000), duW = drWin(st, du, N, 1000);
    // the sub / bass band rows (EL_BAND, as elDigest2), power-mean over +-1 s against the track's p95
    const LV = [new Float64Array(n), new Float64Array(n)], X = new Float64Array(17);
    for (let i = 0; i < n; i++) {
      const sg = segs[i] || {}, tv = Array.isArray(sg.timbre) ? sg.timbre : [];
      const dms = num(sg.duration, 0) * 1000, lm = num(sg.loudness_max, -60), l0 = num(sg.loudness_start, -60), d1 = Math.max(dms, 1);
      for (let j = 0; j < 12; j++) X[j] = num(tv[j], 0);
      X[12] = lm; X[13] = l0; X[14] = Math.max(0, lm - l0); X[15] = Math.log(d1); X[16] = clamp(num(sg.loudness_max_time, 0) * 1000 / d1, 0, 1);
      ["sub", "bass"].forEach((b, k) => {
        const w = EL_BAND.W[b];
        let s = w[0];
        for (let j = 0; j < 17; j++) s += w[j + 1] * (X[j] - EL_BAND.mu[j]) / EL_BAND.sd[j];
        LV[k][i] = X[12] + s;
      });
    }
    const lv = LV.map((L) => {
      const p95 = elPct(L, 0.95), pw = drWin(st, Float64Array.from(L, (x, i) => Math.pow(10, (x - p95) / 10) * du[i]), N, 1000);
      return Float64Array.from(pw, (x, i) => 10 * Math.log10(x / Math.max(1, duW[i]) + 1e-6));
    });
    const B = A.beatT, nb = B ? B.length : 0, bF = new Float64Array(N);
    for (let i = 0, j = 0; i < N; i++) {             // the kick-run share of the first beat at or after t
      while (j < nb && B[j] < i * DRUM_HOP) j++;
      bF[i] = nb && A.bF ? A.bF[Math.min(nb - 1, j)] : 0;
    }
    const lmtF = Float64Array.from(lmtW, (x, i) => x / (duW[i] + 1e-6));
    const C = { mk2000: [mk, 1 / 4], mk5_2000: [mk5, 1 / 4], segRate: [seg1, 1 / 2], perK_2000: [perK, 1 / 4], bF: [bF, 1], att6_2000: [att6, 1 / 4],
      per6_2000: [per6, 1 / 4], lmt: [lmtF, 1], lv_sub: [lv[0], 1], lv_bass: [lv[1], 1] };
    const z = new Float64Array(N).fill(DRUM_MODEL.b);
    for (let k = 0; k < DRUM_MODEL.names.length; k++) {
      const [col, sc] = C[DRUM_MODEL.names[k]], c = DRUM_MODEL.w[k] / DRUM_MODEL.sd[k], m = DRUM_MODEL.mu[k];
      for (let i = 0; i < N; i++) z[i] += c * (col[i] * sc - m);
    }
    for (let i = 0; i < N; i++) z[i] = 1 / (1 + Math.exp(-z[i]));
    const p = z, on = new Uint8Array(N), barLen = drLenAt(elStarts(d.bars), 4 * 60000 / Math.max(60, A.tempo || 120));
    for (let i = 0, s = 0; i < N; i++) { s = p[i] >= (s ? DRUM_OFF : DRUM_ON) ? 1 : 0; on[i] = s; }
    const runs = (v) => { const r = []; for (let i = 0; i < N; ) { if (on[i] === v) { let j = i; while (j < N && on[j] === v) j++; r.push([i, j]); i = j; } else i++; } return r; };
    for (const [a, b] of runs(0)) if (a > 0 && b < N && (b - a) * DRUM_HOP < DRUM_OFF_MIN * barLen(a * DRUM_HOP)) on.fill(1, a, b);
    for (const [a, b] of runs(1)) if ((b - a) * DRUM_HOP < DRUM_ON_MIN * barLen(a * DRUM_HOP)) on.fill(0, a, b);
    const S = [], E = [], FL = [], H = [];
    for (let i = 0; i < A.mHitT.length; i++) if (A.mHitS[i] >= DRUM_HIT_MIN) H.push(A.mHitT[i]);
    // a run may also START on a strong "Automático" beat onset (a drop whose first kicks the bass model misses)
    const H0 = H.slice();
    if (A.bAuto) for (let j = 0; j < A.bAuto.length; j++) if (A.bAuto[j] >= DRUM_GRID_START) H0.push(A.bOn[j]);
    H0.sort((x, y) => x - y);
    for (const [a, b] of runs(1)) {
      const t0 = a * DRUM_HOP, t1 = (b - 1) * DRUM_HOP + DRUM_HOP, B0 = barLen(t0), B1 = barLen((b - 1) * DRUM_HOP);
      let k = elLB(H0, t0 - DRUM_LEAD_BARS * B0);
      const s = (k < H0.length && H0[k] <= t0 + 0.5 * B0 ? H0[k] : t0) - DRUM_LEAD_MS;
      k = lastAtOrBefore(H, t1 + DRUM_END_BARS * B1);
      const e = k >= 0 && H[k] >= t1 - B1 ? H[k] : t1;
      S.push(s); E.push(e); FL.push(DRUM_FADE_BARS * B1);
    }
    A.drS = Float64Array.from(S); A.drE = Float64Array.from(E); A.drF = Float64Array.from(FL);
  }
  /** 0..1: drums present at analysis time t (ms) */
  function drumsAt(A, t) {
    if (!A || !A.drS) return 1;
    const k = lastAtOrBefore(A.drS, t);
    if (k < 0) return 0;
    if (t <= A.drE[k]) return 1;
    const x = (t - A.drE[k]) / A.drF[k];
    return x >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * x);
  }
  /** no analysis: no procedural beat. v6-r2 removed it while the analysis is on its way; v6-r3: also for a failed analysis,
      a local file or an ad (its 120 BPM grid has nothing to do with the song: it pulsed over voice-only parts, and the
      "no segments" retry 4 s after a failure cut it off in one frame). Only nothing playing (the panel's demo preview)
      or a test fallback keeps it; the rest of the visual still breathes (slow energy / colour, the layers' levels) */
  const drumsFallback = (item) => {
    if (!item) return 1;
    const uri = String(item.uri || "");
    if (/^spotify:(episode|show|audiobook|chapter):/.test(uri)) return 0;
    const e = cache.get(uri);
    return e && e.st === "ok" ? 1 : 0;
  };
  /** final-build: 1 when the music playing gets the "modo ambiente suave": no usable analysis (failed, a local file, an ad,
      a podcast, or a request still pending after SOFT_PEND_MS / a retry); 0 for nothing playing (the panel's demo keeps its
      procedural beat), a test fallback, or a fresh track change whose analysis is on its way */
  function softTarget(item) {
    if (!item || (S.test && S.test.fallback)) return 0;
    const uri = String(item.uri || "");
    if (/^spotify:(episode|show|audiobook|chapter):/.test(uri)) return 1;
    const e = cache.get(uri);
    if (!e || e.st === "ok") return 0;
    if (e.st === "pending") return (e.tries | 0) > 0 || now() - e.at > SOFT_PEND_MS ? 1 : 0;
    return 1;
  }
  /** final-fix: the soft mode's note for the item now ("" = none yet). A local file / an ad / a podcast: at once; a failed
      request: only once a retry has failed too (tries >= 1: Spotify's passing empty answers, ~1 in 15 track changes, come
      back on the 4 s retry; final-build showed the note on them for 6.5 s); a pending request: nothing is known yet. A login /
      network / server failure does not say the track has no analysis */
  function softNoteText(item) {
    if (!item) return "";
    const uri = String(item.uri || "");
    if (/^spotify:(episode|show|audiobook|chapter):/.test(uri)) return tr(SOFT_NOTE);
    const e = cache.get(uri);
    if (!e) return "";
    if (e.st === "none") return tr(SOFT_NOTE);
    if (e.st !== "fail" || (e.tries | 0) < 1) return "";
    return e.kind === "missing" || e.kind === "empty" || !e.kind ? tr(SOFT_NOTE) : tr(SOFT_NOTE_NA);
  }
  /** smooth noise in -1..1: three incommensurate sines (a, b, c in Hz) */
  const softN = (t, a, b, c, p) => 0.5 * Math.sin(TAU * a * t + p) + 0.3 * Math.sin(TAU * b * t + 1.7 * p + 0.9) + 0.2 * Math.sin(TAU * c * t + 2.3 * p + 2.1);
  /** final-build: the soft mode's slow drives at its own clock Z.sT (ms): energy / body / brightness; the chroma (two bumps
      that turn slowly round the 12 classes, so the crown's shape flows from the top to the bottom and the bars' texture
      drifts); the layers (low / mid / air); the halo colour (within the chosen two colours); the glint's angle; the crown's
      own sway; the camera's breath. Everything under 0.4 Hz and unrelated to any beat grid */
  function softGen(Z) {
    const g = Z.sg || (Z.sg = { P12: new Float32Array(12) }), t = num(Z.sT, 0) / 1000, tf = t * SOFT_FS;
    g.energy = SOFT_EN[0] + SOFT_EN[1] * softN(tf, 0.07, 0.17, 0.31, 0.3);
    g.body = 0.45 + 0.1 * softN(tf, 0.05, 0.12, 0.19, 1.1);
    g.bright = 0.5 + 0.25 * softN(t, 0.03, 0.07, 0.13, 2.0);
    const f1 = TAU * SOFT_PR * t, f2 = TAU * 1.6 * SOFT_PR * t + 1.3;
    for (let j = 0; j < 12; j++) g.P12[j] = clamp(0.5 + 0.32 * Math.cos((TAU * j) / 12 - f1) + 0.18 * Math.cos((2 * TAU * j) / 12 + f2), 0, 1);
    g.nLow = softN(tf, 0.09, 0.21, 0.37, 0.7); g.nMid = softN(tf, 0.11, 0.24, 0.43, 1.9); g.nAir = softN(tf, 0.13, 0.29, 0.49, 2.8);
    g.low = SOFT_LOW[0] + SOFT_LOW[1] * g.nLow;
    g.mid = SOFT_MID[0] + SOFT_MID[1] * g.nMid;
    g.air = SOFT_AIR[0] + SOFT_AIR[1] * g.nAir;
    g.harm = 0.5 - 0.5 * Math.cos(TAU * 0.018 * t + 0.8);
    g.gAng = -Math.PI / 2 + TAU * 0.025 * t;
    g.sway = softN(t, 0.022, 0.05, 0.09, 0.4);
    g.cam = 0.5 + 0.5 * softN(t, 0.03, 0.07, 0.11, 1.4);
    return g;
  }
  /** v5 "Balanço no ritmo": where the beat grid is at analysis time pA (ms). With beats[] (2 or more): the phase
      inside the current beat, (t - beat_i) / (beat_i+1 - beat_i), so tempo changes are followed; before the first /
      after the last beat the nearest interval goes on. Without beats: a steady grid at the tempo (bpm; the procedural
      fallback's own grid, so the groove and its kicks agree). The grid is shifted to where a hit on the beat PEAKS:
      the beat's sound starts A.beatLead before Spotify's beat time and peaks GROOVE_PEAK_LAG_MS later. Fills o:
      pos (beats, continuous), ph (0..1 inside the beat), ms (beat length), acc0 / acc1 (1, or 1 + GROOVE_DOWN when the
      current / next beat is a downbeat). */
  function grooveAt(A, pA, bpm, o) {
    const B = A && (A.kT || A.beatT), nb = B ? B.length : 0;   // v5b: the kick clock (beats, or their midpoints)
    let x, per;
    if (nb >= 2) {
      const t = pA + num(A.beatLead, 35) - GROOVE_PEAK_LAG_MS;   // in Spotify's beat time
      const j = lastAtOrBefore(B, t);
      if (j < 0) { per = Math.max(1, B[1] - B[0]); x = (t - B[0]) / per; }
      else if (j >= nb - 1) { per = Math.max(1, B[nb - 1] - B[nb - 2]); x = nb - 1 + (t - B[nb - 1]) / per; }
      else { per = Math.max(1, B[j + 1] - B[j]); x = j + (t - B[j]) / per; }
      const n = Math.floor(x), D = A.beatDown;
      o.acc0 = n >= 0 && n < nb && D[n] ? 1 + GROOVE_DOWN : 1;
      o.acc1 = n + 1 >= 0 && n + 1 < nb && D[n + 1] ? 1 + GROOVE_DOWN : 1;
    } else {
      per = 60000 / clamp(bpm > 0 ? bpm : FALLBACK_BPM, 40, 240);
      x = (pA - GROOVE_PEAK_LAG_MS) / per;
      const n = Math.floor(x), m = ((n % 4) + 4) % 4;           // beat 1 of every 4 (the fallback's accent)
      o.acc0 = m === 0 ? 1 + GROOVE_DOWN : 1;
      o.acc1 = m === 3 ? 1 + GROOVE_DOWN : 1;
    }
    o.pos = x;
    o.ph = x - Math.floor(x);
    o.ms = per;
    return o;
  }
  /** the groove pulse at phase ph (0..1 inside a beat): 1 on the beat, a cosine fall to 0 over the first
      1 - GROOVE_RISE of the beat, then a cosine rise into the next beat (continuous, with a continuous slope) */
  function groovePulse(ph) {
    const f = 1 - GROOVE_RISE, u = ph < f ? (0.5 * ph) / f : 0.5 + (0.5 * (ph - f)) / GROOVE_RISE;
    return 0.5 + 0.5 * Math.cos(TAU * u);
  }
  /** "Ritmo do visual" setting -> the hit list the renderers use */
  function rhythmMode() { return CFG.rhythm === "beat" || CFG.rhythm === "bass" ? CFG.rhythm : "auto"; }
  /** the hit list for a rhythm mode: "bass" = the model's hits; "beat" = a hit
      on every beat (+ the model's on-beat hits, off-beat ones much softer);
      "auto" = the model's hits plus the beat hits weighted by A.four x
      steadiness, the model's off-beat hits (a rolling trance bass) softened by
      the same weight. Close hits (< 95 ms) merge. Each hit decays with its
      own time constant (never more than half the gap to the next real hit). */
  function buildHits(A, mode) {
    if (A.hitMode === mode) return;
    A.hitMode = mode;
    const ev = [];                                  // [onset, strength, attack]
    const B = A.kT || A.beatT, nb = B ? B.length : 0;   // v5b: the kick clock
    const nearBeat = (t) => {                       // index of the beat this onset belongs to (-1: off-beat)
      const j = nearestIdx(B, t + A.beatLead);
      return j >= 0 && Math.abs(B[j] - (t + A.beatLead)) <= 55 ? j : -1;
    };
    const dr = (t) => drumsAt(A, t);               // v6: drums present
    for (let i = 0; i < A.mHitT.length; i++) {
      let s = A.mHitS[i] >= DRUM_SOLO ? A.mHitS[i] : A.mHitS[i] * dr(A.mHitT[i]);
      if (mode !== "bass" && nb) {
        const j = nearBeat(A.mHitT[i]);
        if (j < 0) {
          const k = nearestIdx(B, A.mHitT[i]);
          const w = mode === "beat" ? 1 : A.four * (k >= 0 ? A.bSteady[k] : 0);
          s *= 1 - 0.6 * w;
        }
      }
      if (s > 0.06) ev.push([A.mHitT[i], s, A.mHitA[i], 0, 1]);
    }
    if (mode !== "bass") {
      const src = mode === "beat" ? A.bForce : A.bAuto;
      for (let j = 0; j < nb; j++) { const v = src[j] * dr(A.bOn[j]); if (v > 0.06) ev.push([A.bOn[j], v, A.bAtt[j], 1, mode === "auto" && A.bVis ? A.bVis[j] : 1]); }
      if (mode === "auto" && A.oS) for (let j = 0; j < nb; j++) { const k = A.oS[j] > 0 ? dr(A.oOn[j]) : 0; if (k > 0) ev.push([A.oOn[j], A.four * A.oS[j] * k, A.oAtt[j], 2, OFF_VIS]); }   // r2: off-beat bass
    }
    ev.sort((a, b) => a[0] - b[0]);
    // hg: 1 = the hit's strength comes from the beat grid (v5b-r2), 2 = from an off-beat tick (r3); hm (r3): the largest
    // bass-MODEL strength merged into the hit (r2 kept only the winner's source: on four-on-the-floor tracks the grid's
    // 0.92-0.96 usually beat the model's 0.6-0.9 on the same kick, so a real kick counted as a grid hit and the breakdown
    // calm shrank it, a sawtooth on steady kicks); hv: the winner's visual size (OFF_VIS / SOFT_VIS / 1)
    const ht = [], hs = [], ha = [], hg = [], hm = [], hv = [];
    for (const [t, s, a, g, vk] of ev) {
      const last = ht.length - 1;
      if (last >= 0 && t - ht[last] < HIT_MERGE_MS) {
        if (s > hs[last]) { ht[last] = t; ha[last] = a; hg[last] = g; hv[last] = vk; }
        hs[last] = Math.max(hs[last], s);
        if (!g) hm[last] = Math.max(hm[last], s);
      } else { ht.push(t); hs.push(s); ha.push(a); hg.push(g); hm.push(g ? 0 : s); hv.push(vk); }
    }
    for (let i = 0; i < hv.length; i++) if (hm[i] >= HIT_REAL) hv[i] = 1;   // a real bass-model kick lands in full
    A.hitG = Uint8Array.from(hg); A.hitM = Float32Array.from(hm); A.hitVK = Float32Array.from(hv);
    finishHits(A, ht, hs, ha);                      // look-ahead decays, density scale, retrigger starts
  }

  /** per-hit arrays from the hit list (onset ms, strength, attack ms). LOOK-AHEAD: the analysis knows every
      upcoming hit, so each hit's decay time constant is solved so that, one frame (VALLEY_LEAD_MS) before the
      next hit that counts, it has fallen to <= VALLEY_REL of its own peak and <= VALLEY_NEXT of the next peak:
      dense 808 runs drop to a clear valley between hits instead of merging; isolated hits keep (up to 1.3 x)
      the musical decay (x SPARSE_DECAY_MUL for the renderers; hitDC = the camera / glow decay, capped at the
      plain musical decay like v3). hitDF: the same for the focus pull (shallower valley); hitZ: per-hit amplitude scale
      for zoom / glow / cover (DENSE_MIN_SCALE at <= 110 ms gaps -> 1 at >= 320 ms); hitV0: where the previous
      hits have decayed to when this one starts (the new hit rises from there: no max-merge plateau). */
  function finishHits(A, ht, hs, ha) {
    const N = ht.length;
    A.hitT = Float64Array.from(ht); A.hitS = Float32Array.from(hs); A.hitA = Float32Array.from(ha);
    A.hitD = new Float32Array(N); A.hitDC = new Float32Array(N); A.hitDF = new Float32Array(N); A.hitZ = new Float32Array(N); A.hitV0 = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let j = i + 1;
      while (j < N && hs[j] < Math.max(NEXT_MIN, NEXT_REL * hs[i])) j++;   // tiny followers do not cut a big hit short
      const room = (j < N ? ht[j] - ht[i] : 1e9) - ha[i] - PEAK_HOLD_MS - VALLEY_LEAD_MS;
      const target = Math.min(VALLEY_REL * hs[i], VALLEY_NEXT * (j < N ? hs[j] : 1));
      A.hitD[i] = clamp(room > 0 ? room / Math.log(hs[i] / Math.max(1e-3, target)) : DECAY_MIN_MS, DECAY_MIN_MS, A.decay * SPARSE_DECAY_MUL);
      A.hitDC[i] = Math.min(A.hitD[i], A.decay);
      A.hitDF[i] = clamp(room > 0 ? room / Math.log(1 / FOCUS_VALLEY) : DECAY_MIN_MS, DECAY_MIN_MS, FOCUS_DECAY_MS);
      const gap = Math.min(i ? ht[i] - ht[i - 1] : 1e9, i + 1 < N ? ht[i + 1] - ht[i] : 1e9);
      A.hitZ[i] = DENSE_MIN_SCALE + (1 - DENSE_MIN_SCALE) * n01(gap, DENSE_MIN_MS, DENSE_FULL_MS);
    }
    const o = { v: 0, pk: 0, sh: 0, z: 1, f: 0, c: 0 };
    for (let i = 1; i < N; i++) A.hitV0[i] = Math.min(hs[i], kickAt(A, ht[i] - 1e-3, o, i - 1).v);
    return A;
  }
  /** normalised hit shape (peak 1, d = ms since the onset): rises from v0 (0..1) to the peak in `attack`,
      holds one frame, then decays exponentially */
  function hitShape(d, attack, decay, v0) {
    if (d < 0) return 0;
    if (d < attack) { const x = 1 - d / attack; return v0 + (1 - v0) * (1 - x * x); }
    d -= attack + PEAK_HOLD_MS;
    return d <= 0 ? 1 : Math.exp(-d / decay);
  }
  /** bass-hit state at ms: the dominant of the last 3 hits (largest strength x shape). o.v = value (= o.pk x o.sh),
      o.pk = its strength, o.sh = its shape 0..1, o.z = its density scale, o.f = its focus shape, o.c = its camera shape.
      upto: only hits with index <= upto (finishHits chains the retrigger start values with it) */
  function kickAt(A, ms, o, upto) {
    o.v = 0; o.pk = 0; o.sh = 0; o.z = 1; o.f = 0; o.c = 0; o.t = -1; o.g = 0; o.m = 0; o.vk = 1;
    const T = A.hitT, HG = A.hitG, HM = A.hitM, HV = A.hitVK;
    if (!T || !T.length) return o;
    let k = lastAtOrBefore(T, ms);
    if (upto != null && k > upto) k = upto;
    for (let j = k; j >= 0 && j >= k - 2; j--) {
      const s = A.hitS[j], v0 = s > 0 ? A.hitV0[j] / s : 0, d = ms - T[j];
      const e = hitShape(d, A.hitA[j], A.hitD[j], v0);
      if (e * s > o.v) { o.v = e * s; o.pk = s; o.sh = e; o.z = A.hitZ[j]; o.f = hitShape(d, A.hitA[j], A.hitDF[j], v0); o.c = hitShape(d, A.hitA[j], A.hitDC[j], v0); o.t = T[j]; o.g = HG ? HG[j] : 0; o.m = HM ? HM[j] : 0; o.vk = HV ? HV[j] : 1; }
    }
    return o;
  }

  /** last segment starting at or before t (-1 before the first one) */
  function segIndex(A, t) {
    const i = A.seg;
    if (i < A.n && A.start[i] <= t && (i + 1 >= A.n || A.start[i + 1] > t)) return i;
    if (i + 1 < A.n && A.start[i + 1] <= t && (i + 2 >= A.n || A.start[i + 2] > t)) return (A.seg = i + 1);
    if (t < A.start[0]) { A.seg = 0; return -1; }
    let lo = 0, hi = A.n - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (A.start[m] <= t) lo = m; else hi = m - 1;
    }
    return (A.seg = lo);
  }

  /** loudness (dB) at t: loudness_start -> loudness_max (at loudness_max_time)
      -> the next segment's loudness_start */
  function dbAt(A, t) {
    const i = segIndex(A, t);
    if (i < 0) return A.lo;
    const s0 = A.start[i], tm = s0 + A.lmt[i];
    if (t < tm) return lerp(A.l0[i], A.lmax[i], (t - s0) / Math.max(0.001, A.lmt[i]));
    const end = i + 1 < A.n ? A.start[i + 1] : s0 + A.dur[i];
    const next = i + 1 < A.n ? A.l0[i + 1] : A.lo;
    if (t >= end) return next;
    return lerp(A.lmax[i], next, (t - tm) / Math.max(0.001, end - tm));
  }
  function norm01(A, db) { return clamp((db - A.lo) / (A.hi - A.lo), 0, 1); }

  /** pitches at t, cross-faded over the first 60 ms of each segment;
      returns the segment brightness (timbre[1]) normalised to 0..1 */
  function pitchesAt(A, t, out) {
    const i = Math.max(0, segIndex(A, t));
    const f = i > 0 ? clamp((t - A.start[i]) / 0.06, 0, 1) : 1;
    const k = smooth(f), o = i * 12, p = (i - 1) * 12;
    for (let j = 0; j < 12; j++) out[j] = i > 0 ? lerp(A.pit[p + j], A.pit[o + j], k) : A.pit[o + j];
    return clamp((A.bri[i] - A.briLo) / (A.briHi - A.briLo), 0, 1);
  }

  function lastAtOrBefore(times, ms) {
    let lo = 0, hi = times.length - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (times[m] <= ms) { k = m; lo = m + 1; } else hi = m - 1; }
    return k;
  }
  /** d = ms since the onset: nothing before it, an ease-out rise to the peak
      (most of it in the first frame), a one-frame hold, then exponential decay */
  function hitEnv(d, attack, decay) {
    if (d < 0) return 0;
    if (d < attack) { const x = 1 - d / attack; return 1 - x * x; }
    d -= attack + PEAK_HOLD_MS;
    return d <= 0 ? 1 : Math.exp(-d / decay);
  }
  /** max of the envelopes of the hits that started at or before ms;
      attack and decay are numbers or per-hit arrays */
  function envAt(times, strengths, ms, attack, decay) {
    if (!times || !times.length) return 0;
    const k = lastAtOrBefore(times, ms), pa = typeof attack !== "number", pd = typeof decay !== "number";
    let v = 0;
    for (let j = k; j >= 0 && j >= k - 3; j--) v = Math.max(v, hitEnv(ms - times[j], pa ? attack[j] : attack, pd ? decay[j] : decay) * strengths[j]);
    return v;
  }

  /** index of the nearest time in a sorted array (-1 if empty) */
  function nearestIdx(times, ms) {
    if (!times || !times.length) return -1;
    let lo = 0, hi = times.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (times[m] < ms) lo = m + 1; else hi = m; }
    if (lo > 0 && Math.abs(times[lo - 1] - ms) < Math.abs(times[lo] - ms)) lo--;
    return lo;
  }
  const median = (a) => {
    if (!a.length) return NaN;
    const s = Array.from(a).sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // ---- per-frame signal (shared by every visualizer): the signal bus ------------
  /** v5 signal bus. computeSignal() fills these NAMED CHANNELS on a view's signal object (SIG.main / SIG.preview)
      once per frame; the renderers (BARS / RING / WAVE: see their `reads`), the effects (effectsFrom) and any future
      reactive layer only READ them, never the analysis itself. Values are per frame, already at the audible position
      (the output latency applied) and gated by play / pause. A new per-element layer (e.g. a lead synth, hats,
      sub-bass, vocals) adds its own producer to SIGNAL_TAPS and its drawing to LAYERS, without touching the rest. */
  const SIGNAL_CHANNELS = Object.freeze({
    gate: "0..1 playing (eased: 140 ms in, 480 ms out)",
    kick: "0..1 the dominant bass hit now (= kickPk x kickSh)",
    kickPk: "0..1 that hit's strength (the renderers saturate this amplitude, never the shape)",
    kickSh: "0..1 that hit's shape (attack, one-frame hold, look-ahead decay), gated",
    kickCam: "0..1 the hit's shape for the camera / glow (plain musical decay), gated",
    kickZ: "0.6..1 density scale (dense runs pulse softer on the camera / glow / cover)",
    four: "0..1 v5b-r3: how four-on-the-floor the track is (A.four; 0 without an analysis)",
    kickVis: "0.3..1 v5b-r3: the hit's visual size, applied AFTER the renderers' saturation (off-beat tick 0.5, a soft grid tick down to 0.3, a kick 1)",
    kickId: "onset time (ms) of the dominant hit: a new value = a new additive impulse (-1 before the first hit)",
    slow: "0..1 the focus-pull envelope (a slower lens breath)",
    bass: "0..1 hits + a little sustained low end",
    low: "0..~0.12 the sustained low end alone (between hits)",
    body: "0..1 segment body (loud and dark), eased 160 ms",
    hat: "0..1 bright transients (hats / claps), short envelope",
    energy: "0..1 broadband loudness",
    eOn: "0..1 v5b-r3: the energy's onsets (energy minus its 200 ms follower, x 2.5)",
    bright: "0..1 timbre brightness, eased 420 ms",
    P12: "Float32Array(12) chroma, cross-faded per segment",
    groove: "0..1 groove pulse (the groove effect): 1 on each beat (downbeats), x the energy envelope; independent of the setting",
    sway: "-1..1 pendulum over two beats (+-1 on the beats), x the same envelope",
    beatPos: "beats since the first one (continuous; tempo changes followed)",
    beatPh: "0..1 phase inside the current beat",
    beatMs: "length of the current beat (ms)",
    down: "1 while the pulse belongs to a downbeat (bars[]), else 0",
    grooveEnv: "0..1 the groove's envelope (gate x energy, eased GROOVE_ENV_MS)",
    drums: "0..1 v6 drums present (drumsAt: analysis look-ahead); the groove, sway and hat envelope here, the hit list, the snare / hat ticks and the dots' beat steps are already scaled by it",
    ext: "{ [tapId]: channels } of the SIGNAL_TAPS; v5b: ext.el = the per-element layers (elFrame): low / mid / air (0..1, " +
      "own attack / release), ent / entAge (the bass came in), entMid / entAir (soft entries), hatEnv + hat tick slots, snap / " +
      "snapAge (snare / clap), rise (riser ramp), calm (breakdown), harm (harmony drift), gAng / gR / glint (melody), seekAt; " +
      "null while 'Camadas por elemento' is off",
  });
  /** extension point: extra channel producers, run in order at the end of computeSignal(), each as
      tap.fn(Z, A, pA, dt, playing) writing its own channels into Z.ext[tap.id] (A = the digested analysis or null,
      pA = the audible analysis time in ms). v5b: "el" (elFrame, the per-element layers). */
  const SIGNAL_TAPS = [];
  /** extension point: per-element reactive layers, drawn into a view's canvas right under ("under") or over
      ("over") the style. { id, styles?: ["bars" | "ring" | "wave"], order: "under" | "over", layout?(v, state),
      draw(v, sig, fx, state) }; state = v.layers[id] (kept across re-layouts). v5b: order "haze" draws into the
      style's haze canvas just before it is blitted; "el-under" / "el-haze" / "el-over" are the per-element layers. */
  const LAYERS = [];
  function layoutLayers(v) {
    if (!LAYERS.length) return;
    v.layers = v.layers || {};
    for (const L of LAYERS) {
      if (L.styles && !L.styles.includes(v.style)) continue;
      const st = v.layers[L.id] || (v.layers[L.id] = {});
      if (L.layout) try { L.layout(v, st); } catch (e) { /* a broken layer never stops the visualizer */ }
    }
  }
  function drawLayers(v, sig, fx, order) {
    if (!LAYERS.length) return;
    for (const L of LAYERS) {
      if (L.order !== order || (L.styles && !L.styles.includes(v.style))) continue;
      try { L.draw(v, sig, fx, (v.layers && v.layers[L.id]) || {}); } catch (e) { S.layerErr = L.id + ": " + String((e && e.message) || e).slice(0, 160); }   // r2: kept for _el()
    }
  }
  function newSig() {
    return { gate: 0, bright: 0.5, body: 0, bass: 0, kick: 0, slow: 0, hat: 0, energy: 0, P12: new Float32Array(12), mode: "fallback", db: null, lat: LATENCY_MS,
      kickPk: 0, kickSh: 0, kickCam: 0, kickZ: 1, kickVis: 1, four: 0, eSlow: 0, eOn: 0, kickId: -1, low: 0, k: { v: 0, pk: 0, sh: 0, z: 1, f: 0, c: 0, t: -1, g: 0, m: 0, vk: 1 },
      groove: 0, sway: 0, beatPos: 0, beatPh: 0, beatMs: 500, down: 0, grooveEnv: 0, drums: 1, drG: 0, pcW: 1, P12s: null, gr: { pos: 0, ph: 0, ms: 500, acc0: 1, acc1: 1 }, ext: {} };
  }
  const SIG = { main: newSig(), preview: newSig() };
  /** "Balanço no ritmo" amount (0..5; 0 = off, and while Windows asks for less motion) */
  const grooveAmt = () => (CFG.groove && CFG.groove.on && !S.reducedMotion ? CFG.groove.amount / 100 : 0);

  // ==== v5b "Camadas por elemento" (per-element layers) =========================================================
  // the per-element design (a merge of a visual-first and a music-first design). Every channel comes from
  // the Spotify analysis only and is sampled at the audible time pA (the hits' own latency path, Z.gate):
  //   LOW / MID / AIR    virtual bands (visual-first elDigest: ridge EL_W on per-track z-scored segment features)
  //   "o grave entrou"   bar rule on the music-first band rows (sub / bass, EL_BAND), snapped onto the kick
  //   riser ramp         look-ahead, anchored on those entries (the analysis knows where the bass comes back)
  //   breakdown calm     the bass level out for ~2 s (visual-first)
  //   MID / AIR entries  soft flourishes (visual-first rule, 8 s refractory)
  //   hats / snares      music-first tick classifiers (EL_CLS); a snare never within 45 ms of a hit >= 0.2
  //   harmony / melody   circle-of-fifths drift of the halo colour, the chroma's circular mean for the glint
  // Digest-time work runs once per track, deferred off the frame (elAttach after digest(), setTimeout 0); the frame
  // tap elFrame() is O(1) (binary searches, <= 8 tick slots). The kick pipeline (hits, kickAt, dynStep / "Volta",
  // caps, zoom, glow, groove) is untouched: the layers replace only the renderers' between-hit "rest" terms and add
  // drawn layers. Master off (or no channels yet) = exactly the v5 look, line by line.
  const EL_HOP = 50;                 // ms grid of the per-track layer curves
  const EL_FEAT_BOX = 3;             // grid points (150 ms) of feature smoothing (odd)
  const EL_ATT_BOX = 5;              // grid points (250 ms) for the attack density
  const EL_AR = { low: [40, 300], mid: [150, 800], air: [60, 400] };   // per-layer attack / release (ms)
  const EL_ENTRY_THR = 0.35, EL_ENTRY_WIN = 3000, EL_ENTRY_SMOOTH = 600, EL_ENTRY_HALF = 2000, EL_ENTRY_SNAP = 250;
  const EL_ENTRY_TOP = 0.55, EL_QUIET_LO = 0.25, EL_QUIET_MEAN = 0.35;
  // MID / AIR soft entries: at most one per 20 s per band. The spec's 8 s (visual-first: 6 s) failed acceptance A9 on
  // the built code (lo-fi MID 2.9 / house + lo-fi AIR 2.6 per min > 2); 10-15 s still failed lo-fi; 20 s passes every
  // genre (max 1.7 per min) and raises the truth confirmation (GT-B: MID .74 -> .78, AIR .73 -> .80)
  const EL_ENTRY_REFR = 20000;
  const EL_ENTRY_MS = 900;           // an entry's envelope: 40 ms rise, then a squared fall
  const EL_CALM_SMOOTH = 2000, EL_CALM_HI = 0.4, EL_CALM_SPAN = 0.3;   // breakdown: the bass level over 2 s
  const EL_BAR_DB = { sub: 7.5, bass: 8 };   // "o grave entrou": a band's bar level rose this much (dB) over the louder
  const EL_BAR_PB = 0.35;                    // of the two bars before, the next bar holds, and the band is present
  const EL_BUILD_BARS = 8;           // the riser ramp looks back at most 8 bars before an entry
  const EL_HAT_MIN = 0.25, EL_SNR_MIN = 0.3, EL_SNR_KICK_MS = 45;   // tick lists (classifier score, normalised locally)
  const EL_SNR_RUN_MIN = 0.6;        // v5b-r2: a snare / clap inside a four-on-the-floor kick run needs this score
  const EL_TICK_NORM_MS = 30000;     // v5b-r2: ... over the segments within +-30 s (v5b: the whole track)
  // v5b-r2: the entry's anchor (elDigest2): the segment start in [bar - EL_ANC_LO, bar + EL_ANC_HI] beats with the biggest
  // sub + bass band-row step (EL_ANC_WIN ms after vs before), then the strongest hit >= 0.2 within +-EL_ANC_SNAP ms.
  // (v5b: the bar line +-120 ms, moved with the kick clock: on the low-end step 33 % of the reference entries, trance 25 %)
  // v5b-r3: up to 4 beats after the bar line (r2: 2; a drop whose bass lands on beat 4 fired 1.2 s early), near-ties go to the
  // EARLIEST candidate within EL_ANC_TIE dB of the best (r2: the later one won a 4.0 vs 4.1 dB tie, 270 ms after the 808), and
  // an entry whose anchor step is under EL_ENT_CONF_DB with no hit >= EL_ENT_CONF_HIT on it fires at EL_ENT_WEAK (the shock and
  // its camera / glow punch: on the reference set, the well-timed shockwaves have a step p50 16 dB and a hit .99 on them, the off / false ones
  // 6 dB and .22; LOGO: 22 of 23 good ones stay full, 8 of 13 bad ones shrink; a hard gate lost A6 recall)
  const EL_ANC_LO = 1, EL_ANC_HI = 4, EL_ANC_WIN = 300, EL_ANC_SNAP = 30, EL_ANC_TIE = 1.5;
  const EL_ENT_CONF_DB = 9, EL_ENT_CONF_HIT = 0.45, EL_ENT_WEAK = 0.35;
  const EL_ENT_GAP_BARS = 4, EL_ENT_GAP_MS = 8000;    // one drop, one shockwave (v5b fired twice on 6 bar pairs)
  const EL_ENT_WIN_DB = 6;                             // ... a later one wins only with a band-row step this much bigger
  const EL_RAMP_OUT_DB = 3;                           // riser: only over bars whose band rows are >= 3 dB under the entry bar
  const EL_SEEK_MS = 250;            // the audible time jumped more than this: a seek, no event before it fires
  const EL_FADE_MS = 400;            // the layers fade in once the deferred digest is there
  // r3: the twinkle decays in 140 ms (r2: 90 ms: a hat lit 3-4 px dots by +0.2 for ~3 frames, on screen barely visible)
  const EL_TICKS = 8, EL_TICK_WIN = 450, EL_TWINKLE_MS = 140;   // hat tick slots, their window, the twinkle decay
  // v5b-r3: the soft entries' FLASH ("a voz entrou" / "os agudos entraram"): 40 ms rise, a squared fall over EL_FLASH_MS (r2
  // drew them only as a 1.5 px ring in "Anel neon", nothing in "Barras" / "Onda": 0.0-0.1 % of the screen changed)
  const EL_FLASH_MS = 600, EL_SWEEP_RAD = 0.6, EL_CASCADE_MS = 500;
  // v5b-r3: while hats play, the dots / sparks never fall under EL_HAT_FLOOR (a low AIR reading blanked the ring in a drop)
  const EL_HAT_FLOOR = 0.3;
  const EL_SNAP_MS = 160;            // snare / clap flick decay
  const EL_SHOCK_MS = 700;           // the bass-entry shockwave travels this long
  const EL_DOT_R = 1.12;             // "Anel neon" dots: radius r0 + 2 + 1.12 x len x ex (outside the caps' 1.09)
  const EL_ZOOM = 0.065, EL_GLOW = 0.6;      // the entry's camera punch / glow at 100 % (x "Zoom" / "Brilho na batida")
  // the layer-driven part of the between-hit rest eases into EL_REST_MAX (of the "Alcance" range): the spec's terms alone
  // reach REST_MAX (0.8) on a loud bass, where blendH() hides every hit below it (per-hit kick test, H1: bars 79 %); under
  // this cap a 0.2 hit still lifts >= 15 % (calibrated with test/kick.cjs, out/v5b/kick-*.txt)
  const EL_REST_MAX = 0.6;          // r2: the ceiling of Voz / Agudos (elRestK: knee at 2/3 of it)
  // v5b-r2: "Grave" (the bass body between kicks) has its own, lower ceiling (v5b shared 0.45: with the layers on the
  // body between beats doubled, trance ring p50 .21 -> .43, and the kick stood out ~37 % less against it; r2: ring body p50 .24, the
  // punch over the body >= 0.86 x v5 in every style and genre at typical settings)
  const EL_GRAVE_MAX = 0.3;
  // "Grave" skips the rest smoothing (it has its own 40 / 300 ms follower, like the groove's lift). v5b-r2: its
  // SIDECHAIN comes after the kick, as in a trance / trap mix: from the hit's peak (attack + hold) the body dips by up to
  // EL_SC and swells back with EL_SC_MS, so every kick rises from the full body and pumps it (v5b dipped in the 80 ms
  // BEFORE every hit: a "blink" before each kick)
  const EL_SC = 0.8, EL_SC_MS = 220, EL_DUCK_HIT = 0.12;
  // "Anel neon": with "Agudos e chimbal" on, the crown keeps half of v5's hat sparkle (the dots carry the hats); the dense
  // acceptance needs crown transients on dense onsets (measured: ring dense recall .277 with none, .287 with half)
  const EL_CROWN_HATS = 2.5;
  const ND_V_CR0 = 0.67;   // v6-r2: the share of ND_V_CR kept without drums
  const ND_V_CR = 0.9;   // v6-r2: ND_V_CR 0.6 -> 0.9
  // v5b-r3: with "Voz e melodia" on, the crown's top / the bars' centre keep EL_KEEP_MID of v5's energy term (the voice
  // has its own halo / band; r2 took the term off completely and in BR trap / funk the crown and bars pulsed 30-40 % less
  // often than with the layers off: dense bass-onset recall .330 -> .265, pulses 1.41 -> 0.97 / s); with "Agudos e
  // chimbal" on, the bars' tips keep EL_BARS_HATS of v5's per-hat flicker (r2: none, the hats showed less with the layers)
  // (x (1 - A.four): on four-on-the-floor tracks the kick clock carries the pulse and the energy term only filled the gaps
  // between the kicks: trance dense pairs distinct .87 -> .69 with it)
  // (measured at typical settings, reference BR trap / funk: ring dense recall .265 -> .328 of .330 off, matched pulses .72 ->
  // 1.03 of 1.03 / s; bars .264 -> .328 of .343, .70 -> .99 of 1.03; trance / house: unchanged by it)
  const EL_KEEP_MID = 1, EL_KEEP_HATS = 1, EL_BARS_HATS = 1;
  /** v5b-r2: a camada's rest term at amount K (0..5). Up to 100 % the amount scales the music's input; past it, the
      input grows with sqrt(K) and the CEILING with 1 + 0.3 log2(K) (x1.7 at 500 %), so 200..500 % still grow and the
      music keeps moving the layer under its ceiling (v5b multiplied the input by K into one fixed 0.45 cap: from ~200 %
      on, 'Grave' sat on the cap, 500 % looked like 200 %) */
  const elKin = (K) => (K <= 1 ? K : Math.sqrt(K));
  const elKcap = (K) => (K <= 1 ? 1 : 1 + 0.3 * Math.log2(K));
  function elRestK(x, K, cap) {
    const c = (cap || EL_REST_MAX) * elKcap(K), kn = 0.67 * c, y = x * elKin(K);
    return y <= kn ? (y > 0 ? y : 0) : kn + (c - kn) * (1 - Math.exp(-(y - kn) / (c - kn)));
  }
  const EL_IDS = ["low", "voice", "air", "entry", "snare", "mood"];

  // ---- layer models: weight blocks kept apart (like BASS_MODEL) so they can be swapped / retrained ---------------
  /** visual-first virtual bands: ridge (lambda 10) on 15 per-track z-scored features [loud, floor, t0..t11, attps],
      fit on 93 recorded windows / 43 tracks (an offline fit); leave-one-track-out cost <= .01 */
  const EL_W = {
    low: { b: 0.0, mu: [0.05088, 0.03899, 0.06731, -0.01826, 0.0068, -0.03182, -0.01995, 0.02567, 0.00482, -0.01919, 0.03292, 0.00514, -0.02799, -0.01542, 0.00832],
      w: [0.10586, -0.02122, 0.37378, -0.23424, -0.4109, -0.15609, -0.26905, -0.01351, 0.30137, -0.01217, 0.08253, 0.07972, -0.0421, -0.06947, -0.01807] },
    mid: { b: 0.0, mu: [0.05088, 0.03899, 0.06731, -0.01826, 0.0068, -0.03182, -0.01995, 0.02567, 0.00482, -0.01919, 0.03292, 0.00514, -0.02799, -0.01542, 0.00832],
      w: [0.47002, -0.12187, 0.17956, -0.25919, 0.42591, -0.04809, 0.17553, 0.02507, 0.07162, -0.11143, 0.04325, 0.0381, 0.01924, -0.00754, -0.07323] },
    air: { b: -0.0, mu: [0.05088, 0.03899, 0.06731, -0.01826, 0.0068, -0.03182, -0.01995, 0.02567, 0.00482, -0.01919, 0.03292, 0.00514, -0.02799, -0.01542, 0.00832],
      w: [0.40639, -0.06224, 0.21046, 0.32835, -0.17318, -0.23072, 0.20792, -0.03652, 0.0027, 0.0639, -0.10432, -0.03758, -0.0274, -0.03535, 0.03042] },
  };
  /** music-first band rows (m4_models.json "lv", ridge lambda 30): band level of a segment (dB) =
      loudness_max + [1, (x - mu) / sd] . W_b, x = [t0..t11, loudness_max, loudness_start, attack, ln dur ms, lmt / dur] */
  const EL_BAND = {
    mu: [48.8683, 25.3474, -6.2682, 0.2698, 25.0591, -30.685, 2.7154, -0.7526, -7.7025, 2.8774, -12.2145, -0.8943, -7.0003, -15.9208, 8.9204, 5.3403, 0.2232],
    sd: [5.8114, 69.1839, 53.9964, 47.1002, 32.014, 37.5585, 25.7758, 25.6391, 18.0488, 19.7797, 19.5541, 14.4308, 5.7276, 7.4528, 5.7961, 0.499, 0.1771],
    W: {
      sub: [-15.1042, 1.311, 0.7398, -5.3363, -0.5418, -3.007, -1.3763, 4.6206, 0.6832, 1.2034, 0.7106, -0.8621, -1.9264, 0.5275, 0.4659, -0.0778, 0.3157, 0.1937],
      bass: [-11.0683, 1.7737, -0.6725, -4.0612, -0.6892, -2.4436, -0.3855, 1.609, 0.551, 0.5685, 0.5914, -0.2047, -0.445, -0.6505, -0.0186, -0.6189, 0.7117, 0.0508],
      highmid: [-17.8815, -0.4726, 4.4675, 2.4462, 0.5087, -0.1941, 0.4964, -0.9733, -0.2185, 0.0605, -0.5021, 0.1021, 0.0396, 0.9098, 0.4091, 0.373, -0.1997, 0.0456],
      air: [-21.1995, -1.8084, 6.5786, -2.317, -0.7718, 3.058, -1.0012, 0.1993, 0.1589, -1.6158, -0.925, 0.0771, -0.4726, 2.708, 1.5241, 0.7162, -0.4324, -0.0105],
    },
  };
  /** music-first tick classifiers (m7_cls.json, linear probability, ridge lambda 10): score = [1, (f - mu) / sd] . W,
      f = the 29 tick features of a segment start (elTickF): the 17 band-row features, the change of t0..t3 /
      loudness_max / attack from the previous segment, beat / tatum phase, beat-in-bar one-hot */
  const EL_CLS = {
    mu: [48.8687, 25.46, -6.2798, 0.4153, 25.074, -30.657, 2.6835, -0.739, -7.7053, 2.8604, -12.2452, -0.902, -6.9966, -15.9144, 8.9179, 5.3428, 0.2231, 0.0109, 0.1375, -0.0433, 0.1838, 0.0154, 0.0026, 0.2419, 0.217, 0.0483, 0.0868, 0.0756, 0.1142],
    sd: [5.8353, 69.1118, 54.0217, 47.3723, 32.0079, 37.5603, 25.7994, 25.6813, 18.0456, 19.7872, 19.6003, 14.432, 5.7455, 7.4676, 5.7984, 0.5028, 0.1772, 3.179, 53.3445, 43.5103, 63.0462, 4.4916, 6.0848, 0.1598, 0.1448, 0.2143, 0.2815, 0.2644, 0.3181],
    hat: [0.47145, 0.14161, 0.00405, -0.07051, 0.03829, 0.01461, 0.00111, 0.04206, -0.06409, 0.00359, -0.0346, 0.0342, -0.02069, -0.00752, -0.13652, 0.16837, -0.03117, -0.03637, -0.05661, 0.06941, -0.03388, 0.00086, 0.02753, -0.02583, 0.00343, -0.03546, 0.01996, 0.00677, 0.01332, 0.01354],
    snare: [0.15887, 0.01614, 0.02393, -0.04737, 0.05401, 0.00774, 0.02646, 0.01583, 0.02302, -0.00077, 0.00993, 0.012, -0.0174, 0.02907, -0.0558, 0.10067, -0.02497, -0.00146, -0.0182, 0.0018, 0.08401, 0.05228, -0.01011, -0.0062, -0.00796, -0.01475, -0.01089, -0.00388, -0.00112, -0.00932],
  };

  // ---- digest-time helpers ----------------------------------------------------------------------------------------
  const elN01 = (v, lo, hi) => { const x = (v - lo) / Math.max(1e-9, hi - lo); return x < 0 ? 0 : x > 1 ? 1 : x; };
  /** centred box over an odd number of grid points, edge padded (numpy pad(edge) + convolve(same)) */
  function elBox(x, n) {
    if (n <= 1) return Float32Array.from(x);
    const N = x.length, h = n >> 1, out = new Float32Array(N);
    let s = 0;
    const at = (i) => x[i < 0 ? 0 : i >= N ? N - 1 : i];
    for (let i = -h; i <= h; i++) s += at(i);
    for (let i = 0; i < N; i++) { out[i] = s / n; s += at(i + h + 1) - at(i - h); }
    return out;
  }
  /** numpy's default (linear) percentile, p in 0..1 */
  function elPct(arr, p) {
    const s = Float64Array.from(arr).sort();
    if (!s.length) return 0;
    const r = p * (s.length - 1), i = Math.floor(r), f = r - i;
    return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * f : s[i];
  }
  function elNorm(x) {
    const lo = elPct(x, 0.10), hi = elPct(x, 0.97), k = 1 / Math.max(1e-6, hi - lo), out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = clamp((x[i] - lo) * k, 0, 1);
    return out;
  }
  /** x[i] - min(x over the trailing win) */
  function elRiseOver(x, win) {
    const n = Math.round(win / EL_HOP), out = new Float32Array(x.length), q = [];
    for (let i = 0; i < x.length; i++) {
      while (q.length && x[q[q.length - 1]] >= x[i]) q.pop();
      q.push(i);
      while (q[0] < i - n) q.shift();
      out[i] = x[i] - x[q[0]];
    }
    return out;
  }
  /** first index with a[i] >= x (numpy searchsorted, side left) */
  function elLB(a, x) {
    let lo = 0, hi = a.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
    return lo;
  }
  /** linear interpolation on the 50 ms grid (t in ms) */
  function elSample(arr, t) {
    const x = t / EL_HOP, i = Math.floor(x);
    if (i < 0) return arr[0];
    if (i + 1 >= arr.length) return arr[arr.length - 1];
    return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
  }
  const elStarts = (list) => Float64Array.from((Array.isArray(list) ? list : []).filter((b) => b && isFinite(b.start)), (b) => b.start * 1000);

  /** the per-track layer channels (once per track; elAttach). M = optional model overrides { W, band, cls } (tests).
      Three stages, so the deferred digest runs as three short tasks (elAttachDeferred) */
  function elDigest(d, A, M) { return elDigest2(d, A, M, elDigest1(d, A, M, elFeatures(d, A))); }
  /** stage 0: the 15 grid features of the virtual bands (visual-first elDigest, unchanged), z-scored over the track */
  function elFeatures(d, A) {
    const segs = d.segments, n = A.n;
    const durMs = Math.max(1000, num(d.track && d.track.duration, 0) * 1000 || (A.start[n - 1] + A.dur[n - 1]) * 1000);
    const N = Math.ceil(durMs / EL_HOP), T = new Float64Array(N);
    for (let i = 0; i < N; i++) T[i] = i * EL_HOP;
    const F = [], loudP = new Float32Array(N), floor = new Float32Array(N), tb = [], imp = new Float32Array(N);
    for (let j = 0; j < 12; j++) tb.push(new Float32Array(N));
    let k = 0;
    for (let i = 0; i < N; i++) {
      const t = T[i] / 1000;
      while (k + 1 < n && A.start[k + 1] * 1000 <= T[i]) k++;      // compared in ms (a segment exactly on a grid point)
      const kk = A.start[k] * 1000 <= T[i] ? k : 0;
      const s0 = A.start[kk], tm = s0 + Math.max(0.0005, A.lmt[kk]);   // the theme's dbAt() without its segIndex cache
      let db;
      if (t < s0) db = A.l0[0];
      else if (t < tm) db = lerp(A.l0[kk], A.lmax[kk], (t - s0) / (tm - s0));
      else {
        const end = kk + 1 < n ? A.start[kk + 1] : s0 + A.dur[kk], next = kk + 1 < n ? A.l0[kk + 1] : A.lmax[kk];
        db = t >= end ? next : lerp(A.lmax[kk], next, (t - tm) / Math.max(0.001, end - tm));
      }
      loudP[i] = Math.pow(10, db / 10);
      floor[i] = A.l0[kk];
      const tbv = segs[kk] && Array.isArray(segs[kk].timbre) ? segs[kk].timbre : null;
      for (let j = 0; j < 12; j++) tb[j][i] = tbv ? num(tbv[j], 0) : 0;
    }
    for (let i = 0; i < n; i++) {
      const g = Math.min(N - 1, Math.max(0, Math.ceil(A.start[i] * 1000 / EL_HOP - 1e-9)));
      imp[g] += Math.max(0, A.lmax[i] - A.l0[i]);
    }
    const lp = elBox(loudP, EL_FEAT_BOX), loud = new Float32Array(N);
    for (let i = 0; i < N; i++) loud[i] = 10 * Math.log10(lp[i] + 1e-12);
    F.push(loud, elBox(floor, EL_FEAT_BOX));
    for (let j = 0; j < 12; j++) F.push(elBox(tb[j], EL_FEAT_BOX));
    const att = elBox(imp, Math.max(EL_FEAT_BOX, EL_ATT_BOX));
    for (let i = 0; i < N; i++) att[i] *= (1000 / EL_HOP) / 10;
    F.push(att);
    for (const f of F) {                                             // z-score every feature over the track
      let m = 0, v = 0;
      for (let i = 0; i < N; i++) m += f[i];
      m /= N;
      for (let i = 0; i < N; i++) v += (f[i] - m) * (f[i] - m);
      const sd = Math.sqrt(v / N) + 1e-9;
      for (let i = 0; i < N; i++) f[i] = (f[i] - m) / sd;
    }
    return { F, N, T };
  }
  /** stage 1: the virtual bands LOW / MID / AIR, the breakdown calm, the MID / AIR soft entries, the harmony / melody homes */
  function elDigest1(d, A, M, FP) {
    M = M || {};
    const WV = M.W || EL_W, n = A.n, F = FP.F, N = FP.N, T = FP.T;
    const el = { hop: EL_HOP, N, lev: {}, mode: "" };
    if (M.keepF) el.F = F;
    for (const b of ["low", "mid", "air"]) {
      const Wb = WV[b], v = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        let s = Wb.b;
        for (let j = 0; j < F.length; j++) s += Wb.w[j] * (F[j][i] - Wb.mu[j]);
        v[i] = s;
      }
      el.lev[b] = elNorm(v);                                         // 0..1 of this track
    }
    // (e) breakdown calm: the bass has been (mostly) out for ~2 s
    const l2 = elBox(el.lev.low, (Math.round(EL_CALM_SMOOTH / EL_HOP)) | 1);
    el.calm = new Float32Array(N);
    for (let i = 0; i < N; i++) el.calm[i] = clamp((EL_CALM_HI - l2[i]) / EL_CALM_SPAN, 0, 1);
    // (f) MID / AIR soft entries ("a voz / os agudos entraram"): the 600 ms level was really out, then rose >= 0.35 of
    // the track's range to >= 0.55; the largest rise within +-2 s, one per EL_ENTRY_REFR, snapped onto the note
    const n3 = Math.round(EL_ENTRY_WIN / EL_HOP), n05 = Math.round(500 / EL_HOP), hh = Math.round(EL_ENTRY_HALF / EL_HOP);
    for (const b of ["mid", "air"]) {
      const s = elBox(el.lev[b], (Math.round(EL_ENTRY_SMOOTH / EL_HOP)) | 1), r3 = elRiseOver(s, EL_ENTRY_WIN), tt = [], ss = [];
      let last = -1e18;
      for (let i = n3; i < N - 1; i++) {
        if (r3[i] < EL_ENTRY_THR || s[i] < EL_ENTRY_TOP || r3[i] < r3[i - 1] || r3[i] <= r3[i + 1]) continue;
        let top = true;
        for (let j = Math.max(0, i - hh); j < Math.min(N, i + hh) && top; j++) if (r3[j] > r3[i]) top = false;
        if (!top) continue;
        let j = i;
        while (j > 0 && r3[j - 1] >= 0.5 * r3[i]) j--;
        let mn = 1, mean = 0, cnt = 0;
        for (let q = Math.max(0, i - n3); q <= i; q++) mn = Math.min(mn, s[q]);
        for (let q = Math.max(0, j - n3); q < Math.max(1, j - n05); q++) { mean += s[q]; cnt++; }
        if (mn > EL_QUIET_LO || (cnt ? mean / cnt : 1) > EL_QUIET_MEAN || T[j] - last < EL_ENTRY_REFR) continue;
        last = T[j];
        let tBest = T[j], aBest = -1;
        for (let q = elLB(A.start, (T[j] - EL_ENTRY_SNAP) / 1000 - 1e-9); q < n; q++) {
          const ts = A.start[q] * 1000;
          if (ts < T[j] - EL_ENTRY_SNAP) continue;
          if (ts > T[j] + EL_ENTRY_SNAP) break;
          const a = A.lmax[q] - A.l0[q];
          if (a > aBest) { aBest = a; tBest = ts; }
        }
        tt.push(tBest); ss.push(Math.min(1, r3[i] / 0.7));
      }
      el[b === "mid" ? "mEntT" : "aEntT"] = Float64Array.from(tt);
      el[b === "mid" ? "mEntS" : "aEntS"] = Float32Array.from(ss);
    }
    // (j) harmony home (circle of fifths, duration weighted) and the melody's mean angle (reduced motion: the glint
    // stays there)
    let cx = 0, cy = 0, mx = 0, my = 0;
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, gx = 0, gy = 0, s2 = 0;
      for (let p = 0; p < 12; p++) {
        const v = A.pit[i * 12 + p], v2 = v * v;
        x += v * EL_FIFTH_COS[p]; y += v * EL_FIFTH_SIN[p];
        gx += v2 * EL_PC_COS[p]; gy += v2 * EL_PC_SIN[p]; s2 += v2;
      }
      cx += x * A.dur[i]; cy += y * A.dur[i];
      if (s2 > 1e-9) { mx += (gx / s2) * A.dur[i]; my += (gy / s2) * A.dur[i]; }
    }
    el.home = Math.atan2(cy, cx);
    el.gHome = mx || my ? Math.atan2(my, mx) : -Math.PI / 2;
    return el;
  }
  /** stage 2: the band rows, the bars ("o grave entrou", the riser ramp), the tick classifiers (hats / snares) */
  function elDigest2(d, A, M, el) {
    M = M || {};
    const BM = M.band || EL_BAND, CM = M.cls || EL_CLS, segs = d.segments, n = A.n;
    // (b) per-segment features + the band rows (sub, bass, highmid, air: dB)
    const X = new Float64Array(n * 17), st = new Float64Array(n), en = new Float64Array(n), satt = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s = segs[i] || {}, tv = Array.isArray(s.timbre) ? s.timbre : [], o = i * 17;
      const du = num(s.duration, 0) * 1000, lm = num(s.loudness_max, -60), l0 = num(s.loudness_start, -60), d1 = Math.max(du, 1);
      for (let j = 0; j < 12; j++) X[o + j] = num(tv[j], 0);
      X[o + 12] = lm; X[o + 13] = l0; X[o + 14] = Math.max(0, lm - l0); X[o + 15] = Math.log(d1);
      X[o + 16] = clamp(num(s.loudness_max_time, 0) * 1000 / d1, 0, 1);
      st[i] = A.start[i] * 1000; en[i] = st[i] + du; satt[i] = X[o + 14];
    }
    const BN = ["sub", "bass", "highmid", "air"], LV = BN.map(() => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      const o = i * 17;
      for (let b = 0; b < 4; b++) {
        const w = BM.W[BN[b]];
        let s = w[0];
        for (let j = 0; j < 17; j++) s += w[j + 1] * (X[o + j] - BM.mu[j]) / BM.sd[j];
        LV[b][i] = X[o + 12] + s;
      }
    }
    // (c) bars: duration-weighted power mean of each band row, present-ness PB (track's p10 -> 0, p95 -> 1), density
    const bs = elStarts(d.bars), nb = bs.length, bd = new Float64Array(nb);
    { const bl = (Array.isArray(d.bars) ? d.bars : []).filter((b) => b && isFinite(b.start)); for (let q = 0; q < nb; q++) bd[q] = num(bl[q].duration, 0) * 1000; }
    const BdB = BN.map(() => new Float64Array(nb)), dens = new Float64Array(nb);
    for (let q = 0; q < nb; q++) {
      const a = bs[q], e = a + bd[q];
      let i = Math.max(0, elLB(st, a) - 1);
      while (i > 0 && en[i - 1] > a) i--;
      let ov = 0, cntA = 0;
      const pw = [0, 0, 0, 0];
      for (; i < n && st[i] < e; i++) {
        if (st[i] >= a && satt[i] > 6) cntA++;
        const o = Math.min(en[i], e) - Math.max(st[i], a);
        if (!(o > 0)) continue;
        ov += o;
        for (let b = 0; b < 4; b++) pw[b] += Math.pow(10, LV[b][i] / 10) * o;
      }
      for (let b = 0; b < 4; b++) BdB[b][q] = ov > 0 ? 10 * Math.log10(pw[b] / ov + 1e-12) : NaN;
      dens[q] = cntA / Math.max(0.5, bd[q] / 1000);
    }
    const PB = BN.map(() => new Float64Array(nb));
    for (let b = 0; b < 4; b++) {
      const col = BdB[b];
      let mn = Infinity;
      for (let q = 0; q < nb; q++) if (isFinite(col[q]) && col[q] < mn) mn = col[q];
      for (let q = 0; q < nb; q++) if (!isFinite(col[q])) col[q] = isFinite(mn) ? mn : -60;
      const lo = elPct(col, 0.10), hi = elPct(col, 0.95);
      for (let q = 0; q < nb; q++) PB[b][q] = elN01(col[q], lo, hi);
    }
    const dLo = nb ? elPct(dens, 0.10) : 0, dHi = nb ? elPct(dens, 0.90) : 1, densN = new Float64Array(nb);
    for (let q = 0; q < nb; q++) densN[q] = elN01(dens[q], dLo, dHi);
    // "o grave entrou" (G3): sub or bass rose >= 7.5 / 8 dB over the louder of the two bars before, the next bar holds
    let entK = [], entS0 = [];
    for (let q = 2; q < nb - 1; q++) {
      let e = 0;
      for (const [b, th] of [[0, EL_BAR_DB.sub], [1, EL_BAR_DB.bass]]) {
        const B = BdB[b], r = B[q] - Math.max(B[q - 1], B[q - 2]), hold = B[q + 1] - B[q];
        if (r >= th && hold >= -th / 2 && PB[b][q] >= EL_BAR_PB) e = Math.max(e, Math.min(1, 0.5 + 0.5 * (r - th) / th));
      }
      if (e > 0) { entK.push(q); entS0.push(e); }
    }
    // v5b-r2: WHERE in that bar the low end comes in. Spotify's bar line is often not the drop (an impact or a silent
    // gap before it, the 808 landing a beat later): the anchor is the segment start in [bar - 1 beat, bar + 2 beats]
    // after which the sub + bass band rows step up most (power mean EL_ANC_WIN ms after vs before); elSyncHits then
    // lands it on the strongest hit >= 0.2 within +-EL_ANC_SNAP ms (reference set: on the real low-end step 33 % -> 65 %)
    const plow = new Float64Array(n);
    for (let i = 0; i < n; i++) plow[i] = Math.pow(10, LV[0][i] / 10) + Math.pow(10, LV[1][i] / 10);
    const segLvl = (a, b) => {
      let i = Math.max(0, elLB(st, a) - 1), s = 0, o = 0;
      while (i > 0 && en[i - 1] > a) i--;
      for (; i < n && st[i] < b; i++) { const ov = Math.min(en[i], b) - Math.max(st[i], a); if (ov > 0) { s += plow[i] * ov; o += ov; } }
      return o > 0 ? 10 * Math.log10(s / o + 1e-12) : NaN;
    };
    const BT = A.beatT || [];
    let entA = [], entStep = [];
    for (let q = 0; q < entK.length; q++) {
      const c = bs[entK[q]], j = nearestIdx(BT, c);
      const beat = j >= 0 && BT.length > 1 ? clamp(j + 1 < BT.length ? BT[j + 1] - BT[j] : BT[j] - BT[j - 1], 250, 1000) : 500;
      let best = c, bsc = -Infinity;
      for (let i = elLB(st, c - EL_ANC_LO * beat); i < n && st[i] <= c + EL_ANC_HI * beat; i++) {
        const sc = segLvl(st[i], st[i] + EL_ANC_WIN) - segLvl(st[i] - EL_ANC_WIN, st[i]);
        if (sc > bsc) { bsc = sc; best = st[i]; }
      }
      for (let i = elLB(st, c - EL_ANC_LO * beat); i < n && st[i] < best; i++) {   // r3: a near-tie goes to the earliest
        const sc = segLvl(st[i], st[i] + EL_ANC_WIN) - segLvl(st[i] - EL_ANC_WIN, st[i]);
        if (sc >= bsc - EL_ANC_TIE && sc >= 2) { best = st[i]; break; }
      }
      entA.push(best); entStep.push(isFinite(bsc) ? bsc : 0);
    }
    // one drop, one shockwave: of two entries closer than EL_ENT_GAP bars / ms the first stays (it is the drop and owns
    // the riser), unless the later one's band-row step is EL_ENT_WIN_DB bigger
    {
      const keep = entK.map(() => true);
      for (let q = 1; q < entK.length; q++) {
        let p = q - 1;
        while (p >= 0 && !keep[p]) p--;
        if (p < 0 || (entK[q] - entK[p] > EL_ENT_GAP_BARS && entA[q] - entA[p] > EL_ENT_GAP_MS)) continue;
        if (entStep[q] > entStep[p] + EL_ENT_WIN_DB) keep[p] = false; else keep[q] = false;
      }
      const f = (a) => a.filter((_, q) => keep[q]);
      entK = f(entK); entS0 = f(entS0); entA = f(entA); entStep = f(entStep);
    }
    // (d) riser ramp (G4): the bars before an entry whose low end is out (<= 8), when the highs / density climb or
    // the low end stays low; ((j - s + 1) / L)^1.5 up to the entry, which releases it (elFrame: at the entry's anchored
    // time). v5b-r2: the look-back only extends over bars whose band rows are >= EL_RAMP_OUT_DB under the entry bar (no
    // ramp while the bass plays). A gate on the anchor's band-row step was tried and dropped: on the reference set it removed 4 real
    // build-ups for 1 false one (the false ramps are band-row misreadings, not visible in the analysis)
    const lowB = new Float64Array(nb), topB = new Float64Array(nb), lowD = new Float64Array(nb), build = new Float32Array(nb);
    for (let q = 0; q < nb; q++) {
      lowB[q] = Math.max(PB[0][q], PB[1][q]); topB[q] = Math.max(PB[2][q], PB[3][q]);
      lowD[q] = 10 * Math.log10(Math.pow(10, BdB[0][q] / 10) + Math.pow(10, BdB[1][q] / 10));
    }
    for (let e = 0; e < entK.length; e++) {
      const kd = entK[e], out = (q) => lowB[q] < 0.5 && lowD[q] <= lowD[kd] - EL_RAMP_OUT_DB;
      if (kd < 2) continue;
      let s = kd - 1;
      while (s > Math.max(0, kd - EL_BUILD_BARS) && out(s - 1)) s--;
      const L = kd - s;
      if (L < 2) continue;
      let mean = 0;
      for (let q = s; q < kd; q++) mean += lowB[q];
      mean /= L;
      const rising = topB[kd - 1] - topB[s] >= 0.1 || densN[kd - 1] - densN[s] >= 0.15;
      if (rising || mean < 0.4) for (let q = 0; q < L; q++) build[s + q] = Math.max(build[s + q], Math.pow((q + 1) / L, 1.5));
    }
    el.bs = bs; el.bd = Float32Array.from(bd); el.build = build;
    el.entK = Int32Array.from(entK); el.entS0 = Float32Array.from(entS0); el.entA = Float64Array.from(entA); el.entStep = Float32Array.from(entStep);
    // (g-i) tick features of every segment start -> hats (G1) / snares (G2), scores normalised per track
    const bt = elStarts(d.beats), ta = elStarts(d.tatums), Fk = elTickF(X, st, n, bt, ta, bs);
    const pH = new Float64Array(n), pS = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let h = CM.hat[0], s = CM.snare[0];
      for (let j = 0; j < 29; j++) { const z = (Fk[i * 29 + j] - CM.mu[j]) / CM.sd[j]; h += CM.hat[j + 1] * z; s += CM.snare[j + 1] * z; }
      pH[i] = h; pS[i] = s;
    }
    // v5b-r2: normalised over the segments within +-EL_TICK_NORM_MS, not the whole track (that gave the twinkle budget
    // to the sections where the hats are exposed: reference trance drops 41 hats per min against 128 in the intros, with the
    // same or more hi-hats in the drop); the snares keep the whole-track range (local: trance lift +.34 < A5's +.35)
    // v5b-r3: the local range never drops below the track's own (p40 / p85): in a section without hi-hats the local
    // normalisation still marked its top third as hats (reference set: breakdown bars 34 -> 49 per min, P .74 -> .67; bars with no
    // air onset at all 24 -> 31 per min). LOGO (hatfix.py): trance breakdowns 77 -> 67 / min at P .855 -> .901, drops unchanged
    const hN = elLocalN01(pH, st, 0.55, 0.95, EL_TICK_NORM_MS, elPct(pH, 0.40), elPct(pH, 0.85)), s80 = elPct(pS, 0.80), s97 = elPct(pS, 0.97);
    const hT = [], hS = [], cT = [], cS = [];
    for (let i = 0; i < n; i++) {
      const h = hN[i], s = elN01(pS[i], s80, s97);
      if (h >= EL_HAT_MIN) { hT.push(st[i]); hS.push(h); }
      if (s >= EL_SNR_MIN) { cT.push(st[i]); cS.push(s); }
    }
    el.hatT = Float64Array.from(hT); el.hatS = Float32Array.from(hS);
    el.snCT = Float64Array.from(cT); el.snCS = Float32Array.from(cS);
    if (M.keepF) { el.tickF = Fk; el.pHat = pH; el.pSnr = pS; el.LV = LV; el.BdB = BdB; el.PB = PB; el.densN = densN; }
    elSyncHits(A, el);
    return el;
  }
  /** v5b-r2: per segment, its score between the lo / hi percentiles (numpy's linear one) of the segments starting within
      +-W ms (a sliding sorted window: O(n x window), ~2 ms for a 5 min track); r3: each bound at least loF / hiF */
  function elLocalN01(p, st, lo, hi, W, loF, hiF) {
    const n = p.length, out = new Float64Array(n), buf = new Float64Array(n);
    let a = 0, b = 0, m = 0;
    const at = (v) => { let l = 0, h = m; while (l < h) { const k = (l + h) >> 1; if (buf[k] < v) l = k + 1; else h = k; } return l; };
    const q = (pp) => { const r = pp * (m - 1), i = Math.floor(r), f = r - i; return i + 1 < m ? buf[i] + (buf[i + 1] - buf[i]) * f : buf[i]; };
    for (let i = 0; i < n; i++) {
      while (b < n && st[b] <= st[i] + W) { const v = p[b++], l = at(v); buf.copyWithin(l + 1, l, m); buf[l] = v; m++; }
      while (a < n && st[a] < st[i] - W) { const l = at(p[a++]); buf.copyWithin(l, l + 1, m); m--; }
      out[i] = elN01(p[i], loF != null ? Math.max(q(lo), loF) : q(lo), hiF != null ? Math.max(q(hi), hiF) : q(hi));
    }
    return out;
  }
  /** the 29 tick features (music-first tick_features) of every segment start; X = the 17 band-row features */
  function elTickF(X, st, n, bt, ta, bs) {
    const out = new Float64Array(n * 29), D = [0, 1, 2, 3, 12, 14];
    const ph = (g, t) => {
      if (g.length < 2) return 0;
      const j = elLB(g, t), a = g[Math.max(0, j - 1)], b = g[Math.min(g.length - 1, j)];
      const per = b > a ? Math.max(1, b - a) : 500;
      return Math.min(Math.abs(t - a), Math.abs(b - t)) / per;
    };
    for (let i = 0; i < n; i++) {
      const o = i * 29, x = i * 17, t = st[i];
      for (let j = 0; j < 17; j++) out[o + j] = X[x + j];
      for (let j = 0; j < 6; j++) out[o + 17 + j] = i ? X[x + D[j]] - X[x - 17 + D[j]] : 0;
      const pb = ph(bt, t);
      out[o + 23] = pb; out[o + 24] = ph(ta, t);
      const kbar = bs.length ? elLB(bs, t + 30) - 1 : -1;
      const bib = kbar >= 0 ? Math.max(0, elLB(bt, t - 30) - elLB(bt, bs[kbar] - 30)) : 0;
      out[o + 25 + Math.min(3, bib)] = pb < 0.12 ? 1 : 0;
    }
    return out;
  }
  /** the parts that depend on the hit list ("Ritmo do visual"): bar entries snapped onto the strongest hit >= 0.2
      within +-120 ms (they land on the kick), snares that are > 45 ms from every hit >= 0.2. Rebuilt when buildHits
      changed mode. */
  function elSyncHits(A, el) {
    const mode = A.hitMode || "";
    if (el.mode === mode && el.entT) return;
    el.mode = mode;
    const HT = A.hitT || [], HS = A.hitS || [];
    const eT = new Float64Array(el.entK.length), eS = new Float32Array(el.entK.length);
    // v5b-r2: from the low-end anchor (elDigest2), not from the bar line or the kick clock; the strongest hit >= 0.2
    // within +-EL_ANC_SNAP ms of it (the kick that carries the drop), else the anchor itself; r3: x EL_ENT_WEAK when the
    // anchor is unsure (a small band-row step and no strong hit on it)
    for (let q = 0; q < el.entK.length; q++) {
      const a = el.entA ? el.entA[q] : el.bs[el.entK[q]];
      let best = a, bs = -1;
      for (let h = elLB(HT, a - EL_ANC_SNAP); h < HT.length && HT[h] <= a + EL_ANC_SNAP; h++) if (HS[h] >= 0.2 && HS[h] > bs) { bs = HS[h]; best = HT[h]; }
      eT[q] = best;
      const sure = !el.entStep || el.entStep[q] >= EL_ENT_CONF_DB || bs >= EL_ENT_CONF_HIT;
      eS[q] = el.entS0[q] * (sure ? 1 : EL_ENT_WEAK);
    }
    el.entT = eT; el.entS = eS;
    // v5b-r2: inside a four-on-the-floor kick run (trance / house drops) a snap needs a much clearer score: there the
    // candidates off the kicks are mostly open hats and stabs (reference trance drops: P .22)
    const sT = [], sS = [], KB = A.kT || A.beatT, run = (t) => { const j = A.four >= 0.5 ? nearestIdx(KB, t) : -1; return j >= 0 && A.bSteady && A.bSteady[j] >= 0.5; };
    for (let q = 0; q < el.snCT.length; q++) {
      const t = el.snCT[q];
      if (el.snCS[q] < EL_SNR_RUN_MIN && run(t)) continue;
      let kick = false;
      for (let h = elLB(HT, t - EL_SNR_KICK_MS); h < HT.length && HT[h] <= t + EL_SNR_KICK_MS; h++) if (HS[h] >= 0.2) { kick = true; break; }
      if (!kick) { sT.push(t); sS.push(el.snCS[q]); }
    }
    el.snT = Float64Array.from(sT); el.snS = Float32Array.from(sS);
  }
  /** v5b: the layers' digest off the frame, in three short tasks (stages 0, 1, 2); A.el appears when all are
      done (until then the layers run on their gentle fallback, then fade in over EL_FADE_MS) */
  function elAttachDeferred(d, A) {
    const parts = [], fail = (e) => { A.elErr = String((e && e.message) || e).slice(0, 160); };
    const timed = (f) => { const t = now(), r = f(); parts.push(+(now() - t).toFixed(2)); return r; };
    setTimeout(() => {
      if (S.destroyed || !A || A.el) return;
      let FP, el;
      try { FP = timed(() => elFeatures(d, A)); } catch (e) { fail(e); return; }
      setTimeout(() => {
        if (S.destroyed || A.el) return;
        try { el = timed(() => elDigest1(d, A, null, FP)); } catch (e) { fail(e); return; }
        setTimeout(() => {
          if (S.destroyed || A.el) return;
          try { timed(() => elDigest2(d, A, null, el)); el.msParts = parts; el.ms = parts.reduce((a, b) => a + b, 0); A.el = el; } catch (e) { fail(e); }
        }, 0);
      }, 0);
    }, 0);
  }
  /** v5b: the layers' digest for a digested analysis A, synchronously (tests; the theme defers it: elAttachDeferred) */
  function elAttach(d, A, M) {
    if (!A) return null;
    const t0 = now();
    try { A.el = elDigest(d, A, M); A.el.ms = now() - t0; } catch (e) { A.el = null; A.elErr = String((e && e.message) || e).slice(0, 160); }
    return A.el;
  }
  const EL_FIFTH_COS = new Float64Array(12), EL_FIFTH_SIN = new Float64Array(12), EL_PC_COS = new Float64Array(12), EL_PC_SIN = new Float64Array(12);
  for (let p = 0; p < 12; p++) {
    const a = (((p * 7) % 12) / 12) * TAU, b = (TAU * p) / 12 - Math.PI / 2;   // circle of fifths; chroma wheel, C at the top
    EL_FIFTH_COS[p] = Math.cos(a); EL_FIFTH_SIN[p] = Math.sin(a); EL_PC_COS[p] = Math.cos(b); EL_PC_SIN[p] = Math.sin(b);
  }

  // ---- settings -> amounts ----------------------------------------------------------------------------------------
  /** the box's amounts (0..5 each, 0 when its toggle is off) or null when "Camadas por elemento" is off */
  function elAmounts(L) {
    if (!L || !L.on) return null;
    const a = (o) => (o && o.on ? clamp(num(Number(o.amount), 100), 0, INT_MAX) / 100 : 0);
    return { G: a(L.low), V: a(L.voice), A: a(L.air), E: a(L.entry), S: a(L.snare), M: a(L.mood), hue: L.hue !== false };
  }
  const EL_K = { cfg: null, k: null };
  // final-build: while S.pvSolo highlights a part in the preview, elK() returns the dimmed amounts (set / cleared around the
  // preview's own drawing only, in renderPreview)
  let EL_OVR = null;
  function elKcfg() {                             // final-fix: the saved amounts (never the preview's highlight)
    if (EL_K.cfg !== CFG) { EL_K.cfg = CFG; EL_K.k = elAmounts(CFG.layers); }
    return EL_K.k;
  }
  function elK() {
    if (EL_OVR) return EL_OVR;
    return elKcfg();
  }
  /** final-fix: how much of the soft mode's low end (G), energy (V) and hats (A) the layers leave uncovered (0..1 each);
      L: the layers are on at all */
  const EL_UNC = { k: undefined, o: null };
  function softUncovered() {
    const K = elKcfg();
    if (EL_UNC.k !== K) {
      EL_UNC.k = K;
      EL_UNC.o = K ? { L: 1, G: 1 - Math.min(1, K.G), V: 1 - Math.min(1, K.V), A: 1 - Math.min(1, K.A) } : { L: 0, G: 1, V: 1, A: 1 };
    }
    return EL_UNC.o;
  }
  /** the layers' drives for a view's frame ({ K, E }), or null: the renderers then draw exactly v5 */
  function elOf(sig) {
    const K = elK(), E = K && sig && sig.ext ? sig.ext.el : null;
    return E ? { K, E } : null;
  }
  /** layout parts that depend on the box: "" when off (the v5 key), else the layers' own layout parts (zone colours) */
  const elGeoKey = () => { const K = elK(); return K ? (K.A > 0 ? "|L2" : "|L1") : ""; };

  // ---- per frame: the "el" signal tap (SIGNAL_TAPS) writes Z.ext.el ----------------------------------------------
  function newElState() {
    return { low: 0, mid: 0, air: 0, ready: 0, src: "fallback",
      ent: 0, entAge: 1e9, entMid: 0, entMidAge: 1e9, entAir: 0, entAirAge: 1e9, fMid: 0, fAir: 0, hatAct: 0, demo: null,
      hatN: 0, hatEnv: 0, hatId: new Int32Array(EL_TICKS), hatAge: new Float32Array(EL_TICKS), hatS: new Float32Array(EL_TICKS),
      snap: 0, snapAge: 1e9, rise: 0, calm: 0, calmH: 0, calmHit: -1, hitK: 1, harm: 0, hx: 1, hy: 0, gx: 0, gy: -1e-3, gAng: -Math.PI / 2, gR: 0, glint: 0, gHome: -Math.PI / 2,
      duck: 1, lg: 1, seekAt: -1e18, seeks: 0, pPrev: null, track: null };
  }
  const elEnv = (age) => (age < 40 ? age / 40 : Math.pow(1 - (age - 40) / (EL_ENTRY_MS - 40), 2));
  const elFlash = (age) => (age < 40 ? age / 40 : age < EL_FLASH_MS ? Math.pow(1 - (age - 40) / (EL_FLASH_MS - 40), 2) : 0);
  function elFrame(Z, A, pA, dt, playing) {
    if (!elK()) { Z.ext.el = null; return; }
    let E = Z.ext.el;
    if (!E) E = Z.ext.el = newElState();
    // pause: the layers fade out within ~0.5 s (their own 85 ms gate on top of the scene's 480 ms one), every release
    // shortened to 85 ms, so nothing hangs on screen while the music is stopped
    E.lg += ((playing ? 1 : 0) - E.lg) * (1 - Math.exp(-dt / (playing ? 140 : 85)));
    const gate = Z.gate * E.lg, el = A && A.el, rel = playing ? 1e9 : 85;
    const fk = (up, dn, x, v) => 1 - Math.exp(-dt / (x > v ? up : Math.min(dn, rel)));
    // G7: a track change, a restart or a seek (> 250 ms jump of the audible time): no event before the jump fires, no
    // tick is kept, and nothing new fires in the 250 ms after it (E.seekAt = the jump + 250 ms)
    if (E.track !== (A || null)) { E.track = A || null; E.seekAt = pA + EL_SEEK_MS; E.ready = 0; E.hatN = 0; E.ent = E.entMid = E.entAir = E.snap = 0; }
    else if (E.pPrev != null && Math.abs(pA - E.pPrev - dt) > EL_SEEK_MS) { E.seekAt = pA + EL_SEEK_MS; E.seeks++; E.hatN = 0; }
    E.pPrev = pA;
    const so = num(Z.soft, 0), SG = so > 0 ? Z.sg : null;   // final-build "modo ambiente suave"
    if (!el) {                                     // no analysis (or its layers not digested yet): gentle levels, no events
      E.src = SG && so > 0.5 ? "soft" : "fallback";
      // (the soft drives are smooth already: their follower shortens to 150 ms, so the 0.1-0.5 Hz drift is not filtered away)
      for (const b of ["low", "mid", "air"]) E[b] += ((SG ? 0.25 + (SG[b] - 0.25) * so : 0.25) * gate - E[b]) * (1 - Math.exp(-dt / Math.min(SG ? 600 - 450 * so : 600, rel)));
      E.ent = E.entMid = E.entAir = E.snap = E.fMid = E.fAir = 0; E.entAge = E.entMidAge = E.entAirAge = E.snapAge = 1e9; E.hatN = 0; E.hatEnv = 0; E.duck = 1;
      E.hatAct += (0 - E.hatAct) * (1 - Math.exp(-dt / 300));
      E.rise += (0 - E.rise) * (1 - Math.exp(-dt / 250));
      E.calm += (0 - E.calm) * (1 - Math.exp(-dt / 250));
      E.calmH = 0; E.hitK = 1;
      if (SG) {                                    // final-build: the halo colour drifts, the glint turns slowly round the cover
        const kg = 1 - Math.exp(-dt / 900);
        E.gx += (0.45 * Math.cos(SG.gAng) - E.gx) * kg; E.gy += (0.45 * Math.sin(SG.gAng) - E.gy) * kg;
        E.gAng = Math.atan2(E.gy, E.gx); E.gR = Math.hypot(E.gx, E.gy);
        E.glint += (0.6 * E.mid * so - E.glint) * (1 - Math.exp(-dt / 400));
        E.harm += (SG.harm * so - E.harm) * (1 - Math.exp(-dt / 1500));
      } else {
        E.glint += (0 - E.glint) * (1 - Math.exp(-dt / 200));
        E.harm += (0 - E.harm) * (1 - Math.exp(-dt / 2500));
      }
      return;
    }
    E.src = "analysis";
    E.ready = Math.min(1, E.ready + dt / EL_FADE_MS);
    const r = E.ready;
    elSyncHits(A, el);                             // "Ritmo do visual" changed: snare list / entry snap follow the hits
    // LOW / MID / AIR: the layer's own attack / release. v6-r2: without drums (1 - drums present) the voice and the air
    // rise slower (ND_MID_ATT / ND_AIR_ATT more), so in a voice-only part they breathe instead of jumping on every
    // syllable / sibilant (rap a cappella: the ring's sides rose ~38 times a minute)
    const nd = 1 - clamp(num(Z.drums, 1), 0, 1);
    for (const b of ["low", "mid", "air"]) {
      let x = (el.lev[b] ? elSample(el.lev[b], pA) : 0) * gate * r + 0.25 * gate * (1 - r);
      const ar = EL_AR[b];
      if (SG) x += (SG[b] * gate - x) * so;        // final-build: a late analysis takes over from the soft mode
      const up = ar[0] + (b === "mid" ? ND_MID_ATT : b === "air" ? ND_AIR_ATT : ND_LOW_ATT) * nd;   // v6-r3: "Grave" too
      E[b] += (x - E[b]) * fk(up, ar[1], x, E[b]);
    }
    // "o grave entrou": the latest entry at or before pA (after the last seek), 40 ms rise then a squared fall
    let k = lastAtOrBefore(el.entT, pA);
    E.entAge = k >= 0 && el.entT[k] >= E.seekAt ? pA - el.entT[k] : 1e9;
    E.ent = E.entAge < EL_ENTRY_MS ? el.entS[k] * elEnv(E.entAge) * gate * r : 0;
    k = lastAtOrBefore(el.mEntT, pA);
    E.entMidAge = k >= 0 && el.mEntT[k] >= E.seekAt ? pA - el.mEntT[k] : 1e9;
    E.entMid = E.entMidAge < EL_ENTRY_MS ? 0.6 * el.mEntS[k] * elEnv(E.entMidAge) * gate * r : 0;
    E.fMid = E.entMidAge < EL_FLASH_MS ? el.mEntS[k] * elFlash(E.entMidAge) * gate * r : 0;   // r3: the entry's flash
    k = lastAtOrBefore(el.aEntT, pA);
    E.entAirAge = k >= 0 && el.aEntT[k] >= E.seekAt ? pA - el.aEntT[k] : 1e9;
    E.entAir = E.entAirAge < EL_ENTRY_MS ? 0.6 * el.aEntS[k] * elEnv(E.entAirAge) * gate * r : 0;
    E.fAir = E.entAirAge < EL_FLASH_MS ? el.aEntS[k] * elFlash(E.entAirAge) * gate * r : 0;
    // hat ticks: the last <= 8 within 450 ms (ids kept for the twinkle pattern), strength x (0.75 + 0.25 AIR) (r3; r2: 0.4 +
    // 0.6 AIR, so a low AIR reading - "Land Of Freedom" .10-.12 in its first drop - took the twinkles away)
    let h = lastAtOrBefore(el.hatT, pA), m = 0, env = 0;
    const dz = num(Z.drums, 1), hs = (0.75 + 0.25 * E.air) * gate * r * dz;   // v6: x drums present
    while (h >= 0 && m < EL_TICKS) {
      const t = el.hatT[h], age = pA - t;
      if (age >= EL_TICK_WIN || t < E.seekAt) break;
      const s = el.hatS[h] * hs;
      E.hatId[m] = h; E.hatAge[m] = age; E.hatS[m] = s;
      const e = s * Math.exp(-age / EL_TWINKLE_MS);
      if (e > env) env = e;
      m++; h--;
    }
    E.hatN = m; E.hatEnv = env;
    E.hatAct += (Math.min(1, m / 2) * gate * dz - E.hatAct) * (1 - Math.exp(-dt / (m >= 2 ? 120 : 600)));   // r3: hats are playing
    // snare / clap: a 160 ms flick
    k = lastAtOrBefore(el.snT, pA);
    E.snapAge = k >= 0 && el.snT[k] >= E.seekAt ? pA - el.snT[k] : 1e9;
    E.snap = E.snapAge < 640 ? el.snS[k] * Math.exp(-E.snapAge / EL_SNAP_MS) * gate * r * dz : 0;
    // riser: the bar ramp (interpolated inside a rising bar), released at once by the entry
    let R = 0;
    const bk = lastAtOrBefore(el.bs, pA);
    if (bk >= 0) {
      const b0 = el.build[bk], b1 = bk + 1 < el.bs.length ? el.build[bk + 1] : 0;
      R = b1 >= b0 ? b0 + (b1 - b0) * clamp((pA - el.bs[bk]) / Math.max(1, el.bd[bk]), 0, 1) : b0;
      // v5b-r2: the ramp is released by the drop itself (its anchored time), not by the bar line: it holds its top
      // into the entry bar until the entry fires, and an entry that lands before its bar line has already released it
      const ke = elLB(el.entT, pA);
      if (ke < el.entT.length && el.entK[ke] === bk && bk > 0) R = Math.max(R, el.build[bk - 1]);
      if (ke > 0 && el.entK[ke - 1] > bk) R = 0;
    }
    const xr = R * gate * r;
    E.rise += (xr - E.rise) * fk(250, 120, xr, E.rise);
    if (E.ent > 0.5) E.rise = 0;
    // the sidechain of "Grave" AFTER each hit >= 0.12 (the hit list of the current "Ritmo do visual"): from the hit's
    // peak, deeper for stronger hits, swelling back with EL_SC_MS; the last 3 hits (a dense run keeps it pumping)
    let du = 1;
    const HT = A.hitT, HS = A.hitS;
    if (HT && HT.length) {
      for (let j = lastAtOrBefore(HT, pA), m = 0; j >= 0 && m < 3; j--, m++) {
        if (HS[j] < EL_DUCK_HIT) continue;
        const age = pA - HT[j] - A.hitA[j] - PEAK_HOLD_MS;
        if (age > 8 * EL_SC_MS) break;
        if (age >= 0) du = Math.min(du, 1 - EL_SC * clamp((HS[j] - 0.08) / 0.25, 0, 1) * Math.exp(-age / EL_SC_MS));
      }
    }
    E.duck = 1 - (1 - du) * num(E.hitK, 1);
    if (SG) E.duck = 1 - (1 - E.duck) * (1 - so);   // final-build: the sidechain fades in with the hand-over's kicks
    // breakdown calm: fades in over ~0.9 s, the bass entry ends it at once (v5b: within ~0.2 s)
    const xc = elSample(el.calm, pA) * r * E.lg;
    E.calm += (xc - E.calm) * (1 - Math.exp(-dt / (xc > E.calm ? 900 : Math.min(rel, 900))));
    if (E.ent > 0.3) E.calm = 0;
    // v5b-r2 "Subidas e calmarias" on the HIT path: in a breakdown the beat-grid hits (the four-on-the-floor run and its
    // soft tick, carried into the breakdown by the run logic: on reference trance breakdowns 121 per min, 13 % on a real low
    // onset) and the weak model hits (< 0.35) shrink by up to 80 %, so the crown / bars / wave and the camera really
    // rest and the drop has contrast; a real bass-model kick (>= 0.45; there: 88 % on a low onset) lands in full. Its
    // own calm (calmH) restarts at 0 on every model hit >= 0.5 and on the entry, so the first drop kicks are never held
    // back by the 2 s calm smoothing.
    // v5b-r3: "a model hit" = the largest bass-MODEL strength merged into the dominant hit (Z.k.m), not the merge winner's
    // source (r2: a real kick that a stronger grid beat won counted as a grid hit; in a calm a steady kick then shrank
    // 1 -> .62 -> .41 -> .27 -> .19 -> .15 until the next one the model happened to win: 54 of 178 reference kicks)
    const km = Z.k ? num(Z.k.m, 0) : 0;
    if (E.ent > 0.3 || (km >= 0.5 && Z.k.t !== E.calmHit)) { E.calmH = 0; if (km >= 0.5) E.calmHit = Z.k.t; }
    else E.calmH += (Math.min(E.calm, xc) - E.calmH) * (1 - Math.exp(-dt / (E.calm > E.calmH ? 900 : 200)));
    const Km = elK(), wk = 1 - smooth(clamp((km - 0.35) / 0.1, 0, 1));
    E.hitK = 1 - Math.min(0.85, 0.95 * Math.min(1, Km ? Km.M : 0) * E.calmH) * wk;
    // v6-r3: a bass that enters under the voice, with the drums not back a bar later, punches softer (at a zoom of 180 %
    // / glow 205 % one such entry was an 11.5 % zoom + a white flash in the middle of a voice-only breakdown). Applied after
    // the calm / riser logic above, which keeps using the entry's own strength
    if (E.ent > 0 && ND_ENT_ND < 1) {
      const ke = lastAtOrBefore(el.entT, pA), bar = 240000 / clamp(num(A.tempo, 0) > 0 ? A.tempo : 120, 40, 240);
      E.ent *= ND_ENT_ND + (1 - ND_ENT_ND) * Math.max(clamp(num(Z.drums, 1), 0, 1), ke >= 0 ? drumsAt(A, el.entT[ke] + bar) : 1);
    }
    // harmony (circle of fifths, 2.5 s) relative to the track's home; melody glint (chroma circular mean, 120 ms)
    const P = Z.P12;
    let x = 0, y = 0, gx = 0, gy = 0, s2 = 0;
    for (let p = 0; p < 12; p++) {
      const v = P[p], v2 = v * v;
      x += v * EL_FIFTH_COS[p]; y += v * EL_FIFTH_SIN[p];
      gx += v2 * EL_PC_COS[p]; gy += v2 * EL_PC_SIN[p]; s2 += v2;
    }
    const L = Math.hypot(x, y) || 1, kh = 1 - Math.exp(-dt / 2500), kg = 1 - Math.exp(-dt / 120);
    E.hx += (x / L - E.hx) * kh; E.hy += (y / L - E.hy) * kh;
    E.harm = 0.5 - 0.5 * Math.cos(Math.atan2(E.hy, E.hx) - el.home);
    if (SG) E.harm += (SG.harm - E.harm) * so;     // final-build: the hand-over keeps the soft mode's colour, then lets go
    if (s2 > 1e-9) { E.gx += (gx / s2 - E.gx) * kg; E.gy += (gy / s2 - E.gy) * kg; }
    E.gAng = Math.atan2(E.gy, E.gx); E.gR = Math.hypot(E.gx, E.gy); E.gHome = el.gHome;
    E.glint = E.mid * clamp((E.gR - 0.15) / 0.5, 0, 1);
  }
  SIGNAL_TAPS.push({ id: "el", fn: elFrame });
  /** v5b-r3: a one-off SAMPLE in the panel's "Prévia ao vivo" while someone moves "Quando o grave entra" / "Subidas e
      calmarias" (both show only at a drop, a riser or a breakdown, so in the preview their sliders seemed to do nothing):
      the preview's layers get a shockwave now (entry), or a 1.2 s riser that drops into one (mood), at the slider's
      amount. Wall-clock time, the preview only (never the overlay); S.pvDemo = { k: "entry" | "mood", at } */
  const EL_DEMO_RISE = 1200;
  function elDemoFrame(Z) {
    const D = S.pvDemo, E = Z.ext && Z.ext.el;
    if (Z !== SIG.preview || !D || !E) return;
    const age = now() - D.at, ent = (a) => { E.entAge = a; E.ent = Math.max(E.ent, elEnv(a)); E.calm = 0; };
    if (D.k === "entry") { if (age > EL_ENTRY_MS) S.pvDemo = null; else ent(age); return; }
    if (age > EL_DEMO_RISE + EL_ENTRY_MS) { S.pvDemo = null; return; }
    if (age < EL_DEMO_RISE) E.rise = Math.max(E.rise, Math.pow(age / EL_DEMO_RISE, 1.5));
    else { E.rise = 0; ent(age - EL_DEMO_RISE); }
  }
  SIGNAL_TAPS.push({ id: "elDemo", fn: elDemoFrame });
  /** final-build: a SAMPLE beat in the panel's preview while a beat-driven control is moved ("Intensidade", "Volta",
      "Tracinhos", "Zoom / Brilho na batida", "Balanço no ritmo") and the music has no beat at that moment (no analysis, or a
      part without drums): 3 kicks 500 ms apart (0.85) and a 120 BPM groove, so the change shows. The preview only (never
      the overlay); S.pvKick = { at }. "Caixa e palmas" gets 2 sample snaps the same way (S.pvSnap) */
  const PV_KICK_N = 3, PV_KICK_GAP = 500;
  function pvKickFrame(Z) {
    if (Z !== SIG.preview) return;
    const D = S.pvKick, T = now();
    if (D) {
      const age = T - D.at;
      if (age < 0 || age > PV_KICK_N * PV_KICK_GAP) S.pvKick = null;
      else {
        const j = Math.floor(age / PV_KICK_GAP), sh = hitShape(age - j * PV_KICK_GAP, 15, 170, 0), pk = 0.85, env = Z.gate;
        if (pk * sh * env > Z.kick) {
          Z.kick = pk * sh * env; Z.kickPk = pk; Z.kickSh = sh * env; Z.kickCam = sh * env; Z.kickZ = 1; Z.kickVis = 1; Z.kickId = D.at + j * PV_KICK_GAP;
          Z.slow = Math.max(Z.slow, pk * sh * env); Z.bass = Math.max(Z.bass, Z.kick);
        }
        const ph = (age % PV_KICK_GAP) / PV_KICK_GAP, ge = 0.8 * env;
        Z.groove = Math.max(Z.groove, groovePulse(ph) * ge); Z.sway = Math.cos(Math.PI * (age / PV_KICK_GAP)) * ge;
      }
    }
    const N = S.pvSnap, E = Z.ext && Z.ext.el;
    if (N && E) {
      const age = T - N.at, j = age < 700 ? 0 : 1, a = age - j * 700;
      if (age < 0 || age > 1400) S.pvSnap = null;
      else if (a >= 0) { const sn = 0.9 * Math.exp(-a / EL_SNAP_MS) * Z.gate; if (sn > E.snap) { E.snap = sn; E.snapAge = a; } }
    }
  }
  SIGNAL_TAPS.push({ id: "pvKick", fn: pvKickFrame });

  // ---- scene effects (effectsFrom / applyFxDom) ------------------------------------------------------------------
  const elSz = (k) => (k > 1 ? Math.sqrt(k) : 1);                                                       // sizes past 100 %
  const EL_WHITE = [255, 255, 255];
  const elMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const elRgba = (c, a) => "rgba(" + Math.round(c[0]) + ", " + Math.round(c[1]) + ", " + Math.round(c[2]) + ", " + (a > 0 ? (a < 1 ? a : 1) : 0).toFixed(3) + ")";
  const elHash = (a, b) => {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const EL_COLS = { ver: -1, a1: [255, 77, 255], a2: [53, 231, 255] };
  /** the chosen pair (PAL: presets, "Personalizado", "Combinar com o wallpaper" keep working) */
  function elCols() {
    const v = PAL ? PAL.ver : 0;
    if (EL_COLS.ver !== v) {
      EL_COLS.ver = v;
      const ok = (c) => Array.isArray(c) && c.length === 3 && typeof c[0] === "number";
      if (PAL && ok(PAL.a1) && ok(PAL.a2)) { EL_COLS.a1 = PAL.a1; EL_COLS.a2 = PAL.a2; }
      EL_COLS.waveShadow0 = elRgba(elMix(EL_COLS.a1, EL_WHITE, 0.33), 0.95);
      EL_COLS.glow0 = elRgba(EL_COLS.a1, 0.95); EL_COLS.glow2 = elRgba(EL_COLS.a2, 0.95);
    }
    return EL_COLS;
  }
  /** the per-frame scene part of the layers (fx.el), or null (master off / no channels): camera / glow punch of
      the bass entry, riser vignette + wallpaper creep, breakdown veil / bloom / haze, the halo colour */
  function elScene(sig) {
    const L = elOf(sig);
    if (!L) return null;
    const { K, E } = L, C = elCols(), rm = !!S.reducedMotion, kM = K.M, T = E.rise, Cm = E.calm;
    const h = K.hue ? 0.3 + 0.5 * E.harm : 0.55;
    return {
      K, E, rm, T, C: Cm, cols: C,
      halo: elMix(C.a1, C.a2, h),
      hazeK: Math.max(0.25, 1 - 0.25 * kM * Cm),
      bloomK: Math.max(0.25, 1 - 0.3 * kM * Cm),
      veil: Math.min(0.5, 0.12 * kM * Cm),
      vig: Math.min(0.6, 0.25 * kM * T),
      creep: rm ? 1 : 1 + 0.02 * kM * T,
    };
  }

  // ---- drawn layers (LAYERS): under the style, into its haze canvas, over it --------------------------------------
  const EL_SX = new Float32Array(256), EL_SY = new Float32Array(256), EL_SR = new Float32Array(256), EL_SB = new Float32Array(256), EL_ST = new Float32Array(256), EL_SQ = new Uint8Array(256);
  const EL_TW = new Float32Array(EL_TICKS), EL_TH = new Float32Array(EL_TICKS);
  /** this frame's hat twinkles: weight and lit share per tick slot (a hat lights a pseudo-random part of the points) */
  function elTwinkles(E) {
    const n = E.hatN;
    for (let j = 0; j < n; j++) { const s = E.hatS[j]; EL_TW[j] = s * Math.exp(-E.hatAge[j] / EL_TWINKLE_MS); EL_TH[j] = 0.18 + 0.4 * s; }
    return n;
  }
  function elTw(E, n, i) {
    let tw = 0;
    for (let j = 0; j < n; j++) if (EL_TW[j] > 0.004 && elHash(E.hatId[j], i) < EL_TH[j]) tw += EL_TW[j];
    return tw;
  }
  /** points drawn in <= 8 buckets ("lighter"): 4 brightness levels x plain / twinkling (r3: a twinkling point turns
      white; r2 averaged the whiteness over its whole brightness bucket, so one lit dot among 30 stayed gold), one fill
      each; only the brightest buckets get a shadow */
  function elSparks(c, n, a2, blur) {
    const sb = [0, 0, 0, 0, 0, 0, 0, 0], stw = [0, 0, 0, 0, 0, 0, 0, 0], cn = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      if (EL_SB[i] < 0.01) { EL_SQ[i] = 9; continue; }
      const q = Math.min(3, (EL_SB[i] * 4) | 0) + (EL_ST[i] > 0.25 ? 4 : 0);
      EL_SQ[i] = q; sb[q] += EL_SB[i]; stw[q] += Math.min(1, EL_ST[i]); cn[q]++;
    }
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let q = 0; q < 8; q++) {
      if (!cn[q]) continue;
      c.beginPath();
      for (let i = 0; i < n; i++) if (EL_SQ[i] === q) { c.moveTo(EL_SX[i] + EL_SR[i], EL_SY[i]); c.arc(EL_SX[i], EL_SY[i], EL_SR[i], 0, TAU); }
      const tw = stw[q] / cn[q];
      c.fillStyle = elRgba(elMix(a2, EL_WHITE, q >= 4 ? Math.min(1, 0.45 + 0.55 * tw) : 0.8 * tw), sb[q] / cn[q]);
      if ((q === 3 || q === 7) && blur) { c.shadowColor = elRgba(q === 7 ? elMix(a2, EL_WHITE, 0.5) : a2, 0.85); c.shadowBlur = blur; } else c.shadowBlur = 0;
      c.fill();
    }
    c.restore();
  }
  function elLayout(v) {
    const st = v.el || (v.el = { phi: 0, e0: null });
    const G = v.g, pv = v.kind === "preview";
    st.style = v.style;
    if (v.style === "ring") {
      const N = pv ? 48 : 96;
      if (st.N !== N) { st.N = N; st.cos = new Float32Array(N); st.sin = new Float32Array(N); for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + (i / N) * TAU; st.cos[i] = Math.cos(a); st.sin[i] = Math.sin(a); } }
    } else if (v.style === "bars" && G) {
      st.sp = [];                                  // r2: the outer bars that carry sparks (they ride the tips, elOver)
      for (let i = 0; i < G.n; i++) if (G.a[i] > 0.5) st.sp.push(i);
    } else if (v.style === "wave" && G) {
      st.wk = new Int32Array(48);
      for (let i = 0; i < 48; i++) st.wk[i] = 1 + Math.floor(elHash(i, 3) * (G.pts - 2));
    }
  }
  /** "Barras espelhadas" with the layers on: the bars' fill becomes a colour LUT (one column per bar: a1 at the
      centre, the mix on the shoulders, a2 at the tips, white core), drawn as ONE pattern fill with one shadow like v5;
      plus the hairline flashes (a1 for the bass entry, white for the snare) */
  function elBarsLayout(v, G, margin) {
    try {
      const C = elCols(), c = v.ctx, H = 128, span = G.half * 1.2 + 8, n = G.n;
      const lut = document.createElement("canvas");
      lut.width = n; lut.height = H;
      const lc = lut.getContext("2d"), m = (o) => clamp(0.5 + (o - 0.5) * (G.half / span), 0, 1);
      for (let i = 0; i < n; i++) {
        const a = G.a[i], z = a < 0.25 ? C.a1 : a < 0.6 ? elMix(C.a1, C.a2, (a - 0.25) / 0.35) : C.a2;
        const g = lc.createLinearGradient(0, 0, 0, H), tip = elRgba(elMix(z, EL_WHITE, 0.52), 1), mid = elRgba(elMix(z, EL_WHITE, 0.9), 1);
        g.addColorStop(0, tip); g.addColorStop(m(0), tip); g.addColorStop(m(0.3), mid); g.addColorStop(0.5, "#ffffff");
        g.addColorStop(m(0.7), mid); g.addColorStop(m(1), tip); g.addColorStop(1, tip);
        lc.fillStyle = g;
        lc.fillRect(i, 0, 1, H);
      }
      const pat = c.createPattern(lut, "no-repeat");
      if (pat && typeof pat.setTransform === "function" && typeof DOMMatrix === "function") {
        pat.setTransform(new DOMMatrix([G.pitch, 0, 0, (2 * span) / H, margin, v.h / 2 - span]));
        G.coreEl = pat;
      }
      const line = (col) => {
        const l = c.createLinearGradient(0, 0, v.w, 0);
        l.addColorStop(0, elRgba(col, 0)); l.addColorStop(0.5, elRgba(col, 1)); l.addColorStop(1, elRgba(col, 0));
        return l;
      };
      G.elLineA1 = line(elMix(C.a1, EL_WHITE, 0.25));
      G.elLineW = line(EL_WHITE);
    } catch (e) { G.coreEl = null; }
  }
  /** "Anel neon" with the layers on: the crown's tips lean to a1 (the low layer's colour) */
  function elRingLayout(v, G, EX) {
    try {
      const C = elCols(), rg = v.ctx.createRadialGradient(G.cx, G.cy, G.r0, G.cx, G.cy, G.r0 + G.len * (1 + 0.5 * (EX - 1)));
      rg.addColorStop(0, "#ffffff");
      rg.addColorStop(0.6, elRgba(elMix(C.a1, EL_WHITE, 0.88), 1));
      rg.addColorStop(1, elRgba(elMix(C.a1, EL_WHITE, 0.6), 0.92));
      G.coreEl = rg;
    } catch (e) { G.coreEl = null; }
  }
  /** the ring canvas' inscribed radius for an ellipse with x scale xs (px): every ring layer stays inside it (a glow
      that leaves the canvas would be cut along its straight edge); edgeFade = 1 .. 0 over the last 18 % before it */
  const elRingLim = (v, xs) => Math.min(v.h / 2, v.w / (2 * xs)) - 6;
  const elEdgeFade = (R, lim) => clamp((lim - R) / (0.18 * lim), 0, 1);
  /** v5b-r2: a drawn layer's peak opacity at amount K: up to 100 % the amount scales it, past 100 % the peak only grows
      to x1.6 (and never past cap), and the music multiplies it below that, so a layer keeps a >= 3x range between a
      quiet and a loud passage at 500 % (v5b put K inside the soft clip: at 400-500 % the halo, the voice band and the
      dots sat at ~1 whatever the music did, flat plates and 96 identical dots) */
  const elPk = (K, a1, cap) => Math.min(cap, a1 * (K < 1.6 ? K : 1.6));
  /** past 100 % a layer gets bigger with sqrt(K), at most x1.5 (v5b: x2.24 at 500 %) */
  const elSzC = (K) => Math.min(1.5, elSz(K));
  /** the title block's top in the main view's canvas px (Infinity in the preview / without a title): the dots, the
      sparks and the shockwave fade out before it (maskTitle only clears the text's own box) */
  function elTitleTop(v, fx, win) {
    if (v.kind !== "main" || typeof metaGeometry !== "function" || !S.vizBox) return win ? -Infinity : Infinity;
    const g = S.metaGeo || (S.metaGeo = metaGeometry()), b = S.vizBox;
    if (!g || !g.mh) return win ? -Infinity : Infinity;
    const z = vizZoom(fx.zoom || 1) * (fx.gs || 1), dy = (fx.gb || 0) * b.H0 * (fx.zoom || 1);
    return g.oy + ((win ? 0 : g.my - g.mh / 2 - 10) - g.oy - dy) / z - b.top;   // win: where the window's top edge is
  }
  const elTitleFade = (y, top) => (top === Infinity ? 1 : clamp((top - y) / 36, 0, 1));
  const elWinFade = (y, top) => (top === -Infinity ? 1 : clamp((y - top - 6) / 24, 0, 1));
  /** a stroke colour that fades out over the 60 px above the title (only the part of a ring near the title fades) */
  function elTitleStroke(c, col, a, top, sy) {
    if (!(top < Infinity)) return elRgba(col, a);
    const g = c.createLinearGradient(0, (top - 60) * sy, 0, top * sy);
    g.addColorStop(0, elRgba(col, a)); g.addColorStop(1, elRgba(col, 0));
    return g;
  }
  /** r2: the shockwave's radius: from just past the crown's usual tips (0.72 x len) out to the canvas edge over its
      700 ms (v5b: from 0.65 to 2.45 x len, so it left the canvas after ~150 ms and was easy to miss) */
  const elShockR = (r0, len, tau) => r0 + len * (0.72 + 0.5 * tau);
  /** the bass entry's glow colour: a1, or (colours taken from the wallpaper / cover, where a1 IS the wallpaper's hue
      and a1 glow vanished on it) a1 pushed halfway to white */
  const elEntCol = (C) => (CFG.colors && CFG.colors.preset === "wall" ? elMix(C.a1, EL_WHITE, 0.55) : C.a1);
  /** r3: the colours are taken from the wallpaper / cover ("Combinar com o wallpaper"): a1 / a2 / the halo ARE the
      wallpaper's hues there, so an accent drawn in them vanishes on it; the accents push further towards white */
  const elWall = () => !!(CFG.colors && CFG.colors.preset === "wall");
  /** "r, g, b" (PAL.shadowRgb) mixed towards white by t */
  const elShadowMix = (rgb, t) => String(rgb).split(",").map((x) => Math.round(Number(x) + (255 - Number(x)) * t)).join(", ");
  function elUnder(v, sig, fx) {
    const L = fx && fx.el, G = v.g;
    if (!L || !G || !L.K.V) return;
    const { K, E } = L, c = v.ctx, pv = v.kind === "preview", M = E.mid, fM = E.fMid;
    // r3 "a voz entrou": the halo / the voice band FLASH (x1.8, towards white) for EL_FLASH_MS, on top of the travelling ring
    const halo = fM > 0.01 ? elMix(L.halo, EL_WHITE, (elWall() ? 0.55 : 0.35) * Math.min(1, fM)) : L.halo;
    if (v.style === "ring") {
      // "Voz e melodia": the halo around the cover breathes (an elliptical annulus, "lighter"); a glint follows the
      // melody. r2: from the cover's edge out (never over it); past 100 % wider (<= x1.5) and brighter (<= x1.6)
      const r0 = G.r0 * G.kick, len = G.len, tT = L.rm ? 0 : Math.min(1, K.M) * L.T, cC = Math.min(1, K.M) * L.C;
      const Rh = r0 + len * (0.32 + 0.24 * ND_V_S * M) * (1 - 0.25 * tT), wh = len * (0.42 + 0.34 * ND_V_S * M) * (1 - 0.30 * tT) * elSzC(K.V);
      const a = Math.min(0.95, elPk(K.V, 0.62 * ND_V_A, Math.min(0.95, 0.9 * ND_V_A)) * (0.06 + 0.94 * Math.pow(M, 1.3)) * (1 + 0.35 * L.T * Math.min(1, K.M)) * (1 - 0.15 * cC) * (1 + 0.3 * fM) +
        0.05 * Math.min(1, K.V) * fM) * (pv ? 0.8 : 1);
      const xs = 1 + 0.5 * (G.EX - 1), R0 = Math.max(G.rc * G.kick + 4, Rh - wh), R1 = Math.min(Rh + 1.2 * wh, elRingLim(v, xs));   // 500 %: inside the canvas
      c.save();
      c.globalCompositeOperation = "lighter";
      c.translate(G.cx, G.cy);
      c.scale(xs, 1);
      if (a > 0.002 && R1 > R0 + 1) {
        const g = c.createRadialGradient(0, 0, R0, 0, 0, R1);
        g.addColorStop(0, elRgba(halo, 0));
        g.addColorStop(clamp((Rh - R0) / (R1 - R0), 0.01, 0.99), elRgba(halo, a));
        g.addColorStop(1, elRgba(halo, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, R1, 0, TAU);
        c.arc(0, 0, R0, 0, TAU, true);
        c.fill();
      }
      if (E.entMid > 0.003) {                      // "a voz entrou": a ring travels out of the halo (r3: 3.5 px, near white)
        const Rm = Rh + (L.rm ? 0 : 0.7 * len * Math.min(1, E.entMidAge / EL_ENTRY_MS));
        c.strokeStyle = elRgba(elMix(L.halo, EL_WHITE, elWall() ? 0.75 : 0.6), Math.min(0.9, 0.6 * Math.min(1.5, K.V)) * (E.entMid / 0.6) * elEdgeFade(Rm, elRingLim(v, xs)));
        c.lineWidth = (pv ? 1.5 : 3.5) * Math.min(1.3, elSzC(K.V));
        c.beginPath();
        c.arc(0, 0, Rm, 0, TAU);
        c.stroke();
      }
      c.restore();
    } else if (v.style === "bars") {
      // "Voz e melodia": a breathing band of light behind the bars (calm: it narrows); the glint as a brighter spot;
      // r3: the voice entry widens it by 40 % and flashes it x1.8
      const w = v.w, cy = v.h / 2, cC = Math.min(1, K.M) * L.C, hb = Math.min(v.h / 2 - 4, G.half * (0.35 + 0.55 * ND_V_S * M) * elSzC(K.V) * (1 - 0.3 * cC) * (1 + 0.5 * fM));
      const a = Math.min(1, elPk(K.V, 0.56 * ND_V_A, Math.min(0.95, 0.85 * ND_V_A)) * (0.1 + 0.9 * Math.pow(M, 1.3)) * (1 + 0.8 * fM) + 0.3 * Math.min(1, K.V) * fM) * (pv ? 0.8 : 1), R = w * 0.5;
      if (hb < 1) return;
      c.save();
      c.globalCompositeOperation = "lighter";
      c.translate(w / 2, cy);
      c.scale(1, hb / R);
      if (a > 0.002) {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
        g.addColorStop(0, elRgba(halo, a)); g.addColorStop(0.55, elRgba(halo, 0.5 * a)); g.addColorStop(1, elRgba(halo, 0));
        c.fillStyle = g;
        c.fillRect(-R, -R, 2 * R, 2 * R);
      }
      if (E.glint > 0.003) {
        const ga = elPk(K.V, 0.3, 0.5) * E.glint * (pv ? 0.8 : 1), ang = L.rm ? E.gHome : E.gAng;
        const u = 0.1 + 0.8 * ((((ang + Math.PI / 2) % TAU) + TAU) % TAU) / TAU, span = (G.n * G.pitch) / 2, rr = Math.max(8, 0.07 * w) * elSzC(K.V);
        const gc = elMix(halo, EL_WHITE, 0.35);
        for (const sg of [-1, 1]) {
          const x = sg * u * span, g = c.createRadialGradient(x, 0, 0, x, 0, rr);
          g.addColorStop(0, elRgba(gc, ga)); g.addColorStop(1, elRgba(gc, 0));
          c.fillStyle = g;
          c.fillRect(x - rr, -R, 2 * rr, 2 * R);
        }
      }
      c.restore();
    }
  }
  /** into the style's own haze canvas (it is blurred and stretched for free): the shockwave's wide glow, the voice
      entry's glow, the second ribbon's halo glow, r3: the snare's glow at the crown tip */
  function elHaze(v, sig, fx) {
    const L = fx && fx.el, G = v.g;
    if (!L || !G) return;
    const { K, E } = L, ha = v.hctxA, sx = v.hazeA.width / v.w, sy = v.hazeA.height / v.h, C = L.cols;
    ha.save();
    if (v.style === "ring") {
      const r0 = G.r0 * G.kick, len = G.len, xs = 1 + 0.5 * (G.EX - 1);
      if (K.E && E.ent > 0.003 && E.entAge < EL_SHOCK_MS) {
        const tau = L.rm ? 0 : E.entAge / EL_SHOCK_MS, R = elShockR(r0, len, tau);
        const a = Math.min(1, elPk(K.E, 1, 1) * E.ent * Math.pow(1 - E.entAge / EL_SHOCK_MS, 1.2)) * elEdgeFade(R, elRingLim(v, xs));
        ha.strokeStyle = elTitleStroke(ha, elEntCol(C), a, elTitleTop(v, fx), sy);
        ha.lineWidth = Math.max(1, 14 * ND_E_W * (1 - 0.6 * tau) * elSzC(K.E) * sx);
        ha.beginPath();
        ha.ellipse(G.cx * sx, G.cy * sy, R * xs * sx, R * sy, 0, 0, TAU);
        ha.stroke();
      }
      if (K.S && E.snap > 0.003) {                 // r3: the snare's glow along the crown tip (the crisp ring: elOver)
        const R = r0 + 2 + len * elCrownMean(G) + 6;
        ha.strokeStyle = elRgba(elMix(EL_WHITE, C.a2, 0.35), Math.min(1, elPk(K.S, 0.7, 0.9) * E.snap));
        ha.lineWidth = Math.max(1, 12 * sx);
        ha.beginPath();
        ha.ellipse(G.cx * sx, G.cy * sy, Math.min(R * G.EX, elRingLim(v, xs) * xs) * sx, Math.min(R, elRingLim(v, xs)) * sy, 0, 0, TAU);
        ha.stroke();
      }
      if (K.V && E.glint > 0.003) {                // the melody glint: a bright arc on the halo where the notes sit (C at the
        // top, clockwise), drawn here so the haze's blur softens it; the conic gradient fades its ends, two nested widths
        // its sides (reduced motion: it stays at the track's mean melody angle)
        const M = E.mid, tT = L.rm ? 0 : Math.min(1, K.M) * L.T;
        const Rh = r0 + len * (0.32 + 0.24 * M) * (1 - 0.25 * tT), wh = len * (0.42 + 0.34 * M) * (1 - 0.30 * tT) * elSzC(K.V);
        const ga = elPk(K.V, 0.35, 0.6) * E.glint * (v.kind === "preview" ? 0.8 : 1), ang = (L.rm ? E.gHome : E.gAng) + (fx.sway || 0);
        const hw = 0.35 + 0.5 * (1 - clamp(E.gR, 0, 1)), f = hw / TAU, gc = elMix(L.halo, EL_WHITE, 0.35);
        ha.save();
        ha.translate(G.cx * sx, G.cy * sy);
        ha.scale(xs * sx, sy);
        const cg = ha.createConicGradient(ang - Math.PI, 0, 0);
        cg.addColorStop(0.5 - f, elRgba(gc, 0)); cg.addColorStop(0.5, elRgba(gc, 1)); cg.addColorStop(0.5 + f, elRgba(gc, 0));
        ha.strokeStyle = cg;
        ha.lineCap = "butt";
        for (const [wk, ak] of [[0.6, 0.45], [0.3, 0.55]]) {
          ha.globalAlpha = Math.min(1, ga * ak * 2);
          ha.lineWidth = Math.max(1, wk * Math.min(wh, 2 * (Rh - 2)));
          ha.beginPath();
          ha.arc(0, 0, Rh, ang - hw, ang + hw);
          ha.stroke();
        }
        ha.restore();
      }
      if (K.A && E.fAir > 0.01) {                  // r3 "os agudos entraram": a bright comet runs round the dot orbit (blurred here)
        const R = r0 + 2 + EL_DOT_R * len, sw = L.rm ? 0 : (E.entAirAge / 700) * TAU, a = Math.min(1, 0.9 * Math.min(1.5, K.A) * E.fAir);
        ha.save();
        ha.translate(G.cx * sx, G.cy * sy);
        ha.scale(xs * sx, sy);
        ha.strokeStyle = elRgba(elMix(C.a2, EL_WHITE, 0.6), a);
        ha.lineWidth = Math.max(1, 14);
        ha.lineCap = "round";
        ha.beginPath();
        if (L.rm) ha.arc(0, 0, Math.min(R, elRingLim(v, xs)), 0, TAU);
        else ha.arc(0, 0, Math.min(R, elRingLim(v, xs)), sw - Math.PI / 2 - EL_SWEEP_RAD, sw - Math.PI / 2 + EL_SWEEP_RAD);
        ha.stroke();
        ha.restore();
      }
      if (K.V && E.entMid > 0.003) {
        const M = E.mid, Rh = r0 + len * (0.32 + 0.24 * M), Rm = Rh + (L.rm ? 0 : 0.7 * len * Math.min(1, E.entMidAge / EL_ENTRY_MS));
        ha.strokeStyle = elRgba(elMix(L.halo, EL_WHITE, elWall() ? 0.5 : 0.25), Math.min(1, elPk(K.V, 0.6, 0.9) * E.entMid / 0.6) * elEdgeFade(Rm, elRingLim(v, xs)));
        ha.lineWidth = Math.max(1, 18 * sx);
        ha.beginPath();
        ha.ellipse(G.cx * sx, G.cy * sy, Rm * xs * sx, Rm * sy, 0, 0, TAU);
        ha.stroke();
      }
    } else if (v.style === "bars") {
      if (K.E && E.ent > 0.003 && E.entAge < EL_ENTRY_MS) {    // the entry's two glints, as a warm glow
        const tau = L.rm ? 0 : Math.min(1, E.entAge / EL_SHOCK_MS), cy = v.h / 2, a = Math.min(1, elPk(K.E, 0.9, 1) * E.ent);
        ha.fillStyle = elRgba(elEntCol(C), a);
        for (const sg of [-1, 1]) {
          const x = v.w / 2 + sg * tau * (v.w / 2);
          ha.beginPath();
          ha.ellipse(x * sx, cy * sy, Math.max(1, 46 * elSzC(K.E) * sx), Math.max(1, 18 * sy), 0, 0, TAU);
          ha.fill();
        }
      }
    } else if (v.style === "wave") {
      if (K.V) {                                   // ribbon 2 ("Voz e melodia"): a glow stroke in the halo colour (r3: flashes on the entry)
        const fM = E.fMid;
        ha.strokeStyle = elRgba(fM > 0.01 ? elMix(L.halo, EL_WHITE, (elWall() ? 0.5 : 0.3) * Math.min(1, fM)) : L.halo,
          Math.min(1, elPk(K.V, 0.5 * ND_V_A, Math.min(0.95, 0.85 * ND_V_A)) * (0.1 + 0.9 * Math.pow(E.mid, 1.2)) * (1 + 0.8 * fM) + 0.3 * Math.min(1, K.V) * fM));
        ha.lineWidth = Math.max(1, 14 * elSzC(K.V) * (1 + 0.6 * fM) * sx);
        ha.lineCap = "round";
        ha.beginPath();
        curve(ha, G.x, G.y[1], G.pts, sx, sy, false, G.cy);
        ha.stroke();
      }
    }
    ha.restore();
  }
  /** the crown's mean height (0..~1.3 of len) */
  function elCrownMean(G) {
    let hm = 0;
    for (let m = 0; m < G.m; m++) hm += G.hgt[m];
    return Math.max(0.25, hm / G.m);
  }
  /** a white stroke along ribbon r of "Onda" (the soft entries' core, the snare's flash): alpha a, width wd, faded at both
      ends (x0..x1 of the width, as a share) */
  function elRibbonFlash(c, G, r, a, wd, mirror) {
    const g = c.createLinearGradient(G.x[0], 0, G.x[G.pts - 1], 0);
    g.addColorStop(0, elRgba(EL_WHITE, 0)); g.addColorStop(0.12, elRgba(EL_WHITE, a)); g.addColorStop(0.88, elRgba(EL_WHITE, a)); g.addColorStop(1, elRgba(EL_WHITE, 0));
    c.strokeStyle = g;
    c.lineWidth = wd;
    c.beginPath();
    curve(c, G.x, G.y[r], G.pts, 1, 1, false, G.cy);
    if (mirror) curve(c, G.x, G.y[r], G.pts, 1, 1, true, G.cy);
    c.stroke();
  }
  function elOver(v, sig, fx) {
    const L = fx && fx.el, G = v.g;
    if (!L || !G) return;
    const { K, E } = L, c = v.ctx, pv = v.kind === "preview", st = v.el || {}, C = L.cols, ns = elTwinkles(E);
    const tTop = (K.A || K.E) && v.style !== "wave" ? elTitleTop(v, fx) : Infinity, wTop = K.A && v.style === "ring" ? elTitleTop(v, fx, true) : -Infinity;
    // r3 "Agudos e chimbal": a twinkle adds up to 1 x min(K, 2) (r2: 0.45) and grows the point by up to 3.5 px (r2: 2.2);
    // while hats play the points keep >= EL_HAT_FLOOR (r2: a low AIR reading blanked them in a drop)
    const twK = 0.45 * ND_A_TW * Math.min(2, K.A), floor = EL_HAT_FLOOR * E.hatAct * Math.min(1, K.A);   // v6: as v6 on r2 (r3: 1 x min(2, K.A))
    if (v.style === "ring") {
      const cx = G.cx, cy = G.cy, r0 = G.r0 * G.kick, len = G.len, EX = G.EX, xs = 1 + 0.5 * (EX - 1);
      if (K.S && E.snap > 0.003) {                 // "Caixa e palmas": the cone rim flashes, a ring flicks just past the crown
        // r3: 4 px at alpha <= 1 at the crown's current tip, the rim 3 px (r2: 2.5 px / 2 px: on screen 0.15 % changed)
        const f = elCrownMean(G) * (1 + 0.15 * (1 - Math.exp(-E.snapAge / EL_SNAP_MS))), pad = pv ? 3 : 6;
        c.save();
        c.lineWidth = pv ? 1.5 : 3;
        c.strokeStyle = elRgba(EL_WHITE, Math.min(0.95, elPk(K.S, 0.7, 0.95) * E.snap));
        c.beginPath();
        c.arc(cx, cy, Math.max(1, r0 - 3), 0, TAU);
        c.stroke();
        c.lineWidth = (pv ? 2 : 4) * elSzC(K.S);
        c.strokeStyle = elRgba(elMix(EL_WHITE, C.a2, 0.15), Math.min(1, elPk(K.S, 0.9, 1) * E.snap));
        c.beginPath();
        c.ellipse(cx, cy, r0 + 2 + len * f * EX + pad, r0 + 2 + len * f + pad, 0, 0, TAU);
        c.stroke();
        c.restore();
      }
      if (K.S && E.snap > 0.003 && ND_S_CR > 0 && G.hgt) {   // v6-r2: "Caixa e palmas": the whole crown flashes white (area, not a hairline)
        const a = Math.min(ND_S_CRX, ND_S_CR * elPk(K.S, 0.8, 1) * E.snap);   // v6-r3: cap ND_S_CRX
        if (a > 0.004) {
          const sw = fx.sway || 0, ca = Math.cos(sw), sa = Math.sin(sw), n = G.n, ex = G.ex;
          c.save();
          c.globalCompositeOperation = "lighter";
          c.lineCap = "round";
          c.lineWidth = G.barW * 1.25;
          c.strokeStyle = elRgba(EL_WHITE, a);
          c.beginPath();
          for (let k = 0; k < n; k++) {
            const m = k < G.m ? k : n - 1 - k, Lb = Math.max(1.5, G.hgt[m] * len * ex[m]), co = G.cos[k] * ca - G.sin[k] * sa, si = G.sin[k] * ca + G.cos[k] * sa;
            c.moveTo(cx + co * (r0 + 2), cy + si * (r0 + 2));
            c.lineTo(cx + co * (r0 + 2 + Lb), cy + si * (r0 + 2 + Lb));
          }
          c.stroke();
          c.restore();
        }
      }
      if (K.A && st.N) {                           // "Agudos e chimbal": the outer dots glow with the air, twinkle on hats
        const N = st.N, bp = num(sig.beatPos, 0);
        if (!L.rm) {                               // the orbit: one slot per beat (eased), faster in a riser, slower calm
          const fr = bp - Math.floor(bp), e1 = Math.floor(bp) + fr + (Math.pow(fr, 3) - fr) * num(sig.drums, 1);   // v6: no drums, no steps
          if (st.e0 != null) {
            const dE = e1 - st.e0;
            if (dE > 0 && dE < 4) st.phi = (st.phi + (TAU / N) * dE * ND_ORB * (ND_ORB0 + (1 - ND_ORB0) * num(sig.drums, 1)) * (1 + 2 * L.T * Math.min(1, K.M)) * Math.max(0, 1 - 0.5 * L.C * Math.min(1, K.M))) % TAU;
          }
          st.e0 = e1;
        }
        const con = L.rm ? 0 : 0.14 * Math.min(1, K.M) * L.T, hb = EX - 1, cp = Math.cos(st.phi), sp = Math.sin(st.phi);
        // r2: the glow keeps the air's range at any amount (<= 0.85) and leaves room for the hat twinkles above it
        const base = Math.max(floor, elPk(K.A, 0.75 * ND_A_A, Math.min(0.95, 0.85 * ND_A_A)) * (0.12 + 0.88 * Math.pow(E.air, 1.2))), szA = elSzC(K.A) * ND_A_SZ * (pv ? 0.6 : 1);
        // r3 "os agudos entraram": a white sweep over +-EL_SWEEP_RAD (r2: +-0.3 rad, +0.45 x 0.6 at most, the dots' own colour)
        const fA = E.fAir, sweep = fA > 0.01, sw = (E.entAirAge / 700) * TAU;
        for (let i = 0; i < N; i++) {
          const co = st.cos[i] * cp - st.sin[i] * sp, si = st.sin[i] * cp + st.cos[i] * sp;
          const R = (r0 + 2 + EL_DOT_R * len * (1 + hb * co * co)) * (1 - con);
          const tw = ns ? elTw(E, ns, i) : 0;
          let swp = 0;
          if (sweep) {
            if (L.rm) swp = 0.5 * fA;
            else {
              let dd = Math.abs((((Math.atan2(si, co) + Math.PI / 2 - sw) % TAU) + TAU) % TAU);
              dd = Math.min(dd, TAU - dd);
              if (dd < EL_SWEEP_RAD) swp = fA * (1 - dd / EL_SWEEP_RAD);
            }
          }
          EL_SX[i] = cx + co * R; EL_SY[i] = cy + si * R;
          EL_SB[i] = Math.min(1, base + twK * tw + 0.6 * swp) * elTitleFade(EL_SY[i], tTop) * elWinFade(EL_SY[i], wTop); EL_ST[i] = tw + swp;
          EL_SR[i] = (1.6 + 1.1 * E.air + 3.5 * Math.min(1, tw)) * (1 + swp) * szA;
        }
        elSparks(c, N, C.a2, pv ? 0 : 8);
      }
      if (K.E && E.ent > 0.003 && E.entAge < EL_SHOCK_MS) {   // "Quando o grave entra": the shockwave's core
        // r2: 5 px, 75 % towards white (v5b: a 3 px pale line, easy to miss next to a crown at 400 %)
        const tau = L.rm ? 0 : E.entAge / EL_SHOCK_MS, R = elShockR(r0, len, tau);
        const a = Math.min(1, elPk(K.E, 1, 1) * E.ent * Math.pow(1 - E.entAge / EL_SHOCK_MS, 1.2)) * elEdgeFade(R, elRingLim(v, xs));
        c.save();
        c.lineWidth = (pv ? 2 : 5) * ND_E_W * Math.min(1.3, elSzC(K.E));
        c.strokeStyle = elTitleStroke(c, elMix(C.a1, EL_WHITE, 0.75), 0.9 * a, tTop, 1);
        c.beginPath();
        c.ellipse(cx, cy, R * xs, R, 0, 0, TAU);
        c.stroke();
        c.restore();
      }
    } else if (v.style === "bars") {
      const w = v.w, cy = v.h / 2, cmp = G.cmp || 1, X = (x) => w / 2 + (x - w / 2) * cmp, Cp = G.caps && G.caps.v;
      const capsOn = !CFG.caps || CFG.caps.bars !== false, lift = G.capLift || 0, tR = L.rm ? 0 : Math.min(1, K.M) * L.T;
      let m = 0;
      if (K.A && st.sp) {                          // sparks off the outer bars' tips (two mirrored rows)
        // r2: each spark rides its bar's tip or its falling cap (+6..12 px), brighter on the bars that move (v5b: two
        // fixed rows at 0.95-1.05 x the top, ~0.7 x half away from the short outer bars, one of them in the title band)
        // r3: brighter twinkles (white, +3.5 px) and the riser's climb brightens them
        const szA = elSzC(K.A) * ND_A_SZ * (pv ? 0.5 : 1), pk = elPk(K.A, 0.75 * ND_A_A, Math.min(0.95, 0.85 * ND_A_A));
        for (let q = 0; q < st.sp.length && m < 252; q++) {
          const i = st.sp[q], u = G.a[i], x = X(G.x0 + i * G.pitch + G.barW / 2), h = Math.max(G.hgt[i], Cp ? Cp[i] : 0);
          const tip = 0.3 + 0.7 * smooth(clamp((h - 0.12) / 0.28, 0, 1));
          const base = Math.max(floor * tip, pk * (0.08 + 0.92 * Math.pow(E.air * (u - 0.35) / 0.65, 1.1)) * tip + 0.35 * tR * tip);
          for (let rw = 0; rw < 2; rw++) {
            const tw = ns ? elTw(E, ns, i * 2 + rw) : 0;
            EL_SX[m] = x; EL_SY[m] = cy + (rw ? 1 : -1) * (h * G.half + (G.capH || 3) + 6 + 6 * elHash(i, 7 + rw) + lift);
            EL_SB[m] = Math.min(1, base + twK * tw * (0.5 + 0.5 * tip)) * (rw ? elTitleFade(EL_SY[m], tTop) : 1); EL_ST[m] = tw;
            EL_SR[m] = (1.8 + 1.2 * E.air + 3.5 * Math.min(1, tw)) * szA;
            m++;
          }
        }
        // r3 "os agudos entraram": a white front runs from the centre out to the tips over EL_CASCADE_MS, lighting the bar
        // tips it passes (reduced motion: all tips flash in place); r2 drew nothing for it in "Barras"
        const fA = E.fAir;
        if (fA > 0.01) {
          const f = L.rm ? -1 : Math.min(1, E.entAirAge / EL_CASCADE_MS);
          for (let i = 0; i < G.n && m < 252; i++) {
            const d = f < 0 ? 0 : Math.abs(G.a[i] - f), k = f < 0 ? 0.5 : 1 - d / 0.2;
            if (k <= 0) continue;
            const x = X(G.x0 + i * G.pitch + G.barW / 2), h = Math.max(G.hgt[i], Cp ? Cp[i] : 0), wgt = fA * k;
            for (let rw = 0; rw < 2; rw++) {
              EL_SX[m] = x; EL_SY[m] = cy + (rw ? 1 : -1) * (h * G.half + (G.capH || 3) + 5 + lift);
              EL_SB[m] = Math.min(1, 0.45 + 0.55 * wgt) * (rw ? elTitleFade(EL_SY[m], tTop) : 1); EL_ST[m] = 1;
              EL_SR[m] = (3 + 4.5 * wgt) * elSzC(K.A) * (pv ? 0.5 : 1);
              m++;
            }
            if (wgt > 0.15) (st.cas || (st.cas = [])).push(i, wgt);
          }
        }
        elSparks(c, m, C.a2, pv ? 0 : 6);
        if (st.cas && st.cas.length) {             // r3: the cascade front also lights the bar tips it passes
          c.save();
          c.globalCompositeOperation = "lighter";
          c.beginPath();
          let wmax = 0;
          for (let q = 0; q < st.cas.length; q += 2) {
            const i = st.cas[q], x = X(G.x0 + i * G.pitch), half = Math.max(1.25, G.hgt[i] * G.half);
            c.rect(x, cy - half - 2, G.barW * cmp, 10); c.rect(x, cy + half - 8, G.barW * cmp, 10);
            wmax = Math.max(wmax, st.cas[q + 1]);
          }
          c.fillStyle = elRgba(elMix(EL_WHITE, C.a2, 0.2), Math.min(1, 0.9 * wmax));
          if (!pv) { c.shadowColor = elRgba(elMix(C.a2, EL_WHITE, 0.5), 0.9); c.shadowBlur = 10 * v.dpr; }
          c.fill();
          c.restore();
          st.cas.length = 0;
        }
        // r3: a twinkling spark flares its bar's cap (or tip) white
        if (ns && !pv) {
          c.save();
          c.globalCompositeOperation = "lighter";
          for (const pass of [0, 1]) {
            c.beginPath();
            let any = false;
            for (let q = 0; q < st.sp.length; q++) {
              const i = st.sp[q], tw = Math.max(elTw(E, ns, i * 2), elTw(E, ns, i * 2 + 1));
              if ((pass ? tw < 0.5 : tw < 0.12 || tw >= 0.5)) continue;
              const x = X(G.x0 + i * G.pitch), half = Math.max(1.25, G.hgt[i] * G.half), cap = Cp ? Cp[i] * G.half + lift : 0, ch = G.capH || 3;
              const top = capsOn && cap - half > ch * 0.8 ? cap : half;
              c.rect(x, cy - top - ch, G.barW, ch); c.rect(x, cy + top, G.barW, ch);
              any = true;
            }
            if (any) { c.fillStyle = elRgba(EL_WHITE, pass ? 0.95 : 0.5); c.fill(); }
          }
          c.restore();
        }
      }
      // r3 "Caixa e palmas": the bar TIPS and caps flash white (r2: the centre hairline, hidden under the bars' white cores);
      // the riser's climb lights the tips too (r3: "Barras" had no riser of its own, 0.8 % of the screen changed)
      const sA = K.S && E.snap > 0.003 ? Math.min(1, elPk(K.S, 0.85, 1) * E.snap) : 0, rA = 0.45 * tR;
      if (sA > 0.003 || rA > 0.01) {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.beginPath();
        const ch = G.capH || 3;
        for (let i = 0; i < G.n; i++) {
          const x = X(G.x0 + i * G.pitch), half = Math.max(1.25, G.hgt[i] * G.half);
          c.rect(x, cy - half - 1, G.barW * cmp, 4); c.rect(x, cy + half - 3, G.barW * cmp, 4);
          if (sA > 0.003) { c.rect(x, cy - half - 9, G.barW * cmp, 3); c.rect(x, cy + half + 6, G.barW * cmp, 3); }   // a snap just past the tip
          const cap = Cp ? Cp[i] * G.half + lift : 0;
          if (capsOn && cap - half > ch * 0.8) { c.rect(x, cy - cap - ch, G.barW * cmp, ch); c.rect(x, cy + cap, G.barW * cmp, ch); }
        }
        c.fillStyle = elRgba(EL_WHITE, Math.min(1, sA + rA));
        if (!pv) { c.shadowColor = elRgba(elMix(EL_WHITE, C.a2, 0.4), 0.8); c.shadowBlur = 8 * v.dpr; }
        c.fill();
        if (sA > 0.003 && ND_S_BB > 0) {           // v6-r2: "Caixa e palmas": the bodies flash too (area, not only the tips)
          c.shadowBlur = 0;
          c.beginPath();
          for (let i = 0; i < G.n; i++) { const x = X(G.x0 + i * G.pitch), half = Math.max(1.25, G.hgt[i] * G.half); c.rect(x - 1, cy - half, G.barW * cmp + 2, half * 2); }
          c.fillStyle = elRgba(EL_WHITE, Math.min(0.6, ND_S_BB * sA));
          c.fill();
        }
        c.restore();
      }
      if (K.E && E.ent > 0.003 && E.entAge < EL_ENTRY_MS) {   // two glints race out along the hairline, which flashes a1
        const tau = L.rm ? 0 : Math.min(1, E.entAge / EL_SHOCK_MS), a = Math.min(1, elPk(K.E, 0.9, 1) * E.ent), rr = (pv ? 14 : 44) * elSzC(K.E);
        c.save();
        c.globalCompositeOperation = "lighter";
        if (G.elLineA1) { c.globalAlpha = a; c.fillStyle = G.elLineA1; c.fillRect(0, cy - 1, w, 2); c.globalAlpha = 1; }
        for (const sg of (tau > 0 ? [-1, 1] : [1])) {
          const x = w / 2 + sg * tau * (w / 2), g = c.createRadialGradient(x, cy, 0, x, cy, rr);
          g.addColorStop(0, elRgba(EL_WHITE, a)); g.addColorStop(0.25, elRgba(C.a1, 0.7 * a)); g.addColorStop(1, elRgba(C.a1, 0));
          c.fillStyle = g;
          c.fillRect(x - rr, cy - rr, 2 * rr, 2 * rr);
        }
        c.restore();
      }
    } else if (v.style === "wave") {
      if (K.A && st.wk) {                          // 48 sparks ride ribbon 3 and twinkle on the hats
        const szA = elSzC(K.A) * ND_A_SZ * (pv ? 0.5 : 1), base = Math.max(floor, elPk(K.A, 0.7 * ND_A_A, Math.min(0.95, 0.8 * ND_A_A)) * (0.15 + 0.85 * Math.pow(E.air, 1.2))), y2 = G.y[2];
        for (let i = 0; i < 48; i++) {
          const kq = st.wk[i], tw = ns ? elTw(E, ns, i) : 0;
          EL_SX[i] = G.x[kq]; EL_SY[i] = y2[kq];
          EL_SB[i] = Math.min(1, base + twK * tw); EL_ST[i] = tw;
          EL_SR[i] = (1.8 + 1.2 * E.air + 3.5 * Math.min(1, tw)) * szA;
        }
        elSparks(c, 48, C.a2, pv ? 0 : 6);
      }
      // r3: the soft entries light their ribbon's core white at x2 width ("Voz": ribbon 2, "Agudos": ribbon 3; r2: nothing);
      // "Caixa e palmas" flashes the full width of the three cores (r2: their centre third)
      const sA = K.S && E.snap > 0.003 ? Math.min(1, elPk(K.S, 0.8, 1) * E.snap) : 0;
      const mA = K.V ? Math.min(0.95, 0.9 * Math.min(1.3, K.V) * E.fMid) : 0, aA = K.A ? Math.min(0.95, 0.9 * Math.min(1.3, K.A) * E.fAir) : 0;
      if (sA > 0.003 || mA > 0.01 || aA > 0.01) {
        c.save();
        c.globalCompositeOperation = "lighter";
        c.lineCap = "round";
        c.lineJoin = "round";
        const pw = pv ? 0.7 : 1;
        if (mA > 0.01) elRibbonFlash(c, G, 1, mA, RIBBONS[1].core * 2.2 * pw, false);
        if (aA > 0.01) elRibbonFlash(c, G, 2, aA, RIBBONS[2].core * 2.4 * pw, false);
        if (sA > 0.003) for (let r = 0; r < 3; r++) elRibbonFlash(c, G, r, sA, RIBBONS[r].core * 2.4 * ND_S_RW * pw, r === 0);   // v6-r2: x ND_S_RW
        c.restore();
      }
    }
  }
  LAYERS.push(
    { id: "el-under", order: "under", layout: elLayout, draw: elUnder },
    { id: "el-haze", order: "haze", draw: elHaze },
    { id: "el-over", order: "over", draw: elOver },
  );

  function cachedTempo(item) {
    const e = item && cache.get(item.uri);
    return e && e.a ? e.a.tempo : 0;
  }

  /** bass / kick / hat / energy at playback position posMs (ms). Z.lat is the
      "Sincronia" for the current output minus the display lead: the frame
      shows what will be HEARD when it reaches the screen. */
  function computeSignal(Z, A, posMs, dt, playing, item) {
    Z.gate += ((playing ? 1 : 0) - Z.gate) * (1 - Math.exp(-dt / (playing ? 140 : 480)));
    const gate = Z.gate;
    const pA = posMs - num(Z.lat, LATENCY_MS), tA = pA / 1000;  // what is audible right now
    Z.drums = A ? drumsAt(A, pA) : drumsFallback(item);         // v6: drums present
    // final-build "modo ambiente suave": its weight eases in (SOFT_IN_MS) while there is no analysis and out (SOFT_OUT_MS)
    // once there is one; the drives below blend towards softGen() by it, and a late analysis's kicks / drums fade in by
    // 1 - it (on analysed music it is 0 and nothing below changes)
    const so0 = num(Z.soft, 0), soT = A ? 0 : softTarget(item);
    let so = so0 + (soT - so0) * (1 - Math.exp(-dt / (soT > so0 ? SOFT_IN_MS : SOFT_OUT_MS)));
    if (soT === 0 && so < 1e-3) so = 0;
    Z.soft = so;
    if (so > 0) Z.sT = num(Z.sT, 0) + dt * (playing ? 1 : 0.35);
    const SG = so > 0 ? softGen(Z) : null;
    if (SG && A) Z.drums *= 1 - so;
    let kick, hat, energy, bright, body;
    if (A) {
      Z.mode = "analysis";
      const db = dbAt(A, tA);
      Z.db = db;
      energy = Math.pow(norm01(A, db), 1.4);
      bright = pitchesAt(A, tA, Z.P12);
      // v6-r3: without drums the chroma breathes. Each segment brings its own pitch vector (cross-faded in 60 ms); in rap
      // every syllable is a segment, so the crown's sides (voice x chroma, texture) and the bars' texture were re-weighted
      // on every syllable: 34-45 side jumps a minute in an a cappella rap test track at ring 500 %. A ND_PCH_MS follower of the
      // vector takes over by 1 - drums present (eased in like the groove, ND_DRG_MS); with drums: the segment's own
      if (ND_PCH_MS > 0) {
        const Ps = Z.P12s || (Z.P12s = Float32Array.from(Z.P12)), kp = 1 - Math.exp(-dt / ND_PCH_MS);
        const w0 = num(Z.pcW, 1), w = Z.drums > w0 ? w0 + (Z.drums - w0) * (1 - Math.exp(-dt / ND_DRG_MS)) : Z.drums;
        Z.pcW = w;
        for (let j = 0; j < 12; j++) { Ps[j] += (Z.P12[j] - Ps[j]) * kp; Z.P12[j] = Ps[j] + (Z.P12[j] - Ps[j]) * w; }
      }
      buildHits(A, rhythmMode());                  // "Ritmo do visual" (cheap no-op unless it changed)
      kick = kickAt(A, pA, Z.k).v;
      hat = envAt(A.hatT, A.hatS, pA, HAT_ATTACK_MS, HAT_DECAY_MS) * Z.drums;
      body = A.body[Math.max(0, segIndex(A, tA))];
      if (SG) {                                    // final-build: a late analysis takes over from the soft mode (no jump)
        energy += (SG.energy - energy) * so; bright += (SG.bright - bright) * so; body += (SG.body - body) * so; kick *= 1 - so;
        for (let j = 0; j < 12; j++) Z.P12[j] += (SG.P12[j] - Z.P12[j]) * so;
      }
    } else {
      // procedural fallback at the track tempo (or 120 BPM): kick on 1 and 3,
      // a lighter one on 2 / 4, a syncopated push before 3, 8th-note hats
      Z.mode = "fallback";
      Z.db = null;
      const bpm = cachedTempo(item) || FALLBACK_BPM, beatMs = 60000 / bpm;
      const decay = clamp(beatMs * 0.36, 120, 200);
      const p = pA, k = Math.floor(p / beatMs);
      kick = 0;
      let pk = 0, kt = -1;
      for (let b = k - 1; b <= k + 1; b++) {
        const pos = ((b % 4) + 4) % 4, t0 = b * beatMs;
        const acc = pos === 0 ? 1 : pos === 2 ? 0.82 : 0.3;
        const e1 = hitEnv(p - t0, 20, decay) * acc;
        if (e1 > kick) { kick = e1; pk = acc; kt = t0; }
        if (pos === 1) { const e2 = hitEnv(p - t0 - beatMs * 0.5, 20, decay * 0.8) * 0.5; if (e2 > kick) { kick = e2; pk = 0.5; kt = t0 + beatMs * 0.5; } }
      }
      kick *= Z.drums; pk *= Z.drums;                          // v6: a podcast gets no procedural beat
      const K = Z.k; K.v = kick; K.pk = pk; K.sh = pk > 0 ? kick / pk : 0; K.z = 1; K.f = K.c = K.sh; K.t = kt; K.g = 0; K.m = pk; K.vk = 1;
      const half = beatMs / 2, hk = Math.floor(p / half);
      hat = hitEnv(p - hk * half, HAT_ATTACK_MS, HAT_DECAY_MS) * (hk % 2 ? 0.75 : 0.4) * Z.drums;
      const tS = posMs / 1000;
      energy = 0.42 + 0.07 * Math.sin(tS * 0.31) + 0.05 * Math.sin(tS * 0.83 + 1.7) + 0.2 * kick;
      for (let j = 0; j < 12; j++) {
        Z.P12[j] = 0.5 + 0.5 * (0.55 * Math.sin(j * 0.9 + tS * 0.9) + 0.45 * Math.sin(j * 0.37 - tS * 0.55 + 2.0));
      }
      bright = 0.5 + 0.3 * Math.sin(tS * 0.2);
      body = 0.45;
      if (SG) {                                    // final-build "modo ambiente suave": the slow drives take over
        energy += (SG.energy - energy) * so; bright += (SG.bright - bright) * so; body += (SG.body - body) * so;
        for (let j = 0; j < 12; j++) Z.P12[j] += (SG.P12[j] - Z.P12[j]) * so;
      }
    }
    // final-fix: what the layers do not cover gets its own share of the soft drives (x so: it fades with the soft mode, so a
    // late analysis takes it over without a jump; on analysed music SG is null and nothing here runs)
    const nl = SG ? softUncovered() : null;
    if (nl && nl.V > 0) energy = clamp(energy + so * nl.V * SOFT_NL_EN * SG.nMid, 0.02, 1);
    Z.body += (body - Z.body) * (1 - Math.exp(-dt / 160));
    Z.bright += (bright - Z.bright) * (1 - Math.exp(-dt / 420));
    Z.kick = kick * gate;
    // amplitude x shape: the renderers saturate the hit's amplitude (kickPk), never its shape (kickSh)
    Z.kickPk = Z.k.pk * (A ? 1 - (rhythmMode() === "bass" ? 0.25 /* v6-r2: Graves */ : 0.5) * num(A.four, 0) : 1); Z.kickSh = Z.k.sh * gate; Z.kickCam = Z.k.c * gate; Z.kickZ = Z.k.z; Z.kickVis = num(Z.k.vk, 1);
    // final-build: the hand-over's kicks fade in: their SHAPE (linear after the renderers' saturation; at 500 % a smaller
    // amplitude still saturates) and the camera's
    if (SG && A) { Z.kickSh *= 1 - so; Z.kickCam *= 1 - so; }
    Z.four = A ? num(A.four, 0) : 0;                       // r3: how four-on-the-floor this track is (0..1)
    Z.kickId = Z.k.t;                                     // onset of the dominant hit: a new one = a new additive impulse
    Z.slow = A ? Z.kickPk * Z.k.f * gate : Math.max(Z.kick, Z.slow * Math.exp(-dt / FOCUS_DECAY_MS));
    if (SG && A) Z.slow *= 1 - so;                 // final-build: the focus pull too
    Z.low = (1 - kick) * 0.12 * Z.body * gate;            // the sustained low end alone
    Z.bass = (kick + (1 - kick) * 0.12 * Z.body) * gate;  // hits + a little sustained low end
    Z.hat = hat * gate;
    if (nl) {                                      // final-fix: the soft low end / hat level of the uncovered parts
      const lo = so * nl.G * SOFT_NL_LOW * (0.5 + 0.5 * SG.nLow) * gate;
      Z.low += lo; Z.bass += lo;
      Z.hat += so * nl.A * SOFT_NL_AIR * (0.5 + 0.5 * SG.nAir) * gate;
    }
    Z.softJ = SG ? so * (nl && nl.L ? 1 : 0) : 0;   // final-fix: the calmer shimmer only where the layers carry the motion
    Z.softB = nl ? so * nl.V * SOFT_NL_BARS * (0.5 + 0.5 * SG.nMid) * gate : 0;   // final-fix: "Barras": the whole field swells
    Z.energy = energy * gate;
    // r3: the energy's ONSETS alone (energy minus a 200 ms follower of it, x 2.5, 0..1): what the crown / bars keep of v5's
    // energy term in BR trap / funk (the onsets of the 808s and snares) without lifting the rest between the kicks
    Z.eSlow = num(Z.eSlow, 0) + (Z.energy - num(Z.eSlow, 0)) * (1 - Math.exp(-dt / 200));
    Z.eOn = clamp(2.5 * (Z.energy - Z.eSlow), 0, 1) * Z.drums;   // v6: x drums present (without drums these onsets are the voice's)
    // "Balanço no ritmo" (v5): the beat grid at the same audible position as the hits; the pulse never waits for a
    // detected kick, so the rhythm stays visible where kick detection misses (dense passages, soft kicks)
    const g = grooveAt(A, pA, A ? A.tempo : cachedTempo(item) || FALLBACK_BPM, Z.gr);
    const envT = gate * (GROOVE_ENV_FLOOR + (1 - GROOVE_ENV_FLOOR) * clamp(energy / 0.45, 0, 1));
    Z.grooveEnv += (envT - Z.grooveEnv) * (1 - Math.exp(-dt / GROOVE_ENV_MS));
    const acc = g.ph < 1 - GROOVE_RISE ? g.acc0 : g.acc1;
    Z.groove = (groovePulse(g.ph) * acc / (1 + GROOVE_DOWN)) * Z.grooveEnv;
    Z.sway = Math.cos(Math.PI * g.pos) * Z.grooveEnv;
    // v6-r2: the groove / sway follow an EASED copy of the gate on its way up (ND_DRG_MS; the fall is the gate's own 1-bar
    // cosine): a drum run opens on a beat, where the pendulum is at +-1, and v6 snapped the crown's sway / the ribbons'
    // phase in one frame. The hit list keeps the instant gate (the first kick lands in full)
    const dG0 = num(Z.drG, 0), dG = Z.drums > dG0 ? dG0 + (Z.drums - dG0) * (1 - Math.exp(-dt / ND_DRG_MS)) : Z.drums;
    Z.drG = dG;
    Z.groove *= dG; Z.sway *= dG;                          // v6: no drums, no groove
    Z.beatPos = g.pos; Z.beatPh = g.ph; Z.beatMs = g.ms; Z.down = acc > 1 ? 1 : 0;
    for (let i = 0; i < SIGNAL_TAPS.length; i++) {          // extension point (v5b: "el")
      try { SIGNAL_TAPS[i].fn(Z, A, pA, dt, playing); } catch (e) { /* a broken tap never stops the visualizer */ }
    }
    return Z;
  }

  /** effect drives from the signal channels: camera zoom (concave, so a median kick already kicks hard), focus pull
      (a gentler, slower "lens breath"), glow, and (v5) the groove's breathing / nod / sway of the visualizer */
  function effectsFrom(sig) {
    // per hit: a concave AMPLITUDE (a median kick already kicks hard), scaled down in dense runs, times the hit's
    // linear shape, so the camera falls back between dense hits instead of hovering (^0.7 no longer lifts the valley)
    // v5b "Camadas por elemento": the scene part (null when off: every value below is exactly v5); "Quando o grave
    // entra" adds a camera punch (inside the zoom budget, zoomMax) and a flash (still capped by glowLayers); r2: a
    // breakdown's calm shrinks the soft hits' camera / focus / flash too (hitK)
    const L = elScene(sig), ent = L && L.K.E ? L.K.E * L.E.ent : 0, hk = L ? num(L.E.hitK, 1) : 1;
    const zd = (sig.kickPk > 0.04 ? Math.pow((sig.kickPk - 0.04) / 0.96, 0.7) : 0) * sig.kickZ * sig.kickCam * hk;
    const fd = (sig.slow > 0.04 ? Math.pow((sig.slow - 0.04) / 0.96, 0.9) : 0) * hk * ND_FK + ND_FE * ent;
    const zAmt = CFG.zoom.on && !S.reducedMotion ? CFG.zoom.amount / 100 : 0;
    const gAmt = CFG.glow.on ? CFG.glow.amount / 100 : 0;
    const glow = gAmt * ND_GK * sig.kickPk * sig.kickCam * (0.4 + 0.6 * sig.kickZ) * hk + EL_GLOW * gAmt * ent;   // 0..5; dense runs flash a little softer
    const grAmt = grooveAmt(), gr = num(sig.groove, 0);
    // final-build "modo ambiente suave": the camera breathes slowly (<= SOFT_CAM, x the zoom setting up to 100 %) and the crown
    // sways on its own slow pendulum; neither with reduced motion (zAmt is 0 then) nor on any beat
    const so = num(sig.soft, 0), SGx = so > 0 ? sig.sg : null;
    const zoom = 1 + ZOOM_MAX * zAmt * zd + (SGx ? SOFT_CAM * Math.min(1, zAmt) * so * SGx.cam : 0);
    return {
      // r2: the entry's punch stays inside v5's zoom budget (it shows when the kick zoom is not at its peak), so
      // "Alcance" sizes are v5a's (v5b reserved it in zoomMax: the crown 5-13 % shorter all the time)
      zoom: ent > 0 ? Math.min(zoomMaxOf(zAmt), zoom + EL_ZOOM * zAmt * ent) : zoom,   // linear in the setting: 1.33 at 500%
      el: L,
      // <= 0.5 at 100%, 0.75 at 150-200% (as v3), then up to 0.9 (medium hits keep growing up to 500%)
      focus: zAmt ? clamp(fd * (0.5 * Math.min(1.5, zAmt) + 0.15 * Math.max(0, zAmt - 2)), 0, 0.9) : 0,
      glow,
      gk: Math.min(GLOW_HOT_FROM, glow),                                    // v3's glow look (bloom, haze, shadows) ...
      over: clamp((glow - GLOW_HOT_FROM) / (INT_MAX / 100 - GLOW_HOT_FROM), 0, 1),   // ... and how far past it (0 at 160%, 1 at 500%)
      glowOn: gAmt > 0,
      groove: grAmt,
      gs: 1 + GROOVE_SCALE * ND_GR * grAmt * gr,                                    // the visualizer's breathing scale
      gb: GROOVE_BOB * ND_GR * grAmt * gr,                                          // its nod (share of the window height, down)
      sway: GROOVE_SWAY * ND_GR * grAmt * num(sig.sway, 0) + (SGx && !S.reducedMotion ? SOFT_SWAY * so * SGx.sway : 0),   // "Anel neon": crown rotation (rad)
    };
  }
  /** layer opacities of a glow: v3's curves up to gk 1.6, then a hotter core that keeps growing, capped so the
      centre never turns white (bloom + flash + hot core are screen-blended tints of at most ~0.34 + 0.34 + 0.2) */
  function glowLayers(fx) {
    if (!fx.glowOn) return { bloom: 0.14, flash: 0, hot: 0 };
    const gk = fx.gk, o = fx.over;
    return { bloom: Math.min(1, 0.14 + 0.5 * gk + 0.06 * o), flash: Math.min(1, 0.42 * Math.pow(gk, 1.5) + 0.15 * o), hot: 0.9 * o };
  }

  /** linear up to 0.75, then eases towards 1 (no flat-topped clusters) */
  function softClip(x) {
    if (x <= 0) return 0;
    return x < 0.75 ? x : 0.75 + 0.25 * (1 - Math.exp(-(x - 0.75) / 0.25));
  }
  const chroma = (P12, q) => {
    const i0 = Math.floor(q), f = q - i0, fc = (1 - Math.cos(f * Math.PI)) / 2;
    return lerp(P12[i0], P12[Math.min(11, i0 + 1)], fc);
  };
  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // ---- views: one canvas each (overlay, panel preview) -------------------------
  function makeView(canvas, kind) {
    const hazeA = document.createElement("canvas"), hazeB = document.createElement("canvas");
    return {
      cv: canvas, ctx: canvas.getContext("2d"), kind, key: "", style: null,
      w: 0, h: 0, dpr: 1, g: null, level: 0,
      hazeA, hazeB, hctxA: hazeA.getContext("2d"), hctxB: hazeB.getContext("2d"),
    };
  }
  const V = { main: null, preview: null };

  /** geo (main view): { H0: stage height, S0: v3's ring box (cover size), alc: "Alcance" 0.2..1 };
      preview / offline callers may omit it (then the canvas itself is the stage) */
  function layoutView(v, style, w, h, geo) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(v.kind === "preview" ? 120 : 200, Math.round(w));
    h = Math.max(v.kind === "preview" ? 60 : 120, Math.round(h));
    const alc = clamp(num(geo && geo.alc, (CFG.reach && CFG.reach[style] != null ? CFG.reach[style] : DEFAULTS.reach[style]) / 100), REACH_MIN / 100, REACH_MAX / 100);
    const H0 = Math.round(num(geo && geo.H0, h)), S0 = Math.round(num(geo && geo.S0, 0)), zmax = Math.max(1, num(geo && geo.zmax, 1));
    const key = style + ":" + w + "x" + h + "@" + dpr + "#" + PAL.ver + "|" + alc + "|" + H0 + "|" + S0 + "|" + zmax + elGeoKey();   // a new colour pair rebuilds the gradients; v5b: the layers' own layout parts
    if (v.key === key) return false;
    const prev = v.style === style ? v.g : null;     // r2: the layouts carry its whole state (dynResample / capResample)
    v.key = key; v.style = style; v.w = w; v.h = h; v.dpr = dpr; v.alc = alc; v.H0 = H0; v.S0 = S0; v.zmax = zmax; v.palVer = PAL.ver;
    v.cv.width = Math.round(w * dpr);
    v.cv.height = Math.round(h * dpr);
    v.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hw = Math.max(16, Math.round(w / 8)), hh = Math.max(8, Math.round(h / 8));
    v.hazeA.width = v.hazeB.width = hw;
    v.hazeA.height = v.hazeB.height = hh;
    IMPL[style].layout(v, prev);
    layoutLayers(v);                                // v5 extension point (v5b: the per-element layers)
    return true;
  }

  /** blur the small haze canvas and stretch it back over the view */
  function blitHaze(v, alpha) {
    const hb = v.hctxB, hw = v.hazeA.width, hh = v.hazeA.height, c = v.ctx;
    hb.clearRect(0, 0, hw, hh);
    hb.filter = "blur(2px)";
    hb.drawImage(v.hazeA, 0, 0);
    hb.filter = "none";
    c.globalAlpha = clamp(alpha, 0, 1);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "low";        // bilinear is enough for a blurred haze (and much cheaper)
    c.drawImage(v.hazeB, 0, 0, v.w, v.h);
    c.globalAlpha = 1;
  }

  // ---- v4 bar dynamics: "Volta" (slow fall) + additive hits ------------------------
  /** x up to SAT_KNEE, then eases into sm (a slight overshoot past the "Alcance" range: SAT_MAX, up to SAT_HI at 500%) */
  function sat(x, sm) {
    if (x <= SAT_KNEE) return x > 0 ? x : 0;
    const r = (sm || SAT_MAX) - SAT_KNEE;
    return SAT_KNEE + r * (1 - Math.exp(-(x - SAT_KNEE) / r));
  }
  function satInv(y, sm) {
    if (y <= SAT_KNEE) return y > 0 ? y : 0;
    const M = sm || SAT_MAX, r = M - SAT_KNEE;
    return SAT_KNEE - r * Math.log(Math.max(1e-4, 1 - (Math.min(y, M - 1e-4) - SAT_KNEE) / r));
  }
  /** r2: what an "Intensidade" above 200% adds (0 at <= OVER_FROM, v5: 1 at INT_MAX 500%, so 400 -> 500% still
      grows): the hits get wider (more bars at full height) and overshoot more (up to SAT_HI); the in-between movement
      keeps its 200% level, so the bars do not just sit higher and the kicks stay as big */
  const overOf = (gain) => clamp((gain * 100 - OVER_FROM) / (INT_MAX - OVER_FROM), 0, 1);
  const satMaxOf = (gain) => SAT_MAX + (SAT_HI - SAT_MAX) * overOf(gain);
  /** the slowly falling body never fills the range: above 0.6 it eases into BODY_MAX (room for the next kick) */
  function bodyCap(x) {
    const k = 0.6, r = BODY_MAX - k;
    return x <= k ? x : k + r * (1 - Math.exp(-(x - k) / r));
  }
  /** "Volta" of a style (ms): the argument, else the setting */
  const fallOf = (id, ms) => clamp(num(ms, CFG.fall && CFG.fall[id] != null ? CFG.fall[id] : 700), FALL_MIN, FALL_MAX);
  const DYN_KEYS = ["base", "R", "X", "slope", "body", "rate", "h", "ip"];
  /** per-bar state of the hit part: base (the level the current hit adds to), R / X / slope (the falling ceiling
      of the hit: its part below RAMP_KNEE, the part above it, R's fall rate), body (the slow part) and its fall
      rate, h (the hit part's height, before the texture), ip (the previous frame's impulse); id = the hit, sm =
      the overshoot ceiling */
  function dynState(n) {
    const D = { id: -1, sm: SAT_MAX };
    for (const k of DYN_KEYS) D[k] = new Float32Array(n);
    return D;
  }
  /** r2: the same state resampled to n bars (map(i) = the old index). A re-layout ("Alcance", a colour pair, the
      window size) keeps every part of it, the hit id included, so nothing jumps and no hit is counted twice
      (v4.0 copied the blended height into both the hit and the rest part and fired a fake "new hit") */
  function dynResample(D, n, map) {
    const N = dynState(n);
    for (const k of DYN_KEYS) { const s = D[k], d = N[k]; for (let i = 0; i < n; i++) d[i] = s[map(i)]; }
    N.id = D.id; N.sm = D.sm;
    return N;
  }
  /** one frame of bar i. imp = the hit impulse now (the dense design's per-hit shape x this bar's amplitude, without
      the per-bar texture: that is applied to the result, after the saturation, so saturated hits stay ragged),
      fresh = a new dominant hit started (its attack is often over by this frame: the level under it is what the bar
      showed minus the previous frame's impulse, which a retriggered hit starts from). ADDITIVE: the impulse rides on
      the level under it (base), so a hit on top of high bars still kicks up; the hit's peak falls back (R / X) and
      as the impulse decays a slow body (<= BODY_MAX) keeps the bar up, falling the same way. The part above the body
      falls with the impulse (the dense look-ahead valleys), which leaves room for the next kick. */
  function dynStep(D, i, imp, fresh, dt, fallMs) {
    const sm = D.sm, ip0 = D.ip[i];
    if (fresh) D.base[i] = Math.max(0, satInv(D.h[i], sm) - ip0);
    D.ip[i] = imp;
    const T = sat(D.base[i] + imp, sm);
    // the hit's peak falling back: the part above RAMP_KNEE (the kick zone) in about 0.3 x "Volta" (25..260 ms), the
    // rest linearly to 10% in "Volta", so between dense hits the bar settles below ~0.8 and the next kick has room
    // while the visible return stays as slow as "Volta" says. r2: a falling STATE that only a higher target lifts
    // (v4.0 restarted a ramp whenever "T >= its peak", and a Float32 peak equals a constant T: a new hit id with no
    // impulse - a track change before the new track's first hit, the fallback handing over to the analysis -
    // restarted it every frame and froze the bars for the whole intro). Only a RISING impulse (an attack) lifts it:
    // the level a hit adds to (base) is a constant, so a falling ceiling is what brings it down
    let R = D.R[i] - D.slope[i] * dt, X = D.X[i] * Math.exp(-dt / clamp(0.3 * fallMs, 25, 260));
    if (R < 0) R = 0;
    if (imp > ip0 + 1e-5 && T > R + X + 1e-4) { R = T < RAMP_KNEE ? T : RAMP_KNEE; X = T - R; D.slope[i] = (0.9 * R) / fallMs; }
    D.R[i] = R; D.X[i] = X;
    const top = R + X, Te = T < top ? T : top;
    let B = D.body[i];
    // a real new peak sets the body's fall rate (to 10% in "Volta"); a ceiling that merely catches up with the
    // falling body lifts it without slowing it down (r2: v4.0 reset the rate to the lower level each time, so the
    // last part of the fall took ever longer)
    if (Te > B) { const c = bodyCap(Te); if (c > B + 0.01) { B = c; D.rate[i] = (0.9 * B) / fallMs; } else if (c > B) { B = c; if (D.rate[i] < (0.9 * B) / fallMs) D.rate[i] = (0.9 * B) / fallMs; } }   // v6: no stuck body
    B -= D.rate[i] * dt;
    if (B < 0) B = 0;
    D.body[i] = B;
    const H = Te > B ? Te : B;
    D.h[i] = H;
    return H;
  }
  /** falling peak caps ("tracinhos"): jump to a new height, hold, then fall with gravity onto the bar; r2: the hold
      and the fall follow "Volta" (setCapTiming), so with "Rápida" they do not hang above bars that are already down */
  function capState(n) {
    return { v: new Float32Array(n), vel: new Float32Array(n), hold: new Float32Array(n), hold0: CAP_HOLD_MS, g: 2 / (CAP_FALL_MS * CAP_FALL_MS) };
  }
  function capResample(C, n, map) {
    const N = capState(n);
    for (const k of ["v", "vel", "hold"]) { const s = C[k], d = N[k]; for (let i = 0; i < n; i++) d[i] = s[map(i)]; }
    N.hold0 = C.hold0; N.g = C.g;
    return N;
  }
  function setCapTiming(C, fallMs) {
    const F = clamp(1.3 * fallMs, 250, 2600);
    C.hold0 = Math.min(CAP_HOLD_MS, 0.3 * fallMs);
    C.g = 2 / (F * F);
  }
  function capStep(C, i, h, dt) {
    if (h >= C.v[i]) { C.v[i] = h; C.vel[i] = 0; C.hold[i] = C.hold0; return; }
    if (C.hold[i] > 0) { C.hold[i] -= dt; return; }
    C.vel[i] += C.g * dt;
    C.v[i] -= C.vel[i] * dt;
    if (C.v[i] < h) { C.v[i] = h; C.vel[i] = 0; }
  }
  /** r2: the rest (mids / hats) alone eases into REST_MAX, so it cannot fill the headroom the hits need */
  function restSoft(x) {
    if (x <= REST_KNEE) return x;
    const r = REST_MAX - REST_KNEE;
    return REST_KNEE + r * (1 - Math.exp(-(x - REST_KNEE) / r));
  }
  /** displayed height: the hit part screen-blended with the rest (mids / hats), that blend capped softly at
      REST_MAX; a hit above it shows as it is (the overshoot kept) */
  /** v6: the hit part ON TOP of the rest (see ND_KADD): rest + hit x (1 - ND_KOV x rest), softly capped (sat) */
  function blendA(hH, sm, hR) {
    if (!ND_KADD) return blendH(hH, hR);
    if (hH >= 1) return hH;
    const r = restSoft(hR), x = sat(r + hH * (1 - ND_KOV * r), sm);
    return x > hH ? x : hH;
  }
  function blendH(hH, hR) {
    if (hH >= 1) return hH;
    const b = restSoft(1 - (1 - hH) * (1 - hR));
    return b > hH ? b : hH;
  }
  /** r2: a fresh start for a view's visualizer (entering ambient mode, opening the panel): every part of the state,
      not only the drawn height (v4.0 only cleared hgt, which is rebuilt from the rest every frame) */
  function resetDyn(v) {
    // v5b: the per-element layers start fresh too (no envelope, entry age or tick carried over; the orbit restarts)
    const Z = v && (v === V.main ? SIG.main : v === V.preview ? SIG.preview : null);
    if (Z && Z.ext) Z.ext.el = null;
    if (v && v.el) v.el.e0 = null;
    const G = v && v.g;
    if (!G) return;
    if (G.dyn) G.dyn = dynState(G.dyn.h.length);
    if (G.caps) G.caps = capState(G.caps.v.length);
    for (const k of ["hr", "hgt", "ampR", "amp"]) if (G[k]) G[k].fill(0);
    if (G.kick) G.kick = 1;
  }
  /** r2: the size of a style's level 1 in the overlay (px) at "Alcance" alc: as v4 up to 60% (lin x alc), then
      growing to the largest size whose biggest hit (SAT_HI overshoot x the strongest camera zoom zmax) still ends
      TOP_MARGIN below the window's top (v4.0 sized 100% with the zoom off, so the zoom pushed it off the window).
      H0 = window height, S0 = v3's ring box (the cover keeps its size). Bars: half-height; ring: { rc, r0, len };
      wave: the main ribbon's amplitude unit (three sines rarely line up past ~0.9 of their sum) */
  function styleSize(style, H0, S0, alc, zmax) {
    const up = VIS_CY * H0, z = Math.max(1, zmax || 1);
    const grow = (lin, fit) => {
      const a = lin * 0.6, b = Math.max(fit, a);
      return alc <= 0.6 ? lin * alc : a + (b - a) * ((alc - 0.6) / 0.4);
    };
    if (style === "ring") {
      // v5b-r2: the dot ring ("Agudos e chimbal", 1.12 x len) no longer shrinks the budget (v5b: -13 % crown at
      // Alcance 100 %): its dots fade before the window top and the title instead (elOver), as in v5a
      const rc = S0 * 0.205, r0 = rc + S0 * 0.035, dk = SAT_HI, dp = 0;
      const lin = (up - r0 * 1.1 - 14) / SAT_MAX, fit = ((up - TOP_MARGIN) / z - r0 * 1.1 - 2 - dp) / dk;
      return { rc, r0, len: Math.max(16, grow(lin, fit)) };
    }
    if (style === "bars") return Math.max(8, grow(REACH_H * H0, (up - TOP_MARGIN) / (SAT_HI * z)));
    return Math.max(8, grow(REACH_H * H0, (up - TOP_MARGIN) / (z * 1.15 * SAT_HI * 0.9)));
  }

  // -- style 1: "Barras espelhadas" -------------------------------------------
  // bass drives the centre bars hardest; the shoulders carry energy x chroma,
  // the outer bars the hats
  const BARS = {
    // signal channels this renderer reads (SIGNAL_CHANNELS)
    reads: ["gate", "kickPk", "kickSh", "kickVis", "kickId", "low", "hat", "energy", "P12", "groove", "four"],
    layout(v, prev) {
      const w = v.w, h = v.h, small = v.kind === "preview";
      const margin = Math.round(w * 0.04);
      let n = Math.round((w - margin * 2) / (small ? 9 : 15));
      n = clamp(n - (n % 2), 24, 84);
      const G = { n, pitch: (w - margin * 2) / n };
      G.barW = clamp(G.pitch * 0.32, small ? 2 : 3, 6);
      G.x0 = margin + (G.pitch - G.barW) / 2;
      // "Alcance": styleSize (the canvas is sized for it, overshoot and zoom included); the preview spans its own height
      const room = (h / 2 - (small ? 3 : 8)) / SAT_HI;
      G.half = Math.min(room, small ? Math.max(5, (h / 2 - 7) * v.alc) : styleSize("bars", v.H0, 0, v.alc, v.zmax));
      G.capH = small ? 1.5 : 3;
      G.a = new Float32Array(n); G.q = new Float32Array(n); G.r = new Float32Array(n * 4); G.hgt = new Float32Array(n);
      G.hr = new Float32Array(n);                 // the rest (mids / hats), smoothed on its own
      G.cw = new Float32Array(n); G.ck = new Float32Array(n); G.sw = new Float32Array(n); G.shape = new Float32Array(n); G.ow = new Float32Array(n);
      const rnd = seeded(0x6d2b79f5);
      // r2: a re-layout carries the whole state (dynResample), not the drawn height
      const map = prev && prev.dyn ? (i) => Math.min(prev.n - 1, Math.floor(((i + 0.5) / n) * prev.n)) : null;
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n) * 2 - 1, a = Math.abs(u);
        G.a[i] = a;
        G.q[i] = clamp(a * 11 + (rnd() - 0.5) * 0.7, 0, 11);
        for (let k = 0; k < 4; k++) G.r[i * 4 + k] = rnd();
        G.cw[i] = Math.exp(-(a * a) / (2 * 0.2 * 0.2));                    // centre: bass
        G.ck[i] = ND_BFLAT < 0 ? G.cw[i] : a <= ND_BFLAT ? 1 : Math.exp(-((a - ND_BFLAT) * (a - ND_BFLAT)) / (2 * ND_BSIG * ND_BSIG));   // v6: the kick's zone
        G.sw[i] = Math.exp(-((a - 0.42) * (a - 0.42)) / (2 * 0.28 * 0.28)); // shoulders: mids
        G.ow[i] = Math.exp(-((a - 0.72) * (a - 0.72)) / (2 * 0.17 * 0.17));  // outer third: hats (tapers at the very edge)
        G.shape[i] = 0.32 + 0.68 * Math.exp(-(a * a) / 0.5);
        if (map) { G.hgt[i] = prev.hgt[map(i)]; G.hr[i] = prev.hr[map(i)]; }
      }
      G.dyn = map ? dynResample(prev.dyn, n, map) : dynState(n);
      G.jOff = prev ? num(prev.jOff, 0) : 0;      // final-build: the soft mode's shimmer offset (kept across re-layouts)
      G.caps = map ? capResample(prev.caps, n, map) : capState(n);
      const c = v.ctx;
      const g = c.createLinearGradient(0, h / 2 - G.half, 0, h / 2 + G.half);
      [0, 0.3, 0.5, 0.7, 1].forEach((o, i) => g.addColorStop(o, PAL.barsCore[i]));   // white core, a2-tinted top, a1-tinted bottom
      G.core = g;
      const l = c.createLinearGradient(0, 0, w, 0);
      l.addColorStop(0, "rgba(255, 255, 255, 0)");
      l.addColorStop(0.5, PAL.line);
      l.addColorStop(1, "rgba(255, 255, 255, 0)");
      G.line = l;
      const hg = v.hctxA.createLinearGradient(0, 0, v.hazeA.width, 0);
      hg.addColorStop(0, PAL.haze[0]);
      hg.addColorStop(0.5, PAL.haze[1]);
      hg.addColorStop(1, PAL.haze[2]);
      G.haze = hg;
      if (elK()) elBarsLayout(v, G, margin);       // v5b: zone colours (a1 centre, mix shoulders, a2 tips) + hairlines
      v.g = G;
    },
    update(v, sig, dt, gain, t, fallMs) {
      const G = v.g, n = G.n, P12 = sig.P12, playing = sig.gate > 0.5, D = G.dyn, V = fallOf("bars", fallMs);
      // the mids / hats part falls with a share of "Volta" (v3: 60 ms); the attack is instant everywhere
      const down = 1 - Math.exp(-dt / (playing ? clamp(V * REST_FALL_SHARE, 60, 500) : 420));
      const fresh = sig.kickId !== D.id;
      D.id = sig.kickId;
      D.sm = satMaxOf(gain);
      setCapTiming(G.caps, V);
      const tS = t / 1000, mid = Math.pow(sig.energy, 1.35), gate = sig.gate;
      if (num(sig.softJ, 0) > 0) G.jOff = num(G.jOff, 0) + (dt / 1000) * SOFT_JIT * sig.softJ;   // final-build: calmer shimmer (final-fix: with the layers on)
      const tJ = tS - num(G.jOff, 0);
      // intensity: the bass hits get the full gain, the in-between movement
      // (mids, hats) only its square root, so 200% hits harder without mush; r2: past 200% the in-between keeps
      // its 200% level (gR) and the hits get wider instead (cwX: the centre's Gaussian widens up to x1.34 at 500%)
      const gR = Math.min(gain, 2), gM = Math.sqrt(gR), over = overOf(gain), cwX = 1 / (1 + 0.8 * over);
      // v5 "Balanço no ritmo": the baseline (rest layer) pumps on the beat, centre-weighted; added after the rest's
      // own smoothing so it stays exactly on the beat whatever "Volta" is, and capped with it (restSoft)
      const lift = GROOVE_LIFT * ND_GR * grooveAmt() * sig.groove;
      // v5b "Camadas por elemento": the rest is a mirrored virtual spectrum (centre LOW, shoulders MID, tips AIR); a
      // camada that is off hands its v5 term back; a riser narrows the bass's Gaussian (rest only, the kick is v5)
      const EL = elOf(sig), EK = EL && EL.K, EE = EL && EL.E;
      const cwW = EL && !S.reducedMotion ? Math.max(0.6, 1 - 0.4 * EK.M * EE.rise) : 1;
      const hk = EL ? num(EE.hitK, 1) : 1, vk = num(sig.kickVis, 1);   // r3: a tick / soft tick stays smaller after the saturation
      // v6-r2: without drums the centre is the voice's too (v6: a bow-tie with an empty middle in voice-only parts)
      const dzB = clamp(num(sig.drums, 1), 0, 1), vC = ND_BVC * (1 - dzB);
      const kM = EL_KEEP_MID * (1 - clamp(num(sig.four, 0), 0, 1));   // r3: the centre keeps part of v5's energy term (EL_KEEP_MID)
      const sB = num(sig.softB, 0);               // final-fix: the soft mode's swell of the uncovered field (0 on analysed music)
      let csum = 0, cn = 0;
      for (let i = 0; i < n; i++) {
        const r0 = G.r[i * 4], r1 = G.r[i * 4 + 1], r2 = G.r[i * 4 + 2], r3 = G.r[i * 4 + 3];
        const p = chroma(P12, G.q[i]);
        const wob = 1 + 0.12 * Math.sin(tS * (0.9 + r0 * 1.4) + r1 * TAU) + 0.06 * Math.sin(tJ * (5.1 + r2 * 3.3) + r3 * TAU);
        // per-bar jitter so a kick is a ragged burst, not a smooth bell
        const jit = 0.5 + 0.5 * Math.sin(tJ * (6 + r3 * 5) + r0 * TAU);
        const bwU = G.shape[i] * (0.78 + 0.14 * jit + 0.16 * p) * 1.45;
        const bw = bwU * (over > 0 ? Math.pow(G.ck[i], cwX) : G.ck[i]) * gain;
        const midV = mid * (0.3 + 0.7 * p) * (0.15 + 0.85 * G.sw[i]) * wob * 0.5 * gM;
        // the hit: its AMPLITUDE saturates, its shape stays linear (200% still drops between dense hits)
        const hitV = softClip(ndKc(sig.kickPk) * bw * ND_KM * 0.97) * sig.kickSh * hk * vk;     // v5b-r2: x the breakdown's calm (hitK); r3: x the hit's size
        let restV, grave = 0;
        if (!EL) restV = softClip(sig.low * bwU * G.cw[i] * gR + G.shape[i] * midV + sig.hat * G.ow[i] * (0.35 + 0.65 * r2) * 0.34 * gM + sB * G.shape[i] * (0.55 + 0.45 * p) * wob * gM);
        else {
          const sh = G.shape[i] * (0.62 + 0.38 * p) * wob, a = G.a[i], cwR = cwW < 1 ? Math.exp(-(a * a) / (0.08 * cwW * cwW)) : G.cw[i];
          // the layer part (one soft cap; its own followers, so it skips the rest smoothing) dips before each hit where
          // the hits are (centre Gaussian), the handed-back v5 terms go through the rest smoothing as in v5
          // r2: one ceiling per camada (Grave: its own lower one), so each slider still grows past 200 %; the voice keeps off
          // the centre bars (they show the bass and its kick: punch over the body >= 0.85 x v5)
          grave = ((EK.G ? elRestK(sh * EE.low * 0.62 * ND_G_IN * 1 * cwR * gR, EK.G, EL_GRAVE_MAX * 1) : 0) + (EK.V ? elRestK(sh * EE.mid * 0.50 * ND_V_IN * 1.8 * (G.sw[i] * (1 - 0.9 * G.cw[i] * dzB) + vC * G.cw[i]) * gM, EK.V) +
            0.12 * Math.min(1.5, elKin(EK.V)) * EE.fMid * (G.sw[i] * (1 - 0.9 * G.cw[i] * dzB) + vC * G.cw[i]) : 0) +   // r3: "a voz entrou" lifts the shoulders
            (EK.A ? elRestK(sh * EE.air * 0.42 * ND_A_IN * 3.5 * G.ow[i] * (0.55 + 0.45 * r2) * gM, EK.A) : 0)) * (1 - (1 - EE.duck) * G.cw[i]);
          restV = softClip((EK.G ? 0 : sig.low * bwU * G.cw[i] * gR) + (EK.V ? kM * G.cw[i] * num(sig.eOn, 0) : 1) * G.shape[i] * midV +
            (EK.A ? EL_BARS_HATS : 1) * sig.hat * G.ow[i] * (0.35 + 0.65 * r2) * 0.34 * gM + sB * G.shape[i] * (0.55 + 0.45 * p) * wob * gM);
        }
        const rest = G.shape[i] * (0.03 + 0.015 * Math.sin(tS * 0.8 + r1 * TAU));
        // r2: the per-bar texture multiplies the hit part AFTER the saturation, so a saturated burst stays ragged
        // (v4.0 put it inside: every centre bar reached the same height, a flat-topped slab)
        const tex = 0.76 + 0.24 * (0.55 * p + 0.45 * jit);
        const tR = restV * tex * gate + rest * (1 - gate);
        const hH = dynStep(D, i, hitV, fresh, dt, V) * tex;
        G.hr[i] = tR > G.hr[i] ? tR : G.hr[i] + (tR - G.hr[i]) * down;
        G.hgt[i] = blendA(hH, D.sm, EL ? G.hr[i] + lift * G.shape[i] + grave * tex : G.hr[i] + lift * G.shape[i]);
        capStep(G.caps, i, G.hgt[i], dt);
        if (G.a[i] < 0.2) { csum += G.hgt[i]; cn++; }
      }
      return cn ? csum / cn : 0;
    },
    draw(v, sig, fx) {
      const c = v.ctx, G = v.g, w = v.w, h = v.h, cy = h / 2, n = G.n;
      const gk = Math.min(1.6, fx.glow), over = fx.over || 0;
      // v5b-r3 "Subidas e calmarias" in "Barras": in a riser the bar field closes in towards the centre (x 1 - 0.15 T) and the
      // caps float higher; the drop releases both (r2: only the small "Grave" rest term narrowed, 0.8 % of the screen changed)
      const EL = fx.el, tR = EL && !EL.rm ? Math.min(1, EL.K.M) * EL.T : 0, cmp = 1 - 0.15 * tR, X = (x) => w / 2 + (x - w / 2) * cmp;
      G.cmp = cmp; G.capLift = (v.kind === "preview" ? 4 : 12) * tR;
      const bw = G.barW * cmp;
      // 1) coloured haze behind the bars
      const ha = v.hctxA, hw = v.hazeA.width, hh = v.hazeA.height, sx = hw / w, sy = hh / h;
      ha.clearRect(0, 0, hw, hh);
      ha.fillStyle = G.haze;
      for (let i = 0; i < n; i++) {
        const x = X(G.x0 + i * G.pitch - G.pitch * 0.35) * sx;
        const half = Math.max(1, G.hgt[i] * G.half * 1.06) * sy;
        ha.fillRect(x, cy * sy - half, G.pitch * 1.1 * cmp * sx, half * 2);
      }
      drawLayers(v, sig, fx, "haze");                  // v5b: glows that ride the haze's free blur (none when off)
      blitHaze(v, fx.el ? (0.3 + 0.38 * gk + 0.12 * over) * fx.el.hazeK : 0.3 + 0.38 * gk + 0.12 * over);
      // 2) hairline through the centre
      c.fillStyle = G.line;
      c.fillRect(0, cy - 0.5, w, 1);
      // 3) the bars (white core with a tight cyan halo) + their falling peak caps: one path, one shadow
      c.beginPath();
      const C = G.caps.v, ch = G.capH, capsOn = !CFG.caps || CFG.caps.bars !== false;
      for (let i = 0; i < n; i++) {
        const half = Math.max(1.25, G.hgt[i] * G.half), x = X(G.x0 + i * G.pitch);
        c.roundRect(x, cy - half, bw, half * 2, Math.min(bw / 2, half));
        const cap = C[i] * G.half + G.capLift;
        if (capsOn && cap - half > ch * 0.8) {
          c.roundRect(x, cy - cap - ch, bw, ch, ch / 2);
          c.roundRect(x, cy + cap, bw, ch, ch / 2);
        }
      }
      // r3 "Caixa e palmas" in "Barras": the bars' glow flashes white and wider on each snare / clap (elOver adds the tips)
      const snF = EL && EL.K.S && EL.E.snap > 0.003 ? Math.min(1, elPk(EL.K.S, 0.8, 1) * EL.E.snap) : 0;
      c.shadowColor = snF > 0.01 ? "rgba(" + elShadowMix(PAL.shadowRgb, 0.8 * snF) + ", " + Math.min(1, 0.45 + 0.4 * gk + 0.4 * snF).toFixed(3) + ")"
        : "rgba(" + PAL.shadowRgb + ", " + Math.min(1, 0.45 + 0.4 * gk).toFixed(3) + ")";
      c.shadowBlur = (9 + 14 * gk + 8 * over + 16 * snF) * v.dpr * (v.kind === "preview" ? 0.5 : 1);
      c.fillStyle = fx.el && G.coreEl ? G.coreEl : G.core;   // v5b: the zone colours (one pattern fill, one shadow)
      c.fill();
      c.shadowBlur = 0;
      c.shadowColor = "transparent";
    },
  };

  // -- style 2: "Anel neon" -----------------------------------------------------
  // radial mirrored bars around the album cover (a speaker cone): bass kicks
  // the cover + ring outwards and drives the top / bottom bars; the sides carry
  // energy x chroma; random bars sparkle with the hats
  const RING = {
    reads: ["gate", "kickPk", "kickSh", "kickZ", "kickVis", "kickId", "low", "hat", "energy", "P12", "groove", "four"],   // + fx.sway
    layout(v, prev) {
      const w = v.w, h = v.h, small = v.kind === "preview";
      const G = { cx: w / 2, cy: h / 2 };
      // v5b-r2: the length budget is v5a's again (the dot ring fades near the edges instead of shrinking the crown)
      const dk = SAT_HI, dp = 0;
      if (small) {                               // the preview: a smaller cover, so "Alcance" shows
        const S0 = Math.min(w, h);
        G.rc = S0 * 0.15;
        G.r0 = G.rc + S0 * 0.03;
        G.len = Math.max(4, ((S0 / 2 - 4 - G.r0 * 1.1 - dp) / dk) * v.alc);
      } else {
        // the cover keeps v3's size (its box: 1180 x 620 at most); "Alcance": styleSize (zoom and overshoot included)
        const Z = styleSize("ring", v.H0 || h, v.S0 || Math.min(w, h), v.alc, v.zmax);
        G.rc = Z.rc;                             // cover radius
        G.r0 = Z.r0;                             // bars start here
        const fit = (h / 2 - 10 - G.r0 * 1.1 - dp) / dk;
        G.len = Math.max(16, Math.min(fit, Z.len));
      }
      G.n = small ? 64 : 120;                     // full circle
      G.m = G.n / 2;                              // mirrored halves
      G.barW = clamp((TAU * G.r0 / G.n) * 0.36, small ? 1.4 : 2, 5);
      G.capL = small ? 1.6 : 3.2;                 // peak cap: a short dash past the tip
      // r2: an elliptical length budget: the side bars may be up to RING_SIDE_X longer (a 16:9 window is wider than
      // tall), so a big hit bursts round / wide instead of as a tall vase; as much as the canvas width allows
      const EX = clamp((w / 2 - (small ? 3 : 30) - G.r0 * 1.1 - 2 - dp) / (G.len * dk), 1, RING_SIDE_X);
      G.cos = new Float32Array(G.n); G.sin = new Float32Array(G.n);
      for (let k = 0; k < G.n; k++) {
        const ang = -Math.PI / 2 + ((k + 0.5) / G.n) * TAU;
        G.cos[k] = Math.cos(ang); G.sin[k] = Math.sin(ang);
      }
      G.u = new Float32Array(G.m); G.q = new Float32Array(G.m); G.r = new Float32Array(G.m * 4);
      G.tb = new Float32Array(G.m); G.hgt = new Float32Array(G.m); G.ex = new Float32Array(G.m);
      G.hr = new Float32Array(G.m);               // the rest (mids / hats), smoothed on its own
      const rnd = seeded(0x2f6b1d3);
      const map = prev && prev.dyn ? (m) => Math.min(prev.m - 1, Math.floor(((m + 0.5) / G.m) * prev.m)) : null;
      for (let m = 0; m < G.m; m++) {
        const u = (m + 0.5) / G.m;                // 0 top -> 1 bottom
        G.u[m] = u;
        G.tb[m] = 0.5 + 0.5 * Math.cos(u * TAU);  // 1 at top / bottom, 0 at the sides
        G.ex[m] = 1 + (EX - 1) * G.cos[m] * G.cos[m];
        G.q[m] = clamp(u * 11 + (rnd() - 0.5) * 0.8, 0, 11);
        for (let k = 0; k < 4; k++) G.r[m * 4 + k] = rnd();
        if (map) { G.hgt[m] = prev.hgt[map(m)]; G.hr[m] = prev.hr[map(m)]; }
      }
      G.EX = EX;
      G.dyn = map ? dynResample(prev.dyn, G.m, map) : dynState(G.m);
      G.caps = map ? capResample(prev.caps, G.m, map) : capState(G.m);
      G.kick = prev ? prev.kick : 1;
      G.jOff = prev ? num(prev.jOff, 0) : 0;      // final-build: the soft mode's shimmer offset (kept across re-layouts)
      const hw = v.hazeA.width, hh = v.hazeA.height;
      const cg = v.hctxA.createConicGradient(-Math.PI / 2, hw / 2, hh / 2);
      cg.addColorStop(0, PAL.haze[2]);          // a2 at the top, a1 at the bottom
      cg.addColorStop(0.25, PAL.haze[1]);
      cg.addColorStop(0.5, PAL.haze[0]);
      cg.addColorStop(0.75, PAL.haze[1]);
      cg.addColorStop(1, PAL.haze[2]);
      G.haze = cg;
      const c = v.ctx;
      const rg = c.createRadialGradient(G.cx, G.cy, G.r0, G.cx, G.cy, G.r0 + G.len * (1 + 0.5 * (EX - 1)));
      rg.addColorStop(0, PAL.ringCore[0]);
      rg.addColorStop(0.6, PAL.ringCore[1]);
      rg.addColorStop(1, PAL.ringCore[2]);
      G.core = rg;
      if (elK()) elRingLayout(v, G, EX);         // v5b: the crown's tips lean to a1
      v.g = G;
    },
    update(v, sig, dt, gain, t, fallMs) {
      const G = v.g, P12 = sig.P12, playing = sig.gate > 0.5, gate = sig.gate, D = G.dyn, V = fallOf("ring", fallMs);
      const down = 1 - Math.exp(-dt / (playing ? clamp(V * REST_FALL_SHARE, 65, 500) : 420));   // attack: instant
      const fresh = sig.kickId !== D.id;
      D.id = sig.kickId;
      D.sm = satMaxOf(gain);
      setCapTiming(G.caps, V);
      // r2: past 200% the in-between keeps its 200% level (gR) and the sides take more of each hit (side share)
      const tS = t / 1000, mid = Math.pow(sig.energy, 1.35), gR = Math.min(gain, 2), gM = Math.sqrt(gR), over = overOf(gain);
      if (num(sig.softJ, 0) > 0) G.jOff = num(G.jOff, 0) + (dt / 1000) * SOFT_JIT * sig.softJ;   // final-build: calmer shimmer (final-fix: with the layers on)
      const tJ = tS - num(G.jOff, 0);
      const side = 0.32 + 0.12 * over;
      const lift = GROOVE_LIFT * ND_GR * grooveAmt() * sig.groove;    // v5 "Balanço no ritmo" (as BARS)
      // v5b "Camadas por elemento": the crown's rest = "Grave" (LOW, after the rest smoothing, with its sidechain dip);
      // the mids go to the halo, the hats mostly to the dots (EL_CROWN_HATS stays); a camada that is off hands its v5
      // term back to the crown
      const EL = elOf(sig), EK = EL && EL.K, EE = EL && EL.E, hk = EL ? num(EE.hitK, 1) : 1, vk = num(sig.kickVis, 1);
      const nf = 1 - clamp(num(sig.four, 0), 0, 1), kM = EL_KEEP_MID * nf, kH = EL_CROWN_HATS + (EL_KEEP_HATS - EL_CROWN_HATS) * nf;   // r3
      let sum = 0, cnt = 0;
      for (let m = 0; m < G.m; m++) {
        const r0 = G.r[m * 4], r1 = G.r[m * 4 + 1], r2 = G.r[m * 4 + 2];
        const p = chroma(P12, G.q[m]), tb = G.tb[m];
        const wob = 1 + 0.12 * Math.sin(tS * (0.8 + r0 * 1.5) + r1 * TAU);
        const jit = 0.5 + 0.5 * Math.sin(tJ * (5 + r2 * 6) + r0 * TAU);
        // three slowly turning lobes per side: every kick blooms into petals
        const lobe = 0.5 + 0.5 * Math.cos(3 * G.u[m] * TAU + tS * 0.45);
        // bass pushes the top / bottom hardest; the sides carry energy x chroma
        // (r2: the sides get more of the hit than v3 (0.12 + 0.88 tb^1.6) or v4.0 (0.24 + 0.76 tb^1.3), and their
        // bars may be longer (G.ex), so long bars burst round, not as a capsule)
        const bwU = (side + (1 - side) * Math.pow(tb, 1.3)) * (0.8 + 0.2 * p) * (0.78 + 0.32 * lobe) * 1.7;
        const sK = ND_RSIDE + 0.12 * over, bwK = ND_RSIDE < 0 ? bwU : (sK + (1 - sK) * smooth(clamp((tb - ND_RT0) / (ND_RT1 - ND_RT0), 0, 1))) * (0.8 + 0.2 * p) * (0.78 + 0.32 * lobe) * 1.7;   // v6: the kick's zone
        const midV = mid * (0.3 + 0.7 * p) * (0.25 + 0.75 * (1 - tb)) * wob * 0.42 * gM;
        // the hit: its AMPLITUDE saturates, its shape stays linear (200% still drops between dense hits)
        const hitV = softClip(ndKc(sig.kickPk) * bwK * gain * ND_KM * 0.925) * sig.kickSh * hk * vk;   // v5b-r2: x the breakdown's calm (hitK); r3: x the hit's size
        const restV = !EL ? softClip(sig.low * bwU * gR + midV + sig.hat * (r2 > 0.55 ? 0.34 : 0.08) * (0.4 + 0.6 * r0) * gM)
          : softClip((EK.G ? 0 : sig.low * bwU * gR) +
            (EK.V ? kM * smooth(n01(tb, 0.35, 0.75)) * num(sig.eOn, 0) : 1) * midV + (EK.A ? kH : 1) * sig.hat * (r2 > 0.55 ? 0.34 : 0.08) * (0.4 + 0.6 * r0) * gM);
        const grave = (EL && EK.G ? elRestK(EE.low * 0.50 * ND_G_IN * 1 * (0.6 + 0.4 * p) * (0.78 + 0.32 * lobe) * (0.8 + 0.4 * tb) * gR, EK.G, EL_GRAVE_MAX * 1) * EE.duck : 0) +
          // v6-r3 "Caixa e palmas": a short lift of the whole crown (sides a bit more) on each snare / clap, so a snare has area
          // on screen too (r2: a hairline + the crown flash, ~1/4 of a kick); it follows the snap's own 160 ms flick, not "Volta"
          (EL && EK.S && ND_S_RL > 0 && EE.snap > 0.003 ? ND_S_RL * Math.min(1.5, elKin(EK.S)) * EE.snap * (0.7 + 0.3 * (1 - tb)) * gM : 0) +
          (EL && EK.V && ND_V_CR > 0 ? elRestK(EE.mid * ND_V_CR * (ND_V_CR0 + (1 - ND_V_CR0) * clamp(num(sig.drums, 1), 0, 1)) * (0.3 + 0.7 * p) * (0.25 + 0.75 * (1 - tb)) * wob * gM, EK.V) : 0);
        const rest = 0.035 + 0.02 * Math.sin(tS * 0.7 + r1 * TAU);
        // the per-bar texture comes after the saturation (r2), so saturated hits keep it
        const tex = 0.68 + 0.32 * (0.55 * p + 0.45 * jit);
        const tR = restV * tex * gate + rest * (1 - gate);
        const hH = dynStep(D, m, hitV, fresh, dt, V) * tex;
        G.hr[m] = tR > G.hr[m] ? tR : G.hr[m] + (tR - G.hr[m]) * down;
        G.hgt[m] = blendA(hH, D.sm, EL ? G.hr[m] + lift * (0.45 + 0.55 * tb) + grave * tex : G.hr[m] + lift * (0.45 + 0.55 * tb));
        capStep(G.caps, m, G.hgt[m], dt);
        if (tb > 0.6) { sum += G.hgt[m]; cnt++; }
      }
      // cover / cone: a short per-hit pulse (amplitude saturated, linear shape, softer in dense runs) or the
      // sustained low end; it does not follow "Volta" (like the zoom and the glow)
      const kt = 1 + ND_KCOV * (1 - (1 - softClip(ndKc(sig.kickPk) * gain * ND_KM) * sig.kickSh * sig.kickZ * hk * vk) * (1 - softClip(sig.low * gR)));
      G.kick = kt > G.kick ? kt : G.kick + (kt - G.kick) * (1 - Math.exp(-dt / (playing ? HIT_SMOOTH_MS : 90)));
      return cnt ? sum / cnt : 0;
    },
    draw(v, sig, fx) {
      const c = v.ctx, G = v.g, w = v.w, h = v.h, n = G.n, gk = Math.min(1.6, fx.glow), over = fx.over || 0;
      const cx = G.cx, cy = G.cy, r0 = G.r0 * G.kick, rc = G.rc * G.kick, len = G.len, ex = G.ex;
      // v5 "Balanço no ritmo": the crown (bars, haze, caps) sways around the cover like a pendulum over two beats;
      // the cover and its rim stay still. Rotating the direction vectors costs 4 multiplications per bar.
      const sw = fx.sway || 0, ca = Math.cos(sw), sa = Math.sin(sw);
      const COS = (k) => G.cos[k] * ca - G.sin[k] * sa, SIN = (k) => G.sin[k] * ca + G.cos[k] * sa;
      // 1) haze (cyan top -> pink bottom)
      const ha = v.hctxA, hw = v.hazeA.width, hh = v.hazeA.height, sx = hw / w, sy = hh / h;
      ha.clearRect(0, 0, hw, hh);
      ha.strokeStyle = G.haze;
      ha.lineWidth = Math.max(1, G.barW * 3.2 * sx);
      ha.lineCap = "round";
      ha.beginPath();
      for (let k = 0; k < n; k++) {
        const m = k < G.m ? k : n - 1 - k, L = Math.max(1, G.hgt[m] * len * ex[m] * 1.08), co = COS(k), si = SIN(k);
        ha.moveTo((cx + co * r0) * sx, (cy + si * r0) * sy);
        ha.lineTo((cx + co * (r0 + L)) * sx, (cy + si * (r0 + L)) * sy);
      }
      ha.stroke();
      ha.beginPath();
      ha.lineWidth = Math.max(1, 4 * sx);
      ha.arc(cx * sx, cy * sy, r0 * 0.96 * sx, 0, TAU);
      ha.stroke();
      drawLayers(v, sig, fx, "haze");                  // v5b: the shockwave's glow (none when off)
      blitHaze(v, fx.el ? (0.32 + 0.38 * gk + 0.12 * over) * fx.el.hazeK : 0.32 + 0.38 * gk + 0.12 * over);
      // 2) bars + their falling peak caps (a short dash past the tip): one stroke, one shadow
      c.beginPath();
      const C = G.caps.v, cl = G.capL, gap = G.barW * 0.9 + 1, capsOn = !CFG.caps || CFG.caps.ring !== false;
      for (let k = 0; k < n; k++) {
        const m = k < G.m ? k : n - 1 - k, lm = len * ex[m], L = Math.max(1.5, G.hgt[m] * lm), co = COS(k), si = SIN(k);
        c.moveTo(cx + co * (r0 + 2), cy + si * (r0 + 2));
        c.lineTo(cx + co * (r0 + 2 + L), cy + si * (r0 + 2 + L));
        const cap = C[m] * lm;
        if (capsOn && cap - L > gap + cl) {
          c.moveTo(cx + co * (r0 + 2 + cap), cy + si * (r0 + 2 + cap));
          c.lineTo(cx + co * (r0 + 2 + cap + cl), cy + si * (r0 + 2 + cap + cl));
        }
      }
      c.lineCap = "round";
      c.lineWidth = G.barW;
      c.strokeStyle = fx.el && G.coreEl ? G.coreEl : G.core;
      c.shadowColor = "rgba(" + PAL.shadowRgb + ", " + Math.min(1, 0.5 + 0.4 * gk).toFixed(3) + ")";
      c.shadowBlur = (8 + 14 * gk + 8 * over) * v.dpr * (v.kind === "preview" ? 0.5 : 1);
      c.stroke();
      // 3) the cone rim
      c.beginPath();
      c.arc(cx, cy, r0 - 3, 0, TAU);
      c.lineWidth = v.kind === "preview" ? 1.2 : 2;
      c.strokeStyle = PAL.rim;
      c.stroke();
      c.shadowBlur = 0;
      c.shadowColor = "transparent";
      // 4) the cover (cross-fades on track change)
      drawCover(c, cx, cy, rc - (v.kind === "preview" ? 2 : 7));
    },
  };

  function drawCover(c, cx, cy, r) {
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.closePath();
    c.fillStyle = "#0b1a36";
    c.fill();
    c.clip();
    const k = cover.prev ? clamp((now() - cover.swapAt) / 320, 0, 1) : 1;
    if (k >= 1) cover.prev = null;
    if (cover.prev && ready(cover.prev)) { c.globalAlpha = 1; fitImage(c, cover.prev, cx, cy, r); }
    if (cover.img && ready(cover.img)) { c.globalAlpha = k; fitImage(c, cover.img, cx, cy, r); }
    c.globalAlpha = 1;
    const sh = c.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    sh.addColorStop(0, "rgba(2, 7, 19, 0)");
    sh.addColorStop(1, "rgba(2, 7, 19, 0.35)");
    c.fillStyle = sh;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
    c.restore();
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.lineWidth = 1;
    c.strokeStyle = PAL.coverRing;
    c.stroke();
  }
  const ready = (img) => img.complete && img.naturalWidth > 0;
  function fitImage(c, img, cx, cy, r) {
    const iw = img.naturalWidth, ih = img.naturalHeight, s = (r * 2) / Math.min(iw, ih);
    c.drawImage(img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
  }

  // -- style 3: "Onda" ------------------------------------------------------------
  // layered neon ribbons; the main one (bass) is a twisting ribbon with a
  // liquid body, the others follow energy and the hats
  const RIBBONS = [
    // colours: PAL.waveGlow / waveShadow[i] (a2, a1, their mix)
    { k: [1.55, 2.85, 4.6], c: [0.56, 0.3, 0.14], sp: [0.9, -1.25, 1.85], core: 3.0, mirror: true },
    { k: [1.1, 2.3, 3.75], c: [0.52, 0.33, 0.15], sp: [-0.62, 1.05, -1.5], core: 2.1, mirror: false },
    { k: [2.35, 3.9, 6.1], c: [0.45, 0.35, 0.2], sp: [1.4, -2.05, 2.7], core: 1.4, mirror: false },
  ];
  const WAVE = {
    reads: ["gate", "kickPk", "kickSh", "kickVis", "kickId", "low", "bass", "hat", "energy", "groove", "sway"],
    layout(v, prev) {
      const w = v.w, h = v.h, small = v.kind === "preview";
      // "Alcance": the main ribbon's amplitude unit (styleSize; three sines rarely line up past ~0.9 of their sum)
      const room = (h / 2 - (small ? 4 : 12)) / (1.15 * SAT_HI);
      const G = { cy: h / 2, H: Math.min(room, small ? Math.max(5, (h / 2 - 6) * v.alc) : styleSize("wave", v.H0, 0, v.alc, v.zmax)) };
      G.pts = clamp(Math.round(w / (small ? 6 : 9)), 40, 180);
      G.x = new Float32Array(G.pts); G.X = new Float32Array(G.pts); G.taper = new Float32Array(G.pts);
      for (let i = 0; i < G.pts; i++) {
        const f = i / (G.pts - 1);
        G.x[i] = f * w;
        G.X[i] = f * TAU;
        G.taper[i] = Math.pow(Math.sin(Math.PI * f), 1.35) * (0.75 + 0.25 * Math.exp(-((f - 0.5) * (f - 0.5)) / 0.04));
      }
      G.y = RIBBONS.map(() => new Float32Array(G.pts));
      G.kw = new Float32Array(G.pts); G.ampC = [0, 0, 0];   // v6: the kick's centre weight (ND_WKS)
      { let sw = 0, st = 0; for (let i = 0; i < G.pts; i++) { const d = (i / (G.pts - 1) - 0.5) / Math.max(1e-3, ND_WKS); G.kw[i] = ND_WKS > 0 ? Math.exp(-0.5 * d * d) : 1; sw += G.kw[i] * G.taper[i]; st += G.taper[i]; } G.kwM = st > 0 ? sw / st : 1; }
      // r2: a re-layout carries the whole state (the hit part, the rest and the hit id), not the drawn amplitude
      const keep = prev && prev.dyn && prev.ampR;
      G.amp = keep ? prev.amp.slice() : [0, 0, 0];
      G.ampR = keep ? prev.ampR.slice() : [0, 0, 0];   // the rest (energy / hats), smoothed on its own
      G.dyn = keep ? dynResample(prev.dyn, 3, (r) => r) : dynState(3);
      G.ph = prev ? prev.ph.map((a) => a.slice()) : RIBBONS.map((r, i) => r.k.map((_, j) => i * 1.7 + j * 2.1));
      const c = v.ctx;
      const fg = c.createLinearGradient(0, G.cy - G.H, 0, G.cy + G.H);
      [0, 0.35, 0.5, 0.65, 1].forEach((o, i) => fg.addColorStop(o, PAL.waveFill[i]));
      G.fill = fg;
      const edge = c.createLinearGradient(0, 0, w, 0);
      edge.addColorStop(0, "rgba(255, 255, 255, 0.15)");
      edge.addColorStop(0.18, "#ffffff");
      edge.addColorStop(0.82, "#ffffff");
      edge.addColorStop(1, "rgba(255, 255, 255, 0.15)");
      G.core = edge;
      v.g = G;
    },
    update(v, sig, dt, gain, t, fallMs) {
      // r2: past 200% the in-between keeps its 200% level (gR) and the two upper ribbons take more of each hit
      const G = v.g, playing = sig.gate > 0.5, gR = Math.min(gain, 2), gM = Math.sqrt(gR), over = overOf(gain), D = G.dyn, V = fallOf("wave", fallMs);
      const EL0 = elOf(sig), hk = EL0 ? num(EL0.E.hitK, 1) : 1, vk = num(sig.kickVis, 1);   // v5b-r2: x the breakdown's calm (hitK); r3: x the hit's size
      const hit = (w) => softClip(ndKc(sig.kickPk) * w * gain * ND_KM * 0.935) * sig.kickSh * hk * vk;   // the hit: amplitude saturates, shape stays linear
      const hits = [hit(1.15), hit((0.4 + 0.15 * over) * 0.3), hit((0.2 + 0.12 * over) * 0.3)];
      const drives = [                               // the rest: sustained low end (full gain), energy / hats (square root)
        sig.low * 1.15 * gR + sig.energy * 0.1 * gM,
        Math.pow(sig.energy, 1.3) * 0.48 * gM + sig.low * 0.4 * gR,
        sig.hat * 0.55 * gM + Math.pow(sig.energy, 1.4) * 0.26 * gM + sig.low * 0.2 * gR,
      ];
      // v5b "Camadas por elemento": ribbon 1 = "Grave" (LOW), 2 = "Voz e melodia" (MID), 3 = "Agudos e chimbal" (AIR +
      // the hat ticks); a camada that is off keeps its v5 drive. Riser: higher spatial frequency; calm: lower, slower
      const EL = elOf(sig), EK = EL && EL.K, EE = EL && EL.E;
      let elFq = 1, elAm = 1, elSp = 1, elBul = 0, elXf = 0, elOff = 0, elGrave = 0;
      if (EL) {
        if (EK.G) { elGrave = elRestK(EE.low * ND_G_IN * 1.3 * gR + sig.energy * 0.05 * gM, EK.G, EL_GRAVE_MAX * 1.2) * EE.duck; drives[0] = 0; }
        // v6-r2: under restSoft's knee (v6: x 2 into a x 1.8 ceiling pinned ribbon 2 at ~0.74 for any voice above ~0.3)
        if (EK.V) drives[1] = elRestK(0.62 * ND_V_IN * ND_VW * EE.mid * gM, EK.V, EL_REST_MAX * ND_VWC);
        // r3: v5's own hat term rides on top (r2 had only 0.30 x the layer's hat envelope: ribbon 3 moved less with the hats
        // than with the layers off)
        if (EK.A) drives[2] = elRestK((0.40 * EE.air * gM + 0.30 * EE.hatEnv * gM) * ND_A_IN * 1.6, EK.A, EL_REST_MAX * 1.3) + sig.hat * 0.55 * gM;
        elFq = 1 + Math.min(1.2, 0.8 * EK.M * EE.rise * EE.rise);
        elAm = 1 - Math.min(0.6, 0.3 * EK.M * EE.calm);
        elSp = 1 - Math.min(0.7, 0.4 * EK.M * EE.calm);
        if (EK.E && EE.ent > 0.003 && EE.entAge < EL_ENTRY_MS) {   // "Quando o grave entra": a bulge runs along the ribbons
          elBul = 0.6 * ND_E_A * EK.E * EE.ent;
          elXf = S.reducedMotion ? 0 : Math.min(1, EE.entAge / EL_SHOCK_MS) * (v.w / 2);
        }
        // r3: the soft entries swell their own ribbon for EL_FLASH_MS (with the white core in elOver)
        if (EK.V && EE.fMid > 0.01) drives[1] += 0.3 * Math.min(1.5, elKin(EK.V)) * EE.fMid;
        if (EK.A && EE.fAir > 0.01) drives[2] += 0.3 * Math.min(1.5, elKin(EK.A)) * EE.fAir;
        if (EK.V) elOff = -0.06 * G.H * Math.sin(S.reducedMotion ? EE.gHome : EE.gAng) * EE.glint;
      }
      // r3: the bulge is a WIDE swell (r2: an 80 px kernel, ~6 polyline points, times up to 1 + 3 x ent and clipped hard by
      // min(): at 300-500 % the ribbons broke into spikes and flat plateaus, 41-85 degree corners): >= 9 % of the width,
      // wider with the amount, a soft tanh ceiling, and only 0.4 x on ribbons 2 / 3
      const bw80 = Math.max(v.kind === "preview" ? 30 : 80, 0.09 * v.w) * Math.sqrt(Math.min(4, Math.max(1, EL ? EL.K.E : 1)));
      const fresh = sig.kickId !== D.id;
      D.id = sig.kickId;
      D.sm = satMaxOf(gain);
      const downR = 1 - Math.exp(-dt / (playing ? clamp(V * REST_FALL_SHARE, 120, 500) : 500));
      const speed = 0.55 + 0.9 * sig.energy + 0.9 * (sig.bass - (1 - 0.2) * sig.kick);
      const ds = dt / 1000;
      // v5 "Balanço no ritmo": the baseline lifts on the beat and the ribbons swing their phase (a pendulum over two
      // beats, the upper ribbons against the main one), on top of their own drift
      const grA = grooveAmt(), lift = GROOVE_LIFT * ND_GR * grA * sig.groove, swing = GROOVE_WAVE * ND_GR * grA * sig.sway;
      for (let r = 0; r < RIBBONS.length; r++) {
        const R = RIBBONS[r];
        const tR = softClip(drives[r]) * sig.gate + 0.05 * (1 - sig.gate), aR = G.ampR[r];
        const hH = dynStep(D, r, hits[r] * sig.gate, fresh, dt, V);
        G.ampR[r] = tR > aR ? tR : aR + (tR - aR) * downR;
        const restW = EL && r === 0 ? G.ampR[r] + lift + elGrave : G.ampR[r] + lift * (r === 0 ? 1 : 0.7);
        G.amp[r] = blendA(hH, D.sm, restW);
        let aK = 0;                                // v6: the kick's part, drawn centre-weighted (ND_WKS)
        if (ND_WKS > 0) { const a0 = blendA(0, D.sm, restW); aK = G.amp[r] > a0 ? G.amp[r] - a0 : 0; G.ampC[r] = G.amp[r]; G.amp[r] = a0 + aK * G.kwM; }
        const ph = G.ph[r];
        if (!EL) for (let j = 0; j < 3; j++) ph[j] = (ph[j] + ds * R.sp[j] * speed) % (TAU * 100);
        else {                                     // v5b: ribbon 2 drifts lazily with the voice, ribbon 3 runs with the air
          const sp = (r === 1 && EK.V ? 0.35 + ND_VSP * EE.mid : r === 2 && EK.A ? 1.2 + 1.5 * 1.8 * EE.air : speed) * elSp;
          for (let j = 0; j < 3; j++) ph[j] = (ph[j] + ds * R.sp[j] * sp) % (TAU * 100);
        }
        const p0 = ph[0] + swing * (r === 0 ? 1 : -0.6);
        const hS = G.H * (r === 0 ? 1.15 : r === 1 ? 0.92 : 0.7), aKw = 0.92 * aK * hS, kw = G.kw;
        const y = G.y[r], amp = (0.08 + 0.92 * (G.amp[r] - aK * (ND_WKS > 0 ? G.kwM : 0))) * hS;   // v6: without the centre-weighted kick part
        if (!EL) {
          for (let i = 0; i < G.pts; i++) {
            const X = G.X[i];
            y[i] = G.cy + (amp + aKw * kw[i]) * G.taper[i] * (R.c[0] * Math.sin(R.k[0] * X + p0) + R.c[1] * Math.sin(R.k[1] * X + ph[1]) + R.c[2] * Math.sin(R.k[2] * X + ph[2]));
          }
        } else {
          const am = amp * elAm, amK = aKw * elAm, k0 = R.k[0] * elFq, k1 = R.k[1] * elFq, k2 = R.k[2] * elFq, off = r === 1 ? elOff : 0, cx = v.w / 2;
          const bMax = (0.08 + 0.92 * SAT_HI) / (0.08 + 0.92 * Math.min(SAT_HI, ND_WKS > 0 ? G.ampC[r] : G.amp[r])), bR = Math.max(1e-3, bMax - 1);   // the bulge stays inside the budget
          const bul = elBul * (r === 0 ? 1 : 0.4);
          for (let i = 0; i < G.pts; i++) {
            const X = G.X[i];
            let b = 1;
            if (bul) { const dx = Math.min(Math.abs(G.x[i] - (cx - elXf)), Math.abs(G.x[i] - (cx + elXf))) / bw80; b = 1 + bR * Math.tanh(bul * Math.exp(-dx * dx) / bR); }
            y[i] = G.cy + off + (am + amK * kw[i]) * b * G.taper[i] * (R.c[0] * Math.sin(k0 * X + p0) + R.c[1] * Math.sin(k1 * X + ph[1]) + R.c[2] * Math.sin(k2 * X + ph[2]));
          }
        }
      }
      return ND_WKS > 0 ? G.ampC[0] : G.amp[0];   // v6: the kick zone (the centre)
    },
    draw(v, sig, fx) {
      const c = v.ctx, G = v.g, w = v.w, h = v.h, gk = Math.min(1.6, fx.glow), over = fx.over || 0, small = v.kind === "preview";
      // 1) haze
      const ha = v.hctxA, hw = v.hazeA.width, hh = v.hazeA.height, sx = hw / w, sy = hh / h;
      ha.clearRect(0, 0, hw, hh);
      ha.lineCap = "round";
      // v5b: with the layers each ribbon wears its element's colour (1 a1 = grave, 2 the halo colour = voz, 3 a2 = agudos)
      const EC = fx.el ? fx.el.cols : null, glowCol = EC ? [EC.glow0, elRgba(fx.el.halo, 0.9), EC.glow2] : PAL.waveGlow;
      for (let r = RIBBONS.length - 1; r >= 0; r--) {
        ha.strokeStyle = glowCol[r];
        ha.lineWidth = Math.max(1, (RIBBONS[r].core * 4 + 16 * G.amp[r]) * sx);
        ha.beginPath();
        curve(ha, G.x, G.y[r], G.pts, sx, sy, false, G.cy);
        if (RIBBONS[r].mirror) curve(ha, G.x, G.y[r], G.pts, sx, sy, true, G.cy);
        ha.stroke();
      }
      drawLayers(v, sig, fx, "haze");                  // v5b: ribbon 2's halo glow (none when off)
      blitHaze(v, fx.el ? (0.34 + 0.36 * gk + 0.12 * over) * fx.el.hazeK : 0.34 + 0.36 * gk + 0.12 * over);
      // 2) liquid body of the main ribbon (between it and its mirror)
      c.beginPath();
      curve(c, G.x, G.y[0], G.pts, 1, 1, false, G.cy);
      for (let i = G.pts - 1; i >= 0; i--) c.lineTo(G.x[i], 2 * G.cy - G.y[0][i]);
      c.closePath();
      c.globalAlpha = Math.min(1, 0.55 + 0.45 * G.amp[0]);
      c.fillStyle = G.fill;
      c.fill();
      c.globalAlpha = 1;
      // 3) cores
      c.lineCap = "round";
      c.lineJoin = "round";
      c.strokeStyle = G.core;
      for (let r = RIBBONS.length - 1; r >= 0; r--) {
        const R = RIBBONS[r];
        c.beginPath();
        curve(c, G.x, G.y[r], G.pts, 1, 1, false, G.cy);
        if (R.mirror) curve(c, G.x, G.y[r], G.pts, 1, 1, true, G.cy);
        c.lineWidth = R.core * (0.55 + 1.1 * Math.min(1, G.amp[r])) * (small ? 0.6 : 1);
        // one shadow pass (the main ribbon); the others get their glow from the haze
        c.shadowColor = r === 0 ? (EC ? EC.waveShadow0 : PAL.waveShadow[0]) : "transparent";
        c.shadowBlur = r === 0 ? (7 + 12 * gk + 7 * over) * v.dpr * (small ? 0.5 : 1) : 0;
        c.globalAlpha = r === 0 ? 1 : 0.88;
        c.stroke();
      }
      c.globalAlpha = 1;
      c.shadowBlur = 0;
      c.shadowColor = "transparent";
    },
  };
  /** smooth polyline through the points (quadratic through the midpoints) */
  function curve(c, xs, ys, n, sx, sy, mirror, cy) {
    const Y = (i) => (mirror ? 2 * cy - ys[i] : ys[i]) * sy;
    c.moveTo(xs[0] * sx, Y(0));
    for (let i = 1; i < n - 1; i++) {
      const mx = ((xs[i] + xs[i + 1]) / 2) * sx, my = (Y(i) + Y(i + 1)) / 2;
      c.quadraticCurveTo(xs[i] * sx, Y(i), mx, my);
    }
    c.lineTo(xs[n - 1] * sx, Y(n - 1));
  }

  const IMPL = { bars: BARS, ring: RING, wave: WAVE };

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

  // ---- settings panel ------------------------------------------------------------
  const THUMBS = {
    bars:
      '<svg viewBox="0 0 56 32" aria-hidden="true"><g stroke="url(#nd-ap-grad)" stroke-width="2.2" stroke-linecap="round">' +
      [4, 9, 14, 19, 24, 28, 32, 37, 42, 47, 52].map((x, i) => {
        const hh = [2, 4, 6, 9, 12, 14, 12, 9, 6, 4, 2][i];
        return '<line x1="' + x + '" y1="' + (16 - hh) + '" x2="' + x + '" y2="' + (16 + hh) + '"/>';
      }).join("") + "</g></svg>",
    ring:
      '<svg viewBox="0 0 56 32" aria-hidden="true"><g stroke="url(#nd-ap-grad)" stroke-width="1.8" stroke-linecap="round">' +
      Array.from({ length: 20 }, (_, k) => {
        const a = (k / 20) * TAU - Math.PI / 2, l = 3 + 4 * Math.abs(Math.cos(a));
        const x1 = 28 + Math.cos(a) * 9, y1 = 16 + Math.sin(a) * 9, x2 = 28 + Math.cos(a) * (9 + l), y2 = 16 + Math.sin(a) * (9 + l);
        return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
      }).join("") + '</g><circle cx="28" cy="16" r="6.5" fill="url(#nd-ap-grad)" opacity=".85"/></svg>',
    wave:
      '<svg viewBox="0 0 56 32" aria-hidden="true" fill="none" stroke-linecap="round">' +
      '<path d="M2 16 C 10 4, 18 4, 24 16 S 38 28, 44 16 S 52 8, 54 16" stroke="url(#nd-ap-grad)" stroke-width="2.4"/>' +
      '<path d="M2 16 C 10 28, 18 28, 24 16 S 38 4, 44 16 S 52 24, 54 16" style="stroke:var(--nda-text)" stroke-opacity=".55" stroke-width="1.4"/>' +
      '<path d="M2 16 C 12 10, 20 22, 30 15 S 46 12, 54 16" style="stroke:var(--nda-a1)" stroke-opacity=".7" stroke-width="1.2"/></svg>',
  };

  const ICON_PALETTE =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8 1.25C4.27 1.25 1.25 4.03 1.25 7.6c0 3.63 3.06 7.15 6.53 7.15 1.07 0 1.72-.66 1.72-1.52 0-.42-.16-.75-.39-1.04-.2-.26-.33-.5-.33-.82 0-.6.5-1.04 1.12-1.04h1.55c2.03 0 3.3-1.4 3.3-3.33 0-3.14-2.98-5.75-6.75-5.75ZM4.6 8.6a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Zm1.75-3.15a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Zm3.4 0a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Zm1.9 2.9a1.05 1.05 0 1 0 0-2.1 1.05 1.05 0 0 0 0 2.1Z"/></svg>';
  const ICON_IMAGE =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 2.25h10c.97 0 1.75.78 1.75 1.75v8c0 .97-.78 1.75-1.75 1.75H3c-.97 0-1.75-.78-1.75-1.75V4c0-.97.78-1.75 1.75-1.75Zm0 1.5a.25.25 0 0 0-.25.25v6.44l2.72-2.72a.75.75 0 0 1 1.06 0l1.72 1.72 2.97-3.47a.75.75 0 0 1 1.14 0l.89 1.04V4a.25.25 0 0 0-.25-.25H3Zm2.6 3.1a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z"/></svg>';
  const ICON_SPARK =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7.1 1.6a.5.5 0 0 1 .94 0l.9 2.5a2.5 2.5 0 0 0 1.5 1.5l2.5.9a.5.5 0 0 1 0 .94l-2.5.9a2.5 2.5 0 0 0-1.5 1.5l-.9 2.5a.5.5 0 0 1-.94 0l-.9-2.5a2.5 2.5 0 0 0-1.5-1.5l-2.5-.9a.5.5 0 0 1 0-.94l2.5-.9a2.5 2.5 0 0 0 1.5-1.5l.9-2.5Zm5.6 8.7a.35.35 0 0 1 .66 0l.35 1a1 1 0 0 0 .6.6l1 .35a.35.35 0 0 1 0 .66l-1 .35a1 1 0 0 0-.6.6l-.35 1a.35.35 0 0 1-.66 0l-.35-1a1 1 0 0 0-.6-.6l-1-.35a.35.35 0 0 1 0-.66l1-.35a1 1 0 0 0 .6-.6l.35-1Z"/></svg>';
  const ICON_SWAP =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M11.47 1.97a.75.75 0 0 1 1.06 0l2.5 2.5a.75.75 0 0 1 0 1.06l-2.5 2.5a.75.75 0 1 1-1.06-1.06l1.22-1.22H2.75a.75.75 0 0 1 0-1.5h9.94l-1.22-1.22a.75.75 0 0 1 0-1.06Zm-6.94 6a.75.75 0 0 1 0 1.06L3.31 10.25h9.94a.75.75 0 0 1 0 1.5H3.31l1.22 1.22a.75.75 0 1 1-1.06 1.06l-2.5-2.5a.75.75 0 0 1 0-1.06l2.5-2.5a.75.75 0 0 1 1.06 0Z"/></svg>';
  const ICON_PLUS =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 2.25a.75.75 0 0 1 .75.75v4.25H13a.75.75 0 0 1 0 1.5H8.75V13a.75.75 0 0 1-1.5 0V8.75H3a.75.75 0 0 1 0-1.5h4.25V3A.75.75 0 0 1 8 2.25Z"/></svg>';
  const ICON_DISC =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8 1.25a6.75 6.75 0 1 1 0 13.5 6.75 6.75 0 0 1 0-13.5Zm0 4.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Zm0 1.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/></svg>';
  const ICON_CHECK =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.53 4.22a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 0 1 1.06-1.06l2.97 2.97 5.97-5.97a.75.75 0 0 1 1.06 0Z"/></svg>';
  const ICON_PENCIL =
    '<svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M11.6 1.9a1.75 1.75 0 0 1 2.47 0l.03.03a1.75 1.75 0 0 1 0 2.47L6.2 12.3a2 2 0 0 1-.9.52l-2.84.77a.5.5 0 0 1-.61-.61l.77-2.84a2 2 0 0 1 .52-.9L11.6 1.9Z"/></svg>';
  const TABS = [
    { id: "amb", icon: ICON_EQ },          // "Ambiente"
    { id: "colors", icon: ICON_PALETTE },  // "Cores"
    { id: "wall", icon: ICON_IMAGE },      // "Wallpaper"
  ].map((x) => named("tab.", x));
  const TAB_IDS = TABS.map((x) => x.id);
  const WALL_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";
  /** text for innerHTML (the dictionaries hold plain text) */
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const tx = (key, p) => esc(tr(key, p));

  function panelHtml() {
    const range = (ref, label) =>
      '<input type="range" class="nd-ap__slider" min="0" max="' + INT_MAX + '" step="5" data-ref="' + ref + '" aria-label="' + label + '">';
    const cards = STYLES.map((s) =>
      '<div class="nd-ap__card" data-style="' + s.id + '">' +
        '<label class="nd-ap__pick"><input type="radio" class="nd-ap__radio" name="nd-ap-style" value="' + s.id + '">' +
        '<span class="nd-ap__thumb">' + THUMBS[s.id] + '<span class="nd-ap__active" aria-hidden="true">' + tx("style.active") + '</span></span><span class="nd-ap__name">' + esc(s.name) + '</span></label>' +
      "</div>").join("");
    // the selected style's own settings, in a box hanging from its card
    const srow = (ref, name, min, max, step, lo, hi) =>
      '<div class="nd-ap__srow"><span class="nd-ap__rlabel" id="nd-ap-l-' + ref + '">' + name + "</span>" +
        '<input type="range" class="nd-ap__slider" min="' + min + '" max="' + max + '" step="' + step + '" data-ref="' + ref + '" aria-labelledby="nd-ap-l-' + ref + '">' +
        '<output class="nd-ap__val" data-ref="' + ref + 'v"></output>' +
        (lo ? '<span class="nd-ap__ends" aria-hidden="true"><span>' + lo + "</span><span>" + hi + "</span></span>" : "") + "</div>";
    const styleBox =
      '<div class="nd-ap__stylebox" data-ref="styleBox" role="group" aria-labelledby="nd-ap-sb-name">' +
        '<div class="nd-ap__sbhead"><span class="nd-ap__sbname" id="nd-ap-sb-name" data-ref="sbName"></span>' +
          '<span class="nd-ap__sbright"><span class="nd-ap__sbtag">' + tx("sb.tag") + '</span>' +
          '<button type="button" class="nd-ap__sbreset" data-ref="sbReset">' + tx("btn.resetShort") + '</button></span></div>' +
        srow("sInt", tx("ctl.intensity"), 0, INT_MAX, 5, "", "") +
        srow("sReach", tx("ctl.reach"), REACH_MIN, REACH_MAX, 5, tx("ctl.reach.lo"), tx("ctl.reach.hi")) +
        srow("sFall", tx("ctl.fall"), 0, FALL_STEPS.length - 1, 1, tx("ctl.fall.lo"), tx("ctl.fall.hi")) +
        '<label class="nd-ap__srow nd-ap__srow--caps" data-ref="capsRow"><span class="nd-ap__rlabel" id="nd-ap-l-caps">' + tx("ctl.caps") + '</span>' +
          '<span class="nd-ap__capshint">' + tx("ctl.caps.hint") + '</span>' +
          '<input type="checkbox" role="switch" class="nd-ap__switch" data-ref="sCaps" aria-labelledby="nd-ap-l-caps"></label>' +
        '<span class="nd-ap__hint" data-ref="sbHint"></span>' +
        '<span class="nd-ap__sblegend" data-ref="sbLegend"></span>' +
      "</div>";
    // "Camadas por elemento": a toggle + the same 0-500 % slider per row ("Camadas" breathe with the music,
    // "Reações" happen now and then); the hints of the camadas follow the selected style (syncElBox)
    const elRow = (id, name) =>
      '<div class="nd-ap__elrow" data-el="' + id + '">' +
        '<label class="nd-ap__row nd-ap__elhead"><span class="nd-ap__rowtext"><span class="nd-ap__ellabel" id="nd-ap-el-' + id + '">' + name + "</span>" +
          '<span class="nd-ap__hint" data-ref="el-' + id + '-hint"></span></span>' +
          '<input type="checkbox" role="switch" class="nd-ap__switch nd-ap__switch--sm" data-ref="el-' + id + '-on" aria-labelledby="nd-ap-el-' + id + '"></label>' +
        '<div class="nd-ap__range nd-ap__range--row nd-ap__range--el"><span class="nd-ap__rlabel" aria-hidden="true">' + tx("ctl.intensity") + '</span>' +
          '<input type="range" class="nd-ap__slider" min="0" max="' + INT_MAX + '" step="5" data-ref="el-' + id + '-amt" aria-label="' + tx("aria.elIntensity", { name: tr("el." + id) }) + '">' +
          '<output class="nd-ap__val" data-ref="el-' + id + '-val"></output></div>' +
      "</div>";
    // the master row, the reduced-motion notice and the style legend stay in view; the six rows and the hue switch
    // sit behind a closed-by-default "Ajustar cada camada" (so "Ritmo do visual" / "Entrar após" stay above the sticky
    // footer). "Padrão" belongs to the whole box.
    const elBoxHtml =
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-el">' + tx("el.h") + '</h3>' +
      '<div class="nd-ap__fx nd-ap__elbox" data-ref="elBox" role="group" aria-labelledby="nd-ap-h-el">' +
        '<label class="nd-ap__row"><span class="nd-ap__rowtext"><span class="nd-ap__label" id="nd-ap-el-master">' + tx("el.master") + '</span>' +
          '<span class="nd-ap__hint">' + tx("el.master.hint") + '</span></span>' +
          '<input type="checkbox" role="switch" class="nd-ap__switch" data-ref="el-on" aria-labelledby="nd-ap-el-master"></label>' +
        '<span class="nd-ap__hint nd-ap__hint--warn" data-ref="el-rm" hidden>' + tx("el.rm", { os: osName() }) + '</span>' +
        '<div class="nd-ap__elbar"><button type="button" class="nd-ap__elmore" data-ref="elMore" aria-expanded="false" aria-controls="nd-ap-elbody">' +
          '<span data-ref="elMoreTxt">' + tx("el.more.open") + '</span><span class="nd-ap__elchev" aria-hidden="true"></span></button>' +
          '<button type="button" class="nd-ap__sbreset" data-ref="elReset">' + tx("btn.resetShort") + '</button></div>' +
        '<div class="nd-ap__elbody" id="nd-ap-elbody" data-ref="elBody" hidden>' +
          '<div class="nd-ap__elsub"><span class="nd-ap__elsubname">' + tx("el.sub.always") + '</span><span class="nd-ap__elsubtag">' + tx("el.sub.always.tag") + '</span></div>' +
          elRow("low", tx("el.low")) + elRow("voice", tx("el.voice")) + elRow("air", tx("el.air")) +
          '<div class="nd-ap__elsub"><span class="nd-ap__elsubname">' + tx("el.sub.sometimes") + '</span><span class="nd-ap__elsubtag">' + tx("el.sub.sometimes.tag") + '</span></div>' +
          elRow("entry", tx("el.entry")) + elRow("snare", tx("el.snare")) + elRow("mood", tx("el.mood")) +
          '<label class="nd-ap__row nd-ap__elhue" data-ref="elHueRow"><span class="nd-ap__rowtext"><span class="nd-ap__ellabel" id="nd-ap-el-hue">' + tx("el.hue") + '</span>' +
            '<span class="nd-ap__hint" data-ref="el-hue-hint"></span></span>' +
            '<input type="checkbox" role="switch" class="nd-ap__switch nd-ap__switch--sm" data-ref="el-hue" aria-labelledby="nd-ap-el-hue"></label>' +
        "</div>" +
      "</div></div>";
    const fx = (id, name, hint) =>
      '<div class="nd-ap__fx" data-fx="' + id + '">' +
        '<label class="nd-ap__row"><span class="nd-ap__rowtext"><span class="nd-ap__label">' + name + '</span><span class="nd-ap__hint" data-ref="' + id + '-hint">' + hint + '</span></span>' +
        '<input type="checkbox" role="switch" class="nd-ap__switch" data-ref="' + id + '-on"></label>' +
        '<div class="nd-ap__range nd-ap__range--row"><span class="nd-ap__rlabel">' + tx("ctl.intensity") + '</span>' + range(id + "-amt", tx("aria.fxIntensity", { name: tr("fx." + id) })) +
        '<output class="nd-ap__val" data-ref="' + id + '-val"></output></div>' +
      "</div>";
    const tabs =
      '<div class="nd-ap__tabs" role="tablist" aria-label="' + tx("aria.tabs") + '">' +
      TABS.map((x) =>
        '<button type="button" role="tab" class="nd-ap__tab" id="nd-ap-tab-' + x.id + '" data-tab="' + x.id + '" aria-controls="nd-ap-pane-' + x.id + '" aria-selected="false" tabindex="-1">' +
        x.icon + "<span>" + esc(x.name) + "</span></button>").join("") +
      "</div>";
    const pane = (id, html) =>
      '<div class="nd-ap__body" role="tabpanel" id="nd-ap-pane-' + id + '" aria-labelledby="nd-ap-tab-' + id + '" data-pane="' + id + '"' + (id === "amb" ? "" : " hidden") + ">" + html + "</div>";
    // the docked mini preview sits first in the pane (sticky, no height of its own); the preview gets the highlight
    // chip and the soft mode's note
    const amb =
      '<div class="nd-ap__dockwrap" data-ref="dockWrap"><div class="nd-ap__dock" data-ref="dock" aria-hidden="true" title="' + tx("dock.title") + '">' +
        '<canvas data-ref="dockCv" aria-hidden="true"></canvas><span class="nd-ap__chip nd-ap__chip--dock" data-ref="dockChip"></span></div></div>' +
      '<label class="nd-ap__row nd-ap__master"><span class="nd-ap__rowtext"><span class="nd-ap__label">' + tx("amb.master") + '</span>' +
      '<span class="nd-ap__hint" data-ref="masterHint"></span></span><input type="checkbox" role="switch" class="nd-ap__switch" data-ref="enabled"></label>' +
      '<div class="nd-ap__preview" data-ref="pvBox"><canvas data-ref="preview" aria-hidden="true"></canvas><span class="nd-ap__badge" data-ref="badge">' + tx("pv.badge.live") + '</span>' +
        '<span class="nd-ap__chip" data-ref="pvChip"></span><span class="nd-ap__pvnote" data-ref="pvNote">' + tx(SOFT_NOTE) + "</span></div>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-viz">' + tx("amb.h.viz") + '</h3>' +
      '<div class="nd-ap__styles" role="radiogroup" aria-labelledby="nd-ap-h-viz">' + cards + "</div>" + styleBox + "</div>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h">' + tx("fx.h") + '</h3>' +
      fx("zoom", tx("fx.zoom"), tx("fx.zoom.hint")) +
      fx("glow", tx("fx.glow"), tx("fx.glow.hint")) +
      fx("groove", tx("fx.groove"), tx("fx.groove.hint")) + "</div>" +
      elBoxHtml +
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-rhythm">' + tx("rhythm.h") + '</h3>' +
      '<div class="nd-ap__fx nd-ap__rhythm">' +
        '<div class="nd-ap__seg nd-ap__seg--wide" role="radiogroup" aria-labelledby="nd-ap-h-rhythm">' +
        RHYTHM_OPTS.map((o) => '<label class="nd-ap__segopt"><input type="radio" name="nd-ap-rhythm" value="' + o.id + '"><span>' + esc(o.name) + "</span></label>").join("") +
        "</div>" +
        '<span class="nd-ap__hint" data-ref="rhythmHint"></span>' +
      "</div></div>" +
      '<div class="nd-ap__section nd-ap__section--inline"><h3 class="nd-ap__h" id="nd-ap-h-idle">' + tx("idle.h") + '</h3>' +
      '<div class="nd-ap__seg" role="radiogroup" aria-labelledby="nd-ap-h-idle">' +
      IDLE_CHOICES.map((s) => '<label class="nd-ap__segopt"><input type="radio" name="nd-ap-idle" value="' + s + '"><span>' + tx("idle.opt", { n: s }) + "</span></label>").join("") +
      "</div></div>" +
      '<div class="nd-ap__sticky"><div class="nd-ap__actions"><button type="button" class="nd-ap__btn nd-ap__btn--primary" data-ref="test">' + tx("amb.test") + '</button>' +
      '<button type="button" class="nd-ap__btn" data-ref="reset" title="' + tx("amb.reset.title") + '">' + tx("amb.reset") + '</button></div>' +
      '<p class="nd-ap__foot">' + tx("amb.foot") + '</p></div>';
    return (
      '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><linearGradient id="nd-ap-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="56" y2="32">' +
      '<stop offset="0" style="stop-color:var(--nda-a1)"/><stop offset="1" style="stop-color:var(--nda-a2)"/></linearGradient></defs></svg>' +
      '<div class="nd-ap__head"><span class="nd-ap__logo">' + ICON_SPARK + '</span><h2 class="nd-ap__title" id="nd-ap-title">' + tx(PANEL_LABEL) + "</h2>" +
      '<button type="button" class="nd-ap__close" data-ref="close" aria-label="' + tx("aria.close") + '">' + ICON_X + "</button></div>" +
      tabs +
      '<div class="nd-ap__compat" data-ref="compatBox" hidden><span class="nd-ap__hint" data-ref="compatTxt"></span>' +
        '<button type="button" class="nd-ap__btn nd-ap__btn--small" data-ref="compatOk">' + tx("compat.ok") + "</button></div>" +
      pane("amb", amb) + pane("colors", colorsHtml()) + pane("wall", wallHtml())
    );
  }

  /** "Cores": presets, "Personalizado" (two colours, HSV + hex), "Combinar com o wallpaper" */
  function colorsHtml() {
    const pal = (id, name, a1, a2, extra) =>
      '<label class="nd-ap__opt nd-ap__pal" data-pal="' + id + '"' + (a1 ? ' style="--c1:' + a1 + ";--c2:" + a2 + '"' : "") + ">" +
        '<input type="radio" class="nd-ap__radio" name="nd-ap-pal" value="' + id + '">' +
        '<span class="nd-ap__sw" aria-hidden="true">' + (extra || "") + '<span class="nd-ap__check">' + ICON_CHECK + "</span></span>" +
        '<span class="nd-ap__pname">' + name + "</span></label>";
    const chip = (i) =>
      '<button type="button" class="nd-ap__cchip" data-ref="c' + i + '" aria-pressed="' + (i === 0) + '">' +
        '<span class="nd-ap__cdot" data-ref="c' + i + 'dot" aria-hidden="true"></span>' +
        '<span class="nd-ap__ctext"><span class="nd-ap__clabel">' + tx("col.chip", { n: i + 1 }) + '</span><span class="nd-ap__chex" data-ref="c' + i + 'hex"></span></span></button>';
    const hsv = (k, name, max, unit) =>
      '<div class="nd-ap__range nd-ap__range--row nd-ap__hsv"><span class="nd-ap__rlabel">' + name + "</span>" +
        '<input type="range" class="nd-ap__slider nd-ap__slider--paint" min="0" max="' + max + '" step="1" data-ref="hsv-' + k + '" aria-label="' + name + '">' +
        '<output class="nd-ap__val" data-ref="hsv-' + k + 'v"></output></div>';
    return (
      '<p class="nd-ap__hint nd-ap__hint--warn nd-ap__notheme" data-ref="colorsNoTheme" hidden>' + tx("colors.note.noTheme") + "</p>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-pal">' + tx("col.h") + '</h3>' +
      '<div class="nd-ap__pals" role="radiogroup" aria-labelledby="nd-ap-h-pal">' +
        PRESETS.map((p) => pal(p.id, esc(p.name), p.a1, p.a2, p.id === "neon" ? '<span class="nd-ap__swtag">' + tx("col.original") + '</span>' : "")).join("") +
        pal("custom", tx("col.custom"), "", "", '<span class="nd-ap__pen">' + ICON_PENCIL + "</span>") +
      "</div></div>" +
      '<div class="nd-ap__fx nd-ap__custom" data-ref="customBox" hidden>' +
        '<div class="nd-ap__cpair">' + chip(0) +
          '<button type="button" class="nd-ap__iconbtn" data-ref="swap" aria-label="' + tx("col.swap.aria") + '" title="' + tx("col.swap.title") + '">' + ICON_SWAP + "</button>" +
          chip(1) + "</div>" +
        '<div class="nd-ap__gradbar" data-ref="gradBar" aria-hidden="true"></div>' +
        hsv("h", tx("col.hue"), 360, "°") + hsv("s", tx("col.sat"), 100, "%") + hsv("v", tx("col.val"), 100, "%") +
        '<div class="nd-ap__hexrow"><span class="nd-ap__rlabel">' + tx("col.code") + '</span>' +
          '<input type="text" class="nd-ap__hexin" data-ref="hex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="' + tx("col.code.aria") + '">' +
          '<span class="nd-ap__hint" data-ref="cWarn"></span></div>' +
      "</div>" +
      '<button type="button" class="nd-ap__opt nd-ap__match" data-ref="match" aria-pressed="false">' +
        '<span class="nd-ap__matchicon" aria-hidden="true">' + ICON_SPARK + "</span>" +
        '<span class="nd-ap__rowtext"><span class="nd-ap__label">' + tx("col.match") + '</span><span class="nd-ap__hint" data-ref="matchHint"></span></span>' +
        '<span class="nd-ap__sw nd-ap__sw--sm" data-ref="matchSw" aria-hidden="true"></span></button>' +
      '<p class="nd-ap__foot" data-ref="colorsFoot">' + tx("col.foot") + '</p>' +
      '<div class="nd-ap__actions"><button type="button" class="nd-ap__btn" data-ref="resetColors">' + tx("amb.reset") + '</button></div>'
    );
  }

  /** "Wallpaper": the three sources with thumbnails, the file box, "Escurecer" / "Desfoque" */
  function wallHtml() {
    const opt = (id, name, ph) =>
      '<label class="nd-ap__opt nd-ap__wopt" data-wall="' + id + '"><input type="radio" class="nd-ap__radio" name="nd-ap-wall" value="' + id + '">' +
        '<span class="nd-ap__wthumb" data-ref="wthumb-' + id + '" aria-hidden="true">' + (ph ? '<span class="nd-ap__wph">' + ph + "</span>" : "") +
        '<span class="nd-ap__check">' + ICON_CHECK + "</span></span>" +
        '<span class="nd-ap__pname">' + name + "</span></label>";
    const slider = (ref, name, max, step) =>
      '<div class="nd-ap__range nd-ap__range--row nd-ap__range--wall" data-ref="' + ref + 'Row"><span class="nd-ap__rlabel">' + name + "</span>" +
        '<input type="range" class="nd-ap__slider" min="0" max="' + max + '" step="' + step + '" data-ref="' + ref + '" aria-label="' + name + '">' +
        '<output class="nd-ap__val" data-ref="' + ref + 'v"></output></div>';
    return (
      '<p class="nd-ap__hint nd-ap__hint--warn nd-ap__notheme" data-ref="wallNoTheme" hidden>' + tx("wall.note.noTheme") + "</p>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h" id="nd-ap-h-wall">' + tx("wall.h") + '</h3>' +
      '<div class="nd-ap__walls" role="radiogroup" aria-labelledby="nd-ap-h-wall">' +
        opt("default", tx("wall.opt.default")) + opt("file", tx("wall.opt.file"), ICON_PLUS) + opt("cover", tx("wall.opt.cover"), ICON_DISC) +
      "</div>" +
      '<p class="nd-ap__whint" data-ref="wallHint"></p></div>' +
      '<div class="nd-ap__fx nd-ap__filebox">' +
        '<div class="nd-ap__rowtext"><span class="nd-ap__label">' + tx("wall.opt.file") + '</span><span class="nd-ap__hint" data-ref="fileInfo"></span></div>' +
        '<div class="nd-ap__btnrow"><button type="button" class="nd-ap__btn nd-ap__btn--small" data-ref="pick">' + tx("wall.pick") + '</button>' +
        '<button type="button" class="nd-ap__btn nd-ap__btn--small" data-ref="removeFile">' + tx("wall.remove") + '</button></div>' +
        '<input type="file" class="nd-ap__file" data-ref="file" accept="' + WALL_ACCEPT + '" tabindex="-1" aria-hidden="true" hidden>' +
        '<p class="nd-ap__note" data-ref="wallNote" hidden></p>' +
      "</div>" +
      '<div class="nd-ap__section"><h3 class="nd-ap__h">' + tx("wall.adj.h") + '</h3><div class="nd-ap__fx">' +
        slider("dim", tx("wall.dim"), 80, 5) + slider("layoutBlur", tx("wall.layoutBlur"), BLUR_MAX, 1) + slider("ambBlur", tx("wall.ambBlur"), BLUR_MAX, 1) +
        // what "Desfoque no modo ambiente" does, at its real size (the overlay is hidden while the panel is open)
        '<div class="nd-ap__ambpv"><canvas data-ref="ambPv" aria-hidden="true"></canvas><span class="nd-ap__badge">' + tx("wall.ambPv.badge") + '</span>' +
          '<button type="button" class="nd-ap__btn nd-ap__btn--small nd-ap__ambtest" data-ref="ambTest">' + tx("wall.ambTest") + '</button></div>' +
        '<span class="nd-ap__hint" data-ref="blurHint"></span>' +
      "</div></div>" +
      '<div class="nd-ap__actions"><button type="button" class="nd-ap__btn" data-ref="resetWall" title="' + tx("wall.reset.title") + '">' + tx("amb.reset") + '</button></div>'
    );
  }

  function buildPanel() {
    if (el.panel) return;
    const p = document.createElement("div");
    p.id = "nd-amb-panel";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-modal", "false");
    p.setAttribute("aria-labelledby", "nd-ap-title");
    p.setAttribute("lang", LANG);
    p.setAttribute("dir", "ltr");          // only LTR languages ship; don't inherit Spotify's dir="rtl"
    p.tabIndex = -1;
    p.hidden = true;
    p.innerHTML = panelHtml();
    el.panel = p;
    el.pRef = {};
    for (const n of p.querySelectorAll("[data-ref]")) el.pRef[n.getAttribute("data-ref")] = n;
    el.pBadge = el.pRef.badge;
    V.preview = makeView(el.pRef.preview, "preview");
    // the docked mini preview: watch the pane's scroll; a click on the mini preview goes back up; a control that
    // takes the focus under it scrolls into view below it
    const pane = el.pRef.dockWrap.parentNode;
    el.pane = pane;
    el.dockCtx = el.pRef.dockCv.getContext("2d");
    pane.addEventListener("scroll", scheduleDock, { passive: true });
    pane.addEventListener("focusin", onPaneFocus);
    el.pRef.dock.addEventListener("click", (e) => {
      e.preventDefault();
      try { pane.scrollTo({ top: 0, behavior: S.reducedMotion ? "auto" : "smooth" }); } catch (err) { pane.scrollTop = 0; }
    });
    p.addEventListener("input", onPanelInput);
    p.addEventListener("change", onPanelChange);
    p.addEventListener("click", onPanelClick);
    el.pRef.file.addEventListener("cancel", () => { S.filePicking = false; syncLook(); });
    document.body.appendChild(p);
    setTab(S.tab || "amb", false);
    syncPanel();
  }

  /** the language changed after the panel was built (a late Spicetify.Locale): the same panel again, in the new
      language, on the same tab, open if it was open */
  function rebuildPanel() {
    if (!el.panel) return;
    const open = S.panelOpen, tab = S.tab;
    disarm();
    if (S.dockRaf) { cancelAnimationFrame(S.dockRaf); S.dockRaf = 0; }
    S.docked = false;
    WP.noteText = "";                             // a transient note, in the old language
    el.panel.remove();
    el.panel = null;
    el.pRef = null;
    el.pane = null;
    buildPanel();
    setTab(tab, false);
    if (open) {
      el.panel.hidden = false;
      el.panel.classList.add("nd-ap--open");
      positionPanel();
      syncLook();
    }
  }

  /** shows one tab (roving tabindex; the live preview only draws on "Ambiente") */
  function setTab(id, focus) {
    if (!el.panel || !TAB_IDS.includes(id)) return;
    if (S.tab !== id) disarm();
    S.tab = id;
    for (const b of el.panel.querySelectorAll(".nd-ap__tab")) {
      const on = b.dataset.tab === id;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    for (const pn of el.panel.querySelectorAll(".nd-ap__body")) pn.hidden = pn.dataset.pane !== id;
    if (id === "wall" && CFG.wallpaper.file && !WP.fileUrl) loadFileWall().then(syncLook, () => {});
    syncLook();
    if (S.panelOpen) positionPanel();
    if (id === "wall") requestAnimationFrame(paintAmbPreview);   // after the pane has its size
    scheduleDock();                               // the dock belongs to "Ambiente"
  }

  function syncPanel() {
    if (!el.panel) return;
    const R = el.pRef, p = el.panel;
    R.enabled.checked = CFG.enabled;
    R.masterHint.textContent = CFG.enabled ? tr("amb.masterHint.on", { n: CFG.idleSec }) : tr("amb.masterHint.off");
    STYLES.forEach((s, k) => {
      const card = p.querySelector('.nd-ap__card[data-style="' + s.id + '"]');
      const sel = CFG.style === s.id;
      card.classList.toggle("nd-ap__card--on", sel);
      card.querySelector(".nd-ap__radio").checked = sel;
      if (sel) R.styleBox.style.setProperty("--nda-sb-x", ((k * 2 + 1) / (STYLES.length * 2)) * 100 + "%");
    });
    syncStyleBox();
    for (const k of ["zoom", "glow", "groove"]) {
      R[k + "-on"].checked = CFG[k].on;
      setRange(R[k + "-amt"], R[k + "-val"], CFG[k].amount);
      R[k + "-amt"].disabled = !CFG[k].on;
      p.querySelector('.nd-ap__fx[data-fx="' + k + '"]').classList.toggle("nd-ap__fx--off", !CFG[k].on);
    }
    // the zoom and the groove are motion: paused while Windows asks for less animation
    const RM_HINT = tr("rm.hint", { os: osName() });
    for (const [k, hint] of [["zoom", tr("fx.zoom.hint")], ["groove", tr("fx.groove.hint")]]) {
      const rm = S.reducedMotion && CFG[k].on;
      R[k + "-hint"].textContent = rm ? RM_HINT : hint;
      R[k + "-hint"].classList.toggle("nd-ap__hint--warn", rm);
    }
    for (const r of p.querySelectorAll('input[name="nd-ap-idle"]')) r.checked = Number(r.value) === CFG.idleSec;
    for (const r of p.querySelectorAll('input[name="nd-ap-rhythm"]')) r.checked = r.value === CFG.rhythm;
    syncElBox();
    syncRhythm();
    syncLook();
    syncCompat();
  }
  /** the one-time note on an untested Spotify version / a missing API (dismissed per Spotify version) */
  function syncCompat() {
    const R = el.pRef;
    if (!R || !R.compatBox) return;
    const n = S.compatNote === undefined ? (S.compatNote = compatNoteWanted()) : S.compatNote;
    R.compatBox.hidden = !n;
    if (n) R.compatTxt.textContent = n.why === "api" ? tr("compat.note.api") : tr("compat.note", { v: n.v });
  }
  /** "Camadas por elemento": what each camada lights up in the selected style (i18n keys); the reações are the same in all */
  const EL_HINTS = {
    low: { ring: "el.hint.low.ring", bars: "el.hint.low.bars", wave: "el.hint.low.wave" },
    voice: { ring: "el.hint.voice.ring", bars: "el.hint.voice.bars", wave: "el.hint.voice.wave" },
    air: { ring: "el.hint.air.ring", bars: "el.hint.air.bars", wave: "el.hint.air.wave" },
    entry: "el.hint.entry",
    snare: "el.hint.snare",
    mood: "el.hint.mood",
    hue: { ring: "el.hint.hue.ring", bars: "el.hint.hue.bars", wave: "el.hint.hue.wave" },
  };
  /** what the reações do while the system asks for less motion (nothing travels, contracts or orbits) */
  const EL_HINTS_RM = {
    entry: "el.hintRM.entry",
    mood: "el.hintRM.mood",
  };
  function syncElBox() {
    const R = el.pRef, box = R && R.elBox, Lc = CFG.layers;
    if (!box || !Lc) return;
    R["el-on"].checked = Lc.on;
    box.classList.toggle("nd-ap__elbox--off", !Lc.on);
    // the rows sit behind "Ajustar cada camada" (closed by default; stays open for this session once opened)
    const open = !!S.elOpen;
    R.elBody.hidden = !open;
    R.elMore.setAttribute("aria-expanded", String(open));
    R.elMore.classList.toggle("nd-ap__elmore--open", open);
    R.elMoreTxt.textContent = tr(open ? "el.more.close" : "el.more.open");
    for (const id of EL_IDS) {
      const o = Lc[id], row = box.querySelector('.nd-ap__elrow[data-el="' + id + '"]'), h = (S.reducedMotion && EL_HINTS_RM[id]) || EL_HINTS[id];
      R["el-" + id + "-on"].checked = o.on;
      setRange(R["el-" + id + "-amt"], R["el-" + id + "-val"], o.amount);
      // with the master off nothing in the rows can be changed (like an effect that is off in "Efeitos")
      R["el-" + id + "-on"].disabled = !Lc.on;
      R["el-" + id + "-amt"].disabled = !o.on || !Lc.on;
      row.classList.toggle("nd-ap__elrow--off", !o.on);
      const txt = tr(typeof h === "string" ? h : h[CFG.style] || h.ring);
      if (R["el-" + id + "-hint"].textContent !== txt) R["el-" + id + "-hint"].textContent = txt;
    }
    R["el-hue"].checked = Lc.hue;
    R["el-hue"].disabled = !Lc.on;
    // the hint names the style's own voice element; in "Anel neon" / "Barras" the hue needs "Voz e melodia"
    const noVoice = CFG.style !== "wave" && !Lc.voice.on, hueTxt = tr(EL_HINTS.hue[CFG.style] || EL_HINTS.hue.ring) + (noVoice ? tr("el.hint.hue.needsVoice") : "");
    if (R["el-hue-hint"].textContent !== hueTxt) R["el-hue-hint"].textContent = hueTxt;
    R.elHueRow.classList.toggle("nd-ap__elrow--off", noVoice);
    R["el-rm"].hidden = !(S.reducedMotion && Lc.on);     // the system asks for less motion: no orbit / creep / travel
    const d = JSON.stringify(Lc) === JSON.stringify(DEFAULTS.layers);
    R.elReset.disabled = d;
    R.elReset.title = tr(d ? "el.reset.isDefault" : "el.reset.title");
  }
  /** "Ritmo do visual": what "Automático" picked for the song that is playing */
  function syncRhythm() {
    if (!el.pRef || !el.pRef.rhythmHint) return;
    const item = currentItem(), A = analysisFor(item && item.uri);
    const four = A ? A.four : null, mode = CFG.rhythm;
    let txt;
    if (mode === "beat") txt = tr("rhythm.hint.beat");
    else if (mode === "bass") txt = tr("rhythm.hint.bass");
    else txt = tr(four == null ? "rhythm.hint.auto" : four >= 0.5 ? "rhythm.hint.autoFour" : "rhythm.hint.autoBass");
    if (el.pRef.rhythmHint.textContent !== txt) el.pRef.rhythmHint.textContent = txt;
    el.pRef.rhythmHint.dataset.four = four == null ? "" : String(four);
  }
  function setRange(input, out, v) {
    if (Number(input.value) !== v) input.value = String(v);
    input.style.setProperty("--nda-fill", (v / INT_MAX) * 100 + "%");
    input.setAttribute("aria-valuetext", v + "%");
    out.textContent = v + PCT;
  }
  /** "0,7 s" (pt-BR decimal comma) / "0.7 s" */
  const fmtSec = (ms) => dec(+(ms / 1000).toFixed(2)) + " s";
  const fallWord = (ms) => tr(ms <= 150 ? "fallWord.fast" : ms <= 450 ? "fallWord.medium" : ms <= 1100 ? "fallWord.slow" : "fallWord.vslow");
  /** past 200 % "Intensidade" mostly grows the beat (the in-between keeps its 200 % level), so the hint says so,
      and what to do about it depends on where "Alcance" already is */
  function sbHintOf(id) {
    const base = STYLE_IDS.includes(id) ? tr("sb.hint." + id) : "", it = num(CFG.intensity && CFG.intensity[id], 130), rc = num(CFG.reach && CFG.reach[id], 60);
    if (it <= 200) return base;
    return base + tr("sb.hint.over200") + tr(rc >= REACH_MAX ? "sb.hint.over200.maxReach" : "sb.hint.over200.raiseReach");
  }
  /** the box under the cards: the selected style's Intensidade / Alcance / Volta */
  function syncStyleBox() {
    const R = el.pRef, id = CFG.style, st = STYLES.find((x) => x.id === id);
    R.sbName.textContent = st ? st.name : "";
    setRange(R.sInt, R.sIntv, CFG.intensity[id]);
    const rc = CFG.reach[id];
    if (Number(R.sReach.value) !== rc) R.sReach.value = String(rc);
    R.sReach.style.setProperty("--nda-fill", ((rc - REACH_MIN) / (REACH_MAX - REACH_MIN)) * 100 + "%");
    R.sReach.setAttribute("aria-valuetext", tr("aria.reach", { n: rc }));
    R.sReachv.textContent = rc + PCT;
    const fl = CFG.fall[id];
    if (fallFromPos(Number(R.sFall.value)) !== fl) R.sFall.value = String(fallToPos(fl));
    R.sFall.style.setProperty("--nda-fill", (Number(R.sFall.value) / (FALL_STEPS.length - 1)) * 100 + "%");
    R.sFall.setAttribute("aria-valuetext", tr("aria.fall", { n: fl / 1000, s: dec(+(fl / 1000).toFixed(2)), word: fallWord(fl) }));
    R.sFallv.textContent = fmtSec(fl);
    R.sFallv.title = tr("title.fall", { word: fallWord(fl) });
    R.sbHint.textContent = sbHintOf(id);
    // which part shows which element (only with "Camadas por elemento" on)
    R.sbLegend.textContent = CFG.layers && CFG.layers.on && STYLE_IDS.includes(id) ? tr("sb.legend." + id) : "";
    R.sbLegend.hidden = !(CFG.layers && CFG.layers.on);
    const hasCaps = id in DEFAULTS.caps;                 // "Onda" has no peak caps
    R.capsRow.hidden = !hasCaps;
    R.sCaps.checked = hasCaps && CFG.caps[id] !== false;
    const d = CFG.intensity[id] === DEFAULTS.intensity[id] && CFG.reach[id] === DEFAULTS.reach[id] && CFG.fall[id] === DEFAULTS.fall[id] && (!hasCaps || CFG.caps[id] === DEFAULTS.caps[id]);
    R.sbReset.disabled = d;
    R.sbReset.title = tr(d ? "sb.reset.isDefault" : "sb.reset.title");
  }
  function setRangeU(input, out, v, max, unit) {
    if (Number(input.value) !== v) input.value = String(v);
    input.style.setProperty("--nda-fill", (v / max) * 100 + "%");
    const sharp = unit === "px" && v === 0;            // "Desfoque" 0: really sharp
    input.setAttribute("aria-valuetext", sharp ? tr("aria.sharp") : v + " " + unit);
    out.textContent = sharp ? tr("val.sharp") : v + (unit === "px" ? " px" : unit === "%" ? PCT : unit);
  }

  /** "Cores" + "Wallpaper" tabs from CFG / WP */
  function syncLook() {
    if (!el.panel) return;
    const R = el.pRef, p = el.panel, C = CFG.colors, Wl = CFG.wallpaper, pair = lookPair();
    for (const n of p.querySelectorAll(".nd-ap__pal")) {
      const on = n.dataset.pal === C.preset;
      n.classList.toggle("nd-ap__opt--on", on);
      n.querySelector("input").checked = on;
    }
    const cc = p.querySelector('.nd-ap__pal[data-pal="custom"]');
    cc.style.setProperty("--c1", C.custom[0]);
    cc.style.setProperty("--c2", C.custom[1]);
    R.customBox.hidden = C.preset !== "custom";
    if (C.preset === "custom") syncCustom();
    const wall = C.preset === "wall";
    R.match.setAttribute("aria-pressed", String(wall));
    R.match.classList.toggle("nd-ap__opt--on", wall);
    const mp = C.auto || pair;
    R.matchSw.style.setProperty("--c1", mp[0]);
    R.matchSw.style.setProperty("--c2", mp[1]);
    R.matchSw.hidden = !C.auto && !wall;
    R.matchHint.textContent = tr(!wall ? "col.match.hint.off"
      : Wl.mode === "cover" && WP.kind === "cover" ? "col.match.hint.cover"
      : "col.match.hint.on");
    // without the NeonDrift theme the colours / the wallpaper only change the ambient mode, the panel and the button:
    // a note at the top of both tabs (the footer's text is about the theme, so it goes)
    R.colorsFoot.textContent = THEME.on ? tr("col.foot") : "";
    R.colorsNoTheme.hidden = THEME.on;
    R.wallNoTheme.hidden = THEME.on;
    R.layoutBlurRow.hidden = !THEME.on;
    // wallpaper
    for (const n of p.querySelectorAll(".nd-ap__wopt")) {
      const on = n.dataset.wall === Wl.mode;
      n.classList.toggle("nd-ap__opt--on", on);
      n.querySelector("input").checked = on;
    }
    const thumb = (n, url) => {
      const v = url ? 'url("' + String(url).replace(/["\\\n\r]/g, "") + '")' : "";
      if (n.style.backgroundImage !== v) n.style.backgroundImage = v;
      n.classList.toggle("nd-ap__wthumb--img", !!url);
    };
    thumb(R["wthumb-default"], builtinWall());
    thumb(R["wthumb-file"], Wl.file && WP.fileUrl ? WP.fileUrl : "");
    const item = currentItem();
    thumb(R["wthumb-cover"], (item && thumbOf(item)) || "");
    const f = Wl.file;
    R.fileInfo.textContent = f
      ? f.name + " · " + (f.w && f.h ? f.w + "×" + f.h + " · " : "") + fmtBytes(f.size)
      : tr("wall.fileInfo.empty");
    R.fileInfo.title = R.fileInfo.textContent;
    R.pick.textContent = tr(f ? "wall.change" : "wall.pick");
    R.removeFile.disabled = !f;
    R.wallHint.textContent = tr(
      Wl.mode === "cover" ? (WP.note !== "nocover" ? "wall.hint.cover"
        : WP.kind === "file" || (WP.kind !== "default" && Wl.file) ? "wall.hint.noCover.file" : "wall.hint.noCover.default")
      : Wl.mode === "file" ? (WP.note === "nofile" ? "wall.hint.noFile" : "wall.hint.file")
      : "wall.hint.default");
    setRangeU(R.dim, R.dimv, Wl.dim, 80, "%");
    const B = wallBlur();                                // "Capa do álbum" has its own pair
    setRangeU(R.layoutBlur, R.layoutBlurv, B.layout, BLUR_MAX, "px");
    setRangeU(R.ambBlur, R.ambBlurv, B.amb, BLUR_MAX, "px");
    // which part of the screen each "Desfoque" changes, in plain words (without the theme: only the ambient one)
    R.blurHint.textContent = (B.cover ? tr("wall.blurHint.cover") : "") + (THEME.on ? tr("wall.blurHint.layout") : "") +
      tr("wall.blurHint.amb") + tr("wall.blurHint.zero");
    wallNote(WP.noteText, WP.noteWarn);
    if (S.wall === "css") paintAmbPreview();             // a GIF: the preview draws the picture itself
  }
  /** "Personalizado": the chips, gradient bar, HSV sliders (painted tracks) and hex field */
  function syncCustom() {
    const R = el.pRef, C = CFG.colors, i = S.cEdit || 0, hex = C.custom[i];
    if (S.hsvHex !== hex || !S.hsv) { S.hsv = rgbHsv(hexRgb(hex)); S.hsvHex = hex; }
    const [h, s, v] = S.hsv;
    for (let k = 0; k < 2; k++) {
      R["c" + k].setAttribute("aria-pressed", String(k === i));
      R["c" + k + "dot"].style.background = C.custom[k];
      R["c" + k + "hex"].textContent = C.custom[k].toUpperCase();
    }
    R.gradBar.style.background = "linear-gradient(90deg, " + C.custom[0] + ", " + C.custom[1] + ")";
    const paint = (input, out, val, unit, track) => {
      const vv = Math.round(val);
      if (Number(input.value) !== vv) input.value = String(vv);
      input.style.setProperty("--nda-track", track);
      input.style.setProperty("--nda-thumb", hex);
      input.setAttribute("aria-valuetext", unit === "°" ? tr("aria.degrees", { n: vv }) : vv + " %");
      out.textContent = vv + (unit === "%" ? PCT : unit);
    };
    paint(R["hsv-h"], R["hsv-hv"], h, "°", "linear-gradient(90deg, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)");
    paint(R["hsv-s"], R["hsv-sv"], s * 100, "%", "linear-gradient(90deg, " + rgbHex(hsvRgb(h, 0, v)) + ", " + rgbHex(hsvRgb(h, 1, v)) + ")");
    paint(R["hsv-v"], R["hsv-vv"], v * 100, "%", "linear-gradient(90deg, #000, " + rgbHex(hsvRgb(h, s, 1)) + ")");
    if (document.activeElement !== R.hex) R.hex.value = hex.toUpperCase();
    const dark = C.custom.some((x) => contrast(hexRgb(x), [11, 26, 54]) < 2.6);
    R.cWarn.textContent = dark ? tr("col.darkWarn") : "";
  }
  const parseHex = (v) => {
    let t = String(v || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(t)) t = t.split("").map((ch) => ch + ch).join("");
    return /^[0-9a-f]{6}$/i.test(t) ? "#" + t.toLowerCase() : null;
  };
  function setCustom(i, hex, keepHsv) {
    const next = clone(CFG);
    next.colors.custom[i] = hex;
    next.colors.preset = "custom";
    if (keepHsv) S.hsvHex = hex;           // the sliders keep their own (unrounded) HSV
    applySettings(next, false);
  }

  function onPanelInput(e) {
    const t = e.target, ref = t.getAttribute("data-ref") || "";
    const next = clone(CFG);
    if (ref === "enabled") { setEnabled(t.checked, false); return; }
    if (t.name === "nd-ap-pal") { setPreset(t.value); return; }
    if (t.name === "nd-ap-wall") { setWallMode(t.value); return; }
    if (ref.startsWith("hsv-")) {
      S.lookDrag = true;
      const k = "hsv".indexOf(ref.slice(4)), val = Number(t.value);
      if (!S.hsv || S.hsvHex !== CFG.colors.custom[S.cEdit || 0]) S.hsv = rgbHsv(hexRgb(CFG.colors.custom[S.cEdit || 0]));
      S.hsv[k] = k === 0 ? val % 360 : val / 100;
      setCustom(S.cEdit || 0, rgbHex(hsvRgb(S.hsv[0], S.hsv[1], S.hsv[2])), true);
      return;
    }
    if (ref === "hex") { const h = parseHex(t.value); if (h && h !== CFG.colors.custom[S.cEdit || 0]) setCustom(S.cEdit || 0, h, false); return; }
    if (t.name === "nd-ap-rhythm") next.rhythm = t.value;
    else if (t.name === "nd-ap-style") next.style = t.value;
    else if (t.name === "nd-ap-idle") next.idleSec = Number(t.value);
    else if (ref === "sInt") next.intensity[CFG.style] = Number(t.value);       // the box always edits the selected style
    else if (ref === "sReach") next.reach[CFG.style] = Number(t.value);
    else if (ref === "sFall") next.fall[CFG.style] = fallFromPos(Number(t.value));
    else if (ref === "sCaps") next.caps[CFG.style] = t.checked;
    else if (/^(zoom|glow|groove)-on$/.test(ref)) next[ref.slice(0, -3)].on = t.checked;
    else if (/^(zoom|glow|groove)-amt$/.test(ref)) next[ref.slice(0, -4)].amount = Number(t.value);
    else if (ref === "el-on") next.layers.on = t.checked;                       // v5b "Camadas por elemento"
    else if (ref === "el-hue") next.layers.hue = t.checked;
    else if (/^el-(low|voice|air|entry|snare|mood)-on$/.test(ref)) next.layers[ref.slice(3, -3)].on = t.checked;
    else if (/^el-(low|voice|air|entry|snare|mood)-amt$/.test(ref)) next.layers[ref.slice(3, -4)].amount = Number(t.value);
    else if (ref === "dim") { S.lookDrag = true; next.wallpaper.dim = Number(t.value); }
    else if (ref === "layoutBlur" || ref === "ambBlur") {   // the pair of the selected wallpaper ("Capa do álbum" has its own)
      S.lookDrag = true;
      const B = wallBlur();
      next.wallpaper[ref === "layoutBlur" ? B.kL : B.kA] = Number(t.value);
    }
    else return;
    // "Quando o grave entra" / "Subidas e calmarias" show a sample in the preview (one at a time while dragging)
    const dm = /^el-(entry|mood)-(on|amt)$/.exec(ref);
    if (dm && (ref.endsWith("-on") ? t.checked : Number(t.value) > 0) &&
        !(S.pvDemo && S.pvDemo.k === dm[1] && now() - S.pvDemo.at < (dm[1] === "entry" ? EL_ENTRY_MS : EL_DEMO_RISE + EL_ENTRY_MS))) S.pvDemo = { k: dm[1], at: now() };
    applySettings(next, false);
    try { pvSoloFrom(ref, t); } catch (err) { S.pvSolo = null; }   // the preview highlights what changed
  }
  /** which part of the visual a control belongs to; the preview highlights it for SOLO_MS (the rest dims), and
      a beat-driven one gets a sample beat when the music has none at that moment (pvKickFrame) */
  const SOLO_OF = { "el-low": "low", "el-voice": "voice", "el-air": "air", "el-entry": "entry", "el-snare": "snare", "el-mood": "mood", "el-hue": "hue",
    zoom: "zoom", glow: "glow", groove: "groove", sInt: "int", sFall: "fall", sCaps: "caps", sReach: "reach" };
  const SOLO_NAME = { low: "el.low", voice: "el.voice", air: "el.air", entry: "el.entry", snare: "el.snare",
    mood: "el.mood", hue: "el.hue", zoom: "fx.zoom", glow: "fx.glow", groove: "fx.groove",
    int: "ctl.intensity", fall: "ctl.fall", caps: "ctl.caps", reach: "ctl.reach" };
  const soloName = (k) => (SOLO_NAME[k] ? tr(SOLO_NAME[k]) : "");
  const SOLO_BEAT = { zoom: 1, glow: 1, groove: 1, int: 1, fall: 1, caps: 1 };
  // the style controls size / time the crown itself: dimming the layers while one is moved made the crown ~30 %
  // smaller ("Intensidade" up, the preview down); they keep the chip (and the sample beat on music without a beat)
  const SOLO_NODIM = { int: 1, fall: 1, caps: 1, reach: 1 };
  const SOLO_LAYER = { G: "low", V: "voice", A: "air", E: "entry", S: "snare", M: "mood" };
  const SOLO_MS = 1500, SOLO_IN = 140, SOLO_OUT = 450, SOLO_DIM = 0.8;
  function pvSoloFrom(ref, t) {
    const m = /^(el-[a-z]+|zoom|glow|groove|sInt|sFall|sCaps|sReach)(?:-(on|amt))?$/.exec(ref || ""), k = m && SOLO_OF[m[1]];
    if (!k) return;
    if ((m[2] === "on" || ref === "el-hue" || ref === "sCaps") && t && !t.checked) return;   // switched off: nothing to show
    if (m[1].startsWith("el-") && !(CFG.layers && CFG.layers.on)) return;
    const T = now(), P = S.pvSolo, live = P && T - P.at < SOLO_MS + SOLO_OUT;
    if (live && P.k === k) P.at = T;                                   // dragging: the highlight holds
    else S.pvSolo = { k, at: T, t0: live ? T - SOLO_IN : T };          // from another highlight: no dip
    const noBeat = num(SIG.preview.drums, 1) < 0.2 || num(SIG.preview.soft, 0) > 0.3;
    if (SOLO_BEAT[k] && noBeat && !(S.pvKick && T - S.pvKick.at < PV_KICK_N * PV_KICK_GAP)) S.pvKick = { at: T };
    if (k === "snare" && !(S.pvSnap && T - S.pvSnap.at < 1400)) {
      const E = SIG.preview.ext && SIG.preview.ext.el;
      if (!E || num(E.snapAge, 1e9) > 900) S.pvSnap = { at: T };
    }
    S.pvSolo.demo = !!(S.pvKick && SOLO_BEAT[k]);
  }
  /** 0..1 the highlight's strength now (fades in SOLO_IN, holds SOLO_MS after the last change, fades out SOLO_OUT) */
  function soloLevel(T) {
    const P = S.pvSolo;
    if (!P) return 0;
    const a = T - P.t0, b = T - P.at;
    if (b > SOLO_MS + SOLO_OUT || a < 0) { S.pvSolo = null; return 0; }
    return smooth(Math.min(clamp(a / SOLO_IN, 0, 1), b < SOLO_MS ? 1 : 1 - (b - SOLO_MS) / SOLO_OUT));
  }
  /** the preview's dimmed layer amounts while a part is highlighted (null: none). A layer: the other layers dim by SOLO_DIM;
      an effect / style control: the layers dim by 0.6 (the beat's part shows); "Alcance": nothing dims */
  function soloK(sv) {
    const P = S.pvSolo, K0 = elK();
    if (!P || !K0 || sv <= 0.001 || SOLO_NODIM[P.k]) return null;
    const layer = Object.values(SOLO_LAYER).includes(P.k) || P.k === "hue", d = 1 - (layer ? SOLO_DIM : 0.6) * sv, o = Object.assign({}, K0);
    for (const f of Object.keys(SOLO_LAYER)) {
      const mine = SOLO_LAYER[f] === P.k || (P.k === "hue" && f === "V");
      if (!mine) o[f] = K0[f] * d;
    }
    return o;
  }
  /** the dock: shown once the big preview has scrolled up under its place (with a little hysteresis) */
  const DOCK_H = 92;
  function scheduleDock() { if (!S.dockRaf) S.dockRaf = requestAnimationFrame(dockCheck); }
  function dockCheck() {
    S.dockRaf = 0;
    const R = el.pRef, pane = el.pane;
    if (!R || !pane || !R.pvBox) return;
    let on = false;
    if (S.panelOpen && !pane.hidden && S.tab === "amb") {
      const pr = R.pvBox.getBoundingClientRect(), br = pane.getBoundingClientRect(), edge = br.top + DOCK_H + 10;
      on = pr.height > 0 && (S.docked ? pr.bottom < edge + 8 : pr.bottom < edge - 8);
    }
    if (on === !!S.docked) return;
    S.docked = on;
    if (on) {
      const w = R.pvBox.clientWidth, h = R.pvBox.clientHeight;
      if (w && h) R.dock.style.width = Math.round((DOCK_H * w) / h) + "px";
      drawDock(V.preview);                       // the first frame at once (no empty card sliding in)
    } else S.dockOffAt = now();
    pane.classList.toggle("nd-ap__body--docked", on);
  }
  /** the mini preview: a scaled copy of the preview's canvas (same aspect), drawn while docked or fading out */
  function drawDock(v) {
    const cv = el.pRef && el.pRef.dockCv, c = el.dockCtx;
    if (!cv || !c || !v || !v.cv.width) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(v.cv, 0, 0, v.cv.width, v.cv.height, 0, 0, W, H);
  }
  /** a control that takes the KEYBOARD focus under the docked preview scrolls down into view below it (it is never hidden
      by it). Never on a mouse / touch focus: that focus comes on the press, and scrolling the control away while
      the button is held lost the click (a switch did not toggle) or the drag (a slider stayed put); a control the pointer
      can press is visible already (the dock itself catches presses on it) */
  const focusByKey = (t) => { try { return t.matches(":focus-visible"); } catch (err) { return false; } };
  function onPaneFocus(e) {
    const R = el.pRef, pane = el.pane, t = e.target;
    if (!S.docked || !R || !pane || !t || !t.getBoundingClientRect || R.dock.contains(t) || !focusByKey(t)) return;
    requestAnimationFrame(() => {               // after the browser's own focus scroll (keyboard: scroll-padding-top)
      if (!S.docked || document.activeElement !== t || !focusByKey(t)) return;
      const br = pane.getBoundingClientRect(), r = t.getBoundingClientRect(), lim = br.top + DOCK_H + 14;
      if (r.top < lim && r.bottom > br.top - 400) {
        try { pane.scrollBy({ top: r.top - lim - 6, behavior: S.reducedMotion ? "auto" : "smooth" }); } catch (err) { pane.scrollTop += r.top - lim - 6; }
      }
    });
  }
  function onPanelChange(e) {
    const t = e.target, ref = (t && t.getAttribute && t.getAttribute("data-ref")) || "";
    if (ref === "file") {
      S.filePicking = false;
      const f = t.files && t.files[0];
      t.value = "";                          // the same file can be chosen again
      if (f) importWallFile(f); else syncLook();
      return;
    }
    if (ref === "hex") { commitHex(true); return; }
    if (S.lookDrag) { S.lookDrag = false; clearTimeout(LOOK.timer); LOOK.timer = 0; scheduleLook(); }   // released: the final value now
    saveSettings(true);
  }
  /** the hex field: a valid code is the colour; anything else goes back to the current one */
  function commitHex(use) {
    const R = el.pRef, i = S.cEdit || 0, h = use ? parseHex(R.hex.value) : null;
    if (h && h !== CFG.colors.custom[i]) setCustom(i, h, false);
    R.hex.value = CFG.colors.custom[i].toUpperCase();
    saveSettings(true);
  }
  function setPreset(id) {
    const next = clone(CFG);
    if (id === "custom" && next.colors.preset !== "custom" &&
        next.colors.custom.join() === DEFAULTS.colors.custom.join()) next.colors.custom = lookPair().slice();   // start from what is on screen
    next.colors.preset = id;
    applySettings(next, false);
  }
  /** "Imagem do computador" without a stored picture opens the file picker first */
  function setWallMode(mode) {
    if (mode === "file" && !CFG.wallpaper.file) {
      if (now() - (S.wallArrowAt || -1e9) < 300) { wallNote(tr("wall.pressEnter"), false); syncLook(); return; }
      openFilePicker(); syncLook(); return;
    }
    const next = clone(CFG);
    next.wallpaper.mode = mode;
    wallNote("", false);
    applySettings(next, true);
  }
  function openFilePicker() {
    if (!el.pRef) return;
    S.filePicking = true;
    try { el.pRef.file.click(); } catch (e) { S.filePicking = false; }
  }
  /** a reset that asks first. The first click arms the button (armedLabel for ARM_MS); a second, SEPARATE click in
      that time runs it. A click that belongs to the arming gesture - the second click of a double-click (e.detail > 1) or
      any click within ARM_GUARD_MS of arming - is ignored (otherwise a normal double-click would arm and confirm at once).
      Used by every reset that loses choices someone made. */
  const ARM_MS = 5000, ARM_GUARD_MS = 600;
  function armOnce(b, e, armedLabel, run) {
    const t = now(), A = S.armed || (S.armed = {}), k = b.getAttribute("data-ref"), st = A[k];
    if (st && st.until > t) {
      if ((e && e.detail > 1) || t - st.at < ARM_GUARD_MS) return;
      disarm(k);
      run();
      return;
    }
    if (e && e.detail > 1) return;                 // the tail of a double-click on a button that was not armed
    disarm(k);
    A[k] = { at: t, until: t + ARM_MS, label: b.textContent, b, timer: setTimeout(() => disarm(k), ARM_MS) };
    b.textContent = armedLabel;
    b.classList.add("nd-ap__btn--armed");
    b.setAttribute("aria-live", "polite");
  }
  function disarm(k) {
    const A = S.armed || {}, list = k ? [k] : Object.keys(A);
    for (const q of list) {
      const st = A[q];
      if (!st) continue;
      clearTimeout(st.timer);
      st.b.textContent = st.label;
      st.b.classList.remove("nd-ap__btn--armed");
      st.b.removeAttribute("aria-live");
      A[q] = null;
    }
  }
  function onPanelClick(e) {
    const tab = e.target.closest(".nd-ap__tab");
    if (tab) { setTab(tab.dataset.tab, true); return; }
    const b = e.target.closest("button[data-ref]");
    if (!b) return;
    const ref = b.getAttribute("data-ref");
    if (ref === "close") closePanel(true);
    else if (ref === "compatOk") {
      try { localStorage.setItem(COMPAT_NOTE_KEY, versions().spotify); } catch (err) { /* ignore */ }
      S.compatNote = null;
      syncCompat();
    }
    else if (ref === "reset") {
      // two clicks (one click would wipe the whole tab with no way back); a double-click does not count as both
      // (armOnce); the label fits the button
      armOnce(b, e, tr("arm.again"), () => {
        // the ambient look goes back to default; the on / off choice, colours and wallpaper stay
        applySettings(Object.assign(clone(DEFAULTS), { enabled: CFG.enabled, colors: clone(CFG.colors), wallpaper: clone(CFG.wallpaper) }), true);
        try { Spicetify.showNotification(tr("toast.reset.amb")); } catch (err) { /* ignore */ }
      });
    } else if (ref === "resetColors") {             // one click: "Combinar com o wallpaper" is one click to get back
      const next = clone(CFG);
      next.colors.preset = DEFAULTS.colors.preset;
      applySettings(next, true);
      try { Spicetify.showNotification(tr("toast.reset.colors")); } catch (err) { /* ignore */ }
    } else if (ref === "resetWall") {                // asks first (the cover's own blur pair is lost otherwise)
      armOnce(b, e, tr("arm.again"), () => {
        const next = clone(CFG);
        next.wallpaper = Object.assign(clone(DEFAULTS.wallpaper), { file: CFG.wallpaper.file });   // the stored picture stays ("Remover" deletes it)
        wallNote("", false);
        applySettings(next, true);
        try { Spicetify.showNotification(tr("toast.reset.wall")); } catch (err) { /* ignore */ }
      });
    } else if (ref === "c0" || ref === "c1") { S.cEdit = Number(ref[1]); S.hsvHex = null; syncCustom(); }
    else if (ref === "swap") {
      const next = clone(CFG);
      next.colors.custom = [CFG.colors.custom[1], CFG.colors.custom[0]];
      next.colors.preset = "custom";
      S.hsvHex = null;
      applySettings(next, true);
    } else if (ref === "match") matchWallpaper(true);
    else if (ref === "pick") openFilePicker();
    else if (ref === "removeFile") removeWallFile();
    else if (ref === "test") testNow("amb");
    else if (ref === "ambTest") testNow("wall");
    else if (ref === "elMore") {                         // the rows' disclosure
      S.elOpen = !S.elOpen;
      syncElBox();
      // bring the opened rows into view (they open under the sticky footer)
      if (S.elOpen && el.pRef.elBox && el.pRef.elBox.scrollIntoView) {
        try { el.pRef.elBox.scrollIntoView({ block: "start", behavior: S.reducedMotion ? "auto" : "smooth" }); } catch (err) { /* ignore */ }
      }
    }
    else if (ref === "elReset") {                        // only the "Camadas por elemento" box; asks first
      armOnce(b, e, tr("arm.confirm"), () => {
        const next = clone(CFG);
        next.layers = clone(DEFAULTS.layers);
        applySettings(next, true);
        try { Spicetify.showNotification(tr("toast.reset.layers")); } catch (err) { /* ignore */ }
      });
    } else if (ref === "sbReset") {                      // only the selected style's own settings; asks first
      armOnce(b, e, tr("arm.confirm"), () => {
        const next = clone(CFG), id = CFG.style;
        next.intensity[id] = DEFAULTS.intensity[id]; next.reach[id] = DEFAULTS.reach[id]; next.fall[id] = DEFAULTS.fall[id];
        if (id in DEFAULTS.caps) next.caps[id] = DEFAULTS.caps[id];
        applySettings(next, true);
        try { Spicetify.showNotification(tr("toast.reset.style", { name: STYLES.find((x) => x.id === id).name })); } catch (err) { /* ignore */ }
      });
    }
  }
  /** keys inside the panel that it handles itself (the window-level shield
      stops them before any listener on the panel would see them): arrows /
      Home / End move between the tabs */
  function onPanelKey(e) {
    const t = e.target;
    if (t && t.name === "nd-ap-wall") {
      if (/^Arrow/.test(e.key)) S.wallArrowAt = now();        // an arrow moves the radio: no file dialog
      else if ((e.key === "Enter" || e.key === " ") && t.value === "file" && !CFG.wallpaper.file && !e.repeat) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openFilePicker();
        return true;
      }
    }
    if (t && el.pRef && t === el.pRef.hex && (e.key === "Enter" ||
        ((e.key === "Escape" || e.key === "Esc") && t.value.toLowerCase() !== CFG.colors.custom[S.cEdit || 0]))) {   // a 2nd Esc closes the panel
      e.preventDefault();
      e.stopImmediatePropagation();
      commitHex(e.key === "Enter");              // Enter: use the code (or go back if it is not one); Esc: undo the typing
      return true;
    }
    if (!t || !t.classList || !t.classList.contains("nd-ap__tab") || e.ctrlKey || e.metaKey || e.altKey) return false;
    const i = TAB_IDS.indexOf(t.dataset.tab), n = TAB_IDS.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    setTab(TAB_IDS[j], true);
    return true;
  }

  /** "Testar agora" ("Ambiente" tab) / "Ver no modo ambiente" ("Wallpaper" tab): the panel comes back on that tab */
  function testNow(tab) {
    S.testTab = TAB_IDS.includes(tab) ? tab : "amb";
    closePanel(false);
    S.graceUntil = now() + TEST_GRACE_MS;
    S.reopenPanel = now() + TEST_REOPEN_MS;
    enter("test");
  }

  /** the button the panel hangs from: the top-bar one, else the player-bar one (the panel then opens upwards) */
  function anchorRect() {
    for (const b of [topBtn && topBtn.button, playBtn && playBtn.element]) {
      if (!b || !b.isConnected) continue;
      const r = b.getBoundingClientRect();
      if (r.width && r.height) return r;
    }
    return null;
  }
  function positionPanel() {
    const p = el.panel;
    if (!p) return;
    const W = p.offsetWidth || 400, vw = window.innerWidth, vh = window.innerHeight;
    const r = anchorRect();
    let left, top;
    // a button in the lower half of the window with little room under it (a theme that moved the top bar): the
    // panel opens upwards, anchored by its bottom edge
    const up = !!r && vh - r.bottom < 380 && r.top > vh - r.bottom;
    if (r) {
      left = clamp(r.right - W + 8, 8, vw - W - 8);
      top = Math.round(r.bottom + 8);
      p.style.setProperty("--nda-ap-arrow", clamp(r.left + r.width / 2 - left, 18, W - 18) + "px");
      p.classList.remove("nd-ap--center");
    } else {                                     // no top-bar button: centred near the top
      left = Math.round((vw - W) / 2);
      top = 64;
      p.classList.add("nd-ap--center");
    }
    p.classList.toggle("nd-ap--above", up);
    p.style.left = Math.round(left) + "px";
    if (up) {
      p.style.top = "auto";
      p.style.bottom = Math.round(vh - r.top + 8) + "px";
      p.style.maxHeight = Math.max(240, r.top - 20) + "px";
    } else {
      p.style.removeProperty("bottom");
      p.style.top = top + "px";
      p.style.maxHeight = Math.max(240, vh - top - 12) + "px";
    }
    if (S.panelOpen) scheduleDock();              // a new height may (un)dock the preview
  }

  function openPanel(focusFirst) {
    if (S.destroyed) return;
    if (isActive()) exit("panel");
    if (LANG_SRC === "fallback" && resolveLang()) relabel();   // Spicetify.Locale was not there at init
    checkTheme();
    buildPanel();
    resetDyn(V.preview);                          // the preview starts fresh too
    prepare();                                    // wallpaper + analysis for the preview
    refreshOutSel(true);
    S.dev = null;                                 // the output may have changed since
    syncPanel();
    S.pdemo = null;
    SIG.preview.gate = 1;
    el.panel.hidden = false;
    S.panelOpen = true;
    positionPanel();
    el.panel.classList.add("nd-ap--open");
    S.panelOpenAt = now();                        // the soft mode's note shows once per opening
    scheduleDock();
    if (topBtn) {
      topBtn.button.setAttribute("aria-expanded", "true");
      topBtn.element.classList.add("nd-amb-topbtn--open");
      try { if (topBtn.tippy) { topBtn.tippy.hide(); topBtn.tippy.disable(); } } catch (e) { /* ignore */ }   // no tooltip over the panel
    }
    syncClock(true);
    startLoop();
    syncLook();                                   // cover thumbnail, stored picture
    if (focusFirst) {
      const f = el.panel.querySelector('.nd-ap__tab[aria-selected="true"]') || el.pRef.enabled;
      try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }
  function closePanel(restoreFocus) {
    if (!S.panelOpen || !el.panel) return;
    S.panelOpen = false;
    disarm();                                      // an armed reset never waits for the next time the panel opens
    S.pvSolo = S.pvKick = S.pvSnap = null;         // no highlight / sample left for the next opening
    if (S.docked) { S.docked = false; if (el.pane) el.pane.classList.remove("nd-ap__body--docked"); }
    saveSettings(true);
    el.panel.classList.remove("nd-ap--open");
    el.panel.hidden = true;
    if (topBtn) {
      topBtn.button.setAttribute("aria-expanded", "false");
      topBtn.element.classList.remove("nd-amb-topbtn--open");
      try { if (topBtn.tippy) topBtn.tippy.enable(); } catch (e) { /* ignore */ }
    }
    S.lastActivity = now();
    if (restoreFocus && topBtn && topBtn.button.isConnected) {
      try { topBtn.button.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    if (S.phase === "off") stopLoop();
  }
  function togglePanel(focusFirst) {
    if (S.panelOpen) closePanel(false); else openPanel(focusFirst);
  }
  /** closes the panel on a pointerdown outside it (and outside its button) */
  function onPanelOutside(e) {
    if (!S.panelOpen) return;
    const t = e.target;
    if (el.panel && el.panel.contains(t)) return;
    if (topBtn && topBtn.element.contains(t)) return;
    if (playBtn && playBtn.element && playBtn.element.contains(t)) return;   // its own click toggles the panel
    closePanel(false);
  }

  // ---- tracing / test hooks ------------------------------------------------------
  function traceSample(t, posMs, A, sig, fx, level) {
    const T = S.trace;
    if (!T || t < T.next) return;
    T.next = t + T.every * 0.9;
    T.samples.push(makeSample(posMs, A, sig, fx, level));
    if (t >= T.until) finishTrace();
  }
  /** one trace sample. t = playback clock (ms); pA = t - lat = the analysis
      time being shown; nearestBeatMs / nearestKickOnsetMs = pA - that event
      (so a hit that is on time shows 0..attack ms here). */
  function makeSample(posMs, A, sig, fx, level) {
    const lat = num(sig.lat, LATENCY_MS), pA = posMs - lat;
    let nb = null, bc = null, nk = null, nkS = null, segAttack = null, segBright = null, segKick = null, segHat = null, dark = null;
    if (A) {
      const j = nearestIdx(A.beatT, pA);
      if (j >= 0) { nb = Math.round(pA - A.beatT[j]); bc = +A.beatC[j].toFixed(3); }
      const k = lastAtOrBefore(A.hitT, pA + 60);   // the hit being shown (or about to start)
      if (k >= 0) { nk = Math.round(pA - A.hitT[k]); nkS = +A.hitS[k].toFixed(3); }
      const i = Math.max(0, segIndex(A, pA / 1000));
      segAttack = +A.att[i].toFixed(2);
      segBright = +A.bri[i].toFixed(1);
      segKick = +A.kick[i].toFixed(3);
      segHat = +A.hat[i].toFixed(3);
      dark = +(1 - n01(A.bri[i], A.briLo, A.briHi)).toFixed(3);
    }
    return {
      t: Math.round(posMs), pA: Math.round(pA), lat: Math.round(lat), latDev: S.latDev,
      bass: r3(sig.bass), kick: r3(sig.kick), energy: r3(sig.energy), hat: r3(sig.hat),
      zoom: +fx.zoom.toFixed(4), glow: r3(fx.glow), focus: r3(fx.focus),
      groove: r3(num(sig.groove, 0)), drums: r3(num(sig.drums, 1)), beatPh: r3(num(sig.beatPh, 0)), down: sig.down || 0, grooveScale: +num(fx.gs, 1).toFixed(4),
      nearestBeatMs: nb, beatConfidence: bc, nearestKickOnsetMs: nk, kickStrength: nkS,
      segAttack, segBrightness: segBright, darkness: dark, segKick, segHat,
      mainVisualLevel: r3(level),
      style: CFG.style, mode: sig.mode, playing: S.demo ? "demo" : S.clock.playing,
    };
  }
  function finishTrace() {
    const T = S.trace;
    if (!T) return;
    S.trace = null;
    if (T.timer) clearInterval(T.timer);
    T.resolve(T.samples);
  }
  function state() {
    const item = currentItem();
    const e = item && cache.get(item.uri);
    const sig = SIG.main;
    return {
      enabled: CFG.enabled,
      phase: S.phase,
      active: S.phase !== "off",
      idleMs: idleMs(),
      idleForMs: Math.round(now() - S.lastActivity),
      blockedBy: S.phase === "off" ? (CFG.enabled ? S.blockedBy : "disabled") : null,
      playing: isPlaying(),
      hidden: document.hidden,
      uri: item ? item.uri : null,
      analysis: e ? e.st : "none",
      analysisError: e && e.err ? e.err : undefined,
      analysisKind: e && e.kind ? e.kind : undefined,   // missing / empty / auth / rate / server / net / timeout
      analysisTries: e && e.tries ? e.tries : undefined,   // quick retries after a failed request
      retryInMs: e && e.st === "fail" ? Math.max(0, Math.round(failRetryMs(e) - (now() - e.at))) : undefined,   // the back-off
      soft: r3(num(SIG.main.soft, 0)), softPreview: r3(num(SIG.preview.soft, 0)),   // "modo ambiente suave"
      docked: !!S.docked, solo: S.pvSolo ? S.pvSolo.k : null,
      mode: analysisFor(item && item.uri) ? "analysis" : "fallback",
      positionMs: Math.round(mainPosition(now())),
      style: CFG.style,
      bass: r3(sig.bass), kick: r3(sig.kick), energy: r3(sig.energy),
      level: r3(S.level), zoom: +S.lastFx.zoom.toFixed(4), glow: r3(S.lastFx.glow),
      pulse: r3(sig.kick),
      wallpaper: S.wall,
      rafRunning: !!S.raf,
      hold: S.hold,
      panelOpen: S.panelOpen,
      menu: !!menuItem, menuSettings: !!menuSettings, topbar: !!(topBtn && topBtn.element.isConnected),
      demo: !!S.demo,
      cacheSize: cache.size,
      stats: Object.assign({}, S.stats, { idleCheckMs: +S.stats.idleCheckMs.toFixed(3) }),
      test: S.test || undefined,
      enterReason: S.enterReason,
      lastExit: S.lastExit,
      blockedDetail: S.phase === "off" && S.blockedBy && S.blockedDetail ? Object.assign({}, S.blockedDetail) : undefined,
      version: ND_VERSION,
      theme: { on: THEME.on, version: THEME.ver, source: THEME.source },
      lang: LANG, langSource: LANG_SRC,
      entry: entryState(),
      sync: { device: S.dev ? { key: S.dev.key, name: S.dev.name, remote: S.dev.remote, bt: S.dev.bt } : null, latencyMs: S.latDev, effectiveMs: +num(S.latEff, 0).toFixed(1), vsyncMs: +S.vsync.toFixed(2), displayLeadMs: +displayLead().toFixed(1) },
    };
  }

  /** window.NeonDriftAmbient: a small public API (debugging / other extensions). enter / exit / test start or end
      ambient mode; state() / settings() / theme() / compat() report; set(patch) changes settings (sanitised, saved). */
  const API = {
    version: ND_VERSION,
    __ext: true,
    enter() { enter("api"); return state(); },
    exit() { exit("api"); return state(); },
    test() { testNow(); return state(); },
    state,
    settings() { return clone(CFG); },
    set(patch) {                       // e.g. set({ style: "ring", zoom: { amount: 150 } })
      const next = clone(CFG);
      for (const k of Object.keys(patch || {})) {
        if (patch[k] && typeof patch[k] === "object" && next[k] && typeof next[k] === "object") Object.assign(next[k], patch[k]);
        else next[k] = patch[k];
      }
      applySettings(next, true);
      return clone(CFG);
    },
    openPanel() { openPanel(false); return state(); },
    closePanel() { closePanel(false); return state(); },
    get enabled() { return CFG.enabled; },
    set enabled(v) { setEnabled(v, false); },
    _destroy(opts) { destroy(opts); },
    theme() { return { on: THEME.on, version: THEME.ver, source: THEME.source }; },
    compat() { return compatProbe(); },
  };
  window.NeonDriftAmbient = API;

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
})();
