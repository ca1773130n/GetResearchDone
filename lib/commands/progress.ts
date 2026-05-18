'use strict';

/** GRD Commands/Progress -- Project progress rendering in json, table, and bar formats */


import type { MilestoneInfo } from '../types';

const fs = require('fs');
const path = require('path');
const {
  output,
  getMilestoneInfo,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
} = require('../utils');
const {
  phasesDir: getPhasesDirPath,
  planningDir: getPlanningDir,
}: {
  phasesDir: (cwd: string) => string;
  planningDir: (cwd: string) => string;
} = require('../paths');
const {
  readCachedState,
}: {
  readCachedState: (statePath: string) => string | null;
} = require('./phase-info');
const {
  loadConfig,
}: {
  loadConfig: (cwd: string) => { survey?: { staleness_days?: number }; [key: string]: unknown };
} = require('../utils');

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
    const dirs: string[] = fs
      .readdirSync(phasesDir, { withFileTypes: true })
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
      const plans = phaseFiles.filter(
        (f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md'
      ).length;
      const summaries = phaseFiles.filter(
        (f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md'
      ).length;
      totalPlans += plans;
      totalSummaries += summaries;

      let status: string;
      if (plans === 0) status = 'Pending';
      else if (summaries >= plans) status = 'Complete';
      else if (summaries > 0) status = 'In Progress';
      else status = 'Planned';

      phases.push({ number: phaseNum, name: phaseName, plans, summaries, status });
    }
  } catch {
    /* phases dir may not exist */
  }

  const percent = totalPlans > 0 ? Math.round((totalSummaries / totalPlans) * 100) : 0;

  // Check research file staleness
  let stalenessDays = 30;
  try {
    const cfg = loadConfig(cwd);
    if (cfg.survey && typeof cfg.survey.staleness_days === 'number') {
      stalenessDays = cfg.survey.staleness_days;
    }
  } catch {
    // Config unavailable — use default
  }
  const stalenessMs = stalenessDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const staleResearchFiles: string[] = [];
  const planningBase = getPlanningDir(cwd);
  const researchFilesToCheck: string[] = [
    path.join(planningBase, 'research', 'LANDSCAPE.md'),
  ];
  try {
    const milestonesBase = path.join(planningBase, 'milestones');
    const msDirs = (fs.readdirSync(milestonesBase) as string[]).filter((d: string) => {
      try { return fs.statSync(path.join(milestonesBase, d)).isDirectory(); } catch { return false; }
    });
    for (const ms of msDirs) {
      researchFilesToCheck.push(path.join(milestonesBase, ms, 'research', 'SUMMARY.md'));
    }
  } catch {
    // milestones dir may not exist
  }
  for (const resFile of researchFilesToCheck) {
    try {
      const stat = fs.statSync(resFile);
      if (now - stat.mtimeMs > stalenessMs) {
        staleResearchFiles.push(path.relative(cwd, resFile));
      }
    } catch {
      // File doesn't exist — not stale, just absent
    }
  }

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
  } catch {
    /* STATE.md may not exist */
  }

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
    if (staleResearchFiles.length > 0) {
      out += `## Research Freshness Warnings\n\n`;
      out += `The following research files are older than ${stalenessDays} days. Run \`/grd:survey\` to refresh:\n\n`;
      for (const f of staleResearchFiles) out += `- \`${f}\`\n`;
      out += `\n`;
    }
    out += `| Phase | Name | Plans | Status |\n|-------|------|-------|--------|\n`;
    for (const p of phases)
      out += `| ${p.number} | ${p.name} | ${p.summaries}/${p.plans} | ${p.status} |\n`;
    output({ rendered: out }, raw, out);
  } else if (format === 'bar') {
    const barWidth = 20;
    const filled = Math.round((percent / 100) * barWidth);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(barWidth - filled);
    const text = `[${bar}] ${totalSummaries}/${totalPlans} plans (${percent}%)`;
    output({ bar: text, percent, completed: totalSummaries, total: totalPlans }, raw, text);
  } else {
    const humanSummary = `${milestone.version} ${milestone.name}: ${totalSummaries}/${totalPlans} plans (${percent}%)`;
    output(
      {
        milestone_version: milestone.version,
        milestone_name: milestone.name,
        phases,
        total_plans: totalPlans,
        total_summaries: totalSummaries,
        percent,
        active_blockers: blockerItems.length,
        blocker_items: blockerItems,
        stale_research_files: staleResearchFiles,
        staleness_threshold_days: stalenessDays,
      },
      raw,
      humanSummary
    );
  }
}

// ─── Research Gap Detector ───────────────────────────────────────────────────

interface MustConsiderPaper {
  title: string;
  keywords: string[];
}

interface PhaseGapRow {
  phase: string;
  cited: string[];
  missing: string[];
}

interface ResearchGapsResult {
  must_consider_count: number;
  phases_scanned: number;
  coverage: PhaseGapRow[];
  uncited_global: string[];
}

/**
 * Scan all phase RESEARCH.md and PLAN.md files for citations of must-consider
 * papers listed in .planning/config.json `must_consider_papers`. Reports a
 * per-phase coverage table showing which papers are cited vs. missing.
 */
function cmdResearchGaps(cwd: string, raw: boolean): void {
  const planningDir = getPlanningDir(cwd) as string;
  const configPath = path.join(planningDir, 'config.json');
  let mustConsider: MustConsiderPaper[] = [];
  if (fs.existsSync(configPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8') as string) as Record<string, unknown>;
      const raw_papers = cfg['must_consider_papers'];
      if (Array.isArray(raw_papers)) {
        mustConsider = (raw_papers as Array<Record<string, unknown>>).map((p) => ({
          title: String(p['title'] ?? ''),
          keywords: Array.isArray(p['keywords']) ? (p['keywords'] as string[]).map(String) : [],
        })).filter((p) => p.title.length > 0);
      }
    } catch { /* ignore parse errors */ }
  }

  if (mustConsider.length === 0) {
    output({ must_consider_count: 0, phases_scanned: 0, coverage: [], uncited_global: [], note: 'No must_consider_papers in .planning/config.json' }, raw, 'No must_consider_papers configured. Add them to .planning/config.json to use research-gaps.');
    return;
  }

  // Gather phase directories
  const milestonesBase = path.join(planningDir, 'milestones');
  const phaseDirs: { phaseId: string; dir: string }[] = [];
  if (fs.existsSync(milestonesBase)) {
    try {
      for (const ms of (fs.readdirSync(milestonesBase) as string[])) {
        const phasesBase = path.join(milestonesBase, ms, 'phases');
        if (!fs.existsSync(phasesBase)) continue;
        try {
          for (const ph of (fs.readdirSync(phasesBase) as string[])) {
            phaseDirs.push({ phaseId: `${ms}/${ph}`, dir: path.join(phasesBase, ph) });
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  const coverage: PhaseGapRow[] = [];
  const globalCited = new Set<string>();

  for (const { phaseId, dir } of phaseDirs) {
    const candidates = ['RESEARCH.md', 'PLAN.md'].map((f) => path.join(dir, f));
    let phaseText = '';
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        try { phaseText += ' ' + (fs.readFileSync(c, 'utf-8') as string).toLowerCase(); } catch { /* skip */ }
      }
    }
    if (!phaseText.trim()) continue;

    const cited: string[] = [];
    const missing: string[] = [];
    for (const paper of mustConsider) {
      const allTerms = [paper.title, ...paper.keywords].map((t) => t.toLowerCase());
      const isCited = allTerms.some((term) => phaseText.includes(term));
      if (isCited) {
        cited.push(paper.title);
        globalCited.add(paper.title);
      } else {
        missing.push(paper.title);
      }
    }
    coverage.push({ phase: phaseId, cited, missing });
  }

  const uncited_global = mustConsider.map((p) => p.title).filter((t) => !globalCited.has(t));
  const result: ResearchGapsResult = {
    must_consider_count: mustConsider.length,
    phases_scanned: coverage.length,
    coverage,
    uncited_global,
  };

  const summary = uncited_global.length === 0
    ? `All ${mustConsider.length} must-consider papers cited across ${coverage.length} phases`
    : `${uncited_global.length}/${mustConsider.length} papers uncited in any phase`;
  output(result, raw, summary);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { cmdProgressRender, cmdResearchGaps };
