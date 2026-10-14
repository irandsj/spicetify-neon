// After a Spotify / Spicetify update: which scrambled class names of the theme still exist in Spotify's code, which
// readable alias names exist, and which hashed classes have neither (their rules no longer apply).
//   node tools/audit/selector-audit.mjs <Spotify xpui folder> [theme user.css] [css-map.json]
// The xpui folder is Spotify's Apps/xpui (after `spicetify apply`) or Spicetify's Extracted/Raw/xpui.
//
// Class-map check (exit code 1 on a problem):
//   node tools/audit/selector-audit.mjs --original <Spicetify Backup/xpui.spa> --map-new <css-map.json>
//        [theme user.css] [extension .js] [--map <css-map.json>]
// Spicetify renames Spotify's scrambled classes with the class map it gets at "spicetify backup": the newest map of
// its main branch while the latest release shares its major.minor version, else the map of the release tag, else its
// local copy (= the tag's). So the same Spotify can have a readable name with one map and only the scrambled one with
// the other. A name that one map gives to a class of Spotify's ORIGINAL code (the backup xpui.spa) and the other does
// not must sit next to that scrambled name, as in :is(.kqGrI_ODO1c0FGcH5yeB, .main-genericButton-button) (CSS) or
// ".main-actionButtons, .uf2x5WzM1lLLCLSQdMFB" (one selector string in the extension); a stable fallback arm such as
// :is(.Root__globalNav, [id="global-nav-bar"]) counts too. --map-new: the main branch's map (download
// https://raw.githubusercontent.com/spicetify/cli/main/css-map.json); --map: the local one (default
// %LOCALAPPDATA%/spicetify/css-map.json, or ~/.config/spicetify/css-map.json).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { splitTop } from "./css-parse.mjs";

const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const spiceHome = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "spicetify") : join(process.env.HOME || "", ".config", "spicetify");
const mapArg = flag("--map") || join(spiceHome, "css-map.json");
const mapNewArg = flag("--map-new");

/** the text files (.css / .js) of a zip (Spotify's .spa), no dependencies */
function zipTexts(path) {
  const b = readFileSync(path), out = new Map();
  let e = b.length - 22;
  while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error("not a zip: " + path);
  let p = b.readUInt32LE(e + 16);
  const n = b.readUInt16LE(e + 10);
  for (let k = 0; k < n; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error("bad zip directory");
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32);
    const off = b.readUInt32LE(p + 42), name = b.toString("utf8", p + 46, p + 46 + nl);
    p += 46 + nl + xl + cl;
    if (!/\.(css|js)$/.test(name)) continue;
    const start = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28), data = b.subarray(start, start + csize);
    out.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
  }
  return out;
}

/** the argument of every :is( ... ) (nested parentheses allowed) */
function isArgs(css) {
  const out = [];
  for (let i = css.indexOf(":is("); i >= 0; i = css.indexOf(":is(", i + 1)) {
    let d = 0, j = i + 3;
    for (; j < css.length; j++) { if (css[j] === "(") d++; else if (css[j] === ")" && !--d) break; }
    out.push(css.slice(i + 4, j));
  }
  return out;
}
const isHash = (t) => /^[A-Za-z0-9_]{16,20}$/.test(t) && /[A-Z]/.test(t) && /[a-z]/.test(t);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

function originalCheck(spa, cssPath, extPath, mapPath, mapNewPath) {
  const ok = (f) => !!f && existsSync(f);
  if (!ok(spa) || !ok(mapPath) || !ok(mapNewPath)) {
    console.error("usage: selector-audit.mjs --original <Backup/xpui.spa> --map-new <main css-map.json> [user.css] [extension.js] [--map <local css-map.json>]");
    return 2;
  }
  let bundle = "";
  for (const t of zipTexts(spa).values()) bundle += t + "\n";
  const classes = new Set(bundle.match(/[A-Za-z0-9_]{16,20}/g) || []);
  const given = (map) => { const out = new Set(); for (const [h, r] of Object.entries(map)) if (classes.has(h)) out.add(r); return out; };
  const A = given(JSON.parse(readFileSync(mapPath, "utf8"))), N = given(JSON.parse(readFileSync(mapNewPath, "utf8")));
  const inCode = (name) => new RegExp("(^|[^\\w-])" + escRe(name) + "(?![\\w-])").test(bundle);
  // names that only one of the two maps gives to this Spotify (and that its own code does not write itself)
  const risky = new Set([...A, ...N].filter((r) => A.has(r) !== N.has(r) && !inCode(r)));
  const problems = [];
  const css = readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const safe = new Set();
  for (const body of isArgs(css)) {
    const arms = splitTop(body);
    const anchored = arms.some((x) => (/^\.[\w-]+$/.test(x) && isHash(x.slice(1))) || /^\[/.test(x) || /^\.Root\s*>/.test(x));
    if (anchored) for (const x of arms) if (/^\.[\w-]+$/.test(x)) safe.add(x.slice(1));
  }
  const used = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
  let nTheme = 0;
  for (const r of [...used].sort()) {
    if (!risky.has(r)) continue;
    nTheme++;
    if (!safe.has(r)) problems.push("theme: ." + r + " exists only with some Spicetify class maps: write it as :is(.<scrambled name>, ." + r + ")");
  }
  let nExt = 0;
  if (ok(extPath)) {
    const js = readFileSync(extPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
    for (const m of js.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
      const lit = m[2];
      for (const cm of lit.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
        if (!risky.has(cm[1])) continue;
        nExt++;
        const hashed = [...lit.matchAll(/\.([A-Za-z0-9_]{16,20})(?![\w-])/g)].some((h) => isHash(h[1]));
        if (!hashed) problems.push("extension: \"" + lit.slice(0, 70) + "\" uses ." + cm[1] + " without its scrambled name");
      }
    }
  }
  console.log(`class-map check: ${risky.size} names differ between the two maps for this Spotify; the theme uses ${nTheme}, the extension's selectors ${nExt}; ${problems.length} problem(s)`);
  for (const p of problems) console.log("  " + p);
  return problems.length ? 1 : 0;
}

function legacyAudit([xpui, cssPath = "theme/NeonDrift/user.css", mapPath]) {
  if (!xpui || !existsSync(xpui)) { console.error("usage: selector-audit.mjs <xpui folder> [user.css] [css-map.json]"); process.exitCode = 2; return; }
  const css = readFileSync(cssPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  let bundle = "";
  for (const f of readdirSync(xpui)) if (/\.(js|css)$/.test(f)) bundle += readFileSync(join(xpui, f), "utf8");
  const map = mapPath && existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, "utf8")) : null;
  const tokens = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]));
  const hashed = [...tokens].filter((t) => /^[A-Za-z0-9_]{20}$/.test(t) && /[A-Z]/.test(t) && /[a-z]/.test(t));
  const readable = [...tokens].filter((t) => /^(main|Root|view|playlist|artist|x|search|collection|queue|lyrics|desktopmodals)[-_]/.test(t));
  // pairs written as :is(.hash, .alias)
  const pairs = new Map([...css.matchAll(/:is\(\.([A-Za-z0-9_]{20}), \.([\w-]+)\)/g)].map((m) => [m[1], m[2]]));
  const present = (n) => bundle.includes(n);
  const rows = { hashKept: [], aliasOnly: [], bothGone: [], noAliasGone: [] };
  for (const h of hashed) {
    const a = pairs.get(h);
    if (present(h)) rows.hashKept.push(h);
    else if (a && present(a)) rows.aliasOnly.push(h + " -> " + a);
    else if (a) rows.bothGone.push(h + " (" + a + ")");
    else rows.noAliasGone.push(h);
  }
  const mapAliases = map ? hashed.filter((h) => map[h]).map((h) => h + " -> " + map[h]) : [];
  console.log(`hashed classes: ${hashed.length}; still in Spotify's code: ${rows.hashKept.length}; renamed to their alias: ${rows.aliasOnly.length}`);
  console.log(`gone (alias gone too): ${rows.bothGone.length}; gone (no alias): ${rows.noAliasGone.length}`);
  if (rows.bothGone.length) console.log("  " + rows.bothGone.join("\n  "));
  if (rows.noAliasGone.length) console.log("gone without an alias (their rules no longer apply):\n  " + rows.noAliasGone.join("\n  "));
  if (map) console.log(`css-map names for hashed classes of the theme (candidates for new :is() arms): ${mapAliases.length}` + (mapAliases.length ? "\n  " + mapAliases.join("\n  ") : ""));
  const deadReadable = readable.filter((r) => !present(r) && !/^(Root__right-sidebar|main-contextMenu|playlist-playlist|artist-artistOnTour|main-trackList|main-entityHeader|main-topBar|main-home|main-actionBarBackground|main-yourEpisodes|view-homeShortcutsGrid)/.test(r));
  if (deadReadable.length) console.log("readable names not found in Spotify's code (fine if they are aliases waiting for a css-map update):\n  " + deadReadable.join("\n  "));
}

if (argv[0] === "--original") process.exitCode = originalCheck(argv[1], argv[2] || "theme/NeonDrift/user.css", argv[3] || "extension/neondrift-ambient.js", mapArg, mapNewArg);
else legacyAudit(argv);
