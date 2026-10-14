// Small CSS helpers for the audits (no dependencies): rule list and selector specificity.

/** style rules in source order: { sel: "selector list", ctx: "@media ... / @supports ..." , decl: "..." } */
export function rules(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  const out = [];
  const walk = (s, ctx) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf("{", i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      // find the matching close brace (strings are not expected in selectors / declarations here)
      let depth = 1, j = open + 1;
      while (j < s.length && depth) { if (s[j] === "{") depth++; else if (s[j] === "}") depth--; j++; }
      const body = s.slice(open + 1, j - 1);
      if (/^@(media|supports|layer|container)\b/.test(head)) walk(body, (ctx ? ctx + " " : "") + head.replace(/\s+/g, " "));
      else if (/^@(keyframes|-webkit-keyframes|font-face|property|page)\b/.test(head)) { /* not a style rule */ }
      else if (head) out.push({ sel: head.replace(/\s+/g, " "), ctx, decl: body.trim() });
      i = j;
    }
  };
  walk(src, "");
  return out;
}

/** splits on commas that are not inside parentheses / brackets */
export function splitTop(s, sep = ",") {
  const out = [];
  let depth = 0, cur = "", q = "";
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = ""; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const max = (list) => list.reduce((m, x) => (cmp(x, m) > 0 ? x : m), [0, 0, 0]);
const PSEUDO_ELEMENTS = /^(before|after|first-line|first-letter|selection|placeholder|marker|backdrop|file-selector-button|-webkit-[a-z-]+)$/;

/** specificity [ids, classes, types] of one complex selector (Selectors Level 4 rules for :is / :not / :has / :where) */
export function specificity(sel) {
  let sp = [0, 0, 0], i = 0;
  const s = sel.trim();
  while (i < s.length) {
    const c = s[i];
    if (c === "#") { const m = /^#[\w-]+/.exec(s.slice(i)); sp = add(sp, [1, 0, 0]); i += m[0].length; }
    else if (c === ".") { const m = /^\.[\w-]+/.exec(s.slice(i)); sp = add(sp, [0, 1, 0]); i += m[0].length; }
    else if (c === "[") { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === "[") d++; else if (s[j] === "]" && !--d) break; } sp = add(sp, [0, 1, 0]); i = j + 1; }
    else if (c === ":") {
      const dbl = s[i + 1] === ":";
      const m = /^::?([\w-]+)/.exec(s.slice(i));
      const name = m[1].toLowerCase();
      i += m[0].length;
      let arg = null;
      if (s[i] === "(") { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === "(") d++; else if (s[j] === ")" && !--d) break; } arg = s.slice(i + 1, j); i = j + 1; }
      if (dbl || PSEUDO_ELEMENTS.test(name)) sp = add(sp, [0, 0, 1]);
      else if (name === "where") { /* 0 */ }
      else if (name === "is" || name === "not" || name === "has" || name === "matches") sp = add(sp, max(splitTop(arg || "").map(specificity)));
      else if (name === "nth-child" || name === "nth-last-child") {
        const of = arg && /\sof\s(.+)$/.exec(arg);
        sp = add(add(sp, [0, 1, 0]), of ? max(splitTop(of[1]).map(specificity)) : [0, 0, 0]);
      } else sp = add(sp, [0, 1, 0]);
    }
    else if (/[A-Za-z_-]/.test(c)) { const m = /^[\w-]+/.exec(s.slice(i)); sp = add(sp, [0, 0, 1]); i += m[0].length; }
    else i++;   // combinators, spaces, *, &
  }
  return sp;
}
export const spStr = (sp) => "(" + sp.join(",") + ")";
