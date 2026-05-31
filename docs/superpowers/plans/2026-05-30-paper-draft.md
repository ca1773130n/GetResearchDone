# Paper-Draft Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gd research report <id>` turns a completed research thread's artifacts into a publication-style `PAPER.md` via a deterministic bundle + a `grd-paper-writer` agent.

**Architecture:** New `lib/research/paper.ts` (`gatherPaperBundle` → `buildPaperPrompt` → `generatePaper`) gathers the thread's ledger/takeaways/per-iteration experiments + optional SP2-D Related Work, spawns `grd-paper-writer`, parses `__PAPER__`, atomic-writes `PAPER.md`. A new agent + `cmdResearchReport` CLI wired through `bin`/`lib/cli`/`lib/research/index`. `spawn`/`retrieve`/`generatePaper` injectable → offline tests.

**Tech Stack:** TypeScript (strict, CommonJS, zero `any`), Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-05-30-paper-draft-design.md`

**Conventions:** `'use strict'`; typed requires; tests in `tests/unit/research/<module>.test.ts`. Build: `npm run build:check`. Lint: `npm run lint`.

---

## Task 1: `paper.ts` — `gatherPaperBundle`

**Files:**
- Create: `lib/research/paper.ts`
- Test: `tests/unit/research/paper.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/unit/research/paper.test.ts`:

```ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gatherPaperBundle } = require('../../../lib/research/paper');
const { createThread, saveThread } = require('../../../lib/research/thread');
const { appendHypothesis } = require('../../../lib/research/ledger');
const { appendTakeaway } = require('../../../lib/research/takeaways');

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-paper-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

// Build a terminal thread with 2 iterations of ledger + experiments.
function fixtureThread(cwd: string): string {
  const t = createThread(cwd, 'Does X help?', { maxIterations: 5 });
  t.iteration = 2; t.status = 'supported'; saveThread(cwd, t);
  appendHypothesis(cwd, t.id, { id: 'h1', iteration: 1, statement: 'H one', rationale: 'r', predictedOutcome: 'p', status: 'refuted', parentId: null, verdict: 'refuted' });
  appendHypothesis(cwd, t.id, { id: 'h2', iteration: 2, statement: 'H two', rationale: 'r', predictedOutcome: 'p', status: 'supported', parentId: 'h1', verdict: 'supported' });
  appendTakeaway(cwd, t.id, { kind: 'domain_fact', content: 'learned a thing', confidence: 0.6, evidence: 'e', failureClass: 'none', iteration: 1 });
  for (const [n, acc] of [[1, 0.1], [2, 0.9]] as Array<[number, number]>) {
    const dir = path.join(cwd, '.planning/research/threads', t.id, 'experiments', String(n));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ metricKey: 'acc', comparator: '>=', target: 0.8, scriptPath: 'run.sh', language: 'shell' }));
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ metrics: { acc }, exitCode: 0, failureClass: 'none' }));
  }
  return t.id;
}

describe('gatherPaperBundle', () => {
  it('assembles thread, supported hypothesis, ledger, takeaways, per-iteration experiments + verdicts', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    const b = await gatherPaperBundle(cwd, id);
    expect(b.thread.question).toBe('Does X help?');
    expect(b.supported.id).toBe('h2');
    expect(b.ledger.map((h: { id: string }) => h.id)).toEqual(['h1', 'h2']);
    expect(b.takeaways[0].content).toBe('learned a thing');
    expect(b.experiments).toHaveLength(2);
    expect(b.experiments[0]).toMatchObject({ iter: 1, metrics: { acc: 0.1 }, verdict: 'refuted' });
    expect(b.experiments[1].plan.metricKey).toBe('acc');
    expect(b.relatedWork).toEqual([]);
  });

  it('folds injected retrieve results into relatedWork, and degrades to [] when retrieve throws', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    const okRetrieve = async () => ({ results: [{ name: 'RAG', description: 'd', source_path: 'corpus/x.md' }] });
    const b1 = await gatherPaperBundle(cwd, id, { retrieve: okRetrieve });
    expect(b1.relatedWork[0].name).toBe('RAG');
    const b2 = await gatherPaperBundle(cwd, id, { retrieve: async () => { throw new Error('boom'); } });
    expect(b2.relatedWork).toEqual([]);
  });

  it('tolerates a missing result.json (metrics: {})', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    fs.rmSync(path.join(cwd, '.planning/research/threads', id, 'experiments/2/result.json'));
    const b = await gatherPaperBundle(cwd, id);
    expect(b.experiments[1].metrics).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/paper.test.ts -t gatherPaperBundle`
Expected: FAIL — cannot find module `paper`.

- [ ] **Step 3: Create `lib/research/paper.ts`** with the bundle gatherer:

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { ResearchThread, Hypothesis, Takeaway, ExperimentPlan, Verdict } from './types';
const { loadThread } = require('./thread') as { loadThread: (cwd: string, id: string) => ResearchThread };
const { readLedger } = require('./ledger') as { readLedger: (cwd: string, id: string) => Hypothesis[] };
const { readTakeaways } = require('./takeaways') as { readTakeaways: (cwd: string, id: string) => Takeaway[] };

export type RetrieveFn = (cwd: string, query: string, opts?: Record<string, unknown>) =>
  Promise<{ results: Array<{ name?: string; description?: string; source_path?: string }> }>;

export interface PaperBundle {
  thread: { id: string; question: string; status: string; iteration: number };
  supported: Hypothesis | null;
  ledger: Hypothesis[];
  takeaways: Takeaway[];
  experiments: Array<{ iter: number; plan: Partial<ExperimentPlan> | null; metrics: Record<string, number>; verdict: Verdict | null }>;
  relatedWork: Array<{ name: string; description: string; source_path: string }>;
}

function threadDir(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id);
}

/** Gather a completed thread's artifacts (+ optional Related Work) into a structured bundle. */
async function gatherPaperBundle(cwd: string, id: string, opts: { retrieve?: RetrieveFn } = {}): Promise<PaperBundle> {
  const thread = loadThread(cwd, id);
  const ledger = readLedger(cwd, id);
  const takeaways = readTakeaways(cwd, id);
  const verdictByIter = new Map<number, Verdict | null>(ledger.map((h) => [h.iteration, h.verdict]));

  const experiments: PaperBundle['experiments'] = [];
  for (let n = 1; n <= thread.iteration; n++) {
    const dir = path.join(threadDir(cwd, id), 'experiments', String(n));
    let plan: Partial<ExperimentPlan> | null = null;
    let metrics: Record<string, number> = {};
    try { plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8')); } catch { plan = null; }
    try { metrics = (JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')).metrics) || {}; } catch { metrics = {}; }
    experiments.push({ iter: n, plan, metrics, verdict: verdictByIter.get(n) ?? null });
  }

  let relatedWork: PaperBundle['relatedWork'] = [];
  if (opts.retrieve) {
    try {
      const r = await opts.retrieve(cwd, thread.question);
      relatedWork = (r.results || []).slice(0, 8).map((x) => ({
        name: x.name || '', description: x.description || '', source_path: x.source_path || '',
      }));
    } catch { relatedWork = []; }
  }

  return {
    thread: { id: thread.id, question: thread.question, status: thread.status, iteration: thread.iteration },
    supported: ledger.find((h) => h.status === 'supported') ?? null,
    ledger, takeaways, experiments, relatedWork,
  };
}

module.exports = { gatherPaperBundle, threadDir };
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/unit/research/paper.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 5: Commit**

```bash
git add lib/research/paper.ts tests/unit/research/paper.test.ts
git commit -m "feat(research): paper.ts gatherPaperBundle — thread artifacts + related work (paper task 1)"
```

---

## Task 2: `paper.ts` — `buildPaperPrompt`

**Files:**
- Modify: `lib/research/paper.ts`
- Test: `tests/unit/research/paper.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append:

```ts
describe('buildPaperPrompt', () => {
  const { buildPaperPrompt } = require('../../../lib/research/paper');
  const bundle = {
    thread: { id: 't', question: 'Does X help?', status: 'supported', iteration: 2 },
    supported: { id: 'h2', statement: 'H two' },
    ledger: [{ id: 'h1', status: 'refuted', statement: 'H one' }, { id: 'h2', status: 'supported', statement: 'H two' }],
    takeaways: [{ iteration: 1, kind: 'domain_fact', content: 'learned a thing' }],
    experiments: [{ iter: 1, plan: { metricKey: 'acc', comparator: '>=', target: 0.8 }, metrics: { acc: 0.1 }, verdict: 'refuted' }],
    relatedWork: [{ name: 'RAG', description: 'd', source_path: 'corpus/x.md' }],
  };
  it('embeds question, ledger, a results row, related work, and the __PAPER__ contract', () => {
    const p = buildPaperPrompt(bundle);
    expect(p).toContain('Does X help?');
    expect(p).toContain('H two');
    expect(p).toMatch(/\bacc\b/);
    expect(p).toContain('0.1');
    expect(p).toContain('RAG');
    expect(p).toContain('__PAPER__');
  });
  it('renders defensively when a plan field is missing', () => {
    const p = buildPaperPrompt({ ...bundle, experiments: [{ iter: 1, plan: null, metrics: {}, verdict: null }] });
    expect(p).toContain('__PAPER__'); // does not throw
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/paper.test.ts -t buildPaperPrompt`
Expected: FAIL — `buildPaperPrompt is not a function`.

- [ ] **Step 3: Add `buildPaperPrompt`** to `lib/research/paper.ts` (before `module.exports`):

```ts
/** Assemble the bundle into the grd-paper-writer prompt (data ground-truth + __PAPER__ contract). */
function buildPaperPrompt(bundle: PaperBundle): string {
  const ledgerLines = bundle.ledger.map((h) => `- **${h.id}** [${h.status}] — ${h.statement}`);
  const resultRows = bundle.experiments.map((e) => {
    const p = e.plan || {};
    const val = p.metricKey && e.metrics[p.metricKey] !== undefined ? e.metrics[p.metricKey] : '—';
    return `| ${e.iter} | ${p.metricKey ?? '—'} | ${val} | ${p.comparator ?? '—'} | ${p.target ?? '—'} | ${e.verdict ?? '—'} |`;
  });
  const takeawayLines = bundle.takeaways.map((t) => `- _(iter ${t.iteration}, ${t.kind})_ ${t.content}`);
  const relatedLines = bundle.relatedWork.length
    ? bundle.relatedWork.map((r) => `- **${r.name}**${r.source_path ? ` (${r.source_path})` : ''}: ${r.description}`)
    : ['_(none retrieved)_'];
  return [
    'You are grd-paper-writer. Turn this autoresearch thread into an HONEST, publication-style',
    'markdown draft. Do NOT invent results beyond the data below. If the verdict is not supported,',
    'frame the paper as a negative or inconclusive result — do not fabricate success.',
    '',
    `Research question: ${bundle.thread.question}`,
    `Overall verdict: ${bundle.thread.status} (after ${bundle.thread.iteration} iteration(s))`,
    bundle.supported ? `Supported hypothesis: ${bundle.supported.id} — ${bundle.supported.statement}` : 'Supported hypothesis: none',
    '',
    'Hypothesis ledger:',
    ...ledgerLines,
    '',
    'Per-iteration results (ground truth — do not contradict):',
    '| iter | metric | value | comparator | target | verdict |',
    '| --- | --- | --- | --- | --- | --- |',
    ...resultRows,
    '',
    'Takeaways:',
    ...takeawayLines,
    '',
    'Related work (retrieved from the knowledge graph; cite where relevant):',
    ...relatedLines,
    '',
    'Write these sections: Title, Abstract, Introduction, Related Work, Method, Results,',
    'Discussion, Limitations, Future Work. Emit exactly one final block (no prose after it):',
    '__PAPER__',
    '# <title>',
    '<the full markdown paper>',
  ].join('\n');
}
```
Update `module.exports` to include `buildPaperPrompt`.

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/unit/research/paper.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 5: Commit**

```bash
git add lib/research/paper.ts tests/unit/research/paper.test.ts
git commit -m "feat(research): paper.ts buildPaperPrompt — results table + __PAPER__ contract (paper task 2)"
```

---

## Task 3: `paper.ts` — `generatePaper` (terminal gate, spawn, parse, atomic write)

**Files:**
- Modify: `lib/research/paper.ts`
- Test: `tests/unit/research/paper.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append (reuses `tmp`/`fixtureThread`):

```ts
describe('generatePaper', () => {
  const { generatePaper } = require('../../../lib/research/paper');
  it('writes PAPER.md from the agent __PAPER__ block', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    const spawn = async () => '__PAPER__\n# Draft\n## Abstract\nbody';
    const res = await generatePaper(cwd, id, { spawn });
    expect(res.paperPath).toBe(path.join(cwd, '.planning/research/threads', id, 'PAPER.md'));
    expect(fs.readFileSync(res.paperPath, 'utf8')).toContain('# Draft');
  });
  it('errors on a non-terminal thread (spawn not called)', async () => {
    const cwd = tmp();
    const t = createThread(cwd, 'Q', {}); // status 'active'
    let called = 0;
    await expect(generatePaper(cwd, t.id, { spawn: async () => { called++; return '__PAPER__\nx'; } }))
      .rejects.toThrow(/not finished|active/i);
    expect(called).toBe(0);
  });
  it('errors when the agent emits no __PAPER__ block', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    await expect(generatePaper(cwd, id, { spawn: async () => 'no tag here' })).rejects.toThrow(/__PAPER__|no .*block/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/paper.test.ts -t generatePaper`
Expected: FAIL — `generatePaper is not a function`.

- [ ] **Step 3: Add `generatePaper`** to `lib/research/paper.ts`. Add a `SpawnFn` type near the top:
```ts
type SpawnFn = (prompt: string, agentType: string) => Promise<string>;
// Terminal statuses mirror resumeResearch's set in orchestrator.ts (no shared constant exists).
const TERMINAL_STATUSES = new Set(['supported', 'exhausted', 'abandoned']);
```
Add the function before `module.exports`:
```ts
/** Generate PAPER.md for a terminal thread. Throws on missing/active thread or empty agent output. */
async function generatePaper(cwd: string, id: string, opts: { spawn: SpawnFn; retrieve?: RetrieveFn }): Promise<{ paperPath: string; status: string }> {
  let thread: ResearchThread;
  try { thread = loadThread(cwd, id); } catch { throw new Error(`thread "${id}" not found`); }
  if (!TERMINAL_STATUSES.has(thread.status)) {
    throw new Error(`thread "${id}" is not finished (status: ${thread.status}) — resume it first`);
  }
  const bundle = await gatherPaperBundle(cwd, id, { retrieve: opts.retrieve });
  const out = await opts.spawn(buildPaperPrompt(bundle), 'grd-paper-writer');
  const idx = out.indexOf('__PAPER__');
  const md = idx >= 0 ? out.slice(idx + '__PAPER__'.length).trim() : '';
  if (!md) throw new Error('paper-writer produced no __PAPER__ block');
  const dir = threadDir(cwd, id);
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, 'PAPER.md');
  const tmpPath = path.join(dir, '.PAPER.md.tmp');
  fs.writeFileSync(tmpPath, md);
  fs.renameSync(tmpPath, finalPath); // atomic
  return { paperPath: finalPath, status: 'written' };
}
```
Update `module.exports` to include `generatePaper`.

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/unit/research/paper.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 5: Commit**

```bash
git add lib/research/paper.ts tests/unit/research/paper.test.ts
git commit -m "feat(research): paper.ts generatePaper — terminal gate, spawn, parse, atomic write (paper task 3)"
```

---

## Task 4: `grd-paper-writer` agent + agent-audit count

**Files:**
- Create: `agents/grd-paper-writer.md`
- Modify: `tests/unit/agent-audit.test.ts`

- [ ] **Step 1: Update the count assertions first (failing).** In `tests/unit/agent-audit.test.ts`, change `test('agent count is 25', ...)` → `26` and `expect(agentFiles.length).toBe(25)` → `26`.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/agent-audit.test.ts -t "agent count"`
Expected: FAIL — count is 25 (the new agent file does not exist yet).

- [ ] **Step 3: Create `agents/grd-paper-writer.md`** (frontmatter must satisfy the audit: name=filename, `grd-` prefix, description ≤200 chars no `${`, `color`, valid `effort`, `maxTurns`):

```markdown
---
name: grd-paper-writer
description: Turns a completed autoresearch thread (finding, hypothesis ledger, experiment results, takeaways) into an honest, publication-style markdown draft. Emits one structured paper block; does not write files.
tools: Read, Grep, Glob
color: green
effort: high
maxTurns: 20
---

<role>
You are grd-paper-writer. Given the data bundle for ONE completed autoresearch thread, write a
concise, honest, publication-style research note in markdown.
</role>

<rules>
- Use ONLY the data in the prompt (question, hypothesis ledger, per-iteration results table,
  takeaways, related work). Do NOT invent metrics, baselines, or citations.
- If the overall verdict is not "supported", write it up as a negative or inconclusive result —
  never fabricate success. The per-iteration results table is ground truth; do not contradict it.
- Cite related-work entries by name where they inform the framing.
- Do NOT write files. Emit exactly one final block to stdout via the contract below; GRD persists it.
</rules>

<output_contract>
Emit exactly one final block, nothing after it:
__PAPER__
# <title>
## Abstract
<150-250 words>
## Introduction
<the question and why it matters>
## Related Work
<situate against the retrieved nodes, or state none were retrieved>
## Method
<the experiment procedure(s) and metric/comparator/target>
## Results
<what each iteration measured vs target, and the overall verdict>
## Discussion
<what the takeaways imply>
## Limitations
<honest scope/threats, including thin evidence if few iterations>
## Future Work
<next-cycle follow-ups>
</output_contract>
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/unit/agent-audit.test.ts`
Expected: all PASS (count 26; new agent satisfies frontmatter/description/color/effort checks).

- [ ] **Step 5: Commit**

```bash
git add agents/grd-paper-writer.md tests/unit/agent-audit.test.ts
git commit -m "feat(research): grd-paper-writer agent + agent-audit count 26 (paper task 4)"
```

---

## Task 5: `cmdResearchReport` CLI + bin/index wiring

**Files:**
- Modify: `lib/research/cli.ts`
- Modify: `lib/research/index.ts`
- Modify: `bin/grd-tools.ts`
- Modify: `lib/cli/index.ts`
- Test: `tests/unit/research/cli.test.ts` (extend or create)

- [ ] **Step 1: Write the failing test** — append to `tests/unit/research/cli.test.ts` (it already exercises `cmdResearchStart`/`Status`; mirror its capture helpers — `captureOutputAsync`/`captureErrorAsync` from `../helpers/setup`). If the file does not import them, add the import:

```ts
describe('cmdResearchReport', () => {
  const { cmdResearchReport } = require('../../../lib/research/cli');
  const { createThread, saveThread } = require('../../../lib/research/thread');
  function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-rep-')); fs.mkdirSync(path.join(d, '.planning'), { recursive: true }); return d; }

  it('errors when no id is given', async () => {
    const res = await captureErrorAsync(() => cmdResearchReport(tmp(), '', true, {}));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/id is required/i);
  });
  it('calls the injected generatePaper and prints the paper path', async () => {
    const cwd = tmp();
    const t = createThread(cwd, 'Q', {}); t.status = 'supported'; saveThread(cwd, t);
    const deps = { generatePaper: async (_c: string, id: string) => ({ paperPath: `/abs/${id}/PAPER.md`, status: 'written' }) };
    const res = await captureOutputAsync(() => cmdResearchReport(cwd, t.id, true, deps));
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('PAPER.md');
  });
  it('exits 1 when generatePaper throws (e.g. not terminal)', async () => {
    const cwd = tmp();
    const deps = { generatePaper: async () => { throw new Error('not finished'); } };
    const res = await captureErrorAsync(() => cmdResearchReport(cwd, 'x', true, deps));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/not finished/i);
  });
});
```
(Ensure `fs`/`os`/`path` and the capture helpers are required at the top of `cli.test.ts`; add any that are missing.)

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/cli.test.ts -t cmdResearchReport`
Expected: FAIL — `cmdResearchReport` undefined.

- [ ] **Step 3: Implement `cmdResearchReport`** in `lib/research/cli.ts`. Add requires for the real spawn/retrieve binding at the top (after the existing requires):
```ts
const { loadConfig } = require('./../utils') as { loadConfig: (cwd: string) => Record<string, unknown> };
const { defaultSpawn } = require('./orchestrator') as { defaultSpawn: (cwd: string, config: Record<string, unknown>, model?: string) => (p: string, a: string) => Promise<string> };
const { retrieve } = require('./retrieve') as { retrieve: (cwd: string, q: string, o?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>> }> };
const { defaultEmbedder } = require('./embedder') as { defaultEmbedder: () => (texts: string[]) => Promise<number[][] | null> };
const { generatePaper } = require('./paper') as {
  generatePaper: (cwd: string, id: string, opts: { spawn: (p: string, a: string) => Promise<string>; retrieve?: (c: string, q: string, o?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>> }> }) => Promise<{ paperPath: string; status: string }>;
};
```
Add the function:
```ts
interface ReportDeps {
  generatePaper?: (cwd: string, id: string, opts: Record<string, unknown>) => Promise<{ paperPath: string; status: string }>;
}

async function cmdResearchReport(cwd: string, id: string, raw: boolean, deps: ReportDeps = {}): Promise<never> {
  if (!id) error('research report: a thread id is required');
  const gen = deps.generatePaper || ((c: string, tid: string) => generatePaper(c, tid, {
    spawn: defaultSpawn(c, loadConfig(c)),
    retrieve: (cc: string, q: string, o?: Record<string, unknown>) => retrieve(cc, q, { embedder: defaultEmbedder(), ...(o || {}) }),
  }));
  try {
    const res = await gen(cwd, id, {});
    return output(res, raw, raw ? JSON.stringify(res) : `report: ${res.paperPath}\n`);
  } catch (e) {
    return error(`research report: ${(e as Error).message}`);
  }
}
```
Update `module.exports` to add `cmdResearchReport`.

- [ ] **Step 4: Export it from `lib/research/index.ts`** — add after `cmdResearchStatus: cli.cmdResearchStatus,`:
```ts
  cmdResearchReport: cli.cmdResearchReport,
```

- [ ] **Step 5: Wire the bin dispatch.** In `bin/grd-tools.ts` `case 'research'`, add `cmdResearchReport` to the destructure + its type, and add the branch before the default question path (after the `if (sub === 'resume')` block):
```ts
        cmdResearchReport: (cwd: string, id: string, raw: boolean) => Promise<never>;
```
and:
```ts
      if (sub === 'report') {
        await cmdResearchReport(cwd, args[2], raw);
        return;
      }
```
(add `cmdResearchReport,` to the destructured names from `require('../lib/research')`).

- [ ] **Step 6: Register the subcommand** in `lib/cli/index.ts` — change:
```ts
const RESEARCH_TOOL_SUBS = new Set(['resume', 'status']);
```
to:
```ts
const RESEARCH_TOOL_SUBS = new Set(['resume', 'status', 'report']);
```

- [ ] **Step 7: Run to verify pass + build**

Run: `npx jest tests/unit/research/cli.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 8: Commit**

```bash
git add lib/research/cli.ts lib/research/index.ts bin/grd-tools.ts lib/cli/index.ts tests/unit/research/cli.test.ts
git commit -m "feat(research): gd research report <id> — cmdResearchReport + bin/index wiring (paper task 5)"
```

---

## Task 6: coverage thresholds, docs, full verification

**Files:**
- Modify: `jest.config.js`, `CLAUDE.md`

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: clean (empty degrade `catch {}` allowed; prefix unused args with `_`).

- [ ] **Step 2: Measure coverage for `paper.ts`**

Run:
```bash
npx jest tests/unit/research/ --coverage --collectCoverageFrom='lib/research/paper.ts' --coverageThreshold='{}' 2>&1 | grep -E "paper\.ts|% Stmts"
```
Note the actuals.

- [ ] **Step 3: Add a per-file threshold** for `paper.ts` in `jest.config.js` (after the `./lib/research/embedder.ts` line), a few points below the Step-2 actuals:
```js
    './lib/research/paper.ts': { lines: 90, functions: 90, branches: 75 },
```
Adjust literals to sit just under measured if lower.

- [ ] **Step 4: Document the feature** in `CLAUDE.md` — under the autoresearch section, before `## Gotchas` (the FIRST occurrence — the canonical copy precedes the `<!-- Managed by HarnessSync -->` boundary), add:
```markdown
### Paper-draft generation (loop deepening #2)

`gd research report <id>` turns a **completed** thread (status supported/exhausted/abandoned)
into a publication-style `PAPER.md`. `lib/research/paper.ts` deterministically gathers a
`PaperBundle` (question, supported hypothesis, full ledger, per-iteration plan+metrics+verdict,
takeaways, and SP2-D Related Work via `retrieve`), then spawns `grd-paper-writer` which emits a
`__PAPER__` markdown block (Abstract→Future Work). Honest by contract: an exhausted thread is
written up as a negative/inconclusive result. Related Work degrades to empty if retrieval fails;
non-terminal threads are refused. Written atomically (temp+rename), regenerated on each call.
```

- [ ] **Step 5: Full research suite + agent audit + build + lint**

Run: `npx jest tests/unit/research/ tests/unit/agent-audit.test.ts && npm run build:check && npm run lint`
Expected: all PASS; build OK; lint clean. (`git diff --name-only main` shows only `lib/research/{paper,cli,index}.ts`, `bin/grd-tools.ts`, `lib/cli/index.ts`, `agents/grd-paper-writer.md`, the tests, `jest.config.js`, `CLAUDE.md`, docs.)

- [ ] **Step 6: Commit**

```bash
git add jest.config.js CLAUDE.md
git commit -m "chore(research): coverage threshold + docs for paper-draft generation (paper task 6)"
```

---

## Self-review notes (author)

- **Spec coverage:** gatherPaperBundle (T1), buildPaperPrompt + results table (T2), generatePaper terminal-gate/spawn/parse/atomic-write (T3), grd-paper-writer agent + audit (T4), cmdResearchReport + 4-point CLI wiring (T5), coverage/docs (T6). Codex P2s: per-iteration verdict from ledger (T1), partial-plan tolerance (T1/T2 defensive render), 4 CLI changes incl. index export (T5), terminal set mirrors resumeResearch (T3).
- **Type consistency:** `PaperBundle` shape identical across T1–T3; `gatherPaperBundle(cwd,id,{retrieve?})`, `buildPaperPrompt(bundle)`, `generatePaper(cwd,id,{spawn,retrieve?})→{paperPath,status}`, `cmdResearchReport(cwd,id,raw,deps?)` consistent and matched by the injected test fakes.
- **Carried risk:** agent fabrication (honesty rule + ground-truth table); thin threads → thin papers (acceptable).
```
