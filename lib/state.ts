/**
 * GRD State Operations -- STATE.md read/write/patch/progression functions
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.ts (safeReadFile, loadConfig, output, error)
 *             lib/paths.ts (phasesDir)
 *             lib/frontmatter.js (extractFrontmatter)
 */

'use strict';

import type { GrdConfig } from './types';

const fs = require('fs');
const path = require('path');
const { loadConfig, safeReadMarkdown, output, error } = require('./utils');
const { phasesDir: getPhasesDirPath } = require('./paths');

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Result of cmdStateLoad -- full project state including config and existence flags.
 */
interface StateLoadResult {
  config: GrdConfig;
  state_raw: string;
  state_exists: boolean;
  roadmap_exists: boolean;
  config_exists: boolean;
}

/**
 * Result of cmdStateAdvancePlan -- plan counter update outcome.
 */
interface AdvancePlanResult {
  advanced: boolean;
  reason?: string;
  previous_plan?: number;
  current_plan: number;
  total_plans: number;
  status?: string;
}

/**
 * Result of cmdStatePatch -- batch field update outcome.
 */
interface PatchResult {
  updated: string[];
  failed: string[];
}

/**
 * Options for cmdStatePatch.
 */
interface PatchOptions {
  audit?: boolean;
}

/**
 * Options for cmdStateRecordMetric.
 */
interface RecordMetricOptions {
  phase: string;
  plan: string;
  duration: string;
  tasks?: string;
  files?: string;
}

/**
 * Options for cmdStateAddDecision.
 */
interface AddDecisionOptions {
  phase?: string;
  summary: string;
  rationale?: string;
}

/**
 * Options for cmdStateRecordSession.
 */
interface RecordSessionOptions {
  stopped_at?: string;
  resume_file?: string;
}

/**
 * Decision entry parsed from STATE.md.
 */
interface DecisionEntry {
  phase: string;
  summary: string;
  rationale: string;
}

/**
 * Session continuity info from STATE.md.
 */
interface SessionInfo {
  last_date: string | null;
  stopped_at: string | null;
  resume_file: string | null;
}

/**
 * Result of cmdStateSnapshot -- structured STATE.md parse.
 */
interface StateSnapshotResult {
  current_phase: string | null;
  current_phase_name: string | null;
  total_phases: number | null;
  current_plan: string | null;
  total_plans_in_phase: number | null;
  status: string | null;
  progress_percent: number | null;
  last_activity: string | null;
  last_activity_desc: string | null;
  decisions: DecisionEntry[];
  blockers: string[];
  paused_at: string | null;
  session: SessionInfo;
}

/**
 * Snapshot data saved to .planning/.snapshots/ directory.
 */
interface SnapshotData {
  current_phase: string | null;
  status: string | null;
  decisions: DecisionEntry[];
  blockers: string[];
}

/**
 * Options for cmdStateSnapshot.
 */
interface SnapshotOptions {
  since?: string;
}

/**
 * Diff result when using --since with cmdStateSnapshot.
 */
interface SnapshotDiff {
  since: string;
  changed_fields: Record<string, { from: string | null; to: string | null }>;
  new_decisions: DecisionEntry[];
  new_blockers: string[];
  resolved_blockers: string[];
  has_changes: boolean;
}

// ─── Module-level cache ─────────────────────────────────────────────────────

// Module-level cache with write-through for state file reads.
// Prevents redundant disk reads across state operations; writes update the cache.
const _stateFileCache: Map<string, string> = new Map();

function readStateFile(statePath: string): string {
  if (!_stateFileCache.has(statePath)) {
    _stateFileCache.set(statePath, fs.readFileSync(statePath, 'utf-8'));
  }
  return _stateFileCache.get(statePath) as string;
}

function writeStateFile(statePath: string, content: string): void {
  fs.writeFileSync(statePath, content, 'utf-8');
  _stateFileCache.set(statePath, content);
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/**
 * Extract a **Field:** value from STATE.md markdown content.
 * @param content - STATE.md content
 * @param fieldName - Field name to extract (matched case-insensitively)
 * @returns Trimmed field value, or null if not found
 */
function stateExtractField(content: string, fieldName: string): string | null {
  const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
  const match = content.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Replace a **Field:** value in STATE.md markdown content.
 * @param content - STATE.md content
 * @param fieldName - Field name to replace (matched case-insensitively)
 * @param newValue - New value to set for the field
 * @returns Updated content with replaced field, or null if field not found
 */
function stateReplaceField(content: string, fieldName: string, newValue: string): string | null {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(\\*\\*${escaped}:\\*\\*\\s*)(.*)`, 'i');
  if (pattern.test(content)) {
    return content.replace(pattern, `$1${newValue}`);
  }
  return null;
}

// ─── State Command Functions ─────────────────────────────────────────────────

/**
 * CLI command: Load full project state including config, STATE.md, and existence checks.
 * @param cwd - Project working directory
 * @param raw - Output key=value format instead of JSON
 */
function cmdStateLoad(cwd: string, raw: boolean): void {
  const config: GrdConfig = loadConfig(cwd);
  const planningDir: string = path.join(cwd, '.planning');

  const stateRaw: string = safeReadMarkdown(path.join(planningDir, 'STATE.md')) || '';

  const configExists: boolean = fs.existsSync(path.join(planningDir, 'config.json'));
  const roadmapExists: boolean = fs.existsSync(path.join(planningDir, 'ROADMAP.md'));
  const stateExists: boolean = stateRaw.length > 0;

  const result: StateLoadResult = {
    config,
    state_raw: stateRaw,
    state_exists: stateExists,
    roadmap_exists: roadmapExists,
    config_exists: configExists,
  };

  // For --raw, output a condensed key=value format followed by STATE.md content
  if (raw) {
    const c = config;
    const lines: string[] = [
      `model_profile=${c.model_profile}`,
      `commit_docs=${c.commit_docs}`,
      `branching_strategy=${c.branching_strategy}`,
      `phase_branch_template=${c.phase_branch_template}`,
      `milestone_branch_template=${c.milestone_branch_template}`,
      `parallelization=${c.parallelization}`,
      `research=${c.research}`,
      `plan_checker=${c.plan_checker}`,
      `verifier=${c.verifier}`,
      `config_exists=${configExists}`,
      `roadmap_exists=${roadmapExists}`,
      `state_exists=${stateExists}`,
    ];
    // Include STATE.md content after --- separator so agents get it in one call
    const separator = '\n---\n';
    output({}, true, lines.join('\n') + separator + stateRaw);
  }

  output(result);
}

/**
 * CLI command: Read a specific field or section from STATE.md.
 * @param cwd - Project working directory
 * @param section - Field name or section heading to retrieve, or null for full content
 * @param raw - Output raw text instead of JSON
 */
function cmdStateGet(cwd: string, section: string | null, raw: boolean): void {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  try {
    const content: string = readStateFile(statePath);

    if (!section) {
      output({ content }, raw, content);
      return;
    }

    // Try to find markdown section or field
    const fieldEscaped: string = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Check for **field:** value
    const fieldPattern = new RegExp(`\\*\\*${fieldEscaped}:\\*\\*\\s*(.*)`, 'i');
    const fieldMatch: RegExpMatchArray | null = content.match(fieldPattern);
    if (fieldMatch) {
      output({ [section]: fieldMatch[1].trim() }, raw, fieldMatch[1].trim());
      return;
    }

    // Check for ## Section
    const sectionPattern = new RegExp(`##\\s*${fieldEscaped}\\s*\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const sectionMatch: RegExpMatchArray | null = content.match(sectionPattern);
    if (sectionMatch) {
      output({ [section]: sectionMatch[1].trim() }, raw, sectionMatch[1].trim());
      return;
    }

    output({ error: `Section or field "${section}" not found` }, raw, '');
  } catch {
    error('STATE.md not found');
  }
}

/**
 * CLI command: Batch update multiple **Field:** values in STATE.md.
 * @param cwd - Project working directory
 * @param patches - Object mapping field names to new values
 * @param raw - Output raw text instead of JSON
 * @param opts - Options (e.g., audit flag)
 */
function cmdStatePatch(
  cwd: string,
  patches: Record<string, string>,
  raw: boolean,
  opts?: PatchOptions
): void {
  const options: PatchOptions = opts || {};
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  try {
    let content: string = readStateFile(statePath);
    const results: PatchResult = { updated: [], failed: [] };

    for (const [field, value] of Object.entries(patches)) {
      // Try the original field name first
      const fieldEscaped: string = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');

      if (pattern.test(content)) {
        content = content.replace(pattern, `$1${value}`);
        results.updated.push(field);
      } else {
        // Try underscore-to-space mapping (e.g., "current_plan" -> "Current plan")
        const normalizedField: string = field.replace(/_/g, ' ');
        if (normalizedField !== field) {
          const normalizedEscaped: string = normalizedField.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          );
          const normalizedPattern = new RegExp(
            `(\\*\\*${normalizedEscaped}:\\*\\*\\s*)(.*)`,
            'i'
          );
          if (normalizedPattern.test(content)) {
            content = content.replace(normalizedPattern, `$1${value}`);
            results.updated.push(field);
          } else {
            results.failed.push(field);
          }
        } else {
          results.failed.push(field);
        }
      }
    }

    // Append audit entries if requested
    if (options.audit && results.updated.length > 0) {
      const ts: string = new Date().toISOString();
      const changedFields: string = results.updated.join(', ');
      const auditEntry = `- ${ts}: updated ${changedFields}`;
      const auditSectionPattern = /(## Audit Log\n)([\s\S]*?)($)/;
      if (auditSectionPattern.test(content)) {
        content = content.replace(auditSectionPattern, `$1$2${auditEntry}\n$3`);
      } else {
        content = content + `\n## Audit Log\n${auditEntry}\n`;
      }
    }

    if (results.updated.length > 0) {
      writeStateFile(statePath, content);
    }

    output(results, raw, results.updated.length > 0 ? 'true' : 'false');
  } catch {
    error('STATE.md not found');
  }
}

/**
 * CLI command: Update a single **Field:** value in STATE.md.
 * @param cwd - Project working directory
 * @param field - Field name to update
 * @param value - New value for the field
 */
function cmdStateUpdate(cwd: string, field: string, value: string): void {
  if (!field || value === undefined) {
    error(
      'field and value required for state update. Usage: state patch --<field> <value>. Provide a field and value, e.g.: state patch --Status "in_progress"'
    );
  }

  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  try {
    let content: string = readStateFile(statePath);
    const fieldEscaped: string = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(\\*\\*${fieldEscaped}:\\*\\*\\s*)(.*)`, 'i');
    if (pattern.test(content)) {
      content = content.replace(pattern, `$1${value}`);
      writeStateFile(statePath, content);
      output({ updated: true });
    } else {
      // Try underscore-to-space mapping (e.g., "current_plan" -> "Current plan")
      const normalizedField: string = field.replace(/_/g, ' ');
      if (normalizedField !== field) {
        const normalizedEscaped: string = normalizedField.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&'
        );
        const normalizedPattern = new RegExp(
          `(\\*\\*${normalizedEscaped}:\\*\\*\\s*)(.*)`,
          'i'
        );
        if (normalizedPattern.test(content)) {
          content = content.replace(normalizedPattern, `$1${value}`);
          writeStateFile(statePath, content);
          output({ updated: true });
        } else {
          output({ updated: false, reason: `Field "${field}" not found in STATE.md` });
        }
      } else {
        output({ updated: false, reason: `Field "${field}" not found in STATE.md` });
      }
    }
  } catch {
    output({ updated: false, reason: 'STATE.md not found' });
  }
}

// ─── State Progression Engine ────────────────────────────────────────────────

/**
 * CLI command: Increment the current plan counter in STATE.md, detecting last-plan edge case.
 * @param cwd - Project working directory
 * @param raw - Output raw text instead of JSON
 */
function cmdStateAdvancePlan(cwd: string, raw: boolean): void {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  let content: string;
  try {
    content = readStateFile(statePath);
  } catch {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }
  const currentPlan: number = parseInt(stateExtractField(content, 'Current Plan') || '', 10);
  const totalPlans: number = parseInt(
    stateExtractField(content, 'Total Plans in Phase') || '',
    10
  );
  const today: string = new Date().toISOString().split('T')[0];

  if (isNaN(currentPlan) || isNaN(totalPlans)) {
    output(
      { error: 'Cannot parse Current Plan or Total Plans in Phase from STATE.md' },
      raw
    );
    return;
  }

  if (currentPlan >= totalPlans) {
    content =
      stateReplaceField(content, 'Status', 'Phase complete \u2014 ready for verification') ||
      content;
    content = stateReplaceField(content, 'Last Activity', today) || content;
    writeStateFile(statePath, content);
    output(
      {
        advanced: false,
        reason: 'last_plan',
        current_plan: currentPlan,
        total_plans: totalPlans,
        status: 'ready_for_verification',
      } as AdvancePlanResult,
      raw,
      'false'
    );
  } else {
    const newPlan: number = currentPlan + 1;
    content = stateReplaceField(content, 'Current Plan', String(newPlan)) || content;
    content = stateReplaceField(content, 'Status', 'Ready to execute') || content;
    content = stateReplaceField(content, 'Last Activity', today) || content;
    writeStateFile(statePath, content);
    output(
      {
        advanced: true,
        previous_plan: currentPlan,
        current_plan: newPlan,
        total_plans: totalPlans,
      } as AdvancePlanResult,
      raw,
      'true'
    );
  }
}

/**
 * CLI command: Append a row to the Performance Metrics table in STATE.md.
 * @param cwd - Project working directory
 * @param options - Metric options including phase, plan, duration
 * @param raw - Output raw text instead of JSON
 */
function cmdStateRecordMetric(cwd: string, options: RecordMetricOptions, raw: boolean): void {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  let content: string;
  try {
    content = readStateFile(statePath);
  } catch {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }
  const { phase, plan, duration, tasks, files } = options;

  if (!phase || !plan || !duration) {
    output({ error: 'phase, plan, and duration required' }, raw);
    return;
  }

  // Find Performance Metrics section and its table
  const metricsPattern =
    /(##\s*Performance Metrics[\s\S]*?\n\|[^\n]+\n\|[-|\s]+\n)([\s\S]*?)(?=\n##|\n$|$)/i;
  const metricsMatch: RegExpMatchArray | null = content.match(metricsPattern);

  if (metricsMatch) {
    const tableHeader: string = metricsMatch[1];
    let tableBody: string = metricsMatch[2].trimEnd();
    const newRow = `| Phase ${phase} P${plan} | ${duration} | ${tasks || '-'} tasks | ${files || '-'} files |`;

    if (tableBody.trim() === '' || tableBody.includes('None yet')) {
      tableBody = newRow;
    } else {
      tableBody = tableBody + '\n' + newRow;
    }

    content = content.replace(metricsPattern, `${tableHeader}${tableBody}\n`);
    writeStateFile(statePath, content);
    output({ recorded: true, phase, plan, duration }, raw, 'true');
  } else {
    output(
      { recorded: false, reason: 'Performance Metrics section not found in STATE.md' },
      raw,
      'false'
    );
  }
}

/**
 * CLI command: Recalculate and update the progress bar in STATE.md from disk state.
 * @param cwd - Project working directory
 * @param raw - Output raw text instead of JSON
 */
function cmdStateUpdateProgress(cwd: string, raw: boolean): void {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  let content: string;
  try {
    content = readStateFile(statePath);
  } catch {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }

  // Count summaries across all phases
  const phasesDir: string = getPhasesDirPath(cwd);
  let totalPlans = 0;
  let totalSummaries = 0;

  if (fs.existsSync(phasesDir)) {
    const phaseDirs: string[] = fs
      .readdirSync(phasesDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name);
    for (const dir of phaseDirs) {
      const files: string[] = fs.readdirSync(path.join(phasesDir, dir));
      totalPlans += files.filter((f: string) => f.match(/-PLAN\.md$/i)).length;
      totalSummaries += files.filter((f: string) => f.match(/-SUMMARY\.md$/i)).length;
    }
  }

  const percent: number = totalPlans > 0 ? Math.round((totalSummaries / totalPlans) * 100) : 0;
  const barWidth = 10;
  const filled: number = Math.round((percent / 100) * barWidth);
  const bar: string = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
  const progressStr = `[${bar}] ${percent}%`;

  const progressPattern = /(\*\*Progress:\*\*\s*).*/i;
  if (progressPattern.test(content)) {
    content = content.replace(progressPattern, `$1${progressStr}`);
    writeStateFile(statePath, content);
    output(
      {
        updated: true,
        percent,
        completed: totalSummaries,
        total: totalPlans,
        bar: progressStr,
      },
      raw,
      progressStr
    );
  } else {
    output({ updated: false, reason: 'Progress field not found in STATE.md' }, raw, 'false');
  }
}

/**
 * CLI command: Add a decision entry to the Decisions section in STATE.md.
 * @param cwd - Project working directory
 * @param options - Decision options including summary and optional phase/rationale
 * @param raw - Output raw text instead of JSON
 */
function cmdStateAddDecision(cwd: string, options: AddDecisionOptions, raw: boolean): void {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  const { phase, summary, rationale } = options;
  if (!summary) {
    output({ error: 'summary required' }, raw);
    return;
  }

  let content: string;
  try {
    content = readStateFile(statePath);
  } catch {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }
  const entry = `- [Phase ${phase || '?'}]: ${summary}${rationale ? ` \u2014 ${rationale}` : ''}`;

  // Find Decisions section (various heading patterns)
  const sectionPattern =
    /(###?\s*(?:Decisions|Decisions Made|Accumulated.*Decisions)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match: RegExpMatchArray | null = content.match(sectionPattern);

  if (match) {
    let sectionBody: string = match[2];
    // Remove placeholders
    sectionBody = sectionBody
      .replace(/None yet\.?\s*\n?/gi, '')
      .replace(/No decisions yet\.?\s*\n?/gi, '');
    sectionBody = sectionBody.trimEnd() + '\n' + entry + '\n';
    content = content.replace(sectionPattern, `${match[1]}${sectionBody}`);
    writeStateFile(statePath, content);
    output({ added: true, decision: entry }, raw, 'true');
  } else {
    output({ added: false, reason: 'Decisions section not found in STATE.md' }, raw, 'false');
  }
}

/**
 * CLI command: Add a blocker entry to the Blockers section in STATE.md.
 * @param cwd - Project working directory
 * @param text - Blocker description text
 * @param raw - Output raw text instead of JSON
 */
function cmdStateAddBlocker(cwd: string, text: string, raw: boolean): void {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  if (!text) {
    output({ error: 'text required' }, raw);
    return;
  }

  let content: string;
  try {
    content = readStateFile(statePath);
  } catch {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }
  const entry = `- ${text}`;

  const sectionPattern =
    /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match: RegExpMatchArray | null = content.match(sectionPattern);

  if (match) {
    let sectionBody: string = match[2];
    sectionBody = sectionBody.replace(/None\.?\s*\n?/gi, '').replace(/None yet\.?\s*\n?/gi, '');
    sectionBody = sectionBody.trimEnd() + '\n' + entry + '\n';
    content = content.replace(sectionPattern, `${match[1]}${sectionBody}`);
    writeStateFile(statePath, content);
    output({ added: true, blocker: text }, raw, 'true');
  } else {
    output({ added: false, reason: 'Blockers section not found in STATE.md' }, raw, 'false');
  }
}

/**
 * CLI command: Remove a matching blocker entry from the Blockers section in STATE.md.
 * @param cwd - Project working directory
 * @param text - Text to match against existing blocker entries (case-insensitive)
 * @param raw - Output raw text instead of JSON
 */
function cmdStateResolveBlocker(cwd: string, text: string, raw: boolean): void {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  if (!text) {
    output({ error: 'text required' }, raw);
    return;
  }

  let content: string;
  try {
    content = readStateFile(statePath);
  } catch {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }

  const sectionPattern =
    /(###?\s*(?:Blockers|Blockers\/Concerns|Concerns)\s*\n)([\s\S]*?)(?=\n###?|\n##[^#]|$)/i;
  const match: RegExpMatchArray | null = content.match(sectionPattern);

  if (match) {
    const sectionBody: string = match[2];
    const lines: string[] = sectionBody.split('\n');
    const filtered: string[] = lines.filter((line: string) => {
      if (!line.startsWith('- ')) return true;
      return !line.toLowerCase().includes(text.toLowerCase());
    });

    let newBody: string = filtered.join('\n');
    // If section is now empty, add placeholder
    if (!newBody.trim() || !newBody.includes('- ')) {
      newBody = 'None\n';
    }

    content = content.replace(sectionPattern, `${match[1]}${newBody}`);
    writeStateFile(statePath, content);
    output({ resolved: true, blocker: text }, raw, 'true');
  } else {
    output({ resolved: false, reason: 'Blockers section not found in STATE.md' }, raw, 'false');
  }
}

/**
 * CLI command: Update session continuity fields in STATE.md.
 * @param cwd - Project working directory
 * @param options - Session options (stopped_at, resume_file)
 * @param raw - Output raw text instead of JSON
 */
function cmdStateRecordSession(
  cwd: string,
  options: RecordSessionOptions,
  raw: boolean
): void {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  let content: string;
  try {
    content = readStateFile(statePath);
  } catch {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }
  const now: string = new Date().toISOString();
  const updated: string[] = [];

  // Update Last session / Last Date
  let result: string | null = stateReplaceField(content, 'Last session', now);
  if (result) {
    content = result;
    updated.push('Last session');
  }
  result = stateReplaceField(content, 'Last Date', now);
  if (result) {
    content = result;
    updated.push('Last Date');
  }

  // Update Stopped at
  if (options.stopped_at) {
    result = stateReplaceField(content, 'Stopped At', options.stopped_at);
    if (!result) result = stateReplaceField(content, 'Stopped at', options.stopped_at);
    if (result) {
      content = result;
      updated.push('Stopped At');
    }
  }

  // Update Resume file
  const resumeFile: string = options.resume_file || 'None';
  result = stateReplaceField(content, 'Resume File', resumeFile);
  if (!result) result = stateReplaceField(content, 'Resume file', resumeFile);
  if (result) {
    content = result;
    updated.push('Resume File');
  }

  if (updated.length > 0) {
    writeStateFile(statePath, content);
    output({ recorded: true, updated }, raw, 'true');
  } else {
    output({ recorded: false, reason: 'No session fields found in STATE.md' }, raw, 'false');
  }
}

// ─── State Snapshot ──────────────────────────────────────────────────────────

/**
 * CLI command: Parse STATE.md into a structured JSON snapshot with all fields, decisions, and blockers.
 * @param cwd - Project working directory
 * @param raw - Output raw text instead of JSON
 * @param opts - Options (e.g., since timestamp for diff)
 */
function cmdStateSnapshot(cwd: string, raw: boolean, opts?: SnapshotOptions): void {
  const options: SnapshotOptions = opts || {};
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');

  let content: string;
  try {
    content = readStateFile(statePath);
  } catch {
    output({ error: 'STATE.md not found' }, raw);
    return;
  }

  // Helper to extract **Field:** value patterns
  const extractField = (fieldName: string): string | null => {
    const pattern = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`, 'i');
    const match = content.match(pattern);
    return match ? match[1].trim() : null;
  };

  // Extract basic fields -- support both "Active phase" and legacy "Current Phase" formats
  let currentPhase: string | null =
    extractField('Active phase') || extractField('Current Phase');
  let currentPhaseName: string | null = extractField('Current Phase Name');
  let totalPhasesRaw: string | null = extractField('Total Phases');

  // Parse "Active phase" format: "Phase N of M (Name)" or "N (slug) -- STATUS"
  if (currentPhase) {
    const activePhaseMatch: RegExpMatchArray | null = currentPhase.match(
      /Phase\s+(\d+)\s+of\s+(\d+)\s*(?:\(([^)]+)\))?/i
    );
    if (activePhaseMatch) {
      currentPhase = activePhaseMatch[1];
      if (!totalPhasesRaw) totalPhasesRaw = activePhaseMatch[2];
      if (!currentPhaseName && activePhaseMatch[3]) currentPhaseName = activePhaseMatch[3];
    }
  }

  const currentPlan: string | null =
    extractField('Current plan') || extractField('Current Plan');
  const totalPlansRaw: string | null = extractField('Total Plans in Phase');
  const status: string | null = extractField('Status');
  const progressRaw: string | null = extractField('Progress');
  const lastActivity: string | null = extractField('Last Activity');
  const lastActivityDesc: string | null = extractField('Last Activity Description');
  const pausedAt: string | null = extractField('Paused At');

  // Parse numeric fields
  const totalPhases: number | null = totalPhasesRaw ? parseInt(totalPhasesRaw, 10) : null;
  const totalPlansInPhase: number | null = totalPlansRaw
    ? parseInt(totalPlansRaw, 10)
    : null;
  const progressPercent: number | null = progressRaw
    ? parseInt(progressRaw.replace('%', ''), 10)
    : null;

  // Extract decisions table
  const decisions: DecisionEntry[] = [];
  const decisionsMatch: RegExpMatchArray | null = content.match(
    /##\s*Decisions Made[\s\S]*?\n\|[^\n]+\n\|[-|\s]+\n([\s\S]*?)(?=\n##|\n$|$)/i
  );
  if (decisionsMatch) {
    const tableBody: string = decisionsMatch[1];
    const rows: string[] = tableBody
      .trim()
      .split('\n')
      .filter((r: string) => r.includes('|'));
    for (const row of rows) {
      const cells: string[] = row
        .split('|')
        .map((c: string) => c.trim())
        .filter(Boolean);
      if (cells.length >= 3) {
        decisions.push({
          phase: cells[0],
          summary: cells[1],
          rationale: cells[2],
        });
      }
    }
  }

  // Extract blockers list
  const blockers: string[] = [];
  const blockersMatch: RegExpMatchArray | null = content.match(
    /##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i
  );
  if (blockersMatch) {
    const blockersSection: string = blockersMatch[1];
    const items: RegExpMatchArray | null = blockersSection.match(/^-\s+(.+)$/gm);
    if (items) {
      for (const item of items) {
        blockers.push(item.replace(/^-\s+/, '').trim());
      }
    }
  }

  // Extract session info
  const session: SessionInfo = {
    last_date: null,
    stopped_at: null,
    resume_file: null,
  };

  const sessionMatch: RegExpMatchArray | null = content.match(
    /##\s*Session\s*\n([\s\S]*?)(?=\n##|$)/i
  );
  if (sessionMatch) {
    const sessionSection: string = sessionMatch[1];
    const lastDateMatch: RegExpMatchArray | null = sessionSection.match(
      /\*\*Last Date:\*\*\s*(.+)/i
    );
    const stoppedAtMatch: RegExpMatchArray | null = sessionSection.match(
      /\*\*Stopped At:\*\*\s*(.+)/i
    );
    const resumeFileMatch: RegExpMatchArray | null = sessionSection.match(
      /\*\*Resume File:\*\*\s*(.+)/i
    );

    if (lastDateMatch) session.last_date = lastDateMatch[1].trim();
    if (stoppedAtMatch) session.stopped_at = stoppedAtMatch[1].trim();
    if (resumeFileMatch) session.resume_file = resumeFileMatch[1].trim();
  }

  const result: StateSnapshotResult = {
    current_phase: currentPhase,
    current_phase_name: currentPhaseName,
    total_phases: totalPhases,
    current_plan: currentPlan,
    total_plans_in_phase: totalPlansInPhase,
    status,
    progress_percent: progressPercent,
    last_activity: lastActivity,
    last_activity_desc: lastActivityDesc,
    decisions,
    blockers,
    paused_at: pausedAt,
    session,
  };

  // Save snapshot to .planning/.snapshots/ directory
  const snapshotsDir: string = path.join(cwd, '.planning', '.snapshots');
  try {
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const ts: string = new Date().toISOString();
    const snapshotData: SnapshotData = {
      current_phase: currentPhase,
      status,
      decisions,
      blockers,
    };
    fs.writeFileSync(
      path.join(snapshotsDir, `${ts}.json`),
      JSON.stringify(snapshotData),
      'utf-8'
    );
  } catch {
    // Non-blocking: snapshot save failure doesn't break the command
  }

  // --since diff mode: compare current state to saved snapshot
  if (options.since) {
    const baselinePath: string = path.join(snapshotsDir, `${options.since}.json`);
    let baseline: SnapshotData;
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as SnapshotData;
    } catch {
      output(
        { error: `No snapshot found for timestamp: ${options.since}`, full_snapshot: result },
        raw
      );
      return;
    }

    // Compute changed scalar fields
    const changed_fields: Record<string, { from: string | null; to: string | null }> = {};
    const scalarKeys = ['current_phase', 'status'] as const;
    for (const key of scalarKeys) {
      const cur = result[key];
      const base = baseline[key];
      if (cur !== base) {
        changed_fields[key] = { from: base ?? null, to: cur ?? null };
      }
    }

    // Compute new decisions (in current but not in baseline)
    const baseDecisionSet: Set<string> = new Set(
      (baseline.decisions || []).map((d: DecisionEntry) => `${d.phase}|${d.summary}`)
    );
    const new_decisions: DecisionEntry[] = (result.decisions || []).filter(
      (d: DecisionEntry) => !baseDecisionSet.has(`${d.phase}|${d.summary}`)
    );

    // Compute new/resolved blockers
    const baseBlockerSet: Set<string> = new Set(baseline.blockers || []);
    const curBlockerSet: Set<string> = new Set(result.blockers || []);
    const new_blockers: string[] = (result.blockers || []).filter(
      (b: string) => !baseBlockerSet.has(b)
    );
    const resolved_blockers: string[] = (baseline.blockers || []).filter(
      (b: string) => !curBlockerSet.has(b)
    );

    const has_changes: boolean =
      Object.keys(changed_fields).length > 0 ||
      new_decisions.length > 0 ||
      new_blockers.length > 0 ||
      resolved_blockers.length > 0;

    const diffResult: SnapshotDiff = {
      since: options.since,
      changed_fields,
      new_decisions,
      new_blockers,
      resolved_blockers,
      has_changes,
    };

    output(diffResult, raw);
    return;
  }

  output(
    result,
    raw,
    `Phase ${result.current_phase || 'none'} (${result.status || 'unknown'}) - ${result.progress_percent}%`
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Internal helpers (exported for testing)
  stateExtractField,
  stateReplaceField,
  // Command functions
  cmdStateLoad,
  cmdStateGet,
  cmdStatePatch,
  cmdStateUpdate,
  cmdStateAdvancePlan,
  cmdStateRecordMetric,
  cmdStateUpdateProgress,
  cmdStateAddDecision,
  cmdStateAddBlocker,
  cmdStateResolveBlocker,
  cmdStateRecordSession,
  cmdStateSnapshot,
};
