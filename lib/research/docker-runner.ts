'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
import type { ExperimentPlan, ExperimentResult } from './types';
const { parseMetricsLine, classifyRunFailure, createSubprocessRunner } =
  require('./runner') as {
    parseMetricsLine: (s: string) => Record<string, number>;
    classifyRunFailure: (stderr: string, timedOut: boolean) => ExperimentResult['failureClass'];
    createSubprocessRunner: (o?: { timeoutMs?: number }) => import('./runner').Runner;
  };

// Conservative Docker reference: optional host, repo path, optional :tag, optional @sha256 digest.
// Must NOT start with '-' so it can never be parsed as a `docker run` option.
const IMAGE_RE = /^[a-z0-9]([a-z0-9._/-]*[a-z0-9])?(:[\w][\w.-]*)?(@sha256:[a-f0-9]{64})?$/i;
const MEMORY_RE = /^\d+(\.\d+)?\s*([bkmg])?$/i;

function validateImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.startsWith('-')) return null;
  return IMAGE_RE.test(v) ? v : null;
}

function validateMemory(value: unknown): string {
  if (typeof value === 'string' && MEMORY_RE.test(value.trim())) return value.trim();
  return '512m';
}

function validateCpus(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : '1';
}

interface DockerArgParams {
  containerName: string;
  iterDir: string;
  scriptBasename: string;
  bin: string;
  image: string;
  memory: string;
  cpus: string;
  network: string;
  user: string | null;
}

function buildDockerArgs(p: DockerArgParams): string[] {
  return [
    'run', '--rm', '--name', p.containerName,
    '--network', p.network,
    '--memory', p.memory, '--cpus', p.cpus, '--pids-limit', '256',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--ipc', 'none',
    '--read-only', '--tmpfs', '/tmp',
    '--mount', `type=bind,src=${p.iterDir},dst=/work`, '-w', '/work',
    ...(p.user ? ['--user', p.user] : []),
    '--entrypoint', p.bin,
    p.image,
    `/work/${p.scriptBasename}`,
  ];
}

interface SandboxConfig {
  mode: 'subprocess' | 'docker' | 'auto';
  image: string | null;
  memory: string;
  cpus: string;
  network: 'none' | 'bridge';
}

// Resolve the configured research_sandbox value to a sandbox mode.
// - 'docker'            -> always docker (explicit; behavior unchanged)
// - unset / '' / 'auto' -> 'auto': prefer docker when available, else subprocess
// - explicit 'subprocess' (and any unrecognized value) -> subprocess (unchanged)
function resolveSandboxMode(value: unknown): SandboxConfig['mode'] {
  if (value === 'docker') return 'docker';
  if (value === undefined || value === '' || value === 'auto') return 'auto';
  return 'subprocess';
}

function readSandboxConfig(cwd: string): SandboxConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_sandbox?: unknown; research_sandbox_image?: unknown;
      research_sandbox_memory?: unknown; research_sandbox_cpus?: unknown;
      research_sandbox_network?: unknown;
    };
    return {
      mode: resolveSandboxMode(raw.research_sandbox),
      image: validateImage(raw.research_sandbox_image),
      memory: validateMemory(raw.research_sandbox_memory),
      cpus: validateCpus(raw.research_sandbox_cpus),
      network: raw.research_sandbox_network === 'bridge' ? 'bridge' : 'none',
    };
  } catch {
    // ponytail: an unreadable/absent config.json stays subprocess (conservative,
    // no probe) — 'auto' is scoped to the parsed research_sandbox value, not the
    // config-read-failure path. Ceiling: no auto-probe when config is missing.
    return { mode: 'subprocess', image: null, memory: '512m', cpus: '1', network: 'none' };
  }
}

export type DockerExec = (args: string[], opts?: { timeout?: number }) => string;

const defaultExec: DockerExec = (args, opts) =>
  execFileSync('docker', args, { encoding: 'utf8', timeout: opts?.timeout }) as string;

function dockerAvailable(exec: DockerExec, timeoutMs: number): boolean {
  try {
    const out = exec(['version', '--format', '{{.Server.Version}}'], { timeout: timeoutMs });
    return typeof out === 'string' && out.trim().length > 0;
  } catch {
    return false;
  }
}

interface DockerRunnerOpts {
  exec?: DockerExec;
  image?: string;        // validated override (both languages)
  memory?: string;
  cpus?: string;
  network?: 'none' | 'bridge';
  timeoutMs?: number;
  user?: string | null;  // 'uid:gid' on POSIX, else null
}

// Resolve plan.scriptPath against threadDir and require the result to stay inside threadDir.
// Returns the resolved absolute path, or null if it escapes containment.
function resolveContained(threadDir: string, scriptPath: string): string | null {
  const resolved = path.resolve(threadDir, scriptPath);
  let real: string; let realRoot: string;
  try { real = fs.realpathSync(resolved); } catch { real = resolved; }
  try { realRoot = fs.realpathSync(threadDir); } catch { realRoot = path.resolve(threadDir); }
  if (real === realRoot || real.startsWith(realRoot + path.sep)) return real;
  return null;
}

function createDockerRunner(opts: DockerRunnerOpts = {}): import('./runner').Runner {
  const exec = opts.exec || defaultExec;
  const timeoutMs = opts.timeoutMs ?? 120000;
  return {
    run(plan: ExperimentPlan, threadDir: string): ExperimentResult {
      const start = Date.now();
      const resolved = resolveContained(threadDir, plan.scriptPath);
      if (!resolved) {
        return {
          metrics: {}, exitCode: 1, runner: 'docker', durationMs: Date.now() - start,
          stdoutExcerpt: '', failureClass: 'H3',
        };
      }
      const iterDir = path.dirname(resolved);
      const isPy = plan.language === 'python';
      const bin = isPy ? 'python3' : 'bash';
      const image = opts.image || (isPy ? 'python:3.12-slim' : 'bash:5');
      const containerName =
        `grd-exp-${path.basename(threadDir)}-${path.basename(iterDir)}-${start}`;
      const args = buildDockerArgs({
        containerName, iterDir, scriptBasename: path.basename(resolved), bin, image,
        memory: opts.memory ?? '512m', cpus: opts.cpus ?? '1',
        network: opts.network ?? 'none', user: opts.user ?? null,
      });
      try {
        const stdout = exec(args, { timeout: timeoutMs });
        return {
          metrics: parseMetricsLine(stdout), exitCode: 0, runner: 'docker',
          durationMs: Date.now() - start, stdoutExcerpt: stdout.slice(0, 2000),
          failureClass: 'none',
        };
      } catch (e: unknown) {
        const err = e as { status?: number; stdout?: string; stderr?: string; signal?: string };
        const timedOut = err.signal === 'SIGTERM';
        if (timedOut) {
          try { exec(['rm', '-f', containerName], { timeout: 5000 }); } catch { /* best effort */ }
        }
        const stdout = err.stdout || '';
        return {
          metrics: parseMetricsLine(stdout),
          exitCode: typeof err.status === 'number' ? err.status : 1,
          runner: 'docker', durationMs: Date.now() - start,
          stdoutExcerpt: stdout.slice(0, 2000),
          failureClass: classifyRunFailure(err.stderr || String(e), timedOut),
        };
      }
    },
  };
}

interface SelectOpts {
  timeoutMs?: number;
  exec?: DockerExec;                 // injected for tests
  warn?: (msg: string) => void;      // injected for tests
}

function selectRunner(cwd: string, opts: SelectOpts = {}): import('./runner').Runner {
  // Default bumped 120s -> 600s (env-overridable via GRD_EXPERIMENT_TIMEOUT_MS).
  // A correct but compute-heavy experiment can exceed 120s under machine load;
  // hitting the cap SIGTERMs the script -> empty metrics -> spurious H4. This is
  // the effective default (passed explicitly to the subprocess/docker runner).
  const envTimeout = Number(process.env.GRD_EXPERIMENT_TIMEOUT_MS);
  const timeoutMs =
    opts.timeoutMs
    ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 600000);
  const cfg = readSandboxConfig(cwd);
  // Explicit 'subprocess' (and unrecognized values) never probe and never upgrade.
  if (cfg.mode === 'subprocess') return createSubprocessRunner({ timeoutMs });

  // Both 'docker' (explicit) and 'auto' (unset/''/'auto') probe once for a usable
  // docker binary; either way, a missing binary degrades to subprocess loudly.
  const exec = opts.exec || defaultExec;
  const warn = opts.warn || ((m: string) => { process.stderr.write(m); });
  if (!dockerAvailable(exec, 5000)) {
    warn(cfg.mode === 'docker'
      ? '[research] docker sandbox requested but unavailable — running UNSANDBOXED on host\n'
      : '[research] no docker available for sandbox — running UNSANDBOXED on host\n');
    return createSubprocessRunner({ timeoutMs });
  }
  const user = typeof process.getuid === 'function'
    ? `${process.getuid()}:${typeof process.getgid === 'function' ? process.getgid() : process.getuid()}`
    : null;
  return createDockerRunner({
    exec, image: cfg.image ?? undefined, memory: cfg.memory, cpus: cfg.cpus,
    network: cfg.network, timeoutMs, user,
  });
}

module.exports = {
  validateImage, validateMemory, validateCpus, buildDockerArgs, readSandboxConfig,
  dockerAvailable, createDockerRunner, selectRunner,
};
