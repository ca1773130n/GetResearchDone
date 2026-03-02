/**
 * Unit tests for CLI argument validation functions (lib/utils.ts)
 *
 * Tests validatePhaseArg, validateFileArg, validateSubcommand, validateRequiredArg.
 * Existing validatePhaseName, validateFilePath, validateGitRef tests are in utils.test.js.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  validatePhaseArg,
  validateFileArg,
  validateSubcommand,
  validateRequiredArg,
} = require('../../lib/utils');

// ─── validatePhaseArg ──────────────────────────────────────────────────────

describe('validatePhaseArg', () => {
  describe('valid inputs', () => {
    test.each(['1', '01', '02', '10', '99'])('accepts simple number "%s"', (val) => {
      expect(validatePhaseArg(val)).toBe(val);
    });

    test.each(['02.1', '1.1', '10.3'])('accepts decimal phase "%s"', (val) => {
      expect(validatePhaseArg(val)).toBe(val);
    });

    test.each(['01-security-foundation', '03-modularize', '07-validation-release'])(
      'accepts phase with kebab suffix "%s"',
      (val) => {
        expect(validatePhaseArg(val)).toBe(val);
      }
    );
  });

  describe('missing inputs', () => {
    test('null throws "Phase number is required"', () => {
      expect(() => validatePhaseArg(null)).toThrow('Phase number is required');
    });

    test('undefined throws "Phase number is required"', () => {
      expect(() => validatePhaseArg(undefined)).toThrow('Phase number is required');
    });

    test('empty string throws "Phase number is required"', () => {
      expect(() => validatePhaseArg('')).toThrow('Phase number is required');
    });
  });

  describe('invalid formats', () => {
    test('alphabetic only is rejected', () => {
      expect(() => validatePhaseArg('abc')).toThrow('Invalid phase number');
    });

    test('triple decimal is rejected', () => {
      expect(() => validatePhaseArg('1.2.3')).toThrow('Invalid phase number');
    });

    test('path traversal is rejected', () => {
      expect(() => validatePhaseArg('../etc')).toThrow('Invalid phase number');
    });

    test('negative number is rejected', () => {
      expect(() => validatePhaseArg('-1')).toThrow('Invalid phase number');
    });

    test('path with slash is rejected', () => {
      expect(() => validatePhaseArg('01/02')).toThrow('Invalid phase number');
    });

    test('non-string (number) throws "Phase number is required"', () => {
      expect(() => validatePhaseArg(42)).toThrow('Phase number is required');
    });
  });
});

// ─── validateFileArg ───────────────────────────────────────────────────────

describe('validateFileArg', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-val-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('valid inputs', () => {
    test('accepts "package.json"', () => {
      expect(validateFileArg('package.json', tmpDir)).toBe('package.json');
    });

    test('accepts "lib/utils.js"', () => {
      expect(validateFileArg('lib/utils.js', tmpDir)).toBe('lib/utils.js');
    });

    test('accepts ".planning/STATE.md"', () => {
      expect(validateFileArg('.planning/STATE.md', tmpDir)).toBe('.planning/STATE.md');
    });
  });

  describe('missing inputs', () => {
    test('null throws "File path is required"', () => {
      expect(() => validateFileArg(null, tmpDir)).toThrow('File path is required');
    });

    test('undefined throws "File path is required"', () => {
      expect(() => validateFileArg(undefined, tmpDir)).toThrow('File path is required');
    });

    test('empty string throws "File path is required"', () => {
      expect(() => validateFileArg('', tmpDir)).toThrow('File path is required');
    });
  });

  describe('path traversal', () => {
    test('../../etc/passwd is rejected', () => {
      expect(() => validateFileArg('../../etc/passwd', tmpDir)).toThrow('escape project');
    });

    test('../secret.key is rejected', () => {
      expect(() => validateFileArg('../secret.key', tmpDir)).toThrow('escape project');
    });
  });

  describe('null bytes', () => {
    test('path with null byte is rejected', () => {
      expect(() => validateFileArg('file\0.js', tmpDir)).toThrow('null bytes');
    });
  });
});

// ─── validateSubcommand ────────────────────────────────────────────────────

describe('validateSubcommand', () => {
  const validSubs = ['get', 'set', 'merge'];
  const parentCmd = 'frontmatter';

  describe('valid inputs', () => {
    test('"get" is accepted', () => {
      expect(validateSubcommand('get', validSubs, parentCmd)).toBe('get');
    });

    test('"set" is accepted', () => {
      expect(validateSubcommand('set', validSubs, parentCmd)).toBe('set');
    });

    test('"merge" is accepted', () => {
      expect(validateSubcommand('merge', validSubs, parentCmd)).toBe('merge');
    });
  });

  describe('invalid subcommand', () => {
    test('"invalid" shows available subcommands', () => {
      expect(() => validateSubcommand('invalid', validSubs, parentCmd)).toThrow(
        "Unknown frontmatter subcommand: 'invalid'. Available: get, set, merge"
      );
    });

    test('"delete" shows available subcommands', () => {
      expect(() => validateSubcommand('delete', validSubs, parentCmd)).toThrow(
        "Unknown frontmatter subcommand: 'delete'. Available: get, set, merge"
      );
    });
  });

  describe('missing subcommand', () => {
    test('null shows required message with available list', () => {
      expect(() => validateSubcommand(null, validSubs, parentCmd)).toThrow(
        "Subcommand required for 'frontmatter'. Available: get, set, merge"
      );
    });

    test('undefined shows required message', () => {
      expect(() => validateSubcommand(undefined, validSubs, parentCmd)).toThrow(
        "Subcommand required for 'frontmatter'. Available: get, set, merge"
      );
    });

    test('empty string shows required message', () => {
      expect(() => validateSubcommand('', validSubs, parentCmd)).toThrow(
        "Subcommand required for 'frontmatter'. Available: get, set, merge"
      );
    });
  });

  describe('different parent commands', () => {
    test('state command shows correct parent name', () => {
      expect(() => validateSubcommand('bad', ['load', 'get'], 'state')).toThrow(
        "Unknown state subcommand: 'bad'. Available: load, get"
      );
    });

    test('verify command shows correct parent name', () => {
      expect(() => validateSubcommand(null, ['plan-structure'], 'verify')).toThrow(
        "Subcommand required for 'verify'. Available: plan-structure"
      );
    });
  });
});

// ─── validateRequiredArg ───────────────────────────────────────────────────

describe('validateRequiredArg', () => {
  describe('valid inputs', () => {
    test('"some-value" is accepted', () => {
      expect(validateRequiredArg('some-value', 'test-arg')).toBe('some-value');
    });

    test('"123" is accepted', () => {
      expect(validateRequiredArg('123', 'count')).toBe('123');
    });

    test('whitespace-only string is accepted (not empty)', () => {
      expect(validateRequiredArg(' ', 'name')).toBe(' ');
    });
  });

  describe('missing inputs', () => {
    test('null shows arg name in error', () => {
      expect(() => validateRequiredArg(null, 'phase')).toThrow('phase is required');
    });

    test('undefined shows arg name in error', () => {
      expect(() => validateRequiredArg(undefined, 'file')).toThrow('file is required');
    });

    test('empty string shows arg name in error', () => {
      expect(() => validateRequiredArg('', 'commit-message')).toThrow('commit-message is required');
    });
  });
});

// ─── Integration-level CLI validation tests ────────────────────────────────

describe('CLI validation (integration)', () => {
  const cliPath = path.resolve(__dirname, '..', '..', 'bin', 'grd-tools.js');

  function runCLI(args: string[]) {
    try {
      const stdout = execFileSync('node', [cliPath, ...args], {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
      });
      return { exitCode: 0, stdout, stderr: '' };
    } catch (e: unknown) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return {
        exitCode: err.status ?? 1,
        stdout: (err.stdout ?? '').toString(),
        stderr: (err.stderr ?? '').toString(),
      };
    }
  }

  test('phase-detail with non-numeric arg shows phase validation error', () => {
    const { exitCode, stderr } = runCLI(['phase-detail', 'notanumber']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Invalid phase number');
  });

  test('state with bad subcommand shows available subcommands', () => {
    const { exitCode, stderr } = runCLI(['state', 'badsubcommand']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Unknown state subcommand');
    expect(stderr).toContain('Available:');
    expect(stderr).toContain('load');
    expect(stderr).toContain('get');
  });

  test('frontmatter with no subcommand shows required message', () => {
    const { exitCode, stderr } = runCLI(['frontmatter']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Subcommand required for 'frontmatter'");
    expect(stderr).toContain('Available:');
  });

  test('verify commits with flag-injection arg shows git ref error', () => {
    const { exitCode, stderr } = runCLI(['verify', 'commits', '-inject']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('must not start with a dash');
  });

  test('init with unknown workflow shows available workflows', () => {
    const { exitCode, stderr } = runCLI(['init', 'unknown-workflow']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Unknown init subcommand');
    expect(stderr).toContain('execute-phase');
    expect(stderr).toContain('plan-phase');
  });

  test('phase-plan-index with invalid phase shows error', () => {
    const { exitCode, stderr } = runCLI(['phase-plan-index', 'not-a-phase']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Invalid phase number');
  });
});
