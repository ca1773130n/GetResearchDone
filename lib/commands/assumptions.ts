'use strict';

/** GRD Commands/Assumptions -- Pre-execution stale assumption detection and validation */

const fs = require('fs');
const path = require('path');

const {
  safeReadFile,
  output,
  error,
  execGit,
}: {
  safeReadFile: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  execGit: (cwd: string, args: string[], opts?: { allowBlocked?: boolean }) => { exitCode: number; stdout: string; stderr: string };
} = require('../utils');
const {
  phasesDir: getPhasesDirPath,
}: {
  phasesDir: (cwd: string) => string;
} = require('../paths');

// ─── Domain Types ─────────────────────────────────────────────────────────────

interface AssumptionEntry {
  text: string;
  source_file: string;
}

interface AssumptionValidationResult {
  assumption: string;
  source_file: string;
  potentially_stale: boolean;
  reason: string;
}

interface CheckAssumptionsResult {
  phase: string;
  assumptions_found: number;
  stale_count: number;
  clean_count: number;
  results: AssumptionValidationResult[];
  git_diff_lines: number;
  skipped: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract ## Assumptions sections from plan markdown files. */
function parseAssumptions(planPaths: string[]): AssumptionEntry[] {
  const entries: AssumptionEntry[] = [];
  for (const planPath of planPaths) {
    const content = safeReadFile(planPath);
    if (!content) continue;
    const match = content.match(/##\s+Assumptions?\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (!match) continue;
    for (const line of match[1].split('\n')) {
      const trimmed = line.replace(/^[-*]\s+/, '').trim();
      if (trimmed && trimmed.length > 5) {
        entries.push({ text: trimmed, source_file: path.basename(planPath) });
      }
    }
  }
  return entries;
}

/**
 * Validate whether assumptions may be stale by checking them against a git diff.
 * Flags assumptions that reference files, functions, or exports mentioned in the diff.
 */
function validateAssumptionsFreshness(
  assumptions: AssumptionEntry[],
  gitDiff: string
): AssumptionValidationResult[] {
  const changedFiles = new Set<string>();
  const changedSymbols = new Set<string>();

  for (const line of gitDiff.split('\n')) {
    const fileMatch = line.match(/^(?:\+\+\+|---)\s+[ab]\/(.+)/);
    if (fileMatch) {
      changedFiles.add(path.basename(fileMatch[1]));
      changedFiles.add(path.basename(fileMatch[1], path.extname(fileMatch[1])));
    }
    if (line.startsWith('+') || line.startsWith('-')) {
      const content = line.slice(1);
      for (const m of content.matchAll(/\b(?:function|export|const|class)\s+(\w+)/g)) {
        changedSymbols.add(m[1]);
      }
      for (const m of content.matchAll(/require\(['"]([^'"]+)['"]\)|from\s+['"]([^'"]+)['"]/g)) {
        const mod = m[1] || m[2];
        if (mod) changedSymbols.add(path.basename(mod, path.extname(mod)));
      }
    }
  }

  return assumptions.map((assumption) => {
    const lower = assumption.text.toLowerCase();
    const matchedFile = Array.from(changedFiles).find((f) => lower.includes(f.toLowerCase()));
    const matchedSymbol = Array.from(changedSymbols).find(
      (s) => s.length > 3 && lower.includes(s.toLowerCase())
    );

    if (matchedFile || matchedSymbol) {
      return {
        assumption: assumption.text,
        source_file: assumption.source_file,
        potentially_stale: true,
        reason: matchedFile
          ? `References "${matchedFile}" which changed in recent commits`
          : `References symbol "${matchedSymbol}" which changed in recent commits`,
      };
    }
    return {
      assumption: assumption.text,
      source_file: assumption.source_file,
      potentially_stale: false,
      reason: 'No conflicts detected in recent git diff',
    };
  });
}

// ─── CLI: Check Assumptions ───────────────────────────────────────────────────

/**
 * CLI command: Parse assumptions from phase plan files and validate them against
 * recent git history. Surfaces potentially stale assumptions as pre-execution warnings.
 * @param cwd - Project root
 * @param phase - Phase number string
 * @param raw - Raw output flag
 * @param skipCheck - If true, skip validation and just list assumptions
 */
function cmdCheckAssumptions(cwd: string, phase: string, raw: boolean, skipCheck = false): void {
  if (!phase) {
    error('Phase number required');
    return;
  }

  const phasesPath = getPhasesDirPath(cwd);
  const normalized = phase.padStart(2, '0');
  let phaseDir: string | null = null;
  try {
    const entries: { isDirectory: () => boolean; name: string }[] = fs.readdirSync(phasesPath, {
      withFileTypes: true,
    });
    const match = entries.find(
      (e: { isDirectory: () => boolean; name: string }) =>
        e.isDirectory() &&
        (e.name.startsWith(normalized + '-') || e.name.startsWith(phase + '-'))
    );
    phaseDir = match ? path.join(phasesPath, match.name) : null;
  } catch {
    /* phases dir may not exist */
  }

  if (!phaseDir) {
    output(
      { error: `Phase ${phase} directory not found`, phase, assumptions_found: 0, stale_count: 0, clean_count: 0, results: [], skipped: false },
      raw,
      `Phase ${phase} not found`
    );
    return;
  }

  let planFiles: string[] = [];
  try {
    // Codex r8 P2: include bare `PLAN.md` alongside `*-PLAN.md` so
    // single-plan phases are not silently skipped.
    planFiles = (fs.readdirSync(phaseDir) as string[])
      .filter((f: string) => f === 'PLAN.md' || f.endsWith('-PLAN.md'))
      .map((f: string) => path.join(phaseDir!, f));
  } catch {
    /* ignore */
  }

  const assumptions = parseAssumptions(planFiles);

  if (assumptions.length === 0) {
    const result: CheckAssumptionsResult = {
      phase, assumptions_found: 0, stale_count: 0, clean_count: 0,
      results: [], git_diff_lines: 0, skipped: false,
    };
    output(result, raw, `Phase ${phase}: no assumptions found in plan files`);
    return;
  }

  if (skipCheck) {
    const result: CheckAssumptionsResult = {
      phase,
      assumptions_found: assumptions.length,
      stale_count: 0,
      clean_count: assumptions.length,
      results: assumptions.map((a) => ({
        assumption: a.text,
        source_file: a.source_file,
        potentially_stale: false,
        reason: 'Skipped (--skip-assumption-check)',
      })),
      git_diff_lines: 0,
      skipped: true,
    };
    output(result, raw, `Phase ${phase}: assumption check skipped (${assumptions.length} assumptions)`);
    return;
  }

  // Use execGit (whitelisted) to get recent diff for staleness detection
  const diffResult = execGit(cwd, ['diff', 'HEAD~5', '--'], { allowBlocked: false });
  const gitDiff = diffResult.exitCode === 0 ? diffResult.stdout : '';
  const diffLines = gitDiff ? gitDiff.split('\n').length : 0;

  const validationResults = validateAssumptionsFreshness(assumptions, gitDiff);
  const staleCount = validationResults.filter((r) => r.potentially_stale).length;

  const result: CheckAssumptionsResult = {
    phase,
    assumptions_found: assumptions.length,
    stale_count: staleCount,
    clean_count: assumptions.length - staleCount,
    results: validationResults,
    git_diff_lines: diffLines,
    skipped: false,
  };

  const rawMsg =
    staleCount > 0
      ? `Phase ${phase}: ${staleCount} potentially stale assumption(s) — review before executing`
      : `Phase ${phase}: all ${assumptions.length} assumption(s) look fresh`;
  output(result, raw, rawMsg);
}

module.exports = { parseAssumptions, validateAssumptionsFreshness, cmdCheckAssumptions };
