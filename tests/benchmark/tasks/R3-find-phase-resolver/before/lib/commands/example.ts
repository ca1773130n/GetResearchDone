'use strict';

import * as fs from 'fs';
import * as path from 'path';

export function cmdExample(cwd: string, phaseArg: string): void {
  const phasesBase = path.join(cwd, '.planning', 'phases');
  const phaseDir = path.join(phasesBase, phaseArg);
  if (!fs.existsSync(phaseDir)) {
    throw new Error(`Phase directory not found: ${phaseDir}`);
  }
  // ... rest of command ...
}
