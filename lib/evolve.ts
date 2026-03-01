'use strict';

/**
 * GRD Evolve -- State layer, discovery engine, and priority selection
 *
 * Foundation data layer for the self-evolving loop (/grd:evolve). Provides
 * work item creation, iteration state persistence, merge/deduplication,
 * iteration advancement logic, codebase discovery engine, scoring heuristic,
 * and priority selection algorithm.
 *
 * Created in Phase 55 (Evolve Core Engine).
 */

import type { BackendCapabilities, GrdConfig, MilestoneInfo } from './types';

const fs = require('fs');
const path = require('path');
const {
  safeReadFile,
  output,
  error,
  loadConfig,
  execGit,
  resolveModelForAgent,
  getMilestoneInfo,
} = require('./utils') as {
  safeReadFile: (filePath: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  loadConfig: (cwd: string) => GrdConfig;
  execGit: (
    cwd: string,
    args: string[],
    opts?: { allowBlocked?: boolean }
  ) => { exitCode: number; stdout: string; stderr: string };
  resolveModelForAgent: (config: GrdConfig, agent: string, cwd: string) => string;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
};
const { detectBackend, getBackendCapabilities } = require('./backend') as {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (backend: string) => BackendCapabilities;
};
const { spawnClaudeAsync } = require('./autopilot') as {
  spawnClaudeAsync: (
    cwd: string,
    prompt: string,
    opts?: {
      captureOutput?: boolean;
      model?: string;
      maxTurns?: number;
      timeout?: number;
      outputFormat?: string;
      captureStderr?: boolean;
    }
  ) => Promise<{
    exitCode: number;
    stdout?: string;
    stderr?: string;
    timedOut: boolean;
  }>;
};
const { createEvolveWorktree, removeEvolveWorktree, pushAndCreatePR } =
  require('./worktree') as {
    createEvolveWorktree: (cwd: string) => {
      path: string;
      branch: string;
      baseBranch: string;
      error?: string;
    };
    removeEvolveWorktree: (
      cwd: string,
      wtPath: string
    ) => { removed: boolean; error?: string };
    pushAndCreatePR: (
      cwd: string,
      wtPath: string,
      opts?: { base?: string }
    ) => { pr_url?: string; error?: string };
  };

// ─── Domain Types ───────────────────────────────────────────────────────────

/** Effort estimates for work items. */
type WorkItemEffort = 'small' | 'medium' | 'large';

/** Source of a work item. */
type WorkItemSource = 'discovery' | 'bugfix' | 'carryover';

/** Status of a work item. */
type WorkItemStatus = 'pending' | 'selected' | 'completed' | 'failed';

/** A single unit of improvement work. */
interface WorkItem {
  id: string;
  dimension: string;
  slug: string;
  title: string;
  description: string;
  effort: WorkItemEffort;
  source: WorkItemSource;
  status: WorkItemStatus;
  iteration_added: number;
}

/** Optional overrides for createWorkItem. */
interface WorkItemOptions {
  effort?: WorkItemEffort;
  source?: WorkItemSource;
  status?: WorkItemStatus;
  iteration_added?: number;
}

/** Iteration history record. */
interface HistoryEntry {
  iteration: number;
  timestamp: string;
  selected_count: number;
  completed_count: number;
  failed_count: number;
}

/** Full evolve state (legacy item-based format). */
interface EvolveState {
  iteration: number;
  timestamp: string;
  milestone: string;
  items_per_iteration: number;
  selected: WorkItem[];
  remaining: WorkItem[];
  bugfix: WorkItem[];
  completed: WorkItem[];
  failed: WorkItem[];
  history: HistoryEntry[];
}

/** Group-based evolve state (Phase 56+ format). */
interface EvolveGroupState {
  iteration: number;
  timestamp: string;
  milestone: string;
  pick_pct: number;
  selected_groups: WorkGroup[];
  remaining_groups: WorkGroup[];
  completed_groups: WorkGroup[];
  failed_groups: WorkGroup[];
  all_items_count: number;
  groups_count: number;
  history: HistoryEntry[];
}

/** Grouped work items by theme. */
interface WorkGroup {
  id: string;
  theme: string;
  dimension: string;
  title?: string;
  items: WorkItem[];
  priority: number;
  effort: WorkItemEffort;
  status?: string;
}

/** Result from runGroupDiscovery. */
interface GroupDiscoveryResult {
  groups: WorkGroup[];
  selected_groups: WorkGroup[];
  remaining_groups: WorkGroup[];
  all_items_count: number;
  merged_items_count: number;
  groups_count: number;
}

/** Theme pattern for slug-based grouping. */
interface ThemePattern {
  pattern: RegExp;
  theme: string;
}

/** Options for runEvolve. */
interface EvolveOptions {
  iterations?: number;
  pickPct?: number;
  timeout?: number;
  maxTurns?: number;
  dryRun?: boolean;
  useWorktree?: boolean;
}

/** Result of processing one group. */
interface GroupOutcome {
  group: string;
  status: 'pass' | 'fail' | 'skip';
  step?: string;
  reason?: string;
}

/** Per-iteration summary. */
interface IterationResult {
  iteration: number;
  status: string;
  groups_attempted: number;
  groups_passed: number;
  groups_failed: number;
  remaining_groups: number;
}

/** Dry-run iteration result. */
interface DryRunIterationResult {
  iteration: number;
  status: 'dry-run';
  groups: Array<{
    id: string;
    priority: number;
    item_count: number;
    effort: string;
  }>;
  total_items: number;
  total_groups: number;
  groups_per_iteration: number;
  estimated_iterations: number;
}

/** Full result from runEvolve. */
interface EvolveResult {
  iterations_completed: number;
  results: Array<IterationResult | DryRunIterationResult>;
  evolution_notes_path: string;
  worktree?: { path: string; branch: string };
  pr?: Record<string, unknown>;
}

/** Tracked worktree state during evolve. */
interface WorktreeInfo {
  path: string;
  branch: string;
  baseBranch: string;
}

/** Data for writeEvolutionNotes. */
interface EvolutionNotesData {
  iteration: number;
  items: WorkItem[];
  outcomes: Array<{
    item: string;
    status: string;
    step?: string;
    reason?: string;
  }>;
  decisions: string[];
  patterns: string[];
  takeaways: string[];
}

/** Context for _runIterationStep. */
interface IterationContext {
  discoveryCwd: string;
  executionCwd: string;
  state: EvolveGroupState | EvolveState | null;
  useWorktree: boolean;
  worktreeInfo: WorktreeInfo | null;
  effectivePickPct: number;
  dryRun: boolean;
  timeoutMs: number | undefined;
  maxTurns: number | undefined;
  cwd: string;
  log: (msg: string) => void;
}

/** Return from _runIterationStep. */
interface IterationStepResult {
  discovery: GroupDiscoveryResult;
  outcomes: GroupOutcome[] | null;
  worktreeInfo: WorktreeInfo | null;
  executionCwd: string;
  useWorktree: boolean;
  isDryRun: boolean;
}

/** Return from _handleIterationResult. */
interface HandleIterationReturn {
  newState: EvolveGroupState;
  iterResult: IterationResult;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const EVOLVE_STATE_FILENAME: string = 'EVOLVE-STATE.json';

const SONNET_MODEL: string = 'sonnet';

const WORK_ITEM_DIMENSIONS: string[] = [
  'improve-features',
  'new-features',
  'productivity',
  'quality',
  'usability',
  'consistency',
  'stability',
];

const DEFAULT_ITEMS_PER_ITERATION: number = 5;

const DEFAULT_PICK_PCT: number = 50;

const THEME_PATTERNS: ThemePattern[] = [
  { pattern: /^split-/, theme: 'long-function-refactors' },
  { pattern: /^improve-coverage-/, theme: 'test-coverage' },
  { pattern: /^add-jsdoc-/, theme: 'jsdoc-gaps' },
  { pattern: /^add-description-/, theme: 'command-descriptions' },
  { pattern: /^resolve-(?:todo|fixme|hack)-/, theme: 'code-markers' },
  { pattern: /^fix-empty-catch-/, theme: 'empty-catch-blocks' },
  { pattern: /^add-module-header-/, theme: 'module-headers' },
  { pattern: /^remove-process-exit-/, theme: 'process-exit-cleanup' },
  { pattern: /^use-paths-module-/, theme: 'hardcoded-paths' },
  { pattern: /^add-tests-/, theme: 'missing-test-files' },
  { pattern: /^mcp-tool-/, theme: 'mcp-tool-bindings' },
  { pattern: /^missing-validation-/, theme: 'input-validation' },
  { pattern: /^generic-error-/, theme: 'error-messages' },
  { pattern: /^missing-dry-run-/, theme: 'dry-run-support' },
  { pattern: /^missing-integration-test-/, theme: 'integration-test-gaps' },
  { pattern: /^missing-agent-init-/, theme: 'agent-workflow-gaps' },
  { pattern: /^configurable-default-/, theme: 'configurable-defaults' },
  { pattern: /^missing-progress-/, theme: 'progress-feedback' },
  { pattern: /^enhance-/, theme: 'feature-enhancements' },
  { pattern: /^improve-output-/, theme: 'output-improvements' },
  { pattern: /^add-fallback-/, theme: 'error-recovery' },
  { pattern: /^consolidate-/, theme: 'api-consolidation' },
];

// ─── Lib File Read Cache ─────────────────────────────────────────────────────

/**
 * Module-level cache for lib file contents.
 * Avoids re-reading the same file multiple times when discover functions
 * are called in sequence from analyzeCodebaseForItems.
 * Keyed by absolute file path; populated on first read per path.
 */
const _libFileCache = new Map<string, string | null>();

/**
 * Read a lib file using the module-level cache to avoid redundant I/O.
 */
function readLibFileCached(filePath: string): string | null {
  if (!_libFileCache.has(filePath)) {
    _libFileCache.set(filePath, safeReadFile(filePath));
  }
  return _libFileCache.get(filePath) ?? null;
}

// ─── Work Item Factory ──────────────────────────────────────────────────────

/**
 * Create a work item object with deterministic id and sensible defaults.
 */
function createWorkItem(
  dimension: string,
  slug: string,
  title: string,
  description: string,
  opts: WorkItemOptions = {}
): WorkItem {
  if (!WORK_ITEM_DIMENSIONS.includes(dimension)) {
    throw new Error(
      `Invalid dimension "${dimension}". Must be one of: ${WORK_ITEM_DIMENSIONS.join(', ')}`
    );
  }

  return {
    id: `${dimension}/${slug}`,
    dimension,
    slug,
    title,
    description,
    effort: opts.effort || 'medium',
    source: opts.source || 'discovery',
    status: opts.status || 'pending',
    iteration_added: opts.iteration_added !== undefined ? opts.iteration_added : 1,
  };
}

// ─── State Path ─────────────────────────────────────────────────────────────

/**
 * Return the absolute path to the evolve state file.
 */
function evolveStatePath(cwd: string): string {
  return path.join(cwd, '.planning', EVOLVE_STATE_FILENAME);
}

// ─── State I/O ──────────────────────────────────────────────────────────────

/**
 * Read and parse the evolve state JSON from disk.
 */
function readEvolveState(cwd: string): EvolveGroupState | EvolveState | null {
  const filePath: string = evolveStatePath(cwd);
  const raw: string | null = safeReadFile(filePath);
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as EvolveGroupState | EvolveState;
  } catch {
    return null;
  }
}

/**
 * Write the evolve state JSON to disk with 2-space indentation.
 * Creates parent directory if needed.
 */
function writeEvolveState(cwd: string, state: EvolveGroupState | EvolveState): void {
  const filePath: string = evolveStatePath(cwd);
  const dir: string = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
}

// ─── State Creation ─────────────────────────────────────────────────────────

/**
 * Create a fresh iteration state object.
 */
function createInitialState(milestone: string, itemsPerIteration?: number): EvolveState {
  return {
    iteration: 1,
    timestamp: new Date().toISOString(),
    milestone,
    items_per_iteration:
      itemsPerIteration !== undefined ? itemsPerIteration : DEFAULT_ITEMS_PER_ITERATION,
    selected: [],
    remaining: [],
    bugfix: [],
    completed: [],
    failed: [],
    history: [],
  };
}

// ─── Merge Logic ────────────────────────────────────────────────────────────

/**
 * Merge two arrays of work items, deduplicating by `id` field.
 * Items from `discovered` that share an `id` with `existing` are dropped.
 */
function mergeWorkItems(existing: WorkItem[], discovered: WorkItem[]): WorkItem[] {
  const seen = new Set<string>(existing.map((item) => item.id));
  const merged: WorkItem[] = [...existing];

  for (const item of discovered) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

// ─── Iteration Advancement ──────────────────────────────────────────────────

/**
 * Create a new state object for the next iteration.
 */
function advanceIteration(previousState: EvolveState): EvolveState {
  // Build history entry from previous iteration
  const historyEntry: HistoryEntry = {
    iteration: previousState.iteration,
    timestamp: previousState.timestamp,
    selected_count: previousState.selected.length,
    completed_count: previousState.completed.length,
    failed_count: previousState.failed.length,
  };

  // Carry over remaining items that are still pending
  const carryoverRemaining: WorkItem[] = previousState.remaining.filter(
    (item) => item.status === 'pending'
  );

  // Merge bugfix items into remaining
  const mergedRemaining: WorkItem[] = mergeWorkItems(carryoverRemaining, previousState.bugfix);

  return {
    iteration: previousState.iteration + 1,
    timestamp: new Date().toISOString(),
    milestone: previousState.milestone,
    items_per_iteration: previousState.items_per_iteration,
    selected: [],
    remaining: mergedRemaining,
    bugfix: [],
    completed: [],
    failed: [],
    history: [...previousState.history, historyEntry],
  };
}

// ─── Discovery Engine ────────────────────────────────────────────────────────

/**
 * Discover productivity improvement opportunities.
 * Scans lib/ for long functions, duplicate exports, and missing init workflows.
 */
function discoverProductivityItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');

  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // Check for long functions (>80 lines)
      const funcPattern =
        /^(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\())/gm;
      let funcMatch: RegExpExecArray | null;
      while ((funcMatch = funcPattern.exec(content)) !== null) {
        const funcName: string = funcMatch[1] || funcMatch[2];
        const startIdx: number = funcMatch.index;
        const startLine: number = content.substring(0, startIdx).split('\n').length;

        // Count lines until we find matching brace depth back to 0
        let depth: number = 0;
        let foundOpen: boolean = false;
        let endLine: number = startLine;
        const lines: string[] = content.split('\n');
        for (let i = startLine - 1; i < lines.length; i++) {
          const line: string = lines[i];
          for (const ch of line) {
            if (ch === '{') {
              depth++;
              foundOpen = true;
            } else if (ch === '}') {
              depth--;
            }
          }
          if (foundOpen && depth <= 0) {
            endLine = i + 1;
            break;
          }
        }

        const funcLength: number = endLine - startLine + 1;
        if (funcLength > 80) {
          items.push(
            createWorkItem(
              'productivity',
              `split-${path.basename(file, '.js')}-${funcName}`,
              `Split long function ${funcName} in ${file}`,
              `Function ${funcName} in lib/${file} is ${funcLength} lines long (threshold: 80). Consider splitting into smaller helper functions for readability and maintainability.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch (err) {
    // lib/ directory missing (ENOENT is expected); other errors are unexpected
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
  }

  return items;
}

/**
 * Discover quality improvement opportunities.
 * Checks for todo/fixme/hack marker comments and missing test files.
 */
function discoverQualityItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');
  const testDir: string = path.join(cwd, 'tests', 'unit');

  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      // Check for missing test file
      const testFileName: string = file.replace('.js', '.test.js');
      const testPath: string = path.join(testDir, testFileName);
      try {
        fs.statSync(testPath);
      } catch {
        items.push(
          createWorkItem(
            'quality',
            `add-tests-${path.basename(file, '.js')}`,
            `Add test file for ${file}`,
            `lib/${file} has no corresponding test file at tests/unit/${testFileName}. Add unit tests to ensure code correctness.`,
            { effort: 'medium' }
          )
        );
      }

      // Check for todo/fixme/hack marker comments.
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      const todoPattern = /(?:\/\/|\/?\*+)\s*(TODO|FIXME|HACK)\b[:\s]*(.*)/g;
      let todoMatch: RegExpExecArray | null;
      while ((todoMatch = todoPattern.exec(content)) !== null) {
        const tag: string = todoMatch[1];
        const desc: string = todoMatch[2].trim().substring(0, 80);
        const lineNum: number = content.substring(0, todoMatch.index).split('\n').length;
        const slug: string = `resolve-${tag.toLowerCase()}-${path.basename(file, '.js')}-L${lineNum}`;

        items.push(
          createWorkItem(
            'quality',
            slug,
            `Resolve ${tag} in ${file} line ${lineNum}`,
            `${tag} comment found in lib/${file} at line ${lineNum}: "${desc}". Review and resolve this marker.`,
            { effort: 'small' }
          )
        );
      }
    }
  } catch (err) {
    // lib/ or tests/ directory missing (ENOENT expected); other errors are unexpected
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
  }

  // Check jest.config.js for low coverage thresholds
  try {
    const jestConfigContent: string | null = safeReadFile(path.join(cwd, 'jest.config.js'));
    if (jestConfigContent) {
      const thresholdPattern = /'\.\/lib\/([^']+)':\s*\{[^}]*lines:\s*(\d+)/g;
      let thresholdMatch: RegExpExecArray | null;
      while ((thresholdMatch = thresholdPattern.exec(jestConfigContent)) !== null) {
        const moduleName: string = thresholdMatch[1];
        const linesCoverage: number = parseInt(thresholdMatch[2], 10);
        if (linesCoverage < 90) {
          items.push(
            createWorkItem(
              'quality',
              `improve-coverage-${path.basename(moduleName, '.js')}`,
              `Improve test coverage for ${moduleName}`,
              `lib/${moduleName} has a coverage threshold of ${linesCoverage}% lines (target: 90%). Increase test coverage to strengthen code quality.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch {
    // jest.config.js not found
  }

  return items;
}

/**
 * Discover usability improvement opportunities.
 * Checks commands for missing descriptions and lib/ for missing JSDoc.
 */
function discoverUsabilityItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const cmdDir: string = path.join(cwd, 'commands');

  try {
    const cmdFiles: string[] = fs
      .readdirSync(cmdDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md'))
      .map((e: { name: string }) => e.name);

    for (const file of cmdFiles) {
      const content: string | null = safeReadFile(path.join(cmdDir, file));
      if (!content) continue;

      // Check for missing description in frontmatter
      const fmMatch: RegExpMatchArray | null = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const frontmatter: string = fmMatch[1];
        if (!frontmatter.includes('description:') || frontmatter.match(/description:\s*$/m)) {
          items.push(
            createWorkItem(
              'usability',
              `add-description-${path.basename(file, '.md')}`,
              `Add description to command ${file}`,
              `Command file commands/${file} is missing a description in its frontmatter. Add a clear description to improve discoverability.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch {
    // commands/ directory missing
  }

  // Check lib/ files for undocumented exported functions (missing JSDoc)
  const libDir: string = path.join(cwd, 'lib');
  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // Find exported functions without preceding JSDoc
      const exportBlock: RegExpMatchArray | null = content.match(
        /module\.exports\s*=\s*\{([^}]+)\}/s
      );
      if (!exportBlock) continue;

      const exportedNames: string[] = exportBlock[1]
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
        .map((s: string) => {
          const m = s.match(/^(\w+)/);
          return m ? m[1] : '';
        })
        .filter(Boolean);

      for (const name of exportedNames) {
        // Find the function declaration
        const funcIdx: number = content.indexOf(`function ${name}(`);
        if (funcIdx === -1) continue;

        // Check for JSDoc before it (within previous 5 lines)
        const beforeFunc: string = content.substring(0, funcIdx);
        const beforeLines: string[] = beforeFunc.split('\n');
        const startCheck: number = Math.max(0, beforeLines.length - 6);
        const contextLines: string = beforeLines.slice(startCheck).join('\n');

        if (!contextLines.includes('/**')) {
          items.push(
            createWorkItem(
              'usability',
              `add-jsdoc-${path.basename(file, '.js')}-${name}`,
              `Add JSDoc to ${name} in ${file}`,
              `Exported function ${name} in lib/${file} lacks JSDoc documentation. Add parameter and return type annotations.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch (err) {
    // lib/ directory missing (ENOENT expected); other errors are unexpected
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
  }

  return items;
}

/**
 * Discover consistency improvement opportunities.
 * Checks for inconsistent error handling and missing file headers.
 */
function discoverConsistencyItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');

  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // Check for process.exit calls (should use error() instead)
      if (content.includes('process.exit(')) {
        items.push(
          createWorkItem(
            'consistency',
            `remove-process-exit-${path.basename(file, '.js')}`,
            `Replace process.exit calls in ${file}`,
            `lib/${file} uses process.exit() directly. Use the error() utility function instead for consistent error handling.`,
            { effort: 'small' }
          )
        );
      }

      // Check for missing JSDoc module header
      const firstLines: string = content.split('\n').slice(0, 5).join('\n');
      if (!firstLines.includes('/**')) {
        items.push(
          createWorkItem(
            'consistency',
            `add-module-header-${path.basename(file, '.js')}`,
            `Add module JSDoc header to ${file}`,
            `lib/${file} is missing the standard JSDoc module header comment at the top of the file.`,
            { effort: 'small' }
          )
        );
      }
    }
  } catch (err) {
    // lib/ directory missing (ENOENT expected); other errors are unexpected
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
  }

  return items;
}

/**
 * Discover stability improvement opportunities.
 * Checks for empty catch blocks, hardcoded paths, and missing validation.
 */
function discoverStabilityItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');

  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // Check for empty catch blocks that swallow errors
      const emptyCatchPattern = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
      let catchMatch: RegExpExecArray | null;
      while ((catchMatch = emptyCatchPattern.exec(content)) !== null) {
        const lineNum: number = content.substring(0, catchMatch.index).split('\n').length;
        items.push(
          createWorkItem(
            'stability',
            `fix-empty-catch-${path.basename(file, '.js')}-L${lineNum}`,
            `Handle error in empty catch block in ${file} line ${lineNum}`,
            `lib/${file} has an empty catch block at line ${lineNum} that silently swallows errors. Add error logging or explicit comment explaining why the error is intentionally ignored.`,
            { effort: 'small' }
          )
        );
      }

      // Check for hardcoded .planning paths (should use lib/paths.js)
      if (file !== 'paths.js' && file !== 'evolve.js') {
        const hardcodedPathPattern = /['"]\.planning\//g;
        let pathMatch: RegExpExecArray | null;
        while ((pathMatch = hardcodedPathPattern.exec(content)) !== null) {
          const lineNum: number = content.substring(0, pathMatch.index).split('\n').length;
          items.push(
            createWorkItem(
              'stability',
              `use-paths-module-${path.basename(file, '.js')}-L${lineNum}`,
              `Use paths module instead of hardcoded path in ${file}`,
              `lib/${file} has a hardcoded ".planning/" path at line ${lineNum}. Use lib/paths.js functions for path resolution to ensure consistency across environments.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch (err) {
    // lib/ directory missing (ENOENT expected); other errors are unexpected
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
  }

  return items;
}

/**
 * Discover feature improvement opportunities.
 * Finds existing features that could be enhanced with better output,
 * error recovery, API consolidation, or UX improvements.
 */
function discoverImproveFeatureItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');
  const cmdDir: string = path.join(cwd, 'commands');

  // 1. Commands that output raw JSON without human-readable formatting option
  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // Find functions that call output() but only pass JSON, no raw text
      const outputPattern = /output\(\s*(\w+)\s*,\s*raw\s*(?:,\s*raw\s*\?)?\s*\)/g;
      let oMatch: RegExpExecArray | null;
      while ((oMatch = outputPattern.exec(content)) !== null) {
        // Check if it has no third arg (missing human-readable text format)
        const fullCall: string = content.substring(oMatch.index, oMatch.index + 100);
        if (!/output\([^)]*,[^,]*,[^)]+\)/.test(fullCall)) {
          const lineNum: number = content.substring(0, oMatch.index).split('\n').length;
          items.push(
            createWorkItem(
              'improve-features',
              `improve-output-${path.basename(file, '.js')}-L${lineNum}`,
              `Add human-readable output in ${file} line ${lineNum}`,
              `lib/${file} calls output() at line ${lineNum} without a human-readable text format (third argument). When --raw is used, users see nothing useful. Add a formatted text representation.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch (err) {
    // lib/ dir missing (ENOENT expected); other errors are unexpected
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
  }

  // 2. Error paths that don't suggest recovery actions
  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // Find error() calls that describe what went wrong but don't suggest what to do
      const errorPattern = /error\(\s*['"`]([^'"`]{30,})['"`]\s*\)/g;
      let eMatch: RegExpExecArray | null;
      while ((eMatch = errorPattern.exec(content)) !== null) {
        const msg: string = eMatch[1];
        // Flag errors without actionable hints (no "try", "run", "check", "use", "set")
        if (!/\b(?:try|run|check|use|set|ensure|add|create|install|verify)\b/i.test(msg)) {
          const lineNum: number = content.substring(0, eMatch.index).split('\n').length;
          items.push(
            createWorkItem(
              'improve-features',
              `add-fallback-${path.basename(file, '.js')}-L${lineNum}`,
              `Add recovery hint to error in ${file} line ${lineNum}`,
              `error() in lib/${file} at line ${lineNum} says "${msg.substring(0, 60)}..." but does not suggest what the user should do to fix it. Add an actionable recovery hint.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch (err) {
    // lib/ dir missing (ENOENT expected); other errors are unexpected
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
  }

  // 3. Commands with overlapping functionality that could be consolidated
  try {
    const cmdFiles: string[] = fs
      .readdirSync(cmdDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md'))
      .map((e: { name: string }) => e.name);

    // Group commands by prefix to find potential consolidation opportunities
    const prefixGroups: Record<string, string[]> = {};
    for (const file of cmdFiles) {
      const parts: string[] = file.replace('.md', '').split('-');
      if (parts.length >= 2) {
        const prefix: string = parts[0];
        if (!prefixGroups[prefix]) prefixGroups[prefix] = [];
        prefixGroups[prefix].push(file);
      }
    }

    for (const [prefix, files] of Object.entries(prefixGroups)) {
      // Flag groups of 4+ commands with same prefix as potential consolidation
      if (files.length >= 4) {
        items.push(
          createWorkItem(
            'improve-features',
            `consolidate-${prefix}-commands`,
            `Consider consolidating ${prefix}-* commands (${files.length} commands)`,
            `There are ${files.length} commands with prefix "${prefix}-": ${files.join(', ')}. Consider whether some could be subcommands of a single parent command for a cleaner UX.`,
            { effort: 'large' }
          )
        );
      }
    }
  } catch {
    // commands/ dir missing
  }

  // 4. Lib modules that could benefit from caching
  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // Find repeated readFileSync calls on the same path pattern
      const readCalls: string[] = [];
      const readPattern = /(?:readFileSync|safeReadFile)\(\s*([^)]+)\)/g;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = readPattern.exec(content)) !== null) {
        readCalls.push(rMatch[1].trim());
      }

      // Check for duplicate reads of the same expression
      const seen: Record<string, number> = {};
      for (const call of readCalls) {
        seen[call] = (seen[call] || 0) + 1;
      }
      for (const [callExpr, count] of Object.entries(seen)) {
        if (count >= 3 && callExpr.length < 80) {
          items.push(
            createWorkItem(
              'improve-features',
              `enhance-caching-${path.basename(file, '.js')}`,
              `Add caching for repeated file reads in ${file}`,
              `lib/${file} reads ${callExpr} ${count} times. Cache the result in a local variable to avoid redundant I/O.`,
              { effort: 'small' }
            )
          );
          break; // One item per file
        }
      }
    }
  } catch (err) {
    // lib/ dir missing (ENOENT expected); other errors are unexpected
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
  }

  // 5. Agent definitions that could benefit from tool restrictions
  const agentDir: string = path.join(cwd, 'agents');
  try {
    const agentFiles: string[] = fs
      .readdirSync(agentDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md'))
      .map((e: { name: string }) => e.name);

    for (const file of agentFiles) {
      const content: string | null = safeReadFile(path.join(agentDir, file));
      if (!content) continue;

      const fmMatch: RegExpMatchArray | null = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;
      const frontmatter: string = fmMatch[1];

      // Check if agent has tool restrictions defined
      const hasToolRestrictions: boolean =
        frontmatter.includes('allowed_tools') ||
        frontmatter.includes('disallowed_tools') ||
        /^tools:/m.test(frontmatter);
      if (!hasToolRestrictions) {
        items.push(
          createWorkItem(
            'improve-features',
            `enhance-agent-${path.basename(file, '.md')}`,
            `Add tool restrictions to ${file} agent`,
            `Agent agents/${file} has no tool restrictions in frontmatter. Adding allowed_tools or disallowed_tools improves safety and focuses the agent on its specific task.`,
            { effort: 'small' }
          )
        );
      }
    }
  } catch {
    // agents/ dir missing
  }

  return items;
}

/**
 * Discover new feature opportunities.
 * Checks for missing MCP tools, input validation, error quality,
 * dry-run support, integration test coverage, and more.
 */
function discoverNewFeatureItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');
  const cmdDir: string = path.join(cwd, 'commands');
  const agentDir: string = path.join(cwd, 'agents');

  const commandsContent: string | null = readLibFileCached(path.join(libDir, 'commands.js'));

  // 1. Init workflows without MCP tool bindings
  const contextPath: string = path.join(libDir, 'context.js');
  const mcpPath: string = path.join(libDir, 'mcp-server.js');

  try {
    const contextContent: string | null = readLibFileCached(contextPath);
    const mcpContent: string | null = readLibFileCached(mcpPath);

    if (contextContent && mcpContent) {
      const initPattern = /function\s+(cmdInit\w+)\s*\(/g;
      let initMatch: RegExpExecArray | null;
      while ((initMatch = initPattern.exec(contextContent)) !== null) {
        const funcName: string = initMatch[1];
        if (!mcpContent.includes(funcName)) {
          items.push(
            createWorkItem(
              'new-features',
              `mcp-tool-${funcName.replace(/^cmdInit/, '').toLowerCase()}`,
              `Add MCP tool for ${funcName}`,
              `Init workflow ${funcName} in lib/context.js does not have a corresponding MCP tool binding in lib/mcp-server.js. Adding it would expose the workflow to MCP clients.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch {
    // Files not found
  }

  // 2. CLI commands with missing input validation (no args check after parsing)
  try {
    if (commandsContent) {
      // Find command handlers that read args[N] without bounds checking
      const handlerPattern = /function\s+(cmd\w+)\s*\([^)]*args[^)]*\)/g;
      let hMatch: RegExpExecArray | null;
      while ((hMatch = handlerPattern.exec(commandsContent)) !== null) {
        const funcName: string = hMatch[1];
        const startIdx: number = hMatch.index;
        // Get function body (next 30 lines)
        const bodyStart: number = commandsContent.indexOf('{', startIdx);
        if (bodyStart === -1) continue;
        const bodySlice: string = commandsContent.substring(bodyStart, bodyStart + 1500);

        // Check if it accesses args[0], args[1] etc without validation
        if (
          /args\[\d+\]/.test(bodySlice) &&
          !/args\.length/.test(bodySlice) &&
          !/if\s*\(\s*!args/.test(bodySlice)
        ) {
          items.push(
            createWorkItem(
              'new-features',
              `missing-validation-${funcName.replace(/^cmd/, '').toLowerCase()}`,
              `Add input validation to ${funcName}`,
              `Command handler ${funcName} in lib/commands.js accesses args[] without checking argument count. Add validation to give users a helpful error message when arguments are missing.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch {
    // commands.js not found
  }

  // 3. Generic/unhelpful error messages
  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // Find error() calls with very short messages (<20 chars) or no context
      const errorCallPattern = /error\(\s*['"`]([^'"`]{1,25})['"`]\s*\)/g;
      let errMatch: RegExpExecArray | null;
      while ((errMatch = errorCallPattern.exec(content)) !== null) {
        const msg: string = errMatch[1];
        // Flag overly generic messages
        if (/^(failed|error|invalid|missing|not found|unknown)\.?$/i.test(msg.trim())) {
          const lineNum: number = content.substring(0, errMatch.index).split('\n').length;
          items.push(
            createWorkItem(
              'new-features',
              `generic-error-${path.basename(file, '.js')}-L${lineNum}`,
              `Improve error message in ${file} line ${lineNum}`,
              `error("${msg}") in lib/${file} at line ${lineNum} is too generic. Add context about what failed and what the user should do (e.g., which command, which file, expected format).`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch {
    // lib/ directory missing
  }

  // 4. Commands that write files but lack --dry-run support
  try {
    if (commandsContent) {
      const cmdPattern = /function\s+(cmd\w+)\s*\(/g;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = cmdPattern.exec(commandsContent)) !== null) {
        const funcName: string = cMatch[1];
        const bodyStart: number = commandsContent.indexOf('{', cMatch.index);
        if (bodyStart === -1) continue;
        const bodySlice: string = commandsContent.substring(bodyStart, bodyStart + 2000);

        // Commands that write files or call scaffold functions
        const writesFiles: boolean = /(?:writeFileSync|mkdirSync|scaffold|fs\.write)/.test(
          bodySlice
        );
        const hasDryRun: boolean = /dry.?run|dryRun|--dry-run/.test(bodySlice);

        if (writesFiles && !hasDryRun) {
          items.push(
            createWorkItem(
              'new-features',
              `missing-dry-run-${funcName.replace(/^cmd/, '').toLowerCase()}`,
              `Add --dry-run support to ${funcName}`,
              `Command ${funcName} in lib/commands.js writes files but does not support --dry-run. Adding dry-run would let users preview changes before applying them.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch {
    // commands.js not found
  }

  // 5. Commands in commands/ dir without integration test coverage
  try {
    const cmdFiles: string[] = fs
      .readdirSync(cmdDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md'))
      .map((e: { name: string }) => path.basename(e.name, '.md'));

    const integrationDir: string = path.join(cwd, 'tests', 'integration');
    let integrationContent: string = '';
    try {
      const integrationFiles: string[] = fs
        .readdirSync(integrationDir, { withFileTypes: true })
        .filter(
          (e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')
        )
        .map((e: { name: string }) => e.name);
      for (const f of integrationFiles) {
        integrationContent += safeReadFile(path.join(integrationDir, f)) || '';
      }
    } catch {
      // No integration test dir
    }

    if (integrationContent) {
      for (const cmd of cmdFiles) {
        // Normalize command name: evolve.md -> "evolve", plan-phase.md -> "plan-phase"
        const normalizedCmd: string = cmd.replace(/-/g, '[- ]?');
        const pattern = new RegExp(normalizedCmd, 'i');
        if (!pattern.test(integrationContent)) {
          items.push(
            createWorkItem(
              'new-features',
              `missing-integration-test-${cmd}`,
              `Add integration test for /${cmd} command`,
              `Command commands/${cmd}.md has no references in tests/integration/. Adding integration tests ensures the command works end-to-end and catches regressions.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch {
    // commands/ dir missing
  }

  // 6. Agent definitions without init workflows
  try {
    const agentFiles: string[] = fs
      .readdirSync(agentDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md'))
      .map((e: { name: string }) => path.basename(e.name, '.md'));

    const contextContent: string | null = readLibFileCached(contextPath);
    if (contextContent) {
      for (const agent of agentFiles) {
        const initName: string = `cmdInit${agent.replace(/-(\w)/g, (_: string, c: string) => c.toUpperCase()).replace(/^(\w)/, (c: string) => c.toUpperCase())}`;
        const shortName: string = agent.replace(/^grd-/, '');
        if (
          !contextContent.includes(initName) &&
          !contextContent.includes(`'${shortName}'`) &&
          !contextContent.includes(`"${shortName}"`)
        ) {
          items.push(
            createWorkItem(
              'new-features',
              `missing-agent-init-${agent}`,
              `Add init workflow for ${agent} agent`,
              `Agent agents/${agent}.md does not have a corresponding init workflow in lib/context.js. Adding one would provide the agent with optimized context (state snapshot, plan index, etc.) instead of raw file reads.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch {
    // agents/ dir missing
  }

  // 7. Hardcoded magic numbers/strings that should be configurable
  // 8. Long-running operations without progress feedback
  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // 7: Find hardcoded timeout values (> 1000ms) -- skip self
      if (file !== 'evolve.js') {
        const timeoutPattern = /(?:timeout|TIMEOUT|delay|DELAY)\s*[:=]\s*(\d{4,})/g;
        let tMatch: RegExpExecArray | null;
        while ((tMatch = timeoutPattern.exec(content)) !== null) {
          const value: string = tMatch[1];
          const lineNum: number = content.substring(0, tMatch.index).split('\n').length;
          items.push(
            createWorkItem(
              'new-features',
              `configurable-default-${path.basename(file, '.js')}-L${lineNum}`,
              `Make timeout configurable in ${file}`,
              `lib/${file} has a hardcoded timeout value of ${value}ms at line ${lineNum}. Move it to config.json so users can tune it for their environment.`,
              { effort: 'small' }
            )
          );
        }
      }

      // 8: Find for-loops that process arrays and call async/heavy operations
      const loopPattern = /for\s*\((?:const|let|var)\s+(\w+)\s+of\s+(\w+)\)\s*\{/g;
      let lMatch: RegExpExecArray | null;
      while ((lMatch = loopPattern.exec(content)) !== null) {
        const arrayName: string = lMatch[2];
        const loopStart: number = lMatch.index;
        const bodySlice: string = content.substring(loopStart, loopStart + 500);

        // Check if it does file I/O or spawns processes
        const isHeavy: boolean =
          /(?:spawnSync|execSync|spawnClaude(?:Async)?|writeFileSync|appendFileSync)/.test(
            bodySlice
          );
        const hasProgress: boolean =
          /(?:log\(|process\.stderr\.write|progress|spinner)/.test(bodySlice);

        if (isHeavy && !hasProgress) {
          const lineNum: number = content.substring(0, loopStart).split('\n').length;
          items.push(
            createWorkItem(
              'new-features',
              `missing-progress-${path.basename(file, '.js')}-L${lineNum}`,
              `Add progress output to loop in ${file} line ${lineNum}`,
              `lib/${file} iterates over ${arrayName} at line ${lineNum} performing heavy operations (file I/O or process spawn) without progress feedback. Add a log statement showing N/total to help users track long-running operations.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch (err) {
    // lib/ dir missing (ENOENT expected); other errors are unexpected
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    )
      throw err;
  }

  return items;
}

/**
 * Run a single dimension discoverer defensively.
 * A failure in one dimension does not affect others.
 */
function _discoverDimension(
  name: string,
  finder: (cwd: string) => WorkItem[],
  cwd: string
): WorkItem[] {
  try {
    return finder(cwd);
  } catch (err) {
    // Defensive: one dimension failure should not block others
    if (
      err &&
      (err as NodeJS.ErrnoException).code &&
      (err as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      process.stderr.write(
        `[evolve] discoverer error (${name}, ${(err as NodeJS.ErrnoException).code}): ${(err as Error).message}\n`
      );
    }
    return [];
  }
}

/**
 * Analyze the codebase and produce categorized work items across all 6 dimensions.
 */
function analyzeCodebaseForItems(cwd: string): WorkItem[] {
  const discoverers: Array<[string, (cwd: string) => WorkItem[]]> = [
    ['improve-features', discoverImproveFeatureItems],
    ['new-features', discoverNewFeatureItems],
    ['productivity', discoverProductivityItems],
    ['quality', discoverQualityItems],
    ['usability', discoverUsabilityItems],
    ['consistency', discoverConsistencyItems],
    ['stability', discoverStabilityItems],
  ];

  const items: WorkItem[] = [];
  for (const [name, finder] of discoverers) {
    items.push(..._discoverDimension(name, finder, cwd));
  }

  return items;
}

/**
 * Build a compact file tree with line counts for Claude-powered discovery.
 */
function buildCodebaseDigest(cwd: string): string {
  const lines: string[] = [];
  const dirs: string[] = ['lib', 'bin', 'tests/unit', 'tests/integration'];

  for (const dir of dirs) {
    const dirPath: string = path.join(cwd, dir);
    try {
      const files: string[] = fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter(
          (e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')
        )
        .map((e: { name: string }) => {
          const content: string | null = safeReadFile(path.join(dirPath, e.name));
          const lineCount: number = content ? content.split('\n').length : 0;
          return `${dir}/${e.name} (${lineCount}L)`;
        })
        .sort();
      lines.push(...files);
    } catch {
      continue;
    }
  }

  return lines.join('\n');
}

/**
 * Build the discovery prompt with a file tree.
 */
function buildDiscoveryPrompt(cwd: string): string {
  const tree: string = buildCodebaseDigest(cwd);
  return `Analyze this codebase for improvement opportunities. Read the source files you need. Here is the file tree:

${tree}

Output ONLY a JSON array. Each item:
{"dimension":"<dim>","slug":"<kebab-id>","title":"<short>","description":"<what+why, include file:line>","effort":"small|medium|large"}

Dimensions: productivity, quality, usability, consistency, stability, improve-features, new-features

Rules:
- Read source files to find real issues
- Be specific: file paths and line numbers
- Actionable improvements only
- 30-80 items
- ONLY the JSON array, no other text`;
}

/**
 * Discover improvement opportunities by running Claude as a subprocess.
 */
async function discoverWithClaude(cwd: string): Promise<WorkItem[]> {
  try {
    const prompt: string = buildDiscoveryPrompt(cwd);
    const result = await spawnClaudeAsync(cwd, prompt, {
      captureOutput: true,
      model: SONNET_MODEL,
      maxTurns: 25,
      timeout: 180_000,
      outputFormat: 'text',
    });

    if (result.exitCode !== 0 || !result.stdout) {
      if (result.timedOut) {
        process.stderr.write(
          `[evolve] WARNING: Claude discovery timed out after timeout limit, using hardcoded fallback\n`
        );
      } else {
        process.stderr.write(
          `[evolve] Claude discovery failed (exit=${result.exitCode}, timedOut=${result.timedOut}), using hardcoded fallback\n`
        );
      }
      return analyzeCodebaseForItems(cwd);
    }

    // Check for max-turns error message in stdout
    if (result.stdout.startsWith('Error:')) {
      process.stderr.write(
        `[evolve] Claude discovery error: ${result.stdout.trim()}, using hardcoded fallback\n`
      );
      return analyzeCodebaseForItems(cwd);
    }

    const items: WorkItem[] = parseDiscoveryOutput(result.stdout);
    if (items.length === 0) {
      process.stderr.write(
        `[evolve] Claude discovery returned unparseable output (${result.stdout.length} chars), using hardcoded fallback\n`
      );
      return analyzeCodebaseForItems(cwd);
    }
    return items;
  } catch (err) {
    process.stderr.write(
      `[evolve] Claude discovery threw: ${(err as Error).message}, using hardcoded fallback\n`
    );
    return analyzeCodebaseForItems(cwd);
  }
}

/**
 * Parse Claude's discovery output into validated work items.
 */
function parseDiscoveryOutput(raw: string): WorkItem[] {
  let jsonStr: string = raw.trim();

  // Strip markdown fences if present
  const fenceMatch: RegExpMatchArray | null = jsonStr.match(
    /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/
  );
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const validEfforts: string[] = ['small', 'medium', 'large'];
  const items: WorkItem[] = [];

  for (const entry of parsed as Array<Record<string, unknown>>) {
    if (
      !entry ||
      typeof entry.dimension !== 'string' ||
      typeof entry.slug !== 'string' ||
      typeof entry.title !== 'string' ||
      typeof entry.description !== 'string'
    ) {
      continue;
    }

    if (!WORK_ITEM_DIMENSIONS.includes(entry.dimension)) {
      continue;
    }

    const effort: WorkItemEffort = validEfforts.includes(entry.effort as string)
      ? (entry.effort as WorkItemEffort)
      : 'medium';

    try {
      items.push(
        createWorkItem(entry.dimension, entry.slug, entry.title, entry.description, { effort })
      );
    } catch {
      // Skip invalid items
    }
  }

  // Warn when >50% of items have off-theme slugs
  if (items.length > 0) {
    const offThemeCount: number = items.filter((item) => {
      return !THEME_PATTERNS.some(({ pattern }) => pattern.test(item.slug));
    }).length;
    if (offThemeCount / items.length > 0.5) {
      process.stderr.write(
        `[evolve] WARNING: ${offThemeCount}/${items.length} items do not match any theme pattern — Claude may be generating off-theme slugs\n`
      );
    }
  }

  return items;
}

// ─── Scoring Heuristic ──────────────────────────────────────────────────────

/** Dimension weights for priority scoring */
const DIMENSION_WEIGHTS: Record<string, number> = {
  'improve-features': 10,
  'new-features': 9,
  stability: 9,
  consistency: 7,
  productivity: 6,
  usability: 5,
  quality: 4,
};

/** Effort modifiers for priority scoring (prefer low-hanging fruit) */
const EFFORT_MODIFIERS: Record<string, number> = {
  small: 3,
  medium: 2,
  large: 1,
};

/** Source modifiers for priority scoring (prefer bugfixes) */
const SOURCE_MODIFIERS: Record<string, number> = {
  bugfix: 5,
  discovery: 2,
  carryover: 1,
};

/**
 * Compute a priority score for a work item.
 */
function scoreWorkItem(item: WorkItem): number {
  const dimWeight: number = DIMENSION_WEIGHTS[item.dimension] || 0;
  const effortMod: number = EFFORT_MODIFIERS[item.effort] || 0;
  const sourceMod: number = SOURCE_MODIFIERS[item.source] || 0;
  return dimWeight + effortMod + sourceMod;
}

// ─── Priority Selection ─────────────────────────────────────────────────────

/**
 * Select the top N items by priority score from a list of work items.
 */
function selectPriorityItems(
  items: WorkItem[],
  count: number
): { selected: WorkItem[]; remaining: WorkItem[] } {
  // Score and sort (stable sort: items with equal score keep original order)
  const scored: Array<{ item: WorkItem; score: number }> = items.map((item) => ({
    item,
    score: scoreWorkItem(item),
  }));
  scored.sort((a, b) => b.score - a.score);

  const selected: WorkItem[] = [];
  const remaining: WorkItem[] = [];

  for (let i = 0; i < scored.length; i++) {
    if (i < count) {
      selected.push({ ...scored[i].item, status: 'selected' });
    } else {
      remaining.push({ ...scored[i].item });
    }
  }

  return { selected, remaining };
}

// ─── Group Engine ───────────────────────────────────────────────────────────

/**
 * Group discovered items by theme using slug pattern matching.
 * Items that don't match any pattern go to a fallback {dimension}/miscellaneous group.
 */
function groupDiscoveredItems(
  items: WorkItem[],
  dimensionWeights?: Record<string, number>
): WorkGroup[] {
  if (items.length === 0) return [];

  // Merge custom dimension weights with defaults
  const effectiveWeights: Record<string, number> = dimensionWeights
    ? Object.assign({}, DIMENSION_WEIGHTS, dimensionWeights)
    : DIMENSION_WEIGHTS;

  // Bucket items by theme
  const buckets = new Map<
    string,
    { dimension: string; theme: string; items: WorkItem[] }
  >();

  for (const item of items) {
    let theme: string | null = null;
    for (const { pattern, theme: t } of THEME_PATTERNS) {
      if (pattern.test(item.slug)) {
        theme = t;
        break;
      }
    }
    if (!theme) theme = 'miscellaneous';

    const key: string = `${item.dimension}/${theme}`;
    if (!buckets.has(key)) {
      buckets.set(key, { dimension: item.dimension, theme, items: [] });
    }
    buckets.get(key)!.items.push(item);
  }

  // Helper: score with effective weights
  const scoreWithWeights = (item: WorkItem): number => {
    const dimWeight: number = effectiveWeights[item.dimension] || 0;
    const effortMod: number = EFFORT_MODIFIERS[item.effort] || 0;
    const sourceMod: number = SOURCE_MODIFIERS[item.source] || 0;
    return dimWeight + effortMod + sourceMod;
  };

  // Convert buckets to group objects
  const groups: WorkGroup[] = [];
  for (const [key, bucket] of buckets) {
    const scoreSum: number = bucket.items.reduce((sum, i) => sum + scoreWithWeights(i), 0);
    const priority: number = scoreSum / bucket.items.length;
    const count: number = bucket.items.length;
    const effort: WorkItemEffort = count <= 3 ? 'small' : count <= 8 ? 'medium' : 'large';

    // Generate a readable title from the theme
    const titleTheme: string = bucket.theme
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    groups.push({
      id: key,
      theme: bucket.theme,
      dimension: bucket.dimension,
      title: `${titleTheme} (${bucket.dimension})`,
      items: bucket.items,
      priority,
      effort,
      status: 'pending',
    });
  }

  // Sort by priority descending
  groups.sort((a, b) => b.priority - a.priority);

  return groups;
}

/**
 * Select top N% of groups by priority.
 */
function selectPriorityGroups(
  groups: WorkGroup[],
  pickPct: number
): { selected: WorkGroup[]; remaining: WorkGroup[] } {
  if (groups.length === 0) return { selected: [], remaining: [] };

  const count: number = Math.max(1, Math.ceil((groups.length * pickPct) / 100));
  const selected: WorkGroup[] = groups
    .slice(0, count)
    .map((g) => ({ ...g, status: 'selected' }));
  const remaining: WorkGroup[] = groups.slice(count).map((g) => ({ ...g }));

  return { selected, remaining };
}

// ─── Discovery Orchestrator ─────────────────────────────────────────────────

/**
 * Run the full discovery flow: analyze codebase, merge with previous state,
 * and select priority items.
 */
async function runDiscovery(
  cwd: string,
  previousState: EvolveState | null
): Promise<{
  selected: WorkItem[];
  remaining: WorkItem[];
  all_discovered_count: number;
  merged_count: number;
}> {
  const freshItems: WorkItem[] = await discoverWithClaude(cwd);
  const allDiscoveredCount: number = freshItems.length;

  let mergePool: WorkItem[] = freshItems;

  if (previousState) {
    // Merge with remaining items from previous state
    if (previousState.remaining && previousState.remaining.length > 0) {
      mergePool = mergeWorkItems(previousState.remaining, freshItems);
    }
    // Merge in bugfix items from previous state
    if (previousState.bugfix && previousState.bugfix.length > 0) {
      mergePool = mergeWorkItems(mergePool, previousState.bugfix);
    }
  }

  const mergedCount: number = mergePool.length;
  const itemsPerIteration: number = previousState
    ? previousState.items_per_iteration || DEFAULT_ITEMS_PER_ITERATION
    : DEFAULT_ITEMS_PER_ITERATION;

  const { selected, remaining } = selectPriorityItems(mergePool, itemsPerIteration);

  return {
    selected,
    remaining,
    all_discovered_count: allDiscoveredCount,
    merged_count: mergedCount,
  };
}

/**
 * Run full discovery flow returning groups instead of flat items.
 */
async function runGroupDiscovery(
  cwd: string,
  previousState: EvolveGroupState | EvolveState | null,
  pickPct?: number
): Promise<GroupDiscoveryResult> {
  const freshItems: WorkItem[] = await discoverWithClaude(cwd);
  const allItemsCount: number = freshItems.length;

  let mergePool: WorkItem[] = freshItems;

  // Backward compat: old state with flat 'remaining' array
  const stateAsLegacy = previousState as EvolveState | null;
  const stateAsGroup = previousState as EvolveGroupState | null;

  if (previousState && stateAsLegacy?.remaining && !stateAsGroup?.remaining_groups) {
    const oldItems: WorkItem[] = stateAsLegacy.remaining.filter(
      (i: WorkItem) => i.status === 'pending'
    );
    if (stateAsLegacy.bugfix && stateAsLegacy.bugfix.length > 0) {
      mergePool = mergeWorkItems(mergeWorkItems(oldItems, freshItems), stateAsLegacy.bugfix);
    } else {
      mergePool = mergeWorkItems(oldItems, freshItems);
    }
  } else if (previousState && stateAsGroup?.remaining_groups) {
    // New format: merge previous remaining groups' items back into pool for re-grouping
    const prevItems: WorkItem[] = [];
    for (const group of stateAsGroup.remaining_groups) {
      if (group.status === 'pending') {
        prevItems.push(...group.items);
      }
    }
    mergePool = mergeWorkItems(prevItems, freshItems);
  }

  const effectivePickPct: number = pickPct !== undefined ? pickPct : DEFAULT_PICK_PCT;
  const groups: WorkGroup[] = groupDiscoveredItems(mergePool);
  const { selected, remaining } = selectPriorityGroups(groups, effectivePickPct);

  return {
    groups,
    selected_groups: selected,
    remaining_groups: remaining,
    all_items_count: allItemsCount,
    merged_items_count: mergePool.length,
    groups_count: groups.length,
  };
}

// ─── Evolve Loop Helpers ─────────────────────────────────────────────────────

/**
 * Run a single iteration step: discover groups, set up worktree if needed,
 * batch-execute, and batch-review.
 */
async function _runIterationStep(iterCtx: IterationContext): Promise<IterationStepResult> {
  const {
    discoveryCwd,
    state,
    effectivePickPct,
    dryRun,
    timeoutMs,
    maxTurns,
    cwd,
    log,
  } = iterCtx;

  let { useWorktree, worktreeInfo, executionCwd } = iterCtx;

  // 1. Discover and group (always from original cwd)
  const discovery: GroupDiscoveryResult = await runGroupDiscovery(
    discoveryCwd,
    state,
    effectivePickPct
  );
  log(
    `Discovered ${discovery.all_items_count} new + ${discovery.merged_items_count - discovery.all_items_count} carried-over = ${discovery.merged_items_count} total items, ${discovery.groups_count} groups, selected ${discovery.selected_groups.length}`
  );

  if (dryRun) {
    return { discovery, outcomes: [], worktreeInfo, executionCwd, useWorktree, isDryRun: true };
  }

  if (discovery.selected_groups.length === 0) {
    return { discovery, outcomes: null, worktreeInfo, executionCwd, useWorktree, isDryRun: false };
  }

  // Create worktree on first non-dry-run iteration if enabled
  if (useWorktree && !worktreeInfo) {
    const wtResult = createEvolveWorktree(cwd);
    if (wtResult.error) {
      log(`Worktree creation failed: ${wtResult.error}. Continuing without isolation.`);
      useWorktree = false;
    } else {
      worktreeInfo = wtResult;
      executionCwd = wtResult.path;
      log(`Created worktree at ${wtResult.path} (branch: ${wtResult.branch})`);
    }
  }

  // 2. Batch-execute ALL selected groups in one subprocess, then review once
  const outcomes: GroupOutcome[] = [];
  const allGroups: WorkGroup[] = discovery.selected_groups;
  const totalItems: number = allGroups.reduce((sum, g) => sum + g.items.length, 0);
  log(`Batch-executing ${allGroups.length} groups (${totalItems} items) in one subprocess`);

  const executePrompt: string = buildBatchExecutePrompt(allGroups);
  const execResult = await spawnClaudeAsync(executionCwd, executePrompt, {
    model: SONNET_MODEL,
    timeout: timeoutMs,
    maxTurns,
  });

  if (execResult.exitCode !== 0) {
    const reason: string = execResult.timedOut ? 'timeout' : `exit ${execResult.exitCode}`;
    log(`Batch execute FAILED (${reason})`);
    for (const group of allGroups) {
      outcomes.push({ group: group.id, status: 'fail', step: 'execute', reason });
    }
  } else {
    log(`Batch execute completed`);

    log(`Running single review for all ${allGroups.length} groups`);
    const reviewPrompt: string = buildBatchReviewPrompt(allGroups);
    const reviewResult = await spawnClaudeAsync(executionCwd, reviewPrompt, {
      model: SONNET_MODEL,
      timeout: timeoutMs,
      maxTurns,
    });

    if (reviewResult.exitCode !== 0) {
      const reason: string = reviewResult.timedOut ? 'timeout' : `exit ${reviewResult.exitCode}`;
      log(`Batch review FAILED (${reason}) — execution changes kept`);
    } else {
      log(`Batch review completed`);
    }

    for (const group of allGroups) {
      outcomes.push({ group: group.id, status: 'pass' });
    }
  }

  return { discovery, outcomes, worktreeInfo, executionCwd, useWorktree, isDryRun: false };
}

/**
 * Process the result of a single iteration step.
 */
function _handleIterationResult(
  stepResult: IterationStepResult,
  prevState: EvolveGroupState | null,
  iterNum: number,
  effectivePickPct: number,
  cwd: string
): HandleIterationReturn {
  const { discovery, outcomes } = stepResult;

  // Write evolution notes (always to original cwd)
  writeEvolutionNotes(cwd, {
    iteration: iterNum,
    items: discovery.selected_groups.flatMap((g) => g.items),
    outcomes: (outcomes || []).map((o) => ({
      item: o.group,
      status: o.status,
      step: o.step,
      reason: o.reason,
    })),
    decisions: [],
    patterns: [],
    takeaways: [],
  });

  // Compute completed and failed groups
  const milestone: string = prevState ? prevState.milestone : '';
  const completedGroups: WorkGroup[] = (outcomes || [])
    .filter((o) => o.status === 'pass')
    .map((o) => discovery.selected_groups.find((g) => g.id === o.group))
    .filter((g): g is WorkGroup => g !== undefined)
    .map((g) => ({ ...g, status: 'completed' }));
  const failedGroups: WorkGroup[] = (outcomes || [])
    .filter((o) => o.status === 'fail')
    .map((o) => discovery.selected_groups.find((g) => g.id === o.group))
    .filter((g): g is WorkGroup => g !== undefined)
    .map((g) => ({ ...g, status: 'failed' }));

  // Build new state
  const historyEntry: HistoryEntry = {
    iteration: iterNum,
    timestamp: new Date().toISOString(),
    selected_count: discovery.selected_groups.length,
    completed_count: completedGroups.length,
    failed_count: failedGroups.length,
  };
  const newState: EvolveGroupState = {
    iteration: iterNum,
    timestamp: new Date().toISOString(),
    milestone,
    pick_pct: effectivePickPct,
    selected_groups: discovery.selected_groups,
    remaining_groups: discovery.remaining_groups,
    completed_groups: completedGroups,
    failed_groups: failedGroups,
    all_items_count: discovery.all_items_count,
    groups_count: discovery.groups_count,
    history: prevState ? [...(prevState.history || []), historyEntry] : [historyEntry],
  };

  const iterResult: IterationResult = {
    iteration: iterNum,
    status: 'completed',
    groups_attempted: (outcomes || []).length,
    groups_passed: completedGroups.length,
    groups_failed: failedGroups.length,
    remaining_groups: discovery.remaining_groups.length,
  };

  return { newState, iterResult };
}

// ─── Orchestrator (Phase 56) ─────────────────────────────────────────────────

/**
 * Build a prompt for planning a work item improvement.
 */
function buildPlanPrompt(item: WorkItem): string {
  return [
    'Read CLAUDE.md for project conventions.',
    `Analyze the codebase for the following improvement opportunity:`,
    `Title: ${item.title}`,
    `Description: ${item.description}`,
    `Dimension: ${item.dimension}`,
    `Effort: ${item.effort}`,
    'Create a brief implementation plan: what files to change and what changes to make.',
    'Do NOT implement anything — only plan.',
  ].join('\n');
}

/**
 * Build a prompt for executing a work item improvement.
 */
function buildExecutePrompt(item: WorkItem): string {
  return [
    'Read CLAUDE.md for project conventions.',
    `Implement the following improvement:`,
    `Title: ${item.title}`,
    `Description: ${item.description}`,
    `Dimension: ${item.dimension}`,
    `Effort: ${item.effort}`,
    'Run `npm test` to verify changes do not break tests.',
    'Fix any test failures before completing.',
    'Keep changes focused and minimal.',
  ].join('\n');
}

/**
 * Build a prompt for reviewing an executed improvement.
 */
function buildReviewPrompt(item: WorkItem): string {
  return [
    `Review the improvement that was just made:`,
    `Title: ${item.title}`,
    `Description: ${item.description}`,
    'Run `npm test` and `npm run lint` to check for regressions.',
    'Verify the improvement was actually made.',
    'Fix any issues found.',
  ].join('\n');
}

/**
 * Build execution prompt for an entire group of work items.
 */
function buildGroupExecutePrompt(group: WorkGroup): string {
  const itemList: string = group.items
    .map((item, i) => `${i + 1}. ${item.title}: ${item.description}`)
    .join('\n');

  return [
    'Read CLAUDE.md for project conventions.',
    `Implement the following improvements (theme: ${group.theme}, dimension: ${group.dimension}):`,
    '',
    itemList,
    '',
    'Run `npm test` to verify changes do not break tests.',
    'Fix any test failures before completing.',
    'Keep changes focused and minimal.',
  ].join('\n');
}

/**
 * Build review prompt for an entire group after execution.
 */
function buildGroupReviewPrompt(group: WorkGroup): string {
  return [
    `Review the improvements that were just made for group: ${group.title}`,
    `Theme: ${group.theme}, Dimension: ${group.dimension}`,
    `${group.items.length} items were addressed.`,
    'Run `npm test` and `npm run lint` to check for regressions.',
    'Verify the improvements were actually made.',
    'Fix any issues found.',
  ].join('\n');
}

/**
 * Build a single execution prompt for ALL groups in an iteration.
 */
function buildBatchExecutePrompt(groups: WorkGroup[]): string {
  const sections: string[] = groups.map((group) => {
    const itemList: string = group.items
      .map((item, i) => `${i + 1}. ${item.title}: ${item.description}`)
      .join('\n');
    return `### ${group.title} (${group.dimension}/${group.theme})\n${itemList}`;
  });

  return [
    'Read CLAUDE.md for project conventions.',
    `Implement ALL of the following improvements across ${groups.length} groups:`,
    '',
    ...sections,
    '',
    'Do NOT run tests between groups — implement everything first.',
    'After ALL changes are done, run `npm test` once to verify nothing is broken.',
    'Fix any test failures before completing.',
    'Keep changes focused and minimal.',
  ].join('\n');
}

/**
 * Build a single review prompt for ALL groups after batch execution.
 */
function buildBatchReviewPrompt(groups: WorkGroup[]): string {
  const groupList: string = groups
    .map((g) => `- ${g.title} (${g.items.length} items)`)
    .join('\n');

  return [
    `Review ALL improvements that were just made across ${groups.length} groups:`,
    '',
    groupList,
    '',
    'Run `npm test` and `npm run lint` to check for regressions.',
    'Verify the improvements were actually made.',
    'Fix any issues found.',
  ].join('\n');
}

/**
 * Create or append evolution notes to .planning/EVOLUTION.md.
 */
function writeEvolutionNotes(cwd: string, iterationData: EvolutionNotesData): void {
  const filePath: string = path.join(cwd, '.planning', 'EVOLUTION.md');
  const { iteration, items, outcomes, decisions, patterns, takeaways } = iterationData;

  // Create file with header if it doesn't exist
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '# Evolution Notes\n\n');
  }

  const lines: string[] = [];
  lines.push(`## Iteration ${iteration}`);
  lines.push(`_${new Date().toISOString()}_\n`);

  // Items Attempted
  lines.push('### Items Attempted\n');
  if (items.length === 0) {
    lines.push('None\n');
  } else {
    for (let i = 0; i < items.length; i++) {
      const item: WorkItem = items[i];
      process.stderr.write(`[evolve] Writing item ${i + 1}/${items.length}: ${item.title}\n`);
      const outcome = outcomes.find((o) => o.item === item.title);
      const status: string = outcome ? outcome.status : 'unknown';
      lines.push(`- **${item.title}** — ${status}`);
    }
    lines.push('');
  }

  // Decisions Made
  lines.push('### Decisions Made\n');
  if (decisions.length === 0) {
    lines.push('None\n');
  } else {
    for (let i = 0; i < decisions.length; i++) {
      process.stderr.write(`[evolve] Writing decision ${i + 1}/${decisions.length}\n`);
      lines.push(`- ${decisions[i]}`);
    }
    lines.push('');
  }

  // Patterns Discovered
  lines.push('### Patterns Discovered\n');
  if (patterns.length === 0) {
    lines.push('None\n');
  } else {
    for (let i = 0; i < patterns.length; i++) {
      process.stderr.write(`[evolve] Writing pattern ${i + 1}/${patterns.length}\n`);
      lines.push(`- ${patterns[i]}`);
    }
    lines.push('');
  }

  // Takeaways
  lines.push('### Takeaways\n');
  if (takeaways.length === 0) {
    lines.push('None\n');
  } else {
    for (let i = 0; i < takeaways.length; i++) {
      process.stderr.write(`[evolve] Writing takeaway ${i + 1}/${takeaways.length}\n`);
      lines.push(`- ${takeaways[i]}`);
    }
    lines.push('');
  }

  lines.push('---\n');

  fs.appendFileSync(filePath, lines.join('\n'));
}

/**
 * Main evolve orchestration loop.
 */
async function runEvolve(cwd: string, options: EvolveOptions = {}): Promise<EvolveResult> {
  const { iterations = 1, pickPct, timeout, maxTurns, dryRun = false } = options;
  const effectivePickPct: number = pickPct !== undefined ? pickPct : DEFAULT_PICK_PCT;
  const timeoutMs: number | undefined = timeout ? timeout * 60 * 1000 : undefined;
  const unlimited: boolean = iterations === 0;

  // Auto-detect worktree usage from config if not explicitly set
  let useWorktree: boolean = options.useWorktree !== undefined ? options.useWorktree : false;
  if (options.useWorktree === undefined) {
    const config: GrdConfig = loadConfig(cwd);
    useWorktree = config.branching_strategy !== 'none';
  }

  // Set up logging (same pattern as autopilot.js)
  const logFile: string = path.join(cwd, '.planning', 'autopilot', 'evolve.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (msg: string): void => {
    const line: string = `[${new Date().toISOString()}] ${msg}\n`;
    process.stderr.write(`[evolve] ${msg}\n`);
    fs.appendFileSync(logFile, line);
  };

  // Two cwd variables: discovery always scans the original cwd,
  // execution may run in a worktree
  const discoveryCwd: string = cwd;
  let executionCwd: string = cwd;
  let worktreeInfo: WorktreeInfo | null = null;

  const results: Array<IterationResult | DryRunIterationResult> = [];
  let state: EvolveGroupState | EvolveState | null = readEvolveState(cwd);
  let iterCount: number = 0;

  while (unlimited || iterCount < iterations) {
    const iterNum: number = state ? state.iteration + 1 : 1;
    log(`Starting iteration ${iterNum}`);

    const stepResult: IterationStepResult = await _runIterationStep({
      discoveryCwd,
      executionCwd,
      state,
      useWorktree,
      worktreeInfo,
      effectivePickPct,
      dryRun,
      timeoutMs,
      maxTurns,
      cwd,
      log,
    });

    // Propagate mutable worktree state back from the step
    useWorktree = stepResult.useWorktree;
    worktreeInfo = stepResult.worktreeInfo;
    executionCwd = stepResult.executionCwd;

    if (stepResult.isDryRun) {
      const { discovery } = stepResult;
      const groupsPerIter: number = discovery.selected_groups.length;
      results.push({
        iteration: iterNum,
        status: 'dry-run' as const,
        groups: discovery.groups.map((g) => ({
          id: g.id,
          priority: g.priority,
          item_count: g.items.length,
          effort: g.effort,
        })),
        total_items: discovery.all_items_count,
        total_groups: discovery.groups_count,
        groups_per_iteration: groupsPerIter,
        estimated_iterations:
          groupsPerIter > 0 ? Math.ceil(discovery.groups_count / groupsPerIter) : 0,
      });
      break; // dry-run always exits after one iteration
    }

    if (stepResult.outcomes === null) {
      log('No groups to process. Done.');
      break;
    }

    const { newState, iterResult } = _handleIterationResult(
      stepResult,
      state as EvolveGroupState | null,
      iterNum,
      effectivePickPct,
      cwd
    );

    state = newState;
    writeEvolveState(cwd, state);
    results.push(iterResult);

    iterCount++;
  }

  // Post-loop: push + PR + cleanup if worktree was used
  let prInfo: { pr_url?: string; error?: string } | null = null;
  if (worktreeInfo) {
    // Check if there are any commits on the worktree branch
    const logResult = execGit(worktreeInfo.path, [
      'log',
      `${worktreeInfo.baseBranch}..HEAD`,
      '--oneline',
    ]);
    const hasCommits: boolean = logResult.exitCode === 0 && logResult.stdout.trim().length > 0;

    if (hasCommits) {
      log(`Pushing worktree branch and creating PR...`);
      prInfo = pushAndCreatePR(cwd, worktreeInfo.path, {
        base: worktreeInfo.baseBranch,
      });
      if (prInfo.error) {
        log(`PR creation failed: ${prInfo.error}`);
      } else {
        log(`PR created: ${prInfo.pr_url}`);
      }
    } else {
      log('No commits on worktree branch, skipping PR.');
    }

    // Clean up worktree
    const removeResult = removeEvolveWorktree(cwd, worktreeInfo.path);
    log(`Worktree cleanup: ${removeResult.removed ? 'removed' : 'failed'}`);
  }

  log(`Done: ${results.length} iteration(s) completed`);
  const returnValue: EvolveResult = {
    iterations_completed: results.length,
    results,
    evolution_notes_path: path.join('.planning', 'EVOLUTION.md'),
  };
  if (worktreeInfo) {
    returnValue.worktree = { path: worktreeInfo.path, branch: worktreeInfo.branch };
  }
  if (prInfo && !prInfo.error) {
    returnValue.pr = prInfo;
  }
  return returnValue;
}

/**
 * CLI entry point for the evolve command.
 */
async function cmdEvolve(cwd: string, args: string[], raw: boolean): Promise<void> {
  const flag = (name: string, fallback: string): string => {
    const i: number = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const hasFlag = (name: string): boolean => args.indexOf(name) !== -1;
  const options: EvolveOptions = {
    iterations: hasFlag('--iterations') ? parseInt(flag('--iterations', '1'), 10) : undefined,
    pickPct: hasFlag('--pick-pct')
      ? parseInt(flag('--pick-pct', String(DEFAULT_PICK_PCT)), 10)
      : undefined,
    timeout: hasFlag('--timeout') ? parseInt(flag('--timeout', '0'), 10) : undefined,
    maxTurns: hasFlag('--max-turns') ? parseInt(flag('--max-turns', '0'), 10) : undefined,
    dryRun: hasFlag('--dry-run'),
    useWorktree: hasFlag('--no-worktree') ? false : undefined,
  };
  const result: EvolveResult = await runEvolve(cwd, options);
  output(result, raw, raw ? JSON.stringify(result) : undefined);
  // Unreachable — output() calls process.exit()
  return undefined as never;
}

// ─── CLI Command Functions ─────────────────────────────────────────────────

/**
 * CLI entry point: run discovery and output results.
 */
async function cmdEvolveDiscover(cwd: string, args: string[], raw: boolean): Promise<void> {
  // Parse --pick-pct flag
  let pickPct: number = DEFAULT_PICK_PCT;
  const pctIdx: number = args.indexOf('--pick-pct');
  if (pctIdx !== -1 && args[pctIdx + 1]) {
    const parsed: number = parseInt(args[pctIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) pickPct = parsed;
  }

  const previousState: EvolveGroupState | EvolveState | null = readEvolveState(cwd);
  const discovery: GroupDiscoveryResult = await runGroupDiscovery(cwd, previousState, pickPct);

  const out = {
    groups: discovery.groups.map((g) => ({
      id: g.id,
      priority: g.priority,
      item_count: g.items.length,
      effort: g.effort,
    })),
    total_items: discovery.all_items_count,
    total_groups: discovery.groups_count,
    selected_count: discovery.selected_groups.length,
    pick_pct: pickPct,
  };

  output(
    out,
    raw,
    raw ? `${discovery.groups_count} groups (${discovery.all_items_count} items)` : undefined
  );
  // Unreachable — output() calls process.exit()
  return undefined as never;
}

/**
 * CLI entry point: read and output the current evolve state.
 */
function cmdEvolveState(cwd: string, _args: string[], raw: boolean): void {
  const state: EvolveGroupState | EvolveState | null = readEvolveState(cwd);

  if (state === null) {
    const out = { exists: false, state: null };
    output(out, raw, raw ? 'No evolve state found' : undefined);
  } else {
    const out = { exists: true, state };
    output(out, raw, raw ? JSON.stringify(state) : undefined);
  }
  // Unreachable — output() calls process.exit()
}

/**
 * CLI entry point: advance to the next iteration.
 */
function cmdEvolveAdvance(cwd: string, _args: string[], raw: boolean): void {
  const previousState: EvolveGroupState | EvolveState | null = readEvolveState(cwd);

  if (previousState === null) {
    error('No evolve state found. Run discover first.');
    // Unreachable — error() calls process.exit()
    return undefined as never;
  }

  const newState: EvolveState = advanceIteration(previousState as EvolveState);
  writeEvolveState(cwd, newState);

  output(newState, raw, raw ? `iteration ${newState.iteration}` : undefined);
  // Unreachable — output() calls process.exit()
}

/**
 * CLI entry point: delete the evolve state file (start fresh).
 */
function cmdEvolveReset(cwd: string, _args: string[], raw: boolean): void {
  const filePath: string = evolveStatePath(cwd);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File doesn't exist — that's fine
  }

  output({ reset: true }, raw, raw ? 'Evolve state reset' : undefined);
  // Unreachable — output() calls process.exit()
}

/**
 * CLI entry point: pre-flight context for the evolve workflow.
 */
function cmdInitEvolve(cwd: string, raw: boolean): void {
  const config: GrdConfig = loadConfig(cwd);
  const backend: string = detectBackend(cwd);
  const capabilities: BackendCapabilities = getBackendCapabilities(backend);
  const state: EvolveGroupState | EvolveState | null = readEvolveState(cwd);
  const plannerModel: string = resolveModelForAgent(config, 'grd-planner', cwd);
  const executorModel: string = resolveModelForAgent(config, 'grd-executor', cwd);
  const milestone: MilestoneInfo = getMilestoneInfo(cwd);

  // Extract group state fields (works for both EvolveGroupState and EvolveState)
  const groupState = state as EvolveGroupState | null;

  const result = {
    backend,
    capabilities,
    config: {
      model_profile: config.model_profile || 'balanced',
      autonomous_mode: config.autonomous_mode || false,
      pick_pct: (groupState && groupState.pick_pct) || DEFAULT_PICK_PCT,
    },
    evolve_state: {
      exists: state !== null,
      iteration: state ? state.iteration : 0,
      remaining_groups_count: groupState ? (groupState.remaining_groups || []).length : 0,
      completed_groups_count: groupState ? (groupState.completed_groups || []).length : 0,
      failed_groups_count: groupState ? (groupState.failed_groups || []).length : 0,
      groups_count: groupState ? groupState.groups_count || 0 : 0,
      all_items_count: groupState ? groupState.all_items_count || 0 : 0,
    },
    models: {
      planner: plannerModel,
      executor: executorModel,
    },
    milestone,
  };

  output(result, raw, raw ? JSON.stringify(result) : undefined);
  // Unreachable — output() calls process.exit()
}

// ─── Todos Integration ───────────────────────────────────────────────────────

/**
 * Write discovered groups as todo files into .planning/milestones/anonymous/todos/pending/.
 */
function writeDiscoveriesToTodos(cwd: string, groups: WorkGroup[]): number {
  if (!groups || groups.length === 0) return 0;

  const pendingDir: string = path.join(
    cwd,
    '.planning',
    'milestones',
    'anonymous',
    'todos',
    'pending'
  );
  fs.mkdirSync(pendingDir, { recursive: true });

  // Get existing files to support idempotency
  let existingFiles: Set<string>;
  try {
    existingFiles = new Set(fs.readdirSync(pendingDir) as string[]);
  } catch {
    existingFiles = new Set();
  }

  let created: number = 0;
  const now: string = new Date().toISOString();

  for (const group of groups) {
    // Derive a stable filename from the group id (replace / with -)
    const idSlug: string = group.id.replace(/\//g, '-').replace(/[^a-z0-9-]/gi, '-');
    const filename: string = `evolve-${idSlug}.md`;

    if (existingFiles.has(filename)) {
      continue; // Already exists — skip
    }

    const itemCount: number = Array.isArray(group.items) ? group.items.length : 0;
    const itemList: string = Array.isArray(group.items)
      ? group.items.map((i) => `- **${i.title}**: ${i.description}`).join('\n')
      : '';

    const content: string = [
      '---',
      `title: "${group.theme || group.id}"`,
      `created: "${now}"`,
      `area: "${group.dimension || 'unknown'}"`,
      `source: evolve-discovery`,
      '---',
      '',
      `## ${group.theme || group.id}`,
      '',
      `**${itemCount} item${itemCount !== 1 ? 's' : ''}** discovered by evolve loop.`,
      '',
      itemList,
    ].join('\n');

    fs.writeFileSync(path.join(pendingDir, filename), content + '\n');
    existingFiles.add(filename);
    created++;
  }

  return created;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  EVOLVE_STATE_FILENAME,
  WORK_ITEM_DIMENSIONS,
  DEFAULT_ITEMS_PER_ITERATION,
  DEFAULT_PICK_PCT,
  THEME_PATTERNS,
  // Work item factory
  createWorkItem,
  // State path
  evolveStatePath,
  // State I/O
  readEvolveState,
  writeEvolveState,
  // State creation
  createInitialState,
  // Merge logic
  mergeWorkItems,
  // Iteration advancement
  advanceIteration,
  // Discovery engine
  discoverImproveFeatureItems,
  analyzeCodebaseForItems,
  buildCodebaseDigest,
  buildDiscoveryPrompt,
  discoverWithClaude,
  parseDiscoveryOutput,
  // Scoring heuristic
  scoreWorkItem,
  // Priority selection
  selectPriorityItems,
  // Group engine
  groupDiscoveredItems,
  selectPriorityGroups,
  // Discovery orchestrator
  runDiscovery,
  runGroupDiscovery,
  // Orchestrator (Phase 56)
  SONNET_MODEL,
  buildPlanPrompt,
  buildExecutePrompt,
  buildReviewPrompt,
  buildGroupExecutePrompt,
  buildGroupReviewPrompt,
  writeEvolutionNotes,
  writeDiscoveriesToTodos,
  runEvolve,
  cmdEvolve,
  // CLI command functions
  cmdEvolveDiscover,
  cmdEvolveState,
  cmdEvolveAdvance,
  cmdEvolveReset,
  cmdInitEvolve,
};
