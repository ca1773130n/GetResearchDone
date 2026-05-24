'use strict';
import * as fs from 'fs';
import * as path from 'path';
// Promotes the winning candidate to PLAN.md. Refuses to overwrite an existing
// resolved PLAN.md unless --force, so a human or prior selection is not lost.
export function promote(phaseDir: string, winnerContent: string, opts: { force?: boolean }): string {
  const planPath = path.join(phaseDir, 'PLAN.md');
  if (fs.existsSync(planPath) && !opts.force) {
    throw new Error(`${planPath} already exists. Refusing to overwrite a resolved plan. Use --force.`);
  }
  fs.writeFileSync(planPath, winnerContent);
  return planPath;
}
