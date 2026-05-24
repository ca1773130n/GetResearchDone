'use strict';

export function comparePhaseIds(a: string, b: string): number {
  const diff = parseFloat(a) - parseFloat(b);
  if (diff > 0) return 1;
  if (diff < 0) return -1;
  return 0;
}
