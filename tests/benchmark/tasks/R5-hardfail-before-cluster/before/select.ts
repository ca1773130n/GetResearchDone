'use strict';
// Selects a winning candidate. BUG: clusters ALL candidates (including
// DEAD-ENDS violators) THEN picks representatives, so a violator can become a
// cluster representative and eliminate clean near-duplicate siblings.
export interface Cand { id: number; score: number; hardFail: boolean; vocab: Set<string>; }

export function select(cands: Cand[], cluster: (v: Set<string>[]) => number[][]): number | null {
  const clusters = cluster(cands.map((c) => c.vocab));
  const reps: number[] = [];
  for (const members of clusters) {
    let rep = members[0];
    for (const m of members) if (cands[m].score > cands[rep].score) rep = m;
    reps.push(rep);
  }
  const viable = reps.filter((r) => !cands[r].hardFail);
  if (viable.length === 0) return null;
  let best = viable[0];
  for (const r of viable) if (cands[r].score > cands[best].score) best = r;
  return cands[best].id;
}
