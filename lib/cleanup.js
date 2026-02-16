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

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────────────

const CLEANUP_DEFAULTS = {
  enabled: false, refactoring: false, doc_sync: false,
  test_coverage: false, export_consistency: false,
  doc_staleness: false, config_schema: false,
  cleanup_threshold: 5,
};

/**
 * Read the `phase_cleanup` section from `.planning/config.json` and return
 * a merged config object with defaults for any missing fields.
 * @param {string} cwd - Project working directory
 * @returns {{ enabled: boolean, refactoring: boolean, doc_sync: boolean, test_coverage: boolean, export_consistency: boolean, doc_staleness: boolean, config_schema: boolean, cleanup_threshold: number }}
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

// ─── Test Coverage Gap Detection ──────────────────────────────────────────────

/**
 * Detect exported functions/values with no corresponding mention in test files.
 * For each lib/foo.js, checks tests/unit/foo.test.js for references to each export.
 * @param {string} cwd - Project working directory
 * @param {string[]} files - Array of file paths relative to cwd
 * @returns {Array<{ file: string, exportName: string, testFile: string, line: number }>}
 */
function analyzeTestCoverageGaps(cwd, files) {
  if (!files || files.length === 0) return [];

  const gaps = [];

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

    // Derive test file path: lib/foo.js → tests/unit/foo.test.js
    const basename = path.basename(file, '.js');
    const testFile = path.join('tests', 'unit', `${basename}.test.js`);
    const testAbsPath = path.resolve(cwd, testFile);

    let testContent;
    try {
      testContent = fs.readFileSync(testAbsPath, 'utf-8');
    } catch {
      // No test file → all exports are uncovered
      for (const exportName of exportNames) {
        const line = findExportLine(content, exportName);
        gaps.push({ file, exportName, testFile, line });
      }
      continue;
    }

    for (const exportName of exportNames) {
      if (!testContent.includes(exportName)) {
        const line = findExportLine(content, exportName);
        gaps.push({ file, exportName, testFile, line });
      }
    }
  }

  return gaps;
}

// ─── Export Consistency Detection ──────────────────────────────────────────────

/**
 * Detect stale imports where a destructured require references a name no longer
 * exported by the target module.
 * @param {string} cwd - Project working directory
 * @param {string[]} files - Array of file paths relative to cwd
 * @returns {Array<{ file: string, importedName: string, sourceModule: string, line: number }>}
 */
function analyzeExportConsistency(cwd, files) {
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

    const lines = content.split('\n');
    const requirePattern = /const\s+\{([^}]+)\}\s*=\s*require\(['"]([^'"]+)['"]\)/;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(requirePattern);
      if (!match) continue;

      const importedNames = match[1].split(',').map((n) => n.trim()).filter(Boolean);
      const requirePath = match[2];

      // Only check relative imports
      if (!requirePath.startsWith('.')) continue;

      let sourcePath = path.resolve(path.dirname(absPath), requirePath);
      if (!sourcePath.endsWith('.js')) sourcePath += '.js';

      let sourceContent;
      try {
        sourceContent = fs.readFileSync(sourcePath, 'utf-8');
      } catch {
        continue;
      }

      const sourceExports = extractExportNames(sourceContent);
      const sourceModule = path.relative(cwd, sourcePath);

      for (const name of importedNames) {
        const cleanName = name.split(':')[0].trim();
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
 * @param {string} cwd - Project working directory
 * @returns {Array<{ file: string, issue: string, detail: string, line: number }>}
 */
function analyzeDocStaleness(cwd) {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  let claudeContent;
  try {
    claudeContent = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    return [];
  }

  const mcpPath = path.join(cwd, 'lib', 'mcp-server.js');
  let mcpContent;
  try {
    mcpContent = fs.readFileSync(mcpPath, 'utf-8');
  } catch {
    return [];
  }

  const issues = [];
  const documentedCommands = _extractDocumentedCommands(claudeContent);
  const actualTools = _extractToolNames(mcpContent);

  // Check documented but not implemented
  for (const cmd of documentedCommands) {
    const hasMatch = cmd.possibleNames.some((n) => actualTools.has(n));
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
  const allDocumentedNames = new Set();
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
 * @param {string} content - CLAUDE.md file content
 * @returns {Array<{ raw: string, possibleNames: string[], line: number }>}
 */
function _extractDocumentedCommands(content) {
  const commands = [];
  const lines = content.split('\n');

  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^## CLI Tooling/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    if (!inSection) continue;

    const cmdMatch = line.match(/^- `([^`]+)`/);
    if (!cmdMatch) continue;

    const rawCmd = cmdMatch[1];
    const cleaned = rawCmd
      .replace(/\[[^\]]*\]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/--\S+(\s+"[^"]*"|\s+\S+)?/g, '')
      .replace(/\.\.\./g, '')
      .trim()
      .replace(/\s+/g, ' ');

    if (!cleaned) continue;

    const possibleNames = _generateToolNames(cleaned);
    if (possibleNames.length > 0) {
      commands.push({ raw: rawCmd, possibleNames, line: i + 1 });
    }
  }

  return commands;
}

/**
 * Generate possible MCP tool names from a cleaned CLI command string.
 * Handles slash-separated subcommands and " / " alternatives.
 * @param {string} cleaned - Cleaned command string
 * @returns {string[]}
 */
function _generateToolNames(cleaned) {
  const names = [];

  // Handle " / " pattern: "state add-blocker / resolve-blocker"
  if (cleaned.includes(' / ')) {
    const parts = cleaned.split(' / ').map((p) => p.trim());
    const firstParts = parts[0].split(/\s+/);
    if (firstParts.length >= 2) {
      const base = firstParts.slice(0, -1).join('_').replace(/-/g, '_');
      names.push('grd_' + base + '_' + firstParts[firstParts.length - 1].replace(/-/g, '_'));
      for (let j = 1; j < parts.length; j++) {
        names.push('grd_' + base + '_' + parts[j].replace(/-/g, '_'));
      }
    }
    return names;
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1];

  // Handle slash-separated in last word
  if (lastWord && lastWord.includes('/')) {
    const base = words.slice(0, -1).join('_').replace(/-/g, '_');
    const subs = lastWord.split('/');
    // Add base-only version (for parameterized tools like scaffold)
    if (base) names.push('grd_' + base);
    // Add expanded versions
    for (const sub of subs) {
      const subNorm = sub.replace(/-/g, '_');
      names.push(base ? 'grd_' + base + '_' + subNorm : 'grd_' + subNorm);
    }
    return names;
  }

  // Simple command
  names.push('grd_' + cleaned.replace(/[\s-]+/g, '_'));
  return names;
}

/**
 * Extract tool names from mcp-server.js COMMAND_DESCRIPTORS.
 * @param {string} content - mcp-server.js file content
 * @returns {Set<string>}
 */
function _extractToolNames(content) {
  const names = new Set();
  const namePattern = /name:\s*'(grd_[^']+)'/g;
  let match;
  while ((match = namePattern.exec(content)) !== null) {
    names.add(match[1]);
  }
  return names;
}

// ─── Config Schema Drift Detection ───────────────────────────────────────────

/**
 * Detect drift between documented config keys in CLAUDE.md and actual
 * config.json keys, and verify COMMAND_DESCRIPTORS execute references.
 * @param {string} cwd - Project working directory
 * @returns {Array<{ file: string, issue: string, detail: string, line: number }>}
 */
function analyzeConfigSchemaDrift(cwd) {
  const issues = [];

  // 1. Parse CLAUDE.md Configuration section for documented config keys
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  let claudeContent;
  try {
    claudeContent = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    return [];
  }

  const documentedKeys = _extractDocumentedConfigKeys(claudeContent);

  // 2. Read actual config.json
  const configPath = path.join(cwd, '.planning', 'config.json');
  let actualKeys;
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    actualKeys = Object.keys(parsed).filter((k) => !k.startsWith('_'));
  } catch {
    actualKeys = null;
  }

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

    const documentedKeySet = new Set(documentedKeys.map((dk) => dk.key));
    for (const key of actualKeys) {
      if (!documentedKeySet.has(key)) {
        issues.push({
          file: '.planning/config.json',
          issue: 'config-key-not-documented',
          detail: `Config key "${key}" present but not documented in CLAUDE.md`,
          line: 0,
        });
      }
    }
  }

  // 3. Check COMMAND_DESCRIPTORS execute references
  const mcpPath = path.join(cwd, 'lib', 'mcp-server.js');
  let mcpContent;
  try {
    mcpContent = fs.readFileSync(mcpPath, 'utf-8');
  } catch {
    return issues;
  }

  const executePattern = /execute:\s*\([^)]*\)\s*=>\s*(\w+)\(/g;
  const executeFunctions = new Set();
  let execMatch;
  while ((execMatch = executePattern.exec(mcpContent)) !== null) {
    executeFunctions.add(execMatch[1]);
  }

  const preamble = mcpContent.split('const COMMAND_DESCRIPTORS')[0] || '';
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
 * @param {string} content - CLAUDE.md file content
 * @returns {Array<{ key: string, line: number }>}
 */
function _extractDocumentedConfigKeys(content) {
  const keys = [];
  const lines = content.split('\n');

  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^## Configuration/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    if (!inSection) continue;

    const keyMatch = line.match(/^- `(\w+)`/);
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
    summary.total_issues += docDriftCount;

    details.doc_drift = {
      changelog: changelogResults,
      readme_links: readmeResults,
      jsdoc: jsdocResults,
    };
  }

  // Run test coverage gap analysis when test_coverage is enabled
  if (config.test_coverage) {
    const testCoverageResults = analyzeTestCoverageGaps(cwd, jsFiles);
    summary.test_coverage_gaps = testCoverageResults.length;
    summary.total_issues += testCoverageResults.length;
    details.test_coverage = testCoverageResults;
  }

  // Run export consistency analysis when export_consistency is enabled
  if (config.export_consistency) {
    const exportConsistencyResults = analyzeExportConsistency(cwd, jsFiles);
    summary.stale_imports = exportConsistencyResults.length;
    summary.total_issues += exportConsistencyResults.length;
    details.export_consistency = exportConsistencyResults;
  }

  // Run doc staleness analysis when doc_staleness is enabled
  if (config.doc_staleness) {
    const docStalenessResults = analyzeDocStaleness(cwd);
    summary.doc_staleness_issues = docStalenessResults.length;
    summary.total_issues += docStalenessResults.length;
    details.doc_staleness = docStalenessResults;
  }

  // Run config schema drift analysis when config_schema is enabled
  if (config.config_schema) {
    const configSchemaResults = analyzeConfigSchemaDrift(cwd);
    summary.config_schema_issues = configSchemaResults.length;
    summary.total_issues += configSchemaResults.length;
    details.config_schema = configSchemaResults;
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

// ─── Cleanup Plan Generation ──────────────────────────────────────────────────

/**
 * Auto-generate a cleanup PLAN.md when quality issues exceed a configurable threshold.
 * Scans existing plan files in the phase directory to determine the next plan number,
 * then writes a standard-format PLAN.md with tasks derived from the quality report.
 * @param {string} cwd - Project working directory
 * @param {string} phaseNum - Current phase number (string, e.g. "14")
 * @param {Object} qualityReport - Quality report object from runQualityAnalysis
 * @returns {{ path: string, plan_number: string, issues_addressed: number } | null} Plan info or null if below threshold
 */
function generateCleanupPlan(cwd, phaseNum, qualityReport) {
  const config = getCleanupConfig(cwd);
  const threshold = config.cleanup_threshold;

  // No plan needed if issues are at or below threshold
  if (!qualityReport || !qualityReport.summary || qualityReport.summary.total_issues <= threshold) {
    return null;
  }

  // Find phase directory
  const phasesDir = path.join(cwd, '.planning', 'phases');
  let phaseDir = null;
  let phaseDirName = null;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const normalized = String(phaseNum).padStart(2, '0');
    const match = dirs.find((d) => d.startsWith(normalized + '-') || d === normalized);
    if (match) {
      phaseDir = path.join(phasesDir, match);
      phaseDirName = match;
    }
  } catch {
    // phases directory doesn't exist
  }

  if (!phaseDir) return null;

  // Find next plan number
  let nextPlanNum = 1;
  try {
    const files = fs.readdirSync(phaseDir);
    const normalized = String(phaseNum).padStart(2, '0');
    const planFiles = files.filter((f) => {
      const pattern = new RegExp(`^${normalized}-(\\d{2})-PLAN\\.md$`);
      return pattern.test(f);
    });

    if (planFiles.length > 0) {
      const planNums = planFiles.map((f) => {
        const m = f.match(/(\d{2})-PLAN\.md$/);
        return m ? parseInt(m[1], 10) : 0;
      });
      nextPlanNum = Math.max(...planNums) + 1;
    }
  } catch {
    // directory read error
  }

  const paddedPlan = String(nextPlanNum).padStart(2, '0');
  const phaseSlug = phaseDirName.replace(/^\d+(?:\.\d+)?-?/, '');

  // Collect unique files from quality issues
  const filesSet = new Set();
  const { details } = qualityReport;
  if (details.complexity) {
    details.complexity.forEach((v) => filesSet.add(v.file));
  }
  if (details.dead_exports) {
    details.dead_exports.forEach((v) => filesSet.add(v.file));
  }
  if (details.file_size) {
    details.file_size.forEach((v) => filesSet.add(v.file));
  }
  if (details.doc_drift) {
    if (details.doc_drift.changelog) {
      details.doc_drift.changelog.forEach((v) => filesSet.add(v.file));
    }
    if (details.doc_drift.readme_links) {
      details.doc_drift.readme_links.forEach((v) => filesSet.add(v.file));
    }
    if (details.doc_drift.jsdoc) {
      details.doc_drift.jsdoc.forEach((v) => filesSet.add(v.file));
    }
  }
  if (details.test_coverage) {
    details.test_coverage.forEach((v) => filesSet.add(v.file));
  }
  if (details.export_consistency) {
    details.export_consistency.forEach((v) => filesSet.add(v.file));
  }
  if (details.doc_staleness) {
    details.doc_staleness.forEach((v) => filesSet.add(v.file));
  }
  if (details.config_schema) {
    details.config_schema.forEach((v) => filesSet.add(v.file));
  }

  const filesModified = [...filesSet];

  // Build tasks from quality report
  const tasks = [];

  // Task 1: Code quality issues (complexity, dead exports, file size)
  const codeIssues = [];
  if (details.complexity && details.complexity.length > 0) {
    codeIssues.push(
      `- Refactor ${details.complexity.length} high-complexity function(s): ${details.complexity.map((v) => `${v.functionName} in ${v.file}`).join(', ')}`
    );
  }
  if (details.dead_exports && details.dead_exports.length > 0) {
    codeIssues.push(
      `- Remove or document ${details.dead_exports.length} dead export(s): ${details.dead_exports.map((v) => `${v.exportName} in ${v.file}`).join(', ')}`
    );
  }
  if (details.file_size && details.file_size.length > 0) {
    codeIssues.push(
      `- Split ${details.file_size.length} oversized file(s): ${details.file_size.map((v) => `${v.file} (${v.lines} lines)`).join(', ')}`
    );
  }

  if (codeIssues.length > 0) {
    tasks.push({
      name: 'Resolve code quality issues',
      items: codeIssues,
    });
  }

  // Task 2: Doc drift issues
  const docIssues = [];
  if (details.doc_drift) {
    if (details.doc_drift.changelog && details.doc_drift.changelog.length > 0) {
      docIssues.push(`- Update stale CHANGELOG.md`);
    }
    if (details.doc_drift.readme_links && details.doc_drift.readme_links.length > 0) {
      docIssues.push(
        `- Fix ${details.doc_drift.readme_links.length} broken README link(s): ${details.doc_drift.readme_links.map((v) => v.link).join(', ')}`
      );
    }
    if (details.doc_drift.jsdoc && details.doc_drift.jsdoc.length > 0) {
      docIssues.push(
        `- Fix ${details.doc_drift.jsdoc.length} JSDoc mismatch(es): ${details.doc_drift.jsdoc.map((v) => `${v.functionName} in ${v.file}`).join(', ')}`
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
  if (details.test_coverage && details.test_coverage.length > 0) {
    tasks.push({
      name: 'Close test coverage gaps',
      items: details.test_coverage.map(
        (v) => `- Add tests for ${v.exportName} from ${v.file} in ${v.testFile}`
      ),
    });
  }

  // Task: Consistency and schema issues
  const consistencyIssues = [];
  if (details.export_consistency && details.export_consistency.length > 0) {
    consistencyIssues.push(
      `- Fix ${details.export_consistency.length} stale import(s): ${details.export_consistency.map((v) => `${v.importedName} in ${v.file}`).join(', ')}`
    );
  }
  if (details.doc_staleness && details.doc_staleness.length > 0) {
    consistencyIssues.push(
      `- Resolve ${details.doc_staleness.length} doc staleness issue(s)`
    );
  }
  if (details.config_schema && details.config_schema.length > 0) {
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
      items: [`- Address ${qualityReport.summary.total_issues} quality issue(s) found during analysis`],
    });
  }

  // Build PLAN.md content
  const filesModifiedYaml = filesModified.map((f) => `  - "${f}"`).join('\n');
  const taskBlocks = tasks
    .map((t, i) => {
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

  const planContent = `---
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
Auto-generated cleanup plan for ${qualityReport.summary.total_issues} quality issue(s) detected during phase ${phaseNum} completion.
</objective>

<tasks>

${taskBlocks}

</tasks>

<success_criteria>
All quality issues from phase ${phaseNum} completion resolved.
</success_criteria>
`;

  // Write the plan file
  const normalized = String(phaseNum).padStart(2, '0');
  const planFileName = `${normalized}-${paddedPlan}-PLAN.md`;
  const planPath = path.join(phaseDir, planFileName);
  fs.writeFileSync(planPath, planContent, 'utf-8');

  return {
    path: path.relative(cwd, planPath),
    plan_number: paddedPlan,
    issues_addressed: qualityReport.summary.total_issues,
  };
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
};
