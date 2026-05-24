'use strict';

export function comparePhaseIds(a: string, b: string): number {
  const aParts = a.split('.').map((p) => parseInt(p, 10) || 0);
  const bParts = b.split('.').map((p) => parseInt(p, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const ai = aParts[i] ?? 0;
    const bi = bParts[i] ?? 0;
    if (ai !== bi) return ai > bi ? 1 : -1;
  }
  return 0;
}
