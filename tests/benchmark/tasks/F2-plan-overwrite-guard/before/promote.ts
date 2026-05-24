'use strict';
import * as fs from 'fs';
import * as path from 'path';
// Promotes the winning candidate to PLAN.md. BUG: clobbers an existing
// resolved PLAN.md with no guard — a human-edited or prior selection is lost.
export function promote(phaseDir: string, winnerContent: string, _opts: { force?: boolean }): string {
  const planPath = path.join(phaseDir, 'PLAN.md');
  fs.writeFileSync(planPath, winnerContent);
  return planPath;
}
