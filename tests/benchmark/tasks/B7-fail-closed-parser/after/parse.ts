'use strict';
// Parses marker-fenced PLAN blocks. Fails CLOSED: returns ok only when exactly
// expectedN blocks are present with indices covering 1..N and no duplicates.
export interface Block { index: number; content: string; }
export type ParseResult =
  | { ok: true; blocks: Block[] }
  | { ok: false; reason: string };

export function parseCandidates(text: string, expectedN: number): ParseResult {
  if (expectedN < 1) return { ok: false, reason: 'expectedN must be >= 1' };
  const blocks: Block[] = [];
  const re = /<<<PLAN-(\d+)>>>\n([\s\S]*?)\n<<<\/PLAN-\1>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ index: parseInt(m[1], 10), content: m[2] });
  }
  if (blocks.length !== expectedN) {
    return { ok: false, reason: `expected ${expectedN} blocks, found ${blocks.length}` };
  }
  const seen = new Set<number>();
  for (const b of blocks) {
    if (seen.has(b.index)) return { ok: false, reason: `duplicate PLAN-${b.index}` };
    seen.add(b.index);
  }
  for (let i = 1; i <= expectedN; i++) {
    if (!seen.has(i)) return { ok: false, reason: `missing PLAN-${i}` };
  }
  blocks.sort((a, b) => a.index - b.index);
  return { ok: true, blocks };
}
