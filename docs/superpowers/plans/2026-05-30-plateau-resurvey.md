# Auto-Re-survey on Plateau Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the unused `detectPlateau` into the loop: on a plateau, perform a capped, bounded-extension re-survey that broadens retrieval and pivots the next hypothesis (deterministic), with an optional config-flagged surveyor fetch+ingest of new sources.

**Architecture:** In the orchestrator DECIDE block (after the takeaway, before `shouldTerminate`), detect a plateau over the completed verdict history; if under the cap, bump `resurveyCount`, set `pendingPivot`, and extend `maxIterations` by `window`. The next cold HYPOTHESIZE consumes+clears `pendingPivot`, runs ONE widened retrieve, and injects a pivot directive. A flagged `resurveyFetch` helper spawns `grd-surveyor` for `__SOURCES__` and ingests them. Config read raw via `readResurveyConfig`.

**Tech Stack:** TypeScript (strict, CommonJS, zero `any`), Jest + ts-jest. Deterministic tests inject `spawn`/`runner`/`retrieve`/`resurveyFetch`.

**Spec:** `docs/superpowers/specs/2026-05-30-plateau-resurvey-design.md`

**Conventions:** `'use strict'`; typed requires; tests in `tests/unit/research/<module>.test.ts`. Build: `npm run build:check`. Lint: `npm run lint`.

---

## Task 1: thread fields + round-trip + THREAD.md + detectPlateau tests

**Files:**
- Modify: `lib/research/types.ts` (`ResearchThread`)
- Modify: `lib/research/thread.ts` (`CreateOpts`?, `createThread`, `renderThreadLog`)
- Test: `tests/unit/research/thread.test.ts`, `tests/unit/research/verdict.test.ts`

- [ ] **Step 1: Write the failing tests.**

Append to `tests/unit/research/thread.test.ts` (inside the top describe):
```ts
  it('round-trips resurveyCount / pendingPivot / baseMaxIterations and shows resurveyCount in THREAD.md', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-thr-'));
    const { createThread, loadThread, saveThread } = require('../../../lib/research/thread');
    const t = createThread(cwd, 'Q', { maxIterations: 5 });
    expect(t.baseMaxIterations).toBe(5);
    t.resurveyCount = 2; t.pendingPivot = true;
    saveThread(cwd, t);
    const r = loadThread(cwd, t.id);
    expect(r.resurveyCount).toBe(2);
    expect(r.pendingPivot).toBe(true);
    const md = fs.readFileSync(path.join(cwd, '.planning/research/threads', t.id, 'THREAD.md'), 'utf8');
    expect(md).toMatch(/re-surveys:\s*2/);
  });
```
(Ensure `os` is required at the top of that test file; add `const os = require('os');` if absent.)

Append to `tests/unit/research/verdict.test.ts`:
```ts
describe('detectPlateau', () => {
  const { detectPlateau } = require('../../../lib/research/verdict');
  it('false with fewer than window verdicts', () => {
    expect(detectPlateau(['refuted', 'refuted'], 3)).toBe(false);
  });
  it('false when a supported is in the window', () => {
    expect(detectPlateau(['refuted', 'supported', 'refuted'], 3)).toBe(false);
  });
  it('true when the last window are all non-supported', () => {
    expect(detectPlateau(['supported', 'refuted', 'inconclusive', 'refuted'], 3)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/thread.test.ts tests/unit/research/verdict.test.ts -t "re-surveys|detectPlateau"`
Expected: thread test FAILS (`baseMaxIterations` undefined). detectPlateau tests should PASS already (function exists) — if `verdict.test.ts` lacked the describe, they now run green; that's fine (no-op TDD for an existing function, included for coverage).

- [ ] **Step 3: Extend `ResearchThread`** in `lib/research/types.ts`, after `seededFrom?...`:
```ts
  resurveyCount?: number;
  pendingPivot?: boolean;
  baseMaxIterations?: number;
```

- [ ] **Step 4: Set `baseMaxIterations` in `createThread`** in `lib/research/thread.ts`. In the thread object literal (after `maxIterations: opts.maxIterations ?? 5,`) add:
```ts
    baseMaxIterations: opts.maxIterations ?? 5,
```

- [ ] **Step 5: Show re-surveys in `renderThreadLog`** in `lib/research/thread.ts`. After the `pending gate` line (and before the `seededFrom` spread or `created` line) add:
```ts
    ...(t.resurveyCount ? [`- **re-surveys:** ${t.resurveyCount}`] : []),
```

- [ ] **Step 6: Run to verify pass**

Run: `npx jest tests/unit/research/thread.test.ts tests/unit/research/verdict.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 7: Commit**

```bash
git add lib/research/types.ts lib/research/thread.ts tests/unit/research/thread.test.ts tests/unit/research/verdict.test.ts
git commit -m "feat(research): thread resurvey fields + THREAD.md; detectPlateau tests (plateau task 1)"
```

---

## Task 2: `readResurveyConfig` + KNOWN_CONFIG_KEYS

**Files:**
- Modify: `lib/research/orchestrator.ts` (add `readResurveyConfig`, export it)
- Modify: `lib/utils.ts` (`KNOWN_CONFIG_KEYS`)
- Test: `tests/unit/research/orchestrator.test.ts`, `tests/unit/utils.test.ts` (or wherever KNOWN_CONFIG_KEYS is asserted)

- [ ] **Step 1: Write the failing test** — append to `tests/unit/research/orchestrator.test.ts`:

```ts
  it('readResurveyConfig: defaults + parsed values + validation', () => {
    const { readResurveyConfig } = require('../../../lib/research/orchestrator');
    const cwd = tmp();
    expect(readResurveyConfig(cwd)).toEqual({ cap: 2, window: 3, fetch: false });
    fs.writeFileSync(path.join(cwd, '.planning/config.json'),
      JSON.stringify({ research_max_resurveys: 1, research_plateau_window: 4, research_resurvey_fetch: true }));
    expect(readResurveyConfig(cwd)).toEqual({ cap: 1, window: 4, fetch: true });
    fs.writeFileSync(path.join(cwd, '.planning/config.json'),
      JSON.stringify({ research_max_resurveys: -5, research_plateau_window: 0 }));
    expect(readResurveyConfig(cwd)).toEqual({ cap: 0, window: 3, fetch: false }); // sanitized
  });
```
(The orchestrator test file already requires `fs`/`path` and has a `tmp()` helper.)

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t readResurveyConfig`
Expected: FAIL — `readResurveyConfig` undefined.

- [ ] **Step 3: Implement `readResurveyConfig`** in `lib/research/orchestrator.ts`. Add `const fs = require('fs');` is already present; add the function near `readResearchGatesConfig`:
```ts
function readResurveyConfig(cwd: string): { cap: number; window: number; fetch: boolean } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_max_resurveys?: unknown; research_plateau_window?: unknown; research_resurvey_fetch?: unknown;
    };
    const capN = Number(raw.research_max_resurveys);
    const winN = Number(raw.research_plateau_window);
    return {
      cap: Number.isInteger(capN) && capN >= 0 ? capN : 2,
      window: Number.isInteger(winN) && winN > 0 ? winN : 3,
      fetch: raw.research_resurvey_fetch === true,
    };
  } catch {
    return { cap: 2, window: 3, fetch: false };
  }
}
```
Add `readResurveyConfig` to the `module.exports` list.

- [ ] **Step 4: Register the keys** in `lib/utils.ts` `KNOWN_CONFIG_KEYS` — after `'research_max_candidates',` add:
```ts
  'research_max_resurveys',
  'research_plateau_window',
  'research_resurvey_fetch',
```

- [ ] **Step 5: Run to verify pass**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t readResurveyConfig && npm run build:check`
Expected: PASS; build OK.

- [ ] **Step 6: Commit**

```bash
git add lib/research/orchestrator.ts lib/utils.ts tests/unit/research/orchestrator.test.ts
git commit -m "feat(research): readResurveyConfig + register resurvey config keys (plateau task 2)"
```

---

## Task 3: `buildHypothesizePrompt` pivot directive

**Files:**
- Modify: `lib/research/_prompts.ts`
- Test: `tests/unit/research/_prompts.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/unit/research/_prompts.test.ts`:

```ts
describe('buildHypothesizePrompt pivot directive', () => {
  const thread = { id: 't', question: 'Does X help?' };
  it('injects the PLATEAU pivot directive when pivot=true', () => {
    const p = require('../../../lib/research/_prompts').buildHypothesizePrompt(thread, [], null, [], '', true);
    expect(p).toMatch(/PLATEAU/);
    expect(p).toMatch(/pivot/i);
  });
  it('omits it when pivot is falsey', () => {
    const p = require('../../../lib/research/_prompts').buildHypothesizePrompt(thread, [], null, [], '');
    expect(p).not.toMatch(/PLATEAU/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/_prompts.test.ts -t pivot`
Expected: FAIL — pivot text not present.

- [ ] **Step 3: Add the `pivot` param** in `lib/research/_prompts.ts`. Change the signature:
```ts
function buildHypothesizePrompt(
  thread: { id: string; question: string },
  priorHyps: Pick<Hypothesis, 'id' | 'statement' | 'verdict'>[],
  priorVerdict: Verdict | null,
  priorTakeaways: Pick<Takeaway, 'iteration' | 'kind' | 'content' | 'failureClass'>[] = [],
  pack = '',
  pivot = false,
): string {
```
In the returned array, immediately after the `priorVerdict ? ... : ''` line, add:
```ts
    pivot ? '\nPLATEAU: your last several hypotheses all failed to be supported. PIVOT HARD — propose a substantially different approach or angle, not a variation of prior attempts.' : '',
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/unit/research/_prompts.test.ts && npm run build:check`
Expected: PASS; build OK.

- [ ] **Step 5: Commit**

```bash
git add lib/research/_prompts.ts tests/unit/research/_prompts.test.ts
git commit -m "feat(research): buildHypothesizePrompt pivot directive (plateau task 3)"
```

---

## Task 4: orchestrator — plateau detect + extend + pivot consume + widened retrieve (core)

**Files:**
- Modify: `lib/research/orchestrator.ts`
- Test: `tests/unit/research/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test** — append inside the orchestrator describe (uses an always-refuting runner so the loop never finalizes):

```ts
  it('plateaus → re-surveys (pivot prompt + widened retrieve), extends iterations, then exhausts at the cap', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_max_resurveys: 1, research_plateau_window: 3 }));
    const prompts: string[] = [];
    const retrieveCalls: Array<{ q: string; k: unknown }> = [];
    const spawn = async (prompt: string, agentType: string) => {
      if (agentType === 'grd-hypothesizer') { prompts.push(prompt); return '__HYPOTHESIS__ {"statement":"S","rationale":"r","predictedOutcome":"p"}'; }
      if (agentType === 'grd-experiment-runner') return '__PLAN__ {"procedure":"x","metricKey":"acc","comparator":">=","target":0.9,"language":"shell","scriptPath":"run.sh"}';
      return '__TAKEAWAY__ {"content":"t"}';
    };
    const runner = { run: () => ({ metrics: { acc: 0.1 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) }; // always refuted
    const retrieveFn = async (_c: string, q: string, o?: { k?: number }) => { retrieveCalls.push({ q, k: o?.k }); return { results: [], modes: { lexical: false, semantic: false, structure: false }, detail: '0' }; };
    const res = await runResearch(cwd, 'Does X help?', { maxIterations: 3, noGates: true, spawn, runner, retrieve: retrieveFn });
    expect(res.status).toBe('exhausted');
    // After 3 refutes a plateau fires once (cap=1): a later hypothesizer prompt carries the pivot directive.
    expect(prompts.some((p) => /PLATEAU/.test(p))).toBe(true);
    // The pivot retrieve was widened (k=16) at least once.
    expect(retrieveCalls.some((c) => c.k === 16)).toBe(true);
    // The thread recorded exactly one re-survey and cleared pendingPivot.
    const { loadThread } = require('../../../lib/research/thread');
    const t = loadThread(cwd, res.threadId);
    expect(t.resurveyCount).toBe(1);
    expect(t.pendingPivot).toBeFalsy();
    expect(t.maxIterations).toBe(6); // 3 + window(3)
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t "plateaus"`
Expected: FAIL — no plateau handling; never pivots; exhausts at maxIterations=3 with `resurveyCount` undefined.

- [ ] **Step 3: Add `detectPlateau` + `ingest` to imports** in `lib/research/orchestrator.ts`. Change the verdict require to include `detectPlateau`:
```ts
const { evaluateVerdict, decideBranch, shouldTerminate, detectPlateau } = require('./verdict');
```

- [ ] **Step 4: Make `retrieveFn` accept opts.** Change the default binding (resolved near `spawn`):
```ts
  const retrieveFn = opts.retrieve || ((c: string, q: string, o?: Record<string, unknown>) => retrieve(c, q, { embedder: defaultEmbedder(), ...(o || {}) }));
```

- [ ] **Step 5: Consume + clear `pendingPivot` and widen the retrieve in the cold HYPOTHESIZE branch.** Replace the cold-branch grounding lines:
```ts
        const priorTakeaways = readTakeaways(cwd, thread.id);
        let pack = '';
        try { const r = await retrieveFn(cwd, thread.question); pack = buildGroundingPack(r.results, thread.question); } catch { /* degrade */ }
        const hOut = await spawn(buildHypothesizePrompt(thread, priorHyps, priorVerdict, priorTakeaways, pack), 'grd-hypothesizer');
```
with:
```ts
        const priorTakeaways = readTakeaways(cwd, thread.id);
        const pivot = thread.pendingPivot === true;
        if (pivot) { thread.pendingPivot = false; saveThread(cwd, thread); }
        const groundQuery = pivot
          ? [thread.question, ...priorTakeaways.map((t: Takeaway) => t.content)].join(' ')
          : thread.question;
        let pack = '';
        try {
          const r = await retrieveFn(cwd, groundQuery, pivot ? { k: 16 } : undefined);
          pack = buildGroundingPack(r.results, thread.question);
        } catch { /* degrade */ }
        const hOut = await spawn(buildHypothesizePrompt(thread, priorHyps, priorVerdict, priorTakeaways, pack, pivot), 'grd-hypothesizer');
```

- [ ] **Step 6: Add the plateau re-survey hook in DECIDE.** In `lib/research/orchestrator.ts`, immediately after `appendTakeaway(cwd, thread.id, takeaway);` and before `// DECIDE + terminate`, insert:
```ts
    // RE-SURVEY on plateau: broaden + pivot the next hypothesis instead of drifting to exhausted.
    const { cap, window } = readResurveyConfig(cwd);
    const completed = readLedger(cwd, thread.id).filter((h: Hypothesis) => h.verdict !== null).map((h: Hypothesis) => h.verdict as Verdict);
    if (outcome.verdict !== 'supported' && (thread.resurveyCount ?? 0) < cap && detectPlateau(completed, window)) {
      thread.resurveyCount = (thread.resurveyCount ?? 0) + 1;
      thread.pendingPivot = true;
      thread.maxIterations += window;
      incrementCounter('research.resurveys_total');
      saveThread(cwd, thread);
    }
```

- [ ] **Step 7: Run to verify pass + full orchestrator suite**

Run: `npx jest tests/unit/research/orchestrator.test.ts && npm run build:check`
Expected: all PASS (the new plateau test + every existing loop test — existing tests use `maxIterations` small with runners that reach supported/exhausted before any plateau, and `readResurveyConfig` defaults `cap=2` so a 3-window plateau only fires when ≥3 refutes occur, which the existing tests don't hit within their budgets); build OK.

- [ ] **Step 8: Commit**

```bash
git add lib/research/orchestrator.ts tests/unit/research/orchestrator.test.ts
git commit -m "feat(research): plateau re-survey core — detect, extend, pivot-consume, widened retrieve (plateau task 4)"
```

---

## Task 5: flagged fetch path — `resurveyFetch` + grd-surveyor `__SOURCES__`

**Files:**
- Modify: `lib/research/orchestrator.ts` (`resurveyFetch` default + `ResearchOptions.resurveyFetch` + flagged call)
- Modify: `agents/grd-surveyor.md` (emit `__SOURCES__`)
- Test: `tests/unit/research/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test** — append inside the orchestrator describe:

```ts
  it('calls resurveyFetch on plateau only when research_resurvey_fetch is set', async () => {
    const mk = (fetchOn: boolean) => {
      const cwd = tmp();
      fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_max_resurveys: 1, research_plateau_window: 3, research_resurvey_fetch: fetchOn }));
      return cwd;
    };
    const spawn = async (_p: string, agentType: string) => {
      if (agentType === 'grd-hypothesizer') return '__HYPOTHESIS__ {"statement":"S","rationale":"r","predictedOutcome":"p"}';
      if (agentType === 'grd-experiment-runner') return '__PLAN__ {"procedure":"x","metricKey":"acc","comparator":">=","target":0.9,"language":"shell","scriptPath":"run.sh"}';
      return '__TAKEAWAY__ {"content":"t"}';
    };
    const runner = { run: () => ({ metrics: { acc: 0.1 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };

    let calls = 0;
    const resurveyFetch = async () => { calls++; };
    await runResearch(mk(false), 'Q', { maxIterations: 3, noGates: true, spawn, runner, resurveyFetch });
    expect(calls).toBe(0);
    await runResearch(mk(true), 'Q', { maxIterations: 3, noGates: true, spawn, runner, resurveyFetch });
    expect(calls).toBe(1);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t "resurveyFetch on plateau"`
Expected: FAIL — `ResearchOptions` has no `resurveyFetch`; nothing calls it.

- [ ] **Step 3: Implement the default `resurveyFetch`** in `lib/research/orchestrator.ts`. Add the `ingest` require near the others:
```ts
const { ingest } = require('./ingest') as { ingest: (cwd: string, inputPath: string) => Promise<{ status: string; files: number; detail: string }> };
const { fetchSource } = require('./fetch') as { fetchSource: (cwd: string, input: string, opts?: Record<string, unknown>) => Promise<{ filePath: string }> };
```
Add the helper near `readResurveyConfig`:
```ts
/** Plateau fetch path: spawn grd-surveyor for new sources, ingest up to 3. Fully tolerant. */
async function defaultResurveyFetch(cwd: string, thread: ResearchThread, deps: { spawn: SpawnFn }): Promise<void> {
  try {
    const out = await deps.spawn(`You are grd-surveyor. Find up to 3 NEW sources (arXiv ids or http(s) URLs) most relevant to: "${thread.question}". Emit exactly one final block:\n__SOURCES__\n<one arxiv id or url per line>`, 'grd-surveyor');
    const idx = out.indexOf('__SOURCES__');
    if (idx === -1) return;
    const sources = out.slice(idx + '__SOURCES__'.length).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 3);
    for (const src of sources) {
      try { const f = await fetchSource(cwd, src); await ingest(cwd, f.filePath); } catch { /* skip this source */ }
    }
  } catch { /* surveyor unavailable → degrade */ }
}
```

- [ ] **Step 4: Add `resurveyFetch` to `ResearchOptions`** and call it behind the flag. In `ResearchOptions`:
```ts
  resurveyFetch?: (cwd: string, thread: ResearchThread, deps: { spawn: SpawnFn }) => Promise<void>;
```
In the DECIDE plateau hook (Task 4 Step 6), extend the `if (...)` body to call the fetch behind the flag. Change the hook so it also reads `fetch` and calls:
```ts
    const { cap, window, fetch: resurveyFetchOn } = readResurveyConfig(cwd);
    const completed = readLedger(cwd, thread.id).filter((h: Hypothesis) => h.verdict !== null).map((h: Hypothesis) => h.verdict as Verdict);
    if (outcome.verdict !== 'supported' && (thread.resurveyCount ?? 0) < cap && detectPlateau(completed, window)) {
      thread.resurveyCount = (thread.resurveyCount ?? 0) + 1;
      thread.pendingPivot = true;
      thread.maxIterations += window;
      incrementCounter('research.resurveys_total');
      saveThread(cwd, thread);
      if (resurveyFetchOn) {
        const fetchFn = opts.resurveyFetch || defaultResurveyFetch;
        try { await fetchFn(cwd, thread, { spawn }); } catch { /* degrade */ }
      }
    }
```

- [ ] **Step 5: Update `agents/grd-surveyor.md`** to document the `__SOURCES__` contract. Append to its output section a note:
```markdown

When invoked by the autoresearch plateau re-survey, instead of (or in addition to) the landscape
table, emit a final block listing up to 3 NEW high-relevance sources, one per line (an arXiv id
like `2401.12345` or an `http(s)` URL):

__SOURCES__
2401.12345
https://example.com/paper
```

- [ ] **Step 6: Run to verify pass + full suite**

Run: `npx jest tests/unit/research/orchestrator.test.ts tests/unit/research/agent-audit.test.ts && npm run build:check`
Expected: all PASS (the flag gate works; agent-audit unaffected — surveyor count unchanged); build OK.

- [ ] **Step 7: Commit**

```bash
git add lib/research/orchestrator.ts agents/grd-surveyor.md tests/unit/research/orchestrator.test.ts
git commit -m "feat(research): flagged plateau fetch path — resurveyFetch + grd-surveyor __SOURCES__ (plateau task 5)"
```

---

## Task 6: coverage thresholds, docs, full verification

**Files:**
- Modify: `jest.config.js`, `CLAUDE.md`

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: clean (empty degrade `catch {}` blocks are intentional and allowed; prefix unused args with `_`).

- [ ] **Step 2: Measure coverage for the touched research files**

Run:
```bash
npx jest tests/unit/research/ --coverage --collectCoverageFrom='lib/research/orchestrator.ts' --collectCoverageFrom='lib/research/thread.ts' --coverageThreshold='{}' 2>&1 | grep -E "orchestrator\.ts|thread\.ts|% Stmts"
```
Note the actuals.

- [ ] **Step 3: Adjust per-file thresholds** in `jest.config.js` only if a threshold-carrying touched file (`thread.ts` if it has one; orchestrator has none currently) drops below its entry. If `lib/research/thread.ts`/`orchestrator.ts` have no `coverageThreshold` entry, none is required (they are not gated). Do NOT lower any existing entry. If coverage on a gated file dropped, raise test coverage rather than lowering the threshold.

- [ ] **Step 4: Document the feature** in `CLAUDE.md` — under the autoresearch section, before `## Gotchas`, add:
```markdown
### Plateau re-survey (loop deepening #1)

When the loop plateaus (`research_plateau_window` consecutive non-supported verdicts, default 3),
the orchestrator triggers a **re-survey** instead of drifting to `exhausted`: it bumps
`resurveyCount`, extends `maxIterations` by the window (hard ceiling
`baseMaxIterations + research_max_resurveys × window`, default cap 2), and pivots the next
hypothesis — one widened hybrid retrieval (k=16, query augmented with takeaways) plus a "PLATEAU,
pivot hard" prompt directive. With `research_resurvey_fetch: true` it also spawns `grd-surveyor`
to fetch+ingest up to 3 new sources first (degrades fully on any failure). Config keys
`research_max_resurveys` / `research_plateau_window` / `research_resurvey_fetch` are top-level,
read raw, and registered in KNOWN_CONFIG_KEYS.
```

- [ ] **Step 5: Full research suite + build + lint**

Run: `npx jest tests/unit/research/ && npm run build:check && npm run lint`
Expected: all PASS; build OK; lint clean. (`git diff --name-only main` shows only `lib/research/{types,thread,verdict?,_prompts,orchestrator}.ts`, `lib/utils.ts`, `agents/grd-surveyor.md`, the tests, `jest.config.js`, `CLAUDE.md`, docs.)

- [ ] **Step 6: Commit**

```bash
git add jest.config.js CLAUDE.md
git commit -m "chore(research): coverage check + docs for plateau re-survey (plateau task 6)"
```

---

## Self-review notes (author)

- **Spec coverage:** thread fields/THREAD.md + detectPlateau tests (T1), config reader + KNOWN_CONFIG_KEYS (T2), pivot prompt (T3), plateau core: detect+extend+consume+widened retrieve (T4), flagged fetch path + surveyor contract (T5), coverage/docs (T6). P1 (clear pendingPivot on consume), P2 (cap gate + baseMaxIterations + extension), Q4 (verdict!==null), Q5 (KNOWN_CONFIG_KEYS), Q6 (single widened retrieve) all covered.
- **Type consistency:** `readResurveyConfig → {cap,window,fetch}`; `retrieveFn(cwd, query, opts?)`; `buildHypothesizePrompt(..., pack, pivot)`; `resurveyFetch(cwd, thread, {spawn})`; thread fields `resurveyCount?/pendingPivot?/baseMaxIterations?` consistent across tasks.
- **Carried risk:** grd-surveyor `__SOURCES__` is additive + opt-in (default off); mid-run `maxIterations` mutation persists (intended, bounded by cap); plateau heuristic is count-based (adds at most `cap` bounded attempts).
```
