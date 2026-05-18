'use strict';

/** GRD Commands/KnowhowSearch -- Keyword search across all milestone KNOWHOW.md files */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  output,
  error,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (msg: string) => never;
} = require('../utils');

const {
  parseKnowhowEntries,
}: {
  parseKnowhowEntries: (content: string) => import('../types').KnowhowEntry[];
} = require('../knowledge');

import type { KnowhowEntry } from '../types';

interface KnowhowSearchHit {
  pattern_name: string;
  milestone: string;
  source: string;
  applicability: string;
  code_snippet: string;
  phase_number: number;
  created_at: string;
  score: number;
}

interface KnowhowSearchResult {
  query: string;
  total_searched: number;
  hits: number;
  results: KnowhowSearchHit[];
}

function _tokenize(text: string): string[] {
  return text.toLowerCase().split(/\W+/).filter((t) => t.length > 1);
}

function _score(entry: KnowhowEntry, queryTokens: string[]): number {
  const haystack = [entry.pattern_name, entry.applicability, entry.source, entry.code_snippet]
    .join(' ')
    .toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) score += 1;
    // Bonus for exact match in pattern name
    if (entry.pattern_name.toLowerCase().includes(token)) score += 1;
  }
  return score;
}

/**
 * CLI command: Search all KNOWHOW.md files across milestones for entries matching query.
 */
function cmdKnowhowSearch(cwd: string, query: string, topN: number, raw: boolean): void {
  if (!query || !query.trim()) {
    error('query required. Usage: gd knowledge search <query> [--top N]');
  }

  const milestonesBase = path.join(cwd, '.planning', 'milestones');
  if (!fs.existsSync(milestonesBase)) {
    output({ query, total_searched: 0, hits: 0, results: [] } as KnowhowSearchResult, raw, '0');
    return;
  }

  const queryTokens = _tokenize(query);
  const hits: KnowhowSearchHit[] = [];
  let totalSearched = 0;

  let msDirs: string[];
  try {
    msDirs = fs
      .readdirSync(milestonesBase, { withFileTypes: true })
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
  } catch {
    msDirs = [];
  }

  for (const ms of msDirs) {
    const knowhowPath = path.join(milestonesBase, ms, 'KNOWHOW.md');
    let content: string;
    try {
      content = fs.readFileSync(knowhowPath, 'utf-8');
    } catch {
      continue;
    }

    const entries = parseKnowhowEntries(content);
    totalSearched += entries.length;

    for (const entry of entries) {
      const score = _score(entry, queryTokens);
      if (score > 0) {
        hits.push({
          pattern_name: entry.pattern_name,
          milestone: ms,
          source: entry.source,
          applicability: entry.applicability,
          code_snippet: entry.code_snippet,
          phase_number: entry.phase_number,
          created_at: entry.created_at,
          score,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score || b.phase_number - a.phase_number);
  const results = hits.slice(0, topN > 0 ? topN : 10);

  const result: KnowhowSearchResult = {
    query,
    total_searched: totalSearched,
    hits: hits.length,
    results,
  };

  if (raw) {
    const lines = [`Knowledge search: "${query}" — ${hits.length} hit(s) of ${totalSearched} entries`];
    for (const r of results) {
      lines.push(`[${r.milestone}/phase ${r.phase_number}] ${r.pattern_name} (score: ${r.score})`);
      lines.push(`  ${r.applicability}`);
    }
    output(result, raw, lines.join('\n'));
  } else {
    output(result, raw, `${hits.length} hits`);
  }
}

module.exports = { cmdKnowhowSearch };
