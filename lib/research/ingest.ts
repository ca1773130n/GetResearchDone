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
    // Re-ingesting a changed file: drop the stale prior copy so the full-corpus
    // compile doesn't keep grounding on the obsolete version.
    if (prior && typeof prior.corpusName === 'string') {
      const stale = path.join(corpusDir(cwd), prior.corpusName);
      if (fs.existsSync(stale)) fs.rmSync(stale);
    }
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
  if (compileRes.status !== 'compiled') {
    for (const e of readManifest(manifest) as Array<{ key: string; [k: string]: unknown }>) {
      if (e.status === 'pending') {
        upsertManifest(manifest, String(e.key), { ...e, status: compileRes.status, lastAttemptAt: new Date().toISOString(), nodeIds: [] });
      }
    }
    return { status: compileRes.status, files: files.length, detail: compileRes.detail };
  }
  // compiled: smoke-check EACH changed file individually so a non-retrievable file isn't marked compiled.
  let anyPartial = false;
  for (const e of readManifest(manifest) as Array<{ key: string; [k: string]: unknown }>) {
    if (e.status !== 'pending') continue;
    const smoke = await client.querySmokeCheck(cwd, path.basename(String(e.key), '.md'));
    const fileStatus: TesseraeStatus = smoke.found ? 'compiled' : 'partial';
    if (!smoke.found) anyPartial = true;
    upsertManifest(manifest, String(e.key), { ...e, status: fileStatus, lastAttemptAt: new Date().toISOString(), nodeIds: smoke.nodeIds });
  }
  return { status: anyPartial ? 'partial' : 'compiled', files: files.length, detail: compileRes.detail };
}

module.exports = { ingest, corpusDir, ingestManifest, listMarkdown };
