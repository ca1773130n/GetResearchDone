/**
 * GRD Roadmap Operations — ROADMAP.md parsing, phase queries, schedule computation
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.js (safeReadFile, normalizePhaseName, findPhaseInternal, output, error)
 * Depends on: lib/frontmatter.js (extractFrontmatter)
 */

const fs = require('fs');
const path = require('path');
const {
  safeReadFile,
  normalizePhaseName,
  stripShippedSections,
  output,
  error,
} = require('./utils');
const { phasesDir: getPhasesDirPath } = require('./paths');

// ─── Schedule Helpers ───────────────────────────────────────────────────────

/**
 * Format a Date object as a YYYY-MM-DD string.
 * @param {Date} date - Date object to format
 * @returns {string} Date formatted as 'YYYY-MM-DD'
 */
function formatScheduleDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Add N days to a Date, returning a new Date object.
 * @param {Date} date - Starting date
 * @param {number} days - Number of days to add
 * @returns {Date} New Date object with the days added
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Compute milestone and phase schedule from ROADMAP.md durations and start dates.
 * @param {string} cwd - Project working directory
 * @returns {{milestones: Array<Object>, phases: Array<Object>}} Schedule with computed start/due dates per phase
 */
function computeSchedule(cwd) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const configPath = path.join(cwd, '.planning', 'config.json');
  const roadmapContent = safeReadFile(roadmapPath);
  if (!roadmapContent) return { milestones: [], phases: [] };
  const activeContent = stripShippedSections(roadmapContent);

  // Read default_duration_days from config
  let defaultDuration = 7;
  const configRaw = safeReadFile(configPath);
  if (configRaw) {
    try {
      const config = JSON.parse(configRaw);
      const mcp = config.tracker && config.tracker.mcp_atlassian;
      if (mcp && mcp.default_duration_days) {
        defaultDuration = parseInt(mcp.default_duration_days, 10) || 7;
      }
    } catch {}
  }

  // Parse milestones with Start/Target dates
  const milestoneRegex = /^##\s*(.*v(\d+\.\d+(?:\.\d+)?)[^(\n]*)/gim;
  const milestones = [];
  const milestonePositions = [];
  let mMatch;
  while ((mMatch = milestoneRegex.exec(activeContent)) !== null) {
    const heading = mMatch[1].trim();
    const version = 'v' + mMatch[2];
    const afterHeading = activeContent.slice(mMatch.index, mMatch.index + 500);
    const startMatch = afterHeading.match(/\*\*Start:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    const targetMatch = afterHeading.match(/\*\*Target:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    milestones.push({
      version,
      heading,
      start: startMatch ? startMatch[1] : null,
      target: targetMatch ? targetMatch[1] : null,
    });
    milestonePositions.push({
      version,
      index: mMatch.index,
      start: startMatch ? startMatch[1] : null,
    });
  }

  // Parse phases with Duration
  const phaseRegex = /###\s*Phase\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  const phases = [];
  let pMatch;
  while ((pMatch = phaseRegex.exec(activeContent)) !== null) {
    const number = pMatch[1];
    const name = pMatch[2].replace(/\(INSERTED\)/i, '').trim();
    // Extract section text up to the next ### heading (or end of content)
    const sectionStart = pMatch.index;
    const restContent = activeContent.slice(sectionStart + pMatch[0].length);
    const nextHeading = restContent.match(/\n###\s/);
    const sectionText = nextHeading
      ? activeContent.slice(sectionStart, sectionStart + pMatch[0].length + nextHeading.index)
      : activeContent.slice(sectionStart);
    const durationMatch = sectionText.match(/\*\*Duration:\*\*\s*(\d+)d/);
    const durationDays = durationMatch ? parseInt(durationMatch[1], 10) : defaultDuration;

    // Determine milestone
    let milestone = milestonePositions.length > 0 ? milestonePositions[0].version : null;
    for (const ms of milestonePositions) {
      if (pMatch.index > ms.index) milestone = ms.version;
    }

    phases.push({ number, name, duration_days: durationDays, milestone });
  }

  // Compute dates per milestone group
  const milestoneStartMap = {};
  for (const ms of milestonePositions) {
    if (ms.start) milestoneStartMap[ms.version] = ms.start;
  }

  let currentDate = null;
  let currentMilestone = null;
  for (const phase of phases) {
    if (phase.milestone !== currentMilestone) {
      currentMilestone = phase.milestone;
      const msStart = milestoneStartMap[currentMilestone];
      currentDate = msStart ? new Date(msStart + 'T00:00:00') : null;
    }
    if (currentDate) {
      phase.start_date = formatScheduleDate(currentDate);
      const endDate = addDays(currentDate, phase.duration_days - 1);
      phase.due_date = formatScheduleDate(endDate);
      currentDate = addDays(endDate, 1); // next phase starts day after
    } else {
      phase.start_date = null;
      phase.due_date = null;
    }
  }

  return { milestones, phases };
}

/**
 * Look up a phase schedule entry by phase number.
 * @param {Object} schedule - Schedule object from computeSchedule
 * @param {string|number} phaseNum - Phase number to look up
 * @returns {Object|null} Phase schedule entry with start_date, due_date, duration_days, or null
 */
function getScheduleForPhase(schedule, phaseNum) {
  const num = String(phaseNum);
  return schedule.phases.find((p) => p.number === num) || null;
}

/**
 * Look up a milestone schedule entry by version string.
 * @param {Object} schedule - Schedule object from computeSchedule
 * @param {string} version - Milestone version to look up (e.g., 'v1.0')
 * @returns {Object|null} Milestone schedule entry with start and target dates, or null
 */
function getScheduleForMilestone(schedule, version) {
  return schedule.milestones.find((m) => m.version === version) || null;
}

// ─── Roadmap Commands ───────────────────────────────────────────────────────

/**
 * CLI command: Get phase info (name, goal, full section text) from ROADMAP.md.
 * @param {string} cwd - Project working directory
 * @param {string} phaseNum - Phase number to look up
 * @param {boolean} raw - Output raw section text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdRoadmapGetPhase(cwd, phaseNum, raw) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    output({ found: false, error: 'ROADMAP.md not found' }, raw, '');
    return;
  }

  try {
    const content = fs.readFileSync(roadmapPath, 'utf-8');
    const activeContent = stripShippedSections(content);

    // Escape special regex chars in phase number, handle decimal
    const escapedPhase = phaseNum.replace(/\./g, '\\.');

    // Match "### Phase X:" or "### Phase X.Y:" with optional name
    const phasePattern = new RegExp(`###\\s*Phase\\s+${escapedPhase}:\\s*([^\\n]+)`, 'i');
    const headerMatch = activeContent.match(phasePattern);

    if (!headerMatch) {
      output({ found: false, phase_number: phaseNum }, raw, '');
      return;
    }

    const phaseName = headerMatch[1].trim();
    const headerIndex = headerMatch.index;

    // Find the end of this section (next ### or end of file)
    const restOfContent = activeContent.slice(headerIndex);
    const nextHeaderMatch = restOfContent.match(/\n###\s+Phase\s+\d/i);
    const sectionEnd = nextHeaderMatch ? headerIndex + nextHeaderMatch.index : activeContent.length;

    const section = activeContent.slice(headerIndex, sectionEnd).trim();

    // Extract goal if present
    const goalMatch = section.match(/\*\*Goal:?\*\*:?\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

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
  } catch (e) {
    error('Failed to read ROADMAP.md: ' + e.message);
  }
}

// ─── Phase Next Decimal ─────────────────────────────────────────────────────

/**
 * CLI command: Compute the next available decimal phase number for insertion.
 * @param {string} cwd - Project working directory
 * @param {string} basePhase - Base phase number to find next decimal for (e.g., '06')
 * @param {boolean} raw - Output raw next decimal string instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdPhaseNextDecimal(cwd, basePhase, raw) {
  const phasesDir = getPhasesDirPath(cwd);
  const normalized = normalizePhaseName(basePhase);

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
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    // Check if base phase exists
    const baseExists = dirs.some((d) => d.startsWith(normalized + '-') || d === normalized);

    // Find existing decimal phases for this base
    const decimalPattern = new RegExp(`^${normalized}\\.(\\d+)`);
    const existingDecimals = [];

    for (const dir of dirs) {
      const match = dir.match(decimalPattern);
      if (match) {
        existingDecimals.push(`${normalized}.${match[1]}`);
      }
    }

    // Sort numerically
    existingDecimals.sort((a, b) => {
      const aNum = parseFloat(a);
      const bNum = parseFloat(b);
      return aNum - bNum;
    });

    // Calculate next decimal
    let nextDecimal;
    if (existingDecimals.length === 0) {
      nextDecimal = `${normalized}.1`;
    } else {
      const lastDecimal = existingDecimals[existingDecimals.length - 1];
      const lastNum = parseInt(lastDecimal.split('.')[1], 10);
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
  } catch (e) {
    error('Failed to calculate next decimal phase: ' + e.message);
  }
}

// ─── Roadmap Analyze ────────────────────────────────────────────────────────

/**
 * Analyze the full roadmap structure with disk status, schedule, and progress.
 * Returns the result object directly without calling output() or process.exit().
 * Used internally by cmdRoadmapAnalyze and by dependency analysis (lib/deps.js).
 * @param {string} cwd - Project working directory
 * @returns {Object} Roadmap analysis with milestones, phases, progress, etc.
 */
function analyzeRoadmap(cwd) {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  if (!fs.existsSync(roadmapPath)) {
    return { error: 'ROADMAP.md not found', milestones: [], phases: [], current_phase: null };
  }

  const content = fs.readFileSync(roadmapPath, 'utf-8');
  const activeContent = stripShippedSections(content);
  const phasesDir = getPhasesDirPath(cwd);

  // Extract all phase headings: ### Phase N: Name
  const phasePattern = /###\s*Phase\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  const phases = [];
  let match;

  while ((match = phasePattern.exec(activeContent)) !== null) {
    const phaseNum = match[1];
    const phaseName = match[2].replace(/\(INSERTED\)/i, '').trim();

    // Extract goal from the section
    const sectionStart = match.index;
    const restOfContent = activeContent.slice(sectionStart);
    const nextHeader = restOfContent.match(/\n###\s+Phase\s+\d/i);
    const sectionEnd = nextHeader ? sectionStart + nextHeader.index : activeContent.length;
    const section = activeContent.slice(sectionStart, sectionEnd);

    const goalMatch = section.match(/\*\*Goal:?\*\*:?\s*([^\n]+)/i);
    const goal = goalMatch ? goalMatch[1].trim() : null;

    const dependsMatch = section.match(/\*\*Depends on:?\*\*:?\s*([^\n]+)/i);
    const depends_on = dependsMatch ? dependsMatch[1].trim() : null;

    // Check completion on disk
    const normalized = normalizePhaseName(phaseNum);
    let diskStatus = 'no_directory';
    let planCount = 0;
    let summaryCount = 0;
    let hasContext = false;
    let hasResearch = false;

    try {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      const dirMatch = dirs.find((d) => d.startsWith(normalized + '-') || d === normalized);

      if (dirMatch) {
        const phaseFiles = fs.readdirSync(path.join(phasesDir, dirMatch));
        planCount = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
        summaryCount = phaseFiles.filter(
          (f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md'
        ).length;
        hasContext = phaseFiles.some((f) => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
        hasResearch = phaseFiles.some((f) => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

        if (summaryCount >= planCount && planCount > 0) diskStatus = 'complete';
        else if (summaryCount > 0) diskStatus = 'partial';
        else if (planCount > 0) diskStatus = 'planned';
        else if (hasResearch) diskStatus = 'researched';
        else if (hasContext) diskStatus = 'discussed';
        else diskStatus = 'empty';
      }
    } catch {}

    // Check ROADMAP checkbox status
    const checkboxPattern = new RegExp(
      `-\\s*\\[(x| )\\]\\s*.*Phase\\s+${phaseNum.replace('.', '\\.')}`,
      'i'
    );
    const checkboxMatch = activeContent.match(checkboxPattern);
    const roadmapComplete = checkboxMatch ? checkboxMatch[1] === 'x' : false;

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
    });
  }

  // Extract milestone info
  const milestones = [];
  const milestonePattern = /##\s*(.*v(\d+\.\d+(?:\.\d+)?)[^(\n]*)/gi;
  let mMatch;
  while ((mMatch = milestonePattern.exec(activeContent)) !== null) {
    milestones.push({
      heading: mMatch[1].trim(),
      version: 'v' + mMatch[2],
    });
  }

  // Enrich phases with schedule data
  const schedule = computeSchedule(cwd);
  for (const phase of phases) {
    const schedPhase = getScheduleForPhase(schedule, phase.number);
    if (schedPhase) {
      phase.duration_days = schedPhase.duration_days;
      phase.start_date = schedPhase.start_date;
      phase.due_date = schedPhase.due_date;
    }
  }

  // Find current and next phase
  const currentPhase =
    phases.find((p) => p.disk_status === 'planned' || p.disk_status === 'partial') || null;
  const nextPhase =
    phases.find(
      (p) =>
        p.disk_status === 'empty' ||
        p.disk_status === 'no_directory' ||
        p.disk_status === 'discussed' ||
        p.disk_status === 'researched'
    ) || null;

  // Aggregated stats
  const totalPlans = phases.reduce((sum, p) => sum + p.plan_count, 0);
  const totalSummaries = phases.reduce((sum, p) => sum + p.summary_count, 0);
  const completedPhases = phases.filter((p) => p.disk_status === 'complete').length;

  return {
    milestones,
    phases,
    phase_count: phases.length,
    completed_phases: completedPhases,
    total_plans: totalPlans,
    total_summaries: totalSummaries,
    progress_percent: totalPlans > 0 ? Math.round((totalSummaries / totalPlans) * 100) : 0,
    current_phase: currentPhase ? currentPhase.number : null,
    next_phase: nextPhase ? nextPhase.number : null,
  };
}

/**
 * CLI command: Analyze the full roadmap structure with disk status, schedule, and progress.
 * Thin wrapper around analyzeRoadmap that outputs the result via output().
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs full roadmap analysis to stdout and exits
 */
function cmdRoadmapAnalyze(cwd, raw) {
  const result = analyzeRoadmap(cwd);
  output(result, raw);
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
