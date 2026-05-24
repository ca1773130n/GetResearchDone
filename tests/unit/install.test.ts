/**
 * Unit tests for lib/commands/install.ts — register the GRD MCP server into
 * AI coding harnesses (claude/codex/gemini/opencode).
 *
 * Covers: per-harness target resolution (+ env-var home overrides), the JSON
 * and TOML mergers (correct schema, idempotency, non-clobbering), installHarness
 * (write + dry-run), and the cmdInstall CLI (--all, --list, unknown harness,
 * no-arg usage error).
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const os = require('os') as typeof import('os');
const { captureOutput, captureError } = require('../helpers/setup') as {
  captureOutput: (fn: () => void) => { stdout: string; exitCode: number };
  captureError: (fn: () => void) => { stderr: string; exitCode: number };
};

const {
  SUPPORTED_HARNESSES,
  resolveMcpServerPath,
  resolveTarget,
  mergeJsonConfig,
  mergeTomlConfig,
  installHarness,
  cmdInstall,
}: {
  SUPPORTED_HARNESSES: readonly string[];
  resolveMcpServerPath: () => string;
  resolveTarget: (h: string) => { harness: string; configPath: string; format: string };
  mergeJsonConfig: (
    h: string,
    existing: string | null,
    command: string,
    args: string[]
  ) => { action: string; content: string };
  mergeTomlConfig: (
    existing: string | null,
    command: string,
    args: string[]
  ) => { action: string; content: string };
  installHarness: (h: string, opts: { dryRun?: boolean }) => {
    harness: string;
    configPath: string;
    action: string;
    installed: boolean;
  };
  cmdInstall: (
    cwd: string,
    opts: { harnesses?: string[]; all?: boolean; list?: boolean; dryRun?: boolean },
    raw: boolean
  ) => void;
} = require('../../lib/commands/install');

// ─── target resolution ──────────────────────────────────────────────────────

describe('resolveMcpServerPath', () => {
  test('points at this package bin/grd-mcp-server.js (absolute, exists)', () => {
    const p = resolveMcpServerPath();
    expect(path.isAbsolute(p)).toBe(true);
    expect(p.endsWith(path.join('bin', 'grd-mcp-server.js'))).toBe(true);
    expect(fs.existsSync(p)).toBe(true);
  });
});

describe('resolveTarget', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  test('honors per-harness home env vars', () => {
    process.env.CODEX_HOME = '/tmp/cx';
    process.env.GEMINI_CLI_HOME = '/tmp/gm';
    process.env.OPENCODE_CONFIG_DIR = '/tmp/oc';
    process.env.CLAUDE_CONFIG_DIR = '/tmp/cl';
    expect(resolveTarget('codex').configPath).toBe('/tmp/cx/config.toml');
    expect(resolveTarget('codex').format).toBe('toml');
    expect(resolveTarget('gemini').configPath).toBe('/tmp/gm/settings.json');
    expect(resolveTarget('opencode').configPath).toBe('/tmp/oc/opencode.json');
    expect(resolveTarget('claude').configPath).toBe('/tmp/cl/.claude.json');
  });

  test('falls back to standard locations when env unset', () => {
    delete process.env.CODEX_HOME;
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(resolveTarget('codex').configPath).toBe(path.join(os.homedir(), '.codex', 'config.toml'));
    expect(resolveTarget('claude').configPath).toBe(path.join(os.homedir(), '.claude.json'));
  });

  test('SUPPORTED_HARNESSES is the four MCP-capable backends', () => {
    expect([...SUPPORTED_HARNESSES].sort()).toEqual(['claude', 'codex', 'gemini', 'opencode']);
  });
});

// ─── JSON merger ─────────────────────────────────────────────────────────────

describe('mergeJsonConfig', () => {
  const CMD = 'node';
  const ARGS = ['/abs/bin/grd-mcp-server.js'];

  test('claude/gemini use mcpServers.grd = {command,args}', () => {
    const r = mergeJsonConfig('claude', null, CMD, ARGS);
    expect(r.action).toBe('installed');
    const j = JSON.parse(r.content);
    expect(j.mcpServers.grd).toEqual({ command: CMD, args: ARGS });
  });

  test('opencode uses mcp.grd = {type:local, command:[...]}', () => {
    const r = mergeJsonConfig('opencode', null, CMD, ARGS);
    const j = JSON.parse(r.content);
    expect(j.mcp.grd).toEqual({ type: 'local', command: [CMD, ...ARGS], enabled: true });
  });

  test('preserves unrelated keys and existing servers (non-clobbering)', () => {
    const existing = JSON.stringify({ theme: 'dark', mcpServers: { other: { command: 'x' } } });
    const r = mergeJsonConfig('claude', existing, CMD, ARGS);
    const j = JSON.parse(r.content);
    expect(j.theme).toBe('dark');
    expect(j.mcpServers.other).toEqual({ command: 'x' });
    expect(j.mcpServers.grd).toEqual({ command: CMD, args: ARGS });
  });

  test('idempotent: re-merging identical entry → unchanged', () => {
    const first = mergeJsonConfig('claude', null, CMD, ARGS);
    const second = mergeJsonConfig('claude', first.content, CMD, ARGS);
    expect(second.action).toBe('unchanged');
  });

  test('different args → updated', () => {
    const first = mergeJsonConfig('claude', null, CMD, ARGS);
    const second = mergeJsonConfig('claude', first.content, CMD, ['/new/path.js']);
    expect(second.action).toBe('updated');
    expect(JSON.parse(second.content).mcpServers.grd.args).toEqual(['/new/path.js']);
  });
});

// ─── TOML merger ─────────────────────────────────────────────────────────────

describe('mergeTomlConfig', () => {
  const CMD = 'node';
  const ARGS = ['/abs/bin/grd-mcp-server.js'];

  test('writes [mcp_servers.grd] with command + args', () => {
    const r = mergeTomlConfig(null, CMD, ARGS);
    expect(r.action).toBe('installed');
    expect(r.content).toMatch(/\[mcp_servers\.grd\]/);
    expect(r.content).toMatch(/command = "node"/);
    expect(r.content).toMatch(/args = \["\/abs\/bin\/grd-mcp-server\.js"\]/);
  });

  test('preserves existing top-level keys and other tables', () => {
    const existing = 'model = "o1"\n\n[mcp_servers.other]\ncommand = "foo"\n';
    const r = mergeTomlConfig(existing, CMD, ARGS);
    expect(r.content).toMatch(/model = "o1"/);
    expect(r.content).toMatch(/\[mcp_servers\.other\]/);
    expect(r.content).toMatch(/\[mcp_servers\.grd\]/);
  });

  test('idempotent: re-merging identical block → unchanged', () => {
    const first = mergeTomlConfig(null, CMD, ARGS);
    const second = mergeTomlConfig(first.content, CMD, ARGS);
    expect(second.action).toBe('unchanged');
  });

  test('replaces an existing grd block (updated) without duplicating', () => {
    const first = mergeTomlConfig(null, CMD, ARGS);
    const second = mergeTomlConfig(first.content, CMD, ['/new/path.js']);
    expect(second.action).toBe('updated');
    expect((second.content.match(/\[mcp_servers\.grd\]/g) || []).length).toBe(1);
    expect(second.content).toMatch(/\/new\/path\.js/);
  });
});

// ─── installHarness (filesystem) ────────────────────────────────────────────

describe('installHarness', () => {
  let home: string;
  const saved = { ...process.env };
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-install-'));
    process.env.CODEX_HOME = path.join(home, '.codex');
    process.env.CLAUDE_CONFIG_DIR = home;
  });
  afterEach(() => {
    process.env = { ...saved };
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('writes the config file and reports installed', () => {
    const out = installHarness('claude', {});
    expect(out.action).toBe('installed');
    expect(out.installed).toBe(true);
    const j = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf-8'));
    expect(j.mcpServers.grd.command).toBe('node');
  });

  test('creates missing parent dirs (codex)', () => {
    const out = installHarness('codex', {});
    expect(out.installed).toBe(true);
    expect(fs.existsSync(path.join(home, '.codex', 'config.toml'))).toBe(true);
  });

  test('second install is unchanged (idempotent on disk)', () => {
    installHarness('claude', {});
    const out = installHarness('claude', {});
    expect(out.action).toBe('unchanged');
    expect(out.installed).toBe(false);
  });

  test('dry-run writes nothing and reports would-install', () => {
    const out = installHarness('claude', { dryRun: true });
    expect(out.action).toBe('would-install');
    expect(out.installed).toBe(false);
    expect(fs.existsSync(path.join(home, '.claude.json'))).toBe(false);
  });
});

// ─── cmdInstall CLI ──────────────────────────────────────────────────────────

describe('cmdInstall', () => {
  let home: string;
  const saved = { ...process.env };
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-install-cli-'));
    process.env.CLAUDE_CONFIG_DIR = home;
    process.env.CODEX_HOME = path.join(home, '.codex');
    process.env.GEMINI_CLI_HOME = path.join(home, '.gemini');
    process.env.OPENCODE_CONFIG_DIR = path.join(home, '.config', 'opencode');
  });
  afterEach(() => {
    process.env = { ...saved };
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('--all installs into all four harnesses', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInstall(process.cwd(), { all: true }, false));
    expect(exitCode).toBe(0);
    const r = JSON.parse(stdout);
    expect(r.outcomes.map((o: { harness: string }) => o.harness).sort()).toEqual([
      'claude',
      'codex',
      'gemini',
      'opencode',
    ]);
    expect(r.outcomes.every((o: { installed: boolean }) => o.installed)).toBe(true);
  });

  test('single harness by name', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInstall(process.cwd(), { harnesses: ['codex'] }, false)
    );
    expect(exitCode).toBe(0);
    const r = JSON.parse(stdout);
    expect(r.outcomes.length).toBe(1);
    expect(r.outcomes[0].harness).toBe('codex');
  });

  test('unknown harness errors (exit 1)', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdInstall(process.cwd(), { harnesses: ['vscode'] }, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/unknown harness/);
  });

  test('no harness + no --all/--list errors with usage', () => {
    const { stderr, exitCode } = captureError(() => cmdInstall(process.cwd(), {}, false));
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/specify a harness/);
  });

  test('--list reports install status without writing', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInstall(process.cwd(), { list: true }, false));
    expect(exitCode).toBe(0);
    const r = JSON.parse(stdout);
    expect(r.harnesses.length).toBe(4);
    expect(r.harnesses.every((h: { grd_installed: boolean }) => h.grd_installed === false)).toBe(true);
    // nothing written
    expect(fs.existsSync(path.join(home, '.claude.json'))).toBe(false);
  });
});
