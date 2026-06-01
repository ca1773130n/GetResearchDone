'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureError } = require('../../helpers/setup');
const { loadConfig } = require('../../../lib/utils');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-docker-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('sandbox config keys are recognized', () => {
  it('loadConfig does not warn for research_sandbox* keys', () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_sandbox: 'docker',
      research_sandbox_image: 'python:3.12-slim',
      research_sandbox_memory: '512m',
      research_sandbox_cpus: '1',
      research_sandbox_network: 'none',
    }));
    const res = captureError(() => loadConfig(cwd));
    expect(res.stderr).not.toMatch(/Unrecognized config key "research_sandbox/);
  });
});

const dr = require('../../../lib/research/docker-runner');

describe('validators', () => {
  it('validateImage accepts valid refs and rejects flag-injection', () => {
    expect(dr.validateImage('python:3.12-slim')).toBe('python:3.12-slim');
    expect(dr.validateImage('bash:5')).toBe('bash:5');
    expect(dr.validateImage('ghcr.io/org/img@sha256:' + 'a'.repeat(64)))
      .toBe('ghcr.io/org/img@sha256:' + 'a'.repeat(64));
    expect(dr.validateImage('--privileged')).toBeNull();
    expect(dr.validateImage('-rm')).toBeNull();
    expect(dr.validateImage('')).toBeNull();
    expect(dr.validateImage(42)).toBeNull();
    expect(dr.validateImage('has space')).toBeNull();
  });
  it('validateMemory accepts docker sizes, defaults otherwise', () => {
    expect(dr.validateMemory('512m')).toBe('512m');
    expect(dr.validateMemory('2g')).toBe('2g');
    expect(dr.validateMemory('1073741824')).toBe('1073741824');
    expect(dr.validateMemory('lots')).toBe('512m');
    expect(dr.validateMemory(undefined)).toBe('512m');
  });
  it('validateCpus accepts positive numbers, defaults otherwise', () => {
    expect(dr.validateCpus('2')).toBe('2');
    expect(dr.validateCpus(1.5)).toBe('1.5');
    expect(dr.validateCpus('0')).toBe('1');
    expect(dr.validateCpus('-1')).toBe('1');
    expect(dr.validateCpus('nan')).toBe('1');
  });
});

describe('buildDockerArgs', () => {
  const base = {
    containerName: 'grd-exp-t1-0-123', iterDir: '/threads/t1/experiments/0',
    scriptBasename: 'run.sh', bin: 'bash', image: 'bash:5',
    memory: '512m', cpus: '1', network: 'none', user: null as string | null,
  };
  it('produces the hardened tight-posture arg vector', () => {
    const a = dr.buildDockerArgs(base);
    expect(a.slice(0, 4)).toEqual(['run', '--rm', '--name', 'grd-exp-t1-0-123']);
    expect(a).toEqual(expect.arrayContaining(['--network', 'none']));
    expect(a).toEqual(expect.arrayContaining(['--memory', '512m', '--cpus', '1', '--pids-limit', '256']));
    expect(a).toEqual(expect.arrayContaining(['--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--ipc', 'none']));
    expect(a).toEqual(expect.arrayContaining(['--read-only', '--tmpfs', '/tmp', '-w', '/work']));
    expect(a).toEqual(expect.arrayContaining(['--mount', 'type=bind,src=/threads/t1/experiments/0,dst=/work']));
    // image immediately precedes the script arg, at the very end
    expect(a.slice(-2)).toEqual(['bash:5', '/work/run.sh']);
    // entrypoint pins the interpreter just before the image
    const ei = a.indexOf('--entrypoint');
    expect(a[ei + 1]).toBe('bash');
    expect(a.indexOf('bash:5')).toBe(ei + 2);
    // no --user when uid absent
    expect(a).not.toContain('--user');
  });
  it('adds --user only when a uid is supplied', () => {
    const a = dr.buildDockerArgs({ ...base, user: '501:20' });
    expect(a).toEqual(expect.arrayContaining(['--user', '501:20']));
  });
  it('honors network bridge and a custom image', () => {
    const a = dr.buildDockerArgs({ ...base, network: 'bridge', image: 'python:3.12-slim', bin: 'python3', scriptBasename: 'run.py' });
    expect(a).toEqual(expect.arrayContaining(['--network', 'bridge']));
    expect(a.slice(-2)).toEqual(['python:3.12-slim', '/work/run.py']);
  });
});

describe('readSandboxConfig', () => {
  function cfgDir(obj: Record<string, unknown>) {
    const d = tmp();
    fs.writeFileSync(path.join(d, '.planning/config.json'), JSON.stringify(obj));
    return d;
  }
  it('defaults to subprocess mode with no config', () => {
    expect(dr.readSandboxConfig(tmp())).toEqual({
      mode: 'subprocess', image: null, memory: '512m', cpus: '1', network: 'none',
    });
  });
  it('reads docker mode and validated knobs', () => {
    const c = dr.readSandboxConfig(cfgDir({
      research_sandbox: 'docker', research_sandbox_image: 'python:3.12-slim',
      research_sandbox_memory: '2g', research_sandbox_cpus: '2', research_sandbox_network: 'bridge',
    }));
    expect(c).toEqual({ mode: 'docker', image: 'python:3.12-slim', memory: '2g', cpus: '2', network: 'bridge' });
  });
  it('rejects an injection image and bad network/knobs', () => {
    const c = dr.readSandboxConfig(cfgDir({
      research_sandbox: 'docker', research_sandbox_image: '--privileged',
      research_sandbox_memory: 'lots', research_sandbox_cpus: '0', research_sandbox_network: 'host',
    }));
    expect(c).toEqual({ mode: 'docker', image: null, memory: '512m', cpus: '1', network: 'none' });
  });
  it('treats an unknown mode as subprocess', () => {
    expect(dr.readSandboxConfig(cfgDir({ research_sandbox: 'vm' })).mode).toBe('subprocess');
  });
});

describe('dockerAvailable', () => {
  it('returns true when the version probe succeeds', () => {
    const calls: string[][] = [];
    const exec = (args: string[]) => { calls.push(args); return '24.0.7\n'; };
    expect(dr.dockerAvailable(exec, 5000)).toBe(true);
    expect(calls[0]).toEqual(['version', '--format', '{{.Server.Version}}']);
  });
  it('returns false when the probe throws', () => {
    const exec = () => { throw new Error('Cannot connect to the Docker daemon'); };
    expect(dr.dockerAvailable(exec, 5000)).toBe(false);
  });
  it('returns false when the probe returns empty output', () => {
    expect(dr.dockerAvailable(() => '  \n', 5000)).toBe(false);
  });
});

describe('createDockerRunner.run', () => {
  function thread() {
    const d = tmp();
    const iter = path.join(d, 'threads', 't1', 'experiments', '0');
    fs.mkdirSync(iter, { recursive: true });
    fs.writeFileSync(path.join(iter, 'run.sh'), 'echo hi');
    // realpath because resolveContained normalizes symlinks (e.g. macOS /tmp -> /private/tmp).
    return { threadDir: path.join(d, 'threads', 't1'), iter: fs.realpathSync(iter) };
  }
  const plan = (over = {}) => ({
    procedure: 'p', metricKey: 'accuracy', comparator: '>=', target: 0.8,
    predictedOutcome: 'x', scriptPath: 'experiments/0/run.sh', language: 'shell', ...over,
  });

  it('runs the script in docker and parses __RESULT__', () => {
    const t = thread();
    const calls: string[][] = [];
    const exec = (args: string[]) => { calls.push(args); return 'log\n__RESULT__ {"accuracy": 0.91}\n'; };
    const r = dr.createDockerRunner({ exec });
    const res = r.run(plan(), t.threadDir);
    expect(res.runner).toBe('docker');
    expect(res.exitCode).toBe(0);
    expect(res.metrics.accuracy).toBe(0.91);
    expect(res.failureClass).toBe('none');
    const runArgs = calls.find((a) => a[0] === 'run')!;
    expect(runArgs).toEqual(expect.arrayContaining(['--mount', `type=bind,src=${t.iter},dst=/work`]));
    expect(runArgs).toEqual(expect.arrayContaining(['--entrypoint', 'bash']));
    expect(runArgs[runArgs.length - 1]).toBe('/work/run.sh');
  });

  it('classifies a failing run via stderr', () => {
    const t = thread();
    const exec = () => { const e: any = new Error('boom'); e.status = 1; e.stderr = 'ModuleNotFoundError: x'; throw e; };
    const res = dr.createDockerRunner({ exec }).run(plan({ language: 'python', scriptPath: 'experiments/0/run.sh' }), t.threadDir);
    expect(res.runner).toBe('docker');
    expect(res.exitCode).toBe(1);
    expect(res.failureClass).toBe('H2');
  });

  it('rejects a scriptPath outside threadDir without calling docker', () => {
    const t = thread();
    const calls: string[][] = [];
    const exec = (args: string[]) => { calls.push(args); return ''; };
    const res = dr.createDockerRunner({ exec }).run(plan({ scriptPath: '../../../../etc/passwd' }), t.threadDir);
    expect(res.failureClass).toBe('H3');
    expect(res.exitCode).toBe(1);
    expect(calls.length).toBe(0);
  });

  it('force-removes the container on timeout', () => {
    const t = thread();
    const calls: string[][] = [];
    const exec = (args: string[]) => {
      calls.push(args);
      if (args[0] === 'run') { const e: any = new Error('timeout'); e.signal = 'SIGTERM'; e.stdout = ''; throw e; }
      return '';
    };
    const res = dr.createDockerRunner({ exec }).run(plan(), t.threadDir);
    expect(res.failureClass).toBe('H4');
    const rm = calls.find((a) => a[0] === 'rm');
    expect(rm && rm[1]).toBe('-f');
    expect(rm && rm[2]).toMatch(/^grd-exp-/);
  });

  it('swallows a throw from the cleanup rm call', () => {
    const t = thread();
    const exec = (args: string[]) => {
      if (args[0] === 'run') { const e: any = new Error('timeout'); e.signal = 'SIGTERM'; throw e; }
      throw new Error('rm failed too');
    };
    expect(() => dr.createDockerRunner({ exec }).run(plan(), t.threadDir)).not.toThrow();
  });
});

describe('selectRunner', () => {
  function cfgDir(obj: Record<string, unknown>) {
    const d = tmp();
    fs.writeFileSync(path.join(d, '.planning/config.json'), JSON.stringify(obj));
    return d;
  }
  it('returns subprocess runner and never probes when mode is subprocess', () => {
    let probed = false;
    const exec = () => { probed = true; return '24'; };
    const r = dr.selectRunner(tmp(), { timeoutMs: 1000, exec });
    expect(typeof r.run).toBe('function');
    expect(probed).toBe(false);
  });
  it('returns a docker runner when docker is configured and available', () => {
    const cwd = cfgDir({ research_sandbox: 'docker' });
    const calls: string[][] = [];
    const exec = (args: string[]) => { calls.push(args); return '24.0\n'; };
    const r = dr.selectRunner(cwd, { timeoutMs: 1000, exec });
    expect(typeof r.run).toBe('function');
    expect(calls.some((a) => a[0] === 'version')).toBe(true);
  });
  it('degrades to subprocess with a loud warning when docker is unavailable', () => {
    const cwd = cfgDir({ research_sandbox: 'docker' });
    const warnings: string[] = [];
    const exec = () => { throw new Error('no daemon'); };
    const r = dr.selectRunner(cwd, { timeoutMs: 1000, exec, warn: (m: string) => warnings.push(m) });
    expect(typeof r.run).toBe('function');
    expect(warnings.join('')).toMatch(/UNSANDBOXED/);
  });
});
