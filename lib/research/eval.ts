'use strict';
const fs = require('fs');
const path = require('path');
import type { ExperimentPlan, ExperimentResult, MeasureOutcome, ResearchThread } from './types';
const { atomicWriteFileSync } = require('../autopilot-waves') as {
  atomicWriteFileSync: (filePath: string, data: string) => void;
};

type SpawnFn = (prompt: string, agentType: string) => Promise<string>;

function readEvalReportConfig(cwd: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_eval_report?: unknown;
    };
    return raw.research_eval_report === true;
  } catch {
    return false;
  }
}

function parseEvalReport(stdout: string): string | null {
  const start = stdout.indexOf('__EVAL__');
  if (start === -1) return null;
  const end = stdout.indexOf('__END_EVAL__', start + '__EVAL__'.length);
  if (end === -1) return null;
  const body = stdout.slice(start + '__EVAL__'.length, end).trim();
  return body || null;
}

module.exports = { readEvalReportConfig, parseEvalReport };
