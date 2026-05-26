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

async function cmdIngest(cwd: string, inputPath: string, raw: boolean): Promise<never> {
  if (!inputPath) error('ingest: a markdown file or directory path is required');
  const res = await ingest(cwd, inputPath);
  return output(res, raw, raw ? JSON.stringify(res) : `ingest: ${res.status} (${res.files} files)\n`);
}

async function cmdSynthesize(cwd: string, topic: string, raw: boolean): Promise<never> {
  if (!topic || !topic.trim())
    error('synthesize: a topic is required, e.g. gd synthesize "retrieval augmented generation"');
  const spawn = defaultSpawn(cwd, loadConfig(cwd));
  const res = await synthesize(cwd, topic, { spawn });
  return output(res, raw, raw ? JSON.stringify(res) : `synthesize: ${res.status} (${res.topicId})\n`);
}

module.exports = { cmdIngest, cmdSynthesize };
