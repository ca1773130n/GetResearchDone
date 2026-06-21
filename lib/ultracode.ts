'use strict';

/**
 * ultracode — "max cost/effort" mode, ported from Claude Code's `ultracode`
 * keyword (which makes Claude Code auto-spawn agents at full effort across
 * internal phases — effectively autoplan+autopilot in one session).
 *
 * GRD generalizes the idea across backends: detecting `ultracode` (a CLI flag
 * or bare keyword) forces the best model + maximum reasoning effort on every
 * spawn, and for the Claude backend additionally injects the literal keyword
 * into the prompt so Claude Code's native dynamic-workflow orchestration fires.
 *
 * The trigger is carried process-tree-wide via the GRD_ULTRACODE env var
 * (set once at the CLI entrypoint), so deep/internal scheduler spawns — the
 * autoresearch loop, the autopilot pipeline — inherit it without per-command
 * threading. // ponytail: env var is the carrier; thread opts only where plumbed.
 *
 * @module ultracode
 */

import type { SpawnEffort, SpawnOpts } from './types';

/**
 * Best model per backend when ultracode forces max cost. Overridable via config
 * later. Antigravity is intentionally omitted: `agy models` requires sign-in to
 * enumerate, so there is no verified identifier to force — ultracode falls back
 * to the account's default model (and antigravity exposes no effort knob either).
 */
export const ULTRACODE_MODELS: Record<string, string> = {
  claude: 'opus',
  codex: 'gpt-5.5',
  gemini: 'gemini-3-pro',
};

/** Codex has no `max` reasoning level — clamp it (and unknowns) to its top `xhigh`. */
const CODEX_EFFORT: Record<SpawnEffort, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'xhigh',
};

/** Map a generic spawn-effort level to codex's `model_reasoning_effort` value. */
export function codexEffort(level: SpawnEffort): string {
  return CODEX_EFFORT[level] || 'high';
}

/** True if any CLI token is the ultracode flag or bare keyword. */
export function detectUltracode(tokens: string[]): boolean {
  return tokens.some((t) => t === 'ultracode' || t === '--ultracode');
}

/** Set the process-tree env carrier so all downstream spawns run at max effort. */
export function applyUltracodeEnv(): void {
  process.env.GRD_ULTRACODE = '1';
  process.env.GRD_EFFORT = 'max';
}

/**
 * Resolve effective effort + ultracode for a spawn, honoring explicit opts
 * first, then the GRD_ULTRACODE / GRD_EFFORT env carrier. ultracode implies
 * `max` effort unless an explicit level was given.
 */
export function resolveEffort(opts: SpawnOpts): { effort?: SpawnEffort; ultracode: boolean } {
  const ultracode = opts.ultracode ?? process.env.GRD_ULTRACODE === '1';
  const VALID: SpawnEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
  const envEffort = process.env.GRD_EFFORT as SpawnEffort | undefined;
  const explicit = opts.effort ?? (envEffort && VALID.includes(envEffort) ? envEffort : undefined);
  const effort = explicit ?? (ultracode ? 'max' : undefined);
  return { effort, ultracode };
}

module.exports = { ULTRACODE_MODELS, codexEffort, detectUltracode, applyUltracodeEnv, resolveEffort };
