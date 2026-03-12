/**
 * GRD Overstory Adapter -- Detection, plan dispatch, status polling, merge
 *
 * Wraps the `ov` CLI to use Overstory as an execution backend for GRD.
 * Follows the same shell-out pattern as lib/worktree.ts.
 *
 * Requires: Overstory v0.8.0+ (stable --json output)
 */
'use strict';

import type {
  OverstoryInfo,
  OverstoryConfig,
  SlingOpts,
  SlingResult,
  AgentStatus,
  FleetStatus,
  MergeResult,
  OverstoryMailMessage,
} from './types';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { safeReadJSON }: { safeReadJSON: (p: string, d: unknown) => unknown } = require('./utils');

const MIN_VERSION = '0.8.0';
const OV_MAX_AGENTS = 25;

function compareSemver(a: string, b: string): number {
  // Strip pre-release suffixes (e.g. '0.8.0-beta.1' -> '0.8.0')
  const pa = a.split('-')[0].split('.').map(Number);
  const pb = b.split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/** Run an `ov` CLI command synchronously and return stdout. */
function ovExec(cwd: string, args: string[], timeout: number): string {
  return execFileSync('ov', args, {
    cwd,
    timeout,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as string;
}

const DEFAULT_OVERSTORY_CONFIG: OverstoryConfig = {
  runtime: 'claude',
  install_prompt: true,
  poll_interval_ms: 5000,
  merge_strategy: 'auto',
  overlay_template: null,
};

function loadOverstoryConfig(cwd: string): OverstoryConfig {
  const parsed = safeReadJSON(path.join(cwd, '.planning', 'config.json'), {}) as Record<
    string,
    unknown
  >;
  const ov = (parsed.overstory || {}) as Partial<OverstoryConfig>;
  return { ...DEFAULT_OVERSTORY_CONFIG, ...ov };
}

function detectOverstory(cwd: string, preloadedConfig?: OverstoryConfig): OverstoryInfo | null {
  const configPath = path.join(cwd, '.overstory', 'config.yaml');
  if (!fs.existsSync(configPath)) return null;

  let version: string;
  try {
    version = ovExec(cwd, ['--version'], 5000).trim().replace(/^v/, '');
  } catch {
    return null;
  }

  if (compareSemver(version, MIN_VERSION) < 0) return null;

  const ovConfig = preloadedConfig || loadOverstoryConfig(cwd);
  return {
    available: true,
    version,
    config_path: configPath,
    max_agents: OV_MAX_AGENTS,
    default_runtime: ovConfig.runtime,
    worktree_base: path.join(cwd, '.overstory', 'worktrees'),
  };
}

function installOverstory(cwd: string): void {
  try {
    execFileSync('bun', ['--version'], {
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(
      'Overstory requires Bun. Install via: curl -fsSL https://bun.sh/install | bash'
    );
  }

  execFileSync('bun', ['install', '-g', 'overstory'], {
    cwd,
    timeout: 120000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  ovExec(cwd, ['init'], 30000);
}

function slingPlan(cwd: string, opts: SlingOpts): SlingResult {
  // plan_path is consumed via the overlay; timeout_minutes is enforced by GRD's poll loop (ov stop)
  const args = [
    'sling',
    `GRD plan ${opts.plan_id}: execute plan`,
    '--runtime',
    opts.runtime,
    '--model',
    opts.model,
    '--overlay',
    opts.overlay_path,
  ];
  return JSON.parse(ovExec(cwd, args, 60000)) as SlingResult;
}

function getAgentStatus(cwd: string, agentId: string): AgentStatus {
  return JSON.parse(ovExec(cwd, ['status', agentId, '--json'], 10000)) as AgentStatus;
}

function getFleetStatus(cwd: string): FleetStatus {
  return JSON.parse(ovExec(cwd, ['status', '--json'], 10000)) as FleetStatus;
}

function mergeAgent(cwd: string, agentId: string): MergeResult {
  // ov merge outputs JSON by default per Overstory's CLI contract
  return JSON.parse(ovExec(cwd, ['merge', agentId, '--json'], 60000)) as MergeResult;
}

function stopAgent(cwd: string, agentId: string): void {
  ovExec(cwd, ['stop', agentId], 10000);
}

function getAgentMail(cwd: string, agentId: string): OverstoryMailMessage[] {
  const parsed = JSON.parse(ovExec(cwd, ['mail', '--agent', agentId, '--json'], 10000)) as {
    messages: OverstoryMailMessage[];
  };
  return parsed.messages;
}

function nudgeAgent(cwd: string, agentId: string, message: string): void {
  ovExec(cwd, ['nudge', agentId, '--', message], 10000);
}

function generateOverlay(
  planContent: string,
  context: {
    phase_number: string;
    plan_id: string;
    milestone: string;
    phase_dir: string;
  }
): string {
  const summaryName = `${context.plan_id}-SUMMARY.md`;
  return `# GRD Executor Task

## Your Assignment

${planContent}

## GRD Conventions

- Write your execution summary to \`${context.phase_dir}/${summaryName}\`
- Use frontmatter: phase, plan, type, status, duration
- Commit frequently with descriptive messages
- Run tests before committing

## Summary Format

\`\`\`markdown
---
phase: ${context.phase_number}
plan: ${context.plan_id.split('-')[1] || '01'}
type: execution
status: complete
duration: Xmin
---

## One-Liner
[Single sentence describing what was accomplished]

## Changes Made
- [File]: [What changed]

## Verification
- [Test/check]: [Result]
\`\`\`
`;
}

module.exports = {
  MIN_VERSION,
  OV_MAX_AGENTS,
  DEFAULT_OVERSTORY_CONFIG,
  compareSemver,
  ovExec,
  loadOverstoryConfig,
  detectOverstory,
  installOverstory,
  slingPlan,
  getAgentStatus,
  getFleetStatus,
  mergeAgent,
  stopAgent,
  getAgentMail,
  nudgeAgent,
  generateOverlay,
};
