'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { TesseraeClient, TesseraeStatus } from './tesserae';
const { createCliTesseraeClient } = require('./tesserae');
const { readManifest, upsertManifest } = require('./manifest');

export interface IngestResult {
  status: TesseraeStatus;
  files: number;
  detail: string;
}

interface IngestOpts {
  client?: TesseraeClient;
}

function corpusDir(cwd: string): string {
  return path.join(cwd, '.planning/research/corpus');
}

function ingestManifest(cwd: string): string {
  return path.join(cwd, '.planning/research/ingest/manifest.json');
}

function listMarkdown(input: string): string[] {
  const stat = fs.statSync(input) as { isFile(): boolean };
  if (stat.isFile()) return input.endsWith('.md') ? [input] : [];
  return (fs.readdirSync(input) as string[])
    .filter((f: string) => f.endsWith('.md'))
    .map((f: string) => path.join(input, f));
}

async function ingest(cwd: string, inputPath: string, opts: IngestOpts = {}): Promise<IngestResult> {
  const client: TesseraeClient = opts.client || (createCliTesseraeClient() as TesseraeClient);

  if (!client.isAvailable()) {
    return { status: 'skipped_no_tesserae', files: 0, detail: 'tesserae unavailable' };
  }

  const files = listMarkdown(inputPath);
  fs.mkdirSync(corpusDir(cwd), { recursive: true });
  const manifest = ingestManifest(cwd);
  const existing = readManifest(manifest) as Array<{ key: string; hash?: string; status?: string; corpusName?: string }>;
  const graphExists = fs.existsSync(path.join(cwd, '.tesserae', 'graph.json'));

  let changed = 0;
  for (const file of files) {
    const bytes = fs.readFileSync(file) as Buffer;
    const hash = crypto.createHash('sha256').update(bytes).digest('hex') as string;
    const sourcePath = file.startsWith(cwd) ? path.relative(cwd, file) : file;
    const prior = existing.find((e) => e.key === sourcePath);
    if (graphExists && prior && prior.hash === hash && prior.status === 'compiled') continue;
    const corpusName = `${hash.slice(0, 12)}-${path.basename(file)}`;
    fs.copyFileSync(file, path.join(corpusDir(cwd), corpusName));
    upsertManifest(manifest, sourcePath, {
      key: sourcePath,
      hash,
      corpusName,
      status: 'pending',
      lastAttemptAt: new Date().toISOString(),
      nodeIds: [],
    });
    changed++;
  }

  if (changed === 0) {
    return { status: 'compiled', files: files.length, detail: 'no changes (idempotent)' };
  }

  const compileRes = await client.compile(cwd, [corpusDir(cwd)]);
  let status: TesseraeStatus = compileRes.status;
  let nodeIds: string[] = [];

  if (compileRes.status === 'compiled') {
    const smoke = await client.querySmokeCheck(cwd, path.basename(files[0], '.md'));
    nodeIds = smoke.nodeIds;
    if (!smoke.found) status = 'partial';
  }

  const updated = readManifest(manifest) as Array<{ key: string; [k: string]: unknown }>;
  for (const e of updated) {
    if (e.status === 'pending') {
      upsertManifest(manifest, String(e.key), {
        ...e,
        status,
        lastAttemptAt: new Date().toISOString(),
        nodeIds,
      });
    }
  }

  return { status, files: files.length, detail: compileRes.detail };
}

module.exports = { ingest, corpusDir, ingestManifest, listMarkdown };
