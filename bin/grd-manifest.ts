#!/usr/bin/env node

/**
 * GRD Manifest — SHA256-based file tracking for self-update system
 *
 * Usage: node grd-manifest.js <command>
 *
 * Commands:
 *   generate                    Generate grd-file-manifest.json with SHA256 hashes
 *   detect                      Detect local modifications vs manifest
 *   save-patches [--dir path]   Save modified files to grd-local-patches/
 *   load-patches [--dir path]   Read patch backup metadata
 */

'use strict';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const crypto = require('crypto') as typeof import('crypto');

const MANIFEST_FILE = 'grd-file-manifest.json';
const PATCH_DIR = 'grd-local-patches';
const BACKUP_META = 'backup-meta.json';

// Files/dirs to exclude from manifest
const EXCLUDE: ReadonlySet<string> = new Set([
  MANIFEST_FILE,
  PATCH_DIR,
  '.git',
  'node_modules',
  '.DS_Store',
]);

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface ManifestData {
  version: string;
  timestamp: string;
  file_count: number;
  files: Record<string, string>;
}

interface Modification {
  file: string;
  expected: string;
  actual: string;
}

interface DetectionResult {
  error?: string;
  version?: string;
  total_tracked?: number;
  modifications: Modification[];
  additions: string[];
  deletions: string[];
  clean: boolean;
}

interface PatchSaveResult {
  saved: boolean;
  reason?: string;
  error?: string;
  patch_dir?: string;
  from_version?: string;
  timestamp?: string;
  files?: string[];
  additions?: string[];
  deletions?: string[];
}

interface PatchLoadResult {
  found: boolean;
  reason?: string;
  patch_dir?: string;
  from_version?: string;
  timestamp?: string;
  files?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPluginRoot(): string {
  return path.dirname(__dirname);
}

function sha256(filePath: string): string {
  const content: Buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function walkDir(dir: string, base: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDE.has(entry.name)) continue;
    const fullPath: string = path.join(dir, entry.name);
    const relPath: string = path.relative(base, fullPath);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, base));
    } else if (entry.isFile()) {
      results.push(relPath);
    }
  }
  return results.sort();
}

function readVersion(pluginRoot: string): string {
  const versionFile: string = path.join(pluginRoot, 'VERSION');
  if (fs.existsSync(versionFile)) {
    return fs.readFileSync(versionFile, 'utf-8').trim();
  }
  return 'unknown';
}

// ─── Commands ────────────────────────────────────────────────────────────────

function generateManifest(pluginRoot: string): ManifestData {
  const files: string[] = walkDir(pluginRoot, pluginRoot);
  const hashes: Record<string, string> = {};
  for (const file of files) {
    const fullPath: string = path.join(pluginRoot, file);
    hashes[file] = sha256(fullPath);
  }

  const manifest: ManifestData = {
    version: readVersion(pluginRoot),
    timestamp: new Date().toISOString(),
    file_count: Object.keys(hashes).length,
    files: hashes,
  };

  const manifestPath: string = path.join(pluginRoot, MANIFEST_FILE);
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8'
  );
  return manifest;
}

function detectModifications(pluginRoot: string): DetectionResult {
  const manifestPath: string = path.join(pluginRoot, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    return {
      error: 'No manifest found. Run: node bin/grd-manifest.js generate',
      modifications: [],
      additions: [],
      deletions: [],
      clean: false,
    };
  }

  const manifest: ManifestData = JSON.parse(
    fs.readFileSync(manifestPath, 'utf-8')
  );
  const modifications: Modification[] = [];
  const additions: string[] = [];
  const deletions: string[] = [];

  // Check existing manifest entries
  for (const [file, expectedHash] of Object.entries(manifest.files)) {
    const fullPath: string = path.join(pluginRoot, file);
    if (!fs.existsSync(fullPath)) {
      deletions.push(file);
    } else {
      const currentHash: string = sha256(fullPath);
      if (currentHash !== expectedHash) {
        modifications.push({
          file,
          expected: expectedHash,
          actual: currentHash,
        });
      }
    }
  }

  // Check for new files
  const currentFiles: string[] = walkDir(pluginRoot, pluginRoot);
  for (const file of currentFiles) {
    if (!manifest.files[file]) {
      additions.push(file);
    }
  }

  return {
    version: manifest.version,
    total_tracked: Object.keys(manifest.files).length,
    modifications,
    additions,
    deletions,
    clean:
      modifications.length === 0 &&
      additions.length === 0 &&
      deletions.length === 0,
  };
}

function savePatches(
  pluginRoot: string,
  patchDirOverride?: string | null
): PatchSaveResult {
  const detection: DetectionResult = detectModifications(pluginRoot);
  if (detection.error) return { saved: false, error: detection.error };
  if (detection.clean) return { saved: false, reason: 'No modifications detected' };

  const patchDir: string =
    patchDirOverride || path.join(pluginRoot, PATCH_DIR);
  fs.mkdirSync(patchDir, { recursive: true });

  const savedFiles: string[] = [];

  for (const mod of detection.modifications) {
    const srcPath: string = path.join(pluginRoot, mod.file);
    const destPath: string = path.join(patchDir, mod.file);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    savedFiles.push(mod.file);
  }

  const meta = {
    from_version: detection.version,
    timestamp: new Date().toISOString(),
    files: savedFiles,
    additions: detection.additions,
    deletions: detection.deletions,
  };

  fs.writeFileSync(
    path.join(patchDir, BACKUP_META),
    JSON.stringify(meta, null, 2) + '\n',
    'utf-8'
  );

  return { saved: true, patch_dir: patchDir, ...meta };
}

function loadPatches(
  pluginRoot: string,
  patchDirOverride?: string | null
): PatchLoadResult {
  const patchDir: string =
    patchDirOverride || path.join(pluginRoot, PATCH_DIR);
  const metaPath: string = path.join(patchDir, BACKUP_META);

  if (!fs.existsSync(metaPath)) {
    return { found: false, reason: `No patches found at ${patchDir}` };
  }

  const meta: { from_version?: string; timestamp?: string; files?: string[] } =
    JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  return { found: true, patch_dir: patchDir, ...meta };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

function main(): void {
  const args: string[] = process.argv.slice(2);
  const command: string | undefined = args[0];
  const pluginRoot: string = getPluginRoot();

  const dirIndex: number = args.indexOf('--dir');
  const dirOverride: string | null =
    dirIndex !== -1 ? args[dirIndex + 1] : null;

  let result:
    | ManifestData
    | DetectionResult
    | PatchSaveResult
    | PatchLoadResult;

  switch (command) {
    case 'generate':
      result = generateManifest(pluginRoot);
      console.log(
        JSON.stringify(
          {
            status: 'ok',
            version: (result as ManifestData).version,
            file_count: (result as ManifestData).file_count,
            path: path.join(pluginRoot, MANIFEST_FILE),
          },
          null,
          2
        )
      );
      break;

    case 'detect':
      result = detectModifications(pluginRoot);
      console.log(JSON.stringify(result, null, 2));
      if ((result as DetectionResult).error) process.exit(1);
      break;

    case 'save-patches':
      result = savePatches(pluginRoot, dirOverride);
      console.log(JSON.stringify(result, null, 2));
      if ((result as PatchSaveResult).error) process.exit(1);
      break;

    case 'load-patches':
      result = loadPatches(pluginRoot, dirOverride);
      console.log(JSON.stringify(result, null, 2));
      break;

    default:
      console.error(
        'Usage: node grd-manifest.js <generate|detect|save-patches|load-patches>'
      );
      process.exit(1);
  }
}

main();
