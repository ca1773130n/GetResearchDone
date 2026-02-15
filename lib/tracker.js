/**
 * GRD Tracker Integration — Issue tracker sync (GitHub/Jira) and mapping
 *
 * Extracted from bin/grd-tools.js during Phase 3 modularization.
 * Handles: tracker config, mapping, schedule, GitHub sync, cmdTracker dispatch.
 */

const { fs, path, execFileSync, safeReadFile, output, error } = require('./utils');
const { computeSchedule, getScheduleForPhase, getScheduleForMilestone } = require('./roadmap');

// ─── Tracker Config & Mapping ─────────────────────────────────────────────────

/**
 * Load tracker configuration from config.json, with auto-migration of legacy formats.
 * @param {string} cwd - Project working directory
 * @returns {Object} Tracker config object with provider field ('github', 'mcp-atlassian', or 'none')
 */
function loadTrackerConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const raw = safeReadFile(configPath);
  if (!raw) return { provider: 'none' };

  try {
    const config = JSON.parse(raw);
    // New tracker config format
    if (config.tracker) {
      const tracker = config.tracker;
      // Auto-migrate old "jira" provider to "mcp-atlassian"
      if (tracker.provider === 'jira') {
        tracker.provider = 'mcp-atlassian';
        if (tracker.jira && !tracker.mcp_atlassian) {
          tracker.mcp_atlassian = {
            project_key: tracker.jira.project_key || '',
            milestone_issue_type: tracker.jira.epic_issue_type || 'Epic',
            phase_issue_type: tracker.jira.task_issue_type || 'Task',
            plan_issue_type: 'Sub-task',
          };
        }
      }
      // Auto-migrate old epic/task config to milestone/phase/plan config
      if (tracker.mcp_atlassian) {
        const mcp = tracker.mcp_atlassian;
        if (mcp.epic_issue_type && !mcp.milestone_issue_type) {
          mcp.milestone_issue_type = mcp.epic_issue_type;
          delete mcp.epic_issue_type;
        }
        if (mcp.task_issue_type && !mcp.phase_issue_type) {
          mcp.phase_issue_type = mcp.task_issue_type;
          delete mcp.task_issue_type;
        }
        if (!mcp.plan_issue_type) {
          mcp.plan_issue_type = 'Sub-task';
        }
      }
      return tracker;
    }
    // Backward compat: migrate old github_integration format
    if (config.github_integration && config.github_integration.enabled) {
      return {
        provider: 'github',
        auto_sync: config.github_integration.auto_issues || false,
        github: {
          project_board:
            config.github_integration.project_board || config.github_integration.project_name || '',
          default_assignee: config.github_integration.default_assignee || '',
          default_labels:
            config.github_integration.default_labels || config.github_integration.labels
              ? Object.values(config.github_integration.labels)
              : ['research', 'implementation', 'evaluation', 'integration'],
          auto_issues: config.github_integration.auto_issues || false,
          pr_per_phase: config.github_integration.pr_per_phase || false,
        },
      };
    }
    return { provider: 'none' };
  } catch {
    return { provider: 'none' };
  }
}

/**
 * Load the tracker ID mapping from TRACKER.md, parsing milestone/phase/plan tables.
 * @param {string} cwd - Project working directory
 * @returns {Object} Mapping object with provider, last_synced, milestones, phases, and plans
 */
function loadTrackerMapping(cwd) {
  const mappingPath = path.join(cwd, '.planning', 'TRACKER.md');
  const content = safeReadFile(mappingPath);
  if (!content) return { provider: null, last_synced: null, milestones: {}, phases: {}, plans: {} };

  const result = { provider: null, last_synced: null, milestones: {}, phases: {}, plans: {} };

  const providerMatch = content.match(/^Provider:\s*(.+)$/m);
  if (providerMatch) result.provider = providerMatch[1].trim();

  const syncMatch = content.match(/^Last Synced:\s*(.+)$/m);
  if (syncMatch) result.last_synced = syncMatch[1].trim();

  // Helper: split markdown table row into columns (preserves empty cells)
  function splitTableRow(row) {
    // Split by | and drop the first and last empty strings from leading/trailing |
    const parts = row.split('|').map((c) => c.trim());
    // Remove empty string at start (before first |) and end (after last |)
    if (parts.length > 0 && parts[0] === '') parts.shift();
    if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    return parts;
  }

  // Parse milestone table (Epics) — handles optional blank line between heading and table
  const milestoneTableMatch = content.match(
    /## Milestone Issues\n\n?\|[^\n]+\n\|[^\n]+\n([\s\S]*?)(?=\n##|\n$|$)/
  );
  if (milestoneTableMatch) {
    const rows = milestoneTableMatch[1]
      .trim()
      .split('\n')
      .filter((r) => r.startsWith('|'));
    for (const row of rows) {
      const cols = splitTableRow(row);
      if (cols.length >= 4) {
        result.milestones[cols[0]] = { issueRef: cols[1], url: cols[2], status: cols[3] };
      }
    }
  }

  // Parse phase table (Tasks) — handles optional blank line between heading and table
  const phaseTableMatch = content.match(
    /## Phase Issues\n\n?\|[^\n]+\n\|[^\n]+\n([\s\S]*?)(?=\n##|\n$|$)/
  );
  if (phaseTableMatch) {
    const rows = phaseTableMatch[1]
      .trim()
      .split('\n')
      .filter((r) => r.startsWith('|'));
    for (const row of rows) {
      const cols = splitTableRow(row);
      if (cols.length >= 5) {
        result.phases[cols[0]] = {
          issueRef: cols[1],
          url: cols[2],
          parentRef: cols[3],
          status: cols[4],
        };
      }
    }
  }

  // Parse plan table (Sub-tasks) — handles optional blank line between heading and table
  const planTableMatch = content.match(
    /## Plan Issues\n\n?\|[^\n]+\n\|[^\n]+\n([\s\S]*?)(?=\n##|\n$|$)/
  );
  if (planTableMatch) {
    const rows = planTableMatch[1]
      .trim()
      .split('\n')
      .filter((r) => r.startsWith('|'));
    for (const row of rows) {
      const cols = splitTableRow(row);
      if (cols.length >= 6) {
        const key = `${cols[0]}-${cols[1]}`;
        result.plans[key] = {
          issueRef: cols[2],
          url: cols[3],
          parentRef: cols[4],
          status: cols[5],
        };
      }
    }
  }

  return result;
}

/**
 * Save the tracker ID mapping to TRACKER.md with formatted markdown tables.
 * @param {string} cwd - Project working directory
 * @param {Object} mapping - Mapping object with provider, milestones, phases, and plans entries
 * @returns {void} Writes TRACKER.md to disk
 */
function saveTrackerMapping(cwd, mapping) {
  const mappingPath = path.join(cwd, '.planning', 'TRACKER.md');
  const timestamp = new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');

  let content = `# Tracker Mapping\n\nProvider: ${mapping.provider || 'none'}\nLast Synced: ${timestamp}\n\n`;

  content += `## Milestone Issues\n\n| Milestone | Issue Ref | URL | Status |\n|-----------|-----------|-----|--------|\n`;
  for (const [milestone, info] of Object.entries(mapping.milestones || {})) {
    content += `| ${milestone} | ${info.issueRef} | ${info.url} | ${info.status} |\n`;
  }

  content += `\n## Phase Issues\n\n| Phase | Issue Ref | URL | Parent Ref | Status |\n|-------|-----------|-----|------------|--------|\n`;
  for (const [phase, info] of Object.entries(mapping.phases || {})) {
    content += `| ${phase} | ${info.issueRef} | ${info.url} | ${info.parentRef || ''} | ${info.status} |\n`;
  }

  content += `\n## Plan Issues\n\n| Phase | Plan | Issue Ref | URL | Parent Ref | Status |\n|-------|------|-----------|-----|------------|--------|\n`;
  for (const [key, info] of Object.entries(mapping.plans || {})) {
    const [phase, plan] = key.split('-');
    content += `| ${phase} | ${plan} | ${info.issueRef} | ${info.url} | ${info.parentRef} | ${info.status} |\n`;
  }

  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(mappingPath, content, 'utf-8');
}

// ─── GitHub Tracker ───────────────────────────────────────────────────────────

/**
 * Create a GitHub Issues tracker operations object with methods for issue CRUD.
 * @param {string} cwd - Project working directory
 * @param {Object} config - Tracker config with github sub-object for labels, assignees, etc.
 * @returns {Object} Tracker object with createPhaseIssue, createTaskIssue, updateIssueStatus, addComment, syncRoadmap, syncPhase methods
 */
function createGitHubTracker(cwd, config) {
  const gh = config.github || {};

  // NOTE: execFileSync is already the safe alternative (no shell injection).
  // This is used for gh CLI calls which require direct process execution.
  function ghExec(args) {
    try {
      return execFileSync('gh', args, {
        cwd,
        encoding: 'utf-8',
        timeout: 30000,
        stdio: 'pipe',
      }).trim();
    } catch {
      return null;
    }
  }

  function ghAvailable() {
    return ghExec(['--version']) !== null;
  }

  return {
    provider: 'github',

    createPhaseIssue(phaseNum, title, body, labels) {
      if (!ghAvailable()) return { issueRef: null, url: null };
      const args = ['issue', 'create', '--title', title, '--body', body || '', '--label', 'epic'];
      for (const l of labels || gh.default_labels || []) {
        args.push('--label', l);
      }
      if (gh.default_assignee) {
        args.push('--assignee', gh.default_assignee);
      }
      const url = ghExec(args);
      if (!url) return { issueRef: null, url: null };
      const issueRef = url.match(/\/(\d+)$/)?.[1] || url;
      return { issueRef: `#${issueRef}`, url };
    },

    createTaskIssue(phaseNum, planNum, title, parentRef) {
      if (!ghAvailable()) return { issueRef: null, url: null };
      const bodyText = `Parent: ${parentRef}\nPhase: ${phaseNum}\nPlan: ${planNum}`;
      const url = ghExec([
        'issue',
        'create',
        '--title',
        title,
        '--body',
        bodyText,
        '--label',
        'task',
      ]);
      if (!url) return { issueRef: null, url: null };
      const issueRef = url.match(/\/(\d+)$/)?.[1] || url;
      // Try to link as sub-issue
      if (parentRef) {
        const parentNum = parentRef.replace('#', '');
        ghExec(['sub-issue', 'add', parentNum, '--child', issueRef]);
      }
      return { issueRef: `#${issueRef}`, url };
    },

    updateIssueStatus(issueRef, status) {
      if (!ghAvailable()) return { success: false };
      const num = String(issueRef).replace('#', '');
      const statusLabels = {
        pending: 'status:todo',
        in_progress: 'status:in-progress',
        complete: 'status:done',
      };
      const label = statusLabels[status];
      if (label) {
        // Remove other status labels, add new one
        for (const sl of Object.values(statusLabels)) {
          ghExec(['issue', 'edit', num, '--remove-label', sl]);
        }
        ghExec(['issue', 'edit', num, '--add-label', label]);
      }
      if (status === 'complete') {
        ghExec(['issue', 'close', num]);
      }
      return { success: true };
    },

    addComment(issueRef, markdownBody) {
      if (!ghAvailable()) return { success: false };
      const num = String(issueRef).replace('#', '');
      ghExec(['issue', 'comment', num, '--body', markdownBody]);
      return { success: true };
    },

    syncRoadmap(roadmapData) {
      const mapping = loadTrackerMapping(cwd);
      mapping.provider = 'github';
      const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };

      for (const phase of roadmapData.phases || []) {
        const key = String(phase.number);
        if (mapping.phases[key]) {
          stats.skipped++;
          continue;
        }
        const result = this.createPhaseIssue(
          phase.number,
          `Phase ${phase.number}: ${phase.name}`,
          phase.goal || '',
          phase.labels || []
        );
        if (result.issueRef) {
          mapping.phases[key] = { issueRef: result.issueRef, url: result.url, status: 'pending' };
          stats.created++;
        } else {
          stats.errors++;
        }
      }

      saveTrackerMapping(cwd, mapping);
      return stats;
    },

    syncPhase(phaseNum, phaseData) {
      const mapping = loadTrackerMapping(cwd);
      mapping.provider = 'github';
      const stats = { created: 0, updated: 0, errors: 0 };
      const parentRef = mapping.phases[String(phaseNum)]?.issueRef || null;

      for (const plan of phaseData.plans || []) {
        const key = `${phaseNum}-${plan.number}`;
        if (mapping.plans[key]) {
          stats.updated++;
          continue;
        }
        const result = this.createTaskIssue(
          phaseNum,
          plan.number,
          `Plan ${phaseNum}-${plan.number}: ${plan.objective || ''}`,
          parentRef
        );
        if (result.issueRef) {
          mapping.plans[key] = {
            issueRef: result.issueRef,
            url: result.url,
            parentRef: parentRef || '',
            status: 'pending',
          };
          stats.created++;
        } else {
          stats.errors++;
        }
      }

      saveTrackerMapping(cwd, mapping);
      return stats;
    },
  };
}

// Note: Jira integration is now handled via mcp-atlassian MCP server.
// grd-tools.js provides prepare/record commands; Claude agents call MCP tools directly.
// See references/mcp-tracker-protocol.md for the full protocol.

/**
 * Factory function: create a tracker instance based on the configured provider.
 * @param {string} cwd - Project working directory
 * @returns {Object|null} Tracker instance for GitHub, or null for mcp-atlassian/none
 */
function createTracker(cwd) {
  const config = loadTrackerConfig(cwd);
  if (config.provider === 'github') return createGitHubTracker(cwd, config);
  // mcp-atlassian provider is handled by Claude agents via MCP tools, not by grd-tools.js
  return null;
}

// ─── Tracker Command Dispatcher ───────────────────────────────────────────────

/**
 * CLI command: Dispatch tracker subcommand (get-config, sync-roadmap, sync-phase, update-status, etc.).
 * @param {string} cwd - Project working directory
 * @param {string} subcommand - Tracker subcommand name
 * @param {string[]} args - Additional arguments for the subcommand
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdTracker(cwd, subcommand, args, raw) {
  switch (subcommand) {
    case 'get-config': {
      const config = loadTrackerConfig(cwd);
      let authStatus = 'not_configured';
      if (config.provider === 'github') {
        try {
          execFileSync('gh', ['auth', 'status'], {
            cwd,
            encoding: 'utf-8',
            timeout: 10000,
            stdio: 'pipe',
          });
          authStatus = 'authenticated';
        } catch {
          authStatus = 'not_authenticated';
        }
      } else if (config.provider === 'mcp-atlassian') {
        authStatus = 'mcp_server';
      }
      output({ ...config, auth_status: authStatus }, raw);
      break;
    }

    case 'sync-roadmap': {
      const config = loadTrackerConfig(cwd);
      if (config.provider === 'mcp-atlassian') {
        output(
          {
            error:
              'Use "tracker prepare-roadmap-sync" for mcp-atlassian provider. Agent executes MCP calls.',
            created: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
          },
          raw
        );
        return;
      }
      const tracker = createTracker(cwd);
      if (!tracker) {
        output(
          { error: 'No tracker configured', created: 0, updated: 0, skipped: 0, errors: 0 },
          raw
        );
        return;
      }
      const roadmapContent = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
      if (!roadmapContent) {
        output(
          { error: 'No ROADMAP.md found', created: 0, updated: 0, skipped: 0, errors: 0 },
          raw
        );
        return;
      }
      const phases = [];
      const phaseRegex = /^##\s+Phase\s+(\d+(?:\.\d+)?)\s*[:\-—]\s*(.+)$/gm;
      let match;
      while ((match = phaseRegex.exec(roadmapContent)) !== null) {
        const number = match[1];
        const name = match[2].trim();
        const afterPhase = roadmapContent.slice(
          match.index + match[0].length,
          match.index + match[0].length + 500
        );
        const goalMatch = afterPhase.match(/(?:\*\*Goal:\*\*|Goal:)\s*(.+)/);
        phases.push({ number, name, goal: goalMatch ? goalMatch[1].trim() : '' });
      }
      const stats = tracker.syncRoadmap({ phases });
      output(stats, raw);
      break;
    }

    case 'sync-phase': {
      const phaseNum = args[0];
      if (!phaseNum) {
        error('Usage: tracker sync-phase <phase-number>');
      }
      const config = loadTrackerConfig(cwd);
      if (config.provider === 'mcp-atlassian') {
        output(
          {
            error:
              'Use "tracker prepare-phase-sync" for mcp-atlassian provider. Agent executes MCP calls.',
            created: 0,
            updated: 0,
            errors: 0,
          },
          raw
        );
        return;
      }
      const tracker = createTracker(cwd);
      if (!tracker) {
        output({ error: 'No tracker configured', created: 0, updated: 0, errors: 0 }, raw);
        return;
      }
      const planningDir = path.join(cwd, '.planning', 'phases');
      let phaseDir = null;
      try {
        const dirs = fs.readdirSync(planningDir);
        phaseDir = dirs.find((d) => d.startsWith(`${phaseNum}-`) || d === String(phaseNum));
      } catch {
        /* no phases dir */
      }

      const plans = [];
      if (phaseDir) {
        const fullPhaseDir = path.join(planningDir, phaseDir);
        try {
          const files = fs.readdirSync(fullPhaseDir).filter((f) => f.match(/-PLAN\.md$/));
          for (const f of files) {
            const planMatch = f.match(/(\d+)-(\d+)-PLAN\.md$/);
            if (planMatch) {
              const planContent = safeReadFile(path.join(fullPhaseDir, f));
              const objMatch = planContent?.match(/(?:objective|title):\s*["']?(.+?)["']?\s*$/m);
              plans.push({ number: planMatch[2], objective: objMatch ? objMatch[1] : f });
            }
          }
        } catch {
          /* no plan files */
        }
      }
      const stats = tracker.syncPhase(phaseNum, { plans });
      output(stats, raw);
      break;
    }

    case 'update-status': {
      const phaseNum = args[0];
      const status = args[1];
      if (!phaseNum || !status) {
        error('Usage: tracker update-status <phase-number> <status>');
      }
      const config = loadTrackerConfig(cwd);
      if (config.provider === 'mcp-atlassian') {
        // For mcp-atlassian, just update local mapping — agent calls MCP transition_issue separately
        const mapping = loadTrackerMapping(cwd);
        const phaseInfo = mapping.phases[String(phaseNum)];
        if (!phaseInfo) {
          output({ success: false, error: 'Phase not synced to tracker' }, raw);
          return;
        }
        phaseInfo.status = status;
        saveTrackerMapping(cwd, mapping);
        output({ success: true, issue_key: phaseInfo.issueRef, status }, raw);
        return;
      }
      const tracker = createTracker(cwd);
      if (!tracker) {
        output({ success: false, error: 'No tracker configured' }, raw);
        return;
      }
      const mapping = loadTrackerMapping(cwd);
      const phaseInfo = mapping.phases[String(phaseNum)];
      if (!phaseInfo) {
        output({ success: false, error: 'Phase not synced to tracker' }, raw);
        return;
      }
      const result = tracker.updateIssueStatus(phaseInfo.issueRef, status);
      if (result.success) {
        phaseInfo.status = status;
        saveTrackerMapping(cwd, mapping);
      }
      output(result, raw);
      break;
    }

    case 'add-comment': {
      const phaseNum = args[0];
      const filePath = args[1];
      if (!phaseNum || !filePath) {
        error('Usage: tracker add-comment <phase-number> <file-path>');
      }
      const config = loadTrackerConfig(cwd);
      if (config.provider === 'mcp-atlassian') {
        // For mcp-atlassian, return the issue key and file content so agent can call MCP add_comment
        const mapping = loadTrackerMapping(cwd);
        const phaseInfo = mapping.phases[String(phaseNum)];
        if (!phaseInfo) {
          output({ success: false, error: 'Phase not synced to tracker' }, raw);
          return;
        }
        const content = safeReadFile(path.join(cwd, filePath));
        if (!content) {
          output({ success: false, error: 'File not found: ' + filePath }, raw);
          return;
        }
        output(
          {
            provider: 'mcp-atlassian',
            issue_key: phaseInfo.issueRef,
            file_path: filePath,
            content_length: content.length,
            content,
          },
          raw
        );
        return;
      }
      const tracker = createTracker(cwd);
      if (!tracker) {
        output({ success: false, error: 'No tracker configured' }, raw);
        return;
      }
      const mapping = loadTrackerMapping(cwd);
      const phaseInfo = mapping.phases[String(phaseNum)];
      if (!phaseInfo) {
        output({ success: false, error: 'Phase not synced to tracker' }, raw);
        return;
      }
      const content = safeReadFile(path.join(cwd, filePath));
      if (!content) {
        output({ success: false, error: 'File not found: ' + filePath }, raw);
        return;
      }
      const result = tracker.addComment(phaseInfo.issueRef, content);
      output(result, raw);
      break;
    }

    case 'prepare-roadmap-sync': {
      const config = loadTrackerConfig(cwd);
      if (config.provider !== 'mcp-atlassian') {
        output(
          {
            error:
              'prepare-roadmap-sync is only for mcp-atlassian provider. Use "tracker sync-roadmap" for GitHub.',
          },
          raw
        );
        return;
      }
      const mcpConfig = config.mcp_atlassian || {};
      const roadmapContent = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
      if (!roadmapContent) {
        output({ error: 'No ROADMAP.md found', operations: [] }, raw);
        return;
      }
      const mapping = loadTrackerMapping(cwd);
      const schedule = computeSchedule(cwd);
      const operations = [];

      // Parse milestones (## headings with version like v1.0)
      const milestoneRegex = /^##\s*(.*v(\d+\.\d+)[^(\n]*)/gim;
      let mMatch;
      const milestonePositions = [];
      while ((mMatch = milestoneRegex.exec(roadmapContent)) !== null) {
        milestonePositions.push({
          heading: mMatch[1].trim(),
          version: 'v' + mMatch[2],
          index: mMatch.index,
        });
      }

      // Parse phases
      const phaseRegex = /^##\s+Phase\s+(\d+(?:\.\d+)?)\s*[:\-—]\s*(.+)$/gm;
      let match;
      const allPhases = [];
      while ((match = phaseRegex.exec(roadmapContent)) !== null) {
        const number = match[1];
        const name = match[2].trim();
        const afterPhase = roadmapContent.slice(
          match.index + match[0].length,
          match.index + match[0].length + 500
        );
        const goalMatch = afterPhase.match(/(?:\*\*Goal:\*\*|Goal:)\s*(.+)/);
        const goal = goalMatch ? goalMatch[1].trim() : '';
        // Determine which milestone this phase belongs to
        let milestone = milestonePositions.length > 0 ? milestonePositions[0].version : null;
        for (const ms of milestonePositions) {
          if (match.index > ms.index) milestone = ms.version;
        }
        allPhases.push({ number, name, goal, milestone, index: match.index });
      }

      // Create milestone operations (Epics) with schedule dates
      for (const ms of milestonePositions) {
        if (mapping.milestones[ms.version]) {
          operations.push({
            action: 'skip',
            type: 'milestone',
            milestone: ms.version,
            issue_key: mapping.milestones[ms.version].issueRef,
            reason: 'already_synced',
          });
        } else {
          const msSchedule = getScheduleForMilestone(schedule, ms.version);
          const op = {
            action: 'create',
            type: 'milestone',
            milestone: ms.version,
            summary: ms.heading,
            description: `Milestone ${ms.version}`,
          };
          if (msSchedule && msSchedule.start) op.start_date = msSchedule.start;
          if (msSchedule && msSchedule.target) op.due_date = msSchedule.target;
          operations.push(op);
        }
      }

      // Create phase operations (Tasks, children of milestone Epics) with schedule dates
      for (const phase of allPhases) {
        const milestoneKey =
          phase.milestone && mapping.milestones[phase.milestone]
            ? mapping.milestones[phase.milestone].issueRef
            : null;
        if (mapping.phases[phase.number]) {
          operations.push({
            action: 'skip',
            type: 'phase',
            phase: phase.number,
            issue_key: mapping.phases[phase.number].issueRef,
            reason: 'already_synced',
          });
        } else {
          const phaseSchedule = getScheduleForPhase(schedule, phase.number);
          const op = {
            action: 'create',
            type: 'phase',
            phase: phase.number,
            milestone: phase.milestone,
            parent_key: milestoneKey,
            summary: `Phase ${phase.number}: ${phase.name}`,
            description: phase.goal,
          };
          if (phaseSchedule && phaseSchedule.start_date) {
            op.start_date = phaseSchedule.start_date;
            op.due_date = phaseSchedule.due_date;
            op.duration_days = phaseSchedule.duration_days;
          }
          operations.push(op);
        }
      }

      output(
        {
          provider: 'mcp-atlassian',
          project_key: mcpConfig.project_key || '',
          start_date_field: mcpConfig.start_date_field || 'customfield_10015',
          milestone_issue_type: mcpConfig.milestone_issue_type || 'Epic',
          phase_issue_type: mcpConfig.phase_issue_type || 'Task',
          operations,
        },
        raw
      );
      break;
    }

    case 'prepare-phase-sync': {
      const phaseNum = args[0];
      if (!phaseNum) {
        error('Usage: tracker prepare-phase-sync <phase-number>');
      }
      const config = loadTrackerConfig(cwd);
      if (config.provider !== 'mcp-atlassian') {
        output(
          {
            error:
              'prepare-phase-sync is only for mcp-atlassian provider. Use "tracker sync-phase" for GitHub.',
          },
          raw
        );
        return;
      }
      const mcpConfig = config.mcp_atlassian || {};
      const mapping = loadTrackerMapping(cwd);
      const parentInfo = mapping.phases[String(phaseNum)];
      const parentKey = parentInfo ? parentInfo.issueRef : null;

      const planningDir = path.join(cwd, '.planning', 'phases');
      let phaseDir = null;
      try {
        const dirs = fs.readdirSync(planningDir);
        phaseDir = dirs.find((d) => d.startsWith(`${phaseNum}-`) || d === String(phaseNum));
      } catch {
        /* no phases dir */
      }

      const operations = [];
      if (phaseDir) {
        const fullPhaseDir = path.join(planningDir, phaseDir);
        try {
          const files = fs.readdirSync(fullPhaseDir).filter((f) => f.match(/-PLAN\.md$/));
          for (const f of files) {
            const planMatch = f.match(/(\d+)-(\d+)-PLAN\.md$/);
            if (planMatch) {
              const planNum = planMatch[2];
              const key = `${phaseNum}-${planNum}`;
              if (mapping.plans[key]) {
                operations.push({
                  action: 'skip',
                  type: 'plan',
                  phase: phaseNum,
                  plan: planNum,
                  issue_key: mapping.plans[key].issueRef,
                  reason: 'already_synced',
                });
              } else {
                const planContent = safeReadFile(path.join(fullPhaseDir, f));
                const objMatch = planContent?.match(/(?:objective|title):\s*["']?(.+?)["']?\s*$/m);
                operations.push({
                  action: 'create',
                  type: 'plan',
                  phase: phaseNum,
                  plan: planNum,
                  summary: `Plan ${phaseNum}-${planNum}: ${objMatch ? objMatch[1] : f}`,
                  description: '',
                });
              }
            }
          }
        } catch {
          /* no plan files */
        }
      }
      output(
        {
          provider: 'mcp-atlassian',
          project_key: mcpConfig.project_key || '',
          plan_issue_type: mcpConfig.plan_issue_type || 'Sub-task',
          parent_key: parentKey,
          operations,
        },
        raw
      );
      break;
    }

    case 'record-mapping': {
      // Parse args: --type milestone|phase|plan --milestone V [--phase N] [--plan M] --key PROJ-1 --url URL [--parent PROJ-0]
      const typeIdx = args.indexOf('--type');
      const milestoneIdx = args.indexOf('--milestone');
      const phaseIdx = args.indexOf('--phase');
      const planIdx = args.indexOf('--plan');
      const keyIdx = args.indexOf('--key');
      const urlIdx = args.indexOf('--url');
      const parentIdx = args.indexOf('--parent');

      const type = typeIdx !== -1 ? args[typeIdx + 1] : null;
      const milestoneVer = milestoneIdx !== -1 ? args[milestoneIdx + 1] : null;
      const phaseNum = phaseIdx !== -1 ? args[phaseIdx + 1] : null;
      const planNum = planIdx !== -1 ? args[planIdx + 1] : null;
      const issueKey = keyIdx !== -1 ? args[keyIdx + 1] : null;
      const issueUrl = urlIdx !== -1 ? args[urlIdx + 1] : null;
      const parentKey = parentIdx !== -1 ? args[parentIdx + 1] : '';

      if (!type || !issueKey) {
        error(
          'Usage: tracker record-mapping --type milestone|phase|plan [--milestone V] [--phase N] [--plan M] --key PROJ-1 --url URL [--parent PROJ-0]'
        );
      }

      const mapping = loadTrackerMapping(cwd);
      mapping.provider = 'mcp-atlassian';

      if (type === 'milestone') {
        if (!milestoneVer) error('--milestone is required for type "milestone"');
        mapping.milestones[milestoneVer] = {
          issueRef: issueKey,
          url: issueUrl || '',
          status: 'pending',
        };
      } else if (type === 'phase') {
        if (!phaseNum) error('--phase is required for type "phase"');
        mapping.phases[phaseNum] = {
          issueRef: issueKey,
          url: issueUrl || '',
          parentRef: parentKey,
          status: 'pending',
        };
      } else if (type === 'plan') {
        if (!phaseNum) error('--phase is required for type "plan"');
        if (!planNum) error('--plan is required for type "plan"');
        const key = `${phaseNum}-${planNum}`;
        mapping.plans[key] = {
          issueRef: issueKey,
          url: issueUrl || '',
          parentRef: parentKey,
          status: 'pending',
        };
      } else {
        error(`Unknown mapping type: ${type}. Use "milestone", "phase", or "plan".`);
      }

      saveTrackerMapping(cwd, mapping);
      output(
        {
          success: true,
          type,
          milestone: milestoneVer || null,
          phase: phaseNum || null,
          plan: planNum || null,
          key: issueKey,
        },
        raw
      );
      break;
    }

    case 'record-status': {
      // Parse args: --phase N --status in_progress|complete|pending
      const phaseIdx = args.indexOf('--phase');
      const statusIdx = args.indexOf('--status');
      const phaseNum = phaseIdx !== -1 ? args[phaseIdx + 1] : null;
      const status = statusIdx !== -1 ? args[statusIdx + 1] : null;

      if (!phaseNum || !status) {
        error('Usage: tracker record-status --phase N --status pending|in_progress|complete');
      }

      const mapping = loadTrackerMapping(cwd);
      const phaseInfo = mapping.phases[String(phaseNum)];
      if (!phaseInfo) {
        output({ success: false, error: 'Phase not synced to tracker' }, raw);
        return;
      }
      phaseInfo.status = status;
      saveTrackerMapping(cwd, mapping);
      output({ success: true, phase: phaseNum, status, issue_key: phaseInfo.issueRef }, raw);
      break;
    }

    case 'sync-status': {
      const config = loadTrackerConfig(cwd);
      const mapping = loadTrackerMapping(cwd);

      const roadmapContent = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
      const phaseRegex = /^##\s+Phase\s+(\d+(?:\.\d+)?)/gm;
      const roadmapPhases = [];
      let m;
      while ((m = phaseRegex.exec(roadmapContent || '')) !== null) {
        roadmapPhases.push(m[1]);
      }

      const synced = roadmapPhases.filter((p) => mapping.phases[p]);
      const unsynced = roadmapPhases.filter((p) => !mapping.phases[p]);

      output(
        {
          provider: config.provider,
          last_synced: mapping.last_synced,
          total_milestones: Object.keys(mapping.milestones).length,
          total_phases: roadmapPhases.length,
          synced_phases: synced.length,
          unsynced_phases: unsynced.length,
          synced: synced,
          unsynced: unsynced,
          plan_count: Object.keys(mapping.plans).length,
        },
        raw
      );
      break;
    }

    case 'schedule': {
      const schedule = computeSchedule(cwd);
      output(schedule, raw);
      break;
    }

    case 'prepare-reschedule': {
      const config = loadTrackerConfig(cwd);
      if (config.provider !== 'mcp-atlassian') {
        output({ error: 'prepare-reschedule is only for mcp-atlassian provider.' }, raw);
        return;
      }
      const mcpConfig = config.mcp_atlassian || {};
      const mapping = loadTrackerMapping(cwd);
      const schedule = computeSchedule(cwd);
      const operations = [];

      // Emit update operations for synced milestones with dates
      for (const ms of schedule.milestones) {
        const mapped = mapping.milestones[ms.version];
        if (mapped && (ms.start || ms.target)) {
          const op = {
            action: 'update',
            type: 'milestone',
            milestone: ms.version,
            issue_key: mapped.issueRef,
          };
          if (ms.start) op.start_date = ms.start;
          if (ms.target) op.due_date = ms.target;
          operations.push(op);
        }
      }

      // Emit update operations for synced phases with computed dates
      for (const phase of schedule.phases) {
        const mapped = mapping.phases[phase.number];
        if (mapped && phase.start_date) {
          operations.push({
            action: 'update',
            type: 'phase',
            phase: phase.number,
            issue_key: mapped.issueRef,
            start_date: phase.start_date,
            due_date: phase.due_date,
          });
        }
      }

      output(
        {
          provider: 'mcp-atlassian',
          start_date_field: mcpConfig.start_date_field || 'customfield_10015',
          operations,
        },
        raw
      );
      break;
    }

    default:
      error(
        `Unknown tracker subcommand: ${subcommand}\nAvailable: get-config, sync-roadmap, sync-phase, update-status, add-comment, sync-status, prepare-roadmap-sync, prepare-phase-sync, record-mapping, record-status, schedule, prepare-reschedule`
      );
  }
}

module.exports = {
  loadTrackerConfig,
  loadTrackerMapping,
  saveTrackerMapping,
  createGitHubTracker,
  createTracker,
  cmdTracker,
};
