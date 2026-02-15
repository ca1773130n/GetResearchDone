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
const path = require('path');

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
 * @returns {string|undefined} Backend-specific model name, or undefined for unknown tier
 */
function resolveBackendModel(backend, tier, config) {
  // Check user override from config
  if (config && config.backend_models) {
    const backendOverrides = config.backend_models[backend];
    if (backendOverrides && backendOverrides[tier] !== undefined) {
      return backendOverrides[tier];
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

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  VALID_BACKENDS,
  DEFAULT_BACKEND_MODELS,
  BACKEND_CAPABILITIES,
  detectBackend,
  resolveBackendModel,
  getBackendCapabilities,
};
