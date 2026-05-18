'use strict';

/**
 * Unit tests for lib/research-bundle.ts
 * Tests export/import of research artifacts.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const {
  cmdExportResearch,
  cmdImportResearch,
  _collectResearchFiles,
} = require('../../lib/research-bundle') as {
  cmdExportResearch: (cwd: string, outputPath: string | null, raw: boolean) => void;
  cmdImportResearch: (cwd: string, bundlePath: string, raw: boolean) => void;
  _collectResearchFiles: (cwd: string) => string[];
};

const { captureOutput, captureError } = require('../helpers/setup') as {
  captureOutput: (fn: () => void) => { stdout: string; exitCode: number };
  captureError: (fn: () => void) => { stderr: string; exitCode: number };
};

function makeTmpProject(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-bundle-'));
  fs.mkdirSync(path.join(tmp, '.planning', 'milestones', 'v1.0', 'research'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.planning', 'STATE.md'), '**Milestone:** v1.0 - Test\n', 'utf-8');
  return tmp;
}

function rmTmpProject(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ─── _collectResearchFiles ───────────────────────────────────────────────────

describe('_collectResearchFiles', () => {
  let tmpDir: string;

  afterEach(() => rmTmpProject(tmpDir));

  test('returns empty array when no research files exist', () => {
    tmpDir = makeTmpProject();
    const files = _collectResearchFiles(tmpDir);
    expect(files).toHaveLength(0);
  });

  test('finds LANDSCAPE.md and PAPERS.md in milestone research dir', () => {
    tmpDir = makeTmpProject();
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'research', 'LANDSCAPE.md'),
      '# Landscape\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'research', 'PAPERS.md'),
      '# Papers\n',
      'utf-8'
    );
    const files = _collectResearchFiles(tmpDir);
    expect(files.length).toBe(2);
    expect(files.some((f) => f.includes('LANDSCAPE.md'))).toBe(true);
    expect(files.some((f) => f.includes('PAPERS.md'))).toBe(true);
  });

  test('returns relative paths from cwd', () => {
    tmpDir = makeTmpProject();
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'research', 'KNOWHOW.md'),
      '# KNOWHOW\n',
      'utf-8'
    );
    const files = _collectResearchFiles(tmpDir);
    expect(files.every((f) => !path.isAbsolute(f))).toBe(true);
  });
});

// ─── cmdExportResearch ───────────────────────────────────────────────────────

describe('cmdExportResearch', () => {
  let tmpDir: string;

  afterEach(() => rmTmpProject(tmpDir));

  test('returns error when no research files found', () => {
    tmpDir = makeTmpProject();
    const { stdout, exitCode } = captureOutput(() => cmdExportResearch(tmpDir, null, false));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeDefined();
  });

  test('exports research files to tarball', () => {
    // Skip if tar not available
    const { spawnSync } = require('child_process') as typeof import('child_process');
    const check = spawnSync('tar', ['--version']);
    if (check.status !== 0) return;

    tmpDir = makeTmpProject();
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'research', 'LANDSCAPE.md'),
      '# Landscape\n',
      'utf-8'
    );
    const outPath = path.join(tmpDir, 'test-bundle.tar.gz');

    const { stdout, exitCode } = captureOutput(() =>
      cmdExportResearch(tmpDir, outPath, false)
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.files_packed).toBe(1);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  test('raw mode returns non-empty string on error', () => {
    tmpDir = makeTmpProject();
    const { stdout } = captureOutput(() => cmdExportResearch(tmpDir, null, true));
    expect(stdout.trim().length).toBeGreaterThan(0);
  });
});

// ─── cmdImportResearch ───────────────────────────────────────────────────────

describe('cmdImportResearch', () => {
  let tmpDir: string;

  afterEach(() => rmTmpProject(tmpDir));

  test('errors when bundle path is missing', () => {
    tmpDir = makeTmpProject();
    const { stderr, exitCode } = captureError(() => cmdImportResearch(tmpDir, '', false));
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/bundle path required/i);
  });

  test('errors when bundle file does not exist', () => {
    tmpDir = makeTmpProject();
    const { stderr, exitCode } = captureError(() =>
      cmdImportResearch(tmpDir, '/nonexistent/bundle.tar.gz', false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/not found/i);
  });

  test('imports research files from exported bundle', () => {
    // Skip if tar not available
    const { spawnSync } = require('child_process') as typeof import('child_process');
    const check = spawnSync('tar', ['--version']);
    if (check.status !== 0) return;

    tmpDir = makeTmpProject();
    // First export
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'research', 'LANDSCAPE.md'),
      '# Test Landscape\n',
      'utf-8'
    );
    const bundlePath = path.join(tmpDir, 'test-bundle.tar.gz');
    captureOutput(() => cmdExportResearch(tmpDir, bundlePath, false));

    if (!fs.existsSync(bundlePath)) return; // tar failed, skip

    // Now import into a second project
    const destDir = makeTmpProject();
    try {
      const { stdout, exitCode } = captureOutput(() =>
        cmdImportResearch(destDir, bundlePath, false)
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.files_imported).toBeGreaterThan(0);
      // imported files should exist
      for (const f of parsed.files as string[]) {
        expect(fs.existsSync(path.join(destDir, f))).toBe(true);
      }
      // Attribution header should be present
      const importedFiles = parsed.files as string[];
      if (importedFiles.length > 0) {
        const content = fs.readFileSync(path.join(destDir, importedFiles[0]), 'utf-8');
        expect(content).toContain('imported-research');
      }
    } finally {
      rmTmpProject(destDir);
    }
  });
});
