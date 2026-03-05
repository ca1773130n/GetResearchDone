/** GRD Commands/Progress -- Project progress rendering in json, table, and bar formats */

'use strict';

import type { MilestoneInfo } from '../types';

const fs = require('fs');
const path = require('path');
const { output, getMilestoneInfo }: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
} = require('../utils');
const { phasesDir: getPhasesDirPath, planningDir: getPlanningDir }: {
  phasesDir: (cwd: string) => string;
  planningDir: (cwd: string) => string;
} = require('../paths');
const { readCachedState }: {
  readCachedState: (statePath: string) => string | null;
} = require('./phase-info');

// ─── Domain Types ────────────────────────────────────────────────────────────

interface PhaseProgress {
  number: string;
  name: string;
  plans: number;
  summaries: number;
  status: string;
}

// ─── Progress Render ─────────────────────────────────────────────────────────

/** Render project progress in the specified format (json, table, or bar). */
function cmdProgressRender(cwd: string, format: string, raw: boolean): void {
  const phasesDir = getPhasesDirPath(cwd) as string;
  const milestone = getMilestoneInfo(cwd);
  const phases: PhaseProgress[] = [];
  let totalPlans = 0;
  let totalSummaries = 0;

  try {
    const dirs: string[] = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name)
      .sort((a: string, b: string) => {
        const aNum = parseFloat((a.match(/^(\d+(?:\.\d+)?)/) || ['0'])[1] || '0');
        const bNum = parseFloat((b.match(/^(\d+(?:\.\d+)?)/) || ['0'])[1] || '0');
        return aNum - bNum;
      });

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      const phaseNum = dm ? dm[1] : dir;
      const phaseName = dm && dm[2] ? dm[2].replace(/-/g, ' ') : '';
      const phaseFiles: string[] = fs.readdirSync(path.join(phasesDir, dir));
      const plans = phaseFiles.filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md').length;
      const summaries = phaseFiles.filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md').length;
      totalPlans += plans;
      totalSummaries += summaries;

      let status: string;
      if (plans === 0) status = 'Pending';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      phases.push({ number: phaseNum, name: phaseName, plans, summaries, status });
    }
  } catch { /* phases dir may not exist */ }

  const percent = totalPlans > 0 ? Math.round((totalSummaries / totalPlans) * 100) : 0;

  // Parse active blockers from STATE.md
  const blockerItems: string[] = [];
  try {
    const statePath = path.join(getPlanningDir(cwd), 'STATE.md');
    const stateContent = readCachedState(statePath) || '';
    const blockersSection = stateContent.match(/## Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (blockersSection) {
      const blockersText = blockersSection[1].trim();
      if (blockersText && blockersText !== 'None.' && blockersText !== 'None') {
        const items = blockersText.match(/^-\s+(.+)$/gm) || [];
        for (const item of items) blockerItems.push(item.replace(/^-\s+/, '').trim());
      }
    }
  } catch { /* STATE.md may not exist */ }

  if (format === 'table') {
    const barWidth = 10;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    let out = `# ${milestone.version} ${milestone.name}\n\n`;
    out += `**Progress:** [${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)\n\n`;
    if (blockerItems.length > 0) {
      out += `> **BLOCKED** \u2014 ${blockerItems.length} active blocker(s):\n`;
      for (const b of blockerItems) out += `> - ${b}\n`;
      out += `\n`;
    }
    out += `| Phase | Name | Plans | Status |\n|-------|------|-------|--------|\n`;
    for (const p of phases) out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.plans} | ${p.status} |\n`;
    output({ rendered: out }, raw, out);
  } else if (format === 'bar') {
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    const text = `[${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)`;
    output({ bar: text, percent, completed: totalSummaries, total: totalPlans }, raw, text);
  } else {
    const humanSummary = `${milestone.version} ${milestone.name}: ${totalSummaries}/${totalPlans} plans (${percent}%)`;
    output({
      milestone_version: milestone.version, milestone_name: milestone.name,
      phases, total_plans: totalPlans, total_summaries: totalSummaries, percent,
      active_blockers: blockerItems.length, blocker_items: blockerItems,
    }, raw, humanSummary);
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { cmdProgressRender };
