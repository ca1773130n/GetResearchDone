/**
 * GRD Commands — Standalone CLI command functions
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization (Plan 07).
 * Contains misc/utility command functions: slug generation, timestamps,
 * todo management, config operations, history digest, progress rendering,
 * model resolution, phase lookup, commit, plan indexing, summary extraction.
 */

const fs = require('fs');
const path = require('path');

const {
  safeReadFile,
  loadConfig,
  isGitIgnored,
  execGit,
  normalizePhaseName,
  getMilestoneInfo,
  MODEL_PROFILES,
  output,
  error,
} = require('./utils');

const { extractFrontmatter } = require('./frontmatter');
const {
  detectBackend,
  resolveBackendModel,
  getBackendCapabilities,
  getCachedModels,
} = require('./backend');
const {
  parseLongTermRoadmap,
  validateLongTermRoadmap,
  getPlanningMode,
  generateLongTermRoadmap,
  formatLongTermRoadmap,
  refineMilestone,
  promoteMilestone,
  getMilestoneTier,
  updateRefinementHistory,
} = require('./long-term-roadmap');
const { runQualityAnalysis } = require('./cleanup');

// ─── Slug & Timestamp ────────────────────────────────────────────────────────

/**
 * CLI command: Generate a kebab-case slug from input text.
 * @param {string} text - Input text to convert to slug
 * @param {boolean} raw - Output raw slug string instead of JSON
 * @returns {void} Outputs slug to stdout and exits
 */
function cmdGenerateSlug(text, raw) {
  if (!text) {
    error('text required for slug generation');
  }

  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const result = { slug };
  output(result, raw, slug);
}

/**
 * CLI command: Output the current timestamp in the specified format.
 * @param {string} format - Timestamp format: 'date' (YYYY-MM-DD), 'filename' (ISO without colons), or 'full' (ISO)
 * @param {boolean} raw - Output raw timestamp string instead of JSON
 * @returns {void} Outputs timestamp to stdout and exits
 */
function cmdCurrentTimestamp(format, raw) {
  const now = new Date();
  let result;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

// ─── Todos ───────────────────────────────────────────────────────────────────

/**
 * CLI command: List pending todo files in .planning/todos/ with optional area filter.
 * @param {string} cwd - Project working directory
 * @param {string|null} area - Area filter (e.g., 'general'), or null for all todos
 * @param {boolean} raw - Output raw count string instead of JSON
 * @returns {void} Outputs todo list to stdout and exits
 */
function cmdListTodos(cwd, area, raw) {
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');

  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.md'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);

        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        // Apply area filter if specified
        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: path.join('.planning', 'todos', 'pending', file),
        });
      } catch {}
    }
  } catch {}

  const result = { count, todos };
  output(result, raw, count.toString());
}

/**
 * CLI command: Mark a todo file as completed by moving it from pending to completed directory.
 * @param {string} cwd - Project working directory
 * @param {string} filename - Name of the todo file to complete
 * @param {boolean} raw - Output raw 'completed' string instead of JSON
 * @returns {void} Outputs completion status to stdout and exits
 */
function cmdTodoComplete(cwd, filename, raw) {
  if (!filename) {
    error('filename required for todo complete');
  }

  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
  const completedDir = path.join(cwd, '.planning', 'todos', 'completed');
  const sourcePath = path.join(pendingDir, filename);

  if (!fs.existsSync(sourcePath)) {
    error(`Todo not found: ${filename}`);
  }

  // Ensure completed directory exists
  fs.mkdirSync(completedDir, { recursive: true });

  // Read, add completion timestamp, move
  let content = fs.readFileSync(sourcePath, 'utf-8');
  const today = new Date().toISOString().split('T')[0];
  content = `completed: ${today}\n` + content;

  fs.writeFileSync(path.join(completedDir, filename), content, 'utf-8');
  fs.unlinkSync(sourcePath);

  output({ completed: true, file: filename, date: today }, raw, 'completed');
}

// ─── Path Verification ──────────────────────────────────────────────────────

/**
 * CLI command: Check if a path exists in the project and report its type.
 * @param {string} cwd - Project working directory
 * @param {string} targetPath - Path to check for existence
 * @param {boolean} raw - Output raw 'true'/'false' instead of JSON
 * @returns {void} Outputs existence check result to stdout and exits
 */
function cmdVerifyPathExists(cwd, targetPath, raw) {
  if (!targetPath) {
    error('path required for verification');
  }

  const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);

  try {
    const stats = fs.statSync(fullPath);
    const type = stats.isDirectory() ? 'directory' : stats.isFile() ? 'file' : 'other';
    const result = { exists: true, type };
    output(result, raw, 'true');
  } catch {
    const result = { exists: false, type: null };
    output(result, raw, 'false');
  }
}

// ─── Config Operations ──────────────────────────────────────────────────────

/**
 * CLI command: Ensure config.json exists with required sections, creating defaults if missing.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw 'created'/'exists' instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdConfigEnsureSection(cwd, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const planningDir = path.join(cwd, '.planning');

  // Ensure .planning directory exists
  try {
    if (!fs.existsSync(planningDir)) {
      fs.mkdirSync(planningDir, { recursive: true });
    }
  } catch (err) {
    error('Failed to create .planning directory: ' + err.message);
  }

  // Check if config already exists
  if (fs.existsSync(configPath)) {
    const result = { created: false, reason: 'already_exists' };
    output(result, raw, 'exists');
    return;
  }

  // Create default config
  const defaults = {
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
    tracker: {
      provider: 'none',
      auto_sync: true,
      github: {
        project_board: '',
        default_assignee: '',
        default_labels: ['research', 'implementation', 'evaluation', 'integration'],
        auto_issues: true,
        pr_per_phase: false,
      },
      jira: {
        base_url: '',
        project_key: '',
        auth_method: 'api_token',
        epic_issue_type: 'Epic',
        task_issue_type: 'Task',
      },
    },
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8');
    const result = { created: true, path: '.planning/config.json' };
    output(result, raw, 'created');
  } catch (err) {
    error('Failed to create config.json: ' + err.message);
  }
}

/**
 * CLI command: Set a configuration value by dot-path key in config.json.
 * @param {string} cwd - Project working directory
 * @param {string} keyPath - Dot-notation key path (e.g., 'workflow.research')
 * @param {string} value - Value to set (auto-parsed to boolean/number if applicable)
 * @param {boolean} raw - Output raw 'key=value' instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdConfigSet(cwd, keyPath, value, raw) {
  const configPath = path.join(cwd, '.planning', 'config.json');

  if (!keyPath) {
    error('Usage: config-set <key.path> <value>');
  }

  // Parse value (handle booleans and numbers)
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);

  // Load existing config or start with empty object
  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (err) {
    error('Failed to read config.json: ' + err.message);
  }

  // Set nested value using dot notation (e.g., "workflow.research")
  const keys = keyPath.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = parsedValue;

  // Write back
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    const result = { updated: true, key: keyPath, value: parsedValue };
    output(result, raw, `${keyPath}=${parsedValue}`);
  } catch (err) {
    error('Failed to write config.json: ' + err.message);
  }
}

// ─── History Digest ─────────────────────────────────────────────────────────

/**
 * CLI command: Aggregate metrics, decisions, and tech stack from all SUMMARY.md files.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs history digest to stdout and exits
 */
function cmdHistoryDigest(cwd, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const digest = { phases: {}, decisions: [], tech_stack: new Set() };

  if (!fs.existsSync(phasesDir)) {
    digest.tech_stack = [];
    output(digest, raw);
    return;
  }

  try {
    const phaseDirs = fs
      .readdirSync(phasesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const dir of phaseDirs) {
      const dirPath = path.join(phasesDir, dir);
      const summaries = fs
        .readdirSync(dirPath)
        .filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

      for (const summary of summaries) {
        try {
          const content = fs.readFileSync(path.join(dirPath, summary), 'utf-8');
          const fm = extractFrontmatter(content);

          const phaseNum = fm.phase || dir.split('-')[0];

          if (!digest.phases[phaseNum]) {
            digest.phases[phaseNum] = {
              name: fm.name || dir.split('-').slice(1).join(' ') || 'Unknown',
              provides: new Set(),
              affects: new Set(),
              patterns: new Set(),
            };
          }

          // Merge provides
          if (fm['dependency-graph'] && fm['dependency-graph'].provides) {
            fm['dependency-graph'].provides.forEach((p) => digest.phases[phaseNum].provides.add(p));
          } else if (fm.provides) {
            fm.provides.forEach((p) => digest.phases[phaseNum].provides.add(p));
          }

          // Merge affects
          if (fm['dependency-graph'] && fm['dependency-graph'].affects) {
            fm['dependency-graph'].affects.forEach((a) => digest.phases[phaseNum].affects.add(a));
          }

          // Merge patterns
          if (fm['patterns-established']) {
            fm['patterns-established'].forEach((p) => digest.phases[phaseNum].patterns.add(p));
          }

          // Merge decisions
          if (fm['key-decisions']) {
            fm['key-decisions'].forEach((d) => {
              digest.decisions.push({ phase: phaseNum, decision: d });
            });
          }

          // Merge tech stack
          if (fm['tech-stack'] && fm['tech-stack'].added) {
            fm['tech-stack'].added.forEach((t) =>
              digest.tech_stack.add(typeof t === 'string' ? t : t.name)
            );
          }
        } catch (e) {
          // Skip malformed summaries
        }
      }
    }

    // Convert Sets to Arrays for JSON output
    Object.keys(digest.phases).forEach((p) => {
      digest.phases[p].provides = [...digest.phases[p].provides];
      digest.phases[p].affects = [...digest.phases[p].affects];
      digest.phases[p].patterns = [...digest.phases[p].patterns];
    });
    digest.tech_stack = [...digest.tech_stack];

    output(digest, raw);
  } catch (e) {
    error('Failed to generate history digest: ' + e.message);
  }
}

// ─── Model Resolution & Phase Lookup ────────────────────────────────────────

/**
 * CLI command: Resolve the model name for a given agent type from project configuration.
 * @param {string} cwd - Project working directory
 * @param {string} agentType - Agent type key (e.g., 'grd-executor', 'grd-planner')
 * @param {boolean} raw - Output raw model name instead of JSON
 * @returns {void} Outputs model name to stdout and exits
 */
function cmdResolveModel(cwd, agentType, raw) {
  if (!agentType) {
    error('agent-type required');
  }

  const config = loadConfig(cwd);
  const profile = config.model_profile || 'balanced';

  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) {
    const result = { model: 'sonnet', profile, unknown_agent: true };
    output(result, raw, 'sonnet');
    return;
  }

  const model = agentModels[profile] || agentModels['balanced'] || 'sonnet';
  const result = { model, profile };
  output(result, raw, model);
}

/**
 * CLI command: Find a phase directory by number and list its plans and summaries.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase identifier to search for
 * @param {boolean} raw - Output raw directory path instead of JSON
 * @returns {void} Outputs phase info to stdout and exits
 */
function cmdFindPhase(cwd, phase, raw) {
  if (!phase) {
    error('phase identifier required');
  }

  const phasesDir = path.join(cwd, '.planning', 'phases');
  const normalized = normalizePhaseName(phase);

  const notFound = {
    found: false,
    directory: null,
    phase_number: null,
    phase_name: null,
    plans: [],
    summaries: [],
  };

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    const match = dirs.find((d) => d.startsWith(normalized));
    if (!match) {
      output(notFound, raw, '');
      return;
    }

    const dirMatch = match.match(/^(\d+(?:\.\d+)?)-?(.*)/);
    const phaseNumber = dirMatch ? dirMatch[1] : normalized;
    const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : null;

    const phaseDir = path.join(phasesDir, match);
    const phaseFiles = fs.readdirSync(phaseDir);
    const plans = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
    const summaries = phaseFiles
      .filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md')
      .sort();

    const result = {
      found: true,
      directory: path.join('.planning', 'phases', match),
      phase_number: phaseNumber,
      phase_name: phaseName,
      plans,
      summaries,
    };

    output(result, raw, result.directory);
  } catch {
    output(notFound, raw, '');
  }
}

// ─── Commit ─────────────────────────────────────────────────────────────────

/**
 * CLI command: Create a git commit with specified files, respecting commit_docs and gitignore config.
 * @param {string} cwd - Project working directory
 * @param {string} message - Commit message
 * @param {string[]} files - Array of file paths to stage, or empty for default '.planning/'
 * @param {boolean} raw - Output raw commit hash instead of JSON
 * @param {boolean} [amend=false] - Amend the previous commit instead of creating new one
 * @returns {void} Outputs commit result to stdout and exits
 */
function cmdCommit(cwd, message, files, raw, amend) {
  if (!message && !amend) {
    error('commit message required');
  }

  const config = loadConfig(cwd);

  // Check commit_docs config
  if (!config.commit_docs) {
    const result = { committed: false, hash: null, reason: 'skipped_commit_docs_false' };
    output(result, raw, 'skipped');
    return;
  }

  // Check if .planning is gitignored
  if (isGitIgnored(cwd, '.planning')) {
    const result = { committed: false, hash: null, reason: 'skipped_gitignored' };
    output(result, raw, 'skipped');
    return;
  }

  // Stage files
  const filesToStage = files && files.length > 0 ? files : ['.planning/'];
  for (const file of filesToStage) {
    execGit(cwd, ['add', file]);
  }

  // Commit
  const commitArgs = amend ? ['commit', '--amend', '--no-edit'] : ['commit', '-m', message];
  const commitResult = execGit(cwd, commitArgs);
  if (commitResult.exitCode !== 0) {
    if (
      commitResult.stdout.includes('nothing to commit') ||
      commitResult.stderr.includes('nothing to commit')
    ) {
      const result = { committed: false, hash: null, reason: 'nothing_to_commit' };
      output(result, raw, 'nothing');
      return;
    }
    const result = {
      committed: false,
      hash: null,
      reason: 'nothing_to_commit',
      error: commitResult.stderr,
    };
    output(result, raw, 'nothing');
    return;
  }

  // Get short hash
  const hashResult = execGit(cwd, ['rev-parse', '--short', 'HEAD']);
  const hash = hashResult.exitCode === 0 ? hashResult.stdout : null;
  const result = { committed: true, hash, reason: 'committed' };
  output(result, raw, hash || 'committed');
}

// ─── Phase Plan Index ───────────────────────────────────────────────────────

/**
 * CLI command: Index plans in a phase with wave grouping, completion status, and checkpoint detection.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to index
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs plan index to stdout and exits
 */
function cmdPhasePlanIndex(cwd, phase, raw) {
  if (!phase) {
    error('phase required for phase-plan-index');
  }

  const phasesDir = path.join(cwd, '.planning', 'phases');
  const normalized = normalizePhaseName(phase);

  // Find phase directory
  let phaseDir = null;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const match = dirs.find((d) => d.startsWith(normalized));
    if (match) {
      phaseDir = path.join(phasesDir, match);
    }
  } catch {
    // phases dir doesn't exist
  }

  if (!phaseDir) {
    output(
      {
        phase: normalized,
        error: 'Phase not found',
        plans: [],
        waves: {},
        incomplete: [],
        has_checkpoints: false,
      },
      raw
    );
    return;
  }

  // Get all files in phase directory
  const phaseFiles = fs.readdirSync(phaseDir);
  const planFiles = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
  const summaryFiles = phaseFiles.filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');

  // Build set of plan IDs with summaries
  const completedPlanIds = new Set(
    summaryFiles.map((s) => s.replace('-SUMMARY.md', '').replace('SUMMARY.md', ''))
  );

  const plans = [];
  const waves = {};
  const incomplete = [];
  let hasCheckpoints = false;

  for (const planFile of planFiles) {
    const planId = planFile.replace('-PLAN.md', '').replace('PLAN.md', '');
    const planPath = path.join(phaseDir, planFile);
    const content = fs.readFileSync(planPath, 'utf-8');
    const fm = extractFrontmatter(content);

    // Count tasks (## Task N patterns)
    const taskMatches = content.match(/##\s*Task\s*\d+/gi) || [];
    const taskCount = taskMatches.length;

    // Parse wave as integer
    const wave = parseInt(fm.wave, 10) || 1;

    // Parse autonomous (default true if not specified)
    let autonomous = true;
    if (fm.autonomous !== undefined) {
      autonomous = fm.autonomous === 'true' || fm.autonomous === true;
    }

    if (!autonomous) {
      hasCheckpoints = true;
    }

    // Parse files-modified
    let filesModified = [];
    if (fm['files-modified']) {
      filesModified = Array.isArray(fm['files-modified'])
        ? fm['files-modified']
        : [fm['files-modified']];
    }

    const hasSummary = completedPlanIds.has(planId);
    if (!hasSummary) {
      incomplete.push(planId);
    }

    const plan = {
      id: planId,
      wave,
      autonomous,
      objective: fm.objective || null,
      files_modified: filesModified,
      task_count: taskCount,
      has_summary: hasSummary,
    };

    plans.push(plan);

    // Group by wave
    const waveKey = String(wave);
    if (!waves[waveKey]) {
      waves[waveKey] = [];
    }
    waves[waveKey].push(planId);
  }

  const result = {
    phase: normalized,
    plans,
    waves,
    incomplete,
    has_checkpoints: hasCheckpoints,
  };

  output(result, raw);
}

// ─── Summary Extract ────────────────────────────────────────────────────────

/**
 * CLI command: Extract structured data (one-liner, key-files, decisions, etc.) from a SUMMARY.md file.
 * @param {string} cwd - Project working directory
 * @param {string} summaryPath - Relative path to the SUMMARY.md file
 * @param {string[]} [fields] - Array of specific fields to extract, or empty/null for all fields
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs extracted data to stdout and exits
 */
function cmdSummaryExtract(cwd, summaryPath, fields, raw) {
  if (!summaryPath) {
    error('summary-path required for summary-extract');
  }

  const fullPath = path.join(cwd, summaryPath);

  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: summaryPath }, raw);
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);

  // Parse key-decisions into structured format
  const parseDecisions = (decisionsList) => {
    if (!decisionsList || !Array.isArray(decisionsList)) return [];
    return decisionsList.map((d) => {
      const colonIdx = d.indexOf(':');
      if (colonIdx > 0) {
        return {
          summary: d.substring(0, colonIdx).trim(),
          rationale: d.substring(colonIdx + 1).trim(),
        };
      }
      return { summary: d, rationale: null };
    });
  };

  // Build full result
  const fullResult = {
    path: summaryPath,
    one_liner: fm['one-liner'] || null,
    key_files: fm['key-files'] || [],
    tech_added: (fm['tech-stack'] && fm['tech-stack'].added) || [],
    patterns: fm['patterns-established'] || [],
    decisions: parseDecisions(fm['key-decisions']),
  };

  // If fields specified, filter to only those fields
  if (fields && fields.length > 0) {
    const filtered = { path: summaryPath };
    for (const field of fields) {
      if (fullResult[field] !== undefined) {
        filtered[field] = fullResult[field];
      }
    }
    output(filtered, raw);
    return;
  }

  output(fullResult, raw);
}

// ─── Progress Render ────────────────────────────────────────────────────────

/**
 * CLI command: Render project progress in the specified format (json, table, or bar).
 * @param {string} cwd - Project working directory
 * @param {string} format - Output format: 'json', 'table' (markdown), or 'bar' (progress bar)
 * @param {boolean} raw - Output raw rendered text instead of JSON
 * @returns {void} Outputs progress to stdout and exits
 */
function cmdProgressRender(cwd, format, raw) {
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const milestone = getMilestoneInfo(cwd);

  const phases = [];
  let totalPlans = 0;
  let totalSummaries = 0;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => {
        const aNum = parseFloat(a.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
        const bNum = parseFloat(b.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0');
        return aNum - bNum;
      });

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      const phaseNum = dm ? dm[1] : dir;
      const phaseName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaries = phaseFiles.filter(
        (f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md'
      ).length;

      totalPlans += plans;
      totalSummaries += summaries;

      let status;
      if (plans === 0) status = 'Pending';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      phases.push({ number: phaseNum, name: phaseName, plans, summaries, status });
    }
  } catch {}

  const percent = totalPlans > 0 ? Math.round((totalSummaries / totalPlans) * 100) : 0;

  if (format === 'table') {
    // Render markdown table
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name}\n\n`;
    out += `**Progress:** [${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)\n\n`;
    out += `| Phase | Name | Plans | Status |\n`;
    out += `|-------|------|-------|--------|\n`;
    for (const p of phases) {
      out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.plans} | ${p.status} |\n`;
    }
    output({ rendered: out }, raw, out);
  } else if (format === 'bar') {
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    const text = `[${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)`;
    output({ bar: text, percent, completed: totalSummaries, total: totalPlans }, raw, text);
  } else {
    // JSON format
    output(
      {
        milestone_version: milestone.version,
        milestone_name: milestone.name,
        phases,
        total_plans: totalPlans,
        total_summaries: totalSummaries,
        percent,
      },
      raw
    );
  }
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

/**
 * CLI command: Render a full project dashboard with milestones, phases, plans, and timeline.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - If true output JSON, if false output TUI text
 * @returns {void} Outputs dashboard to stdout and exits
 */
function cmdDashboard(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const roadmapContent = safeReadFile(roadmapPath);

  if (!roadmapContent) {
    if (raw) {
      output({ error: 'ROADMAP.md not found', milestones: [], summary: {} }, raw);
    } else {
      process.stdout.write('No ROADMAP.md found\n');
      process.exit(0);
    }
    return;
  }

  const stateContent = safeReadFile(statePath) || '';

  // Parse milestones from ROADMAP.md
  const milestoneRegex = /^##\s+(Milestone\s+\d+[^:\n]*:\s*([^\n]+)|.*v(\d+\.\d+)[^\n]*)/gim;
  const milestones = [];
  const milestonePositions = [];
  let mMatch;

  while ((mMatch = milestoneRegex.exec(roadmapContent)) !== null) {
    const heading = mMatch[0].replace(/^##\s+/, '').trim();
    // Extract name - try "Milestone N: Name" pattern first, then "MN ...: Name"
    const nameMatch = heading.match(/Milestone\s+\d+\s*:\s*(.+)/i);
    const mFormatNameMatch = !nameMatch && heading.match(/M\d+[^:]*:\s*(.+)/i);
    const versionMatch = heading.match(/v(\d+\.\d+)/);
    const numMatch = heading.match(/(?:Milestone\s+|M)(\d+)/i);
    const name = nameMatch
      ? nameMatch[1].trim()
      : mFormatNameMatch
        ? mFormatNameMatch[1].trim()
        : heading;
    const version = versionMatch ? 'v' + versionMatch[1] : null;
    const number = numMatch ? parseInt(numMatch[1]) : null;

    // Extract Start/Target dates and goal from section text after heading
    const afterHeading = roadmapContent.slice(mMatch.index, mMatch.index + 500);
    const startMatch = afterHeading.match(/\*\*Start:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    const targetMatch = afterHeading.match(/\*\*Target:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    const goalMatch = afterHeading.match(/\*\*Goal:\*\*\s*(.+)/);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    milestones.push({
      name,
      number,
      version,
      goal,
      start: startMatch ? startMatch[1] : null,
      target: targetMatch ? targetMatch[1] : null,
      phases: [],
      progress_percent: 0,
    });
    milestonePositions.push({ index: mMatch.index });
  }

  // Extract active phase number once (used in loop below)
  const activePhaseMatch = stateContent.match(/\*\*Active phase:\*\*\s*(\d+)/i);
  const activePhaseNum = activePhaseMatch ? activePhaseMatch[1] : null;

  // Parse phases from ROADMAP.md
  const phaseRegex = /###\s*Phase\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  let pMatch;
  const allPhases = [];

  while ((pMatch = phaseRegex.exec(roadmapContent)) !== null) {
    const phaseNum = pMatch[1];
    const phaseName = pMatch[2].replace(/\(INSERTED\)/i, '').trim();

    // Extract duration
    const sectionStart = pMatch.index;
    const restContent = roadmapContent.slice(sectionStart + pMatch[0].length);
    const nextHeading = restContent.match(/\n###?\s/);
    const sectionText = nextHeading
      ? roadmapContent.slice(sectionStart, sectionStart + pMatch[0].length + nextHeading.index)
      : roadmapContent.slice(sectionStart);
    const durationMatch = sectionText.match(/\*\*Duration:\*\*\s*(\d+)d/);
    const duration = durationMatch ? durationMatch[1] + 'd' : null;

    // Extract type
    const typeMatch = sectionText.match(/\*\*Type:\*\*\s*(\w+)/);
    const type = typeMatch ? typeMatch[1] : null;

    // Determine which milestone this phase belongs to
    let milestoneIdx = 0;
    for (let i = 0; i < milestonePositions.length; i++) {
      if (pMatch.index > milestonePositions[i].index) {
        milestoneIdx = i;
      }
    }

    // Check phase directory on disk
    const normalized = normalizePhaseName(phaseNum);
    let plans = 0;
    let summaries = 0;
    let planFiles = [];
    let summaryFiles = [];

    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      const dirMatch = dirs.find((d) => d.startsWith(normalized + '-') || d === normalized);

      if (dirMatch) {
        const phaseFiles = fs.readdirSync(path.join(phasesDir, dirMatch));
        planFiles = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
        plans = planFiles.length;
        summaryFiles = phaseFiles.filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        summaries = summaryFiles.length;
      }
    } catch {}

    // Determine status
    let status;
    if (plans === 0) status = 'pending';
    else if (summaries >= plans) status = 'complete';
    else if (summaries > 0) status = 'in-progress';
    else status = 'planned';

    const isActive = activePhaseNum === phaseNum;

    const phaseData = {
      number: phaseNum,
      name: phaseName,
      type,
      duration,
      plans,
      summaries,
      status,
      active: isActive,
      plan_files: planFiles,
      summary_files: summaryFiles,
    };

    allPhases.push(phaseData);

    if (milestones[milestoneIdx]) {
      milestones[milestoneIdx].phases.push(phaseData);
    }
  }

  // Calculate progress for each milestone (per-phase weighting: 0-plan phases count as 0%)
  for (const ms of milestones) {
    if (ms.phases.length === 0) continue;
    let totalProgress = 0;
    for (const p of ms.phases) {
      totalProgress += p.plans > 0 ? p.summaries / p.plans : 0;
    }
    ms.progress_percent = Math.round((totalProgress / ms.phases.length) * 100);
  }

  // Parse STATE.md for summary metrics
  const blockersSection = stateContent.match(/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
  let activeBlockers = 0;
  if (blockersSection) {
    const items = blockersSection[1].match(/^-\s+(.+)$/gm) || [];
    activeBlockers = items.filter((item) => {
      const text = item.replace(/^-\s+/, '').trim();
      return text.toLowerCase() !== 'none' && text.toLowerCase() !== 'none.';
    }).length;
  }

  const deferredSection = stateContent.match(/##\s*Deferred Validations\s*\n([\s\S]*?)(?=\n##|$)/i);
  let pendingDeferred = 0;
  if (deferredSection) {
    const pendingMatches = deferredSection[1].match(/PENDING/gi);
    pendingDeferred = pendingMatches ? pendingMatches.length : 0;
  }

  const decisionsSection = stateContent.match(/##\s*Key Decisions\s*\n([\s\S]*?)(?=\n##|$)/i);
  let totalDecisions = 0;
  if (decisionsSection) {
    const tableRows = decisionsSection[1].match(/^\|[^|]/gm);
    // Subtract header row and separator row
    totalDecisions = tableRows ? Math.max(0, tableRows.length - 2) : 0;
  }

  // Calculate totals
  const totalPlans = allPhases.reduce((sum, p) => sum + p.plans, 0);
  const totalSummaries = allPhases.reduce((sum, p) => sum + p.summaries, 0);

  // Build timeline from milestones with dates
  const timeline = milestones
    .filter((ms) => ms.start && ms.target)
    .map((ms) => ({
      number: ms.number,
      name: ms.name,
      start: ms.start,
      target: ms.target,
      progress_percent: ms.progress_percent,
      phase_count: ms.phases.length,
    }));

  const jsonResult = {
    milestones: milestones.map((ms) => ({
      ...ms,
      phases: ms.phases.map(({ plan_files, summary_files, ...rest }) => rest),
    })),
    timeline,
    summary: {
      total_milestones: milestones.length,
      total_phases: allPhases.length,
      total_plans: totalPlans,
      total_summaries: totalSummaries,
      active_blockers: activeBlockers,
      pending_deferred: pendingDeferred,
      total_decisions: totalDecisions,
    },
  };

  // TUI rendering
  let tui = '# GRD Dashboard\n\n';

  for (const ms of milestones) {
    const dateRange = ms.start && ms.target ? ` [${ms.start} -> ${ms.target}]` : '';
    const msLabel = ms.number != null ? `Milestone ${ms.number}: ${ms.name}` : ms.name;
    tui += `## ${msLabel}${ms.version ? ' (' + ms.version + ')' : ''}${dateRange}\n`;
    if (ms.goal) {
      tui += `Goal: ${ms.goal}\n`;
    }

    const barWidth = 10;
    const filled = Math.round((ms.progress_percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    tui += `Progress: ${bar} ${ms.progress_percent}%\n\n`;

    for (const p of ms.phases) {
      let symbol;
      if (p.active) symbol = '\u25BA';
      else if (p.status === 'complete') symbol = '\u2713';
      else if (p.status === 'in-progress') symbol = '\u25C6';
      else if (p.status === 'planned') symbol = '\u25CB';
      else symbol = '\u25CB';

      const activeLabel = p.active ? '  [ACTIVE]' : '';
      const durationStr = p.duration ? ` (${p.duration})` : '';
      tui += `  ${symbol} Phase ${p.number}: ${p.name}${durationStr} \u2014 ${p.summaries}/${p.plans} plans${activeLabel}\n`;

      // List individual plans if <= 5
      if (p.plans > 0 && p.plans <= 5) {
        const planFilesForPhase = allPhases.find((ap) => ap.number === p.number);
        if (planFilesForPhase && planFilesForPhase.plan_files) {
          for (const pf of planFilesForPhase.plan_files) {
            const planId = pf.replace('-PLAN.md', '');
            const planHasSummary = planFilesForPhase.summary_files.some(
              (f) => f === planId + '-SUMMARY.md'
            );
            const planSymbol = planHasSummary ? '\u2713' : '\u25CB';
            tui += `    ${planSymbol} ${pf}\n`;
          }
        }
      }
    }

    tui += '\n';
  }

  // Timeline section
  const timelineMilestones = milestones.filter((ms) => ms.start && ms.target);
  if (timelineMilestones.length > 0) {
    tui += '## Timeline\n\n';
    const allStarts = timelineMilestones.map((ms) => new Date(ms.start + 'T00:00:00'));
    const allTargets = timelineMilestones.map((ms) => new Date(ms.target + 'T00:00:00'));
    const minDate = new Date(Math.min(...allStarts));
    const maxDate = new Date(Math.max(...allTargets));
    const totalDays = Math.max(1, (maxDate - minDate) / (1000 * 60 * 60 * 24));

    const tlBarWidth = 40;
    const tlLabelWidth = 10;
    const dateToPos = (dateStr) => {
      const d = new Date(dateStr + 'T00:00:00');
      return Math.round(((d - minDate) / (1000 * 60 * 60 * 24) / totalDays) * tlBarWidth);
    };

    // Header with date range
    const minStr = minDate.toISOString().slice(0, 10);
    const maxStr = maxDate.toISOString().slice(0, 10);
    const headerPad = Math.max(1, tlBarWidth - minStr.length - maxStr.length + 2);
    tui += ' '.repeat(tlLabelWidth) + minStr + ' '.repeat(headerPad) + maxStr + '\n';
    tui += ' '.repeat(tlLabelWidth) + '|' + '-'.repeat(tlBarWidth) + '|\n';

    // Each milestone bar
    for (const ms of timelineMilestones) {
      const startPos = dateToPos(ms.start);
      const endPos = dateToPos(ms.target);
      const barLen = Math.max(1, endPos - startPos);

      const label = (ms.number != null ? 'M' + ms.number : ms.name.slice(0, 8)).padEnd(
        tlLabelWidth
      );
      tui += label + ' '.repeat(startPos) + '\u2588'.repeat(barLen);
      tui += ' '.repeat(Math.max(1, tlBarWidth + 2 - startPos - barLen));
      tui += `${ms.progress_percent}%\n`;
    }

    // Today marker
    const today = new Date().toISOString().slice(0, 10);
    const todayDate = new Date(today + 'T00:00:00');
    if (todayDate >= minDate && todayDate <= maxDate) {
      const todayPos = dateToPos(today);
      tui += ' '.repeat(tlLabelWidth + todayPos) + '\u25BC Today (' + today + ')\n';
    }

    tui += '\n';
  }

  tui += '---\n';
  tui += `Summary: ${milestones.length} milestones | ${allPhases.length} phases | ${totalSummaries}/${totalPlans} plans complete\n`;
  tui += `Blockers: ${activeBlockers} | Deferred: ${pendingDeferred} | Decisions: ${totalDecisions}\n`;

  // raw=true -> JSON, raw=false -> TUI text
  if (raw) {
    output(jsonResult, raw);
  } else {
    process.stdout.write(tui);
    process.exit(0);
  }
}

// ─── Phase Detail ────────────────────────────────────────────────────────────

/**
 * CLI command: Render a detailed drill-down for a single phase with plans, decisions, and artifacts.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to display detail for
 * @param {boolean} raw - If true output JSON, if false output TUI text
 * @returns {void} Outputs phase detail to stdout and exits
 */
function cmdPhaseDetail(cwd, phase, raw) {
  if (!phase) {
    if (raw) {
      output({ error: 'Phase number required' }, raw);
    } else {
      process.stdout.write('Error: Phase number required\n');
      process.exit(0);
    }
    return;
  }

  const phasesDir = path.join(cwd, '.planning', 'phases');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const normalized = normalizePhaseName(phase);

  // Find phase directory
  let phaseDir = null;
  let phaseDirName = null;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const match = dirs.find((d) => d.startsWith(normalized + '-') || d === normalized);
    if (match) {
      phaseDir = path.join(phasesDir, match);
      phaseDirName = match;
    }
  } catch {}

  if (!phaseDir) {
    if (raw) {
      output({ error: 'Phase not found', phase }, raw);
    } else {
      process.stdout.write(`Error: Phase ${phase} not found\n`);
      process.exit(0);
    }
    return;
  }

  // Parse phase name from directory
  const dirMatch = phaseDirName.match(/^(\d+(?:\.\d+)?)-?(.*)/);
  const phaseNumber = dirMatch ? dirMatch[1].replace(/^0+(\d)/, '$1') : phase;
  const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : '';

  // Read all files in phase directory
  const phaseFiles = fs.readdirSync(phaseDir);
  const planFiles = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
  const summaryFiles = phaseFiles
    .filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md')
    .sort();

  // Build set of completed plan IDs
  const completedPlanIds = new Set(summaryFiles.map((s) => s.replace('-SUMMARY.md', '')));

  // Parse each plan
  const plans = [];
  let totalDurationMin = 0;
  let totalTasks = 0;
  let totalFiles = 0;
  const allDecisions = [];
  const allArtifacts = [];

  for (const planFile of planFiles) {
    const planId = planFile.replace('-PLAN.md', '');
    const planContent = safeReadFile(path.join(phaseDir, planFile)) || '';
    const planFm = extractFrontmatter(planContent);

    // Extract objective from <objective> tags or frontmatter
    let objective = null;
    const objMatch = planContent.match(/<objective>\s*([\s\S]*?)\s*<\/objective>/i);
    if (objMatch) {
      objective = objMatch[1].split('\n')[0].trim();
      if (objective.length > 80) objective = objective.substring(0, 77) + '...';
    }

    const hasSummary = completedPlanIds.has(planId);
    let duration = null;
    let tasks = null;
    let files = null;

    // If summary exists, parse it
    if (hasSummary) {
      const summaryPath = path.join(phaseDir, planId + '-SUMMARY.md');
      const summaryContent = safeReadFile(summaryPath) || '';
      const summaryFm = extractFrontmatter(summaryContent);

      duration = summaryFm.duration || null;
      if (summaryFm['key-files']) {
        const kf = summaryFm['key-files'];
        const created = kf.created ? (Array.isArray(kf.created) ? kf.created : [kf.created]) : [];
        const modified = kf.modified
          ? Array.isArray(kf.modified)
            ? kf.modified
            : [kf.modified]
          : [];
        files = created.length + modified.length;
        allArtifacts.push(...created);
      }
      if (summaryFm['key-decisions'] && Array.isArray(summaryFm['key-decisions'])) {
        const keyDecisions = summaryFm['key-decisions'];
        allDecisions.push(...keyDecisions);
      }

      // Parse duration into minutes for totals
      if (duration) {
        const minMatch = duration.match(/(\d+)\s*min/i);
        if (minMatch) totalDurationMin += parseInt(minMatch[1], 10);
      }

      // Count tasks from plan content
      const taskMatches = planContent.match(/<task\s/gi) || [];
      tasks = taskMatches.length;
      totalTasks += tasks;
      if (files) totalFiles += files;
    }

    plans.push({
      id: planId,
      wave: parseInt(planFm.wave, 10) || 1,
      type: planFm.type || 'execute',
      status: hasSummary ? 'complete' : 'planned',
      duration,
      tasks,
      files,
      objective,
    });
  }

  // Check for supplementary files
  const hasEval = phaseFiles.some((f) => f.endsWith('-EVAL.md') || f === 'EVAL.md');
  const hasVerification = phaseFiles.some(
    (f) => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md'
  );
  const hasReview = phaseFiles.some((f) => f.endsWith('-REVIEW.md') || f === 'REVIEW.md');
  const hasContext = phaseFiles.some((f) => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
  const hasResearch = phaseFiles.some((f) => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

  // Read STATE.md for decisions matching this phase
  const stateContent = safeReadFile(statePath) || '';
  const stateDecisions = [];
  const decisionPattern = new RegExp(`Phase\\s+${phaseNumber.replace('.', '\\.')}`, 'i');
  const decisionsSection = stateContent.match(/##\s*Key Decisions\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (decisionsSection) {
    const rows = decisionsSection[1]
      .split('\n')
      .filter((r) => r.includes('|') && decisionPattern.test(r));
    for (const row of rows) {
      const cells = row
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length >= 2) {
        stateDecisions.push(cells[1]); // Decision text
      }
    }
  }

  const allDecisionsUnique = [...new Set([...allDecisions, ...stateDecisions])];

  const durationStr = totalDurationMin > 0 ? totalDurationMin + 'min' : null;
  const completedCount = plans.filter((p) => p.status === 'complete').length;

  const result = {
    phase_number: phaseNumber,
    phase_name: phaseName,
    directory: path.join('.planning', 'phases', phaseDirName),
    plans,
    decisions: allDecisionsUnique,
    artifacts: [...new Set(allArtifacts)],
    has_eval: hasEval,
    has_verification: hasVerification,
    has_review: hasReview,
    has_context: hasContext,
    has_research: hasResearch,
    summary_stats: {
      total_plans: plans.length,
      completed: completedCount,
      total_duration: durationStr,
      total_tasks: totalTasks,
      total_files: totalFiles,
    },
  };

  // TUI rendering
  let tui = `# Phase ${phaseNumber}: ${phaseName}\n\n`;

  const statusLabel =
    completedCount === plans.length && plans.length > 0
      ? 'Complete'
      : completedCount > 0
        ? 'In Progress'
        : 'Planned';
  tui += `Status: ${statusLabel} (${completedCount}/${plans.length} plans)\n`;
  tui += `Directory: .planning/phases/${phaseDirName}\n\n`;

  // Plans table
  tui +=
    '| Plan  | Wave | Status | Duration | Tasks | Files | Objective                              |\n';
  tui +=
    '|-------|------|--------|----------|-------|-------|----------------------------------------|\n';
  for (const p of plans) {
    const sym = p.status === 'complete' ? '\u2713' : '\u25CB';
    const dur = p.duration || '-';
    const tsk = p.tasks !== null ? String(p.tasks) : '-';
    const fil = p.files !== null ? String(p.files) : '-';
    const obj = p.objective
      ? p.objective.length > 40
        ? p.objective.substring(0, 37) + '...'
        : p.objective
      : '-';
    tui += `| ${p.id.padEnd(5)} | ${String(p.wave).padEnd(4)} | ${sym.padEnd(6)} | ${dur.padEnd(8)} | ${tsk.padEnd(5)} | ${fil.padEnd(5)} | ${obj.padEnd(40)} |\n`;
  }

  if (durationStr) {
    tui += `\nTotals: ${durationStr} | ${totalTasks} tasks | ${totalFiles} files\n`;
  }

  // Decisions
  if (allDecisionsUnique.length > 0) {
    tui += `\n## Decisions (${allDecisionsUnique.length})\n`;
    for (const d of allDecisionsUnique) {
      tui += `- ${d}\n`;
    }
  }

  // Artifacts status
  tui += '\n## Artifacts\n';
  tui += `Context: ${hasContext ? '\u2713' : '\u2717'} | Research: ${hasResearch ? '\u2713' : '\u2717'} | Eval: ${hasEval ? '\u2713' : '\u2717'} | Verification: ${hasVerification ? '\u2713' : '\u2717'} | Review: ${hasReview ? '\u2713' : '\u2717'}\n`;

  // raw=true -> JSON, raw=false -> TUI text
  if (raw) {
    output(result, raw);
  } else {
    process.stdout.write(tui);
    process.exit(0);
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

/**
 * CLI command: Display project health indicators including blockers, deferred validations, velocity, and risks.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - If true output JSON, if false output TUI text
 * @returns {void} Outputs health indicators to stdout and exits
 */
function cmdHealth(cwd, raw) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const baselinePath = path.join(cwd, '.planning', 'BASELINE.md');
  const stateContent = safeReadFile(statePath) || '';
  const roadmapContent = safeReadFile(roadmapPath) || '';
  const baselineContent = safeReadFile(baselinePath) || '';

  // 1. Parse blockers
  const blockerItems = [];
  const blockersSection = stateContent.match(/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (blockersSection) {
    const items = blockersSection[1].match(/^-\s+(.+)$/gm) || [];
    for (const item of items) {
      const text = item.replace(/^-\s+/, '').trim();
      if (text.toLowerCase() !== 'none' && text.toLowerCase() !== 'none.') {
        blockerItems.push(text);
      }
    }
  }

  // 2. Parse deferred validations
  const deferredItems = [];
  let deferredTotal = 0;
  let deferredPending = 0;
  let deferredResolved = 0;
  const deferredSection = stateContent.match(/##\s*Deferred Validations\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (deferredSection) {
    const tableRows = deferredSection[1]
      .split('\n')
      .filter((r) => r.startsWith('|') && !r.match(/^\|[\s-]+\|/) && !r.match(/^\|\s*ID\s*\|/i));
    for (const row of tableRows) {
      const cells = row
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
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

        deferredItems.push({
          id,
          description,
          from_phase: fromPhase,
          validates_at: validatesAt,
          status,
        });
      }
    }
  }

  // 3. Parse performance metrics for velocity
  const velocityData = {
    total_plans: 0,
    total_duration_min: 0,
    avg_duration_min: 0,
    recent_5_avg_min: 0,
  };
  const metricsSection = stateContent.match(/##\s*Performance Metrics\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (metricsSection) {
    const metricRows = metricsSection[1]
      .split('\n')
      .filter((r) => r.startsWith('|') && !r.match(/^\|[\s-]+\|/) && !r.match(/^\|\s*Phase/i));
    const durations = [];
    for (const row of metricRows) {
      const cells = row
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length >= 2) {
        const durMatch = cells[1].match(/(\d+)\s*min/i);
        if (durMatch) {
          durations.push(parseInt(durMatch[1], 10));
        }
      }
    }

    velocityData.total_plans = durations.length;
    velocityData.total_duration_min = durations.reduce((sum, d) => sum + d, 0);
    velocityData.avg_duration_min =
      durations.length > 0
        ? Math.round((velocityData.total_duration_min / durations.length) * 10) / 10
        : 0;
    const recent5 = durations.slice(-5);
    velocityData.recent_5_avg_min =
      recent5.length > 0
        ? Math.round((recent5.reduce((sum, d) => sum + d, 0) / recent5.length) * 10) / 10
        : 0;
  }

  // 4. Check for stale phases (phases with plans but no summaries)
  const stalePhases = [];
  const phasesDir = path.join(cwd, '.planning', 'phases');
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const dir of dirs) {
      const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
      const planCount = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaryCount = phaseFiles.filter(
        (f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md'
      ).length;
      if (planCount > 0 && summaryCount === 0) {
        stalePhases.push(dir);
      }
    }
  } catch {}

  // 5. Parse risk register from ROADMAP.md
  const risks = [];
  const riskSection = roadmapContent.match(/##\s*Risk Register\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (riskSection) {
    const riskRows = riskSection[1]
      .split('\n')
      .filter((r) => r.startsWith('|') && !r.match(/^\|[\s-]+\|/) && !r.match(/^\|\s*Risk\s*\|/i));
    for (const row of riskRows) {
      const cells = row
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length >= 4) {
        risks.push({
          risk: cells[0],
          probability: cells[1],
          impact: cells[2],
          phase: cells.length >= 5 ? cells[4] : cells[3],
        });
      }
    }
  }

  // 6. Parse baseline
  let baseline = null;
  if (baselineContent) {
    baseline = { exists: true };
  }

  const result = {
    blockers: {
      count: blockerItems.length,
      items: blockerItems,
    },
    deferred_validations: {
      total: deferredTotal,
      pending: deferredPending,
      resolved: deferredResolved,
      items: deferredItems,
    },
    velocity: velocityData,
    stale_phases: stalePhases,
    risks,
    baseline,
  };

  // TUI rendering
  let tui = '# Project Health\n\n';

  // Blockers
  tui += '## Blockers\n';
  if (blockerItems.length === 0) {
    tui += 'None \u2713\n';
  } else {
    for (const b of blockerItems) {
      tui += `\u2717 ${b}\n`;
    }
  }

  // Deferred validations
  tui += `\n## Deferred Validations (${deferredPending} pending / ${deferredTotal} total)\n`;
  // Show pending first, then resolved
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
  if (stalePhases.length === 0) {
    tui += 'None \u2713\n';
  } else {
    for (const s of stalePhases) {
      tui += `\u26A0 ${s}\n`;
    }
  }

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

  // raw=true -> JSON, raw=false -> TUI text
  if (raw) {
    output(result, raw);
  } else {
    process.stdout.write(tui);
    process.exit(0);
  }
}

// ─── Detect Backend ──────────────────────────────────────────────────────────

/**
 * CLI command: Detect the current AI coding CLI backend and return comprehensive
 * backend information (backend name, resolved model names, capability flags).
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw backend name string instead of JSON
 * @returns {void} Outputs backend info to stdout and exits
 */
function cmdDetectBackend(cwd, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);

  const models = {
    opus: resolveBackendModel(backend, 'opus', config, cwd),
    sonnet: resolveBackendModel(backend, 'sonnet', config, cwd),
    haiku: resolveBackendModel(backend, 'haiku', config, cwd),
  };

  const detected = getCachedModels(backend, cwd);
  const models_source = detected ? 'detected' : 'defaults';

  const capabilities = getBackendCapabilities(backend);

  const result = { backend, models, models_source, capabilities };
  output(result, raw, backend);
}

// ─── Long-Term Roadmap ───────────────────────────────────────────────────────

/**
 * CLI command: Manage long-term roadmap operations (parse, validate, display, mode, generate, refine, promote, tier, history).
 * @param {string} cwd - Project working directory
 * @param {string} subcommand - One of: 'parse', 'validate', 'display', 'mode', 'generate', 'refine', 'promote', 'tier', 'history'
 * @param {string[]} args - Remaining CLI args (file paths, flags)
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdLongTermRoadmap(cwd, subcommand, args, raw) {
  switch (subcommand) {
    case 'parse': {
      const filePath = args[0]
        ? path.isAbsolute(args[0])
          ? args[0]
          : path.join(cwd, args[0])
        : path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
      const content = safeReadFile(filePath);
      if (!content) {
        output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, '');
        return;
      }
      const parsed = parseLongTermRoadmap(content);
      if (raw) {
        const nowCount = parsed && parsed.now ? 1 : 0;
        const nextCount = parsed && parsed.next ? parsed.next.length : 0;
        const laterCount = parsed && parsed.later ? parsed.later.length : 0;
        const total = nowCount + nextCount + laterCount;
        output(
          parsed,
          raw,
          `${total} milestones (${nowCount} now, ${nextCount} next, ${laterCount} later)`
        );
      } else {
        output(parsed, raw);
      }
      break;
    }
    case 'validate': {
      const valFilePath = args[0]
        ? path.isAbsolute(args[0])
          ? args[0]
          : path.join(cwd, args[0])
        : path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
      const valContent = safeReadFile(valFilePath);
      if (!valContent) {
        output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, '');
        return;
      }
      const valParsed = parseLongTermRoadmap(valContent);
      const validation = validateLongTermRoadmap(valParsed);
      if (raw) {
        const rawText = validation.valid ? 'valid' : 'invalid: ' + validation.errors.join('; ');
        output(validation, raw, rawText);
      } else {
        output(validation, raw);
      }
      break;
    }
    case 'display': {
      const dispFilePath = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
      const dispContent = safeReadFile(dispFilePath);
      if (!dispContent) {
        output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, '');
        return;
      }
      const dispParsed = parseLongTermRoadmap(dispContent);
      const formatted = formatLongTermRoadmap(dispParsed);
      const milestoneCount =
        (dispParsed && dispParsed.now ? 1 : 0) +
        (dispParsed && dispParsed.next ? dispParsed.next.length : 0) +
        (dispParsed && dispParsed.later ? dispParsed.later.length : 0);
      if (raw) {
        output(
          { formatted, milestone_count: milestoneCount, mode: 'hierarchical' },
          raw,
          formatted
        );
      } else {
        output({ formatted, milestone_count: milestoneCount, mode: 'hierarchical' }, raw);
      }
      break;
    }
    case 'mode': {
      const mode = getPlanningMode(cwd);
      const ltrmPath = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
      const ltrmExists = fs.existsSync(ltrmPath);
      const result = { mode, long_term_roadmap_exists: ltrmExists };
      output(result, raw, mode);
      break;
    }
    case 'generate': {
      const projectName = flag(args, '--project', null);
      const horizon = flag(args, '--horizon', '6 months');
      const milestonesJson = flag(args, '--milestones', null);
      if (!milestonesJson) {
        error('milestones JSON required');
        return;
      }
      let milestones;
      try {
        milestones = JSON.parse(milestonesJson);
      } catch (e) {
        error('Invalid milestones JSON: ' + e.message);
        return;
      }
      const content = generateLongTermRoadmap(milestones, projectName, horizon);
      const genResult = { content, path: '.planning/LONG-TERM-ROADMAP.md' };
      output(genResult, raw, content);
      break;
    }
    case 'tier': {
      const version = flag(args, '--version', null);
      if (!version) {
        error('--version flag required');
        return;
      }
      const tierFilePath = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
      const tierContent = safeReadFile(tierFilePath);
      if (!tierContent) {
        output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, '');
        return;
      }
      const tier = getMilestoneTier(tierContent, version);
      output({ version, tier }, raw, tier || 'not found');
      break;
    }
    case 'refine': {
      const refVersion = flag(args, '--version', null);
      const updatesJson = flag(args, '--updates', null);
      if (!refVersion) {
        error('--version flag required');
        return;
      }
      if (!updatesJson) {
        error('--updates JSON required');
        return;
      }
      let updates;
      try {
        updates = JSON.parse(updatesJson);
      } catch (e) {
        error('Invalid updates JSON: ' + e.message);
        return;
      }
      const refFilePath = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
      const refContent = safeReadFile(refFilePath);
      if (!refContent) {
        output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, '');
        return;
      }
      const refResult = refineMilestone(refContent, refVersion, updates);
      if (refResult && typeof refResult === 'object' && refResult.error) {
        output({ error: refResult.error }, raw, refResult.error);
      } else {
        output(
          {
            content: refResult,
            path: '.planning/LONG-TERM-ROADMAP.md',
            version: refVersion,
            updated_fields: Object.keys(updates),
          },
          raw,
          refResult
        );
      }
      break;
    }
    case 'promote': {
      const proVersion = flag(args, '--version', null);
      if (!proVersion) {
        error('--version flag required');
        return;
      }
      const proFilePath = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
      const proContent = safeReadFile(proFilePath);
      if (!proContent) {
        output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, '');
        return;
      }
      const proResult = promoteMilestone(proContent, proVersion);
      if (proResult && typeof proResult === 'object' && proResult.error) {
        output({ error: proResult.error }, raw, proResult.error);
      } else {
        const newTier = getMilestoneTier(proResult, proVersion);
        output(
          {
            content: proResult,
            path: '.planning/LONG-TERM-ROADMAP.md',
            version: proVersion,
            new_tier: newTier,
          },
          raw,
          proResult
        );
      }
      break;
    }
    case 'history': {
      const histAction = flag(args, '--action', null);
      const histDetails = flag(args, '--details', null);
      if (!histAction) {
        error('--action flag required');
        return;
      }
      if (!histDetails) {
        error('--details flag required');
        return;
      }
      const histFilePath = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
      const histContent = safeReadFile(histFilePath);
      if (!histContent) {
        output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, '');
        return;
      }
      const histResult = updateRefinementHistory(histContent, histAction, histDetails);
      output(
        {
          content: histResult,
          path: '.planning/LONG-TERM-ROADMAP.md',
          action: histAction,
          details: histDetails,
        },
        raw,
        histResult
      );
      break;
    }
    default:
      error(
        'Unknown subcommand: ' +
          subcommand +
          '. Valid: parse, validate, display, mode, generate, refine, promote, tier, history'
      );
  }
}

// ─── Quality Analysis ────────────────────────────────────────────────────────

/**
 * CLI command: Run quality analysis for a phase.
 * @param {string} cwd - Project working directory
 * @param {string[]} args - CLI arguments (expects --phase <N>)
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdQualityAnalysis(cwd, args, raw) {
  const phaseNum = flag(args, '--phase');
  if (!phaseNum) {
    error('--phase flag required for quality-analysis');
  }
  const report = runQualityAnalysis(cwd, phaseNum);
  if (report.skipped) {
    output(report, raw, report.reason);
    return;
  }
  if (raw) {
    // Human-readable summary
    const lines = [
      `Quality Analysis - Phase ${report.phase}`,
      `Date: ${report.timestamp}`,
      '',
      `Total issues: ${report.summary.total_issues}`,
      `  Complexity violations: ${report.summary.complexity_violations}`,
      `  Dead exports: ${report.summary.dead_exports}`,
      `  Oversized files: ${report.summary.oversized_files}`,
    ];
    if (report.details.complexity.length > 0) {
      lines.push('', 'Complexity Violations:');
      for (const v of report.details.complexity) {
        lines.push(`  ${v.file}:${v.line} - ${v.functionName} (complexity: ${v.complexity})`);
      }
    }
    if (report.details.dead_exports.length > 0) {
      lines.push('', 'Dead Exports:');
      for (const v of report.details.dead_exports) {
        lines.push(`  ${v.file} - ${v.exportName}`);
      }
    }
    if (report.details.file_size.length > 0) {
      lines.push('', 'Oversized Files:');
      for (const v of report.details.file_size) {
        lines.push(`  ${v.file} - ${v.lines} lines (threshold: ${v.threshold})`);
      }
    }
    output(report, true, lines.join('\n'));
  } else {
    output(report, false, '');
  }
}

/**
 * Extract --flag value from args array, returns value or fallback.
 * @param {string[]} args - Args array to search
 * @param {string} name - Flag name (e.g., '--project')
 * @param {*} fallback - Default value if flag not found
 * @returns {*} Flag value or fallback
 */
function flag(args, name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

/**
 * CLI command: Output plugin configuration info so users can register GRD as a Claude Code plugin.
 * Locates the package root and .claude-plugin/plugin.json, then outputs paths and instructions.
 * @param {string} cwd - Project working directory (unused; package root derived from module location)
 * @param {boolean} raw - Output human-readable instructions instead of JSON
 * @returns {void} Outputs setup info to stdout and exits
 */
function cmdSetup(cwd, raw) {
  const packageRoot = path.resolve(__dirname, '..');
  const pluginJsonPath = path.join(packageRoot, '.claude-plugin', 'plugin.json');

  if (!fs.existsSync(pluginJsonPath)) {
    error('GRD installation not found. Run this command from a valid GRD installation.');
  }

  const pluginDir = path.join(packageRoot, '.claude-plugin');

  const result = {
    package_root: packageRoot,
    plugin_json: pluginJsonPath,
    instructions: `Add to Claude Code settings:\n  "plugin_path": "${pluginDir}"`,
  };

  const rawText = [
    'GRD plugin configured.',
    `Package root: ${packageRoot}`,
    `Plugin config: ${pluginJsonPath}`,
    '',
    'To use with Claude Code, add this plugin path to your Claude Code configuration:',
    `  ${pluginDir}`,
  ].join('\n');

  output(result, raw, rawText);
}

// ─── Requirements ────────────────────────────────────────────────────────────

/**
 * Parse requirements from REQUIREMENTS.md content into structured array.
 * @param {string} content - Raw REQUIREMENTS.md file content
 * @returns {Array<Object>} Array of requirement objects with id, title, priority, category, description, deferred_from, resolves
 */
function parseRequirements(content) {
  if (!content) return [];
  const requirements = [];
  // Split by ### REQ- headings
  const parts = content.split(/(?=^### REQ-)/m);
  for (const part of parts) {
    const headingMatch = part.match(/^### (REQ-\d+):\s*(.+)/m);
    if (!headingMatch) continue;
    const id = headingMatch[1];
    const title = headingMatch[2].trim();
    const priorityMatch = part.match(/\*\*Priority:\*\*\s*(\S+)/);
    const categoryMatch = part.match(/\*\*Category:\*\*\s*(.+)/);
    const deferredMatch = part.match(/\*\*Deferred from:\*\*\s*(.+)/);
    const resolvesMatch = part.match(/\*\*Resolves:\*\*\s*(.+)/);

    // Description: everything after the metadata lines, stop at next section heading or separator
    const lines = part.split('\n');
    const descLines = [];
    let pastHeading = false;
    for (const line of lines) {
      if (/^### REQ-/.test(line)) {
        pastHeading = true;
        continue;
      }
      if (!pastHeading) continue;
      if (/^\*\*(Priority|Category|Deferred from|Resolves):\*\*/.test(line)) continue;
      // Stop at next section heading or separator
      if (/^##\s/.test(line) || /^---\s*$/.test(line)) break;
      descLines.push(line);
    }
    const description = descLines.join('\n').trim();

    requirements.push({
      id,
      title,
      priority: priorityMatch ? priorityMatch[1].trim() : null,
      category: categoryMatch ? categoryMatch[1].trim() : null,
      deferred_from: deferredMatch ? deferredMatch[1].trim() : null,
      resolves: resolvesMatch ? resolvesMatch[1].trim() : null,
      description: description || null,
    });
  }
  return requirements;
}

/**
 * Parse the Traceability Matrix table from REQUIREMENTS.md content.
 * @param {string} content - Raw REQUIREMENTS.md file content
 * @returns {Array<Object>} Array of objects with req, feature, priority, phase, status
 */
function parseTraceabilityMatrix(content) {
  if (!content) return [];
  const matrix = [];
  // Find section starting with ## Traceability Matrix
  const sectionMatch = content.match(/##\s*Traceability Matrix\s*\n([\s\S]*?)(?=\n---|\n##|$)/i);
  if (!sectionMatch) return [];

  const tableContent = sectionMatch[1];
  const rows = tableContent.split('\n').filter((r) => r.startsWith('|'));
  // Skip header row and separator row
  const dataRows = rows.filter(
    (r) => !r.match(/^\|\s*REQ\s*\|/i) && !r.match(/^\|[\s-]+\|/)
  );

  for (const row of dataRows) {
    const cells = row
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 5) {
      matrix.push({
        req: cells[0],
        feature: cells[1],
        priority: cells[2],
        phase: cells[3],
        status: cells[4],
      });
    }
  }
  return matrix;
}

/**
 * CLI command: Look up a single requirement by ID, returning structured JSON.
 * Falls back to archived milestone REQUIREMENTS.md files if not in current file.
 * @param {string} cwd - Project working directory
 * @param {string} reqId - Requirement ID (e.g., "REQ-31")
 * @param {boolean} raw - Output raw JSON string instead of pretty-printed
 * @returns {void} Outputs requirement JSON to stdout and exits
 */
function cmdRequirementGet(cwd, reqId, raw) {
  const reqFilePath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const content = safeReadFile(reqFilePath);

  // Search current file first
  if (content) {
    const requirements = parseRequirements(content);
    const match = requirements.find(
      (r) => r.id.toLowerCase() === reqId.toLowerCase()
    );
    if (match) {
      // Merge status and phase from traceability matrix
      const matrix = parseTraceabilityMatrix(content);
      const matrixRow = matrix.find(
        (m) => m.req.toLowerCase() === reqId.toLowerCase()
      );
      if (matrixRow) {
        match.status = matrixRow.status;
        match.phase = matrixRow.phase;
      }
      output(match, raw);
      return;
    }
  }

  // Fallback: scan archived milestone REQUIREMENTS.md files
  const milestonesDir = path.join(cwd, '.planning', 'milestones');
  try {
    const files = fs.readdirSync(milestonesDir).filter(
      (f) => f.match(/^v[\d.]+-REQUIREMENTS\.md$/i)
    );
    for (const file of files) {
      const filePath = path.join(milestonesDir, file);
      const archiveContent = safeReadFile(filePath);
      if (!archiveContent) continue;
      const archiveReqs = parseRequirements(archiveContent);
      const match = archiveReqs.find(
        (r) => r.id.toLowerCase() === reqId.toLowerCase()
      );
      if (match) {
        // Merge status from archived traceability matrix
        const matrix = parseTraceabilityMatrix(archiveContent);
        const matrixRow = matrix.find(
          (m) => m.req.toLowerCase() === reqId.toLowerCase()
        );
        if (matrixRow) {
          match.status = matrixRow.status;
          match.phase = matrixRow.phase;
        }
        // Extract milestone version from filename
        const versionMatch = file.match(/^(v[\d.]+)-REQUIREMENTS\.md$/i);
        match.milestone = versionMatch ? versionMatch[1] : file;
        output(match, raw);
        return;
      }
    }
  } catch {
    // milestones directory may not exist
  }

  // Not found anywhere
  output({ error: 'Requirement not found', id: reqId }, raw);
}

/**
 * CLI command: List requirements with optional filters.
 * @param {string} cwd - Project working directory
 * @param {Object} filters - Filter object: { phase, priority, status, category, all }
 * @param {boolean} raw - Output raw JSON string instead of pretty-printed
 * @returns {void} Outputs filtered requirements list to stdout and exits
 */
function cmdRequirementList(cwd, filters, raw) {
  filters = filters || {};
  const reqFilePath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const content = safeReadFile(reqFilePath);

  let allReqs = [];
  let matrix = [];

  if (content) {
    allReqs = parseRequirements(content);
    matrix = parseTraceabilityMatrix(content);

    // Merge status/phase from matrix into each requirement
    for (const req of allReqs) {
      const matrixRow = matrix.find(
        (m) => m.req.toLowerCase() === req.id.toLowerCase()
      );
      if (matrixRow) {
        req.status = matrixRow.status;
        req.phase = matrixRow.phase;
      }
    }
  }

  // If --all, include archived milestone requirements
  if (filters.all) {
    const milestonesDir = path.join(cwd, '.planning', 'milestones');
    try {
      const files = fs.readdirSync(milestonesDir).filter(
        (f) => f.match(/^v[\d.]+-REQUIREMENTS\.md$/i)
      );
      for (const file of files) {
        const filePath = path.join(milestonesDir, file);
        const archiveContent = safeReadFile(filePath);
        if (!archiveContent) continue;
        const archiveReqs = parseRequirements(archiveContent);
        const archiveMatrix = parseTraceabilityMatrix(archiveContent);
        const versionMatch = file.match(/^(v[\d.]+)-REQUIREMENTS\.md$/i);
        const milestone = versionMatch ? versionMatch[1] : file;

        for (const req of archiveReqs) {
          // Skip if already in current file
          if (allReqs.find((r) => r.id.toLowerCase() === req.id.toLowerCase())) continue;
          const matrixRow = archiveMatrix.find(
            (m) => m.req.toLowerCase() === req.id.toLowerCase()
          );
          if (matrixRow) {
            req.status = matrixRow.status;
            req.phase = matrixRow.phase;
          }
          req.milestone = milestone;
          allReqs.push(req);
        }
      }
    } catch {
      // milestones directory may not exist
    }
  }

  // Apply filters (AND logic)
  let filtered = allReqs;

  if (filters.phase) {
    filtered = filtered.filter((r) => {
      if (!r.phase) return false;
      // Match "Phase N" where N matches filter value
      const phaseNum = r.phase.match(/(\d+)/);
      return phaseNum && phaseNum[1] === String(filters.phase);
    });
  }

  if (filters.priority) {
    filtered = filtered.filter((r) => r.priority === filters.priority);
  }

  if (filters.status) {
    filtered = filtered.filter((r) => r.status === filters.status);
  }

  if (filters.category) {
    filtered = filtered.filter((r) => r.category === filters.category);
  }

  const filtersApplied = {};
  if (filters.phase) filtersApplied.phase = filters.phase;
  if (filters.priority) filtersApplied.priority = filters.priority;
  if (filters.status) filtersApplied.status = filters.status;
  if (filters.category) filtersApplied.category = filters.category;
  if (filters.all) filtersApplied.all = true;

  const result = {
    requirements: filtered,
    count: filtered.length,
    filters_applied: filtersApplied,
  };
  output(result, raw);
}

/**
 * CLI command: Return traceability matrix as structured JSON.
 * @param {string} cwd - Project working directory
 * @param {Object} filters - Filter object: { phase }
 * @param {boolean} raw - Output raw JSON string instead of pretty-printed
 * @returns {void} Outputs traceability matrix to stdout and exits
 */
function cmdRequirementTraceability(cwd, filters, raw) {
  filters = filters || {};
  const reqFilePath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const content = safeReadFile(reqFilePath);

  let matrix = [];
  if (content) {
    matrix = parseTraceabilityMatrix(content);
  }

  // Apply phase filter
  if (filters.phase) {
    matrix = matrix.filter((row) => {
      const phaseNum = row.phase.match(/(\d+)/);
      return phaseNum && phaseNum[1] === String(filters.phase);
    });
  }

  const result = { matrix, count: matrix.length };
  output(result, raw);
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdListTodos,
  cmdTodoComplete,
  cmdVerifyPathExists,
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdHistoryDigest,
  cmdResolveModel,
  cmdFindPhase,
  cmdCommit,
  cmdPhasePlanIndex,
  cmdSummaryExtract,
  cmdProgressRender,
  cmdDashboard,
  cmdPhaseDetail,
  cmdHealth,
  cmdDetectBackend,
  cmdLongTermRoadmap,
  cmdQualityAnalysis,
  cmdSetup,
  cmdRequirementGet,
  cmdRequirementList,
  cmdRequirementTraceability,
  parseRequirements,
  parseTraceabilityMatrix,
};
