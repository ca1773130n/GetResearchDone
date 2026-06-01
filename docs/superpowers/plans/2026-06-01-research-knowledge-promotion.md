# Research Knowledge Promotion Implementation Plan (Slice A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At a research thread's PERSIST step, promote its takeaways into the shared project KNOWHOW.md and falsified hypotheses into .planning/DEAD-ENDS.md, default-on with a config off-switch, idempotent and degrade-safe.

**Architecture:** A new `lib/research/promote.ts` maps `Takeaway[]`→`KnowhowEntry[]` (via existing `appendKnowhowEntries`) and refuted `Hypothesis[]`→dead-end registrations (via a programmatic `addDeadEnd` extracted from `lib/dead-ends.ts`'s `cmdDeadEndAdd`). `promoteThreadKnowledge` is called inside `finishKgSync` — the single chokepoint both the `runLoop` finalize path and the `resumeResearch` `kg_write`-resume path share — so promotion fires after the `kg_write` gate in both. Gated by `research_persist_knowledge` (default true), fully try/catch-wrapped so it never breaks the loop.

**Tech Stack:** TypeScript (strict, CommonJS), Jest + ts-jest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-01-research-knowledge-promotion-design.md`

---

## Conventions for every task

- `'use strict';` first line; CommonJS; zero `any`; typed requires; unused args `_`-prefixed.
- Single file: `npx jest tests/unit/research/promote.test.ts`. By name: `npx jest -t "<substring>"`.
- Commit after each task. Footer on every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- **Modify `lib/dead-ends.ts`** — extract programmatic `addDeadEnd(cwd, opts)` core from `cmdDeadEndAdd` (CLI wrapper now calls it). Export it.
- **Create `lib/research/promote.ts`** — `shouldPersistKnowledge`, `takeawayToKnowhow`, `selectKnowhowTakeaways`, `buildDeadEndCalls`, `promoteThreadKnowledge`.
- **Create `tests/unit/research/promote.test.ts`**.
- **Modify `lib/research/orchestrator.ts`** — call `promoteThreadKnowledge` inside `finishKgSync`.
- **Modify `lib/utils.ts`** — register `research_persist_knowledge` in `KNOWN_CONFIG_KEYS`.
- **Modify `CLAUDE.md`** — Autoresearch subsection.

---

### Task 1: Extract programmatic `addDeadEnd` from `lib/dead-ends.ts`

**Files:**
- Modify: `lib/dead-ends.ts` (`cmdDeadEndAdd` ~line 375; `module.exports`)
- Test: `tests/unit/dead-ends.test.ts` (add cases)

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/dead-ends.test.ts` (top requires already present; if `addDeadEnd` isn't destructured from the module, add it):

```ts
describe('addDeadEnd (programmatic core)', () => {
  const { addDeadEnd, parseDeadEndsFile } = require('../../lib/dead-ends');
  const fs = require('fs'); const os = require('os'); const path = require('path');
  function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-de-')); fs.mkdirSync(path.join(d, '.planning'), { recursive: true }); return d; }

  it('creates a new entry and returns action:created', () => {
    const cwd = tmp();
    const res = addDeadEnd(cwd, { approach: 'Use Elo tournament for plan selection', phase: 'research:t1#iter0', verdict: 'falsified', evidence: ['predicted: better selector'] });
    expect(res.action).toBe('created');
    expect(res.slug).toBeTruthy();
    const entries = parseDeadEndsFile(fs.readFileSync(path.join(cwd, '.planning/DEAD-ENDS.md'), 'utf8'));
    expect(entries.length).toBe(1);
    expect(entries[0].approach).toBe('Use Elo tournament for plan selection');
    expect(entries[0].tried_in_phases).toContain('research:t1#iter0');
  });

  it('merges a same-approach re-add (action:updated, no duplicate slug)', () => {
    const cwd = tmp();
    addDeadEnd(cwd, { approach: 'Use Elo tournament for plan selection', phase: 'research:t1#iter0' });
    const res = addDeadEnd(cwd, { approach: 'Use Elo tournament for plan selection', phase: 'research:t2#iter1', evidence: ['more'] });
    expect(res.action).toBe('updated');
    const content = fs.readFileSync(path.join(cwd, '.planning/DEAD-ENDS.md'), 'utf8');
    const slugCount = (content.match(/^## /gm) || []).length;
    expect(slugCount).toBe(1);
    const entries = parseDeadEndsFile(content);
    expect(entries[0].tried_in_phases).toEqual(expect.arrayContaining(['research:t1#iter0', 'research:t2#iter1']));
  });

  it('throws (does not exit) on a blank approach', () => {
    expect(() => addDeadEnd(tmp(), { approach: '', phase: 'p' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/dead-ends.test.ts -t "addDeadEnd"`
Expected: FAIL — `addDeadEnd is not a function`.

- [ ] **Step 3: Extract the core**

In `lib/dead-ends.ts`, replace the body of `cmdDeadEndAdd` with a wrapper, and add `addDeadEnd` immediately before it:

```ts
/**
 * Programmatic add/update of a `.planning/DEAD-ENDS.md` entry. Throws on invalid
 * input (callers that are CLIs translate to `error()`); returns the upsert action.
 */
function addDeadEnd(
  cwd: string, opts: DeadEndAddOpts,
): { action: 'created' | 'updated'; slug: string; total: number } {
  if (!opts.approach) throw new Error('--approach required');
  if (!opts.phase) throw new Error('--phase required');
  const slug: string | null = generateSlugInternal(opts.approach);
  if (!slug) throw new Error('Could not generate slug from approach');

  const planningDir = path.join(cwd, '.planning');
  const filePath = path.join(planningDir, 'DEAD-ENDS.md');
  let existing: DeadEndEntry[] = [];
  if (fs.existsSync(filePath)) {
    existing = parseDeadEndsFile(fs.readFileSync(filePath, 'utf-8'));
  }
  const { action } = _upsertEntry(existing, opts, slug);
  fs.mkdirSync(planningDir, { recursive: true });
  atomicWriteFileSync(filePath, serializeDeadEndsFile(existing));
  return { action, slug, total: existing.length };
}

function cmdDeadEndAdd(cwd: string, opts: DeadEndAddOpts, raw: boolean): void {
  let res: { action: 'created' | 'updated'; slug: string; total: number };
  try {
    res = addDeadEnd(cwd, opts);
  } catch (e: unknown) {
    error(e instanceof Error ? e.message : String(e));
    return;
  }
  output(
    { action: res.action, slug: res.slug, total_entries: res.total, path: path.relative(cwd, path.join(cwd, '.planning', 'DEAD-ENDS.md')) },
    raw,
    `${res.action}: ${res.slug}`,
  );
}
```

Add `addDeadEnd` to `module.exports`:

```ts
module.exports = {
  parseDeadEndsFile,
  serializeDeadEndsFile,
  parseReflectionSection,
  addDeadEnd,
  cmdDeadEndAdd,
  cmdDeadEndPromoteFromPhase,
};
```

- [ ] **Step 4: Run tests to verify pass (new + no regression)**

Run: `npx jest tests/unit/dead-ends.test.ts`
Expected: PASS — the 3 new cases plus all 27 pre-existing `cmdDeadEndAdd`/promote tests stay green.

- [ ] **Step 5: Commit**

```bash
git add lib/dead-ends.ts tests/unit/dead-ends.test.ts
git commit -m "refactor(dead-ends): extract programmatic addDeadEnd from cmdDeadEndAdd (slice A task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `promote.ts` — config gate + KNOWHOW mapping

**Files:**
- Create: `lib/research/promote.ts`
- Test: `tests/unit/research/promote.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/research/promote.test.ts`:

```ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const promote = require('../../../lib/research/promote');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-promote-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
const tk = (over = {}) => ({
  kind: 'success_pattern', content: 'Batching cuts latency 3x', confidence: 0.8,
  evidence: 'iter 2 metric', failureClass: 'none', iteration: 2, ...over,
});

describe('shouldPersistKnowledge', () => {
  it('defaults true with no config', () => {
    expect(promote.shouldPersistKnowledge(tmp())).toBe(true);
  });
  it('is false only when explicitly disabled', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: false }));
    expect(promote.shouldPersistKnowledge(d)).toBe(false);
    const e = tmp();
    fs.writeFileSync(path.join(e, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: true }));
    expect(promote.shouldPersistKnowledge(e)).toBe(true);
  });
});

describe('takeawayToKnowhow', () => {
  it('maps fields with provenance and research sentinel', () => {
    const k = promote.takeawayToKnowhow(tk(), 't1', '2026-06-01T00:00:00.000Z');
    expect(k.pattern_name).toBe('Batching cuts latency 3x');
    expect(k.source).toBe('research:t1#iter2');
    expect(k.applicability).toContain('success_pattern');
    expect(k.code_snippet).toBe('');
    expect(k.phase_number).toBe(0);
    expect(k.created_at).toBe('2026-06-01T00:00:00.000Z');
  });
  it('collapses whitespace and caps pattern_name at 200 chars', () => {
    const k = promote.takeawayToKnowhow(tk({ content: 'a\n  b   c' + ' x'.repeat(200) }), 't1', 'iso');
    expect(k.pattern_name.length).toBeLessThanOrEqual(200);
    expect(k.pattern_name).not.toMatch(/\s\s|\n/);
  });
});

describe('selectKnowhowTakeaways', () => {
  it('keeps positive kinds >= 0.5, drops failures and low-confidence fallback', () => {
    const out = promote.selectKnowhowTakeaways([
      tk({ kind: 'success_pattern', confidence: 0.8 }),
      tk({ kind: 'constraint', confidence: 0.5 }),
      tk({ kind: 'failure_root_cause', confidence: 0.9 }),   // dropped (failure)
      tk({ kind: 'domain_fact', confidence: 0.4 }),           // dropped (fallback noise)
    ]);
    expect(out.map((t) => t.kind)).toEqual(['success_pattern', 'constraint']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/promote.test.ts`
Expected: FAIL — `Cannot find module '../../../lib/research/promote'`.

- [ ] **Step 3: Create the module**

Create `lib/research/promote.ts`:

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Takeaway, KnowhowEntry } from '../types';

const KNOWHOW_KINDS = new Set(['success_pattern', 'constraint', 'domain_fact', 'tool_pattern']);

function shouldPersistKnowledge(cwd: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_persist_knowledge?: unknown;
    };
    return raw.research_persist_knowledge !== false; // default ON
  } catch {
    return true;
  }
}

function takeawayToKnowhow(t: Takeaway, threadId: string, iso: string): KnowhowEntry {
  return {
    pattern_name: t.content.trim().replace(/\s+/g, ' ').slice(0, 200),
    source: `research:${threadId}#iter${t.iteration}`,
    applicability: t.evidence ? `${t.kind} — ${t.evidence}` : t.kind,
    code_snippet: '',
    phase_number: 0,
    created_at: iso,
  };
}

function selectKnowhowTakeaways(takeaways: Takeaway[]): Takeaway[] {
  return takeaways.filter((t) => KNOWHOW_KINDS.has(t.kind) && t.confidence >= 0.5);
}

module.exports = { shouldPersistKnowledge, takeawayToKnowhow, selectKnowhowTakeaways };
```

NOTE: `Takeaway` lives in `lib/research/types.ts` and `KnowhowEntry` in `lib/types.ts`. From `lib/research/promote.ts`, `KnowhowEntry` is re-exportable through `../types` only if `lib/research/types.ts` re-exports it. It does NOT — so import `Takeaway` from `./types` and `KnowhowEntry` from `../../lib/types`? Use the correct relative paths: `import type { Takeaway } from './types';` and `import type { KnowhowEntry } from '../types';`. Verify in Step 4 via `build:check`; if `../types` (which is `lib/types.ts`) lacks `KnowhowEntry`, it does export it (confirmed in spec background). Keep `import type { Takeaway } from './types';` and `import type { KnowhowEntry } from '../types';` as two separate import lines.

Replace the single import line with:

```ts
import type { Takeaway } from './types';
import type { KnowhowEntry } from '../types';
```

- [ ] **Step 4: Run test + type-check**

Run: `npx jest tests/unit/research/promote.test.ts`
Expected: PASS

Run: `npm run build:check`
Expected: no type errors (confirms the two `import type` paths resolve).

- [ ] **Step 5: Commit**

```bash
git add lib/research/promote.ts tests/unit/research/promote.test.ts
git commit -m "feat(research): promote.ts config gate + KNOWHOW mapping (slice A task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `promote.ts` — `buildDeadEndCalls`

**Files:**
- Modify: `lib/research/promote.ts`
- Test: `tests/unit/research/promote.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('buildDeadEndCalls', () => {
  const hyp = (over = {}) => ({
    id: 'h1', iteration: 1, statement: 'GPU batching beats CPU', rationale: 'r',
    predictedOutcome: 'throughput up 2x', status: 'refuted', parentId: null, verdict: 'refuted', ...over,
  });
  it('emits one DeadEndAddOpts per refuted hypothesis with ledger predictedOutcome', () => {
    const calls = promote.buildDeadEndCalls(
      { id: 't1' },
      [hyp({ iteration: 1 }), hyp({ iteration: 2, verdict: 'supported', status: 'supported' })],
      [{ kind: 'failure_root_cause', content: 'OOM at batch 512', confidence: 0.7, evidence: 'e', failureClass: 'H4', iteration: 1 }],
    );
    expect(calls.length).toBe(1);
    expect(calls[0].approach).toBe('GPU batching beats CPU');
    expect(calls[0].phase).toBe('research:t1#iter1');
    expect(calls[0].verdict).toBe('falsified');
    expect(calls[0].evidence).toEqual(['predicted: throughput up 2x', 'OOM at batch 512']);
  });
  it('falls back to verdict: refuted when no matching failure takeaway', () => {
    const calls = promote.buildDeadEndCalls({ id: 't1' }, [hyp({ iteration: 3 })], []);
    expect(calls[0].evidence).toEqual(['predicted: throughput up 2x', 'verdict: refuted']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/promote.test.ts -t "buildDeadEndCalls"`
Expected: FAIL — `promote.buildDeadEndCalls is not a function`.

- [ ] **Step 3: Implement**

Add to `lib/research/promote.ts` (above `module.exports`), and extend imports + exports:

```ts
import type { Hypothesis } from './types';
import type { DeadEndAddOpts } from '../dead-ends';

function buildDeadEndCalls(
  thread: { id: string }, ledger: Hypothesis[], takeaways: Takeaway[],
): DeadEndAddOpts[] {
  return ledger
    .filter((h) => h.verdict === 'refuted')
    .map((h) => {
      const why = takeaways.find(
        (t) => t.iteration === h.iteration && t.kind === 'failure_root_cause',
      );
      return {
        approach: h.statement,
        phase: `research:${thread.id}#iter${h.iteration}`,
        verdict: 'falsified',
        evidence: [`predicted: ${h.predictedOutcome}`, why ? why.content : 'verdict: refuted'],
      };
    });
}
```

Update `module.exports` to add `buildDeadEndCalls`.

- [ ] **Step 4: Run test + type-check**

Run: `npx jest tests/unit/research/promote.test.ts -t "buildDeadEndCalls"`
Expected: PASS

Run: `npm run build:check`
Expected: no type errors (confirms `DeadEndAddOpts` import from `../dead-ends`).

- [ ] **Step 5: Commit**

```bash
git add lib/research/promote.ts tests/unit/research/promote.test.ts
git commit -m "feat(research): buildDeadEndCalls from refuted hypotheses (slice A task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `promote.ts` — `promoteThreadKnowledge` orchestration

**Files:**
- Modify: `lib/research/promote.ts`
- Test: `tests/unit/research/promote.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('promoteThreadKnowledge', () => {
  const { parseKnowhowEntries } = require('../../../lib/knowledge');
  const { parseDeadEndsFile } = require('../../../lib/dead-ends');
  const thread = { id: 't1' };
  const takeaways = [
    { kind: 'success_pattern', content: 'Batching helps', confidence: 0.8, evidence: 'e', failureClass: 'none', iteration: 1 },
    { kind: 'failure_root_cause', content: 'OOM at 512', confidence: 0.7, evidence: 'e', failureClass: 'H4', iteration: 2 },
  ];
  const ledger = [{ id: 'h2', iteration: 2, statement: 'Bigger batch is better', rationale: 'r', predictedOutcome: 'up', status: 'refuted', parentId: null, verdict: 'refuted' }];

  it('skips when the gate is disabled', () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: false }));
    const res = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso' });
    expect(res.skipped).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(false);
    expect(fs.existsSync(path.join(cwd, '.planning/DEAD-ENDS.md'))).toBe(false);
  });

  it('writes both files with accurate counts, idempotent on re-run', () => {
    const cwd = tmp();
    const r1 = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso' });
    expect(r1).toEqual({ knowhowAdded: 1, deadEndsAdded: 1, skipped: false });
    expect(parseKnowhowEntries(fs.readFileSync(path.join(cwd, 'KNOWHOW.md'), 'utf8')).length).toBe(1);
    expect(parseDeadEndsFile(fs.readFileSync(path.join(cwd, '.planning/DEAD-ENDS.md'), 'utf8')).length).toBe(1);
    const r2 = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso' });
    expect(r2.knowhowAdded).toBe(0);
    expect(r2.deadEndsAdded).toBe(0);
    expect(parseKnowhowEntries(fs.readFileSync(path.join(cwd, 'KNOWHOW.md'), 'utf8')).length).toBe(1);
  });

  it('swallows a thrown dependency and returns zeros (never breaks the loop)', () => {
    const cwd = tmp();
    const deps = { addDeadEnd: () => { throw new Error('boom'); } };
    const res = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso', deps });
    expect(res).toEqual({ knowhowAdded: 0, deadEndsAdded: 0, skipped: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/promote.test.ts -t "promoteThreadKnowledge"`
Expected: FAIL — `promote.promoteThreadKnowledge is not a function`.

- [ ] **Step 3: Implement**

Add to `lib/research/promote.ts` (extend imports + exports):

```ts
const { appendKnowhowEntries, parseKnowhowEntries } = require('../knowledge') as {
  appendKnowhowEntries: (knowhowPath: string, entries: KnowhowEntry[]) => void;
  parseKnowhowEntries: (content: string) => KnowhowEntry[];
};
const { addDeadEnd } = require('../dead-ends') as {
  addDeadEnd: (cwd: string, opts: DeadEndAddOpts) => { action: 'created' | 'updated'; slug: string; total: number };
};

interface PromoteDeps {
  appendKnowhowEntries?: (knowhowPath: string, entries: KnowhowEntry[]) => void;
  addDeadEnd?: (cwd: string, opts: DeadEndAddOpts) => { action: 'created' | 'updated'; slug: string; total: number };
}

function promoteThreadKnowledge(
  cwd: string, thread: { id: string }, takeaways: Takeaway[], ledger: Hypothesis[],
  opts: { iso: string; deps?: PromoteDeps },
): { knowhowAdded: number; deadEndsAdded: number; skipped: boolean } {
  if (!shouldPersistKnowledge(cwd)) return { knowhowAdded: 0, deadEndsAdded: 0, skipped: true };
  const appendKh = opts.deps?.appendKnowhowEntries || appendKnowhowEntries;
  const addDe = opts.deps?.addDeadEnd || addDeadEnd;
  try {
    const knowhowPath = path.join(cwd, 'KNOWHOW.md');
    const before = fs.existsSync(knowhowPath) ? parseKnowhowEntries(fs.readFileSync(knowhowPath, 'utf8')).length : 0;
    const entries = selectKnowhowTakeaways(takeaways).map((t) => takeawayToKnowhow(t, thread.id, opts.iso));
    appendKh(knowhowPath, entries);
    const after = fs.existsSync(knowhowPath) ? parseKnowhowEntries(fs.readFileSync(knowhowPath, 'utf8')).length : 0;

    let deadEndsAdded = 0;
    for (const call of buildDeadEndCalls(thread, ledger, takeaways)) {
      if (addDe(cwd, call).action === 'created') deadEndsAdded += 1;
    }
    return { knowhowAdded: after - before, deadEndsAdded, skipped: false };
  } catch (e: unknown) {
    process.stderr.write(`[research] knowledge promotion failed (degraded): ${e instanceof Error ? e.message : String(e)}\n`);
    return { knowhowAdded: 0, deadEndsAdded: 0, skipped: false };
  }
}
```

Update `module.exports` to its final form:

```ts
module.exports = {
  shouldPersistKnowledge, takeawayToKnowhow, selectKnowhowTakeaways,
  buildDeadEndCalls, promoteThreadKnowledge,
};
```

- [ ] **Step 4: Run test + type-check + full promote suite**

Run: `npx jest tests/unit/research/promote.test.ts`
Expected: PASS (all describes)

Run: `npm run build:check`
Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/research/promote.ts tests/unit/research/promote.test.ts
git commit -m "feat(research): promoteThreadKnowledge orchestration, gated + degrade-safe (slice A task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire into `finishKgSync` + register config key

**Files:**
- Modify: `lib/research/orchestrator.ts` (`finishKgSync` body; requires)
- Modify: `lib/utils.ts` (`KNOWN_CONFIG_KEYS`)
- Test: `tests/unit/research/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/research/orchestrator.test.ts`, add a test that drives a full thread to FINALIZE (reuse the file's existing harness for building a thread with an injected `spawn`/`runner` that yields a refuted then terminal outcome — follow the existing "pauses at kg_write gate then resumes" test as the template). The new test asserts post-finalize:

```ts
it('promotes takeaways to KNOWHOW.md and DEAD-ENDS.md at finalize', async () => {
  // ... arrange a thread that finalizes (no gates) using the existing harness ...
  // after runResearch(...) with opts.noGates resolves to a terminal status:
  expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(true);
  // a refuted hypothesis in the ledger produced a dead-end:
  expect(fs.existsSync(path.join(cwd, '.planning/DEAD-ENDS.md'))).toBe(true);
});

it('still promotes when finalizing via the kg_write-resume path', async () => {
  // ... arrange a thread with gates on; run → pauses at kg_write ...
  // then resumeResearch(cwd, id) to approve → finishKgSync runs:
  expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(true);
});

it('does not promote when research_persist_knowledge is false', async () => {
  // ... config.json { research_persist_knowledge: false }, finalize a thread ...
  expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(false);
});
```

Use the EXISTING test file's setup helpers and injected spawn/runner stubs verbatim (do not invent new infra — copy the closest existing finalize/resume test's arrange block and add the assertions). Ensure at least one ledger hypothesis ends `verdict: 'refuted'` so DEAD-ENDS is exercised; a `grd-knowledge-miner` spawn stub should return a `success_pattern` takeaway (confidence ≥ 0.5) so KNOWHOW is non-empty.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t "promotes takeaways"`
Expected: FAIL — KNOWHOW.md/DEAD-ENDS.md not created (promotion not wired yet).

- [ ] **Step 3: Register the config key**

In `lib/utils.ts`, inside `KNOWN_CONFIG_KEYS`, after `'research_sandbox_network',` add:

```ts
  'research_persist_knowledge',
```

- [ ] **Step 4: Wire the require + call into `finishKgSync`**

In `lib/research/orchestrator.ts`, add near the other research requires (e.g. after the `require('./docker-runner')` line):

```ts
const { promoteThreadKnowledge } = require('./promote') as {
  promoteThreadKnowledge: (
    cwd: string, thread: ResearchThread, takeaways: Takeaway[], ledger: Hypothesis[],
    opts: { iso: string },
  ) => { knowhowAdded: number; deadEndsAdded: number; skipped: boolean };
};
```

Then in `finishKgSync`, insert the promotion call after the `incrementCounter('research.kg_writes_total')` line and before `thread.status = status;`:

```ts
  promoteThreadKnowledge(cwd, thread,
    readTakeaways(cwd, thread.id), readLedger(cwd, thread.id),
    { iso: new Date().toISOString() });
```

(`readTakeaways`, `readLedger`, `Takeaway`, `Hypothesis`, `ResearchThread` are already imported in this file.)

- [ ] **Step 5: Run the new tests + full orchestrator suite + type-check + lint**

Run: `npx jest tests/unit/research/orchestrator.test.ts`
Expected: PASS — new tests green; all pre-existing orchestrator tests stay green.

Run: `npm run build:check` → no type errors.
Run: `npm run lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add lib/research/orchestrator.ts lib/utils.ts tests/unit/research/orchestrator.test.ts
git commit -m "feat(research): promote knowledge in finishKgSync + register config key (slice A task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Docs + full verification

**Files:**
- Modify: `CLAUDE.md` (Autoresearch Loop section)

- [ ] **Step 1: Add the docs subsection**

In `CLAUDE.md`, find `### Docker experiment sandbox (RUN station)` and insert this subsection immediately **before** it:

```markdown
### Knowledge promotion (LEARN → shared KB)

At PERSIST (inside `finishKgSync`, after the `kg_write` gate — so both the
`runLoop` finalize path and the `resumeResearch` kg_write-resume path are
covered), a terminal thread's takeaways are promoted into the shared project
knowledge base via `lib/research/promote.ts`: positive takeaways (kinds
success_pattern/constraint/domain_fact/tool_pattern, confidence ≥ 0.5) →
`KNOWHOW.md` (`appendKnowhowEntries`, dedup by pattern_name); refuted ledger
hypotheses → `.planning/DEAD-ENDS.md` via the existing `lib/dead-ends.ts`
`addDeadEnd` (approach-schema, slug-merge, the file the hypothesizer reads to
avoid re-proposing dead approaches). Provenance is tagged
`source: research:<id>#iterN` / `tried_in_phases: research:<id>#iterN`.
Default-on; disable with `research_persist_knowledge: false`. Fully
degrade-safe — any failure logs and returns zeros, never breaking the loop.
```

- [ ] **Step 2: Full research suite + type-check + lint**

Run: `npx jest tests/unit/research/ tests/unit/dead-ends.test.ts tests/unit/knowledge.test.ts`
Expected: PASS.

Run: `npm run build:check` → no type errors.
Run: `npm run lint` → clean.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(research): document knowledge promotion (slice A task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Finish the branch**

Use the **superpowers:finishing-a-development-branch** skill (verify full `npm test`, then merge locally `--no-ff` per the established slice workflow).

---

## Self-Review

**1. Spec coverage:**
- Promotion inside `finishKgSync` (covers resume) → Task 5. ✓
- Reuse `lib/dead-ends.ts` `addDeadEnd` (extracted) → Task 1, used in Tasks 3-4. ✓
- KNOWHOW mapping + 0.5 floor + provenance → Task 2. ✓
- DEAD-ENDS from refuted hypotheses, predictedOutcome from ledger → Task 3. ✓
- Gate (default-on) + accurate before/after count + degrade-safety → Task 4. ✓
- Config key registered → Task 5. ✓
- Resume-path regression test (Codex P1a/P3) → Task 5. ✓
- Docs → Task 6. ✓

**2. Placeholder scan:** Task 5's test references "the existing harness" rather than pasting code — this is deliberate (the orchestrator test file's setup is large and must be matched verbatim, not reinvented); the assertions and arrange-constraints are fully specified. All other code steps are complete.

**3. Type consistency:** `addDeadEnd(cwd, opts): {action,slug,total}`, `DeadEndAddOpts`, `Takeaway`, `KnowhowEntry`, `Hypothesis`, and `promoteThreadKnowledge`'s signature are identical across Tasks 1–5. `appendKnowhowEntries`/`parseKnowhowEntries` match `lib/knowledge.ts`. Imports: `Takeaway`/`Hypothesis` from `./types`, `KnowhowEntry` from `../types`, `DeadEndAddOpts` from `../dead-ends`. ✓
