# Research Factory Implementation Plan

> **Historical record; one part is out of date.** This plan specifies the held-out
> evaluation as a single `hidden_eval.script` mounted into the container that runs
> candidate code. It was built that way and then changed on 2026-10-15: the evaluation is
> now split into `hidden_eval.run` and `hidden_eval.score`, so no candidate code ever runs
> where the scoring script is mounted. Read
> [the spec](../specs/2026-09-18-research-factory-design.md) §10 and §11 for the current
> design; everything else here still describes what was implemented.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A human describes what should improve in a codebase through an AI-assisted interview; GRD then runs hypotheses and experiments unattended until a patch clears a blind replication and a hidden evaluation, and opens a PR that the human merges.

**Architecture:** A `lib/factory/` layer drives the existing research loop (`runResearch`) as its inner loop, through two new loop options: `contract` (seeds the pinned decision rule from the work order) and `design` (swaps the design station for a code-building agent). A candidate is one hypothesis turned into one patch in its own git worktree, measured in a hardened Docker container. Trust gates run after the loop: blind replication, then one hidden-evaluation query, then a PR.

**Tech Stack:** TypeScript (strict, CommonJS), Jest + ts-jest, git worktrees, Docker, `gh`, the existing GRD scheduler.

**Spec:** `docs/superpowers/specs/2026-09-18-research-factory-design.md`

## Global Constraints

- Work in the worktree `~/.blackhole/GetResearchDone/2026-09-18/research-factory` on branch `feat/research-factory`. Never commit to `main`.
- Before running any test: `export TMPDIR=$(mkdir -p ~/.blackhole/GetResearchDone/$(date +%F)/tmp && mktemp -d ~/.blackhole/GetResearchDone/$(date +%F)/tmp/run.XXXX)`. Delete that directory when the task is done.
- Code style: `'use strict'` first line; CommonJS `require` with typed casts (`const { f } = require('./m') as { f: (a: T) => R }`); `import type` only for types; no `any`; unused parameters prefixed `_`.
- Tests mirror `lib/`: `lib/factory/x.ts` → `tests/unit/factory/x.test.ts`. Tests spend **zero tokens** and need **no Docker**: spawn, docker and `gh` are always faked. Real `git` is used against temporary repos created under `os.tmpdir()`.
- The hidden evaluation's path, contents and results must never enter any agent prompt. Candidate rows (`candidates.jsonl`) feed prompts and therefore never carry a hidden value.
- Candidate code only ever runs in a container. Never fall back to the host.
- Stop and remove only what this code recorded: worktrees under the order's own `worktrees/` directory, and containers by their exact recorded names. Never match by pattern.
- Every commit message ends with these two lines:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
```

## Changes to the spec found while planning

1. **Agent tool lists are not enforced today.** The scheduler spawns every agent as `claude -p … --dangerously-skip-permissions` with all tools; the `tools:` line in `agents/*.md` is never applied. Task 2 adds `SpawnOpts.disallowedTools`, passed as `--disallowedTools`, so the builder really has no shell. Only the Claude adapter can enforce it; the factory warns when a builder ran on another backend.
2. **`dev_eval.files`** is added to the work order: the repo-relative files the dev evaluation itself reads or runs. The interview identifies them. They implement spec §11.2 (evaluation files are never editable).
3. **Token reporting (spec §6.2 check 6) moves to the first spawn of `run`,** so `validate` spends zero tokens. A backend reporting no count disables the token cap, loudly.
4. **Setup runs as soon as a worktree is created,** before the builder, so its untracked output (for example a virtualenv) is recorded and excluded from the scope check.
5. **Extra files for single responsibilities:** `exec.ts`, `worktrees.ts`, `intake.ts` (scan and validate), `spawn.ts`, `prompts.ts`.
6. **`scan` proposes an image and setup for Node and Python only.** For other ecosystems the interview asks, and `validate` proves the answer works.
7. **Intake checks that `base` resolves, not that the working copy is clean** (spec §6.2 check 1). Candidates are built in worktrees from `base`, so the user's checkout is never read or touched and its state does not matter.
8. **Docker is re-checked before every attempt,** so Docker dying mid-run stops the order as `docker_unavailable` rather than as a string of build failures (spec §14).

## Before Task 1

- [ ] **Re-query HypePaper** (it returned internal errors while the spec was written) for work newer than the spec's sources on: reusable holdouts and adaptive overfitting of a hidden evaluation; evaluator hacking in LLM code-optimization loops; replication of research-agent results by a fresh agent. If anything contradicts rules R1 to R3 in spec §4, stop and report it to the user before writing code. Otherwise note the queries and the result in the PR description.

## File Structure

| Path | Responsibility |
|---|---|
| `lib/research/orchestrator.ts` (modify) | `contract` and `design` options |
| `lib/types.ts`, `lib/scheduler.ts` (modify) | `SpawnOpts.disallowedTools`, passed by the Claude adapter |
| `lib/research/docker-runner.ts` (modify) | Export `hardenedRunFlags` and `MEMORY_RE` for reuse |
| `lib/factory/types.ts` | Work order, candidate event, stop reason, query and spend records |
| `lib/factory/exec.ts` | `Exec` type and the default `execFileSync` wrapper |
| `lib/factory/order.ts` | Parse and check a work order; factory home; drafts; save and load |
| `lib/factory/sandbox.ts` | Container arguments, setup, repeated measurement, container ledger |
| `lib/factory/gates.ts` | Globs, changed paths, scope check, tamper scan, query log, hidden gate |
| `lib/factory/worktrees.ts` | Add, restore, remove and commit candidate worktrees |
| `lib/factory/intake.ts` | `scanRepo` and `validateDraft` |
| `lib/factory/spawn.ts` | Token-metered spawn with the builder's tool restriction |
| `lib/factory/prompts.ts` | Question text and builder, fix and replication prompts |
| `lib/factory/ship.ts` | PR evidence, push, PR creation, report |
| `lib/factory/line.ts` | `runOrder`: attempts, runner, trust gates, stop conditions, cleanup |
| `lib/factory/cli.ts` | `cmdFactoryScan/Validate/Save/Run/Status` |
| `bin/grd-tools.ts`, `lib/cli/index.ts`, `bin/gd.ts` (modify) | `factory` subcommand wiring and help |
| `agents/grd-factory-builder.md` | Builder agent definition |
| `commands/factory.md`, `commands/help.md` (modify) | The `/grd:factory` interview and its catalog entry |
| `tests/unit/factory/fixtures.ts` | Shared test helpers (not a suite) |

---

### Task 1: Research loop seams — `contract` and `design`

**Files:**
- Modify: `lib/research/orchestrator.ts` (the `ResearchOptions` interface near line 116; `runResearch`; the design-station `spawnAndParse` call near line 1250; the debug-fix `spawnAndParse` call near line 1385)
- Test: `tests/unit/research/orchestrator.test.ts` (append)

**Interfaces:**
- Produces: `ResearchOptions.contract?: MetricContract`; `ResearchOptions.design?: DesignOverride`; exported type `DesignOverride { agent: string; prompt(thread, hyp, iterDir): string; fixPrompt(hyp, plan, result, iterDir, attempt, maxDepth): string }`.

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/research/orchestrator.test.ts`:

```ts
describe('factory seams: the contract and design options', () => {
  const HYP = '__HYPOTHESIS__ {"statement":"h","rationale":"r","predictedOutcome":"p","refutationCondition":"if the mechanism is absent the effect disappears / amplifying it makes the effect worse"}';
  const TAKE = '__TAKEAWAY__ {"kind":"domain_fact","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
  const plan = (key: string, cmp: string, target: number) =>
    `__PLAN__ {"procedure":"p","metricKey":"${key}","comparator":"${cmp}","target":${target},"language":"shell","scriptPath":"experiments/x/run.sh"}`;
  function recorder(calls: Array<{ prompt: string; agent: string }>, designReply: string) {
    return async (prompt: string, agent: string): Promise<string> => {
      calls.push({ prompt, agent });
      if (agent === 'grd-hypothesizer') return HYP;
      if (agent === 'grd-knowledge-miner') return TAKE;
      return designReply;
    };
  }
  const result = (metrics: Record<string, number>, exitCode = 0) => ({
    metrics, exitCode, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '',
    stderrExcerpt: exitCode === 0 ? undefined : 'boom', failureClass: exitCode === 0 ? 'none' : 'H4',
  });

  it('seeds the pinned contract, so the first design is judged on it', async () => {
    const cwd = tmp();
    const calls: Array<{ prompt: string; agent: string }> = [];
    const res = await runResearch(cwd, 'Is p95 under 120?', {
      maxIterations: 1, noGates: true,
      contract: { metricKey: 'latency_p95_ms', comparator: '<=', target: 120 },
      spawn: recorder(calls, plan('accuracy', '>=', 0.8)),
      runner: { run: () => result({ latency_p95_ms: 100, accuracy: 0.1 }) },
    });
    // Unseeded, the design's own `accuracy >= 0.8` would refute on 0.1.
    expect(res.status).toBe('supported');
    const p = JSON.parse(fs.readFileSync(
      path.join(cwd, '.planning', 'research', 'threads', res.threadId, 'experiments', '1', 'plan.json'), 'utf8'));
    expect([p.metricKey, p.comparator, p.target]).toEqual(['latency_p95_ms', '<=', 120]);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('routes the design station through design.agent and design.prompt', async () => {
    const cwd = tmp();
    const calls: Array<{ prompt: string; agent: string }> = [];
    await runResearch(cwd, 'Does X help?', {
      maxIterations: 1, noGates: true,
      design: {
        agent: 'grd-factory-builder',
        prompt: (_t, hyp) => `BUILD:${hyp.id}`,
        fixPrompt: () => 'FIX',
      },
      spawn: recorder(calls, plan('accuracy', '>=', 0.8)),
      runner: { run: () => result({ accuracy: 0.9 }) },
    });
    expect(calls).toContainEqual({ prompt: 'BUILD:h1', agent: 'grd-factory-builder' });
    expect(calls.some((c) => c.agent === 'grd-experiment-runner')).toBe(false);
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  it('routes the debug fix through design.fixPrompt', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning', 'config.json'), JSON.stringify({ research_max_debug_depth: 1 }));
    const calls: Array<{ prompt: string; agent: string }> = [];
    let runs = 0;
    await runResearch(cwd, 'Does X help?', {
      maxIterations: 1, noGates: true,
      design: {
        agent: 'grd-factory-builder',
        prompt: () => 'BUILD',
        fixPrompt: (_h, _p, r, _d, attempt) => `FIX:${attempt}:${r.stderrExcerpt}`,
      },
      spawn: recorder(calls, plan('accuracy', '>=', 0.8)),
      runner: { run: () => (++runs === 1 ? result({}, 1) : result({ accuracy: 0.9 })) },
    });
    expect(calls).toContainEqual({ prompt: 'FIX:1:boom', agent: 'grd-factory-builder' });
    fs.rmSync(cwd, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t "factory seams" --coverage=false`
Expected: the first test fails with `Expected: "supported", Received: "exhausted"`; the others fail on the missing calls.

- [ ] **Step 3: Implement.** In `lib/research/orchestrator.ts`:

Add after the `ResearchOptions` interface:

```ts
/**
 * Replaces the design station's agent and prompts — the initial design, the metric-absent
 * redesign, and the debug fix. Everything after the station (parse, contract pin, run,
 * verdict, learn) is unchanged. Used by the research factory, whose "experiment" is a code
 * change in a worktree rather than a script.
 */
export interface DesignOverride {
  agent: string;
  prompt: (thread: ResearchThread, hyp: Hypothesis, iterDir: string) => string;
  fixPrompt: (
    hyp: Hypothesis, plan: ExperimentPlan, result: ExperimentResult,
    iterDir: string, attempt: number, maxDepth: number,
  ) => string;
}
```

Add inside `ResearchOptions`:

```ts
  /**
   * Seeds the thread's pinned metric contract at creation, so the FIRST design is already
   * bound to it and pinThreadContract overwrites any drift. The research factory passes the
   * decision rule from a human-approved work order.
   */
  contract?: MetricContract;
  /** See DesignOverride. Absent = the grd-experiment-runner path, byte-identical. */
  design?: DesignOverride;
```

In `runResearch`, directly after `const thread = createThread(...)`:

```ts
  if (opts.contract) {
    thread.contract = { ...opts.contract };
    saveThread(cwd, thread);
  }
```

Change the design-station call from `spawn, buildExperimentPrompt(thread, hyp, iterDir), 'grd-experiment-runner',` to:

```ts
        spawn,
        opts.design ? opts.design.prompt(thread, hyp, iterDir) : buildExperimentPrompt(thread, hyp, iterDir),
        opts.design ? opts.design.agent : 'grd-experiment-runner',
```

Change the debug-fix call from `spawn, buildDebugFixPrompt(hyp, plan, result, iterDir, attempt, debugDepth), 'grd-experiment-runner',` to:

```ts
        spawn,
        opts.design
          ? opts.design.fixPrompt(hyp, plan, result, iterDir, attempt, debugDepth)
          : buildDebugFixPrompt(hyp, plan, result, iterDir, attempt, debugDepth),
        opts.design ? opts.design.agent : 'grd-experiment-runner',
```

- [ ] **Step 4: Run the whole orchestrator suite**

Run: `npx jest tests/unit/research/orchestrator.test.ts --coverage=false && npx tsc --noEmit`
Expected: all pass, including every pre-existing test (the defaults are unchanged).

- [ ] **Step 5: Mutation check.** Temporarily delete the `if (opts.contract) {…}` block, rerun the first new test, confirm it fails with `Received: "exhausted"`, then restore it.

- [ ] **Step 6: Commit**

```bash
git add lib/research/orchestrator.ts tests/unit/research/orchestrator.test.ts
git commit -q -F - <<'EOF'
feat(research): contract and design options on the research loop

The research factory drives the loop with a decision rule from a work order
and a code-building agent in place of the experiment designer. Both are
optional and default to today's behavior exactly.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 2: Enforce a spawned agent's tool restriction

**Files:**
- Modify: `lib/types.ts` (the `SpawnOpts` interface near line 543)
- Modify: `lib/scheduler.ts` (`_claudeAdapter.buildArgs`, near line 129)
- Test: `tests/unit/scheduler.test.ts` (append inside the existing Claude adapter `describe`, near line 113)

**Interfaces:**
- Produces: `SpawnOpts.disallowedTools?: string[]`.

- [ ] **Step 1: Write the failing tests**

```ts
    it('passes disallowedTools through as --disallowedTools', () => {
      const args = ADAPTERS.claude.buildArgs('p', { disallowedTools: ['Bash', 'WebFetch'] });
      const i = args.indexOf('--disallowedTools');
      expect(i).toBeGreaterThan(-1);
      expect(args.slice(i + 1, i + 3)).toEqual(['Bash', 'WebFetch']);
      expect(args.slice(-2)).toEqual(['--output-format', 'json']);
    });

    it('omits --disallowedTools when none are given', () => {
      expect(ADAPTERS.claude.buildArgs('p', {})).not.toContain('--disallowedTools');
      expect(ADAPTERS.claude.buildArgs('p', { disallowedTools: [] })).not.toContain('--disallowedTools');
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/scheduler.test.ts -t "disallowedTools" --coverage=false`
Expected: FAIL; also a TypeScript error that `disallowedTools` is not in `SpawnOpts`.

- [ ] **Step 3: Implement.** In `lib/types.ts`, inside `SpawnOpts`:

```ts
  /**
   * Tools removed from the spawned agent's context. The claude adapter passes them as
   * `--disallowedTools`, which removes a tool outright, so it holds under
   * --dangerously-skip-permissions (that flag only skips prompts for tools that exist).
   * Other adapters have no equivalent and ignore it; callers that depend on the
   * restriction check SchedulerSpawnResult.backend and warn.
   */
  disallowedTools?: string[];
```

In `lib/scheduler.ts`, inside `_claudeAdapter.buildArgs`, directly after the `if (opts.strictMcp) {…}` block:

```ts
    if (opts.disallowedTools && opts.disallowedTools.length > 0) {
      args.push('--disallowedTools', ...opts.disallowedTools);
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/scheduler.test.ts --coverage=false && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/scheduler.ts tests/unit/scheduler.test.ts
git commit -q -F - <<'EOF'
feat(scheduler): let a spawn remove tools from the agent

Every loop agent is spawned with --dangerously-skip-permissions and all
tools; the tools line in agents/*.md is never applied. disallowedTools is
passed to claude as --disallowedTools so a caller can actually take a tool
away, which the research factory's builder needs for its no-shell rule.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 3: Share the Docker hardening

**Files:**
- Modify: `lib/research/docker-runner.ts` (`buildDockerArgs`, the `MEMORY_RE` constant, `module.exports`)
- Test: `tests/unit/research/docker-runner.test.ts` (append)

**Interfaces:**
- Produces: `hardenedRunFlags(p: { network: string; memory: string; cpus: string }): string[]`; exported `MEMORY_RE: RegExp`.

- [ ] **Step 1: Write the failing test**

```ts
describe('hardenedRunFlags', () => {
  const { hardenedRunFlags, buildDockerArgs, MEMORY_RE } = require('../../../lib/research/docker-runner') as {
    hardenedRunFlags: (p: { network: string; memory: string; cpus: string }) => string[];
    buildDockerArgs: (p: Record<string, unknown>) => string[];
    MEMORY_RE: RegExp;
  };
  it('is exactly the hardening block buildDockerArgs uses', () => {
    const flags = hardenedRunFlags({ network: 'none', memory: '512m', cpus: '1' });
    expect(flags).toEqual([
      '--network', 'none', '--memory', '512m', '--cpus', '1', '--pids-limit', '256',
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--ipc', 'none',
      '--read-only', '--tmpfs', '/tmp',
    ]);
    const args = buildDockerArgs({
      containerName: 'c', iterDir: '/it', scriptBasename: 'run.sh', bin: 'bash',
      image: 'bash:5', memory: '512m', cpus: '1', network: 'none', user: null,
    });
    expect(args.slice(4, 4 + flags.length)).toEqual(flags);
  });
  it('exports the memory pattern', () => {
    expect(MEMORY_RE.test('2g')).toBe(true);
    expect(MEMORY_RE.test('lots')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest tests/unit/research/docker-runner.test.ts -t "hardenedRunFlags" --coverage=false`
Expected: FAIL, `hardenedRunFlags is not a function`.

- [ ] **Step 3: Implement.** Add above `buildDockerArgs`:

```ts
/**
 * The hardening every GRD container gets, shared by the experiment runner and the research
 * factory so a flag added here protects both: no network unless asked, capped memory, CPU
 * and PIDs, no capabilities, no privilege escalation, no shared IPC, a read-only root with a
 * scratch /tmp.
 */
function hardenedRunFlags(p: { network: string; memory: string; cpus: string }): string[] {
  return [
    '--network', p.network,
    '--memory', p.memory, '--cpus', p.cpus, '--pids-limit', '256',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--ipc', 'none',
    '--read-only', '--tmpfs', '/tmp',
  ];
}
```

Replace the six hardening lines inside `buildDockerArgs` (from `'--network', p.network,` through `'--read-only', '--tmpfs', '/tmp',`) with `...hardenedRunFlags(p),`. Add `hardenedRunFlags, MEMORY_RE` to `module.exports`.

- [ ] **Step 4: Run the whole docker-runner suite**

Run: `npx jest tests/unit/research/docker-runner.test.ts --coverage=false && npx tsc --noEmit`
Expected: PASS, including every pre-existing `buildDockerArgs` assertion.

- [ ] **Step 5: Commit**

```bash
git add lib/research/docker-runner.ts tests/unit/research/docker-runner.test.ts
git commit -q -F - <<'EOF'
refactor(sandbox): share the container hardening flags

The research factory runs candidate code in containers too. One shared flag
list means a hardening added later protects both runners. Output of
buildDockerArgs is unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 4: Factory foundation — types, exec, work orders

**Files:**
- Create: `lib/factory/types.ts`, `lib/factory/exec.ts`, `lib/factory/order.ts`
- Create: `tests/unit/factory/fixtures.ts`, `tests/unit/factory/order.test.ts`

**Interfaces:**
- Produces (`types.ts`): `WorkOrder`, `FactoryContract`, `SandboxSpec`, `DevEvalSpec`, `HiddenEvalSpec`, `Budget`, `Baseline`, `CandidateEvent`, `CandidateOutcome`, `StopReason`, `QueryRecord`, `SpendRecord`, `MeasureResult`.
- Produces (`exec.ts`): `type Exec = (bin: string, args: string[], opts?: { cwd?: string; timeout?: number }) => string`; `interface ExecError`; `defaultExec: Exec`.
- Produces (`order.ts`): `parseWorkOrder(raw: unknown): WorkOrder`; `factoryHome(env?): string`; `draftDir(home, id)`; `orderDir(home, id)`; `readDraft(home, id): WorkOrder`; `writeDraft(home, order): void`; `draftHash(home, id): string`; `markValidated(home, id): void`; `saveOrder(home, id): string`; `loadOrder(home, id): WorkOrder`.

- [ ] **Step 1: Create `lib/factory/types.ts`**

```ts
'use strict';
import type { Comparator } from '../research/types';

/** The human-approved decision rule, as the interview writes it. */
export interface FactoryContract { metric: string; comparator: Comparator; target: number; }
export interface SandboxSpec { image: string; setup: string; memory: string; cpus: number; }
/** `files`: repo-relative paths the dev evaluation itself reads or runs. Never editable. */
export interface DevEvalSpec { command: string; repeats: number; files: string[]; }
/** `script`: a path under `hidden/`, relative to the order's vault. */
export interface HiddenEvalSpec { script: string; repeats: number; }
export interface Budget { tokens: number; candidates: number; hidden_queries: number; wall_minutes: number; }
export interface Baseline { dev: number; hidden: number; devSpread: number; }

export interface WorkOrder {
  version: 1;
  id: string;
  repo: string;
  base: string;
  remote: string;
  objective: string;
  contract: FactoryContract;
  editable: string[];
  sandbox: SandboxSpec;
  dev_eval: DevEvalSpec;
  hidden_eval: HiddenEvalSpec;
  budget: Budget;
  baseline?: Baseline;
}

export type CandidateOutcome =
  | 'dev_miss' | 'out_of_scope' | 'tampering' | 'build_failed'
  | 'did_not_replicate' | 'rejected_at_gate' | 'shipped';

/**
 * One append-only row of candidates.jsonl; rows with the same `id` fold left to right.
 * Never carries a hidden-evaluation value: these rows feed the next hypothesis prompt.
 */
export interface CandidateEvent {
  id: string;
  at: string;
  attempt?: number;
  threadId?: string;
  iteration?: number;
  hypothesis?: string;
  strategy?: string;
  devMedian?: number | null;
  replicaDevMedian?: number | null;
  outcome?: CandidateOutcome;
  detail?: string;
}

export type StopReason =
  | 'shipped' | 'budget_spent' | 'holdout_spent' | 'plateau'
  | 'hidden_broken' | 'build_failures' | 'docker_unavailable';

/** One row of queries.jsonl. The `started` row is written before the hidden evaluation runs. */
export interface QueryRecord {
  candidate: string;
  status: 'started' | 'pass' | 'fail' | 'broken';
  median?: number | null;
  at: string;
}

export interface SpendRecord { agent: string; candidate: string | null; tokens: number; backend: string; at: string; }

export interface MeasureResult {
  ok: boolean;
  values: number[];
  median: number | null;
  exitCode: number;
  stdoutExcerpt: string;
  stderrExcerpt: string;
}
```

- [ ] **Step 2: Create `lib/factory/exec.ts`**

```ts
'use strict';
const { execFileSync } = require('child_process');

/**
 * Runs a binary with an argument array — never a shell — and returns stdout. Throws on a
 * nonzero exit or a timeout, with `status`, `stdout`, `stderr` and `signal` on the error,
 * exactly like execFileSync. Injected everywhere, so tests can fake docker and gh.
 */
export type Exec = (bin: string, args: string[], opts?: { cwd?: string; timeout?: number }) => string;

export interface ExecError extends Error { status?: number; stdout?: string; stderr?: string; signal?: string; }

const defaultExec: Exec = (bin, args, opts = {}) => execFileSync(bin, args, {
  cwd: opts.cwd,
  timeout: opts.timeout,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
}) as string;

module.exports = { defaultExec };
```

- [ ] **Step 3: Create `tests/unit/factory/fixtures.ts`** (shared helpers; its name does not end in `.test.ts`, so Jest never runs it as a suite)

```ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
import type { Exec } from '../../../lib/factory/exec';
import type { WorkOrder } from '../../../lib/factory/types';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix)) as string;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }) as string;
}

/** A committed repo on branch main, with an `origin` remote that is never contacted. */
function makeRepo(files: Record<string, string>): string {
  const repo = tmpDir('grd-factory-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'remote', 'add', 'origin', 'https://example.invalid/acme/app.git');
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), content);
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

const realExec: Exec = (bin, args, opts = {}) => execFileSync(bin, args, {
  cwd: opts.cwd, timeout: opts.timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}) as string;

/** The host path a factory container mounts at /work. */
function mountedWorktree(args: string[]): string | null {
  for (const a of args) {
    const m = /^type=bind,src=(.+),dst=\/work$/.exec(a);
    if (m) return m[1];
  }
  return null;
}

/** The shell command a factory container runs: the argument after the last `-c`. */
function containerCommand(args: string[]): string {
  const i = args.lastIndexOf('-c');
  return i >= 0 ? args[i + 1] : '';
}

/** A failing exec error, shaped like execFileSync's. */
function execFailure(status: number, stderr: string, stdout = ''): Error {
  return Object.assign(new Error(stderr), { status, stderr, stdout });
}

/** Real git; fake docker and gh. `onRun` answers each `docker run`. Every call is logged. */
function fakeExec(onRun: (args: string[]) => string, calls: string[][] = []): Exec {
  return (bin, args, opts) => {
    calls.push([bin, ...args]);
    if (bin === 'docker') {
      if (args[0] === 'version') return '27.0.0\n';
      if (args[0] === 'rm') return '';
      if (args[0] === 'run') return onRun(args);
      throw new Error(`unexpected docker ${args[0]}`);
    }
    if (bin === 'gh') {
      if (args[0] === 'auth') return 'Logged in\n';
      if (args[0] === 'pr') return 'https://github.com/acme/app/pull/7\n';
      throw new Error(`unexpected gh ${args[0]}`);
    }
    if (bin === 'git' && args.includes('push')) return '';
    return realExec(bin, args, opts);
  };
}

function sampleOrder(repo: string, over: Partial<WorkOrder> = {}): WorkOrder {
  return {
    version: 1, id: 'search-p95', repo, base: 'main', remote: 'origin',
    objective: 'Cut p95 latency of search.',
    contract: { metric: 'latency_p95_ms', comparator: '<=', target: 120 },
    editable: ['src/**'],
    sandbox: { image: 'node:22-bookworm', setup: '', memory: '1g', cpus: 1 },
    dev_eval: { command: 'node bench/run.js', repeats: 1, files: ['bench/run.js', 'package.json'] },
    hidden_eval: { script: 'hidden/eval.sh', repeats: 1 },
    budget: { tokens: 1000000, candidates: 3, hidden_queries: 2, wall_minutes: 60 },
    baseline: { dev: 187, hidden: 191.37, devSpread: 0 },
    ...over,
  };
}

/** Writes a saved order straight into `<home>/orders/<id>/vault`, as `save` would leave it. */
function installOrder(home: string, order: WorkOrder, hiddenScript = 'echo HIDDEN_EVAL_MARKER\n'): string {
  const od = path.join(home, 'orders', order.id);
  fs.mkdirSync(path.join(od, 'vault', 'hidden'), { recursive: true });
  fs.writeFileSync(path.join(od, 'vault', 'order.json'), JSON.stringify(order, null, 2));
  fs.writeFileSync(path.join(od, 'vault', order.hidden_eval.script), hiddenScript);
  return od;
}

/** Worktrees registered in a repo, including the repo's own. */
function worktreeCount(repo: string): number {
  return git(repo, 'worktree', 'list').split('\n').filter(Boolean).length;
}

module.exports = {
  tmpDir, git, makeRepo, realExec, mountedWorktree, containerCommand, execFailure,
  fakeExec, sampleOrder, installOrder, worktreeCount,
};
```

- [ ] **Step 4: Write the failing tests** — `tests/unit/factory/order.test.ts`:

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { WorkOrder } from '../../../lib/factory/types';
const order = require('../../../lib/factory/order') as {
  parseWorkOrder: (raw: unknown) => WorkOrder;
  factoryHome: (env?: Record<string, string | undefined>) => string;
  draftDir: (home: string, id: string) => string;
  orderDir: (home: string, id: string) => string;
  readDraft: (home: string, id: string) => WorkOrder;
  writeDraft: (home: string, o: WorkOrder) => void;
  markValidated: (home: string, id: string) => void;
  saveOrder: (home: string, id: string) => string;
  loadOrder: (home: string, id: string) => WorkOrder;
};
const { tmpDir, sampleOrder } = require('./fixtures') as {
  tmpDir: (p: string) => string;
  sampleOrder: (repo: string, over?: Partial<WorkOrder>) => WorkOrder;
};

describe('parseWorkOrder', () => {
  const good = (): Record<string, unknown> => JSON.parse(JSON.stringify(sampleOrder('/abs/repo')));

  it('accepts a complete order and keeps every field', () => {
    expect(order.parseWorkOrder(good())).toEqual(sampleOrder('/abs/repo'));
  });

  it('defaults dev_eval.files to an empty list', () => {
    const raw = good();
    delete (raw.dev_eval as Record<string, unknown>).files;
    expect(order.parseWorkOrder(raw).dev_eval.files).toEqual([]);
  });

  const cases: Array<[string, (r: Record<string, unknown>) => void, RegExp]> = [
    ['an empty object', (r) => { Object.keys(r).forEach((k) => delete r[k]); }, /version must be 1/],
    ['a bad id', (r) => { r.id = 'Search P95'; }, /id "Search P95"/],
    ['a relative repo', (r) => { r.repo = 'repo'; }, /absolute path/],
    ['an unknown comparator', (r) => { (r.contract as Record<string, unknown>).comparator = '=>'; }, /comparator must be one of/],
    ['a hidden script outside hidden/', (r) => { (r.hidden_eval as Record<string, unknown>).script = 'eval.sh'; }, /under hidden\//],
    ['a hidden script escaping with ..', (r) => { (r.hidden_eval as Record<string, unknown>).script = 'hidden/../x.sh'; }, /under hidden\//],
    ['a bad memory size', (r) => { (r.sandbox as Record<string, unknown>).memory = 'lots'; }, /512m or 2g/],
    ['an invalid image', (r) => { (r.sandbox as Record<string, unknown>).image = '-evil'; }, /not a valid image/],
    ['zero repeats', (r) => { (r.dev_eval as Record<string, unknown>).repeats = 0; }, /positive integer/],
    ['an empty allowlist', (r) => { r.editable = []; }, /non-empty list/],
  ];
  it.each(cases)('rejects %s', (_name, mutate, msg) => {
    const raw = good();
    mutate(raw);
    expect(() => order.parseWorkOrder(raw)).toThrow(msg);
  });
});

describe('factory home, drafts and saved orders', () => {
  it('honors GRD_FACTORY_HOME and defaults under the home directory', () => {
    expect(order.factoryHome({ GRD_FACTORY_HOME: '/x/y' })).toBe('/x/y');
    expect(order.factoryHome({})).toMatch(/[/\\]\.grd[/\\]factory$/);
  });

  function draft(home: string): WorkOrder {
    const o = sampleOrder('/abs/repo');
    order.writeDraft(home, o);
    fs.mkdirSync(path.join(order.draftDir(home, o.id), 'hidden'), { recursive: true });
    fs.writeFileSync(path.join(order.draftDir(home, o.id), 'hidden', 'eval.sh'), 'echo hi\n');
    return o;
  }

  it('refuses to save a draft that never passed validate', () => {
    const home = tmpDir('grd-factory-home-');
    const o = draft(home);
    expect(() => order.saveOrder(home, o.id)).toThrow(/has not passed validate/);
  });

  it('refuses to save a draft edited after validate', () => {
    const home = tmpDir('grd-factory-home-');
    const o = draft(home);
    order.markValidated(home, o.id);
    fs.writeFileSync(path.join(order.draftDir(home, o.id), 'hidden', 'eval.sh'), 'echo changed\n');
    expect(() => order.saveOrder(home, o.id)).toThrow(/changed after validate/);
  });

  it('moves a validated draft into the vault and loads it back', () => {
    const home = tmpDir('grd-factory-home-');
    const o = draft(home);
    order.markValidated(home, o.id);
    const od = order.saveOrder(home, o.id);
    expect(od).toBe(order.orderDir(home, o.id));
    expect(fs.existsSync(order.draftDir(home, o.id))).toBe(false);
    expect(fs.existsSync(path.join(od, 'vault', 'hidden', 'eval.sh'))).toBe(true);
    expect(fs.existsSync(path.join(od, 'vault', 'validated.json'))).toBe(false);
    expect(order.loadOrder(home, o.id)).toEqual(o);
  });
});
```

- [ ] **Step 5: Run to verify they fail**

Run: `npx jest tests/unit/factory/order.test.ts --coverage=false`
Expected: FAIL, `Cannot find module '../../../lib/factory/order'`.

- [ ] **Step 6: Create `lib/factory/order.ts`**

```ts
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
import type { Comparator } from '../research/types';
import type { WorkOrder } from './types';
const { validateImage, MEMORY_RE } = require('../research/docker-runner') as {
  validateImage: (v: unknown) => string | null;
  MEMORY_RE: RegExp;
};

const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const COMPARATORS: ReadonlySet<string> = new Set(['>=', '<=', '>', '<', '==']);

function fail(msg: string): never { throw new Error(`work order: ${msg}`); }
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function obj(o: Record<string, unknown>, k: string, where: string): Record<string, unknown> {
  const v = o[k];
  return isObj(v) ? v : fail(`${where}.${k} must be an object`);
}
function str(o: Record<string, unknown>, k: string, where: string): string {
  const v = o[k];
  return typeof v === 'string' && v.trim() !== '' ? v : fail(`${where}.${k} must be a non-empty string`);
}
function posInt(o: Record<string, unknown>, k: string, where: string): number {
  const v = o[k];
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : fail(`${where}.${k} must be a positive integer`);
}
function finite(o: Record<string, unknown>, k: string, where: string): number {
  const v = o[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : fail(`${where}.${k} must be a finite number`);
}
function strList(v: unknown, where: string, allowEmpty: boolean): string[] {
  const ok = Array.isArray(v) && (allowEmpty || v.length > 0)
    && v.every((s) => typeof s === 'string' && s.trim() !== '');
  return ok ? (v as string[]) : fail(`${where} must be a ${allowEmpty ? '' : 'non-empty '}list of strings`);
}
function assertId(id: string): string {
  return ID_RE.test(id) ? id : fail(`id "${id}" must be lowercase letters, digits and dashes, at most 63 characters`);
}

/** Structural check of a work order. Throws with the offending field named. */
function parseWorkOrder(raw: unknown): WorkOrder {
  if (!isObj(raw)) return fail('must be a JSON object');
  if (raw.version !== 1) fail('version must be 1');
  const repo = str(raw, 'repo', 'order');
  if (!path.isAbsolute(repo)) fail('order.repo must be an absolute path');
  const contract = obj(raw, 'contract', 'order');
  const comparator = str(contract, 'comparator', 'contract');
  if (!COMPARATORS.has(comparator)) fail(`contract.comparator must be one of ${[...COMPARATORS].join(' ')}`);
  const sandbox = obj(raw, 'sandbox', 'order');
  const image = str(sandbox, 'image', 'sandbox');
  if (validateImage(image) === null) fail(`sandbox.image "${image}" is not a valid image reference`);
  const memory = str(sandbox, 'memory', 'sandbox');
  if (!MEMORY_RE.test(memory)) fail('sandbox.memory must look like 512m or 2g');
  if (typeof sandbox.setup !== 'string') fail('sandbox.setup must be a string, empty for no setup');
  if (typeof sandbox.cpus !== 'number' || !(sandbox.cpus > 0)) fail('sandbox.cpus must be a positive number');
  const dev = obj(raw, 'dev_eval', 'order');
  const hidden = obj(raw, 'hidden_eval', 'order');
  const script = str(hidden, 'script', 'hidden_eval');
  if (!script.startsWith('hidden/') || script.split('/').includes('..')) {
    fail('hidden_eval.script must be a path under hidden/ with no ".." segment');
  }
  const budget = obj(raw, 'budget', 'order');
  const parsed: WorkOrder = {
    version: 1,
    id: assertId(str(raw, 'id', 'order')),
    repo,
    base: str(raw, 'base', 'order'),
    remote: str(raw, 'remote', 'order'),
    objective: str(raw, 'objective', 'order'),
    contract: {
      metric: str(contract, 'metric', 'contract'),
      comparator: comparator as Comparator,
      target: finite(contract, 'target', 'contract'),
    },
    editable: strList(raw.editable, 'order.editable', false),
    sandbox: { image, setup: sandbox.setup as string, memory, cpus: sandbox.cpus as number },
    dev_eval: {
      command: str(dev, 'command', 'dev_eval'),
      repeats: posInt(dev, 'repeats', 'dev_eval'),
      files: dev.files === undefined ? [] : strList(dev.files, 'dev_eval.files', true),
    },
    hidden_eval: { script, repeats: posInt(hidden, 'repeats', 'hidden_eval') },
    budget: {
      tokens: posInt(budget, 'tokens', 'budget'),
      candidates: posInt(budget, 'candidates', 'budget'),
      hidden_queries: posInt(budget, 'hidden_queries', 'budget'),
      wall_minutes: posInt(budget, 'wall_minutes', 'budget'),
    },
  };
  if (raw.baseline !== undefined) {
    const b = obj(raw, 'baseline', 'order');
    parsed.baseline = {
      dev: finite(b, 'dev', 'baseline'),
      hidden: finite(b, 'hidden', 'baseline'),
      devSpread: finite(b, 'devSpread', 'baseline'),
    };
  }
  return parsed;
}

/** Where drafts and orders live: outside every repository. */
function factoryHome(env: Record<string, string | undefined> = process.env): string {
  const override = env.GRD_FACTORY_HOME;
  return override ? path.resolve(override) : path.join(os.homedir(), '.grd', 'factory');
}
function draftDir(home: string, id: string): string { return path.join(home, 'drafts', assertId(id)); }
function orderDir(home: string, id: string): string { return path.join(home, 'orders', assertId(id)); }

function readJson(file: string): unknown { return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown; }

function readDraft(home: string, id: string): WorkOrder {
  return parseWorkOrder(readJson(path.join(draftDir(home, id), 'draft.json')));
}
function writeDraft(home: string, o: WorkOrder): void {
  const dir = draftDir(home, o.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify(o, null, 2) + '\n');
}

function listFiles(root: string, rel = ''): string[] {
  const out: string[] = [];
  const entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }) as Array<{ name: string; isDirectory(): boolean }>;
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listFiles(root, r)); else out.push(r);
  }
  return out.sort();
}

/** A hash of everything validate judged — draft.json and hidden/ — never the marker itself. */
function draftHash(home: string, id: string): string {
  const dir = draftDir(home, id);
  const h = crypto.createHash('sha256');
  for (const rel of listFiles(dir).filter((r) => r !== 'validated.json')) {
    h.update(rel); h.update('\0'); h.update(fs.readFileSync(path.join(dir, rel))); h.update('\0');
  }
  return h.digest('hex') as string;
}
function markValidated(home: string, id: string): void {
  fs.writeFileSync(path.join(draftDir(home, id), 'validated.json'), JSON.stringify({ hash: draftHash(home, id) }) + '\n');
}

/** Moves a validated, unchanged draft into `orders/<id>/vault`. Returns the order directory. */
function saveOrder(home: string, id: string): string {
  const dd = draftDir(home, id);
  const marker = path.join(dd, 'validated.json');
  if (!fs.existsSync(marker)) throw new Error(`save: draft "${id}" has not passed validate`);
  const { hash } = readJson(marker) as { hash?: string };
  if (hash !== draftHash(home, id)) throw new Error(`save: draft "${id}" changed after validate passed; run validate again`);
  if (!readDraft(home, id).baseline) throw new Error(`save: draft "${id}" has no baseline; run validate again`);
  const od = orderDir(home, id);
  if (fs.existsSync(od)) throw new Error(`save: order "${id}" already exists at ${od}`);
  fs.mkdirSync(od, { recursive: true });
  const vault = path.join(od, 'vault');
  fs.renameSync(dd, vault);
  fs.renameSync(path.join(vault, 'draft.json'), path.join(vault, 'order.json'));
  fs.rmSync(path.join(vault, 'validated.json'), { force: true });
  return od;
}

function loadOrder(home: string, id: string): WorkOrder {
  return parseWorkOrder(readJson(path.join(orderDir(home, id), 'vault', 'order.json')));
}

module.exports = {
  parseWorkOrder, factoryHome, draftDir, orderDir, readDraft, writeDraft,
  draftHash, markValidated, saveOrder, loadOrder,
};
```

Note: the "moves a validated draft" test calls `markValidated` on a draft whose `baseline` is set by `sampleOrder`, so `saveOrder`'s baseline check passes.

- [ ] **Step 7: Run to verify they pass**

Run: `npx jest tests/unit/factory/order.test.ts --coverage=false && npx tsc --noEmit && npx eslint lib/factory`
Expected: PASS, no type or lint errors.

- [ ] **Step 8: Commit**

```bash
git add lib/factory/types.ts lib/factory/exec.ts lib/factory/order.ts tests/unit/factory/fixtures.ts tests/unit/factory/order.test.ts
git commit -q -F - <<'EOF'
feat(factory): work orders, drafts and the save handshake

A work order is checked field by field with the offending field named. A
draft can only be saved if validate passed on byte-identical content, so a
hidden evaluation edited after validation can never ship unchecked.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 5: The factory sandbox

**Files:**
- Create: `lib/factory/sandbox.ts`
- Test: `tests/unit/factory/sandbox.test.ts`

**Interfaces:**
- Consumes: `hardenedRunFlags`, `dockerAvailable` (docker-runner); `parseMetricsLine` (runner); `Exec`, `ExecError`; `SandboxSpec`, `MeasureResult`.
- Produces: `interface SandboxCtx { exec: Exec; ledgerDir: string; orderId: string; user: string | null; timeoutMs: number }`; `buildContainerArgs(spec): string[]`; `hostUser(): string | null`; `dockerReady(exec): boolean`; `runSetup(ctx, sandbox, worktree, label): { ok: boolean; detail: string }`; `measure(ctx, sandbox, worktree, command, repeats, metric, label, hiddenMount?): MeasureResult`; `removeRecordedContainers(exec, dir): void`; `median(xs): number`; `spread(xs): number`; `DEFAULT_TIMEOUT_MS: number`.

- [ ] **Step 1: Write the failing tests**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { MeasureResult, SandboxSpec } from '../../../lib/factory/types';
import type { SandboxCtx } from '../../../lib/factory/sandbox';
const sb = require('../../../lib/factory/sandbox') as {
  buildContainerArgs: (s: Record<string, unknown>) => string[];
  runSetup: (c: SandboxCtx, s: SandboxSpec, wt: string, label: string) => { ok: boolean; detail: string };
  measure: (c: SandboxCtx, s: SandboxSpec, wt: string, cmd: string, n: number, metric: string, label: string,
    hidden?: { src: string; dst: string }) => MeasureResult;
  removeRecordedContainers: (exec: Exec, dir: string) => void;
  median: (xs: number[]) => number;
  spread: (xs: number[]) => number;
};
const { tmpDir, execFailure } = require('./fixtures') as {
  tmpDir: (p: string) => string; execFailure: (s: number, e: string, o?: string) => Error;
};

const SANDBOX: SandboxSpec = { image: 'node:22-bookworm', setup: 'npm ci', memory: '1g', cpus: 2 };
function ctxWith(exec: Exec): SandboxCtx {
  return { exec, ledgerDir: tmpDir('grd-factory-ledger-'), orderId: 'o1', user: '501:20', timeoutMs: 1000 };
}

describe('buildContainerArgs', () => {
  it('hardens, mounts the worktree, and never mounts the hidden directory writable', () => {
    const args = sb.buildContainerArgs({
      name: 'n', worktree: '/wt', sandbox: SANDBOX, network: 'none', command: 'npm run bench',
      user: '501:20', hiddenMount: { src: '/vault/hidden', dst: '/grader-ab' },
    });
    expect(args.slice(0, 4)).toEqual(['run', '--rm', '--name', 'n']);
    expect(args).toEqual(expect.arrayContaining(['--network', 'none', '--memory', '1g', '--cpus', '2', '--read-only']));
    expect(args).toContain('type=bind,src=/wt,dst=/work');
    expect(args).toContain('type=bind,src=/vault/hidden,dst=/grader-ab,readonly');
    expect(args.slice(-4)).toEqual(['sh', 'node:22-bookworm', '-c', 'npm run bench']);
    expect(args[args.indexOf('--user') + 1]).toBe('501:20');
    expect(args[args.indexOf('--env') + 1]).toBe('HOME=/tmp');
  });
});

describe('runSetup', () => {
  it('runs nothing when there is no setup command', () => {
    const calls: string[][] = [];
    const r = sb.runSetup(ctxWith((b, a) => { calls.push([b, ...a]); return ''; }), { ...SANDBOX, setup: ' ' }, '/wt', 's');
    expect(r.ok).toBe(true);
    expect(calls).toEqual([]);
  });
  it('runs setup with network on and reports a failure', () => {
    const calls: string[][] = [];
    const r = sb.runSetup(ctxWith((b, a) => { calls.push([b, ...a]); throw execFailure(1, 'npm ERR!'); }), SANDBOX, '/wt', 's');
    expect(calls[0]).toEqual(expect.arrayContaining(['--network', 'bridge']));
    expect(r).toEqual({ ok: false, detail: expect.stringContaining('npm ERR!') });
  });
});

describe('measure', () => {
  it('takes the median over repeats', () => {
    const outs = ['__RESULT__ {"lat": 30}', '__RESULT__ {"lat": 10}', '__RESULT__ {"lat": 20}'];
    let i = 0;
    const m = sb.measure(ctxWith(() => outs[i++]), SANDBOX, '/wt', 'b', 3, 'lat', 'dev');
    expect(m).toEqual(expect.objectContaining({ ok: true, values: [30, 10, 20], median: 20 }));
  });
  it('fails on a nonzero exit without further runs', () => {
    let runs = 0;
    const m = sb.measure(ctxWith(() => { runs++; throw execFailure(2, 'crash'); }), SANDBOX, '/wt', 'b', 3, 'lat', 'dev');
    expect(runs).toBe(1);
    expect(m).toEqual(expect.objectContaining({ ok: false, median: null, exitCode: 2, stderrExcerpt: 'crash' }));
  });
  it('fails when the metric is not printed', () => {
    const m = sb.measure(ctxWith(() => '__RESULT__ {"other": 1}'), SANDBOX, '/wt', 'b', 1, 'lat', 'dev');
    expect(m.ok).toBe(false);
    expect(m.stderrExcerpt).toMatch(/metric "lat" not printed/);
  });
});

describe('container ledger', () => {
  it('removes exactly the recorded containers and forgets them', () => {
    const calls: string[][] = [];
    const exec: Exec = (b, a) => { calls.push([b, ...a]); return '__RESULT__ {"lat": 1}'; };
    const ctx = ctxWith(exec);
    sb.measure(ctx, SANDBOX, '/wt', 'b', 2, 'lat', 'dev');
    const names = calls.filter((c) => c[1] === 'run').map((c) => c[c.indexOf('--name') + 1]);
    calls.length = 0;
    sb.removeRecordedContainers(exec, ctx.ledgerDir);
    expect(calls).toEqual(names.map((n) => ['docker', 'rm', '-f', n]));
    expect(fs.existsSync(path.join(ctx.ledgerDir, 'containers.jsonl'))).toBe(false);
  });
});

describe('median and spread', () => {
  it('handles odd and even lengths', () => {
    expect(sb.median([3, 1, 2])).toBe(2);
    expect(sb.median([4, 1, 3, 2])).toBe(2.5);
    expect(sb.spread([5, 9, 7])).toBe(4);
    expect(sb.spread([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/factory/sandbox.test.ts --coverage=false`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `lib/factory/sandbox.ts`**

```ts
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
import type { Exec, ExecError } from './exec';
import type { MeasureResult, SandboxSpec } from './types';
const { hardenedRunFlags, dockerAvailable } = require('../research/docker-runner') as {
  hardenedRunFlags: (p: { network: string; memory: string; cpus: string }) => string[];
  dockerAvailable: (exec: (args: string[], o?: { timeout?: number }) => string, timeoutMs: number) => boolean;
};
const { parseMetricsLine } = require('../research/runner') as {
  parseMetricsLine: (s: string) => Record<string, number>;
};

/** Per-run timeout for one container, the same default the research loop uses. */
const DEFAULT_TIMEOUT_MS = Number(process.env.GRD_EXPERIMENT_TIMEOUT_MS) > 0
  ? Number(process.env.GRD_EXPERIMENT_TIMEOUT_MS) : 600000;

export interface SandboxCtx {
  exec: Exec;
  /** Where containers.jsonl records every container this run starts. */
  ledgerDir: string;
  orderId: string;
  user: string | null;
  timeoutMs: number;
}

export interface ContainerSpec {
  name: string;
  worktree: string;
  sandbox: SandboxSpec;
  network: 'none' | 'bridge';
  command: string;
  user: string | null;
  hiddenMount?: { src: string; dst: string };
}

function buildContainerArgs(s: ContainerSpec): string[] {
  return [
    'run', '--rm', '--name', s.name,
    ...hardenedRunFlags({ network: s.network, memory: s.sandbox.memory, cpus: String(s.sandbox.cpus) }),
    // The root filesystem is read-only; package managers need a writable home for caches.
    '--env', 'HOME=/tmp',
    '--mount', `type=bind,src=${s.worktree},dst=/work`, '-w', '/work',
    ...(s.hiddenMount ? ['--mount', `type=bind,src=${s.hiddenMount.src},dst=${s.hiddenMount.dst},readonly`] : []),
    ...(s.user ? ['--user', s.user] : []),
    '--entrypoint', 'sh',
    s.sandbox.image,
    '-c', s.command,
  ];
}

/** Run containers as the host user, so files they write into a worktree stay removable. */
function hostUser(): string | null {
  return typeof process.getuid === 'function' && typeof process.getgid === 'function'
    ? `${process.getuid()}:${process.getgid()}` : null;
}

function dockerReady(exec: Exec): boolean {
  return dockerAvailable((args, o) => exec('docker', args, o), 5000);
}

function ledgerFile(dir: string): string { return path.join(dir, 'containers.jsonl'); }

function runContainer(
  ctx: SandboxCtx, spec: Omit<ContainerSpec, 'name' | 'user'>, label: string,
): { exitCode: number; stdout: string; stderr: string } {
  const name = `grd-factory-${ctx.orderId}-${label}-${crypto.randomBytes(3).toString('hex') as string}`;
  fs.mkdirSync(ctx.ledgerDir, { recursive: true });
  fs.appendFileSync(ledgerFile(ctx.ledgerDir), JSON.stringify({ name }) + '\n');
  try {
    const stdout = ctx.exec('docker', buildContainerArgs({ ...spec, name, user: ctx.user }), { timeout: ctx.timeoutMs });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as ExecError;
    if (err.signal === 'SIGTERM') {
      try { ctx.exec('docker', ['rm', '-f', name], { timeout: 15000 }); } catch { /* already gone */ }
    }
    return {
      exitCode: typeof err.status === 'number' ? err.status : 1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || err.message || ''),
    };
  }
}

/** Removes exactly the containers this ledger recorded — never by pattern — then forgets them. */
function removeRecordedContainers(exec: Exec, dir: string): void {
  const file = ledgerFile(dir);
  if (!fs.existsSync(file)) return;
  for (const line of String(fs.readFileSync(file, 'utf8')).split('\n').filter(Boolean)) {
    const { name } = JSON.parse(line) as { name: string };
    try { exec('docker', ['rm', '-f', name], { timeout: 15000 }); } catch { /* --rm already removed it */ }
  }
  fs.rmSync(file, { force: true });
}

function runSetup(ctx: SandboxCtx, sandbox: SandboxSpec, worktree: string, label: string): { ok: boolean; detail: string } {
  if (sandbox.setup.trim() === '') return { ok: true, detail: 'no setup command' };
  const r = runContainer(ctx, { worktree, sandbox, network: 'bridge', command: sandbox.setup }, label);
  return r.exitCode === 0
    ? { ok: true, detail: '' }
    : { ok: false, detail: `setup exited ${r.exitCode}: ${r.stderr.slice(0, 2000)}` };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function spread(xs: number[]): number {
  return xs.length === 0 ? 0 : Math.max(...xs) - Math.min(...xs);
}

/** Runs `command` `repeats` times with network off and takes the median of `metric`. */
function measure(
  ctx: SandboxCtx, sandbox: SandboxSpec, worktree: string, command: string, repeats: number,
  metric: string, label: string, hiddenMount?: { src: string; dst: string },
): MeasureResult {
  const values: number[] = [];
  let lastStdout = '';
  for (let i = 1; i <= repeats; i++) {
    const r = runContainer(ctx, { worktree, sandbox, network: 'none', command, hiddenMount }, `${label}-${i}`);
    lastStdout = r.stdout;
    if (r.exitCode !== 0) {
      return {
        ok: false, values, median: null, exitCode: r.exitCode,
        stdoutExcerpt: r.stdout.slice(0, 2000), stderrExcerpt: r.stderr.slice(0, 2000),
      };
    }
    const v = parseMetricsLine(r.stdout)[metric];
    if (typeof v !== 'number') {
      return {
        ok: false, values, median: null, exitCode: 0,
        stdoutExcerpt: r.stdout.slice(0, 2000), stderrExcerpt: `metric "${metric}" not printed as __RESULT__`,
      };
    }
    values.push(v);
  }
  return { ok: true, values, median: median(values), exitCode: 0, stdoutExcerpt: lastStdout.slice(0, 2000), stderrExcerpt: '' };
}

module.exports = {
  DEFAULT_TIMEOUT_MS, buildContainerArgs, hostUser, dockerReady, runSetup, measure,
  removeRecordedContainers, median, spread,
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/factory/sandbox.test.ts --coverage=false && npx tsc --noEmit && npx eslint lib/factory`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/factory/sandbox.ts tests/unit/factory/sandbox.test.ts
git commit -q -F - <<'EOF'
feat(factory): run setup and evaluations in hardened containers

Setup gets network; evaluations never do. Every container is recorded by
exact name before it starts, so a crashed run can clean up its own
containers and nothing else.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 6: Worktrees

**Files:**
- Create: `lib/factory/worktrees.ts`
- Test: `tests/unit/factory/worktrees.test.ts`

**Interfaces:**
- Produces: `addWorktree(exec, repo, dir, base): string`; `untrackedPaths(exec, dir): string[]`; `restoreToSetupState(exec, dir, base, artifacts: ReadonlySet<string>): void`; `removeWorktree(exec, repo, dir): void`; `removeAllOwn(exec, repo, root): void`; `commitCandidate(exec, dir, branch, paths, message): void`.

- [ ] **Step 1: Write the failing tests**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
const w = require('../../../lib/factory/worktrees') as {
  addWorktree: (e: Exec, repo: string, dir: string, base: string) => string;
  untrackedPaths: (e: Exec, dir: string) => string[];
  restoreToSetupState: (e: Exec, dir: string, base: string, a: ReadonlySet<string>) => void;
  removeWorktree: (e: Exec, repo: string, dir: string) => void;
  removeAllOwn: (e: Exec, repo: string, root: string) => void;
  commitCandidate: (e: Exec, dir: string, branch: string, paths: string[], msg: string) => void;
};
const fx = require('./fixtures') as {
  tmpDir: (p: string) => string; git: (cwd: string, ...a: string[]) => string;
  makeRepo: (f: Record<string, string>) => string; realExec: Exec; worktreeCount: (r: string) => number;
};

describe('candidate worktrees', () => {
  it('adds a detached worktree at base and removes every own worktree', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a', 'README.md': 'r' });
    const root = fx.tmpDir('grd-factory-wt-');
    const a = w.addWorktree(fx.realExec, repo, path.join(root, 'c1'), 'main');
    w.addWorktree(fx.realExec, repo, path.join(root, 'c2'), 'main');
    expect(fs.readFileSync(path.join(a, 'src/a.js'), 'utf8')).toBe('a');
    expect(fx.worktreeCount(repo)).toBe(3);
    w.removeAllOwn(fx.realExec, repo, root);
    expect(fx.worktreeCount(repo)).toBe(1);
  });

  it('lists untracked directories as single entries', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a' });
    const dir = w.addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.mkdirSync(path.join(dir, '.venv/lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.venv/lib/x.py'), 'x');
    fs.writeFileSync(path.join(dir, 'src/new.js'), 'n');
    expect(w.untrackedPaths(fx.realExec, dir)).toEqual(['.venv/', 'src/new.js']);
  });

  it('restores a redesigned candidate to its setup state, keeping setup artifacts', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a' });
    const dir = w.addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.mkdirSync(path.join(dir, '.venv'));
    fs.writeFileSync(path.join(dir, '.venv/keep'), 'k');
    const artifacts = new Set(w.untrackedPaths(fx.realExec, dir));
    fs.writeFileSync(path.join(dir, 'src/a.js'), 'changed');
    fs.writeFileSync(path.join(dir, 'src/extra.js'), 'e');
    w.restoreToSetupState(fx.realExec, dir, 'main', artifacts);
    expect(fs.readFileSync(path.join(dir, 'src/a.js'), 'utf8')).toBe('a');
    expect(fs.existsSync(path.join(dir, 'src/extra.js'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.venv/keep'))).toBe(true);
  });

  it('commits exactly the given paths on a new branch', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a', 'README.md': 'r' });
    const dir = w.addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(dir, 'src/a.js'), 'fast');
    fs.writeFileSync(path.join(dir, 'stray.log'), 'noise');
    w.commitCandidate(fx.realExec, dir, 'factory/o/c1', ['src/a.js'], 'factory: speed');
    expect(fx.git(repo, 'diff', '--name-only', 'main', 'factory/o/c1').trim()).toBe('src/a.js');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/factory/worktrees.test.ts --coverage=false`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `lib/factory/worktrees.ts`**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from './exec';

/** A detached worktree of `repo` at `base`. The user's own working copy is never touched. */
function addWorktree(exec: Exec, repo: string, dir: string, base: string): string {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  exec('git', ['-C', repo, 'worktree', 'add', '--detach', dir, base]);
  return dir;
}

/** Untracked, non-ignored paths; an untracked directory is one entry ending in "/". */
function untrackedPaths(exec: Exec, dir: string): string[] {
  return exec('git', ['-C', dir, 'ls-files', '--others', '--exclude-standard', '--directory'])
    .split('\n').filter(Boolean).sort();
}

/** Back to the state right after setup: tracked files at base, setup output kept. */
function restoreToSetupState(exec: Exec, dir: string, base: string, artifacts: ReadonlySet<string>): void {
  exec('git', ['-C', dir, 'reset', '--hard', base]);
  for (const p of untrackedPaths(exec, dir)) {
    if (!artifacts.has(p)) fs.rmSync(path.join(dir, p), { recursive: true, force: true });
  }
}

function removeWorktree(exec: Exec, repo: string, dir: string): void {
  try {
    exec('git', ['-C', repo, 'worktree', 'remove', '--force', dir]);
  } catch {
    // Not registered, or already half-removed: delete what is left of the directory.
    fs.rmSync(dir, { recursive: true, force: true });
  }
  try { exec('git', ['-C', repo, 'worktree', 'prune']); } catch { /* nothing registered */ }
}

/** Removes every worktree under `root`, the directory only this order creates worktrees in. */
function removeAllOwn(exec: Exec, repo: string, root: string): void {
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root) as string[]) removeWorktree(exec, repo, path.join(root, name));
}

/** Commits exactly `paths` on a new branch, so nothing outside the allowlist ever ships. */
function commitCandidate(exec: Exec, dir: string, branch: string, paths: string[], message: string): void {
  exec('git', ['-C', dir, 'checkout', '-q', '-b', branch]);
  exec('git', ['-C', dir, 'add', '--', ...paths]);
  exec('git', ['-C', dir, 'commit', '-q', '-m', message]);
}

module.exports = { addWorktree, untrackedPaths, restoreToSetupState, removeWorktree, removeAllOwn, commitCandidate };
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/factory/worktrees.test.ts --coverage=false && npx tsc --noEmit && npx eslint lib/factory`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/factory/worktrees.ts tests/unit/factory/worktrees.test.ts
git commit -q -F - <<'EOF'
feat(factory): candidate worktrees that never touch the user's checkout

Each candidate gets a detached worktree at base, restorable to its
post-setup state for a redesign, and committed path by path so stray files
never ship.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 7: Gates — scope, tamper, the hidden gate

**Files:**
- Create: `lib/factory/gates.ts`
- Test: `tests/unit/factory/gates.test.ts`

**Interfaces:**
- Consumes: `measure` (sandbox), `compare` (research/verdict), `untrackedPaths` (worktrees).
- Produces: `globToRegExp(glob): RegExp`; `matchesAny(p, globs): boolean`; `changedPaths(exec, dir, base): string[]`; `scopeCheck(changed, editable, protectedFiles): { ok: boolean; violations: string[] }`; `tamperScan(exec, dir, base): string[]`; `readQueries(orderDir): QueryRecord[]`; `queriesUsed(orderDir): number`; `hiddenGate(ctx, order, orderDir, candidate, worktree): { outcome: 'pass' | 'fail' | 'broken'; median: number | null; detail: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { QueryRecord, WorkOrder } from '../../../lib/factory/types';
import type { SandboxCtx } from '../../../lib/factory/sandbox';
const g = require('../../../lib/factory/gates') as {
  matchesAny: (p: string, globs: string[]) => boolean;
  changedPaths: (e: Exec, dir: string, base: string) => string[];
  scopeCheck: (c: string[], ed: string[], prot: string[]) => { ok: boolean; violations: string[] };
  tamperScan: (e: Exec, dir: string, base: string) => string[];
  readQueries: (od: string) => QueryRecord[];
  queriesUsed: (od: string) => number;
  hiddenGate: (c: SandboxCtx, o: WorkOrder, od: string, cand: string, wt: string) =>
    { outcome: 'pass' | 'fail' | 'broken'; median: number | null; detail: string };
};
const fx = require('./fixtures') as {
  tmpDir: (p: string) => string; makeRepo: (f: Record<string, string>) => string; realExec: Exec;
  sampleOrder: (repo: string, over?: Partial<WorkOrder>) => WorkOrder;
  installOrder: (home: string, o: WorkOrder, script?: string) => string;
  containerCommand: (a: string[]) => string; execFailure: (s: number, e: string) => Error;
};

describe('globs', () => {
  it.each([
    ['src/a.js', ['src/**'], true],
    ['src/deep/b.ts', ['src/**'], true],
    ['src/new/', ['src/**'], true],
    ['srcx/a.js', ['src/**'], false],
    ['lib/a.js', ['src/*.js'], false],
    ['src/a.js', ['src/*.js'], true],
    ['src/d/a.js', ['src/*.js'], false],
    ['a.test.js', ['**/*.test.js'], true],
    ['x/a.test.js', ['**/*.test.js'], true],
  ])('%s against %j is %s', (p, globs, expected) => {
    expect(g.matchesAny(p, globs)).toBe(expected);
  });
});

describe('scope and tamper', () => {
  it('lists tracked changes and untracked paths against base', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a', 'README.md': 'r' });
    fs.writeFileSync(path.join(repo, 'src/a.js'), 'b');
    fs.writeFileSync(path.join(repo, 'notes.txt'), 'n');
    expect(g.changedPaths(fx.realExec, repo, 'main')).toEqual(['notes.txt', 'src/a.js']);
  });

  it('rejects paths outside the allowlist and protected evaluation files', () => {
    expect(g.scopeCheck(['src/a.js', 'README.md', 'bench/run.js'], ['src/**', 'bench/**'], ['bench/run.js']))
      .toEqual({ ok: false, violations: ['README.md', 'bench/run.js'] });
    expect(g.scopeCheck(['src/a.js'], ['src/**'], [])).toEqual({ ok: true, violations: [] });
  });

  it('finds the result marker in added lines and in untracked files, not in removed lines', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'console.log("__RESULT__ old")\n', 'src/b.js': 'b\n' });
    fs.writeFileSync(path.join(repo, 'src/a.js'), 'clean\n');
    fs.writeFileSync(path.join(repo, 'src/b.js'), 'b\nprint("__RESULT__ {}")\n');
    fs.mkdirSync(path.join(repo, 'src/new'));
    fs.writeFileSync(path.join(repo, 'src/new/c.js'), '__RESULT__');
    expect(g.tamperScan(fx.realExec, repo, 'main')).toEqual(['src/b.js', 'src/new/c.js']);
  });
});

describe('hiddenGate', () => {
  function setup(stdout: () => string, over: Partial<WorkOrder> = {}) {
    const home = fx.tmpDir('grd-factory-home-');
    const order = fx.sampleOrder('/abs/repo', over);
    const od = fx.installOrder(home, order);
    const cmds: string[] = [];
    const exec: Exec = (_b, a) => { cmds.push(fx.containerCommand(a)); return stdout(); };
    const ctx: SandboxCtx = { exec, ledgerDir: od, orderId: order.id, user: null, timeoutMs: 1000 };
    return { order, od, ctx, cmds };
  }

  it('writes the query record before running, then the outcome', () => {
    const s = setup(() => '__RESULT__ {"latency_p95_ms": 100}');
    const r = g.hiddenGate(s.ctx, s.order, s.od, 'c1', '/wt');
    expect(r).toEqual({ outcome: 'pass', median: 100, detail: '' });
    expect(g.readQueries(s.od).map((q) => q.status)).toEqual(['started', 'pass']);
    expect(s.cmds[0]).toMatch(/^sh \/grader-[0-9a-f]{8}\/eval\.sh$/);
  });

  it('counts a query even when the evaluation crashes', () => {
    const s = setup(() => { throw fx.execFailure(1, 'segfault'); });
    const r = g.hiddenGate(s.ctx, s.order, s.od, 'c1', '/wt');
    expect(r.outcome).toBe('broken');
    expect(g.queriesUsed(s.od)).toBe(1);
  });

  it('refuses to run once the query budget is spent', () => {
    const s = setup(() => '__RESULT__ {"latency_p95_ms": 150}', { budget: { tokens: 1, candidates: 1, hidden_queries: 1, wall_minutes: 1 } });
    expect(g.hiddenGate(s.ctx, s.order, s.od, 'c1', '/wt').outcome).toBe('fail');
    expect(() => g.hiddenGate(s.ctx, s.order, s.od, 'c2', '/wt')).toThrow(/query budget already spent/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/factory/gates.test.ts --coverage=false`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `lib/factory/gates.ts`**

```ts
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
import type { Exec } from './exec';
import type { QueryRecord, WorkOrder } from './types';
import type { SandboxCtx } from './sandbox';
import type { Comparator } from '../research/types';
const { measure } = require('./sandbox') as {
  measure: (c: SandboxCtx, s: WorkOrder['sandbox'], wt: string, cmd: string, n: number, metric: string,
    label: string, hidden?: { src: string; dst: string }) => import('./types').MeasureResult;
};
const { untrackedPaths } = require('./worktrees') as { untrackedPaths: (e: Exec, dir: string) => string[] };
const { compare } = require('../research/verdict') as {
  compare: (v: number, c: Comparator, t: number) => boolean;
};

/** The literal an evaluation prints its result with. A patch that adds it is tampering. */
const RESULT_MARKER = '__RESULT__';

/** `**` crosses directories, `*` and `?` do not. Matched against repo-relative paths. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else { re += '.*'; }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(p: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(p));
}

/** Every path a candidate changed: tracked edits against base, plus untracked paths. */
function changedPaths(exec: Exec, dir: string, base: string): string[] {
  const tracked = exec('git', ['-C', dir, 'diff', '--name-only', base]).split('\n').filter(Boolean);
  return [...new Set([...tracked, ...untrackedPaths(exec, dir)])].sort();
}

function scopeCheck(changed: string[], editable: string[], protectedFiles: string[]): { ok: boolean; violations: string[] } {
  const violations = changed.filter((p) => protectedFiles.includes(p) || !matchesAny(p, editable));
  return { ok: violations.length === 0, violations };
}

function filesUnder(root: string, rel: string): string[] {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return (fs.readdirSync(abs) as string[]).flatMap((n) => filesUnder(root, path.posix.join(rel, n)));
}

/** Paths whose added lines, or whose untracked contents, contain the result marker. */
function tamperScan(exec: Exec, dir: string, base: string): string[] {
  const hits = new Set<string>();
  let file = '';
  for (const line of exec('git', ['-C', dir, 'diff', '-U0', '--no-color', base]).split('\n')) {
    if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ (b\/)?/, ''); continue; }
    if (line.startsWith('+') && line.includes(RESULT_MARKER)) hits.add(file);
  }
  for (const entry of untrackedPaths(exec, dir)) {
    for (const f of filesUnder(dir, entry.replace(/\/$/, ''))) {
      try {
        if (String(fs.readFileSync(path.join(dir, f), 'utf8')).includes(RESULT_MARKER)) hits.add(f);
      } catch { /* unreadable: the scope check still applies to it */ }
    }
  }
  return [...hits].sort();
}

function queriesFile(orderDir: string): string { return path.join(orderDir, 'queries.jsonl'); }

function readQueries(orderDir: string): QueryRecord[] {
  const f = queriesFile(orderDir);
  if (!fs.existsSync(f)) return [];
  return String(fs.readFileSync(f, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l) as QueryRecord);
}

/** Queries spent, counted from write-ahead `started` rows, so a crash never refunds one. */
function queriesUsed(orderDir: string): number {
  return readQueries(orderDir).filter((q) => q.status === 'started').length;
}

function appendQuery(orderDir: string, rec: QueryRecord): void {
  fs.appendFileSync(queriesFile(orderDir), JSON.stringify(rec) + '\n');
}

/**
 * One hidden-evaluation query. The `started` row is written before anything runs. The result
 * is returned to the factory only and never shown to an agent.
 */
function hiddenGate(
  ctx: SandboxCtx, order: WorkOrder, orderDir: string, candidate: string, worktree: string,
): { outcome: 'pass' | 'fail' | 'broken'; median: number | null; detail: string } {
  if (queriesUsed(orderDir) >= order.budget.hidden_queries) {
    throw new Error('hidden gate: query budget already spent');
  }
  appendQuery(orderDir, { candidate, status: 'started', at: new Date().toISOString() });
  const dst = `/grader-${crypto.randomBytes(4).toString('hex') as string}`;
  const script = order.hidden_eval.script.slice('hidden/'.length);
  const m = measure(
    ctx, order.sandbox, worktree, `sh ${dst}/${script}`, order.hidden_eval.repeats,
    order.contract.metric, `${candidate}-hidden`, { src: path.join(orderDir, 'vault', 'hidden'), dst },
  );
  const res = !m.ok || m.median === null
    ? { outcome: 'broken' as const, median: null, detail: m.stderrExcerpt || `exit ${m.exitCode}` }
    : {
      outcome: compare(m.median, order.contract.comparator, order.contract.target) ? 'pass' as const : 'fail' as const,
      median: m.median, detail: '',
    };
  appendQuery(orderDir, { candidate, status: res.outcome, median: res.median, at: new Date().toISOString() });
  return res;
}

module.exports = {
  RESULT_MARKER, globToRegExp, matchesAny, changedPaths, scopeCheck, tamperScan,
  readQueries, queriesUsed, hiddenGate,
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/factory/gates.test.ts --coverage=false && npx tsc --noEmit && npx eslint lib/factory`
Expected: PASS.

- [ ] **Step 5: Mutation check.** Delete the first `appendQuery` call (the `started` row) in `hiddenGate`. Run the `hiddenGate` tests: "counts a query even when the evaluation crashes" and "refuses to run once the query budget is spent" must both fail, because only `started` rows count. Restore the call.

- [ ] **Step 6: Commit**

```bash
git add lib/factory/gates.ts tests/unit/factory/gates.test.ts
git commit -q -F - <<'EOF'
feat(factory): scope, tamper and hidden-evaluation gates

Every hidden query is logged before it runs, so a crash can never refund
one. The hidden directory is mounted read-only at a random path for that
run only. Patches outside the allowlist, touching evaluation files, or
adding the result marker are rejected.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 8: Intake — `scan` and `validate`

**Files:**
- Create: `lib/factory/intake.ts`
- Test: `tests/unit/factory/intake.test.ts`

**Interfaces:**
- Consumes: `readDraft`, `writeDraft`, `markValidated`, `draftDir` (order); `runSetup`, `measure`, `spread`, `hostUser`, `dockerReady`, `removeRecordedContainers`, `DEFAULT_TIMEOUT_MS` (sandbox); `matchesAny` (gates); `addWorktree`, `removeWorktree` (worktrees); `compare`.
- Produces: `interface ScanReport`; `scanRepo(repo, freeMemBytes?): ScanReport`; `interface CheckResult { id: CheckId; ok: boolean; detail: string }`; `interface ValidateReport { ok: boolean; checks: CheckResult[]; noisy: boolean; baseline?: Baseline }`; `validateDraft(home, id, deps?: { exec?: Exec; timeoutMs?: number }): ValidateReport`.

- [ ] **Step 1: Write the failing tests**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { WorkOrder } from '../../../lib/factory/types';
import type { ScanReport, ValidateReport } from '../../../lib/factory/intake';
const intake = require('../../../lib/factory/intake') as {
  scanRepo: (repo: string, free?: number) => ScanReport;
  validateDraft: (home: string, id: string, deps?: { exec?: Exec }) => ValidateReport;
};
const order = require('../../../lib/factory/order') as {
  writeDraft: (h: string, o: WorkOrder) => void; draftDir: (h: string, id: string) => string;
  readDraft: (h: string, id: string) => WorkOrder; saveOrder: (h: string, id: string) => string;
};
const fx = require('./fixtures') as {
  tmpDir: (p: string) => string; makeRepo: (f: Record<string, string>) => string;
  sampleOrder: (repo: string, over?: Partial<WorkOrder>) => WorkOrder;
  fakeExec: (onRun: (a: string[]) => string, calls?: string[][]) => Exec;
  containerCommand: (a: string[]) => string; worktreeCount: (r: string) => number;
};

describe('scanRepo', () => {
  it('proposes a Node image, npm ci, and the bench scripts with their files', () => {
    const repo = fx.makeRepo({
      'package.json': JSON.stringify({ scripts: { 'bench:search': 'node bench/search.js', build: 'tsc' } }),
      'package-lock.json': '{}', 'bench/search.js': '', 'Makefile': 'perf:\n\ttrue\nclean:\n\ttrue\n',
    });
    const r = intake.scanRepo(repo, 8 * 1024 * 1024 * 1024);
    expect(r.ecosystem).toBe('node');
    expect([r.proposedImage, r.proposedSetup]).toEqual(['node:22-bookworm', 'npm ci']);
    expect(r.measurements).toEqual([
      { kind: 'npm-script', name: 'bench:search', command: 'npm run bench:search', files: ['package.json', 'bench/search.js'] },
      { kind: 'make-target', name: 'perf', command: 'make perf', files: ['Makefile'] },
      { kind: 'directory', name: 'bench', command: '', files: [] },
    ]);
    expect(r.proposedMemory).toBe('2048m');
  });

  it('proposes uv for a uv project and caps memory at half of what is free', () => {
    const repo = fx.makeRepo({ 'pyproject.toml': '[project]\nname="x"\n', 'uv.lock': '' });
    const r = intake.scanRepo(repo, 1536 * 1024 * 1024);
    expect(r.ecosystem).toBe('python');
    expect(r.proposedSetup).toBe('uv sync --frozen');
    expect(r.proposedMemory).toBe('768m');
  });

  it('leaves image and setup to the interview for other ecosystems', () => {
    const r = intake.scanRepo(fx.makeRepo({ 'go.mod': 'module x\n' }), 4e9);
    expect([r.ecosystem, r.proposedImage, r.proposedSetup]).toEqual(['unknown', null, '']);
  });
});

describe('validateDraft', () => {
  function draft(files: Record<string, string>, over: Partial<WorkOrder> = {}) {
    const repo = fx.makeRepo(files);
    const home = fx.tmpDir('grd-factory-home-');
    const o = fx.sampleOrder(repo, { baseline: undefined, ...over });
    order.writeDraft(home, o);
    fs.mkdirSync(path.join(order.draftDir(home, o.id), 'hidden'));
    fs.writeFileSync(path.join(order.draftDir(home, o.id), 'hidden', 'eval.sh'), 'echo hidden\n');
    return { repo, home, o };
  }
  const FILES = { 'src/search.js': 'slow', 'bench/run.js': '', 'package.json': '{}' };
  const answer = (dev: number, hidden: number) => (args: string[]) =>
    fx.containerCommand(args).startsWith('sh /grader-')
      ? `__RESULT__ {"latency_p95_ms": ${hidden}}` : `__RESULT__ {"latency_p95_ms": ${dev}}`;

  it('passes a draft whose base misses the target, records the baseline, and cleans up', () => {
    const d = draft(FILES);
    const r = intake.validateDraft(d.home, d.o.id, { exec: fx.fakeExec(answer(187, 191)) });
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.baseline).toEqual({ dev: 187, hidden: 191, devSpread: 0 });
    expect(order.readDraft(d.home, d.o.id).baseline).toEqual(r.baseline);
    expect(() => order.saveOrder(d.home, d.o.id)).not.toThrow();
    expect(fx.worktreeCount(d.repo)).toBe(1);
  });

  it('refuses a target the unmodified code already meets', () => {
    const d = draft(FILES);
    const r = intake.validateDraft(d.home, d.o.id, { exec: fx.fakeExec(answer(100, 191)) });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'base_fails')?.detail).toMatch(/already meets/);
  });

  it('refuses an allowlist that covers an evaluation file, before starting any container', () => {
    const calls: string[][] = [];
    const d = draft(FILES, { editable: ['src/**', 'bench/**'] });
    const r = intake.validateDraft(d.home, d.o.id, { exec: fx.fakeExec(answer(187, 191), calls) });
    expect(r.checks.find((c) => c.id === 'editable')?.detail).toMatch(/evaluation files inside the editable paths: bench\/run.js/);
    expect(calls.some((c) => c[0] === 'docker' && c[1] === 'run')).toBe(false);
  });

  it('flags a metric whose spread exceeds the gap to the target', () => {
    const d = draft(FILES, { dev_eval: { command: 'node bench/run.js', repeats: 3, files: ['bench/run.js', 'package.json'] } });
    const vals = [100, 190, 125];
    let i = 0;
    const r = intake.validateDraft(d.home, d.o.id, {
      exec: fx.fakeExec((a) => (fx.containerCommand(a).startsWith('sh /grader-')
        ? '__RESULT__ {"latency_p95_ms": 191}' : `__RESULT__ {"latency_p95_ms": ${vals[i++ % 3]}}`)),
    });
    expect(r.noisy).toBe(true);
    expect(r.checks.find((c) => c.id === 'dev_eval')?.detail).toMatch(/too noisy to decide/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/factory/intake.test.ts --coverage=false`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `lib/factory/intake.ts`**

```ts
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
import type { Exec, ExecError } from './exec';
import type { Baseline, MeasureResult, SandboxSpec, WorkOrder } from './types';
import type { SandboxCtx } from './sandbox';
import type { Comparator } from '../research/types';
const { defaultExec } = require('./exec') as { defaultExec: Exec };
const { readDraft, writeDraft, markValidated, draftDir } = require('./order') as {
  readDraft: (h: string, id: string) => WorkOrder;
  writeDraft: (h: string, o: WorkOrder) => void;
  markValidated: (h: string, id: string) => void;
  draftDir: (h: string, id: string) => string;
};
const sb = require('./sandbox') as {
  DEFAULT_TIMEOUT_MS: number;
  hostUser: () => string | null;
  dockerReady: (e: Exec) => boolean;
  runSetup: (c: SandboxCtx, s: SandboxSpec, wt: string, label: string) => { ok: boolean; detail: string };
  measure: (c: SandboxCtx, s: SandboxSpec, wt: string, cmd: string, n: number, metric: string, label: string,
    hidden?: { src: string; dst: string }) => MeasureResult;
  spread: (xs: number[]) => number;
  removeRecordedContainers: (e: Exec, dir: string) => void;
};
const { matchesAny } = require('./gates') as { matchesAny: (p: string, g: string[]) => boolean };
const { addWorktree, removeWorktree } = require('./worktrees') as {
  addWorktree: (e: Exec, repo: string, dir: string, base: string) => string;
  removeWorktree: (e: Exec, repo: string, dir: string) => void;
};
const { compare } = require('../research/verdict') as { compare: (v: number, c: Comparator, t: number) => boolean };

export interface ScanReport {
  ecosystem: 'node' | 'python' | 'unknown';
  proposedImage: string | null;
  proposedSetup: string;
  dockerfile: boolean;
  devcontainer: boolean;
  measurements: Array<{ kind: 'npm-script' | 'make-target' | 'directory'; name: string; command: string; files: string[] }>;
  freeMemoryMb: number;
  proposedMemory: string;
}

const MEASURING = /bench|perf|test|eval/i;
const MEASURE_DIRS = new Set(['test', 'tests', 'bench', 'benchmarks', 'perf', 'eval', 'evals']);

function exists(repo: string, rel: string): boolean { return fs.existsSync(path.join(repo, rel)); }

/** Read-only look at a repo: what it can already measure, and how to run it in a container. */
function scanRepo(repo: string, freeMemBytes: number = os.freemem()): ScanReport {
  const measurements: ScanReport['measurements'] = [];
  let ecosystem: ScanReport['ecosystem'] = 'unknown';
  let proposedImage: string | null = null;
  let proposedSetup = '';
  if (exists(repo, 'package.json')) {
    ecosystem = 'node';
    proposedImage = 'node:22-bookworm';
    proposedSetup = exists(repo, 'pnpm-lock.yaml') ? 'npx --yes pnpm install --frozen-lockfile'
      : exists(repo, 'yarn.lock') ? 'npx --yes yarn install --frozen-lockfile'
        : exists(repo, 'package-lock.json') ? 'npm ci' : 'npm install';
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    for (const [name, script] of Object.entries(pkg.scripts || {})) {
      if (!MEASURING.test(name)) continue;
      const refs = script.split(/\s+/).filter((t) => t.includes('/') && exists(repo, t));
      measurements.push({ kind: 'npm-script', name, command: `npm run ${name}`, files: ['package.json', ...refs] });
    }
  } else if (exists(repo, 'pyproject.toml') || exists(repo, 'requirements.txt')) {
    ecosystem = 'python';
    if (exists(repo, 'uv.lock')) {
      proposedImage = 'ghcr.io/astral-sh/uv:python3.12-bookworm-slim';
      proposedSetup = 'uv sync --frozen';
    } else {
      proposedImage = 'python:3.12-slim';
      proposedSetup = exists(repo, 'requirements.txt')
        ? 'python -m venv .venv && .venv/bin/pip install -r requirements.txt'
        : 'python -m venv .venv && .venv/bin/pip install -e .';
    }
  }
  if (exists(repo, 'Makefile')) {
    const text = String(fs.readFileSync(path.join(repo, 'Makefile'), 'utf8'));
    for (const m of text.matchAll(/^([A-Za-z0-9_.-]+):(?!=)/gm)) {
      if (MEASURING.test(m[1])) measurements.push({ kind: 'make-target', name: m[1], command: `make ${m[1]}`, files: ['Makefile'] });
    }
  }
  for (const d of (fs.readdirSync(repo) as string[]).sort()) {
    if (MEASURE_DIRS.has(d) && fs.statSync(path.join(repo, d)).isDirectory()) {
      measurements.push({ kind: 'directory', name: d, command: '', files: [] });
    }
  }
  const freeMemoryMb = Math.floor(freeMemBytes / (1024 * 1024));
  return {
    ecosystem, proposedImage, proposedSetup,
    dockerfile: exists(repo, 'Dockerfile'),
    devcontainer: exists(repo, '.devcontainer'),
    measurements,
    freeMemoryMb,
    // Half of what is free, between 512 MB and 2 GB, so a runaway candidate cannot starve the machine.
    proposedMemory: `${Math.max(512, Math.min(2048, Math.floor(freeMemoryMb / 2)))}m`,
  };
}

export type CheckId = 'repo' | 'docker' | 'editable' | 'setup' | 'dev_eval' | 'hidden_eval' | 'base_fails' | 'tokens';
export interface CheckResult { id: CheckId; ok: boolean; detail: string; }
export interface ValidateReport { ok: boolean; checks: CheckResult[]; noisy: boolean; baseline?: Baseline; }

function failure(e: unknown): string {
  const err = e as ExecError;
  return String(err.stderr || err.message || e).trim().slice(0, 500);
}

/**
 * Every intake check, in order. Containers start only once the cheap checks pass. On success
 * the baseline is written into the draft and the draft is marked validated by content hash.
 * Spawns nothing, so it spends no tokens.
 */
function validateDraft(home: string, id: string, deps: { exec?: Exec; timeoutMs?: number } = {}): ValidateReport {
  const exec = deps.exec || defaultExec;
  const o = readDraft(home, id);
  const rule = `${o.contract.metric} ${o.contract.comparator} ${o.contract.target}`;
  const checks: CheckResult[] = [];
  const add = (c: CheckResult): boolean => { checks.push(c); return c.ok; };
  const done = (noisy = false, baseline?: Baseline): ValidateReport =>
    ({ ok: checks.every((c) => c.ok), checks, noisy, ...(baseline ? { baseline } : {}) });

  const repoIssues: string[] = [];
  const attempt = (bin: string, args: string[], msg: string): void => {
    try { exec(bin, args, { timeout: 30000 }); } catch (e) { repoIssues.push(`${msg} (${failure(e)})`); }
  };
  attempt('git', ['-C', o.repo, 'rev-parse', '--verify', `${o.base}^{commit}`], `base "${o.base}" is not a commit`);
  attempt('git', ['-C', o.repo, 'remote', 'get-url', o.remote], `remote "${o.remote}" is not configured`);
  attempt('gh', ['auth', 'status'], 'gh is not authenticated; run `gh auth login`');
  add({ id: 'repo', ok: repoIssues.length === 0, detail: repoIssues.join('; ') || `base ${o.base} resolves; remote ${o.remote} is set; gh is authenticated` });

  const docker = sb.dockerReady(exec);
  add({ id: 'docker', ok: docker, detail: docker ? 'docker is available' : 'docker is not available; the factory never runs candidate code on the host' });

  const tracked = repoIssues.length === 0
    ? exec('git', ['-C', o.repo, 'ls-tree', '-r', '--name-only', o.base]).split('\n').filter(Boolean) : [];
  const unmatched = o.editable.filter((g) => !tracked.some((f) => matchesAny(f, [g])));
  const overlap = o.dev_eval.files.filter((f) => matchesAny(f, o.editable));
  const missing = o.dev_eval.files.filter((f) => !tracked.includes(f));
  const editIssues = [
    unmatched.length ? `globs matching no file at ${o.base}: ${unmatched.join(', ')}` : '',
    overlap.length ? `evaluation files inside the editable paths: ${overlap.join(', ')}` : '',
    missing.length ? `evaluation files not tracked at ${o.base}: ${missing.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  add({ id: 'editable', ok: editIssues === '', detail: editIssues || `${o.editable.length} editable glob(s) match; no overlap with evaluation files` });

  if (!checks.every((c) => c.ok)) return done();

  const tmp = path.join(home, 'tmp', `validate-${id}-${crypto.randomBytes(3).toString('hex') as string}`);
  const wt = path.join(tmp, 'base');
  const ctx: SandboxCtx = { exec, ledgerDir: tmp, orderId: id, user: sb.hostUser(), timeoutMs: deps.timeoutMs ?? sb.DEFAULT_TIMEOUT_MS };
  try {
    addWorktree(exec, o.repo, wt, o.base);
    const setup = sb.runSetup(ctx, o.sandbox, wt, 'validate-setup');
    if (!add({ id: 'setup', ok: setup.ok, detail: setup.ok ? `setup works in ${o.sandbox.image}` : setup.detail })) return done();

    const dev = sb.measure(ctx, o.sandbox, wt, o.dev_eval.command, o.dev_eval.repeats, o.contract.metric, 'validate-dev');
    const devSpread = sb.spread(dev.values);
    const noisy = dev.ok && dev.median !== null && devSpread > Math.abs(dev.median - o.contract.target);
    add({
      id: 'dev_eval', ok: dev.ok,
      detail: dev.ok
        ? `median ${dev.median} over ${dev.values.length} run(s), spread ${devSpread}`
          + (noisy ? '; the spread exceeds the gap to the target, so the metric is too noisy to decide: raise dev_eval.repeats' : '')
        : `failed: ${dev.stderrExcerpt || `exit ${dev.exitCode}`}`,
    });

    const hiddenFile = path.join(draftDir(home, id), o.hidden_eval.script);
    const dst = `/grader-${crypto.randomBytes(4).toString('hex') as string}`;
    const hidden = fs.existsSync(hiddenFile)
      ? sb.measure(ctx, o.sandbox, wt, `sh ${dst}/${o.hidden_eval.script.slice('hidden/'.length)}`,
        o.hidden_eval.repeats, o.contract.metric, 'validate-hidden', { src: path.join(draftDir(home, id), 'hidden'), dst })
      : null;
    add({
      id: 'hidden_eval', ok: hidden !== null && hidden.ok,
      detail: hidden === null ? `${o.hidden_eval.script} does not exist in the draft`
        : hidden.ok ? `runs and prints ${o.contract.metric}` : `failed: ${hidden.stderrExcerpt || `exit ${hidden.exitCode}`}`,
    });

    const meets = (v: number | null): boolean => v !== null && compare(v, o.contract.comparator, o.contract.target);
    const measured = dev.ok && hidden !== null && hidden.ok;
    const alreadyMet = measured && (meets(dev.median) || meets((hidden as MeasureResult).median));
    add({
      id: 'base_fails', ok: measured && !alreadyMet,
      detail: !measured ? 'not checked: an evaluation failed'
        : alreadyMet ? `the unmodified code already meets ${rule}; pick a tighter target`
          : `the unmodified code misses ${rule} on both evaluations`,
    });
    add({
      id: 'tokens', ok: true,
      detail: 'checked at the first spawn of `gd factory run`, so validate spends no tokens; a backend that reports no token count disables the token cap, loudly',
    });

    if (!checks.every((c) => c.ok)) return done(noisy);
    const baseline: Baseline = { dev: dev.median as number, hidden: (hidden as MeasureResult).median as number, devSpread };
    writeDraft(home, { ...o, baseline });
    markValidated(home, id);
    return done(noisy, baseline);
  } finally {
    removeWorktree(exec, o.repo, wt);
    sb.removeRecordedContainers(exec, tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { scanRepo, validateDraft };
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/factory/intake.test.ts --coverage=false && npx tsc --noEmit && npx eslint lib/factory`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/factory/intake.ts tests/unit/factory/intake.test.ts
git commit -q -F - <<'EOF'
feat(factory): scan a repo and validate a draft work order

scan proposes what the interview offers. validate runs every intake check,
refuses a target the unmodified code already meets, flags a metric too
noisy to decide, and spawns nothing, so it spends no tokens.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 9: Metered spawn and prompts

**Files:**
- Create: `lib/factory/spawn.ts`, `lib/factory/prompts.ts`
- Test: `tests/unit/factory/spawn.test.ts`, `tests/unit/factory/prompts.test.ts`

**Interfaces:**
- Consumes: `decodeSpawnResult` (orchestrator); `Scheduler` (scheduler); `SchedulerSpawnResult`, `SpawnOpts` (lib/types).
- Produces (`spawn.ts`): `class BudgetSpentError extends Error`; `BUILDER = 'grd-factory-builder'`; `tokensFrom(r): number`; `readSpent(orderDir): number`; `interface MeteredSpawn { spawnFn(cwdFor, candidateFor): SpawnFn; spent(): number; tokenCapEnforced(): boolean }`; `createMeteredSpawn(o): MeteredSpawn`.
- Produces (`prompts.ts`): `composeQuestion(order, baseWorktree, history): string`; `buildPrompt(order, hyp, worktree, iterDir): string`; `fixPrompt(order, hyp, result, worktree, iterDir, attempt, maxDepth): string`; `replicationPrompt(order, strategy, worktree, iterDir): string`; `strategyNote(procedure): string`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/factory/spawn.test.ts`:

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { SchedulerSpawnResult, SpawnOpts } from '../../../lib/types';
import type { MeteredSpawn } from '../../../lib/factory/spawn';
const sp = require('../../../lib/factory/spawn') as {
  BudgetSpentError: new (m: string) => Error;
  tokensFrom: (r: SchedulerSpawnResult) => number;
  createMeteredSpawn: (o: { scheduler: { spawn: (p: string, o: SpawnOpts) => Promise<SchedulerSpawnResult> };
    orderDir: string; budgetTokens: number; warn: (m: string) => void }) => MeteredSpawn;
};
const { tmpDir } = require('./fixtures') as { tmpDir: (p: string) => string };

const res = (over: Partial<SchedulerSpawnResult> = {}): SchedulerSpawnResult => ({
  exitCode: 0, stdout: JSON.stringify({ type: 'result', result: 'ok' }), stderr: '',
  timedOut: false, backend: 'claude', tokensUsed: 1000, workItemId: 'w', ...over,
});

describe('tokensFrom', () => {
  it('prefers the scheduler count, then the usage in claude JSON output', () => {
    expect(sp.tokensFrom(res({ tokensUsed: 42 }))).toBe(42);
    const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 3, cache_read_input_tokens: 2 };
    expect(sp.tokensFrom(res({ tokensUsed: 0, stdout: JSON.stringify([{ type: 'system' }, { type: 'result', result: 'x', usage }]) }))).toBe(20);
    expect(sp.tokensFrom(res({ tokensUsed: 0, stdout: 'not json' }))).toBe(0);
  });
});

describe('createMeteredSpawn', () => {
  function meter(budget: number, result: () => SchedulerSpawnResult, seen: SpawnOpts[] = [], warnings: string[] = []) {
    const orderDir = tmpDir('grd-factory-od-');
    const m = sp.createMeteredSpawn({
      scheduler: { spawn: async (_p, o) => { seen.push(o); return result(); } },
      orderDir, budgetTokens: budget, warn: (w) => { warnings.push(w); },
    });
    return { m, orderDir, fn: m.spawnFn((a) => (a === 'grd-factory-builder' ? '/wt/c1' : '/line'), () => 'c1') };
  }

  it('logs every spawn and refuses the next one once the budget is spent', async () => {
    const { m, orderDir, fn } = meter(1500, () => res());
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-factory-builder');
    await expect(fn('p', 'grd-knowledge-miner')).rejects.toThrow(/token budget spent \(2000 of 1500\)/);
    expect(m.spent()).toBe(2000);
    const rows = String(fs.readFileSync(path.join(orderDir, 'spend.jsonl'), 'utf8')).trim().split('\n');
    expect(rows.map((r: string) => JSON.parse(r).agent)).toEqual(['grd-hypothesizer', 'grd-factory-builder']);
  });

  it('takes the shell away from the builder only, and sets each working directory', async () => {
    const seen: SpawnOpts[] = [];
    const { fn } = meter(1e9, () => res(), seen);
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-factory-builder');
    expect(seen[0]).toEqual(expect.objectContaining({ cwd: '/line', strictMcp: true, captureOutput: true }));
    expect(seen[0].disallowedTools).toBeUndefined();
    expect(seen[1]).toEqual(expect.objectContaining({ cwd: '/wt/c1', disallowedTools: ['Bash'] }));
  });

  it('warns once and stops enforcing the token cap when the backend reports no count', async () => {
    const warnings: string[] = [];
    const { m, fn } = meter(1, () => res({ tokensUsed: 0, stdout: JSON.stringify({ result: 'x' }) }), [], warnings);
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-hypothesizer');
    expect(m.tokenCapEnforced()).toBe(false);
    expect(warnings.filter((w) => /no token count/.test(w))).toHaveLength(1);
  });

  it('warns when a builder ran on a backend that cannot remove the shell', async () => {
    const warnings: string[] = [];
    const { fn } = meter(1e9, () => res({ backend: 'codex' as SchedulerSpawnResult['backend'] }), [], warnings);
    await fn('p', 'grd-factory-builder');
    expect(warnings.join('')).toMatch(/builder ran on codex/);
  });
});
```

`tests/unit/factory/prompts.test.ts`:

```ts
'use strict';
import type { CandidateEvent, WorkOrder } from '../../../lib/factory/types';
const pr = require('../../../lib/factory/prompts') as {
  composeQuestion: (o: WorkOrder, base: string, h: CandidateEvent[]) => string;
  buildPrompt: (o: WorkOrder, hyp: { id: string; statement: string }, wt: string, iterDir: string) => string;
  replicationPrompt: (o: WorkOrder, strategy: string, wt: string, iterDir: string) => string;
  strategyNote: (p: string) => string;
};
const { sampleOrder } = require('./fixtures') as { sampleOrder: (r: string, o?: Partial<WorkOrder>) => WorkOrder };

describe('factory prompts', () => {
  const o = sampleOrder('/abs/repo');
  const at = '2026-09-18T00:00:00.000Z';

  it('puts the rule, the reference copy, the allowlist and the rejection history in the question', () => {
    const q = pr.composeQuestion(o, '/home/f/orders/search-p95/worktrees/base', [
      { id: 'c1', at, hypothesis: 'Cache the index.', outcome: 'dev_miss', devMedian: 150 },
      { id: 'c2', at, hypothesis: 'Batch lookups.', outcome: 'rejected_at_gate' },
      { id: 'c3', at, hypothesis: 'Pending.' },
    ]);
    expect(q.startsWith('Cut p95 latency of search.')).toBe(true);
    expect(q).toContain('latency_p95_ms <= 120');
    expect(q).toContain('the dev evaluation measures 187');
    expect(q).toContain('/home/f/orders/search-p95/worktrees/base');
    expect(q).toContain('only these paths: src/**');
    expect(q).toContain('- c1: Cache the index. Outcome: missed the rule on the dev evaluation (dev median 150).');
    expect(q).toContain('- c2: Batch lookups. Outcome: rejected at the final gate.');
    expect(q).not.toContain('c3');
    expect(q).not.toContain('191.37');
  });

  it('gives the replicator the strategy but never the hypothesis', () => {
    const p = pr.replicationPrompt(o, 'Cache the search index in memory.', '/wt/c1r', '/it');
    expect(p).toContain('Strategy: Cache the search index in memory.');
    expect(p).not.toMatch(/Hypothesis/);
    expect(p).toContain('"metricKey":"latency_p95_ms"');
  });

  it('tells the builder the allowlist and the tamper rule', () => {
    const p = pr.buildPrompt(o, { id: 'h1', statement: 'Cache.' }, '/wt/c1', '/it');
    expect(p).toContain('Work only inside the git worktree at /wt/c1.');
    expect(p).toContain('Never write the text __RESULT__');
    expect(p).toContain('"scriptPath":"/it/run.sh"');
  });

  it('caps the strategy note at about 128 tokens', () => {
    expect(pr.strategyNote('  a   b  ')).toBe('a b');
    expect(pr.strategyNote('x'.repeat(600))).toHaveLength(512);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/factory/spawn.test.ts tests/unit/factory/prompts.test.ts --coverage=false`
Expected: FAIL, modules not found.

- [ ] **Step 3: Create `lib/factory/spawn.ts`**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { SchedulerSpawnResult, SpawnOpts } from '../types';
import type { SpendRecord } from './types';
const { decodeSpawnResult } = require('../research/orchestrator') as {
  decodeSpawnResult: (r: { exitCode?: number; stdout?: string; stderr?: string }, agentType: string) => string;
};

const BUILDER = 'grd-factory-builder';

class BudgetSpentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetSpentError';
    // Keeps `instanceof` working whatever the compile target.
    Object.setPrototypeOf(this, BudgetSpentError.prototype);
  }
}

export type FactorySpawnFn = (prompt: string, agentType: string) => Promise<string>;

export interface MeteredSpawn {
  /** A spawn function for the research loop. `cwdFor` picks each spawn's working directory. */
  spawnFn(cwdFor: (agentType: string) => string, candidateFor: () => string | null): FactorySpawnFn;
  spent(): number;
  tokenCapEnforced(): boolean;
}

/**
 * Tokens one spawn used. The scheduler parses them from stderr; claude with
 * `--output-format json` reports them in its stdout result instead, so fall back to that.
 * Cache reads are counted too, which over-states cost and never under-states it.
 */
function tokensFrom(r: SchedulerSpawnResult): number {
  if (r.tokensUsed > 0) return r.tokensUsed;
  try {
    const parsed = JSON.parse(r.stdout || '') as unknown;
    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (let i = events.length - 1; i >= 0; i--) {
      const usage = (events[i] as { usage?: Record<string, unknown> }).usage;
      if (usage && typeof usage === 'object') {
        return ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']
          .reduce((s, k) => s + (typeof usage[k] === 'number' ? (usage[k] as number) : 0), 0);
      }
    }
  } catch { /* not JSON: no usage to read */ }
  return 0;
}

function spendFile(orderDir: string): string { return path.join(orderDir, 'spend.jsonl'); }

function readSpent(orderDir: string): number {
  const f = spendFile(orderDir);
  if (!fs.existsSync(f)) return 0;
  return String(fs.readFileSync(f, 'utf8')).split('\n').filter(Boolean)
    .reduce((s: number, l: string) => s + (JSON.parse(l) as SpendRecord).tokens, 0);
}

function createMeteredSpawn(o: {
  scheduler: { spawn: (prompt: string, opts: SpawnOpts) => Promise<SchedulerSpawnResult> };
  orderDir: string;
  budgetTokens: number;
  model?: string;
  warn: (m: string) => void;
}): MeteredSpawn {
  let spent = readSpent(o.orderDir);
  let enforced = true;
  return {
    spent: () => spent,
    tokenCapEnforced: () => enforced,
    spawnFn(cwdFor, candidateFor) {
      return async (prompt: string, agentType: string): Promise<string> => {
        if (enforced && spent >= o.budgetTokens) {
          throw new BudgetSpentError(`token budget spent (${spent} of ${o.budgetTokens})`);
        }
        const isBuilder = agentType === BUILDER;
        const r = await o.scheduler.spawn(prompt, {
          agentType, model: o.model, captureOutput: true, strictMcp: true, cwd: cwdFor(agentType),
          ...(isBuilder ? { disallowedTools: ['Bash'] } : {}),
        });
        const tokens = tokensFrom(r);
        const row: SpendRecord = { agent: agentType, candidate: candidateFor(), tokens, backend: String(r.backend), at: new Date().toISOString() };
        fs.appendFileSync(spendFile(o.orderDir), JSON.stringify(row) + '\n');
        spent += tokens;
        if (r.exitCode === 0 && tokens === 0 && enforced) {
          enforced = false;
          o.warn(`[factory] the ${r.backend} backend reported no token count; the token cap cannot be enforced for this run. The candidate and wall-clock caps still apply.\n`);
        }
        if (isBuilder && r.backend !== 'claude') {
          o.warn(`[factory] a builder ran on ${r.backend}, which cannot remove the shell; that builder had shell access.\n`);
        }
        return decodeSpawnResult(r, agentType);
      };
    },
  };
}

module.exports = { BUILDER, BudgetSpentError, tokensFrom, readSpent, createMeteredSpawn };
```

- [ ] **Step 4: Create `lib/factory/prompts.ts`**

```ts
'use strict';
import type { CandidateEvent, WorkOrder } from './types';
import type { ExperimentResult, Hypothesis } from '../research/types';

function rule(o: WorkOrder): string { return `${o.contract.metric} ${o.contract.comparator} ${o.contract.target}`; }

/** What later hypotheses learn about a candidate. A hidden-gate rejection is one bit, nothing more. */
function describeOutcome(e: CandidateEvent): string {
  switch (e.outcome) {
    case 'dev_miss': return `missed the rule on the dev evaluation (dev median ${e.devMedian ?? 'not measured'})`;
    case 'out_of_scope': return `changed paths outside the allowlist (${e.detail ?? ''})`;
    case 'tampering': return `added the evaluation's result marker (${e.detail ?? ''})`;
    case 'build_failed': return 'the builder did not produce a usable change';
    case 'did_not_replicate': return `a fresh builder could not reproduce it from its strategy note (replica dev median ${e.replicaDevMedian ?? 'not measured'})`;
    case 'rejected_at_gate': return 'rejected at the final gate';
    default: return 'shipped';
  }
}

function composeQuestion(o: WorkOrder, baseWorktree: string, history: CandidateEvent[]): string {
  const lines = [
    o.objective,
    '',
    `Decision rule, pinned for every experiment: ${rule(o)}. On the unmodified code the dev evaluation measures ${o.baseline?.dev ?? 'unknown'}.`,
    `A reference copy of the code at ${o.base} is at ${baseWorktree}. Read it there; do not modify it.`,
    `A change may touch only these paths: ${o.editable.join(', ')}.`,
  ];
  const finished = history.filter((e) => e.outcome !== undefined);
  if (finished.length > 0) {
    lines.push('', 'Earlier candidates. Do not resubmit these ideas:');
    for (const e of finished) lines.push(`- ${e.id}: ${e.hypothesis ?? '(hypothesis not recorded)'} Outcome: ${describeOutcome(e)}.`);
  }
  return lines.join('\n');
}

function rules(o: WorkOrder, worktree: string): string[] {
  return [
    `Work only inside the git worktree at ${worktree}.`,
    `Edit files only under these paths: ${o.editable.join(', ')}. A change anywhere else is rejected.`,
    'Never write the text __RESULT__ anywhere. A change containing it is rejected as tampering.',
    'Do not try to run, build or measure anything. You have no shell; the factory measures your change in a sandbox.',
  ];
}

function finalBlock(o: WorkOrder, iterDir: string): string[] {
  return [
    'When you are done, emit exactly one final block:',
    '__PLAN__',
    `{"procedure":"<the strategy in at most 80 plain words, no code>","metricKey":"${o.contract.metric}","comparator":"${o.contract.comparator}","target":${o.contract.target},"language":"shell","scriptPath":"${iterDir}/run.sh"}`,
  ];
}

function buildPrompt(o: WorkOrder, hyp: Pick<Hypothesis, 'id' | 'statement'>, worktree: string, iterDir: string): string {
  return [
    'You are grd-factory-builder. Implement ONE hypothesis as a minimal code change.',
    '',
    `Objective: ${o.objective}`,
    `Hypothesis (${hyp.id}): ${hyp.statement}`,
    `The change is judged on: ${rule(o)}.`,
    '',
    ...rules(o, worktree),
    '',
    ...finalBlock(o, iterDir),
  ].join('\n');
}

function fixPrompt(
  o: WorkOrder, hyp: Pick<Hypothesis, 'id' | 'statement'>, result: Pick<ExperimentResult, 'exitCode' | 'stderrExcerpt'>,
  worktree: string, iterDir: string, attempt: number, maxDepth: number,
): string {
  return [
    `You are grd-factory-builder in FIX mode (attempt ${attempt} of ${maxDepth}). Your change could not be judged:`,
    `- exit code: ${result.exitCode}`,
    `- detail: ${String(result.stderrExcerpt ?? '').slice(0, 2000) || '(none)'}`,
    '',
    `Objective: ${o.objective}`,
    `Hypothesis (${hyp.id}): ${hyp.statement}`,
    '',
    ...rules(o, worktree),
    '',
    ...finalBlock(o, iterDir),
  ].join('\n');
}

/** The blind replicator gets the objective, the rule, the paths and the note: no hypothesis, no diff. */
function replicationPrompt(o: WorkOrder, strategy: string, worktree: string, iterDir: string): string {
  return [
    'You are grd-factory-builder. Implement the strategy below as a code change, starting from unmodified code.',
    '',
    `Objective: ${o.objective}`,
    `The change is judged on: ${rule(o)}.`,
    `Strategy: ${strategy}`,
    '',
    ...rules(o, worktree),
    '',
    ...finalBlock(o, iterDir),
  ].join('\n');
}

/** About 128 tokens, at roughly four characters per token. */
function strategyNote(procedure: string): string {
  const s = procedure.replace(/\s+/g, ' ').trim();
  return s.length <= 512 ? s : `${s.slice(0, 509)}...`;
}

module.exports = { composeQuestion, buildPrompt, fixPrompt, replicationPrompt, strategyNote };
```

- [ ] **Step 5: Run to verify they pass**

Run: `npx jest tests/unit/factory/spawn.test.ts tests/unit/factory/prompts.test.ts --coverage=false && npx tsc --noEmit && npx eslint lib/factory`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/factory/spawn.ts lib/factory/prompts.ts tests/unit/factory/spawn.test.ts tests/unit/factory/prompts.test.ts
git commit -q -F - <<'EOF'
feat(factory): token-metered spawns and the factory's prompts

Each spawn's tokens are logged before the next spawn may start, and the
next one is refused once the budget is spent. Builders run without a
shell. The blind replicator is given a strategy note and never the
hypothesis or the diff.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 10: Ship and report

**Files:**
- Create: `lib/factory/ship.ts`
- Test: `tests/unit/factory/ship.test.ts`

**Interfaces:**
- Consumes: `commitCandidate` (worktrees).
- Produces: `interface Evidence`; `evidenceBody(e): string`; `shipCandidate(exec, e, worktree, orderDir): { branch: string; prUrl: string | null; error: string | null; manual: string | null }`; `interface ReportInput`; `writeReport(orderDir, r): string`; `STOP_TEXT: Record<StopReason, string>`.

- [ ] **Step 1: Write the failing tests**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { WorkOrder } from '../../../lib/factory/types';
import type { Evidence, ReportInput } from '../../../lib/factory/ship';
const ship = require('../../../lib/factory/ship') as {
  evidenceBody: (e: Evidence) => string;
  shipCandidate: (x: Exec, e: Evidence, wt: string, od: string) => { branch: string; prUrl: string | null; error: string | null; manual: string | null };
  writeReport: (od: string, r: ReportInput) => string;
};
const fx = require('./fixtures') as {
  tmpDir: (p: string) => string; git: (c: string, ...a: string[]) => string;
  makeRepo: (f: Record<string, string>) => string; realExec: Exec;
  fakeExec: (r: (a: string[]) => string, calls?: string[][]) => Exec; execFailure: (s: number, e: string) => Error;
  sampleOrder: (r: string, o?: Partial<WorkOrder>) => WorkOrder;
};
const { addWorktree } = require('../../../lib/factory/worktrees') as {
  addWorktree: (e: Exec, r: string, d: string, b: string) => string;
};

function evidence(repo: string): Evidence {
  return {
    order: fx.sampleOrder(repo), candidate: 'c1', hypothesis: 'Cache the index.', strategy: 'Cache it.',
    devMedian: 100, replicaDevMedian: 102, hiddenMedian: 104.25, changed: ['src/search.js'],
    tokens: 5000, hiddenQueriesUsed: 1,
  };
}

describe('shipCandidate', () => {
  it('commits the change on a factory branch, pushes it and opens a PR with the evidence', () => {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wt = addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    const calls: string[][] = [];
    const od = fx.tmpDir('grd-factory-od-');
    const r = ship.shipCandidate(fx.fakeExec(() => '', calls), evidence(repo), wt, od);
    expect(r).toEqual({ branch: 'factory/search-p95/c1', prUrl: 'https://github.com/acme/app/pull/7', error: null, manual: null });
    expect(calls).toContainEqual(expect.arrayContaining(['git', 'push', 'origin', 'HEAD:refs/heads/factory/search-p95/c1']));
    expect(calls.find((c) => c[0] === 'gh')).toEqual(expect.arrayContaining(['--head', 'factory/search-p95/c1', '--base', 'main']));
    expect(fx.git(repo, 'diff', '--name-only', 'main', 'factory/search-p95/c1').trim()).toBe('src/search.js');
    const body = String(fs.readFileSync(path.join(od, 'pr-body-c1.md'), 'utf8'));
    expect(body).toContain('`latency_p95_ms <= 120`');
    expect(body).toContain('| Hidden evaluation (median of 1) | 191.37 | 104.25 |');
  });

  it('returns the exact command to finish when PR creation fails', () => {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wt = addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    const base = fx.fakeExec(() => '');
    const exec: Exec = (b, a, o) => { if (b === 'gh') throw fx.execFailure(1, 'no permission'); return base(b, a, o); };
    const r = ship.shipCandidate(exec, evidence(repo), wt, fx.tmpDir('grd-factory-od-'));
    expect(r.prUrl).toBeNull();
    expect(r.error).toMatch(/PR creation failed: no permission/);
    expect(r.manual).toMatch(/^gh pr create --base main --head factory\/search-p95\/c1 /);
  });
});

describe('writeReport', () => {
  it('writes the stop reason, candidates and spend, and a status file', () => {
    const od = fx.tmpDir('grd-factory-od-');
    const p = ship.writeReport(od, {
      order: fx.sampleOrder('/abs/repo'), stop: 'plateau', prUrl: null, shipError: null, manual: null,
      events: [{ id: 'c1', at: 't', outcome: 'dev_miss', devMedian: 150 }],
      tokens: 1234, tokenCapEnforced: true, hiddenQueries: 0, warnings: ['a warning'],
    });
    const text = String(fs.readFileSync(p, 'utf8'));
    expect(text).toContain('**Stopped: plateau.**');
    expect(text).toContain('| c1 | dev_miss | 150 |');
    expect(text).toContain('a warning');
    expect(JSON.parse(String(fs.readFileSync(path.join(od, 'status.json'), 'utf8'))).stop).toBe('plateau');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/factory/ship.test.ts --coverage=false`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `lib/factory/ship.ts`**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec, ExecError } from './exec';
import type { CandidateEvent, StopReason, WorkOrder } from './types';
const { commitCandidate } = require('./worktrees') as {
  commitCandidate: (e: Exec, dir: string, branch: string, paths: string[], msg: string) => void;
};

export interface Evidence {
  order: WorkOrder;
  candidate: string;
  hypothesis: string;
  strategy: string;
  devMedian: number;
  replicaDevMedian: number;
  hiddenMedian: number;
  changed: string[];
  tokens: number;
  hiddenQueriesUsed: number;
}

function evidenceBody(e: Evidence): string {
  const o = e.order;
  return [
    `Opened by the GRD research factory for work order \`${o.id}\`. Nothing here was merged automatically; a human merges it.`,
    '',
    `**Objective.** ${o.objective}`,
    '',
    `**Decision rule, fixed before any experiment ran:** \`${o.contract.metric} ${o.contract.comparator} ${o.contract.target}\``,
    '',
    '| Measurement | Unmodified code | This change |',
    '|---|---|---|',
    `| Dev evaluation (median of ${o.dev_eval.repeats}) | ${o.baseline?.dev} | ${e.devMedian} |`,
    `| Blind replication, dev evaluation | | ${e.replicaDevMedian} |`,
    `| Hidden evaluation (median of ${o.hidden_eval.repeats}) | ${o.baseline?.hidden} | ${e.hiddenMedian} |`,
    '',
    `**Hypothesis.** ${e.hypothesis}`,
    '',
    `**Strategy note** given to the blind replicator, which saw no diff and no transcript: ${e.strategy}`,
    '',
    `**Scope.** Every changed path is inside the allowlist (${o.editable.map((g) => `\`${g}\``).join(', ')}):`,
    ...e.changed.map((p) => `- \`${p}\``),
    '',
    `**Cost.** ${e.tokens} tokens. Hidden-evaluation queries used: ${e.hiddenQueriesUsed} of ${o.budget.hidden_queries}.`,
  ].join('\n') + '\n';
}

function why(e: unknown): string {
  const err = e as ExecError;
  return String(err.stderr || err.message || e).trim().slice(0, 500);
}

function shipCandidate(
  exec: Exec, e: Evidence, worktree: string, orderDir: string,
): { branch: string; prUrl: string | null; error: string | null; manual: string | null } {
  const branch = `factory/${e.order.id}/${e.candidate}`;
  const title = `factory: ${e.order.objective}`.slice(0, 72);
  commitCandidate(exec, worktree, branch, e.changed, `${title}\n\n${e.strategy}`);
  const bodyFile = path.join(orderDir, `pr-body-${e.candidate}.md`);
  fs.writeFileSync(bodyFile, evidenceBody(e));
  const prCommand = `gh pr create --base ${e.order.base} --head ${branch} --title ${JSON.stringify(title)} --body-file ${bodyFile}`;
  try {
    exec('git', ['-C', worktree, 'push', e.order.remote, `HEAD:refs/heads/${branch}`], { timeout: 120000 });
  } catch (err) {
    return { branch, prUrl: null, error: `push failed: ${why(err)}`, manual: `git -C ${e.order.repo} push ${e.order.remote} ${branch} && ${prCommand}` };
  }
  try {
    const out = exec('gh', ['pr', 'create', '--base', e.order.base, '--head', branch, '--title', title, '--body-file', bodyFile],
      { cwd: worktree, timeout: 120000 });
    return { branch, prUrl: out.trim().split('\n').pop() || null, error: null, manual: null };
  } catch (err) {
    return { branch, prUrl: null, error: `PR creation failed: ${why(err)}`, manual: prCommand };
  }
}

const STOP_TEXT: Record<StopReason, string> = {
  shipped: 'A patch cleared every gate and a PR was opened.',
  budget_spent: 'The budget ran out before any patch cleared every gate.',
  holdout_spent: 'The hidden-evaluation queries are used up. More would start overfitting it; a new hidden evaluation resets this.',
  plateau: 'Several candidates in a row missed the rule without beating the best dev result.',
  hidden_broken: 'The hidden evaluation failed to print its metric on a candidate. Fix it before trusting this order again; the query still counts.',
  build_failures: 'The builder failed to produce a usable change three times in a row.',
  docker_unavailable: 'Docker is not available. The factory never runs candidate code on the host.',
};

export interface ReportInput {
  order: WorkOrder;
  stop: StopReason;
  prUrl: string | null;
  shipError: string | null;
  manual: string | null;
  events: CandidateEvent[];
  tokens: number;
  tokenCapEnforced: boolean;
  hiddenQueries: number;
  warnings: string[];
}

function writeReport(orderDir: string, r: ReportInput): string {
  const o = r.order;
  const lines = [
    `# Research factory report: ${o.id}`,
    '',
    `**Stopped: ${r.stop}.** ${STOP_TEXT[r.stop]}`,
    '',
    ...(r.prUrl ? [`PR: ${r.prUrl}`, ''] : []),
    ...(r.shipError ? [`Shipping failed: ${r.shipError}`, '', 'Finish it with:', '', '```', r.manual ?? '', '```', ''] : []),
    `Objective: ${o.objective}`,
    `Rule: \`${o.contract.metric} ${o.contract.comparator} ${o.contract.target}\`; unmodified code: dev ${o.baseline?.dev}, hidden ${o.baseline?.hidden}.`,
    '',
    '| Candidate | Outcome | Dev median | Detail |',
    '|---|---|---|---|',
    ...r.events.map((e) => `| ${e.id} | ${e.outcome ?? 'unfinished'} | ${e.devMedian ?? ''} | ${(e.detail ?? '').replace(/\|/g, '/')} |`),
    '',
    `Tokens: ${r.tokens} of ${o.budget.tokens}${r.tokenCapEnforced ? '' : ' (the backend reported no counts, so the cap was not enforced)'}.`,
    `Candidates: ${r.events.length} of ${o.budget.candidates}. Hidden queries: ${r.hiddenQueries} of ${o.budget.hidden_queries}.`,
    ...(r.warnings.length ? ['', 'Warnings:', ...r.warnings.map((w) => `- ${w}`)] : []),
  ];
  const file = path.join(orderDir, 'report.md');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  fs.writeFileSync(path.join(orderDir, 'status.json'), JSON.stringify({ stop: r.stop, prUrl: r.prUrl, at: new Date().toISOString() }) + '\n');
  return file;
}

module.exports = { evidenceBody, shipCandidate, writeReport, STOP_TEXT };
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/factory/ship.test.ts --coverage=false && npx tsc --noEmit && npx eslint lib/factory`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/factory/ship.ts tests/unit/factory/ship.test.ts
git commit -q -F - <<'EOF'
feat(factory): open an evidence-backed PR and write the run report

The PR carries the rule fixed before any experiment, the baseline against
dev, replication and hidden results, the scope, and the cost. A failed
push or PR leaves the exact command to finish it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 11: The line — `runOrder`

**Files:**
- Create: `lib/factory/line.ts`
- Test: `tests/unit/factory/line.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 4–10; `runResearch`, `readResurveyConfig` (orchestrator); `readLedger` (research/ledger); `threadDir` (research/thread); `compare`; `createScheduler`.
- Produces: `interface RunOrderDeps { exec?; scheduler?; hostConfig?; runResearch?; now?; warn?; timeoutMs?; onAbort? }`; `interface RunOrderResult { stop; reportPath; prUrl; candidates; tokens; hiddenQueries }`; `runOrder(home, id, deps?): Promise<RunOrderResult>`; `readEvents(od): { byId: Map<string, CandidateEvent>; ids: string[] }`; `isPlateau(done, cmp, target, window, baselineDev): boolean`.

- [ ] **Step 1: Write the failing tests** — `tests/unit/factory/line.test.ts`:

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { CandidateEvent, QueryRecord, WorkOrder } from '../../../lib/factory/types';
import type { RunOrderDeps, RunOrderResult } from '../../../lib/factory/line';
import type { SchedulerSpawnResult, SpawnOpts } from '../../../lib/types';
const line = require('../../../lib/factory/line') as {
  runOrder: (home: string, id: string, deps?: RunOrderDeps) => Promise<RunOrderResult>;
  readEvents: (od: string) => { byId: Map<string, CandidateEvent>; ids: string[] };
  isPlateau: (done: CandidateEvent[], cmp: string, target: number, window: number, base: number) => boolean;
};
const { readQueries } = require('../../../lib/factory/gates') as { readQueries: (od: string) => QueryRecord[] };
const fx = require('./fixtures') as {
  tmpDir: (p: string) => string; git: (c: string, ...a: string[]) => string;
  makeRepo: (f: Record<string, string>) => string; fakeExec: (r: (a: string[]) => string, c?: string[][]) => Exec;
  mountedWorktree: (a: string[]) => string | null; containerCommand: (a: string[]) => string;
  sampleOrder: (r: string, o?: Partial<WorkOrder>) => WorkOrder;
  installOrder: (h: string, o: WorkOrder, s?: string) => string; worktreeCount: (r: string) => number;
};

const HYP = (n: number) => `__HYPOTHESIS__ {"statement":"Idea ${n}: cache the index.","rationale":"r","predictedOutcome":"p","refutationCondition":"if the mechanism is absent the effect disappears / amplifying it makes the effect worse"}`;
const PLAN = '__PLAN__ {"procedure":"Cache the search index in memory.","metricKey":"latency_p95_ms","comparator":"<=","target":120,"language":"shell","scriptPath":"x/run.sh"}';
const TAKE = '__TAKEAWAY__ {"kind":"domain_fact","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';

type Builder = (prompt: string, cwd: string) => void;
function scheduler(builder: Builder, prompts: string[], tokens = 1000) {
  let n = 0;
  return {
    spawn: async (prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult> => {
      prompts.push(prompt);
      let text = TAKE;
      if (opts.agentType === 'grd-hypothesizer') text = HYP(++n);
      if (opts.agentType === 'grd-factory-builder') { builder(prompt, String(opts.cwd)); text = PLAN; }
      return { exitCode: 0, stdout: JSON.stringify({ type: 'result', result: text }), stderr: '', timedOut: false, backend: 'claude', tokensUsed: tokens, workItemId: 'w' };
    },
  };
}
const writeFast: Builder = (_p, cwd) => { fs.writeFileSync(path.join(cwd, 'src/search.js'), 'FAST'); };
const writeSlow: Builder = (_p, cwd) => { fs.writeFileSync(path.join(cwd, 'src/search.js'), 'slow but changed'); };
const isReplication = (p: string) => p.includes('Implement the strategy below');

/** dev: 100 when the worktree is FAST, else 187. hidden: `hidden(fast)`. */
function docker(hidden: (fast: boolean) => number) {
  return (args: string[]): string => {
    const wt = fx.mountedWorktree(args);
    const fast = wt !== null && String(fs.readFileSync(path.join(wt, 'src/search.js'), 'utf8')).includes('FAST');
    const value = fx.containerCommand(args).startsWith('sh /grader-') ? hidden(fast) : (fast ? 100 : 187);
    return `__RESULT__ {"latency_p95_ms": ${value}}\n`;
  };
}

function world(over: Partial<WorkOrder> = {}) {
  const repo = fx.makeRepo({ 'src/search.js': 'slow', 'bench/run.js': '', 'package.json': '{}', 'README.md': 'r' });
  const home = fx.tmpDir('grd-factory-home-');
  const order = fx.sampleOrder(repo, over);
  const od = fx.installOrder(home, order, 'echo HIDDEN_EVAL_MARKER\n');
  return { repo, home, order, od };
}

async function run(w: ReturnType<typeof world>, builder: Builder, hidden: (fast: boolean) => number,
  extra: Partial<RunOrderDeps> = {}, tokens = 1000) {
  const prompts: string[] = [];
  const calls: string[][] = [];
  const r = await line.runOrder(w.home, w.order.id, {
    exec: fx.fakeExec(docker(hidden), calls), scheduler: scheduler(builder, prompts, tokens),
    warn: () => undefined, onAbort: () => () => undefined, ...extra,
  });
  return { r, prompts, calls, events: line.readEvents(w.od) };
}

describe('runOrder', () => {
  it('ships a replicated patch that passes the hidden gate, and leaves no worktree behind', async () => {
    const w = world();
    const { r, calls, events } = await run(w, writeFast, () => 104.25);
    expect(r.stop).toBe('shipped');
    expect(r.prUrl).toBe('https://github.com/acme/app/pull/7');
    expect(events.byId.get('c1')).toEqual(expect.objectContaining({ outcome: 'shipped', devMedian: 100, replicaDevMedian: 100 }));
    expect(readQueries(w.od).map((q) => q.status)).toEqual(['started', 'pass']);
    expect(fx.git(w.repo, 'diff', '--name-only', 'main', 'factory/search-p95/c1').trim()).toBe('src/search.js');
    expect(calls.find((c) => c[0] === 'gh')).toEqual(expect.arrayContaining(['--head', 'factory/search-p95/c1']));
    expect(fx.worktreeCount(w.repo)).toBe(1);
    expect(fs.existsSync(r.reportPath)).toBe(true);
  });

  it('never puts the hidden evaluation into any prompt', async () => {
    const w = world();
    const { prompts } = await run(w, writeFast, () => 104.25);
    expect(prompts.length).toBeGreaterThan(3);
    for (const p of prompts) {
      expect(p).not.toContain(path.join(w.od, 'vault'));
      expect(p).not.toContain('HIDDEN_EVAL_MARKER');
      expect(p).not.toContain('grader');
      expect(p).not.toContain('191.37');
      expect(p).not.toContain('104.25');
    }
  });

  it('spends no hidden query on a patch that fails blind replication', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 1, hidden_queries: 2, wall_minutes: 60 } });
    const { r, events } = await run(w, (p, cwd) => (isReplication(p) ? writeSlow(p, cwd) : writeFast(p, cwd)), () => 104.25);
    expect(events.byId.get('c1')).toEqual(expect.objectContaining({ outcome: 'did_not_replicate', replicaDevMedian: 187 }));
    expect(readQueries(w.od)).toEqual([]);
    expect(r.stop).toBe('budget_spent');
  });

  it('tells later hypotheses one bit about a hidden rejection, and stops when the holdout is spent', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 3, hidden_queries: 2, wall_minutes: 60 } });
    const { r, prompts, events } = await run(w, writeFast, () => 190);
    expect(r.stop).toBe('holdout_spent');
    expect(events.byId.get('c1')?.outcome).toBe('rejected_at_gate');
    const later = prompts.filter((p) => p.includes('- c1:'));
    expect(later.length).toBeGreaterThan(0);
    for (const p of later) { expect(p).toContain('rejected at the final gate'); expect(p).not.toContain('190'); }
  });

  it('stops at a plateau when candidates keep missing without improving', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 6, hidden_queries: 2, wall_minutes: 60 } });
    const { r, events } = await run(w, writeSlow, () => 104.25);
    expect(r.stop).toBe('plateau');
    expect(events.ids).toEqual(['c1', 'c2', 'c3']);
    expect([...events.byId.values()].every((e) => e.outcome === 'dev_miss')).toBe(true);
  });

  it('stops when the token budget is spent', async () => {
    const w = world({ budget: { tokens: 2500, candidates: 6, hidden_queries: 2, wall_minutes: 60 } });
    const { r } = await run(w, writeSlow, () => 104.25);
    expect(r.stop).toBe('budget_spent');
    expect(r.tokens).toBe(3000);
    expect(String(fs.readFileSync(path.join(w.od, 'spend.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(3);
  });

  it('sends an out-of-scope change back to the builder once, with the offending path', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 1, hidden_queries: 2, wall_minutes: 60 } });
    const { r, prompts } = await run(w, (p, cwd) => {
      writeFast(p, cwd);
      if (p.includes('FIX mode')) fs.writeFileSync(path.join(cwd, 'README.md'), 'r');
      else if (!isReplication(p)) fs.writeFileSync(path.join(cwd, 'README.md'), 'touched');
    }, () => 104.25);
    const fix = prompts.find((p) => p.includes('FIX mode'));
    expect(fix).toContain('changes outside the allowlist: README.md');
    expect(r.stop).toBe('shipped');
  });

  it('resumes accounting after a crash: a started query and an unfinished candidate both count', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 3, hidden_queries: 1, wall_minutes: 60 } });
    fs.writeFileSync(path.join(w.od, 'queries.jsonl'), JSON.stringify({ candidate: 'c1', status: 'started', at: 't' }) + '\n');
    fs.writeFileSync(path.join(w.od, 'candidates.jsonl'), JSON.stringify({ id: 'c1', at: 't', attempt: 1 }) + '\n');
    const { r, prompts, events } = await run(w, writeFast, () => 104.25);
    expect(r.stop).toBe('holdout_spent');
    expect(prompts).toEqual([]);
    expect(events.byId.get('c1')).toEqual(expect.objectContaining({ outcome: 'build_failed', detail: 'interrupted by a crash or abort' }));
  });

  it('removes every worktree when aborted mid-run', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 1, hidden_queries: 1, wall_minutes: 60 } });
    let abort: () => void = () => undefined;
    let during = -1;
    await run(w, (p, cwd) => { writeFast(p, cwd); if (during < 0) { abort(); during = fx.worktreeCount(w.repo); } }, () => 104.25,
      { onAbort: (h) => { abort = h; return () => undefined; } });
    expect(during).toBe(1);
    expect(fx.worktreeCount(w.repo)).toBe(1);
  });
});

describe('isPlateau', () => {
  const e = (id: string, devMedian: number | null, outcome: CandidateEvent['outcome'] = 'dev_miss'): CandidateEvent =>
    ({ id, at: 't', devMedian, outcome });
  it('needs a full window of misses with no new best', () => {
    expect(line.isPlateau([e('c1', 150), e('c2', 190)], '<=', 120, 3, 187)).toBe(false);
    expect(line.isPlateau([e('c1', 187), e('c2', 190), e('c3', null, 'build_failed')], '<=', 120, 3, 187)).toBe(true);
    expect(line.isPlateau([e('c1', 187), e('c2', 150), e('c3', 190)], '<=', 120, 3, 187)).toBe(false);
    expect(line.isPlateau([e('c1', 187), e('c2', 190), e('c3', 150, 'did_not_replicate')], '<=', 120, 3, 187)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/factory/line.test.ts --coverage=false`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `lib/factory/line.ts`**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from './exec';
import type { Baseline, CandidateEvent, CandidateOutcome, MeasureResult, SandboxSpec, StopReason, WorkOrder } from './types';
import type { SandboxCtx } from './sandbox';
import type { FactorySpawnFn, MeteredSpawn } from './spawn';
import type { Evidence, ReportInput } from './ship';
import type { DesignOverride, ResearchOptions, ResearchResult } from '../research/orchestrator';
import type { Comparator, ExperimentPlan, ExperimentResult, Hypothesis, MetricContract, ResearchThread } from '../research/types';
import type { Runner } from '../research/runner';
import type { TesseraeClient } from '../research/tesserae';
import type { SchedulerSpawnResult, SpawnOpts } from '../types';

const { defaultExec } = require('./exec') as { defaultExec: Exec };
const { loadOrder, orderDir } = require('./order') as {
  loadOrder: (h: string, id: string) => WorkOrder; orderDir: (h: string, id: string) => string;
};
const sb = require('./sandbox') as {
  DEFAULT_TIMEOUT_MS: number;
  hostUser: () => string | null;
  dockerReady: (e: Exec) => boolean;
  runSetup: (c: SandboxCtx, s: SandboxSpec, wt: string, label: string) => { ok: boolean; detail: string };
  measure: (c: SandboxCtx, s: SandboxSpec, wt: string, cmd: string, n: number, metric: string, label: string) => MeasureResult;
  removeRecordedContainers: (e: Exec, dir: string) => void;
};
const gates = require('./gates') as {
  changedPaths: (e: Exec, dir: string, base: string) => string[];
  scopeCheck: (c: string[], ed: string[], prot: string[]) => { ok: boolean; violations: string[] };
  tamperScan: (e: Exec, dir: string, base: string) => string[];
  queriesUsed: (od: string) => number;
  hiddenGate: (c: SandboxCtx, o: WorkOrder, od: string, cand: string, wt: string) =>
    { outcome: 'pass' | 'fail' | 'broken'; median: number | null; detail: string };
};
const wt = require('./worktrees') as {
  addWorktree: (e: Exec, repo: string, dir: string, base: string) => string;
  untrackedPaths: (e: Exec, dir: string) => string[];
  restoreToSetupState: (e: Exec, dir: string, base: string, a: ReadonlySet<string>) => void;
  removeWorktree: (e: Exec, repo: string, dir: string) => void;
  removeAllOwn: (e: Exec, repo: string, root: string) => void;
};
const prompts = require('./prompts') as {
  composeQuestion: (o: WorkOrder, base: string, h: CandidateEvent[]) => string;
  buildPrompt: (o: WorkOrder, hyp: Pick<Hypothesis, 'id' | 'statement'>, wt: string, iterDir: string) => string;
  fixPrompt: (o: WorkOrder, hyp: Pick<Hypothesis, 'id' | 'statement'>, r: Pick<ExperimentResult, 'exitCode' | 'stderrExcerpt'>,
    wt: string, iterDir: string, attempt: number, max: number) => string;
  replicationPrompt: (o: WorkOrder, s: string, wt: string, iterDir: string) => string;
  strategyNote: (p: string) => string;
};
const { BUILDER, BudgetSpentError, createMeteredSpawn } = require('./spawn') as {
  BUILDER: string;
  BudgetSpentError: new (m: string) => Error;
  createMeteredSpawn: (o: { scheduler: { spawn: (p: string, o: SpawnOpts) => Promise<SchedulerSpawnResult> };
    orderDir: string; budgetTokens: number; warn: (m: string) => void }) => MeteredSpawn;
};
const { shipCandidate, writeReport } = require('./ship') as {
  shipCandidate: (e: Exec, ev: Evidence, wt: string, od: string) => { branch: string; prUrl: string | null; error: string | null; manual: string | null };
  writeReport: (od: string, r: ReportInput) => string;
};
const { runResearch, readResurveyConfig } = require('../research/orchestrator') as {
  runResearch: (cwd: string, q: string, o: ResearchOptions) => Promise<ResearchResult>;
  readResurveyConfig: (cwd: string) => { cap: number; window: number; fetch: boolean };
};
const { readLedger } = require('../research/ledger') as { readLedger: (cwd: string, id: string) => Hypothesis[] };
const { threadDir } = require('../research/thread') as { threadDir: (cwd: string, id: string) => string };
const { compare } = require('../research/verdict') as { compare: (v: number, c: Comparator, t: number) => boolean };
const { createScheduler } = require('../scheduler') as {
  createScheduler: (c: unknown, s?: unknown) => { spawn: (p: string, o: SpawnOpts) => Promise<SchedulerSpawnResult> } | null;
};

const MAX_BUILD_FAILURES = 3;

/** The line's research state dir config, following BENCH_WORKDIR_CONFIG: unattended, nothing persisted. */
const LINE_CONFIG: Readonly<Record<string, unknown>> = Object.freeze({
  research_gates: { experiment_execution: false, kg_write: false, interactive: { enabled: false } },
  research_persist_knowledge: false,
  research_eval_report: false,
  research_max_resurveys: 0,
  research_max_debug_depth: 1,
});

/** The factory grounds agents on the reference worktree, not a knowledge graph. */
const NO_KG: TesseraeClient = {
  isAvailable: () => false,
  compile: async () => ({ status: 'skipped_no_tesserae', detail: 'research factory: no knowledge graph', graphPath: null }),
  querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: 'research factory: no knowledge graph' }),
};
const NO_RETRIEVE = async (): Promise<{ results: Array<Record<string, unknown>>; modes: Record<string, boolean>; detail: string }> =>
  ({ results: [], modes: {}, detail: 'research factory: grounding comes from the reference worktree' });

export interface RunOrderDeps {
  exec?: Exec;
  scheduler?: { spawn: (p: string, o: SpawnOpts) => Promise<SchedulerSpawnResult> };
  /** The invoking project's scheduler and superpowers blocks. */
  hostConfig?: Record<string, unknown>;
  runResearch?: (cwd: string, q: string, o: ResearchOptions) => Promise<ResearchResult>;
  now?: () => number;
  warn?: (m: string) => void;
  timeoutMs?: number;
  /** Registers an abort handler; returns its unregister function. Default: SIGINT and SIGTERM. */
  onAbort?: (handler: () => void) => () => void;
}

export interface RunOrderResult {
  stop: StopReason;
  reportPath: string;
  prUrl: string | null;
  candidates: number;
  tokens: number;
  hiddenQueries: number;
}

interface Current {
  id: string;
  key: string;
  worktree: string;
  artifacts: Set<string>;
  lastCheck: 'none' | 'empty' | 'scope' | 'tamper' | 'dev_failed' | 'measured';
  detail: string;
  devMedian: number | null;
}

interface Line {
  order: WorkOrder;
  od: string;
  lineDir: string;
  baseWt: string;
  exec: Exec;
  ctx: SandboxCtx;
  byId: Map<string, CandidateEvent>;
  ids: string[];
  current: Current | null;
  builderCwd: string;
  attempt: number;
  now: () => number;
}

function readEvents(od: string): { byId: Map<string, CandidateEvent>; ids: string[] } {
  const byId = new Map<string, CandidateEvent>();
  const ids: string[] = [];
  const f = path.join(od, 'candidates.jsonl');
  if (!fs.existsSync(f)) return { byId, ids };
  for (const l of String(fs.readFileSync(f, 'utf8')).split('\n').filter(Boolean)) {
    const e = JSON.parse(l) as CandidateEvent;
    if (!byId.has(e.id)) ids.push(e.id);
    byId.set(e.id, { ...byId.get(e.id), ...e });
  }
  return { byId, ids };
}

function record(l: Line, e: Omit<CandidateEvent, 'at'>): void {
  const full: CandidateEvent = { ...e, at: new Date(l.now()).toISOString() };
  fs.appendFileSync(path.join(l.od, 'candidates.jsonl'), JSON.stringify(full) + '\n');
  if (!l.byId.has(e.id)) l.ids.push(e.id);
  l.byId.set(e.id, { ...l.byId.get(e.id), ...full });
}

function history(l: Line): CandidateEvent[] { return l.ids.map((id) => l.byId.get(id) as CandidateEvent); }

function better(a: number, b: number, cmp: Comparator, target: number): boolean {
  if (cmp === '<=' || cmp === '<') return a < b;
  if (cmp === '>=' || cmp === '>') return a > b;
  return Math.abs(a - target) < Math.abs(b - target);
}

const MISSES: ReadonlySet<CandidateOutcome> = new Set(['dev_miss', 'build_failed', 'out_of_scope', 'tampering']);

/** The last `window` finished candidates all missed the rule, and none beat the best before them. */
function isPlateau(done: CandidateEvent[], cmp: Comparator, target: number, window: number, baselineDev: number): boolean {
  if (done.length < window) return false;
  const last = done.slice(-window);
  if (!last.every((e) => e.outcome !== undefined && MISSES.has(e.outcome))) return false;
  let best = baselineDev;
  for (const e of done.slice(0, -window)) {
    if (typeof e.devMedian === 'number' && better(e.devMedian, best, cmp, target)) best = e.devMedian;
  }
  return !last.some((e) => typeof e.devMedian === 'number' && better(e.devMedian, best, cmp, target));
}

function finalize(l: Line, cur: Current, reason?: string): void {
  const outcome: CandidateOutcome = cur.lastCheck === 'measured' ? 'dev_miss'
    : cur.lastCheck === 'scope' ? 'out_of_scope'
      : cur.lastCheck === 'tamper' ? 'tampering' : 'build_failed';
  record(l, { id: cur.id, outcome, devMedian: cur.devMedian, detail: reason ?? cur.detail });
  wt.removeWorktree(l.exec, l.order.repo, cur.worktree);
  if (l.current === cur) l.current = null;
}

/** One worktree per (thread, iteration). A redesign of the same iteration starts over from setup. */
function allocate(l: Line, thread: ResearchThread): Current {
  const key = `${thread.id}#${thread.iteration}`;
  const cur = l.current;
  if (cur && cur.key === key) {
    wt.restoreToSetupState(l.exec, cur.worktree, l.order.base, cur.artifacts);
    cur.lastCheck = 'none'; cur.detail = ''; cur.devMedian = null;
    return cur;
  }
  if (cur) finalize(l, cur);
  const id = `c${l.ids.length + 1}`;
  const dir = path.join(l.od, 'worktrees', id);
  // Recorded before anything can fail, so the candidate counts against the budget either way.
  record(l, { id, attempt: l.attempt, threadId: thread.id, iteration: thread.iteration });
  wt.addWorktree(l.exec, l.order.repo, dir, l.order.base);
  const next: Current = { id, key, worktree: dir, artifacts: new Set(), lastCheck: 'none', detail: '', devMedian: null };
  l.current = next;
  l.builderCwd = dir;
  const setup = sb.runSetup(l.ctx, l.order.sandbox, dir, `${id}-setup`);
  if (!setup.ok) throw new Error(`setup failed for ${id}: ${setup.detail}`);
  next.artifacts = new Set(wt.untrackedPaths(l.exec, dir));
  return next;
}

function makeDesign(l: Line): DesignOverride {
  return {
    agent: BUILDER,
    prompt: (thread, hyp, iterDir) => prompts.buildPrompt(l.order, hyp, allocate(l, thread).worktree, iterDir),
    fixPrompt: (hyp, _plan, result, iterDir, attempt, maxDepth) => {
      const cur = l.current;
      if (!cur) throw new Error('research factory: fix requested with no current candidate');
      return prompts.fixPrompt(l.order, hyp, result, cur.worktree, iterDir, attempt, maxDepth);
    },
  };
}

/** Checks a candidate's change, then measures it on the dev evaluation in the sandbox. */
function makeRunner(l: Line): Runner {
  return {
    run(_plan: ExperimentPlan, _threadDir: string): ExperimentResult {
      const cur = l.current;
      if (!cur) throw new Error('research factory: runner called with no current candidate');
      const start = l.now();
      const fail = (check: Current['lastCheck'], detail: string): ExperimentResult => {
        cur.lastCheck = check; cur.detail = detail;
        return { metrics: {}, exitCode: 3, runner: 'docker', durationMs: l.now() - start, stdoutExcerpt: '', stderrExcerpt: detail, failureClass: 'H4' };
      };
      const o = l.order;
      const changed = gates.changedPaths(l.exec, cur.worktree, o.base).filter((p) => !cur.artifacts.has(p));
      if (changed.length === 0) return fail('empty', 'the change is empty: no file under the allowed paths was modified');
      const scope = gates.scopeCheck(changed, o.editable, o.dev_eval.files);
      if (!scope.ok) return fail('scope', `changes outside the allowlist: ${scope.violations.join(', ')}. Revert them; only ${o.editable.join(', ')} may change.`);
      const tamper = gates.tamperScan(l.exec, cur.worktree, o.base).filter((p) => !cur.artifacts.has(p));
      if (tamper.length > 0) return fail('tamper', `the change adds the text __RESULT__ in: ${tamper.join(', ')}. Remove it.`);
      const m = sb.measure(l.ctx, o.sandbox, cur.worktree, o.dev_eval.command, o.dev_eval.repeats, o.contract.metric, `${cur.id}-dev`);
      if (!m.ok || m.median === null) return fail('dev_failed', `the dev evaluation failed on this change: ${m.stderrExcerpt || `exit ${m.exitCode}`}`);
      cur.lastCheck = 'measured'; cur.devMedian = m.median; cur.detail = '';
      return { metrics: { [o.contract.metric]: m.median }, exitCode: 0, runner: 'docker', durationMs: l.now() - start, stdoutExcerpt: m.stdoutExcerpt, failureClass: 'none' };
    },
  };
}

function fillHypotheses(l: Line, threadId: string): void {
  const ledger = readLedger(l.lineDir, threadId);
  for (const e of history(l)) {
    if (e.threadId !== threadId || e.hypothesis !== undefined || e.iteration === undefined) continue;
    const h = ledger.find((x) => x.iteration === e.iteration);
    if (h) record(l, { id: e.id, hypothesis: h.statement });
  }
}

interface GateResult { stop: StopReason | null; prUrl: string | null; shipError: string | null; manual: string | null; }
const CONTINUE: GateResult = { stop: null, prUrl: null, shipError: null, manual: null };

/** Blind replication, then one hidden query, then the PR. The leaking resource is spent last. */
async function trustGates(l: Line, cur: Current, spawnFn: FactorySpawnFn, metered: MeteredSpawn): Promise<GateResult> {
  const o = l.order;
  const ev = l.byId.get(cur.id) as CandidateEvent;
  const iterDir = path.join(threadDir(l.lineDir, ev.threadId as string), 'experiments', String(ev.iteration));
  const plan = JSON.parse(String(fs.readFileSync(path.join(iterDir, 'plan.json'), 'utf8'))) as ExperimentPlan;
  const strategy = prompts.strategyNote(plan.procedure);
  record(l, { id: cur.id, strategy, devMedian: cur.devMedian });

  const rdir = path.join(l.od, 'worktrees', `${cur.id}r`);
  let replica: number | null = null;
  try {
    wt.addWorktree(l.exec, o.repo, rdir, o.base);
    const setup = sb.runSetup(l.ctx, o.sandbox, rdir, `${cur.id}r-setup`);
    if (setup.ok) {
      const artifacts = new Set(wt.untrackedPaths(l.exec, rdir));
      l.builderCwd = rdir;
      await spawnFn(prompts.replicationPrompt(o, strategy, rdir, iterDir), BUILDER);
      const changed = gates.changedPaths(l.exec, rdir, o.base).filter((p) => !artifacts.has(p));
      const clean = changed.length > 0 && gates.scopeCheck(changed, o.editable, o.dev_eval.files).ok
        && gates.tamperScan(l.exec, rdir, o.base).filter((p) => !artifacts.has(p)).length === 0;
      if (clean) {
        const m = sb.measure(l.ctx, o.sandbox, rdir, o.dev_eval.command, o.dev_eval.repeats, o.contract.metric, `${cur.id}r-dev`);
        replica = m.ok ? m.median : null;
      }
    }
  } catch (e) {
    if (e instanceof BudgetSpentError) {
      finalize(l, cur, 'stopped: the token budget ran out during replication');
      return { ...CONTINUE, stop: 'budget_spent' };
    }
    record(l, { id: cur.id, detail: `replication failed: ${(e as Error).message}` });
  } finally {
    wt.removeWorktree(l.exec, o.repo, rdir);
    l.builderCwd = cur.worktree;
  }
  if (replica === null || !compare(replica, o.contract.comparator, o.contract.target)) {
    record(l, { id: cur.id, outcome: 'did_not_replicate', replicaDevMedian: replica });
    wt.removeWorktree(l.exec, o.repo, cur.worktree); l.current = null;
    return CONTINUE;
  }
  record(l, { id: cur.id, replicaDevMedian: replica });

  if (!sb.dockerReady(l.exec)) return { ...CONTINUE, stop: 'docker_unavailable' };
  const g = gates.hiddenGate(l.ctx, o, l.od, cur.id, cur.worktree);
  if (g.outcome !== 'pass') {
    // One bit for later hypotheses. The value itself lives only in queries.jsonl.
    record(l, { id: cur.id, outcome: 'rejected_at_gate', detail: g.outcome === 'broken' ? 'the hidden evaluation broke on this candidate' : '' });
    wt.removeWorktree(l.exec, o.repo, cur.worktree); l.current = null;
    return g.outcome === 'broken' ? { ...CONTINUE, stop: 'hidden_broken' } : CONTINUE;
  }

  const changed = gates.changedPaths(l.exec, cur.worktree, o.base).filter((p) => !cur.artifacts.has(p));
  const res = shipCandidate(l.exec, {
    order: o, candidate: cur.id, hypothesis: ev.hypothesis ?? '', strategy,
    devMedian: cur.devMedian as number, replicaDevMedian: replica, hiddenMedian: g.median as number,
    changed, tokens: metered.spent(), hiddenQueriesUsed: gates.queriesUsed(l.od),
  }, cur.worktree, l.od);
  record(l, { id: cur.id, outcome: 'shipped', detail: res.prUrl ?? res.error ?? '' });
  wt.removeWorktree(l.exec, o.repo, cur.worktree); l.current = null;
  return { stop: 'shipped', prUrl: res.prUrl, shipError: res.error, manual: res.manual };
}

function defaultOnAbort(handler: () => void): () => void {
  const onSignal = (): void => { try { handler(); } finally { process.exit(130); } };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return () => { process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal); };
}

function startedAt(od: string, now: () => number): number {
  const f = path.join(od, 'started.json');
  if (fs.existsSync(f)) return (JSON.parse(String(fs.readFileSync(f, 'utf8'))) as { at: number }).at;
  const at = now();
  fs.writeFileSync(f, JSON.stringify({ at }) + '\n');
  return at;
}

async function runOrder(home: string, id: string, deps: RunOrderDeps = {}): Promise<RunOrderResult> {
  const exec = deps.exec || defaultExec;
  const now = deps.now || Date.now;
  const warnings: string[] = [];
  const warn = (m: string): void => { warnings.push(m.trim()); (deps.warn || ((x: string) => { process.stderr.write(x); }))(m); };
  const order = loadOrder(home, id);
  if (!order.baseline) throw new Error(`order "${id}" has no baseline; save it through validate`);
  const baseline: Baseline = order.baseline;
  const od = orderDir(home, id);
  const lineDir = path.join(od, 'line');
  fs.mkdirSync(path.join(lineDir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(lineDir, '.planning', 'config.json'), JSON.stringify(LINE_CONFIG, null, 2) + '\n');
  const host = deps.hostConfig || {};
  const scheduler = deps.scheduler || createScheduler(host.scheduler, host.superpowers);
  if (!scheduler) throw new Error('no scheduler configured: run `gd factory run` from a GRD project whose .planning/config.json has a scheduler block');

  // Crash recovery touches only what this order recorded: its own worktrees and containers.
  sb.removeRecordedContainers(exec, od);
  wt.removeAllOwn(exec, order.repo, path.join(od, 'worktrees'));
  const { byId, ids } = readEvents(od);
  const l: Line = {
    order, od, lineDir, baseWt: '', exec,
    ctx: { exec, ledgerDir: od, orderId: id, user: sb.hostUser(), timeoutMs: deps.timeoutMs ?? sb.DEFAULT_TIMEOUT_MS },
    byId, ids, current: null, builderCwd: lineDir, attempt: 0, now,
  };
  for (const e of history(l)) {
    if (!e.outcome) record(l, { id: e.id, outcome: 'build_failed', detail: 'interrupted by a crash or abort' });
  }
  const begun = startedAt(od, now);
  const metered = createMeteredSpawn({ scheduler, orderDir: od, budgetTokens: order.budget.tokens, warn });
  const spawnFn = metered.spawnFn((agent) => (agent === BUILDER ? l.builderCwd : lineDir), () => (l.current ? l.current.id : null));
  const window = readResurveyConfig(lineDir).window;
  const rr = deps.runResearch || runResearch;
  const cleanup = (): void => {
    wt.removeAllOwn(exec, order.repo, path.join(od, 'worktrees'));
    sb.removeRecordedContainers(exec, od);
  };
  const unregister = (deps.onAbort || defaultOnAbort)(cleanup);

  let stop: StopReason | null = null;
  let gate: GateResult = CONTINUE;
  let buildFailures = 0;
  const stopReason = (): StopReason | null => {
    if (!sb.dockerReady(exec)) return 'docker_unavailable';
    if (l.ids.length >= order.budget.candidates) return 'budget_spent';
    if (metered.tokenCapEnforced() && metered.spent() >= order.budget.tokens) return 'budget_spent';
    if (now() - begun >= order.budget.wall_minutes * 60000) return 'budget_spent';
    if (gates.queriesUsed(od) >= order.budget.hidden_queries) return 'holdout_spent';
    if (buildFailures >= MAX_BUILD_FAILURES) return 'build_failures';
    const done = history(l).filter((e) => e.outcome !== undefined);
    return isPlateau(done, order.contract.comparator, order.contract.target, window, baseline.dev) ? 'plateau' : null;
  };
  try {
    if (!sb.dockerReady(exec)) {
      stop = 'docker_unavailable';
    } else {
      l.baseWt = wt.addWorktree(exec, order.repo, path.join(od, 'worktrees', 'base'), order.base);
      for (;;) {
        stop = stopReason();
        if (stop) break;
        l.attempt += 1;
        let result: ResearchResult | null = null;
        let error: string | null = null;
        const contract: MetricContract = { metricKey: order.contract.metric, comparator: order.contract.comparator, target: order.contract.target };
        try {
          result = await rr(lineDir, prompts.composeQuestion(order, l.baseWt, history(l)), {
            maxIterations: Math.min(order.budget.candidates - l.ids.length, window), noGates: true,
            contract, design: makeDesign(l), runner: makeRunner(l), spawn: spawnFn,
            kgClient: NO_KG, retrieve: NO_RETRIEVE,
          });
        } catch (e) {
          error = (e as Error).message;
        }
        if (result) fillHypotheses(l, result.threadId);
        const cur = l.current;
        if (result && result.status === 'supported' && cur && cur.lastCheck === 'measured') {
          buildFailures = 0;
          gate = await trustGates(l, cur, spawnFn, metered);
          if (gate.stop) { stop = gate.stop; break; }
          continue;
        }
        const reason = error
          ?? (result && result.status !== 'exhausted' ? result.errorReason ?? `the research loop returned status ${result.status}` : undefined);
        if (cur) finalize(l, cur, reason);
        const budgetOut = metered.tokenCapEnforced() && metered.spent() >= order.budget.tokens;
        const failed = cur ? l.byId.get(cur.id)?.outcome === 'build_failed' : reason !== undefined;
        buildFailures = failed && !budgetOut ? buildFailures + 1 : 0;
        if (reason && !budgetOut) warnings.push(`attempt ${l.attempt}: ${reason}`);
      }
    }
  } finally {
    unregister();
    cleanup();
  }
  const final = stop as StopReason;
  const reportPath = writeReport(od, {
    order, stop: final, prUrl: gate.prUrl, shipError: gate.shipError, manual: gate.manual,
    events: history(l), tokens: metered.spent(), tokenCapEnforced: metered.tokenCapEnforced(),
    hiddenQueries: gates.queriesUsed(od), warnings,
  });
  return { stop: final, reportPath, prUrl: gate.prUrl, candidates: l.ids.length, tokens: metered.spent(), hiddenQueries: gates.queriesUsed(od) };
}

module.exports = { runOrder, readEvents, isPlateau, LINE_CONFIG };
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest tests/unit/factory/line.test.ts --coverage=false && npx tsc --noEmit && npx eslint lib/factory`
Expected: PASS. If a test fails, diagnose the cause before touching the test. The assertions encode the spec.

- [ ] **Step 5: Mutation checks.** Each must turn at least one test red; restore after each.
  1. In `trustGates`, move the replication block after the hidden gate. The "spends no hidden query" test must fail.
  2. In `describeOutcome` (prompts.ts), append `(${e.detail})` to the `rejected_at_gate` text, and in `trustGates` record `detail: String(g.median)`. The "one bit" test must fail.
  3. Delete `cleanup()` from the `finally`. The first test's `worktreeCount` assertion must fail.

- [ ] **Step 6: Commit**

```bash
git add lib/factory/line.ts tests/unit/factory/line.test.ts
git commit -q -F - <<'EOF'
feat(factory): the research line, from hypothesis to PR

Drives the research loop with a builder in place of the experiment
designer, measures each patch in a container, then runs blind replication
before spending one hidden-evaluation query, and ships only what clears
both. Stops on shipment, budget, spent holdout, plateau or broken gates,
and removes its own worktrees and containers on every exit path.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 12: CLI wiring

**Files:**
- Create: `lib/factory/cli.ts`
- Modify: `bin/grd-tools.ts` (add `case 'factory'` after `case 'bench'`; add `'factory'` to `TOP_LEVEL_COMMANDS`), `lib/cli/index.ts` (add `'factory'` to the tool-command set, after `'bench'`), `bin/gd.ts` (help text under "Research:")
- Test: `tests/unit/factory/cli.test.ts`

**Interfaces:**
- Consumes: `scanRepo`, `validateDraft`, `saveOrder`, `factoryHome`, `runOrder`, `readEvents`, `readSpent`, `queriesUsed`, `readHostSpawnConfig` (research/cli-bench).
- Produces: `cmdFactoryScan(cwd, repo, raw, deps?)`, `cmdFactoryValidate(cwd, id, raw, deps?)`, `cmdFactorySave(cwd, id, raw, deps?)`, `cmdFactoryRun(cwd, id, raw, deps?)`, `cmdFactoryStatus(cwd, id | undefined, raw, deps?)`.

- [ ] **Step 1: Write the failing tests**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { FactoryCliDeps } from '../../../lib/factory/cli';
const cli = require('../../../lib/factory/cli') as {
  cmdFactoryValidate: (c: string, id: string, raw: boolean, d?: FactoryCliDeps) => never;
  cmdFactorySave: (c: string, id: string, raw: boolean, d?: FactoryCliDeps) => never;
  cmdFactoryRun: (c: string, id: string, raw: boolean, d?: FactoryCliDeps) => Promise<never>;
  cmdFactoryStatus: (c: string, id: string | undefined, raw: boolean, d?: FactoryCliDeps) => never;
};
const { captureOutput, captureError, captureOutputAsync } = require('../../helpers/setup') as {
  captureOutput: (fn: () => void) => { stdout: string; exitCode: number };
  captureError: (fn: () => void) => { stderr: string; exitCode: number };
  captureOutputAsync: (fn: () => Promise<void>) => Promise<{ stdout: string; exitCode: number }>;
};
const { tmpDir } = require('./fixtures') as { tmpDir: (p: string) => string };

describe('factory CLI', () => {
  it('prints validate checks as PASS/FAIL lines with --raw', () => {
    const r = captureOutput(() => cli.cmdFactoryValidate('/x', 'o1', true, {
      home: '/h', validateDraft: () => ({ ok: false, noisy: false, checks: [{ id: 'docker', ok: false, detail: 'no docker' }] }),
    }));
    expect(r.stdout).toBe('FAIL  docker  no docker\n');
  });

  it('reports a save error on stderr with a nonzero exit', () => {
    const r = captureError(() => cli.cmdFactorySave('/x', 'o1', false, {
      home: '/h', saveOrder: () => { throw new Error('has not passed validate'); },
    }));
    expect(r.stderr).toMatch(/factory save: has not passed validate/);
    expect(r.exitCode).not.toBe(0);
  });

  it('passes the host scheduler config to the line and prints the outcome', async () => {
    const cwd = tmpDir('grd-factory-cwd-');
    fs.mkdirSync(path.join(cwd, '.planning'));
    fs.writeFileSync(path.join(cwd, '.planning', 'config.json'), JSON.stringify({ scheduler: { a: 1 }, other: 2 }));
    let seen: Record<string, unknown> | undefined;
    const r = await captureOutputAsync(() => cli.cmdFactoryRun(cwd, 'o1', true, {
      home: '/h',
      runOrder: async (_h, _id, d) => { seen = d.hostConfig; return { stop: 'shipped', reportPath: '/h/r.md', prUrl: 'https://x/pull/1', candidates: 1, tokens: 9, hiddenQueries: 1 }; },
    }));
    expect(seen).toEqual({ scheduler: { a: 1 } });
    expect(r.stdout).toBe('shipped  https://x/pull/1\nreport: /h/r.md\n');
  });

  it('lists drafts and orders under the factory home', () => {
    const home = tmpDir('grd-factory-home-');
    fs.mkdirSync(path.join(home, 'drafts', 'd1'), { recursive: true });
    fs.mkdirSync(path.join(home, 'orders', 'o1'), { recursive: true });
    const r = captureOutput(() => cli.cmdFactoryStatus('/x', undefined, false, { home }));
    expect(JSON.parse(r.stdout)).toEqual({ home, drafts: ['d1'], orders: ['o1'] });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest tests/unit/factory/cli.test.ts --coverage=false`
Expected: FAIL, module not found.

- [ ] **Step 3: Create `lib/factory/cli.ts`**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { CandidateEvent, WorkOrder } from './types';
import type { ScanReport, ValidateReport } from './intake';
import type { RunOrderDeps, RunOrderResult } from './line';
const { output, error } = require('../utils') as {
  output: (r: unknown, raw: boolean, rawVal?: unknown) => never;
  error: (m: string) => never;
};
const { factoryHome, orderDir, loadOrder, saveOrder } = require('./order') as {
  factoryHome: () => string;
  orderDir: (h: string, id: string) => string;
  loadOrder: (h: string, id: string) => WorkOrder;
  saveOrder: (h: string, id: string) => string;
};
const { scanRepo, validateDraft } = require('./intake') as {
  scanRepo: (repo: string) => ScanReport;
  validateDraft: (h: string, id: string) => ValidateReport;
};
const { runOrder, readEvents } = require('./line') as {
  runOrder: (h: string, id: string, d: RunOrderDeps) => Promise<RunOrderResult>;
  readEvents: (od: string) => { byId: Map<string, CandidateEvent>; ids: string[] };
};
const { readSpent } = require('./spawn') as { readSpent: (od: string) => number };
const { queriesUsed } = require('./gates') as { queriesUsed: (od: string) => number };
const { readHostSpawnConfig } = require('../research/cli-bench') as {
  readHostSpawnConfig: (cwd: string) => Record<string, unknown>;
};

export interface FactoryCliDeps {
  home?: string;
  scanRepo?: (repo: string) => ScanReport;
  validateDraft?: (h: string, id: string) => ValidateReport;
  saveOrder?: (h: string, id: string) => string;
  runOrder?: (h: string, id: string, d: RunOrderDeps) => Promise<RunOrderResult>;
}

function homeOf(d: FactoryCliDeps): string { return d.home || factoryHome(); }

function cmdFactoryScan(_cwd: string, repo: string, raw: boolean, d: FactoryCliDeps = {}): never {
  let r: ScanReport;
  try { r = (d.scanRepo || scanRepo)(path.resolve(repo)); } catch (e) { return error(`factory scan: ${(e as Error).message}`); }
  const text = [
    `ecosystem: ${r.ecosystem}`,
    `image: ${r.proposedImage ?? '(ask)'}  setup: ${r.proposedSetup || '(none)'}  memory: ${r.proposedMemory} of ${r.freeMemoryMb} MB free`,
    ...r.measurements.map((m) => `${m.kind}  ${m.name}  ${m.command}`),
  ].join('\n') + '\n';
  return output(r, raw, text);
}

function cmdFactoryValidate(_cwd: string, id: string, raw: boolean, d: FactoryCliDeps = {}): never {
  let r: ValidateReport;
  try { r = (d.validateDraft || validateDraft)(homeOf(d), id); } catch (e) { return error(`factory validate: ${(e as Error).message}`); }
  return output(r, raw, r.checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.id}  ${c.detail}`).join('\n') + '\n');
}

function cmdFactorySave(_cwd: string, id: string, raw: boolean, d: FactoryCliDeps = {}): never {
  let dir: string;
  try { dir = (d.saveOrder || saveOrder)(homeOf(d), id); } catch (e) { return error(`factory save: ${(e as Error).message}`); }
  return output({ id, orderDir: dir }, raw, `saved ${id}; start it with: gd factory run ${id}\n`);
}

async function cmdFactoryRun(cwd: string, id: string, raw: boolean, d: FactoryCliDeps = {}): Promise<never> {
  let r: RunOrderResult;
  try {
    r = await (d.runOrder || runOrder)(homeOf(d), id, { hostConfig: readHostSpawnConfig(cwd) });
  } catch (e) {
    return error(`factory run: ${(e as Error).message}`);
  }
  return output(r, raw, `${r.stop}${r.prUrl ? `  ${r.prUrl}` : ''}\nreport: ${r.reportPath}\n`);
}

function list(dir: string): string[] { return fs.existsSync(dir) ? (fs.readdirSync(dir) as string[]).sort() : []; }

function cmdFactoryStatus(_cwd: string, id: string | undefined, raw: boolean, d: FactoryCliDeps = {}): never {
  const home = homeOf(d);
  if (!id) {
    const payload = { home, drafts: list(path.join(home, 'drafts')), orders: list(path.join(home, 'orders')) };
    return output(payload, raw, `home: ${home}\ndrafts: ${payload.drafts.join(', ') || '(none)'}\norders: ${payload.orders.join(', ') || '(none)'}\n`);
  }
  let o: WorkOrder;
  try { o = loadOrder(home, id); } catch (e) { return error(`factory status: ${(e as Error).message}`); }
  const od = orderDir(home, id);
  const statusFile = path.join(od, 'status.json');
  const last = fs.existsSync(statusFile) ? JSON.parse(String(fs.readFileSync(statusFile, 'utf8'))) as { stop: string; prUrl: string | null } : null;
  const { byId, ids } = readEvents(od);
  const payload = {
    id, stop: last?.stop ?? null, prUrl: last?.prUrl ?? null,
    candidates: ids.map((c) => byId.get(c)), tokens: readSpent(od), hiddenQueries: queriesUsed(od), budget: o.budget,
  };
  const text = [
    `${id}: ${payload.stop ?? 'not finished'}${payload.prUrl ? `  ${payload.prUrl}` : ''}`,
    `tokens ${payload.tokens} of ${o.budget.tokens}; candidates ${ids.length} of ${o.budget.candidates}; hidden queries ${payload.hiddenQueries} of ${o.budget.hidden_queries}`,
    ...ids.map((c) => `${c}  ${byId.get(c)?.outcome ?? 'unfinished'}`),
  ].join('\n') + '\n';
  return output(payload, raw, text);
}

module.exports = { cmdFactoryScan, cmdFactoryValidate, cmdFactorySave, cmdFactoryRun, cmdFactoryStatus };
```

- [ ] **Step 4: Wire the subcommand.** In `bin/grd-tools.ts`, after the `case 'bench': {…}` block:

```ts
    case 'factory': {
      const f = require('../lib/factory/cli') as {
        cmdFactoryScan: (c: string, r: string, raw: boolean) => never;
        cmdFactoryValidate: (c: string, id: string, raw: boolean) => never;
        cmdFactorySave: (c: string, id: string, raw: boolean) => never;
        cmdFactoryRun: (c: string, id: string, raw: boolean) => Promise<never>;
        cmdFactoryStatus: (c: string, id: string | undefined, raw: boolean) => never;
      };
      const sub: string = args[1];
      validateSubcommand(sub, ['scan', 'validate', 'save', 'run', 'status'], 'factory');
      const target: string | undefined = args[2];
      if (sub === 'status') { f.cmdFactoryStatus(cwd, target, raw); return; }
      if (!target) error(`factory ${sub}: ${sub === 'scan' ? '<repo>' : '<order-id>'} is required`);
      const t = target as string;
      if (sub === 'scan') { f.cmdFactoryScan(cwd, t, raw); return; }
      if (sub === 'validate') { f.cmdFactoryValidate(cwd, t, raw); return; }
      if (sub === 'save') { f.cmdFactorySave(cwd, t, raw); return; }
      await f.cmdFactoryRun(cwd, t, raw);
      return;
    }
```

Add `'factory',` after `'bench',` in `TOP_LEVEL_COMMANDS` (near line 2666) and in the tool-command set in `lib/cli/index.ts` (near line 119). In `bin/gd.ts`, under "Research:" after the `bench` lines:

```
  factory scan|validate|save|run|status
                       Research factory: an order runs until a patch passes
                       a hidden evaluation, then opens a PR for you to merge
```

- [ ] **Step 5: Run to verify**

Run: `npx jest tests/unit/factory/cli.test.ts tests/unit/cli --coverage=false && npx tsc --noEmit && npm run lint && node bin/grd-tools.js factory status --raw`
Expected: tests PASS; lint clean; the last command prints `home: …/.grd/factory` with `(none)` for drafts and orders.

- [ ] **Step 6: Commit**

```bash
git add lib/factory/cli.ts tests/unit/factory/cli.test.ts bin/grd-tools.ts lib/cli/index.ts bin/gd.ts
git commit -q -F - <<'EOF'
feat(factory): gd factory scan|validate|save|run|status

JSON by default and human text with --raw, like every GRD tool command.
run passes the invoking project's scheduler config to the line, the same
way gd bench does.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 13: The builder agent and the `/grd:factory` interview

**Files:**
- Create: `agents/grd-factory-builder.md`, `commands/factory.md`
- Modify: `commands/help.md` (add the catalog entry after `/grd:research`)
- Test: existing `tests/unit/agent-audit.test.ts` and `tests/unit/help-catalog.test.ts`

- [ ] **Step 1: Create `agents/grd-factory-builder.md`**

```markdown
---
name: grd-factory-builder
description: Implements one hypothesis, or one replication strategy, as a minimal code change inside a git worktree for the research factory. Edits only allowlisted paths and never runs anything; the factory measures the change in a sandbox.
tools: Read, Write, Edit, Grep, Glob
disallowedTools: ["Bash"]
color: yellow
effort: high
maxTurns: 40
---

<role>
You are grd-factory-builder. The research factory hands you an objective, a decision rule,
a worktree and either a hypothesis or a strategy note. Turn it into the smallest code change
that could move the measured metric the way the rule asks.
</role>

<rules>
- Work only inside the worktree path the prompt names.
- Edit only files under the allowlisted paths the prompt names. Any other change is rejected.
- Never write the text __RESULT__ anywhere. The factory rejects such a change as tampering.
- You have no shell. Do not try to run, build or measure; the factory measures your change
  in a sandbox and tells you if it could not be judged.
- The factory spawns you with `--disallowedTools Bash`; this file documents that contract.
</rules>

<output_contract>
End with exactly one final block. `procedure` is the strategy in at most 80 plain words and
no code, because a separate builder must be able to reproduce your change from it alone:

__PLAN__
{"procedure":"...","metricKey":"<from the prompt>","comparator":"<from the prompt>","target":0,"language":"shell","scriptPath":"<from the prompt>"}
</output_contract>
```

- [ ] **Step 2: Create `commands/factory.md`**

````markdown
---
description: Research factory — interview for a work order, then run experiments until a patch passes a hidden evaluation and a PR opens
argument-hint: "[<what should get better, and in which repo>] | status [<order-id>] | run <order-id>"
---

# /grd:factory

Turns one sentence about what should improve in a codebase into a validated work order,
then runs it. The human writes no JSON: this skill writes the draft, and deterministic
`gd factory` tool commands scan, measure, check and save it.

Tool commands (JSON by default):

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory status            # home, drafts, orders
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory scan <repo>
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory validate <id>
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory save <id>
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory run <id>
```

If `$ARGUMENTS` starts with `status` or `run`, run that tool command with the remaining
arguments, print the result, and stop.

## The interview

Ask ONE question per AskUserQuestion call. Every question after the first offers options
backed by evidence you just gathered, with the recommended option first and labelled
"(Recommended)". Keep the draft at `<home>/drafts/<id>/draft.json`, where `<home>` comes
from `factory status`. Write it after every step. The human never edits it.

1. **Goal.** The only free-text question, unless `$ARGUMENTS` already answers it: what
   should get better, in which repo (absolute path). Derive `id` (lowercase, dashes, at
   most 63 characters) and `objective` (one sentence). Then offer "Accept all
   recommendations": if chosen, take the recommended option at steps 2 to 7, still
   running every command, and stop only at step 8.
2. **Environment.** Run `factory scan <repo>`. Offer `proposedImage` and `proposedSetup`.
   If the scan returned no image (ecosystem `unknown`), ask for the image and setup
   command. Offer `proposedMemory`; if `freeMemoryMb` is under 2048, say so.
3. **Metric and dev evaluation.** Offer the scan's `measurements` that fit the goal. The
   command must print `__RESULT__ {"<metric>": <number>}`. If none fits, offer to write a
   dev evaluation script into the repo outside any path you will make editable, and
   commit nothing: tell the human to commit it. Set `dev_eval.files` to every repo file
   the evaluation reads or runs (the scan's `files` for that measurement, plus the script
   itself).
4. **Target.** Write the draft with a provisional target and run `factory validate <id>`.
   Read `dev_eval` from the report: it gives the median and spread on the unmodified
   code. Propose targets from it: an SLO found in the repo's docs, and 20 and 40 percent
   better than the median. If `noisy` is true, say the metric is too noisy to decide and
   propose raising `dev_eval.repeats`.
5. **Editable paths.** Propose `editable` globs (`dir/**`) covering where the measured code
   path lives, found by reading the code. Evaluation files can never be included. Offer
   them as a multi-select so the human can trim.
6. **Hidden evaluation.** Recommended: write `<home>/drafts/<id>/hidden/eval.sh`, a
   held-out variant of the dev evaluation that differs in workload trace, seed or data
   split, and that measures from outside the process under test where possible. It runs
   in the same container image with the worktree at `/work` and must print
   `__RESULT__ {"<metric>": <number>}`. Never put it in the repo and never mention its
   path or contents outside this interview. Alternatively the human points at an existing
   script, which you copy there. Set `hidden_eval.script` to `hidden/eval.sh`.
7. **Budget.** Offer Small (3 candidates, hidden_queries 2, 120 minutes), Medium (8, 3,
   360) and Large (20, 4, 720), Small recommended. For each, estimate tokens as
   candidates × 5 spawns × 150,000 and say that the figure uses the scheduler's
   documented default per research spawn. Set `budget.tokens` to that estimate.
8. **Review.** Run `factory validate <id>` again. Show every check. If any fails, go back
   to the step it belongs to. When all pass, show a one-screen summary: objective, rule,
   baseline, editable paths, image, repeats, budget. On confirmation run `factory save
   <id>`, then offer to start `factory run <id>` now.

Never run `factory run` without the human's confirmation in this conversation: it spends
the budget.
````

- [ ] **Step 3: Add the catalog entry** to `commands/help.md`, directly after the `/grd:research` entry:

```
  /grd:factory                  Research factory: an interview turns what you
                                want improved into a work order; GRD then runs
                                experiments until a patch passes a hidden
                                evaluation, and opens a PR for you to merge.
```

- [ ] **Step 4: Run the catalog and agent audits**

Run: `npx jest tests/unit/agent-audit.test.ts tests/unit/help-catalog.test.ts tests/unit/command-pointers.test.ts --coverage=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add agents/grd-factory-builder.md commands/factory.md commands/help.md
git commit -q -F - <<'EOF'
feat(factory): the builder agent and the /grd:factory interview

The interview asks one question at a time, proposes every answer from
evidence it just gathered, and never has the human write JSON. Nothing
runs the order without the human's confirmation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
```

---

### Task 14: Documentation, coverage thresholds, full verification

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/autoresearch-tutorial.md`, `docs/CHANGELOG.md`, `jest.config.js`

- [ ] **Step 1: Documentation.**
  - `CLAUDE.md`: add `factory scan|validate|save|run|status` to the gd CLI command list, and a short "Research factory (`lib/factory/`)" paragraph under Architecture: work orders live in `$GRD_FACTORY_HOME` (default `~/.grd/factory`), the hidden evaluation never enters a prompt, candidate code only runs in Docker. Add a Gotcha: loop agents are spawned with `--dangerously-skip-permissions` and all tools; the `tools:` line in `agents/*.md` is not applied to them. Only `SpawnOpts.disallowedTools` removes a tool, and only on the claude backend.
  - `README.md`: a short "Research factory" section after the research section: what `/grd:factory` does in three sentences, and the four ways a run stops.
  - `docs/autoresearch-tutorial.md`: a "Research factory" section: the interview steps, the trust gates, the stop conditions, where state lives, and how to read `report.md`.
  - `docs/CHANGELOG.md`: an `### Added` entry under `[Unreleased]` for the research factory, and an entry for `SpawnOpts.disallowedTools` explaining the pre-existing gap it closes.

- [ ] **Step 2: Run patina** on the new README section, the tutorial section, the CHANGELOG entries and the spec, per `~/.agents/OPERATIONS.md`. Accept only rewrites that keep every technical claim intact.

- [ ] **Step 3: Measure coverage for the new files**

Run: `npx jest tests/unit/factory --coverage --collectCoverageFrom='lib/factory/**/*.ts' 2>&1 | grep -E "^ *[a-z-]+\.ts"`
Expected: a line per file. Add to `jest.config.js`, under a new comment `// === Research factory (2026-09-18) ===`, one entry per `lib/factory/*.ts` file except `types.ts`, with each of `lines`, `functions` and `branches` set to the measured value rounded **down** to the nearest 5. If any file measures under 80 percent lines, add tests for its uncovered branches before setting its threshold.

- [ ] **Step 4: Full verification**

Run each and record the result:

```bash
npm run lint
npm run build:check
npm run build
npm test
```

Expected: all green, and the full-suite count higher than before by the new tests. If `tests/unit/cli.test.ts` fails under full-suite load, rerun it alone before chasing it (known flake, recorded in project memory).

- [ ] **Step 5: Optional live check of the tool restriction — ask the user first; it spends a few thousand tokens.** With approval:

```bash
claude -p 'Use the Bash tool to run: echo hi. If you have no Bash tool, reply exactly NO_BASH.' --dangerously-skip-permissions --disallowedTools Bash --output-format json
```

Expected: the result text is `NO_BASH`. If it is not, stop and report: the builder's no-shell guarantee does not hold and Task 2's doc comment is wrong.

- [ ] **Step 6: Commit, push, open the PR**

```bash
git add CLAUDE.md README.md docs/autoresearch-tutorial.md docs/CHANGELOG.md jest.config.js docs/superpowers/specs/2026-09-18-research-factory-design.md
git commit -q -F - <<'EOF'
docs(factory): document the research factory and gate its coverage

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp
EOF
git push -q
gh pr create --base main --head feat/research-factory --title "feat: research factory" --body-file <(printf '%s\n' "See docs/superpowers/specs/2026-09-18-research-factory-design.md and docs/superpowers/plans/2026-09-18-research-factory.md." "" "🤖 Generated with [Claude Code](https://claude.com/claude-code)" "" "https://claude.ai/code/session_01MfpwAaDygsLGfU8P8YEhkp")
```

Then wait for CI, merge only when all checks are green, and remove the worktree and branch in the same step:

```bash
git -C ~/Developer/Projects/GetResearchDone worktree remove ~/.blackhole/GetResearchDone/2026-09-18/research-factory
git -C ~/Developer/Projects/GetResearchDone worktree prune
git -C ~/Developer/Projects/GetResearchDone branch -d feat/research-factory
```
