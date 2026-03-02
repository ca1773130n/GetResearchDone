/** GRD Commands/Dashboard -- Project dashboard and phase detail rendering */

'use strict';

import type { FrontmatterObject } from '../types';

const fs = require('fs');
const path = require('path');

const {
  safeReadFile, normalizePhaseName, output, error,
} = require('../utils') as {
  safeReadFile: (p: string) => string | null;
  normalizePhaseName: (phase: string) => string;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
};
const { extractFrontmatter } = require('../frontmatter') as {
  extractFrontmatter: (content: string) => FrontmatterObject;
};
const {
  phasesDir: getPhasesDirPath, planningDir: getPlanningDir,
} = require('../paths') as {
  phasesDir: (cwd: string) => string;
  planningDir: (cwd: string) => string;
};
const {
  parseRequirements, parseTraceabilityMatrix,
} = require('../requirements') as {
  parseRequirements: (content: string) => { id: string; title: string; priority: string }[];
  parseTraceabilityMatrix: (content: string) => { req: string; status: string }[];
};
const { readCachedRoadmap, readCachedState } = require('./phase-info.ts') as {
  readCachedRoadmap: (roadmapPath: string) => string | null;
  readCachedState: (statePath: string) => string | null;
};
const {
  parseDashboardShippedMilestones,
  parseDashboardActiveMilestones,
  parseDashboardPhases,
  parseDashboardStateSummary,
} = require('./_dashboard-parsers.ts') as {
  parseDashboardShippedMilestones: (roadmapContent: string) => MilestoneEntry[];
  parseDashboardActiveMilestones: (roadmapContent: string) => {
    activeMilestones: MilestoneEntry[];
    milestonePositions: { index: number }[];
  };
  parseDashboardPhases: (
    roadmapContent: string, phasesDir: string,
    milestonePositions: { index: number }[], activePhaseNum: string | null,
    activeMilestones: MilestoneEntry[]
  ) => PhaseData[];
  parseDashboardStateSummary: (stateContent: string) => StateSummary;
};

// ─── Domain Types ────────────────────────────────────────────────────────────

interface MilestoneEntry {
  name: string;
  number: number | null;
  version: string | null;
  goal: string | null;
  start: string | null;
  target: string | null;
  status?: string;
  shipped_date?: string;
  phase_range?: string | null;
  phase_count?: number;
  progress_percent: number;
  phases: PhaseData[];
}

interface PhaseData {
  number: string;
  name: string;
  type: string | null;
  duration: string | null;
  plans: number;
  summaries: number;
  status: string;
  active: boolean;
  plan_files: string[];
  summary_files: string[];
}

interface StateSummary {
  activeBlockers: number;
  blockerItems: string[];
  pendingDeferred: number;
  totalDecisions: number;
}

interface DashboardData {
  shippedMilestones: MilestoneEntry[];
  activeMilestones: MilestoneEntry[];
  allPhases: PhaseData[];
  stateSummary: StateSummary;
  totalPlans: number;
  totalSummaries: number;
  shippedPhaseCount: number;
}

interface PhaseDetailPlan {
  id: string;
  wave: number;
  type: string;
  status: string;
  duration: string | null;
  tasks: number | null;
  files: number | null;
  objective: string | null;
}

interface PhaseRequirement {
  id: string;
  title: string | null;
  priority: string | null;
  status: string;
}

// ─── Dashboard TUI Renderer ─────────────────────────────────────────────────

function renderDashboardTui(
  shippedMilestones: MilestoneEntry[], activeMilestones: MilestoneEntry[],
  allPhases: PhaseData[], shippedPhaseCount: number,
  totalPlans: number, totalSummaries: number, stateSummary: StateSummary
): string {
  let tui = '# GRD Dashboard\n\n';

  if (shippedMilestones.length > 0) {
    tui += '## Shipped\n\n';
    for (const ms of shippedMilestones) {
      const phaseInfo = ms.phase_count && ms.phase_count > 0 ? ` \u2014 ${ms.phase_count} phases` : '';
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
      let symbol: string;
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
              (f: string) => f === planId + '-SUMMARY.md'
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
    const minDate = new Date(Math.min(...allStarts.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...allTargets.map((d) => d.getTime())));
    const totalDays = Math.max(1, (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    const tlBarWidth = 40;
    const tlLabelWidth = 10;
    const dateToPos = (dateStr: string): number => {
      const d = new Date(dateStr + 'T00:00:00');
      return Math.round(((d.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * tlBarWidth);
    };

    const minStr = minDate.toISOString().slice(0, 10);
    const maxStr = maxDate.toISOString().slice(0, 10);
    const headerPad = Math.max(1, tlBarWidth - minStr.length - maxStr.length + 2);
    tui += ' '.repeat(tlLabelWidth) + minStr + ' '.repeat(headerPad) + maxStr + '\n';
    tui += ' '.repeat(tlLabelWidth) + '|' + '-'.repeat(tlBarWidth) + '|\n';

    for (const ms of timelineMilestones) {
      const startPos = dateToPos(ms.start as string);
      const endPos = dateToPos(ms.target as string);
      const barLen = Math.max(1, endPos - startPos);
      const label = (ms.number != null ? 'M' + ms.number : ms.name.slice(0, 8)).padEnd(tlLabelWidth);
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

  if (stateSummary.activeBlockers > 0 && stateSummary.blockerItems && stateSummary.blockerItems.length > 0) {
    tui += '## ACTIVE BLOCKERS\n\n';
    for (const blocker of stateSummary.blockerItems) { tui += `  ! ${blocker}\n`; }
    tui += '\n';
  }

  tui += '---\n';
  const msSummaryParts: string[] = [];
  if (shippedMilestones.length > 0) msSummaryParts.push(`${shippedMilestones.length} shipped`);
  if (activeMilestones.length > 0) msSummaryParts.push(`${activeMilestones.length} active`);
  const msSummary = msSummaryParts.length > 0 ? msSummaryParts.join(' + ') + ' milestones' : '0 milestones';
  const totalPhaseCount = allPhases.length + shippedPhaseCount;
  tui += `Summary: ${msSummary} | ${totalPhaseCount} phases | ${totalSummaries}/${totalPlans} plans complete\n`;
  tui += `Blockers: ${stateSummary.activeBlockers} | Deferred: ${stateSummary.pendingDeferred} | Decisions: ${stateSummary.totalDecisions}\n`;
  return tui;
}

// ─── Build Dashboard Data ───────────────────────────────────────────────────

/** Build dashboard data from ROADMAP.md and STATE.md. Returns null if ROADMAP.md missing. */
function buildDashboardData(cwd: string): DashboardData | null {
  const roadmapPath = path.join(getPlanningDir(cwd), 'ROADMAP.md');
  const statePath = path.join(getPlanningDir(cwd), 'STATE.md');
  const phasesDir = getPhasesDirPath(cwd) as string;
  const roadmapContent = readCachedRoadmap(roadmapPath);
  if (!roadmapContent) return null;

  const stateContent = readCachedState(statePath) || '';
  const shippedMilestones = parseDashboardShippedMilestones(roadmapContent);
  const { activeMilestones, milestonePositions } = parseDashboardActiveMilestones(roadmapContent);

  const activePhaseMatch = stateContent.match(/\*\*Active phase:\*\*\s*(\d+)/i);
  const activePhaseNum = activePhaseMatch ? activePhaseMatch[1] : null;
  const allPhases = parseDashboardPhases(
    roadmapContent, phasesDir, milestonePositions, activePhaseNum, activeMilestones
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
  const shippedPhaseCount = shippedMilestones.reduce((sum, ms) => sum + (ms.phase_count || 0), 0);
  return { shippedMilestones, activeMilestones, allPhases, stateSummary, totalPlans, totalSummaries, shippedPhaseCount };
}

// ─── Render Dashboard ───────────────────────────────────────────────────────

/** Render the dashboard data into a JSON result and TUI string. */
function renderDashboard(
  data: DashboardData, options?: { filter?: string | null }
): { jsonResult: Record<string, unknown>; tui: string } {
  const filter = (options && options.filter) || null;
  const { shippedMilestones, activeMilestones, allPhases, stateSummary, totalPlans, totalSummaries, shippedPhaseCount } = data;
  const milestones = [...shippedMilestones, ...activeMilestones];
  const timeline = activeMilestones
    .filter((ms) => ms.start && ms.target)
    .map((ms) => ({ number: ms.number, name: ms.name, start: ms.start, target: ms.target, progress_percent: ms.progress_percent, phase_count: ms.phases.length }));

  const jsonResult: Record<string, unknown> = {
    milestones: milestones.map((ms) => {
      let phases: Record<string, unknown>[] = ms.phases.map(({ plan_files: _pf, summary_files: _sf, ...rest }) => rest);
      if (filter === 'incomplete') { phases = phases.filter((p) => p.status !== 'complete'); }
      return { ...ms, phases };
    }),
    timeline,
    summary: {
      total_milestones: milestones.length, shipped_milestones: shippedMilestones.length,
      total_phases: allPhases.length + shippedPhaseCount, total_plans: totalPlans,
      total_summaries: totalSummaries, active_blockers: stateSummary.activeBlockers,
      pending_deferred: stateSummary.pendingDeferred, total_decisions: stateSummary.totalDecisions,
    },
  };
  const tui = renderDashboardTui(shippedMilestones, activeMilestones, allPhases, shippedPhaseCount, totalPlans, totalSummaries, stateSummary);
  return { jsonResult, tui };
}

// ─── CLI: Dashboard ─────────────────────────────────────────────────────────

/** CLI command: Render a full project dashboard with milestones, phases, plans, and timeline. */
function cmdDashboard(cwd: string, raw: boolean, options?: { filter?: string | null }): void {
  const data = buildDashboardData(cwd);
  if (!data) {
    if (!raw) { error('No ROADMAP.md found'); }
    output({ error: 'ROADMAP.md not found', milestones: [], summary: {} }, raw);
    return;
  }
  const _filter = (options && options.filter) || null;
  const { jsonResult, tui } = renderDashboard(data, options);
  if (!raw && tui) { output(jsonResult, true, tui); return; }
  output(jsonResult, raw, _filter !== null ? undefined : tui);
}

// ─── CLI: Phase Detail ──────────────────────────────────────────────────────

/** CLI command: Render a detailed drill-down for a single phase. */
function cmdPhaseDetail(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    if (!raw) { error('Phase number required'); }
    output({ error: 'Phase number required' }, raw);
    return;
  }

  const phasesDir = getPhasesDirPath(cwd) as string;
  const statePath = path.join(getPlanningDir(cwd), 'STATE.md');
  const roadmapPath = path.join(getPlanningDir(cwd), 'ROADMAP.md');
  const normalized = normalizePhaseName(phase);

  let phaseDir: string | null = null;
  let phaseDirName: string | null = null;
  try {
    const entries: { isDirectory: () => boolean; name: string }[] = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    const match = dirs.find((d: string) => d.startsWith(normalized + '-') || d === normalized);
    if (match) { phaseDir = path.join(phasesDir, match); phaseDirName = match; }
  } catch { /* Phases directory may not exist */ }

  if (!phaseDir || !phaseDirName) {
    if (!raw) { error(`Phase ${phase} not found`); }
    output({ error: 'Phase not found', phase }, raw);
    return;
  }

  const dirMatch: RegExpMatchArray | null = phaseDirName.match(/^(\d+(?:\.\d+)?)-?(.*)/);
  const phaseNumber = dirMatch ? dirMatch[1].replace(/^0+(\d)/, '$1') : phase;
  const phaseName = dirMatch && dirMatch[2] ? dirMatch[2] : '';

  const phaseFiles: string[] = fs.readdirSync(phaseDir);
  const planFiles = phaseFiles.filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
  const summaryFiles = phaseFiles.filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').sort();
  const completedPlanIds = new Set(summaryFiles.map((s: string) => s.replace('-SUMMARY.md', '')));

  const plans: PhaseDetailPlan[] = [];
  let totalDurationMin = 0, totalTasks = 0, totalFiles = 0;
  const allDecisions: string[] = [];
  const allArtifacts: string[] = [];

  for (const planFile of planFiles) {
    const planId = planFile.replace('-PLAN.md', '');
    const planContent: string = safeReadFile(path.join(phaseDir, planFile)) || '';
    const planFm = extractFrontmatter(planContent) as Record<string, unknown>;
    let objective: string | null = null;
    const objMatch = planContent.match(/<objective>\s*([\s\S]*?)\s*<\/objective>/i);
    if (objMatch) { objective = objMatch[1].split('\n')[0].trim(); if (objective.length > 80) objective = objective.substring(0, 77) + '...'; }

    const hasSummary = completedPlanIds.has(planId);
    let duration: string | null = null, tasks: number | null = null, files: number | null = null;

    if (hasSummary) {
      const summaryContent: string = safeReadFile(path.join(phaseDir, planId + '-SUMMARY.md')) || '';
      const summaryFm = extractFrontmatter(summaryContent) as Record<string, unknown>;
      duration = (summaryFm.duration as string) || null;
      if (summaryFm['key-files']) {
        const kf = summaryFm['key-files'] as Record<string, unknown>;
        const created = kf.created ? (Array.isArray(kf.created) ? kf.created as string[] : [kf.created as string]) : [];
        const modified = kf.modified ? (Array.isArray(kf.modified) ? kf.modified as string[] : [kf.modified as string]) : [];
        files = created.length + modified.length;
        allArtifacts.push(...created);
      }
      if (summaryFm['key-decisions'] && Array.isArray(summaryFm['key-decisions'])) allDecisions.push(...(summaryFm['key-decisions'] as string[]));
      if (duration) { const minMatch = duration.match(/(\d+)\s*min/i); if (minMatch) totalDurationMin += parseInt(minMatch[1], 10); }
      const taskMatches = planContent.match(/<task\s/gi) || [];
      tasks = taskMatches.length; totalTasks += tasks; if (files) totalFiles += files;
    }
    plans.push({ id: planId, wave: parseInt(String(planFm.wave), 10) || 1, type: (planFm.type as string) || 'execute', status: hasSummary ? 'complete' : 'planned', duration, tasks, files, objective });
  }

  const hasEval = phaseFiles.some((f: string) => f.endsWith('-EVAL.md') || f === 'EVAL.md');
  const hasVerification = phaseFiles.some((f: string) => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md');
  const hasReview = phaseFiles.some((f: string) => f.endsWith('-REVIEW.md') || f === 'REVIEW.md');
  const hasContext = phaseFiles.some((f: string) => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
  const hasResearch = phaseFiles.some((f: string) => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

  const stateContent = readCachedState(statePath) || '';
  const stateDecisions: string[] = [];
  const decisionPattern = new RegExp(`Phase\\s+${phaseNumber.replace('.', '\\.')}`, 'i');
  const decisionsSection = stateContent.match(/##\s*Key Decisions\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (decisionsSection) {
    const rows = decisionsSection[1].split('\n').filter((r: string) => r.includes('|') && decisionPattern.test(r));
    for (const row of rows) { const cells = row.split('|').map((c: string) => c.trim()).filter(Boolean); if (cells.length >= 2) stateDecisions.push(cells[1]); }
  }
  const allDecisionsUnique = Array.from(new Set([...allDecisions, ...stateDecisions]));

  const roadmapContent = readCachedRoadmap(roadmapPath) || '';
  const phaseRequirements: PhaseRequirement[] = [];
  const phaseHeadingPattern = new RegExp(`#{2,} Phase ${phaseNumber.replace('.', '\\.')}:([\\s\\S]*?)(?=#{2,} Phase |$)`, 'i');
  const phaseSection = roadmapContent.match(phaseHeadingPattern);
  if (phaseSection) {
    const reqLineMatch = phaseSection[1].match(/\*\*Requirements\*\*:\s*(.+)/i);
    if (reqLineMatch) {
      const reqIds = reqLineMatch[1].split(',').map((id: string) => id.trim()).filter(Boolean);
      if (reqIds.length > 0) {
        const reqContent = safeReadFile(path.join(getPlanningDir(cwd), 'REQUIREMENTS.md')) || '';
        if (reqContent) {
          const allReqs = parseRequirements(reqContent);
          const matrix = parseTraceabilityMatrix(reqContent);
          for (const reqId of reqIds) {
            const req = allReqs.find((r: { id: string }) => r.id.toLowerCase() === reqId.toLowerCase());
            const matrixRow = matrix.find((m: { req: string }) => m.req.toLowerCase() === reqId.toLowerCase());
            phaseRequirements.push({ id: reqId.toUpperCase(), title: req ? req.title : null, priority: req ? req.priority : null, status: matrixRow ? matrixRow.status : 'Unknown' });
          }
        }
      }
    }
  }

  const durationStr = totalDurationMin > 0 ? totalDurationMin + 'min' : null;
  const completedCount = plans.filter((p) => p.status === 'complete').length;
  const result = {
    phase_number: phaseNumber, phase_name: phaseName,
    directory: path.relative(cwd, path.join(phasesDir, phaseDirName)),
    plans, decisions: allDecisionsUnique, artifacts: Array.from(new Set(allArtifacts)),
    requirements: phaseRequirements, has_eval: hasEval, has_verification: hasVerification,
    has_review: hasReview, has_context: hasContext, has_research: hasResearch,
    summary_stats: { total_plans: plans.length, completed: completedCount, total_duration: durationStr, total_tasks: totalTasks, total_files: totalFiles },
  };

  let tui = `# Phase ${phaseNumber}: ${phaseName}\n\n`;
  const statusLabel = completedCount === plans.length && plans.length > 0 ? 'Complete' : completedCount > 0 ? 'In Progress' : 'Planned';
  tui += `Status: ${statusLabel} (${completedCount}/${plans.length} plans)\nDirectory: ${path.relative(cwd, path.join(phasesDir, phaseDirName))}\n\n`;
  tui += '| Plan  | Wave | Status | Duration | Tasks | Files | Objective                              |\n';
  tui += '|-------|------|--------|----------|-------|-------|----------------------------------------|\n';
  for (const p of plans) {
    const sym = p.status === 'complete' ? '\u2713' : '\u25CB';
    const dur = p.duration || '-'; const tsk = p.tasks !== null ? String(p.tasks) : '-'; const fil = p.files !== null ? String(p.files) : '-';
    const obj = p.objective ? (p.objective.length > 40 ? p.objective.substring(0, 37) + '...' : p.objective) : '-';
    tui += `| ${p.id.padEnd(5)} | ${String(p.wave).padEnd(4)} | ${sym.padEnd(6)} | ${dur.padEnd(8)} | ${tsk.padEnd(5)} | ${fil.padEnd(5)} | ${obj.padEnd(40)} |\n`;
  }
  if (durationStr) tui += `\nTotals: ${durationStr} | ${totalTasks} tasks | ${totalFiles} files\n`;
  if (allDecisionsUnique.length > 0) { tui += `\n## Decisions (${allDecisionsUnique.length})\n`; for (const d of allDecisionsUnique) tui += `- ${d}\n`; }
  tui += '\n## Artifacts\n';
  tui += `Context: ${hasContext ? '\u2713' : '\u2717'} | Research: ${hasResearch ? '\u2713' : '\u2717'} | Eval: ${hasEval ? '\u2713' : '\u2717'} | Verification: ${hasVerification ? '\u2713' : '\u2717'} | Review: ${hasReview ? '\u2713' : '\u2717'}\n`;
  if (phaseRequirements.length > 0) {
    tui += `\n## Requirements (${phaseRequirements.length})\n| REQ | Title | Priority | Status |\n|-----|-------|----------|--------|\n`;
    for (const r of phaseRequirements) { const title = r.title || '-'; const truncTitle = title.length > 40 ? title.substring(0, 37) + '...' : title; tui += `| ${r.id} | ${truncTitle} | ${r.priority || '-'} | ${r.status || '-'} |\n`; }
  }
  if (!raw && tui) { output(result, true, tui); return; }
  output(result, raw, tui);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  buildDashboardData,
  renderDashboard,
  cmdDashboard,
  cmdPhaseDetail,
};
