'use strict';
const fs = require('fs');
const path = require('path');
import type { Takeaway, Hypothesis } from './types';
import type { KnowhowEntry } from '../types';
import type { DeadEndAddOpts } from '../dead-ends';

const { appendKnowhowEntries, parseKnowhowEntries } = require('../knowledge') as {
  appendKnowhowEntries: (knowhowPath: string, entries: KnowhowEntry[]) => void;
  parseKnowhowEntries: (content: string) => KnowhowEntry[];
};
const { addDeadEnd } = require('../dead-ends') as {
  // `retired` is optional here only so an injected test double need not supply
  // it; the real writer always returns it. It says the slug was retired by a
  // human and the write left its status alone — the research loop may arm the
  // DEAD-ENDS gate, never disarm or silently re-arm it.
  addDeadEnd: (cwd: string, opts: DeadEndAddOpts) => { action: 'created' | 'updated'; slug: string; total: number; retired?: boolean };
};

const KNOWHOW_KINDS = new Set(['success_pattern', 'constraint', 'domain_fact', 'tool_pattern']);

/**
 * The two verdicts that settle an iteration. `inconclusive` is deliberately absent: it
 * means the experiment measured nothing (the run broke, or the committed metric never
 * appeared), and a takeaway mined from it is coverage, not knowledge.
 */
const SETTLED_VERDICTS = new Set(['supported', 'refuted']);

interface PromoteDeps {
  appendKnowhowEntries?: (knowhowPath: string, entries: KnowhowEntry[]) => void;
  addDeadEnd?: (cwd: string, opts: DeadEndAddOpts) => { action: 'created' | 'updated'; slug: string; total: number; retired?: boolean };
}

function shouldPersistKnowledge(cwd: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_persist_knowledge?: unknown;
    };
    return raw.research_persist_knowledge !== false; // default ON
  } catch {
    return true;
  }
}

function takeawayToKnowhow(t: Takeaway, threadId: string, iso: string): KnowhowEntry {
  return {
    pattern_name: t.content.trim().replace(/\s+/g, ' ').slice(0, 200),
    source: `research:${threadId}#iter${t.iteration}`,
    applicability: t.evidence ? `${t.kind} — ${t.evidence}` : t.kind,
    code_snippet: '',
    phase_number: 0,
    created_at: iso,
  };
}

/**
 * True when the iteration a takeaway was mined from actually recorded a measurement.
 *
 * The artifact is `experiments/<n>/result.json`, written by the orchestrator at MEASURE.
 * A non-empty `metrics` object is what separates an experiment that measured something
 * from one that merely ran. Read off disk rather than taken from the takeaway: the point
 * of the whole gate is that the writing agent's account of its own output is not evidence.
 */
function iterationRecordedMetrics(cwd: string, threadId: string, iteration: number): boolean {
  try {
    const p = path.join(
      cwd, '.planning/research/threads', threadId, 'experiments', String(iteration), 'result.json',
    );
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as { metrics?: Record<string, number> };
    return !!parsed.metrics && typeof parsed.metrics === 'object'
      && Object.keys(parsed.metrics).length > 0;
  } catch {
    return false;
  }
}

/**
 * Which takeaways earn a permanent KNOWHOW entry.
 *
 * Pre-W6 this was `KNOWHOW_KINDS.has(t.kind) && t.confidence >= 0.5` — a float the writing
 * agent invented about its own output, in the same turn, gating a permanent record. The
 * gate is now a conjunction over artifacts already on disk, all three required:
 *
 *   1. the takeaway cites evidence AND its iteration recorded a measurement
 *      (`experiments/<n>/result.json` with a non-empty `metrics`);
 *   2. that iteration reached a SETTLED verdict in the ledger — `supported` or `refuted`,
 *      never `inconclusive`;
 *   3. the same knowledge is not already recorded under that `pattern_name` — enforced
 *      downstream by `appendKnowhowEntries`, which no-ops on unchanged knowledge and
 *      supersedes rather than overwrites on a correction (W6a).
 *
 * The kind filter stays, because it is routing and not self-report: `failure_root_cause`
 * goes to DEAD-ENDS via `buildDeadEndCalls`, and copying it into KNOWHOW would file a
 * failure as advice. `confidence` stays on `Takeaway` as reported metadata; it no longer
 * gates anything.
 *
 * This drops the write rate on purpose. `promoteThreadKnowledge` reports the resulting
 * count; a lower number is the change working, not a regression to be tuned away.
 */
function selectKnowhowTakeaways(
  cwd: string, threadId: string, takeaways: Takeaway[], ledger: Hypothesis[],
): Takeaway[] {
  const settled = new Set(
    ledger.filter((h) => h.verdict && SETTLED_VERDICTS.has(h.verdict)).map((h) => h.iteration),
  );
  return takeaways.filter(
    (t) => KNOWHOW_KINDS.has(t.kind)
      && (t.evidence || '').trim().length > 0
      && settled.has(t.iteration)
      && iterationRecordedMetrics(cwd, threadId, t.iteration),
  );
}

/**
 * One DEAD-ENDS entry per refuted hypothesis. The evidence line records, in order: what the
 * hypothesis PREDICTED, the observation that would REFUTE it (W2 — present only on hypotheses
 * minted from v0.5.0 onward; a pre-0.5.0 ledger entry has no `refutationCondition` and yields
 * the original two-element line unchanged), and the root cause takeaway for the same iteration,
 * falling back to a bare verdict when no such takeaway exists.
 */
function buildDeadEndCalls(
  thread: { id: string }, ledger: Hypothesis[], takeaways: Takeaway[],
): DeadEndAddOpts[] {
  return ledger
    .filter((h) => h.verdict === 'refuted')
    .map((h) => {
      const why = takeaways.find(
        (t) => t.iteration === h.iteration && t.kind === 'failure_root_cause',
      );
      const refutation = (h.refutationCondition || '').trim();
      return {
        approach: h.statement,
        phase: `research:${thread.id}#iter${h.iteration}`,
        verdict: 'falsified',
        evidence: [
          `predicted: ${h.predictedOutcome}`,
          ...(refutation ? [`refuted when: ${refutation}`] : []),
          why ? why.content : 'verdict: refuted',
        ],
      };
    });
}

function promoteThreadKnowledge(
  cwd: string, thread: { id: string }, takeaways: Takeaway[], ledger: Hypothesis[],
  opts: { iso: string; deps?: PromoteDeps },
): { knowhowAdded: number; deadEndsAdded: number; skipped: boolean } {
  if (!shouldPersistKnowledge(cwd)) return { knowhowAdded: 0, deadEndsAdded: 0, skipped: true };
  const appendKh = opts.deps?.appendKnowhowEntries || appendKnowhowEntries;
  const addDe = opts.deps?.addDeadEnd || addDeadEnd;
  try {
    const knowhowPath = path.join(cwd, 'KNOWHOW.md');
    const before = fs.existsSync(knowhowPath)
      ? parseKnowhowEntries(fs.readFileSync(knowhowPath, 'utf8')).length : 0;
    const eligible = selectKnowhowTakeaways(cwd, thread.id, takeaways, ledger);
    // Say out loud when the artifact gate rejected takeaways the old confidence gate
    // would have written, so the drop reads as the gate working rather than as a bug.
    const candidates = takeaways.filter((t) => KNOWHOW_KINDS.has(t.kind)).length;
    if (candidates > eligible.length) {
      process.stderr.write(
        `[research] KNOWHOW gate: ${eligible.length}/${candidates} takeaways backed by ` +
        `a settled verdict and a recorded measurement\n`,
      );
    }
    const entries = eligible.map((t) => takeawayToKnowhow(t, thread.id, opts.iso));
    appendKh(knowhowPath, entries);
    const after = fs.existsSync(knowhowPath)
      ? parseKnowhowEntries(fs.readFileSync(knowhowPath, 'utf8')).length : 0;

    let deadEndsAdded = 0;
    for (const call of buildDeadEndCalls(thread, ledger, takeaways)) {
      if (addDe(cwd, call).action === 'created') deadEndsAdded += 1;
    }
    return { knowhowAdded: after - before, deadEndsAdded, skipped: false };
  } catch (e: unknown) {
    process.stderr.write(
      `[research] knowledge promotion failed (degraded): ${e instanceof Error ? e.message : String(e)}\n`,
    );
    return { knowhowAdded: 0, deadEndsAdded: 0, skipped: false };
  }
}

module.exports = {
  shouldPersistKnowledge, takeawayToKnowhow, selectKnowhowTakeaways, buildDeadEndCalls,
  promoteThreadKnowledge,
};
