// Private-data check of every file that would be published (git index + untracked files that are not ignored):
// personal paths, e-mail addresses, local debugging endpoints, plus an optional local deny-list
// (a gitignored local file, never published: extra words, image hashes and private data folders whose track ids /
// track names must not appear anywhere). Run before every commit and before any push.
//   node tools/build/check-private.mjs [--staged]
import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const staged = process.argv.includes("--staged");
const list = execSync(staged ? "git diff --cached --name-only --diff-filter=ACMR" : "git ls-files --cached --others --exclude-standard", { cwd: root, encoding: "utf8" })
  .split("\n").map((s) => s.trim()).filter(Boolean);
const GENERIC = [
  [/[A-Za-z]:[\\/]+Users[\\/]+/, "a Windows user folder"],
  [/\/(home|Users)\/[a-z][\w.-]*\//, "a home folder"],
  [/AppData[\\/]/, "an AppData path"],
  [/[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/, "an e-mail address"],
  [new RegExp("(127\\.0\\.0\\.1|localhost):" + "92" + "22"), "the local debugging port"],
  [new RegExp("remote" + "-debugging"), "a debugging flag"],
];
const WALL_FILE = "background" + ".png";
let local = { terms: [], allow: {}, sha256: [], corpusDirs: [], minNameLength: 6 };
const lp = join(root, "research", "private-deny.json");
if (existsSync(lp)) local = Object.assign(local, JSON.parse(readFileSync(lp, "utf8")));
else console.log("note: no local deny-list; generic checks only");

// the private corpus: 22-character Spotify ids and track names found in the private data folders
const ids = new Set(), names = new Set();
const walk = (d) => {
  if (!existsSync(d)) return;
  for (const f of readdirSync(d)) {
    const p = join(d, f), st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    for (const m of f.matchAll(/(?<![A-Za-z0-9])[A-Za-z0-9]{22}(?![A-Za-z0-9])/g)) if (/\d/.test(m[0]) && /[a-z]/.test(m[0]) && /[A-Z]/.test(m[0])) ids.add(m[0]);
    if (st.size > 30e6 || ![".json", ".js", ".cjs", ".mjs", ".md", ".txt", ".csv", ".tsv"].includes(extname(f))) continue;
    const s = readFileSync(p, "utf8");
    for (const m of s.matchAll(/spotify:track:([A-Za-z0-9]{22})/g)) ids.add(m[1]);
    for (const m of s.matchAll(/"name"\s*:\s*"([^"]{1,120})"/g)) if (m[1].length >= local.minNameLength) names.add(m[1]);
  }
};
for (const d of local.corpusDirs || []) walk(join(root, d));

const problems = [];
const TEXT = new Set([".js", ".mjs", ".cjs", ".json", ".css", ".ini", ".md", ".txt", ".html", ".svg", ".yml", ".yaml", ""]);
for (const rel of list) {
  const p = join(root, rel);
  if (!existsSync(p) || statSync(p).isDirectory()) continue;
  const buf = readFileSync(p);
  const sha = createHash("sha256").update(buf).digest("hex");
  if ((local.sha256 || []).includes(sha)) problems.push(rel + ": is a private / copyrighted file (hash match)");
  if (rel.split("/").pop().toLowerCase() === WALL_FILE) problems.push(rel + ": this wallpaper file must not be published");
  const ext = extname(rel).toLowerCase();
  if (!TEXT.has(ext) && !/^(LICENSE|\.gitignore|\.gitattributes)$/.test(rel.split("/").pop())) continue;
  const s = buf.toString("utf8");
  const allow = (local.allow && local.allow[rel]) || [];
  const lines = s.split("\n");
  lines.forEach((line, i) => {
    for (const [re, what] of GENERIC) if (re.test(line)) problems.push(`${rel}:${i + 1}: ${what}: ${line.trim().slice(0, 100)}`);
    for (const term of local.terms || []) if (!allow.includes(term) && line.includes(term)) problems.push(`${rel}:${i + 1}: private term "${term}"`);
    for (const m of line.matchAll(/[A-Za-z0-9]{22}/g)) if (ids.has(m[0])) problems.push(`${rel}:${i + 1}: a track id from the private data`);
  });
  for (const n of names) if (s.includes(n)) problems.push(`${rel}: a track name from the private data ("${n.slice(0, 3)}...")`);
}
if (problems.length) {
  console.log(problems.slice(0, 200).join("\n"));
  console.log(`check-private: ${problems.length} problem(s) in ${list.length} files`);
  process.exitCode = 1;
} else console.log(`check-private: clean (${list.length} files; ${ids.size} private ids and ${names.size} names checked)`);
