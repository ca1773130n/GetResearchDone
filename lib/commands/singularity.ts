'use strict';

/**
 * GRD Commands/Singularity — what % of the codebase came from `gd evolve`.
 *
 * Inspired by Aider's "Singularity %" metric (% of the last release written
 * by Aider itself). For GRD, we measure across multiple windows:
 *
 *   - `--since=<ref>` : LOC added in commits between <ref>..HEAD whose
 *                       commit message matches an evolve signature, divided
 *                       by total LOC added in that range.
 *   - `--all`         : entire git history.
 *   - default         : the most recent release tag → HEAD.
 *
 * Evolve signature is any of:
 *   - subject line begins with `feat(evolve` or `fix(evolve`
 *   - body contains `gd evolve` reference or Iteration <N> tag
 *   - body contains `runInfiniteEvolve` cycle reference
 *
 * Output (default JSON, --raw markdown):
 *   {
 *     "window": "v0.3.24..HEAD",
 *     "evolve_commits": 18,
 *     "total_commits": 51,
 *     "evolve_loc_added": 8421,
 *     "total_loc_added": 11203,
 *     "singularity_pct": 75.2
 *   }
 *
 * Data source: parsed from `git log --numstat --pretty=format:%H|%s|%b`. No
 * LLM ran. Deterministic and reproducible.
 *
 * Codex r48 sibling-of-paper-section: this is the metric we promised in
 * docs/ouroboros-loop.md §8.
 */

const cp = require('child_process') as typeof import('child_process');

const {
  output,
  error,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');

interface SingularityReport {
  window: string;
  evolve_commits: number;
  total_commits: number;
  evolve_loc_added: number;
  evolve_loc_removed: number;
  total_loc_added: number;
  total_loc_removed: number;
  singularity_pct: number;
  by_iteration?: Record<string, { commits: number; loc_added: number }>;
}

const EVOLVE_SUBJECT_RE = /^(?:feat|fix|refactor|chore|docs|test)\(evolve(?:-[a-z0-9]+)?\)/i;
const EVOLVE_BODY_RE = /\b(?:gd evolve|runInfiniteEvolve|Iteration\s+\d+|evolve-iter|evolve\s+iteration)\b/i;
const ITERATION_RE = /\b(?:iter(?:ation)?|round)\s+(\d+)\b/i;

function _runGit(args: string[]): string {
  try {
    const r = cp.spawnSync('git', args, {
      encoding: 'utf-8',
      maxBuffer: 128 * 1024 * 1024,
    });
    if (r.status !== 0) return '';
    return (r.stdout ?? '') as string;
  } catch {
    return '';
  }
}

function _resolveWindow(since: string | null, all: boolean): string {
  if (all) return ''; // empty = full history
  if (since) return `${since}..HEAD`;
  // default: most recent tag
  const tag = _runGit(['describe', '--tags', '--abbrev=0']).trim();
  return tag ? `${tag}..HEAD` : '';
}

interface ParsedCommit {
  sha: string;
  subject: string;
  body: string;
  filesAdded: number;
  filesRemoved: number;
  isEvolve: boolean;
  iteration: number | null;
}

function _parseCommits(range: string): ParsedCommit[] {
  // Use a unique record separator unlikely to appear in commit messages.
  const SEP = '\x1eCOMMIT\x1e';
  const FIELD_SEP = '\x1fFIELD\x1f';
  const formatted = `${SEP}%H${FIELD_SEP}%s${FIELD_SEP}%b${FIELD_SEP}`;
  const args = ['log', '--numstat', `--pretty=format:${formatted}`];
  if (range) args.push(range);
  const out = _runGit(args);
  const commits: ParsedCommit[] = [];
  for (const rec of out.split(SEP).filter((r) => r.trim().length > 0)) {
    // The format string ends with a trailing FIELD_SEP, so the record is:
    //   <hash><FIELD_SEP><subject><FIELD_SEP><body><FIELD_SEP><newline><numstat>
    // Split on FIELD_SEP into 4 parts; the 4th is everything after the
    // final FIELD_SEP (newline + numstat lines).
    const parts = rec.split(FIELD_SEP);
    const sha = parts[0]?.trim() ?? '';
    const subject = parts[1] ?? '';
    const body = parts[2] ?? '';
    const numstat = parts[3] ?? '';
    if (!sha) continue;
    let added = 0;
    let removed = 0;
    if (numstat) {
      for (const line of numstat.split('\n')) {
        const m = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
        if (!m) continue;
        const aRaw = m[1];
        const rRaw = m[2];
        if (aRaw === '-' || rRaw === '-') continue; // binary file
        added += parseInt(aRaw, 10) || 0;
        removed += parseInt(rRaw, 10) || 0;
      }
    }
    const isEvolve = EVOLVE_SUBJECT_RE.test(subject) || EVOLVE_BODY_RE.test(body);
    const iterMatch = (subject + ' ' + body).match(ITERATION_RE);
    const iteration = iterMatch ? parseInt(iterMatch[1], 10) : null;
    commits.push({ sha, subject, body, filesAdded: added, filesRemoved: removed, isEvolve, iteration });
  }
  return commits;
}

function _computeReport(window: string, commits: ParsedCommit[], byIter: boolean): SingularityReport {
  let evolveCommits = 0;
  let evolveAdded = 0;
  let evolveRemoved = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  const byIteration: Record<string, { commits: number; loc_added: number }> = {};
  for (const c of commits) {
    totalAdded += c.filesAdded;
    totalRemoved += c.filesRemoved;
    if (c.isEvolve) {
      evolveCommits++;
      evolveAdded += c.filesAdded;
      evolveRemoved += c.filesRemoved;
      if (byIter && c.iteration !== null) {
        const key = String(c.iteration);
        if (!byIteration[key]) byIteration[key] = { commits: 0, loc_added: 0 };
        byIteration[key].commits++;
        byIteration[key].loc_added += c.filesAdded;
      }
    }
  }
  const pct = totalAdded === 0 ? 0 : Math.round((evolveAdded / totalAdded) * 1000) / 10;
  const report: SingularityReport = {
    window: window || '(all-history)',
    evolve_commits: evolveCommits,
    total_commits: commits.length,
    evolve_loc_added: evolveAdded,
    evolve_loc_removed: evolveRemoved,
    total_loc_added: totalAdded,
    total_loc_removed: totalRemoved,
    singularity_pct: pct,
  };
  if (byIter) report.by_iteration = byIteration;
  return report;
}

function _renderMarkdown(r: SingularityReport): string {
  const lines: string[] = [];
  lines.push(`# Singularity Report`);
  lines.push('');
  lines.push(`**Window:** \`${r.window}\``);
  lines.push('');
  lines.push(`**Singularity:** ${r.singularity_pct.toFixed(1)}%`);
  lines.push('');
  lines.push('| Source | Commits | LOC added | LOC removed |');
  lines.push('|---|---:|---:|---:|');
  lines.push(
    `| gd evolve | ${r.evolve_commits} | ${r.evolve_loc_added.toLocaleString()} | ${r.evolve_loc_removed.toLocaleString()} |`
  );
  lines.push(
    `| total | ${r.total_commits} | ${r.total_loc_added.toLocaleString()} | ${r.total_loc_removed.toLocaleString()} |`
  );
  if (r.by_iteration && Object.keys(r.by_iteration).length > 0) {
    lines.push('');
    lines.push('## By iteration');
    lines.push('');
    lines.push('| Iteration | Commits | LOC added |');
    lines.push('|---:|---:|---:|');
    const keys = Object.keys(r.by_iteration).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    for (const k of keys) {
      const { commits, loc_added } = r.by_iteration[k];
      lines.push(`| ${k} | ${commits} | ${loc_added.toLocaleString()} |`);
    }
  }
  lines.push('');
  lines.push(
    '_Computed deterministically from git log. Evolve signature: commit subject starts with `feat(evolve` / `fix(evolve` etc., or body mentions `gd evolve` / `runInfiniteEvolve` / iteration markers._'
  );
  return lines.join('\n');
}

function cmdSingularity(
  cwd: string,
  options: { since?: string | null; all?: boolean; byIteration?: boolean },
  raw: boolean
): void {
  void cwd;
  if (!_runGit(['rev-parse', '--git-dir']).trim()) {
    error('Not a git repository');
  }
  const window = _resolveWindow(options.since ?? null, options.all === true);
  const commits = _parseCommits(window);
  const report = _computeReport(window, commits, options.byIteration === true);
  output(report, raw, _renderMarkdown(report));
}

module.exports = { cmdSingularity, _computeReport, _parseCommits };
