'use strict';

/**
 * GRD Evolve -- Feature dimension discoverers
 *
 * Two large dimension discoverers: discoverImproveFeatureItems and
 * discoverNewFeatureItems. Separated from _dimensions.ts to stay
 * under the 600-line sub-module limit.
 *
 * Private helper module -- imported only by ./_dimensions.ts.
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

// ─── Improve Features Discoverer ────────────────────────────────────────────

/**
 * Discover feature improvement opportunities.
 * Finds existing features that could be enhanced with better output,
 * error recovery, API consolidation, or UX improvements.
 */
function discoverImproveFeatureItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');
  const cmdDir: string = path.join(cwd, 'commands');

  // 1. Commands that output raw JSON without human-readable formatting option
  try {
    const libFiles: string[] = fs.readdirSync(libDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')).map((e: { name: string }) => e.name);
    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;
      const outputPattern = /output\(\s*(\w+)\s*,\s*raw\s*(?:,\s*raw\s*\?)?\s*\)/g;
      let oMatch: RegExpExecArray | null;
      while ((oMatch = outputPattern.exec(content)) !== null) {
        const fullCall: string = content.substring(oMatch.index, oMatch.index + 100);
        if (!/output\([^)]*,[^,]*,[^)]+\)/.test(fullCall)) {
          const lineNum: number = content.substring(0, oMatch.index).split('\n').length;
          items.push(createWorkItem('improve-features', `improve-output-${path.basename(file, '.js')}-L${lineNum}`, `Add human-readable output in ${file} line ${lineNum}`, `lib/${file} calls output() at line ${lineNum} without a human-readable text format (third argument). When --raw is used, users see nothing useful. Add a formatted text representation.`, { effort: 'small' }));
        }
      }
    }
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // 2. Error paths that don't suggest recovery actions
  try {
    const libFiles: string[] = fs.readdirSync(libDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')).map((e: { name: string }) => e.name);
    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;
      const errorPattern = /error\(\s*['"`]([^'"`]{30,})['"`]\s*\)/g;
      let eMatch: RegExpExecArray | null;
      while ((eMatch = errorPattern.exec(content)) !== null) {
        const msg: string = eMatch[1];
        if (!/\b(?:try|run|check|use|set|ensure|add|create|install|verify)\b/i.test(msg)) {
          const lineNum: number = content.substring(0, eMatch.index).split('\n').length;
          items.push(createWorkItem('improve-features', `add-fallback-${path.basename(file, '.js')}-L${lineNum}`, `Add recovery hint to error in ${file} line ${lineNum}`, `error() in lib/${file} at line ${lineNum} says "${msg.substring(0, 60)}..." but does not suggest what the user should do to fix it. Add an actionable recovery hint.`, { effort: 'small' }));
        }
      }
    }
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // 3. Commands with overlapping functionality that could be consolidated
  try {
    const cmdFiles: string[] = fs.readdirSync(cmdDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md')).map((e: { name: string }) => e.name);
    const prefixGroups: Record<string, string[]> = {};
    for (const file of cmdFiles) {
      const parts: string[] = file.replace('.md', '').split('-');
      if (parts.length >= 2) {
        const prefix: string = parts[0];
        if (!prefixGroups[prefix]) prefixGroups[prefix] = [];
        prefixGroups[prefix].push(file);
      }
    }
    for (const [prefix, files] of Object.entries(prefixGroups)) {
      if (files.length >= 4) {
        items.push(createWorkItem('improve-features', `consolidate-${prefix}-commands`, `Consider consolidating ${prefix}-* commands (${files.length} commands)`, `There are ${files.length} commands with prefix "${prefix}-": ${files.join(', ')}. Consider whether some could be subcommands of a single parent command for a cleaner UX.`, { effort: 'large' }));
      }
    }
  } catch { /* commands/ dir missing */ }

  // 4. Lib modules that could benefit from caching
  try {
    const libFiles: string[] = fs.readdirSync(libDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')).map((e: { name: string }) => e.name);
    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;
      const readCalls: string[] = [];
      const readPattern = /(?:readFileSync|safeReadFile)\(\s*([^)]+)\)/g;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = readPattern.exec(content)) !== null) { readCalls.push(rMatch[1].trim()); }
      const seen: Record<string, number> = {};
      for (const call of readCalls) { seen[call] = (seen[call] || 0) + 1; }
      for (const [callExpr, count] of Object.entries(seen)) {
        if (count >= 3 && callExpr.length < 80) {
          items.push(createWorkItem('improve-features', `enhance-caching-${path.basename(file, '.js')}`, `Add caching for repeated file reads in ${file}`, `lib/${file} reads ${callExpr} ${count} times. Cache the result in a local variable to avoid redundant I/O.`, { effort: 'small' }));
          break;
        }
      }
    }
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  // 5. Agent definitions that could benefit from tool restrictions
  const agentDir: string = path.join(cwd, 'agents');
  try {
    const agentFiles: string[] = fs.readdirSync(agentDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md')).map((e: { name: string }) => e.name);
    for (const file of agentFiles) {
      const content: string | null = safeReadFile(path.join(agentDir, file));
      if (!content) continue;
      const fmMatch: RegExpMatchArray | null = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;
      const frontmatter: string = fmMatch[1];
      const hasToolRestrictions: boolean = frontmatter.includes('allowed_tools') || frontmatter.includes('disallowed_tools') || /^tools:/m.test(frontmatter);
      if (!hasToolRestrictions) {
        items.push(createWorkItem('improve-features', `enhance-agent-${path.basename(file, '.md')}`, `Add tool restrictions to ${file} agent`, `Agent agents/${file} has no tool restrictions in frontmatter. Adding allowed_tools or disallowed_tools improves safety and focuses the agent on its specific task.`, { effort: 'small' }));
      }
    }
  } catch { /* agents/ dir missing */ }

  return items;
}

// ─── New Features Discoverer ────────────────────────────────────────────────

/**
 * Discover new feature opportunities.
 * Checks for missing MCP tools, input validation, error quality,
 * dry-run support, integration test coverage, and more.
 */
function discoverNewFeatureItems(cwd: string): WorkItem[] {
  const items: WorkItem[] = [];
  const libDir: string = path.join(cwd, 'lib');
  const cmdDir: string = path.join(cwd, 'commands');
  const agentDir: string = path.join(cwd, 'agents');
  const commandsContent: string | null = readLibFileCached(path.join(libDir, 'commands.js'));

  // 1. Init workflows without MCP tool bindings
  const contextPath: string = path.join(libDir, 'context.js');
  const mcpPath: string = path.join(libDir, 'mcp-server.js');
  try {
    const contextContent: string | null = readLibFileCached(contextPath);
    const mcpContent: string | null = readLibFileCached(mcpPath);
    if (contextContent && mcpContent) {
      const initPattern = /function\s+(cmdInit\w+)\s*\(/g;
      let initMatch: RegExpExecArray | null;
      while ((initMatch = initPattern.exec(contextContent)) !== null) {
        const funcName: string = initMatch[1];
        if (!mcpContent.includes(funcName)) {
          items.push(createWorkItem('new-features', `mcp-tool-${funcName.replace(/^cmdInit/, '').toLowerCase()}`, `Add MCP tool for ${funcName}`, `Init workflow ${funcName} in lib/context.js does not have a corresponding MCP tool binding in lib/mcp-server.js. Adding it would expose the workflow to MCP clients.`, { effort: 'medium' }));
        }
      }
    }
  } catch { /* Files not found */ }

  // 2. CLI commands with missing input validation
  try {
    if (commandsContent) {
      const handlerPattern = /function\s+(cmd\w+)\s*\([^)]*args[^)]*\)/g;
      let hMatch: RegExpExecArray | null;
      while ((hMatch = handlerPattern.exec(commandsContent)) !== null) {
        const funcName: string = hMatch[1];
        const bodyStart: number = commandsContent.indexOf('{', hMatch.index);
        if (bodyStart === -1) continue;
        const bodySlice: string = commandsContent.substring(bodyStart, bodyStart + 1500);
        if (/args\[\d+\]/.test(bodySlice) && !/args\.length/.test(bodySlice) && !/if\s*\(\s*!args/.test(bodySlice)) {
          items.push(createWorkItem('new-features', `missing-validation-${funcName.replace(/^cmd/, '').toLowerCase()}`, `Add input validation to ${funcName}`, `Command handler ${funcName} in lib/commands.js accesses args[] without checking argument count. Add validation to give users a helpful error message when arguments are missing.`, { effort: 'small' }));
        }
      }
    }
  } catch { /* commands.js not found */ }

  // 3. Generic/unhelpful error messages
  try {
    const libFiles: string[] = fs.readdirSync(libDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')).map((e: { name: string }) => e.name);
    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;
      const errorCallPattern = /error\(\s*['"`]([^'"`]{1,25})['"`]\s*\)/g;
      let errMatch: RegExpExecArray | null;
      while ((errMatch = errorCallPattern.exec(content)) !== null) {
        const msg: string = errMatch[1];
        if (/^(failed|error|invalid|missing|not found|unknown)\.?$/i.test(msg.trim())) {
          const lineNum: number = content.substring(0, errMatch.index).split('\n').length;
          items.push(createWorkItem('new-features', `generic-error-${path.basename(file, '.js')}-L${lineNum}`, `Improve error message in ${file} line ${lineNum}`, `error("${msg}") in lib/${file} at line ${lineNum} is too generic. Add context about what failed and what the user should do (e.g., which command, which file, expected format).`, { effort: 'small' }));
        }
      }
    }
  } catch { /* lib/ directory missing */ }

  // 4. Commands that write files but lack --dry-run support
  try {
    if (commandsContent) {
      const cmdPattern = /function\s+(cmd\w+)\s*\(/g;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = cmdPattern.exec(commandsContent)) !== null) {
        const funcName: string = cMatch[1];
        const bodyStart: number = commandsContent.indexOf('{', cMatch.index);
        if (bodyStart === -1) continue;
        const bodySlice: string = commandsContent.substring(bodyStart, bodyStart + 2000);
        const writesFiles: boolean = /(?:writeFileSync|mkdirSync|scaffold|fs\.write)/.test(bodySlice);
        const hasDryRun: boolean = /dry.?run|dryRun|--dry-run/.test(bodySlice);
        if (writesFiles && !hasDryRun) {
          items.push(createWorkItem('new-features', `missing-dry-run-${funcName.replace(/^cmd/, '').toLowerCase()}`, `Add --dry-run support to ${funcName}`, `Command ${funcName} in lib/commands.js writes files but does not support --dry-run. Adding dry-run would let users preview changes before applying them.`, { effort: 'medium' }));
        }
      }
    }
  } catch { /* commands.js not found */ }

  // 5. Commands without integration test coverage
  try {
    const cmdFiles: string[] = fs.readdirSync(cmdDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md')).map((e: { name: string }) => path.basename(e.name, '.md'));
    const integrationDir: string = path.join(cwd, 'tests', 'integration');
    let integrationContent: string = '';
    try {
      const integrationFiles: string[] = fs.readdirSync(integrationDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')).map((e: { name: string }) => e.name);
      for (const f of integrationFiles) { integrationContent += safeReadFile(path.join(integrationDir, f)) || ''; }
    } catch { /* No integration test dir */ }
    if (integrationContent) {
      for (const cmd of cmdFiles) {
        const normalizedCmd: string = cmd.replace(/-/g, '[- ]?');
        const pattern = new RegExp(normalizedCmd, 'i');
        if (!pattern.test(integrationContent)) {
          items.push(createWorkItem('new-features', `missing-integration-test-${cmd}`, `Add integration test for /${cmd} command`, `Command commands/${cmd}.md has no references in tests/integration/. Adding integration tests ensures the command works end-to-end and catches regressions.`, { effort: 'medium' }));
        }
      }
    }
  } catch { /* commands/ dir missing */ }

  // 6. Agent definitions without init workflows
  try {
    const agentFiles: string[] = fs.readdirSync(agentDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.md')).map((e: { name: string }) => path.basename(e.name, '.md'));
    const contextContent: string | null = readLibFileCached(path.join(libDir, 'context.js'));
    if (contextContent) {
      for (const agent of agentFiles) {
        const initName: string = `cmdInit${agent.replace(/-(\w)/g, (_: string, c: string) => c.toUpperCase()).replace(/^(\w)/, (c: string) => c.toUpperCase())}`;
        const shortName: string = agent.replace(/^grd-/, '');
        if (!contextContent.includes(initName) && !contextContent.includes(`'${shortName}'`) && !contextContent.includes(`"${shortName}"`)) {
          items.push(createWorkItem('new-features', `missing-agent-init-${agent}`, `Add init workflow for ${agent} agent`, `Agent agents/${agent}.md does not have a corresponding init workflow in lib/context.js. Adding one would provide the agent with optimized context (state snapshot, plan index, etc.) instead of raw file reads.`, { effort: 'medium' }));
        }
      }
    }
  } catch { /* agents/ dir missing */ }

  // 7. Hardcoded magic numbers/strings & 8. Long-running operations without progress
  try {
    const libFiles: string[] = fs.readdirSync(libDir, { withFileTypes: true }).filter((e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')).map((e: { name: string }) => e.name);
    for (const file of libFiles) {
      const content: string | null = readLibFileCached(path.join(libDir, file));
      if (!content) continue;
      if (file !== 'evolve.js') {
        const timeoutPattern = /(?:timeout|TIMEOUT|delay|DELAY)\s*[:=]\s*(\d{4,})/g;
        let tMatch: RegExpExecArray | null;
        while ((tMatch = timeoutPattern.exec(content)) !== null) {
          const value: string = tMatch[1];
          const lineNum: number = content.substring(0, tMatch.index).split('\n').length;
          items.push(createWorkItem('new-features', `configurable-default-${path.basename(file, '.js')}-L${lineNum}`, `Make timeout configurable in ${file}`, `lib/${file} has a hardcoded timeout value of ${value}ms at line ${lineNum}. Move it to config.json so users can tune it for their environment.`, { effort: 'small' }));
        }
      }
      const loopPattern = /for\s*\((?:const|let|var)\s+(\w+)\s+of\s+(\w+)\)\s*\{/g;
      let lMatch: RegExpExecArray | null;
      while ((lMatch = loopPattern.exec(content)) !== null) {
        const arrayName: string = lMatch[2];
        const loopStart: number = lMatch.index;
        const bodySlice: string = content.substring(loopStart, loopStart + 500);
        const isHeavy: boolean = /(?:spawnSync|execSync|spawnClaude(?:Async)?|writeFileSync|appendFileSync)/.test(bodySlice);
        const hasProgress: boolean = /(?:log\(|process\.stderr\.write|progress|spinner)/.test(bodySlice);
        if (isHeavy && !hasProgress) {
          const lineNum: number = content.substring(0, loopStart).split('\n').length;
          items.push(createWorkItem('new-features', `missing-progress-${path.basename(file, '.js')}-L${lineNum}`, `Add progress output to loop in ${file} line ${lineNum}`, `lib/${file} iterates over ${arrayName} at line ${lineNum} performing heavy operations (file I/O or process spawn) without progress feedback. Add a log statement showing N/total to help users track long-running operations.`, { effort: 'small' }));
        }
      }
    }
  } catch (err) {
    if (err && (err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return items;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  discoverImproveFeatureItems,
  discoverNewFeatureItems,
};
