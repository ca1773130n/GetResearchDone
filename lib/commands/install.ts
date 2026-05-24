'use strict';

/**
 * GRD Commands/Install — register the GRD MCP server into AI coding harnesses.
 *
 * GRD's universal integration point is the `grd-mcp-server` bin (an MCP
 * server). Every harness GRD targets advertises MCP support
 * (BACKEND_CAPABILITIES.mcp === true for claude/codex/gemini/opencode), so
 * `gd install <harness>` writes a server entry into that harness's MCP config,
 * pointing at this package's grd-mcp-server. The entry is idempotent — a
 * second install updates rather than duplicates.
 *
 * Each harness uses a different config file + schema:
 *   claude   ~/.claude.json            JSON  mcpServers.grd   = {command,args}
 *   codex    $CODEX_HOME/config.toml   TOML  [mcp_servers.grd] command/args
 *   gemini   $GEMINI_CLI_HOME/settings.json JSON mcpServers.grd = {command,args}
 *   opencode $OPENCODE_CONFIG_DIR/opencode.json JSON mcp.grd = {type,command}
 *
 * Home dirs honor the same env vars as account rotation (CODEX_HOME,
 * GEMINI_CLI_HOME, OPENCODE_CONFIG_DIR), falling back to the standard
 * locations. The server is invoked as `node <abs path to bin/grd-mcp-server.js>`
 * so it works for both local checkouts and global npm installs.
 *
 * Flags: `--all` (every supported harness), `--list` (show harnesses + config
 * paths + install status), `--dry-run` (preview, write nothing).
 *
 * No network, no LLM. Atomic writes.
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const os = require('os') as typeof import('os');

const {
  output,
  error,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');

const {
  atomicWriteFileSync,
}: { atomicWriteFileSync: (filePath: string, data: string) => void } = require('../autopilot-waves');

// ─── Types ─────────────────────────────────────────────────────────────────

export type HarnessId = 'claude' | 'codex' | 'gemini' | 'opencode';

export const SUPPORTED_HARNESSES: readonly HarnessId[] = ['claude', 'codex', 'gemini', 'opencode'];

/** The MCP server name GRD registers under, in every harness. */
const SERVER_NAME = 'grd';

export interface HarnessTarget {
  harness: HarnessId;
  /** Absolute path to the harness's MCP config file. */
  configPath: string;
  /** 'json' | 'toml' — drives the writer. */
  format: 'json' | 'toml';
}

export interface InstallOutcome {
  harness: HarnessId;
  configPath: string;
  action: 'installed' | 'updated' | 'unchanged' | 'would-install' | 'would-update';
  installed: boolean;
}

export interface InstallResult {
  server_command: string;
  server_args: string[];
  outcomes: InstallOutcome[];
}

// ─── Server invocation ──────────────────────────────────────────────────────

/**
 * Absolute path to this package's grd-mcp-server bin. Resolves from this
 * module (lib/commands/install.ts) up to the package root, so it is correct
 * whether GRD runs from a local checkout or a global npm install.
 */
export function resolveMcpServerPath(): string {
  // lib/commands/ -> package root is two levels up.
  return path.resolve(__dirname, '..', '..', 'bin', 'grd-mcp-server.js');
}

function serverCommand(): { command: string; args: string[] } {
  return { command: 'node', args: [resolveMcpServerPath()] };
}

// ─── Home-dir resolution (honors account-rotation env vars) ─────────────────

function harnessHome(harness: HarnessId): string {
  const home = os.homedir();
  switch (harness) {
    case 'codex':
      return process.env.CODEX_HOME || path.join(home, '.codex');
    case 'gemini':
      return process.env.GEMINI_CLI_HOME || path.join(home, '.gemini');
    case 'opencode':
      return process.env.OPENCODE_CONFIG_DIR || path.join(home, '.config', 'opencode');
    case 'claude':
    default:
      return process.env.CLAUDE_CONFIG_DIR || home;
  }
}

export function resolveTarget(harness: HarnessId): HarnessTarget {
  const dir = harnessHome(harness);
  switch (harness) {
    case 'claude':
      return { harness, configPath: path.join(dir, '.claude.json'), format: 'json' };
    case 'codex':
      return { harness, configPath: path.join(dir, 'config.toml'), format: 'toml' };
    case 'gemini':
      return { harness, configPath: path.join(dir, 'settings.json'), format: 'json' };
    case 'opencode':
      return { harness, configPath: path.join(dir, 'opencode.json'), format: 'json' };
  }
}

// ─── JSON harness writer (claude / gemini / opencode) ───────────────────────

interface JsonMutation {
  action: 'installed' | 'updated' | 'unchanged';
  content: string;
}

/**
 * Merge the GRD server entry into a JSON harness config. Pure: takes the
 * existing file text (or null) and returns the new text + the action. Uses
 * the harness's native key (`mcpServers` for claude/gemini, `mcp` for
 * opencode) and entry shape.
 */
export function mergeJsonConfig(
  harness: HarnessId,
  existingText: string | null,
  command: string,
  args: string[]
): JsonMutation {
  const root: Record<string, unknown> =
    existingText && existingText.trim() ? (JSON.parse(existingText) as Record<string, unknown>) : {};

  const key = harness === 'opencode' ? 'mcp' : 'mcpServers';
  const entry =
    harness === 'opencode'
      ? { type: 'local', command: [command, ...args], enabled: true }
      : { command, args };

  const container: Record<string, unknown> =
    typeof root[key] === 'object' && root[key] !== null
      ? (root[key] as Record<string, unknown>)
      : {};

  const prev = container[SERVER_NAME];
  const action: JsonMutation['action'] =
    prev === undefined
      ? 'installed'
      : JSON.stringify(prev) === JSON.stringify(entry)
        ? 'unchanged'
        : 'updated';

  container[SERVER_NAME] = entry;
  root[key] = container;
  return { action, content: JSON.stringify(root, null, 2) + '\n' };
}

// ─── TOML harness writer (codex) ────────────────────────────────────────────

/**
 * Insert/replace the `[mcp_servers.grd]` table in a codex config.toml. TOML is
 * edited textually (no TOML lib dependency): the existing grd table block is
 * stripped and a fresh one appended. Other content is preserved verbatim.
 */
export function mergeTomlConfig(
  existingText: string | null,
  command: string,
  args: string[]
): JsonMutation {
  const argList = args.map((a) => JSON.stringify(a)).join(', ');
  const block = `[mcp_servers.${SERVER_NAME}]\ncommand = ${JSON.stringify(command)}\nargs = [${argList}]\n`;

  const base = existingText ?? '';
  // Match an existing [mcp_servers.grd] table: from its header to the next
  // top-level header ("[" at line start) or EOF.
  const tableRe = new RegExp(
    `(^|\\n)\\[mcp_servers\\.${SERVER_NAME}\\][\\s\\S]*?(?=\\n\\[|$)`,
    ''
  );
  const had = tableRe.test(base);
  if (had) {
    const replaced = base.replace(tableRe, (m, lead) => `${lead}${block.trimEnd()}`);
    const action = replaced.trim() === base.trim() ? 'unchanged' : 'updated';
    return { action, content: replaced.endsWith('\n') ? replaced : replaced + '\n' };
  }
  const sep = base.trim() ? (base.endsWith('\n') ? '\n' : '\n\n') : '';
  return { action: 'installed', content: `${base}${sep}${block}` };
}

// ─── Install one harness ────────────────────────────────────────────────────

export function installHarness(harness: HarnessId, opts: { dryRun?: boolean }): InstallOutcome {
  const target = resolveTarget(harness);
  const { command, args } = serverCommand();

  const existing: string | null = ((): string | null => {
    try {
      return fs.readFileSync(target.configPath, 'utf-8');
    } catch {
      return null;
    }
  })();

  let mutation: JsonMutation;
  if (target.format === 'toml') {
    mutation = mergeTomlConfig(existing, command, args);
  } else {
    mutation = mergeJsonConfig(harness, existing, command, args);
  }

  if (opts.dryRun) {
    const dryAction: InstallOutcome['action'] =
      mutation.action === 'installed'
        ? 'would-install'
        : mutation.action === 'updated'
          ? 'would-update'
          : 'unchanged';
    return { harness, configPath: target.configPath, action: dryAction, installed: false };
  }

  if (mutation.action !== 'unchanged') {
    fs.mkdirSync(path.dirname(target.configPath), { recursive: true });
    atomicWriteFileSync(target.configPath, mutation.content);
  }
  return {
    harness,
    configPath: target.configPath,
    action: mutation.action,
    installed: mutation.action !== 'unchanged',
  };
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

export interface InstallOptions {
  harnesses?: HarnessId[];
  all?: boolean;
  list?: boolean;
  dryRun?: boolean;
}

export function cmdInstall(cwd: string, opts: InstallOptions, raw: boolean): void {
  const { command, args } = serverCommand();

  if (opts.list) {
    const rows = SUPPORTED_HARNESSES.map((h) => {
      const t = resolveTarget(h);
      const present = ((): boolean => {
        try {
          return fs.readFileSync(t.configPath, 'utf-8').includes(SERVER_NAME);
        } catch {
          return false;
        }
      })();
      return { harness: h, configPath: t.configPath, format: t.format, grd_installed: present };
    });
    output({ server_command: command, server_args: args, harnesses: rows }, raw,
      rows.map((r) => `${r.harness}\t${r.grd_installed ? 'installed' : '-'}\t${r.configPath}`).join('\n'));
  }

  const targets: HarnessId[] = ((): HarnessId[] => {
    if (opts.all) return [...SUPPORTED_HARNESSES];
    if (opts.harnesses && opts.harnesses.length > 0) {
      const bad = opts.harnesses.filter((h) => !SUPPORTED_HARNESSES.includes(h));
      if (bad.length > 0) {
        error(
          `unknown harness(es): ${bad.join(', ')}. Supported: ${SUPPORTED_HARNESSES.join(', ')}`
        );
      }
      return opts.harnesses;
    }
    error(
      `specify a harness, --all, or --list. Supported: ${SUPPORTED_HARNESSES.join(', ')}. ` +
        `Usage: gd install <harness...> | --all [--dry-run] | --list`
    );
    throw new Error('unreachable'); // error() exits; satisfies definite-return
  })();

  const outcomes = targets.map((h) => installHarness(h, { dryRun: opts.dryRun }));
  const result: InstallResult = { server_command: command, server_args: args, outcomes };
  output(
    result,
    raw,
    outcomes.map((o) => `${o.harness}\t${o.action}\t${o.configPath}`).join('\n')
  );
}

module.exports = {
  SUPPORTED_HARNESSES,
  resolveMcpServerPath,
  resolveTarget,
  mergeJsonConfig,
  mergeTomlConfig,
  installHarness,
  cmdInstall,
};
