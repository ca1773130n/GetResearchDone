'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { Candidate } from './synthesize';
import type { Hypothesis } from './types';
const { createThread, listThreads } = require('./thread') as {
  createThread: (cwd: string, question: string, opts: Record<string, unknown>) => { id: string };
  listThreads: (cwd: string) => Array<{ id: string; seededFrom?: { seedKey?: string } }>;
};
const { appendHypothesis } = require('./ledger') as {
  appendHypothesis: (cwd: string, id: string, h: Hypothesis) => void;
};
const { readManifest, upsertManifest } = require('./manifest') as {
  readManifest: (p: string) => Array<{ key: string; [k: string]: unknown }>;
  upsertManifest: (p: string, key: string, entry: { key: string; [k: string]: unknown }) => void;
};

export interface SeedResult { rank: number; threadId: string; seedKey: string; newlySeeded: boolean; }
interface SeedOpts { maxCandidates?: number; }

function seedManifestPath(cwd: string): string {
  return path.join(cwd, '.planning/research/seed-manifest.json');
}
function seedKeyFor(synthKey: string, statement: string): string {
  return crypto.createHash('sha256').update(`${synthKey}|${statement}`).digest('hex');
}

/**
 * Create one seeded research thread per candidate (capped at maxCandidates, default 3).
 * Idempotent: a candidate already seeded for this synthKey is skipped, detected via the
 * seed manifest (fast path) or a listThreads scan on seededFrom.seedKey (crash-safe path).
 * Returns ranked results; never auto-runs (the caller decides).
 */
function seedThreadsFromCandidates(
  cwd: string, topicId: string, synthKey: string, candidates: Candidate[], opts: SeedOpts = {},
): SeedResult[] {
  const cap = opts.maxCandidates ?? 3;
  const manifestPath = seedManifestPath(cwd);
  const manifest = readManifest(manifestPath);
  const seededKeys = new Set(manifest.map((e) => String(e.key)));
  const threads = listThreads(cwd);
  const threadKeys = new Set(
    threads.map((t) => t.seededFrom && t.seededFrom.seedKey).filter(Boolean) as string[],
  );
  const results: SeedResult[] = [];

  for (const c of candidates.slice(0, cap)) {
    const seedKey = seedKeyFor(synthKey, c.statement);
    const existing = manifest.find((e) => String(e.key) === seedKey);
    if (seededKeys.has(seedKey) && existing) {
      results.push({ rank: c.rank, threadId: String(existing.threadId), seedKey, newlySeeded: false });
      continue;
    }
    if (threadKeys.has(seedKey)) {
      const t = threads.find((x) => x.seededFrom && x.seededFrom.seedKey === seedKey);
      results.push({ rank: c.rank, threadId: t ? t.id : '', seedKey, newlySeeded: false });
      continue;
    }
    const thread = createThread(cwd, c.statement, {
      seededFrom: { synthesisTopicId: topicId, sourceNodeIds: c.sourceNodeIds, seedKey },
    });
    const hyp: Hypothesis = {
      id: 'h1', iteration: 1, statement: c.statement, rationale: c.rationale,
      predictedOutcome: c.predictedOutcome, status: 'testing', parentId: null, verdict: null,
      origin: 'synthesis', sourceNodeIds: c.sourceNodeIds,
    };
    appendHypothesis(cwd, thread.id, hyp);
    upsertManifest(manifestPath, seedKey, {
      key: seedKey, topicId, synthKey, rank: c.rank, threadId: thread.id,
      statement: c.statement, seededAt: new Date().toISOString(),
    });
    results.push({ rank: c.rank, threadId: thread.id, seedKey, newlySeeded: true });
  }
  return results.sort((a, b) => a.rank - b.rank);
}

module.exports = { seedThreadsFromCandidates, seedKeyFor, seedManifestPath };
