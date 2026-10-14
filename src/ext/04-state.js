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

