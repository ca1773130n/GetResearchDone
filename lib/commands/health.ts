/** GRD Commands/Health -- Project health indicators and comprehensive health check operations */

'use strict';

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const {
  safeReadFile, loadConfig, output,
} = require('../utils') as {
  safeReadFile: (p: string) => string | null;
  loadConfig: (cwd: string) => Record<string, unknown> & { timeouts: Record<string, number> };
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
};
const {
  phasesDir: getPhasesDirPath, planningDir: getPlanningDir,
} = require('../paths') as {
  phasesDir: (cwd: string) => string;
  planningDir: (cwd: string) => string;
};
const { readCachedRoadmap, readCachedState } = require('./phase-info') as {
  readCachedRoadmap: (roadmapPath: string) => string | null;
  readCachedState: (statePath: string) => string | null;
};

// ─── Domain Types ────────────────────────────────────────────────────────────

interface DeferredItem {
  id: string;
  description: string;
  from_phase: number | null;
  validates_at: number | null;
  status: string;
}

interface VelocityData {
  total_plans: number;
  total_duration_min: number;
  avg_duration_min: number;
  recent_5_avg_min: number;
}

interface RiskEntry {
  risk: string;
  probability: string;
  impact: string;
  phase: string;
}

interface HealthResult {
  blockers: { count: number; items: string[] };
  deferred_validations: {
    total: number; pending: number; resolved: number; items: DeferredItem[];
  };
  velocity: VelocityData;
  stale_phases: string[];
  risks: RiskEntry[];
  baseline: { exists: boolean } | null;
}

interface HealthCheckResults {
  tests: { status: string; pass: number; fail: number; total: number };
  lint: { status: string; errors: number; warnings: number };
  format: { status: string; clean: boolean };
  consistency: { status: string; passed: boolean; errors?: number; warnings?: number };
}

// ─── CLI: Health ─────────────────────────────────────────────────────────────

/**
 * CLI command: Display project health indicators including blockers, deferred
 * validations, velocity, and risks.
 */
function cmdHealth(cwd: string, raw: boolean): void {
  const statePath = path.join(getPlanningDir(cwd), 'STATE.md');
  const roadmapPath = path.join(getPlanningDir(cwd), 'ROADMAP.md');
  const baselinePath = path.join(getPlanningDir(cwd), 'BASELINE.md');
  const stateContent = readCachedState(statePath) || '';
  const roadmapContent = readCachedRoadmap(roadmapPath) || '';
  const baselineContent: string = safeReadFile(baselinePath) || '';

  // 1. Parse blockers
  const blockerItems: string[] = [];
  const blockersSection = stateContent.match(/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (blockersSection) {
    const items = blockersSection[1].match(/^-\s+(.+)$/gm) || [];
    for (const item of items) {
      const text = (item as string).replace(/^-\s+/, '').trim();
      if (text.toLowerCase() !== 'none' && text.toLowerCase() !== 'none.') {
        blockerItems.push(text);
      }
    }
  }

  // 2. Parse deferred validations
  const deferredItems: DeferredItem[] = [];
  let deferredTotal = 0;
  let deferredPending = 0;
  let deferredResolved = 0;
  const deferredSection = stateContent.match(/##\s*Deferred Validations\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (deferredSection) {
    const tableRows = deferredSection[1]
      .split('\n')
      .filter((r: string) => r.startsWith('|') && !r.match(/^\|[\s-]+\|/) && !r.match(/^\|\s*ID\s*\|/i));
    for (const row of tableRows) {
      const cells = (row as string).split('|').map((c: string) => c.trim()).filter(Boolean);
      if (cells.length >= 5) {
        const id = cells[0];
        const description = cells[1];
        const fromPhaseMatch = cells[2].match(/(\d+)/);
        const fromPhase = fromPhaseMatch ? parseInt(fromPhaseMatch[1], 10) : null;
        const validatesAtMatch = cells[3].match(/(\d+)/);
        const validatesAt = validatesAtMatch ? parseInt(validatesAtMatch[1], 10) : null;
        const statusRaw = cells[4];
        const isPending = /PENDING/i.test(statusRaw);
        const status = isPending ? 'PENDING' : 'RESOLVED';

        deferredTotal++;
        if (isPending) deferredPending++;
        else deferredResolved++;

        deferredItems.push({ id, description, from_phase: fromPhase, validates_at: validatesAt, status });
      }
    }
  }

  // 3. Parse performance metrics for velocity
  const velocityData: VelocityData = {
    total_plans: 0, total_duration_min: 0, avg_duration_min: 0, recent_5_avg_min: 0,
  };
  const metricsSection = stateContent.match(/##\s*Performance Metrics\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (metricsSection) {
    const metricRows = metricsSection[1]
      .split('\n')
      .filter((r: string) => r.startsWith('|') && !r.match(/^\|[\s-]+\|/) && !r.match(/^\|\s*Phase/i));
    const durations: number[] = [];
    for (const row of metricRows) {
      const cells = (row as string).split('|').map((c: string) => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        const durMatch = cells[1].match(/(\d+)\s*min/i);
        if (durMatch) { durations.push(parseInt(durMatch[1], 10)); }
      }
    }

    velocityData.total_plans = durations.length;
    velocityData.total_duration_min = durations.reduce((sum, d) => sum + d, 0);
    velocityData.avg_duration_min = durations.length > 0
      ? Math.round((velocityData.total_duration_min / durations.length) * 10) / 10 : 0;
    const recent5 = durations.slice(-5);
    velocityData.recent_5_avg_min = recent5.length > 0
      ? Math.round((recent5.reduce((sum, d) => sum + d, 0) / recent5.length) * 10) / 10 : 0;
  }

  // 4. Check for stale phases (phases with plans but no summaries)
  const stalePhases: string[] = [];
  const phasesDir = getPhasesDirPath(cwd) as string;
  try {
    const entries: { isDirectory: () => boolean; name: string }[] =
      fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    for (const dir of dirs) {
      const phaseFiles: string[] = fs.readdirSync(path.join(phasesDir, dir));
      const planCount = phaseFiles.filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaryCount = phaseFiles.filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
      if (planCount > 0 && summaryCount === 0) {
        stalePhases.push(dir);
      }
    }
  } catch { /* Phases directory may not exist; skip stale phase check */ }

  // 5. Parse risk register from ROADMAP.md
  const risks: RiskEntry[] = [];
  const riskSection = roadmapContent.match(/##\s*Risk Register\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (riskSection) {
    const riskRows = riskSection[1]
      .split('\n')
      .filter((r: string) => r.startsWith('|') && !r.match(/^\|[\s-]+\|/) && !r.match(/^\|\s*Risk\s*\|/i));
    for (const row of riskRows) {
      const cells = (row as string).split('|').map((c: string) => c.trim()).filter(Boolean);
      if (cells.length >= 4) {
        risks.push({
          risk: cells[0], probability: cells[1],
          impact: cells[2], phase: cells.length >= 5 ? cells[4] : cells[3],
        });
      }
    }
  }

  // 6. Parse baseline
  let baseline: { exists: boolean } | null = null;
  if (baselineContent) { baseline = { exists: true }; }

  const result: HealthResult = {
    blockers: { count: blockerItems.length, items: blockerItems },
    deferred_validations: { total: deferredTotal, pending: deferredPending, resolved: deferredResolved, items: deferredItems },
    velocity: velocityData,
    stale_phases: stalePhases,
    risks,
    baseline,
  };

  // TUI rendering
  let tui = '# Project Health\n\n';

  // Blockers
  tui += '## Blockers\n';
  if (blockerItems.length === 0) { tui += 'None \u2713\n'; }
  else { for (const b of blockerItems) { tui += `\u2717 ${b}\n`; } }

  // Deferred validations
  tui += `\n## Deferred Validations (${deferredPending} pending / ${deferredTotal} total)\n`;
  const pending = deferredItems.filter((d) => d.status === 'PENDING');
  const resolved = deferredItems.filter((d) => d.status === 'RESOLVED');
  for (const d of pending) {
    tui += `\u25CB ${d.id}: ${d.description} [Phase ${d.from_phase} \u2192 Phase ${d.validates_at}]\n`;
  }
  for (const d of resolved) {
    tui += `\u2713 ${d.id}: ${d.description} [RESOLVED]\n`;
  }

  // Velocity
  tui += '\n## Velocity\n';
  tui += `Average plan duration: ${velocityData.avg_duration_min} min (${velocityData.total_plans} plans)\n`;
  tui += `Recent 5 plans: ${velocityData.recent_5_avg_min} min avg\n`;

  // Stale phases
  tui += '\n## Stale Phases\n';
  if (stalePhases.length === 0) { tui += 'None \u2713\n'; }
  else { for (const s of stalePhases) { tui += `\u26A0 ${s}\n`; } }

  // Risk register
  if (risks.length > 0) {
    tui += `\n## Risk Register (${risks.length} risks)\n`;
    tui += '| Risk                                  | Prob   | Impact   | Phase   |\n';
    tui += '|---------------------------------------|--------|----------|--------|\n';
    for (const r of risks) {
      const riskText = r.risk.length > 39 ? r.risk.substring(0, 36) + '...' : r.risk;
      tui += `| ${riskText.padEnd(39)} | ${r.probability.padEnd(6)} | ${r.impact.padEnd(8)} | ${r.phase.padEnd(7)} |\n`;
    }
  }

  if (!raw && tui) {
    output(result, true, tui);
    return;
  }
  output(result, raw, tui);
}

// ─── CLI: Health Check ──────────────────────────────────────────────────────

/**
 * CLI command: Run comprehensive project health checks (tests, lint, format, consistency).
 * Consolidates 4 separate checks into one structured result.
 */
function cmdHealthCheck(cwd: string, options: { fix?: boolean }, raw: boolean): void {
  const fix = options.fix || false;
  const config = loadConfig(cwd);
  const results: HealthCheckResults = {
    tests: { status: 'unknown', pass: 0, fail: 0, total: 0 },
    lint: { status: 'unknown', errors: 0, warnings: 0 },
    format: { status: 'unknown', clean: false },
    consistency: { status: 'unknown', passed: false },
  };

  // 1. Run tests
  try {
    const testOut: string = child_process.execFileSync('npx', ['jest', '--silent', '--forceExit'], {
      cwd, encoding: 'utf-8', timeout: config.timeouts.jest_ms, stdio: 'pipe',
    });
    const summaryMatch = testOut.match(/Tests:\s+(\d+) passed,\s+(\d+) total/);
    if (summaryMatch) {
      results.tests.pass = parseInt(summaryMatch[1], 10);
      results.tests.total = parseInt(summaryMatch[2], 10);
    }
    results.tests.status = 'pass';
  } catch (e: unknown) {
    results.tests.status = 'fail';
    const err = e as { stdout?: string };
    const failMatch = err.stdout?.match(/Tests:\s+(\d+) failed,\s+(\d+) passed,\s+(\d+) total/);
    if (failMatch) {
      results.tests.fail = parseInt(failMatch[1], 10);
      results.tests.pass = parseInt(failMatch[2], 10);
      results.tests.total = parseInt(failMatch[3], 10);
    }
  }

  // 2. Run lint (with optional --fix)
  try {
    const lintArgs = fix
      ? ['eslint', 'bin/', 'lib/', '--fix', '--format=json']
      : ['eslint', 'bin/', 'lib/', '--format=json'];
    const lintOut: string = child_process.execFileSync('npx', lintArgs, {
      cwd, encoding: 'utf-8', timeout: config.timeouts.lint_ms, stdio: 'pipe',
    });
    const lintData = JSON.parse(lintOut) as { errorCount: number; warningCount: number }[];
    const totals = lintData.reduce(
      (acc, f) => ({ errors: acc.errors + f.errorCount, warnings: acc.warnings + f.warningCount }),
      { errors: 0, warnings: 0 }
    );
    results.lint = { status: totals.errors === 0 ? 'pass' : 'fail', ...totals };
  } catch (e: unknown) {
    results.lint.status = 'fail';
    try {
      const err = e as { stdout?: string };
      const lintData = JSON.parse(err.stdout || '[]') as { errorCount: number; warningCount: number }[];
      const totals = lintData.reduce(
        (acc, f) => ({ errors: acc.errors + f.errorCount, warnings: acc.warnings + f.warningCount }),
        { errors: 0, warnings: 0 }
      );
      results.lint = { status: 'fail', ...totals };
    } catch {
      results.lint = { status: 'error', errors: -1, warnings: -1 };
    }
  }

  // 3. Run format check (with optional --write)
  try {
    if (fix) {
      child_process.execFileSync('npx', ['prettier', '--write', 'lib/', 'bin/'], {
        cwd, encoding: 'utf-8', timeout: config.timeouts.format_ms, stdio: 'pipe',
      });
    }
    child_process.execFileSync('npx', ['prettier', '--check', 'lib/', 'bin/'], {
      cwd, encoding: 'utf-8', timeout: config.timeouts.format_ms, stdio: 'pipe',
    });
    results.format = { status: 'pass', clean: true };
  } catch {
    results.format = { status: 'fail', clean: false };
  }

  // 4. Run consistency validation
  try {
    const consOut: string = child_process.execFileSync(
      'node', ['bin/grd-tools.js', 'validate', 'consistency'],
      { cwd, encoding: 'utf-8', timeout: config.timeouts.consistency_ms, stdio: 'pipe' }
    );
    const consData = JSON.parse(consOut) as { passed: boolean; errors?: unknown[]; warning_count?: number };
    results.consistency = {
      status: consData.passed ? 'pass' : 'fail',
      passed: consData.passed,
      errors: consData.errors?.length || 0,
      warnings: consData.warning_count || 0,
    };
  } catch {
    results.consistency = { status: 'error', passed: false, errors: -1, warnings: -1 };
  }

  const allPass = Object.values(results).every((r) => r.status === 'pass');
  output({ healthy: allPass, fix_applied: fix, ...results }, raw,
    allPass ? 'All checks pass' : 'Issues found');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  cmdHealth,
  cmdHealthCheck,
};
