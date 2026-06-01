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
  addDeadEnd: (cwd: string, opts: DeadEndAddOpts) => { action: 'created' | 'updated'; slug: string; total: number };
};

const KNOWHOW_KINDS = new Set(['success_pattern', 'constraint', 'domain_fact', 'tool_pattern']);

interface PromoteDeps {
  appendKnowhowEntries?: (knowhowPath: string, entries: KnowhowEntry[]) => void;
  addDeadEnd?: (cwd: string, opts: DeadEndAddOpts) => { action: 'created' | 'updated'; slug: string; total: number };
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

function selectKnowhowTakeaways(takeaways: Takeaway[]): Takeaway[] {
  return takeaways.filter((t) => KNOWHOW_KINDS.has(t.kind) && t.confidence >= 0.5);
}

function buildDeadEndCalls(
  thread: { id: string }, ledger: Hypothesis[], takeaways: Takeaway[],
): DeadEndAddOpts[] {
  return ledger
    .filter((h) => h.verdict === 'refuted')
    .map((h) => {
      const why = takeaways.find(
        (t) => t.iteration === h.iteration && t.kind === 'failure_root_cause',
      );
      return {
        approach: h.statement,
        phase: `research:${thread.id}#iter${h.iteration}`,
        verdict: 'falsified',
        evidence: [`predicted: ${h.predictedOutcome}`, why ? why.content : 'verdict: refuted'],
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
    const entries = selectKnowhowTakeaways(takeaways).map((t) => takeawayToKnowhow(t, thread.id, opts.iso));
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
