# Autoresearch Loop — Closed-Loop Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `gd research "<question>"` command that runs a hypothesis-centric scientific loop (hypothesize → design → run → measure → learn → revise) to a verdict, persisting a research thread and compounding findings into the Tesserae KG.

**Architecture:** A new deterministic orchestrator in `lib/research/` drives a state machine, spawning three agents per iteration (`grd-hypothesizer`, `grd-experiment-runner`, reused `grd-knowledge-miner`) via GRD's existing scheduler. Experiment execution and verdict comparison are deterministic (subprocess runner + structured threshold) for a testable thin slice. Two checkpoint gates pause the loop before running code and before writing to the shared KG.

**Tech Stack:** TypeScript (strict, CommonJS, `'use strict'`), `tsx/cjs` entry resolution, Jest + ts-jest, GRD `lib/scheduler` + `lib/metrics` + `lib/utils` + `lib/knowledge` + `lib/dead-ends`, Tesserae CLI (graceful-optional).

**Security note:** subprocess execution uses Node's `execFileSync` (NOT `exec`) — no shell is spawned and arguments are passed as an array, so generated script paths cannot inject shell commands. This matches GRD's existing `execFileSync`/`spawnSync` usage (e.g. `lib/cli/tools.ts`).

---

## Plan-level decisions (deviations from the spec, for transparency)

The spec is the source of truth; these two thin-slice simplifications make the loop deterministic and testable now, and are noted so reviewers see them:

1. **Machine state is `thread.json`, not YAML frontmatter in `THREAD.md`.** GRD's `lib/frontmatter.ts` only *reads* YAML; there is no deterministic YAML writer. `THREAD.md` becomes the human-readable log, rendered from `thread.json`. (Spec §4 had proposed frontmatter.)
2. **MEASURE is deterministic, not `grd-eval-reporter`.** The experiment plan carries a structured threshold (`metricKey`/`comparator`/`target`); `evaluateVerdict` compares the runner's metrics against it. Reusing `grd-eval-reporter` for richer eval (baseline deltas, ablations) is deferred to a deepening cycle. (Spec §5 listed eval-reporter as REUSE for MEASURE; the runtime path here uses 3 agents, not 4.)

Everything else follows the spec: loop shape (§3), artifact layout (§4), two new agents + reused knowledge-miner (§5), `lib/research/` layout (§6), Tesserae read-by-agent/write-by-compile (§7), two gates (§8), infra reuse (§9), error handling (§10), tests (§11).

---

## File structure

**New module `lib/research/` (TypeScript only — no `.js` proxies):**

| File | Responsibility |
|---|---|
| `types.ts` | All interfaces/types + a `defaultGates()` factory |
| `thread.ts` | Thread dir layout, id/slug, `thread.json` + `THREAD.md` CRUD |
| `ledger.ts` | `HYPOTHESES.md` parse/format, lineage, status updates, id allocation |
| `verdict.ts` | `evaluateVerdict`, `decideBranch`, `shouldTerminate`, `detectPlateau` |
| `runner.ts` | Pluggable runner (subprocess default), metrics parse, failure classification |
| `takeaways.ts` | `TAKEAWAYS.md` parse/format/append |
| `gates.ts` | `resolveGates`, `checkGate` |
| `finding.ts` | Compile-ready `FINDING.md` build/write |
| `kg.ts` | Tesserae write path (register + refresh via CLI, graceful), `kg.json` provenance |
| `agent-io.ts` | Parse tagged-JSON contracts from agent stdout |
| `_prompts.ts` | Agent prompt builders (embed output contracts + KG-read instructions) |
| `orchestrator.ts` | `runResearch` / `resumeResearch` loop (injectable `spawn`/`runner`) |
| `cli.ts` | `cmdResearchStart` / `cmdResearchResume` / `cmdResearchStatus` |
| `index.ts` | Barrel re-export |

**Wiring (modify existing):**
- `lib/cli/index.ts` — add `'research'` to `TOOL_COMMANDS` + `RESEARCH_TOOL_SUBS`
- `bin/grd-tools.ts` — add `case 'research':`
- `jest.config.js` — per-file coverage thresholds for `lib/research/*`
- `lib/backend.ts` — `EFFORT_PROFILES` entries for the two new agents

**New non-code artifacts:**
- `commands/research.md` — the `/grd:research` skill
- `agents/grd-hypothesizer.md`, `agents/grd-experiment-runner.md` — agent defs
- `agents/grd-knowledge-miner.md` — add a `<research_takeaway_mode>` section (edit)

**Tests:** `tests/unit/research/*.test.ts` (one per module) + `tests/integration/research-loop.test.ts`.

---

## Task 1: Types & defaults

**Files:**
- Create: `lib/research/types.ts`
- Test: `tests/unit/research/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/types.test.ts
'use strict';
const { defaultGates } = require('../../../lib/research/types');

describe('research types', () => {
  it('defaultGates returns both gates on', () => {
    expect(defaultGates()).toEqual({ execute: true, kg_write: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/types.test.ts`
Expected: FAIL — `Cannot find module '../../../lib/research/types'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/types.ts
'use strict';

export type ThreadStatus =
  | 'active' | 'paused' | 'supported' | 'exhausted' | 'error' | 'abandoned';
export type Station =
  | 'seed' | 'ground' | 'hypothesize' | 'design' | 'run'
  | 'measure' | 'learn' | 'decide' | 'persist' | 'finalize';
export type Verdict = 'supported' | 'refuted' | 'inconclusive';
export type HypothesisStatus =
  | 'open' | 'testing' | 'supported' | 'refuted' | 'inconclusive' | 'superseded';
export type FailureClass = 'H2' | 'H3' | 'H4' | 'none';
export type TakeawayKind =
  | 'success_pattern' | 'failure_root_cause' | 'constraint' | 'domain_fact' | 'tool_pattern';
export type Comparator = '>=' | '<=' | '>' | '<' | '==';

export interface ThreadGates { execute: boolean; kg_write: boolean; }

export interface ResearchThread {
  id: string;
  question: string;
  status: ThreadStatus;
  iteration: number;
  maxIterations: number;
  gates: ThreadGates;
  budgetUsed: number;
  modelProfile: string;
  tokenProfile: string;
  currentStation: Station;
  pendingGate: 'execute' | 'kg_write' | null;
  createdAt: string;
}

export interface Hypothesis {
  id: string;
  iteration: number;
  statement: string;
  rationale: string;
  predictedOutcome: string;
  status: HypothesisStatus;
  parentId: string | null;
  verdict: Verdict | null;
}

export interface ExperimentPlan {
  procedure: string;
  metricKey: string;
  comparator: Comparator;
  target: number;
  predictedOutcome: string;
  scriptPath: string;
  language: 'shell' | 'python';
}

export interface ExperimentResult {
  metrics: Record<string, number>;
  exitCode: number;
  runner: 'subprocess';
  durationMs: number;
  stdoutExcerpt: string;
  failureClass: FailureClass;
}

export interface Takeaway {
  kind: TakeawayKind;
  content: string;
  confidence: number;
  evidence: string;
  failureClass: FailureClass;
  iteration: number;
}

export interface MeasureOutcome { verdict: Verdict; detail: string; }

export function defaultGates(): ThreadGates {
  return { execute: true, kg_write: true };
}

module.exports = { defaultGates };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/types.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/types.ts tests/unit/research/types.test.ts
git commit -m "feat(research): add thin-slice types + defaultGates"
```

---

## Task 2: Thread state (thread.json + THREAD.md)

**Files:**
- Create: `lib/research/thread.ts`
- Test: `tests/unit/research/thread.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/thread.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { threadId, createThread, loadThread, saveThread, listThreads } =
  require('../../../lib/research/thread');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-research-')); }

describe('research thread', () => {
  it('threadId is a slug + short hash, stable per question', () => {
    const id = threadId('Does X improve Y?');
    expect(id).toMatch(/^does-x-improve-y-[0-9a-f]{6}$/);
    expect(threadId('Does X improve Y?')).toBe(id);
  });

  it('createThread writes thread.json + THREAD.md and is loadable', () => {
    const cwd = tmp();
    const t = createThread(cwd, 'Test question', { maxIterations: 3 });
    expect(t.status).toBe('active');
    expect(t.maxIterations).toBe(3);
    expect(t.gates).toEqual({ execute: true, kg_write: true });
    const dir = path.join(cwd, '.planning/research/threads', t.id);
    expect(fs.existsSync(path.join(dir, 'thread.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'THREAD.md'))).toBe(true);
    expect(loadThread(cwd, t.id).question).toBe('Test question');
  });

  it('saveThread round-trips mutated state', () => {
    const cwd = tmp();
    const t = createThread(cwd, 'Q2', {});
    t.iteration = 2; t.status = 'paused'; t.pendingGate = 'execute';
    saveThread(cwd, t);
    const loaded = loadThread(cwd, t.id);
    expect(loaded.iteration).toBe(2);
    expect(loaded.pendingGate).toBe('execute');
  });

  it('listThreads returns all created threads', () => {
    const cwd = tmp();
    createThread(cwd, 'A', {});
    createThread(cwd, 'B', {});
    expect(listThreads(cwd).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/thread.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/thread.ts
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { ResearchThread, ThreadGates } from './types';
const { defaultGates } = require('./types') as { defaultGates: () => ThreadGates };

const THREADS_REL = '.planning/research/threads';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function threadId(question: string): string {
  const hash = crypto.createHash('sha1').update(question).digest('hex').slice(0, 6);
  const slug = slugify(question) || 'thread';
  return `${slug}-${hash}`;
}

function threadDir(cwd: string, id: string): string {
  return path.join(cwd, THREADS_REL, id);
}

interface CreateOpts {
  maxIterations?: number;
  gates?: ThreadGates;
  modelProfile?: string;
  tokenProfile?: string;
}

function createThread(cwd: string, question: string, opts: CreateOpts): ResearchThread {
  const id = threadId(question);
  const thread: ResearchThread = {
    id,
    question,
    status: 'active',
    iteration: 1,
    maxIterations: opts.maxIterations ?? 5,
    gates: opts.gates ?? defaultGates(),
    budgetUsed: 0,
    modelProfile: opts.modelProfile ?? 'balanced',
    tokenProfile: opts.tokenProfile ?? 'balanced',
    currentStation: 'seed',
    pendingGate: null,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(threadDir(cwd, id), { recursive: true });
  saveThread(cwd, thread);
  return thread;
}

function loadThread(cwd: string, id: string): ResearchThread {
  const raw = fs.readFileSync(path.join(threadDir(cwd, id), 'thread.json'), 'utf8');
  return JSON.parse(raw) as ResearchThread;
}

function renderThreadLog(t: ResearchThread): string {
  return [
    `# Research Thread: ${t.question}`,
    '',
    `- **id:** ${t.id}`,
    `- **status:** ${t.status}`,
    `- **iteration:** ${t.iteration} / ${t.maxIterations}`,
    `- **station:** ${t.currentStation}`,
    `- **pending gate:** ${t.pendingGate ?? 'none'}`,
    `- **created:** ${t.createdAt}`,
    '',
  ].join('\n');
}

function saveThread(cwd: string, thread: ResearchThread): void {
  const dir = threadDir(cwd, thread.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'thread.json'), JSON.stringify(thread, null, 2));
  fs.writeFileSync(path.join(dir, 'THREAD.md'), renderThreadLog(thread));
}

function listThreads(cwd: string): ResearchThread[] {
  const root = path.join(cwd, THREADS_REL);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((d: string) => fs.existsSync(path.join(root, d, 'thread.json')))
    .map((d: string) => loadThread(cwd, d));
}

module.exports = {
  THREADS_REL, slugify, threadId, threadDir,
  createThread, loadThread, saveThread, listThreads, renderThreadLog,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/thread.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/thread.ts tests/unit/research/thread.test.ts
git commit -m "feat(research): thread state (thread.json + THREAD.md)"
```

---

## Task 3: Hypothesis ledger

**Files:**
- Create: `lib/research/ledger.ts`
- Test: `tests/unit/research/ledger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/ledger.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  formatHypothesis, parseHypotheses, nextHypothesisId,
  appendHypothesis, readLedger, updateHypothesisStatus,
} = require('../../../lib/research/ledger');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ledger-')); }
const H = (over = {}) => ({
  id: 'h1', iteration: 1, statement: 'S', rationale: 'R',
  predictedOutcome: 'P', status: 'testing', parentId: null, verdict: null, ...over,
});

describe('hypothesis ledger', () => {
  it('format then parse round-trips a hypothesis', () => {
    const h = H();
    const parsed = parseHypotheses(formatHypothesis(h));
    expect(parsed[0]).toEqual(h);
  });

  it('nextHypothesisId increments the max', () => {
    expect(nextHypothesisId([])).toBe('h1');
    expect(nextHypothesisId([H({ id: 'h1' }), H({ id: 'h2' })])).toBe('h3');
  });

  it('append + read + update status with lineage', () => {
    const cwd = tmp();
    const id = 'thread-x';
    fs.mkdirSync(path.join(cwd, '.planning/research/threads', id), { recursive: true });
    appendHypothesis(cwd, id, H({ id: 'h1' }));
    appendHypothesis(cwd, id, H({ id: 'h2', parentId: 'h1' }));
    updateHypothesisStatus(cwd, id, 'h1', 'refuted', 'refuted');
    const led = readLedger(cwd, id);
    expect(led.map((h: any) => h.id)).toEqual(['h1', 'h2']);
    expect(led[0].status).toBe('refuted');
    expect(led[0].verdict).toBe('refuted');
    expect(led[1].parentId).toBe('h1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/ledger.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/ledger.ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Hypothesis, HypothesisStatus, Verdict } from './types';

function ledgerPath(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id, 'HYPOTHESES.md');
}

function formatHypothesis(h: Hypothesis): string {
  return [
    `### ${h.id} (iter ${h.iteration}) [${h.status}]`,
    '',
    `- **statement:** ${h.statement}`,
    `- **rationale:** ${h.rationale}`,
    `- **predicted_outcome:** ${h.predictedOutcome}`,
    `- **parent:** ${h.parentId ?? 'none'}`,
    `- **verdict:** ${h.verdict ?? 'none'}`,
    '',
  ].join('\n');
}

function field(block: string, name: string): string {
  const m = block.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`));
  return m ? m[1].trim() : '';
}

function parseHypotheses(content: string): Hypothesis[] {
  return content.split(/(?=^### h\d)/m)
    .map((b) => b.trim())
    .filter((b) => b.startsWith('### h'))
    .map((b) => {
      const head = b.match(/^### (h\d+) \(iter (\d+)\) \[(\w+)\]/);
      const parent = field(b, 'parent');
      const verdict = field(b, 'verdict');
      return {
        id: head![1],
        iteration: Number(head![2]),
        status: head![3] as HypothesisStatus,
        statement: field(b, 'statement'),
        rationale: field(b, 'rationale'),
        predictedOutcome: field(b, 'predicted_outcome'),
        parentId: parent === 'none' ? null : parent,
        verdict: verdict === 'none' ? null : (verdict as Verdict),
      };
    });
}

function nextHypothesisId(hyps: Hypothesis[]): string {
  const max = hyps.reduce((m, h) => Math.max(m, Number(h.id.slice(1)) || 0), 0);
  return `h${max + 1}`;
}

function readLedger(cwd: string, id: string): Hypothesis[] {
  const p = ledgerPath(cwd, id);
  return fs.existsSync(p) ? parseHypotheses(fs.readFileSync(p, 'utf8')) : [];
}

function writeLedger(cwd: string, id: string, hyps: Hypothesis[]): void {
  fs.writeFileSync(ledgerPath(cwd, id), hyps.map(formatHypothesis).join('\n'));
}

function appendHypothesis(cwd: string, id: string, h: Hypothesis): void {
  const hyps = readLedger(cwd, id).filter((x) => x.id !== h.id);
  hyps.push(h);
  writeLedger(cwd, id, hyps);
}

function updateHypothesisStatus(
  cwd: string, id: string, hid: string, status: HypothesisStatus, verdict: Verdict | null,
): void {
  const hyps = readLedger(cwd, id).map((h) =>
    h.id === hid ? { ...h, status, verdict } : h);
  writeLedger(cwd, id, hyps);
}

module.exports = {
  ledgerPath, formatHypothesis, parseHypotheses, nextHypothesisId,
  readLedger, writeLedger, appendHypothesis, updateHypothesisStatus,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/ledger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/ledger.ts tests/unit/research/ledger.test.ts
git commit -m "feat(research): hypothesis ledger with lineage"
```

---

## Task 4: Verdict, branching, termination, plateau

**Files:**
- Create: `lib/research/verdict.ts`
- Test: `tests/unit/research/verdict.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/verdict.test.ts
'use strict';
const { evaluateVerdict, decideBranch, shouldTerminate, detectPlateau } =
  require('../../../lib/research/verdict');

const plan = (over = {}) => ({
  procedure: 'p', metricKey: 'accuracy', comparator: '>=', target: 0.8,
  predictedOutcome: 'x', scriptPath: 'run.sh', language: 'shell', ...over,
});
const result = (over = {}) => ({
  metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess',
  durationMs: 10, stdoutExcerpt: '', failureClass: 'none', ...over,
});

describe('verdict', () => {
  it('supported when metric meets target', () => {
    expect(evaluateVerdict(plan(), result()).verdict).toBe('supported');
  });
  it('refuted when metric misses target', () => {
    expect(evaluateVerdict(plan(), result({ metrics: { accuracy: 0.5 } })).verdict).toBe('refuted');
  });
  it('inconclusive when run failed', () => {
    const o = evaluateVerdict(plan(), result({ exitCode: 1, failureClass: 'H3' }));
    expect(o.verdict).toBe('inconclusive');
    expect(o.detail).toContain('H3');
  });
  it('inconclusive when metric missing', () => {
    expect(evaluateVerdict(plan(), result({ metrics: {} })).verdict).toBe('inconclusive');
  });
  it('decideBranch maps supported→finalize else revise', () => {
    expect(decideBranch('supported')).toBe('finalize');
    expect(decideBranch('refuted')).toBe('revise');
    expect(decideBranch('inconclusive')).toBe('revise');
  });
  it('shouldTerminate on supported and on max iterations', () => {
    const t = { iteration: 1, maxIterations: 5 } as any;
    expect(shouldTerminate(t, 'supported')).toEqual({ done: true, status: 'supported' });
    expect(shouldTerminate({ iteration: 5, maxIterations: 5 } as any, 'refuted'))
      .toEqual({ done: true, status: 'exhausted' });
    expect(shouldTerminate(t, 'refuted')).toEqual({ done: false, status: 'active' });
  });
  it('detectPlateau true for window of non-supported verdicts', () => {
    expect(detectPlateau(['refuted', 'inconclusive', 'refuted'], 3)).toBe(true);
    expect(detectPlateau(['refuted', 'supported', 'refuted'], 3)).toBe(false);
    expect(detectPlateau(['refuted'], 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/verdict.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/verdict.ts
'use strict';
import type {
  ExperimentPlan, ExperimentResult, MeasureOutcome, ResearchThread,
  ThreadStatus, Verdict, Comparator,
} from './types';

function compare(value: number, comparator: Comparator, target: number): boolean {
  switch (comparator) {
    case '>=': return value >= target;
    case '<=': return value <= target;
    case '>': return value > target;
    case '<': return value < target;
    case '==': return value === target;
    default: return false;
  }
}

function evaluateVerdict(plan: ExperimentPlan, result: ExperimentResult): MeasureOutcome {
  if (result.exitCode !== 0) {
    return { verdict: 'inconclusive', detail: `experiment run failed (${result.failureClass})` };
  }
  if (!(plan.metricKey in result.metrics)) {
    return { verdict: 'inconclusive', detail: `metric "${plan.metricKey}" not reported` };
  }
  const value = result.metrics[plan.metricKey];
  const pass = compare(value, plan.comparator, plan.target);
  return {
    verdict: pass ? 'supported' : 'refuted',
    detail: `${plan.metricKey}=${value} ${plan.comparator} ${plan.target} → ${pass ? 'pass' : 'fail'}`,
  };
}

function decideBranch(verdict: Verdict): 'finalize' | 'revise' {
  return verdict === 'supported' ? 'finalize' : 'revise';
}

function shouldTerminate(
  thread: ResearchThread, lastVerdict: Verdict,
): { done: boolean; status: ThreadStatus } {
  if (lastVerdict === 'supported') return { done: true, status: 'supported' };
  if (thread.iteration >= thread.maxIterations) return { done: true, status: 'exhausted' };
  return { done: false, status: 'active' };
}

function detectPlateau(verdicts: Verdict[], window = 3): boolean {
  if (verdicts.length < window) return false;
  return verdicts.slice(-window).every((v) => v !== 'supported');
}

module.exports = { compare, evaluateVerdict, decideBranch, shouldTerminate, detectPlateau };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/verdict.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/verdict.ts tests/unit/research/verdict.test.ts
git commit -m "feat(research): verdict, branch, termination, plateau"
```

---

## Task 5: Experiment runner (subprocess)

**Files:**
- Create: `lib/research/runner.ts`
- Test: `tests/unit/research/runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/runner.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseMetricsLine, classifyRunFailure, createSubprocessRunner } =
  require('../../../lib/research/runner');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-runner-')); }
const plan = (over = {}) => ({
  procedure: 'p', metricKey: 'accuracy', comparator: '>=', target: 0.8,
  predictedOutcome: 'x', scriptPath: 'run.sh', language: 'shell', ...over,
});

describe('runner', () => {
  it('parseMetricsLine extracts __RESULT__ json', () => {
    expect(parseMetricsLine('noise\n__RESULT__ {"accuracy": 0.9}\n')).toEqual({ accuracy: 0.9 });
    expect(parseMetricsLine('no result here')).toEqual({});
  });
  it('classifyRunFailure maps stderr to H2/H3/H4', () => {
    expect(classifyRunFailure('command not found: foo', false)).toBe('H2');
    expect(classifyRunFailure('No such file or directory', false)).toBe('H3');
    expect(classifyRunFailure('anything', true)).toBe('H4');
    expect(classifyRunFailure('', false)).toBe('none');
  });
  it('subprocess runner runs a shell script and captures metrics', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'run.sh'), 'echo "__RESULT__ {\\"accuracy\\": 0.95}"');
    const res = createSubprocessRunner().run(plan(), dir);
    expect(res.exitCode).toBe(0);
    expect(res.metrics.accuracy).toBe(0.95);
    expect(res.failureClass).toBe('none');
  });
  it('subprocess runner classifies a failing script', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'run.sh'), 'cat /no/such/file');
    const res = createSubprocessRunner().run(plan(), dir);
    expect(res.exitCode).not.toBe(0);
    expect(res.failureClass).toBe('H3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/runner.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/runner.ts
'use strict';
const path = require('path');
// execFileSync only (NOT exec): no shell is spawned and args are passed as an array,
// so the generated script path cannot inject shell commands.
const { execFileSync } = require('child_process');
import type { ExperimentPlan, ExperimentResult, FailureClass } from './types';

export interface Runner {
  run(plan: ExperimentPlan, threadDir: string): ExperimentResult;
}

function parseMetricsLine(stdout: string): Record<string, number> {
  const m = stdout.match(/__RESULT__\s*(\{.*\})/);
  if (!m) return {};
  try {
    const obj = JSON.parse(m[1]) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) if (typeof v === 'number') out[k] = v;
    return out;
  } catch { return {}; }
}

function classifyRunFailure(stderr: string, timedOut: boolean): FailureClass {
  if (timedOut) return 'H4';
  if (/command not found|not found:|ModuleNotFoundError|ImportError/i.test(stderr)) return 'H2';
  if (/No such file or directory|ENOENT|permission denied/i.test(stderr)) return 'H3';
  if (!stderr) return 'none';
  return 'H4';
}

function createSubprocessRunner(opts: { timeoutMs?: number } = {}): Runner {
  const timeoutMs = opts.timeoutMs ?? 120000;
  return {
    run(plan: ExperimentPlan, threadDir: string): ExperimentResult {
      const scriptFile = path.isAbsolute(plan.scriptPath)
        ? plan.scriptPath : path.join(threadDir, plan.scriptPath);
      const bin = plan.language === 'python' ? 'python3' : 'bash';
      const start = Date.now();
      let stdout = ''; let stderr = ''; let exitCode = 0; let timedOut = false;
      try {
        stdout = execFileSync(bin, [scriptFile], {
          cwd: threadDir, timeout: timeoutMs, encoding: 'utf8',
        });
      } catch (e: unknown) {
        const err = e as { status?: number; stdout?: string; stderr?: string; signal?: string };
        stdout = err.stdout || '';
        stderr = err.stderr || String(e);
        exitCode = typeof err.status === 'number' ? err.status : 1;
        timedOut = err.signal === 'SIGTERM';
      }
      return {
        metrics: parseMetricsLine(stdout),
        exitCode,
        runner: 'subprocess',
        durationMs: Date.now() - start,
        stdoutExcerpt: stdout.slice(0, 2000),
        failureClass: exitCode === 0 ? 'none' : classifyRunFailure(stderr, timedOut),
      };
    },
  };
}

module.exports = { parseMetricsLine, classifyRunFailure, createSubprocessRunner };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/runner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/runner.ts tests/unit/research/runner.test.ts
git commit -m "feat(research): subprocess experiment runner + failure classification"
```

---

## Task 6: Takeaways ledger

**Files:**
- Create: `lib/research/takeaways.ts`
- Test: `tests/unit/research/takeaways.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/takeaways.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { formatTakeaway, parseTakeaways, appendTakeaway, readTakeaways } =
  require('../../../lib/research/takeaways');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tk-')); }
const T = (over = {}) => ({
  kind: 'failure_root_cause', content: 'C', confidence: 0.7,
  evidence: 'E', failureClass: 'H3', iteration: 1, ...over,
});

describe('takeaways', () => {
  it('format then parse round-trips', () => {
    expect(parseTakeaways(formatTakeaway(T()))[0]).toEqual(T());
  });
  it('append + read accumulates', () => {
    const cwd = tmp();
    const id = 't1';
    fs.mkdirSync(path.join(cwd, '.planning/research/threads', id), { recursive: true });
    appendTakeaway(cwd, id, T({ iteration: 1 }));
    appendTakeaway(cwd, id, T({ iteration: 2, kind: 'success_pattern', failureClass: 'none' }));
    const all = readTakeaways(cwd, id);
    expect(all.length).toBe(2);
    expect(all[1].kind).toBe('success_pattern');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/takeaways.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/takeaways.ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Takeaway, TakeawayKind, FailureClass } from './types';

function takeawaysPath(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id, 'TAKEAWAYS.md');
}

function formatTakeaway(t: Takeaway): string {
  return [
    `### iter ${t.iteration}: ${t.kind}`,
    '',
    `- **content:** ${t.content}`,
    `- **confidence:** ${t.confidence}`,
    `- **evidence:** ${t.evidence}`,
    `- **failure_class:** ${t.failureClass}`,
    '',
  ].join('\n');
}

function field(block: string, name: string): string {
  const m = block.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`));
  return m ? m[1].trim() : '';
}

function parseTakeaways(content: string): Takeaway[] {
  return content.split(/(?=^### iter )/m)
    .map((b) => b.trim())
    .filter((b) => b.startsWith('### iter '))
    .map((b) => {
      const head = b.match(/^### iter (\d+): (\w+)/);
      return {
        iteration: Number(head![1]),
        kind: head![2] as TakeawayKind,
        content: field(b, 'content'),
        confidence: Number(field(b, 'confidence')) || 0,
        evidence: field(b, 'evidence'),
        failureClass: (field(b, 'failure_class') || 'none') as FailureClass,
      };
    });
}

function readTakeaways(cwd: string, id: string): Takeaway[] {
  const p = takeawaysPath(cwd, id);
  return fs.existsSync(p) ? parseTakeaways(fs.readFileSync(p, 'utf8')) : [];
}

function appendTakeaway(cwd: string, id: string, t: Takeaway): void {
  const all = readTakeaways(cwd, id);
  all.push(t);
  fs.writeFileSync(takeawaysPath(cwd, id), all.map(formatTakeaway).join('\n'));
}

module.exports = { takeawaysPath, formatTakeaway, parseTakeaways, readTakeaways, appendTakeaway };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/takeaways.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/takeaways.ts tests/unit/research/takeaways.test.ts
git commit -m "feat(research): takeaways ledger"
```

---

## Task 7: Gates

**Files:**
- Create: `lib/research/gates.ts`
- Test: `tests/unit/research/gates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/gates.test.ts
'use strict';
const { resolveGates, checkGate } = require('../../../lib/research/gates');

const thread = (over = {}) => ({
  id: 't', question: 'q', status: 'active', iteration: 1, maxIterations: 5,
  gates: { execute: true, kg_write: true }, budgetUsed: 0,
  modelProfile: 'balanced', tokenProfile: 'balanced',
  currentStation: 'run', pendingGate: null, createdAt: 'now', ...over,
});

describe('gates', () => {
  it('resolveGates: on by default, off with noGates', () => {
    expect(resolveGates({}, false)).toEqual({ execute: true, kg_write: true });
    expect(resolveGates({}, true)).toEqual({ execute: false, kg_write: false });
  });
  it('resolveGates honors research_gates config flags', () => {
    const cfg = { research_gates: { experiment_execution: false, kg_write: true } };
    expect(resolveGates(cfg, false)).toEqual({ execute: false, kg_write: true });
  });
  it('checkGate proceeds when gate off', () => {
    const t = thread({ gates: { execute: false, kg_write: true } });
    expect(checkGate(t, 'execute', false).proceed).toBe(true);
  });
  it('checkGate pauses when gate on and not approved', () => {
    const r = checkGate(thread(), 'execute', false);
    expect(r.proceed).toBe(false);
    expect(r.thread.status).toBe('paused');
    expect(r.thread.pendingGate).toBe('execute');
  });
  it('checkGate proceeds when approved', () => {
    expect(checkGate(thread(), 'execute', true).proceed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/gates.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/gates.ts
'use strict';
import type { ResearchThread, ThreadGates } from './types';

interface GateConfig {
  research_gates?: { experiment_execution?: boolean; kg_write?: boolean };
}

function resolveGates(config: GateConfig, noGates: boolean): ThreadGates {
  if (noGates) return { execute: false, kg_write: false };
  const rg = config.research_gates || {};
  return {
    execute: rg.experiment_execution !== false,
    kg_write: rg.kg_write !== false,
  };
}

function checkGate(
  thread: ResearchThread, gate: 'execute' | 'kg_write', approved: boolean,
): { proceed: boolean; thread: ResearchThread } {
  if (!thread.gates[gate] || approved) return { proceed: true, thread };
  return {
    proceed: false,
    thread: { ...thread, status: 'paused', pendingGate: gate },
  };
}

module.exports = { resolveGates, checkGate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/gates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/gates.ts tests/unit/research/gates.test.ts
git commit -m "feat(research): checkpoint gates"
```

---

## Task 8: Finding document

**Files:**
- Create: `lib/research/finding.ts`
- Test: `tests/unit/research/finding.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/finding.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFinding, writeFinding, findingPath } = require('../../../lib/research/finding');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-finding-')); }
const thread = { id: 't', question: 'Does X help?', status: 'supported', iteration: 2 };
const hyps = [
  { id: 'h1', statement: 'X helps a bit', status: 'refuted', verdict: 'refuted' },
  { id: 'h2', statement: 'X helps when tuned', status: 'supported', verdict: 'supported' },
];
const takeaways = [{ iteration: 2, kind: 'success_pattern', content: 'tune X', confidence: 0.8 }];

describe('finding', () => {
  it('buildFinding includes question, verdict, hypotheses and takeaways', () => {
    const md = buildFinding(thread, hyps, takeaways, { metrics: { accuracy: 0.9 } });
    expect(md).toContain('Does X help?');
    expect(md).toContain('supported');
    expect(md).toContain('h2');
    expect(md).toContain('tune X');
    expect(md).toContain('accuracy');
  });
  it('writeFinding writes FINDING.md', () => {
    const cwd = tmp();
    fs.mkdirSync(path.join(cwd, '.planning/research/threads', 't'), { recursive: true });
    writeFinding(cwd, 't', '# finding');
    expect(fs.readFileSync(findingPath(cwd, 't'), 'utf8')).toBe('# finding');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/finding.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/finding.ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { ResearchThread, Hypothesis, Takeaway, ExperimentResult } from './types';

function findingPath(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id, 'FINDING.md');
}

function buildFinding(
  thread: Pick<ResearchThread, 'id' | 'question' | 'status' | 'iteration'>,
  hyps: Hypothesis[],
  takeaways: Takeaway[],
  lastResult: ExperimentResult | { metrics: Record<string, number> } | null,
): string {
  const supported = hyps.find((h) => h.status === 'supported');
  const lines: string[] = [
    `# Finding: ${thread.question}`,
    '',
    `- **thread:** ${thread.id}`,
    `- **verdict:** ${thread.status}`,
    `- **iterations:** ${thread.iteration}`,
    '',
    '## Supported hypothesis',
    '',
    supported ? `**${supported.id}:** ${supported.statement}` : '_none — exhausted without support_',
    '',
    '## Hypothesis ledger',
    '',
    ...hyps.map((h) => `- **${h.id}** [${h.status}] — ${h.statement}`),
    '',
    '## Method & metric',
    '',
    lastResult ? '```json\n' + JSON.stringify(lastResult.metrics, null, 2) + '\n```' : '_no result_',
    '',
    '## Takeaways',
    '',
    ...takeaways.map((t) => `- _(iter ${t.iteration}, ${t.kind})_ ${t.content}`),
    '',
    '## Open questions',
    '',
    '- (next-cycle follow-ups)',
    '',
  ];
  return lines.join('\n');
}

function writeFinding(cwd: string, id: string, content: string): void {
  fs.writeFileSync(findingPath(cwd, id), content);
}

module.exports = { findingPath, buildFinding, writeFinding };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/finding.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/finding.ts tests/unit/research/finding.test.ts
git commit -m "feat(research): compile-ready FINDING.md builder"
```

---

## Task 9: Tesserae KG write path (graceful)

**Files:**
- Create: `lib/research/kg.ts`
- Test: `tests/unit/research/kg.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/kg.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeKgProvenance, syncFindingToKg } = require('../../../lib/research/kg');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-kg-'));
  fs.mkdirSync(path.join(d, '.planning/research/threads', 't'), { recursive: true });
  return d;
}

describe('kg', () => {
  it('writeKgProvenance writes kg.json', () => {
    const cwd = tmp();
    writeKgProvenance(cwd, 't', { read: ['n1'], wrote: ['finding:t'] });
    const j = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/research/threads/t/kg.json'), 'utf8'));
    expect(j.wrote).toEqual(['finding:t']);
  });
  it('syncFindingToKg degrades gracefully when the runner throws', () => {
    const cwd = tmp();
    const runFn = () => { throw new Error('tesserae not found'); };
    const r = syncFindingToKg(cwd, 't', '/tmp/FINDING.md', { run: runFn });
    expect(r.synced).toBe(false);
    expect(r.reason).toMatch(/tesserae/i);
  });
  it('syncFindingToKg reports synced when the runner succeeds', () => {
    const cwd = tmp();
    const calls: string[][] = [];
    const runFn = (bin: string, args: string[]) => { calls.push([bin, ...args]); return ''; };
    const r = syncFindingToKg(cwd, 't', '/tmp/FINDING.md', { run: runFn });
    expect(r.synced).toBe(true);
    expect(calls.some((c) => c.includes('refresh'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/kg.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/kg.ts
'use strict';
const fs = require('fs');
const path = require('path');
// execFileSync only (NOT exec): no shell, args passed as an array (injection-safe).
// Tests inject a stub `run` so no real process is spawned.
const { execFileSync } = require('child_process');

type RunFn = (bin: string, args: string[], cwd: string) => string;

const defaultRun: RunFn = (bin, args, cwd) =>
  execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 120000 });

function kgPath(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id, 'kg.json');
}

function writeKgProvenance(
  cwd: string, id: string, data: { read?: string[]; wrote?: string[] },
): void {
  fs.writeFileSync(kgPath(cwd, id), JSON.stringify(
    { read: data.read || [], wrote: data.wrote || [], at: new Date().toISOString() }, null, 2));
}

function syncFindingToKg(
  cwd: string, id: string, _findingPath: string, opts: { run?: RunFn } = {},
): { synced: boolean; reason?: string } {
  const run = opts.run || defaultRun;
  try {
    // Register the project (idempotent) then refresh so the new FINDING.md is compiled in.
    try { run('tesserae', ['register', '--root', cwd], cwd); } catch { /* already registered */ }
    run('tesserae', ['refresh', '--root', cwd], cwd);
    return { synced: true };
  } catch (e: unknown) {
    return { synced: false, reason: `tesserae sync skipped: ${String((e as Error).message || e)}` };
  }
}

module.exports = { kgPath, writeKgProvenance, syncFindingToKg };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/kg.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/kg.ts tests/unit/research/kg.test.ts
git commit -m "feat(research): graceful Tesserae KG write path"
```

---

## Task 10: Agent I/O parsing

**Files:**
- Create: `lib/research/agent-io.ts`
- Test: `tests/unit/research/agent-io.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/agent-io.test.ts
'use strict';
const { extractTaggedJson, parseHypothesisOutput, parsePlanOutput, parseTakeawayOutput } =
  require('../../../lib/research/agent-io');

describe('agent-io', () => {
  it('extractTaggedJson reads a tagged json block', () => {
    const out = 'chatter\n__HYPOTHESIS__\n{"statement":"S"}\nmore';
    expect(extractTaggedJson(out, 'HYPOTHESIS')).toEqual({ statement: 'S' });
  });
  it('extractTaggedJson returns null when absent/invalid', () => {
    expect(extractTaggedJson('nothing', 'HYPOTHESIS')).toBeNull();
    expect(extractTaggedJson('__X__\n{bad', 'X')).toBeNull();
  });
  it('parseHypothesisOutput requires statement', () => {
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S","rationale":"R","predictedOutcome":"P"}'))
      .toEqual({ statement: 'S', rationale: 'R', predictedOutcome: 'P' });
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"rationale":"R"}')).toBeNull();
  });
  it('parsePlanOutput requires metricKey + scriptPath', () => {
    const ok = '__PLAN__ {"procedure":"p","metricKey":"acc","comparator":">=","target":0.8,"language":"shell","scriptPath":"run.sh"}';
    expect(parsePlanOutput(ok)!.metricKey).toBe('acc');
    expect(parsePlanOutput('__PLAN__ {"procedure":"p"}')).toBeNull();
  });
  it('parseTakeawayOutput requires content', () => {
    const ok = '__TAKEAWAY__ {"kind":"constraint","content":"C","confidence":0.5,"evidence":"E","failureClass":"none"}';
    expect(parseTakeawayOutput(ok)!.content).toBe('C');
    expect(parseTakeawayOutput('__TAKEAWAY__ {"kind":"constraint"}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/agent-io.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/agent-io.ts
'use strict';

function extractTaggedJson<T>(stdout: string, tag: string): T | null {
  const idx = stdout.indexOf(`__${tag}__`);
  if (idx === -1) return null;
  const rest = stdout.slice(idx + tag.length + 4);
  const start = rest.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < rest.length; i++) {
    if (rest[i] === '{') depth++;
    else if (rest[i] === '}') { depth--; if (depth === 0) {
      try { return JSON.parse(rest.slice(start, i + 1)) as T; } catch { return null; }
    } }
  }
  return null;
}

function parseHypothesisOutput(stdout: string):
  { statement: string; rationale: string; predictedOutcome: string } | null {
  const o = extractTaggedJson<Record<string, string>>(stdout, 'HYPOTHESIS');
  if (!o || !o.statement) return null;
  return {
    statement: o.statement,
    rationale: o.rationale || '',
    predictedOutcome: o.predictedOutcome || '',
  };
}

function parsePlanOutput(stdout: string):
  { procedure: string; metricKey: string; comparator: string; target: number;
    language: string; scriptPath: string } | null {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'PLAN');
  if (!o || !o.metricKey || !o.scriptPath) return null;
  return {
    procedure: String(o.procedure || ''),
    metricKey: String(o.metricKey),
    comparator: String(o.comparator || '>='),
    target: Number(o.target ?? 0),
    language: String(o.language || 'shell'),
    scriptPath: String(o.scriptPath),
  };
}

function parseTakeawayOutput(stdout: string):
  { kind: string; content: string; confidence: number; evidence: string; failureClass: string } | null {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'TAKEAWAY');
  if (!o || !o.content) return null;
  return {
    kind: String(o.kind || 'domain_fact'),
    content: String(o.content),
    confidence: Number(o.confidence ?? 0.5),
    evidence: String(o.evidence || ''),
    failureClass: String(o.failureClass || 'none'),
  };
}

module.exports = { extractTaggedJson, parseHypothesisOutput, parsePlanOutput, parseTakeawayOutput };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/agent-io.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/agent-io.ts tests/unit/research/agent-io.test.ts
git commit -m "feat(research): agent stdout contract parsing"
```

---

## Task 11: Prompt builders

**Files:**
- Create: `lib/research/_prompts.ts`
- Test: `tests/unit/research/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/prompts.test.ts
'use strict';
const { buildHypothesizePrompt, buildExperimentPrompt, buildLearnPrompt } =
  require('../../../lib/research/_prompts');

const thread = { id: 't', question: 'Does X help?' };

describe('prompts', () => {
  it('hypothesize prompt asks to read KG and emit __HYPOTHESIS__ contract', () => {
    const p = buildHypothesizePrompt(thread, [], null);
    expect(p).toContain('Does X help?');
    expect(p).toContain('search_nodes');     // KG grounding instruction
    expect(p).toContain('__HYPOTHESIS__');
  });
  it('hypothesize prompt includes prior verdict on re-loop', () => {
    const prior = [{ id: 'h1', statement: 'old', verdict: 'refuted' }];
    expect(buildHypothesizePrompt(thread, prior, 'refuted')).toContain('refuted');
  });
  it('experiment prompt embeds hypothesis, iter dir and __PLAN__ contract', () => {
    const p = buildExperimentPrompt(thread, { id: 'h1', statement: 'S' }, 'experiments/1');
    expect(p).toContain('S');
    expect(p).toContain('experiments/1');
    expect(p).toContain('__PLAN__');
    expect(p).toContain('__RESULT__'); // tells the script how to print metrics
  });
  it('learn prompt embeds verdict and __TAKEAWAY__ contract', () => {
    const p = buildLearnPrompt(thread, { id: 'h1', statement: 'S' },
      { metrics: { accuracy: 0.5 }, failureClass: 'none' }, 'refuted');
    expect(p).toContain('refuted');
    expect(p).toContain('__TAKEAWAY__');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/prompts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/_prompts.ts
'use strict';
import type { Hypothesis, ExperimentResult, Verdict } from './types';

function buildHypothesizePrompt(
  thread: { id: string; question: string },
  priorHyps: Pick<Hypothesis, 'id' | 'statement' | 'verdict'>[],
  priorVerdict: Verdict | null,
): string {
  const history = priorHyps.length
    ? priorHyps.map((h) => `- ${h.id} [${h.verdict ?? 'open'}]: ${h.statement}`).join('\n')
    : '(none yet)';
  return [
    'You are grd-hypothesizer. Generate ONE ranked, testable hypothesis for this research question.',
    '',
    `Research question: ${thread.question}`,
    '',
    'GROUND first: query the Tesserae knowledge graph for prior related findings using the',
    'tesserae MCP tools (search_nodes, ask, node_context). Also read .planning/LANDSCAPE.md',
    'and .planning/KNOWHOW.md if present. Use what already failed/succeeded to avoid repetition.',
    '',
    'Prior hypotheses in this thread:',
    history,
    priorVerdict ? `\nThe last hypothesis was ${priorVerdict}. Revise — propose a DIFFERENT, more promising hypothesis.` : '',
    '',
    'Emit exactly one final block (no prose after it):',
    '__HYPOTHESIS__',
    '{"statement": "...", "rationale": "...", "predictedOutcome": "..."}',
  ].join('\n');
}

function buildExperimentPrompt(
  thread: { id: string; question: string },
  hypothesis: Pick<Hypothesis, 'id' | 'statement'>,
  iterDir: string,
): string {
  return [
    'You are grd-experiment-runner. Design ONE minimal, reproducible experiment that tests the hypothesis.',
    '',
    `Hypothesis (${hypothesis.id}): ${hypothesis.statement}`,
    '',
    `Write the experiment plan to ${iterDir}/PLAN.md and a runnable script to ${iterDir}/run.sh`,
    '(bash) or the same dir as run.py (python). The script MUST print its result as a final line:',
    '  __RESULT__ {"<metricKey>": <number>}',
    'Do NOT run the script yourself — the orchestrator runs it behind an execution gate.',
    'Pick a single numeric metricKey, a comparator (>=, <=, >, <, ==), and a target threshold.',
    '',
    'Emit exactly one final block (scriptPath relative to the thread dir):',
    '__PLAN__',
    `{"procedure":"...","metricKey":"...","comparator":">=","target":0.0,"language":"shell","scriptPath":"${iterDir}/run.sh"}`,
  ].join('\n');
}

function buildLearnPrompt(
  thread: { id: string; question: string },
  hypothesis: Pick<Hypothesis, 'id' | 'statement'>,
  result: Pick<ExperimentResult, 'metrics' | 'failureClass'>,
  verdict: Verdict,
): string {
  return [
    'You are grd-knowledge-miner in research-takeaway mode. Extract ONE reusable takeaway',
    'from this experiment outcome that should steer the next hypothesis.',
    '',
    `Hypothesis (${hypothesis.id}): ${hypothesis.statement}`,
    `Verdict: ${verdict}`,
    `Metrics: ${JSON.stringify(result.metrics)}`,
    `Run failure class: ${result.failureClass}`,
    '',
    'kind in {success_pattern, failure_root_cause, constraint, domain_fact, tool_pattern}.',
    'failureClass in {H2 (interface), H3 (environment), H4 (trajectory), none}.',
    '',
    'Emit exactly one final block:',
    '__TAKEAWAY__',
    '{"kind":"...","content":"...","confidence":0.0,"evidence":"...","failureClass":"none"}',
  ].join('\n');
}

module.exports = { buildHypothesizePrompt, buildExperimentPrompt, buildLearnPrompt };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/_prompts.ts tests/unit/research/prompts.test.ts
git commit -m "feat(research): agent prompt builders with output contracts"
```

---

## Task 12: Orchestrator loop

**Files:**
- Create: `lib/research/orchestrator.ts`
- Test: `tests/unit/research/orchestrator.test.ts`

The orchestrator accepts injectable `spawn` (returns agent stdout) and `runner`, so the loop is fully testable without a backend. Production defaults build these from config.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/orchestrator.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runResearch } = require('../../../lib/research/orchestrator');
const { readLedger } = require('../../../lib/research/ledger');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-orch-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

// Stub spawn: returns canned agent outputs based on agentType + call counts.
function makeSpawn() {
  let hypoCalls = 0;
  return async (_prompt: string, agentType: string): Promise<string> => {
    if (agentType === 'grd-hypothesizer') {
      hypoCalls++;
      return `__HYPOTHESIS__ {"statement":"hypothesis ${hypoCalls}","rationale":"r","predictedOutcome":"p"}`;
    }
    if (agentType === 'grd-experiment-runner') {
      return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
    }
    if (agentType === 'grd-knowledge-miner') {
      return '__TAKEAWAY__ {"kind":"failure_root_cause","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
    }
    return '';
  };
}

// Stub runner: iteration 1 misses target (refuted), iteration 2 meets it (supported).
function makeRunner() {
  let n = 0;
  return {
    run() {
      n++;
      return {
        metrics: { accuracy: n === 1 ? 0.5 : 0.9 },
        exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none',
      };
    },
  };
}

describe('orchestrator', () => {
  it('closes the loop: refuted h1 → revised h2 → supported → finalize', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Does X help?', {
      maxIterations: 5, noGates: true, spawn: makeSpawn(), runner: makeRunner(),
    });
    expect(res.status).toBe('supported');
    expect(res.iterations).toBe(2);
    const led = readLedger(cwd, res.threadId);
    expect(led.map((h: any) => h.id)).toEqual(['h1', 'h2']);
    expect(led[0].status).toBe('refuted');
    expect(led[1].status).toBe('supported');
    expect(led[1].parentId).toBe('h1');
    expect(fs.existsSync(path.join(cwd, '.planning/research/threads', res.threadId, 'FINDING.md'))).toBe(true);
  });

  it('pauses at the execute gate when gates are on', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Gated question', {
      maxIterations: 2, noGates: false, spawn: makeSpawn(), runner: makeRunner(),
    });
    expect(res.paused).toBe(true);
    expect(res.pendingGate).toBe('execute');
  });

  it('exhausts when never supported', async () => {
    const cwd = tmp();
    const runner = { run: () => ({
      metrics: { accuracy: 0.1 }, exitCode: 0, runner: 'subprocess',
      durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
    const res = await runResearch(cwd, 'Hard question', {
      maxIterations: 2, noGates: true, spawn: makeSpawn(), runner,
    });
    expect(res.status).toBe('exhausted');
    expect(res.iterations).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/orchestrator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/orchestrator.ts
'use strict';
const fs = require('fs');
const path = require('path');
import type {
  ResearchThread, Hypothesis, Verdict, HypothesisStatus, Takeaway,
} from './types';
import type { Runner } from './runner';

const { loadConfig } = require('./../utils') as { loadConfig: (cwd: string) => Record<string, unknown> };
const { incrementCounter } = require('./../metrics') as { incrementCounter: (n: string, d?: number) => void };
const { createScheduler } = require('./../scheduler') as {
  createScheduler: (s: unknown, sp?: unknown) => { spawn: (p: string, o: Record<string, unknown>) => Promise<{ stdout?: string }> } | null;
};
const { createThread, loadThread, saveThread, threadDir } = require('./thread');
const { resolveGates, checkGate } = require('./gates');
const { readLedger, appendHypothesis, updateHypothesisStatus, nextHypothesisId } = require('./ledger');
const { appendTakeaway, readTakeaways } = require('./takeaways');
const { evaluateVerdict, decideBranch, shouldTerminate } = require('./verdict');
const { buildFinding, writeFinding, findingPath } = require('./finding');
const { syncFindingToKg, writeKgProvenance } = require('./kg');
const { buildHypothesizePrompt, buildExperimentPrompt, buildLearnPrompt } = require('./_prompts');
const { parseHypothesisOutput, parsePlanOutput, parseTakeawayOutput } = require('./agent-io');
const { createSubprocessRunner } = require('./runner');

export type SpawnFn = (prompt: string, agentType: string) => Promise<string>;

export interface ResearchOptions {
  maxIterations?: number;
  noGates?: boolean;
  model?: string;
  timeout?: number;
  spawn?: SpawnFn;
  runner?: Runner;
}

export interface ResearchResult {
  threadId: string;
  status: ResearchThread['status'];
  iterations: number;
  verdict?: Verdict;
  findingPath?: string;
  paused?: boolean;
  pendingGate?: 'execute' | 'kg_write';
}

function defaultSpawn(cwd: string, config: Record<string, unknown>, model?: string): SpawnFn {
  const scheduler = createScheduler(
    (config as { scheduler?: unknown }).scheduler,
    (config as { superpowers?: unknown }).superpowers,
  );
  return async (prompt: string, agentType: string): Promise<string> => {
    if (!scheduler) throw new Error('no scheduler available for research loop');
    const r = await scheduler.spawn(prompt, { agentType, model, captureOutput: true, cwd });
    return r.stdout || '';
  };
}

function verdictToStatus(v: Verdict): HypothesisStatus {
  return v === 'supported' ? 'supported' : v === 'refuted' ? 'refuted' : 'inconclusive';
}

function errExit(cwd: string, thread: ResearchThread): ResearchResult {
  thread.status = 'error'; saveThread(cwd, thread);
  return { threadId: thread.id, status: 'error', iterations: thread.iteration };
}

async function runLoop(
  cwd: string, thread: ResearchThread, opts: ResearchOptions,
  config: Record<string, unknown>, approved: { execute: boolean; kg_write: boolean },
): Promise<ResearchResult> {
  const runner: Runner = opts.runner || createSubprocessRunner({ timeoutMs: opts.timeout });
  const spawn: SpawnFn = opts.spawn || defaultSpawn(cwd, config, opts.model);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const priorHyps: Hypothesis[] = readLedger(cwd, thread.id);
    const lastHyp = priorHyps[priorHyps.length - 1] || null;
    const priorVerdict: Verdict | null = lastHyp ? lastHyp.verdict : null;

    // HYPOTHESIZE
    thread.currentStation = 'hypothesize'; saveThread(cwd, thread);
    const hOut = await spawn(buildHypothesizePrompt(thread, priorHyps, priorVerdict), 'grd-hypothesizer');
    const parsed = parseHypothesisOutput(hOut);
    if (!parsed) return errExit(cwd, thread);
    const hyp: Hypothesis = {
      id: nextHypothesisId(priorHyps), iteration: thread.iteration,
      statement: parsed.statement, rationale: parsed.rationale, predictedOutcome: parsed.predictedOutcome,
      status: 'testing', parentId: lastHyp ? lastHyp.id : null, verdict: null,
    };
    appendHypothesis(cwd, thread.id, hyp);

    // DESIGN
    thread.currentStation = 'design'; saveThread(cwd, thread);
    const iterRel = path.join('experiments', String(thread.iteration));
    fs.mkdirSync(path.join(threadDir(cwd, thread.id), iterRel), { recursive: true });
    const pOut = await spawn(buildExperimentPrompt(thread, hyp, iterRel), 'grd-experiment-runner');
    const plan = parsePlanOutput(pOut);
    if (!plan) return errExit(cwd, thread);

    // GATE 1 — execute
    const g1 = checkGate(thread, 'execute', approved.execute);
    approved.execute = false;
    if (!g1.proceed) {
      Object.assign(thread, g1.thread); thread.currentStation = 'run'; saveThread(cwd, thread);
      incrementCounter('research.gate_pauses_total');
      return { threadId: thread.id, status: 'paused', iterations: thread.iteration, paused: true, pendingGate: 'execute' };
    }

    // RUN
    thread.currentStation = 'run'; thread.budgetUsed += 1; saveThread(cwd, thread);
    const result = runner.run(plan as never, threadDir(cwd, thread.id));
    fs.writeFileSync(path.join(threadDir(cwd, thread.id), iterRel, 'result.json'), JSON.stringify(result, null, 2));

    // MEASURE
    thread.currentStation = 'measure'; saveThread(cwd, thread);
    const outcome = evaluateVerdict(plan as never, result);
    updateHypothesisStatus(cwd, thread.id, hyp.id, verdictToStatus(outcome.verdict), outcome.verdict);
    incrementCounter(outcome.verdict === 'supported' ? 'research.hypotheses_supported' : 'research.hypotheses_refuted');

    // LEARN
    thread.currentStation = 'learn'; saveThread(cwd, thread);
    const tOut = await spawn(buildLearnPrompt(thread, hyp, result, outcome.verdict), 'grd-knowledge-miner');
    const tk = parseTakeawayOutput(tOut);
    const takeaway: Takeaway = {
      kind: (tk?.kind as Takeaway['kind']) || 'domain_fact',
      content: tk?.content || outcome.detail,
      confidence: tk?.confidence ?? 0.4,
      evidence: tk?.evidence || outcome.detail,
      failureClass: (tk?.failureClass as Takeaway['failureClass']) || result.failureClass,
      iteration: thread.iteration,
    };
    appendTakeaway(cwd, thread.id, takeaway);

    // DECIDE + terminate
    const term = shouldTerminate(thread, outcome.verdict);
    const branch = decideBranch(outcome.verdict);
    incrementCounter('research.iterations_total');

    if (term.done || branch === 'finalize') {
      // FINALIZE
      thread.currentStation = 'finalize';
      const finding = buildFinding(thread, readLedger(cwd, thread.id), readTakeaways(cwd, thread.id), result);
      writeFinding(cwd, thread.id, finding);

      // GATE 2 — kg_write
      const g2 = checkGate(thread, 'kg_write', approved.kg_write);
      if (!g2.proceed) {
        Object.assign(thread, g2.thread); thread.currentStation = 'persist'; saveThread(cwd, thread);
        incrementCounter('research.gate_pauses_total');
        return { threadId: thread.id, status: 'paused', iterations: thread.iteration, paused: true, pendingGate: 'kg_write' };
      }
      const sync = syncFindingToKg(cwd, thread.id, findingPath(cwd, thread.id));
      writeKgProvenance(cwd, thread.id, { wrote: sync.synced ? [`finding:${thread.id}`] : [] });
      if (sync.synced) incrementCounter('research.kg_writes_total');

      thread.status = term.status; saveThread(cwd, thread);
      return {
        threadId: thread.id, status: term.status, iterations: thread.iteration,
        verdict: outcome.verdict, findingPath: findingPath(cwd, thread.id),
      };
    }

    thread.iteration += 1; thread.status = 'active'; saveThread(cwd, thread);
  }
}

async function runResearch(cwd: string, question: string, opts: ResearchOptions = {}): Promise<ResearchResult> {
  const config = loadConfig(cwd);
  const gates = resolveGates(config, opts.noGates === true);
  const thread = createThread(cwd, question, {
    maxIterations: opts.maxIterations, gates,
    modelProfile: String((config as { model_profile?: string }).model_profile || 'balanced'),
    tokenProfile: String((config as { token_profile?: string }).token_profile || 'balanced'),
  });
  return runLoop(cwd, thread, opts, config, { execute: false, kg_write: false });
}

async function resumeResearch(cwd: string, id: string, opts: ResearchOptions = {}): Promise<ResearchResult> {
  const config = loadConfig(cwd);
  const thread = loadThread(cwd, id);
  const pending = thread.pendingGate;
  thread.pendingGate = null; thread.status = 'active'; saveThread(cwd, thread);
  return runLoop(cwd, thread, opts, config, {
    execute: pending === 'execute', kg_write: pending === 'kg_write',
  });
}

module.exports = { runResearch, resumeResearch, defaultSpawn, verdictToStatus };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/orchestrator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/orchestrator.ts tests/unit/research/orchestrator.test.ts
git commit -m "feat(research): orchestrator loop with injectable spawn/runner"
```

---

## Task 13: CLI command functions

**Files:**
- Create: `lib/research/cli.ts`
- Test: `tests/unit/research/cli.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/cli.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError } = require('../../helpers/setup');
const { cmdResearchStatus } = require('../../../lib/research/cli');
const { createThread } = require('../../../lib/research/thread');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-rcli-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('research cli', () => {
  it('status lists threads as json', () => {
    const cwd = tmp();
    createThread(cwd, 'Question one', {});
    const res = captureOutput(() => cmdResearchStatus(cwd, undefined, false));
    const parsed = JSON.parse(res.stdout);
    expect(parsed.threads.length).toBe(1);
    expect(parsed.threads[0].question).toBe('Question one');
  });

  it('status for a missing thread errors', () => {
    const cwd = tmp();
    const res = captureError(() => cmdResearchStatus(cwd, 'nope', false));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('nope');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/cli.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/cli.ts
'use strict';
const { output, error } = require('./../utils') as {
  output: (r: unknown, raw: boolean, rawVal?: unknown) => never;
  error: (m: string) => never;
};
const { listThreads, loadThread } = require('./thread');
const { runResearch, resumeResearch } = require('./orchestrator');
import type { ResearchOptions } from './orchestrator';

async function cmdResearchStart(cwd: string, question: string, opts: ResearchOptions, raw: boolean): Promise<never> {
  if (!question || !question.trim()) error('research: a question is required, e.g. gd research "Does X improve Y?"');
  const res = await runResearch(cwd, question, opts);
  return output(res, raw, `thread ${res.threadId}: ${res.status} (${res.iterations} iters)\n`);
}

async function cmdResearchResume(cwd: string, id: string, opts: ResearchOptions, raw: boolean): Promise<never> {
  if (!id) error('research resume: a thread id is required');
  try { loadThread(cwd, id); } catch { error(`research resume: thread "${id}" not found`); }
  const res = await resumeResearch(cwd, id, opts);
  return output(res, raw, `thread ${res.threadId}: ${res.status} (${res.iterations} iters)\n`);
}

function cmdResearchStatus(cwd: string, id: string | undefined, raw: boolean): never {
  if (id) {
    let t;
    try { t = loadThread(cwd, id); } catch { return error(`research status: thread "${id}" not found`); }
    return output(t, raw, `${t.id}: ${t.status} iter ${t.iteration}/${t.maxIterations}\n`);
  }
  const threads = listThreads(cwd).map((t: { id: string; question: string; status: string; iteration: number }) =>
    ({ id: t.id, question: t.question, status: t.status, iteration: t.iteration }));
  return output({ threads }, raw, threads.map((t) => `${t.id}\t${t.status}\t${t.question}`).join('\n') + '\n');
}

module.exports = { cmdResearchStart, cmdResearchResume, cmdResearchStatus };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/cli.ts tests/unit/research/cli.test.ts
git commit -m "feat(research): cli command functions (start/resume/status)"
```

---

## Task 14: Barrel + coverage thresholds

**Files:**
- Create: `lib/research/index.ts`
- Modify: `jest.config.js` (add per-file thresholds)
- Test: `tests/unit/research/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/index.test.ts
'use strict';
const research = require('../../../lib/research');

describe('research barrel', () => {
  it('re-exports the public surface', () => {
    for (const name of ['runResearch', 'resumeResearch', 'cmdResearchStart',
      'cmdResearchResume', 'cmdResearchStatus', 'createThread', 'listThreads']) {
      expect(typeof research[name]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/index.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/index.ts
'use strict';
const thread = require('./thread');
const orchestrator = require('./orchestrator');
const cli = require('./cli');

module.exports = {
  createThread: thread.createThread,
  loadThread: thread.loadThread,
  listThreads: thread.listThreads,
  threadId: thread.threadId,
  runResearch: orchestrator.runResearch,
  resumeResearch: orchestrator.resumeResearch,
  cmdResearchStart: cli.cmdResearchStart,
  cmdResearchResume: cli.cmdResearchResume,
  cmdResearchStatus: cli.cmdResearchStatus,
};
```

- [ ] **Step 4: Add coverage thresholds in `jest.config.js`**

In the `coverageThreshold` object, add these entries alongside the existing per-file entries:

```js
    './lib/research/ledger.ts': { lines: 85, functions: 90, branches: 70 },
    './lib/research/verdict.ts': { lines: 90, functions: 100, branches: 85 },
    './lib/research/runner.ts': { lines: 80, functions: 100, branches: 70 },
    './lib/research/gates.ts': { lines: 90, functions: 100, branches: 80 },
    './lib/research/agent-io.ts': { lines: 85, functions: 100, branches: 75 },
```

(Thread/orchestrator/cli are exercised by the integration test; keep them out of strict per-file gates to avoid brittleness — global threshold still applies.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/unit/research/`
Expected: PASS (all research unit tests)

- [ ] **Step 6: Commit**

```bash
git add lib/research/index.ts jest.config.js tests/unit/research/index.test.ts
git commit -m "feat(research): barrel export + coverage thresholds"
```

---

## Task 15: Wire `gd research` routing + tool handler

**Files:**
- Modify: `lib/cli/index.ts` (add `'research'` + `RESEARCH_TOOL_SUBS`)
- Modify: `bin/grd-tools.ts` (add `case 'research':`)
- Test: `tests/integration/research-cli.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/research-cli.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-research-cli-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
const GD = path.join(__dirname, '../../bin/gd.js');

describe('gd research routing', () => {
  it('gd research status --json returns an empty thread list', () => {
    const cwd = tmp();
    const out = cp.execFileSync('node', [GD, 'research', 'status', '--json'], { cwd, encoding: 'utf8' });
    expect(JSON.parse(out).threads).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/integration/research-cli.test.ts`
Expected: FAIL — `research` classified as unknown / no handler

- [ ] **Step 3: Add routing in `lib/cli/index.ts`**

Add the subcommand set near the other `*_TOOL_SUBS` declarations:

```ts
const RESEARCH_TOOL_SUBS = new Set(['resume', 'status']);
```

Add `'research'` to the `TOOL_COMMANDS` Set. In `classifyCommand`, before the generic `TOOL_COMMANDS.has(command)` check, add:

```ts
  if (command === 'research') return 'tool';
```

(`research` is always a tool command: the deterministic orchestrator spawns agents internally, exactly like `gd evolve run`. `RESEARCH_TOOL_SUBS` documents the recognized subcommands; a bare first arg is treated as the question.) Export `RESEARCH_TOOL_SUBS` in the `module.exports` list.

- [ ] **Step 4: Add the handler in `bin/grd-tools.ts`**

Add a `case 'research':` to the main switch. It is `async`; follow the existing async-case pattern used by the `evolve` case (the handler `await`s and writes output itself). Use this body, matching the surrounding switch's variable names for `cwd`, `args`, `raw`:

```ts
    case 'research': {
      const {
        cmdResearchStart, cmdResearchResume, cmdResearchStatus,
      } = require('../lib/research') as {
        cmdResearchStart: (cwd: string, q: string, o: Record<string, unknown>, raw: boolean) => Promise<never>;
        cmdResearchResume: (cwd: string, id: string, o: Record<string, unknown>, raw: boolean) => Promise<never>;
        cmdResearchStatus: (cwd: string, id: string | undefined, raw: boolean) => never;
      };
      const sub = args[0];
      const noGates = args.includes('--no-gates');
      const maxIdx = args.indexOf('--max-iterations');
      const maxIterations = maxIdx !== -1 ? Number(args[maxIdx + 1]) : undefined;
      const opts = { noGates, maxIterations };
      if (sub === 'status') { cmdResearchStatus(cwd, args[1], raw); break; }
      if (sub === 'resume') { await cmdResearchResume(cwd, args[1], opts, raw); break; }
      // bare question = start; join non-flag args (drop the numeric value after --max-iterations)
      const question = args.filter((a, i) =>
        !a.startsWith('--') && !(maxIdx !== -1 && i === maxIdx + 1)).join(' ');
      await cmdResearchStart(cwd, question, opts, raw);
      break;
    }
```

(If the file's switch is not already inside an `async` function, wrap the dispatch as the `case 'evolve':` block does — check how `evolve` is structured and mirror it.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/integration/research-cli.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/cli/index.ts bin/grd-tools.ts tests/integration/research-cli.test.ts
git commit -m "feat(research): wire gd research routing + tool handler"
```

---

## Task 16: Effort profiles for new agents

**Files:**
- Modify: `lib/backend.ts` (`EFFORT_PROFILES`)
- Test: `tests/unit/backend.test.ts` (add a case; if absent, create minimal)

- [ ] **Step 1: Write the failing test**

Add to the existing `tests/unit/backend.test.ts` (or create it). Adjust the import to match how `EFFORT_PROFILES` is exported.

```ts
// tests/unit/backend.test.ts (add this describe block)
'use strict';
const { EFFORT_PROFILES } = require('../../lib/backend');

describe('EFFORT_PROFILES research agents', () => {
  it('defines effort for grd-hypothesizer and grd-experiment-runner across profiles', () => {
    for (const profile of ['quality', 'balanced', 'budget']) {
      expect(EFFORT_PROFILES[profile]['grd-hypothesizer']).toBeDefined();
      expect(EFFORT_PROFILES[profile]['grd-experiment-runner']).toBeDefined();
    }
    expect(EFFORT_PROFILES.quality['grd-hypothesizer']).toBe('high');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/backend.test.ts -t "research agents"`
Expected: FAIL — keys undefined

- [ ] **Step 3: Add the profile entries in `lib/backend.ts`**

In each profile object inside `EFFORT_PROFILES` (`quality`, `balanced`, `budget`), add the two agents following the existing key/value pattern:

```ts
// in the quality profile object:
'grd-hypothesizer': 'high',
'grd-experiment-runner': 'high',
// in the balanced profile object:
'grd-hypothesizer': 'high',
'grd-experiment-runner': 'medium',
// in the budget profile object:
'grd-hypothesizer': 'low',
'grd-experiment-runner': 'low',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/backend.test.ts -t "research agents"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/backend.ts tests/unit/backend.test.ts
git commit -m "feat(research): effort profiles for hypothesizer + experiment-runner"
```

---

## Task 17: Agent & skill definitions

**Files:**
- Create: `agents/grd-hypothesizer.md`
- Create: `agents/grd-experiment-runner.md`
- Modify: `agents/grd-knowledge-miner.md` (add research-takeaway section)
- Create: `commands/research.md`

No unit test (markdown assets). Validation is the integration smoke test (Task 18) + `npm run lint`.

- [ ] **Step 1: Create `agents/grd-hypothesizer.md`**

```markdown
---
name: grd-hypothesizer
description: Generates one ranked, testable hypothesis for a research question, grounded in the Tesserae knowledge graph and local research artifacts. Revises prior hypotheses based on experiment verdicts.
tools: Read, Write, Bash, Grep, Glob, WebSearch
color: cyan
effort: high
maxTurns: 20
---

<role>
You are grd-hypothesizer, the reasoning core of GRD's autoresearch loop. Given a research
question and the history of prior hypotheses + their verdicts, you produce ONE ranked,
testable hypothesis.
</role>

<grounding>
Before proposing, GROUND in existing knowledge:
- Query the Tesserae knowledge graph via its MCP tools: search_nodes, ask, node_context.
- Read .planning/LANDSCAPE.md and .planning/KNOWHOW.md if present.
- Read .planning/DEAD-ENDS.md to avoid re-proposing falsified approaches.
</grounding>

<output_contract>
Emit exactly one final block, nothing after it:
__HYPOTHESIS__
{"statement": "...", "rationale": "...", "predictedOutcome": "..."}
The statement must be falsifiable and testable by a single small experiment.
</output_contract>
```

- [ ] **Step 2: Create `agents/grd-experiment-runner.md`**

```markdown
---
name: grd-experiment-runner
description: Designs one minimal reproducible experiment for a hypothesis and writes a runnable script plus a structured plan. Does not execute the script — the orchestrator runs it behind an execution gate.
tools: Read, Write, Edit, Bash, Grep, Glob
color: orange
effort: medium
maxTurns: 25
---

<role>
You are grd-experiment-runner. Given a hypothesis, design ONE minimal, reproducible
experiment that would support or refute it.
</role>

<rules>
- Write the plan to the experiment iteration directory as PLAN.md.
- Write a runnable script (run.sh for bash, run.py for python) to the same directory.
- The script MUST print its result as a final line: __RESULT__ {"<metricKey>": <number>}
- Do NOT run the script yourself — execution is gated and performed by the orchestrator.
- Choose ONE numeric metricKey, a comparator (>=, <=, >, <, ==), and a target threshold.
</rules>

<output_contract>
Emit exactly one final block (scriptPath relative to the thread dir):
__PLAN__
{"procedure":"...","metricKey":"...","comparator":">=","target":0.0,"language":"shell","scriptPath":"experiments/N/run.sh"}
</output_contract>
```

- [ ] **Step 3: Append a research-takeaway section to `agents/grd-knowledge-miner.md`**

Add this section to the body (do not change the frontmatter):

```markdown
<research_takeaway_mode>
When invoked by the autoresearch loop (the prompt names a hypothesis + verdict + metrics),
extract ONE reusable takeaway that should steer the next hypothesis, and emit exactly one
final block:
__TAKEAWAY__
{"kind":"...","content":"...","confidence":0.0,"evidence":"...","failureClass":"none"}

- kind in {success_pattern, failure_root_cause, constraint, domain_fact, tool_pattern}
- failureClass in {H2 (interface), H3 (environment-contract), H4 (trajectory), none}
A refuted hypothesis or failed run is a signal, not a dead end: explain what to change next.
</research_takeaway_mode>
```

- [ ] **Step 4: Create `commands/research.md`**

````markdown
---
description: Run the autoresearch loop — hypothesis → experiment → measure → learn → revise — on a research question
argument-hint: "\"<question>\" [--max-iterations N] [--no-gates] | resume <id> | status [<id>]"
---

Run GRD's autoresearch loop on a research question:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js research $ARGUMENTS
```

The loop runs a hypothesis-centric scientific cycle to a verdict, persisting a research
thread under `.planning/research/threads/<id>/`:

1. GROUND — read prior findings from the Tesserae KG + local LANDSCAPE/KNOWHOW
2. HYPOTHESIZE — generate one ranked, testable hypothesis
3. DESIGN — write an experiment plan + runnable script
4. RUN — execute the script in a subprocess (behind an execution gate)
5. MEASURE — compare the metric against the plan's target → verdict
6. LEARN — extract a typed takeaway (with H2/H3/H4 failure classification)
7. DECIDE — supported → finalize; refuted/inconclusive → revise hypothesis, loop
8. PERSIST — write FINDING.md and (behind a gate) sync to the shared Tesserae KG

## Subcommands
- `gd research "<question>"` — start a new thread
- `gd research resume <id>` — resume a gate-paused thread
- `gd research status [<id>]` — list threads or show one thread

## Flags
- `--max-iterations N` — cap loop iterations (default 5)
- `--no-gates` — run fully unattended (skip the execute + kg_write gates)
````

- [ ] **Step 5: Lint and commit**

Run: `npm run lint`
Expected: PASS (no errors in new files)

```bash
git add agents/grd-hypothesizer.md agents/grd-experiment-runner.md agents/grd-knowledge-miner.md commands/research.md
git commit -m "feat(research): hypothesizer + experiment-runner agents, research skill"
```

---

## Task 18: End-to-end integration smoke test

**Files:**
- Create: `tests/integration/research-loop.test.ts`

This drives the full loop through `runResearch` with a stubbed `spawn` and a canned `runner`, asserting the spec's success criteria (§13): a REFUTED→revise→SUPPORTED path, FINDING.md, gates, and metrics side effects.

- [ ] **Step 1: Write the test**

```ts
// tests/integration/research-loop.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runResearch, resumeResearch } = require('../../lib/research/orchestrator');
const { readLedger } = require('../../lib/research/ledger');
const { getCounters, resetCounters } = require('../../lib/metrics');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-research-e2e-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
function makeSpawn() {
  let hypo = 0;
  return async (_p: string, agentType: string) => {
    if (agentType === 'grd-hypothesizer') { hypo++; return `__HYPOTHESIS__ {"statement":"H${hypo}","rationale":"r","predictedOutcome":"p"}`; }
    if (agentType === 'grd-experiment-runner') return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
    if (agentType === 'grd-knowledge-miner') return '__TAKEAWAY__ {"kind":"failure_root_cause","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
    return '';
  };
}
function makeRunner() {
  let n = 0;
  return { run: () => { n++; return { metrics: { accuracy: n === 1 ? 0.5 : 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }; } };
}

describe('autoresearch loop (e2e, stubbed agents)', () => {
  beforeEach(() => resetCounters());

  it('closes refuted→revise→supported and emits FINDING.md (no gates)', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Does X help Y?', { maxIterations: 5, noGates: true, spawn: makeSpawn(), runner: makeRunner() });
    expect(res.status).toBe('supported');
    expect(res.iterations).toBe(2);
    const led = readLedger(cwd, res.threadId);
    expect(led[0].status).toBe('refuted');
    expect(led[1].status).toBe('supported');
    expect(fs.existsSync(res.findingPath)).toBe(true);
    const counters = getCounters();
    expect(counters['research.iterations_total']).toBe(2);
    expect(counters['research.hypotheses_supported']).toBe(1);
  });

  it('pauses at execute gate, then resumes to completion', async () => {
    const cwd = tmp();
    const spawn = makeSpawn();
    const runner = makeRunner();
    const first = await runResearch(cwd, 'Gated Q', { maxIterations: 5, noGates: false, spawn, runner });
    expect(first.paused).toBe(true);
    expect(first.pendingGate).toBe('execute');
    // Resume repeatedly until no longer paused (each resume approves the pending gate once).
    let res = await resumeResearch(cwd, first.threadId, { spawn, runner, noGates: false });
    let guard = 0;
    while (res.paused && guard++ < 10) res = await resumeResearch(cwd, first.threadId, { spawn, runner, noGates: false });
    expect(['supported', 'exhausted']).toContain(res.status);
  });

  it('degrades cleanly when Tesserae is unavailable (no tesserae binary on PATH)', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Degrade Q', { maxIterations: 3, noGates: true, spawn: makeSpawn(), runner: makeRunner() });
    expect(res.status).toBe('supported');
    const kg = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/research/threads', res.threadId, 'kg.json'), 'utf8'));
    expect(Array.isArray(kg.wrote)).toBe(true); // present regardless of sync success
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx jest tests/integration/research-loop.test.ts`
Expected: PASS (all three cases)

- [ ] **Step 3: Run the full research suite + lint + type-check**

Run: `npx jest research && npm run lint && npm run build:check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration/research-loop.test.ts
git commit -m "test(research): end-to-end loop smoke test (refuted→supported, gates, degrade)"
```

---

## Final verification

- [ ] **Run the whole test suite**

Run: `npm test`
Expected: PASS, with coverage thresholds met for `lib/research/*` files.

- [ ] **Manual smoke (optional)**

```bash
gd research "Does adding a 5-line cache reduce parse time below 50ms?" --max-iterations 2 --no-gates
gd research status
```

Expected: a thread directory under `.planning/research/threads/`, a `FINDING.md`, and
`gd metrics` showing `research.iterations_total`.

---

## Spec coverage map (self-review)

| Spec section | Task(s) |
|---|---|
| §3 loop shape | Task 12 (orchestrator) |
| §4 artifact layout (thread.json/THREAD.md, HYPOTHESES, experiments, TAKEAWAYS, FINDING, kg.json) | Tasks 2, 3, 6, 8, 9, 12 |
| §5 agents (hypothesizer, experiment-runner, knowledge-miner reuse) | Tasks 11, 12, 16, 17 |
| §6 orchestration `lib/research/` layout + CLI | Tasks 1–14 |
| §7 Tesserae read-by-agent / write-by-compile + degrade | Tasks 11 (prompt KG read), 9 + 12 (write/degrade) |
| §8 two gates | Tasks 7, 12 |
| §9 infra reuse (scheduler, metrics, KNOWHOW/DEAD-ENDS) | Task 12 (scheduler via defaultSpawn; metrics counters) |
| §10 error handling (run-failure→H2/H3/H4, malformed output, exhaustion, gate pause) | Tasks 5, 10, 12 |
| §11 testing (unit per module + integration) | Tasks 1–18 |
| §13 success criteria | Task 18 |

**Deferred per plan-level decisions:** grd-eval-reporter MEASURE integration; YAML-frontmatter thread state; budget-pressure pause guard (scheduler exposes `computeBudgetPressureLevel` — add as a pre-spawn guard in a later cycle); plateau-driven auto-re-survey; writing takeaways through to the shared `KNOWHOW.md`/`DEAD-ENDS.md` mirror (currently thread-local `TAKEAWAYS.md`; wire `appendKnowhowEntries`/`cmdDeadEndAdd` in a follow-up). None block the thin slice's success criteria.
