/**
 * Real-environment backend detection validation tests (DEFER-09-01)
 *
 * Validates detectBackend() under real-ish conditions with process.env
 * manipulation. Goes deeper than backend.test.ts: complete waterfall
 * priority, all 4 backend env patterns, edge cases, filesystem clue
 * isolation, and getBackendCapabilities cross-verification.
 *
 * IMPORTANT: Does NOT mock detectBackend itself. Exercises the real
 * detection waterfall with real env var manipulation.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  VALID_BACKENDS,
  BACKEND_CAPABILITIES,
  detectBackend,
  getBackendCapabilities,
} = require('../../lib/backend');

// ─── Helpers ────────────────────────────────────────────────────────────────

interface TempDirOpts {
  config?: Record<string, unknown>;
  files?: string[];
}

/**
 * Create a temp directory with optional config and filesystem clue files.
 */
function createTempDir(opts: TempDirOpts = {}): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-backend-real-env-'));

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

/**
 * Clear all backend-detection-relevant env vars from process.env.
 * Uses dynamic scanning for CLAUDE_CODE_* to be future-proof.
 */
function clearDetectionEnvVars(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('CLAUDE_CODE_')) {
      delete process.env[key];
    }
  }
  delete process.env.CODEX_HOME;
  delete process.env.CODEX_THREAD_ID;
  delete process.env.GEMINI_CLI_HOME;
  delete process.env.OPENCODE;
  delete process.env.AGENT;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Real-environment backend detection (DEFER-09-01)', () => {
  let savedEnv: NodeJS.ProcessEnv;
  let tmpDir: string;

  beforeEach(() => {
    savedEnv = { ...process.env };
    clearDetectionEnvVars();
    tmpDir = createTempDir();
  });

  afterEach(() => {
    process.env = savedEnv;
    cleanupTempDir(tmpDir);
  });

  // ─── Complete waterfall priority tests ──────────────────────────────────

  describe('waterfall priority: config > env > filesystem > default', () => {
    test('config override beats env var (config=codex, env=CLAUDE_CODE_*)', () => {
      process.env.CLAUDE_CODE_ENTRYPOINT = 'plugin';
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: 'codex' } });
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('config override beats filesystem clue (config=gemini, filesystem=codex)', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({
        config: { backend: 'gemini' },
        files: ['.codex/config.toml'],
      });
      expect(detectBackend(tmpDir)).toBe('gemini');
    });

    test('env var beats filesystem clue (env=CODEX_HOME, filesystem=claude)', () => {
      process.env.CODEX_HOME = '/home/user/.codex';
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.claude-plugin/plugin.json'] });
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('filesystem clue beats default (filesystem=opencode, no env)', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['opencode.json'] });
      expect(detectBackend(tmpDir)).toBe('opencode');
    });

    test('triple-signal: config wins over both env and filesystem', () => {
      process.env.CODEX_HOME = '/home/user/.codex';
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({
        config: { backend: 'opencode' },
        files: ['.gemini/settings.json'],
      });
      expect(detectBackend(tmpDir)).toBe('opencode');
    });

    test('env var order: CLAUDE_CODE_* checked before CODEX_*', () => {
      process.env.CLAUDE_CODE_ACTION = 'test';
      process.env.CODEX_HOME = '/home/user/.codex';
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('env var order: CODEX_* checked before GEMINI_CLI_HOME', () => {
      process.env.CODEX_THREAD_ID = 'thread-1';
      process.env.GEMINI_CLI_HOME = '/home/user/.gemini';
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('env var order: GEMINI_CLI_HOME checked before OPENCODE', () => {
      process.env.GEMINI_CLI_HOME = '/home/user/.gemini';
      process.env.OPENCODE = '1';
      expect(detectBackend(tmpDir)).toBe('gemini');
    });
  });

  // ─── All 4 backend environment variable patterns ────────────────────────

  describe('Claude env var patterns (CLAUDE_CODE_*)', () => {
    test('CLAUDE_CODE_ENTRYPOINT alone triggers claude detection', () => {
      process.env.CLAUDE_CODE_ENTRYPOINT = 'plugin';
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('CLAUDE_CODE_ACTION alone triggers claude detection', () => {
      process.env.CLAUDE_CODE_ACTION = 'default';
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('CLAUDE_CODE_ENABLE_TELEMETRY alone triggers claude detection', () => {
      process.env.CLAUDE_CODE_ENABLE_TELEMETRY = '1';
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('CLAUDE_CODE_SSE_PORT alone triggers claude detection', () => {
      process.env.CLAUDE_CODE_SSE_PORT = '3000';
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('multiple CLAUDE_CODE_* vars all trigger claude detection', () => {
      process.env.CLAUDE_CODE_ENTRYPOINT = 'plugin';
      process.env.CLAUDE_CODE_ACTION = 'default';
      process.env.CLAUDE_CODE_SSE_PORT = '3000';
      expect(detectBackend(tmpDir)).toBe('claude');
    });
  });

  describe('Codex env var patterns (CODEX_*)', () => {
    test('CODEX_HOME alone triggers codex detection', () => {
      process.env.CODEX_HOME = '/home/user/.codex';
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('CODEX_THREAD_ID alone triggers codex detection', () => {
      process.env.CODEX_THREAD_ID = 'thread-abc123';
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('both CODEX_HOME and CODEX_THREAD_ID together trigger codex', () => {
      process.env.CODEX_HOME = '/home/user/.codex';
      process.env.CODEX_THREAD_ID = 'thread-xyz';
      expect(detectBackend(tmpDir)).toBe('codex');
    });
  });

  describe('Gemini env var pattern (GEMINI_CLI_HOME)', () => {
    test('GEMINI_CLI_HOME triggers gemini detection', () => {
      process.env.GEMINI_CLI_HOME = '/home/user/.gemini';
      expect(detectBackend(tmpDir)).toBe('gemini');
    });
  });

  describe('OpenCode env var pattern (OPENCODE)', () => {
    test('OPENCODE triggers opencode detection', () => {
      process.env.OPENCODE = '1';
      expect(detectBackend(tmpDir)).toBe('opencode');
    });
  });

  // ─── Edge case documentation tests ─────────────────────────────────────

  describe('documented edge cases', () => {
    test('AGENT env var is NOT used for OpenCode detection (PITFALLS.md P5)', () => {
      process.env.AGENT = 'some-agent';
      expect(detectBackend(tmpDir)).toBe('claude'); // falls through to default
    });

    test('AGENT env var with other signals does not affect detection', () => {
      process.env.AGENT = 'some-agent';
      process.env.CODEX_HOME = '/home/user/.codex';
      // CODEX_HOME should be the detection trigger, not AGENT
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('empty string env vars are still detected as present (hasEnvPrefix)', () => {
      process.env.CLAUDE_CODE_ENTRYPOINT = '';
      // hasEnvPrefix checks key existence via startsWith, not value truthiness
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('config with invalid backend value falls through to env/filesystem/default', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: 'invalid-backend-xyz' } });
      // No env vars set, no filesystem clues, should fall to default
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('config with invalid backend value falls through to env detection', () => {
      process.env.GEMINI_CLI_HOME = '/home/user/.gemini';
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: 'not-a-backend' } });
      // Invalid config falls through, env var should pick up
      expect(detectBackend(tmpDir)).toBe('gemini');
    });

    test('config with non-string backend value falls through', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: 42 } });
      // VALID_BACKENDS.includes(42) === false, falls through
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('config with null backend value falls through', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: null } });
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('config with boolean backend value falls through', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend: true } });
      expect(detectBackend(tmpDir)).toBe('claude');
    });
  });

  // ─── Filesystem clue isolation ─────────────────────────────────────────

  describe('filesystem clue isolation (no env vars)', () => {
    test('detects claude via .claude-plugin/plugin.json', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.claude-plugin/plugin.json'] });
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('detects codex via .codex/config.toml', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.codex/config.toml'] });
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('detects gemini via .gemini/settings.json', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.gemini/settings.json'] });
      expect(detectBackend(tmpDir)).toBe('gemini');
    });

    test('detects opencode via opencode.json', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['opencode.json'] });
      expect(detectBackend(tmpDir)).toBe('opencode');
    });

    test('filesystem clue order: claude checked before codex', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({
        files: ['.claude-plugin/plugin.json', '.codex/config.toml'],
      });
      expect(detectBackend(tmpDir)).toBe('claude');
    });

    test('filesystem clue order: codex checked before gemini', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({
        files: ['.codex/config.toml', '.gemini/settings.json'],
      });
      expect(detectBackend(tmpDir)).toBe('codex');
    });

    test('filesystem clue order: gemini checked before opencode', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({
        files: ['.gemini/settings.json', 'opencode.json'],
      });
      expect(detectBackend(tmpDir)).toBe('gemini');
    });
  });

  // ─── getBackendCapabilities cross-verification ─────────────────────────

  describe('getBackendCapabilities cross-verification', () => {
    test.each([
      [
        'claude',
        {
          subagents: true,
          parallel: true,
          teams: true,
          hooks: true,
          mcp: true,
          native_worktree_isolation: true,
        },
      ],
      [
        'codex',
        {
          subagents: true,
          parallel: true,
          teams: true,
          hooks: true,
          mcp: true,
          native_worktree_isolation: false,
        },
      ],
      [
        'gemini',
        {
          subagents: true,
          parallel: true,
          teams: false,
          hooks: true,
          mcp: true,
          native_worktree_isolation: false,
        },
      ],
      [
        'opencode',
        {
          subagents: true,
          parallel: true,
          teams: false,
          hooks: true,
          mcp: true,
          native_worktree_isolation: false,
        },
      ],
    ])('detected %s backend returns correct capabilities', (backend, expectedCaps) => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ config: { backend } });
      const detected = detectBackend(tmpDir);
      expect(detected).toBe(backend);
      const caps = getBackendCapabilities(detected);
      expect(caps).toEqual(expectedCaps);
    });

    test('capabilities match BACKEND_CAPABILITIES constant for all backends', () => {
      for (const backend of VALID_BACKENDS) {
        const caps = getBackendCapabilities(backend);
        expect(caps).toEqual(BACKEND_CAPABILITIES[backend]);
      }
    });

    test('env-detected backend returns matching capabilities', () => {
      process.env.OPENCODE = '1';
      const detected = detectBackend(tmpDir);
      expect(detected).toBe('opencode');
      const caps = getBackendCapabilities(detected);
      expect(caps).toEqual(BACKEND_CAPABILITIES.opencode);
    });

    test('filesystem-detected backend returns matching capabilities', () => {
      cleanupTempDir(tmpDir);
      tmpDir = createTempDir({ files: ['.gemini/settings.json'] });
      const detected = detectBackend(tmpDir);
      expect(detected).toBe('gemini');
      const caps = getBackendCapabilities(detected);
      expect(caps).toEqual(BACKEND_CAPABILITIES.gemini);
    });
  });
});
