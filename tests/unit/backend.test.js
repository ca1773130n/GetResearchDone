/**
 * Unit tests for lib/backend.js
 *
 * Tests backend detection waterfall, model resolution, capabilities registry,
 * and exported constants for all 4 AI coding CLI backends.
 *
 * Environment mocking pattern per PITFALLS.md P9: save/restore process.env
 * in beforeEach/afterEach to prevent test pollution.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ─── Environment Mocking Helpers ────────────────────────────────────────────

const DETECTION_ENV_VARS = [
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_ACTION',
  'CLAUDE_CODE_ENABLE_TELEMETRY',
  'CLAUDE_CODE_SSE_PORT',
  'CODEX_HOME',
  'CODEX_THREAD_ID',
  'GEMINI_CLI_HOME',
  'OPENCODE',
  'AGENT',
];

/**
 * Create a temp directory with optional .planning/config.json and filesystem clue files.
 * @param {Object} [opts] - Options
 * @param {Object} [opts.config] - Config to write as .planning/config.json
 * @param {string[]} [opts.files] - Relative file paths to create (e.g., '.claude-plugin/plugin.json')
 * @returns {string} Temp directory path
 */
function createTempDir(opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-backend-test-'));

  if (opts.config) {
    const configDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify(opts.config, null, 2));
  }

  if (opts.files) {
    for (const file of opts.files) {
      const fullPath = path.join(tmpDir, file);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, '{}');
    }
  }

  return tmpDir;
}

function cleanupTempDir(dir) {
  if (!dir || !dir.startsWith(os.tmpdir())) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

const {
  VALID_BACKENDS,
  DEFAULT_BACKEND_MODELS,
  BACKEND_CAPABILITIES,
  detectBackend,
  resolveBackendModel,
  getBackendCapabilities,
} = require('../../lib/backend');

describe('lib/backend.js', () => {
  // ─── VALID_BACKENDS ─────────────────────────────────────────────────────

  describe('VALID_BACKENDS', () => {
    test('exports an array', () => {
      expect(Array.isArray(VALID_BACKENDS)).toBe(true);
    });

    test('contains exactly 4 backends', () => {
      expect(VALID_BACKENDS).toHaveLength(4);
    });

    test('contains claude, codex, gemini, opencode', () => {
      expect(VALID_BACKENDS).toEqual(['claude', 'codex', 'gemini', 'opencode']);
    });
  });

  // ─── DEFAULT_BACKEND_MODELS ─────────────────────────────────────────────

  describe('DEFAULT_BACKEND_MODELS', () => {
    test('has entries for all 4 backends', () => {
      for (const backend of VALID_BACKENDS) {
        expect(DEFAULT_BACKEND_MODELS).toHaveProperty(backend);
      }
    });

    test('each entry has opus, sonnet, haiku keys', () => {
      for (const backend of VALID_BACKENDS) {
        expect(DEFAULT_BACKEND_MODELS[backend]).toHaveProperty('opus');
        expect(DEFAULT_BACKEND_MODELS[backend]).toHaveProperty('sonnet');
        expect(DEFAULT_BACKEND_MODELS[backend]).toHaveProperty('haiku');
      }
    });

    test('claude maps to opus, sonnet, haiku', () => {
      expect(DEFAULT_BACKEND_MODELS.claude).toEqual({
        opus: 'opus',
        sonnet: 'sonnet',
        haiku: 'haiku',
      });
    });

    test('codex maps to gpt-5.3-codex, gpt-5.3-codex-spark, gpt-5.3-codex-spark', () => {
      expect(DEFAULT_BACKEND_MODELS.codex).toEqual({
        opus: 'gpt-5.3-codex',
        sonnet: 'gpt-5.3-codex-spark',
        haiku: 'gpt-5.3-codex-spark',
      });
    });

    test('gemini maps to gemini-3-pro, gemini-3-flash, gemini-2.5-flash', () => {
      expect(DEFAULT_BACKEND_MODELS.gemini).toEqual({
        opus: 'gemini-3-pro',
        sonnet: 'gemini-3-flash',
        haiku: 'gemini-2.5-flash',
      });
    });

    test('opencode maps to anthropic/claude-opus-4-5, anthropic/claude-sonnet-4-5, anthropic/claude-haiku-4-5', () => {
      expect(DEFAULT_BACKEND_MODELS.opencode).toEqual({
        opus: 'anthropic/claude-opus-4-5',
        sonnet: 'anthropic/claude-sonnet-4-5',
        haiku: 'anthropic/claude-haiku-4-5',
      });
    });
  });

  // ─── BACKEND_CAPABILITIES ──────────────────────────────────────────────

  describe('BACKEND_CAPABILITIES', () => {
    test('has entries for all 4 backends', () => {
      for (const backend of VALID_BACKENDS) {
        expect(BACKEND_CAPABILITIES).toHaveProperty(backend);
      }
    });

    test('each entry has subagents, parallel, teams, hooks, mcp keys', () => {
      const requiredKeys = ['subagents', 'parallel', 'teams', 'hooks', 'mcp'];
      for (const backend of VALID_BACKENDS) {
        for (const key of requiredKeys) {
          expect(BACKEND_CAPABILITIES[backend]).toHaveProperty(key);
        }
      }
    });

    test('claude has all capabilities true', () => {
      expect(BACKEND_CAPABILITIES.claude).toEqual({
        subagents: true,
        parallel: true,
        teams: true,
        hooks: true,
        mcp: true,
      });
    });

    test('codex has subagents true, parallel true, teams false, hooks false, mcp true', () => {
      expect(BACKEND_CAPABILITIES.codex).toEqual({
        subagents: true,
        parallel: true,
        teams: false,
        hooks: false,
        mcp: true,
      });
    });

    test('gemini has subagents experimental, parallel false, teams false, hooks true, mcp true', () => {
      expect(BACKEND_CAPABILITIES.gemini).toEqual({
        subagents: 'experimental',
        parallel: false,
        teams: false,
        hooks: true,
        mcp: true,
      });
    });

    test('opencode has subagents true, parallel true, teams false, hooks true, mcp true', () => {
      expect(BACKEND_CAPABILITIES.opencode).toEqual({
        subagents: true,
        parallel: true,
        teams: false,
        hooks: true,
        mcp: true,
      });
    });
  });

  // ─── detectBackend(cwd) ────────────────────────────────────────────────

  describe('detectBackend(cwd)', () => {
    let savedEnv;
    let tmpDir;

    beforeEach(() => {
      savedEnv = { ...process.env };
      // Clear all detection-relevant env vars
      for (const key of Object.keys(process.env)) {
        if (
          key.startsWith('CLAUDE_CODE_') ||
          key === 'CODEX_HOME' ||
          key === 'CODEX_THREAD_ID' ||
          key === 'GEMINI_CLI_HOME' ||
          key === 'OPENCODE' ||
          key === 'AGENT'
        ) {
          delete process.env[key];
        }
      }
      tmpDir = createTempDir();
    });

    afterEach(() => {
      process.env = savedEnv;
      cleanupTempDir(tmpDir);
    });

    // --- Environment variable detection ---

    test('returns "claude" when CLAUDE_CODE_ENTRYPOINT is set', () => {
      process.env.CLAUDE_CODE_ENTRYPOINT = 'plugin';
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('returns "claude" when CLAUDE_CODE_ACTION is set', () => {
      process.env.CLAUDE_CODE_ACTION = 'default';
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('returns "claude" when any CLAUDE_CODE_* prefixed env var is set', () => {
      process.env.CLAUDE_CODE_ENABLE_TELEMETRY = '1';
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('returns "codex" when CODEX_HOME is set', () => {
      process.env.CODEX_HOME = '/home/user/.codex';
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('returns "codex" when CODEX_THREAD_ID is set', () => {
      process.env.CODEX_THREAD_ID = 'thread-123';
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('returns "gemini" when GEMINI_CLI_HOME is set', () => {
      process.env.GEMINI_CLI_HOME = '/home/user/.gemini';
      expect(detectBackend(tmpDir)).toBe('gemini');
    });

    test('returns "opencode" when OPENCODE env var is set', () => {
      process.env.OPENCODE = '1';
      expect(detectBackend(tmpDir)).toBe('opencode');
    });

    // --- Config override (highest priority) ---

    test('returns value from config.backend when set (highest priority)', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: 'codex' } });
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('config.backend takes precedence over env vars', () => {
      process.env.CLAUDE_CODE_ENTRYPOINT = 'plugin';
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: 'gemini' } });
      expect(detectBackend(tmpDir)).toBe('gemini');
    });

    test('ignores invalid config.backend values (not in VALID_BACKENDS)', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: 'invalid-backend' } });
      // Should fall through to default since no env vars set
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    // --- Default ---

    test('returns "claude" as default when no signals detected', () => {
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    // --- Detection waterfall order ---

    test('detection waterfall order: config > env > filesystem > default', () => {
      // Set env for codex
      process.env.CODEX_HOME = '/home/user/.codex';
      // But config says gemini
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({
        config: { backend: 'gemini' },
        files: ['.claude-plugin/plugin.json'],
      });
      // Config takes priority
      expect(detectBackend(tmpDir)).toBe('gemini');
    });

    // --- Filesystem clues ---

    test('returns "claude" when .claude-plugin/plugin.json exists (filesystem clue)', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.claude-plugin/plugin.json'] });
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('returns "codex" when .codex/config.toml exists (filesystem clue)', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.codex/config.toml'] });
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('returns "gemini" when .gemini/settings.json exists (filesystem clue)', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.gemini/settings.json'] });
      expect(detectBackend(tmpDir)).toBe('gemini');
    });

    test('returns "opencode" when opencode.json exists (filesystem clue)', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['opencode.json'] });
      expect(detectBackend(tmpDir)).toBe('opencode');
    });

    test('filesystem clues only checked when env vars do not match', () => {
      // Create filesystem clue for codex
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.codex/config.toml'] });
      // But env says gemini
      process.env.GEMINI_CLI_HOME = '/home/user/.gemini';
      // Env takes priority over filesystem
      expect(detectBackend(tmpDir)).toBe('gemini');
    });

    // --- Edge cases ---

    test('handles missing .planning directory gracefully', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-backend-empty-'));
      try {
        expect(detectBackend(emptyDir)).toBe('claude');
      } finally {
        cleanupTempDir(emptyDir);
      }
    });

    test('handles malformed config.json gracefully', () => {
      cleanupTempDir(tmpDir);
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-backend-bad-config-'));
      const configDir = path.join(tmpDir, '.planning');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, 'config.json'), 'not valid json!!!');
      // Should fall through to default
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('does not use AGENT env var for OpenCode detection (PITFALLS.md P5)', () => {
      process.env.AGENT = 'some-agent';
      // AGENT alone should NOT trigger opencode detection
      expect(detectBackend(tmpDir)).toBe('claude');
    });
  });

  // ─── resolveBackendModel(backend, tier, config) ────────────────────────

  describe('resolveBackendModel(backend, tier, config)', () => {
    // --- Default mappings (4 backends x 3 tiers = 12 cases) ---

    test.each([
      ['claude', 'opus', 'opus'],
      ['claude', 'sonnet', 'sonnet'],
      ['claude', 'haiku', 'haiku'],
      ['codex', 'opus', 'gpt-5.3-codex'],
      ['codex', 'sonnet', 'gpt-5.3-codex-spark'],
      ['codex', 'haiku', 'gpt-5.3-codex-spark'],
      ['gemini', 'opus', 'gemini-3-pro'],
      ['gemini', 'sonnet', 'gemini-3-flash'],
      ['gemini', 'haiku', 'gemini-2.5-flash'],
      ['opencode', 'opus', 'anthropic/claude-opus-4-5'],
      ['opencode', 'sonnet', 'anthropic/claude-sonnet-4-5'],
      ['opencode', 'haiku', 'anthropic/claude-haiku-4-5'],
    ])('returns correct default model for %s/%s -> %s', (backend, tier, expected) => {
      expect(resolveBackendModel(backend, tier)).toBe(expected);
    });

    // --- Config overrides ---

    test('returns user override from config.backend_models when present', () => {
      const config = {
        backend_models: {
          codex: { opus: 'custom-codex-model' },
        },
      };
      expect(resolveBackendModel('codex', 'opus', config)).toBe('custom-codex-model');
    });

    test('falls back to default when config.backend_models is missing', () => {
      expect(resolveBackendModel('codex', 'opus', {})).toBe('gpt-5.3-codex');
    });

    test('falls back to default when config.backend_models[backend] is missing', () => {
      const config = {
        backend_models: {
          claude: { opus: 'custom-opus' },
        },
      };
      expect(resolveBackendModel('codex', 'opus', config)).toBe('gpt-5.3-codex');
    });

    test('falls back to default when specific tier override is missing', () => {
      const config = {
        backend_models: {
          codex: { opus: 'custom-codex' },
        },
      };
      // sonnet not overridden, should use default
      expect(resolveBackendModel('codex', 'sonnet', config)).toBe('gpt-5.3-codex-spark');
    });

    test('falls back to default when config is undefined', () => {
      expect(resolveBackendModel('claude', 'opus')).toBe('opus');
    });

    test('falls back to default when config is null', () => {
      expect(resolveBackendModel('claude', 'opus', null)).toBe('opus');
    });

    // --- Edge cases ---

    test('handles unknown backend by defaulting to claude mappings', () => {
      expect(resolveBackendModel('unknown-backend', 'opus')).toBe('opus');
    });

    test('handles unknown tier by returning undefined', () => {
      const result = resolveBackendModel('claude', 'unknown-tier');
      expect(result).toBeUndefined();
    });
  });

  // ─── getBackendCapabilities(backend) ───────────────────────────────────

  describe('getBackendCapabilities(backend)', () => {
    test('returns correct capabilities for claude', () => {
      expect(getBackendCapabilities('claude')).toEqual({
        subagents: true,
        parallel: true,
        teams: true,
        hooks: true,
        mcp: true,
      });
    });

    test('returns correct capabilities for codex', () => {
      expect(getBackendCapabilities('codex')).toEqual({
        subagents: true,
        parallel: true,
        teams: false,
        hooks: false,
        mcp: true,
      });
    });

    test('returns correct capabilities for gemini', () => {
      expect(getBackendCapabilities('gemini')).toEqual({
        subagents: 'experimental',
        parallel: false,
        teams: false,
        hooks: true,
        mcp: true,
      });
    });

    test('returns correct capabilities for opencode', () => {
      expect(getBackendCapabilities('opencode')).toEqual({
        subagents: true,
        parallel: true,
        teams: false,
        hooks: true,
        mcp: true,
      });
    });

    test('returns claude capabilities for unknown backend (safe default)', () => {
      expect(getBackendCapabilities('unknown')).toEqual(BACKEND_CAPABILITIES.claude);
    });

    test('returns claude capabilities for undefined backend', () => {
      expect(getBackendCapabilities(undefined)).toEqual(BACKEND_CAPABILITIES.claude);
    });

    test('returns claude capabilities for null backend', () => {
      expect(getBackendCapabilities(null)).toEqual(BACKEND_CAPABILITIES.claude);
    });
  });
});
