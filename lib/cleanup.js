/**
 * GRD Phase Cleanup — Config schema handling and quality analysis functions
 *
 * Provides config reading for the phase_cleanup section, and quality analysis
 * functions for ESLint complexity, dead export detection, file size checks,
 * and doc drift detection (changelog staleness, broken README links, JSDoc mismatches).
 * These are the data-layer operations wired into phase completion by Plan 13-02.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────────────

const CLEANUP_DEFAULTS = { enabled: false, refactoring: false, doc_sync: false };

/**
 * Read the `phase_cleanup` section from `.planning/config.json` and return
 * a merged config object with defaults for any missing fields.
 * @param {string} cwd - Project working directory
 * @returns {{ enabled: boolean, refactoring: boolean, doc_sync: boolean }}
 */
function getCleanupConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...CLEANUP_DEFAULTS, ...(parsed.phase_cleanup || {}) };
  } catch {
    return { ...CLEANUP_DEFAULTS };
  }
}

// ─── Complexity Analysis ─────────────────────────────────────────────────────

/**
 * Run ESLint complexity analysis on the specified files and return violations.
 * Uses ESLint CLI subprocess to keep the module synchronous.
 * @param {string} cwd - Project working directory
 * @param {string[]} files - Array of file paths relative to cwd
 * @param {{ threshold?: number }} [options={}] - Options with optional complexity threshold (default 10)
 * @returns {Array<{ file: string, line: number, functionName: string, complexity: number }>}
 */
function analyzeComplexity(cwd, files, options = {}) {
  if (!files || files.length === 0) return [];

  const threshold = options.threshold || 10;

  // Filter to existing files only
  const existingFiles = files.filter((f) => {
    const absPath = path.resolve(cwd, f);
    try {
      fs.statSync(absPath);
      return true;
    } catch {
      return false;
    }
  });

  if (existingFiles.length === 0) return [];

  try {
    // Run ESLint with complexity rule only, JSON output
    // Use execFileSync with args array to avoid shell quoting issues
    // Use relative paths with -- separator to avoid "outside base path" errors
    const args = [
      'eslint',
      '--no-config-lookup',
      '--rule',
      `complexity: ["warn", ${threshold}]`,
      '--format',
      'json',
      '--',
      ...existingFiles,
    ];

    const output = execFileSync('npx', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return parseEslintComplexityResults(cwd, output);
  } catch (err) {
    // ESLint exits with code 1 when there are warnings/errors; stdout still has JSON
    if (err.stdout) {
      try {
        return parseEslintComplexityResults(cwd, err.stdout);
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * Parse ESLint JSON output for complexity violations.
 * @param {string} cwd - Project working directory (for relative path calculation)
 * @param {string} jsonOutput - ESLint JSON output string
 * @returns {Array<{ file: string, line: number, functionName: string, complexity: number }>}
 */
function parseEslintComplexityResults(cwd, jsonOutput) {
  const results = JSON.parse(jsonOutput);
  const violations = [];
  // Resolve cwd to real path for consistent path.relative calculation
  // (handles macOS /var -> /private/var symlink)
  const realCwd = fs.realpathSync(cwd);

  for (const fileResult of results) {
    for (const msg of fileResult.messages || []) {
      if (msg.ruleId !== 'complexity') continue;

      // Extract function name and complexity from message text
      // Format: "Function 'name' has a complexity of N. Maximum allowed is M."
      // or: "Arrow function has a complexity of N. Maximum allowed is M."
      const funcMatch = msg.message.match(/(?:Function '(\w+)'|(\w+ function))/);
      const complexityMatch = msg.message.match(/complexity of (\d+)/);

      if (complexityMatch) {
        violations.push({
          file: path.relative(realCwd, fileResult.filePath),
          line: msg.line,
          functionName: funcMatch ? funcMatch[1] || funcMatch[2] : 'anonymous',
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
 * @param {string} cwd - Project working directory
 * @param {string[]} files - Array of file paths relative to cwd to check for dead exports
 * @param {{ excludePatterns?: string[] }} [options={}] - Options with patterns to exclude from consumer search
 * @returns {Array<{ file: string, exportName: string, line: number }>}
 */
function analyzeDeadExports(cwd, files, options = {}) {
  if (!files || files.length === 0) return [];

  const excludePatterns = options.excludePatterns || [];
  const deadExports = [];

  for (const file of files) {
    const absPath = path.resolve(cwd, file);
    let content;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }

    const exportNames = extractExportNames(content);
    if (exportNames.length === 0) continue;

    // Find all JS files in the codebase to search for consumers
    const allJsFiles = findJsFiles(cwd, excludePatterns);

    for (const exportName of exportNames) {
      const hasConsumer = allJsFiles.some((jsFile) => {
        // Skip the file itself
        if (path.resolve(cwd, jsFile) === absPath) return false;

        let jsContent;
        try {
          jsContent = fs.readFileSync(path.resolve(cwd, jsFile), 'utf-8');
        } catch {
          return false;
        }

        // Check for destructured import: { exportName } = require(...)
        // or property access: someVar.exportName
        const patterns = [
          new RegExp(`\\b${exportName}\\b.*require`, 'g'),
          new RegExp(`require.*\\b${exportName}\\b`, 'g'),
          new RegExp(`\\.${exportName}\\b`, 'g'),
        ];

        return patterns.some((p) => p.test(jsContent));
      });

      if (!hasConsumer) {
        // Find the line number where this name is exported
        const exportLine = findExportLine(content, exportName);
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
 * @param {string} content - File content
 * @returns {string[]} Array of exported names
 */
function extractExportNames(content) {
  const names = [];

  // Pattern 1: module.exports = { name1, name2, ... }
  // Handle multiline exports blocks
  const moduleExportsMatch = content.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
  if (moduleExportsMatch) {
    const block = moduleExportsMatch[1];
    // Split on commas, extract name (handle `name: value` and plain `name`)
    const entries = block.split(',');
    for (const entry of entries) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      // Could be "name" or "name: value" or "name: someFunction"
      const nameMatch = trimmed.match(/^(\w+)/);
      if (nameMatch) {
        names.push(nameMatch[1]);
      }
    }
  }

  // Pattern 2: exports.funcName = ...
  const exportsPattern = /exports\.(\w+)\s*=/g;
  let match;
  while ((match = exportsPattern.exec(content)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  return names;
}

/**
 * Find the line number where an export name is defined or exported.
 * @param {string} content - File content
 * @param {string} exportName - Name to find
 * @returns {number} Line number (1-based), or 0 if not found
 */
function findExportLine(content, exportName) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(exportName)) {
      return i + 1;
    }
  }
  return 0;
}

/**
 * Recursively find all .js files under cwd, excluding node_modules and
 * files matching excludePatterns.
 * @param {string} cwd - Root directory
 * @param {string[]} excludePatterns - Path patterns to exclude
 * @returns {string[]} Array of relative file paths
 */
function findJsFiles(cwd, excludePatterns = []) {
  const results = [];
  _walkDir(cwd, cwd, results, excludePatterns);
  return results;
}

function _walkDir(rootDir, currentDir, results, excludePatterns) {
  let entries;
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, fullPath);

    // Skip node_modules, .git, .planning
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.planning') {
      continue;
    }

    // Check exclude patterns
    if (excludePatterns.some((p) => relPath.includes(p))) {
      continue;
    }

    if (entry.isDirectory()) {
      _walkDir(rootDir, fullPath, results, excludePatterns);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(relPath);
    }
  }
}

// ─── File Size Analysis ──────────────────────────────────────────────────────

/**
 * Check files against configurable line-count thresholds.
 * @param {string} cwd - Project working directory
 * @param {string[]} files - Array of file paths relative to cwd
 * @param {{ maxLines?: number }} [thresholds={}] - Threshold config with optional maxLines (default 500)
 * @returns {Array<{ file: string, lines: number, threshold: number }>}
 */
function analyzeFileSize(cwd, files, thresholds = {}) {
  if (!files || files.length === 0) return [];

  const maxLines = thresholds.maxLines || 500;
  const violations = [];

  for (const file of files) {
    const absPath = path.resolve(cwd, file);
    let content;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch {
      continue; // Skip non-existent files
    }

    // Simple line count: split by newline, subtract trailing empty line
    const lines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);

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
 * @param {string} cwd - Project working directory
 * @returns {Array<{ file: string, reason: string, last_modified: string, latest_summary: string }>}
 */
function analyzeChangelogDrift(cwd) {
  const changelogPath = path.join(cwd, 'CHANGELOG.md');
  try {
    fs.statSync(changelogPath);
  } catch {
    return []; // No CHANGELOG.md — graceful skip
  }

  // Find all *-SUMMARY.md files under .planning/phases/
  const phasesDir = path.join(cwd, '.planning', 'phases');
  const summaryFiles = _findSummaryFiles(phasesDir);
  if (summaryFiles.length === 0) return []; // Nothing to compare

  // Get mtimes
  const changelogMtime = fs.statSync(changelogPath).mtime;
  let newestSummaryMtime = new Date(0);
  for (const sf of summaryFiles) {
    const mtime = fs.statSync(sf).mtime;
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
 * @param {string} dir - Directory to search
 * @returns {string[]} Array of absolute paths
 */
function _findSummaryFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
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
 * @param {string} cwd - Project working directory
 * @returns {Array<{ file: string, link: string, line: number }>}
 */
function analyzeReadmeLinks(cwd) {
  const readmePath = path.join(cwd, 'README.md');
  let content;
  try {
    content = fs.readFileSync(readmePath, 'utf-8');
  } catch {
    return []; // No README.md — graceful skip
  }

  const broken = [];
  const lines = content.split('\n');
  const linkRegex = /\[([^\]]*)\]\(([^)"\s]+)(?:\s+"[^"]*")?\)/g;

  for (let i = 0; i < lines.length; i++) {
    let match;
    // Reset lastIndex for each line since we reuse the regex
    linkRegex.lastIndex = 0;
    while ((match = linkRegex.exec(lines[i])) !== null) {
      const linkPath = match[2];

      // Skip external links and anchor-only links
      if (linkPath.startsWith('http://') || linkPath.startsWith('https://') || linkPath.startsWith('#')) {
        continue;
      }

      // Resolve relative path against cwd
      const resolved = path.resolve(cwd, linkPath);
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
 * @param {string} cwd - Project working directory
 * @param {string[]} files - Array of file paths relative to cwd
 * @returns {Array<{ file: string, line: number, functionName: string, issue: string }>}
 */
function analyzeJsdocDrift(cwd, files) {
  if (!files || files.length === 0) return [];

  const issues = [];

  for (const file of files) {
    const absPath = path.resolve(cwd, file);
    let content;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }

    // Find all JSDoc block + function pairs
    const jsdocBlockRegex = /\/\*\*[\s\S]*?\*\//g;
    let blockMatch;

    while ((blockMatch = jsdocBlockRegex.exec(content)) !== null) {
      const blockEnd = blockMatch.index + blockMatch[0].length;
      const blockStartLine = content.substring(0, blockMatch.index).split('\n').length;

      // Extract @param names from JSDoc block
      const paramRegex = /@param\s+(?:\{[^}]*\}\s+)?(\w+)/g;
      const docParams = [];
      let paramMatch;
      while ((paramMatch = paramRegex.exec(blockMatch[0])) !== null) {
        docParams.push(paramMatch[1]);
      }

      if (docParams.length === 0) continue; // No @param annotations, skip

      // Look for function declaration within the next few lines after the JSDoc block
      const afterBlock = content.substring(blockEnd);
      const nextLines = afterBlock.split('\n').slice(0, 5).join('\n');

      // Match function patterns
      const funcPatterns = [
        // standard function: function name(params)
        /function\s+(\w+)\s*\(([^)]*)\)/,
        // arrow function: const name = (params) =>
        /(?:const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>/,
        // arrow function: const name = params =>  (single param, no parens)
        /(?:const|let|var)\s+(\w+)\s*=\s*(\w+)\s*=>/,
        // method shorthand: name(params) {
        /(\w+)\s*\(([^)]*)\)\s*\{/,
      ];

      let funcName = null;
      let paramsStr = null;

      for (const pattern of funcPatterns) {
        const funcMatch = nextLines.match(pattern);
        if (funcMatch) {
          funcName = funcMatch[1];
          paramsStr = funcMatch[2];
          break;
        }
      }

      if (!funcName || paramsStr === null || paramsStr === undefined) continue;

      // Extract actual parameter names from the signature
      const actualParams = _extractParamNames(paramsStr);

      // Compare: find extra @param (in doc but not in actual)
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

      // Compare: find missing @param (in actual but not in doc)
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
 * @param {string} paramsStr - The parameters string (contents between parentheses)
 * @returns {string[]} Array of base parameter names
 */
function _extractParamNames(paramsStr) {
  if (!paramsStr || !paramsStr.trim()) return [];

  const params = [];
  // Split by commas, but be careful of nested braces/brackets
  let depth = 0;
  let current = '';

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
    .map((p) => {
      // Remove rest operator
      let cleaned = p.replace(/^\.\.\./, '');
      // Remove default value
      cleaned = cleaned.split('=')[0].trim();
      // If it's a destructured param ({...}), skip — can't match by name
      if (cleaned.startsWith('{') || cleaned.startsWith('[')) return null;
      // Extract just the identifier
      const nameMatch = cleaned.match(/^(\w+)/);
      return nameMatch ? nameMatch[1] : null;
    })
    .filter(Boolean);
}

// ─── Quality Analysis Orchestrator ───────────────────────────────────────────

/**
 * Orchestrate all quality checks (complexity, dead exports, file size, doc drift)
 * and return a structured quality report.
 * @param {string} cwd - Project working directory
 * @param {string} phaseNum - Phase number being analyzed
 * @returns {{ skipped?: boolean, reason?: string, phase?: string, timestamp?: string, summary?: Object, details?: Object }}
 */
function runQualityAnalysis(cwd, phaseNum) {
  const config = getCleanupConfig(cwd);

  if (!config.enabled) {
    return { skipped: true, reason: 'phase_cleanup not enabled' };
  }

  // Find files to analyze: scan lib/*.js as default
  const jsFiles = findAnalysisFiles(cwd, phaseNum);

  // Run core analyses
  const complexityResults = analyzeComplexity(cwd, jsFiles);
  const deadExportResults = analyzeDeadExports(cwd, jsFiles);
  const fileSizeResults = analyzeFileSize(cwd, jsFiles);

  const baseIssues = complexityResults.length + deadExportResults.length + fileSizeResults.length;

  const summary = {
    total_issues: baseIssues,
    complexity_violations: complexityResults.length,
    dead_exports: deadExportResults.length,
    oversized_files: fileSizeResults.length,
  };

  const details = {
    complexity: complexityResults,
    dead_exports: deadExportResults,
    file_size: fileSizeResults,
  };

  // Run doc drift checks when doc_sync is enabled
  if (config.doc_sync) {
    const changelogResults = analyzeChangelogDrift(cwd);
    const readmeResults = analyzeReadmeLinks(cwd);
    const jsdocResults = analyzeJsdocDrift(cwd, jsFiles);

    const docDriftCount = changelogResults.length + readmeResults.length + jsdocResults.length;
    summary.doc_drift_issues = docDriftCount;
    summary.total_issues = baseIssues + docDriftCount;

    details.doc_drift = {
      changelog: changelogResults,
      readme_links: readmeResults,
      jsdoc: jsdocResults,
    };
  }

  return {
    phase: phaseNum,
    timestamp: new Date().toISOString().split('T')[0],
    summary,
    details,
  };
}

/**
 * Find files to analyze for a given phase. Scans lib/*.js as fallback.
 * @param {string} cwd - Project working directory
 * @param {string} _phaseNum - Phase number (reserved for future plan-based file discovery)
 * @returns {string[]} Array of relative file paths
 */
function findAnalysisFiles(cwd, _phaseNum) {
  const libDir = path.join(cwd, 'lib');
  try {
    const entries = fs.readdirSync(libDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => path.join('lib', e.name));
  } catch {
    return [];
  }
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
  runQualityAnalysis,
};
