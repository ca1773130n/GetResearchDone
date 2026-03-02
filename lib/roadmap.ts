/**
 * GRD Roadmap Operations -- ROADMAP.md parsing, phase queries, schedule computation
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.ts (safeReadFile, normalizePhaseName, stripShippedSections, output, error)
 * Depends on: lib/paths.ts (phasesDir)
 * Depends on: lib/frontmatter.js (extractFrontmatter)
 */

'use strict';

// Type-only import to establish module scope (no runtime effect)
import type {} from './types';

const fs = require('fs');
const path = require('path');
const {
  safeReadFile,
  safeReadMarkdown,
  normalizePhaseName,
  stripShippedSections,
  output,
  error,
} = require('./utils');
const { phasesDir: getPhasesDirPath } = require('./paths');

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Parsed milestone from ROADMAP.md with optional start/target dates.
 */
interface ParsedMilestone {
  version: string;
  heading: string;
  start: string | null;
  target: string | null;
}

/**
 * Internal milestone position for schedule computation.
 */
interface MilestonePosition {
  version: string;
  heading: string;
  index: number;
  start: string | null;
}

/**
 * A phase entry with schedule dates computed from milestone start + duration.
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
 * Internal phase parsed from ROADMAP.md before schedule computation.
 */
interface ParsedPhase {
  number: string;
  name: string;
  duration_days: number;
  milestone: string | null;
  start_date?: string | null;
  due_date?: string | null;
}

/**
 * Result of computeSchedule() with milestone and phase schedules.
 */
interface ScheduleResult {
  milestones: ParsedMilestone[];
  phases: PhaseScheduleEntry[];
}

/**
 * Milestone heading info returned by analyzeRoadmap.
 */
interface AnalyzedMilestone {
  heading: string;
  version: string;
}

/**
 * Phase analysis entry returned by analyzeRoadmap with disk status and metadata.
 */
interface AnalyzedPhaseEntry {
  number: string;
  name: string;
  goal: string | null;
  depends_on: string | null;
  plan_count: number;
  summary_count: number;
  has_context: boolean;
  has_research: boolean;
  disk_status: string;
  roadmap_complete: boolean;
  line: number;
  warnings: string[];
  duration_days: number;
  start_date: string | null;
  due_date: string | null;
  _duration_days?: number;
  _milestone?: string | null;
}

/**
 * Full roadmap analysis result returned by analyzeRoadmap().
 */
interface AnalyzedRoadmap {
  error?: string;
  milestones: AnalyzedMilestone[];
  phases: AnalyzedPhaseEntry[];
  phase_count: number;
  completed_phases: number;
  total_plans: number;
  total_summaries: number;
  progress_percent: number;
  current_phase: string | null;
  next_phase: string | null;
}

// ─── Schedule Helpers ───────────────────────────────────────────────────────

/**
 * Format a Date object as a YYYY-MM-DD string.
 * @param date - Date object to format
 * @returns Date formatted as 'YYYY-MM-DD'
 */
function formatScheduleDate(date: Date): string {
  const y: number = date.getFullYear();
  const m: string = String(date.getMonth() + 1).padStart(2, '0');
  const d: string = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Add N days to a Date, returning a new Date object.
 * @param date - Starting date
 * @param days - Number of days to add
 * @returns New Date object with the days added
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Compute milestone and phase schedule from ROADMAP.md durations and start dates.
 * @param cwd - Project working directory
 * @returns Schedule with computed start/due dates per phase
 */
function computeSchedule(cwd: string): ScheduleResult {
  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  const configPath: string = path.join(cwd, '.planning', 'config.json');
  const roadmapContent: string | null = safeReadMarkdown(roadmapPath);
  if (!roadmapContent) return { milestones: [], phases: [] };
  const activeContent: string = stripShippedSections(roadmapContent);

  // Read default_duration_days from config
  let defaultDuration = 7;
  const configRaw: string | null = safeReadFile(configPath);
  if (configRaw) {
    try {
      const config = JSON.parse(configRaw) as Record<string, unknown>;
      const tracker = config.tracker as Record<string, unknown> | undefined;
      const mcp = tracker && (tracker.mcp_atlassian as Record<string, unknown> | undefined);
      if (mcp && mcp.default_duration_days) {
        defaultDuration = parseInt(String(mcp.default_duration_days), 10) || 7;
      }
    } catch {
      // Invalid JSON config; use default duration
    }
  }

  // Parse milestones with Start/Target dates
  const milestoneRegex = /^##\s*(.*v(\d+\.\d+(?:\.\d+)?)[^(\n]*)/gim;
  const milestones: ParsedMilestone[] = [];
  const milestonePositions: MilestonePosition[] = [];
  let mMatch: RegExpExecArray | null;
  while ((mMatch = milestoneRegex.exec(activeContent)) !== null) {
    const heading: string = mMatch[1].trim();
    const version = 'v' + mMatch[2];
    const afterHeading: string = activeContent.slice(mMatch.index, mMatch.index + 500);
    const startMatch: RegExpMatchArray | null = afterHeading.match(
      /\*\*Start:\*\*\s*(\d{4}-\d{2}-\d{2})/
    );
    const targetMatch: RegExpMatchArray | null = afterHeading.match(
      /\*\*Target:\*\*\s*(\d{4}-\d{2}-\d{2})/
    );
    milestones.push({
      version,
      heading,
      start: startMatch ? startMatch[1] : null,
      target: targetMatch ? targetMatch[1] : null,
    });
    milestonePositions.push({
      version,
      heading,
      index: mMatch.index,
      start: startMatch ? startMatch[1] : null,
    });
  }

  // Parse phases with Duration
  const phaseRegex = /#{2,}\s*Phase\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  const phases: ParsedPhase[] = [];
  let pMatch: RegExpExecArray | null;
  while ((pMatch = phaseRegex.exec(activeContent)) !== null) {
    const number: string = pMatch[1];
    const name: string = pMatch[2].replace(/\(INSERTED\)/i, '').trim();
    // Extract section text up to the next heading (or end of content).
    // Use [ \t] instead of \s so we don't accidentally match \n##\n sequences.
    const sectionStart: number = pMatch.index;
    const restContent: string = activeContent.slice(sectionStart + pMatch[0].length);
    const nextHeading: RegExpMatchArray | null = restContent.match(/\n#{2,}[ \t]/);
    const sectionText: string = nextHeading
      ? activeContent.slice(sectionStart, sectionStart + pMatch[0].length + (nextHeading.index as number))
      : activeContent.slice(sectionStart);
    const durationMatch: RegExpMatchArray | null = sectionText.match(
      /\*\*Duration:\*\*\s*(\d+)d/
    );
    const durationDays: number = durationMatch ? parseInt(durationMatch[1], 10) : defaultDuration;

    // Determine milestone
    let milestone: string | null =
      milestonePositions.length > 0 ? milestonePositions[0].version : null;
    for (const ms of milestonePositions) {
      if (pMatch.index > ms.index) milestone = ms.version;
    }

    phases.push({ number, name, duration_days: durationDays, milestone });
  }

  // Compute dates per milestone group
  const milestoneStartMap: Record<string, string> = {};
  for (const ms of milestonePositions) {
    if (ms.start) milestoneStartMap[ms.version] = ms.start;
  }

  let currentDate: Date | null = null;
  let currentMilestone: string | null = null;
  for (const phase of phases) {
    if (phase.milestone !== currentMilestone) {
      currentMilestone = phase.milestone;
      const msStart: string | undefined = currentMilestone
        ? milestoneStartMap[currentMilestone]
        : undefined;
      currentDate = msStart ? new Date(msStart + 'T00:00:00') : null;
    }
    if (currentDate) {
      phase.start_date = formatScheduleDate(currentDate);
      const endDate: Date = addDays(currentDate, phase.duration_days - 1);
      phase.due_date = formatScheduleDate(endDate);
      currentDate = addDays(endDate, 1); // next phase starts day after
    } else {
      phase.start_date = null;
      phase.due_date = null;
    }
  }

  return {
    milestones,
    phases: phases as PhaseScheduleEntry[],
  };
}

/**
 * Look up a phase schedule entry by phase number.
 * @param schedule - Schedule object from computeSchedule
 * @param phaseNum - Phase number to look up
 * @returns Phase schedule entry with start_date, due_date, duration_days, or null
 */
function getScheduleForPhase(
  schedule: ScheduleResult,
  phaseNum: string | number
): PhaseScheduleEntry | null {
  const num: string = String(phaseNum);
  return schedule.phases.find((p: PhaseScheduleEntry) => p.number === num) || null;
}

/**
 * Look up a milestone schedule entry by version string.
 * @param schedule - Schedule object from computeSchedule
 * @param version - Milestone version to look up (e.g., 'v1.0')
 * @returns Milestone schedule entry with start and target dates, or null
 */
function getScheduleForMilestone(
  schedule: ScheduleResult,
  version: string
): ParsedMilestone | null {
  return schedule.milestones.find((m: ParsedMilestone) => m.version === version) || null;
}

// ─── Roadmap Commands ───────────────────────────────────────────────────────

/**
 * CLI command: Get phase info (name, goal, full section text) from ROADMAP.md.
 * @param cwd - Project working directory
 * @param phaseNum - Phase number to look up
 * @param raw - Output raw section text instead of JSON
 */
function cmdRoadmapGetPhase(cwd: string, phaseNum: string, raw: boolean): void {
  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    output({ found: false, error: 'ROADMAP.md not found' }, raw, '');
    return;
  }

  try {
    const content: string | null = safeReadMarkdown(roadmapPath);
    if (!content) {
      output({ found: false, error: 'ROADMAP.md could not be read' }, raw, '');
      return;
    }
    const activeContent: string = stripShippedSections(content);

    // Escape special regex chars in phase number, handle decimal
    const escapedPhase: string = phaseNum.replace(/\./g, '\\.');

    // Match "## Phase X:" or "### Phase X.Y:" with optional name
    const phasePattern = new RegExp(`#{2,}\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`, 'i');
    const headerMatch: RegExpMatchArray | null = activeContent.match(phasePattern);

    if (!headerMatch) {
      output({ found: false, phase_number: phaseNum }, raw, '');
      return;
    }

    const phaseName: string = headerMatch[1].trim();
    const headerIndex: number = headerMatch.index as number;

    // Find the end of this section (next ### or end of file)
    const restOfContent: string = activeContent.slice(headerIndex);
    const nextHeaderMatch: RegExpMatchArray | null = restOfContent.match(
      /\n#{2,}\s+Phase\s+\d/i
    );
    const sectionEnd: number = nextHeaderMatch
      ? headerIndex + (nextHeaderMatch.index as number)
      : activeContent.length;

    const section: string = activeContent.slice(headerIndex, sectionEnd).trim();

    // Extract goal if present
    const goalMatch: RegExpMatchArray | null = section.match(
      /\*\*Goal:?\*\*:?\s*([^\n]+)/i
    );
    const goal: string | null = goalMatch ? goalMatch[1].trim() : null;

    output(
      {
        found: true,
        phase_number: phaseNum,
        phase_name: phaseName,
        goal,
        section,
      },
      raw,
      section
    );
  } catch (e: unknown) {
    error('Failed to read ROADMAP.md: ' + (e as Error).message);
  }
}

// ─── Phase Next Decimal ─────────────────────────────────────────────────────

/**
 * CLI command: Compute the next available decimal phase number for insertion.
 * @param cwd - Project working directory
 * @param basePhase - Base phase number to find next decimal for (e.g., '06')
 * @param raw - Output raw next decimal string instead of JSON
 */
function cmdPhaseNextDecimal(cwd: string, basePhase: string, raw: boolean): void {
  const phasesDir: string = getPhasesDirPath(cwd);
  const normalized: string = normalizePhaseName(basePhase);

  // Check if phases directory exists
  if (!fs.existsSync(phasesDir)) {
    output(
      {
        found: false,
        base_phase: normalized,
        next: `${normalized}.1`,
        existing: [],
      },
      raw,
      `${normalized}.1`
    );
    return;
  }

  try {
    const entries: Array<{ isDirectory: () => boolean; name: string }> = fs.readdirSync(
      phasesDir,
      { withFileTypes: true }
    );
    const dirs: string[] = entries
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name);

    // Check if base phase exists
    const baseExists: boolean = dirs.some(
      (d: string) => d.startsWith(normalized + '-') || d === normalized
    );

    // Find existing decimal phases for this base
    const decimalPattern = new RegExp(`^${normalized}\\.(\\d+)`);
    const existingDecimals: string[] = [];

    for (const dir of dirs) {
      const match: RegExpMatchArray | null = dir.match(decimalPattern);
      if (match) {
        existingDecimals.push(`${normalized}.${match[1]}`);
      }
    }

    // Sort numerically
    existingDecimals.sort((a: string, b: string) => {
      const aNum: number = parseFloat(a);
      const bNum: number = parseFloat(b);
      return aNum - bNum;
    });

    // Calculate next decimal
    let nextDecimal: string;
    if (existingDecimals.length === 0) {
      nextDecimal = `${normalized}.1`;
    } else {
      const lastDecimal: string = existingDecimals[existingDecimals.length - 1];
      const lastNum: number = parseInt(lastDecimal.split('.')[1], 10);
      nextDecimal = `${normalized}.${lastNum + 1}`;
    }

    output(
      {
        found: baseExists,
        base_phase: normalized,
        next: nextDecimal,
        existing: existingDecimals,
      },
      raw,
      nextDecimal
    );
  } catch (e: unknown) {
    error('Failed to calculate next decimal phase: ' + (e as Error).message);
  }
}

// ─── Roadmap Analyze ────────────────────────────────────────────────────────

/**
 * Analyze the full roadmap structure with disk status, schedule, and progress.
 * Returns the result object directly without calling output() or process.exit().
 * Used internally by cmdRoadmapAnalyze and by dependency analysis (lib/deps.js).
 * @param cwd - Project working directory
 * @returns Roadmap analysis with milestones, phases, progress, etc.
 */
function analyzeRoadmap(cwd: string): AnalyzedRoadmap {
  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    return {
      error: 'ROADMAP.md not found',
      milestones: [],
      phases: [],
      phase_count: 0,
      completed_phases: 0,
      total_plans: 0,
      total_summaries: 0,
      progress_percent: 0,
      current_phase: null,
      next_phase: null,
    };
  }

  const content: string | null = safeReadMarkdown(roadmapPath);
  if (!content) {
    return {
      error: 'ROADMAP.md could not be read',
      milestones: [],
      phases: [],
      phase_count: 0,
      completed_phases: 0,
      total_plans: 0,
      total_summaries: 0,
      progress_percent: 0,
      current_phase: null,
      next_phase: null,
    };
  }
  const activeContent: string = stripShippedSections(content);
  const phasesDir: string = getPhasesDirPath(cwd);

  // Read default_duration_days from config (same logic as computeSchedule, no re-read needed).
  let defaultDuration = 7;
  const configPath: string = path.join(cwd, '.planning', 'config.json');
  const configRaw: string | null = safeReadFile(configPath);
  if (configRaw) {
    try {
      const config = JSON.parse(configRaw) as Record<string, unknown>;
      const tracker = config.tracker as Record<string, unknown> | undefined;
      const mcp = tracker && (tracker.mcp_atlassian as Record<string, unknown> | undefined);
      if (mcp && mcp.default_duration_days) {
        defaultDuration = parseInt(String(mcp.default_duration_days), 10) || 7;
      }
    } catch {
      // Invalid JSON config; use default duration
    }
  }

  // Parse milestone positions with Start dates from activeContent (already in memory).
  const milestoneRegexLocal = /^##\s*(.*v(\d+\.\d+(?:\.\d+)?)[^(\n]*)/gim;
  const milestonePositions: MilestonePosition[] = [];
  let mMatchLocal: RegExpExecArray | null;
  while ((mMatchLocal = milestoneRegexLocal.exec(activeContent)) !== null) {
    const version = 'v' + mMatchLocal[2];
    const heading: string = mMatchLocal[1].trim();
    const afterHeading: string = activeContent.slice(
      mMatchLocal.index,
      mMatchLocal.index + 500
    );
    const startMatch: RegExpMatchArray | null = afterHeading.match(
      /\*\*Start:\*\*\s*(\d{4}-\d{2}-\d{2})/
    );
    milestonePositions.push({
      version,
      heading,
      index: mMatchLocal.index,
      start: startMatch ? startMatch[1] : null,
    });
  }

  // Read phases directory once before the loop to avoid N repeated readdirSync calls.
  let phasesDirNames: string[] = [];
  try {
    const phasesDirEntries: Array<{ isDirectory: () => boolean; name: string }> =
      fs.readdirSync(phasesDir, { withFileTypes: true });
    phasesDirNames = phasesDirEntries
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name);
  } catch (dirErr: unknown) {
    const err = dirErr as { code?: string; message?: string } | null;
    if (err && err.code && err.code !== 'ENOENT') {
      process.stderr.write(
        `[roadmap] phases directory read error (${err.code}): ${err.message}\n`
      );
    }
  }

  // Extract all phase headings: ## Phase N: Name or ### Phase N: Name
  const phasePattern = /#{2,}\s*Phase\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  const phases: AnalyzedPhaseEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = phasePattern.exec(activeContent)) !== null) {
    const phaseNum: string = match[1];
    const phaseName: string = match[2].replace(/\(INSERTED\)/i, '').trim();

    // Compute line number of heading in ROADMAP.md
    const lineNumber: number = activeContent.substring(0, match.index).split('\n').length;

    // Extract goal from the section
    const sectionStart: number = match.index;
    const restOfContent: string = activeContent.slice(sectionStart);
    const nextHeader: RegExpMatchArray | null = restOfContent.match(
      /\n#{2,}\s+Phase\s+\d/i
    );
    const sectionEnd: number = nextHeader
      ? sectionStart + (nextHeader.index as number)
      : activeContent.length;
    const section: string = activeContent.slice(sectionStart, sectionEnd);

    const goalMatch: RegExpMatchArray | null = section.match(
      /\*\*Goal:?\*\*:?\s*([^\n]+)/i
    );
    const goal: string | null = goalMatch ? goalMatch[1].trim() : null;

    const dependsMatch: RegExpMatchArray | null = section.match(
      /\*\*Depends on:?\*\*:?\s*([^\n]+)/i
    );
    const depends_on: string | null = dependsMatch ? dependsMatch[1].trim() : null;

    // Extract duration for schedule computation (reuse the already-sliced section text).
    const durationMatch: RegExpMatchArray | null = section.match(
      /\*\*Duration:\*\*\s*(\d+)d/
    );
    const durationDays: number = durationMatch
      ? parseInt(durationMatch[1], 10)
      : defaultDuration;

    // Determine which milestone this phase belongs to.
    let phaseMilestone: string | null =
      milestonePositions.length > 0 ? milestonePositions[0].version : null;
    for (const ms of milestonePositions) {
      if (match.index > ms.index) phaseMilestone = ms.version;
    }

    // Build warnings array
    const warnings: string[] = [];
    if (!goal) {
      warnings.push(`Phase ${phaseNum} (line ${lineNumber}): missing goal`);
    }

    // Check completion on disk
    const normalized: string = normalizePhaseName(phaseNum);
    let diskStatus = 'no_directory';
    let planCount = 0;
    let summaryCount = 0;
    let hasContext = false;
    let hasResearch = false;

    try {
      const dirMatch: string | undefined = phasesDirNames.find(
        (d: string) => d.startsWith(normalized + '-') || d === normalized
      );

      if (dirMatch) {
        const phaseFiles: string[] = fs.readdirSync(path.join(phasesDir, dirMatch));
        planCount = phaseFiles.filter(
          (f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md'
        ).length;
        summaryCount = phaseFiles.filter(
          (f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md'
        ).length;
        hasContext = phaseFiles.some(
          (f: string) => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md'
        );
        hasResearch = phaseFiles.some(
          (f: string) => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md'
        );

        if (summaryCount >= planCount && planCount > 0) diskStatus = 'complete';
        else if (summaryCount > 0) diskStatus = 'partial';
        else if (planCount > 0) diskStatus = 'planned';
        else if (hasResearch) diskStatus = 'researched';
        else if (hasContext) diskStatus = 'discussed';
        else diskStatus = 'empty';
      }
    } catch (scanErr: unknown) {
      const err = scanErr as { code?: string; message?: string } | null;
      if (err && err.code && err.code !== 'ENOENT') {
        process.stderr.write(
          `[roadmap] phase directory scan error (${err.code}): ${err.message}\n`
        );
      }
    }

    // Check ROADMAP checkbox status
    const checkboxPattern = new RegExp(
      `-\\s*\\[(x| )\\]\\s*.*Phase\\s+${phaseNum.replace('.', '\\.')}`,
      'i'
    );
    const checkboxMatch: RegExpMatchArray | null = activeContent.match(checkboxPattern);
    const roadmapComplete: boolean = checkboxMatch ? checkboxMatch[1] === 'x' : false;

    phases.push({
      number: phaseNum,
      name: phaseName,
      goal,
      depends_on,
      plan_count: planCount,
      summary_count: summaryCount,
      has_context: hasContext,
      has_research: hasResearch,
      disk_status: diskStatus,
      roadmap_complete: roadmapComplete,
      line: lineNumber,
      warnings,
      _duration_days: durationDays,
      _milestone: phaseMilestone,
      duration_days: durationDays,
      start_date: null,
      due_date: null,
    });
  }

  // Build milestones array from already-parsed positions -- no second regex pass needed.
  // Only heading and version to preserve the original analyzeRoadmap output shape.
  const milestones: AnalyzedMilestone[] = milestonePositions.map(
    (ms: MilestonePosition) => ({ heading: ms.heading, version: ms.version })
  );

  // Compute dates inline using already-parsed milestone positions -- no second parse needed.
  const milestoneStartMap: Record<string, string> = {};
  for (const ms of milestonePositions) {
    if (ms.start) milestoneStartMap[ms.version] = ms.start;
  }
  let currentDate: Date | null = null;
  let currentMilestone: string | null = null;
  for (const phase of phases) {
    if (phase._milestone !== currentMilestone) {
      currentMilestone = phase._milestone ?? null;
      const msStart: string | undefined = currentMilestone
        ? milestoneStartMap[currentMilestone]
        : undefined;
      currentDate = msStart ? new Date(msStart + 'T00:00:00') : null;
    }
    phase.duration_days = phase._duration_days as number;
    if (currentDate) {
      phase.start_date = formatScheduleDate(currentDate);
      const endDate: Date = addDays(currentDate, phase._duration_days as number);
      phase.due_date = formatScheduleDate(endDate);
      currentDate = addDays(endDate, 1);
    } else {
      phase.start_date = null;
      phase.due_date = null;
    }
    delete phase._duration_days;
    delete phase._milestone;
  }

  // Find current and next phase
  const currentPhaseEntry: AnalyzedPhaseEntry | undefined = phases.find(
    (p: AnalyzedPhaseEntry) => p.disk_status === 'planned' || p.disk_status === 'partial'
  );
  const nextPhase: AnalyzedPhaseEntry | undefined = phases.find(
    (p: AnalyzedPhaseEntry) =>
      p.disk_status === 'empty' ||
      p.disk_status === 'no_directory' ||
      p.disk_status === 'discussed' ||
      p.disk_status === 'researched'
  );

  // Aggregated stats
  const totalPlans: number = phases.reduce(
    (sum: number, p: AnalyzedPhaseEntry) => sum + p.plan_count,
    0
  );
  const totalSummaries: number = phases.reduce(
    (sum: number, p: AnalyzedPhaseEntry) => sum + p.summary_count,
    0
  );
  const completedPhases: number = phases.filter(
    (p: AnalyzedPhaseEntry) => p.disk_status === 'complete'
  ).length;

  return {
    milestones,
    phases,
    phase_count: phases.length,
    completed_phases: completedPhases,
    total_plans: totalPlans,
    total_summaries: totalSummaries,
    progress_percent: totalPlans > 0 ? Math.round((totalSummaries / totalPlans) * 100) : 0,
    current_phase: currentPhaseEntry ? currentPhaseEntry.number : null,
    next_phase: nextPhase ? nextPhase.number : null,
  };
}

/**
 * CLI command: Analyze the full roadmap structure with disk status, schedule, and progress.
 * Thin wrapper around analyzeRoadmap that outputs the result via output().
 * @param cwd - Project working directory
 * @param raw - Output raw text instead of JSON
 */
function cmdRoadmapAnalyze(cwd: string, raw: boolean): void {
  const result: AnalyzedRoadmap = analyzeRoadmap(cwd);
  output(
    result,
    raw,
    `${result.phase_count} phases, ${result.completed_phases} complete, ${result.progress_percent}% done`
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Schedule helpers (used by tracker code too)
  formatScheduleDate,
  addDays,
  computeSchedule,
  getScheduleForPhase,
  getScheduleForMilestone,
  // Roadmap commands
  cmdRoadmapGetPhase,
  cmdPhaseNextDecimal,
  cmdRoadmapAnalyze,
  // Internal (used by lib/deps.js)
  analyzeRoadmap,
};
