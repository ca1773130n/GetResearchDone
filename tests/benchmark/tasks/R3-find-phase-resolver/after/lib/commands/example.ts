'use strict';

import * as path from 'path';

const { findPhaseInternal }: {
  findPhaseInternal: (cwd: string, phase: string) => { found: boolean; directory: string } | null;
} = require('../utils');

export function cmdExample(cwd: string, phaseArg: string): void {
  const phaseInfo = findPhaseInternal(cwd, phaseArg);
  if (!phaseInfo || !phaseInfo.found) {
    throw new Error(`Phase not found: ${phaseArg}`);
  }
  const phaseDir = path.join(cwd, phaseInfo.directory);
  void phaseDir;
  // ... rest of command ...
}
