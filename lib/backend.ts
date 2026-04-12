'use strict';

/**
 * GRD Backend Detection, Model Resolution & Capabilities
 *
 * Detects which AI coding CLI is running (Claude Code, Codex CLI, Gemini CLI,
 * OpenCode) via a detection waterfall: config override > env vars > filesystem
 * clues > default. Resolves abstract model tiers (opus/sonnet/haiku) to
 * backend-specific model names. Provides capability flags per backend.
 *
 * Supported backends (March 2026):
 *   - Claude Code v2.1.71 — Anthropic's native CLI (opus/sonnet/haiku tiers)
 *   - Codex CLI v0.112.0 — OpenAI's CLI (GPT-5.4, GPT-5.3-Codex-Spark, GPT-5.4-mini)
 *   - Gemini CLI v0.32.1 — Google's CLI (Gemini 3.1 Pro, 3.1 Flash, 3.1 Flash-Lite)
 *   - OpenCode v1.2.21 — Provider-agnostic CLI by anomalyco (actively maintained, 70K+ stars)
 *   - Superpowers — Plugin/skill layer that orchestrates any AI CLI backend with account rotation
 *   - GRD — Native mode using GRD's own commands/skills with the configured AI backend
 *
 * This module reads config.json directly with fs.readFileSync to avoid
 * circular dependency with lib/utils.js (which will later import from here).
 *
 * Research basis:
 *   - Detection waterfall: .planning/research/multi-backend-detection.md (Section 2)
 *   - Model mappings: .planning/research/ARCHITECTURE.md
 *   - Capability flags: .planning/research/ARCHITECTURE.md
 *   - Pitfall avoidance: .planning/research/PITFALLS.md (P5: no AGENT env var)
 */

import type {
  BackendId,
  BackendCapabilities,
  ModelTierMap,
  ModelTier,
  ModelProfileName,
  EffortLevel,
  AgentEffortProfiles,
  WebMcpResult,
  PlaywrightResult,
  BackendAvailability,
  TokenProfileName,
  BudgetPressureLevel,
  ComplexityLevel,
  GrdConfig,
  SchedulerConfig,
  SuperpowersConfig,
  BackendUsageState,
  BudgetPressureThresholds,
  AdapterBackendId,
} from './types';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// --- Constants ---------------------------------------------------------------

/**
 * List of valid backend identifiers.
 */
const VALID_BACKENDS: readonly BackendId[] = [
  'claude',
  'codex',
  'gemini',
  'opencode',
  'overstory',
  'superpowers',
  'grd',
];

/**
 * Default model name mappings per backend and tier.
 * Each backend maps the abstract tiers (opus, sonnet, haiku) to concrete
 * model identifiers recognized by that backend's CLI.
 */
const DEFAULT_BACKEND_MODELS: Record<BackendId, ModelTierMap> = {
  claude: { opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' },
  codex: {
    opus: 'gpt-5.4',
    sonnet: 'gpt-5.3-codex-spark',
    haiku: 'gpt-5.4-mini',
  },
  gemini: {
    opus: 'gemini-3.1-pro',
    sonnet: 'gemini-3.1-flash',
    haiku: 'gemini-3.1-flash-lite',
  },
  opencode: {
    opus: 'anthropic/claude-opus-4-6',
    sonnet: 'anthropic/claude-sonnet-4-6',
    haiku: 'anthropic/claude-haiku-4-5',
  },
  overstory: { opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' },
  superpowers: { opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' },
  grd: { opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' },
};

/**
 * Capability flags per backend. Describes what orchestration features each
 * backend supports. Used to degrade gracefully for backends with limited features.
 */
const BACKEND_CAPABILITIES: Record<BackendId, BackendCapabilities> = {
  claude: {
    subagents: true,
    parallel: true,
    teams: true,
    hooks: true,
    mcp: true,
    native_worktree_isolation: true,
    effort: true,
    http_hooks: true,
    cron: true,
    smart_approvals: false,
    plan_mode: false,
    sandbox_gvisor: false,
    sandbox_lxc: false,
    mcp_elicitation: true,
    model_overrides: true,
    max_output_tokens: { default: 64000, upper_bound: 128000 },
  },
  codex: {
    subagents: true,
    parallel: true,
    teams: true,
    hooks: true,
    mcp: true,
    native_worktree_isolation: false,
    effort: false,
    http_hooks: false,
    cron: false,
    smart_approvals: true,
    plan_mode: false,
    sandbox_gvisor: false,
    sandbox_lxc: false,
    mcp_elicitation: false,
    model_overrides: true,
    max_output_tokens: null,
  },
  gemini: {
    subagents: true,
    parallel: true,
    teams: false,
    hooks: true,
    mcp: true,
    native_worktree_isolation: false,
    effort: false,
    http_hooks: false,
    cron: false,
    smart_approvals: false,
    plan_mode: true,
    sandbox_gvisor: true,
    sandbox_lxc: false,
    mcp_elicitation: false,
    model_overrides: true,
    max_output_tokens: null,
  },
  opencode: {
    subagents: true,
    parallel: true,
    teams: false,
    hooks: true,
    mcp: true,
    native_worktree_isolation: false,
    effort: false,
    http_hooks: false,
    cron: false,
    smart_approvals: false,
    plan_mode: false,
    sandbox_gvisor: false,
    sandbox_lxc: false,
    mcp_elicitation: false,
    model_overrides: true,
    max_output_tokens: null,
  },
  overstory: {
    subagents: true,
    parallel: true,
    teams: true,
    hooks: false,
    mcp: true,
    native_worktree_isolation: true,
    effort: false,
    http_hooks: false,
    cron: false,
    smart_approvals: false,
    plan_mode: false,
    sandbox_gvisor: false,
    sandbox_lxc: false,
    mcp_elicitation: false,
    model_overrides: true,
    max_output_tokens: null,
  },
  superpowers: {
    subagents: true,
    parallel: true,
    teams: true,
    hooks: true,
    mcp: true,
    native_worktree_isolation: true,
    effort: true,
    http_hooks: false,
    cron: false,
    smart_approvals: false,
    plan_mode: false,
    sandbox_gvisor: false,
    sandbox_lxc: false,
    mcp_elicitation: false,
    model_overrides: true,
    max_output_tokens: null,
  },
  grd: {
    subagents: true,
    parallel: true,
    teams: true,
    hooks: true,
    mcp: true,
    native_worktree_isolation: true,
    effort: false,
    http_hooks: false,
    cron: false,
    smart_approvals: false,
    plan_mode: false,
    sandbox_gvisor: false,
    sandbox_lxc: false,
    mcp_elicitation: false,
    model_overrides: false,
    max_output_tokens: null,
  },
};

// --- Effort Level Profiles ---------------------------------------------------

/**
 * Default effort levels per agent and profile. Mirrors MODEL_PROFILES in utils.ts
 * but for the effort dimension. Effort controls reasoning depth in backends that
 * support it (currently Claude Code v2.1.68+).
 *
 * Design intent (from REQ-92):
 *   quality  => planners/executors get high (deep reasoning), verifiers get medium
 *   balanced => planners get high, executors get medium, verifiers/lightweight agents get low
 *   budget   => everything low (fast, minimal reasoning)
 */
const EFFORT_PROFILES: AgentEffortProfiles = {
  'grd-planner': { quality: 'high', balanced: 'high', budget: 'low' },
  'grd-roadmapper': { quality: 'high', balanced: 'medium', budget: 'low' },
  'grd-executor': { quality: 'high', balanced: 'medium', budget: 'low' },
  'grd-phase-researcher': { quality: 'high', balanced: 'medium', budget: 'low' },
  'grd-project-researcher': { quality: 'high', balanced: 'medium', budget: 'low' },
  'grd-research-synthesizer': { quality: 'medium', balanced: 'medium', budget: 'low' },
  'grd-debugger': { quality: 'high', balanced: 'medium', budget: 'low' },
  'grd-codebase-mapper': { quality: 'medium', balanced: 'low', budget: 'low' },
  'grd-verifier': { quality: 'medium', balanced: 'low', budget: 'low' },
  'grd-plan-checker': { quality: 'medium', balanced: 'medium', budget: 'low' },
  'grd-integration-checker': { quality: 'medium', balanced: 'medium', budget: 'low' },
  'grd-surveyor': { quality: 'medium', balanced: 'medium', budget: 'low' },
  'grd-deep-diver': { quality: 'high', balanced: 'medium', budget: 'low' },
  'grd-feasibility-analyst': { quality: 'high', balanced: 'medium', budget: 'low' },
  'grd-eval-planner': { quality: 'high', balanced: 'medium', budget: 'low' },
  'grd-eval-reporter': { quality: 'medium', balanced: 'medium', budget: 'low' },
  'grd-product-owner': { quality: 'high', balanced: 'high', budget: 'low' },
  'grd-baseline-assessor': { quality: 'medium', balanced: 'medium', budget: 'low' },
  'grd-code-reviewer': { quality: 'high', balanced: 'medium', budget: 'low' },
};

/**
 * Resolve the effort level for a given agent type and model profile.
 *
 * Returns the effort level from EFFORT_PROFILES for the given agent and profile.
 * Unknown agent types return 'medium' as a safe default. Unknown profiles
 * fall back to 'balanced', then to 'medium'.
 *
 * @param agentType - Agent type key (e.g., 'grd-executor', 'grd-planner')
 * @param profile - Model profile name ('quality', 'balanced', or 'budget')
 * @returns The effort level string: 'low', 'medium', or 'high'
 */
function resolveEffortLevel(agentType: string, profile: ModelProfileName): EffortLevel {
  const agentEffort = EFFORT_PROFILES[agentType];
  if (!agentEffort) return 'medium';
  return agentEffort[profile] || agentEffort['balanced'] || 'medium';
}

// --- Internal Helpers --------------------------------------------------------

/** Detected model tier map: opus, sonnet, haiku each nullable. */
interface DetectedModels {
  opus: string | null;
  sonnet: string | null;
  haiku: string | null;
}

/** Model cache entry with TTL tracking. */
interface ModelCacheEntry {
  models: DetectedModels | null;
  ts: number;
}

/**
 * Read and parse .planning/config.json from cwd. Returns parsed object or null.
 * Uses fs.readFileSync directly to avoid circular dependency with lib/utils.js.
 */
function readConfig(cwd: string): Record<string, unknown> | null {
  try {
    const configPath: string = path.join(cwd, '.planning', 'config.json');
    const raw: string = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Check if any environment variable starts with a given prefix.
 */
function hasEnvPrefix(prefix: string): boolean {
  return Object.keys(process.env).some((k) => k.startsWith(prefix));
}

/**
 * Check if a file exists at a given path.
 */
function fileExists(filePath: string): boolean {
  try {
    fs.statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// --- Exported Functions ------------------------------------------------------

/**
 * Detect which AI coding CLI backend is currently running.
 *
 * Detection waterfall (highest to lowest priority):
 *   1. Config override: .planning/config.json `backend` field
 *   2. Environment variables: CLAUDE_CODE_*, CODEX_HOME, GEMINI_CLI_HOME, OPENCODE
 *   3. Filesystem clues: .claude-plugin/plugin.json, .codex/config.toml, etc.
 *   4. Default: 'claude' (backward compatible)
 *
 * Note: The AGENT env var is NOT used for OpenCode detection per PITFALLS.md P5
 * (too generic, may collide with other tools).
 *
 * @param cwd - Absolute path to the project root directory used for config and filesystem detection
 * @returns The detected backend identifier (e.g. 'claude', 'codex', 'gemini', 'opencode')
 */
function detectBackend(cwd: string): BackendId {
  // Step 1: Config override (highest priority)
  const config = readConfig(cwd);
  if (config && config.backend && VALID_BACKENDS.includes(config.backend as BackendId)) {
    return config.backend as BackendId;
  }

  // Step 2: Environment variable detection
  // Superpowers detection (highest env priority — orchestrates other backends)
  if (process.env.SUPERPOWERS_HOME || process.env.SUPERPOWERS_SESSION) return 'superpowers';
  // Overstory detection (before Claude — takes priority when both present)
  if (process.env.OVERSTORY_HOME || process.env.OVERSTORY_SESSION) return 'overstory';
  if (hasEnvPrefix('CLAUDE_CODE_')) return 'claude';
  // CODEX_THREAD_ID: may be deprecated in newer Codex CLI versions (no docs mention
  // as of March 2026), but kept for backward compatibility with older installations.
  if (process.env.CODEX_HOME || process.env.CODEX_THREAD_ID) return 'codex';
  if (process.env.GEMINI_CLI_HOME) return 'gemini';
  // OpenCode: actively maintained under anomalyco/opencode (original opencode-ai
  // repo archived Sept 2025). OPENCODE_PID is NOT used — it's a process management
  // var, not a presence indicator.
  if (process.env.OPENCODE) return 'opencode';

  // Step 3: Filesystem clues
  if (fileExists(path.join(cwd, '.superpowers', 'config.json'))) return 'superpowers';
  if (fileExists(path.join(cwd, '.overstory', 'config.yaml'))) return 'overstory';
  if (fileExists(path.join(cwd, '.claude-plugin', 'plugin.json'))) return 'claude';
  if (fileExists(path.join(cwd, '.codex', 'config.toml'))) return 'codex';
  if (fileExists(path.join(cwd, '.gemini', 'settings.json'))) return 'gemini';
  if (fileExists(path.join(cwd, 'opencode.json'))) return 'opencode';

  // Step 4: Default (backward compatible)
  return 'claude';
}

// --- Dynamic Model Detection -------------------------------------------------

/**
 * Parse `opencode models` stdout into tier-classified model map.
 * Classifies each model ID by keyword patterns:
 *   opus tier: /opus/i, /pro/i (non-flash)
 *   sonnet tier: /sonnet/i
 *   haiku tier: /haiku/i, /flash/i, /mini/i, /spark/i
 *
 * @param stdout - Raw stdout string from the `opencode models` CLI command
 * @returns A DetectedModels map with opus/sonnet/haiku slots filled where matched, or null if no models were matched
 */
function parseOpenCodeModels(stdout: string): DetectedModels | null {
  if (!stdout || typeof stdout !== 'string') return null;

  const lines: string[] = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('Available') && !l.startsWith('---') && !l.startsWith('#'));

  const result: DetectedModels = { opus: null, sonnet: null, haiku: null };
  let matched = false;

  for (const line of lines) {
    const model: string | undefined = line.split(/\s+/)[0];
    if (!model || !model.includes('/')) continue;

    if (/opus/i.test(model)) {
      if (!result.opus) {
        result.opus = model;
        matched = true;
      }
    } else if (/sonnet/i.test(model)) {
      if (!result.sonnet) {
        result.sonnet = model;
        matched = true;
      }
    } else if (/haiku/i.test(model)) {
      if (!result.haiku) {
        result.haiku = model;
        matched = true;
      }
    } else if (/pro/i.test(model) && !/flash/i.test(model)) {
      if (!result.opus) {
        result.opus = model;
        matched = true;
      }
    } else if (/flash/i.test(model) || /mini/i.test(model) || /spark/i.test(model)) {
      if (!result.haiku) {
        result.haiku = model;
        matched = true;
      }
    }
  }

  return matched ? result : null;
}

/**
 * Run backend-specific CLI command to detect available models.
 * Currently only OpenCode supports programmatic model listing.
 */
function detectModels(backend: string, cwd?: string): DetectedModels | null {
  if (backend !== 'opencode') return null;

  const effectiveCwd: string = cwd || process.cwd();
  const cfg = readConfig(effectiveCwd);
  const timeouts = cfg?.timeouts as Record<string, unknown> | undefined;
  const timeout: number =
    typeof timeouts?.backend_detect_ms === 'number' ? timeouts.backend_detect_ms : 10000;
  try {
    const stdout: string = execFileSync('opencode', ['models'], {
      cwd: effectiveCwd,
      timeout,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parseOpenCodeModels(stdout);
  } catch {
    return null;
  }
}

const _modelCache: Map<string, ModelCacheEntry> = new Map();
const MODEL_CACHE_TTL_MS: number = 5 * 60 * 1000;

/**
 * Get cached detected models for a backend, refreshing if TTL expired.
 */
function getCachedModels(backend: string, cwd?: string): DetectedModels | null {
  const entry: ModelCacheEntry | undefined = _modelCache.get(backend);
  const now: number = Date.now();
  if (entry && now - entry.ts < MODEL_CACHE_TTL_MS) {
    return entry.models;
  }
  const models: DetectedModels | null = detectModels(backend, cwd);
  _modelCache.set(backend, { models, ts: now });
  return models;
}

/**
 * Clear the model detection cache. Exported for testing.
 */
function clearModelCache(): void {
  _modelCache.clear();
}

/**
 * Resolve an abstract model tier to a backend-specific model name.
 *
 * Checks config.backend_models for user overrides first, then falls back
 * to DEFAULT_BACKEND_MODELS. Unknown backends fall back to claude mappings.
 * Unknown tiers return undefined.
 *
 * @param backend - The backend identifier (e.g. 'claude', 'codex', 'gemini', 'opencode')
 * @param tier - The abstract model tier to resolve ('opus', 'sonnet', or 'haiku')
 * @param config - Optional parsed config.json object used for user-defined backend_models overrides
 * @param cwd - Optional project root path used for dynamic model detection (opencode only)
 * @returns The backend-specific model name string, or undefined if the tier is not mapped
 */
function resolveBackendModel(
  backend: string,
  tier: ModelTier,
  config?: Record<string, unknown>,
  cwd?: string
): string | undefined {
  // Check user override from config (highest priority)
  if (config && config.backend_models) {
    const backendModelsConfig = config.backend_models as Record<string, Record<string, string>>;
    const backendOverrides = backendModelsConfig[backend];
    if (backendOverrides && backendOverrides[tier] !== undefined) {
      return backendOverrides[tier];
    }
  }

  // Check dynamically detected models (middle priority)
  if (cwd) {
    const detected: DetectedModels | null = getCachedModels(backend, cwd);
    if (detected && detected[tier]) {
      return detected[tier];
    }
  }

  // Use built-in defaults, falling back to claude for unknown backends
  const backendModels: ModelTierMap =
    DEFAULT_BACKEND_MODELS[backend as BackendId] || DEFAULT_BACKEND_MODELS.claude;
  return backendModels[tier];
}

/**
 * Get capability flags for a backend.
 *
 * Returns an object describing what orchestration features the backend supports.
 * Unknown backends get minimal capabilities (all false) to prevent
 * accidentally enabling features like native_worktree_isolation or effort.
 *
 * @param backend - The backend identifier (e.g. 'claude', 'codex', 'gemini', 'opencode')
 * @returns A BackendCapabilities object describing which orchestration features are supported
 */
function getBackendCapabilities(backend: string): BackendCapabilities {
  if (BACKEND_CAPABILITIES[backend as BackendId]) {
    return BACKEND_CAPABILITIES[backend as BackendId];
  }
  // Unknown backend: warn and return minimal capabilities
  process.stderr.write(`[grd] WARNING: unknown backend "${backend}", using minimal capabilities\n`);
  return {
    subagents: true,
    parallel: false,
    teams: false,
    hooks: false,
    mcp: false,
    native_worktree_isolation: false,
    effort: false,
    http_hooks: false,
    cron: false,
    smart_approvals: false,
    plan_mode: false,
    sandbox_gvisor: false,
    sandbox_lxc: false,
    mcp_elicitation: false,
    model_overrides: false,
    max_output_tokens: null,
  };
}

// --- WebMCP Detection --------------------------------------------------------

/**
 * Detect whether Chrome DevTools MCP is available.
 *
 * Detection waterfall (highest to lowest priority):
 *   1. Config override: .planning/config.json `webmcp.enabled` field
 *   2. Environment variables: CHROME_DEVTOOLS_MCP, WEBMCP_AVAILABLE
 *   3. Claude Code MCP settings: ~/.claude.json `mcpServers` key
 *   4. Default: not available
 *
 * @param cwd - Absolute path to the project root directory used for config-based detection
 * @returns A WebMcpResult indicating availability, the detection source, and an optional reason when unavailable
 */
function detectWebMcp(cwd: string): WebMcpResult {
  // Step 1: Config override (highest priority)
  const config = readConfig(cwd);
  if (config && config.webmcp && typeof config.webmcp === 'object') {
    const webmcp = config.webmcp as Record<string, unknown>;
    if (typeof webmcp.enabled === 'boolean') {
      if (webmcp.enabled) {
        return { available: true, source: 'config' };
      }
      return {
        available: false,
        source: 'config',
        reason: 'Disabled via config',
      };
    }
  }

  // Step 2: Environment variable check
  const chromeDevToolsMcp: string | undefined = process.env.CHROME_DEVTOOLS_MCP;
  const webmcpAvailable: string | undefined = process.env.WEBMCP_AVAILABLE;

  if (chromeDevToolsMcp !== undefined) {
    if (chromeDevToolsMcp === 'true' || chromeDevToolsMcp === '1') {
      return { available: true, source: 'env' };
    }
    if (chromeDevToolsMcp === 'false' || chromeDevToolsMcp === '0') {
      return {
        available: false,
        source: 'env',
        reason: 'Disabled via environment variable',
      };
    }
  }

  if (webmcpAvailable !== undefined) {
    if (webmcpAvailable === 'true' || webmcpAvailable === '1') {
      return { available: true, source: 'env' };
    }
    if (webmcpAvailable === 'false' || webmcpAvailable === '0') {
      return {
        available: false,
        source: 'env',
        reason: 'Disabled via environment variable',
      };
    }
  }

  // Step 3: Claude Code MCP settings check (~/.claude.json)
  try {
    const homeDir: string = os.homedir();
    const claudeConfigPath: string = path.join(homeDir, '.claude.json');
    const raw: string = fs.readFileSync(claudeConfigPath, 'utf-8');
    const claudeConfig = JSON.parse(raw) as Record<string, unknown>;
    if (claudeConfig && claudeConfig.mcpServers) {
      const serverNames: string[] = Object.keys(claudeConfig.mcpServers as Record<string, unknown>);
      const hasBrowserMcp: boolean = serverNames.some((name) =>
        /chrome|devtools|playwright|browser/i.test(name)
      );
      if (hasBrowserMcp) {
        return { available: true, source: 'mcp-config' };
      }
    }
  } catch {
    // ~/.claude.json not found or malformed -- continue to default
  }

  // Step 4: Default
  return {
    available: false,
    source: 'default',
    reason: 'Chrome DevTools MCP not detected in config, environment, or MCP server settings',
  };
}

// --- Playwright Detection ----------------------------------------------------

/**
 * Detect whether Playwright MCP is available.
 *
 * Detection waterfall (highest to lowest priority):
 *   1. Config override: .planning/config.json `playwright.enabled` field
 *   2. Environment variable: PLAYWRIGHT_AVAILABLE
 *   3. Claude Code MCP settings: ~/.claude.json `mcpServers` key (playwright name match)
 *   4. Default: not available
 *
 * Mirrors the detectWebMcp() pattern exactly — same try/catch around ~/.claude.json,
 * same config reading via readConfig(cwd), same env var parsing.
 *
 * @param cwd - Absolute path to the project root directory used for config-based detection
 * @returns A PlaywrightResult indicating availability, the detection source, and an optional reason when unavailable
 */
function detectPlaywright(cwd: string): PlaywrightResult {
  // Step 1: Config override (highest priority)
  const config = readConfig(cwd);
  if (config && config.playwright && typeof config.playwright === 'object') {
    const playwright = config.playwright as Record<string, unknown>;
    if (typeof playwright.enabled === 'boolean') {
      if (playwright.enabled) {
        return { available: true, source: 'config' };
      }
      return {
        available: false,
        source: 'config',
        reason: 'Disabled via config',
      };
    }
  }

  // Step 2: Environment variable check
  const playwrightAvailable: string | undefined = process.env.PLAYWRIGHT_AVAILABLE;

  if (playwrightAvailable !== undefined) {
    if (playwrightAvailable === 'true' || playwrightAvailable === '1') {
      return { available: true, source: 'env' };
    }
    if (playwrightAvailable === 'false' || playwrightAvailable === '0') {
      return {
        available: false,
        source: 'env',
        reason: 'Disabled via environment variable',
      };
    }
  }

  // Step 3: Claude Code MCP settings check (~/.claude.json)
  try {
    const homeDir: string = os.homedir();
    const claudeConfigPath: string = path.join(homeDir, '.claude.json');
    const raw: string = fs.readFileSync(claudeConfigPath, 'utf-8');
    const claudeConfig = JSON.parse(raw) as Record<string, unknown>;
    if (claudeConfig && claudeConfig.mcpServers) {
      const serverNames: string[] = Object.keys(claudeConfig.mcpServers as Record<string, unknown>);
      const hasPlaywrightMcp: boolean = serverNames.some((name) => /playwright/i.test(name));
      if (hasPlaywrightMcp) {
        return { available: true, source: 'mcp-config' };
      }
    }
  } catch {
    // ~/.claude.json not found or malformed -- continue to default
  }

  // Step 4: Default
  return {
    available: false,
    source: 'default',
    reason: 'Playwright MCP not detected in config, environment, or MCP server settings',
  };
}

// --- Backend Availability Detection ------------------------------------------

/** Cache entry for detectAvailableBackends result. */
interface AvailabilityCacheEntry {
  result: Record<BackendId, BackendAvailability>;
  ts: number;
}

let _availabilityCache: AvailabilityCacheEntry | null = null;
const AVAILABILITY_CACHE_TTL_MS: number = 5 * 60 * 1000;

/**
 * Dispatchable backends — the four CLIs that discussion.ts can spawn directly.
 * Meta-backends (overstory, superpowers, grd) are probed as unavailable.
 */
const DISPATCHABLE_BACKENDS: readonly string[] = ['claude', 'codex', 'gemini', 'opencode'];

/**
 * Environment variable that controls the config directory for each backend CLI.
 * When set, the CLI uses the specified directory for auth/credentials instead of default.
 */
const BACKEND_CONFIG_ENV: Record<string, string> = {
  claude: 'CLAUDE_CONFIG_DIR',
  codex: 'CODEX_HOME',
  gemini: 'GEMINI_CLI_HOME',
  opencode: 'OPENCODE_CONFIG_DIR',
};

/**
 * Files that prove a config directory has valid auth/credentials for a backend.
 * Must be actual credential files, not files created by a bare first-run.
 *
 * Paths are relative to the config dir. Use nested paths for backends that
 * store auth in a subdirectory (e.g. gemini stores creds in <dir>/.gemini/).
 */
const BACKEND_AUTH_MARKERS: Record<string, string[]> = {
  claude: ['credentials.json', '.credentials.json', 'settings.json'],
  codex: ['auth.json'],
  gemini: ['.gemini/oauth_creds.json', '.gemini/google_accounts.json'],
  opencode: ['auth.json', 'config.json'],
};

/** Cached config dir discovery result. */
let _configDirCache: Record<string, string | null> | null = null;

/**
 * Discover the actual config directory for each backend by scanning the home
 * directory for directories matching ~/.<backend>* that contain auth marker files.
 *
 * Priority:
 * 1. Current env var (e.g. CLAUDE_CONFIG_DIR already set)
 * 2. First ~/.<backend>-* directory containing an auth marker file
 * 3. Default ~/.<backend> if it contains an auth marker file
 * 4. null (no config dir found — use backend's default)
 */
function discoverBackendConfigDirs(): Record<string, string | null> {
  if (_configDirCache) return _configDirCache;

  const homeDir: string = os.homedir();
  const result: Record<string, string | null> = {};

  for (const backend of DISPATCHABLE_BACKENDS) {
    const envVar = BACKEND_CONFIG_ENV[backend];
    const markers = BACKEND_AUTH_MARKERS[backend];

    // 1. Check if env var is already set
    if (envVar && process.env[envVar]) {
      result[backend] = process.env[envVar] as string;
      continue;
    }

    // 2. Scan home directory for matching config dirs
    let found: string | null = null;
    try {
      const entries: string[] = fs.readdirSync(homeDir);
      // Collect candidates: ~/.<backend>-* first (custom profiles), then ~/.<backend> (default)
      const profileDirs: string[] = entries
        .filter((e: string) => e.startsWith(`.${backend}-`))
        .sort();
      const defaultDir: string[] = entries.filter((e: string) => e === `.${backend}`);
      const candidates: string[] = [...profileDirs, ...defaultDir]
        .map((e: string) => path.join(homeDir, e))
        .filter((p: string) => {
          try {
            return fs.statSync(p).isDirectory();
          } catch {
            return false;
          }
        });

      // Check each candidate for auth marker files
      for (const candidate of candidates) {
        const hasAuth = markers.some((marker: string) => {
          try {
            return fs.statSync(path.join(candidate, marker)).isFile();
          } catch {
            return false;
          }
        });
        if (hasAuth) {
          found = candidate;
          break;
        }
      }
    } catch {
      // Home dir not readable — skip
    }

    result[backend] = found;
  }

  _configDirCache = result;
  return result;
}

/**
 * Clear the config dir discovery cache. Exported for testing.
 */
function clearConfigDirCache(): void {
  _configDirCache = null;
}

/**
 * Build the environment variables needed to run a backend CLI with the correct
 * config directory. Returns a copy of process.env with the override applied.
 */
function buildBackendEnv(backend: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };

  // Strip Claude session env vars so subprocess doesn't detect nested invocation
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_') || key.startsWith('CLAUDECODE_')) {
      delete env[key];
    }
  }

  const configDirs = discoverBackendConfigDirs();
  const configDir = configDirs[backend];
  if (!configDir) return env;

  const envVar = BACKEND_CONFIG_ENV[backend];
  if (!envVar) return env;

  return { ...env, [envVar]: configDir };
}

/**
 * Probe which AI CLI backends are available on PATH.
 *
 * For each of the four dispatchable backends (claude, codex, gemini, opencode),
 * runs `<binary> --version` with a 5-second timeout. Success means available.
 * Meta-backends (overstory, superpowers, grd) are always marked unavailable here.
 *
 * Result is cached for 5 minutes (AVAILABILITY_CACHE_TTL_MS). Call
 * clearAvailabilityCache() to force re-detection in tests.
 *
 * @param cwd - Optional working directory for subprocess (defaults to process.cwd())
 * @returns A map of BackendId to BackendAvailability for all known backends
 */
function detectAvailableBackends(cwd?: string): Record<BackendId, BackendAvailability> {
  const now: number = Date.now();
  if (_availabilityCache && now - _availabilityCache.ts < AVAILABILITY_CACHE_TTL_MS) {
    return _availabilityCache.result;
  }

  const effectiveCwd: string = cwd || process.cwd();
  const unavailable: BackendAvailability = { available: false, version: null };

  const result: Record<BackendId, BackendAvailability> = {
    claude: unavailable,
    codex: unavailable,
    gemini: unavailable,
    opencode: unavailable,
    overstory: unavailable,
    superpowers: unavailable,
    grd: unavailable,
  };

  for (const backend of DISPATCHABLE_BACKENDS) {
    try {
      const stdout: string = execFileSync(backend, ['--version'], {
        cwd: effectiveCwd,
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: buildBackendEnv(backend),
      });
      result[backend as BackendId] = {
        available: true,
        version: stdout.trim().split('\n')[0] || null,
      };
    } catch {
      result[backend as BackendId] = { available: false, version: null };
    }
  }

  _availabilityCache = { result, ts: now };
  return result;
}

/**
 * Clear the availability detection cache. Exported for testing.
 */
function clearAvailabilityCache(): void {
  _availabilityCache = null;
}

// ─── Spec 4: adaptive model-tier routing ──────────────────────────────────

type _ModelTier = 'opus' | 'sonnet' | 'haiku';
const _TIER_ORDER: _ModelTier[] = ['opus', 'sonnet', 'haiku'];

/**
 * Looks up how many tiers to downgrade given the profile, pressure,
 * and complexity. Returns 0, 1, or 2. Pure function — table-driven.
 */
function _lookupDowngradeCount(
  profile: TokenProfileName,
  pressure: BudgetPressureLevel,
  complexity: ComplexityLevel
): number {
  // quality: only downgrade on critical pressure
  if (profile === 'quality') {
    if (pressure === 'critical') return 1;
    return 0;
  }

  // balanced: moderate adaptive downgrade
  if (profile === 'balanced') {
    if (pressure === 'none') {
      if (complexity === 'low') return 1;
      return 0;
    }
    if (pressure === 'warning') {
      if (complexity === 'high') return 0;
      return 1;
    }
    if (pressure === 'high') {
      if (complexity === 'high') return 0;
      if (complexity === 'medium') return 1;
      return 2; // low
    }
    if (pressure === 'critical') {
      if (complexity === 'high') return 1;
      return 2;
    }
  }

  // frugal: aggressive downgrade
  if (profile === 'frugal') {
    if (pressure === 'none') {
      if (complexity === 'high') return 0;
      return 1; // medium or low
    }
    if (pressure === 'warning') {
      if (complexity === 'low') return 2;
      return 1;
    }
    // high or critical
    return 2;
  }

  return 0;
}

/**
 * Applies a downgrade count to a base tier, floored at the lowest tier.
 * Returns the base tier unchanged if it's not in _TIER_ORDER (passthrough).
 */
function _applyDowngrade(baseTier: _ModelTier, count: number): _ModelTier {
  const baseIndex = _TIER_ORDER.indexOf(baseTier);
  if (baseIndex === -1) return baseTier;
  const targetIndex = Math.min(baseIndex + count, _TIER_ORDER.length - 1);
  return _TIER_ORDER[targetIndex];
}

/**
 * Computes the effective model tier for an agent dispatch given the
 * base tier (from MODEL_PROFILES), the user's token_profile preference,
 * the current budget pressure level, and the task's complexity level.
 *
 * Pure function. Returns a possibly-downgraded ModelTier. The decision
 * matrix is documented in the spec and implemented in _lookupDowngradeCount.
 */
function computeEffectiveModelTier(opts: {
  baseTier: _ModelTier;
  tokenProfile: TokenProfileName;
  pressure: BudgetPressureLevel;
  complexity: ComplexityLevel;
}): _ModelTier {
  const count = _lookupDowngradeCount(opts.tokenProfile, opts.pressure, opts.complexity);
  return _applyDowngrade(opts.baseTier, count);
}

// --- Adaptive tier dispatch helper -------------------------------------------

/**
 * Structural interface for the scheduler's state accessor.
 * Using a structural interface avoids circular imports between
 * scheduler.ts (which imports from types.ts) and backend.ts.
 */
interface _SchedulerLike {
  getStates(): Map<string, BackendUsageState>;
}

const { estimateComplexity } = require('./complexity') as {
  estimateComplexity: (opts: {
    agentType: string;
    promptLength?: number;
    recentSamples?: { duration: number; tokenEstimate: number }[];
    baselineOverride?: ComplexityLevel;
  }) => ComplexityLevel;
};

const { computeBudgetPressureLevel, logPressureTransition } = require('./scheduler') as {
  computeBudgetPressureLevel: (
    states: Map<string, BackendUsageState>,
    priority: BackendId[],
    accounts: SuperpowersConfig['accounts'],
    thresholds?: BudgetPressureThresholds
  ) => BudgetPressureLevel;
  logPressureTransition: (
    sessionKey: string,
    current: BudgetPressureLevel,
    agentType: string,
    baseTier: string,
    effectiveTier: string
  ) => void;
};

/**
 * Computes the effective model tier for an agent dispatch by running
 * the Spec 4 chain: estimateComplexity → computeBudgetPressureLevel →
 * computeEffectiveModelTier. Returns the tier to pass to
 * resolveModelForAgent as effectiveTierOverride.
 *
 * When scheduler/schedulerConfig/superpowersConfig are null/undefined,
 * returns the base tier unchanged (preserving pre-Spec-4 behavior).
 *
 * @param opts.agentType - Agent type key (e.g. 'grd-executor')
 * @param opts.prompt - The prompt string (used for promptLength)
 * @param opts.config - GrdConfig with model_profile and token_profile fields
 * @param opts.scheduler - Scheduler instance or null when not configured
 * @param opts.schedulerConfig - Scheduler configuration from config.scheduler
 * @param opts.superpowersConfig - Superpowers config from config.superpowers
 * @param opts.modelProfiles - MODEL_PROFILES table (passed in to avoid circular dep)
 * @returns Effective model tier for this dispatch
 */
function getEffectiveTierForDispatch(opts: {
  agentType: string;
  prompt: string;
  config: GrdConfig;
  scheduler: _SchedulerLike | null;
  schedulerConfig?: SchedulerConfig;
  superpowersConfig?: SuperpowersConfig;
  modelProfiles: Record<string, Record<string, string>>;
}): _ModelTier {
  const profile = opts.config.model_profile || 'balanced';
  const agentEntry = opts.modelProfiles[opts.agentType];
  const baseTier = ((agentEntry && agentEntry[profile]) || 'sonnet') as _ModelTier;

  if (!opts.scheduler || !opts.schedulerConfig || !opts.superpowersConfig) {
    return baseTier;
  }

  const states = opts.scheduler.getStates();

  // Collect recent samples from all priority accounts (most recent first).
  // UsageSample has no agentType field, so we pass all samples as a global
  // workload signal and let estimateComplexity's tail-average compute
  // complexity. Still better than nothing — reflects overall system load.
  let recentSamples: { duration: number; tokenEstimate: number }[] | undefined;
  const allSamples: { duration: number; tokenEstimate: number; timestamp: number }[] = [];
  for (const backend of opts.schedulerConfig.backend_priority) {
    const backendAccounts = opts.superpowersConfig.accounts[backend as AdapterBackendId] || [];
    for (const account of backendAccounts) {
      const stateKey = `${backend}/${account.config_dir}`;
      const state = states.get(stateKey);
      if (!state) continue;
      for (const sample of state.samples) {
        allSamples.push({
          duration: sample.duration,
          tokenEstimate: sample.tokenEstimate,
          timestamp: sample.timestamp,
        });
      }
    }
  }
  if (allSamples.length >= 3) {
    // Sort by timestamp descending, take up to 10 most recent
    allSamples.sort((a, b) => b.timestamp - a.timestamp);
    recentSamples = allSamples.slice(0, 10).map((s) => ({
      duration: s.duration,
      tokenEstimate: s.tokenEstimate,
    }));
  }

  const complexity = estimateComplexity({
    agentType: opts.agentType,
    promptLength: opts.prompt.length,
    recentSamples,
    baselineOverride: opts.config.agent_complexity_overrides?.[opts.agentType],
  });
  const pressure = computeBudgetPressureLevel(
    states,
    opts.schedulerConfig.backend_priority as BackendId[],
    opts.superpowersConfig.accounts,
    opts.schedulerConfig.budget_pressure_thresholds
  );
  const tokenProfile: TokenProfileName = opts.config.token_profile || 'balanced';

  const effectiveTier = computeEffectiveModelTier({
    baseTier,
    tokenProfile,
    pressure,
    complexity,
  });

  // Spec 4 Goal #7: log on pressure transitions only
  logPressureTransition(process.pid.toString(), pressure, opts.agentType, baseTier, effectiveTier);

  return effectiveTier;
}

// --- Exports -----------------------------------------------------------------

module.exports = {
  VALID_BACKENDS,
  DEFAULT_BACKEND_MODELS,
  BACKEND_CAPABILITIES,
  EFFORT_PROFILES,
  detectBackend,
  resolveBackendModel,
  resolveEffortLevel,
  getBackendCapabilities,
  parseOpenCodeModels,
  detectModels,
  getCachedModels,
  clearModelCache,
  detectWebMcp,
  detectPlaywright,
  detectAvailableBackends,
  clearAvailabilityCache,
  discoverBackendConfigDirs,
  clearConfigDirCache,
  buildBackendEnv,
  BACKEND_CONFIG_ENV,
  readConfig,
  computeEffectiveModelTier,
  getEffectiveTierForDispatch,
};
