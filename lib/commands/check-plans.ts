'use strict';

/** GRD Commands/CheckPlans -- Validate plan files for stale file paths */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  output,
  error,
  findPhaseInternal,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (msg: string) => never;
  findPhaseInternal: (cwd: string, phase: string) => import('../types').PhaseInfo | null;
} = require('../utils');

const {
  phasesDir: getPhasesDirPath,
}: {
  phasesDir: (cwd: string, milestone?: string | null) => string;
} = require('../paths');

interface PlanFileIssue {
  path: string;
  status: 'missing' | 'found';
}

interface PlanCheckResult {
  plan_file: string;
  plan_path: string;
  missing_count: number;
  issues: PlanFileIssue[];
}

interface CheckPlansResult {
  phase?: string;
  plans_checked: number;
  total_missing: number;
  plan_results: PlanCheckResult[];
}

function _extractFilePaths(content: string): string[] {
  const paths: string[] = [];
  const filesSectionMatch = content.search(/^##\s*Files?\b/im);
  if (filesSectionMatch === -1) return paths;

  const afterSection = content.slice(filesSectionMatch);
  const newlineIdx = afterSection.indexOf('\n');
  const rest = newlineIdx === -1 ? afterSection : afterSection.slice(newlineIdx + 1);
  const nextSectionMatch = rest.search(/^##\s+/m);
  const section = nextSectionMatch === -1 ? rest : rest.slice(0, nextSectionMatch);

  const lineRe = /^[-*]\s+\*{0,2}([^\s*`(]+\.[a-zA-Z0-9]+)\*{0,2}/gm;
  let m;
  while ((m = lineRe.exec(section)) !== null) {
    const p = m[1].trim();
    if (p && !p.startsWith('http') && p.includes('.')) {
      paths.push(p);
    }
  }
  return paths;
}

function _checkPlanFile(cwd: string, planFilePath: string): PlanCheckResult {
  let content: string;
  try {
    content = fs.readFileSync(planFilePath, 'utf-8');
  } catch {
    return {
      plan_file: path.basename(planFilePath),
      plan_path: path.relative(cwd, planFilePath),
      missing_count: 0,
      issues: [],
    };
  }

  const filePaths = _extractFilePaths(content);
  const issues: PlanFileIssue[] = filePaths.map((p) => {
    const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
    return { path: p, status: fs.existsSync(abs) ? 'found' : 'missing' };
  });

  return {
    plan_file: path.basename(planFilePath),
    plan_path: path.relative(cwd, planFilePath),
    missing_count: issues.filter((i) => i.status === 'missing').length,
    issues,
  };
}

/**
 * CLI command: Validate plan files for stale (non-existent) file path references.
 */
function cmdCheckPlans(
  cwd: string,
  options: { phase?: string | null; milestone?: string | null },
  raw: boolean
): void {
  const phasesBase = getPhasesDirPath(cwd, options.milestone ?? null);

  let planFiles: string[] = [];

  if (options.phase) {
    // Codex r13 P2: when --milestone is explicit, look up the phase
    // inside that milestone's phases dir instead of letting
    // findPhaseInternal default to the current milestone.
    let phaseDir: string | null = null;
    if (options.milestone) {
      const padded = /^\d+$/.test(options.phase) ? options.phase.padStart(2, '0') : options.phase;
      try {
        const match = (fs.readdirSync(phasesBase) as string[]).find(
          (d: string) =>
            d === options.phase || d === padded ||
            d.startsWith(`${options.phase}-`) || d.startsWith(`${padded}-`)
        );
        if (match) phaseDir = path.join(phasesBase, match);
      } catch { /* fall through */ }
      if (!phaseDir) {
        error(`Phase ${options.phase} not found in milestone ${options.milestone}`);
      }
    } else {
      const phaseInfo = findPhaseInternal(cwd, options.phase);
      if (!phaseInfo || !phaseInfo.found) {
        error(`Phase ${options.phase} not found`);
      }
      phaseDir = path.join(cwd, (phaseInfo as import('../types').PhaseInfo).directory);
    }
    try {
      planFiles = (fs.readdirSync(phaseDir!) as string[])
        .filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md')
        .map((f: string) => path.join(phaseDir!, f));
    } catch {
      error(`Cannot read phase directory: ${phaseDir}`);
    }
  } else {
    try {
      const phaseDirs = (
        fs.readdirSync(phasesBase, { withFileTypes: true }) as import('fs').Dirent[]
      )
        .filter((e) => e.isDirectory())
        .map((e) => path.join(phasesBase, e.name));
      for (const pd of phaseDirs) {
        try {
          const files = (fs.readdirSync(pd) as string[])
            .filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md')
            .map((f: string) => path.join(pd, f));
          planFiles.push(...files);
        } catch {
          // skip unreadable phase dir
        }
      }
    } catch {
      // phasesBase doesn't exist
    }
  }

  const planResults: PlanCheckResult[] = planFiles.map((f) => _checkPlanFile(cwd, f));
  const totalMissing = planResults.reduce((s, r) => s + r.missing_count, 0);

  const result: CheckPlansResult = {
    ...(options.phase ? { phase: options.phase } : {}),
    plans_checked: planFiles.length,
    total_missing: totalMissing,
    plan_results: planResults.filter((r) => r.missing_count > 0 || planFiles.length <= 5),
  };

  if (raw) {
    const lines = [`Plan check: ${planFiles.length} plan(s), ${totalMissing} stale path(s)`];
    for (const r of planResults) {
      if (r.missing_count > 0) {
        lines.push(`  ${r.plan_file}: ${r.missing_count} missing`);
        for (const issue of r.issues.filter((i) => i.status === 'missing')) {
          lines.push(`    x ${issue.path}`);
        }
      }
    }
    if (totalMissing === 0) lines.push('  All file references valid.');
    output(result, raw, lines.join('\n'));
  } else {
    output(result, raw, `${planFiles.length} plans, ${totalMissing} missing paths`);
  }
}

module.exports = { cmdCheckPlans };
