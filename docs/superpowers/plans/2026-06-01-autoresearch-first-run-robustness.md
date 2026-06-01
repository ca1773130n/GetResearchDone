# Autoresearch First-Run Robustness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Default the scheduler `prediction` block, make the research loop fail with a recorded reason instead of a silent `status: error`, and make the missing-scheduler error actionable.

**Spec:** `docs/superpowers/specs/2026-06-01-autoresearch-first-run-robustness-design.md`

Conventions: `'use strict'`, CommonJS, zero `any`, typed requires; commit per task with footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Default + normalize the scheduler `prediction` block

**Files:** `lib/scheduler.ts`, `lib/autopilot.ts`, test `tests/unit/scheduler.test.ts`

- [ ] **Step 1 — failing test.** In `tests/unit/scheduler.test.ts` add (use the file's existing `createScheduler` import; add `normalizePrediction`):

```ts
describe('prediction defaults (first-run robustness)', () => {
  const { createScheduler, normalizePrediction } = require('../../lib/scheduler');
  it('normalizePrediction fills all four fields', () => {
    expect(normalizePrediction(undefined)).toEqual({ window_minutes: 60, ewma_alpha: 0.3, safety_margin_tasks: 2, min_samples: 3 });
    expect(normalizePrediction({ ewma_alpha: 0.9 })).toEqual({ window_minutes: 60, ewma_alpha: 0.9, safety_margin_tasks: 2, min_samples: 3 });
  });
  it('createScheduler does not throw on a config missing prediction', () => {
    const s = createScheduler({ backend_priority: ['claude'], free_fallback: { backend: 'claude' } });
    expect(s).not.toBeNull();
  });
});
```

- [ ] **Step 2 — run, expect fail:** `npx jest tests/unit/scheduler.test.ts -t "prediction defaults"` → FAIL (`normalizePrediction` undefined / TypeError on missing prediction).

- [ ] **Step 3 — implement.** In `lib/scheduler.ts`, before `createScheduler`, add and export `DEFAULT_PREDICTION` + `normalizePrediction` (see spec §1). In `createScheduler`'s `schedulerConfig` spread replace the prediction line with `prediction: normalizePrediction(config.prediction),`. Add both to the module's exports. In `lib/autopilot.ts` (~line 714) replace `config.scheduler.prediction.safety_margin_tasks` with `normalizePrediction(config.scheduler.prediction).safety_margin_tasks` (import `normalizePrediction` from `./scheduler` alongside the existing `createScheduler` import).

- [ ] **Step 4 — verify:** `npx jest tests/unit/scheduler.test.ts` → PASS (new + existing). `npm run build:check` → clean.

- [ ] **Step 5 — commit:** `git add lib/scheduler.ts lib/autopilot.ts tests/unit/scheduler.test.ts && git commit -m "fix(scheduler): default prediction block; normalize raw autopilot consumer (robustness task 1)"` (+ footer).

---

### Task 2: Diagnostic `errExit` + `errorReason` + actionable no-scheduler error

**Files:** `lib/research/types.ts`, `lib/research/orchestrator.ts`, test `tests/unit/research/orchestrator.test.ts`

- [ ] **Step 1 — failing test.** In `tests/unit/research/orchestrator.test.ts`, inside `describe('orchestrator', …)`:

```ts
it('records errorReason when the hypothesizer output is unparseable', async () => {
  const cwd = tmp();
  const spawn = async (_p: string, a: string) => (a === 'grd-hypothesizer' ? 'garbage no block' : '');
  const res = await runResearch(cwd, 'Q?', { maxIterations: 2, noGates: true, spawn, runner: makeRunner() });
  expect(res.status).toBe('error');
  expect(res.errorReason).toMatch(/hypothesizer output not parseable/i);
  const tj = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/research/threads', res.threadId, 'thread.json'), 'utf8'));
  expect(tj.errorReason).toMatch(/hypothesizer output not parseable/i);
});
it('records errorReason when the plan output is unparseable', async () => {
  const cwd = tmp();
  const spawn = async (_p: string, a: string) => {
    if (a === 'grd-hypothesizer') return '__HYPOTHESIS__ {"statement":"s","rationale":"r","predictedOutcome":"p"}';
    if (a === 'grd-experiment-runner') return 'nope';
    return '';
  };
  const res = await runResearch(cwd, 'Q?', { maxIterations: 2, noGates: true, spawn, runner: makeRunner() });
  expect(res.status).toBe('error');
  expect(res.errorReason).toMatch(/experiment-runner output not parseable/i);
});
```

- [ ] **Step 2 — run, expect fail:** `npx jest tests/unit/research/orchestrator.test.ts -t "errorReason"` → FAIL.

- [ ] **Step 3 — implement.**
  - `lib/research/types.ts`: add `errorReason?: string;` to `ResearchThread`.
  - `lib/research/orchestrator.ts`: add `errorReason?: string;` to the local `ResearchResult` interface. Add the `excerpt` helper (spec §3). Change `errExit` to `function errExit(cwd: string, thread: ResearchThread, reason: string): ResearchResult { thread.status = 'error'; thread.errorReason = reason; saveThread(cwd, thread); return { threadId: thread.id, status: 'error', iterations: thread.iteration, errorReason: reason }; }`. Update the two call sites:
    - hypothesis: `if (!parsed) return errExit(cwd, thread, \`hypothesizer output not parseable — expected a __HYPOTHESIS__ block. Got: ${excerpt(hOut)}\`);`
    - plan: `if (!parsedPlan) return errExit(cwd, thread, \`experiment-runner output not parseable — expected a __PLAN__ block. Got: ${excerpt(pOut)}\`);`
  - In `defaultSpawn`, replace the throw with the actionable message (spec §4).

- [ ] **Step 4 — verify:** `npx jest tests/unit/research/orchestrator.test.ts` → PASS (new + existing). `npm run build:check` → clean. `npm run lint` → clean.

- [ ] **Step 5 — commit:** `git add lib/research/types.ts lib/research/orchestrator.ts tests/unit/research/orchestrator.test.ts && git commit -m "fix(research): diagnostic errExit with errorReason + actionable no-scheduler error (robustness task 2)"` (+ footer).

---

### Task 3: Render the error reason in `THREAD.md`

**Files:** `lib/research/thread.ts`, test `tests/unit/research/thread.test.ts`

- [ ] **Step 1 — failing test.** In `tests/unit/research/thread.test.ts` add a case: build a thread (via the file's existing helper / `createThread`), set `thread.status='error'; thread.errorReason='boom'`, `saveThread`, then read `THREAD.md` and assert it contains `error reason:` and `boom`; and that a thread WITHOUT `errorReason` does NOT contain `error reason:`.

- [ ] **Step 2 — run, expect fail:** `npx jest tests/unit/research/thread.test.ts -t "error reason"` → FAIL.

- [ ] **Step 3 — implement.** In `lib/research/thread.ts` `renderThreadLog`, after the `pending gate` line, conditionally append: `...(t.errorReason ? [\`- **error reason:** ${t.errorReason}\`] : [])` (match the existing array-join style of the renderer).

- [ ] **Step 4 — verify:** `npx jest tests/unit/research/thread.test.ts` → PASS. `npm run build:check` → clean.

- [ ] **Step 5 — commit:** `git add lib/research/thread.ts tests/unit/research/thread.test.ts && git commit -m "fix(research): render error reason in THREAD.md (robustness task 3)"` (+ footer).

---

### Task 4: Full verification + finish

- [ ] **Step 1 — tutorial troubleshooting note.** In `docs/autoresearch-tutorial.md` §7 ("How it degrades"), add a bullet: an unparseable agent output now records an `errorReason` on the thread (visible in `THREAD.md` / `thread.json` and the command's `--json` output) instead of a silent error.
- [ ] **Step 2 — verify:** `npx jest tests/unit/research/ tests/unit/scheduler.test.ts` → PASS; `npm run build:check` → clean; `npm run lint` → clean.
- [ ] **Step 3 — commit docs:** `git add docs/autoresearch-tutorial.md && git commit -m "docs(research): note diagnostic errorReason in troubleshooting (robustness task 4)"` (+ footer).
- [ ] **Step 4 — finish:** superpowers:finishing-a-development-branch (full `npm test`, then merge `--no-ff` + push).

---

## Self-Review

- Spec coverage: prediction default + normalizer + autopilot consumer (T1); errorReason type placement orchestrator-vs-types + diagnostic errExit + excerpt + defaultSpawn message (T2); THREAD.md render (T3); docs + verify (T4). ✓
- Placeholders: none — all code is in the spec/this plan. ✓
- Type consistency: `normalizePrediction`/`DEFAULT_PREDICTION` exported from scheduler.ts and imported in autopilot.ts; `errExit(cwd, thread, reason)` 3-arg signature used at both call sites + definition; `errorReason?` on `ResearchThread` (types.ts) and `ResearchResult` (orchestrator.ts). ✓
