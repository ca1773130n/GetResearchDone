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

const fs = require('fs');
const path = require('path');

const PLANNING_DIR = path.join(process.cwd(), '.planning');

const DIRECTORIES = [
  '.planning',
  '.planning/milestones',
  '.planning/milestones/anonymous',
  '.planning/milestones/anonymous/phases',
  '.planning/milestones/anonymous/research',
  '.planning/milestones/anonymous/research/deep-dives',
  '.planning/milestones/anonymous/codebase',
  '.planning/milestones/anonymous/todos',
  '.planning/milestones/anonymous/quick',
];

const DEFAULT_CONFIG = {
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
  const cwd = process.cwd();
  for (const dir of DIRECTORIES) {
    const fullPath = path.join(cwd, dir);
    fs.mkdirSync(fullPath, { recursive: true });
  }

  // Create default config.json
  const configPath = path.join(PLANNING_DIR, 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  }

  console.log('GRD: Created .planning/ directory structure');
} catch (err) {
  // Never fail postinstall — print warning and exit cleanly
  process.stderr.write(`GRD postinstall warning: ${err.message}\n`);
  process.exit(0);
}
