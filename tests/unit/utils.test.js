/**
 * Unit tests for lib/utils.js
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
  parseIncludeFlag,
  normalizePhaseName,
  resolveModelInternal,
  resolveModelForAgent,
  loadConfig,
  output,
  error,
} = require('../../lib/utils');

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
  let fixtureDir;

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
  let fixtureDir;

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
  let fixtureDir;

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
