/** GRD Commands/Config -- Configuration management and path verification operations */

'use strict';

const fs = require('fs');
const path = require('path');

const { output, error } = require('../utils') as {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
};
const { planningDir: getPlanningDir } = require('../paths') as {
  planningDir: (cwd: string) => string;
};

// ─── Domain Types ────────────────────────────────────────────────────────────

/** Default config structure created by cmdConfigEnsureSection. */
interface DefaultConfig {
  model_profile: string;
  commit_docs: boolean;
  search_gitignored: boolean;
  branching_strategy: string;
  phase_branch_template: string;
  milestone_branch_template: string;
  workflow: {
    research: boolean;
    plan_check: boolean;
    verifier: boolean;
  };
  parallelization: boolean;
  autonomous_mode: boolean;
  research_gates: {
    verification_design: boolean;
    method_selection: boolean;
    baseline_review: boolean;
  };
  eval_config: {
    default_metrics: string[];
    baseline_tracking: boolean;
  };
  ceremony: {
    default_level: string;
    phase_overrides: Record<string, string>;
  };
  tracker: {
    provider: string;
    auto_sync: boolean;
    github: {
      project_board: string;
      default_assignee: string;
      default_labels: string[];
      auto_issues: boolean;
      pr_per_phase: boolean;
    };
    mcp_atlassian: {
      base_url: string;
      project_key: string;
      auth_method: string;
      epic_issue_type: string;
      task_issue_type: string;
    };
  };
}

// ─── Path Verification ──────────────────────────────────────────────────────

/**
 * CLI command: Check if a path exists in the project and report its type.
 * @param cwd - Project working directory
 * @param targetPath - Path to check for existence
 * @param raw - Output raw 'true'/'false' instead of JSON
 * @param dryRun - If true, report what would be checked without side effects
 */
function cmdVerifyPathExists(
  cwd: string,
  targetPath: string,
  raw: boolean,
  dryRun?: boolean
): void {
  if (!targetPath) {
    error('path required for verification. Usage: verify path-exists <path>');
    return;
  }

  const fullPath: string = path.isAbsolute(targetPath)
    ? targetPath
    : path.join(cwd, targetPath);

  if (dryRun) {
    output(
      { dry_run: true, path: targetPath, full_path: fullPath },
      raw,
      `dry-run: would check ${targetPath}`
    );
    return;
  }

  try {
    const stats = fs.statSync(fullPath);
    const type: string = stats.isDirectory()
      ? 'directory'
      : stats.isFile()
        ? 'file'
        : 'other';
    const result = { exists: true, type };
    output(result, raw, 'true');
  } catch {
    const result = { exists: false, type: null };
    output(result, raw, 'false');
  }
}

// ─── Config Ensure Section ──────────────────────────────────────────────────

/**
 * CLI command: Ensure config.json exists with required sections, creating defaults if missing.
 * @param cwd - Project working directory
 * @param raw - Output raw 'created'/'exists' instead of JSON
 * @param dryRun - If true, preview changes without writing
 */
function cmdConfigEnsureSection(
  cwd: string,
  raw: boolean,
  dryRun?: boolean
): void {
  const planningDir: string = getPlanningDir(cwd);
  const configPath: string = path.join(planningDir, 'config.json');

  // Ensure .planning directory exists
  try {
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
    }
  } catch (err: unknown) {
    error(
      'Failed to create .planning directory: ' + (err as Error).message
    );
    return;
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    const result = { created: false, reason: 'already_exists' };
    output(result, raw, 'exists');
    return;
  }

  // Create default config
  const defaults: DefaultConfig = {
    model_profile: 'balanced',
    commit_docs: true,
    search_gitignored: false,
    branching_strategy: 'none',
    phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
    milestone_branch_template: 'grd/{milestone}-{slug}',
    workflow: {
      research: true,
      plan_check: true,
      verifier: true,
    },
    parallelization: true,
    autonomous_mode: false,
    research_gates: {
      verification_design: true,
      method_selection: true,
      baseline_review: true,
    },
    eval_config: {
      default_metrics: ['PSNR', 'SSIM', 'LPIPS'],
      baseline_tracking: true,
    },
    ceremony: {
      default_level: 'auto',
      phase_overrides: {},
    },
    tracker: {
      provider: 'none',
      auto_sync: true,
      github: {
        project_board: '',
        default_assignee: '',
        default_labels: [
          'research',
          'implementation',
          'evaluation',
          'integration',
        ],
        auto_issues: true,
        pr_per_phase: false,
      },
      mcp_atlassian: {
        base_url: '',
        project_key: '',
        auth_method: 'api_token',
        epic_issue_type: 'Epic',
        task_issue_type: 'Task',
      },
    },
  };

  if (dryRun) {
    output(
      { dry_run: true, would_create: path.relative(cwd, configPath) },
      raw,
      `dry-run: would create ${path.relative(cwd, configPath)}`
    );
    return;
  }

  try {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    const result = { created: true, path: path.relative(cwd, configPath) };
    output(result, raw, 'created');
  } catch (err: unknown) {
    error('Failed to create config.json: ' + (err as Error).message);
  }
}

// ─── Config Set ─────────────────────────────────────────────────────────────

/**
 * CLI command: Set a configuration value by dot-path key in config.json.
 * @param cwd - Project working directory
 * @param keyPath - Dot-notation key path (e.g., 'workflow.research')
 * @param value - Value to set (auto-parsed to boolean/number if applicable)
 * @param raw - Output raw 'key=value' instead of JSON
 * @param dryRun - If true, preview changes without writing
 */
function cmdConfigSet(
  cwd: string,
  keyPath: string,
  value: string,
  raw: boolean,
  dryRun?: boolean
): void {
  const configPath: string = path.join(getPlanningDir(cwd), 'config.json');

  if (!keyPath) {
    error('Usage: config-set <key.path> <value>');
    return;
  }

  // Parse value (handle booleans and numbers)
  let parsedValue: string | boolean | number = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(Number(value)) && value !== '') parsedValue = Number(value);

  // Load existing config or start with empty object
  let config: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<
        string,
        unknown
      >;
    }
  } catch (err: unknown) {
    error('Failed to read config.json: ' + (err as Error).message);
    return;
  }

  // Set nested value using dot notation (e.g., "workflow.research")
  const keys: string[] = keyPath.split('.');
  let current: Record<string, unknown> = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key: string = keys[i];
    if (
      current[key] === undefined ||
      typeof current[key] !== 'object'
    ) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = parsedValue;

  if (dryRun) {
    output(
      { dry_run: true, key: keyPath, value: parsedValue },
      raw,
      `dry-run: would set ${keyPath}=${parsedValue}`
    );
    return;
  }

  // Write back
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    const result = { updated: true, key: keyPath, value: parsedValue };
    output(result, raw, `${keyPath}=${parsedValue}`);
  } catch (err: unknown) {
    error('Failed to write config.json: ' + (err as Error).message);
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdVerifyPathExists,
};
