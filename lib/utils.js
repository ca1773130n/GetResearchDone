/**
 * GRD Shared Utilities — Constants, helpers, and validation functions
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * These are zero-dependency foundations used by all other modules.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { detectBackend, resolveBackendModel } = require('./backend');
const { phasesDir: getPhasesDirPath } = require('./paths');

// ─── Git Operation Whitelist ────────────────────────────────────────────────

const GIT_ALLOWED_COMMANDS = new Set([
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
const GIT_BLOCKED_COMMANDS = new Set(['config', 'push', 'clean']);
const GIT_BLOCKED_FLAGS = new Set(['--force', '-f', '--hard', '--delete', '-D']);

// ─── Model Profile Table ─────────────────────────────────────────────────────

const MODEL_PROFILES = {
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
 * @param {string[]} args - CLI argument array
 * @returns {Set<string>} Set of comma-separated include values, or empty Set if not present
 */
function parseIncludeFlag(args) {
  const includeIndex = args.indexOf('--include');
  if (includeIndex === -1) return new Set();
  const includeValue = args[includeIndex + 1];
  if (!includeValue) return new Set();
  return new Set(includeValue.split(',').map((s) => s.trim()));
}

/**
 * Read file returning content or null on error.
 * @param {string} filePath - Absolute path to the file
 * @returns {string|null} File content as UTF-8 string, or null if read fails
 */
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Load and merge .planning/config.json with default configuration values.
 * @param {string} cwd - Project working directory
 * @returns {Object} Merged configuration object with all fields populated
 */
function loadConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const defaults = {
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
  };

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    const get = (key, nested) => {
      if (parsed[key] !== undefined) return parsed[key];
      if (nested && parsed[nested.section] && parsed[nested.section][nested.field] !== undefined) {
        return parsed[nested.section][nested.field];
      }
      return undefined;
    };

    const parallelization = (() => {
      const val = get('parallelization');
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null && 'enabled' in val) return val.enabled;
      return defaults.parallelization;
    })();

    return {
      model_profile: get('model_profile') ?? defaults.model_profile,
      commit_docs:
        get('commit_docs', { section: 'planning', field: 'commit_docs' }) ?? defaults.commit_docs,
      search_gitignored:
        get('search_gitignored', { section: 'planning', field: 'search_gitignored' }) ??
        defaults.search_gitignored,
      branching_strategy:
        get('branching_strategy', { section: 'git', field: 'branching_strategy' }) ??
        defaults.branching_strategy,
      phase_branch_template:
        get('phase_branch_template', { section: 'git', field: 'phase_branch_template' }) ??
        defaults.phase_branch_template,
      milestone_branch_template:
        get('milestone_branch_template', { section: 'git', field: 'milestone_branch_template' }) ??
        defaults.milestone_branch_template,
      base_branch:
        get('base_branch', { section: 'git', field: 'base_branch' }) ?? defaults.base_branch,
      research: get('research', { section: 'workflow', field: 'research' }) ?? defaults.research,
      plan_checker:
        get('plan_checker', { section: 'workflow', field: 'plan_check' }) ?? defaults.plan_checker,
      verifier: get('verifier', { section: 'workflow', field: 'verifier' }) ?? defaults.verifier,
      parallelization,
      // Code review config
      code_review_enabled:
        get('code_review_enabled', { section: 'code_review', field: 'enabled' }) ??
        defaults.code_review_enabled,
      code_review_timing:
        get('code_review_timing', { section: 'code_review', field: 'timing' }) ??
        defaults.code_review_timing,
      code_review_severity_gate:
        get('code_review_severity_gate', { section: 'code_review', field: 'severity_gate' }) ??
        defaults.code_review_severity_gate,
      code_review_auto_fix_warnings:
        get('code_review_auto_fix_warnings', {
          section: 'code_review',
          field: 'auto_fix_warnings',
        }) ?? defaults.code_review_auto_fix_warnings,
      // Execution config
      use_teams:
        get('use_teams', { section: 'execution', field: 'use_teams' }) ?? defaults.use_teams,
      team_timeout_minutes:
        get('team_timeout_minutes', { section: 'execution', field: 'team_timeout_minutes' }) ??
        defaults.team_timeout_minutes,
      max_concurrent_teammates:
        get('max_concurrent_teammates', {
          section: 'execution',
          field: 'max_concurrent_teammates',
        }) ?? defaults.max_concurrent_teammates,
      // Backend config (pass-through, no defaults)
      backend: parsed.backend || undefined,
      backend_models: parsed.backend_models || undefined,
      // Autonomous mode
      autonomous_mode: get('autonomous_mode') ?? false,
    };
  } catch {
    return defaults;
  }
}

/**
 * Check if a file path is git-ignored via git check-ignore.
 * @param {string} cwd - Project working directory
 * @param {string} targetPath - Path to check against .gitignore rules
 * @returns {boolean} True if the path is git-ignored, false otherwise
 */
function isGitIgnored(cwd, targetPath) {
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
 * @param {string} cwd - Project working directory
 * @param {string[]} args - Git command arguments (first element is the subcommand)
 * @param {Object} [opts={}] - Options object
 * @param {boolean} [opts.allowBlocked=false] - Allow blocked commands/flags to bypass security policy
 * @returns {{exitCode: number, stdout: string, stderr: string}} Command result with exit code and output
 */
function execGit(cwd, args, opts = {}) {
  // Git operation whitelist enforcement
  const subcommand = args[0];
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
    const stdout = execFileSync('git', args, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { exitCode: 0, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: (err.stdout ?? '').toString().trim(),
      stderr: (err.stderr ?? '').toString().trim(),
    };
  }
}

/**
 * Normalize a phase identifier by zero-padding and validating format.
 * @param {string} phase - Phase identifier (e.g., "7", "07", "07.1")
 * @returns {string} Normalized phase name with zero-padded number (e.g., "07", "07.1")
 * @throws {Error} If phase is not a string or contains path traversal/directory separators
 */
function normalizePhaseName(phase) {
  if (typeof phase !== 'string') throw new Error('Phase must be a string');
  if (phase.includes('..')) throw new Error('Phase name must not contain path traversal (..)');
  if (phase.includes('/') || phase.includes('\\'))
    throw new Error('Phase name must not contain directory separators');
  const match = phase.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return phase;
  const num = match[1];
  const parts = num.split('.');
  const padded = parts[0].padStart(2, '0');
  return parts.length > 1 ? `${padded}.${parts[1]}` : padded;
}

const CODE_EXTENSIONS = new Set(['.ts', '.js', '.py', '.go', '.rs', '.swift', '.java']);

/**
 * Recursively find code files up to a maximum depth, capped at 5 results.
 * @param {string} dir - Directory to search in
 * @param {number} maxDepth - Maximum directory depth to recurse into
 * @param {string[]} found - Accumulator array of found file paths
 * @param {number} depth - Current recursion depth
 * @returns {string[]} Array of absolute paths to code files found
 */
function findCodeFiles(dir, maxDepth, found, depth) {
  if (depth > maxDepth || found.length >= 5) return found;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (found.length >= 5) break;
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findCodeFiles(fullPath, maxDepth, found, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
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
 * @param {string} phase - Phase name to validate
 * @returns {string} The validated phase name if valid
 * @throws {Error} If phase format is invalid, contains traversal, null bytes, or separators
 */
function validatePhaseName(phase) {
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
 * @param {string} filePath - File path to validate (relative or absolute)
 * @param {string} cwd - Project working directory used as security boundary
 * @returns {string} The validated file path if safe
 * @throws {Error} If path is not a string, contains null bytes, or escapes project directory
 */
function validateFilePath(filePath, cwd) {
  if (typeof filePath !== 'string') throw new Error('File path must be a string');
  if (filePath.includes('\0')) throw new Error('File path must not contain null bytes');
  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd)) throw new Error('File path must not escape project directory');
  return filePath;
}

/**
 * Validate git ref format, preventing flag injection and path traversal.
 * @param {string} ref - Git reference to validate (commit hash, branch name, tag)
 * @returns {string} The validated git ref if valid
 * @throws {Error} If ref is invalid, starts with dash, contains traversal, or has invalid characters
 */
function validateGitRef(ref) {
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
 * @param {string} phase - Phase number from CLI arguments
 * @returns {string} The validated phase number
 * @throws {Error} If phase is missing or not in valid format (digits with optional decimal)
 */
function validatePhaseArg(phase) {
  if (phase == null || phase === '') throw new Error('Phase number is required');
  if (typeof phase !== 'string') throw new Error('Phase number is required');
  if (!/^\d+(?:\.\d+)?(?:-[a-zA-Z0-9-]+)?$/.test(phase)) {
    throw new Error('Invalid phase number: must be digits with optional decimal (e.g., 01, 02.1)');
  }
  return phase;
}

/**
 * Validate CLI file path argument, ensuring it is present and does not escape project.
 * @param {string} filePath - File path from CLI arguments
 * @param {string} cwd - Project working directory used as security boundary
 * @returns {string} The validated file path
 * @throws {Error} If file path is missing or escapes project directory
 */
function validateFileArg(filePath, cwd) {
  if (filePath == null || filePath === '') throw new Error('File path is required');
  return validateFilePath(filePath, cwd);
}

/**
 * Validate CLI subcommand against a list of valid subcommands.
 * @param {string} sub - Subcommand string from CLI arguments
 * @param {string[]} validSubs - Array of valid subcommand names
 * @param {string} parentCmd - Parent command name for error messages
 * @returns {string} The validated subcommand
 * @throws {Error} If subcommand is missing or not in the valid list
 */
function validateSubcommand(sub, validSubs, parentCmd) {
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
 * @param {*} value - Argument value to check
 * @param {string} argName - Name of the argument for error messages
 * @returns {*} The validated value
 * @throws {Error} If value is null, undefined, or empty string
 */
function validateRequiredArg(value, argName) {
  if (value == null || value === '') throw new Error(`${argName} is required`);
  return value;
}

// ─── Output ──────────────────────────────────────────────────────────────────

/**
 * Write JSON or raw output to stdout and exit with code 0.
 * @param {Object} result - Result object to serialize as JSON
 * @param {boolean} raw - If true, output rawValue as plain text instead of JSON
 * @param {*} [rawValue] - Plain text value to output when raw is true
 * @returns {void} Writes to stdout and exits process
 */
function output(result, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }
  process.exit(0);
}

/**
 * Write error message to stderr and exit with code 1.
 * @param {string} message - Error message to display
 * @returns {void} Writes to stderr and exits process with code 1
 */
function error(message) {
  process.stderr.write('Error: ' + message + '\n');
  process.exit(1);
}

// ─── Compound Helpers ────────────────────────────────────────────────────────

/**
 * Resolve the model name for a given agent type from project configuration.
 * @param {string} cwd - Project working directory
 * @param {string} agentType - Agent type key (e.g., 'grd-executor', 'grd-planner')
 * @returns {string} Model name (e.g., 'opus', 'sonnet', 'haiku')
 */
function resolveModelInternal(cwd, agentType) {
  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';
  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) {
    // Unknown agent type: resolve 'sonnet' tier through backend
    const backend = detectBackend(cwd);
    return resolveBackendModel(backend, 'sonnet', config, cwd);
  }
  const tier = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  const backend = detectBackend(cwd);
  return resolveBackendModel(backend, tier, config, cwd);
}

/**
 * Find a phase directory and enumerate its plans, summaries, and metadata.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase identifier to search for
 * @returns {Object|null} Phase info object with directory, plans, summaries, and flags, or null if not found
 */
function findPhaseInternal(cwd, phase) {
  if (!phase) return null;

  const phasesDir = getPhasesDirPath(cwd);
  const normalized = normalizePhaseName(phase);

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const match = dirs.find((d) => d.startsWith(normalized));
    if (!match) return null;

    const dirMatch = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;
    const phaseDir = path.join(phasesDir, match);
    const phaseFiles = fs.readdirSync(phaseDir);

    const plans = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles
      .filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md')
      .sort();
    const hasResearch = phaseFiles.some((f) => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
    const hasContext = phaseFiles.some((f) => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
    const hasVerification = phaseFiles.some(
      (f) => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md'
    );

    // Determine incomplete plans (plans without matching summaries)
    const completedPlanIds = new Set(
      summaries.map((s) => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
    );
    const incompletePlans = plans.filter((p) => {
      const planId = p.replace('-PLAN.md', '').replace('PLAN.md', '');
      return !completedPlanIds.has(planId);
    });

    // Check if phase exists in ROADMAP.md (non-blocking consistency check)
    let consistencyWarning = null;
    try {
      const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
      const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
      const unpadded = String(parseInt(phaseNumber, 10));
      const phasePattern = new RegExp(`###\\s*Phase\\s+(?:${phaseNumber}|${unpadded})\\s*:`, 'i');
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
 * @param {string} cwd - Project working directory (used for resolving relative paths)
 * @param {string} targetPath - Path to check, relative or absolute
 * @returns {boolean} True if the path exists, false otherwise
 */
function pathExistsInternal(cwd, targetPath) {
  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);
  try {
    fs.statSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a kebab-case slug from text, stripping non-alphanumeric characters.
 * @param {string} text - Input text to slugify
 * @returns {string|null} Kebab-case slug, or null if text is falsy
 */
function generateSlugInternal(text) {
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
 * @param {string} content - Raw ROADMAP.md content
 * @returns {string} Content with <details>...</details> blocks removed
 */
function stripShippedSections(content) {
  if (!content) return content;
  return content.replace(/<details>[\s\S]*?<\/details>/gi, '');
}

/**
 * Extract milestone version and name from ROADMAP.md.
 * @param {string} cwd - Project working directory
 * @returns {{version: string, name: string}} Milestone info with version (e.g., 'v1.0') and name
 */
function getMilestoneInfo(cwd) {
  try {
    const roadmap = fs.readFileSync(path.join(cwd, '.planning', 'ROADMAP.md'), 'utf-8');
    const active = stripShippedSections(roadmap);

    // Strategy 1: Find "(in progress)" milestone from bullet list
    const inProgressMatch = active.match(/-\s+(v[\d.]+)\s+([^\n(]+?)\s*\(in progress\)/im);
    if (inProgressMatch) {
      return { version: inProgressMatch[1], name: inProgressMatch[2].trim() };
    }

    // Strategy 2: Last non-shipped milestone bullet
    const bulletRegex = /-\s+(v[\d.]+)\s+([^\n(]+?)(?:\s*\(([^)]*)\))?\s*$/gim;
    let lastNonShipped = null;
    let bm;
    while ((bm = bulletRegex.exec(active)) !== null) {
      const status = bm[3] || '';
      if (!/shipped/i.test(status)) {
        lastNonShipped = { version: bm[1], name: bm[2].trim() };
      }
    }
    if (lastNonShipped) return lastNonShipped;

    // Strategy 3: Active heading "## ... vX.Y.Z ... (In Progress)"
    const headingMatch = active.match(/##\s*.*?(v\d+\.\d+(?:\.\d+)?)\s*[:\s]+([^\n(]+)/);
    if (headingMatch) {
      return { version: headingMatch[1], name: headingMatch[2].trim() };
    }

    // Strategy 4: Fallback — first version found (with 3-part support)
    const versionMatch = active.match(/v(\d+\.\d+(?:\.\d+)?)/);
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
 * @param {Object} config - Configuration object with model_profile field
 * @param {string} agentType - Agent type key to look up in MODEL_PROFILES
 * @param {string} [cwd] - Optional project working directory for backend-specific resolution
 * @returns {string} Model name (e.g., 'opus', 'sonnet', 'haiku', or backend-specific name)
 */
function resolveModelForAgent(config, agentType, cwd) {
  const profile = (config.model_profile || 'balanced').toLowerCase();
  const agentModels = MODEL_PROFILES[agentType];
  const tier = agentModels ? agentModels[profile] || agentModels['balanced'] || 'sonnet' : 'sonnet';
  // If cwd provided, resolve to backend-specific model name
  if (cwd) {
    const backend = detectBackend(cwd);
    return resolveBackendModel(backend, tier, config, cwd);
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
  // Output
  output,
  error,
  // Compound helpers
  resolveModelInternal,
  findPhaseInternal,
  pathExistsInternal,
  generateSlugInternal,
  getMilestoneInfo,
  stripShippedSections,
  resolveModelForAgent,
};
