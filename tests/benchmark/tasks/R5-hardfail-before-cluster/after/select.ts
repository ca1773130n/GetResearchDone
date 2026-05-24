'use strict';
// Selects a winning candidate. Hard-fail BEFORE clustering: violators are
// filtered first, so they are never clustermates and cannot eliminate clean
// siblings. Only survivors are clustered and scored.
export interface Cand { id: number; score: number; hardFail: boolean; vocab: Set<string>; }

export function select(cands: Cand[], cluster: (v: Set<string>[]) => number[][]): number | null {
  const survivors = cands.map((c, i) => i).filter((i) => !cands[i].hardFail);
  if (survivors.length === 0) return null;
  const clusters = cluster(survivors.map((i) => cands[i].vocab));
  const reps: number[] = [];
  for (const members of clusters) {
    const scoredIdx = members.map((p) => survivors[p]);
    let rep = scoredIdx[0];
    for (const m of scoredIdx) if (cands[m].score > cands[rep].score) rep = m;
    reps.push(rep);
  }
  let best = reps[0];
  for (const r of reps) if (cands[r].score > cands[best].score) best = r;
  return cands[best].id;
}
