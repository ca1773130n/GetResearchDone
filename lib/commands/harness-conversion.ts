'use strict';
/**
 * gd harness conversion — auditable self-improvement metrics (adapted from
 * Sibyl-AutoResearch, arXiv 2605.22343): measures whether life-harness lessons
 * actually change later behavior, or only get recorded.
 *
 * Everything is derived deterministically from round artifacts on disk:
 *   .planning/harness/rounds/<id>/RECORD.json   round status / created_at / applied_sha
 *   .planning/harness/rounds/<id>/evidence.md   lessons consumed ("- **kind** (source): content")
 *   .planning/harness/rounds/<id>/patch.json    entries[].path + entries[].evidence_refs
 *   .planning/DEAD-ENDS.md                      dead-end lessons (slug + date)
 *
 * A lesson "converts" when a later APPLIED round's patch references it
 * (evidence_refs) and touches a non-memory path. Memory paths (planning
 * markdown — GENOME, DEAD-ENDS, STATE) are "recorded", not behavior.
 * Harness-policy conversion is the subset whose paths are harness-level
 * policy: the config gates file (.planning/config.json — the harness block
 * and research_gates live there), prompt/command/skill/agent files, or the
 * scheduler.
 *
 * Git is consulted ONLY to verify an applied_sha reached HEAD, via the
 * injectable deps.execGit so tests stay offline and deterministic.
 */
const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');
const { spawnSync: nodeSpawnSync } = require('child_process') as typeof import('child_process');
const { output } = require('../utils') as {
  output: (data: unknown, raw: boolean, rawText?: unknown) => never;
};

interface ExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
interface ConversionDeps {
  /** Injectable git exec (argv-array, never shell-string). Default: spawnSync git. */
  execGit?: (args: string[], cwd: string) => ExecResult;
}

type PathClass = 'memory' | 'config' | 'prompt' | 'scheduler' | 'code';

interface RoundInfo {
  id: string;
  status: string;
  createdAt: string;
  appliedSha: string | null;
  /** Index among evidence-consuming (non-skipped) rounds; skipped rounds share the next live index. */
  liveIndex: number;
}
interface Lesson {
  source: string;
  kind: string;
  content: string;
  firstSeenRound: string;
  firstSeenLive: number;
  firstSeenAt: string;
  seenCount: number;
}
interface PatchEntryLite {
  path: string;
  evidenceRefs: string[];
}
interface PatchLite {
  roundId: string;
  entries: PatchEntryLite[];
  rawText: string;
}
interface ConversionEvent {
  lesson: string;
  kind: string;
  content: string;
  recorded_round: string;
  converted_round: string;
  latency_rounds: number;
  latency_days: number | null;
  paths: string[];
  harness_policy: boolean;
  policy_classes: string[];
  recurring: boolean;
  in_head: boolean | null;
}
interface DeadEndEvent {
  slug: string;
  converted_round: string;
  latency_days: number | null;
  in_head: boolean | null;
}
interface UnconvertedLesson {
  lesson: string;
  kind: string;
  content: string;
  seen_count: number;
  first_seen_round: string;
  /** A patch (applied-but-memory-only, or never-applied) referenced it, yet it still didn't convert. */
  patch_referenced: boolean;
}
interface ConversionReport {
  rounds_total: number;
  rounds_live: number;
  rounds_applied: number;
  lessons_total: number;
  lessons_converted: number;
  conversion_rate: number | null;
  median_latency_rounds: number | null;
  harness_policy: { count: number; recurring_count: number };
  events: ConversionEvent[];
  dead_ends: { total: number; converted: number; events: DeadEndEvent[] };
  top_unconverted: UnconvertedLesson[];
}

const HARNESS_POLICY_CLASSES: ReadonlySet<PathClass> = new Set(['config', 'prompt', 'scheduler']);
const EXCERPT_LEN = 160;
const TOP_UNCONVERTED = 10;

/** Classify a patch path: memory (recorded-only) vs behavior, and which policy class. */
function _classifyPath(p: string): PathClass {
  const n = p.replace(/\\/g, '/').replace(/^\.\//, '');
  if (n === '.planning/config.json') return 'config';
  // GENOME.md / DEAD-ENDS.md / STATE.md and other planning markdown are project
  // memory: a patch that only touches them "recorded" a lesson, it didn't change behavior.
  if (n.startsWith('.planning/') && n.endsWith('.md')) return 'memory';
  // Shared-prompt surfaces. `references/` is here because harness_driver.py's
  // PROPOSAL_INSTRUCTIONS offers it to the round proposer; without it a patch
  // touching the offered surface would be counted as 'code'. `skills/` is
  // deliberately absent — no such tree exists in this repo (W10).
  if (/^(commands|agents|references|hooks)\//.test(n)) return 'prompt';
  if (/^lib\/scheduler[^/]*\.(ts|js)$/.test(n)) return 'scheduler';
  return 'code';
}

/** Parse evidence.md lesson lines: "- **kind** (source): content". */
function _parseEvidenceLessons(md: string): Array<{ kind: string; source: string; content: string }> {
  const out: Array<{ kind: string; source: string; content: string }> = [];
  for (const line of md.split('\n')) {
    const m = /^- \*\*([a-z][a-z-]*)\*\* \(([^)]+)\): (.*)$/.exec(line);
    if (m) out.push({ kind: m[1], source: m[2], content: m[3] });
  }
  return out;
}

/** Parse DEAD-ENDS.md registry entries (```yaml blocks with slug:/date: lines). */
function _parseDeadEnds(md: string): Array<{ slug: string; date: string }> {
  const out: Array<{ slug: string; date: string }> = [];
  for (const block of md.split('```')) {
    if (!/^ya?ml\s*\n/.test(block)) continue;
    const slug = /^slug:\s*["']?([^"'\n]+)["']?\s*$/m.exec(block);
    if (!slug) continue;
    const date = /^date:\s*["']?([^"'\n]+)["']?\s*$/m.exec(block);
    out.push({ slug: slug[1].trim(), date: date ? date[1].trim() : '' });
  }
  return out;
}

function _median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function _daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round(((b - a) / 86400000) * 10) / 10;
}

function _readJson(p: string): Record<string, unknown> | null {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function _loadRounds(roundsDir: string): RoundInfo[] {
  if (!fs.existsSync(roundsDir)) return [];
  const rounds: RoundInfo[] = [];
  let liveCount = 0;
  for (const id of fs.readdirSync(roundsDir).sort()) {
    const rec = _readJson(path.join(roundsDir, id, 'RECORD.json'));
    if (rec === null) continue; // dir without a readable RECORD.json is not a round
    const status = typeof rec.status === 'string' ? rec.status : 'unreadable';
    rounds.push({
      id: typeof rec.round_id === 'string' ? rec.round_id : id,
      status,
      createdAt: typeof rec.created_at === 'string' ? rec.created_at : '',
      appliedSha: typeof rec.applied_sha === 'string' ? rec.applied_sha : null,
      liveIndex: liveCount,
    });
    if (status !== 'skipped') liveCount++;
  }
  return rounds;
}

function _loadPatch(roundsDir: string, roundId: string): PatchLite | null {
  const p = path.join(roundsDir, roundId, 'patch.json');
  const raw = _readJson(p);
  if (raw === null) return null;
  const entries: PatchEntryLite[] = [];
  if (Array.isArray(raw.entries)) {
    for (const e of raw.entries as Array<Record<string, unknown>>) {
      if (typeof e !== 'object' || e === null || typeof e.path !== 'string') continue;
      const refs = Array.isArray(e.evidence_refs)
        ? (e.evidence_refs as unknown[]).filter((r): r is string => typeof r === 'string')
        : [];
      entries.push({ path: e.path, evidenceRefs: refs });
    }
  }
  return { roundId, entries, rawText: fs.readFileSync(p, 'utf-8') };
}

/** Gather lessons from every round's evidence.md, keyed by finding source. */
function _collectLessons(roundsDir: string, rounds: RoundInfo[]): Map<string, Lesson> {
  const lessons = new Map<string, Lesson>();
  for (const r of rounds) {
    const evPath = path.join(roundsDir, r.id, 'evidence.md');
    if (!fs.existsSync(evPath)) continue;
    for (const found of _parseEvidenceLessons(fs.readFileSync(evPath, 'utf-8'))) {
      const existing = lessons.get(found.source);
      if (existing) {
        existing.seenCount++;
      } else {
        lessons.set(found.source, {
          source: found.source,
          kind: found.kind,
          content: found.content.slice(0, EXCERPT_LEN),
          firstSeenRound: r.id,
          firstSeenLive: r.liveIndex,
          firstSeenAt: r.createdAt,
          seenCount: 1,
        });
      }
    }
  }
  return lessons;
}

/** Verify an applied sha is an ancestor of HEAD. null = could not verify (no git, no repo). */
function _verifyInHead(
  execGit: (args: string[], cwd: string) => ExecResult,
  cwd: string,
  sha: string
): boolean | null {
  try {
    const r = execGit(['merge-base', '--is-ancestor', sha, 'HEAD'], cwd);
    if (r.status === 0) return true;
    if (r.status === 1) return false;
    return null;
  } catch {
    return null;
  }
}

/** Compute the full conversion report. Exported for tests. */
function _computeConversion(cwd: string, deps: ConversionDeps = {}): ConversionReport {
  const execGit =
    deps.execGit ??
    ((args: string[], gitCwd: string): ExecResult => {
      const r = nodeSpawnSync('git', args, { cwd: gitCwd, encoding: 'utf-8', timeout: 15000 });
      return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    });

  const roundsDir = path.join(cwd, '.planning', 'harness', 'rounds');
  const rounds = _loadRounds(roundsDir);
  const lessons = _collectLessons(roundsDir, rounds);

  const events: ConversionEvent[] = [];
  const convertedSources = new Set<string>();
  const referencedSources = new Set<string>(); // referenced by ANY patch (applied or not)
  const appliedPatches: Array<{ round: RoundInfo; patch: PatchLite; inHead: boolean | null }> = [];

  for (const round of rounds) {
    const patch = _loadPatch(roundsDir, round.id);
    if (patch === null) continue;
    for (const e of patch.entries) for (const ref of e.evidenceRefs) referencedSources.add(ref);
    // 'applied' rounds count as-is. Review-mode rounds record status
    // 'evaluated' with applied_sha on a harness/round-<id> branch — they count
    // only when that commit provably reached HEAD (the branch was merged).
    // rejected/reverted stay excluded: a reverted sha is still an ancestor of
    // HEAD, but its behavior change was undone.
    if (!round.appliedSha) continue;
    if (round.status === 'applied') {
      appliedPatches.push({ round, patch, inHead: _verifyInHead(execGit, cwd, round.appliedSha) });
    } else if (round.status === 'evaluated') {
      const inHead = _verifyInHead(execGit, cwd, round.appliedSha);
      if (inHead === true) appliedPatches.push({ round, patch, inHead });
    }
  }

  for (const { round, patch, inHead } of appliedPatches) {
    // union of entry paths per referenced lesson
    const perLesson = new Map<string, Set<string>>();
    for (const e of patch.entries) {
      for (const ref of e.evidenceRefs) {
        const set = perLesson.get(ref) ?? new Set<string>();
        set.add(e.path);
        perLesson.set(ref, set);
      }
    }
    for (const [source, pathSet] of perLesson) {
      if (convertedSources.has(source)) continue; // first conversion wins
      const paths = [...pathSet].sort();
      const classes = paths.map(_classifyPath);
      if (classes.every((c) => c === 'memory')) continue; // recorded, not behavior
      let lesson = lessons.get(source);
      if (!lesson) {
        // Referenced by an applied patch but absent from any persisted evidence.md
        // (e.g. older rounds without artifacts): the reference itself proves the
        // lesson was this round's evidence — recorded and converted at t, k=0.
        lesson = {
          source,
          kind: 'unknown',
          content: '',
          firstSeenRound: round.id,
          firstSeenLive: round.liveIndex,
          firstSeenAt: round.createdAt,
          seenCount: 1,
        };
        lessons.set(source, lesson);
      }
      const policyClasses = [...new Set(classes.filter((c) => HARNESS_POLICY_CLASSES.has(c)))].sort();
      convertedSources.add(source);
      events.push({
        lesson: source,
        kind: lesson.kind,
        content: lesson.content,
        recorded_round: lesson.firstSeenRound,
        converted_round: round.id,
        latency_rounds: Math.max(0, round.liveIndex - lesson.firstSeenLive),
        latency_days: _daysBetween(lesson.firstSeenAt, round.createdAt),
        paths,
        harness_policy: policyClasses.length > 0,
        policy_classes: policyClasses,
        recurring: lesson.seenCount >= 2,
        in_head: inHead,
      });
    }
  }

  // Dead-end registry lessons: converted when an applied round's patch text
  // cites the slug (in a rationale / summary / evidence ref / path) AND the
  // patch changed at least one behavior (non-memory) path — a patch that only
  // rewrites .planning/*.md (e.g. re-recording the slug in DEAD-ENDS.md)
  // necessarily contains the slug but is "recorded, not behavior".
  const deadEndEvents: DeadEndEvent[] = [];
  const deadEndsPath = path.join(cwd, '.planning', 'DEAD-ENDS.md');
  const deadEnds = fs.existsSync(deadEndsPath)
    ? _parseDeadEnds(fs.readFileSync(deadEndsPath, 'utf-8'))
    : [];
  for (const de of deadEnds) {
    for (const { round, patch, inHead } of appliedPatches) {
      if (patch.entries.every((e) => _classifyPath(e.path) === 'memory')) continue;
      if (!patch.rawText.includes(de.slug)) continue;
      deadEndEvents.push({
        slug: de.slug,
        converted_round: round.id,
        latency_days: de.date ? _daysBetween(de.date, round.createdAt) : null,
        in_head: inHead,
      });
      break; // first conversion wins
    }
  }

  const unconverted = [...lessons.values()]
    .filter((l) => !convertedSources.has(l.source))
    .sort((a, b) => b.seenCount - a.seenCount || a.firstSeenRound.localeCompare(b.firstSeenRound))
    .slice(0, TOP_UNCONVERTED)
    .map((l): UnconvertedLesson => ({
      lesson: l.source,
      kind: l.kind,
      content: l.content,
      seen_count: l.seenCount,
      first_seen_round: l.firstSeenRound,
      patch_referenced: referencedSources.has(l.source),
    }));

  const lessonsTotal = lessons.size;
  const harnessEvents = events.filter((e) => e.harness_policy);
  return {
    rounds_total: rounds.length,
    rounds_live: rounds.filter((r) => r.status !== 'skipped').length,
    rounds_applied: appliedPatches.length,
    lessons_total: lessonsTotal,
    lessons_converted: convertedSources.size,
    conversion_rate:
      lessonsTotal > 0 ? Math.round((convertedSources.size / lessonsTotal) * 1000) / 1000 : null,
    median_latency_rounds: _median(events.map((e) => e.latency_rounds)),
    harness_policy: {
      count: harnessEvents.length,
      recurring_count: harnessEvents.filter((e) => e.recurring).length,
    },
    events,
    dead_ends: { total: deadEnds.length, converted: deadEndEvents.length, events: deadEndEvents },
    top_unconverted: unconverted,
  };
}

function _renderRaw(r: ConversionReport): string {
  if (r.rounds_total === 0) {
    return 'harness conversion: 0 rounds recorded — run `gd harness round` first\n';
  }
  const pct = r.conversion_rate === null ? 'n/a' : `${(r.conversion_rate * 100).toFixed(1)}%`;
  const lines: string[] = [
    `harness conversion — ${r.rounds_total} round(s), ${r.rounds_live} live, ${r.rounds_applied} applied`,
    `lessons: ${r.lessons_total} seen · ${r.lessons_converted} converted (${pct})` +
      (r.median_latency_rounds === null ? '' : ` · median latency ${r.median_latency_rounds} round(s)`),
    `harness-policy conversions: ${r.harness_policy.count} (${r.harness_policy.recurring_count} recurring)`,
    `dead-ends: ${r.dead_ends.total} recorded · ${r.dead_ends.converted} converted`,
  ];
  if (r.events.length > 0) {
    lines.push('', 'converted:');
    for (const e of r.events) {
      const flags = [
        `k=${e.latency_rounds}`,
        e.harness_policy ? `policy:${e.policy_classes.join('+')}` : 'code',
        e.recurring ? 'recurring' : '',
        e.in_head === false ? 'NOT-IN-HEAD' : '',
      ].filter(Boolean).join(', ');
      lines.push(`  ${e.lesson} → ${e.converted_round} (${flags}) ${e.paths.join(' ')}`);
    }
  }
  if (r.dead_ends.events.length > 0) {
    lines.push('', 'dead-ends converted:');
    for (const d of r.dead_ends.events) {
      const days = d.latency_days === null ? '' : ` after ${d.latency_days}d`;
      lines.push(`  ${d.slug} → ${d.converted_round}${days}`);
    }
  }
  if (r.top_unconverted.length > 0) {
    lines.push('', 'top unconverted lessons:');
    for (const u of r.top_unconverted) {
      const ref = u.patch_referenced ? ' [patch-referenced]' : '';
      lines.push(`  ${u.seen_count}x ${u.kind} ${u.content || u.lesson} (first seen ${u.first_seen_round})${ref}`);
    }
  }
  return lines.join('\n') + '\n';
}

/** gd harness conversion — JSON by default, --raw for human text. */
function cmdHarnessConversion(cwd: string, raw: boolean, deps: ConversionDeps = {}): void {
  const report = _computeConversion(cwd, deps);
  output(report, raw, _renderRaw(report));
}

module.exports = {
  cmdHarnessConversion,
  _computeConversion,
  _classifyPath,
  _parseEvidenceLessons,
  _parseDeadEnds,
  _median,
};
