// All release checks (npm run check): build outputs, theme / extension boundaries, i18n parity, manifest,
// size budgets, private data. Exit code 1 on any failure.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rules, splitTop } from "../audit/css-parse.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const R = (p) => readFileSync(join(root, p), "utf8");
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const node = process.execPath;

// ---- build outputs -------------------------------------------------------------------------
execFileSync(node, [join(root, "tools/build/build.mjs")], { stdio: "inherit" });
const EXT = "extension/neondrift-ambient.js";
const ext = R(EXT);
try { execFileSync(node, ["--check", join(root, EXT)]); ok(true, "extension parses (node --check)"); } catch (e) { ok(false, "extension parses"); }
ok(!/__ND_[A-Z0-9_]+__/.test(ext), "no build placeholders left");
ok(!/\b_(perf|trace|simulate|bench|fault|test)\b\s*[(:]/.test(ext.replace(/\/\/.*$/gm, "")), "release has no dev hooks (_perf, _trace, _simulate, _bench, _fault, _test)");
ok(!/background\.png/.test(ext), "extension does not reference the old wallpaper file");
// the embedded CSS: own selectors only (the tooltip rule is the one exception)
const cssStr = JSON.parse(ext.match(/const ND_CSS = ("(?:[^"\\]|\\.)*");/)[1]);
const own = /^(#nd-ambient|#nd-amb-panel|\.nd-amb-topbtn|\.nd-amb-tippop)\b/;
const foreign = [];
for (const r of rules(cssStr)) for (const s of splitTop(r.sel)) if (!own.test(s.trim())) foreign.push(s.trim());
ok(foreign.length === 0, "extension CSS styles only its own nodes" + (foreign.length ? ": " + foreign.slice(0, 5).join(" | ") : ""));
ok(!/--nd-(?!a-)/.test(cssStr.replace(/--nda-/g, "")), "extension CSS uses only --nda-* variables");
// --nd-* in the JS only as the theme contract (makePalette names / setWallVars / nd-look-vars)
const ndJs = [...new Set((ext.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").match(/--nd-[a-z0-9-]+/g) || []))];
const CONTRACT = ["--nd-a1", "--nd-a1-rgb", "--nd-a2", "--nd-a2-rgb", "--nd-a1-fg", "--nd-a2-fg", "--nd-a2-ink", "--nd-on-accent", "--nd-line-rgb", "--nd-a1-soft-rgb", "--nd-a2-soft-rgb",
  "--nd-text", "--nd-text-rgb", "--nd-subtext", "--nd-subtext-rgb", "--nd-muted", "--nd-muted-rgb", "--nd-green-rotate", "--nd-green-sat", "--nd-green-bright", "--nd-announce", "--nd-announce-rgb",
  "--nd-announce-hi", "--nd-wallpaper", "--nd-wall-dim", "--nd-wall-blur", "--nd-blur"];
const stray = ndJs.filter((v) => !CONTRACT.includes(v));
ok(stray.length === 0, "extension JS writes --nd-* only for the theme contract" + (stray.length ? ": " + stray.join(" ") : ""));

// ---- theme ------------------------------------------------------------------------------------
const THEME = "theme/NeonDrift/user.css";
const theme = R(THEME);
ok(/:root\s*\{\s*--neondrift-theme:\s*1;/.test(theme), "theme declares the contract marker --neondrift-theme: 1");
ok(!/url\(\s*["']?\.\//.test(theme.replace(/\/\*[\s\S]*?\*\//g, "")), "theme has no local url() (no assets)");
ok(!/#nd-ambient|#nd-amb-panel|\.nd-amb-|\.nd-ap__/.test(theme.replace(/\/\*[\s\S]*?\*\//g, "")), "theme has no extension selectors");
ok(existsSync(join(root, "theme/NeonDrift/color.ini")), "theme has color.ini");
ok(!existsSync(join(root, "theme/NeonDrift/theme.js")) && !existsSync(join(root, "theme/NeonDrift/assets")), "theme has no theme.js / assets");

// ---- i18n ---------------------------------------------------------------------------------------
const pt = JSON.parse(R("src/i18n/pt-BR.json")), en = JSON.parse(R("src/i18n/en.json"));
delete pt._about; delete en._about;
const kp = Object.keys(pt).sort(), ke = Object.keys(en).sort();
ok(JSON.stringify(kp) === JSON.stringify(ke), `i18n: same keys in pt-BR and en (${kp.length})`);
const ph = (v) => JSON.stringify((typeof v === "object" ? Object.values(v).join(" ") : v).match(/\{\w+\}/g)?.sort() || []);
const phBad = kp.filter((k) => en[k] !== undefined && ph(pt[k]) !== ph(en[k]));
ok(phBad.length === 0, "i18n: same placeholders" + (phBad.length ? ": " + phBad.join(", ") : ""));
const src = readdirSync(join(root, "src/ext")).filter((f) => f.endsWith(".js")).map((f) => R("src/ext/" + f)).join("\n");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");
const used = new Set([...code.matchAll(/\b(?:tr|tx)\(\s*"([\w.]+)"/g)].map((m) => m[1]));
for (const m of code.matchAll(/"((?:el|fx|ctl|sb|wall|col|rhythm|amb|pv|aria|soft|menu|panel|toast|style|preset|tab|os|fallWord|compat|colors|idle|arm|btn|dock|val|title|overlay)\.[\w.]+)"/g)) used.add(m[1]);
const named = [...code.matchAll(/named\("([\w.]+)"/g)].map((m) => m[1]);
const missing = [...used].filter((k) => !k.endsWith(".") && !(k in pt) && !named.some((n) => k === n));
ok(missing.length === 0, "i18n: every key used by the code exists" + (missing.length ? ": " + missing.join(", ") : ""));
const literal = code.split("\n").filter((l) => /"[^"]*[áàâãéêíóôõúçÁÉÍÓÚÇ][^"]*"/.test(l) && !/^\s*(\/\/|\*)/.test(l));
ok(literal.length === 0, "i18n: no Portuguese literal outside src/i18n" + (literal.length ? ": " + literal.slice(0, 3).map((l) => l.trim().slice(0, 80)).join(" | ") : ""));

// ---- manifest -------------------------------------------------------------------------------------
let man = null;
try { man = JSON.parse(R("manifest.json")); } catch (e) { /* reported below */ }
ok(Array.isArray(man) && man.length === 2, "manifest.json is an array of 2 entries");
for (const m of man || []) {
  const n = m.name || "?";
  ok(typeof m.name === "string" && m.name.trim() && typeof m.description === "string" && m.description.trim(), n + ": name + description");
  for (const k of ["preview", "readme", "main", "usercss", "schemes"]) if (m[k]) ok(existsSync(join(root, m[k])), n + ": " + k + " exists (" + m[k] + ")");
  ok(Array.isArray(m.authors) && m.authors.every((a) => a.name && a.url), n + ": authors have name + url");
  ok(!m.tags || m.tags.length <= 4, n + ": at most 4 tags");
  ok(!!(m.main || m.usercss), n + ": is an extension (main) or a theme (usercss)");
}

// ---- sizes -----------------------------------------------------------------------------------------
const kb = (p) => statSync(join(root, p)).size / 1024;
ok(kb(EXT) < 600, `extension size ${kb(EXT).toFixed(0)} KB < 600 KB`);
ok(kb(THEME) < 120, `theme size ${kb(THEME).toFixed(0)} KB < 120 KB`);
const previewFiles = (d) => readdirSync(join(root, d)).flatMap((f) => (statSync(join(root, d, f)).isDirectory() ? previewFiles(d + "/" + f) : [d + "/" + f]));
if (existsSync(join(root, "previews"))) for (const f of previewFiles("previews")) {
  const lim = /\/hero\./.test(f) ? 5120 : 1024;
  ok(kb(f) < lim, `${f} ${kb(f).toFixed(0)} KB < ${lim} KB`);
}

// ---- Windows helper (extras/auto-reapply) ----------------------------------------------------------------
const HELPER = "extras/auto-reapply";
if (existsSync(join(root, HELPER))) {
  const files = readdirSync(join(root, HELPER));
  for (const f of ["neondrift-startup.ps1", "install.ps1", "uninstall.ps1", "install.bat", "uninstall.bat", "Open Spotify (NeonDrift).bat"]) ok(files.includes(f), `${HELPER}: has ${f}`);
  const ps1 = files.filter((f) => f.endsWith(".ps1"));
  for (const f of ps1) {
    const buf = readFileSync(join(root, HELPER, f));
    const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    ok(bom || !buf.some((b) => b > 0x7f), `${HELPER}/${f}: UTF-8 with BOM (Windows PowerShell 5.1 reads a file without one as ANSI)`);
    // the message tables: en = @{ Key = '...' } and pt = @{ ... } with the same keys
    const s = buf.toString("utf8");
    const keys = (lang) => { const m = s.match(new RegExp("^\\s*" + lang + " = @\\{\\r?\\n([\\s\\S]*?)^\\s*\\}", "m")); return m ? [...m[1].matchAll(/^\s*(\w+)\s*=/gm)].map((x) => x[1]).sort() : []; };
    const en = keys("en"), pt = keys("pt");
    ok(en.length > 0 && JSON.stringify(en) === JSON.stringify(pt), `${HELPER}/${f}: same message keys in en and pt (${en.length})`);
    const usedKeys = [...new Set([...s.matchAll(/\bT '(\w+)'/g)].map((m) => m[1]))];
    const unknown = usedKeys.filter((k) => !en.includes(k));
    ok(unknown.length === 0, `${HELPER}/${f}: every message used exists` + (unknown.length ? ": " + unknown.join(", ") : ""));
  }
  for (const f of files.filter((f) => f.endsWith(".bat"))) {
    const buf = readFileSync(join(root, HELPER, f)), s = buf.toString("latin1");
    ok(!buf.some((b) => b > 0x7f), `${HELPER}/${f}: ASCII only (cmd.exe reads .bat files in the console code page)`);
    ok(!/(^|[^\r])\n/.test(s), `${HELPER}/${f}: CRLF line endings`);
    for (const m of s.matchAll(/%~dp0([^"%\r\n]+\.ps1)/g)) ok(files.includes(m[1]), `${HELPER}/${f}: calls ${m[1]}, which exists`);
  }
  // PowerShell syntax, with the parser of Windows PowerShell 5.1 (Windows only)
  if (process.platform === "win32") {
    const list = ps1.map((f) => "'" + join(root, HELPER, f).replace(/'/g, "''") + "'").join(", ");
    const cmd = "$bad = 0; foreach ($f in @(" + list + ")) { $t = $null; $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$t, [ref]$e); foreach ($x in $e) { Write-Output ($f + ':' + $x.Extent.StartLineNumber + ': ' + $x.Message); $bad = 1 } }; exit $bad";
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      ok(true, `${HELPER}: the ${ps1.length} scripts parse (Windows PowerShell)`);
    } catch (e) {
      if (e.code === "ENOENT") console.log("SKIP PowerShell syntax check (no powershell.exe)");
      else ok(false, `${HELPER}: the scripts parse (Windows PowerShell): ` + String(e.stdout || e.message).trim());
    }
  } else console.log("SKIP PowerShell syntax check (not Windows)");
}

// ---- private data ---------------------------------------------------------------------------------------
try { execFileSync(node, [join(root, "tools/build/check-private.mjs")], { stdio: "inherit" }); ok(true, "private-data check"); } catch (e) { ok(false, "private-data check"); }

// ---- Spicetify class maps (the theme / extension work whichever map "spicetify backup" got) --------------------------
// node tools/build/check.mjs --map-new <main css-map.json> [--spa <Spicetify Backup/xpui.spa>]; required with --publish
const argOf = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const PUBLISH = process.argv.includes("--publish");
const spiceHome = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "spicetify") : join(process.env.HOME || "", ".config", "spicetify");
const spa = argOf("--spa") || join(process.env.APPDATA || join(process.env.HOME || "", ".config"), "spicetify", "Backup", "xpui.spa");
const mapNew = argOf("--map-new");
if (mapNew && existsSync(mapNew) && existsSync(spa)) {
  try { execFileSync(node, [join(root, "tools/audit/selector-audit.mjs"), "--original", spa, "--map-new", mapNew, "--map", join(spiceHome, "css-map.json")], { cwd: root, stdio: "inherit" }); ok(true, "class-map check (both Spicetify maps)"); }
  catch (e) { ok(false, "class-map check (both Spicetify maps)"); }
} else if (PUBLISH) ok(false, "class-map check: pass --map-new <main css-map.json> (and --spa <Spicetify Backup/xpui.spa> if it is not in the usual place)");
else console.log("SKIP class-map check (pass --map-new <main css-map.json>, see docs/COMPATIBILITY.md)");

// ---- publish gate (node tools/build/check.mjs --publish): nothing left to fill in, links point at the real repo,
// no personal e-mail in the history -----------------------------------------------------------------------------------
if (PUBLISH) {
  const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const tracked = git("ls-files").split("\n").filter(Boolean);
  const holders = tracked.filter((f) => /\.(md|json|js|mjs|css|ini|txt)$/.test(f) && !f.startsWith("tools/build/check") && /<GITHUB_USERNAME>|<REPO>/.test(R(f)));
  ok(holders.length === 0, "no <GITHUB_USERNAME> / <REPO> placeholders left" + (holders.length ? ": " + holders.join(", ") : ""));
  let origin = "";
  try { origin = git("remote", "get-url", "origin"); } catch (e) { /* none */ }
  const om = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(origin);
  ok(!!om, "git remote origin is a GitHub repository" + (origin ? " (" + origin + ")" : " (no origin)"));
  if (om && man) {
    const want = "https://raw.githubusercontent.com/" + om[1] + "/" + om[2] + "/main/extension/neondrift-ambient.js";
    for (const m of man) for (const u of m.include || []) ok(u === want, (m.name || "?") + ": include is " + want + (u === want ? "" : " (found " + u + ")"));
    for (const m of man) for (const a of m.authors || []) ok(a.url === "https://github.com/" + om[1], (m.name || "?") + ": author url is https://github.com/" + om[1]);
  }
  const mails = [...new Set(git("log", "--format=%ae%n%ce").split("\n").filter(Boolean))];
  const personal = mails.filter((e) => !/@users\.noreply\.github\.com$/i.test(e));
  ok(personal.length === 0, "every commit uses a GitHub noreply e-mail" + (personal.length ? " (" + personal.length + " other address(es) in the history)" : ""));
}
console.log(fails ? fails + " check(s) failed" : "all checks passed");
process.exitCode = fails ? 1 : 0;
