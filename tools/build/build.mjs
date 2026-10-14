// NeonDrift build: concatenates src/ext/* (order.json) inside one IIFE, embeds the extension CSS
// (src/css) and the dictionaries (src/i18n), and writes the release extension
// (extension/neondrift-ambient.js) or, with --dev, the dev build (dist/dev/neondrift-ambient.dev.js).
//   node tools/build/build.mjs            release build
//   node tools/build/build.mjs --dev      dev build (debug API, fault injection)
//   node tools/build/build.mjs --phase0 <theme.js>   identity check of the fragments against a theme.js
// Node >= 18, no dependencies.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const DEV = args.includes("--dev");
const P0 = args.indexOf("--phase0");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const pkg = JSON.parse(read("package.json"));
const order = JSON.parse(read("src/ext/order.json"));

/** fragments in order; "dev:" entries only go into the dev build */
function fragments(dev) {
  return order.filter((f) => dev || !f.startsWith("dev:")).map((f) => read("src/ext/" + f.replace(/^dev:/, "")));
}

if (P0 >= 0) {                                   // phase 0: pure move, byte identity with the original file
  const src = readFileSync(args[P0 + 1], "utf8").split("\n");
  const original = src.slice(227).join("\n");    // lines 228.. (the IIFE)
  const body = order.filter((f) => !f.startsWith("dev:")).map((f) => read("src/ext/" + f)).join("");
  const rebuilt = src[227] + "\n" + src[228] + "\n" + body + "})();\n";
  const md5 = (s) => createHash("md5").update(s).digest("hex").slice(0, 8);
  console.log(rebuilt === original ? "PASS phase0 identity (" + md5(rebuilt) + ")" : "FAIL phase0 identity (" + md5(rebuilt) + " vs " + md5(original) + ")");
  process.exit(rebuilt === original ? 0 : 1);
}

/** CSS comments out (a comment marker inside a quoted string would break this: asserted) */
function stripCss(css) {
  for (const m of css.matchAll(/(["'])(?:\.|(?!\1).)*\1/g)) if (/\/\*|\*\//.test(m[0])) throw new Error("comment marker inside a CSS string: " + m[0]);
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/[ \t]+$/gm, "").replace(/\n{2,}/g, "\n").trim() + "\n";
}
/** Other themes ship global rules such as "input { padding: 6px 10px 6px 48px; border-radius: 0 !important }",
    "* { font-size: var(--font-size) !important }" or "* { box-shadow: none !important }", and the extension's nodes
    live in Spotify's own DOM. So every declaration of the extension CSS becomes !important: all our selectors start
    with an id or our own class, so they win over such rules (src/css/shield.css covers what our rules do not set).
    Not touched: custom properties (<style id="nda-vars"> overrides the colours), at-rules other than @media /
    @supports (keyframe declarations cannot be !important), and the properties the extension writes inline or
    animates (SOFT): an !important rule would beat the inline style and the animation. Our own rules keep their
    order and specificity among themselves, so without such a theme nothing changes. */
const SOFT = new Set(["top", "left", "width", "height", "max-height", "inset", "opacity", "transform", "scale"]);
function splitDecls(body) {
  const out = [];
  let depth = 0, q = "", cur = "";
  for (const ch of body) {
    if (q) { cur += ch; if (ch === q) q = ""; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === ";" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function hardenDecls(body) {
  return splitDecls(body).map((d) => {
    const m = /^(\s*)([-\w]+)(\s*:)([\s\S]*?)(\s*)$/.exec(d);
    if (!m) return d;
    const [, lead, prop, colon, value, trail] = m;
    if (prop.startsWith("--") || SOFT.has(prop.toLowerCase()) || /!\s*important$/i.test(value)) return d;
    return lead + prop + colon + value + " !important" + trail;
  }).join(";");
}
function harden(css) {
  let out = "", i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) { out += css.slice(i); break; }
    let depth = 1, j = open + 1, q = "";
    for (; j < css.length && depth; j++) {
      const ch = css[j];
      if (q) { if (ch === q) q = ""; } else if (ch === '"' || ch === "'") q = ch; else if (ch === "{") depth++; else if (ch === "}") depth--;
    }
    const head = css.slice(i, open), body = css.slice(open + 1, j - 1), h = head.trim();
    if (/^@(media|supports)\b/.test(h)) out += head + "{" + harden(body) + "}";
    else if (h.startsWith("@")) out += head + "{" + body + "}";
    else out += head + "{" + hardenDecls(body) + "}";
    i = j;
  }
  return out;
}
const cssParts = ["src/css/shield.css", "src/css/vars.css", "src/css/ambient.css", "src/css/panel.css"].filter((p) => existsSync(join(root, p))).map(read);
const css = harden(stripCss(cssParts.join("\n")));

const i18n = {};
for (const lang of ["pt-BR", "en"]) {
  const p = "src/i18n/" + lang + ".json";
  if (existsSync(join(root, p))) { const d = JSON.parse(read(p)); delete d._about; i18n[lang] = d; }
}

const banner =
  "/*! NeonDrift Ambient v" + pkg.version + (DEV ? " (dev build)" : "") + " | MIT License | (c) " + (pkg.copyrightYear || "2026") + " " + pkg.author + "\n" +
  " *  Ambient mode, neon visualizer and settings panel for Spotify (Spicetify extension).\n" +
  " *  Works with any Spicetify theme; pairs with the NeonDrift theme. " + (pkg.homepage || "") + "\n" +
  " *  Built file: edit src/ and run `node tools/build/build.mjs`. */\n";
let out = banner + "(function NeonDriftAmbient() {\n  \"use strict\";\n" + fragments(DEV).join("") + "})();\n";
const rep = { __ND_VERSION__: JSON.stringify(pkg.version), __ND_DEV__: String(DEV), __ND_CSS__: JSON.stringify(css), __ND_I18N__: JSON.stringify(i18n) };
for (const [k, v] of Object.entries(rep)) out = out.split(k).join(v);
const left = out.match(/__ND_[A-Z0-9_]+__/g);
if (left) throw new Error("placeholders left: " + [...new Set(left)].join(", "));
try { new Function(out); } catch (e) { throw new Error("built file does not parse: " + e.message); }
const file = DEV ? "dist/dev/neondrift-ambient.dev.js" : "extension/neondrift-ambient.js";
mkdirSync(dirname(join(root, file)), { recursive: true });
writeFileSync(join(root, file), out);
console.log("wrote " + file + " (" + (Buffer.byteLength(out) / 1024).toFixed(1) + " KB; css " + (Buffer.byteLength(css) / 1024).toFixed(1) + " KB)");
