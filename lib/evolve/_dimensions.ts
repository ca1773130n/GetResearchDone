'use strict';

/**
 * GRD Evolve -- Core dimension discoverers
 *
 * Five dimension discoverers: productivity, quality, usability,
 * consistency, stability. Plus the defensive wrapper _discoverDimension
 * and the orchestrator analyzeCodebaseForItems.
 *
 * Private helper module -- imported only by ./discovery.ts.
 *
 * @dependencies ./types, ./state (createWorkItem, readLibFileCached)
 */

import type { WorkItem } from './types';

const fs = require('fs');
const path = require('path');
const { safeReadFile } = require('../utils') as {
  safeReadFile: (filePath: string) => string | null;
};
const { createWorkItem, readLibFileCached } = require('./state.ts') as {
  createWorkItem: (
    dimension: string,
    slug: string,
    title: string,
    description: string,
    opts?: { effort?: string; source?: string; status?: string; iteration_added?: number }
  ) => WorkItem;
  readLibFileCached: (filePath: string) => string | null;
};

// ─── Dimension Discoverers ──────────────────────────────────────────────────

/**
 * Discover productivity improvement opportunities.
 * Scans lib/ for long functions, duplicate exports, and missing init workflows.
 */
function discoverProductivityItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');

  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      // Check for long functions (>80 lines)
      const funcPattern =
        /^(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\())/gm;
      let funcMatch: RegExpExecArray | null;
      while ((funcMatch = funcPattern.exec(content)) !== null) {
        const funcName: string = funcMatch[1] || funcMatch[2];
        const startIdx: number = funcMatch.index;
        const startLine: number = content.substring(0, startIdx).split('\n').length;

        let depth: number = 0;
        let foundOpen: boolean = false;
        let endLine: number = startLine;
        const lines: string[] = content.split('\n');
        for (let i = startLine - 1; i < lines.length; i++) {
          const line: string = lines[i];
          for (const ch of line) {
            if (ch === '{') { depth++; foundOpen = true; }
            else if (ch === '}') { depth--; }
          }
          if (foundOpen && depth <= 0) { endLine = i + 1; break; }
        }

        const funcLength: number = endLine - startLine + 1;
        if (funcLength > 80) {
          items.push(
            createWorkItem(
              'productivity',
              `split-${path.basename(file, '.js')}-${funcName}`,
              `Split long function ${funcName} in ${file}`,
              `Function ${funcName} in lib/${file} is ${funcLength} lines long (threshold: 80). Consider splitting into smaller helper functions for readability and maintainability.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return items;
}

/**
 * Discover quality improvement opportunities.
 * Checks for todo/fixme/hack marker comments and missing test files.
 */
function discoverQualityItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');
  const testDir: string = path.join(cwd, 'tests', 'unit');

  try {
    const libFiles: string[] = fs
      .readdirSync(libDir, { withFileTypes: true })
      .filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js'))
      .map((e: { name: string }) => e.name);

    for (const file of libFiles) {
      const testFileName: string = file.replace('.js', '.test.js');
      const testPath: string = path.join(testDir, testFileName);
      try { fs.statSync(testPath); } catch {
        items.push(createWorkItem('quality', `add-tests-${path.basename(file, '.js')}`, `Add test file for ${file}`, `lib/${file} has no corresponding test file at tests/unit/${testFileName}. Add unit tests to ensure code correctness.`, { effort: 'medium' }));
      }

      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;

      const todoPattern = /(?:\/\/|\/?\*+)\s*(TODO|FIXME|HACK)\b[:\s]*(.*)/g;
      let todoMatch: RegExpExecArray | null;
      while ((todoMatch = todoPattern.exec(content)) !== null) {
        const tag: string = todoMatch[1];
        const desc: string = todoMatch[2].trim().substring(0, 80);
        const lineNum: number = content.substring(0, todoMatch.index).split('\n').length;
        const slug: string = `resolve-${tag.toLowerCase()}-${path.basename(file, '.js')}-L${lineNum}`;
        items.push(createWorkItem('quality', slug, `Resolve ${tag} in ${file} line ${lineNum}`, `${tag} comment found in lib/${file} at line ${lineNum}: "${desc}". Review and resolve this marker.`, { effort: 'small' }));
      }
    }
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  try {
    const jestConfigContent: string | null = safeReadFile(path.join(cwd, 'jest.config.js'));
    if (jestConfigContent) {
      const thresholdPattern = /'\.\/lib\/([^']+)':\s*\{[^}]*lines:\s*(\d+)/g;
      let thresholdMatch: RegExpExecArray | null;
      while ((thresholdMatch = thresholdPattern.exec(jestConfigContent)) !== null) {
        const moduleName: string = thresholdMatch[1];
        const linesCoverage: number = parseInt(thresholdMatch[2], 10);
        if (linesCoverage < 90) {
          items.push(createWorkItem('quality', `improve-coverage-${path.basename(moduleName, '.js')}`, `Improve test coverage for ${moduleName}`, `lib/${moduleName} has a coverage threshold of ${linesCoverage}% lines (target: 90%). Increase test coverage to strengthen code quality.`, { effort: 'medium' }));
        }
      }
    }
  } catch { /* jest.config.js not found */ }

  return items;
}

/**
 * Discover usability improvement opportunities.
 */
function discoverUsabilityItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const cmdDir: string = path.join(cwd, 'commands');

  try {
    const cmdFiles: string[] = fs.readdirSync(cmdDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md')).map((e: { name: string }) => e.name);
    for (const file of cmdFiles) {
      const content: string | null = safeReadFile(path.join(cmdDir, file));
      if (!content) continue;
      const fmMatch: RegExpMatchArray | null = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const frontmatter: string = fmMatch[1];
        if (!frontmatter.includes('description:') || frontmatter.match(/description:\s*$/m)) {
          items.push(createWorkItem('usability', `add-description-${path.basename(file, '.md')}`, `Add description to command ${file}`, `Command file commands/${file} is missing a description in its frontmatter. Add a clear description to improve discoverability.`, { effort: 'small' }));
        }
      }
    }
  } catch { /* commands/ directory missing */ }

  const libDir: string = path.join(cwd, 'lib');
  try {
    const libFiles: string[] = fs.readdirSync(libDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')).map((e: { name: string }) => e.name);
    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;
      const exportBlock: RegExpMatchArray | null = content.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
      if (!exportBlock) continue;
      const exportedNames: string[] = exportBlock[1].split(',').map((s: string) => s.trim()).filter(Boolean).map((s: string) => { const m = s.match(/^(\w+)/); return m ? m[1] : ''; }).filter(Boolean);
      for (const name of exportedNames) {
        const funcIdx: number = content.indexOf(`function ${name}(`);
        if (funcIdx === -1) continue;
        const beforeFunc: string = content.substring(0, funcIdx);
        const beforeLines: string[] = beforeFunc.split('\n');
        const startCheck: number = Math.max(0, beforeLines.length - 6);
        const contextLines: string = beforeLines.slice(startCheck).join('\n');
        if (!contextLines.includes('/**')) {
          items.push(createWorkItem('usability', `add-jsdoc-${path.basename(file, '.js')}-${name}`, `Add JSDoc to ${name} in ${file}`, `Exported function ${name} in lib/${file} lacks JSDoc documentation. Add parameter and return type annotations.`, { effort: 'small' }));
        }
      }
    }
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return items;
}

/**
 * Discover consistency improvement opportunities.
 */
function discoverConsistencyItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');

  try {
    const libFiles: string[] = fs.readdirSync(libDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')).map((e: { name: string }) => e.name);
    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;
      if (content.includes('process.exit(')) {
        items.push(createWorkItem('consistency', `remove-process-exit-${path.basename(file, '.js')}`, `Replace process.exit calls in ${file}`, `lib/${file} uses process.exit() directly. Use the error() utility function instead for consistent error handling.`, { effort: 'small' }));
      }
      const firstLines: string = content.split('\n').slice(0, 5).join('\n');
      if (!firstLines.includes('/**')) {
        items.push(createWorkItem('consistency', `add-module-header-${path.basename(file, '.js')}`, `Add module JSDoc header to ${file}`, `lib/${file} is missing the standard JSDoc module header comment at the top of the file.`, { effort: 'small' }));
      }
    }
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return items;
}

/**
 * Discover stability improvement opportunities.
 */
function discoverStabilityItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');

  try {
    const libFiles: string[] = fs.readdirSync(libDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')).map((e: { name: string }) => e.name);
    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;
      const emptyCatchPattern = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
      let catchMatch: RegExpExecArray | null;
      while ((catchMatch = emptyCatchPattern.exec(content)) !== null) {
        const lineNum: number = content.substring(0, catchMatch.index).split('\n').length;
        items.push(createWorkItem('stability', `fix-empty-catch-${path.basename(file, '.js')}-L${lineNum}`, `Handle error in empty catch block in ${file} line ${lineNum}`, `lib/${file} has an empty catch block at line ${lineNum} that silently swallows errors. Add error logging or explicit comment explaining why the error is intentionally ignored.`, { effort: 'small' }));
      }
      if (file !== 'paths.js' && file !== 'evolve.js') {
        const hardcodedPathPattern = /['"]\.planning\//g;
        let pathMatch: RegExpExecArray | null;
        while ((pathMatch = hardcodedPathPattern.exec(content)) !== null) {
          const lineNum: number = content.substring(0, pathMatch.index).split('\n').length;
          items.push(createWorkItem('stability', `use-paths-module-${path.basename(file, '.js')}-L${lineNum}`, `Use paths module instead of hardcoded path in ${file}`, `lib/${file} has a hardcoded ".planning/" path at line ${lineNum}. Use lib/paths.js functions for path resolution to ensure consistency across environments.`, { effort: 'small' }));
        }
      }
    }
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return items;
}

// ─── Orchestration ──────────────────────────────────────────────────────────

/**
 * Run a single dimension discoverer defensively.
 */
function _discoverDimension(name: string, finder: (cwd: string) => WorkItem[], cwd: string): WorkItem[] {
  try {
    return finder(cwd);
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`[evolve] discoverer error (${name}, ${(err as NodeJS.ErrnoException).code}): ${(err as Error).message}\n`);
    }
    return [];
  }
}

/**
 * Analyze the codebase and produce categorized work items across all 7 dimensions.
 */
function analyzeCodebaseForItems(cwd: string): WorkItem[] {
  const { discoverImproveFeatureItems, discoverNewFeatureItems } = require('./_dimensions-features.ts') as {
    discoverImproveFeatureItems: (cwd: string) => WorkItem[];
    discoverNewFeatureItems: (cwd: string) => WorkItem[];
  };

  const discoverers: Array<[string, (cwd: string) => WorkItem[]]> = [
    ['improve-features', discoverImproveFeatureItems],
    ['new-features', discoverNewFeatureItems],
    ['productivity', discoverProductivityItems],
    ['quality', discoverQualityItems],
    ['usability', discoverUsabilityItems],
    ['consistency', discoverConsistencyItems],
    ['stability', discoverStabilityItems],
  ];

  const items: WorkItem[] = [];
  for (const [name, finder] of discoverers) {
    items.push(..._discoverDimension(name, finder, cwd));
  }

  return items;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  discoverProductivityItems,
  discoverQualityItems,
  discoverUsabilityItems,
  discoverConsistencyItems,
  discoverStabilityItems,
  _discoverDimension,
  analyzeCodebaseForItems,
};
