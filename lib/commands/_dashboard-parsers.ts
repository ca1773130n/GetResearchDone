/** GRD Commands/Dashboard -- Internal parse helpers for dashboard data extraction */

'use strict';


const fs = require('fs');
const path = require('path');

const { normalizePhaseName }: {
  normalizePhaseName: (phase: string) => string;
} = require('../utils');

// ─── Domain Types (shared with dashboard.ts) ─────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeShippedMilestone(
  name: string, version: string, shippedDate: string,
  phaseRange: string | null, phaseCount: number
): MilestoneEntry {
  return {
    name, number: null, version, goal: null, start: null, target: null,
    status: 'shipped', shipped_date: shippedDate, phase_range: phaseRange,
    phase_count: phaseCount, progress_percent: 100, phases: [],
  };
}

function parseDashboardShippedMilestones(roadmapContent: string): MilestoneEntry[] {
  const shippedMilestones: MilestoneEntry[] = [];
  const milestonesSection = roadmapContent.match(/^##\s+Milestones\s*\n([\s\S]*?)(?=\n##\s|\n$)/m);
  if (!milestonesSection) return shippedMilestones;

  const shippedWithPhasesRegex =
    /^-\s+(v[\d.]+)\s+(.+?)\s*-\s*Phases\s+(\d+)-(\d+)\s*\(shipped\s+(\d{4}-\d{2}-\d{2})\)/gm;
  const shippedNoPhasesRegex = /^-\s+(v[\d.]+)\s+(.+?)\s*\(shipped\s+(\d{4}-\d{2}-\d{2})\)/gm;
  const seen = new Set<string>();
  let sMatch: RegExpExecArray | null;
  while ((sMatch = shippedWithPhasesRegex.exec(milestonesSection[1])) !== null) {
    const startPhase = parseInt(sMatch[3]);
    const endPhase = parseInt(sMatch[4]);
    seen.add(sMatch[1]);
    shippedMilestones.push(
      makeShippedMilestone(sMatch[2].trim(), sMatch[1], sMatch[5],
        `${startPhase}-${endPhase}`, endPhase - startPhase + 1)
    );
  }
  while ((sMatch = shippedNoPhasesRegex.exec(milestonesSection[1])) !== null) {
    if (seen.has(sMatch[1])) continue;
    shippedMilestones.push(makeShippedMilestone(sMatch[2].trim(), sMatch[1], sMatch[3], null, 0));
  }
  return shippedMilestones;
}

function parseDashboardActiveMilestones(roadmapContent: string): {
  activeMilestones: MilestoneEntry[];
  milestonePositions: { index: number }[];
} {
  const milestoneRegex = /^##\s+(Milestone\s+\d+[^:\n]*:\s*([^\n]+)|.*v(\d+\.\d+)[^\n]*)/gim;
  const activeMilestones: MilestoneEntry[] = [];
  const milestonePositions: { index: number }[] = [];
  let mMatch: RegExpExecArray | null;

  while ((mMatch = milestoneRegex.exec(roadmapContent)) !== null) {
    const heading = mMatch[0].replace(/^##\s+/, '').trim();
    if (/^(Milestones|Phases|Deferred\s+Validations)$/i.test(heading)) continue;
    const nameMatch = heading.match(/Milestone\s+\d+\s*:\s*(.+)/i);
    const mFormatNameMatch = !nameMatch ? heading.match(/M\d+[^:]*:\s*(.+)/i) : null;
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
      name, number, version,
      goal: goalMatch ? goalMatch[1].trim() : null,
      start: startMatch ? startMatch[1] : null,
      target: targetMatch ? targetMatch[1] : null,
      phases: [], progress_percent: 0,
    });
    milestonePositions.push({ index: mMatch.index });
  }
  return { activeMilestones, milestonePositions };
}

function parseDashboardPhases(
  roadmapContent: string, phasesDir: string,
  milestonePositions: { index: number }[], activePhaseNum: string | null,
  activeMilestones: MilestoneEntry[]
): PhaseData[] {
  const phaseRegex = /#{2,}\s*Phase\s+(\d+(?:\.\d+)?)\s*:\s*([^\n]+)/gi;
  let pMatch: RegExpExecArray | null;
  const allPhases: PhaseData[] = [];

  while ((pMatch = phaseRegex.exec(roadmapContent)) !== null) {
    const phaseNum = pMatch[1];
    const phaseName = pMatch[2].replace(/\(INSERTED\)/i, '').trim();
    const sectionStart = pMatch.index;
    const restContent = roadmapContent.slice(sectionStart + pMatch[0].length);
    const nextHeading = restContent.match(/\n###?\s/);
    const sectionText = nextHeading
      ? roadmapContent.slice(sectionStart, sectionStart + pMatch[0].length + (nextHeading.index ?? 0))
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
    let plans = 0, summaries = 0;
    let planFiles: string[] = [];
    let summaryFiles: string[] = [];
    try {
      const entries: { isDirectory: () => boolean; name: string }[] =
        fs.readdirSync(phasesDir, { withFileTypes: true });
      const dirs = entries.filter((e: { isDirectory: () => boolean }) => e.isDirectory()).map((e: { name: string }) => e.name);
      const dirMatch = dirs.find((d: string) => d.startsWith(normalized + '-') || d === normalized);
      if (dirMatch) {
        const phaseFiles: string[] = fs.readdirSync(path.join(phasesDir, dirMatch));
        planFiles = phaseFiles.filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md').sort();
        plans = planFiles.length;
        summaryFiles = phaseFiles.filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        summaries = summaryFiles.length;
      }
    } catch { /* no phases dir */ }

    let status: string;
    if (plans === 0) status = 'pending';
    else if (summaries >= plans) status = 'complete';
    else if (summaries > 0) status = 'in-progress';
    else status = 'planned';

    const phaseData: PhaseData = {
      number: phaseNum, name: phaseName, type, duration,
      plans, summaries, status, active: activePhaseNum === phaseNum,
      plan_files: planFiles, summary_files: summaryFiles,
    };
    allPhases.push(phaseData);
    if (activeMilestones[activeMsIdx]) activeMilestones[activeMsIdx].phases.push(phaseData);
  }
  return allPhases;
}

function parseDashboardStateSummary(stateContent: string): StateSummary {
  let activeBlockers = 0;
  let blockerItems: string[] = [];
  const blockersSection = stateContent.match(/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (blockersSection) {
    const items = blockersSection[1].match(/^-\s+(.+)$/gm) || [];
    const filtered = items.filter((item: string) => {
      const text = item.replace(/^-\s+/, '').trim();
      return text.toLowerCase() !== 'none' && text.toLowerCase() !== 'none.';
    });
    activeBlockers = filtered.length;
    blockerItems = filtered.map((item: string) => item.replace(/^-\s+/, '').trim());
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

  return { activeBlockers, blockerItems, pendingDeferred, totalDecisions };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  makeShippedMilestone,
  parseDashboardShippedMilestones,
  parseDashboardActiveMilestones,
  parseDashboardPhases,
  parseDashboardStateSummary,
};
