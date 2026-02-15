/**
 * GRD Phase Cleanup — Config schema handling and quality analysis functions
 *
 * Provides config reading for the phase_cleanup section, and quality analysis
 * functions for ESLint complexity, dead export detection, and file size checks.
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
          functionName: funcMatch ? (funcMatch[1] || funcMatch[2]) : 'anonymous',
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

// ─── Quality Analysis Orchestrator ───────────────────────────────────────────

/**
 * Orchestrate all quality checks (complexity, dead exports, file size) and
 * return a structured quality report.
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

  // Run all three analyses
  const complexityResults = analyzeComplexity(cwd, jsFiles);
  const deadExportResults = analyzeDeadExports(cwd, jsFiles);
  const fileSizeResults = analyzeFileSize(cwd, jsFiles);

  return {
    phase: phaseNum,
    timestamp: new Date().toISOString().split('T')[0],
    summary: {
      total_issues: complexityResults.length + deadExportResults.length + fileSizeResults.length,
      complexity_violations: complexityResults.length,
      dead_exports: deadExportResults.length,
      oversized_files: fileSizeResults.length,
    },
    details: {
      complexity: complexityResults,
      dead_exports: deadExportResults,
      file_size: fileSizeResults,
    },
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
  runQualityAnalysis,
};
