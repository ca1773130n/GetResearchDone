'use strict';
const { output, error, loadConfig } = require('./../utils') as {
  output: (r: unknown, raw: boolean, rawVal?: unknown) => never;
  error: (m: string) => never;
  loadConfig: (cwd: string) => Record<string, unknown>;
};
const { ingest } = require('./ingest') as {
  ingest: (cwd: string, inputPath: string) => Promise<{ status: string; files: number; detail: string }>;
};
interface SynthCandidate { rank: number; statement: string; rationale: string; predictedOutcome: string; sourceNodeIds: string[]; }
interface SynthResult { status: string; topicId: string; docPath: string | null; detail: string; candidates: SynthCandidate[]; }
const { synthesize } = require('./synthesize') as {
  synthesize: (
    cwd: string,
    topic: string,
    opts: { spawn: (prompt: string, agentType: string) => Promise<string> }
  ) => Promise<SynthResult>;
};
const { defaultSpawn, resumeResearch } = require('./orchestrator') as {
  defaultSpawn: (
    cwd: string,
    config: Record<string, unknown>,
    model?: string
  ) => (prompt: string, agentType: string) => Promise<string>;
  resumeResearch: (cwd: string, id: string, opts: Record<string, unknown>) => Promise<{ threadId: string; status: string }>;
};
const { seedThreadsFromCandidates } = require('./seed') as {
  seedThreadsFromCandidates: (
    cwd: string, topicId: string, synthKey: string,
    candidates: SynthCandidate[], opts: { maxCandidates?: number },
  ) => Array<{ rank: number; threadId: string; seedKey: string; newlySeeded: boolean }>;
};

/**
 * Returns a loud warning string when a compile produced no retrievable nodes (Spec §9).
 * Returns null for statuses that need no warning.
 */
function statusWarning(status: string, detail: string): string | null {
  if (status === 'partial') {
    return `Warning: compiled but content is not retrievable yet (the research loop may ground on nothing): ${detail}`;
  }
  return null;
}

interface IngestDeps {
  ingest?: (cwd: string, inputPath: string) => Promise<{ status: string; files: number; detail: string }>;
}

async function cmdIngest(cwd: string, inputPath: string, raw: boolean, deps: IngestDeps = {}): Promise<never> {
  if (!inputPath) error('ingest: a markdown file or directory path is required');
  const run = deps.ingest || ingest;
  const res = await run(cwd, inputPath);
  const warn = statusWarning(res.status, res.detail);
  if (warn) process.stderr.write(warn + '\n');
  if (res.status === 'compile_failed') error(`ingest: compile failed — ${res.detail}`);
  return output(res, raw, raw ? JSON.stringify(res) : `ingest: ${res.status} (${res.files} files)\n`);
}

interface SynthDeps {
  synthesize?: (
    cwd: string,
    topic: string,
    opts: { spawn: (prompt: string, agentType: string) => Promise<string> }
  ) => Promise<SynthResult>;
  resumeRunner?: (cwd: string, id: string, opts: Record<string, unknown>) => Promise<{ threadId: string; status: string }>;
}

async function cmdSynthesize(cwd: string, topic: string, raw: boolean, deps: SynthDeps = {}): Promise<never> {
  if (!topic || !topic.trim())
    error('synthesize: a topic is required, e.g. gd synthesize "retrieval augmented generation"');
  const run = deps.synthesize || synthesize;
  const spawn = defaultSpawn(cwd, loadConfig(cwd));
  const res = await run(cwd, topic, { spawn });
  const warn = statusWarning(res.status, res.detail);
  if (warn) process.stderr.write(warn + '\n');
  if (res.status === 'compile_failed') error(`synthesize: failed — ${res.detail}`);

  // SP2-C: seed one thread per candidate, then auto-run only the #1-ranked (if newly seeded).
  let seeded: Array<{ rank: number; threadId: string; newlySeeded: boolean }> = [];
  if (res.candidates && res.candidates.length > 0) {
    const cfg = loadConfig(cwd) as { research_max_candidates?: number };
    const maxCandidates = Number(cfg.research_max_candidates ?? 3);
    // res.topicId is the stable synthKey component: seedKey = sha256(topicId | statement).
    seeded = seedThreadsFromCandidates(cwd, res.topicId, res.topicId, res.candidates, { maxCandidates });
    const minRank = Math.min(...seeded.map((s) => s.rank));
    const rank1 = seeded.find((s) => s.rank === minRank);
    if (rank1 && rank1.newlySeeded) {
      const resume = deps.resumeRunner || resumeResearch;
      await resume(cwd, rank1.threadId, { spawn });
    }
  }
  const autoRan = seeded.some((s) => s.newlySeeded) ? 1 : 0;
  const payload = { ...res, seeded };
  const summary = `synthesize: ${res.status} (${res.topicId}) — seeded ${seeded.length}, auto-ran ${autoRan}\n`;
  return output(payload, raw, raw ? JSON.stringify(payload) : summary);
}

module.exports = { cmdIngest, cmdSynthesize, statusWarning };
