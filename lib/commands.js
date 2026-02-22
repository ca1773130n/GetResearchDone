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
const child_process = require('child_process');

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
  formatLongTermRoadmap,
  updateRefinementHistory,
  addLtMilestone,
  removeLtMilestone,
  updateLtMilestone,
  linkNormalMilestone,
  unlinkNormalMilestone,
  getLtMilestoneById,
  initFromRoadmap,
} = require('./long-term-roadmap');
const { runQualityAnalysis } = require('./cleanup');
const {
  currentMilestone,
  phasesDir: getPhasesDirPath,
  todosDir: getTodosDirPath,
  milestonesDir: getMilestonesDirPath,
} = require('./paths');

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
  const pendingDir = path.join(getTodosDirPath(cwd), 'pending');

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
          path: path.relative(cwd, path.join(pendingDir, file)),
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

  const pendingDir = path.join(getTodosDirPath(cwd), 'pending');
  const completedDir = path.join(getTodosDirPath(cwd), 'completed');
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
  const phasesDir = getPhasesDirPath(cwd);
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

  const phasesDir = getPhasesDirPath(cwd);
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
      directory: path.relative(cwd, path.join(phasesDir, match)),
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

  const phasesDir = getPhasesDirPath(cwd);
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

    // Parse files_modified (underscore key from YAML) or files-modified (hyphen fallback)
    let filesModified = [];
    if (fm.files_modified || fm['files-modified']) {
      const raw = fm.files_modified || fm['files-modified'];
      filesModified = Array.isArray(raw) ? raw : [raw];
    }

    const hasSummary = completedPlanIds.has(planId);
    if (!hasSummary) {
      incomplete.push(planId);
    }

    // Extract objective: frontmatter first, then <objective> XML tag in body
    // Search body only (after frontmatter) to avoid matching <objective> in frontmatter strings
    let objective = fm.objective || null;
    if (!objective) {
      const bodyStart = content.match(/^---\n[\s\S]+?\n---\n?/);
      const body = bodyStart ? content.slice(bodyStart[0].length) : content;
      const objMatch = body.match(/<objective>\s*([\s\S]*?)\s*<\/objective>/i);
      if (objMatch) {
        objective = objMatch[1].trim().split('\n')[0].trim();
      }
    }

    const plan = {
      id: planId,
      wave,
      autonomous,
      objective,
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
  const phasesDir = getPhasesDirPath(cwd);
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
function makeShippedMilestone(name, version, shippedDate, phaseRange, phaseCount) {
  return {
    name,
    number: null,
    version,
    goal: null,
    start: null,
    target: null,
    status: 'shipped',
    shipped_date: shippedDate,
    phase_range: phaseRange,
    phase_count: phaseCount,
    progress_percent: 100,
    phases: [],
  };
}

function parseDashboardShippedMilestones(roadmapContent) {
  const shippedMilestones = [];
  const milestonesSection = roadmapContent.match(/^##\s+Milestones\s*\n([\s\S]*?)(?=\n##\s|\n$)/m);
  if (!milestonesSection) return shippedMilestones;

  const shippedWithPhasesRegex =
    /^-\s+(v[\d.]+)\s+(.+?)\s*-\s*Phases\s+(\d+)-(\d+)\s*\(shipped\s+(\d{4}-\d{2}-\d{2})\)/gm;
  const shippedNoPhasesRegex = /^-\s+(v[\d.]+)\s+(.+?)\s*\(shipped\s+(\d{4}-\d{2}-\d{2})\)/gm;
  const seen = new Set();
  let sMatch;
  while ((sMatch = shippedWithPhasesRegex.exec(milestonesSection[1])) !== null) {
    const startPhase = parseInt(sMatch[3]);
    const endPhase = parseInt(sMatch[4]);
    seen.add(sMatch[1]);
    shippedMilestones.push(
      makeShippedMilestone(
        sMatch[2].trim(),
        sMatch[1],
        sMatch[5],
        `${startPhase}-${endPhase}`,
        endPhase - startPhase + 1
      )
    );
  }
  while ((sMatch = shippedNoPhasesRegex.exec(milestonesSection[1])) !== null) {
    if (seen.has(sMatch[1])) continue;
    shippedMilestones.push(makeShippedMilestone(sMatch[2].trim(), sMatch[1], sMatch[3], null, 0));
  }
  return shippedMilestones;
}

function parseDashboardActiveMilestones(roadmapContent) {
  const milestoneRegex = /^##\s+(Milestone\s+\d+[^:\n]*:\s*([^\n]+)|.*v(\d+\.\d+)[^\n]*)/gim;
  const activeMilestones = [];
  const milestonePositions = [];
  let mMatch;

  while ((mMatch = milestoneRegex.exec(roadmapContent)) !== null) {
    const heading = mMatch[0].replace(/^##\s+/, '').trim();
    if (/^(Milestones|Phases|Deferred\s+Validations)$/i.test(heading)) continue;
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

    const afterHeading = roadmapContent.slice(mMatch.index, mMatch.index + 500);
    const startMatch = afterHeading.match(/\*\*Start:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    const targetMatch = afterHeading.match(/\*\*Target:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    const goalMatch = afterHeading.match(/\*\*Goal:\*\*\s*(.+)/);

    activeMilestones.push({
      name,
      number,
      version,
      goal: goalMatch ? goalMatch[1].trim() : null,
      start: startMatch ? startMatch[1] : null,
      target: targetMatch ? targetMatch[1] : null,
      phases: [],
      progress_percent: 0,
    });
    milestonePositions.push({ index: mMatch.index });
  }
  return { activeMilestones, milestonePositions };
}

function parseDashboardPhases(
  roadmapContent,
  phasesDir,
  milestonePositions,
  activePhaseNum,
  activeMilestones
) {
  const phaseRegex = /###\s*Phase\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  let pMatch;
  const allPhases = [];

  while ((pMatch = phaseRegex.exec(roadmapContent)) !== null) {
    const phaseNum = pMatch[1];
    const phaseName = pMatch[2].replace(/\(INSERTED\)/i, '').trim();
    const sectionStart = pMatch.index;
    const restContent = roadmapContent.slice(sectionStart + pMatch[0].length);
    const nextHeading = restContent.match(/\n###?\s/);
    const sectionText = nextHeading
      ? roadmapContent.slice(sectionStart, sectionStart + pMatch[0].length + nextHeading.index)
      : roadmapContent.slice(sectionStart);
    const durationMatch = sectionText.match(/\*\*Duration:\*\*\s*(\d+)d/);
    const duration = durationMatch ? durationMatch[1] + 'd' : null;
    const typeMatch = sectionText.match(/\*\*Type:\*\*\s*(\w+)/);
    const type = typeMatch ? typeMatch[1] : null;

    let activeMsIdx = 0;
    for (let i = 0; i < milestonePositions.length; i++) {
      if (pMatch.index > milestonePositions[i].index) activeMsIdx = i;
    }

    const normalized = normalizePhaseName(phaseNum);
    let plans = 0,
      summaries = 0,
      planFiles = [],
      summaryFiles = [];
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
    } catch {
      /* no phases dir */
    }

    let status;
    if (plans === 0) status = 'pending';
    else if (summaries >= plans) status = 'complete';
    else if (summaries > 0) status = 'in-progress';
    else status = 'planned';

    const phaseData = {
      number: phaseNum,
      name: phaseName,
      type,
      duration,
      plans,
      summaries,
      status,
      active: activePhaseNum === phaseNum,
      plan_files: planFiles,
      summary_files: summaryFiles,
    };
    allPhases.push(phaseData);
    if (activeMilestones[activeMsIdx]) activeMilestones[activeMsIdx].phases.push(phaseData);
  }
  return allPhases;
}

function parseDashboardStateSummary(stateContent) {
  let activeBlockers = 0;
  const blockersSection = stateContent.match(/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (blockersSection) {
    const items = blockersSection[1].match(/^-\s+(.+)$/gm) || [];
    activeBlockers = items.filter((item) => {
      const text = item.replace(/^-\s+/, '').trim();
      return text.toLowerCase() !== 'none' && text.toLowerCase() !== 'none.';
    }).length;
  }

  let pendingDeferred = 0;
  const deferredSection = stateContent.match(/##\s*Deferred Validations\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (deferredSection) {
    const pendingMatches = deferredSection[1].match(/PENDING/gi);
    pendingDeferred = pendingMatches ? pendingMatches.length : 0;
  }

  let totalDecisions = 0;
  const decisionsSection = stateContent.match(/##\s*Key Decisions\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (decisionsSection) {
    const tableRows = decisionsSection[1].match(/^\|[^|]/gm);
    totalDecisions = tableRows ? Math.max(0, tableRows.length - 2) : 0;
  }

  return { activeBlockers, pendingDeferred, totalDecisions };
}

function renderDashboardTui(
  shippedMilestones,
  activeMilestones,
  allPhases,
  shippedPhaseCount,
  totalPlans,
  totalSummaries,
  stateSummary
) {
  let tui = '# GRD Dashboard\n\n';

  if (shippedMilestones.length > 0) {
    tui += '## Shipped\n\n';
    for (const ms of shippedMilestones) {
      const phaseInfo = ms.phase_count > 0 ? ` \u2014 ${ms.phase_count} phases` : '';
      tui += `  \u2713 ${ms.version} ${ms.name}${phaseInfo} (shipped ${ms.shipped_date})\n`;
    }
    tui += '\n';
  }

  for (const ms of activeMilestones) {
    const dateRange = ms.start && ms.target ? ` [${ms.start} -> ${ms.target}]` : '';
    const msLabel = ms.number != null ? `Milestone ${ms.number}: ${ms.name}` : ms.name;
    tui += `## ${msLabel}${ms.version ? ' (' + ms.version + ')' : ''}${dateRange}\n`;
    if (ms.goal) tui += `Goal: ${ms.goal}\n`;

    const barWidth = 10;
    const filled = Math.round((ms.progress_percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    tui += `Progress: ${bar} ${ms.progress_percent}%\n\n`;

    for (const p of ms.phases) {
      let symbol;
      if (p.active) symbol = '\u25BA';
      else if (p.status === 'complete') symbol = '\u2713';
      else if (p.status === 'in-progress') symbol = '\u25C6';
      else symbol = '\u25CB';

      const activeLabel = p.active ? '  [ACTIVE]' : '';
      const durationStr = p.duration ? ` (${p.duration})` : '';
      tui += `  ${symbol} Phase ${p.number}: ${p.name}${durationStr} \u2014 ${p.summaries}/${p.plans} plans${activeLabel}\n`;

      if (p.plans > 0 && p.plans <= 5) {
        const planFilesForPhase = allPhases.find((ap) => ap.number === p.number);
        if (planFilesForPhase && planFilesForPhase.plan_files) {
          for (const pf of planFilesForPhase.plan_files) {
            const planId = pf.replace('-PLAN.md', '');
            const planHasSummary = planFilesForPhase.summary_files.some(
              (f) => f === planId + '-SUMMARY.md'
            );
            tui += `    ${planHasSummary ? '\u2713' : '\u25CB'} ${pf}\n`;
          }
        }
      }
    }
    tui += '\n';
  }

  const timelineMilestones = activeMilestones.filter((ms) => ms.start && ms.target);
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

    const minStr = minDate.toISOString().slice(0, 10);
    const maxStr = maxDate.toISOString().slice(0, 10);
    const headerPad = Math.max(1, tlBarWidth - minStr.length - maxStr.length + 2);
    tui += ' '.repeat(tlLabelWidth) + minStr + ' '.repeat(headerPad) + maxStr + '\n';
    tui += ' '.repeat(tlLabelWidth) + '|' + '-'.repeat(tlBarWidth) + '|\n';

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

    const today = new Date().toISOString().slice(0, 10);
    const todayDate = new Date(today + 'T00:00:00');
    if (todayDate >= minDate && todayDate <= maxDate) {
      const todayPos = dateToPos(today);
      tui += ' '.repeat(tlLabelWidth + todayPos) + '\u25BC Today (' + today + ')\n';
    }
    tui += '\n';
  }

  tui += '---\n';
  const msSummaryParts = [];
  if (shippedMilestones.length > 0) msSummaryParts.push(`${shippedMilestones.length} shipped`);
  if (activeMilestones.length > 0) msSummaryParts.push(`${activeMilestones.length} active`);
  const msSummary =
    msSummaryParts.length > 0 ? msSummaryParts.join(' + ') + ' milestones' : '0 milestones';
  const totalPhaseCount = allPhases.length + shippedPhaseCount;
  tui += `Summary: ${msSummary} | ${totalPhaseCount} phases | ${totalSummaries}/${totalPlans} plans complete\n`;
  tui += `Blockers: ${stateSummary.activeBlockers} | Deferred: ${stateSummary.pendingDeferred} | Decisions: ${stateSummary.totalDecisions}\n`;
  return tui;
}

function cmdDashboard(cwd, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const phasesDir = getPhasesDirPath(cwd);
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
  const shippedMilestones = parseDashboardShippedMilestones(roadmapContent);
  const { activeMilestones, milestonePositions } = parseDashboardActiveMilestones(roadmapContent);
  const milestones = [...shippedMilestones, ...activeMilestones];

  const activePhaseMatch = stateContent.match(/\*\*Active phase:\*\*\s*(\d+)/i);
  const activePhaseNum = activePhaseMatch ? activePhaseMatch[1] : null;
  const allPhases = parseDashboardPhases(
    roadmapContent,
    phasesDir,
    milestonePositions,
    activePhaseNum,
    activeMilestones
  );

  for (const ms of activeMilestones) {
    if (ms.phases.length === 0) continue;
    let totalProgress = 0;
    for (const p of ms.phases) totalProgress += p.plans > 0 ? p.summaries / p.plans : 0;
    ms.progress_percent = Math.round((totalProgress / ms.phases.length) * 100);
  }

  const stateSummary = parseDashboardStateSummary(stateContent);
  const totalPlans = allPhases.reduce((sum, p) => sum + p.plans, 0);
  const totalSummaries = allPhases.reduce((sum, p) => sum + p.summaries, 0);
  const shippedPhaseCount = shippedMilestones.reduce((sum, ms) => sum + ms.phase_count, 0);

  const timeline = activeMilestones
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
      shipped_milestones: shippedMilestones.length,
      total_phases: allPhases.length + shippedPhaseCount,
      total_plans: totalPlans,
      total_summaries: totalSummaries,
      active_blockers: stateSummary.activeBlockers,
      pending_deferred: stateSummary.pendingDeferred,
      total_decisions: stateSummary.totalDecisions,
    },
  };

  if (raw) {
    output(jsonResult, raw);
  } else {
    const tui = renderDashboardTui(
      shippedMilestones,
      activeMilestones,
      allPhases,
      shippedPhaseCount,
      totalPlans,
      totalSummaries,
      stateSummary
    );
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

  const phasesDir = getPhasesDirPath(cwd);
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

  // Extract requirements for this phase from ROADMAP.md
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const roadmapContent = safeReadFile(roadmapPath) || '';
  let phaseRequirements = [];

  // Find the phase section and extract Requirements field
  const phaseHeadingPattern = new RegExp(
    `### Phase ${phaseNumber.replace('.', '\\.')}:([\\s\\S]*?)(?=### Phase |## |$)`,
    'i'
  );
  const phaseSection = roadmapContent.match(phaseHeadingPattern);
  if (phaseSection) {
    const reqLineMatch = phaseSection[1].match(/\*\*Requirements\*\*:\s*(.+)/i);
    if (reqLineMatch) {
      const reqIds = reqLineMatch[1]
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      if (reqIds.length > 0) {
        const requirementsPath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
        const reqContent = safeReadFile(requirementsPath) || '';
        if (reqContent) {
          const allReqs = parseRequirements(reqContent);
          const matrix = parseTraceabilityMatrix(reqContent);
          for (const reqId of reqIds) {
            const req = allReqs.find((r) => r.id.toLowerCase() === reqId.toLowerCase());
            const matrixRow = matrix.find((m) => m.req.toLowerCase() === reqId.toLowerCase());
            phaseRequirements.push({
              id: reqId.toUpperCase(),
              title: req ? req.title : null,
              priority: req ? req.priority : null,
              status: matrixRow ? matrixRow.status : 'Unknown',
            });
          }
        }
      }
    }
  }

  const durationStr = totalDurationMin > 0 ? totalDurationMin + 'min' : null;
  const completedCount = plans.filter((p) => p.status === 'complete').length;

  const result = {
    phase_number: phaseNumber,
    phase_name: phaseName,
    directory: path.relative(cwd, path.join(phasesDir, phaseDirName)),
    plans,
    decisions: allDecisionsUnique,
    artifacts: [...new Set(allArtifacts)],
    requirements: phaseRequirements,
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
  tui += `Directory: ${path.relative(cwd, path.join(phasesDir, phaseDirName))}\n\n`;

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

  // Requirements
  if (phaseRequirements.length > 0) {
    tui += `\n## Requirements (${phaseRequirements.length})\n`;
    tui += '| REQ | Title | Priority | Status |\n';
    tui += '|-----|-------|----------|--------|\n';
    for (const r of phaseRequirements) {
      const title = r.title || '-';
      const truncTitle = title.length > 40 ? title.substring(0, 37) + '...' : title;
      tui += `| ${r.id} | ${truncTitle} | ${r.priority || '-'} | ${r.status || '-'} |\n`;
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
  const phasesDir = getPhasesDirPath(cwd);
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
  const ltrmPath = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  /** Read LONG-TERM-ROADMAP.md, outputting error if missing; returns content or null */
  function readLtrm() {
    const content = safeReadFile(ltrmPath);
    if (!content) {
      output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, '');
      return null;
    }
    return content;
  }

  switch (subcommand) {
    case 'list': {
      const content = readLtrm();
      if (!content) return;
      const parsed = parseLongTermRoadmap(content);
      const milestones = parsed ? parsed.milestones : [];
      if (raw) {
        const summary = milestones.map((m) => `${m.id}: ${m.name} [${m.status}]`).join('\n');
        output({ milestones, count: milestones.length }, raw, summary || '(no milestones)');
      } else {
        output({ milestones, count: milestones.length }, raw);
      }
      break;
    }
    case 'add': {
      const name = flag(args, '--name', null);
      const goal = flag(args, '--goal', null);
      if (!name) {
        error('--name flag required');
        return;
      }
      if (!goal) {
        error('--goal flag required');
        return;
      }
      const content = readLtrm();
      if (!content) return;
      const result = addLtMilestone(content, name, goal);
      output(
        { content: result.content, path: '.planning/LONG-TERM-ROADMAP.md', id: result.id },
        raw,
        result.content
      );
      break;
    }
    case 'remove': {
      const id = flag(args, '--id', null);
      if (!id) {
        error('--id flag required');
        return;
      }
      const content = readLtrm();
      if (!content) return;
      const roadmapContent = safeReadFile(roadmapPath);
      const result = removeLtMilestone(content, id, roadmapContent);
      if (result && typeof result === 'object' && result.error) {
        output({ error: result.error }, raw, result.error);
      } else {
        output(
          { content: result, path: '.planning/LONG-TERM-ROADMAP.md', removed: id },
          raw,
          result
        );
      }
      break;
    }
    case 'update': {
      const id = flag(args, '--id', null);
      if (!id) {
        error('--id flag required');
        return;
      }
      const updates = {};
      const nameVal = flag(args, '--name', null);
      const goalVal = flag(args, '--goal', null);
      const statusVal = flag(args, '--status', null);
      if (nameVal) updates.name = nameVal;
      if (goalVal) updates.goal = goalVal;
      if (statusVal) updates.status = statusVal;
      if (Object.keys(updates).length === 0) {
        error('At least one of --name, --goal, --status required');
        return;
      }
      const content = readLtrm();
      if (!content) return;
      const result = updateLtMilestone(content, id, updates);
      if (result && typeof result === 'object' && result.error) {
        output({ error: result.error }, raw, result.error);
      } else {
        output(
          {
            content: result,
            path: '.planning/LONG-TERM-ROADMAP.md',
            id,
            updated_fields: Object.keys(updates),
          },
          raw,
          result
        );
      }
      break;
    }
    case 'refine': {
      const id = flag(args, '--id', null);
      if (!id) {
        error('--id flag required');
        return;
      }
      const content = readLtrm();
      if (!content) return;
      const ms = getLtMilestoneById(content, id);
      if (!ms) {
        output({ error: `${id} not found` }, raw, `${id} not found`);
        return;
      }
      output(
        { milestone: ms, context: `Use this context to discuss refinements for ${id}` },
        raw,
        `${ms.id}: ${ms.name}\nStatus: ${ms.status}\nGoal: ${ms.goal}\nNormal milestones: ${ms.normal_milestones.map((m) => m.version).join(', ') || '(none yet)'}`
      );
      break;
    }
    case 'link': {
      const id = flag(args, '--id', null);
      const version = flag(args, '--version', null);
      const note = flag(args, '--note', null);
      if (!id) {
        error('--id flag required');
        return;
      }
      if (!version) {
        error('--version flag required');
        return;
      }
      const content = readLtrm();
      if (!content) return;
      const result = linkNormalMilestone(content, id, version, note);
      if (result && typeof result === 'object' && result.error) {
        output({ error: result.error }, raw, result.error);
      } else {
        output(
          { content: result, path: '.planning/LONG-TERM-ROADMAP.md', id, linked: version },
          raw,
          result
        );
      }
      break;
    }
    case 'unlink': {
      const id = flag(args, '--id', null);
      const version = flag(args, '--version', null);
      if (!id) {
        error('--id flag required');
        return;
      }
      if (!version) {
        error('--version flag required');
        return;
      }
      const content = readLtrm();
      if (!content) return;
      const roadmapContent = safeReadFile(roadmapPath);
      const result = unlinkNormalMilestone(content, id, version, roadmapContent);
      if (result && typeof result === 'object' && result.error) {
        output({ error: result.error }, raw, result.error);
      } else {
        output(
          { content: result, path: '.planning/LONG-TERM-ROADMAP.md', id, unlinked: version },
          raw,
          result
        );
      }
      break;
    }
    case 'display': {
      const content = readLtrm();
      if (!content) return;
      const parsed = parseLongTermRoadmap(content);
      const formatted = formatLongTermRoadmap(parsed);
      const milestoneCount = parsed && parsed.milestones ? parsed.milestones.length : 0;
      if (raw) {
        output({ formatted, milestone_count: milestoneCount }, raw, formatted);
      } else {
        output({ formatted, milestone_count: milestoneCount }, raw);
      }
      break;
    }
    case 'init': {
      const roadmapContent = safeReadFile(roadmapPath);
      if (!roadmapContent) {
        output({ error: 'ROADMAP.md not found' }, raw, 'ROADMAP.md not found');
        return;
      }
      const projectName = flag(args, '--project', 'Project');
      const content = initFromRoadmap(roadmapContent, projectName);
      output({ content, path: '.planning/LONG-TERM-ROADMAP.md' }, raw, content);
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
      const content = readLtrm();
      if (!content) return;
      const histResult = updateRefinementHistory(content, histAction, histDetails);
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
    case 'parse': {
      const filePath = args[0]
        ? path.isAbsolute(args[0])
          ? args[0]
          : path.join(cwd, args[0])
        : ltrmPath;
      const content = safeReadFile(filePath);
      if (!content) {
        output({ error: 'LONG-TERM-ROADMAP.md not found', exists: false }, raw, '');
        return;
      }
      const parsed = parseLongTermRoadmap(content);
      const count = parsed && parsed.milestones ? parsed.milestones.length : 0;
      if (raw) {
        output(parsed, raw, `${count} LT milestones`);
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
        : ltrmPath;
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
    default:
      error(
        'Unknown subcommand: ' +
          subcommand +
          '. Valid: list, add, remove, update, refine, link, unlink, display, init, history, parse, validate'
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
  const dataRows = rows.filter((r) => !r.match(/^\|\s*REQ\s*\|/i) && !r.match(/^\|[\s-]+\|/));

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
    const match = requirements.find((r) => r.id.toLowerCase() === reqId.toLowerCase());
    if (match) {
      // Merge status and phase from traceability matrix
      const matrix = parseTraceabilityMatrix(content);
      const matrixRow = matrix.find((m) => m.req.toLowerCase() === reqId.toLowerCase());
      if (matrixRow) {
        match.status = matrixRow.status;
        match.phase = matrixRow.phase;
      }
      output(match, raw);
      return;
    }
  }

  // Fallback: scan archived milestone REQUIREMENTS.md files
  const milestonesDir = getMilestonesDirPath(cwd);
  try {
    const files = fs
      .readdirSync(milestonesDir)
      .filter((f) => f.match(/^v[\d.]+-REQUIREMENTS\.md$/i));
    for (const file of files) {
      const filePath = path.join(milestonesDir, file);
      const archiveContent = safeReadFile(filePath);
      if (!archiveContent) continue;
      const archiveReqs = parseRequirements(archiveContent);
      const match = archiveReqs.find((r) => r.id.toLowerCase() === reqId.toLowerCase());
      if (match) {
        // Merge status from archived traceability matrix
        const matrix = parseTraceabilityMatrix(archiveContent);
        const matrixRow = matrix.find((m) => m.req.toLowerCase() === reqId.toLowerCase());
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

  if (content) {
    allReqs = parseRequirements(content);
    const matrix = parseTraceabilityMatrix(content);

    // Merge status/phase from matrix into each requirement
    for (const req of allReqs) {
      const matrixRow = matrix.find((m) => m.req.toLowerCase() === req.id.toLowerCase());
      if (matrixRow) {
        req.status = matrixRow.status;
        req.phase = matrixRow.phase;
      }
    }
  }

  // If --all, include archived milestone requirements
  if (filters.all) {
    const milestonesDir = getMilestonesDirPath(cwd);
    try {
      const files = fs
        .readdirSync(milestonesDir)
        .filter((f) => f.match(/^v[\d.]+-REQUIREMENTS\.md$/i));
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
          const matrixRow = archiveMatrix.find((m) => m.req.toLowerCase() === req.id.toLowerCase());
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

/** Valid requirement statuses */
const VALID_REQUIREMENT_STATUSES = ['Pending', 'In Progress', 'Done', 'Deferred'];

/**
 * CLI command: Update the status of a requirement in the Traceability Matrix.
 * Validates REQ-ID exists and status is valid before writing.
 * @param {string} cwd - Project working directory
 * @param {string} reqId - Requirement ID (e.g., "REQ-31")
 * @param {string} newStatus - New status value (Pending, In Progress, Done, Deferred)
 * @param {boolean} raw - Output raw JSON string instead of pretty-printed
 */
function cmdRequirementUpdateStatus(cwd, reqId, newStatus, raw) {
  // Validate status
  if (!VALID_REQUIREMENT_STATUSES.includes(newStatus)) {
    error(
      `Invalid status "${newStatus}". Valid statuses: ${VALID_REQUIREMENT_STATUSES.join(', ')}`
    );
  }

  const reqFilePath = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const content = safeReadFile(reqFilePath);
  if (!content) {
    error('REQUIREMENTS.md not found');
  }

  // Parse traceability matrix to validate REQ-ID exists and get old status
  const matrix = parseTraceabilityMatrix(content);
  const matrixRow = matrix.find((m) => m.req.toLowerCase() === reqId.toLowerCase());
  if (!matrixRow) {
    error(`Requirement ${reqId} not found in Traceability Matrix`);
  }

  const oldStatus = matrixRow.status;

  // Use regex to replace the status cell in the matching row
  // Escape special regex characters in reqId and oldStatus
  const escapedReqId = matrixRow.req.replace(/[-]/g, '\\-');
  const escapedOldStatus = oldStatus.replace(/\s+/g, '\\s+');
  const reqPattern = new RegExp(
    `^(\\|\\s*${escapedReqId}\\s*\\|.+\\|)\\s*${escapedOldStatus}\\s*(\\|)\\s*$`,
    'im'
  );
  // If old and new status are the same, skip the write but still report success
  if (oldStatus === newStatus) {
    output(
      {
        updated: true,
        id: matrixRow.req,
        old_status: oldStatus,
        new_status: newStatus,
      },
      raw
    );
    return;
  }

  const updatedContent = content.replace(reqPattern, `$1 ${newStatus} $2`);

  if (updatedContent === content) {
    error(`Failed to update status for ${reqId} in Traceability Matrix`);
  }

  // Write updated content back to disk
  fs.writeFileSync(reqFilePath, updatedContent, 'utf-8');

  output(
    {
      updated: true,
      id: matrixRow.req,
      old_status: oldStatus,
      new_status: newStatus,
    },
    raw
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Recursively collect all .md files under a directory.
 * @param {string} dir - Directory to scan
 * @returns {string[]} Array of absolute file paths
 */
function collectMarkdownFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return results;
}

/**
 * CLI command: Search across all .planning/ markdown files for a text query.
 * Returns file paths, line numbers, and matching lines.
 * @param {string} cwd - Project working directory
 * @param {string} query - Text query to search for
 * @param {boolean} raw - Output raw JSON string instead of pretty-printed
 */
function cmdSearch(cwd, query, raw) {
  if (!query) {
    error('Search query is required');
  }

  const planningDir = path.join(cwd, '.planning');
  const mdFiles = collectMarkdownFiles(planningDir);
  const matches = [];
  const queryLower = query.toLowerCase();

  for (const filePath of mdFiles) {
    const content = safeReadFile(filePath);
    if (!content) continue;

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        matches.push({
          file: path.relative(planningDir, filePath),
          line: i + 1,
          content: lines[i],
        });
      }
    }
  }

  output({ matches, count: matches.length, query }, raw);
}

// ─── Migration ──────────────────────────────────────────────────────────────

/**
 * CLI command: Migrate old-style flat .planning/ subdirectories to the
 * milestone-scoped hierarchy under .planning/milestones/{milestone}/.
 *
 * Moves phases/, research/, codebase/, todos/ into the current milestone
 * directory. quick/ always moves to .planning/milestones/anonymous/quick/.
 * Idempotent: running twice produces no changes on the second run.
 * Merges into existing milestone directories without overwriting files.
 *
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw string instead of JSON
 * @returns {void} Outputs migration result to stdout and exits
 */
function cmdMigrateDirs(cwd, raw) {
  const milestone = currentMilestone(cwd);
  const planningDir = path.join(cwd, '.planning');

  // Migration map: oldName -> target milestone
  // codebase/ is project-level (stays at .planning/codebase/), not migrated here
  // quick/ always goes to anonymous, everything else to current milestone
  const migrationMap = [
    { name: 'phases', target: milestone },
    { name: 'research', target: milestone },
    { name: 'todos', target: milestone },
    { name: 'quick', target: milestone },
  ];

  const movedDirectories = [];
  const skipped = [];
  const errors = [];

  for (const entry of migrationMap) {
    const oldDir = path.join(planningDir, entry.name);

    // Check if old-style directory exists
    if (!fs.existsSync(oldDir)) {
      skipped.push(entry.name);
      continue;
    }

    // Check if old-style directory has any contents
    let contents;
    try {
      contents = fs.readdirSync(oldDir);
    } catch {
      skipped.push(entry.name);
      continue;
    }

    if (contents.length === 0) {
      skipped.push(entry.name);
      continue;
    }

    // Target directory under milestones
    const targetDir = path.join(planningDir, 'milestones', entry.target, entry.name);

    // Ensure target parent directory exists
    fs.mkdirSync(targetDir, { recursive: true });

    let entriesMoved = 0;

    // Move each entry, merging without overwriting
    for (const item of contents) {
      const srcPath = path.join(oldDir, item);
      const destPath = path.join(targetDir, item);

      // Skip if target already exists (merge without overwriting)
      if (fs.existsSync(destPath)) {
        continue;
      }

      try {
        // Copy recursively then remove source
        const srcStats = fs.statSync(srcPath);
        if (srcStats.isDirectory()) {
          fs.cpSync(srcPath, destPath, { recursive: true });
        } else {
          fs.cpSync(srcPath, destPath);
        }
        fs.rmSync(srcPath, { recursive: true, force: true });
        entriesMoved++;
      } catch (err) {
        errors.push({
          entry: entry.name,
          item,
          error: err.message,
        });
      }
    }

    if (entriesMoved > 0) {
      const relTarget = path.join('milestones', entry.target, entry.name);
      movedDirectories.push({
        from: entry.name,
        to: relTarget,
        entries_moved: entriesMoved,
      });
    }
  }

  // Idempotency: if nothing was moved, check if all dirs are already migrated
  const alreadyMigrated = movedDirectories.length === 0;

  const result = {
    milestone,
    moved_directories: movedDirectories,
    skipped,
    already_migrated: alreadyMigrated,
    errors,
  };

  output(result, raw, JSON.stringify(result));
}

// ─── Coverage Report ─────────────────────────────────────────────────────────

/**
 * CLI command: Generate a structured coverage report identifying modules below threshold.
 * Runs jest with json-summary reporter and parses the output.
 *
 * @param {string} cwd - Project working directory
 * @param {Object} options - Options object
 * @param {number} [options.threshold=85] - Minimum line coverage percentage
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdCoverageReport(cwd, options, raw) {
  const threshold = options.threshold || 85;

  // Run jest with JSON summary reporter
  let coverageData;
  try {
    child_process.execFileSync(
      'npx',
      ['jest', '--coverage', '--coverageReporters=json-summary', '--silent', '--forceExit'],
      { cwd, encoding: 'utf-8', timeout: 120000, stdio: 'pipe' }
    );
    // Jest outputs coverage to coverage/coverage-summary.json
    const summaryPath = path.join(cwd, 'coverage', 'coverage-summary.json');
    coverageData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  } catch (_e) {
    // Jest may exit non-zero if tests fail but still produce coverage
    const summaryPath = path.join(cwd, 'coverage', 'coverage-summary.json');
    if (fs.existsSync(summaryPath)) {
      coverageData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    } else {
      output({ error: 'Failed to generate coverage report', details: _e.message }, raw);
      return;
    }
  }

  const modules = [];
  const belowThreshold = [];

  for (const [filePath, data] of Object.entries(coverageData)) {
    if (filePath === 'total') continue;
    const relativePath = path.relative(cwd, filePath);
    if (!relativePath.startsWith('lib/')) continue;

    const entry = {
      module: relativePath,
      lines: data.lines.pct,
      branches: data.branches.pct,
      functions: data.functions.pct,
      statements: data.statements.pct,
    };
    modules.push(entry);

    if (data.lines.pct < threshold) {
      belowThreshold.push({
        ...entry,
        gap: +(threshold - data.lines.pct).toFixed(1),
      });
    }
  }

  modules.sort((a, b) => a.lines - b.lines);
  belowThreshold.sort((a, b) => a.lines - b.lines);

  output(
    {
      threshold,
      total_modules: modules.length,
      below_threshold_count: belowThreshold.length,
      all_above: belowThreshold.length === 0,
      below_threshold: belowThreshold,
      modules,
    },
    raw
  );
}

// ─── Health Check ────────────────────────────────────────────────────────────

/**
 * CLI command: Run comprehensive project health checks (tests, lint, format, consistency).
 * Consolidates 4 separate checks into one structured result.
 *
 * @param {string} cwd - Project working directory
 * @param {Object} options - Options object
 * @param {boolean} [options.fix=false] - Whether to auto-fix lint and format issues
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdHealthCheck(cwd, options, raw) {
  const fix = options.fix || false;
  const results = {
    tests: { status: 'unknown', pass: 0, fail: 0, total: 0 },
    lint: { status: 'unknown', errors: 0, warnings: 0 },
    format: { status: 'unknown', clean: false },
    consistency: { status: 'unknown', passed: false },
  };

  // 1. Run tests
  try {
    const testOut = child_process.execFileSync('npx', ['jest', '--silent', '--forceExit'], {
      cwd,
      encoding: 'utf-8',
      timeout: 120000,
      stdio: 'pipe',
    });
    const summaryMatch = testOut.match(/Tests:\s+(\d+) passed,\s+(\d+) total/);
    if (summaryMatch) {
      results.tests.pass = parseInt(summaryMatch[1], 10);
      results.tests.total = parseInt(summaryMatch[2], 10);
    }
    results.tests.status = 'pass';
  } catch (e) {
    results.tests.status = 'fail';
    const failMatch = e.stdout?.match(/Tests:\s+(\d+) failed,\s+(\d+) passed,\s+(\d+) total/);
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
    const lintOut = child_process.execFileSync('npx', lintArgs, {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: 'pipe',
    });
    const lintData = JSON.parse(lintOut);
    const totals = lintData.reduce(
      (acc, f) => ({
        errors: acc.errors + f.errorCount,
        warnings: acc.warnings + f.warningCount,
      }),
      { errors: 0, warnings: 0 }
    );
    results.lint = { status: totals.errors === 0 ? 'pass' : 'fail', ...totals };
  } catch (e) {
    results.lint.status = 'fail';
    try {
      const lintData = JSON.parse(e.stdout);
      const totals = lintData.reduce(
        (acc, f) => ({
          errors: acc.errors + f.errorCount,
          warnings: acc.warnings + f.warningCount,
        }),
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
        cwd,
        encoding: 'utf-8',
        timeout: 60000,
        stdio: 'pipe',
      });
    }
    child_process.execFileSync('npx', ['prettier', '--check', 'lib/', 'bin/'], {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: 'pipe',
    });
    results.format = { status: 'pass', clean: true };
  } catch {
    results.format = { status: 'fail', clean: false };
  }

  // 4. Run consistency validation
  try {
    const consOut = child_process.execFileSync(
      'node',
      ['bin/grd-tools.js', 'validate', 'consistency'],
      { cwd, encoding: 'utf-8', timeout: 30000, stdio: 'pipe' }
    );
    const consData = JSON.parse(consOut);
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
  output(
    {
      healthy: allPass,
      fix_applied: fix,
      ...results,
    },
    raw,
    allPass ? 'All checks pass' : 'Issues found'
  );
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
  cmdRequirementUpdateStatus,
  cmdSearch,
  cmdMigrateDirs,
  cmdCoverageReport,
  cmdHealthCheck,
};
