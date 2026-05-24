'use strict';

import * as fs from 'fs';
import * as path from 'path';

export interface ImportOpts {
  source: string;
  destResearchDir: string;
  dryRun: boolean;
  force: boolean;
}

export function importKnowhow(opts: ImportOpts): { copied: string[]; skipped: string[] } {
  const { source, destResearchDir, dryRun, force } = opts;
  const copied: string[] = [];
  const skipped: string[] = [];

  if (!dryRun) fs.mkdirSync(destResearchDir, { recursive: true });

  const srcEntries = fs.readdirSync(source);
  for (const filename of srcEntries) {
    const srcFile = path.join(source, filename);
    const destFile = path.join(destResearchDir, filename);
    const destExists = fs.existsSync(destFile);

    if (destExists && !force && !dryRun) {
      skipped.push(filename);
      continue;
    }

    if (dryRun) {
      copied.push(destExists ? `(dry-run) would overwrite ${filename}` : `(dry-run) ${filename}`);
      continue;
    }

    fs.copyFileSync(srcFile, destFile);
    copied.push(filename);
  }

  return { copied, skipped };
}
