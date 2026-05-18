'use strict';

/**
 * GRD Research Bundle -- Export and import research artifacts across projects.
 *
 * Packs LANDSCAPE.md, PAPERS.md, KNOWHOW.md, and RESEARCH.md files from
 * .planning/ into a versioned tarball. Import extracts them into
 * .planning/imported/ with a source-attribution header.
 *
 * Depends on: lib/utils.ts (output, error), lib/paths.ts (currentMilestone)
 */

import type { SpawnSyncReturns } from 'child_process';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const { spawnSync } = require('child_process') as typeof import('child_process');

const {
  output,
  error,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('./utils');

const {
  currentMilestone,
}: {
  currentMilestone: (cwd: string) => string;
} = require('./paths');

// ─── Research artifact patterns ──────────────────────────────────────────────

const RESEARCH_FILENAMES = ['LANDSCAPE.md', 'PAPERS.md', 'KNOWHOW.md', 'RESEARCH.md'];
const ATTRIBUTION_HEADER = '<!-- imported-research: do not edit this header -->\n';

// ─── Collect research files ──────────────────────────────────────────────────

/**
 * Walk .planning/ and collect all research artifact paths matching RESEARCH_FILENAMES.
 * Returns paths relative to cwd.
 */
function _collectResearchFiles(cwd: string): string[] {
  const planningDir = path.join(cwd, '.planning');
  const found: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir) as string[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          walk(full);
        } else if (RESEARCH_FILENAMES.includes(entry)) {
          found.push(path.relative(cwd, full));
        }
      } catch {
        // skip unreadable entries
      }
    }
  }

  if (fs.existsSync(planningDir)) walk(planningDir);
  return found;
}

// ─── cmdExportResearch ───────────────────────────────────────────────────────

/**
 * CLI command: Export research artifacts to a versioned tarball.
 *
 * Packs all LANDSCAPE.md, PAPERS.md, KNOWHOW.md, RESEARCH.md files found
 * under .planning/ into a gzip-compressed tarball with a MANIFEST.json inside.
 * Uses the system `tar` binary via spawnSync.
 *
 * @param cwd - Project working directory
 * @param outputPath - Output tarball path (default: ./grd-research-bundle.tar.gz)
 * @param raw - Output raw text instead of JSON
 */
function cmdExportResearch(cwd: string, outputPath: string | null, raw: boolean): void {
  const milestone = currentMilestone(cwd);
  const outFile = outputPath || path.join(cwd, `grd-research-bundle-${milestone}.tar.gz`);

  const files = _collectResearchFiles(cwd);
  if (files.length === 0) {
    output({ error: 'No research files found under .planning/' }, raw, 'no research files found');
    return;
  }

  // Write a MANIFEST.json into a temp location in .planning/
  const manifestPath = path.join(cwd, '.planning', '_research-bundle-manifest.json');
  const manifest = {
    created_at: new Date().toISOString(),
    milestone,
    files,
    grd_version: (() => {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8') as string) as { version?: string };
        return pkg.version ?? 'unknown';
      } catch {
        return 'unknown';
      }
    })(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  const filesToPack = [...files, path.relative(cwd, manifestPath)];

  // Use system tar
  const result: SpawnSyncReturns<Buffer> = spawnSync(
    'tar',
    ['-czf', outFile, '-C', cwd, ...filesToPack],
    { cwd, encoding: 'buffer' }
  );

  // Clean up temp manifest
  try { fs.unlinkSync(manifestPath); } catch { /* ignore */ }

  if (result.status !== 0) {
    const stderr = result.stderr ? result.stderr.toString() : '';
    error(`tar failed (exit ${result.status ?? 'null'}): ${stderr.slice(0, 200)}`);
  }

  output(
    {
      bundle: path.relative(cwd, outFile),
      milestone,
      files_packed: files.length,
      files,
    },
    raw,
    `Exported ${files.length} research files → ${path.relative(cwd, outFile)}`
  );
}

// ─── cmdImportResearch ───────────────────────────────────────────────────────

/**
 * CLI command: Import research artifacts from a tarball into .planning/imported/.
 *
 * Extracts the bundle into a temp directory, reads the MANIFEST.json,
 * copies each research file into .planning/imported/ with a source-attribution
 * header prepended to the file content.
 *
 * @param cwd - Project working directory
 * @param bundlePath - Path to the tarball to import
 * @param raw - Output raw text instead of JSON
 */
function cmdImportResearch(cwd: string, bundlePath: string, raw: boolean): void {
  if (!bundlePath) {
    error('bundle path required. Usage: gd import-research <bundle.tar.gz>');
  }

  const absBundlePath = path.isAbsolute(bundlePath)
    ? bundlePath
    : path.resolve(cwd, bundlePath);

  if (!fs.existsSync(absBundlePath)) {
    error(`Bundle not found: ${absBundlePath}`);
  }

  // Extract to temp dir
  const tmpDir = path.join(cwd, '.planning', '_import-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const extractResult: SpawnSyncReturns<Buffer> = spawnSync(
    'tar',
    ['-xzf', absBundlePath, '-C', tmpDir],
    { cwd, encoding: 'buffer' }
  );

  if (extractResult.status !== 0) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    const stderr = extractResult.stderr ? extractResult.stderr.toString() : '';
    error(`tar extraction failed (exit ${extractResult.status ?? 'null'}): ${stderr.slice(0, 200)}`);
  }

  // Read manifest
  const manifestPath = path.join(tmpDir, '.planning', '_research-bundle-manifest.json');
  let manifest: { files?: string[]; milestone?: string; created_at?: string; grd_version?: string } = {};
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8') as string) as typeof manifest;
  } catch {
    // no manifest — still try to find research files
  }

  const importedDir = path.join(cwd, '.planning', 'imported');
  fs.mkdirSync(importedDir, { recursive: true });

  const filesToImport = manifest.files ?? _collectResearchFiles(tmpDir);
  const imported: string[] = [];

  const absImportedDir = path.resolve(importedDir);
  const absTmpDir = path.resolve(tmpDir);
  for (const relPath of filesToImport) {
    // Reject bundle entries whose path escapes either the staging dir or
    // the destination dir. A malicious bundle could otherwise overwrite
    // arbitrary project files via `../STATE.md` in its manifest
    // (codex r1 P1).
    const srcPath = path.resolve(tmpDir, relPath);
    const destPath = path.resolve(importedDir, relPath);
    if (
      path.relative(absTmpDir, srcPath).startsWith('..') ||
      path.relative(absImportedDir, destPath).startsWith('..') ||
      path.isAbsolute(relPath)
    ) {
      continue;
    }
    if (!fs.existsSync(srcPath)) continue;

    let content: string;
    try {
      content = fs.readFileSync(srcPath, 'utf-8') as string;
    } catch {
      continue;
    }

    // Prepend attribution header (idempotent — skip if already present)
    const bundleRef = path.basename(absBundlePath);
    const sourceHeader = `${ATTRIBUTION_HEADER}<!-- source: ${bundleRef} (milestone: ${manifest.milestone ?? 'unknown'}, exported: ${manifest.created_at ?? 'unknown'}) -->\n\n`;
    const finalContent = content.startsWith(ATTRIBUTION_HEADER)
      ? content
      : sourceHeader + content;

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, finalContent, 'utf-8');
    imported.push(path.relative(cwd, destPath));
  }

  // Clean up temp dir
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

  output(
    {
      bundle: bundlePath,
      source_milestone: manifest.milestone ?? 'unknown',
      files_imported: imported.length,
      import_dir: path.relative(cwd, importedDir),
      files: imported,
    },
    raw,
    `Imported ${imported.length} research files from ${bundlePath} → .planning/imported/`
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  cmdExportResearch,
  cmdImportResearch,
  _collectResearchFiles,
};
