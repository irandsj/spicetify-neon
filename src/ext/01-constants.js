
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

