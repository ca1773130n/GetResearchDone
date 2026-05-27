'use strict';
const fs = require('fs');
const path = require('path');

interface ManifestEntry { key: string; [k: string]: unknown; }

function readManifest(manifestPath: string): ManifestEntry[] {
  if (!fs.existsSync(manifestPath)) return [];
  try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ManifestEntry[]; }
  catch { return []; }
}

function upsertManifest(manifestPath: string, key: string, entry: ManifestEntry): void {
  const all = readManifest(manifestPath).filter((e) => e.key !== key);
  all.push(entry);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(all, null, 2));
}

module.exports = { readManifest, upsertManifest };
