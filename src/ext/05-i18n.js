
  // ---- language: Português (Brasil) + English ------------------------------------
  // Dictionaries: src/i18n/*.json (embedded by the build). The language follows Spotify's own (Spicetify.Locale):
  // pt* -> pt-BR, anything else -> en. localStorage "NeonDrift:lang" ("pt-BR" / "en") overrides it.
  const I18N = __ND_I18N__;
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
