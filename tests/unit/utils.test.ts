/**
 * Unit tests for lib/utils.ts
 *
 * Tests constants, validation helpers, pure functions, and output/error utilities.
 */

const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  GIT_ALLOWED_COMMANDS,
  GIT_BLOCKED_COMMANDS,
  GIT_BLOCKED_FLAGS,
  MODEL_PROFILES,
  CODE_EXTENSIONS,
  generateSlugInternal,
  validatePhaseName,
  validateFilePath,
  validateGitRef,
  safeReadFile,
  safeReadJSON,
  extractMarkdownSection,
  parseIncludeFlag,
  normalizePhaseName,
  resolveModelInternal,
  resolveModelForAgent,
  findPhaseInternal,
  clearPhaseCache,
  stripShippedSections,
  levenshteinDistance,
  findClosestCommand,
  getMilestoneInfo,
  loadConfig,
  output,
  error,
  debugLog,
  createRunCache,
  findPhaseDir,
  parsePhaseNumber,
  walkJsFiles,
} = require('../../lib/utils');
const { clearModelCache } = require('../../lib/backend');

// ─── Constants ──────────────────────────────────────────────────────────────

describe('GIT_ALLOWED_COMMANDS', () => {
  test('is a Set', () => {
    expect(GIT_ALLOWED_COMMANDS).toBeInstanceOf(Set);
  });

  test('contains expected safe commands', () => {
    for (const cmd of ['log', 'diff', 'status', 'show', 'rev-parse', 'branch', 'add', 'commit']) {
      expect(GIT_ALLOWED_COMMANDS.has(cmd)).toBe(true);
    }
  });
});

describe('GIT_BLOCKED_COMMANDS', () => {
  test('is a Set', () => {
    expect(GIT_BLOCKED_COMMANDS).toBeInstanceOf(Set);
  });

  test('contains dangerous commands', () => {
    for (const cmd of ['config', 'push', 'clean']) {
      expect(GIT_BLOCKED_COMMANDS.has(cmd)).toBe(true);
    }
  });
});

describe('GIT_BLOCKED_FLAGS', () => {
  test('is a Set', () => {
    expect(GIT_BLOCKED_FLAGS).toBeInstanceOf(Set);
  });

  test('contains dangerous flags', () => {
    for (const flag of ['--force', '-f', '--hard', '--delete', '-D']) {
      expect(GIT_BLOCKED_FLAGS.has(flag)).toBe(true);
    }
  });
});

describe('MODEL_PROFILES', () => {
  test('has entries for known agent types', () => {
    expect(MODEL_PROFILES).toHaveProperty('grd-executor');
    expect(MODEL_PROFILES).toHaveProperty('grd-planner');
    expect(MODEL_PROFILES).toHaveProperty('grd-verifier');
  });

  test('each agent has quality, balanced, budget keys', () => {
    for (const [, profiles] of Object.entries(MODEL_PROFILES)) {
      expect(profiles).toHaveProperty('quality');
      expect(profiles).toHaveProperty('balanced');
      expect(profiles).toHaveProperty('budget');
    }
  });
});

describe('CODE_EXTENSIONS', () => {
  test('is a Set of file extensions', () => {
    expect(CODE_EXTENSIONS).toBeInstanceOf(Set);
  });

  test('contains common code extensions', () => {
    for (const ext of ['.js', '.ts', '.py', '.go', '.rs']) {
      expect(CODE_EXTENSIONS.has(ext)).toBe(true);
    }
  });
});

// ─── generateSlugInternal ───────────────────────────────────────────────────

describe('generateSlugInternal', () => {
  test('"Hello World" -> "hello-world"', () => {
    expect(generateSlugInternal('Hello World')).toBe('hello-world');
  });

  test('trims whitespace: "  spaces  " -> "spaces"', () => {
    expect(generateSlugInternal('  spaces  ')).toBe('spaces');
  });

  test('"UPPER CASE" -> "upper-case"', () => {
    expect(generateSlugInternal('UPPER CASE')).toBe('upper-case');
  });

  test('special chars: "foo@bar#baz" -> "foo-bar-baz"', () => {
    expect(generateSlugInternal('foo@bar#baz')).toBe('foo-bar-baz');
  });

  test('returns null for empty/falsy input', () => {
    expect(generateSlugInternal('')).toBe(null);
    expect(generateSlugInternal(null)).toBe(null);
    expect(generateSlugInternal(undefined)).toBe(null);
  });
});

// ─── validatePhaseName ──────────────────────────────────────────────────────

describe('validatePhaseName', () => {
  test('accepts valid phase names', () => {
    expect(validatePhaseName('01-test')).toBe('01-test');
    expect(validatePhaseName('02-build')).toBe('02-build');
    expect(validatePhaseName('1')).toBe('1');
    expect(validatePhaseName('01')).toBe('01');
  });

  test('rejects path traversal', () => {
    expect(() => validatePhaseName('../escape')).toThrow('path traversal');
  });

  test('rejects directory separators', () => {
    expect(() => validatePhaseName('01/test')).toThrow('directory separator');
  });

  test('rejects non-string input', () => {
    expect(() => validatePhaseName(123)).toThrow('Phase must be a string');
  });

  test('rejects null bytes', () => {
    expect(() => validatePhaseName('01\0test')).toThrow('null bytes');
  });
});

// ─── validateFilePath ───────────────────────────────────────────────────────

describe('validateFilePath', () => {
  const cwd = '/Users/test/project';

  test('accepts normal relative paths', () => {
    expect(validateFilePath('src/index.js', cwd)).toBe('src/index.js');
    expect(validateFilePath('lib/utils.js', cwd)).toBe('lib/utils.js');
  });

  test('rejects null bytes', () => {
    expect(() => validateFilePath('src/\0evil.js', cwd)).toThrow('null bytes');
  });

  test('rejects paths escaping project directory', () => {
    expect(() => validateFilePath('../../etc/passwd', cwd)).toThrow('escape project');
  });

  test('rejects non-string input', () => {
    expect(() => validateFilePath(123, cwd)).toThrow('must be a string');
  });
});

// ─── validateGitRef ─────────────────────────────────────────────────────────

describe('validateGitRef', () => {
  test('accepts valid git refs', () => {
    expect(validateGitRef('abc1234')).toBe('abc1234');
    expect(validateGitRef('main')).toBe('main');
    expect(validateGitRef('feature/branch-name')).toBe('feature/branch-name');
    expect(validateGitRef('HEAD~1')).toBe('HEAD~1');
  });

  test('rejects command injection', () => {
    expect(() => validateGitRef('ref; rm -rf')).toThrow('invalid characters');
  });

  test('rejects flag injection (starts with dash)', () => {
    expect(() => validateGitRef('-flag')).toThrow('must not start with a dash');
  });

  test('rejects path traversal', () => {
    expect(() => validateGitRef('refs/../etc')).toThrow('path traversal');
  });

  test('rejects overly long refs', () => {
    expect(() => validateGitRef('a'.repeat(300))).toThrow('too long');
  });
});

// ─── safeReadFile ───────────────────────────────────────────────────────────

describe('safeReadFile', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns content for existing file', () => {
    const content = safeReadFile(path.join(fixtureDir, '.planning', 'config.json'));
    expect(content).toBeTruthy();
    expect(content).toContain('model_profile');
  });

  test('returns null for non-existent file', () => {
    const result = safeReadFile(path.join(fixtureDir, 'nonexistent.txt'));
    expect(result).toBeNull();
  });
});

// ─── parseIncludeFlag ───────────────────────────────────────────────────────

describe('parseIncludeFlag', () => {
  test('parses --include flag from args', () => {
    const result = parseIncludeFlag(['--include', 'foo,bar,baz']);
    expect(result).toBeInstanceOf(Set);
    expect(result.has('foo')).toBe(true);
    expect(result.has('bar')).toBe(true);
    expect(result.has('baz')).toBe(true);
  });

  test('returns empty Set when no --include', () => {
    const result = parseIncludeFlag(['--other', 'value']);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  test('returns empty Set when --include has no value', () => {
    const result = parseIncludeFlag(['--include']);
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});

// ─── normalizePhaseName ─────────────────────────────────────────────────────

describe('normalizePhaseName', () => {
  test('"1" -> "01"', () => {
    expect(normalizePhaseName('1')).toBe('01');
  });

  test('"01" stays "01"', () => {
    expect(normalizePhaseName('01')).toBe('01');
  });

  test('"1.1" -> "01.1" (decimal phases)', () => {
    expect(normalizePhaseName('1.1')).toBe('01.1');
  });

  test('rejects path traversal', () => {
    expect(() => normalizePhaseName('..')).toThrow('path traversal');
  });

  test('rejects directory separators', () => {
    expect(() => normalizePhaseName('01/test')).toThrow('directory separator');
  });

  test('rejects non-string input', () => {
    expect(() => normalizePhaseName(42)).toThrow('Phase must be a string');
  });
});

// ─── resolveModelInternal / resolveModelForAgent ────────────────────────────

describe('resolveModelInternal', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns correct model for known agent with fixture config (balanced)', () => {
    // The fixture config has model_profile: "balanced"
    const model = resolveModelInternal(fixtureDir, 'grd-executor');
    expect(model).toBe('sonnet');
  });

  test('returns sonnet for unknown agent type', () => {
    const model = resolveModelInternal(fixtureDir, 'unknown-agent');
    expect(model).toBe('sonnet');
  });
});

describe('resolveModelForAgent', () => {
  test('resolves quality profile correctly', () => {
    const config = { model_profile: 'quality' };
    expect(resolveModelForAgent(config, 'grd-executor')).toBe('opus');
    expect(resolveModelForAgent(config, 'grd-planner')).toBe('opus');
  });

  test('resolves balanced profile correctly', () => {
    const config = { model_profile: 'balanced' };
    expect(resolveModelForAgent(config, 'grd-executor')).toBe('sonnet');
    expect(resolveModelForAgent(config, 'grd-planner')).toBe('opus');
  });

  test('resolves budget profile correctly', () => {
    const config = { model_profile: 'budget' };
    expect(resolveModelForAgent(config, 'grd-executor')).toBe('sonnet');
    expect(resolveModelForAgent(config, 'grd-verifier')).toBe('haiku');
  });

  test('returns sonnet for unknown agent', () => {
    const config = { model_profile: 'quality' };
    expect(resolveModelForAgent(config, 'unknown')).toBe('sonnet');
  });
});

// ─── loadConfig ─────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns parsed config from fixture', () => {
    const config = loadConfig(fixtureDir);
    expect(config.model_profile).toBe('balanced');
    expect(config.commit_docs).toBe(true);
    expect(config.parallelization).toBe(true);
  });

  test('returns defaults when config missing', () => {
    const config = loadConfig('/tmp/nonexistent-dir-12345');
    expect(config.model_profile).toBe('balanced');
    expect(config.commit_docs).toBe(true);
    expect(config.branching_strategy).toBe('none');
  });

  test('reads nested code_review config', () => {
    const config = loadConfig(fixtureDir);
    expect(config.code_review_enabled).toBe(true);
    expect(config.code_review_timing).toBe('per_wave');
    expect(config.code_review_severity_gate).toBe('blocker');
  });

  test('reads autonomous_mode from config', () => {
    const config = loadConfig(fixtureDir);
    expect(config.autonomous_mode).toBe(false);
  });

  test('defaults autonomous_mode to false when missing', () => {
    const config = loadConfig('/tmp/nonexistent-dir-12345');
    expect(config.autonomous_mode).toBe(false);
  });

  test('warns to stderr about unrecognized top-level config keys', () => {
    const fs = require('fs');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-config-schema-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced', reseach_gates: true })
      );
      const { captureError } = require('../helpers/setup');
      const { stderr } = captureError(() => loadConfig(tmpDir));
      expect(stderr).toContain('reseach_gates');
      expect(stderr).toContain('Unrecognized');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('does not warn for recognized nested section keys', () => {
    const fs = require('fs');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-config-known-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced', git: { base_branch: 'main' }, tracker: { provider: 'none' } })
      );
      const { captureError } = require('../helpers/setup');
      const { stderr } = captureError(() => loadConfig(tmpDir));
      expect(stderr).toBe('');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('warns to stderr for invalid model_profile value', () => {
    const fs = require('fs');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-config-validate-'));
    try {
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'superduper' })
      );
      const { stderr } = captureError(() => loadConfig(tmpDir));
      expect(stderr).toContain('model_profile');
      expect(stderr).toContain('superduper');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── output / error functions ───────────────────────────────────────────────

describe('output', () => {
  test('writes JSON to stdout and exits 0', () => {
    const { stdout, exitCode } = captureOutput(() => {
      output({ key: 'val' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({ key: 'val' });
  });

  test('writes raw value when raw=true', () => {
    const { stdout, exitCode } = captureOutput(() => {
      output({ key: 'val' }, true, 'rawval');
    });
    expect(exitCode).toBe(0);
    expect(stdout).toBe('rawval');
  });

  test('writes JSON when raw=true but rawValue is undefined', () => {
    const { stdout, exitCode } = captureOutput(() => {
      output({ a: 1 }, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({ a: 1 });
  });
});

describe('error', () => {
  test('writes error message to stderr and exits 1', () => {
    const { stderr, exitCode } = captureError(() => {
      error('something went wrong');
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Error: something went wrong');
  });
});

describe('debugLog', () => {
  const origEnv = process.env.GRD_DEBUG;

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.GRD_DEBUG;
    } else {
      process.env.GRD_DEBUG = origEnv;
    }
  });

  test('is a no-op when GRD_DEBUG is not set', () => {
    delete process.env.GRD_DEBUG;
    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (...args: unknown[]) => boolean }).write = (...args: unknown[]) => { writes.push(args[0] as string); return true; };
    debugLog('test message');
    process.stderr.write = origWrite;
    expect(writes).toHaveLength(0);
  });

  test('writes to stderr when GRD_DEBUG=1', () => {
    process.env.GRD_DEBUG = '1';
    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (...args: unknown[]) => boolean }).write = (...args: unknown[]) => { writes.push(args[0] as string); return true; };
    debugLog('hello world');
    process.stderr.write = origWrite;
    expect(writes.some((w) => w.includes('[grd:debug]') && w.includes('hello world'))).toBe(true);
  });

  test('includes JSON-serialized data when provided', () => {
    process.env.GRD_DEBUG = '1';
    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (...args: unknown[]) => boolean }).write = (...args: unknown[]) => { writes.push(args[0] as string); return true; };
    debugLog('msg', { key: 'val' });
    process.stderr.write = origWrite;
    expect(writes.some((w) => w.includes('"key"') && w.includes('"val"'))).toBe(true);
  });
});

// ─── findPhaseInternal consistency_warning ──────────────────────────────────

describe('findPhaseInternal consistency_warning', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns null consistency_warning when phase is in ROADMAP', () => {
    const result = findPhaseInternal(fixtureDir, '1');
    expect(result).not.toBeNull();
    expect(result.consistency_warning).toBeNull();
  });

  test('returns consistency_warning when phase is not in ROADMAP', () => {
    // Create a phase directory not in ROADMAP
    const fs = require('fs');
    fs.mkdirSync(
      require('path').join(
        fixtureDir,
        '.planning',
        'milestones',
        'anonymous',
        'phases',
        '99-orphan'
      ),
      {
        recursive: true,
      }
    );

    const result = findPhaseInternal(fixtureDir, '99');
    expect(result).not.toBeNull();
    expect(result.consistency_warning).toBeTruthy();
    expect(result.consistency_warning).toContain('not in ROADMAP.md');
  });
});

// ─── Backend-aware model resolution (integration with lib/backend.js) ────

const fs = require('fs');
const os = require('os');

describe('Backend-aware model resolution', () => {
  describe('resolveModelInternal with backend', () => {
    let tmpDir: string;
    const savedEnv: Record<string, string | undefined> = {};
    // Track all CLAUDE_CODE_* env vars dynamically to avoid false detection
    const claudeCodeVars = Object.keys(process.env).filter((k) => k.startsWith('CLAUDE_CODE_'));
    const envVarsToClean = [
      ...claudeCodeVars,
      'CODEX_HOME',
      'CODEX_THREAD_ID',
      'GEMINI_CLI_HOME',
      'OPENCODE',
    ];

    beforeEach(() => {
      // Save env vars
      for (const key of envVarsToClean) {
        savedEnv[key] = process.env[key];
      }
      // Clear env vars to ensure clean detection
      for (const key of envVarsToClean) {
        delete process.env[key];
      }
      // Create temp dir with .planning/config.json
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-backend-utils-'));
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    });

    afterEach(() => {
      // Restore env vars
      for (const key of envVarsToClean) {
        if (savedEnv[key] !== undefined) {
          process.env[key] = savedEnv[key];
        } else {
          delete process.env[key];
        }
      }
      // Cleanup
      clearModelCache();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns sonnet for grd-executor on claude backend with balanced profile (existing behavior preserved)', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      const model = resolveModelInternal(tmpDir, 'grd-executor');
      expect(model).toBe('sonnet');
    });

    test('returns gpt-5.3-codex-spark for grd-executor on codex backend (CODEX_HOME set)', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      process.env.CODEX_HOME = '/tmp/codex';
      const model = resolveModelInternal(tmpDir, 'grd-executor');
      expect(model).toBe('gpt-5.3-codex-spark');
    });

    test('returns gemini-3-flash for grd-executor on gemini backend (GEMINI_CLI_HOME set)', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      process.env.GEMINI_CLI_HOME = '/tmp/gemini';
      const model = resolveModelInternal(tmpDir, 'grd-executor');
      expect(model).toBe('gemini-3-flash');
    });

    test('returns sonnet-tier model for grd-executor on opencode backend (OPENCODE set)', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      process.env.OPENCODE = '1';
      const model = resolveModelInternal(tmpDir, 'grd-executor');
      // Model may be detected or default; either way should contain sonnet
      expect(model).toMatch(/sonnet/i);
    });

    test('returns opus for grd-planner on claude backend with quality profile', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'quality' })
      );
      const model = resolveModelInternal(tmpDir, 'grd-planner');
      expect(model).toBe('opus');
    });

    test('returns gpt-5.4 for grd-planner on codex backend with quality profile', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'quality' })
      );
      process.env.CODEX_HOME = '/tmp/codex';
      const model = resolveModelInternal(tmpDir, 'grd-planner');
      expect(model).toBe('gpt-5.4');
    });

    test('honors backend_models override in config.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({
          model_profile: 'balanced',
          backend: 'codex',
          backend_models: {
            codex: { sonnet: 'custom-codex-model' },
          },
        })
      );
      const model = resolveModelInternal(tmpDir, 'grd-executor');
      expect(model).toBe('custom-codex-model');
    });

    test('returns backend-specific model for unknown agent type (defaults to sonnet tier)', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      process.env.CODEX_HOME = '/tmp/codex';
      const model = resolveModelInternal(tmpDir, 'nonexistent-agent');
      expect(model).toBe('gpt-5.3-codex-spark');
    });
  });

  describe('resolveModelForAgent with cwd', () => {
    let tmpDir: string;
    const savedEnv: Record<string, string | undefined> = {};
    // Track all CLAUDE_CODE_* env vars dynamically to avoid false detection
    const claudeCodeVars = Object.keys(process.env).filter((k) => k.startsWith('CLAUDE_CODE_'));
    const envVarsToClean = [
      ...claudeCodeVars,
      'CODEX_HOME',
      'CODEX_THREAD_ID',
      'GEMINI_CLI_HOME',
      'OPENCODE',
    ];

    beforeEach(() => {
      for (const key of envVarsToClean) {
        savedEnv[key] = process.env[key];
      }
      for (const key of envVarsToClean) {
        delete process.env[key];
      }
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-backend-agent-'));
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    });

    afterEach(() => {
      for (const key of envVarsToClean) {
        if (savedEnv[key] !== undefined) {
          process.env[key] = savedEnv[key];
        } else {
          delete process.env[key];
        }
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns tier name when cwd is not provided (backward compatible)', () => {
      const config = { model_profile: 'quality' };
      expect(resolveModelForAgent(config, 'grd-executor')).toBe('opus');
    });

    test('returns backend-specific name when cwd is provided', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      process.env.CODEX_HOME = '/tmp/codex';
      const config = { model_profile: 'balanced' };
      const model = resolveModelForAgent(config, 'grd-executor', tmpDir);
      expect(model).toBe('gpt-5.3-codex-spark');
    });

    test('honors backend_models config override when cwd provided', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({
          model_profile: 'balanced',
          backend: 'gemini',
          backend_models: {
            gemini: { sonnet: 'custom-gemini-flash' },
          },
        })
      );
      const config = {
        model_profile: 'balanced',
        backend_models: { gemini: { sonnet: 'custom-gemini-flash' } },
      };
      const model = resolveModelForAgent(config, 'grd-executor', tmpDir);
      expect(model).toBe('custom-gemini-flash');
    });

    test('returns sonnet tier for unknown agent without cwd', () => {
      const config = { model_profile: 'quality' };
      expect(resolveModelForAgent(config, 'nonexistent-agent')).toBe('sonnet');
    });
  });

  describe('loadConfig backend fields', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-backend-config-'));
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns undefined for backend when not in config', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      const config = loadConfig(tmpDir);
      expect(config.backend).toBeUndefined();
    });

    test('returns undefined for backend_models when not in config', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      const config = loadConfig(tmpDir);
      expect(config.backend_models).toBeUndefined();
    });

    test('returns backend value when present in config.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced', backend: 'codex' })
      );
      const config = loadConfig(tmpDir);
      expect(config.backend).toBe('codex');
    });

    test('returns backend_models when present in config.json', () => {
      const backendModels = { codex: { sonnet: 'custom-model' } };
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({ model_profile: 'balanced', backend_models: backendModels })
      );
      const config = loadConfig(tmpDir);
      expect(config.backend_models).toEqual(backendModels);
    });

    test('backward compatible: all existing config fields still returned correctly', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning', 'config.json'),
        JSON.stringify({
          model_profile: 'quality',
          commit_docs: false,
          backend: 'gemini',
          backend_models: { gemini: { opus: 'gemini-custom' } },
        })
      );
      const config = loadConfig(tmpDir);
      // Existing fields
      expect(config.model_profile).toBe('quality');
      expect(config.commit_docs).toBe(false);
      // New backend fields
      expect(config.backend).toBe('gemini');
      expect(config.backend_models).toEqual({ gemini: { opus: 'gemini-custom' } });
    });

    test('returns undefined for backend and backend_models when config missing', () => {
      const config = loadConfig('/tmp/nonexistent-dir-99999');
      expect(config.backend).toBeUndefined();
      expect(config.backend_models).toBeUndefined();
    });
  });
});

// ─── stripShippedSections ────────────────────────────────────────────────────

describe('stripShippedSections', () => {
  test('passes through content with no <details> blocks', () => {
    const content = '### Phase 1: Test\n**Goal:** Build things\n';
    expect(stripShippedSections(content)).toBe(content);
  });

  test('strips a single <details> block', () => {
    const content = '<details>\nold shipped milestone\n</details>\n### Phase 29: Active';
    expect(stripShippedSections(content)).toBe('\n### Phase 29: Active');
  });

  test('strips multiple <details> blocks', () => {
    const content =
      '<details>\nmilestone v0.0\n</details>\n<details>\nmilestone v0.1\n</details>\n### Phase 29: Active';
    expect(stripShippedSections(content)).toBe('\n\n### Phase 29: Active');
  });

  test('handles null input', () => {
    expect(stripShippedSections(null)).toBeNull();
  });

  test('handles empty string', () => {
    expect(stripShippedSections('')).toBe('');
  });

  test('handles undefined input', () => {
    expect(stripShippedSections(undefined)).toBeUndefined();
  });

  test('is case-insensitive for tags', () => {
    const content = '<DETAILS>\nold\n</DETAILS>\nactive';
    expect(stripShippedSections(content)).toBe('\nactive');
  });
});

// ─── getMilestoneInfo ────────────────────────────────────────────────────────

describe('getMilestoneInfo', () => {
  const fs = require('fs');
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns correct milestone from standard fixture', () => {
    const info = getMilestoneInfo(tmpDir);
    expect(info.version).toBe('v1.0');
  });

  test('finds in-progress milestone, not shipped one', () => {
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(
      roadmapPath,
      [
        '# Roadmap',
        '',
        '<details>',
        '<summary>v0.0.5 — Shipped</summary>',
        '',
        '## M0 v0.0.5: Foundation',
        '### Phase 1: Old stuff',
        '',
        '</details>',
        '',
        '- v0.0.5 Foundation (shipped 2026-01-01)',
        '- v0.2.0 Next Gen (in progress)',
        '',
        '## M1 v0.2.0: Next Gen',
        '**Start:** 2026-02-01',
        '',
        '### Phase 29: New work',
        '**Goal:** Build new things',
      ].join('\n'),
      'utf-8'
    );
    const info = getMilestoneInfo(tmpDir);
    expect(info.version).toBe('v0.2.0');
    expect(info.name).toBe('Next Gen');
  });

  test('handles 3-part version numbers', () => {
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(
      roadmapPath,
      ['# Roadmap', '', '## M1 v1.2.3: Some Milestone', '### Phase 1: Work'].join('\n'),
      'utf-8'
    );
    const info = getMilestoneInfo(tmpDir);
    expect(info.version).toBe('v1.2.3');
  });

  test('returns defaults when ROADMAP.md missing', () => {
    fs.unlinkSync(path.join(tmpDir, '.planning', 'ROADMAP.md'));
    const info = getMilestoneInfo(tmpDir);
    expect(info.version).toBe('v1.0');
    expect(info.name).toBe('milestone');
  });

  test('falls back to last non-shipped bullet when no in-progress marker', () => {
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(
      roadmapPath,
      [
        '# Roadmap',
        '',
        '- v0.0.5 Foundation (shipped 2026-01-01)',
        '- v0.2.0 Active Work',
        '',
        '## M1 v0.2.0: Active Work',
        '### Phase 29: Something',
      ].join('\n'),
      'utf-8'
    );
    const info = getMilestoneInfo(tmpDir);
    expect(info.version).toBe('v0.2.0');
    expect(info.name).toBe('Active Work');
  });
});

// ─── safeReadJSON ─────────────────────────────────────────────────────────────

describe('safeReadJSON', () => {
  const fs = require('fs');
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns parsed object for valid JSON file', () => {
    const filePath = path.join(tmpDir, 'test.json');
    fs.writeFileSync(filePath, '{"key":"value","num":42}', 'utf-8');
    const result = safeReadJSON(filePath);
    expect(result).toEqual({ key: 'value', num: 42 });
  });

  test('returns null for non-existent file', () => {
    const result = safeReadJSON(path.join(tmpDir, 'missing.json'));
    expect(result).toBeNull();
  });

  test('returns custom default for non-existent file', () => {
    const result = safeReadJSON(path.join(tmpDir, 'missing.json'), {});
    expect(result).toEqual({});
  });

  test('returns null for malformed JSON', () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, '{invalid json', 'utf-8');
    const result = safeReadJSON(filePath);
    expect(result).toBeNull();
  });
});

// ─── extractMarkdownSection ───────────────────────────────────────────────────

describe('extractMarkdownSection', () => {
  test('extracts ## section content correctly', () => {
    const md = '## Overview\nSome content here.\n\n## Details\nMore details.\n';
    const result = extractMarkdownSection(md, 'Overview');
    expect(result).toContain('Some content here.');
  });

  test('extracts ### section content with level=3', () => {
    const md = '### Setup\nSetup instructions.\n\n### Usage\nUsage guide.\n';
    const result = extractMarkdownSection(md, 'Setup', 3);
    expect(result).toContain('Setup instructions.');
  });

  test('returns null for missing section', () => {
    const md = '## Overview\nSome content.\n';
    const result = extractMarkdownSection(md, 'NonExistent');
    expect(result).toBeNull();
  });

  test('case-insensitive heading match', () => {
    const md = '## OVERVIEW\nContent here.\n\n## Next\nMore.\n';
    const result = extractMarkdownSection(md, 'overview');
    expect(result).toContain('Content here.');
  });

  test('stops at next heading of same level', () => {
    const md = '## First\nFirst content.\n\n## Second\nSecond content.\n';
    const result = extractMarkdownSection(md, 'First');
    expect(result).toContain('First content.');
    expect(result).not.toContain('Second content.');
  });
});

// ─── levenshteinDistance ─────────────────────────────────────────────────────

describe('levenshteinDistance', () => {
  test('identical strings have distance 0', () => {
    expect(levenshteinDistance('progress', 'progress')).toBe(0);
  });

  test('single character insertion has distance 1', () => {
    expect(levenshteinDistance('progres', 'progress')).toBe(1);
  });

  test('single character deletion has distance 1', () => {
    expect(levenshteinDistance('progress', 'progres')).toBe(1);
  });

  test('single character substitution has distance 1', () => {
    expect(levenshteinDistance('phasee', 'phase')).toBe(1);
  });

  test('empty string vs non-empty returns string length', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });

  test('both empty strings have distance 0', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  test('completely different strings of same length', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });
});

// ─── findClosestCommand ───────────────────────────────────────────────────────

describe('findClosestCommand', () => {
  const commands = ['state', 'progress', 'phase', 'milestone', 'roadmap', 'scaffold', 'validate'];

  test('returns closest command for one-char typo', () => {
    expect(findClosestCommand('progres', commands)).toBe('progress');
  });

  test('returns closest command for transposition typo', () => {
    expect(findClosestCommand('phasee', commands)).toBe('phase');
  });

  test('returns null when input is too different from all commands', () => {
    expect(findClosestCommand('zzzzzzz', commands)).toBeNull();
  });

  test('returns null for empty commands list', () => {
    expect(findClosestCommand('progress', [])).toBeNull();
  });

  test('is case-insensitive', () => {
    expect(findClosestCommand('PROGRES', commands)).toBe('progress');
  });

  test('returns null for null input', () => {
    expect(findClosestCommand(null, commands)).toBeNull();
  });
});

// ─── clearPhaseCache ─────────────────────────────────────────────────────────

describe('clearPhaseCache', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('is exported as a function', () => {
    expect(typeof clearPhaseCache).toBe('function');
  });

  test('can be called without throwing', () => {
    expect(() => clearPhaseCache()).not.toThrow();
  });

  test('findPhaseInternal returns consistent results after clearing cache', () => {
    clearPhaseCache();
    const result1 = findPhaseInternal(fixtureDir, '1');
    const result2 = findPhaseInternal(fixtureDir, '1');
    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1.phaseNumber).toBe(result2.phaseNumber);
    expect(result1.directory).toBe(result2.directory);
  });

  test('findPhaseInternal returns same result whether cached or not', () => {
    clearPhaseCache();
    const fresh = findPhaseInternal(fixtureDir, '1');
    // Second call uses cache
    const cached = findPhaseInternal(fixtureDir, '1');
    expect(fresh).toEqual(cached);
  });
});

// ─── createRunCache ──────────────────────────────────────────────────────────

describe('createRunCache', () => {
  test('returns an object with init, reset, and get methods', () => {
    const cache = createRunCache();
    expect(typeof cache.init).toBe('function');
    expect(typeof cache.reset).toBe('function');
    expect(typeof cache.get).toBe('function');
  });

  test('calls reader directly when cache is inactive', () => {
    const cache = createRunCache();
    let calls = 0;
    const reader = (k: string) => { calls++; return `value:${k}`; };
    const result = cache.get('key1', reader);
    expect(result).toBe('value:key1');
    expect(calls).toBe(1);
    // Calling again still goes directly to reader
    cache.get('key1', reader);
    expect(calls).toBe(2);
  });

  test('caches values after init()', () => {
    const cache = createRunCache();
    cache.init();
    let calls = 0;
    const reader = (k: string) => { calls++; return `value:${k}`; };
    cache.get('key1', reader);
    cache.get('key1', reader);
    expect(calls).toBe(1); // reader called only once
  });

  test('reset() deactivates cache and clears values', () => {
    const cache = createRunCache();
    cache.init();
    let calls = 0;
    const reader = (k: string) => { calls++; return `value:${k}`; };
    cache.get('key1', reader);
    expect(calls).toBe(1);
    cache.reset();
    // After reset, falls back to direct reader calls
    cache.get('key1', reader);
    expect(calls).toBe(2);
  });
});

// ─── findPhaseDir ────────────────────────────────────────────────────────────

describe('findPhaseDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-findphasedir-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns matching directory name with dash suffix', () => {
    fs.mkdirSync(path.join(tmpDir, '01-my-phase'));
    const result = findPhaseDir(tmpDir, '01');
    expect(result).toBe('01-my-phase');
  });

  test('returns matching directory name with exact name', () => {
    fs.mkdirSync(path.join(tmpDir, '01'));
    const result = findPhaseDir(tmpDir, '01');
    expect(result).toBe('01');
  });

  test('returns null when no matching directory exists', () => {
    fs.mkdirSync(path.join(tmpDir, '02-other-phase'));
    const result = findPhaseDir(tmpDir, '01');
    expect(result).toBeNull();
  });

  test('returns null when phasesDir does not exist', () => {
    const result = findPhaseDir('/tmp/nonexistent-phases-dir-xyz', '01');
    expect(result).toBeNull();
  });

  test('normalizes phase arg before matching', () => {
    fs.mkdirSync(path.join(tmpDir, '01-feature'));
    // '1' should normalize to '01' and match '01-feature'
    const result = findPhaseDir(tmpDir, '1');
    expect(result).toBe('01-feature');
  });
});

// ─── parsePhaseNumber ────────────────────────────────────────────────────────

describe('parsePhaseNumber', () => {
  test('returns null for falsy input', () => {
    expect(parsePhaseNumber(null)).toBeNull();
    expect(parsePhaseNumber('')).toBeNull();
    expect(parsePhaseNumber(undefined)).toBeNull();
  });

  test('extracts integer phase number from directory name', () => {
    expect(parsePhaseNumber('01-feature-name')).toBe('01');
    expect(parsePhaseNumber('5-something')).toBe('5');
  });

  test('extracts decimal phase number', () => {
    expect(parsePhaseNumber('01.2-sub-phase')).toBe('01.2');
    expect(parsePhaseNumber('3.14-something')).toBe('3.14');
  });

  test('extracts from plain number string', () => {
    expect(parsePhaseNumber('1')).toBe('1');
    expect(parsePhaseNumber('42')).toBe('42');
  });

  test('returns null for non-numeric string', () => {
    expect(parsePhaseNumber('abc-phase')).toBeNull();
  });
});

// ─── walkJsFiles ─────────────────────────────────────────────────────────────

describe('walkJsFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-walkjs-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('returns relative paths to .js files', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'b.js'), '');
    const results = walkJsFiles(tmpDir);
    expect(results).toContain('a.js');
    expect(results).toContain('b.js');
  });

  test('recurses into subdirectories', () => {
    fs.mkdirSync(path.join(tmpDir, 'sub'));
    fs.writeFileSync(path.join(tmpDir, 'sub', 'c.js'), '');
    const results = walkJsFiles(tmpDir);
    expect(results).toContain(path.join('sub', 'c.js'));
  });

  test('skips node_modules, .git, and .planning directories', () => {
    ['node_modules', '.git', '.planning'].forEach((dir) => {
      fs.mkdirSync(path.join(tmpDir, dir));
      fs.writeFileSync(path.join(tmpDir, dir, 'skip.js'), '');
    });
    const results = walkJsFiles(tmpDir);
    expect(results).not.toContain(path.join('node_modules', 'skip.js'));
    expect(results).not.toContain(path.join('.git', 'skip.js'));
    expect(results).not.toContain(path.join('.planning', 'skip.js'));
  });

  test('skips paths matching excludePatterns', () => {
    fs.mkdirSync(path.join(tmpDir, 'excluded'));
    fs.writeFileSync(path.join(tmpDir, 'excluded', 'out.js'), '');
    fs.writeFileSync(path.join(tmpDir, 'keep.js'), '');
    const results = walkJsFiles(tmpDir, ['excluded']);
    expect(results).not.toContain(path.join('excluded', 'out.js'));
    expect(results).toContain('keep.js');
  });

  test('does not include non-.js files', () => {
    fs.writeFileSync(path.join(tmpDir, 'readme.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '');
    fs.writeFileSync(path.join(tmpDir, 'script.js'), '');
    const results = walkJsFiles(tmpDir);
    expect(results).not.toContain('readme.md');
    expect(results).not.toContain('data.json');
    expect(results).toContain('script.js');
  });

  test('returns empty array for non-existent directory', () => {
    const results = walkJsFiles('/tmp/nonexistent-walk-dir-xyz');
    expect(results).toEqual([]);
  });
});
