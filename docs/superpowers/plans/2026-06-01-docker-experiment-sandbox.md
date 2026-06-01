# Docker Experiment Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in Docker-isolated experiment `Runner` to the autoresearch RUN station, alongside the existing host-subprocess runner, with graceful degradation.

**Architecture:** A new `lib/research/docker-runner.ts` implements the existing synchronous `Runner` interface by shelling out to the `docker` CLI through an injectable exec. It owns config-reading (`readSandboxConfig`), daemon-probing (`dockerAvailable`), runner-selection-with-degradation (`selectRunner`), pure arg construction (`buildDockerArgs`), and input validation (`validateImage`/`validateMemory`/`validateCpus`). It `require`s `runner.ts` for the shared `parseMetricsLine`/`classifyRunFailure`/`createSubprocessRunner` (one-directional dependency — `runner.ts` is left unchanged so there is no require cycle). The orchestrator's RUN line swaps `createSubprocessRunner(...)` for `selectRunner(cwd, ...)`.

**Tech Stack:** TypeScript (strict, CommonJS), Node `child_process.execFileSync`, Jest + ts-jest. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-31-docker-experiment-sandbox-design.md`

---

## Conventions for every task

- GRD code style: `'use strict';` first line; CommonJS `require`/`module.exports` (no ESM, but `import type` allowed); zero `any` (use specific interfaces / `Record<string, unknown>`); typed requires; unused args prefixed `_`.
- Run a single test file: `npx jest tests/unit/research/docker-runner.test.ts`.
- Run by name: `npx jest -t "name substring"`.
- After each task: `git add` the touched files and commit with the message shown.
- The commit footer for every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- **Create `lib/research/docker-runner.ts`** — all sandbox logic: validators, `buildDockerArgs`, `readSandboxConfig`, `dockerAvailable`, `createDockerRunner`, `selectRunner`, and a default exec wrapping `execFileSync('docker', …)`.
- **Create `tests/unit/research/docker-runner.test.ts`** — unit tests for the above (fully offline, injected fake exec).
- **Modify `lib/research/types.ts`** — widen `ExperimentResult.runner` literal.
- **Modify `lib/utils.ts`** — register 5 config keys in `KNOWN_CONFIG_KEYS`.
- **Modify `lib/research/orchestrator.ts`** — use `selectRunner` for the RUN station.
- **Modify `CLAUDE.md`** — document the sandbox under the Autoresearch section.

---

### Task 1: Widen the result type + register config keys

**Files:**
- Modify: `lib/research/types.ts` (the `ExperimentResult.runner` field, ~line 63)
- Modify: `lib/utils.ts` (`KNOWN_CONFIG_KEYS` set, ~line 281–286)
- Test: `tests/unit/research/docker-runner.test.ts` (new file — first describe block)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/research/docker-runner.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "does not warn"`
Expected: FAIL — stderr contains `Unrecognized config key "research_sandbox..."` warnings (keys not yet registered).

- [ ] **Step 3: Register the keys**

In `lib/utils.ts`, inside the `KNOWN_CONFIG_KEYS` set, immediately after the line `  'research_portfolio_concurrency',` add:

```ts
  'research_sandbox',
  'research_sandbox_image',
  'research_sandbox_memory',
  'research_sandbox_cpus',
  'research_sandbox_network',
```

- [ ] **Step 4: Widen the result type**

In `lib/research/types.ts`, change the `ExperimentResult` field:

```ts
  runner: 'subprocess';
```
to:
```ts
  runner: 'subprocess' | 'docker';
```

- [ ] **Step 5: Run test + type-check to verify pass**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "does not warn"`
Expected: PASS

Run: `npm run build:check`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add lib/research/types.ts lib/utils.ts tests/unit/research/docker-runner.test.ts
git commit -m "feat(research): sandbox result type + config keys (sp4 task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Pure input validators

Creates `lib/research/docker-runner.ts` with the three validators that defend against flag-injection and malformed resource values (spec "Security considerations" + "Configuration" validation).

**Files:**
- Create: `lib/research/docker-runner.ts`
- Test: `tests/unit/research/docker-runner.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/research/docker-runner.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "validators"`
Expected: FAIL — `Cannot find module '../../../lib/research/docker-runner'`.

- [ ] **Step 3: Create the module with validators**

Create `lib/research/docker-runner.ts`:

```ts
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

module.exports = { validateImage, validateMemory, validateCpus };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "validators"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/docker-runner.ts tests/unit/research/docker-runner.test.ts
git commit -m "feat(research): docker sandbox input validators (sp4 task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `buildDockerArgs` (pure arg vector)

**Files:**
- Modify: `lib/research/docker-runner.ts`
- Test: `tests/unit/research/docker-runner.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test**

Append:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "buildDockerArgs"`
Expected: FAIL — `dr.buildDockerArgs is not a function`.

- [ ] **Step 3: Implement `buildDockerArgs`**

In `lib/research/docker-runner.ts`, add this interface + function above the `module.exports` line:

```ts
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
```

Update `module.exports` to include it:

```ts
module.exports = { validateImage, validateMemory, validateCpus, buildDockerArgs };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "buildDockerArgs"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/docker-runner.ts tests/unit/research/docker-runner.test.ts
git commit -m "feat(research): buildDockerArgs tight-posture arg vector (sp4 task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `readSandboxConfig` (raw config read + validation)

**Files:**
- Modify: `lib/research/docker-runner.ts`
- Test: `tests/unit/research/docker-runner.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test**

Append:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "readSandboxConfig"`
Expected: FAIL — `dr.readSandboxConfig is not a function`.

- [ ] **Step 3: Implement `readSandboxConfig`**

Add above `module.exports`:

```ts
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
```

Add `readSandboxConfig` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "readSandboxConfig"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/docker-runner.ts tests/unit/research/docker-runner.test.ts
git commit -m "feat(research): readSandboxConfig raw-read + validation (sp4 task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `dockerAvailable` (daemon probe)

**Files:**
- Modify: `lib/research/docker-runner.ts`
- Test: `tests/unit/research/docker-runner.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test**

Append:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "dockerAvailable"`
Expected: FAIL — `dr.dockerAvailable is not a function`.

- [ ] **Step 3: Implement `dockerAvailable` + the default exec type**

Add above `module.exports`:

```ts
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
```

Add `dockerAvailable` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "dockerAvailable"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/docker-runner.ts tests/unit/research/docker-runner.test.ts
git commit -m "feat(research): dockerAvailable daemon probe (sp4 task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `createDockerRunner` (the Runner)

Implements the `Runner` interface: resolves + contains the script path, builds args, execs docker, parses metrics, classifies failures, force-removes the container on timeout.

**Files:**
- Modify: `lib/research/docker-runner.ts`
- Test: `tests/unit/research/docker-runner.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('createDockerRunner.run', () => {
  const { saveThread } = require('../../../lib/research/thread'); // not needed; placeholder removed below
  function thread() {
    const d = tmp();
    const iter = path.join(d, 'threads', 't1', 'experiments', '0');
    fs.mkdirSync(iter, { recursive: true });
    fs.writeFileSync(path.join(iter, 'run.sh'), 'echo hi');
    return { threadDir: path.join(d, 'threads', 't1'), iter };
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
    // the run call mounted the iter dir and ran bash
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
    expect(calls.length).toBe(0); // no docker invocation
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
```

NOTE: delete the stray `const { saveThread } = …` line — it is not used. (Kept out of the implementation; do not copy it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "createDockerRunner.run"`
Expected: FAIL — `dr.createDockerRunner is not a function`.

- [ ] **Step 3: Implement `createDockerRunner`**

Add above `module.exports`:

```ts
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
```

Add `createDockerRunner` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "createDockerRunner.run"`
Expected: PASS (all 5 cases)

Run: `npm run build:check`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/research/docker-runner.ts tests/unit/research/docker-runner.test.ts
git commit -m "feat(research): createDockerRunner with containment + timeout cleanup (sp4 task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `selectRunner` (selection + degradation)

**Files:**
- Modify: `lib/research/docker-runner.ts`
- Test: `tests/unit/research/docker-runner.test.ts` (add a describe block)

- [ ] **Step 1: Write the failing test**

Append:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "selectRunner"`
Expected: FAIL — `dr.selectRunner is not a function`.

- [ ] **Step 3: Implement `selectRunner`**

Add above `module.exports`:

```ts
interface SelectOpts {
  timeoutMs?: number;
  exec?: DockerExec;                 // injected for tests
  warn?: (msg: string) => void;      // injected for tests
}

function selectRunner(cwd: string, opts: SelectOpts = {}): import('./runner').Runner {
  const timeoutMs = opts.timeoutMs ?? 120000;
  const cfg = readSandboxConfig(cwd);
  if (cfg.mode !== 'docker') return createSubprocessRunner({ timeoutMs });

  const exec = opts.exec || defaultExec;
  const warn = opts.warn || ((m: string) => process.stderr.write(m));
  if (!dockerAvailable(exec, 5000)) {
    warn('[research] docker sandbox requested but unavailable — running UNSANDBOXED on host\n');
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
```

Update `module.exports` to its final form:

```ts
module.exports = {
  validateImage, validateMemory, validateCpus, buildDockerArgs,
  readSandboxConfig, dockerAvailable, createDockerRunner, selectRunner,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "selectRunner"`
Expected: PASS

Run: `npx jest tests/unit/research/docker-runner.test.ts`
Expected: the whole file passes.

- [ ] **Step 5: Commit**

```bash
git add lib/research/docker-runner.ts tests/unit/research/docker-runner.test.ts
git commit -m "feat(research): selectRunner selection + degrade-with-warning (sp4 task 7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire the orchestrator RUN station to `selectRunner`

**Files:**
- Modify: `lib/research/orchestrator.ts` (require line ~23; RUN-station runner construction ~line 161)
- Test: existing `tests/unit/research/orchestrator.test.ts` (must still pass; tests inject `opts.runner`)

- [ ] **Step 1: Confirm the current RUN line + require**

Run: `grep -n "createSubprocessRunner\|require('./runner')\|opts.runner ||" lib/research/orchestrator.ts`
Expected: shows `const { createSubprocessRunner } = require('./runner');` (~line 23) and `const runner: Runner = opts.runner || createSubprocessRunner({ timeoutMs: opts.timeout });` (~line 161).

- [ ] **Step 2: Swap the require**

In `lib/research/orchestrator.ts`, replace:

```ts
const { createSubprocessRunner } = require('./runner');
```
with:
```ts
const { selectRunner } = require('./docker-runner') as {
  selectRunner: (cwd: string, opts?: { timeoutMs?: number }) => Runner;
};
```

(`import type { Runner } from './runner';` at line 7 stays.)

- [ ] **Step 3: Swap the RUN-station construction**

Replace:

```ts
  const runner: Runner = opts.runner || createSubprocessRunner({ timeoutMs: opts.timeout });
```
with:
```ts
  const runner: Runner = opts.runner || selectRunner(cwd, { timeoutMs: opts.timeout });
```

- [ ] **Step 4: Run the orchestrator suite + type-check + lint**

Run: `npx jest tests/unit/research/orchestrator.test.ts`
Expected: PASS — all existing tests still green (they inject `opts.runner`, so `selectRunner` is not reached; the default branch now resolves through config, defaulting to subprocess).

Run: `npm run build:check`
Expected: no type errors.

Run: `npm run lint`
Expected: clean (no unused `createSubprocessRunner` import remains).

- [ ] **Step 5: Commit**

```bash
git add lib/research/orchestrator.ts
git commit -m "feat(research): RUN station selects sandbox runner via config (sp4 task 8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Documentation + full verification

**Files:**
- Modify: `CLAUDE.md` (Autoresearch Loop section — add a sandbox subsection)

- [ ] **Step 1: Add the docs subsection**

In `CLAUDE.md`, find the heading `### Multi-thread portfolio (loop deepening #3)` and insert this new subsection immediately **before** it:

```markdown
### Docker experiment sandbox (RUN station)

The RUN station can run each experiment script inside a Docker container instead
of as a host subprocess. Opt in with `research_sandbox: "docker"` (top-level
config key, read raw via `readSandboxConfig` in `lib/research/docker-runner.ts`).
`selectRunner(cwd, …)` picks the runner: docker when configured **and** the
daemon probe (`docker version`) succeeds, else it degrades to the subprocess
runner with a loud `UNSANDBOXED` stderr warning (the actual runner is recorded
in `result.json` as `runner: subprocess|docker`). The container runs with a
tight posture: only the iteration dir bind-mounted RW at `/work`, `--network
none`, `--read-only` rootfs + `--tmpfs /tmp`, `--cap-drop ALL`,
`--security-opt no-new-privileges`, `--ipc none`, non-root `--user` on POSIX,
`--memory`/`--cpus`/`--pids-limit` caps, `--entrypoint` pinned to bash/python3,
and a force-remove on timeout. `plan.scriptPath` is realpath-contained under the
thread dir and `research_sandbox_image` is reference-validated (no flag
injection). Config keys: `research_sandbox`, `research_sandbox_image`,
`research_sandbox_memory` (default `512m`), `research_sandbox_cpus` (default
`1`), `research_sandbox_network` (`none`|`bridge`). Defaults to slim images
(`python:3.12-slim` / `bash:5`).
```

- [ ] **Step 2: Run the full research test suite + type-check + lint**

Run: `npx jest tests/unit/research/`
Expected: PASS (docker-runner, runner, orchestrator, cli, and the rest).

Run: `npm run build:check`
Expected: no type errors.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(research): document docker experiment sandbox (sp4 task 9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Finish the branch**

Announce and use the **superpowers:finishing-a-development-branch** skill (verify tests, present options, execute choice).

---

## Self-Review

**1. Spec coverage:**
- Architecture / `Runner` interface reuse → Tasks 6, 8. ✓
- Docker invocation (all flags, `--mount`, `--entrypoint`, `--user` guard, hardening, container name) → Task 3 (`buildDockerArgs`) + Task 6 (name + user). ✓
- Containment of `plan.scriptPath` → Task 6 (`resolveContained`, H3 test). ✓
- Image flag-injection guard → Task 2 (`validateImage`) + Task 4 + Task 6. ✓
- Timeout force-remove → Task 6 (SIGTERM → `docker rm -f`, swallow test). ✓
- Result mapping / `runner: 'docker'` → Task 1 (type) + Task 6. ✓
- Degradation + loud warning + observable via `result.json` → Task 7 + Task 8. ✓
- Config keys + validation + KNOWN_CONFIG_KEYS → Task 1 + Task 4. ✓
- Daemon probe → Task 5. ✓
- Testing strategy (all listed cases) → Tasks 2–7. ✓
- Docs → Task 9. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code. The stray `const { saveThread }` line in the Task 6 test is explicitly flagged for deletion. ✓

**3. Type consistency:** `DockerExec`, `buildDockerArgs(DockerArgParams)`, `SandboxConfig`, `DockerRunnerOpts`, `SelectOpts`, and `Runner` return types are consistent across Tasks 2–8. `createSubprocessRunner`/`parseMetricsLine`/`classifyRunFailure` signatures match `lib/research/runner.ts`. `selectRunner(cwd, { timeoutMs })` signature matches the orchestrator call site in Task 8. ✓

**No-cycle note:** `docker-runner.ts` → `runner.ts` only. `orchestrator.ts` → `docker-runner.ts` (+ `import type` from `runner.ts`). `runner.ts` imports neither. ✓
