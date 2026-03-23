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
  'OVERSTORY_HOME',
  'OVERSTORY_SESSION',
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
} = require('../../lib/backend');

describe('lib/backend.js', () => {
  // ─── VALID_BACKENDS ─────────────────────────────────────────────────────

  describe('VALID_BACKENDS', () => {
    test('exports an array', () => {
      expect(Array.isArray(VALID_BACKENDS)).toBe(true);
    });

    test('contains exactly 7 backends', () => {
      expect(VALID_BACKENDS).toHaveLength(7);
    });

    test('contains claude, codex, gemini, opencode, overstory, superpowers, grd', () => {
      expect(VALID_BACKENDS).toEqual([
        'claude',
        'codex',
        'gemini',
        'opencode',
        'overstory',
        'superpowers',
        'grd',
      ]);
    });
  });

  // ─── DEFAULT_BACKEND_MODELS ─────────────────────────────────────────────

  describe('DEFAULT_BACKEND_MODELS', () => {
    test('has entries for all backends', () => {
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

    test('codex maps to gpt-5.4, gpt-5.3-codex-spark, gpt-5.4-mini', () => {
      expect(DEFAULT_BACKEND_MODELS.codex).toEqual({
        opus: 'gpt-5.4',
        sonnet: 'gpt-5.3-codex-spark',
        haiku: 'gpt-5.4-mini',
      });
    });

    test('gemini maps to gemini-3.1-pro, gemini-3.1-flash, gemini-3.1-flash-lite', () => {
      expect(DEFAULT_BACKEND_MODELS.gemini).toEqual({
        opus: 'gemini-3.1-pro',
        sonnet: 'gemini-3.1-flash',
        haiku: 'gemini-3.1-flash-lite',
      });
    });

    test('opencode maps to anthropic/claude-opus-4-6, anthropic/claude-sonnet-4-6, anthropic/claude-haiku-4-5', () => {
      expect(DEFAULT_BACKEND_MODELS.opencode).toEqual({
        opus: 'anthropic/claude-opus-4-6',
        sonnet: 'anthropic/claude-sonnet-4-6',
        haiku: 'anthropic/claude-haiku-4-5',
      });
    });

    test('overstory maps to opus, sonnet, haiku', () => {
      expect(DEFAULT_BACKEND_MODELS.overstory).toEqual({
        opus: 'opus',
        sonnet: 'sonnet',
        haiku: 'haiku',
      });
    });
  });

  // ─── BACKEND_CAPABILITIES ──────────────────────────────────────────────

  describe('BACKEND_CAPABILITIES', () => {
    test('has entries for all backends', () => {
      for (const backend of VALID_BACKENDS) {
        expect(BACKEND_CAPABILITIES).toHaveProperty(backend);
      }
    });

    test('each entry has subagents, parallel, teams, hooks, mcp, native_worktree_isolation, effort, http_hooks, cron keys', () => {
      const requiredKeys = [
        'subagents',
        'parallel',
        'teams',
        'hooks',
        'mcp',
        'native_worktree_isolation',
        'effort',
        'http_hooks',
        'cron',
        'smart_approvals',
        'plan_mode',
        'sandbox_gvisor',
        'sandbox_lxc',
        'mcp_elicitation',
        'model_overrides',
        'max_output_tokens',
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
      });
    });

    test('codex has subagents true, parallel true, teams true, hooks true, mcp true', () => {
      expect(BACKEND_CAPABILITIES.codex).toEqual({
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
      });
    });

    test('gemini has subagents true, parallel true, teams false, hooks true, mcp true', () => {
      expect(BACKEND_CAPABILITIES.gemini).toEqual({
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
      });
    });

    test('overstory has subagents true, parallel true, teams true, hooks false, mcp true, native_worktree_isolation true', () => {
      expect(BACKEND_CAPABILITIES.overstory).toEqual({
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
          key === 'AGENT' ||
          key === 'OVERSTORY_HOME' ||
          key === 'OVERSTORY_SESSION'
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

    test('returns "overstory" when OVERSTORY_HOME is set', () => {
      process.env.OVERSTORY_HOME = '/home/user/.overstory';
      expect(detectBackend(tmpDir)).toBe('overstory');
    });

    test('returns "overstory" when OVERSTORY_SESSION is set', () => {
      process.env.OVERSTORY_SESSION = 'session-abc';
      expect(detectBackend(tmpDir)).toBe('overstory');
    });

    test('overstory env var takes priority over CLAUDE_CODE_ env vars', () => {
      process.env.OVERSTORY_HOME = '/home/user/.overstory';
      process.env.CLAUDE_CODE_ENTRYPOINT = 'plugin';
      expect(detectBackend(tmpDir)).toBe('overstory');
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

    test('config.backend takes precedence over OVERSTORY_HOME', () => {
      process.env.OVERSTORY_HOME = '/home/user/.overstory';
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: 'claude' } });
      expect(detectBackend(tmpDir)).toBe('claude');
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

    test('returns "overstory" when .overstory/config.yaml exists', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.overstory/config.yaml'] });
      expect(detectBackend(tmpDir)).toBe('overstory');
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
      ['codex', 'opus', 'gpt-5.4'],
      ['codex', 'sonnet', 'gpt-5.3-codex-spark'],
      ['codex', 'haiku', 'gpt-5.4-mini'],
      ['gemini', 'opus', 'gemini-3.1-pro'],
      ['gemini', 'sonnet', 'gemini-3.1-flash'],
      ['gemini', 'haiku', 'gemini-3.1-flash-lite'],
      ['opencode', 'opus', 'anthropic/claude-opus-4-6'],
      ['opencode', 'sonnet', 'anthropic/claude-sonnet-4-6'],
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
      expect(resolveBackendModel('codex', 'opus', {})).toBe('gpt-5.4');
    });

    test('falls back to default when config.backend_models[backend] is missing', () => {
      const config = {
        backend_models: {
          claude: { opus: 'custom-opus' },
        },
      };
      expect(resolveBackendModel('codex', 'opus', config)).toBe('gpt-5.4');
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
      });
    });

    test('returns correct capabilities for codex', () => {
      expect(getBackendCapabilities('codex')).toEqual({
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
      });
    });

    test('returns correct capabilities for gemini', () => {
      expect(getBackendCapabilities('gemini')).toEqual({
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
      });
    });

    test('getBackendCapabilities("claude").native_worktree_isolation returns true', () => {
      expect(getBackendCapabilities('claude').native_worktree_isolation).toBe(true);
    });

    test('getBackendCapabilities("codex").native_worktree_isolation returns false', () => {
      expect(getBackendCapabilities('codex').native_worktree_isolation).toBe(false);
    });

    test('returns minimal capabilities for unknown backend (safe default)', () => {
      const caps = getBackendCapabilities('unknown');
      expect(caps).toEqual({
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
      });
    });

    test('returns minimal capabilities for undefined backend', () => {
      const caps = getBackendCapabilities(undefined);
      expect(caps.native_worktree_isolation).toBe(false);
      expect(caps.effort).toBe(false);
      expect(caps.subagents).toBe(true);
    });

    test('returns minimal capabilities for null backend', () => {
      const caps = getBackendCapabilities(null);
      expect(caps.native_worktree_isolation).toBe(false);
      expect(caps.effort).toBe(false);
      expect(caps.subagents).toBe(true);
    });

    test('overstory backend gets parallel mode support (teams: true, native_worktree_isolation: true)', () => {
      const caps = getBackendCapabilities('overstory');
      expect(caps.teams).toBe(true);
      expect(caps.native_worktree_isolation).toBe(true);
    });
  });

  // ─── parseOpenCodeModels(stdout) ──────────────────────────────────────

  describe('parseOpenCodeModels(stdout)', () => {
    test('parses anthropic models into correct tiers', () => {
      const stdout = [
        'Available models:',
        '---',
        'anthropic/claude-opus-4-6',
        'anthropic/claude-sonnet-4-6',
        'anthropic/claude-haiku-4-5',
      ].join('\n');
      const result = parseOpenCodeModels(stdout);
      expect(result).toEqual({
        opus: 'anthropic/claude-opus-4-6',
        sonnet: 'anthropic/claude-sonnet-4-6',
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
        'anthropic/claude-sonnet-4-6',
      ].join('\n');
      const result = parseOpenCodeModels(stdout);
      expect(result).toEqual({
        opus: null,
        sonnet: 'anthropic/claude-sonnet-4-6',
        haiku: null,
      });
    });

    test('partial detection returns matched tiers with nulls for unmatched', () => {
      const stdout = 'anthropic/claude-opus-4-6\n';
      const result = parseOpenCodeModels(stdout);
      expect(result).toEqual({
        opus: 'anthropic/claude-opus-4-6',
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
        'anthropic/claude-opus-4-6',
        'anthropic/claude-opus-4',
        'anthropic/claude-sonnet-4-6',
        'anthropic/claude-sonnet-4',
      ].join('\n');
      const result = parseOpenCodeModels(stdout);
      expect(result.opus).toBe('anthropic/claude-opus-4-6');
      expect(result.sonnet).toBe('anthropic/claude-sonnet-4-6');
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

    test('returns cached result on second call within TTL', () => {
      // First call populates cache
      const first = getCachedModels('claude');
      // Second call should return from cache (same result)
      const second = getCachedModels('claude');
      expect(second).toEqual(first);
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
      expect(resolveBackendModel('opencode', 'opus')).toBe('anthropic/claude-opus-4-6');
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
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
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
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      process.env.CHROME_DEVTOOLS_MCP = 'true';
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('env');
    });

    test('returns available: true, source: "env" when WEBMCP_AVAILABLE=1', () => {
      // Mock ~/.claude.json to not exist
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      process.env.WEBMCP_AVAILABLE = '1';
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('env');
    });

    test('returns available: false with reason when env var is "false"', () => {
      // Mock ~/.claude.json to not exist
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      process.env.CHROME_DEVTOOLS_MCP = 'false';
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('env');
      expect(result.reason).toBe('Disabled via environment variable');
    });

    test('returns available: false when WEBMCP_AVAILABLE="false"', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      process.env.WEBMCP_AVAILABLE = 'false';
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('env');
      expect(result.reason).toBe('Disabled via environment variable');
    });

    test('returns available: false when WEBMCP_AVAILABLE="0"', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      process.env.WEBMCP_AVAILABLE = '0';
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('env');
      expect(result.reason).toBe('Disabled via environment variable');
    });

    test('returns available: true, source: "mcp-config" when ~/.claude.json has matching server', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            return JSON.stringify({
              mcpServers: {
                'chrome-devtools': { command: 'npx', args: ['@anthropic/mcp-chrome'] },
              },
            });
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
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
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      try {
        const result = detectWebMcp(emptyDir);
        expect(result.available).toBe(false);
        expect(result.source).toBe('default');
      } finally {
        cleanupTempDir(emptyDir);
      }
    });

    test('matches playwright server name in ~/.claude.json', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            return JSON.stringify({
              mcpServers: {
                'playwright-browser': { command: 'npx', args: ['playwright-mcp'] },
              },
            });
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      const result = detectWebMcp(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('mcp-config');
    });
  });

  // ─── detectPlaywright(cwd) ──────────────────────────────────────────────────

  describe('detectPlaywright(cwd)', () => {
    let savedEnv: NodeJS.ProcessEnv;
    let tmpDir: string;
    let readFileSyncSpy: jest.SpyInstance | null;

    beforeEach(() => {
      savedEnv = { ...process.env };
      delete process.env.PLAYWRIGHT_AVAILABLE;
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
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      const result = detectPlaywright(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('default');
      expect(result.reason).toBe(
        'Playwright MCP not detected in config, environment, or MCP server settings'
      );
    });

    test('returns available: true, source: "config" when playwright.enabled is true', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { playwright: { enabled: true } } });
      const result = detectPlaywright(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('config');
    });

    test('returns available: false, source: "config" when playwright.enabled is false', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { playwright: { enabled: false } } });
      const result = detectPlaywright(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('config');
      expect(result.reason).toBe('Disabled via config');
    });

    test('returns available: true, source: "env" when PLAYWRIGHT_AVAILABLE=true', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      process.env.PLAYWRIGHT_AVAILABLE = 'true';
      const result = detectPlaywright(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('env');
    });

    test('returns available: true, source: "env" when PLAYWRIGHT_AVAILABLE=1', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      process.env.PLAYWRIGHT_AVAILABLE = '1';
      const result = detectPlaywright(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('env');
    });

    test('returns available: false with reason when env var is "false"', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      process.env.PLAYWRIGHT_AVAILABLE = 'false';
      const result = detectPlaywright(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('env');
      expect(result.reason).toBe('Disabled via environment variable');
    });

    test('returns available: false when PLAYWRIGHT_AVAILABLE="0"', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      process.env.PLAYWRIGHT_AVAILABLE = '0';
      const result = detectPlaywright(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('env');
      expect(result.reason).toBe('Disabled via environment variable');
    });

    test('returns available: true, source: "mcp-config" when ~/.claude.json has playwright server', () => {
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            return JSON.stringify({
              mcpServers: {
                'playwright-browser': { command: 'npx', args: ['playwright-mcp'] },
              },
            });
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      const result = detectPlaywright(tmpDir);
      expect(result.available).toBe(true);
      expect(result.source).toBe('mcp-config');
    });

    test('config override takes priority over env var', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { playwright: { enabled: false } } });
      process.env.PLAYWRIGHT_AVAILABLE = 'true';
      const result = detectPlaywright(tmpDir);
      expect(result.available).toBe(false);
      expect(result.source).toBe('config');
    });

    test('handles missing .planning directory gracefully', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-playwright-empty-'));
      readFileSyncSpy = (jest.spyOn(fs, 'readFileSync') as jest.SpyInstance).mockImplementation(
        (filePath: string, ...args: unknown[]) => {
          if (typeof filePath === 'string' && filePath.endsWith('.claude.json')) {
            throw new Error('ENOENT');
          }
          return (jest.requireActual('fs') as typeof import('fs')).readFileSync(
            filePath,
            ...(args as [])
          );
        }
      );
      try {
        const result = detectPlaywright(emptyDir);
        expect(result.available).toBe(false);
        expect(result.source).toBe('default');
      } finally {
        cleanupTempDir(emptyDir);
      }
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

    test('getBackendCapabilities("unknown-backend") returns minimal capabilities (returns false)', () => {
      expect(getBackendCapabilities('unknown-backend').native_worktree_isolation).toBe(false);
    });
  });

  // ─── BACKEND_CAPABILITIES effort/http_hooks/cron per backend ────────────

  describe('BACKEND_CAPABILITIES effort/http_hooks/cron per backend', () => {
    test('BACKEND_CAPABILITIES.claude.effort is true', () => {
      expect(BACKEND_CAPABILITIES.claude.effort).toBe(true);
    });

    test('BACKEND_CAPABILITIES.claude.http_hooks is true', () => {
      expect(BACKEND_CAPABILITIES.claude.http_hooks).toBe(true);
    });

    test('BACKEND_CAPABILITIES.claude.cron is true', () => {
      expect(BACKEND_CAPABILITIES.claude.cron).toBe(true);
    });

    test('BACKEND_CAPABILITIES.codex.effort is false', () => {
      expect(BACKEND_CAPABILITIES.codex.effort).toBe(false);
    });

    test('BACKEND_CAPABILITIES.gemini.effort is false', () => {
      expect(BACKEND_CAPABILITIES.gemini.effort).toBe(false);
    });

    test('BACKEND_CAPABILITIES.opencode.effort is false', () => {
      expect(BACKEND_CAPABILITIES.opencode.effort).toBe(false);
    });

    test('getBackendCapabilities("claude").effort returns true', () => {
      expect(getBackendCapabilities('claude').effort).toBe(true);
    });

    test('getBackendCapabilities("codex").effort returns false', () => {
      expect(getBackendCapabilities('codex').effort).toBe(false);
    });

    test('getBackendCapabilities("unknown-backend") returns minimal capabilities (effort: false)', () => {
      expect(getBackendCapabilities('unknown-backend').effort).toBe(false);
    });
  });

  // ─── new capability flags ────────────────────────────────────────────────

  describe('new capability flags', () => {
    test('codex has smart_approvals: true', () => {
      expect(BACKEND_CAPABILITIES.codex.smart_approvals).toBe(true);
    });

    test('only codex has smart_approvals: true', () => {
      for (const backend of VALID_BACKENDS) {
        if (backend === 'codex') continue;
        expect(BACKEND_CAPABILITIES[backend].smart_approvals).toBe(false);
      }
    });

    test('gemini has plan_mode and sandbox_gvisor', () => {
      expect(BACKEND_CAPABILITIES.gemini.plan_mode).toBe(true);
      expect(BACKEND_CAPABILITIES.gemini.sandbox_gvisor).toBe(true);
      expect(BACKEND_CAPABILITIES.gemini.sandbox_lxc).toBe(false);
    });

    test('claude has mcp_elicitation: true', () => {
      expect(BACKEND_CAPABILITIES.claude.mcp_elicitation).toBe(true);
    });

    test('only claude has mcp_elicitation: true', () => {
      for (const backend of VALID_BACKENDS) {
        if (backend === 'claude') continue;
        expect(BACKEND_CAPABILITIES[backend].mcp_elicitation).toBe(false);
      }
    });

    test('claude has max_output_tokens with correct limits', () => {
      expect(BACKEND_CAPABILITIES.claude.max_output_tokens).toEqual({
        default: 64000,
        upper_bound: 128000,
      });
    });

    test('non-claude backends have null max_output_tokens', () => {
      for (const backend of VALID_BACKENDS) {
        if (backend === 'claude') continue;
        expect(BACKEND_CAPABILITIES[backend].max_output_tokens).toBeNull();
      }
    });

    test('all backends have model_overrides flag', () => {
      for (const backend of VALID_BACKENDS) {
        expect(typeof BACKEND_CAPABILITIES[backend].model_overrides).toBe('boolean');
      }
    });
  });

  // ─── v0.3.12 capability flags ───────────────────────────────────────────

  describe('v0.3.12 capability flags', () => {
    test('smart_approvals is true only for codex', () => {
      expect(BACKEND_CAPABILITIES.codex.smart_approvals).toBe(true);
      expect(BACKEND_CAPABILITIES.claude.smart_approvals).toBe(false);
      expect(BACKEND_CAPABILITIES.gemini.smart_approvals).toBe(false);
      expect(BACKEND_CAPABILITIES.opencode.smart_approvals).toBe(false);
    });

    test('plan_mode is true only for gemini', () => {
      expect(BACKEND_CAPABILITIES.gemini.plan_mode).toBe(true);
      expect(BACKEND_CAPABILITIES.claude.plan_mode).toBe(false);
      expect(BACKEND_CAPABILITIES.codex.plan_mode).toBe(false);
      expect(BACKEND_CAPABILITIES.opencode.plan_mode).toBe(false);
    });

    test('sandbox_gvisor is true only for gemini', () => {
      expect(BACKEND_CAPABILITIES.gemini.sandbox_gvisor).toBe(true);
      expect(BACKEND_CAPABILITIES.claude.sandbox_gvisor).toBe(false);
      expect(BACKEND_CAPABILITIES.codex.sandbox_gvisor).toBe(false);
      expect(BACKEND_CAPABILITIES.opencode.sandbox_gvisor).toBe(false);
    });

    test('sandbox_lxc is false for all four primary backends', () => {
      expect(BACKEND_CAPABILITIES.claude.sandbox_lxc).toBe(false);
      expect(BACKEND_CAPABILITIES.codex.sandbox_lxc).toBe(false);
      expect(BACKEND_CAPABILITIES.gemini.sandbox_lxc).toBe(false);
      expect(BACKEND_CAPABILITIES.opencode.sandbox_lxc).toBe(false);
    });

    test('mcp_elicitation is true only for claude', () => {
      expect(BACKEND_CAPABILITIES.claude.mcp_elicitation).toBe(true);
      expect(BACKEND_CAPABILITIES.codex.mcp_elicitation).toBe(false);
      expect(BACKEND_CAPABILITIES.gemini.mcp_elicitation).toBe(false);
      expect(BACKEND_CAPABILITIES.opencode.mcp_elicitation).toBe(false);
    });

    test('max_output_tokens for claude equals { default: 64000, upper_bound: 128000 }', () => {
      expect(BACKEND_CAPABILITIES.claude.max_output_tokens).toEqual({
        default: 64000,
        upper_bound: 128000,
      });
    });

    test('max_output_tokens is null for codex, gemini, and opencode', () => {
      expect(BACKEND_CAPABILITIES.codex.max_output_tokens).toBeNull();
      expect(BACKEND_CAPABILITIES.gemini.max_output_tokens).toBeNull();
      expect(BACKEND_CAPABILITIES.opencode.max_output_tokens).toBeNull();
    });
  });

  // ─── v0.3.12 model mappings ─────────────────────────────────────────────

  describe('v0.3.12 model mappings', () => {
    test('codex haiku maps to gpt-5.4-mini', () => {
      expect(DEFAULT_BACKEND_MODELS.codex.haiku).toBe('gpt-5.4-mini');
    });

    test('gemini opus maps to gemini-3.1-pro', () => {
      expect(DEFAULT_BACKEND_MODELS.gemini.opus).toBe('gemini-3.1-pro');
    });

    test('gemini sonnet maps to gemini-3.1-flash', () => {
      expect(DEFAULT_BACKEND_MODELS.gemini.sonnet).toBe('gemini-3.1-flash');
    });

    test('opencode opus maps to anthropic/claude-opus-4-6 (GPT-5.4 equivalent via OpenCode)', () => {
      expect(DEFAULT_BACKEND_MODELS.opencode.opus).toBe('anthropic/claude-opus-4-6');
    });
  });

  // ─── EFFORT_PROFILES ────────────────────────────────────────────────────

  describe('EFFORT_PROFILES', () => {
    test('has entries for known agent types', () => {
      expect(EFFORT_PROFILES['grd-executor']).toBeDefined();
      expect(EFFORT_PROFILES['grd-planner']).toBeDefined();
      expect(EFFORT_PROFILES['grd-verifier']).toBeDefined();
    });

    test('each entry has quality, balanced, budget keys', () => {
      for (const [_agent, profile] of Object.entries(EFFORT_PROFILES)) {
        expect(profile).toHaveProperty('quality');
        expect(profile).toHaveProperty('balanced');
        expect(profile).toHaveProperty('budget');
      }
    });

    test('all effort values are low, medium, or high', () => {
      const validLevels = ['low', 'medium', 'high'];
      for (const [_agent, profile] of Object.entries(EFFORT_PROFILES)) {
        const p = profile as Record<string, string>;
        expect(validLevels).toContain(p.quality);
        expect(validLevels).toContain(p.balanced);
        expect(validLevels).toContain(p.budget);
      }
    });
  });

  // ─── resolveEffortLevel(agentType, profile) ─────────────────────────────

  describe('resolveEffortLevel(agentType, profile)', () => {
    // --- Matrix tests: agentRole x profile -> expectedEffort ---

    test.each([
      // grd-planner: quality=high, balanced=high, budget=low
      ['grd-planner', 'quality', 'high'],
      ['grd-planner', 'balanced', 'high'],
      ['grd-planner', 'budget', 'low'],
      // grd-executor: quality=high, balanced=medium, budget=low
      ['grd-executor', 'quality', 'high'],
      ['grd-executor', 'balanced', 'medium'],
      ['grd-executor', 'budget', 'low'],
      // grd-verifier: quality=medium, balanced=low, budget=low
      ['grd-verifier', 'quality', 'medium'],
      ['grd-verifier', 'balanced', 'low'],
      ['grd-verifier', 'budget', 'low'],
      // grd-deep-diver: quality=high, balanced=medium, budget=low
      ['grd-deep-diver', 'quality', 'high'],
      ['grd-deep-diver', 'balanced', 'medium'],
      ['grd-deep-diver', 'budget', 'low'],
      // grd-product-owner: quality=high, balanced=high, budget=low
      ['grd-product-owner', 'quality', 'high'],
      ['grd-product-owner', 'balanced', 'high'],
      ['grd-product-owner', 'budget', 'low'],
      // grd-code-reviewer: quality=high, balanced=medium, budget=low
      ['grd-code-reviewer', 'quality', 'high'],
      ['grd-code-reviewer', 'balanced', 'medium'],
      ['grd-code-reviewer', 'budget', 'low'],
    ])('resolveEffortLevel("%s", "%s") returns "%s"', (agent, profile, expected) => {
      expect(resolveEffortLevel(agent, profile)).toBe(expected);
    });

    // --- Edge cases ---

    test('returns medium for unknown agent type', () => {
      expect(resolveEffortLevel('unknown-agent', 'quality')).toBe('medium');
    });

    test('returns medium for completely unknown agent type with balanced profile', () => {
      expect(resolveEffortLevel('nonexistent-agent', 'balanced')).toBe('medium');
    });

    test('falls back to balanced profile for unknown profile name', () => {
      const balanced = resolveEffortLevel('grd-executor', 'balanced');
      const unknown = resolveEffortLevel('grd-executor', 'nonexistent' as any);
      expect(unknown).toBe(balanced);
    });

    test('returns medium for undefined agent type', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(resolveEffortLevel(undefined as any, 'quality')).toBe('medium');
    });

    test('returns medium for null agent type', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(resolveEffortLevel(null as any, 'quality')).toBe('medium');
    });

    test('returns effort for each valid profile', () => {
      const profiles = ['quality', 'balanced', 'budget'] as const;
      for (const profile of profiles) {
        const result = resolveEffortLevel('grd-planner', profile);
        expect(['low', 'medium', 'high']).toContain(result);
      }
    });
  });

  // ─── detectAvailableBackends (live) ──────────────────────────────────────

  describe('detectAvailableBackends (live probing)', () => {
    beforeEach(() => {
      clearAvailabilityCache();
    });

    afterEach(() => {
      clearAvailabilityCache();
    });

    test('returns a result map with all 7 BackendId keys', () => {
      const result = detectAvailableBackends('/tmp');
      const expected = ['claude', 'codex', 'gemini', 'opencode', 'overstory', 'superpowers', 'grd'];
      for (const key of expected) {
        expect(result).toHaveProperty(key);
      }
    });

    test('each entry has available (boolean) and version (string | null)', () => {
      const result = detectAvailableBackends('/tmp');
      for (const key of Object.keys(result)) {
        expect(typeof result[key].available).toBe('boolean');
        const v = result[key].version;
        expect(v === null || typeof v === 'string').toBe(true);
      }
    });

    test('meta-backends are always unavailable', () => {
      const result = detectAvailableBackends('/tmp');
      expect(result.overstory.available).toBe(false);
      expect(result.superpowers.available).toBe(false);
      expect(result.grd.available).toBe(false);
    });

    test('meta-backends have version: null', () => {
      const result = detectAvailableBackends('/tmp');
      expect(result.overstory.version).toBeNull();
      expect(result.superpowers.version).toBeNull();
      expect(result.grd.version).toBeNull();
    });

    test('result is cached: second call returns same reference', () => {
      const first = detectAvailableBackends('/tmp');
      const second = detectAvailableBackends('/tmp');
      expect(second).toBe(first);
    });

    test('clearAvailabilityCache makes next call return fresh result', () => {
      const first = detectAvailableBackends('/tmp');
      clearAvailabilityCache();
      const second = detectAvailableBackends('/tmp');
      // Fresh call returns a new result object (not same reference)
      expect(second).not.toBe(first);
    });
  });

  // ─── detectAvailableBackends (mocked) ────────────────────────────────────

  describe('detectAvailableBackends (mocked child_process)', () => {
    // Re-require the module after mocking child_process to capture the mock binding
    let mockedExecFileSync: jest.Mock;
    let mockedDetectAvailableBackends: (cwd?: string) => Record<string, { available: boolean; version: string | null }>;
    let mockedClearAvailabilityCache: () => void;

    beforeEach(() => {
      jest.resetModules();
      mockedExecFileSync = jest.fn();
      jest.doMock('child_process', () => ({
        execFileSync: mockedExecFileSync,
      }));
      const freshBackend = require('../../lib/backend') as {
        detectAvailableBackends: (cwd?: string) => Record<string, { available: boolean; version: string | null }>;
        clearAvailabilityCache: () => void;
      };
      mockedDetectAvailableBackends = freshBackend.detectAvailableBackends;
      mockedClearAvailabilityCache = freshBackend.clearAvailabilityCache;
    });

    afterEach(() => {
      mockedClearAvailabilityCache();
      jest.resetModules();
      jest.dontMock('child_process');
    });

    test('all dispatchable backends available when --version succeeds', () => {
      mockedExecFileSync.mockReturnValue('1.2.3\n');
      const result = mockedDetectAvailableBackends('/tmp');
      expect(result.claude.available).toBe(true);
      expect(result.codex.available).toBe(true);
      expect(result.gemini.available).toBe(true);
      expect(result.opencode.available).toBe(true);
    });

    test('version string: only first line is captured', () => {
      mockedExecFileSync.mockReturnValue('version 3.1.0\nBuild date: 2026-01-01\nextra\n');
      const result = mockedDetectAvailableBackends('/tmp');
      expect(result.claude.version).toBe('version 3.1.0');
    });

    test('partial availability: claude and gemini available, codex and opencode not', () => {
      mockedExecFileSync.mockImplementation((bin: string) => {
        if (bin === 'claude' || bin === 'gemini') return '2.0.0\n';
        throw new Error('not found');
      });
      const result = mockedDetectAvailableBackends('/tmp');
      expect(result.claude.available).toBe(true);
      expect(result.gemini.available).toBe(true);
      expect(result.codex.available).toBe(false);
      expect(result.opencode.available).toBe(false);
    });

    test('no backends available when all --version calls throw', () => {
      mockedExecFileSync.mockImplementation(() => { throw new Error('not found'); });
      const result = mockedDetectAvailableBackends('/tmp');
      expect(result.claude.available).toBe(false);
      expect(result.codex.available).toBe(false);
      expect(result.gemini.available).toBe(false);
      expect(result.opencode.available).toBe(false);
    });

    test('unavailable backends have version: null', () => {
      mockedExecFileSync.mockImplementation(() => { throw new Error('not found'); });
      const result = mockedDetectAvailableBackends('/tmp');
      expect(result.claude.version).toBeNull();
      expect(result.codex.version).toBeNull();
    });

    test('caching: second call does not re-probe (4 calls for 4 backends, not 8)', () => {
      mockedExecFileSync.mockReturnValue('1.0.0\n');
      mockedDetectAvailableBackends('/tmp');
      mockedDetectAvailableBackends('/tmp');
      expect(mockedExecFileSync).toHaveBeenCalledTimes(4);
    });

    test('cache expiry: second call after TTL re-probes all backends', () => {
      mockedExecFileSync.mockReturnValue('1.0.0\n');
      const realDateNow = Date.now;

      mockedDetectAvailableBackends('/tmp');
      expect(mockedExecFileSync).toHaveBeenCalledTimes(4);

      // Advance time past the 5-minute TTL
      Date.now = (): number => realDateNow() + 6 * 60 * 1000;
      try {
        mockedDetectAvailableBackends('/tmp');
        expect(mockedExecFileSync).toHaveBeenCalledTimes(8);
      } finally {
        Date.now = realDateNow;
      }
    });
  });

  // ─── loadConfig: backend_roles and discussion section ────────────────────

  describe('loadConfig: backend_roles validation', () => {
    const { loadConfig } = require('../../lib/utils') as {
      loadConfig: (cwd?: string) => Record<string, unknown>;
    };
    const { captureError } = require('../helpers/setup') as {
      captureError: (fn: () => void) => { stderr: string; exitCode: number };
    };

    let tmpDir: string;

    afterEach(() => {
      if (tmpDir) {
        const fs = require('fs');
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    function writeConfig(obj: Record<string, unknown>): string {
      const fs = require('fs');
      const os = require('os');
      const pathMod = require('path');
      const dir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'grd-backend-roles-test-'));
      const planningDir = pathMod.join(dir, '.planning');
      fs.mkdirSync(planningDir, { recursive: true });
      fs.writeFileSync(pathMod.join(planningDir, 'config.json'), JSON.stringify(obj));
      return dir;
    }

    test('valid backend_roles: reviewer: codex loads successfully', () => {
      tmpDir = writeConfig({ model_profile: 'balanced', backend_roles: { reviewer: 'codex' } });
      const config = loadConfig(tmpDir) as { backend_roles?: Record<string, string> };
      expect(config.backend_roles).toBeDefined();
      expect(config.backend_roles!.reviewer).toBe('codex');
    });

    test('invalid backend_roles value produces stderr warning', () => {
      tmpDir = writeConfig({ model_profile: 'balanced', backend_roles: { reviewer: 'invalid-backend' } });
      const { stderr } = captureError(() => loadConfig(tmpDir));
      expect(stderr).toMatch(/invalid/i);
    });

    test('invalid backend_roles role name produces stderr warning', () => {
      tmpDir = writeConfig({ model_profile: 'balanced', backend_roles: { unknown_role: 'claude' } });
      const { stderr } = captureError(() => loadConfig(tmpDir));
      expect(stderr).toMatch(/Unrecognized/i);
    });

    test('discussion section enabled: true fills in default values', () => {
      tmpDir = writeConfig({ model_profile: 'balanced', discussion: { enabled: true } });
      const config = loadConfig(tmpDir) as { discussion?: Record<string, unknown> };
      expect(config.discussion).toBeDefined();
      expect(config.discussion!.enabled).toBe(true);
      expect(typeof config.discussion!.max_rounds).toBe('number');
      expect(typeof config.discussion!.timeout_per_round_seconds).toBe('number');
      expect(config.discussion!.synthesizer).toBe('claude');
    });

    test('discussion max_rounds: 10 is clamped to 3', () => {
      tmpDir = writeConfig({ model_profile: 'balanced', discussion: { enabled: true, max_rounds: 10 } });
      const config = loadConfig(tmpDir) as { discussion?: { max_rounds?: number } };
      expect(config.discussion!.max_rounds).toBe(3);
    });

    test('discussion max_rounds: 0 is clamped to 1', () => {
      tmpDir = writeConfig({ model_profile: 'balanced', discussion: { enabled: true, max_rounds: 0 } });
      const config = loadConfig(tmpDir) as { discussion?: { max_rounds?: number } };
      expect(config.discussion!.max_rounds).toBe(1);
    });

    test('discussion disabled: false loads successfully', () => {
      tmpDir = writeConfig({ model_profile: 'balanced', discussion: { enabled: false } });
      const config = loadConfig(tmpDir) as { discussion?: { enabled?: boolean } };
      expect(config.discussion).toBeDefined();
      expect(config.discussion!.enabled).toBe(false);
    });

    test('discussion section absent: config.discussion is undefined', () => {
      tmpDir = writeConfig({ model_profile: 'balanced' });
      const config = loadConfig(tmpDir) as { discussion?: unknown };
      expect(config.discussion).toBeUndefined();
    });
  });
});
