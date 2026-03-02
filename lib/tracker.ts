/**
 * GRD Tracker Integration -- Issue tracker sync (GitHub/Jira) and mapping
 *
 * Extracted from bin/grd-tools.js during Phase 3 modularization.
 * Handles: tracker config, mapping, schedule, GitHub sync, cmdTracker dispatch.
 *
 * Depends on: lib/utils.ts (fs, path, execFileSync, safeReadFile, safeReadMarkdown, stripShippedSections, loadConfig, output, error)
 *             lib/roadmap.ts (computeSchedule, getScheduleForPhase, getScheduleForMilestone)
 *             lib/paths.ts (phasesDir)
 */

'use strict';

import type { GrdConfig } from './types';

const {
  fs,
  path,
  execFileSync,
  safeReadFile,
  safeReadMarkdown,
  stripShippedSections,
  loadConfig,
  output,
  error,
} = require('./utils') as {
  fs: typeof import('fs');
  path: typeof import('path');
  execFileSync: typeof import('child_process').execFileSync;
  safeReadFile: (filePath: string) => string | null;
  safeReadMarkdown: (filePath: string) => string | null;
  stripShippedSections: (content: string) => string;
  loadConfig: (cwd: string) => GrdConfig;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
};

const { computeSchedule, getScheduleForPhase, getScheduleForMilestone } =
  require('./roadmap') as {
    computeSchedule: (cwd: string) => ScheduleResult;
    getScheduleForPhase: (
      schedule: ScheduleResult,
      phaseNum: string | number
    ) => PhaseScheduleEntry | null;
    getScheduleForMilestone: (
      schedule: ScheduleResult,
      version: string
    ) => ParsedMilestone | null;
  };

const { phasesDir: getPhasesDirPath } = require('./paths') as {
  phasesDir: (cwd: string, milestone?: string | null) => string;
};

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Tracker provider identifier.
 */
type TrackerProvider = 'github' | 'mcp-atlassian' | 'none';

/**
 * GitHub-specific tracker configuration.
 */
interface GitHubConfig {
  project_board: string;
  default_assignee: string;
  default_labels: string[];
  auto_issues: boolean;
  pr_per_phase: boolean;
}

/**
 * MCP Atlassian (Jira) specific tracker configuration.
 */
interface McpAtlassianConfig {
  project_key: string;
  milestone_issue_type: string;
  phase_issue_type: string;
  plan_issue_type: string;
  start_date_field?: string;
  epic_issue_type?: string;
  task_issue_type?: string;
}

/**
 * Full tracker configuration from config.json.
 */
interface TrackerConfig {
  provider: TrackerProvider;
  auto_sync?: boolean;
  github?: GitHubConfig;
  mcp_atlassian?: McpAtlassianConfig;
}

/**
 * A milestone entry in the tracker mapping.
 */
interface MilestoneMapping {
  issueRef: string;
  url: string;
  status: string;
}

/**
 * A phase entry in the tracker mapping.
 */
interface PhaseMapping {
  issueRef: string;
  url: string;
  parentRef: string;
  status: string;
}

/**
 * A plan entry in the tracker mapping.
 */
interface PlanMapping {
  issueRef: string;
  url: string;
  parentRef: string;
  status: string;
}

/**
 * Full tracker mapping loaded from TRACKER.md.
 */
interface TrackerMapping {
  provider: string | null;
  last_synced: string | null;
  milestones: Record<string, MilestoneMapping>;
  phases: Record<string, PhaseMapping>;
  plans: Record<string, PlanMapping>;
  _trackerIndex: Map<string, MilestoneMapping | PhaseMapping | PlanMapping>;
}

/**
 * Result of creating a GitHub issue.
 */
interface IssueCreateResult {
  issueRef: string | null;
  url: string | null;
}

/**
 * Result of updating an issue's status.
 */
interface StatusUpdateResult {
  success: boolean;
}

/**
 * Statistics from a sync operation.
 */
interface SyncStats {
  created: number;
  updated: number;
  skipped?: number;
  errors: number;
}

/**
 * GitHub tracker interface -- returned by createGitHubTracker.
 */
interface GitHubTracker {
  provider: string;
  createPhaseIssue: (
    phaseNum: string | number,
    title: string,
    body: string,
    labels?: string[]
  ) => IssueCreateResult;
  createTaskIssue: (
    phaseNum: string | number,
    planNum: string | number,
    title: string,
    parentRef: string | null
  ) => IssueCreateResult;
  updateIssueStatus: (
    issueRef: string,
    status: string
  ) => StatusUpdateResult;
  addComment: (
    issueRef: string,
    markdownBody: string
  ) => StatusUpdateResult;
  syncRoadmap: (roadmapData: { phases: RoadmapPhaseInput[] }) => SyncStats;
  syncPhase: (
    phaseNum: string | number,
    phaseData: { plans: PlanInput[] }
  ) => SyncStats;
}

/**
 * Parsed milestone from roadmap.ts schedule computation.
 */
interface ParsedMilestone {
  version: string;
  heading: string;
  start: string | null;
  target: string | null;
}

/**
 * Phase schedule entry from roadmap.ts schedule computation.
 */
interface PhaseScheduleEntry {
  number: string;
  name: string;
  duration_days: number;
  milestone: string | null;
  start_date: string | null;
  due_date: string | null;
}

/**
 * Schedule result from computeSchedule.
 */
interface ScheduleResult {
  milestones: ParsedMilestone[];
  phases: PhaseScheduleEntry[];
}

/**
 * Input phase shape for roadmap sync.
 */
interface RoadmapPhaseInput {
  number: string;
  name: string;
  goal?: string;
  labels?: string[];
}

/**
 * Input plan shape for phase sync.
 */
interface PlanInput {
  number: string;
  objective?: string;
}

/**
 * Milestone position for prepare-roadmap-sync parsing.
 */
interface MilestonePosition {
  heading: string;
  version: string;
  index: number;
}

/**
 * Phase position for prepare-roadmap-sync parsing.
 */
interface PhasePosition {
  number: string;
  name: string;
  goal: string;
  milestone: string | null;
  index: number;
}

/**
 * A sync operation entry (create or skip).
 */
interface SyncOperation {
  action: 'create' | 'skip' | 'update';
  type: 'milestone' | 'phase' | 'plan';
  milestone?: string;
  phase?: string;
  plan?: string;
  issue_key?: string;
  reason?: string;
  summary?: string;
  description?: string;
  parent_key?: string | null;
  start_date?: string;
  due_date?: string;
  duration_days?: number;
}

/**
 * Tracker mapping cache entry.
 */
interface TrackerMappingCacheEntry {
  mtime: number | null;
  mapping: TrackerMapping;
}

/**
 * Legacy github_integration config shape for backward-compat migration.
 */
interface LegacyGitHubIntegration {
  enabled?: boolean;
  auto_issues?: boolean;
  project_board?: string;
  project_name?: string;
  default_assignee?: string;
  default_labels?: string[];
  labels?: Record<string, string>;
  pr_per_phase?: boolean;
}

/**
 * Raw config.json structure for tracker parsing.
 */
interface RawConfig {
  tracker?: Record<string, unknown>;
  github_integration?: LegacyGitHubIntegration;
}

// ─── Tracker Config & Mapping ─────────────────────────────────────────────────

/**
 * Load tracker configuration from config.json, with auto-migration of legacy formats.
 * @param cwd - Project working directory
 * @returns Tracker config object with provider field ('github', 'mcp-atlassian', or 'none')
 */
function loadTrackerConfig(cwd: string): TrackerConfig {
  const configPath: string = path.join(cwd, '.planning', 'config.json');
  const raw: string | null = safeReadFile(configPath);
  if (!raw) return { provider: 'none' };

  try {
    const config: RawConfig = JSON.parse(raw) as RawConfig;
    // New tracker config format
    if (config.tracker) {
      const tracker = config.tracker as Record<string, unknown>;
      // Auto-migrate old "jira" provider to "mcp-atlassian"
      if (tracker.provider === 'jira') {
        tracker.provider = 'mcp-atlassian';
        if (tracker.jira && !tracker.mcp_atlassian) {
          const jira = tracker.jira as Record<string, unknown>;
          tracker.mcp_atlassian = {
            project_key: (jira.project_key as string) || '',
            milestone_issue_type: (jira.epic_issue_type as string) || 'Epic',
            phase_issue_type: (jira.task_issue_type as string) || 'Task',
            plan_issue_type: 'Sub-task',
          };
        }
      }
      // Auto-migrate old epic/task config to milestone/phase/plan config
      if (tracker.mcp_atlassian) {
        const mcp = tracker.mcp_atlassian as Record<string, unknown>;
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
      // Validate required fields for github provider
      if (tracker.provider === 'github' && tracker.github) {
        const gh = tracker.github as Record<string, unknown>;
        if (!gh.project_board) {
          process.stderr.write(
            'Warning: github tracker missing required field: project_board\n'
          );
        }
      }
      return tracker as unknown as TrackerConfig;
    }
    // Backward compat: migrate old github_integration format
    if (config.github_integration && config.github_integration.enabled) {
      const gi = config.github_integration;
      return {
        provider: 'github',
        auto_sync: gi.auto_issues || false,
        github: {
          project_board: gi.project_board || gi.project_name || '',
          default_assignee: gi.default_assignee || '',
          default_labels:
            gi.default_labels || gi.labels
              ? Object.values(gi.labels || {})
              : ['research', 'implementation', 'evaluation', 'integration'],
          auto_issues: gi.auto_issues || false,
          pr_per_phase: gi.pr_per_phase || false,
        },
      };
    }
    return { provider: 'none' };
  } catch (e) {
    process.stderr.write(
      'Warning: failed to parse config.json: ' +
        (e as Error).message +
        '\n'
    );
    return { provider: 'none' };
  }
}

// Cache for loadTrackerMapping: keyed by cwd, stores { mtime, mapping, index }
const _trackerMappingCache = new Map<string, TrackerMappingCacheEntry>();

/**
 * Split a markdown table row into column strings (preserves empty cells).
 * @param row - A single markdown table row string
 * @returns Array of trimmed cell values
 */
function _splitTableRow(row: string): string[] {
  const parts: string[] = row.split('|').map((c: string) => c.trim());
  if (parts.length > 0 && parts[0] === '') parts.shift();
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/**
 * Build a Map index over a loaded mapping for O(1) lookups.
 * Keys: milestone version strings, phase number strings, and "phase-plan" composite strings.
 * @param mapping - Parsed mapping object with milestones, phases, and plans
 * @returns Index map keyed by identifier
 */
function _buildTrackerIndex(
  mapping: TrackerMapping
): Map<string, MilestoneMapping | PhaseMapping | PlanMapping> {
  const index = new Map<
    string,
    MilestoneMapping | PhaseMapping | PlanMapping
  >();
  for (const [k, v] of Object.entries(mapping.milestones || {}))
    index.set(k, v);
  for (const [k, v] of Object.entries(mapping.phases || {})) index.set(k, v);
  for (const [k, v] of Object.entries(mapping.plans || {})) index.set(k, v);
  return index;
}

/**
 * Load the tracker ID mapping from TRACKER.md, parsing milestone/phase/plan tables.
 * Results are cached in memory; the cache is invalidated when the file's mtime changes.
 * A Map index (_trackerIndex) is attached to the returned object for O(1) lookups.
 * @param cwd - Project working directory
 * @returns Mapping object with provider, last_synced, milestones, phases, plans, and _trackerIndex
 */
function loadTrackerMapping(cwd: string): TrackerMapping {
  const mappingPath: string = path.join(cwd, '.planning', 'TRACKER.md');

  // Check mtime for cache invalidation
  let mtime: number | null = null;
  try {
    mtime = fs.statSync(mappingPath).mtimeMs;
  } catch {
    /* file does not exist */
  }

  const cached: TrackerMappingCacheEntry | undefined =
    _trackerMappingCache.get(cwd);
  if (cached && cached.mtime === mtime && mtime !== null) {
    return cached.mapping;
  }

  const content: string | null = safeReadFile(mappingPath);
  if (!content) {
    const empty: TrackerMapping = {
      provider: null,
      last_synced: null,
      milestones: {},
      phases: {},
      plans: {},
      _trackerIndex: new Map<
        string,
        MilestoneMapping | PhaseMapping | PlanMapping
      >(),
    };
    // Cache the empty result keyed on null mtime so repeated misses are cheap
    _trackerMappingCache.set(cwd, { mtime: null, mapping: empty });
    return empty;
  }

  const result: TrackerMapping = {
    provider: null,
    last_synced: null,
    milestones: {},
    phases: {},
    plans: {},
    _trackerIndex: new Map<
      string,
      MilestoneMapping | PhaseMapping | PlanMapping
    >(),
  };

  const providerMatch: RegExpMatchArray | null =
    content.match(/^Provider:\s*(.+)$/m);
  if (providerMatch) result.provider = providerMatch[1].trim();

  const syncMatch: RegExpMatchArray | null =
    content.match(/^Last Synced:\s*(.+)$/m);
  if (syncMatch) result.last_synced = syncMatch[1].trim();

  // Parse milestone table (Epics) -- handles optional blank line between heading and table
  const milestoneTableMatch: RegExpMatchArray | null = content.match(
    /## Milestone Issues\n\n?\|[^\n]+\n\|[^\n]+\n([\s\S]*?)(?=\n##|\n$|$)/
  );
  if (milestoneTableMatch) {
    const rows: string[] = milestoneTableMatch[1]
      .trim()
      .split('\n')
      .filter((r: string) => r.startsWith('|'));
    for (const row of rows) {
      const cols: string[] = _splitTableRow(row);
      if (cols.length >= 4) {
        result.milestones[cols[0]] = {
          issueRef: cols[1],
          url: cols[2],
          status: cols[3],
        };
      }
    }
  }

  // Parse phase table (Tasks) -- handles optional blank line between heading and table
  const phaseTableMatch: RegExpMatchArray | null = content.match(
    /## Phase Issues\n\n?\|[^\n]+\n\|[^\n]+\n([\s\S]*?)(?=\n##|\n$|$)/
  );
  if (phaseTableMatch) {
    const rows: string[] = phaseTableMatch[1]
      .trim()
      .split('\n')
      .filter((r: string) => r.startsWith('|'));
    for (const row of rows) {
      const cols: string[] = _splitTableRow(row);
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

  // Parse plan table (Sub-tasks) -- handles optional blank line between heading and table
  const planTableMatch: RegExpMatchArray | null = content.match(
    /## Plan Issues\n\n?\|[^\n]+\n\|[^\n]+\n([\s\S]*?)(?=\n##|\n$|$)/
  );
  if (planTableMatch) {
    const rows: string[] = planTableMatch[1]
      .trim()
      .split('\n')
      .filter((r: string) => r.startsWith('|'));
    for (const row of rows) {
      const cols: string[] = _splitTableRow(row);
      if (cols.length >= 6) {
        const key: string = `${cols[0]}-${cols[1]}`;
        result.plans[key] = {
          issueRef: cols[2],
          url: cols[3],
          parentRef: cols[4],
          status: cols[5],
        };
      }
    }
  }

  // Attach O(1) lookup index
  result._trackerIndex = _buildTrackerIndex(result);

  _trackerMappingCache.set(cwd, { mtime, mapping: result });
  return result;
}

/**
 * Save the tracker ID mapping to TRACKER.md with formatted markdown tables.
 * @param cwd - Project working directory
 * @param mapping - Mapping object with provider, milestones, phases, and plans entries
 */
function saveTrackerMapping(cwd: string, mapping: TrackerMapping): void {
  const mappingPath: string = path.join(cwd, '.planning', 'TRACKER.md');
  const timestamp: string = new Date()
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');

  let content: string = `# Tracker Mapping\n\nProvider: ${mapping.provider || 'none'}\nLast Synced: ${timestamp}\n\n`;

  content += `## Milestone Issues\n\n| Milestone | Issue Ref | URL | Status |\n|-----------|-----------|-----|--------|\n`;
  for (const [milestone, info] of Object.entries(
    mapping.milestones || {}
  ) as [string, MilestoneMapping][]) {
    content += `| ${milestone} | ${info.issueRef} | ${info.url} | ${info.status} |\n`;
  }

  content += `\n## Phase Issues\n\n| Phase | Issue Ref | URL | Parent Ref | Status |\n|-------|-----------|-----|------------|--------|\n`;
  for (const [phase, info] of Object.entries(mapping.phases || {}) as [
    string,
    PhaseMapping,
  ][]) {
    content += `| ${phase} | ${info.issueRef} | ${info.url} | ${info.parentRef || ''} | ${info.status} |\n`;
  }

  content += `\n## Plan Issues\n\n| Phase | Plan | Issue Ref | URL | Parent Ref | Status |\n|-------|------|-----------|-----|------------|--------|\n`;
  for (const [key, info] of Object.entries(mapping.plans || {}) as [
    string,
    PlanMapping,
  ][]) {
    const [phase, plan] = key.split('-');
    content += `| ${phase} | ${plan} | ${info.issueRef} | ${info.url} | ${info.parentRef} | ${info.status} |\n`;
  }

  const planningDir: string = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir))
    fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(mappingPath, content, 'utf-8');
  // Invalidate cache so the next loadTrackerMapping call re-reads the updated file
  _trackerMappingCache.delete(cwd);
}

// ─── GitHub Tracker ───────────────────────────────────────────────────────────

/**
 * Create a GitHub Issues tracker operations object with methods for issue CRUD.
 * @param cwd - Project working directory
 * @param config - Tracker config with github sub-object for labels, assignees, etc.
 * @returns Tracker object with createPhaseIssue, createTaskIssue, updateIssueStatus, addComment, syncRoadmap, syncPhase methods
 */
function createGitHubTracker(
  cwd: string,
  config: TrackerConfig
): GitHubTracker {
  const gh: GitHubConfig = config.github || ({} as GitHubConfig);
  const mainConfig: GrdConfig = loadConfig(cwd);

  // NOTE: execFileSync is already the safe alternative (no shell injection).
  // This is used for gh CLI calls which require direct process execution.
  function ghExec(args: string[]): string | null {
    try {
      return (
        execFileSync('gh', args, {
          cwd,
          encoding: 'utf-8',
          timeout: mainConfig.timeouts.tracker_gh_ms,
          stdio: 'pipe',
        }) as string
      ).trim();
    } catch {
      return null;
    }
  }

  function ghAvailable(): boolean {
    return ghExec(['--version']) !== null;
  }

  return {
    provider: 'github',

    createPhaseIssue(
      _phaseNum: string | number,
      title: string,
      body: string,
      labels?: string[]
    ): IssueCreateResult {
      if (!ghAvailable()) return { issueRef: null, url: null };
      const args: string[] = [
        'issue',
        'create',
        '--title',
        title,
        '--body',
        body || '',
        '--label',
        'epic',
      ];
      for (const l of labels || gh.default_labels || []) {
        args.push('--label', l);
      }
      if (gh.default_assignee) {
        args.push('--assignee', gh.default_assignee);
      }
      const url: string | null = ghExec(args);
      if (!url) return { issueRef: null, url: null };
      const issueRef: string = url.match(/\/(\d+)$/)?.[1] || url;
      return { issueRef: `#${issueRef}`, url };
    },

    createTaskIssue(
      phaseNum: string | number,
      planNum: string | number,
      title: string,
      parentRef: string | null
    ): IssueCreateResult {
      if (!ghAvailable()) return { issueRef: null, url: null };
      const bodyText: string = `Parent: ${parentRef}\nPhase: ${phaseNum}\nPlan: ${planNum}`;
      const url: string | null = ghExec([
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
      const issueRef: string = url.match(/\/(\d+)$/)?.[1] || url;
      // Try to link as sub-issue
      if (parentRef) {
        const parentNum: string = parentRef.replace('#', '');
        ghExec(['sub-issue', 'add', parentNum, '--child', issueRef]);
      }
      return { issueRef: `#${issueRef}`, url };
    },

    updateIssueStatus(
      issueRef: string,
      status: string
    ): StatusUpdateResult {
      if (!ghAvailable()) return { success: false };
      const num: string = String(issueRef).replace('#', '');
      const statusLabels: Record<string, string> = {
        pending: 'status:todo',
        in_progress: 'status:in-progress',
        complete: 'status:done',
      };
      const label: string | undefined = statusLabels[status];
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

    addComment(
      issueRef: string,
      markdownBody: string
    ): StatusUpdateResult {
      if (!ghAvailable()) return { success: false };
      const num: string = String(issueRef).replace('#', '');
      ghExec(['issue', 'comment', num, '--body', markdownBody]);
      return { success: true };
    },

    syncRoadmap(roadmapData: { phases: RoadmapPhaseInput[] }): SyncStats {
      const mapping: TrackerMapping = loadTrackerMapping(cwd);
      mapping.provider = 'github';
      const stats: SyncStats = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      };

      for (const phase of roadmapData.phases || []) {
        const key: string = String(phase.number);
        if (mapping.phases[key]) {
          stats.skipped = (stats.skipped || 0) + 1;
          continue;
        }
        const result: IssueCreateResult = this.createPhaseIssue(
          phase.number,
          `Phase ${phase.number}: ${phase.name}`,
          phase.goal || '',
          phase.labels || []
        );
        if (result.issueRef) {
          mapping.phases[key] = {
            issueRef: result.issueRef,
            url: result.url || '',
            parentRef: '',
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

    syncPhase(
      phaseNum: string | number,
      phaseData: { plans: PlanInput[] }
    ): SyncStats {
      const mapping: TrackerMapping = loadTrackerMapping(cwd);
      mapping.provider = 'github';
      const stats: SyncStats = { created: 0, updated: 0, errors: 0 };
      const parentRef: string | null =
        mapping.phases[String(phaseNum)]?.issueRef || null;

      for (const plan of phaseData.plans || []) {
        const key: string = `${phaseNum}-${plan.number}`;
        if (mapping.plans[key]) {
          stats.updated++;
          continue;
        }
        const result: IssueCreateResult = this.createTaskIssue(
          phaseNum,
          plan.number,
          `Plan ${phaseNum}-${plan.number}: ${plan.objective || ''}`,
          parentRef
        );
        if (result.issueRef) {
          mapping.plans[key] = {
            issueRef: result.issueRef,
            url: result.url || '',
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
 * @param cwd - Project working directory
 * @returns Tracker instance for GitHub, or null for mcp-atlassian/none
 */
function createTracker(cwd: string): GitHubTracker | null {
  const config: TrackerConfig = loadTrackerConfig(cwd);
  if (config.provider === 'github') return createGitHubTracker(cwd, config);
  // mcp-atlassian provider is handled by Claude agents via MCP tools, not by grd-tools.js
  return null;
}

/**
 * Provider factory map -- maps provider names to factory functions.
 * Each factory takes (cwd, config) and returns a tracker instance.
 */
const PROVIDERS: Record<
  string,
  (cwd: string, config: TrackerConfig) => GitHubTracker
> = {
  github: (cwd: string, config: TrackerConfig) =>
    createGitHubTracker(cwd, config),
};

// ─── Tracker Subcommand Handlers ──────────────────────────────────────────────

function handleGetConfig(
  cwd: string,
  _args: string[],
  raw: boolean
): void {
  const config: TrackerConfig = loadTrackerConfig(cwd);
  const mainConfig: GrdConfig = loadConfig(cwd);
  let authStatus: string = 'not_configured';
  if (config.provider === 'github') {
    try {
      execFileSync('gh', ['auth', 'status'], {
        cwd,
        encoding: 'utf-8',
        timeout: mainConfig.timeouts.tracker_auth_ms,
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
}

function handleSyncRoadmap(
  cwd: string,
  args: string[],
  raw: boolean
): void {
  const isDryRun: boolean = args.includes('--dry-run');
  const config: TrackerConfig = loadTrackerConfig(cwd);
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
  const tracker: GitHubTracker | null = createTracker(cwd);
  if (!tracker) {
    output(
      {
        error: 'No tracker configured',
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      },
      raw
    );
    return;
  }
  const roadmapContent: string | null = safeReadMarkdown(
    path.join(cwd, '.planning', 'ROADMAP.md')
  );
  if (!roadmapContent) {
    output(
      {
        error: 'No ROADMAP.md found',
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
      },
      raw
    );
    return;
  }
  const activeContent: string = stripShippedSections(roadmapContent);
  const phases: RoadmapPhaseInput[] = [];
  const phaseRegex: RegExp =
    /^##\s+Phase\s+(\d+(?:\.\d+)?)\s*[:\-\u2014]\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = phaseRegex.exec(activeContent)) !== null) {
    const number: string = match[1];
    const name: string = match[2].trim();
    const afterPhase: string = activeContent.slice(
      match.index + match[0].length,
      match.index + match[0].length + 500
    );
    const goalMatch: RegExpMatchArray | null = afterPhase.match(
      /(?:\*\*Goal:\*\*|Goal:)\s*(.+)/
    );
    phases.push({
      number,
      name,
      goal: goalMatch ? goalMatch[1].trim() : '',
    });
  }

  if (isDryRun) {
    // Dry-run mode: report what would be created/skipped without executing
    const mapping: TrackerMapping = loadTrackerMapping(cwd);
    const wouldCreate: Array<{ number: string; name: string }> = [];
    const wouldSkip: Array<{
      number: string;
      name: string;
      reason: string;
    }> = [];
    for (const p of phases) {
      if (mapping.phases && mapping.phases[p.number]) {
        wouldSkip.push({
          number: p.number,
          name: p.name,
          reason: 'already_mapped',
        });
      } else {
        wouldCreate.push({ number: p.number, name: p.name });
      }
    }
    output(
      {
        dry_run: true,
        would_create: wouldCreate,
        would_skip: wouldSkip,
        created: 0,
      },
      raw
    );
    return;
  }

  const stats: SyncStats = tracker.syncRoadmap({ phases });
  output(stats, raw);
}

function handleSyncPhase(
  cwd: string,
  args: string[],
  raw: boolean
): void {
  const phaseNum: string | undefined = args[0];
  if (!phaseNum) {
    error(
      'Usage: tracker sync-phase <phase-number>. Example: tracker sync-phase 3. Make sure you are in a GRD project directory and have a tracker configured in .planning/config.json. Run: tracker sync-phase <N> where N is the phase number.'
    );
    return; // unreachable after error() but helps TS narrowing
  }
  const config: TrackerConfig = loadTrackerConfig(cwd);
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
  const tracker: GitHubTracker | null = createTracker(cwd);
  if (!tracker) {
    output(
      { error: 'No tracker configured', created: 0, updated: 0, errors: 0 },
      raw
    );
    return;
  }
  const planningDir: string = getPhasesDirPath(cwd);
  let phaseDir: string | null = null;
  try {
    const dirs: string[] = fs.readdirSync(planningDir);
    phaseDir =
      dirs.find(
        (d: string) =>
          d.startsWith(`${phaseNum}-`) || d === String(phaseNum)
      ) || null;
  } catch {
    /* no phases dir */
  }

  const plans: PlanInput[] = [];
  if (phaseDir) {
    const fullPhaseDir: string = path.join(planningDir, phaseDir);
    try {
      const files: string[] = fs
        .readdirSync(fullPhaseDir)
        .filter((f: string) => f.match(/-PLAN\.md$/));
      for (const f of files) {
        const planMatch: RegExpMatchArray | null = f.match(
          /(\d+)-(\d+)-PLAN\.md$/
        );
        if (planMatch) {
          const planContent: string | null = safeReadFile(
            path.join(fullPhaseDir, f)
          );
          const objMatch: RegExpMatchArray | null | undefined =
            planContent?.match(
              /(?:objective|title):\s*["']?(.+?)["']?\s*$/m
            );
          plans.push({
            number: planMatch[2],
            objective: objMatch ? objMatch[1] : f,
          });
        }
      }
    } catch {
      /* no plan files */
    }
  }
  const stats: SyncStats = tracker.syncPhase(phaseNum, { plans });
  output(stats, raw);
}

function handleUpdateStatus(
  cwd: string,
  args: string[],
  raw: boolean
): void {
  const phaseNum: string | undefined = args[0];
  const status: string | undefined = args[1];
  if (!phaseNum || !status) {
    error(
      'Usage: tracker update-status <phase-number> <status>. Provide phase number and one of the valid status values (in-progress, completed, blocked). Example: tracker update-status 3 completed'
    );
    return; // unreachable after error() but helps TS narrowing
  }
  const config: TrackerConfig = loadTrackerConfig(cwd);
  if (config.provider === 'mcp-atlassian') {
    const mapping: TrackerMapping = loadTrackerMapping(cwd);
    const phaseInfo: PhaseMapping | undefined =
      mapping.phases[String(phaseNum)];
    if (!phaseInfo) {
      output({ success: false, error: 'Phase not synced to tracker' }, raw);
      return;
    }
    phaseInfo.status = status;
    saveTrackerMapping(cwd, mapping);
    output(
      { success: true, issue_key: phaseInfo.issueRef, status },
      raw
    );
    return;
  }
  const tracker: GitHubTracker | null = createTracker(cwd);
  if (!tracker) {
    output({ success: false, error: 'No tracker configured' }, raw);
    return;
  }
  const mapping: TrackerMapping = loadTrackerMapping(cwd);
  const phaseInfo: PhaseMapping | undefined =
    mapping.phases[String(phaseNum)];
  if (!phaseInfo) {
    output({ success: false, error: 'Phase not synced to tracker' }, raw);
    return;
  }
  const result: StatusUpdateResult = tracker.updateIssueStatus(
    phaseInfo.issueRef,
    status
  );
  if (result.success) {
    phaseInfo.status = status;
    saveTrackerMapping(cwd, mapping);
  }
  output(result, raw);
}

function handleAddComment(
  cwd: string,
  args: string[],
  raw: boolean
): void {
  const phaseNum: string | undefined = args[0];
  const filePath: string | undefined = args[1];
  if (!phaseNum || !filePath) {
    error('Usage: tracker add-comment <phase-number> <file-path>');
    return; // unreachable after error() but helps TS narrowing
  }
  const config: TrackerConfig = loadTrackerConfig(cwd);
  if (config.provider === 'mcp-atlassian') {
    const mapping: TrackerMapping = loadTrackerMapping(cwd);
    const phaseInfo: PhaseMapping | undefined =
      mapping.phases[String(phaseNum)];
    if (!phaseInfo) {
      output({ success: false, error: 'Phase not synced to tracker' }, raw);
      return;
    }
    const content: string | null = safeReadFile(
      path.join(cwd, filePath)
    );
    if (!content) {
      output(
        { success: false, error: 'File not found: ' + filePath },
        raw
      );
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
  const tracker: GitHubTracker | null = createTracker(cwd);
  if (!tracker) {
    output({ success: false, error: 'No tracker configured' }, raw);
    return;
  }
  const mapping: TrackerMapping = loadTrackerMapping(cwd);
  const phaseInfo: PhaseMapping | undefined =
    mapping.phases[String(phaseNum)];
  if (!phaseInfo) {
    output({ success: false, error: 'Phase not synced to tracker' }, raw);
    return;
  }
  const content: string | null = safeReadFile(
    path.join(cwd, filePath)
  );
  if (!content) {
    output(
      { success: false, error: 'File not found: ' + filePath },
      raw
    );
    return;
  }
  const result: StatusUpdateResult = tracker.addComment(
    phaseInfo.issueRef,
    content
  );
  output(result, raw);
}

/**
 * Parse all milestones from active roadmap content.
 * @param content - Roadmap content with shipped sections already stripped
 * @returns Ordered milestone list
 */
function _parseAllMilestones(content: string): MilestonePosition[] {
  const milestoneRegex: RegExp = /^##\s*(.*v(\d+\.\d+)[^(\n]*)/gim;
  let mMatch: RegExpExecArray | null;
  const milestonePositions: MilestonePosition[] = [];
  while ((mMatch = milestoneRegex.exec(content)) !== null) {
    milestonePositions.push({
      heading: mMatch[1].trim(),
      version: 'v' + mMatch[2],
      index: mMatch.index,
    });
  }
  return milestonePositions;
}

/**
 * Parse all phases from active roadmap content, associating each with its milestone.
 * @param content - Roadmap content with shipped sections already stripped
 * @param milestonePositions - Parsed milestone list
 * @returns Parsed phase positions
 */
function _parseAllPhases(
  content: string,
  milestonePositions: MilestonePosition[]
): PhasePosition[] {
  const phaseRegex: RegExp =
    /^##\s+Phase\s+(\d+(?:\.\d+)?)\s*[:\-\u2014]\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  const allPhases: PhasePosition[] = [];
  while ((match = phaseRegex.exec(content)) !== null) {
    const number: string = match[1];
    const name: string = match[2].trim();
    const afterPhase: string = content.slice(
      match.index + match[0].length,
      match.index + match[0].length + 500
    );
    const goalMatch: RegExpMatchArray | null = afterPhase.match(
      /(?:\*\*Goal:\*\*|Goal:)\s*(.+)/
    );
    const goal: string = goalMatch ? goalMatch[1].trim() : '';
    let milestone: string | null =
      milestonePositions.length > 0 ? milestonePositions[0].version : null;
    for (const ms of milestonePositions) {
      if (match.index > ms.index) milestone = ms.version;
    }
    allPhases.push({ number, name, goal, milestone, index: match.index });
  }
  return allPhases;
}

/**
 * Build the operations array for a roadmap sync, covering milestones and phases.
 * @param milestones - Parsed milestones
 * @param phases - Parsed phases
 * @param ctx - Loaded mapping and computed schedule
 * @returns Operations array (create/skip entries)
 */
function _buildMilestoneOperations(
  milestones: MilestonePosition[],
  phases: PhasePosition[],
  ctx: { mapping: TrackerMapping; schedule: ScheduleResult }
): SyncOperation[] {
  const { mapping, schedule } = ctx;
  const operations: SyncOperation[] = [];

  for (const ms of milestones) {
    if (mapping.milestones[ms.version]) {
      operations.push({
        action: 'skip',
        type: 'milestone',
        milestone: ms.version,
        issue_key: mapping.milestones[ms.version].issueRef,
        reason: 'already_synced',
      });
    } else {
      const msSchedule: ParsedMilestone | null = getScheduleForMilestone(
        schedule,
        ms.version
      );
      const op: SyncOperation = {
        action: 'create',
        type: 'milestone',
        milestone: ms.version,
        summary: ms.heading,
        description: `Milestone ${ms.version}`,
      };
      if (msSchedule && msSchedule.start) op.start_date = msSchedule.start;
      if (msSchedule && msSchedule.target)
        op.due_date = msSchedule.target;
      operations.push(op);
    }
  }

  for (const phase of phases) {
    const milestoneKey: string | null =
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
      const phaseSchedule: PhaseScheduleEntry | null =
        getScheduleForPhase(schedule, phase.number);
      const op: SyncOperation = {
        action: 'create',
        type: 'phase',
        phase: phase.number,
        milestone: phase.milestone || undefined,
        parent_key: milestoneKey,
        summary: `Phase ${phase.number}: ${phase.name}`,
        description: phase.goal,
      };
      if (phaseSchedule && phaseSchedule.start_date) {
        op.start_date = phaseSchedule.start_date;
        op.due_date = phaseSchedule.due_date || undefined;
        op.duration_days = phaseSchedule.duration_days;
      }
      operations.push(op);
    }
  }

  return operations;
}

function handlePrepareRoadmapSync(
  cwd: string,
  _args: string[],
  raw: boolean
): void {
  const config: TrackerConfig = loadTrackerConfig(cwd);
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
  const mcpConfig: McpAtlassianConfig =
    config.mcp_atlassian || ({} as McpAtlassianConfig);
  const roadmapContent: string | null = safeReadMarkdown(
    path.join(cwd, '.planning', 'ROADMAP.md')
  );
  if (!roadmapContent) {
    output({ error: 'No ROADMAP.md found', operations: [] }, raw);
    return;
  }
  const activeContent: string = stripShippedSections(roadmapContent);
  const mapping: TrackerMapping = loadTrackerMapping(cwd);
  const schedule: ScheduleResult = computeSchedule(cwd);

  const milestonePositions: MilestonePosition[] =
    _parseAllMilestones(activeContent);
  const allPhases: PhasePosition[] = _parseAllPhases(
    activeContent,
    milestonePositions
  );
  const operations: SyncOperation[] = _buildMilestoneOperations(
    milestonePositions,
    allPhases,
    { mapping, schedule }
  );

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
}

function handlePreparePhaseSync(
  cwd: string,
  args: string[],
  raw: boolean
): void {
  const phaseNum: string | undefined = args[0];
  if (!phaseNum) {
    error(
      'Usage: tracker prepare-phase-sync <phase-number>. Provide the phase number to sync, e.g.: tracker prepare-phase-sync 3'
    );
    return; // unreachable after error() but helps TS narrowing
  }
  const config: TrackerConfig = loadTrackerConfig(cwd);
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
  const mcpConfig: McpAtlassianConfig =
    config.mcp_atlassian || ({} as McpAtlassianConfig);
  const mapping: TrackerMapping = loadTrackerMapping(cwd);
  const parentInfo: PhaseMapping | undefined =
    mapping.phases[String(phaseNum)];
  const parentKey: string | null = parentInfo ? parentInfo.issueRef : null;

  const planningDir: string = getPhasesDirPath(cwd);
  let phaseDir: string | null = null;
  try {
    const dirs: string[] = fs.readdirSync(planningDir);
    phaseDir =
      dirs.find(
        (d: string) =>
          d.startsWith(`${phaseNum}-`) || d === String(phaseNum)
      ) || null;
  } catch {
    /* no phases dir */
  }

  const operations: SyncOperation[] = [];
  if (phaseDir) {
    const fullPhaseDir: string = path.join(planningDir, phaseDir);
    try {
      const files: string[] = fs
        .readdirSync(fullPhaseDir)
        .filter((f: string) => f.match(/-PLAN\.md$/));
      for (const f of files) {
        const planMatch: RegExpMatchArray | null = f.match(
          /(\d+)-(\d+)-PLAN\.md$/
        );
        if (planMatch) {
          const planNum: string = planMatch[2];
          const key: string = `${phaseNum}-${planNum}`;
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
            const planContent: string | null = safeReadFile(
              path.join(fullPhaseDir, f)
            );
            const objMatch: RegExpMatchArray | null | undefined =
              planContent?.match(
                /(?:objective|title):\s*["']?(.+?)["']?\s*$/m
              );
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
}

function handleRecordMapping(
  cwd: string,
  args: string[],
  raw: boolean
): void {
  const typeIdx: number = args.indexOf('--type');
  const milestoneIdx: number = args.indexOf('--milestone');
  const phaseIdx: number = args.indexOf('--phase');
  const planIdx: number = args.indexOf('--plan');
  const keyIdx: number = args.indexOf('--key');
  const urlIdx: number = args.indexOf('--url');
  const parentIdx: number = args.indexOf('--parent');

  const type: string | null = typeIdx !== -1 ? args[typeIdx + 1] : null;
  const milestoneVer: string | null =
    milestoneIdx !== -1 ? args[milestoneIdx + 1] : null;
  const phaseNum: string | null =
    phaseIdx !== -1 ? args[phaseIdx + 1] : null;
  const planNum: string | null =
    planIdx !== -1 ? args[planIdx + 1] : null;
  const issueKey: string | null =
    keyIdx !== -1 ? args[keyIdx + 1] : null;
  const issueUrl: string | null =
    urlIdx !== -1 ? args[urlIdx + 1] : null;
  const parentKey: string = parentIdx !== -1 ? args[parentIdx + 1] : '';

  if (!type || !issueKey) {
    error(
      'Usage: tracker record-mapping --type milestone|phase|plan [--milestone V] [--phase N] [--plan M] --key PROJ-1 --url URL [--parent PROJ-0]. Example: tracker record-mapping --type phase --phase 2 --key PROJ-5 --url https://.... Ensure --type and --key flags are provided at minimum.'
    );
    return; // unreachable after error() but helps TS narrowing
  }

  const mapping: TrackerMapping = loadTrackerMapping(cwd);
  mapping.provider = 'mcp-atlassian';

  if (type === 'milestone') {
    if (!milestoneVer) {
      error('--milestone is required for type "milestone"');
      return; // unreachable after error() but helps TS narrowing
    }
    mapping.milestones[milestoneVer] = {
      issueRef: issueKey,
      url: issueUrl || '',
      status: 'pending',
    };
  } else if (type === 'phase') {
    if (!phaseNum) {
      error('--phase is required for type "phase"');
      return; // unreachable after error() but helps TS narrowing
    }
    mapping.phases[phaseNum] = {
      issueRef: issueKey,
      url: issueUrl || '',
      parentRef: parentKey,
      status: 'pending',
    };
  } else if (type === 'plan') {
    if (!phaseNum) {
      error('--phase is required for type "plan"');
      return; // unreachable after error() but helps TS narrowing
    }
    if (!planNum) {
      error('--plan is required for type "plan"');
      return; // unreachable after error() but helps TS narrowing
    }
    const key: string = `${phaseNum}-${planNum}`;
    mapping.plans[key] = {
      issueRef: issueKey,
      url: issueUrl || '',
      parentRef: parentKey,
      status: 'pending',
    };
  } else {
    error(
      `Unknown mapping type: ${type}. Use "milestone", "phase", or "plan".`
    );
    return; // unreachable after error() but helps TS narrowing
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
}

function handleRecordStatus(
  cwd: string,
  args: string[],
  raw: boolean
): void {
  const phaseIdx: number = args.indexOf('--phase');
  const statusIdx: number = args.indexOf('--status');
  const phaseNum: string | null =
    phaseIdx !== -1 ? args[phaseIdx + 1] : null;
  const status: string | null =
    statusIdx !== -1 ? args[statusIdx + 1] : null;

  if (!phaseNum || !status) {
    error(
      'Usage: tracker record-status --phase N --status pending|in_progress|complete. Example: tracker record-status --phase 2 --status in_progress. Ensure both --phase and --status flags are provided.'
    );
    return; // unreachable after error() but helps TS narrowing
  }

  const mapping: TrackerMapping = loadTrackerMapping(cwd);
  const phaseInfo: PhaseMapping | undefined =
    mapping.phases[String(phaseNum)];
  if (!phaseInfo) {
    output({ success: false, error: 'Phase not synced to tracker' }, raw);
    return;
  }
  phaseInfo.status = status;
  saveTrackerMapping(cwd, mapping);
  output(
    { success: true, phase: phaseNum, status, issue_key: phaseInfo.issueRef },
    raw
  );
}

function handleSyncStatus(
  cwd: string,
  _args: string[],
  raw: boolean
): void {
  const config: TrackerConfig = loadTrackerConfig(cwd);
  const mapping: TrackerMapping = loadTrackerMapping(cwd);

  const roadmapContent: string | null = safeReadMarkdown(
    path.join(cwd, '.planning', 'ROADMAP.md')
  );
  const activeContent: string = stripShippedSections(roadmapContent || '');
  const phaseRegex: RegExp = /^##\s+Phase\s+(\d+(?:\.\d+)?)/gm;
  const roadmapPhases: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = phaseRegex.exec(activeContent)) !== null) {
    roadmapPhases.push(m[1]);
  }

  const synced: string[] = roadmapPhases.filter(
    (p: string) => mapping.phases[p]
  );
  const unsynced: string[] = roadmapPhases.filter(
    (p: string) => !mapping.phases[p]
  );

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
}

function handleSchedule(
  cwd: string,
  _args: string[],
  raw: boolean
): void {
  const schedule: ScheduleResult = computeSchedule(cwd);
  output(schedule, raw);
}

function handlePrepareReschedule(
  cwd: string,
  _args: string[],
  raw: boolean
): void {
  const config: TrackerConfig = loadTrackerConfig(cwd);
  if (config.provider !== 'mcp-atlassian') {
    output(
      { error: 'prepare-reschedule is only for mcp-atlassian provider.' },
      raw
    );
    return;
  }
  const mcpConfig: McpAtlassianConfig =
    config.mcp_atlassian || ({} as McpAtlassianConfig);
  const mapping: TrackerMapping = loadTrackerMapping(cwd);
  const schedule: ScheduleResult = computeSchedule(cwd);
  const operations: SyncOperation[] = [];

  for (const ms of schedule.milestones) {
    const mapped: MilestoneMapping | undefined =
      mapping.milestones[ms.version];
    if (mapped && (ms.start || ms.target)) {
      const op: SyncOperation = {
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

  for (const phase of schedule.phases) {
    const mapped: PhaseMapping | undefined =
      mapping.phases[phase.number];
    if (mapped && phase.start_date) {
      operations.push({
        action: 'update',
        type: 'phase',
        phase: phase.number,
        issue_key: mapped.issueRef,
        start_date: phase.start_date,
        due_date: phase.due_date || undefined,
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
}

// ─── Tracker Command Dispatcher ───────────────────────────────────────────────

type TrackerHandler = (cwd: string, args: string[], raw: boolean) => void;

const trackerHandlers: Record<string, TrackerHandler> = {
  'get-config': handleGetConfig,
  'sync-roadmap': handleSyncRoadmap,
  'sync-phase': handleSyncPhase,
  'update-status': handleUpdateStatus,
  'add-comment': handleAddComment,
  'sync-status': handleSyncStatus,
  'prepare-roadmap-sync': handlePrepareRoadmapSync,
  'prepare-phase-sync': handlePreparePhaseSync,
  'record-mapping': handleRecordMapping,
  'record-status': handleRecordStatus,
  schedule: handleSchedule,
  'prepare-reschedule': handlePrepareReschedule,
};

/**
 * CLI command: Dispatch tracker subcommand (get-config, sync-roadmap, sync-phase, update-status, etc.).
 * @param cwd - Project working directory
 * @param subcommand - Tracker subcommand name
 * @param args - Additional arguments for the subcommand
 * @param raw - Output raw text instead of JSON
 */
function cmdTracker(
  cwd: string,
  subcommand: string,
  args: string[],
  raw: boolean
): void {
  const handler: TrackerHandler | undefined = trackerHandlers[subcommand];
  if (!handler) {
    error(
      `Unknown tracker subcommand: '${subcommand}'. Available: ${Object.keys(trackerHandlers).join(', ')}`
    );
    return; // unreachable after error() but helps TS narrowing
  }
  handler(cwd, args, raw);
}

module.exports = {
  loadTrackerConfig,
  loadTrackerMapping,
  saveTrackerMapping,
  createGitHubTracker,
  PROVIDERS,
  createTracker,
  cmdTracker,
};
