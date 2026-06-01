# Research Eval-Report Augmentation Implementation Plan (Slice B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optionally augment MEASURE with a per-iteration `experiments/<iter>/EVAL.md` written by a dedicated read-only `grd-research-evaluator`, opt-in via `research_eval_report`, without ever touching the deterministic verdict/branch/terminate.

**Architecture:** New read-only agent `grd-research-evaluator` (Read/Grep/Glob) emits an `__EVAL__`…`__END_EVAL__` markdown block; new `lib/research/eval.ts` builds the prompt, parses the block, and writes EVAL.md (the orchestrator is the only writer). The gated `await maybeRunEvalReport(...)` runs in the DECIDE region AFTER `term`/`branch` are computed, so no LLM is on the control path. Fully degrade-safe.

**Tech Stack:** TypeScript (strict, CommonJS), Jest + ts-jest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-01-research-eval-report-design.md`

---

## Conventions for every task

- `'use strict';` first; CommonJS; zero `any`; typed requires; unused args `_`-prefixed.
- Single file: `npx jest tests/unit/research/eval.test.ts`.
- Commit after each task. Footer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- **Create `agents/grd-research-evaluator.md`** — read-only evaluator agent.
- **Create `lib/research/eval.ts`** — `readEvalReportConfig`, `parseEvalReport`, `readPriorMetrics`, `buildEvalPrompt`, `writeEvalReport`, `maybeRunEvalReport`.
- **Create `tests/unit/research/eval.test.ts`**.
- **Modify `lib/research/orchestrator.ts`** — `require('./eval')`; gated `await maybeRunEvalReport` in DECIDE.
- **Modify `lib/utils.ts`** — register `research_eval_report`.
- **Modify `tests/unit/agent-audit.test.ts`** — count 26 → 27.
- **Modify `CLAUDE.md`** — Autoresearch subsection.

---

### Task 1: New read-only agent + agent-audit count

**Files:**
- Create: `agents/grd-research-evaluator.md`
- Modify: `tests/unit/agent-audit.test.ts` (count assertion ~line 17-18)

- [ ] **Step 1: Bump the failing count assertion**

In `tests/unit/agent-audit.test.ts`, change:

```ts
  test('agent count is 26', () => {
    expect(agentFiles.length).toBe(26);
```
to:
```ts
  test('agent count is 27', () => {
    expect(agentFiles.length).toBe(27);
```

- [ ] **Step 2: Run the audit to verify it fails**

Run: `npx jest tests/unit/agent-audit.test.ts -t "agent count"`
Expected: FAIL — found 26, expected 27 (agent file not created yet).

- [ ] **Step 3: Create the agent**

Create `agents/grd-research-evaluator.md`:

```markdown
---
name: grd-research-evaluator
description: Read-only evaluator for the autoresearch loop. Reads an experiment's already-collected metrics and writes a rigorous EVAL.md narrative. Never re-runs or scores.
tools: Read, Grep, Glob
color: green
effort: medium
maxTurns: 8
disallowedTools:
  - Bash
  - Write
  - Edit
---

<role>
You are a read-only evaluation reporter for GRD's autoresearch loop. An
experiment has ALREADY been executed and its metrics collected. Your job is to
produce one honest, rigorous evaluation narrative from the numbers you are given
in the prompt. You do not run code, you do not recompute, you do not write files.
</role>

<hard_rules>
- The experiment already ran. Do NOT attempt to re-execute it or recompute any
  metric. Report on the supplied numbers only.
- The deterministic verdict supplied in the prompt is AUTHORITATIVE. You may
  contextualize it, but never contradict, override, or re-decide it.
- When the target is 0, report the absolute gap (a percentage gap is undefined).
  Respect the comparator direction when stating whether a value is better/worse.
- You have no write tools; emit your entire report on stdout in the block below.
</hard_rules>

<output_contract>
Emit EXACTLY ONE block, nothing after the closing marker:

__EVAL__
iteration=<n> metric=<key> verdict=<supported|refuted|inconclusive>

## Results
| metric | value | target | gap |
| ------ | ----- | ------ | --- |
| <decision metric> | <v> | <comparator> <target> | <signed gap, % unless target 0> |
| <other metrics...> | ... | — | — |

## Delta vs previous iteration
<one line per shared metric, or "no prior comparable metric">

## Reproducibility
<the experiment script path and how the number was produced>

## Recommendation
<one or two sentences; advisory only — does not change the verdict>
__END_EVAL__
</output_contract>
```

- [ ] **Step 4: Run the audit to verify pass**

Run: `npx jest tests/unit/agent-audit.test.ts`
Expected: PASS — count 27, the new agent has a valid `name`, a description under 200 chars, an `effort` of `medium`, and a `disallowedTools` list.

- [ ] **Step 5: Commit**

```bash
git add agents/grd-research-evaluator.md tests/unit/agent-audit.test.ts
git commit -m "feat(research): read-only grd-research-evaluator agent (slice B task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `eval.ts` — config gate + block parser

**Files:**
- Create: `lib/research/eval.ts`
- Test: `tests/unit/research/eval.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/research/eval.test.ts`:

```ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ev = require('../../../lib/research/eval');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-eval-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('readEvalReportConfig', () => {
  it('defaults false with no config', () => {
    expect(ev.readEvalReportConfig(tmp())).toBe(false);
  });
  it('true only on explicit true', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, '.planning/config.json'), JSON.stringify({ research_eval_report: true }));
    expect(ev.readEvalReportConfig(d)).toBe(true);
  });
  it('false on malformed config (no throw)', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, '.planning/config.json'), '{not json');
    expect(ev.readEvalReportConfig(d)).toBe(false);
  });
});

describe('parseEvalReport', () => {
  it('extracts markdown strictly between both markers', () => {
    const out = 'noise\n__EVAL__\n## Results\nok\n__END_EVAL__\ntrailing log';
    expect(ev.parseEvalReport(out)).toBe('## Results\nok');
  });
  it('returns null when the closing marker is missing', () => {
    expect(ev.parseEvalReport('__EVAL__\n## Results\nok')).toBeNull();
  });
  it('returns null when there is no block', () => {
    expect(ev.parseEvalReport('just logs')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/eval.test.ts`
Expected: FAIL — `Cannot find module '../../../lib/research/eval'`.

- [ ] **Step 3: Create the module**

Create `lib/research/eval.ts`:

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { ExperimentPlan, ExperimentResult, MeasureOutcome, ResearchThread } from './types';
const { atomicWriteFileSync } = require('../autopilot-waves') as {
  atomicWriteFileSync: (filePath: string, data: string) => void;
};

type SpawnFn = (prompt: string, agentType: string) => Promise<string>;

function readEvalReportConfig(cwd: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_eval_report?: unknown;
    };
    return raw.research_eval_report === true;
  } catch {
    return false;
  }
}

function parseEvalReport(stdout: string): string | null {
  const start = stdout.indexOf('__EVAL__');
  if (start === -1) return null;
  const end = stdout.indexOf('__END_EVAL__', start + '__EVAL__'.length);
  if (end === -1) return null;
  const body = stdout.slice(start + '__EVAL__'.length, end).trim();
  return body || null;
}

module.exports = { readEvalReportConfig, parseEvalReport };
```

- [ ] **Step 4: Run test + type-check**

Run: `npx jest tests/unit/research/eval.test.ts`
Expected: PASS

Run: `npm run build:check`
Expected: no type errors (confirms `atomicWriteFileSync` import path resolves).

- [ ] **Step 5: Commit**

```bash
git add lib/research/eval.ts tests/unit/research/eval.test.ts
git commit -m "feat(research): eval.ts config gate + __EVAL__ block parser (slice B task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `eval.ts` — `buildEvalPrompt` + `readPriorMetrics`

**Files:**
- Modify: `lib/research/eval.ts`
- Test: `tests/unit/research/eval.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('readPriorMetrics', () => {
  function thread() {
    const d = tmp();
    const id = 't1';
    const mk = (iter: number, metrics: object) => {
      const dir = path.join(d, '.planning/research/threads', id, 'experiments', String(iter));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ metrics }));
    };
    return { d, id, mk };
  }
  it('reads the previous iteration metrics', () => {
    const t = thread(); t.mk(0, { accuracy: 0.5 });
    expect(ev.readPriorMetrics(t.d, t.id, 1)).toEqual({ iteration: 0, metrics: { accuracy: 0.5 } });
  });
  it('returns null at iteration 0 or when the prior file is missing/malformed', () => {
    const t = thread();
    expect(ev.readPriorMetrics(t.d, t.id, 0)).toBeNull();
    expect(ev.readPriorMetrics(t.d, t.id, 1)).toBeNull();
  });
});

describe('buildEvalPrompt', () => {
  const plan = { procedure: 'p', metricKey: 'accuracy', comparator: '>=', target: 0.8, predictedOutcome: 'po', scriptPath: 'experiments/1/run.sh', language: 'shell' };
  const result = { metrics: { accuracy: 0.6, latency_ms: 12 }, exitCode: 0, runner: 'subprocess', durationMs: 5, stdoutExcerpt: 'x', failureClass: 'none' };
  const outcome = { verdict: 'refuted', detail: 'accuracy=0.6 >= 0.8 → fail' };
  const thread = { id: 't1', iteration: 1, question: 'Does X help?' };
  it('includes the metric, verdict, all metrics, the contract, and the no-rerun rule', () => {
    const p = ev.buildEvalPrompt(thread, plan, result, outcome, { iteration: 0, metrics: { accuracy: 0.5 } });
    expect(p).toContain('accuracy');
    expect(p).toContain('0.8');
    expect(p).toContain('refuted');
    expect(p).toContain('latency_ms');
    expect(p).toMatch(/already.*run|do not.*re-?run|already ran/i);
    expect(p).toContain('__EVAL__');
    expect(p).toContain('__END_EVAL__');
    expect(p).toContain('grd-research-evaluator'.length ? 'authoritative' : 'authoritative');
  });
  it('notes when there is no prior comparable metric', () => {
    const p = ev.buildEvalPrompt(thread, plan, result, outcome, null);
    expect(p).toMatch(/no prior/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/eval.test.ts -t "readPriorMetrics|buildEvalPrompt"`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement**

Add to `lib/research/eval.ts` above `module.exports`:

```ts
function readPriorMetrics(
  cwd: string, threadId: string, iteration: number,
): { iteration: number; metrics: Record<string, number> } | null {
  if (iteration <= 0) return null;
  const prev = iteration - 1;
  try {
    const p = path.join(cwd, '.planning/research/threads', threadId, 'experiments', String(prev), 'result.json');
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as { metrics?: Record<string, number> };
    if (!parsed.metrics || typeof parsed.metrics !== 'object') return null;
    return { iteration: prev, metrics: parsed.metrics };
  } catch {
    return null;
  }
}

function buildEvalPrompt(
  thread: ResearchThread & { question?: string }, plan: ExperimentPlan, result: ExperimentResult,
  outcome: MeasureOutcome, prior: { iteration: number; metrics: Record<string, number> } | null,
): string {
  const priorLine = prior
    ? `Previous iteration (${prior.iteration}) metrics: ${JSON.stringify(prior.metrics)}`
    : 'No prior comparable metric (this is the first iteration or the prior result is unavailable).';
  return [
    'You are evaluating ONE already-completed experiment from a research loop.',
    'The experiment has ALREADY run; report on the supplied numbers and do NOT re-run or recompute anything.',
    '',
    `Question: ${thread.question || ''}`,
    `Iteration: ${thread.iteration}`,
    `Decision metric: ${plan.metricKey} ${plan.comparator} ${plan.target}`,
    `Deterministic verdict (AUTHORITATIVE — contextualize, never override): ${outcome.verdict} (${outcome.detail})`,
    `All collected metrics: ${JSON.stringify(result.metrics)}`,
    `Run: exitCode=${result.exitCode} failureClass=${result.failureClass} script=${plan.scriptPath}`,
    priorLine,
    '',
    'When target is 0, report the absolute gap (percentage is undefined); respect the comparator direction.',
    'Emit EXACTLY ONE block and nothing after the closing marker:',
    '__EVAL__',
    `iteration=${thread.iteration} metric=${plan.metricKey} verdict=${outcome.verdict}`,
    '## Results',
    '| metric | value | target | gap |',
    '| --- | --- | --- | --- |',
    '... (one row per metric; decision metric first)',
    '## Delta vs previous iteration',
    '... (or "no prior comparable metric")',
    '## Reproducibility',
    '## Recommendation',
    '__END_EVAL__',
  ].join('\n');
}
```

Add `readPriorMetrics` and `buildEvalPrompt` to `module.exports`.

- [ ] **Step 4: Run test + type-check**

Run: `npx jest tests/unit/research/eval.test.ts`
Expected: PASS

Run: `npm run build:check`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/research/eval.ts tests/unit/research/eval.test.ts
git commit -m "feat(research): buildEvalPrompt + readPriorMetrics (slice B task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `eval.ts` — `writeEvalReport` + `maybeRunEvalReport`

**Files:**
- Modify: `lib/research/eval.ts`
- Test: `tests/unit/research/eval.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('writeEvalReport', () => {
  it('writes experiments/<iter>/EVAL.md creating the dir', () => {
    const cwd = tmp();
    ev.writeEvalReport(cwd, 't1', 2, '## Results\nok');
    const p = path.join(cwd, '.planning/research/threads/t1/experiments/2/EVAL.md');
    expect(fs.readFileSync(p, 'utf8')).toBe('## Results\nok');
  });
});

describe('maybeRunEvalReport', () => {
  const plan = { procedure: 'p', metricKey: 'accuracy', comparator: '>=', target: 0.8, predictedOutcome: 'po', scriptPath: 'experiments/1/run.sh', language: 'shell' };
  const result = { metrics: { accuracy: 0.6 }, exitCode: 0, runner: 'subprocess', durationMs: 5, stdoutExcerpt: 'x', failureClass: 'none' };
  const outcome = { verdict: 'refuted', detail: 'd' };
  const thread = { id: 't1', iteration: 1, question: 'Q' };
  const evalPath = (cwd: string) => path.join(cwd, '.planning/research/threads/t1/experiments/1/EVAL.md');

  it('spawns grd-research-evaluator and writes EVAL.md on a complete block', async () => {
    const cwd = tmp();
    let agent = '';
    const spawn = async (_p: string, a: string) => { agent = a; return '__EVAL__\nbody here\n__END_EVAL__'; };
    const res = await ev.maybeRunEvalReport(cwd, thread, plan, result, outcome, { spawn });
    expect(res).toEqual({ wrote: true });
    expect(agent).toBe('grd-research-evaluator');
    expect(fs.readFileSync(evalPath(cwd), 'utf8')).toBe('body here');
  });
  it('does not write and leaves prior EVAL.md intact when no block parses', async () => {
    const cwd = tmp();
    ev.writeEvalReport(cwd, 't1', 1, 'OLD');
    const spawn = async () => 'no markers here';
    const res = await ev.maybeRunEvalReport(cwd, thread, plan, result, outcome, { spawn });
    expect(res).toEqual({ wrote: false });
    expect(fs.readFileSync(evalPath(cwd), 'utf8')).toBe('OLD');
  });
  it('swallows a spawn throw (no throw, wrote:false)', async () => {
    const cwd = tmp();
    const spawn = async () => { throw new Error('boom'); };
    await expect(ev.maybeRunEvalReport(cwd, thread, plan, result, outcome, { spawn })).resolves.toEqual({ wrote: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/eval.test.ts -t "writeEvalReport|maybeRunEvalReport"`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement**

Add to `lib/research/eval.ts` above `module.exports`:

```ts
function writeEvalReport(cwd: string, threadId: string, iteration: number, markdown: string): void {
  const dir = path.join(cwd, '.planning/research/threads', threadId, 'experiments', String(iteration));
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteFileSync(path.join(dir, 'EVAL.md'), markdown);
}

async function maybeRunEvalReport(
  cwd: string, thread: ResearchThread & { question?: string }, plan: ExperimentPlan,
  result: ExperimentResult, outcome: MeasureOutcome, deps: { spawn: SpawnFn },
): Promise<{ wrote: boolean }> {
  try {
    const prior = readPriorMetrics(cwd, thread.id, thread.iteration);
    const out = await deps.spawn(buildEvalPrompt(thread, plan, result, outcome, prior), 'grd-research-evaluator');
    const md = parseEvalReport(out);
    if (!md) return { wrote: false };
    writeEvalReport(cwd, thread.id, thread.iteration, md);
    return { wrote: true };
  } catch (e: unknown) {
    process.stderr.write(
      `[research] eval report failed (degraded): ${e instanceof Error ? e.message : String(e)}\n`,
    );
    return { wrote: false };
  }
}
```

Update `module.exports` to its final form:

```ts
module.exports = {
  readEvalReportConfig, parseEvalReport, readPriorMetrics, buildEvalPrompt,
  writeEvalReport, maybeRunEvalReport,
};
```

- [ ] **Step 4: Run test + type-check**

Run: `npx jest tests/unit/research/eval.test.ts`
Expected: PASS (all describes)

Run: `npm run build:check`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/research/eval.ts tests/unit/research/eval.test.ts
git commit -m "feat(research): writeEvalReport + maybeRunEvalReport, degrade-safe (slice B task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire into the DECIDE region + register config key

**Files:**
- Modify: `lib/research/orchestrator.ts` (DECIDE region ~line 289; requires)
- Modify: `lib/utils.ts` (`KNOWN_CONFIG_KEYS`)
- Test: `tests/unit/research/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/research/orchestrator.test.ts`, add a `makeSpawnEval()` helper (a clone of `makeSpawnSuccess` with one extra branch) near the other spawn helpers:

```ts
function makeSpawnEval() {
  const base = makeSpawnSuccess();
  return async (prompt: string, agentType: string): Promise<string> => {
    if (agentType === 'grd-research-evaluator') return '__EVAL__\niteration=x\n## Results\nok\n__END_EVAL__';
    return base(prompt, agentType);
  };
}
```

And add tests inside `describe('orchestrator', ...)`:

```ts
it('writes per-iteration EVAL.md when research_eval_report is on (verdict unchanged)', async () => {
  const cwd = tmp();
  fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_eval_report: true }));
  const res = await runResearch(cwd, 'Does X help?', { maxIterations: 5, noGates: true, spawn: makeSpawnEval(), runner: makeRunner() });
  expect(res.status).toBe('supported'); // same verdict as the flag-off baseline (closes-the-loop test)
  const evalDir = path.join(cwd, '.planning/research/threads', res.threadId, 'experiments', '1');
  expect(fs.existsSync(path.join(evalDir, 'EVAL.md'))).toBe(true);
});

it('does not spawn grd-research-evaluator or write EVAL.md when the flag is off', async () => {
  const cwd = tmp();
  let evalSpawns = 0;
  const spawn = async (prompt: string, agentType: string): Promise<string> => {
    if (agentType === 'grd-research-evaluator') { evalSpawns++; return ''; }
    return makeSpawnSuccess()(prompt, agentType);
  };
  const res = await runResearch(cwd, 'Does X help?', { maxIterations: 5, noGates: true, spawn, runner: makeRunner() });
  expect(evalSpawns).toBe(0);
  const evalDir = path.join(cwd, '.planning/research/threads', res.threadId, 'experiments', '1');
  expect(fs.existsSync(path.join(evalDir, 'EVAL.md'))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t "EVAL.md"`
Expected: FAIL — EVAL.md not written / (the "off" test passes trivially but the "on" test fails).

- [ ] **Step 3: Register the config key**

In `lib/utils.ts`, inside `KNOWN_CONFIG_KEYS`, after `'research_persist_knowledge',` add:

```ts
  'research_eval_report',
```

- [ ] **Step 4: Wire the require + the gated call**

In `lib/research/orchestrator.ts`, add near the other research requires (after the `require('./promote')` block):

```ts
const { readEvalReportConfig, maybeRunEvalReport } = require('./eval') as {
  readEvalReportConfig: (cwd: string) => boolean;
  maybeRunEvalReport: (
    cwd: string, thread: ResearchThread, plan: ExperimentPlan, result: ExperimentResult,
    outcome: MeasureOutcome, deps: { spawn: SpawnFn },
  ) => Promise<{ wrote: boolean }>;
};
```

Then in the DECIDE region, locate:

```ts
    const term = shouldTerminate(thread, outcome.verdict);
    const branch = decideBranch(outcome.verdict);
    incrementCounter('research.iterations_total');
```

and insert immediately AFTER those three lines:

```ts
    // OPTIONAL eval-report augmentation (opt-in). term/branch are already computed
    // and are NOT read back; this only writes a human-facing EVAL.md, degrade-safe.
    if (readEvalReportConfig(cwd)) {
      await maybeRunEvalReport(cwd, thread, plan, result, outcome, { spawn });
    }
```

(`MeasureOutcome`, `ExperimentPlan`, `ExperimentResult`, `ResearchThread`, `SpawnFn`, `outcome`, `plan`, `result`, `spawn` are all already in scope in `runLoop`/the file's imports.)

- [ ] **Step 5: Run tests + type-check + lint**

Run: `npx jest tests/unit/research/orchestrator.test.ts`
Expected: PASS — new tests green; all pre-existing orchestrator tests stay green.

Run: `npm run build:check` → no type errors.
Run: `npm run lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add lib/research/orchestrator.ts lib/utils.ts tests/unit/research/orchestrator.test.ts
git commit -m "feat(research): gated eval-report in DECIDE + register config key (slice B task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs + full verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the docs subsection**

In `CLAUDE.md`, find `### Knowledge promotion (LEARN → shared KB)` and insert immediately **before** it:

```markdown
### Eval-report augmentation (MEASURE, opt-in)

With `research_eval_report: true` (default false), after the deterministic
verdict and AFTER branch/termination are computed, the loop spawns a dedicated
read-only `grd-research-evaluator` (Read/Grep/Glob only — cannot re-run or mutate
anything) to write a per-iteration `experiments/<iter>/EVAL.md` from the
already-collected `result.json` metrics (`lib/research/eval.ts`). The agent emits
an `__EVAL__`…`__END_EVAL__` markdown block; the orchestrator is the only writer.
The deterministic `evaluateVerdict` remains the sole authority for
verdict/branch/terminate (LLM-judged core-path scoring is a registered
dead-end) — this is purely an additive, degrade-safe human-facing report.
```

- [ ] **Step 2: Full research + agent-audit suites + type-check + lint**

Run: `npx jest tests/unit/research/ tests/unit/agent-audit.test.ts`
Expected: PASS.

Run: `npm run build:check` → no type errors.
Run: `npm run lint` → clean.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(research): document eval-report augmentation (slice B task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Finish the branch**

Use **superpowers:finishing-a-development-branch** (verify full `npm test`, then merge locally `--no-ff` per the established slice workflow).

---

## Self-Review

**1. Spec coverage:**
- Read-only agent (Codex P1b/P2b) → Task 1. ✓
- Config gate degrade-safe (P2a) → Task 2 (`readEvalReportConfig` try/catch). ✓
- Parser requires both markers (P3a) → Task 2. ✓
- Prior-baseline degrade + target-zero/direction note (P3b/P3c) → Task 3. ✓
- Write-on-success-only, prior intact on failure (P2c) → Task 4. ✓
- Run AFTER term/branch computed (P1a) → Task 5 insertion point. ✓
- Augment-only (verdict identical on/off) → Task 5 test. ✓
- Config key + docs → Tasks 5, 6. ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete. The one odd line in the Task 3 test (`expect(p).toContain('grd-research-evaluator'.length ? 'authoritative' : 'authoritative')`) is just an always-`'authoritative'` assertion — simplify to `expect(p).toContain('authoritative')` when typing it in.

**3. Type consistency:** `SpawnFn`, `maybeRunEvalReport(cwd, thread, plan, result, outcome, {spawn})`, `readEvalReportConfig`, `parseEvalReport`, `readPriorMetrics`, `writeEvalReport`, `buildEvalPrompt` signatures are identical across Tasks 2–5 and the orchestrator require. `atomicWriteFileSync` from `../autopilot-waves` matches `lib/dead-ends.ts`'s usage. Agent name `grd-research-evaluator` is identical in the agent file, the prompt, `maybeRunEvalReport`, and both orchestrator tests. ✓
