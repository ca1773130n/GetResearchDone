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

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * List of valid backend identifiers.
 * @type {string[]}
 */
const VALID_BACKENDS = ['claude', 'codex', 'gemini', 'opencode'];

/**
 * Default model name mappings per backend and tier.
 * Each backend maps the abstract tiers (opus, sonnet, haiku) to concrete
 * model identifiers recognized by that backend's CLI.
 * @type {Object.<string, {opus: string, sonnet: string, haiku: string}>}
 */
const DEFAULT_BACKEND_MODELS = {
  claude: { opus: 'opus', sonnet: 'sonnet', haiku: 'haiku' },
  codex: { opus: 'gpt-5.3-codex', sonnet: 'gpt-5.3-codex-spark', haiku: 'gpt-5.3-codex-spark' },
  gemini: { opus: 'gemini-3-pro', sonnet: 'gemini-3-flash', haiku: 'gemini-2.5-flash' },
  opencode: {
    opus: 'anthropic/claude-opus-4-5',
    sonnet: 'anthropic/claude-sonnet-4-5',
    haiku: 'anthropic/claude-haiku-4-5',
  },
};

/**
 * Capability flags per backend. Describes what orchestration features each
 * backend supports. Used to degrade gracefully for backends with limited features.
 * @type {Object.<string, {subagents: boolean|string, parallel: boolean, teams: boolean, hooks: boolean, mcp: boolean}>}
 */
const BACKEND_CAPABILITIES = {
  claude: { subagents: true, parallel: true, teams: true, hooks: true, mcp: true },
  codex: { subagents: true, parallel: true, teams: false, hooks: false, mcp: true },
  gemini: { subagents: 'experimental', parallel: false, teams: false, hooks: true, mcp: true },
  opencode: { subagents: true, parallel: true, teams: false, hooks: true, mcp: true },
};

// ─── Internal Helpers ───────────────────────────────────────────────────────

/**
 * Read and parse .planning/config.json from cwd. Returns parsed object or null.
 * Uses fs.readFileSync directly to avoid circular dependency with lib/utils.js.
 * @param {string} cwd - Project working directory
 * @returns {Object|null} Parsed config or null on any error
 */
function readConfig(cwd) {
  try {
    const configPath = path.join(cwd, '.planning', 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Check if any environment variable starts with a given prefix.
 * @param {string} prefix - Prefix to search for
 * @returns {boolean}
 */
function hasEnvPrefix(prefix) {
  return Object.keys(process.env).some((k) => k.startsWith(prefix));
}

/**
 * Check if a file exists at a given path.
 * @param {string} filePath - Absolute path to check
 * @returns {boolean}
 */
function fileExists(filePath) {
  try {
    fs.statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// ─── Exported Functions ─────────────────────────────────────────────────────

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
 * @param {string} cwd - Project working directory
 * @returns {string} Backend identifier: 'claude' | 'codex' | 'gemini' | 'opencode'
 */
function detectBackend(cwd) {
  // Step 1: Config override (highest priority)
  const config = readConfig(cwd);
  if (config && config.backend && VALID_BACKENDS.includes(config.backend)) {
    return config.backend;
  }

  // Step 2: Environment variable detection
  if (hasEnvPrefix('CLAUDE_CODE_')) return 'claude';
  if (process.env.CODEX_HOME || process.env.CODEX_THREAD_ID) return 'codex';
  if (process.env.GEMINI_CLI_HOME) return 'gemini';
  if (process.env.OPENCODE) return 'opencode';

  // Step 3: Filesystem clues
  if (fileExists(path.join(cwd, '.claude-plugin', 'plugin.json'))) return 'claude';
  if (fileExists(path.join(cwd, '.codex', 'config.toml'))) return 'codex';
  if (fileExists(path.join(cwd, '.gemini', 'settings.json'))) return 'gemini';
  if (fileExists(path.join(cwd, 'opencode.json'))) return 'opencode';

  // Step 4: Default (backward compatible)
  return 'claude';
}

// ─── Dynamic Model Detection ────────────────────────────────────────────────

/**
 * Parse `opencode models` stdout into tier-classified model map.
 * Classifies each model ID by keyword patterns:
 *   opus tier: /opus/i, /pro/i (non-flash)
 *   sonnet tier: /sonnet/i
 *   haiku tier: /haiku/i, /flash/i, /mini/i, /spark/i
 *
 * @param {string} stdout - Raw stdout from `opencode models`
 * @returns {{opus: string|null, sonnet: string|null, haiku: string|null}|null}
 *   Tier-mapped models, or null if nothing recognized
 */
function parseOpenCodeModels(stdout) {
  if (!stdout || typeof stdout !== 'string') return null;

  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('Available') && !l.startsWith('---') && !l.startsWith('#'));

  const result = { opus: null, sonnet: null, haiku: null };
  let matched = false;

  for (const line of lines) {
    const model = line.split(/\s+/)[0];
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
 *
 * @param {string} backend - Backend identifier
 * @param {string} [cwd] - Working directory for the command
 * @returns {{opus: string|null, sonnet: string|null, haiku: string|null}|null}
 *   Detected models or null if detection unavailable/failed
 */
function detectModels(backend, cwd) {
  if (backend !== 'opencode') return null;

  try {
    const stdout = execFileSync('opencode', ['models'], {
      cwd: cwd || process.cwd(),
      timeout: 10000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parseOpenCodeModels(stdout);
  } catch {
    return null;
  }
}

/** @type {Map<string, {models: Object, ts: number}>} */
const _modelCache = new Map();
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get cached detected models for a backend, refreshing if TTL expired.
 *
 * @param {string} backend - Backend identifier
 * @param {string} [cwd] - Working directory
 * @returns {{opus: string|null, sonnet: string|null, haiku: string|null}|null}
 */
function getCachedModels(backend, cwd) {
  const entry = _modelCache.get(backend);
  const now = Date.now();
  if (entry && now - entry.ts < MODEL_CACHE_TTL_MS) {
    return entry.models;
  }
  const models = detectModels(backend, cwd);
  _modelCache.set(backend, { models, ts: now });
  return models;
}

/**
 * Clear the model detection cache. Exported for testing.
 */
function clearModelCache() {
  _modelCache.clear();
}

/**
 * Resolve an abstract model tier to a backend-specific model name.
 *
 * Checks config.backend_models for user overrides first, then falls back
 * to DEFAULT_BACKEND_MODELS. Unknown backends fall back to claude mappings.
 * Unknown tiers return undefined.
 *
 * @param {string} backend - Backend identifier ('claude', 'codex', 'gemini', 'opencode')
 * @param {string} tier - Model tier ('opus', 'sonnet', 'haiku')
 * @param {Object} [config] - Optional config object with backend_models overrides
 * @param {string} [cwd] - Optional working directory for dynamic model detection
 * @returns {string|undefined} Backend-specific model name, or undefined for unknown tier
 */
function resolveBackendModel(backend, tier, config, cwd) {
  // Check user override from config (highest priority)
  if (config && config.backend_models) {
    const backendOverrides = config.backend_models[backend];
    if (backendOverrides && backendOverrides[tier] !== undefined) {
      return backendOverrides[tier];
    }
  }

  // Check dynamically detected models (middle priority)
  if (cwd) {
    const detected = getCachedModels(backend, cwd);
    if (detected && detected[tier]) {
      return detected[tier];
    }
  }

  // Use built-in defaults, falling back to claude for unknown backends
  const backendModels = DEFAULT_BACKEND_MODELS[backend] || DEFAULT_BACKEND_MODELS.claude;
  return backendModels[tier];
}

/**
 * Get capability flags for a backend.
 *
 * Returns an object describing what orchestration features the backend supports.
 * Unknown backends return claude capabilities as a safe default.
 *
 * @param {string} backend - Backend identifier
 * @returns {{subagents: boolean|string, parallel: boolean, teams: boolean, hooks: boolean, mcp: boolean}} Capability flags
 */
function getBackendCapabilities(backend) {
  return BACKEND_CAPABILITIES[backend] || BACKEND_CAPABILITIES.claude;
}

// ─── WebMCP Detection ────────────────────────────────────────────────────────

/**
 * Detect whether Chrome DevTools MCP is available.
 *
 * Detection waterfall (highest to lowest priority):
 *   1. Config override: .planning/config.json `webmcp.enabled` field
 *   2. Environment variables: CHROME_DEVTOOLS_MCP, WEBMCP_AVAILABLE
 *   3. Claude Code MCP settings: ~/.claude.json `mcpServers` key
 *   4. Default: not available
 *
 * @param {string} cwd - Project working directory
 * @returns {{ available: boolean, source: string, reason?: string }}
 */
function detectWebMcp(cwd) {
  // Step 1: Config override (highest priority)
  const config = readConfig(cwd);
  if (config && config.webmcp && typeof config.webmcp.enabled === 'boolean') {
    if (config.webmcp.enabled) {
      return { available: true, source: 'config' };
    }
    return { available: false, source: 'config', reason: 'Disabled via config' };
  }

  // Step 2: Environment variable check
  const chromeDevToolsMcp = process.env.CHROME_DEVTOOLS_MCP;
  const webmcpAvailable = process.env.WEBMCP_AVAILABLE;

  if (chromeDevToolsMcp !== undefined) {
    if (chromeDevToolsMcp === 'true' || chromeDevToolsMcp === '1') {
      return { available: true, source: 'env' };
    }
    if (chromeDevToolsMcp === 'false' || chromeDevToolsMcp === '0') {
      return { available: false, source: 'env', reason: 'Disabled via environment variable' };
    }
  }

  if (webmcpAvailable !== undefined) {
    if (webmcpAvailable === 'true' || webmcpAvailable === '1') {
      return { available: true, source: 'env' };
    }
    if (webmcpAvailable === 'false' || webmcpAvailable === '0') {
      return { available: false, source: 'env', reason: 'Disabled via environment variable' };
    }
  }

  // Step 3: Claude Code MCP settings check (~/.claude.json)
  try {
    const homeDir = os.homedir();
    const claudeConfigPath = path.join(homeDir, '.claude.json');
    const raw = fs.readFileSync(claudeConfigPath, 'utf-8');
    const claudeConfig = JSON.parse(raw);
    if (claudeConfig && claudeConfig.mcpServers) {
      const serverNames = Object.keys(claudeConfig.mcpServers);
      const hasBrowserMcp = serverNames.some((name) =>
        /chrome|devtools|playwright|browser/i.test(name)
      );
      if (hasBrowserMcp) {
        return { available: true, source: 'mcp-config' };
      }
    }
  } catch {
    // ~/.claude.json not found or malformed — continue to default
  }

  // Step 4: Default
  return {
    available: false,
    source: 'default',
    reason: 'Chrome DevTools MCP not detected in config, environment, or MCP server settings',
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

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
