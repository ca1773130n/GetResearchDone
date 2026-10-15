'use strict';
const fs = require('fs');

/**
 * Rows of one of the order's append-only ledgers. A crash mid-append can only ever damage the
 * LAST line, so that line is skipped with a warning naming the file: §13 promises that
 * re-running an order resumes from its ledgers, and one torn append must not wedge it forever.
 * A damaged line anywhere else was not written by a torn append, so it throws — naming the file
 * and the line — rather than silently dropping rows that count against a budget.
 */
function readJsonl<T>(file: string, warn: (m: string) => void = (m: string) => { process.stderr.write(m); }): T[] {
  if (!fs.existsSync(file)) return [];
  const lines = String(fs.readFileSync(file, 'utf8')).split('\n');
  const rows: T[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') continue;
    try {
      rows.push(JSON.parse(lines[i]) as T);
    } catch (e) {
      if (lines.slice(i + 1).some((l) => l !== '')) {
        throw new Error(`cannot read ${file}: line ${i + 1} is not valid JSON: ${(e as Error).message}`, { cause: e });
      }
      warn(`[factory] ${file}: the last line is truncated, probably by a crash mid-append; skipping it.\n`);
    }
  }
  return rows;
}

module.exports = { readJsonl };
