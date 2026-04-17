'use strict';

/**
 * GRD Autopilot/Waves -- Wave-splitting algorithm, write-intent file analysis,
 * and merge queue helpers. Extracted from lib/autopilot.ts as part of the
 * post-gsd-2 decomposition.
 *
 * No dependencies on other autopilot modules — these helpers are pure-ish
 * (file I/O for atomic writes, but no orchestration logic).
 */

import type {
  DependencyGraph,
  PlanArtifact,
  ArtifactDAG,
  ArtifactDAGValidation,
} from './types';

const {
  buildDependencyGraph,
  computeParallelGroups,
  buildArtifactDAG,
  validateArtifactDAG,
}: {
  buildDependencyGraph: (
    phases: Array<{ number: string; name: string; depends_on?: string | null }>
  ) => DependencyGraph;
  computeParallelGroups: (graph: DependencyGraph) => string[][];
  buildArtifactDAG: (plans: PlanArtifact[]) => ArtifactDAG;
  validateArtifactDAG: (dag: ArtifactDAG, plans: PlanArtifact[]) => ArtifactDAGValidation;
} = require('./deps');

const fs = require('fs');

// ─── Atomic File I/O ─────────────────────────────────────────────────────────

/**
 * Write a file atomically using write-to-temp-then-rename.
 * Prevents partial reads under concurrent access (POSIX rename is atomic).
 */
function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath: string = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, filePath);
}

// ─── Merge Queue ────────────────────────────────────────────────────────────

interface MergeQueue {
  enqueue<T>(fn: () => Promise<T>): Promise<T>;
}

function createMergeQueue(): MergeQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    enqueue<T>(fn: () => Promise<T>): Promise<T> {
      const result = tail.then(() => fn());
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
}

// ─── Write-Intent Analysis ────────────────────────────────────────────────────

/**
 * Parse the `files_modified` field from PLAN.md frontmatter content.
 * Supports two YAML formats:
 *   - Dash-list: `files_modified:\n  - lib/foo.ts\n  - lib/bar.ts`
 *   - Inline array: `files_modified: [lib/foo.ts, lib/bar.ts]`
 *
 * @param frontmatterContent - Raw string between the `---` markers of a PLAN.md
 * @returns Array of file path strings declared as write targets, or [] if not present
 */
function parseWriteIntent(frontmatterContent: string): string[] {
  if (!frontmatterContent || frontmatterContent.trim() === '') return [];

  // Try inline array format: files_modified: [lib/foo.ts, lib/bar.ts]
  const inlineMatch = frontmatterContent.match(/^files_modified:\s*\[([^\]]*)\]\s*$/m);
  if (inlineMatch) {
    const inner = inlineMatch[1].trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  // Try dash-list format: capture indented lines until a non-indented line or end of string
  const fmLines = frontmatterContent.split('\n');
  const startIdx = fmLines.findIndex((l: string) => /^files_modified:\s*$/.test(l));
  if (startIdx >= 0) {
    const items: string[] = [];
    for (let i = startIdx + 1; i < fmLines.length; i++) {
      const line = fmLines[i];
      if (/^\S/.test(line)) break; // next field
      const dashMatch = line.match(/^[ \t]+-[ \t]+(.+)$/);
      if (dashMatch) {
        const val = dashMatch[1].trim();
        if (val) items.push(val);
      }
    }
    return items;
  }

  return [];
}

/**
 * Comparison result from `compareWriteIntent()`.
 */
interface WriteIntentComparison {
  unexpected: string[]; // Files modified but not declared
  untouched: string[]; // Files declared but not modified
  matches: string[]; // Files both declared and modified
}

/**
 * Compare declared write-intent files against actually-modified files.
 * Pure function — no side effects.
 *
 * @param declared - File paths listed in `files_modified` frontmatter
 * @param actual   - File paths from `git diff --name-only`
 * @returns Categorized comparison result
 */
function compareWriteIntent(declared: string[], actual: string[]): WriteIntentComparison {
  const declaredSet = new Set(declared);
  const actualSet = new Set(actual);

  const matches = declared.filter((f) => actualSet.has(f));
  const untouched = declared.filter((f) => !actualSet.has(f));
  const unexpected = actual.filter((f) => !declaredSet.has(f));

  return { unexpected, untouched, matches };
}

/**
 * Format write-intent comparison results as log lines with `[WRITE-INTENT-MISMATCH]` prefix.
 * Returns empty array when no mismatches.
 *
 * @param planId     - The plan identifier (e.g. "89-03")
 * @param comparison - Result from `compareWriteIntent()`
 * @returns Array of formatted log lines
 */
function formatWriteIntentMismatch(planId: string, comparison: WriteIntentComparison): string[] {
  const lines: string[] = [];
  for (const f of comparison.unexpected) {
    lines.push(`[WRITE-INTENT-MISMATCH] Plan ${planId}: unexpected file modified: ${f}`);
  }
  for (const f of comparison.untouched) {
    lines.push(`[WRITE-INTENT-MISMATCH] Plan ${planId}: declared file not modified: ${f}`);
  }
  return lines;
}

// ─── Wave Splitting ───────────────────────────────────────────────────────────

/**
 * Options for buildWaves() — controls write-intent conflict detection.
 */
interface BuildWavesOptions {
  /** Map of phaseNumber -> files_modified list, used for conflict detection. */
  filesModified?: Record<string, string[]>;
  /** When true, skip conflict detection entirely (--force-parallel). */
  forceParallel?: boolean;
}

/**
 * Group phases into dependency waves using Kahn's algorithm.
 * Phases with no dependencies land in wave 0; phases depending on wave-0
 * phases land in wave 1, etc.
 *
 * When `options.filesModified` is provided and `options.forceParallel` is not
 * true, a post-processing step separates phases that share modified files into
 * different waves (write-intent conflict detection).
 */
function buildWaves(
  phases: Array<{ number: string; name: string; depends_on?: string | null }>,
  options?: BuildWavesOptions
): string[][] {
  const graph: DependencyGraph = buildDependencyGraph(phases);
  const initialWaves: string[][] = computeParallelGroups(graph);

  if (!options?.filesModified || options?.forceParallel) {
    return initialWaves;
  }

  // Post-process waves to separate phases with overlapping files_modified.
  // We process the initial waves in order and keep splitting any wave that
  // contains two phases sharing at least one file — producing extra waves as
  // needed. The outer loop repeats until a full pass produces no splits.
  const filesModified = options.filesModified;

  /**
   * Split a single wave into one or more sub-waves such that no two phases in
   * the same sub-wave declare the same modified file.
   */
  function splitWave(wave: string[]): string[][] {
    const subWaves: string[][] = [];
    const subWaveFiles: Set<string>[] = [];

    for (const phaseId of wave) {
      const files = filesModified[phaseId] || [];
      // Find the first existing sub-wave that has no file conflict.
      let placed = false;
      for (let i = 0; i < subWaves.length; i++) {
        const hasConflict = files.some((f: string) => subWaveFiles[i].has(f));
        if (!hasConflict) {
          subWaves[i].push(phaseId);
          files.forEach((f: string) => subWaveFiles[i].add(f));
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Open a new sub-wave for this phase.
        subWaves.push([phaseId]);
        subWaveFiles.push(new Set<string>(files));
      }
    }

    return subWaves;
  }

  // Apply splitWave to every initial wave and flatten the results into the
  // final wave list, preserving the overall wave order.
  const result: string[][] = [];
  for (const wave of initialWaves) {
    const subWaves = splitWave(wave);
    for (const sw of subWaves) {
      result.push(sw);
    }
  }

  return result;
}

// ─── buildWavesFromPlans ──────────────────────────────────────────────────────

/**
 * Group phases into dependency waves, refined by artifact-level dependency information.
 *
 * Extends `buildWaves` with fine-grained artifact DAG constraints:
 * 1. Computes baseline waves using `buildWaves(phases)`.
 * 2. If plans have no provides/requires declarations, returns baseline unchanged.
 * 3. Builds an ArtifactDAG from plans and validates it for cycles.
 * 4. If the DAG is invalid (cycles detected), logs a warning and returns baseline.
 * 5. For each baseline wave, checks if any two plans have artifact-level dependencies
 *    (one requires what the other provides) — if so, splits them into separate sub-waves.
 *
 * @param plans - Array of plan artifacts parsed from PLAN.md frontmatter
 * @param phases - Phase objects from roadmap analysis (for buildWaves baseline)
 * @returns Refined wave grouping respecting both phase-level and artifact-level deps
 */
function buildWavesFromPlans(
  plans: PlanArtifact[],
  phases: Array<{ number: string; name: string; depends_on?: string | null }>
): string[][] {
  // Step 1: baseline from phase-level depends_on
  const baseline = buildWaves(phases);

  // Step 2: no artifact declarations — return baseline unchanged
  const hasArtifacts = plans.some((p) => p.provides.length > 0 || p.requires.length > 0);
  if (plans.length === 0 || !hasArtifacts) {
    return baseline;
  }

  // Step 3: build artifact DAG
  const dag = buildArtifactDAG(plans);

  // Step 4: validate — if cycles present, warn and return baseline
  const validation = validateArtifactDAG(dag, plans);
  if (!validation.valid) {
    process.stderr.write(
      `[buildWavesFromPlans] WARNING: Artifact DAG has cycles — falling back to baseline waves.\n`
    );
    return baseline;
  }

  // Step 5: for each baseline wave, split plans that have artifact-level deps on each other
  // Build a quick lookup: planId → set of artifacts it provides
  const planProvides = new Map<string, Set<string>>();
  for (const plan of plans) {
    const planId = `${plan.phase}-${String(plan.plan).padStart(2, '0')}`;
    planProvides.set(planId, new Set<string>(plan.provides));
  }

  // Build lookup: planId → set of artifacts it requires
  const planRequires = new Map<string, Set<string>>();
  for (const plan of plans) {
    const planId = `${plan.phase}-${String(plan.plan).padStart(2, '0')}`;
    planRequires.set(planId, new Set<string>(plan.requires));
  }

  /**
   * Check whether planA artifact-depends on planB
   * (planA requires something planB provides, or vice versa).
   */
  function hasArtifactDep(planA: string, planB: string): boolean {
    const aRequires = planRequires.get(planA) ?? new Set<string>();
    const bProvides = planProvides.get(planB) ?? new Set<string>();
    const bRequires = planRequires.get(planB) ?? new Set<string>();
    const aProvides = planProvides.get(planA) ?? new Set<string>();

    for (const req of aRequires) {
      if (bProvides.has(req)) return true;
    }
    for (const req of bRequires) {
      if (aProvides.has(req)) return true;
    }
    return false;
  }

  /**
   * Split a single wave into sub-waves so that no two plans in the same sub-wave
   * have artifact-level dependencies on each other.
   */
  function splitWaveByArtifacts(wave: string[]): string[][] {
    const subWaves: string[][] = [];

    for (const planId of wave) {
      let placed = false;
      for (const subWave of subWaves) {
        const conflict = subWave.some((existing) => hasArtifactDep(planId, existing));
        if (!conflict) {
          subWave.push(planId);
          placed = true;
          break;
        }
      }
      if (!placed) {
        subWaves.push([planId]);
      }
    }

    return subWaves;
  }

  const refined: string[][] = [];
  for (const wave of baseline) {
    const subWaves = splitWaveByArtifacts(wave);
    for (const sw of subWaves) {
      refined.push(sw);
    }
  }

  return refined;
}

module.exports = {
  atomicWriteFileSync,
  createMergeQueue,
  parseWriteIntent,
  compareWriteIntent,
  formatWriteIntentMismatch,
  buildWaves,
  buildWavesFromPlans,
};
