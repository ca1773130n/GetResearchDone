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
  mode: 'subprocess' | 'docker';
  image: string | null;
  memory: string;
  cpus: string;
  network: 'none' | 'bridge';
}

function readSandboxConfig(cwd: string): SandboxConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_sandbox?: unknown; research_sandbox_image?: unknown;
      research_sandbox_memory?: unknown; research_sandbox_cpus?: unknown;
      research_sandbox_network?: unknown;
    };
    return {
      mode: raw.research_sandbox === 'docker' ? 'docker' : 'subprocess',
      image: validateImage(raw.research_sandbox_image),
      memory: validateMemory(raw.research_sandbox_memory),
      cpus: validateCpus(raw.research_sandbox_cpus),
      network: raw.research_sandbox_network === 'bridge' ? 'bridge' : 'none',
    };
  } catch {
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

module.exports = {
  validateImage, validateMemory, validateCpus, buildDockerArgs, readSandboxConfig,
  dockerAvailable,
};
