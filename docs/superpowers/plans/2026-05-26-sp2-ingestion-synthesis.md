# SP2-B Ingestion + Layered Synthesis — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `gd ingest <local markdown>` and `gd synthesize "<topic>"` that compile a corpus + LLM domain synthesis into a Tesserae knowledge graph (via a `TesseraeClient` adapter), so `gd research` grounds on richer knowledge — proving write-by-compile creates retrievable knowledge end-to-end.

**Architecture:** A `TesseraeClient` (async, injectable) wraps the real `tesserae` extractor CLI (`tesserae <paths> -o graph.json --sqlite-output db --changed-only --canonicalize`). `gd ingest` content-hashes local markdown into a corpus dir and compiles it; `gd synthesize` spawns `grd-synthesizer` (KG query → a `__SYNTHESIS__` doc), persists it, and compiles it. Both write manifests, run a deterministic graph.json smoke check, and report explicit statuses. SP1's broken `kg.ts` `--root` shell-out is refactored onto the same client.

**Tech Stack:** TypeScript (strict, CommonJS, `'use strict'`), Jest + ts-jest, `execFileSync` (shell-free), the `tesserae` CLI (graceful-optional), GRD `lib/scheduler` + `lib/frontmatter` + `lib/utils`.

**Spec:** `docs/superpowers/specs/2026-05-26-sp2-ingestion-synthesis-design.md`

---

## §6 prerequisite RESOLVED (the real Tesserae invocation)

`tesserae --help` confirms the CLI is a **direct extractor**, not `register/refresh`:
```
tesserae <markdown paths…> [-o graph.json] [--sqlite-output db] [--changed-only] [--canonicalize] [--extractor …]
```
- **Compile** = `tesserae <corpusDir> -o <cwd>/.tesserae/graph.json --sqlite-output <cwd>/.tesserae/sqlite.db --changed-only --canonicalize`. Writes the typed graph to JSON (for us) + SQLite (for the MCP).
- **Smoke check** = read `<cwd>/.tesserae/graph.json` and look for nodes whose `name`/`source_path` matches the ingested file / topic. Deterministic, no MCP, no new deps.
- **MCP serving** (so `gd research`'s hypothesizer can query the compiled graph) requires the GRD project to be the tesserae MCP's active/registered project — verified by the gated integration test + manual `gd research` run, not by unit tests.

## File structure

| File | Responsibility |
|---|---|
| `lib/research/tesserae.ts` | `TesseraeClient` types + interface; `createCliTesseraeClient` (real CLI) + `createFakeTesseraeClient` (tests) |
| `lib/research/manifest.ts` | Generic JSON manifest read/upsert (used by ingest + synthesize) |
| `lib/research/ingest.ts` | `gd ingest` — hash, corpus copy, manifest, compile, smoke check, status |
| `lib/research/synthesize.ts` | `gd synthesize` — spawn synthesizer, parse `__SYNTHESIS__`, validate, key/supersede, compile, smoke check |
| `lib/research/cli-kb.ts` | `cmdIngest` / `cmdSynthesize` command fns |
| `lib/research/kg.ts` (modify) | Route `syncFindingToKg` through `TesseraeClient.compile` (fix SP1 `--root`) |
| `lib/research/index.ts` (modify) | Export the new command fns |
| `lib/cli/index.ts` (modify) | Add `ingest`/`synthesize` to `TOOL_COMMANDS` |
| `bin/grd-tools.ts` (modify) | `case 'ingest':` / `case 'synthesize':` |
| `agents/grd-synthesizer.md` | New agent (KG query only, emits `__SYNTHESIS__`) |
| `jest.config.js` (modify) | Coverage thresholds for new files |
| `.gitignore` (modify) | Ignore `.tesserae/` + corpus |

Note: the `TesseraeClient`'s injected process-runner is named `run` (a `RunFn`), not `exec`, to keep the code unambiguously on the shell-free `execFileSync` path.

---

## Task 1: TesseraeClient types + fake client

**Files:**
- Create: `lib/research/tesserae.ts`
- Test: `tests/unit/research/tesserae.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/tesserae.test.ts
'use strict';
const { createFakeTesseraeClient } = require('../../../lib/research/tesserae');

describe('TesseraeClient (fake)', () => {
  it('fake client reports configured availability + compile/smoke results', async () => {
    const fake = createFakeTesseraeClient({
      available: true,
      compileStatus: 'compiled',
      smoke: { found: true, nodeIds: ['n1'], detail: 'ok' },
    });
    expect(fake.isAvailable()).toBe(true);
    expect((await fake.compile('/cwd', ['corpus'])).status).toBe('compiled');
    const s = await fake.querySmokeCheck('/cwd', 'topic');
    expect(s.found).toBe(true);
    expect(s.nodeIds).toEqual(['n1']);
  });

  it('fake client defaults to unavailable / skipped', async () => {
    const fake = createFakeTesseraeClient({});
    expect(fake.isAvailable()).toBe(false);
    expect((await fake.compile('/cwd', [])).status).toBe('skipped_no_tesserae');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/tesserae.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/tesserae.ts
'use strict';

export type TesseraeStatus = 'compiled' | 'skipped_no_tesserae' | 'compile_failed' | 'partial';
export interface CompileResult { status: TesseraeStatus; detail: string; graphPath: string | null; }
export interface SmokeResult { found: boolean; nodeIds: string[]; detail: string; }

export interface TesseraeClient {
  isAvailable(): boolean;
  compile(cwd: string, sources: string[]): Promise<CompileResult>;
  querySmokeCheck(cwd: string, topic: string): Promise<SmokeResult>;
}

interface FakeOpts {
  available?: boolean;
  compileStatus?: TesseraeStatus;
  smoke?: SmokeResult;
}

function createFakeTesseraeClient(opts: FakeOpts): TesseraeClient {
  return {
    isAvailable: () => opts.available === true,
    compile: async () => ({
      status: opts.available === true ? (opts.compileStatus || 'compiled') : 'skipped_no_tesserae',
      detail: 'fake',
      graphPath: null,
    }),
    querySmokeCheck: async () => opts.smoke || { found: false, nodeIds: [], detail: 'fake' },
  };
}

module.exports = { createFakeTesseraeClient };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/tesserae.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/tesserae.ts tests/unit/research/tesserae.test.ts
git commit -m "feat(sp2): TesseraeClient interface + fake client"
```

---

## Task 2: TesseraeClient CLI backend (compile + isAvailable)

**Files:**
- Modify: `lib/research/tesserae.ts`
- Test: `tests/unit/research/tesserae.test.ts`

- [ ] **Step 1: Write the failing test** (append to the existing test file)

```ts
// add to tests/unit/research/tesserae.test.ts
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCliTesseraeClient } = require('../../../lib/research/tesserae');

describe('TesseraeClient (CLI backend)', () => {
  it('compile invokes the real tesserae extractor with the right args', async () => {
    const calls: string[][] = [];
    const run = (bin: string, args: string[]) => { calls.push([bin, ...args]); return ''; };
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    const client = createCliTesseraeClient({ run, whichOk: true });
    const res = await client.compile(cwd, [path.join(cwd, 'corpus')]);
    expect(res.status).toBe('compiled');
    const call = calls[0];
    expect(call[0]).toBe('tesserae');
    expect(call).toContain('--sqlite-output');
    expect(call).toContain('--changed-only');
    expect(call).toContain('--canonicalize');
    expect(call.join(' ')).toContain('.tesserae/graph.json');
  });

  it('compile returns compile_failed when the runner throws', async () => {
    const run = () => { throw Object.assign(new Error('boom'), { stderr: 'extract error' }); };
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    const res = await createCliTesseraeClient({ run, whichOk: true }).compile(cwd, ['corpus']);
    expect(res.status).toBe('compile_failed');
    expect(res.detail).toContain('extract error');
  });

  it('compile returns skipped_no_tesserae when binary absent', async () => {
    const res = await createCliTesseraeClient({ whichOk: false }).compile('/cwd', ['corpus']);
    expect(res.status).toBe('skipped_no_tesserae');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/tesserae.test.ts -t "CLI backend"`
Expected: FAIL — `createCliTesseraeClient` undefined

- [ ] **Step 3: Write minimal implementation** (add to `lib/research/tesserae.ts`, above `module.exports`)

```ts
const fs = require('fs');
const path = require('path');
// execFileSync only (NOT a shell): no shell is spawned, args are passed as an array.
const { execFileSync } = require('child_process');

type RunFn = (bin: string, args: string[], cwd: string) => string;
interface CliOpts { run?: RunFn; whichOk?: boolean; }

function tesseraeDir(cwd: string): string { return path.join(cwd, '.tesserae'); }
function graphJsonPath(cwd: string): string { return path.join(tesseraeDir(cwd), 'graph.json'); }
function sqlitePath(cwd: string): string { return path.join(tesseraeDir(cwd), 'sqlite.db'); }

function binaryResolves(): boolean {
  try { execFileSync('tesserae', ['--help'], { encoding: 'utf8', timeout: 15000 }); return true; }
  catch { return false; }
}

function createCliTesseraeClient(opts: CliOpts = {}): TesseraeClient {
  const run: RunFn = opts.run
    || ((bin, args, cwd) => execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 600000 }));
  const available = opts.whichOk !== undefined ? opts.whichOk : binaryResolves();

  return {
    isAvailable: () => available,

    async compile(cwd: string, sources: string[]): Promise<CompileResult> {
      if (!available) return { status: 'skipped_no_tesserae', detail: 'tesserae CLI not found', graphPath: null };
      fs.mkdirSync(tesseraeDir(cwd), { recursive: true });
      const graph = graphJsonPath(cwd);
      const args = [...sources, '-o', graph, '--sqlite-output', sqlitePath(cwd), '--changed-only', '--canonicalize'];
      try {
        run('tesserae', args, cwd);
        return { status: 'compiled', detail: 'compiled', graphPath: graph };
      } catch (e: unknown) {
        const err = e as { stderr?: string; message?: string };
        return { status: 'compile_failed', detail: err.stderr || err.message || String(e), graphPath: null };
      }
    },

    async querySmokeCheck(): Promise<SmokeResult> {
      return { found: false, nodeIds: [], detail: 'not implemented in this task' };
    },
  };
}

module.exports = { createFakeTesseraeClient, createCliTesseraeClient };
```

(There is now exactly one `module.exports` line — exporting both factories. Delete the Task-1 `module.exports`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/tesserae.test.ts && npm run build:check`
Expected: PASS, clean types

- [ ] **Step 5: Commit**

```bash
git add lib/research/tesserae.ts tests/unit/research/tesserae.test.ts
git commit -m "feat(sp2): TesseraeClient CLI backend (real tesserae extract invocation)"
```

---

## Task 3: querySmokeCheck via graph.json

**Files:**
- Modify: `lib/research/tesserae.ts`
- Test: `tests/unit/research/tesserae.test.ts`

- [ ] **Step 1: Write the failing test** (append)

```ts
// add to tests/unit/research/tesserae.test.ts
describe('querySmokeCheck', () => {
  function withGraph(nodes: object[]) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    fs.mkdirSync(path.join(cwd, '.tesserae'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.tesserae/graph.json'), JSON.stringify({ nodes }));
    return cwd;
  }
  it('finds nodes whose name matches the topic (case-insensitive)', async () => {
    const cwd = withGraph([{ id: 'n1', name: 'Retrieval Augmented Generation' }, { id: 'n2', name: 'Other' }]);
    const r = await createCliTesseraeClient({ whichOk: true }).querySmokeCheck(cwd, 'retrieval augmented');
    expect(r.found).toBe(true);
    expect(r.nodeIds).toContain('n1');
  });
  it('returns found:false when no node matches or no graph', async () => {
    const cwd = withGraph([{ id: 'n1', name: 'Other' }]);
    expect((await createCliTesseraeClient({ whichOk: true }).querySmokeCheck(cwd, 'nope')).found).toBe(false);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tess-'));
    expect((await createCliTesseraeClient({ whichOk: true }).querySmokeCheck(empty, 'x')).found).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/tesserae.test.ts -t "querySmokeCheck"`
Expected: FAIL — returns "not implemented"

- [ ] **Step 3: Write minimal implementation** — replace the placeholder `querySmokeCheck` in `createCliTesseraeClient`:

```ts
    async querySmokeCheck(cwd: string, topic: string): Promise<SmokeResult> {
      const graph = graphJsonPath(cwd);
      if (!fs.existsSync(graph)) return { found: false, nodeIds: [], detail: 'no graph.json' };
      let nodes: Array<{ id?: string; name?: string; source_path?: string }> = [];
      try {
        const parsed = JSON.parse(fs.readFileSync(graph, 'utf8')) as { nodes?: typeof nodes };
        nodes = parsed.nodes || [];
      } catch { return { found: false, nodeIds: [], detail: 'unreadable graph.json' }; }
      const needle = topic.toLowerCase();
      const matched = nodes.filter((n) =>
        (n.name || '').toLowerCase().includes(needle) || (n.source_path || '').toLowerCase().includes(needle));
      return {
        found: matched.length > 0,
        nodeIds: matched.map((n) => String(n.id)).filter(Boolean),
        detail: `${matched.length} match(es)`,
      };
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/tesserae.test.ts && npm run build:check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/tesserae.ts tests/unit/research/tesserae.test.ts
git commit -m "feat(sp2): querySmokeCheck reads graph.json (deterministic, no MCP)"
```

---

## Task 4: Manifest helper

**Files:**
- Create: `lib/research/manifest.ts`
- Test: `tests/unit/research/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/manifest.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readManifest, upsertManifest } = require('../../../lib/research/manifest');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-man-')); }

describe('manifest', () => {
  it('readManifest returns [] when absent', () => {
    expect(readManifest(path.join(tmp(), 'm.json'))).toEqual([]);
  });
  it('upsert adds then replaces by key', () => {
    const p = path.join(tmp(), 'm.json');
    upsertManifest(p, 'k', { key: 'k', status: 'compiled' });
    upsertManifest(p, 'k', { key: 'k', status: 'partial' });
    upsertManifest(p, 'k2', { key: 'k2', status: 'compiled' });
    const all = readManifest(p);
    expect(all.length).toBe(2);
    expect(all.find((e: any) => e.key === 'k').status).toBe('partial');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/manifest.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/manifest.ts
'use strict';
const fs = require('fs');
const path = require('path');

interface ManifestEntry { key: string; [k: string]: unknown; }

function readManifest(manifestPath: string): ManifestEntry[] {
  if (!fs.existsSync(manifestPath)) return [];
  try { return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ManifestEntry[]; }
  catch { return []; }
}

function upsertManifest(manifestPath: string, key: string, entry: ManifestEntry): void {
  const all = readManifest(manifestPath).filter((e) => e.key !== key);
  all.push(entry);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(all, null, 2));
}

module.exports = { readManifest, upsertManifest };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/manifest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/manifest.ts tests/unit/research/manifest.test.ts
git commit -m "feat(sp2): generic JSON manifest helper"
```

---

## Task 5: `gd ingest <local markdown>`

**Files:**
- Create: `lib/research/ingest.ts`
- Test: `tests/unit/research/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/ingest.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ingest } = require('../../../lib/research/ingest');
const { createFakeTesseraeClient } = require('../../../lib/research/tesserae');
const { readManifest } = require('../../../lib/research/manifest');

function projectWithDoc(name: string, body: string) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ing-'));
  fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
  const src = path.join(cwd, name);
  fs.writeFileSync(src, body);
  return { cwd, src };
}

describe('ingest', () => {
  it('copies md into corpus, writes manifest, compiles, smoke-checks → compiled', async () => {
    const { cwd, src } = projectWithDoc('paper.md', '# RAG\nretrieval augmented generation');
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['n1'], detail: 'ok' } });
    const res = await ingest(cwd, src, { client });
    expect(res.status).toBe('compiled');
    expect(fs.readdirSync(path.join(cwd, '.planning/research/corpus')).length).toBe(1);
    const man = readManifest(path.join(cwd, '.planning/research/ingest/manifest.json'));
    expect(man.length).toBe(1);
    expect(man[0].status).toBe('compiled');
    expect(man[0].nodeIds).toEqual(['n1']);
  });

  it('is idempotent: re-ingesting an unchanged file skips compile', async () => {
    const { cwd, src } = projectWithDoc('p.md', 'same');
    let compiles = 0;
    const client = { isAvailable: () => true,
      compile: async () => { compiles++; return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['n'], detail: '' }) };
    await ingest(cwd, src, { client });
    await ingest(cwd, src, { client });
    expect(compiles).toBe(1); // second run skipped (hash unchanged)
  });

  it('reports skipped_no_tesserae without faking success', async () => {
    const { cwd, src } = projectWithDoc('p.md', 'x');
    const res = await ingest(cwd, src, { client: createFakeTesseraeClient({}) });
    expect(res.status).toBe('skipped_no_tesserae');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/ingest.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/ingest.ts
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { TesseraeClient, TesseraeStatus } from './tesserae';
const { createCliTesseraeClient } = require('./tesserae');
const { readManifest, upsertManifest } = require('./manifest');

export interface IngestResult { status: TesseraeStatus; files: number; detail: string; }
interface IngestOpts { client?: TesseraeClient; }

function corpusDir(cwd: string): string { return path.join(cwd, '.planning/research/corpus'); }
function ingestManifest(cwd: string): string { return path.join(cwd, '.planning/research/ingest/manifest.json'); }

function listMarkdown(input: string): string[] {
  const stat = fs.statSync(input);
  if (stat.isFile()) return input.endsWith('.md') ? [input] : [];
  return fs.readdirSync(input)
    .filter((f: string) => f.endsWith('.md'))
    .map((f: string) => path.join(input, f));
}

async function ingest(cwd: string, inputPath: string, opts: IngestOpts = {}): Promise<IngestResult> {
  const client: TesseraeClient = opts.client || createCliTesseraeClient();
  const files = listMarkdown(inputPath);
  fs.mkdirSync(corpusDir(cwd), { recursive: true });
  const manifest = ingestManifest(cwd);
  const existing = readManifest(manifest);

  let changed = 0;
  for (const file of files) {
    const bytes = fs.readFileSync(file);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    const sourcePath = file.startsWith(cwd) ? path.relative(cwd, file) : file;
    const prior = existing.find((e) => e.key === sourcePath);
    if (prior && prior.hash === hash && prior.status === 'compiled') continue; // idempotent skip
    const corpusName = `${hash.slice(0, 12)}-${path.basename(file)}`;
    fs.copyFileSync(file, path.join(corpusDir(cwd), corpusName));
    upsertManifest(manifest, sourcePath, { key: sourcePath, hash, corpusName, status: 'pending', lastAttemptAt: new Date().toISOString(), nodeIds: [] });
    changed++;
  }

  if (changed === 0) return { status: 'compiled', files: files.length, detail: 'no changes (idempotent)' };

  const compileRes = await client.compile(cwd, [corpusDir(cwd)]);
  let status: TesseraeStatus = compileRes.status;
  let nodeIds: string[] = [];
  if (compileRes.status === 'compiled') {
    const smoke = await client.querySmokeCheck(cwd, path.basename(files[0], '.md'));
    nodeIds = smoke.nodeIds;
    if (!smoke.found) status = 'partial';
  }
  for (const e of readManifest(manifest)) {
    if (e.status === 'pending') {
      upsertManifest(manifest, String(e.key), { ...e, status, lastAttemptAt: new Date().toISOString(), nodeIds });
    }
  }
  return { status, files: files.length, detail: compileRes.detail };
}

module.exports = { ingest, corpusDir, ingestManifest, listMarkdown };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/ingest.test.ts && npm run build:check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/ingest.ts tests/unit/research/ingest.test.ts
git commit -m "feat(sp2): gd ingest (local markdown → corpus → compile → smoke check)"
```

---

## Task 6: `gd synthesize "<topic>"` + `__SYNTHESIS__` parsing

**Files:**
- Create: `lib/research/synthesize.ts`
- Test: `tests/unit/research/synthesize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/research/synthesize.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseSynthesisDoc, synthesize } = require('../../../lib/research/synthesize');
const { createFakeTesseraeClient } = require('../../../lib/research/tesserae');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-syn-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
const DOC = `__SYNTHESIS__
---
type: synthesis
topic_id: rag
input_query: "RAG"
generated_at: 2026-05-26T00:00:00Z
synthesizer_version: 1
source_node_ids: [n2, n1]
supersedes: none
---
## Compendium
RAG combines retrieval with generation.
## Open Questions
- How to evaluate retrieval quality?`;

describe('synthesize', () => {
  it('parseSynthesisDoc extracts frontmatter + requires fields', () => {
    const d = parseSynthesisDoc(DOC);
    expect(d).not.toBeNull();
    expect(d.frontmatter.topic_id).toBe('rag');
    expect(d.frontmatter.source_node_ids).toEqual(['n2', 'n1']);
    expect(parseSynthesisDoc('no tag here')).toBeNull();
    expect(parseSynthesisDoc('__SYNTHESIS__\n---\ntype: synthesis\n---\nno topic_id')).toBeNull();
  });

  it('synthesize writes doc + manifest, compiles, smoke-checks → compiled', async () => {
    const cwd = tmp();
    const spawn = async () => DOC;
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['s1'], detail: 'ok' } });
    const res = await synthesize(cwd, 'RAG', { spawn, client });
    expect(res.status).toBe('compiled');
    expect(fs.existsSync(path.join(cwd, '.planning/research/synthesis/rag.md'))).toBe(true);
  });

  it('is idempotent on identical source_node_ids + version', async () => {
    const cwd = tmp();
    let compiles = 0;
    const spawn = async () => DOC;
    const client = { isAvailable: () => true,
      compile: async () => { compiles++; return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['s1'], detail: '' }) };
    await synthesize(cwd, 'RAG', { spawn, client });
    await synthesize(cwd, 'RAG', { spawn, client });
    expect(compiles).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/synthesize.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/research/synthesize.ts
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { TesseraeClient, TesseraeStatus } from './tesserae';
const { createCliTesseraeClient } = require('./tesserae');
const { readManifest, upsertManifest } = require('./manifest');

const SYNTH_VERSION = 1;

export type SynthSpawnFn = (prompt: string, agentType: string) => Promise<string>;
export interface SynthesisDoc { frontmatter: Record<string, unknown>; body: string; raw: string; }
export interface SynthesizeResult { status: TesseraeStatus; topicId: string; docPath: string | null; detail: string; }
interface SynthesizeOpts { spawn?: SynthSpawnFn; client?: TesseraeClient; }

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'topic';
}
function synthDir(cwd: string): string { return path.join(cwd, '.planning/research/synthesis'); }
function synthManifest(cwd: string): string { return path.join(synthDir(cwd), 'manifest.json'); }

function parseSynthesisDoc(stdout: string): SynthesisDoc | null {
  const idx = stdout.indexOf('__SYNTHESIS__');
  if (idx === -1) return null;
  const raw = stdout.slice(idx + '__SYNTHESIS__'.length).trim();
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return null;
  const frontmatter: Record<string, unknown> = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    let val: unknown = kv[2].trim();
    const arr = (val as string).match(/^\[(.*)\]$/);
    if (arr) val = arr[1].split(',').map((x) => x.trim()).filter(Boolean);
    frontmatter[kv[1]] = val;
  }
  if (frontmatter.type !== 'synthesis' || !frontmatter.topic_id || !Array.isArray(frontmatter.source_node_ids)) {
    return null;
  }
  return { frontmatter, body: m[2], raw };
}

function buildSynthesizePrompt(topic: string): string {
  return [
    'You are grd-synthesizer. Query the Tesserae knowledge graph (search_nodes, ask, node_context)',
    `for the topic: "${topic}". Produce a domain compendium + ranked open questions.`,
    '',
    'Emit exactly one final block to stdout (no prose after it):',
    '__SYNTHESIS__',
    '---',
    'type: synthesis',
    `topic_id: ${slug(topic)}`,
    `input_query: "${topic}"`,
    'generated_at: <iso8601>',
    `synthesizer_version: ${SYNTH_VERSION}`,
    'source_node_ids: [<kg node ids you used>]',
    'supersedes: <prior synthesis doc id | none>',
    '---',
    '## Compendium',
    '<synthesized domain summary>',
    '## Open Questions',
    '- <ranked candidate research questions>',
  ].join('\n');
}

async function synthesize(cwd: string, topic: string, opts: SynthesizeOpts = {}): Promise<SynthesizeResult> {
  const client: TesseraeClient = opts.client || createCliTesseraeClient();
  const topicId = slug(topic);
  const docPath = path.join(synthDir(cwd), `${topicId}.md`);

  const out = await (opts.spawn as SynthSpawnFn)(buildSynthesizePrompt(topic), 'grd-synthesizer');
  const doc = parseSynthesisDoc(out);
  if (!doc) return { status: 'compile_failed', topicId, docPath: null, detail: 'invalid synthesis doc (missing tag/frontmatter)' };

  const sourceIds = (doc.frontmatter.source_node_ids as string[]).slice().sort();
  const key = crypto.createHash('sha256').update(`${topicId}|${sourceIds.join(',')}|${SYNTH_VERSION}`).digest('hex');
  const prior = readManifest(synthManifest(cwd)).find((e) => e.key === topicId) as { synthKey?: string } | undefined;
  if (prior && prior.synthKey === key && fs.existsSync(docPath)) {
    return { status: 'compiled', topicId, docPath, detail: 'unchanged (idempotent)' };
  }

  fs.mkdirSync(synthDir(cwd), { recursive: true });
  fs.writeFileSync(docPath, doc.raw);

  const compileRes = await client.compile(cwd, [synthDir(cwd)]);
  let status: TesseraeStatus = compileRes.status;
  let nodeIds: string[] = [];
  if (compileRes.status === 'compiled') {
    const smoke = await client.querySmokeCheck(cwd, topicId);
    nodeIds = smoke.nodeIds;
    if (!smoke.found) status = 'partial';
  }
  upsertManifest(synthManifest(cwd), topicId, {
    key: topicId, synthKey: key, docPath: path.relative(cwd, docPath),
    status, lastAttemptAt: new Date().toISOString(), nodeIds,
  });
  return { status, topicId, docPath, detail: compileRes.detail };
}

module.exports = { parseSynthesisDoc, buildSynthesizePrompt, synthesize, SYNTH_VERSION };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/synthesize.test.ts && npm run build:check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/research/synthesize.ts tests/unit/research/synthesize.test.ts
git commit -m "feat(sp2): gd synthesize (KG query → schema doc → compile, idempotent)"
```

---

## Task 7: Refactor `kg.ts` onto TesseraeClient (fix SP1 `--root`)

**Files:**
- Modify: `lib/research/kg.ts`, `lib/research/orchestrator.ts`
- Test: `tests/unit/research/kg.test.ts`

- [ ] **Step 1: Update the failing test** — replace the two `syncFindingToKg` test cases in `tests/unit/research/kg.test.ts` with client-injection versions:

```ts
// in tests/unit/research/kg.test.ts — replace the syncFindingToKg cases with:
const { createFakeTesseraeClient } = require('../../../lib/research/tesserae');

it('syncFindingToKg compiles via the injected client when available', async () => {
  const cwd = tmp();
  const r = await syncFindingToKg(cwd, 't', '/tmp/FINDING.md',
    { client: createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['n'], detail: '' } }) });
  expect(r.synced).toBe(true);
});

it('syncFindingToKg degrades when tesserae unavailable', async () => {
  const cwd = tmp();
  const r = await syncFindingToKg(cwd, 't', '/tmp/FINDING.md', { client: createFakeTesseraeClient({}) });
  expect(r.synced).toBe(false);
  expect(r.reason).toMatch(/tesserae/i);
});
```

(Keep the `writeKgProvenance` test as-is. `syncFindingToKg` is now `async`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/kg.test.ts`
Expected: FAIL — old signature / `client` option unsupported

- [ ] **Step 3: Update implementation** — in `lib/research/kg.ts`, remove the old `RunFn`/`defaultRun`/`execFileSync`/`child_process` block and replace `syncFindingToKg` with:

```ts
import type { TesseraeClient } from './tesserae';
const { createCliTesseraeClient } = require('./tesserae');

async function syncFindingToKg(
  cwd: string, id: string, _findingPath: string, opts: { client?: TesseraeClient } = {},
): Promise<{ synced: boolean; reason?: string }> {
  const client: TesseraeClient = opts.client || createCliTesseraeClient();
  if (!client.isAvailable()) return { synced: false, reason: 'tesserae sync skipped: CLI not available' };
  const res = await client.compile(cwd, [require('path').join(cwd, '.planning/research')]);
  return res.status === 'compiled'
    ? { synced: true }
    : { synced: false, reason: `tesserae sync skipped: ${res.status} (${res.detail})` };
}
```

In `lib/research/orchestrator.ts`, the `finishKgSync` helper calls `syncFindingToKg(...)`. Make `finishKgSync` `async` (if it isn't) and `await` the call; update its one caller in the finalize block to `await finishKgSync(...)` (the surrounding loop is already `async`). Confirm `kg.ts` no longer imports `child_process`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/research/kg.test.ts tests/unit/research/orchestrator.test.ts && npm run build:check && npm run lint`
Expected: PASS, clean

- [ ] **Step 5: Commit**

```bash
git add lib/research/kg.ts lib/research/orchestrator.ts tests/unit/research/kg.test.ts
git commit -m "fix(sp2): route kg.ts through TesseraeClient (removes SP1 --root guess)"
```

---

## Task 8: `grd-synthesizer` agent

**Files:**
- Create: `agents/grd-synthesizer.md`
- Modify: `tests/unit/agent-audit.test.ts` (agent count)

- [ ] **Step 1: Create the agent file**

```markdown
---
name: grd-synthesizer
description: Synthesizes a domain compendium and ranked open questions for a topic by querying the Tesserae knowledge graph. Emits one structured synthesis document; does not write files.
tools: Read, Grep, Glob, mcp__plugin_tesserae_tesserae__*
color: purple
effort: high
maxTurns: 20
---

<role>
You are grd-synthesizer. Given a topic, query the Tesserae knowledge graph and produce ONE
domain compendium plus a ranked list of open research questions.
</role>

<rules>
- Query the KG via its MCP tools (search_nodes, ask, node_context) for the topic.
- Record the KG node ids you actually drew on in `source_node_ids` (this is the synthesis
  signature GRD uses for idempotency).
- Do NOT write files. Emit exactly one document to stdout via the contract below; GRD persists it.
</rules>

<output_contract>
Emit exactly one final block, nothing after it:
__SYNTHESIS__
---
type: synthesis
topic_id: <slug>
input_query: "<topic>"
generated_at: <iso8601>
synthesizer_version: 1
source_node_ids: [<kg node ids you used>]
supersedes: <prior synthesis doc id | none>
---
## Compendium
<synthesized domain summary, grounded in the cited nodes>
## Open Questions
- <ranked candidate research questions>
</output_contract>
```

- [ ] **Step 2: Update the agent-count audit**

In `tests/unit/agent-audit.test.ts`, the count test currently reads `expect(agentFiles.length).toBe(24)` (SP1 brought it to 24). This adds the 25th. Update the title and assertion to `25`.

Run: `npx jest tests/unit/agent-audit.test.ts`
Expected: PASS (17 sub-tests). Then `npm run lint`.

- [ ] **Step 3: Commit**

```bash
git add agents/grd-synthesizer.md tests/unit/agent-audit.test.ts
git commit -m "feat(sp2): grd-synthesizer agent (KG query → __SYNTHESIS__, no Write)"
```

---

## Task 9: CLI command functions + wiring

**Files:**
- Create: `lib/research/cli-kb.ts`
- Modify: `lib/research/index.ts`, `lib/cli/index.ts`, `bin/grd-tools.ts`
- Test: `tests/integration/research-kb-cli.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/research-kb-cli.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-kb-cli-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
const GD = path.join(__dirname, '../../bin/gd.js');

describe('gd ingest routing', () => {
  it('gd ingest <md> --json runs and reports a status (skipped when no tesserae)', () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, 'paper.md'), '# x');
    const out = cp.execFileSync('node', [GD, 'ingest', path.join(cwd, 'paper.md'), '--json'], { cwd, encoding: 'utf8' });
    const parsed = JSON.parse(out);
    expect(['compiled', 'skipped_no_tesserae', 'compile_failed', 'partial']).toContain(parsed.status);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/integration/research-kb-cli.test.ts`
Expected: FAIL — unknown command `ingest`

- [ ] **Step 3: Implement command fns** — `lib/research/cli-kb.ts`:

```ts
// lib/research/cli-kb.ts
'use strict';
const { output, error, loadConfig } = require('./../utils') as {
  output: (r: unknown, raw: boolean, rawVal?: unknown) => never;
  error: (m: string) => never;
  loadConfig: (cwd: string) => Record<string, unknown>;
};
const { ingest } = require('./ingest');
const { synthesize } = require('./synthesize');
const { defaultSpawn } = require('./orchestrator');

async function cmdIngest(cwd: string, inputPath: string, raw: boolean): Promise<never> {
  if (!inputPath) error('ingest: a markdown file or directory path is required');
  const res = await ingest(cwd, inputPath);
  return output(res, raw, raw ? JSON.stringify(res) : `ingest: ${res.status} (${res.files} files)\n`);
}

async function cmdSynthesize(cwd: string, topic: string, raw: boolean): Promise<never> {
  if (!topic || !topic.trim()) error('synthesize: a topic is required, e.g. gd synthesize "retrieval augmented generation"');
  const spawn = defaultSpawn(cwd, loadConfig(cwd));
  const res = await synthesize(cwd, topic, { spawn });
  return output(res, raw, raw ? JSON.stringify(res) : `synthesize: ${res.status} (${res.topicId})\n`);
}

module.exports = { cmdIngest, cmdSynthesize };
```

- [ ] **Step 4: Wire routing**

In `lib/cli/index.ts`: add `'ingest'` and `'synthesize'` to `TOOL_COMMANDS`; in `classifyCommand`, add `if (command === 'ingest' || command === 'synthesize') return 'tool';` before the generic `TOOL_COMMANDS.has` check.

In `bin/grd-tools.ts`, add to the main switch (mirror the existing `research` case's async style; `args[0]` is the command name so the argument is `args[1]`):
```ts
    case 'ingest': {
      const { cmdIngest } = require('../lib/research/cli-kb') as { cmdIngest: (cwd: string, p: string, raw: boolean) => Promise<never> };
      await cmdIngest(cwd, args[1], raw);
      break;
    }
    case 'synthesize': {
      const { cmdSynthesize } = require('../lib/research/cli-kb') as { cmdSynthesize: (cwd: string, t: string, raw: boolean) => Promise<never> };
      await cmdSynthesize(cwd, args.slice(1).filter((a) => !a.startsWith('--')).join(' '), raw);
      break;
    }
```

In `lib/research/index.ts`, add to `module.exports`: `cmdIngest`, `cmdSynthesize` (from `./cli-kb`), `ingest` (from `./ingest`), `synthesize` (from `./synthesize`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/integration/research-kb-cli.test.ts && npm run lint && npm run build:check`
Expected: PASS, clean

- [ ] **Step 6: Commit**

```bash
git add lib/research/cli-kb.ts lib/research/index.ts lib/cli/index.ts bin/grd-tools.ts tests/integration/research-kb-cli.test.ts
git commit -m "feat(sp2): wire gd ingest + gd synthesize"
```

---

## Task 10: gitignore + coverage thresholds

**Files:**
- Modify: `.gitignore`, `jest.config.js`

- [ ] **Step 1: Ignore build artifacts** — add to `.gitignore` under the GRD-specific section:
```
# Tesserae compiled knowledge graph + ingested corpus (build artifacts)
.tesserae/
.planning/research/corpus/
```

- [ ] **Step 2: Add coverage thresholds** — in `jest.config.js` `coverageThreshold`, add:
```js
    './lib/research/tesserae.ts': { lines: 80, functions: 90, branches: 70 },
    './lib/research/manifest.ts': { lines: 90, functions: 100, branches: 80 },
    './lib/research/ingest.ts': { lines: 80, functions: 90, branches: 65 },
    './lib/research/synthesize.ts': { lines: 80, functions: 90, branches: 65 },
```

- [ ] **Step 3: Run the research suite with coverage**

Run: `npx jest tests/unit/research/ --coverage --collectCoverageFrom='lib/research/**/*.ts'`
Expected: PASS; the four thresholded files meet thresholds. If any is short, add minimal assertions to its test (do NOT lower thresholds). Likely additions: a `tesserae` test for `binaryResolves` false path and `partial` (compiled but smoke not found); an `ingest`/`synthesize` test for the `partial` branch (compileStatus 'compiled' + smoke `found:false`).

- [ ] **Step 4: Commit**

```bash
git add .gitignore jest.config.js tests/unit/research/*.test.ts
git commit -m "chore(sp2): gitignore .tesserae/corpus + coverage thresholds"
```

---

## Task 11: End-to-end integration smoke test

**Files:**
- Create: `tests/integration/sp2-kb-loop.test.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/integration/sp2-kb-loop.test.ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ingest } = require('../../lib/research/ingest');
const { synthesize } = require('../../lib/research/synthesize');
const { createFakeTesseraeClient, createCliTesseraeClient } = require('../../lib/research/tesserae');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-sp2-e2e-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('SP2 ingest+synthesize (fake Tesserae, e2e)', () => {
  it('ingest then synthesize both report compiled and write artifacts', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, 'rag.md'), '# RAG\nretrieval augmented generation');
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['n1'], detail: 'ok' } });

    const ing = await ingest(cwd, path.join(cwd, 'rag.md'), { client });
    expect(ing.status).toBe('compiled');

    const doc = `__SYNTHESIS__\n---\ntype: synthesis\ntopic_id: rag\ninput_query: "RAG"\ngenerated_at: 2026-05-26T00:00:00Z\nsynthesizer_version: 1\nsource_node_ids: [n1]\nsupersedes: none\n---\n## Compendium\nx\n## Open Questions\n- y`;
    const syn = await synthesize(cwd, 'RAG', { spawn: async () => doc, client });
    expect(syn.status).toBe('compiled');
    expect(fs.existsSync(path.join(cwd, '.planning/research/synthesis/rag.md'))).toBe(true);
  });

  it('TESSERAE_INTEGRATION: real compile makes content retrievable', async () => {
    if (process.env.TESSERAE_INTEGRATION !== '1') return; // gated; skipped by default
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, 'rag.md'), '# Retrieval Augmented Generation\nRAG combines retrieval and generation.');
    const ing = await ingest(cwd, path.join(cwd, 'rag.md')); // real CLI client
    expect(['compiled', 'partial']).toContain(ing.status);
    if (ing.status === 'compiled') {
      const smoke = await createCliTesseraeClient().querySmokeCheck(cwd, 'retrieval');
      expect(smoke.found).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test + full research suite + checks**

Run: `npx jest tests/integration/sp2-kb-loop.test.ts && npx jest tests/unit/research tests/integration/research-kb-cli.test.ts && npm run lint && npm run build:check`
Expected: PASS (the gated case returns early without `TESSERAE_INTEGRATION=1`)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/sp2-kb-loop.test.ts
git commit -m "test(sp2): e2e ingest+synthesize (fake client) + gated real-tesserae integration"
```

---

## Final verification

- [ ] **Run the research suite + lint + build**

Run: `npx jest tests/unit/research tests/integration/research-kb-cli.test.ts tests/integration/sp2-kb-loop.test.ts && npm run lint && npm run build:check`
Expected: all PASS.

- [ ] **Manual smoke (optional, needs real Tesserae)**

```bash
gd ingest path/to/papers/
gd synthesize "your topic"
gd research "a question about your topic"
```

---

## Spec coverage map (self-review)

| Spec section | Task |
|---|---|
| §4.1 TesseraeClient (async, fake+CLI, statuses) | Tasks 1, 2, 3 |
| §4.2 gd ingest (hash, corpus, manifest, idempotent, smoke) | Task 5 |
| §4.3 gd synthesize (spawn, parse, key, supersede, compile) | Task 6 |
| §4.4 grd-synthesizer (no Write, __SYNTHESIS__) | Task 8 |
| §4.5 CLI wiring | Task 9 |
| §6 real Tesserae invocation | Resolved in header; Tasks 2, 3 |
| §7 synthesis schema (frontmatter required fields) | Tasks 6, 8 |
| §8 manifests + idempotency (content hash, synth key) | Tasks 4, 5, 6 |
| §9 explicit statuses, no silent success | Tasks 2, 5, 6, 9 |
| §10 testing (fake client unit, contract, gated integration) | Tasks 1–11 |
| §11 success criteria | Task 11 + manual |
| Refactor SP1 kg.ts off `--root` | Task 7 |

**Deferred (per spec §13):** arXiv/web fetch, PDF, sessions; MCP-serving/registration of GRD's compiled graph is verified by the gated integration test + manual `gd research`, not unit tests.
