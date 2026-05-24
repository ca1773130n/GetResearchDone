'use strict';
// Benjamini-Hochberg FDR adjustment. Returns q-values in the SAME order as the
// input, so callers can zip q back to items by index.
export function benjaminiHochberg(pvalues: number[]): number[] {
  const m = pvalues.length;
  if (m === 0) return [];
  const indexed = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array<number>(m);
  let prev = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = indexed[rank - 1];
    const raw = (p * m) / rank;
    prev = Math.min(prev, raw);
    q[i] = Math.min(1, prev);
  }
  return q;
}
