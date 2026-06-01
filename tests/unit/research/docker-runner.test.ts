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
