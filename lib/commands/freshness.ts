'use strict';

/** GRD Commands/Freshness -- Research freshness scanner for RESEARCH.md and LANDSCAPE.md */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  safeReadFile,
  output,
  error,
  findPhaseInternal,
}: {
  safeReadFile: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  findPhaseInternal: (cwd: string, phase: string) => { found: boolean; directory: string } | null;
} = require('../utils');

const {
  phasesDir: getPhasesDirPath,
  researchDir: getResearchDir,
  currentMilestone,
}: {
  phasesDir: (cwd: string, milestone?: string | null) => string;
  researchDir: (cwd: string, milestone?: string | null) => string;
  currentMilestone: (cwd: string) => string;
} = require('../paths');

interface FreshnessItem {
  title: string;
  type: 'paper' | 'repo' | 'url';
  url?: string;
  research_date?: string;
  days_since_research: number;
  staleness: 'fresh' | 'aging' | 'stale';
  source_file: string;
}

interface FreshnessResult {
  phase?: string;
  items: FreshnessItem[];
  stale_count: number;
  aging_count: number;
  fresh_count: number;
  files_scanned: number;
}

const STALE_DAYS = 30;
const AGING_DAYS = 14;

function _classifyStaleness(days: number): 'fresh' | 'aging' | 'stale' {
  if (days >= STALE_DAYS) return 'stale';
  if (days >= AGING_DAYS) return 'aging';
  return 'fresh';
}

function _extractResearchDate(content: string): string | undefined {
  // Look for frontmatter date field or explicit "research_date:" line
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const d = fm[1].match(/(?:date|research_date):\s*(\d{4}-\d{2}-\d{2})/);
    if (d) return d[1];
  }
  const inline = content.match(/research_date:\s*(\d{4}-\d{2}-\d{2})/);
  if (inline) return inline[1];
  return undefined;
}

function _extractCitations(content: string): Array<{ title: string; url?: string; type: 'paper' | 'repo' | 'url' }> {
  const items: Array<{ title: string; url?: string; type: 'paper' | 'repo' | 'url' }> = [];
  const seen = new Set<string>();

  // arXiv links
  for (const m of content.matchAll(/https?:\/\/arxiv\.org\/abs\/[\d.]+/g)) {
    const url = m[0];
    if (!seen.has(url)) {
      seen.add(url);
      const titleMatch = content.slice(Math.max(0, m.index! - 200), m.index!).match(/#+\s+(.+)$|["']([^"']{5,80})["']/m);
      items.push({ title: titleMatch ? (titleMatch[1] ?? titleMatch[2] ?? url) : url, url, type: 'paper' });
    }
  }

  // GitHub repos
  for (const m of content.matchAll(/https?:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+/g)) {
    const url = m[0].replace(/[)\].,]+$/, '');
    if (!seen.has(url)) {
      seen.add(url);
      const parts = url.split('/');
      items.push({ title: parts.slice(-2).join('/'), url, type: 'repo' });
    }
  }

  // Markdown headings that look like paper titles (heuristic: ## Title with year)
  for (const m of content.matchAll(/^#{2,3}\s+(.{10,120})\s*\(\d{4}\)/gm)) {
    const title = m[1].trim();
    if (!seen.has(title)) {
      seen.add(title);
      items.push({ title, type: 'paper' });
    }
  }

  return items;
}

function _scanFile(filePath: string, today: Date): FreshnessItem[] {
  const content = safeReadFile(filePath);
  if (!content) return [];

  const researchDate = _extractResearchDate(content);
  const citations = _extractCitations(content);

  const refDate = researchDate ? new Date(researchDate) : null;
  const daysSince = refDate
    ? Math.floor((today.getTime() - refDate.getTime()) / 86400000)
    : 999;

  return citations.map((c) => ({
    title: c.title,
    type: c.type,
    url: c.url,
    research_date: researchDate,
    days_since_research: daysSince,
    staleness: _classifyStaleness(daysSince),
    source_file: filePath,
  }));
}

/**
 * CLI command: Check research freshness for a phase or all phases.
 *
 * Reads RESEARCH.md and LANDSCAPE.md files, extracts paper titles and
 * GitHub repo URLs, and flags stale citations with days-since-research.
 */
function cmdFreshness(cwd: string, phaseArg: string | null, raw: boolean): void {
  let milestone: string;
  try {
    milestone = currentMilestone(cwd);
  } catch {
    error('No active milestone found. Run gd init first.');
  }

  const today = new Date();
  const allItems: FreshnessItem[] = [];
  const filePaths: string[] = [];

  if (phaseArg) {
    // Codex r2 P2: numeric phase ids resolve through findPhaseInternal.
    const phaseInfo = findPhaseInternal(cwd, phaseArg);
    if (!phaseInfo || !phaseInfo.found) {
      error(`Phase not found: ${phaseArg}`);
    }
    // Codex r4 P2: directory is cwd-relative.
    // Codex r9 P2: phase research artifacts commonly use prefixed names
    // like `83-RESEARCH.md`. Match both bare and prefixed forms.
    const phaseDir = path.join(cwd, phaseInfo!.directory);
    try {
      for (const f of fs.readdirSync(phaseDir) as string[]) {
        if (f === 'RESEARCH.md' || f === 'LANDSCAPE.md' || /-(RESEARCH|LANDSCAPE)\.md$/.test(f)) {
          filePaths.push(path.join(phaseDir, f));
        }
      }
    } catch { /* skip */ }
  } else {
    // Scan all phases and the milestone research dir
    const resDir = getResearchDir(cwd, milestone!);
    for (const f of ['RESEARCH.md', 'LANDSCAPE.md']) {
      const p = path.join(resDir, f);
      if (fs.existsSync(p)) filePaths.push(p);
    }

    const phasesBase = getPhasesDirPath(cwd, milestone!);
    if (fs.existsSync(phasesBase)) {
      try {
        for (const phaseDir of fs.readdirSync(phasesBase) as string[]) {
          const phaseFull = path.join(phasesBase, phaseDir);
          try {
            for (const f of fs.readdirSync(phaseFull) as string[]) {
              if (f === 'RESEARCH.md' || f === 'LANDSCAPE.md' || /-(RESEARCH|LANDSCAPE)\.md$/.test(f)) {
                filePaths.push(path.join(phaseFull, f));
              }
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
  }

  if (filePaths.length === 0) {
    output({ items: [], stale_count: 0, aging_count: 0, fresh_count: 0, files_scanned: 0 }, raw, 'No RESEARCH.md or LANDSCAPE.md files found');
    return;
  }

  for (const fp of filePaths) {
    allItems.push(..._scanFile(fp, today));
  }

  allItems.sort((a, b) => b.days_since_research - a.days_since_research);

  const result: FreshnessResult = {
    phase: phaseArg ?? undefined,
    items: allItems,
    stale_count: allItems.filter((i) => i.staleness === 'stale').length,
    aging_count: allItems.filter((i) => i.staleness === 'aging').length,
    fresh_count: allItems.filter((i) => i.staleness === 'fresh').length,
    files_scanned: filePaths.length,
  };

  const summary = `${filePaths.length} files: ${result.stale_count} stale, ${result.aging_count} aging, ${result.fresh_count} fresh citations`;
  output(result, raw, summary);
}

module.exports = { cmdFreshness };
