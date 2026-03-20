'use strict';

/**
 * GRD Wireup -- Discovery engine
 *
 * Pure filesystem-based analysis to identify features that exist in the codebase
 * but lack full integration (exported-but-uncalled, config-without-surface,
 * endpoint-without-integration-test).
 *
 * IMPORTANT: No child process spawn or exec calls. Uses only fs.readFileSync /
 * fs.readdirSync for all analysis.
 *
 * @dependencies ./types, ../utils, ../paths
 */

import type { UnwiredFeature, UnwiredFeatureCategory } from './types';

const fs = require('fs');
const path = require('path');
const {
  safeReadFile,
}: {
  safeReadFile: (filePath: string) => string | null;
} = require('../utils');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Recursively collect all files under a directory matching given extensions.
 * Returns absolute paths.
 */
function _collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  let entries: ReturnType<typeof fs.readdirSync>;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries as Array<{
    name: string;
    isFile: () => boolean;
    isDirectory: () => boolean;
  }>) {
    const fullPath: string = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      results.push(..._collectFiles(fullPath, extensions));
    } else if (entry.isFile()) {
      const ext: string = path.extname(entry.name);
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Extract exported function/value names from a TypeScript/JavaScript source file.
 *
 * Handles two patterns:
 * - module.exports = { name1, name2, ... }
 * - exports.name = ...
 */
function _extractExports(content: string): string[] {
  const names: string[] = [];

  // Pattern 1: module.exports = { name1, name2, ... }
  const moduleExportMatch: RegExpMatchArray | null = content.match(
    /module\.exports\s*=\s*\{([^}]+)\}/
  );
  if (moduleExportMatch) {
    const inner: string = moduleExportMatch[1];
    const parts: string[] = inner.split(',');
    for (const part of parts) {
      const trimmed: string = part.trim();
      if (!trimmed) continue;
      const colonIdx: number = trimmed.indexOf(':');
      const name: string = colonIdx >= 0 ? trimmed.slice(0, colonIdx).trim() : trimmed;
      if (/^\w+$/.test(name)) {
        names.push(name);
      }
    }
  }

  // Pattern 2: exports.name = ...
  const exportsPattern: RegExp = /\bexports\.(\w+)\s*=/g;
  let match: RegExpExecArray | null;
  while ((match = exportsPattern.exec(content)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1]);
    }
  }

  return names;
}

// ─── Scanner: exported-but-uncalled ─────────────────────────────────────────

/**
 * Scan lib/*.ts files for exported functions that are never called/imported
 * in lib/, bin/, or commands/.
 */
function scanExportedButUncalled(cwd: string): UnwiredFeature[] {
  const libDir: string = path.join(cwd, 'lib');
  const binDir: string = path.join(cwd, 'bin');
  const commandsDir: string = path.join(cwd, 'commands');

  let libEntries: ReturnType<typeof fs.readdirSync>;
  try {
    libEntries = fs.readdirSync(libDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const libFiles: string[] = (
    libEntries as Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>
  )
    .filter(
      (e: { name: string; isFile: () => boolean }) => e.isFile() && e.name.endsWith('.ts')
    )
    .map((e: { name: string }) => path.join(libDir, e.name));

  const exportMap: Map<string, string> = new Map();
  const fileContents: Map<string, string> = new Map();

  for (const filePath of libFiles) {
    const content: string | null = safeReadFile(filePath);
    if (!content) continue;
    fileContents.set(filePath, content);
    const relPath: string = path.relative(cwd, filePath);
    const exportedNames: string[] = _extractExports(content);
    for (const name of exportedNames) {
      if (!exportMap.has(name)) {
        exportMap.set(name, relPath);
      }
    }
  }

  const searchDirs: string[] = [libDir, binDir, commandsDir];
  const searchFiles: string[] = [];
  for (const dir of searchDirs) {
    try {
      fs.readdirSync(dir);
      searchFiles.push(..._collectFiles(dir, ['.ts', '.js', '.md']));
    } catch {
      // Dir doesn't exist, skip
    }
  }

  const features: UnwiredFeature[] = [];

  for (const [funcName, relFilePath] of exportMap) {
    const absFilePath: string = path.join(cwd, relFilePath);
    let referenced: boolean = false;

    for (const searchFile of searchFiles) {
      if (path.resolve(searchFile) === path.resolve(absFilePath)) continue;
      const content: string | null = safeReadFile(searchFile);
      if (!content) continue;
      if (new RegExp(`\\b${funcName}\\b`).test(content)) {
        referenced = true;
        break;
      }
    }

    if (!referenced) {
      features.push({
        category: 'exported-but-uncalled' as UnwiredFeatureCategory,
        filePath: relFilePath,
        functionName: funcName,
        suggestedAction: 'Add call site in a command, route, or test',
      });
    }
  }

  return features;
}

// ─── Scanner: config-without-surface ────────────────────────────────────────

/**
 * Scan .planning/config.json for top-level config keys that are not referenced
 * in commands/*.md or bin/*.ts.
 */
function scanConfigWithoutSurface(cwd: string): UnwiredFeature[] {
  const configPath: string = path.join(cwd, '.planning', 'config.json');
  const content: string | null = safeReadFile(configPath);
  if (!content) return [];

  let configObj: Record<string, unknown>;
  try {
    configObj = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return [];
  }

  const configKeys: string[] = Object.keys(configObj);
  if (configKeys.length === 0) return [];

  const commandsDir: string = path.join(cwd, 'commands');
  const binDir: string = path.join(cwd, 'bin');
  const searchFiles: string[] = [];

  try {
    fs.readdirSync(commandsDir);
    searchFiles.push(..._collectFiles(commandsDir, ['.md']));
  } catch {
    // no commands dir
  }

  try {
    fs.readdirSync(binDir);
    searchFiles.push(..._collectFiles(binDir, ['.ts', '.js']));
  } catch {
    // no bin dir
  }

  const combinedContent: string = searchFiles
    .map((f) => safeReadFile(f) || '')
    .join('\n');

  const features: UnwiredFeature[] = [];

  for (const key of configKeys) {
    if (key.startsWith('_')) continue;
    if (!new RegExp(`\\b${key}\\b`).test(combinedContent)) {
      features.push({
        category: 'config-without-surface' as UnwiredFeatureCategory,
        filePath: '.planning/config.json',
        functionName: key,
        suggestedAction: 'Expose via CLI flag, command option, or settings UI',
      });
    }
  }

  return features;
}

// ─── Scanner: endpoint-without-integration-test ──────────────────────────────

/**
 * Scan lib/mcp-server.ts for registered MCP tool names and check if they
 * are referenced in tests/integration/.
 */
function scanEndpointsWithoutTests(cwd: string): UnwiredFeature[] {
  const serverPath: string = path.join(cwd, 'lib', 'mcp-server.ts');
  const content: string | null = safeReadFile(serverPath);
  if (!content) return [];

  const toolNamePattern: RegExp = /name:\s*['"](\w+)['"]/g;
  const toolNames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = toolNamePattern.exec(content)) !== null) {
    const name: string = match[1];
    if (name.startsWith('grd_') && !toolNames.includes(name)) {
      toolNames.push(name);
    }
  }

  if (toolNames.length === 0) return [];

  const integrationDir: string = path.join(cwd, 'tests', 'integration');
  const integrationFiles: string[] = [];
  try {
    fs.readdirSync(integrationDir);
    integrationFiles.push(..._collectFiles(integrationDir, ['.ts', '.js']));
  } catch {
    // no integration dir
  }

  const combinedIntegration: string = integrationFiles
    .map((f) => safeReadFile(f) || '')
    .join('\n');

  const features: UnwiredFeature[] = [];

  for (const toolName of toolNames) {
    if (!combinedIntegration.includes(toolName)) {
      features.push({
        category: 'endpoint-without-integration-test' as UnwiredFeatureCategory,
        filePath: 'lib/mcp-server.ts',
        functionName: toolName,
        suggestedAction: 'Add integration test covering this endpoint',
      });
    }
  }

  return features;
}

// ─── Public Orchestrator ─────────────────────────────────────────────────────

/**
 * Discover all unwired features in the codebase using pure filesystem analysis.
 *
 * Runs three scanners and returns combined results sorted by category then filePath.
 * NEVER spawns child processes — pure fs.readFileSync/readdirSync only.
 *
 * @param cwd - Absolute path to the project root
 * @returns Array of UnwiredFeature objects describing integration gaps
 */
function discoverUnwiredFeatures(cwd: string): UnwiredFeature[] {
  const allFeatures: UnwiredFeature[] = [
    ...scanExportedButUncalled(cwd),
    ...scanConfigWithoutSurface(cwd),
    ...scanEndpointsWithoutTests(cwd),
  ];

  allFeatures.sort((a, b) => {
    const catCmp: number = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return a.filePath.localeCompare(b.filePath);
  });

  return allFeatures;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { discoverUnwiredFeatures };
