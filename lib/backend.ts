/**
 * GRD Backend Detection, Model Resolution & Capabilities
 *
 * Detects which AI coding CLI is running (Claude Code, Codex CLI, Gemini CLI,
 * OpenCode) via a detection waterfall: config override > env vars > filesystem
 * clues > default. Resolves abstract model tiers (opus/sonnet/haiku) to
 * backend-specific model names. Provides capability flags per backend.
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
'use strict';

import type {
  BackendId,
  BackendCapabilities,
  ModelTierMap,
  ModelTier,
  WebMcpResult,
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
    haiku: 'gpt-5.3-codex-spark',
  },
  gemini: {
    opus: 'gemini-3.1-pro',
    sonnet: 'gemini-3-flash',
    haiku: 'gemini-3.1-flash-lite',
  },
  opencode: {
    opus: 'anthropic/claude-opus-4-6',
    sonnet: 'anthropic/claude-sonnet-4-6',
    haiku: 'anthropic/claude-haiku-4-5',
  },
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
  },
  codex: {
    subagents: true,
    parallel: true,
    teams: false,
    hooks: false,
    mcp: true,
    native_worktree_isolation: false,
  },
  gemini: {
    subagents: 'experimental',
    parallel: false,
    teams: false,
    hooks: true,
    mcp: true,
    native_worktree_isolation: false,
  },
  opencode: {
    subagents: true,
    parallel: true,
    teams: false,
    hooks: true,
    mcp: true,
    native_worktree_isolation: false,
  },
};

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
  if (
    config &&
    config.backend &&
    VALID_BACKENDS.includes(config.backend as BackendId)
  ) {
    return config.backend as BackendId;
  }

  // Step 2: Environment variable detection
  if (hasEnvPrefix('CLAUDE_CODE_')) return 'claude';
  if (process.env.CODEX_HOME || process.env.CODEX_THREAD_ID) return 'codex';
  if (process.env.GEMINI_CLI_HOME) return 'gemini';
  if (process.env.OPENCODE) return 'opencode';

  // Step 3: Filesystem clues
  if (fileExists(path.join(cwd, '.claude-plugin', 'plugin.json')))
    return 'claude';
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
    .filter(
      (l) =>
        l &&
        !l.startsWith('Available') &&
        !l.startsWith('---') &&
        !l.startsWith('#'),
    );

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
    } else if (
      /flash/i.test(model) ||
      /mini/i.test(model) ||
      /spark/i.test(model)
    ) {
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
    typeof timeouts?.backend_detect_ms === 'number'
      ? timeouts.backend_detect_ms
      : 10000;
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
function getCachedModels(
  backend: string,
  cwd?: string,
): DetectedModels | null {
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
  cwd?: string,
): string | undefined {
  // Check user override from config (highest priority)
  if (config && config.backend_models) {
    const backendModelsConfig = config.backend_models as Record<
      string,
      Record<string, string>
    >;
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
    DEFAULT_BACKEND_MODELS[backend as BackendId] ||
    DEFAULT_BACKEND_MODELS.claude;
  return backendModels[tier];
}

/**
 * Get capability flags for a backend.
 *
 * Returns an object describing what orchestration features the backend supports.
 * Unknown backends return claude capabilities as a safe default.
 *
 * @param backend - The backend identifier (e.g. 'claude', 'codex', 'gemini', 'opencode')
 * @returns A BackendCapabilities object describing which orchestration features are supported
 */
function getBackendCapabilities(backend: string): BackendCapabilities {
  return (
    BACKEND_CAPABILITIES[backend as BackendId] || BACKEND_CAPABILITIES.claude
  );
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
  const chromeDevToolsMcp: string | undefined =
    process.env.CHROME_DEVTOOLS_MCP;
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
      const serverNames: string[] = Object.keys(
        claudeConfig.mcpServers as Record<string, unknown>,
      );
      const hasBrowserMcp: boolean = serverNames.some((name) =>
        /chrome|devtools|playwright|browser/i.test(name),
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
    reason:
      'Chrome DevTools MCP not detected in config, environment, or MCP server settings',
  };
}

// --- Exports -----------------------------------------------------------------

module.exports = {
  VALID_BACKENDS,
  DEFAULT_BACKEND_MODELS,
  BACKEND_CAPABILITIES,
  detectBackend,
  resolveBackendModel,
  getBackendCapabilities,
  parseOpenCodeModels,
  detectModels,
  getCachedModels,
  clearModelCache,
  detectWebMcp,
};
