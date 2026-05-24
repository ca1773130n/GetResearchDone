'use strict';
// Benjamini-Hochberg FDR adjustment. BUG: returns q-values in SORTED order,
// not the caller's input order — so the caller, which zips q back to tokens
// by index, attaches the wrong q-value to each token.
export function benjaminiHochberg(pvalues: number[]): number[] {
  const m = pvalues.length;
  if (m === 0) return [];
  const sorted = [...pvalues].sort((a, b) => a - b);
  const q: number[] = [];
  let prev = 1;
  for (let rank = m; rank >= 1; rank--) {
    const raw = (sorted[rank - 1] * m) / rank;
    prev = Math.min(prev, raw);
    q[rank - 1] = Math.min(1, prev);
  }
  return q; // sorted order — WRONG for index-based callers
}
