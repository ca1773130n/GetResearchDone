'use strict';
const { output, error, loadConfig } = require('./../utils') as {
  output: (r: unknown, raw: boolean, rawVal?: unknown) => never;
  error: (m: string) => never;
  loadConfig: (cwd: string) => Record<string, unknown>;
};
const { ingest } = require('./ingest') as {
  ingest: (cwd: string, inputPath: string) => Promise<{ status: string; files: number; detail: string }>;
};
const { synthesize } = require('./synthesize') as {
  synthesize: (
    cwd: string,
    topic: string,
    opts: { spawn: (prompt: string, agentType: string) => Promise<string> }
  ) => Promise<{ status: string; topicId: string; docPath: string | null; detail: string }>;
};
const { defaultSpawn } = require('./orchestrator') as {
  defaultSpawn: (
    cwd: string,
    config: Record<string, unknown>,
    model?: string
  ) => (prompt: string, agentType: string) => Promise<string>;
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
  ) => Promise<{ status: string; topicId: string; docPath: string | null; detail: string }>;
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
  return output(res, raw, raw ? JSON.stringify(res) : `synthesize: ${res.status} (${res.topicId})\n`);
}

module.exports = { cmdIngest, cmdSynthesize, statusWarning };
