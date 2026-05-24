'use strict';

import * as fs from 'fs';
import * as path from 'path';

/** Scan a phase directory for plan files (bare PLAN.md and prefixed forms). */
export function _collectPlans(phaseDir: string): string[] {
  try {
    return (fs.readdirSync(phaseDir) as string[])
      .filter((f) => f === 'PLAN.md' || /-PLAN\.md$/.test(f))
      .map((f) => path.join(phaseDir, f));
  } catch {
    return [];
  }
}
