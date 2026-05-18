'use strict';

/** GRD Commands/Estimate -- Token cost preview for a phase before execution */


const fs = require('fs');
const path = require('path');

const {
  output,
  error,
  findPhaseInternal,
  loadConfig,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  findPhaseInternal: (cwd: string, phase: string) => import('../types').PhaseInfo | null;
  loadConfig: (cwd: string) => { model_profile?: string; [key: string]: unknown };
} = require('../utils');

// ─── Domain Types ────────────────────────────────────────────────────────────

interface PlanEstimate {
  plan_file: string;
  wave: number;
  agent_type: string;
  effort: string;
  estimated_tokens: number;
  estimated_usd: number;
}

interface WaveEstimate {
  wave: number;
  plans: PlanEstimate[];
  wave_tokens: number;
  wave_usd: number;
}

interface EstimateResult {
  phase: string;
  model_profile: string;
  wave_count: number;
  total_plans: number;
  total_tokens: number;
  total_usd: number;
  waves: WaveEstimate[];
  note: string;
}

// ─── Token + USD Bands ───────────────────────────────────────────────────────

// Effort-level token bands (input+output combined estimate)
const EFFORT_TOKENS: Record<string, number> = {
  high: 200_000,
  medium: 80_000,
  low: 30_000,
};

// Approximate per-token cost in USD by model profile (blended input+output)
// Based on claude-sonnet-4 and claude-opus-4 pricing (illustrative)
const PROFILE_COST_PER_TOKEN: Record<string, number> = {
  quality: 15 / 1_000_000,   // ~opus tier
  balanced: 3 / 1_000_000,   // ~sonnet tier
  budget: 0.8 / 1_000_000,   // ~haiku tier
};

// Effort level resolved per agent type. Unknown agents default to 'medium'.
const AGENT_EFFORT_DEFAULTS: Record<string, Record<string, string>> = {
  'grd-planner':           { quality: 'high',   balanced: 'high',   budget: 'low' },
  'grd-executor':          { quality: 'high',   balanced: 'medium', budget: 'low' },
  'grd-verifier':          { quality: 'medium', balanced: 'low',    budget: 'low' },
  'grd-debugger':          { quality: 'high',   balanced: 'medium', budget: 'low' },
  'grd-phase-researcher':  { quality: 'high',   balanced: 'medium', budget: 'low' },
  'grd-codebase-mapper':   { quality: 'medium', balanced: 'low',    budget: 'low' },
  'grd-plan-checker':      { quality: 'medium', balanced: 'medium', budget: 'low' },
  'grd-surveyor':          { quality: 'medium', balanced: 'medium', budget: 'low' },
  'grd-deep-diver':        { quality: 'high',   balanced: 'medium', budget: 'low' },
  'grd-code-reviewer':     { quality: 'high',   balanced: 'medium', budget: 'low' },
};

function resolveEffort(agentType: string, profile: string): string {
  const agentMap = AGENT_EFFORT_DEFAULTS[agentType];
  if (!agentMap) return 'medium';
  return agentMap[profile] || agentMap['balanced'] || 'medium';
}

// ─── Estimate ────────────────────────────────────────────────────────────────

/**
 * CLI command: Preview token cost and agent dispatch plan for a phase before execution.
 *
 * Reads all plan files for phase N, groups by wave, maps effort levels to token bands
 * using the project model_profile from config.json, and outputs a per-wave cost table.
 *
 * @param cwd - Project working directory
 * @param phase - Phase number (e.g., "3" or "03")
 * @param raw - Output raw text instead of JSON
 */
function cmdEstimate(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase required. Usage: gd estimate <phase>');
    return;
  }

  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    error(`Phase ${phase} not found`);
  }

  let modelProfile = 'balanced';
  try {
    const config = loadConfig(cwd);
    if (config.model_profile && typeof config.model_profile === 'string') {
      modelProfile = config.model_profile;
    }
  } catch {
    // Config unavailable — use default
  }

  const costPerToken = PROFILE_COST_PER_TOKEN[modelProfile] ?? PROFILE_COST_PER_TOKEN['balanced'];

  const phaseDir = path.join(cwd, (phaseInfo as import('../types').PhaseInfo).directory);
  // Read plan files
  let planFiles: string[] = [];
  try {
    planFiles = (fs.readdirSync(phaseDir) as string[])
      .filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md')
      .sort();
  } catch {
    error(`Cannot read phase directory: ${phaseDir}`);
  }

  const waveMap = new Map<number, PlanEstimate[]>();

  for (const file of planFiles) {
    const filePath = path.join(phaseDir, file);
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf-8') as string; } catch { continue; }

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const fm = fmMatch ? fmMatch[1] : '';

    const waveMatch = fm.match(/^wave:\s*(\d+)/m);
    const waveNum = waveMatch ? parseInt(waveMatch[1], 10) : 1;

    const agentMatch = fm.match(/^agent_type:\s*(.+)$/m);
    const agentType = agentMatch ? agentMatch[1].trim() : 'grd-executor';

    const effort = resolveEffort(agentType, modelProfile);
    const tokens = EFFORT_TOKENS[effort] ?? EFFORT_TOKENS['medium'];
    const usd = tokens * costPerToken;

    const estimate: PlanEstimate = { plan_file: file, wave: waveNum, agent_type: agentType, effort, estimated_tokens: tokens, estimated_usd: usd };
    const bucket = waveMap.get(waveNum) ?? [];
    bucket.push(estimate);
    waveMap.set(waveNum, bucket);
  }

  const waves: WaveEstimate[] = Array.from(waveMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([wave, plans]) => ({
      wave,
      plans,
      wave_tokens: plans.reduce((s, p) => s + p.estimated_tokens, 0),
      wave_usd: plans.reduce((s, p) => s + p.estimated_usd, 0),
    }));

  const totalTokens = waves.reduce((s, w) => s + w.wave_tokens, 0);
  const totalUsd = waves.reduce((s, w) => s + w.wave_usd, 0);
  const totalPlans = waves.reduce((s, w) => s + w.plans.length, 0);

  const result: EstimateResult = {
    phase,
    model_profile: modelProfile,
    wave_count: waves.length,
    total_plans: totalPlans,
    total_tokens: totalTokens,
    total_usd: Math.round(totalUsd * 100) / 100,
    waves,
    note: 'Token estimates are approximate. Actual usage depends on context size and agent behavior.',
  };

  if (raw) {
    const lines = [
      `Phase ${phase} cost estimate [${modelProfile} profile]`,
      `${'─'.repeat(60)}`,
    ];
    for (const w of waves) {
      lines.push(`Wave ${w.wave}: ${w.plans.length} plan(s) — ${(w.wave_tokens / 1000).toFixed(0)}K tokens ≈ $${w.wave_usd.toFixed(2)}`);
      for (const p of w.plans) {
        lines.push(`  ${p.plan_file} [${p.agent_type}/${p.effort}] ${(p.estimated_tokens / 1000).toFixed(0)}K tokens`);
      }
    }
    lines.push(`${'─'.repeat(60)}`);
    lines.push(`Total: ${totalPlans} plans, ${(totalTokens / 1000).toFixed(0)}K tokens ≈ $${totalUsd.toFixed(2)}`);
    output(result, raw, lines.join('\n'));
  } else {
    output(result, raw, `Phase ${phase}: ${totalPlans} plans, ~${(totalTokens / 1000).toFixed(0)}K tokens, ~$${totalUsd.toFixed(2)} (${modelProfile})`);
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { cmdEstimate };
