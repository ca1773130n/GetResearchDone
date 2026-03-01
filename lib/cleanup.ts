/**
 * GRD Phase Cleanup — Config schema handling and quality analysis functions
 *
 * Provides config reading for the phase_cleanup section, and quality analysis
 * functions for ESLint complexity, dead export detection, file size checks,
 * doc drift detection (changelog staleness, broken README links, JSDoc mismatches),
 * test coverage gap detection, export consistency checking, CLAUDE.md doc staleness
 * detection, and config schema drift analysis.
 * These are the data-layer operations wired into phase completion by Plan 13-02.
 */

'use strict';

import type { RunCache, CleanupConfig, QualityAnalysisSummary } from './types';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { planningDir: getPlanningDir, phasesDir: getPhasesDirPath } = require('./paths');
const { safeReadFile, safeReadJSON, createRunCache, walkJsFiles } = require('./utils');

// ─── Domain Types ─────────────────────────────────────────────────────────────

/** A complexity violation found by ESLint analysis. */
interface ComplexityViolation {
  file: string;
  line: number;
  functionName: string;
  complexity: number;
}

/** A dead export found during export analysis. */
interface DeadExportViolation {
  file: string;
  exportName: string;
  line: number;
}

/** A file size violation. */
interface FileSizeViolation {
  file: string;
  lines: number;
  threshold: number;
}

/** A changelog drift violation. */
interface ChangelogDriftViolation {
  file: string;
  reason: string;
  last_modified: string;
  latest_summary: string;
}

/** A broken README link violation. */
interface BrokenLinkViolation {
  file: string;
  link: string;
  line: number;
}

/** A JSDoc drift issue. */
interface JsdocDriftIssue {
  file: string;
  line: number;
  functionName: string;
  issue: string;
}

/** A test coverage gap. */
interface TestCoverageGap {
  file: string;
  exportName: string;
  testFile: string;
  line: number;
}

/** A stale import (export consistency) issue. */
interface ExportConsistencyIssue {
  file: string;
  importedName: string;
  sourceModule: string;
  line: number;
}

/** A doc staleness issue (CLAUDE.md vs mcp-server.js). */
interface DocStalenessIssue {
  file: string;
  issue: string;
  detail: string;
  line: number;
}

/** A config schema drift issue. */
interface ConfigSchemaDriftIssue {
  file: string;
  issue: string;
  detail: string;
  line: number;
}

/** Doc drift detail sub-structure within quality analysis details. */
interface DocDriftDetails {
  changelog: ChangelogDriftViolation[];
  readme_links: BrokenLinkViolation[];
  jsdoc: JsdocDriftIssue[];
}

/** Full quality analysis details containing all analysis results. */
interface QualityAnalysisDetails {
  complexity: ComplexityViolation[];
  dead_exports: DeadExportViolation[];
  file_size: FileSizeViolation[];
  doc_drift?: DocDriftDetails;
  test_coverage?: TestCoverageGap[];
  export_consistency?: ExportConsistencyIssue[];
  doc_staleness?: DocStalenessIssue[];
  config_schema?: ConfigSchemaDriftIssue[];
}

/** Trend information for a single metric. */
interface TrendEntry {
  delta: number;
  label: string;
}

/** Full quality analysis result from runQualityAnalysis. */
interface QualityAnalysisResult {
  skipped?: boolean;
  reason?: string;
  phase?: string;
  timestamp?: string;
  summary?: QualityAnalysisSummary;
  details?: QualityAnalysisDetails;
  trends?: Record<string, TrendEntry> | null;
}

/** Quality history: map of phase number to quality summary. */
type QualityHistory = Record<string, QualityAnalysisSummary>;

/** Generated cleanup plan info. */
interface CleanupPlanResult {
  path: string;
  plan_number: string;
  issues_addressed: number;
}

/** Complexity analysis options. */
interface ComplexityOptions {
  threshold?: number;
  onProgress?: (event: { event: string; file_count?: number; violation_count?: number }) => void;
}

/** Dead export analysis options. */
interface DeadExportOptions {
  excludePatterns?: string[];
}

/** File size analysis thresholds. */
interface FileSizeThresholds {
  maxLines?: number;
}

/** A documented CLI command extracted from CLAUDE.md. */
interface DocumentedCommand {
  raw: string;
  possibleNames: string[];
  line: number;
}

/** A documented config key extracted from CLAUDE.md. */
interface DocumentedConfigKey {
  key: string;
  line: number;
}

/** Parsed function info following a JSDoc block. */
interface ParsedFunctionInfo {
  funcName: string | null;
  paramsStr: string | null;
}

/** Cleanup plan task for generating PLAN.md. */
interface CleanupTask {
  name: string;
  items: string[];
}

/** ESLint JSON output file result structure. */
interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

/** ESLint JSON output message structure. */
interface EslintMessage {
  ruleId: string | null;
  message: string;
  line: number;
  column: number;
}

// ─── File Content Cache ───────────────────────────────────────────────────────
const _cleanupCache: RunCache = createRunCache();

function _cachedRead(absPath: string): string | null {
  return _cleanupCache.get(absPath, safeReadFile) as string | null;
}

/**
 * Reset the cleanup file content cache.
 * Useful for tests that need to ensure a clean state between runs.
 */
function resetCleanupCache(): void {
  _cleanupCache.reset();
}

// ─── Config ──────────────────────────────────────────────────────────────────

const CLEANUP_DEFAULTS: CleanupConfig = {
  enabled: false,
  refactoring: false,
  doc_sync: false,
  test_coverage: false,
  export_consistency: false,
  doc_staleness: false,
  config_schema: false,
  cleanup_threshold: 5,
};

/**
 * Read the `phase_cleanup` section from `.planning/config.json` and return
 * a merged config object with defaults for any missing fields.
 */
function getCleanupConfig(cwd: string): CleanupConfig {
  const configPath: string = path.join(cwd, '.planning', 'config.json');
  const parsed: Record<string, unknown> = safeReadJSON(configPath, {});
  const phaseCleanup = (parsed.phase_cleanup || {}) as Partial<CleanupConfig>;
  return { ...CLEANUP_DEFAULTS, ...phaseCleanup };
}

// ─── Complexity Analysis ─────────────────────────────────────────────────────

/** Module-level cache for ESLint complexity results: key = `${threshold}:${files.join(',')}` */
const _complexityCache: Map<string, ComplexityViolation[]> = new Map();

/**
 * Run ESLint complexity analysis on the specified files and return violations.
 * Results are memoized per unique (files, threshold) combination within a process lifetime.
 */
function analyzeComplexity(
  cwd: string,
  files: string[],
  options: ComplexityOptions = {}
): ComplexityViolation[] {
  if (!files || files.length === 0) return [];

  const threshold: number = options.threshold || 10;
  const onProgress = options.onProgress;

  // Filter to existing files only
  const existingFiles: string[] = files.filter((f: string) => {
    const absPath: string = path.resolve(cwd, f);
    try {
      fs.statSync(absPath);
      return true;
    } catch {
      return false;
    }
  });

  if (existingFiles.length === 0) return [];

  // Check memoization cache (skip for calls with progress callbacks since they need events)
  const cacheKey: string = `${threshold}:${existingFiles.join(',')}`;
  if (!onProgress && _complexityCache.has(cacheKey)) {
    return _complexityCache.get(cacheKey) as ComplexityViolation[];
  }

  if (onProgress) {
    onProgress({ event: 'started', file_count: existingFiles.length });
  }

  try {
    // Run ESLint with complexity rule only, JSON output
    // Use execFileSync with args array to avoid shell quoting issues
    // Use relative paths with -- separator to avoid "outside base path" errors
    const args: string[] = [
      'eslint',
      '--no-config-lookup',
      '--rule',
      `complexity: ["warn", ${threshold}]`,
      '--format',
      'json',
      '--',
      ...existingFiles,
    ];

    const result: string = execFileSync('npx', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const violations: ComplexityViolation[] = parseEslintComplexityResults(cwd, result);
    if (!onProgress) _complexityCache.set(cacheKey, violations);
    if (onProgress) {
      onProgress({ event: 'completed', violation_count: violations.length });
    }
    return violations;
  } catch (err: unknown) {
    // ESLint exits with code 1 when there are warnings/errors; stdout still has JSON
    const execErr = err as { stdout?: string; message?: string };
    if (execErr.stdout) {
      try {
        const violations: ComplexityViolation[] = parseEslintComplexityResults(cwd, execErr.stdout);
        if (!onProgress) _complexityCache.set(cacheKey, violations);
        if (onProgress) {
          onProgress({ event: 'completed', violation_count: violations.length });
        }
        return violations;
      } catch {
        process.stderr.write('[cleanup] ESLint complexity analysis failed to parse output\n');
        return [];
      }
    }
    process.stderr.write(
      '[cleanup] ESLint complexity analysis failed: ' +
        (execErr.message || 'unknown error') +
        '\n'
    );
    return [];
  }
}

/**
 * Parse ESLint JSON output for complexity violations.
 */
function parseEslintComplexityResults(
  cwd: string,
  jsonOutput: string
): ComplexityViolation[] {
  const results: EslintFileResult[] = JSON.parse(jsonOutput);
  const violations: ComplexityViolation[] = [];
  // Resolve cwd to real path for consistent path.relative calculation
  // (handles macOS /var -> /private/var symlink)
  const realCwd: string = fs.realpathSync(cwd);

  for (const fileResult of results) {
    for (const msg of fileResult.messages || []) {
      if (msg.ruleId !== 'complexity') continue;

      // Extract function name and complexity from message text
      // Format: "Function 'name' has a complexity of N. Maximum allowed is M."
      // or: "Arrow function has a complexity of N. Maximum allowed is M."
      const funcMatch: RegExpMatchArray | null = msg.message.match(
        /(?:Function '(\w+)'|(\w+ function))/
      );
      const complexityMatch: RegExpMatchArray | null =
        msg.message.match(/complexity of (\d+)/);

      if (complexityMatch) {
        violations.push({
          file: path.relative(realCwd, fileResult.filePath),
          line: msg.line,
          functionName: funcMatch
            ? funcMatch[1] || funcMatch[2]
            : 'anonymous',
          complexity: parseInt(complexityMatch[1], 10),
        });
      }
    }
  }

  return violations;
}

// ─── Dead Export Detection ────────────────────────────────────────────────────

/**
 * Detect unused exports by scanning `module.exports` declarations and searching
 * for corresponding `require()` imports across the codebase.
 */
function analyzeDeadExports(
  cwd: string,
  files: string[],
  options: DeadExportOptions = {}
): DeadExportViolation[] {
  if (!files || files.length === 0) return [];

  const excludePatterns: string[] = options.excludePatterns || [];
  const deadExports: DeadExportViolation[] = [];

  for (const file of files) {
    const absPath: string = path.resolve(cwd, file);
    const content: string | null = _cachedRead(absPath);
    if (!content) continue;

    const exportNames: string[] = extractExportNames(content);
    if (exportNames.length === 0) continue;

    const allJsFiles: string[] = findJsFiles(cwd, excludePatterns);

    for (const exportName of exportNames) {
      const hasConsumer: boolean = allJsFiles.some((jsFile: string) => {
        if (path.resolve(cwd, jsFile) === absPath) return false;
        const jsContent: string | null = safeReadFile(path.resolve(cwd, jsFile));
        if (!jsContent) return false;

        // Check for destructured import: { exportName } = require(...)
        // or property access: someVar.exportName
        const patterns: RegExp[] = [
          new RegExp(`\\b${exportName}\\b.*require`, 'g'),
          new RegExp(`require.*\\b${exportName}\\b`, 'g'),
          new RegExp(`\\.${exportName}\\b`, 'g'),
        ];

        return patterns.some((p: RegExp) => p.test(jsContent));
      });

      if (!hasConsumer) {
        // Find the line number where this name is exported
        const exportLine: number = findExportLine(content, exportName);
        deadExports.push({
          file,
          exportName,
          line: exportLine,
        });
      }
    }
  }

  return deadExports;
}

/**
 * Extract exported names from a JS file content.
 * Handles `module.exports = { a, b, c }` and `exports.name = ...` patterns.
 */
function extractExportNames(content: string): string[] {
  const names: string[] = [];

  // Pattern 1: module.exports = { name1, name2, ... }
  // Handle multiline exports blocks
  const moduleExportsMatch: RegExpMatchArray | null = content.match(
    /module\.exports\s*=\s*\{([^}]+)\}/s
  );
  if (moduleExportsMatch) {
    const block: string = moduleExportsMatch[1];
    // Split on commas, extract name (handle `name: value` and plain `name`)
    const entries: string[] = block.split(',');
    for (const entry of entries) {
      const trimmed: string = entry.trim();
      if (!trimmed) continue;
      // Could be "name" or "name: value" or "name: someFunction"
      const nameMatch: RegExpMatchArray | null = trimmed.match(/^(\w+)/);
      if (nameMatch) {
        names.push(nameMatch[1]);
      }
    }
  }

  // Pattern 2: exports.funcName = ...
  const exportsPattern: RegExp = /exports\.(\w+)\s*=/g;
  let match: RegExpExecArray | null;
  while ((match = exportsPattern.exec(content)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  return names;
}

/**
 * Find the line number where an export name is defined or exported.
 */
function findExportLine(content: string, exportName: string): number {
  const lines: string[] = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(exportName)) {
      return i + 1;
    }
  }
  return 0;
}

/**
 * Recursively find all .js files under cwd, excluding node_modules and
 * files matching excludePatterns. Delegates to the shared walkJsFiles utility.
 */
function findJsFiles(cwd: string, excludePatterns: string[] = []): string[] {
  return walkJsFiles(cwd, excludePatterns) as string[];
}

// ─── File Size Analysis ──────────────────────────────────────────────────────

/**
 * Check files against configurable line-count thresholds.
 */
function analyzeFileSize(
  cwd: string,
  files: string[],
  thresholds: FileSizeThresholds = {}
): FileSizeViolation[] {
  if (!files || files.length === 0) return [];

  const maxLines: number = thresholds.maxLines || 500;
  const violations: FileSizeViolation[] = [];

  for (const file of files) {
    const absPath: string = path.resolve(cwd, file);
    const content: string | null = _cachedRead(absPath);
    if (!content) continue;

    const lines: number =
      content.split('\n').length - (content.endsWith('\n') ? 1 : 0);

    if (lines > maxLines) {
      violations.push({
        file,
        lines,
        threshold: maxLines,
      });
    }
  }

  return violations;
}

// ─── Doc Drift Detection ─────────────────────────────────────────────────────

/**
 * Detect stale CHANGELOG.md by comparing its mtime to the newest SUMMARY.md.
 */
function analyzeChangelogDrift(cwd: string): ChangelogDriftViolation[] {
  const changelogPath: string = path.join(cwd, 'CHANGELOG.md');
  try {
    fs.statSync(changelogPath);
  } catch {
    return []; // No CHANGELOG.md — graceful skip
  }

  // Find all *-SUMMARY.md files under .planning/phases/
  const phasesDir: string = getPhasesDirPath(cwd);
  const summaryFiles: string[] = _findSummaryFiles(phasesDir);
  if (summaryFiles.length === 0) return []; // Nothing to compare

  // Get mtimes
  const changelogMtime: Date = fs.statSync(changelogPath).mtime;
  let newestSummaryMtime: Date = new Date(0);
  for (const sf of summaryFiles) {
    const mtime: Date = fs.statSync(sf).mtime;
    if (mtime > newestSummaryMtime) {
      newestSummaryMtime = mtime;
    }
  }

  if (changelogMtime < newestSummaryMtime) {
    return [
      {
        file: 'CHANGELOG.md',
        reason: 'Not updated since last plan completion',
        last_modified: changelogMtime.toISOString(),
        latest_summary: newestSummaryMtime.toISOString(),
      },
    ];
  }

  return [];
}

/**
 * Recursively find all *-SUMMARY.md files under a directory.
 */
function _findSummaryFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(dir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const fullPath: string = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(..._findSummaryFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('-SUMMARY.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist — return empty
  }
  return results;
}

/**
 * Detect broken internal file references in README.md markdown links.
 */
function analyzeReadmeLinks(cwd: string): BrokenLinkViolation[] {
  const readmePath: string = path.join(cwd, 'README.md');
  const content: string | null = safeReadFile(readmePath);
  if (!content) return [];

  const broken: BrokenLinkViolation[] = [];
  const lines: string[] = content.split('\n');
  const linkRegex: RegExp = /\[([^\]]*)\]\(([^)"\s]+)(?:\s+"[^"]*")?\)/g;

  for (let i = 0; i < lines.length; i++) {
    let match: RegExpExecArray | null;
    // Reset lastIndex for each line since we reuse the regex
    linkRegex.lastIndex = 0;
    while ((match = linkRegex.exec(lines[i])) !== null) {
      const linkPath: string = match[2];

      // Skip external links and anchor-only links
      if (
        linkPath.startsWith('http://') ||
        linkPath.startsWith('https://') ||
        linkPath.startsWith('#')
      ) {
        continue;
      }

      // Resolve relative path against cwd
      const resolved: string = path.resolve(cwd, linkPath);
      if (!fs.existsSync(resolved)) {
        broken.push({
          file: 'README.md',
          link: linkPath,
          line: i + 1,
        });
      }
    }
  }

  return broken;
}

/**
 * Detect JSDoc @param annotations that do not match actual function parameter names.
 */
// Compiled once at module level to avoid repeated RegExp construction in loops
const _JSDOC_BLOCK_RE_SRC: string = '\\/\\*\\*[\\s\\S]*?\\*\\/';
const _JSDOC_PARAM_RE_SRC: string = '@param\\s+(?:\\{[^}]*\\}\\s+)?(\\w+)';
const _FUNC_PATTERNS: RegExp[] = [
  /function\s+(\w+)\s*\(([^)]*)\)/,
  /(?:const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>/,
  /(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\s*=>/,
  /(\w+)\s*\(([^)]*)\)\s*\{/,
];

/**
 * Extract @param names from a JSDoc comment block string.
 */
function _extractJsdocParams(block: string): string[] {
  const params: string[] = [];
  const re: RegExp = new RegExp(_JSDOC_PARAM_RE_SRC, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    params.push(m[1]);
  }
  return params;
}

/**
 * Find the function name and parameter string immediately following a JSDoc block.
 */
function _parseFunctionAfterJsdoc(contentAfterBlock: string): ParsedFunctionInfo {
  const nextLines: string = contentAfterBlock.split('\n').slice(0, 5).join('\n');
  for (const pattern of _FUNC_PATTERNS) {
    const m: RegExpMatchArray | null = nextLines.match(pattern);
    if (m) return { funcName: m[1], paramsStr: m[2] };
  }
  return { funcName: null, paramsStr: null };
}

function analyzeJsdocDrift(cwd: string, files: string[]): JsdocDriftIssue[] {
  if (!files || files.length === 0) return [];

  const issues: JsdocDriftIssue[] = [];

  for (const file of files) {
    const absPath: string = path.resolve(cwd, file);
    const content: string | null = _cachedRead(absPath);
    if (!content) continue;

    const blockRe: RegExp = new RegExp(_JSDOC_BLOCK_RE_SRC, 'g');
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = blockRe.exec(content)) !== null) {
      const blockEnd: number = blockMatch.index + blockMatch[0].length;
      const blockStartLine: number =
        content.substring(0, blockMatch.index).split('\n').length;

      const docParams: string[] = _extractJsdocParams(blockMatch[0]);
      if (docParams.length === 0) continue; // No @param annotations, skip

      const { funcName, paramsStr } = _parseFunctionAfterJsdoc(
        content.substring(blockEnd)
      );
      if (!funcName || paramsStr === null || paramsStr === undefined) continue;

      const actualParams: string[] = _extractParamNames(paramsStr);

      for (const dp of docParams) {
        if (!actualParams.includes(dp)) {
          issues.push({
            file,
            line: blockStartLine,
            functionName: funcName,
            issue: `extra @param: ${dp}`,
          });
        }
      }
      for (const ap of actualParams) {
        if (!docParams.includes(ap)) {
          issues.push({
            file,
            line: blockStartLine,
            functionName: funcName,
            issue: `missing @param: ${ap}`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Extract parameter names from a function signature string.
 * Handles default values (x = 1), destructured params ({a, b}), and rest params (...args).
 */
function _extractParamNames(paramsStr: string): string[] {
  if (!paramsStr || !paramsStr.trim()) return [];

  const params: string[] = [];
  // Split by commas, but be careful of nested braces/brackets
  let depth: number = 0;
  let current: string = '';

  for (const ch of paramsStr) {
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) params.push(current.trim());

  return params
    .map((p: string) => {
      // Remove rest operator
      let cleaned: string = p.replace(/^\.\.\./, '');
      // Remove default value
      cleaned = cleaned.split('=')[0].trim();
      // If it's a destructured param ({...}), skip — can't match by name
      if (cleaned.startsWith('{') || cleaned.startsWith('[')) return null;
      // Extract just the identifier
      const nameMatch: RegExpMatchArray | null = cleaned.match(/^(\w+)/);
      return nameMatch ? nameMatch[1] : null;
    })
    .filter((n): n is string => n !== null);
}

// ─── Test Coverage Gap Detection ──────────────────────────────────────────────

/**
 * Detect exported functions/values with no corresponding mention in test files.
 * For each lib/foo.js, checks tests/unit/foo.test.js for references to each export.
 */
function analyzeTestCoverageGaps(
  cwd: string,
  files: string[]
): TestCoverageGap[] {
  if (!files || files.length === 0) return [];

  const gaps: TestCoverageGap[] = [];

  for (const file of files) {
    const absPath: string = path.resolve(cwd, file);
    const content: string | null = _cachedRead(absPath);
    if (!content) continue;

    const exportNames: string[] = extractExportNames(content);
    if (exportNames.length === 0) continue;

    const basename: string = path.basename(file, '.js');
    const testFile: string = path.join('tests', 'unit', `${basename}.test.js`);
    const testContent: string | null = safeReadFile(path.resolve(cwd, testFile));

    if (!testContent) {
      for (const exportName of exportNames) {
        gaps.push({
          file,
          exportName,
          testFile,
          line: findExportLine(content, exportName),
        });
      }
      continue;
    }

    for (const exportName of exportNames) {
      if (!testContent.includes(exportName)) {
        gaps.push({
          file,
          exportName,
          testFile,
          line: findExportLine(content, exportName),
        });
      }
    }
  }

  return gaps;
}

// ─── Export Consistency Detection ──────────────────────────────────────────────

/**
 * Detect stale imports where a destructured require references a name no longer
 * exported by the target module.
 */
function analyzeExportConsistency(
  cwd: string,
  files: string[]
): ExportConsistencyIssue[] {
  if (!files || files.length === 0) return [];

  const issues: ExportConsistencyIssue[] = [];

  for (const file of files) {
    const absPath: string = path.resolve(cwd, file);
    const content: string | null = _cachedRead(absPath);
    if (!content) continue;

    const lines: string[] = content.split('\n');
    const requirePattern: RegExp =
      /const\s+\{([^}]+)\}\s*=\s*require\(['"]([^'"]+)['"]\)/;

    for (let i = 0; i < lines.length; i++) {
      const match: RegExpMatchArray | null = lines[i].match(requirePattern);
      if (!match) continue;

      const importedNames: string[] = match[1]
        .split(',')
        .map((n: string) => n.trim())
        .filter(Boolean);
      const requirePath: string = match[2];
      if (!requirePath.startsWith('.')) continue;

      let sourcePath: string = path.resolve(
        path.dirname(absPath),
        requirePath
      );
      if (!sourcePath.endsWith('.js')) sourcePath += '.js';
      const sourceContent: string | null = safeReadFile(sourcePath);
      if (!sourceContent) continue;

      const sourceExports: string[] = extractExportNames(sourceContent);
      const sourceModule: string = path.relative(cwd, sourcePath);

      for (const name of importedNames) {
        const cleanName: string = name.split(':')[0].trim();
        if (!cleanName) continue;

        if (!sourceExports.includes(cleanName)) {
          issues.push({
            file,
            importedName: cleanName,
            sourceModule,
            line: i + 1,
          });
        }
      }
    }
  }

  return issues;
}

// ─── Doc Staleness Detection ──────────────────────────────────────────────────

/**
 * Cross-reference CLAUDE.md CLI Tooling documentation with mcp-server.js
 * COMMAND_DESCRIPTORS to detect documentation gaps.
 */
function analyzeDocStaleness(cwd: string): DocStalenessIssue[] {
  const claudeMdPath: string = path.join(cwd, 'CLAUDE.md');
  const claudeContent: string | null = safeReadFile(claudeMdPath);
  if (!claudeContent) return [];

  const mcpPath: string = path.join(cwd, 'lib', 'mcp-server.js');
  const mcpContent: string | null = safeReadFile(mcpPath);
  if (!mcpContent) return [];

  const issues: DocStalenessIssue[] = [];
  const documentedCommands: DocumentedCommand[] =
    _extractDocumentedCommands(claudeContent);
  const actualTools: Set<string> = _extractToolNames(mcpContent);

  // Check documented but not implemented
  for (const cmd of documentedCommands) {
    const hasMatch: boolean = cmd.possibleNames.some((n: string) =>
      actualTools.has(n)
    );
    if (!hasMatch) {
      issues.push({
        file: 'CLAUDE.md',
        issue: 'documented-but-not-implemented',
        detail: `Command "${cmd.raw}" not found in COMMAND_DESCRIPTORS`,
        line: cmd.line,
      });
    }
  }

  // Check implemented but not documented
  const allDocumentedNames: Set<string> = new Set();
  for (const cmd of documentedCommands) {
    for (const n of cmd.possibleNames) {
      allDocumentedNames.add(n);
    }
  }
  for (const tool of actualTools) {
    if (!allDocumentedNames.has(tool)) {
      issues.push({
        file: 'lib/mcp-server.js',
        issue: 'implemented-but-not-documented',
        detail: `Tool "${tool}" not documented in CLAUDE.md CLI Tooling section`,
        line: 0,
      });
    }
  }

  return issues;
}

/**
 * Extract documented CLI commands from the "CLI Tooling" section of CLAUDE.md.
 */
function _extractDocumentedCommands(content: string): DocumentedCommand[] {
  const commands: DocumentedCommand[] = [];
  const lines: string[] = content.split('\n');

  let inSection: boolean = false;
  for (let i = 0; i < lines.length; i++) {
    const line: string = lines[i];

    if (/^## CLI Tooling/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    if (!inSection) continue;

    const cmdMatch: RegExpMatchArray | null = line.match(/^- `([^`]+)`/);
    if (!cmdMatch) continue;

    const rawCmd: string = cmdMatch[1];
    const cleaned: string = rawCmd
      .replace(/\[[^\]]*\]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/--\S+(\s+"[^"]*"|\s+\S+)?/g, '')
      .replace(/\.\.\./g, '')
      .trim()
      .replace(/\s+/g, ' ');

    if (!cleaned) continue;

    const possibleNames: string[] = _generateToolNames(cleaned);
    if (possibleNames.length > 0) {
      commands.push({ raw: rawCmd, possibleNames, line: i + 1 });
    }
  }

  return commands;
}

/**
 * Generate possible MCP tool names from a cleaned CLI command string.
 * Handles slash-separated subcommands and " / " alternatives.
 */
function _generateToolNames(cleaned: string): string[] {
  const names: string[] = [];

  // Handle " / " pattern: "state add-blocker / resolve-blocker"
  if (cleaned.includes(' / ')) {
    const parts: string[] = cleaned.split(' / ').map((p: string) => p.trim());
    const firstParts: string[] = parts[0].split(/\s+/);
    if (firstParts.length >= 2) {
      const base: string = firstParts
        .slice(0, -1)
        .join('_')
        .replace(/-/g, '_');
      names.push(
        'grd_' +
          base +
          '_' +
          firstParts[firstParts.length - 1].replace(/-/g, '_')
      );
      for (let j = 1; j < parts.length; j++) {
        names.push('grd_' + base + '_' + parts[j].replace(/-/g, '_'));
      }
    }
    return names;
  }

  const words: string[] = cleaned.split(/\s+/).filter(Boolean);
  const lastWord: string | undefined = words[words.length - 1];

  // Handle slash-separated in last word
  if (lastWord && lastWord.includes('/')) {
    const base: string = words.slice(0, -1).join('_').replace(/-/g, '_');
    const subs: string[] = lastWord.split('/');
    // Add base-only version (for parameterized tools like scaffold)
    if (base) names.push('grd_' + base);
    // Add expanded versions
    for (const sub of subs) {
      const subNorm: string = sub.replace(/-/g, '_');
      names.push(
        base ? 'grd_' + base + '_' + subNorm : 'grd_' + subNorm
      );
    }
    return names;
  }

  // Simple command
  names.push('grd_' + cleaned.replace(/[\s-]+/g, '_'));
  return names;
}

/**
 * Extract tool names from mcp-server.js COMMAND_DESCRIPTORS.
 */
function _extractToolNames(content: string): Set<string> {
  const names: Set<string> = new Set();
  const namePattern: RegExp = /name:\s*'(grd_[^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = namePattern.exec(content)) !== null) {
    names.add(match[1]);
  }
  return names;
}

// ─── Config Schema Drift Detection ───────────────────────────────────────────

/**
 * Detect drift between documented config keys in CLAUDE.md and actual
 * config.json keys, and verify COMMAND_DESCRIPTORS execute references.
 */
function analyzeConfigSchemaDrift(cwd: string): ConfigSchemaDriftIssue[] {
  const issues: ConfigSchemaDriftIssue[] = [];

  // 1. Parse CLAUDE.md Configuration section for documented config keys
  const claudeMdPath: string = path.join(cwd, 'CLAUDE.md');
  const claudeContent: string | null = safeReadFile(claudeMdPath);
  if (!claudeContent) return [];

  const documentedKeys: DocumentedConfigKey[] =
    _extractDocumentedConfigKeys(claudeContent);

  // 2. Read actual config.json
  const configPath: string = path.join(cwd, '.planning', 'config.json');
  const parsedConfig: Record<string, unknown> | null = safeReadJSON(configPath);
  const actualKeys: string[] | null = parsedConfig
    ? Object.keys(parsedConfig).filter((k: string) => !k.startsWith('_'))
    : null;

  if (actualKeys) {
    for (const dk of documentedKeys) {
      if (!actualKeys.includes(dk.key)) {
        issues.push({
          file: 'CLAUDE.md',
          issue: 'documented-key-not-in-config',
          detail: `Config key "${dk.key}" documented but not found in config.json`,
          line: dk.line,
        });
      }
    }

    const documentedKeySet: Set<string> = new Set(
      documentedKeys.map((dk: DocumentedConfigKey) => dk.key)
    );
    for (const key of actualKeys) {
      if (!documentedKeySet.has(key)) {
        issues.push({
          file: path.relative(
            cwd,
            path.join(getPlanningDir(cwd), 'config.json')
          ),
          issue: 'config-key-not-documented',
          detail: `Config key "${key}" present but not documented in CLAUDE.md`,
          line: 0,
        });
      }
    }
  }

  // 3. Check COMMAND_DESCRIPTORS execute references
  const mcpPath: string = path.join(cwd, 'lib', 'mcp-server.js');
  const mcpContent: string | null = safeReadFile(mcpPath);
  if (!mcpContent) return issues;

  const executePattern: RegExp =
    /execute:\s*\([^)]*\)\s*=>\s*(\w+)\(/g;
  const executeFunctions: Set<string> = new Set();
  let execMatch: RegExpExecArray | null;
  while ((execMatch = executePattern.exec(mcpContent)) !== null) {
    executeFunctions.add(execMatch[1]);
  }

  const preamble: string =
    mcpContent.split('const COMMAND_DESCRIPTORS')[0] || '';
  for (const funcName of executeFunctions) {
    if (!preamble.includes(funcName)) {
      issues.push({
        file: 'lib/mcp-server.js',
        issue: 'execute-function-not-imported',
        detail: `Function "${funcName}" referenced in execute but not imported`,
        line: 0,
      });
    }
  }

  return issues;
}

/**
 * Extract documented configuration keys from the "Configuration" section of CLAUDE.md.
 */
function _extractDocumentedConfigKeys(content: string): DocumentedConfigKey[] {
  const keys: DocumentedConfigKey[] = [];
  const lines: string[] = content.split('\n');

  let inSection: boolean = false;
  for (let i = 0; i < lines.length; i++) {
    const line: string = lines[i];

    if (/^## Configuration/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    if (!inSection) continue;

    const keyMatch: RegExpMatchArray | null = line.match(/^- `(\w+)`/);
    if (keyMatch) {
      keys.push({ key: keyMatch[1], line: i + 1 });
    }
  }

  return keys;
}

// ─── Quality Analysis Orchestrator ───────────────────────────────────────────

/**
 * Orchestrate all quality checks (complexity, dead exports, file size, doc drift)
 * and return a structured quality report.
 */
function runQualityAnalysis(
  cwd: string,
  phaseNum: string
): QualityAnalysisResult {
  const config: CleanupConfig = getCleanupConfig(cwd);

  if (!config.enabled) {
    return { skipped: true, reason: 'phase_cleanup not enabled' };
  }

  _cleanupCache.init();
  try {
    // Find files to analyze: scan lib/*.js as default
    const jsFiles: string[] = findAnalysisFiles(cwd, phaseNum);

    // Run core analyses
    const complexityResults: ComplexityViolation[] = analyzeComplexity(
      cwd,
      jsFiles
    );
    const deadExportResults: DeadExportViolation[] = analyzeDeadExports(
      cwd,
      jsFiles
    );
    const fileSizeResults: FileSizeViolation[] = analyzeFileSize(
      cwd,
      jsFiles
    );

    const baseIssues: number =
      complexityResults.length +
      deadExportResults.length +
      fileSizeResults.length;

    const summary: QualityAnalysisSummary = {
      total_issues: baseIssues,
      complexity_violations: complexityResults.length,
      dead_exports: deadExportResults.length,
      oversized_files: fileSizeResults.length,
    };

    const details: QualityAnalysisDetails = {
      complexity: complexityResults,
      dead_exports: deadExportResults,
      file_size: fileSizeResults,
    };

    // Run doc drift checks when doc_sync is enabled
    if (config.doc_sync) {
      const changelogResults: ChangelogDriftViolation[] =
        analyzeChangelogDrift(cwd);
      const readmeResults: BrokenLinkViolation[] = analyzeReadmeLinks(cwd);
      const jsdocResults: JsdocDriftIssue[] = analyzeJsdocDrift(
        cwd,
        jsFiles
      );

      const docDriftCount: number =
        changelogResults.length +
        readmeResults.length +
        jsdocResults.length;
      summary.doc_drift_issues = docDriftCount;
      summary.total_issues += docDriftCount;

      details.doc_drift = {
        changelog: changelogResults,
        readme_links: readmeResults,
        jsdoc: jsdocResults,
      };
    }

    // Run test coverage gap analysis when test_coverage is enabled
    if (config.test_coverage) {
      const testCoverageResults: TestCoverageGap[] =
        analyzeTestCoverageGaps(cwd, jsFiles);
      summary.test_coverage_gaps = testCoverageResults.length;
      summary.total_issues += testCoverageResults.length;
      details.test_coverage = testCoverageResults;
    }

    // Run export consistency analysis when export_consistency is enabled
    if (config.export_consistency) {
      const exportConsistencyResults: ExportConsistencyIssue[] =
        analyzeExportConsistency(cwd, jsFiles);
      summary.stale_imports = exportConsistencyResults.length;
      summary.total_issues += exportConsistencyResults.length;
      details.export_consistency = exportConsistencyResults;
    }

    // Run doc staleness analysis when doc_staleness is enabled
    if (config.doc_staleness) {
      const docStalenessResults: DocStalenessIssue[] =
        analyzeDocStaleness(cwd);
      summary.doc_staleness_issues = docStalenessResults.length;
      summary.total_issues += docStalenessResults.length;
      details.doc_staleness = docStalenessResults;
    }

    // Run config schema drift analysis when config_schema is enabled
    if (config.config_schema) {
      const configSchemaResults: ConfigSchemaDriftIssue[] =
        analyzeConfigSchemaDrift(cwd);
      summary.config_schema_issues = configSchemaResults.length;
      summary.total_issues += configSchemaResults.length;
      details.config_schema = configSchemaResults;
    }

    // Compute trends against previous phase if history exists
    const history: QualityHistory = loadQualityHistory(cwd);
    let trends: Record<string, TrendEntry> | null = null;
    const prevPhase: string = String(parseInt(phaseNum, 10) - 1);
    if (history[prevPhase]) {
      trends = computeTrends(summary, history[prevPhase], prevPhase);
    }

    return {
      phase: phaseNum,
      timestamp: new Date().toISOString().split('T')[0],
      summary,
      details,
      trends,
    };
  } finally {
    _cleanupCache.reset();
  }
}

/**
 * Find files to analyze for a given phase. Scans lib/*.js as fallback.
 */
function findAnalysisFiles(cwd: string, _phaseNum: string): string[] {
  const libDir: string = path.join(cwd, 'lib');
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(libDir, {
      withFileTypes: true,
    });
    return entries
      .filter(
        (e: import('fs').Dirent) => e.isFile() && e.name.endsWith('.js')
      )
      .map((e: import('fs').Dirent) => path.join('lib', e.name));
  } catch {
    return [];
  }
}

// ─── Cleanup Plan Generation ──────────────────────────────────────────────────

/**
 * Auto-generate a cleanup PLAN.md when quality issues exceed a configurable threshold.
 * Scans existing plan files in the phase directory to determine the next plan number,
 * then writes a standard-format PLAN.md with tasks derived from the quality report.
 */
function generateCleanupPlan(
  cwd: string,
  phaseNum: string,
  qualityReport: QualityAnalysisResult
): CleanupPlanResult | null {
  const config: CleanupConfig = getCleanupConfig(cwd);
  const threshold: number = config.cleanup_threshold;

  // No plan needed if issues are at or below threshold
  if (
    !qualityReport ||
    !qualityReport.summary ||
    qualityReport.summary.total_issues <= threshold
  ) {
    return null;
  }

  // Find phase directory
  const phasesDir: string = getPhasesDirPath(cwd);
  let phaseDir: string | null = null;
  let phaseDirName: string | null = null;

  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
    const normalized: string = String(phaseNum).padStart(2, '0');
    const match: string | undefined = dirs.find(
      (d: string) => d.startsWith(normalized + '-') || d === normalized
    );
    if (match) {
      phaseDir = path.join(phasesDir, match);
      phaseDirName = match;
    }
  } catch {
    // phases directory doesn't exist
  }

  if (!phaseDir || !phaseDirName) return null;

  // Find next plan number
  let nextPlanNum: number = 1;
  try {
    const files: string[] = fs.readdirSync(phaseDir);
    const normalized: string = String(phaseNum).padStart(2, '0');
    const planFiles: string[] = files.filter((f: string) => {
      const pattern: RegExp = new RegExp(`^${normalized}-(\\d{2})-PLAN\\.md$`);
      return pattern.test(f);
    });

    if (planFiles.length > 0) {
      const planNums: number[] = planFiles.map((f: string) => {
        const m: RegExpMatchArray | null = f.match(/(\d{2})-PLAN\.md$/);
        return m ? parseInt(m[1], 10) : 0;
      });
      nextPlanNum = Math.max(...planNums) + 1;
    }
  } catch {
    // directory read error
  }

  const paddedPlan: string = String(nextPlanNum).padStart(2, '0');
  const phaseSlug: string = phaseDirName.replace(/^\d+(?:\.\d+)?-?/, '');

  // Collect unique files from quality issues
  const filesSet: Set<string> = new Set();
  const { details } = qualityReport;
  if (details) {
    if (details.complexity) {
      details.complexity.forEach((v: ComplexityViolation) =>
        filesSet.add(v.file)
      );
    }
    if (details.dead_exports) {
      details.dead_exports.forEach((v: DeadExportViolation) =>
        filesSet.add(v.file)
      );
    }
    if (details.file_size) {
      details.file_size.forEach((v: FileSizeViolation) =>
        filesSet.add(v.file)
      );
    }
    if (details.doc_drift) {
      if (details.doc_drift.changelog) {
        details.doc_drift.changelog.forEach(
          (v: ChangelogDriftViolation) => filesSet.add(v.file)
        );
      }
      if (details.doc_drift.readme_links) {
        details.doc_drift.readme_links.forEach(
          (v: BrokenLinkViolation) => filesSet.add(v.file)
        );
      }
      if (details.doc_drift.jsdoc) {
        details.doc_drift.jsdoc.forEach((v: JsdocDriftIssue) =>
          filesSet.add(v.file)
        );
      }
    }
    if (details.test_coverage) {
      details.test_coverage.forEach((v: TestCoverageGap) =>
        filesSet.add(v.file)
      );
    }
    if (details.export_consistency) {
      details.export_consistency.forEach((v: ExportConsistencyIssue) =>
        filesSet.add(v.file)
      );
    }
    if (details.doc_staleness) {
      details.doc_staleness.forEach((v: DocStalenessIssue) =>
        filesSet.add(v.file)
      );
    }
    if (details.config_schema) {
      details.config_schema.forEach((v: ConfigSchemaDriftIssue) =>
        filesSet.add(v.file)
      );
    }
  }

  const filesModified: string[] = [...filesSet];

  // Build tasks from quality report
  const tasks: CleanupTask[] = [];

  // Task 1: Code quality issues (complexity, dead exports, file size)
  const codeIssues: string[] = [];
  if (details && details.complexity && details.complexity.length > 0) {
    codeIssues.push(
      `- Refactor ${details.complexity.length} high-complexity function(s): ${details.complexity.map((v: ComplexityViolation) => `${v.functionName} in ${v.file}`).join(', ')}`
    );
  }
  if (details && details.dead_exports && details.dead_exports.length > 0) {
    codeIssues.push(
      `- Remove or document ${details.dead_exports.length} dead export(s): ${details.dead_exports.map((v: DeadExportViolation) => `${v.exportName} in ${v.file}`).join(', ')}`
    );
  }
  if (details && details.file_size && details.file_size.length > 0) {
    codeIssues.push(
      `- Split ${details.file_size.length} oversized file(s): ${details.file_size.map((v: FileSizeViolation) => `${v.file} (${v.lines} lines)`).join(', ')}`
    );
  }

  if (codeIssues.length > 0) {
    tasks.push({
      name: 'Resolve code quality issues',
      items: codeIssues,
    });
  }

  // Task 2: Doc drift issues
  const docIssues: string[] = [];
  if (details && details.doc_drift) {
    if (
      details.doc_drift.changelog &&
      details.doc_drift.changelog.length > 0
    ) {
      docIssues.push(`- Update stale CHANGELOG.md`);
    }
    if (
      details.doc_drift.readme_links &&
      details.doc_drift.readme_links.length > 0
    ) {
      docIssues.push(
        `- Fix ${details.doc_drift.readme_links.length} broken README link(s): ${details.doc_drift.readme_links.map((v: BrokenLinkViolation) => v.link).join(', ')}`
      );
    }
    if (
      details.doc_drift.jsdoc &&
      details.doc_drift.jsdoc.length > 0
    ) {
      docIssues.push(
        `- Fix ${details.doc_drift.jsdoc.length} JSDoc mismatch(es): ${details.doc_drift.jsdoc.map((v: JsdocDriftIssue) => `${v.functionName} in ${v.file}`).join(', ')}`
      );
    }
  }

  if (docIssues.length > 0) {
    tasks.push({
      name: 'Update stale documentation',
      items: docIssues,
    });
  }

  // Task: Test coverage gaps
  if (details && details.test_coverage && details.test_coverage.length > 0) {
    tasks.push({
      name: 'Close test coverage gaps',
      items: details.test_coverage.map(
        (v: TestCoverageGap) =>
          `- Add tests for ${v.exportName} from ${v.file} in ${v.testFile}`
      ),
    });
  }

  // Task: Consistency and schema issues
  const consistencyIssues: string[] = [];
  if (
    details &&
    details.export_consistency &&
    details.export_consistency.length > 0
  ) {
    consistencyIssues.push(
      `- Fix ${details.export_consistency.length} stale import(s): ${details.export_consistency.map((v: ExportConsistencyIssue) => `${v.importedName} in ${v.file}`).join(', ')}`
    );
  }
  if (
    details &&
    details.doc_staleness &&
    details.doc_staleness.length > 0
  ) {
    consistencyIssues.push(
      `- Resolve ${details.doc_staleness.length} doc staleness issue(s)`
    );
  }
  if (
    details &&
    details.config_schema &&
    details.config_schema.length > 0
  ) {
    consistencyIssues.push(
      `- Fix ${details.config_schema.length} config schema drift(s)`
    );
  }
  if (consistencyIssues.length > 0) {
    tasks.push({
      name: 'Fix consistency and schema issues',
      items: consistencyIssues,
    });
  }

  // If no tasks were generated (shouldn't happen if total_issues > threshold), create a generic one
  if (tasks.length === 0) {
    tasks.push({
      name: 'Resolve quality issues',
      items: [
        `- Address ${qualityReport.summary!.total_issues} quality issue(s) found during analysis`,
      ],
    });
  }

  // Build PLAN.md content
  const filesModifiedYaml: string = filesModified
    .map((f: string) => `  - "${f}"`)
    .join('\n');
  const taskBlocks: string = tasks
    .map((t: CleanupTask, i: number) => {
      return `<task type="auto">
  <name>Task ${i + 1}: ${t.name}</name>
  <files>${filesModified.join(', ')}</files>
  <action>
${t.items.join('\n')}
  </action>
  <verify>Run tests and verify issues are resolved.</verify>
  <done>${t.name} complete.</done>
</task>`;
    })
    .join('\n\n');

  const planContent: string = `---
phase: ${phaseSlug}
plan: ${paddedPlan}
type: execute
wave: 1
depends_on: []
files_modified:
${filesModifiedYaml}
autonomous: true
verification_level: sanity
cleanup_generated: true
must_haves:
  truths:
    - "All auto-detected quality issues from phase ${phaseNum} completion are resolved"
  artifacts: []
  key_links: []
---

<objective>
Auto-generated cleanup plan for ${qualityReport.summary!.total_issues} quality issue(s) detected during phase ${phaseNum} completion.
</objective>

<tasks>

${taskBlocks}

</tasks>

<success_criteria>
All quality issues from phase ${phaseNum} completion resolved.
</success_criteria>
`;

  // Write the plan file
  const normalized: string = String(phaseNum).padStart(2, '0');
  const planFileName: string = `${normalized}-${paddedPlan}-PLAN.md`;
  const planPath: string = path.join(phaseDir, planFileName);
  fs.writeFileSync(planPath, planContent, 'utf-8');

  return {
    path: path.relative(cwd, planPath),
    plan_number: paddedPlan,
    issues_addressed: qualityReport.summary!.total_issues,
  };
}

// ─── Quality History & Trends ─────────────────────────────────────────────────

const QUALITY_HISTORY_FILE: string = '.quality-history.json';

/**
 * Load quality history from .planning/.quality-history.json.
 */
function loadQualityHistory(cwd: string): QualityHistory {
  const historyPath: string = path.join(
    cwd,
    '.planning',
    QUALITY_HISTORY_FILE
  );
  try {
    const content: string = fs.readFileSync(historyPath, 'utf-8');
    return JSON.parse(content) as QualityHistory;
  } catch {
    return {};
  }
}

/**
 * Save quality metrics for a phase into .planning/.quality-history.json.
 * Accumulates entries across phases.
 */
function saveQualityMetrics(
  cwd: string,
  phase: string,
  summary: QualityAnalysisSummary
): void {
  const history: QualityHistory = loadQualityHistory(cwd);
  history[phase] = summary;
  const historyPath: string = path.join(
    cwd,
    '.planning',
    QUALITY_HISTORY_FILE
  );
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * Compute trends (deltas) between current and previous quality summaries.
 * Only compares numeric fields. Returns an object with delta and label for each field.
 */
function computeTrends(
  current: QualityAnalysisSummary,
  previous: QualityAnalysisSummary,
  fromPhase: string
): Record<string, TrendEntry> {
  const trends: Record<string, TrendEntry> = {};
  for (const key of Object.keys(current)) {
    const currentVal = current[key];
    const previousVal = previous[key];
    if (typeof currentVal !== 'number' || typeof previousVal !== 'number')
      continue;
    const delta: number = currentVal - previousVal;
    let arrow: string = '';
    if (delta > 0) arrow = '\u2191'; // up arrow (regression for issues, improvement for scores)
    else if (delta < 0) arrow = '\u2193'; // down arrow
    trends[key] = {
      delta,
      label: `${arrow} ${delta >= 0 ? '+' : ''}${delta} from Phase ${fromPhase}`,
    };
  }
  return trends;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  getCleanupConfig,
  analyzeComplexity,
  analyzeDeadExports,
  analyzeFileSize,
  analyzeChangelogDrift,
  analyzeReadmeLinks,
  analyzeJsdocDrift,
  analyzeTestCoverageGaps,
  analyzeExportConsistency,
  analyzeDocStaleness,
  analyzeConfigSchemaDrift,
  runQualityAnalysis,
  generateCleanupPlan,
  resetCleanupCache,
  loadQualityHistory,
  saveQualityMetrics,
  computeTrends,
};
