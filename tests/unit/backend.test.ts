/**
 * Unit tests for lib/backend.ts
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

const DETECTION_ENV_VARS: string[] = [
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

interface TempDirOpts {
  config?: Record<string, unknown>;
  files?: string[];
}

/**
 * Create a temp directory with optional .planning/config.json and filesystem clue files.
 */
function createTempDir(opts: TempDirOpts = {}): string {
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

function cleanupTempDir(dir: string): void {
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
  parseOpenCodeModels,
  detectModels,
  getCachedModels,
  clearModelCache,
  detectWebMcp,
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

    test('codex maps to gpt-5.4, gpt-5.3-codex-spark, gpt-5.3-codex-spark', () => {
      expect(DEFAULT_BACKEND_MODELS.codex).toEqual({
        opus: 'gpt-5.4',
        sonnet: 'gpt-5.3-codex-spark',
        haiku: 'gpt-5.3-codex-spark',
      });
    });

    test('gemini maps to gemini-3.1-pro, gemini-3-flash, gemini-3.1-flash-lite', () => {
      expect(DEFAULT_BACKEND_MODELS.gemini).toEqual({
        opus: 'gemini-3.1-pro',
        sonnet: 'gemini-3-flash',
        haiku: 'gemini-3.1-flash-lite',
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

    test('each entry has subagents, parallel, teams, hooks, mcp, native_worktree_isolation keys', () => {
      const requiredKeys = [
        'subagents',
        'parallel',
        'teams',
        'hooks',
        'mcp',
        'native_worktree_isolation',
      ];
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
        native_worktree_isolation: true,
      });
    });

    test('codex has subagents true, parallel true, teams false, hooks false, mcp true', () => {
      expect(BACKEND_CAPABILITIES.codex).toEqual({
        subagents: true,
        parallel: true,
        teams: false,
        hooks: false,
        mcp: true,
        native_worktree_isolation: false,
      });
    });

    test('gemini has subagents experimental, parallel false, teams false, hooks true, mcp true', () => {
      expect(BACKEND_CAPABILITIES.gemini).toEqual({
        subagents: 'experimental',
        parallel: false,
        teams: false,
        hooks: true,
        mcp: true,
        native_worktree_isolation: false,
      });
    });

    test('opencode has subagents true, parallel true, teams false, hooks true, mcp true', () => {
      expect(BACKEND_CAPABILITIES.opencode).toEqual({
        subagents: true,
        parallel: true,
        teams: false,
        hooks: true,
        mcp: true,
        native_worktree_isolation: false,
      });
    });

    // ─── native_worktree_isolation capability ──────────────────────────────

    test('claude has native_worktree_isolation: true', () => {
      expect(BACKEND_CAPABILITIES.claude.native_worktree_isolation).toBe(true);
    });

    test('codex has native_worktree_isolation: false', () => {
      expect(BACKEND_CAPABILITIES.codex.native_worktree_isolation).toBe(false);
    });

    test('gemini has native_worktree_isolation: false', () => {
      expect(BACKEND_CAPABILITIES.gemini.native_worktree_isolation).toBe(false);
    });

    test('opencode has native_worktree_isolation: false', () => {
      expect(BACKEND_CAPABILITIES.opencode.native_worktree_isolation).toBe(false);
    });
  });

  // ─── detectBackend(cwd) ────────────────────────────────────────────────

  describe('detectBackend(cwd)', () => {
    let savedEnv: NodeJS.ProcessEnv;
    let tmpDir: string;

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
        native_worktree_isolation: true,
      });
    });

    test('returns correct capabilities for codex', () => {
      expect(getBackendCapabilities('codex')).toEqual({
        subagents: true,
        parallel: true,
        teams: false,
        hooks: false,
        mcp: true,
        native_worktree_isolation: false,
      });
    });

    test('returns correct capabilities for gemini', () => {
      expect(getBackendCapabilities('gemini')).toEqual({
        subagents: 'experimental',
        parallel: false,
        teams: false,
        hooks: true,
        mcp: true,
        native_worktree_isolation: false,
      });
    });

    test('returns correct capabilities for opencode', () => {
      expect(getBackendCapabilities('opencode')).toEqual({
        subagents: true,
        parallel: true,
        teams: false,
        hooks: true,
        mcp: true,
        native_worktree_isolation: false,
      });
    });

    test('getBackendCapabilities("claude").native_worktree_isolation returns true', () => {
      expect(getBackendCapabilities('claude').native_worktree_isolation).toBe(true);
    });

    test('getBackendCapabilities("codex").native_worktree_isolation returns false', () => {
      expect(getBackendCapabilities('codex').native_worktree_isolation).toBe(false);
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

  // ─── parseOpenCodeModels(stdout) ──────────────────────────────────────

  describe('parseOpenCodeModels(stdout)', () => {
    test('parses anthropic models into correct tiers', () => {
      const stdout = [
        'Available models:',
        '---',
        'anthropic/claude-opus-4-5',
        'anthropic/claude-sonnet-4-5',
        'anthropic/claude-haiku-4-5',
      ].join('\n');
      const result = parseOpenCodeModels(stdout);
      expect(result).toEqual({
        opus: 'anthropic/claude-opus-4-5',
        sonnet: 'anthropic/claude-sonnet-4-5',
        haiku: 'anthropic/claude-haiku-4-5',
      });
    });

    test('parses openai/google models via pro/flash keywords', () => {
      const stdout = ['google/gemini-3-pro', 'google/gemini-3-flash'].join('\n');
      const result = parseOpenCodeModels(stdout);
      expect(result).toEqual({
        opus: 'google/gemini-3-pro',
        sonnet: null,
        haiku: 'google/gemini-3-flash',
      });
    });

    test('returns null for empty input', () => {
      expect(parseOpenCodeModels('')).toBeNull();
      expect(parseOpenCodeModels(null)).toBeNull();
      expect(parseOpenCodeModels(undefined)).toBeNull();
    });

    test('returns null when no models recognized', () => {
      const stdout = 'No models found.\n';
      expect(parseOpenCodeModels(stdout)).toBeNull();
    });

    test('skips header lines', () => {
      const stdout = [
        'Available models:',
        '---',
        '# Header comment',
        'anthropic/claude-sonnet-4-5',
      ].join('\n');
      const result = parseOpenCodeModels(stdout);
      expect(result).toEqual({
        opus: null,
        sonnet: 'anthropic/claude-sonnet-4-5',
        haiku: null,
      });
    });

    test('partial detection returns matched tiers with nulls for unmatched', () => {
      const stdout = 'anthropic/claude-opus-4-5\n';
      const result = parseOpenCodeModels(stdout);
      expect(result).toEqual({
        opus: 'anthropic/claude-opus-4-5',
        sonnet: null,
        haiku: null,
      });
    });

    test('mini keyword maps to haiku tier', () => {
      const stdout = 'openai/gpt-4o-mini\n';
      const result = parseOpenCodeModels(stdout);
      expect(result).toEqual({
        opus: null,
        sonnet: null,
        haiku: 'openai/gpt-4o-mini',
      });
    });

    test('first match wins per tier', () => {
      const stdout = [
        'anthropic/claude-opus-4-5',
        'anthropic/claude-opus-4',
        'anthropic/claude-sonnet-4-5',
        'anthropic/claude-sonnet-4',
      ].join('\n');
      const result = parseOpenCodeModels(stdout);
      expect(result.opus).toBe('anthropic/claude-opus-4-5');
      expect(result.sonnet).toBe('anthropic/claude-sonnet-4-5');
    });
  });

  // ─── detectModels(backend, cwd) ───────────────────────────────────────

  describe('detectModels(backend, cwd)', () => {
    test('returns null for claude backend', () => {
      expect(detectModels('claude')).toBeNull();
    });

    test('returns null for codex backend', () => {
      expect(detectModels('codex')).toBeNull();
    });

    test('returns null for gemini backend', () => {
      expect(detectModels('gemini')).toBeNull();
    });

    test('returns null or valid object for opencode', () => {
      // If opencode is on PATH, returns detected models; otherwise null
      const result = detectModels('opencode', '/tmp');
      if (result !== null) {
        expect(result).toHaveProperty('opus');
        expect(result).toHaveProperty('sonnet');
        expect(result).toHaveProperty('haiku');
      }
    });
  });

  // ─── getCachedModels / clearModelCache ────────────────────────────────

  describe('getCachedModels / clearModelCache', () => {
    afterEach(() => {
      clearModelCache();
    });

    test('returns null for non-opencode backends (cached)', () => {
      expect(getCachedModels('claude')).toBeNull();
    });

    test('clearModelCache resets cache', () => {
      // First call caches the result
      getCachedModels('claude');
      clearModelCache();
      // After clear, re-detection should occur (still null for claude)
      expect(getCachedModels('claude')).toBeNull();
    });
  });

  // ─── resolveBackendModel with cwd (detection layer) ───────────────────

  describe('resolveBackendModel with cwd param', () => {
    afterEach(() => {
      clearModelCache();
    });

    test('config override takes priority over detection', () => {
      const config = {
        backend_models: {
          opencode: { opus: 'custom/model' },
        },
      };
      // Even with cwd, config override wins
      expect(resolveBackendModel('opencode', 'opus', config, '/tmp')).toBe('custom/model');
    });

    test('falls back to defaults when cwd provided but no models detected', () => {
      // claude backend has no detection, so defaults are used
      expect(resolveBackendModel('claude', 'opus', {}, '/tmp')).toBe('opus');
    });

    test('backward compatible: undefined cwd uses defaults', () => {
      expect(resolveBackendModel('opencode', 'opus')).toBe('anthropic/claude-opus-4-5');
    });
  });

  // ─── detectWebMcp(cwd) ──────────────────────────────────────────────────

  describe('detectWebMcp(cwd)', () => {
    let savedEnv: NodeJS.ProcessEnv;
    let tmpDir: string;
    let readFileSyncSpy: jest.SpyInstance | null;

    beforeEach(() => {
      savedEnv = { ...process.env };
      // Clear WebMCP-related env vars
      delete process.env.CHROME_DEVTOOLS_MCP;
      delete process.env.WEBMCP_AVAILABLE;
      tmpDir = createTempDir();
    });

    afterEach(() => {
      process.env = savedEnv;
      cleanupTempDir(tmpDir);
      if (readFileSyncSpy) {
        readFileSyncSpy.mockRestore();
        readFileSyncSpy = null;
      }
    });

    test('returns available: false with reason when nothing detected', () => {
      // Mock ~/.claude.json to not exist (ensure clean detection)
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation((filePath: string, ...args: unknown[]) => {
        if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
          throw new Error('ENOENT');
        }
        return (jest.requireActual('fs') as typeof import('fs')).readFileSync(filePath, ...args as []);
      });
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('default');
      expect(result.reason).toBe(
        'Chrome DevTools MCP not detected in config, environment, or MCP server settings'
      );
    });

    test('returns available: true, source: "config" when webmcp.enabled is true', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { webmcp: { enabled: true } } });
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('config');
    });

    test('returns available: false, source: "config" when webmcp.enabled is false', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { webmcp: { enabled: false } } });
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('config');
      expect(result.reason).toBe('Disabled via config');
    });

    test('returns available: true, source: "env" when CHROME_DEVTOOLS_MCP=true', () => {
      // Mock ~/.claude.json to not exist
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation((filePath: string, ...args: unknown[]) => {
        if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
          throw new Error('ENOENT');
        }
        return (jest.requireActual('fs') as typeof import('fs')).readFileSync(filePath, ...args as []);
      });
      process.env.CHROME_DEVTOOLS_MCP = 'true';
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('env');
    });

    test('returns available: true, source: "env" when WEBMCP_AVAILABLE=1', () => {
      // Mock ~/.claude.json to not exist
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation((filePath: string, ...args: unknown[]) => {
        if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
          throw new Error('ENOENT');
        }
        return (jest.requireActual('fs') as typeof import('fs')).readFileSync(filePath, ...args as []);
      });
      process.env.WEBMCP_AVAILABLE = '1';
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('env');
    });

    test('returns available: false with reason when env var is "false"', () => {
      // Mock ~/.claude.json to not exist
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation((filePath: string, ...args: unknown[]) => {
        if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
          throw new Error('ENOENT');
        }
        return (jest.requireActual('fs') as typeof import('fs')).readFileSync(filePath, ...args as []);
      });
      process.env.CHROME_DEVTOOLS_MCP = 'false';
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('env');
      expect(result.reason).toBe('Disabled via environment variable');
    });

    test('returns available: true, source: "mcp-config" when ~/.claude.json has matching server', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation((filePath: string, ...args: unknown[]) => {
        if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
          return JSON.stringify({
            mcpServers: {
              'chrome-devtools': { command: 'npx', args: ['@anthropic/mcp-chrome'] },
            },
          });
        }
        return (jest.requireActual('fs') as typeof import('fs')).readFileSync(filePath, ...args as []);
      });
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('mcp-config');
    });

    test('config override takes priority over env var', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { webmcp: { enabled: false } } });
      process.env.CHROME_DEVTOOLS_MCP = 'true';
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('config');
    });

    test('handles missing .planning directory gracefully', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-webmcp-empty-'));
      // Mock ~/.claude.json to not exist
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation((filePath: string, ...args: unknown[]) => {
        if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
          throw new Error('ENOENT');
        }
        return (jest.requireActual('fs') as typeof import('fs')).readFileSync(filePath, ...args as []);
      });
      try {
        const result = detectWebMcp(emptyDir);
        expect(result.available).toBe(false);
        expect(result.source).toBe('default');
      } finally {
        cleanupTempDir(emptyDir);
      }
    });

    test('matches playwright server name in ~/.claude.json', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation((filePath: string, ...args: unknown[]) => {
        if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
          return JSON.stringify({
            mcpServers: {
              'playwright-browser': { command: 'npx', args: ['playwright-mcp'] },
            },
          });
        }
        return (jest.requireActual('fs') as typeof import('fs')).readFileSync(filePath, ...args as []);
      });
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('mcp-config');
    });
  });

  // ─── Phase 47: BACKEND_CAPABILITIES native_worktree_isolation per backend ──

  describe('BACKEND_CAPABILITIES native_worktree_isolation per backend', () => {
    test('BACKEND_CAPABILITIES.claude.native_worktree_isolation is true', () => {
      expect(BACKEND_CAPABILITIES.claude.native_worktree_isolation).toBe(true);
    });

    test('BACKEND_CAPABILITIES.codex.native_worktree_isolation is false', () => {
      expect(BACKEND_CAPABILITIES.codex.native_worktree_isolation).toBe(false);
    });

    test('BACKEND_CAPABILITIES.gemini.native_worktree_isolation is false', () => {
      expect(BACKEND_CAPABILITIES.gemini.native_worktree_isolation).toBe(false);
    });

    test('BACKEND_CAPABILITIES.opencode.native_worktree_isolation is false', () => {
      expect(BACKEND_CAPABILITIES.opencode.native_worktree_isolation).toBe(false);
    });

    test('getBackendCapabilities("claude").native_worktree_isolation returns true', () => {
      expect(getBackendCapabilities('claude').native_worktree_isolation).toBe(true);
    });

    test('getBackendCapabilities("codex").native_worktree_isolation returns false', () => {
      expect(getBackendCapabilities('codex').native_worktree_isolation).toBe(false);
    });

    test('getBackendCapabilities("unknown-backend") falls back to claude capabilities (returns true)', () => {
      expect(getBackendCapabilities('unknown-backend').native_worktree_isolation).toBe(true);
    });
  });
});
