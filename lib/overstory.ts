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

const MIN_VERSION = '0.8.0';

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

const DEFAULT_OVERSTORY_CONFIG: OverstoryConfig = {
  runtime: 'claude',
  install_prompt: true,
  poll_interval_ms: 5000,
  merge_strategy: 'auto',
  overlay_template: null,
};

function loadOverstoryConfig(cwd: string): OverstoryConfig {
  try {
    const raw = fs.readFileSync(path.join(cwd, '.planning', 'config.json'), 'utf-8');
    const config = JSON.parse(raw) as Record<string, unknown>;
    const ov = (config.overstory || {}) as Partial<OverstoryConfig>;
    return { ...DEFAULT_OVERSTORY_CONFIG, ...ov };
  } catch {
    return { ...DEFAULT_OVERSTORY_CONFIG };
  }
}

function detectOverstory(cwd: string): OverstoryInfo | null {
  const configPath = path.join(cwd, '.overstory', 'config.yaml');
  if (!fs.existsSync(configPath)) return null;

  let version: string;
  try {
    const stdout: string = execFileSync('ov', ['--version'], {
      cwd,
      timeout: 5000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    version = stdout.trim().replace(/^v/, '');
  } catch {
    return null;
  }

  if (compareSemver(version, MIN_VERSION) < 0) return null;

  const ovConfig = loadOverstoryConfig(cwd);
  return {
    available: true,
    version,
    config_path: configPath,
    max_agents: 25,
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

  execFileSync('ov', ['init'], {
    cwd,
    timeout: 30000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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
  const stdout: string = execFileSync('ov', args, {
    cwd,
    timeout: 60000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout) as SlingResult;
}

function getAgentStatus(cwd: string, agentId: string): AgentStatus {
  const stdout: string = execFileSync('ov', ['status', agentId, '--json'], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout) as AgentStatus;
}

function getFleetStatus(cwd: string): FleetStatus {
  const stdout: string = execFileSync('ov', ['status', '--json'], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout) as FleetStatus;
}

function mergeAgent(cwd: string, agentId: string): MergeResult {
  // ov merge outputs JSON by default per Overstory's CLI contract
  const stdout: string = execFileSync('ov', ['merge', agentId, '--json'], {
    cwd,
    timeout: 60000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout) as MergeResult;
}

function stopAgent(cwd: string, agentId: string): void {
  execFileSync('ov', ['stop', agentId], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function getAgentMail(cwd: string, agentId: string): OverstoryMailMessage[] {
  const stdout: string = execFileSync('ov', ['mail', '--agent', agentId, '--json'], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(stdout) as { messages: OverstoryMailMessage[] };
  return parsed.messages;
}

function nudgeAgent(cwd: string, agentId: string, message: string): void {
  execFileSync('ov', ['nudge', agentId, '--', message], {
    cwd,
    timeout: 10000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function generateOverlay(
  planContent: string,
  context: { phase_number: string; plan_id: string; milestone: string; phase_dir: string }
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
  DEFAULT_OVERSTORY_CONFIG,
  compareSemver,
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
