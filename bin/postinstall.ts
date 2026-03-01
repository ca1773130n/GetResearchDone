#!/usr/bin/env node
/**
 * GRD Post-install Script
 *
 * Creates the .planning/ directory structure and default config.json
 * when not already present. Idempotent: does nothing if .planning/ exists.
 *
 * This script MUST never fail — postinstall failures block npm install.
 * All errors are caught and printed to stderr; exit code is always 0.
 */

'use strict';

import fs from 'fs';
import path from 'path';

const PLANNING_DIR: string = path.join(process.cwd(), '.planning');

const DIRECTORIES: readonly string[] = [
  '.planning',
  '.planning/milestones',
  '.planning/milestones/anonymous',
  '.planning/milestones/anonymous/phases',
  '.planning/milestones/anonymous/research',
  '.planning/milestones/anonymous/research/deep-dives',
  '.planning/milestones/anonymous/codebase',
  '.planning/milestones/anonymous/todos',
  '.planning/milestones/anonymous/quick',
] as const;

interface DefaultConfig {
  model_profile: string;
  commit_docs: boolean;
  autonomous_mode: boolean;
  research_gates: Record<string, never>;
  confirmation_gates: Record<string, never>;
  eval_config: {
    default_metrics: string[];
    baseline_tracking: boolean;
  };
}

const DEFAULT_CONFIG: DefaultConfig = {
  model_profile: 'balanced',
  commit_docs: true,
  autonomous_mode: false,
  research_gates: {},
  confirmation_gates: {},
  eval_config: {
    default_metrics: ['test_coverage_pct', 'lint_error_count'],
    baseline_tracking: true,
  },
};

try {
  // Idempotency: if .planning/ already exists, exit silently
  if (fs.existsSync(PLANNING_DIR)) {
    process.exit(0);
  }

  // Create all directories
  const cwd: string = process.cwd();
  for (const dir of DIRECTORIES) {
    const fullPath: string = path.join(cwd, dir);
    fs.mkdirSync(fullPath, { recursive: true });
  }

  // Create default config.json
  const configPath: string = path.join(PLANNING_DIR, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n'
    );
  }

  console.log('GRD: Created .planning/ directory structure');
} catch (err: unknown) {
  // Never fail postinstall — print warning and exit cleanly
  process.stderr.write(
    `GRD postinstall warning: ${(err as Error).message}\n`
  );
  process.exit(0);
}
