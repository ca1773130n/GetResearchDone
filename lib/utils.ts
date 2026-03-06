/**
 * GRD Shared Utilities -- Constants, helpers, and validation functions
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * These are zero-dependency foundations used by all other modules.
 */

'use strict';

import type {
  GrdConfig,
  GrdTimeouts,
  ExecGitResult,
  PhaseInfo,
  MilestoneInfo,
  ModelTier,
  ModelProfileName,
  RunCache,
  AgentModelProfiles,
} from './types';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { detectBackend, resolveBackendModel } = require('./backend');
const { phasesDir: getPhasesDirPath } = require('./paths');

// ─── Git Operation Whitelist ────────────────────────────────────────────────

const GIT_ALLOWED_COMMANDS: Set<string> = new Set([
  'add',
  'commit',
  'log',
  'status',
  'diff',
  'show',
  'rev-parse',
  'cat-file',
  'check-ignore',
  'ls-files',
  'branch',
  'checkout',
  'merge',
  'rebase',
  'cherry-pick',
  'tag',
  'stash',
  'remote',
  'fetch',
  'pull',
]);
const GIT_BLOCKED_COMMANDS: Set<string> = new Set(['config', 'push', 'clean']);
const GIT_BLOCKED_FLAGS: Set<string> = new Set(['--force', '-f', '--hard', '--delete', '-D']);

// ─── Model Profile Table ─────────────────────────────────────────────────────

const MODEL_PROFILES: AgentModelProfiles = {
  'grd-planner': { quality: 'opus', balanced: 'opus', budget: 'sonnet' },
  'grd-roadmapper': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'grd-executor': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'grd-phase-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'grd-project-researcher': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'grd-research-synthesizer': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'grd-debugger': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'grd-codebase-mapper': { quality: 'sonnet', balanced: 'haiku', budget: 'haiku' },
  'grd-verifier': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'grd-plan-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'grd-integration-checker': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  // R&D-specific agents
  'grd-surveyor': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'grd-deep-diver': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'grd-feasibility-analyst': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  'grd-eval-planner': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  'grd-eval-reporter': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  'grd-product-owner': { quality: 'opus', balanced: 'opus', budget: 'sonnet' },
  'grd-baseline-assessor': { quality: 'sonnet', balanced: 'sonnet', budget: 'haiku' },
  // Development practice agents
  'grd-code-reviewer': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse --include flag from CLI args into a Set of included items.
 * @param args - CLI argument array
 * @returns Set of comma-separated include values, or empty Set if not present
 */
function parseIncludeFlag(args: string[]): Set<string> {
  const includeIndex: number = args.indexOf('--include');
  if (includeIndex === -1) return new Set();
  const includeValue: string | undefined = args[includeIndex + 1];
  if (!includeValue) return new Set();
  return new Set(includeValue.split(',').map((s: string) => s.trim()));
}

/**
 * Read file returning content or null on error.
 * @param filePath - Absolute path to the file
 * @returns File content as UTF-8 string, or null if read fails
 */
function safeReadFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Read a markdown file, transparently handling GRD split-format index files.
 * If the file is a GRD index (contains <!-- GRD-INDEX --> marker), partials are
 * automatically reassembled. Otherwise, returns the file content as-is.
 * @param filePath - Absolute path to the markdown file
 * @returns File content (reassembled if split), or null on error
 */
function safeReadMarkdown(filePath: string): string | null {
  try {
    // Lazy require to avoid circular dependency (markdown-split.js imports safeReadFile from utils.js)
    const { readMarkdownWithPartials } = require('./markdown-split');
    return readMarkdownWithPartials(filePath) as string;
  } catch {
    return null;
  }
}

/**
 * Read and parse a JSON file, returning the default value on any error.
 * @param filePath - Absolute path to the JSON file
 * @param defaultValue - Value to return if read or parse fails
 * @returns Parsed JSON object, or defaultValue on error
 */
function safeReadJSON(filePath: string, defaultValue: unknown = null): unknown {
  try {
    const raw: string = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

/**
 * Extract content under a markdown heading (## or ### level).
 * @param content - Full markdown content
 * @param heading - Heading text to find (case-insensitive)
 * @param level - Heading level (2 for ##, 3 for ###)
 * @returns Section content (without the heading line), or null if not found
 */
function extractMarkdownSection(content: string, heading: string, level: number = 2): string | null {
  const prefix: string = '#'.repeat(level);
  const regex: RegExp = new RegExp(
    `${prefix}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n${prefix}\\s|$)`,
    'i'
  );
  const match: RegExpMatchArray | null = content.match(regex);
  return match ? match[1] : null;
}

// ─── Levenshtein Distance ────────────────────────────────────────────────────

/**
 * Compute the Levenshtein edit distance between two strings.
 * @param s1 - First string
 * @param s2 - Second string
 * @returns Edit distance
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m: number = s1.length;
  const n: number = s2.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) {
      if (i === 0) {
        dp[i][j] = j;
      } else {
        dp[i][j] = 0;
      }
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Find the closest command name from a list of commands using Levenshtein distance.
 * Returns null if no command is close enough (distance > threshold) or if input is invalid.
 * @param input - User input to match
 * @param commands - List of valid command names
 * @returns The closest command name, or null if too different
 */
function findClosestCommand(input: string | null, commands: string[]): string | null {
  if (!input || !commands || commands.length === 0) return null;
  const lower: string = input.toLowerCase();
  let best: string | null = null;
  let bestDist: number = Infinity;
  for (const cmd of commands) {
    const dist: number = levenshteinDistance(lower, cmd.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = cmd;
    }
  }
  // Threshold: only suggest if distance is at most 3 (reasonable typo range)
  const threshold: number = Math.max(3, Math.floor(best ? best.length / 3 : 3));
  if (bestDist > threshold) return null;
  return best;
}

// ─── Phase Cache ─────────────────────────────────────────────────────────────

const _phaseCache: Map<string, string> = new Map();

/**
 * Clear the internal phase directory cache.
 */
function clearPhaseCache(): void {
  _phaseCache.clear();
}

/**
 * Known top-level config keys (used for unrecognized key warnings).
 */
const KNOWN_CONFIG_KEYS: Set<string> = new Set([
  'model_profile',
  'commit_docs',
  'search_gitignored',
  'branching_strategy',
  'phase_branch_template',
  'milestone_branch_template',
  'base_branch',
  'research',
  'plan_checker',
  'verifier',
  'parallelization',
  'code_review_enabled',
  'code_review_timing',
  'code_review_severity_gate',
  'code_review_auto_fix_warnings',
  'use_teams',
  'team_timeout_minutes',
  'max_concurrent_teammates',
  'backend',
  'backend_models',
  'autonomous_mode',
  // Nested section keys (objects)
  'code_review',
  'execution',
  'git',
  'planning',
  'workflow',
  'tracker',
  'eval_config',
  'ceremony',
  'phase_cleanup',
  'research_gates',
  'confirmation_gates',
  'timeouts',
  'evolve',
]);

/**
 * Load and merge .planning/config.json with default configuration values.
 * @param cwd - Project working directory
 * @returns Merged configuration object with all fields populated
 */
function loadConfig(cwd: string): GrdConfig {
  const configPath: string = path.join(cwd, '.planning', 'config.json');
  const defaultTimeouts: GrdTimeouts = {
    jest_ms: 120000,
    lint_ms: 60000,
    format_ms: 60000,
    consistency_ms: 30000,
    tracker_gh_ms: 30000,
    tracker_auth_ms: 10000,
    backend_detect_ms: 10000,
    autopilot_check_ms: 5000,
  };
  const defaults: GrdConfig = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
    milestone_branch_template: 'grd/{milestone}-{slug}',
    base_branch: 'main',
    research: true,
    plan_checker: true,
    verifier: true,
    parallelization: true,
    // Code review defaults
    code_review_enabled: true,
    code_review_timing: 'per_wave',
    code_review_severity_gate: 'blocker',
    code_review_auto_fix_warnings: false,
    // Execution defaults
    use_teams: false,
    team_timeout_minutes: 30,
    max_concurrent_teammates: 4,
    // Backend config (pass-through, no defaults)
    backend: undefined,
    backend_models: undefined,
    // Autonomous mode
    autonomous_mode: false,
    // Ceremony config
    ceremony: undefined,
    // Timeout defaults (ms)
    timeouts: defaultTimeouts,
    // Evolve config
    evolve: undefined,
  };

  try {
    const raw: string = fs.readFileSync(configPath, 'utf-8');
    const parsed: Record<string, unknown> = JSON.parse(raw);

    // Warn about unrecognized top-level config keys
    for (const key of Object.keys(parsed)) {
      if (!KNOWN_CONFIG_KEYS.has(key)) {
        process.stderr.write(
          `Warning: Unrecognized config key "${key}" in .planning/config.json\n`
        );
      }
    }

    // Warn about invalid model_profile values
    const validProfiles: string[] = ['quality', 'balanced', 'budget'];
    if (parsed.model_profile !== undefined && !validProfiles.includes(parsed.model_profile as string)) {
      process.stderr.write(
        `Warning: Invalid model_profile value "${parsed.model_profile}" in .planning/config.json. Valid values: ${validProfiles.join(', ')}\n`
      );
    }

    const get = (key: string, nested?: { section: string; field: string }): unknown => {
      if (parsed[key] !== undefined) return parsed[key];
      if (nested) {
        const section = parsed[nested.section] as Record<string, unknown> | undefined;
        if (section && section[nested.field] !== undefined) {
          return section[nested.field];
        }
      }
      return undefined;
    };

    const parallelization: boolean = ((): boolean => {
      const val: unknown = get('parallelization');
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null && 'enabled' in (val as Record<string, unknown>)) return (val as Record<string, unknown>).enabled as boolean;
      return defaults.parallelization;
    })();

    return {
      model_profile: (get('model_profile') ?? defaults.model_profile) as ModelProfileName,
      commit_docs:
        (get('commit_docs', { section: 'planning', field: 'commit_docs' }) ?? defaults.commit_docs) as boolean,
      search_gitignored:
        (get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ??
        defaults.search_gitignored) as boolean,
      branching_strategy:
        (get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ??
        defaults.branching_strategy) as string,
      phase_branch_template:
        (get('phase_branch_template', { section: 'git', field: 'phase_branch_template' }) ??
        defaults.phase_branch_template) as string,
      milestone_branch_template:
        (get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ??
        defaults.milestone_branch_template) as string,
      base_branch:
        (get('base_branch', { section: 'git', field: 'base_branch' }) ?? defaults.base_branch) as string,
      research: (get('research', { section: 'workflow', field: 'research' }) ?? defaults.research) as boolean,
      plan_checker:
        (get('plan_checker', { section: 'workflow', field: 'plan_check' }) ?? defaults.plan_checker) as boolean,
      verifier: (get('verifier', { section: 'workflow', field: 'verifier' }) ?? defaults.verifier) as boolean,
      parallelization,
      // Code review config
      code_review_enabled:
        (get('code_review_enabled', { section: 'code_review', field: 'enabled' }) ??
        defaults.code_review_enabled) as boolean,
      code_review_timing:
        (get('code_review_timing', { section: 'code_review', field: 'timing' }) ??
        defaults.code_review_timing) as string,
      code_review_severity_gate:
        (get('code_review_severity_gate', { section: 'code_review', field: 'severity_gate' }) ??
        defaults.code_review_severity_gate) as string,
      code_review_auto_fix_warnings:
        (get('code_review_auto_fix_warnings', {
          section: 'code_review',
          field: 'auto_fix_warnings',
        }) ?? defaults.code_review_auto_fix_warnings) as boolean,
      // Execution config
      use_teams:
        (get('use_teams', { section: 'execution', field: 'use_teams' }) ?? defaults.use_teams) as boolean,
      team_timeout_minutes:
        (get('team_timeout_minutes', { section: 'execution', field: 'team_timeout_minutes' }) ??
        defaults.team_timeout_minutes) as number,
      max_concurrent_teammates:
        (get('max_concurrent_teammates', {
          section: 'execution',
          field: 'max_concurrent_teammates',
        }) ?? defaults.max_concurrent_teammates) as number,
      // Backend config (pass-through, no defaults)
      backend: (parsed.backend || undefined) as string | undefined,
      backend_models: (parsed.backend_models || undefined) as GrdConfig['backend_models'],
      // Autonomous mode
      autonomous_mode: (get('autonomous_mode') ?? false) as boolean,
      // Ceremony config (pass-through)
      ceremony: (parsed.ceremony || undefined) as GrdConfig['ceremony'],
      // Evolve config
      evolve: ((): GrdConfig['evolve'] => {
        const e = parsed.evolve && typeof parsed.evolve === 'object' ? parsed.evolve as Record<string, unknown> : null;
        if (!e) return undefined;
        return {
          auto_commit: (e.auto_commit ?? true) as boolean,
          create_pr: (e.create_pr ?? true) as boolean,
        };
      })(),
      // Timeouts config
      timeouts: ((): GrdTimeouts => {
        const t: Record<string, unknown> = parsed.timeouts && typeof parsed.timeouts === 'object' ? parsed.timeouts as Record<string, unknown> : {};
        const d: GrdTimeouts = defaultTimeouts;
        return {
          jest_ms: (t.jest_ms ?? d.jest_ms) as number,
          lint_ms: (t.lint_ms ?? d.lint_ms) as number,
          format_ms: (t.format_ms ?? d.format_ms) as number,
          consistency_ms: (t.consistency_ms ?? d.consistency_ms) as number,
          tracker_gh_ms: (t.tracker_gh_ms ?? d.tracker_gh_ms) as number,
          tracker_auth_ms: (t.tracker_auth_ms ?? d.tracker_auth_ms) as number,
          backend_detect_ms: (t.backend_detect_ms ?? d.backend_detect_ms) as number,
          autopilot_check_ms: (t.autopilot_check_ms ?? d.autopilot_check_ms) as number,
        };
      })(),
    };
  } catch {
    return defaults;
  }
}

/**
 * Check if a file path is git-ignored via git check-ignore.
 * @param cwd - Project working directory
 * @param targetPath - Path to check against .gitignore rules
 * @returns True if the path is git-ignored, false otherwise
 */
function isGitIgnored(cwd: string, targetPath: string): boolean {
  if (targetPath.includes('\0')) return false;
  try {
    execFileSync('git', ['check-ignore', '-q', '--', targetPath], {
      cwd,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a git command with whitelist enforcement for security.
 * @param cwd - Project working directory
 * @param args - Git command arguments (first element is the subcommand)
 * @param opts - Options object
 * @returns Command result with exit code and output
 */
function execGit(cwd: string, args: string[], opts: { allowBlocked?: boolean } = {}): ExecGitResult {
  // Git operation whitelist enforcement
  const subcommand: string | undefined = args[0];
  if (subcommand && GIT_BLOCKED_COMMANDS.has(subcommand) && !opts.allowBlocked) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Blocked: "git ${subcommand}" is not allowed by the GRD security policy. Pass { allowBlocked: true } to override.`,
    };
  }
  if (!opts.allowBlocked) {
    for (const arg of args) {
      if (GIT_BLOCKED_FLAGS.has(arg)) {
        return {
          exitCode: 1,
          stdout: '',
          stderr: `Blocked: flag "${arg}" is not allowed by the GRD security policy. Pass { allowBlocked: true } to override.`,
        };
      }
    }
  }
  try {
    const stdout: string = execFileSync('git', args, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err: unknown) {
    const gitErr = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      exitCode: gitErr.status ?? 1,
      stdout: (gitErr.stdout ?? '').toString().trim(),
      stderr: (gitErr.stderr ?? '').toString().trim(),
    };
  }
}

/**
 * Normalize a phase identifier by zero-padding and validating format.
 * @param phase - Phase identifier (e.g., "7", "07", "07.1")
 * @returns Normalized phase name with zero-padded number (e.g., "07", "07.1")
 * @throws If phase is not a string or contains path traversal/directory separators
 */
function normalizePhaseName(phase: string): string {
  if (typeof phase !== 'string') throw new Error('Phase must be a string');
  if (phase.includes('..')) throw new Error('Phase name must not contain path traversal (..)');
  if (phase.includes('/') || phase.includes('\\'))
    throw new Error('Phase name must not contain directory separators');
  const match: RegExpMatchArray | null = phase.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return phase;
  const num: string = match[1];
  const parts: string[] = num.split('.');
  const padded: string = parts[0].padStart(2, '0');
  return parts.length > 1 ? `${padded}.${parts[1]}` : padded;
}

const CODE_EXTENSIONS: Set<string> = new Set(['.ts', '.js', '.py', '.go', '.rs', '.swift', '.java']);

/**
 * Recursively find code files up to a maximum depth, capped at 5 results.
 * @param dir - Directory to search in
 * @param maxDepth - Maximum directory depth to recurse into
 * @param found - Accumulator array of found file paths
 * @param depth - Current recursion depth
 * @returns Array of absolute paths to code files found
 */
function findCodeFiles(dir: string, maxDepth: number, found: string[], depth: number): string[] {
  if (depth > maxDepth || found.length >= 5) return found;
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (found.length >= 5) break;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath: string = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findCodeFiles(fullPath, maxDepth, found, depth + 1);
    } else if (entry.isFile()) {
      const ext: string = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext)) {
        found.push(fullPath);
      }
    }
  }
  return found;
}

// ─── Input Validation ────────────────────────────────────────────────────────

/**
 * Validate phase name format strictly, rejecting path traversal and invalid characters.
 * @param phase - Phase name to validate
 * @returns The validated phase name if valid
 * @throws If phase format is invalid, contains traversal, null bytes, or separators
 */
function validatePhaseName(phase: string): string {
  if (typeof phase !== 'string') throw new Error('Phase must be a string');
  if (phase.includes('..')) throw new Error('Phase name must not contain path traversal (..)');
  if (phase.includes('/') || phase.includes('\\'))
    throw new Error('Phase name must not contain directory separators');
  if (phase.includes('\0')) throw new Error('Phase name must not contain null bytes');
  if (!/^\d+(?:\.\d+)?(?:-[a-zA-Z0-9-]+)?$/.test(phase)) {
    throw new Error(
      'Invalid phase name format: must be digits with optional decimal and kebab-case suffix'
    );
  }
  return phase;
}

/**
 * Validate that a file path does not escape the project directory.
 * @param filePath - File path to validate (relative or absolute)
 * @param cwd - Project working directory used as security boundary
 * @returns The validated file path if safe
 * @throws If path is not a string, contains null bytes, or escapes project directory
 */
function validateFilePath(filePath: string, cwd: string): string {
  if (typeof filePath !== 'string') throw new Error('File path must be a string');
  if (filePath.includes('\0')) throw new Error('File path must not contain null bytes');
  const resolved: string = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd)) throw new Error('File path must not escape project directory');
  return filePath;
}

/**
 * Validate git ref format, preventing flag injection and path traversal.
 * @param ref - Git reference to validate (commit hash, branch name, tag)
 * @returns The validated git ref if valid
 * @throws If ref is invalid, starts with dash, contains traversal, or has invalid characters
 */
function validateGitRef(ref: string): string {
  if (typeof ref !== 'string') throw new Error('Git ref must be a string');
  if (ref.startsWith('-')) throw new Error('Git ref must not start with a dash (flag injection)');
  if (ref.includes('..')) throw new Error('Git ref must not contain path traversal (..)');
  if (!/^[a-zA-Z0-9._\-/~^]+$/.test(ref)) throw new Error('Git ref contains invalid characters');
  if (ref.length > 256) throw new Error('Git ref too long');
  return ref;
}

// ─── CLI Argument Validation ──────────────────────────────────────────────────

/**
 * Validate CLI phase number argument, ensuring it is present and well-formed.
 * @param phase - Phase number from CLI arguments
 * @returns The validated phase number
 * @throws If phase is missing or not in valid format (digits with optional decimal)
 */
function validatePhaseArg(phase: string): string {
  if (phase == null || phase === '') throw new Error('Phase number is required');
  if (typeof phase !== 'string') throw new Error('Phase number is required');
  if (!/^\d+(?:\.\d+)?(?:-[a-zA-Z0-9-]+)?$/.test(phase)) {
    throw new Error('Invalid phase number: must be digits with optional decimal (e.g., 01, 02.1)');
  }
  return phase;
}

/**
 * Validate CLI file path argument, ensuring it is present and does not escape project.
 * @param filePath - File path from CLI arguments
 * @param cwd - Project working directory used as security boundary
 * @returns The validated file path
 * @throws If file path is missing or escapes project directory
 */
function validateFileArg(filePath: string, cwd: string): string {
  if (filePath == null || filePath === '') throw new Error('File path is required');
  return validateFilePath(filePath, cwd);
}

/**
 * Validate CLI subcommand against a list of valid subcommands.
 * @param sub - Subcommand string from CLI arguments
 * @param validSubs - Array of valid subcommand names
 * @param parentCmd - Parent command name for error messages
 * @returns The validated subcommand
 * @throws If subcommand is missing or not in the valid list
 */
function validateSubcommand(sub: string, validSubs: string[], parentCmd: string): string {
  if (sub == null || sub === '') {
    throw new Error(`Subcommand required for '${parentCmd}'. Available: ${validSubs.join(', ')}`);
  }
  if (!validSubs.includes(sub)) {
    throw new Error(
      `Unknown ${parentCmd} subcommand: '${sub}'. Available: ${validSubs.join(', ')}`
    );
  }
  return sub;
}

/**
 * Validate that a required CLI argument is present and non-empty.
 * @param value - Argument value to check
 * @param argName - Name of the argument for error messages
 * @returns The validated value
 * @throws If value is null, undefined, or empty string
 */
function validateRequiredArg(value: unknown, argName: string): unknown {
  if (value == null || value === '') throw new Error(`${argName} is required`);
  return value;
}

// ─── Output ──────────────────────────────────────────────────────────────────

/**
 * Write JSON or raw output to stdout and exit with code 0.
 * @param result - Result object to serialize as JSON
 * @param raw - If true, output rawValue as plain text instead of JSON
 * @param rawValue - Plain text value to output when raw is true
 */
function output(result: unknown, raw: boolean, rawValue?: unknown): never {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }
  process.exit(0);
}

/**
 * Write error message to stderr and exit with code 1.
 * @param message - Error message to display
 */
function error(message: string): never {
  process.stderr.write('Error: ' + message + '\n');
  process.exit(1);
}

/**
 * Write debug message to stderr when GRD_DEBUG environment variable is set.
 * No-op in normal operation; enabled by setting GRD_DEBUG=1 (or any truthy value).
 * @param message - Debug message to display
 * @param data - Optional data to JSON-stringify alongside the message
 */
function debugLog(message: string, data?: unknown): void {
  if (!process.env.GRD_DEBUG) return;
  const prefix: string = '[grd:debug] ';
  if (data !== undefined) {
    process.stderr.write(prefix + message + ' ' + JSON.stringify(data) + '\n');
  } else {
    process.stderr.write(prefix + message + '\n');
  }
}

// ─── Shared Cache Factory ─────────────────────────────────────────────────────

/**
 * Create a run-scoped file content cache.
 * Returns a cache object with `get`, `init`, and `reset` methods.
 * Modules can use this to avoid redundant disk reads within a single CLI invocation.
 *
 * Usage pattern:
 *   const cache = createRunCache();
 *   cache.init();           // activate caching for this run
 *   cache.get(p, reader)   // returns cached value or calls reader(p) and stores result
 *   cache.reset();          // deactivate and clear
 *
 * @returns Cache object with init, reset, and get methods
 */
function createRunCache(): RunCache {
  let _map: Map<string, unknown> | null = null;
  return {
    /** Activate the cache (creates a new Map). */
    init(): void {
      _map = new Map();
    },
    /** Deactivate and clear the cache. */
    reset(): void {
      _map = null;
    },
    /**
     * Get a cached value, or compute it with `reader(key)` and store the result.
     * Falls back to calling `reader(key)` directly if the cache is not active.
     * @param key - Cache key (typically a file path)
     * @param reader - Function to produce the value if not cached
     * @returns The cached or freshly computed value
     */
    get(key: string, reader: (key: string) => unknown): unknown {
      if (!_map) return reader(key);
      if (!_map.has(key)) _map.set(key, reader(key));
      return _map.get(key);
    },
  };
}

// ─── Phase Directory Utilities ────────────────────────────────────────────────

/**
 * Find a phase directory name inside `phasesDir` that matches `phaseArg`.
 * Matches by exact normalized name or by prefix `<normalized>-`.
 * @param phasesDir - Absolute path to the phases directory
 * @param phaseArg - Phase identifier (e.g., '1', '01', '1.1')
 * @returns The matching directory name, or null if not found
 */
function findPhaseDir(phasesDir: string, phaseArg: string): string | null {
  const normalized: string = normalizePhaseName(phaseArg);
  try {
    const entries: { name: string; isDirectory: () => boolean }[] = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs: string[] = entries
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name)
      .sort();
    return dirs.find((d: string) => d.startsWith(normalized + '-') || d === normalized) || null;
  } catch {
    return null;
  }
}

/**
 * Parse a phase number from a directory name or plain string.
 * Handles formats like '01-feature-name', '1.2-sub', '1', etc.
 * @param str - Directory name or phase string to parse
 * @returns The numeric phase number as a string (e.g. '1', '1.2'), or null
 */
function parsePhaseNumber(str: string): string | null {
  if (!str) return null;
  const match: RegExpMatchArray | null = str.match(/^(\d+(?:\.\d+)?)/);
  return match ? match[1] : null;
}

// ─── Directory Walking ────────────────────────────────────────────────────────

/**
 * Recursively collect JavaScript file paths under `rootDir`.
 * Skips `node_modules`, `.git`, `.planning`, and any paths matching `excludePatterns`.
 * @param rootDir - Root directory to walk (returned paths are relative to this)
 * @param excludePatterns - Substrings; any relative path containing one is skipped
 * @returns Relative paths of all .js files found
 */
function walkJsFiles(rootDir: string, excludePatterns: string[] = []): string[] {
  const results: string[] = [];
  _walkJsDir(rootDir, rootDir, results, excludePatterns);
  return results;
}

function _walkJsDir(rootDir: string, currentDir: string, results: string[], excludePatterns: string[]): void {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath: string = path.join(currentDir, entry.name);
    const relPath: string = path.relative(rootDir, fullPath);
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.planning') {
      continue;
    }
    if (excludePatterns.some((p: string) => relPath.includes(p))) continue;
    if (entry.isDirectory()) {
      _walkJsDir(rootDir, fullPath, results, excludePatterns);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(relPath);
    }
  }
}

// ─── Compound Helpers ────────────────────────────────────────────────────────

/**
 * Resolve the model name for a given agent type from project configuration.
 * @param cwd - Project working directory
 * @param agentType - Agent type key (e.g., 'grd-executor', 'grd-planner')
 * @returns Model name (e.g., 'opus', 'sonnet', 'haiku')
 */
function resolveModelInternal(cwd: string, agentType: string): string {
  const config: GrdConfig = loadConfig(cwd);
  const profile: string = config.model_profile || 'balanced';
  const agentModels: Record<ModelProfileName, ModelTier> | undefined = MODEL_PROFILES[agentType];
  if (!agentModels) {
    // Unknown agent type: resolve 'sonnet' tier through backend
    const backend: unknown = detectBackend(cwd);
    return resolveBackendModel(backend, 'sonnet', config, cwd) as string;
  }
  const tier: ModelTier = agentModels[profile as ModelProfileName] || agentModels['balanced'] || 'sonnet';
  const backend: unknown = detectBackend(cwd);
  return resolveBackendModel(backend, tier, config, cwd) as string;
}

/**
 * Find a phase directory and enumerate its plans, summaries, and metadata.
 * @param cwd - Project working directory
 * @param phase - Phase identifier to search for
 * @returns Phase info object with directory, plans, summaries, and flags, or null if not found
 */
function findPhaseInternal(cwd: string, phase: string): PhaseInfo | null {
  if (!phase) return null;

  const phasesDir: string = getPhasesDirPath(cwd) as string;
  const normalized: string = normalizePhaseName(phase);

  try {
    const entries: { name: string; isDirectory: () => boolean }[] = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs: string[] = entries
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name)
      .sort();
    const match: string | undefined = dirs.find((d: string) => d.startsWith(normalized + '-') || d === normalized);
    if (!match) return null;

    const dirMatch: RegExpMatchArray | null = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const phaseNumber: string = dirMatch ? dirMatch[1] : normalized;
    const phaseName: string | null = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const phaseDir: string = path.join(phasesDir, match);
    const phaseFiles: string[] = fs.readdirSync(phaseDir);

    const plans: string[] = phaseFiles.filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries: string[] = phaseFiles
      .filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md')
      .sort();
    const hasResearch: boolean = phaseFiles.some((f: string) => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
    const hasContext: boolean = phaseFiles.some((f: string) => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
    const hasVerification: boolean = phaseFiles.some(
      (f: string) => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md'
    );

    // Determine incomplete plans (plans without matching summaries)
    const completedPlanIds: Set<string> = new Set(
      summaries.map((s: string) => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
    );
    const incompletePlans: string[] = plans.filter((p: string) => {
      const planId: string = p.replace('-PLAN.md', '').replace('PLAN.md', '');
      return !completedPlanIds.has(planId);
    });

    // Check if phase exists in ROADMAP.md (non-blocking consistency check)
    let consistencyWarning: string | null = null;
    try {
      const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
      const roadmapContent: string = fs.readFileSync(roadmapPath, 'utf-8');
      const unpadded: string = String(parseInt(phaseNumber, 10));
      const phasePattern: RegExp = new RegExp(`#{2,}\\s*Phase\\s+(?:${phaseNumber}|${unpadded})\\s*:`, 'i');
      if (!phasePattern.test(roadmapContent)) {
        consistencyWarning = `Phase ${phaseNumber} found on disk but not in ROADMAP.md — may be from a previous milestone`;
      }
    } catch {
      // ROADMAP.md may not exist yet; skip check
    }

    return {
      found: true,
      directory: path.relative(cwd, path.join(phasesDir, match)),
      phase_number: phaseNumber,
      phase_name: phaseName,
      phase_slug: phaseName
        ? phaseName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        : null,
      plans,
      summaries,
      incomplete_plans: incompletePlans,
      has_research: hasResearch,
      has_context: hasContext,
      has_verification: hasVerification,
      consistency_warning: consistencyWarning,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a path exists on the filesystem.
 * @param cwd - Project working directory (used for resolving relative paths)
 * @param targetPath - Path to check, relative or absolute
 * @returns True if the path exists, false otherwise
 */
function pathExistsInternal(cwd: string, targetPath: string): boolean {
  const fullPath: string = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  try {
    fs.statSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a kebab-case slug from text, stripping non-alphanumeric characters.
 * @param text - Input text to slugify
 * @returns Kebab-case slug, or null if text is falsy
 */
function generateSlugInternal(text: string): string | null {
  if (!text) return null;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Strip shipped milestone sections wrapped in <details> blocks.
 * These contain archived milestone content that should not contaminate
 * active milestone parsing (phase numbers, version detection, etc.).
 * @param content - Raw ROADMAP.md content
 * @returns Content with <details>...</details> blocks removed
 */
function stripShippedSections(content: string): string {
  if (!content) return content;
  return content.replace(/<details>[\s\S]*?<\/details>/gi, '');
}

/**
 * Extract milestone version and name from ROADMAP.md.
 * @param cwd - Project working directory
 * @returns Milestone info with version (e.g., 'v1.0') and name
 */
function getMilestoneInfo(cwd: string): MilestoneInfo {
  try {
    const roadmap: string = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
    const active: string = stripShippedSections(roadmap);

    // Strategy 1: Find "(in progress)" milestone from bullet list
    const inProgressMatch: RegExpMatchArray | null = active.match(/-\s+(v[\d.]+)\s+([^\n(]+?)\s*\(in progress\)/im);
    if (inProgressMatch) {
      return { version: inProgressMatch[1], name: inProgressMatch[2].trim() };
    }

    // Strategy 2: Last non-shipped milestone bullet
    const bulletRegex: RegExp = /-\s+(v[\d.]+)\s+([^\n(]+?)(?:\s*\(([^)]*)\))?\s*$/gim;
    let lastNonShipped: MilestoneInfo | null = null;
    let bm: RegExpExecArray | null;
    while ((bm = bulletRegex.exec(active)) !== null) {
      const status: string = bm[3] || '';
      if (!/shipped/i.test(status)) {
        lastNonShipped = { version: bm[1], name: bm[2].trim() };
      }
    }
    if (lastNonShipped) return lastNonShipped;

    // Strategy 3: Active heading "## ... vX.Y.Z ... (In Progress)"
    const headingMatch: RegExpMatchArray | null = active.match(/##\s*.*?(v\d+\.\d+(?:\.\d+)?)\s*[:\s]+([^\n(]+)/);
    if (headingMatch) {
      return { version: headingMatch[1], name: headingMatch[2].trim() };
    }

    // Strategy 4: Fallback -- first version found (with 3-part support)
    const versionMatch: RegExpMatchArray | null = active.match(/v(\d+\.\d+(?:\.\d+)?)/);
    return {
      version: versionMatch ? versionMatch[0] : 'v1.0',
      name: 'milestone',
    };
  } catch {
    return { version: 'v1.0', name: 'milestone' };
  }
}

/**
 * Resolve model name from a config object without disk I/O.
 * When cwd is provided, resolves to backend-specific model name.
 * When cwd is omitted, returns abstract tier name (backward compatible).
 * @param config - Configuration object with model_profile field
 * @param agentType - Agent type key to look up in MODEL_PROFILES
 * @param cwd - Optional project working directory for backend-specific resolution
 * @returns Model name (e.g., 'opus', 'sonnet', 'haiku', or backend-specific name)
 */
function resolveModelForAgent(config: GrdConfig, agentType: string, cwd?: string): string {
  const profile: string = (config.model_profile || 'balanced').toLowerCase();
  const agentModels: Record<ModelProfileName, ModelTier> | undefined = MODEL_PROFILES[agentType];
  const tier: ModelTier = agentModels ? agentModels[profile as ModelProfileName] || agentModels['balanced'] || 'sonnet' : 'sonnet';
  // If cwd provided, resolve to backend-specific model name
  if (cwd) {
    const backend: unknown = detectBackend(cwd);
    return resolveBackendModel(backend, tier, config, cwd) as string;
  }
  // Backward compatible: no cwd means return tier name (existing behavior)
  return tier;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Node built-ins (re-exported for convenience)
  fs,
  path,
  os,
  execFileSync,
  // Constants
  GIT_ALLOWED_COMMANDS,
  GIT_BLOCKED_COMMANDS,
  GIT_BLOCKED_FLAGS,
  MODEL_PROFILES,
  CODE_EXTENSIONS,
  // Helpers
  parseIncludeFlag,
  safeReadFile,
  safeReadMarkdown,
  safeReadJSON,
  extractMarkdownSection,
  loadConfig,
  isGitIgnored,
  execGit,
  normalizePhaseName,
  findCodeFiles,
  // Input validation
  validatePhaseName,
  validateFilePath,
  validateGitRef,
  // CLI argument validation
  validatePhaseArg,
  validateFileArg,
  validateSubcommand,
  validateRequiredArg,
  // Caching
  createRunCache,
  // Phase directory utilities
  findPhaseDir,
  parsePhaseNumber,
  // Directory walking
  walkJsFiles,
  // Output
  output,
  error,
  debugLog,
  // Compound helpers
  resolveModelInternal,
  findPhaseInternal,
  pathExistsInternal,
  generateSlugInternal,
  getMilestoneInfo,
  stripShippedSections,
  resolveModelForAgent,
  levenshteinDistance,
  findClosestCommand,
  clearPhaseCache,
};
