'use strict';
// Parses marker-fenced PLAN blocks. BUG: fails OPEN — on a count mismatch it
// returns whatever blocks it found, so a malformed planner response silently
// writes the wrong number of PLAN files.
export interface Block { index: number; content: string; }

export function parseCandidates(text: string, expectedN: number): Block[] {
  const blocks: Block[] = [];
  const re = /<<<PLAN-(\d+)>>>\n([\s\S]*?)\n<<<\/PLAN-\1>>>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ index: parseInt(m[1], 10), content: m[2] });
  }
  return blocks; // no count/coverage validation — fails open
}
