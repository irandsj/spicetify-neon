// Specificity diff of two versions of a stylesheet: every rule of the old file must still exist (same order, same
// context, same number of selectors, same declarations) with the same specificity per selector. Rules that only
// exist in the new file must be listed with --allow "<selector list>" (exact text, whitespace collapsed).
// Intended declaration changes: --decl "<old selector list>".
//   node tools/audit/specificity-diff.mjs old.css new.css [--allow "<sel>"]... [--decl "<sel>"]...
import { readFileSync } from "node:fs";
import { rules, splitTop, specificity, spStr } from "./css-parse.mjs";

const args = process.argv.slice(2);
const files = [], allow = new Set(), declOk = new Set();
const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--allow") allow.add(clean(args[++i]));
  else if (args[i] === "--decl") declOk.add(clean(args[++i]));
  else files.push(args[i]);
}
if (files.length !== 2) { console.error("usage: specificity-diff.mjs old.css new.css [--allow sel]..."); process.exit(2); }
const [A, B] = files.map((f) => rules(readFileSync(f, "utf8")));
const norm = (d) => d.replace(/\s+/g, " ").trim();
let j = 0, bad = 0, same = 0, changedSel = 0;
const extra = [];
for (let i = 0; i < A.length; i++) {
  const a = A[i];
  while (j < B.length && allow.has(B[j].sel) && !(B[j].sel === a.sel && B[j].ctx === a.ctx && norm(B[j].decl) === norm(a.decl))) { extra.push(B[j]); j++; }
  const b = B[j++];
  if (!b) { console.log("MISSING rule: " + a.sel); bad++; continue; }
  const sa = splitTop(a.sel), sb = splitTop(b.sel);
  const problems = [];
  if (a.ctx !== b.ctx) problems.push("context " + JSON.stringify(a.ctx) + " -> " + JSON.stringify(b.ctx));
  if (sa.length !== sb.length) problems.push("selector count " + sa.length + " -> " + sb.length);
  else sa.forEach((x, k) => { const p = specificity(x), q = specificity(sb[k]); if (spStr(p) !== spStr(q)) problems.push(x + " " + spStr(p) + " -> " + sb[k] + " " + spStr(q)); });
  if (norm(a.decl) !== norm(b.decl) && !declOk.has(a.sel)) problems.push("declarations changed");
  if (problems.length) { bad++; console.log("CHANGED rule #" + i + ": " + a.sel.slice(0, 120) + "\n   " + problems.join("\n   ")); }
  else { same++; if (a.sel !== b.sel) changedSel++; }
}
while (j < B.length) { if (allow.has(B[j].sel)) extra.push(B[j]); else { console.log("UNLISTED new rule: " + B[j].sel); bad++; } j++; }
console.log(`${same} rules equal (${changedSel} with new selector arms, same specificity), ${extra.length} allowed new rules, ${bad} problems`);
process.exitCode = bad ? 1 : 0;
