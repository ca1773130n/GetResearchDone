'use strict';
const fs = require('fs');
const path = require('path');
import type { Takeaway, Hypothesis } from './types';
import type { KnowhowEntry } from '../types';
import type { DeadEndAddOpts } from '../dead-ends';

const KNOWHOW_KINDS = new Set(['success_pattern', 'constraint', 'domain_fact', 'tool_pattern']);

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

module.exports = {
  shouldPersistKnowledge, takeawayToKnowhow, selectKnowhowTakeaways, buildDeadEndCalls,
};
