
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

