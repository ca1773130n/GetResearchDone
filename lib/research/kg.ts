'use strict';
const fs = require('fs');
const path = require('path');
import type { TesseraeClient } from './tesserae';
const { createCliTesseraeClient } = require('./tesserae') as {
  createCliTesseraeClient: () => TesseraeClient;
};

function kgPath(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id, 'kg.json');
}

function writeKgProvenance(
  cwd: string, id: string, data: { read?: string[]; wrote?: string[] },
): void {
  const p = kgPath(cwd, id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(
    { read: data.read || [], wrote: data.wrote || [], at: new Date().toISOString() }, null, 2));
}

async function syncFindingToKg(
  cwd: string, id: string, _findingPath: string, opts: { client?: TesseraeClient } = {},
): Promise<{ synced: boolean; reason?: string }> {
  const client: TesseraeClient = opts.client || createCliTesseraeClient();
  if (!client.isAvailable()) return { synced: false, reason: 'tesserae sync skipped: CLI not available' };
  const res = await client.compile(cwd, [path.join(cwd, '.planning/research')]);
  return res.status === 'compiled'
    ? { synced: true }
    : { synced: false, reason: `tesserae sync skipped: ${res.status} (${res.detail})` };
}

module.exports = { kgPath, writeKgProvenance, syncFindingToKg };
