# PDF / Session Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `gd ingest` to accept a PDF (local `.pdf`, a direct `.pdf` URL, or `--pdf <arxiv-id>` for the body) and a Claude Code / Codex session `.jsonl`, normalizing each to markdown and running the existing `ingest()` pipeline.

**Architecture:** Two new focused parser modules — `lib/research/pdf.ts` (lazy dynamic-`import` of ESM pdfjs-dist) and `lib/research/session.ts` (pure jsonl→markdown). `fetch.ts` gains two `detectSource` kinds (`pdf`, `session`), a binary `httpGetBytes` (refactored to share a `httpResolve` loop with `httpGet`), and pdf/session branches in `fetchSource` that stage a deterministic `.md` and reuse `ingest()`. `cmdIngest`/`bin` thread a `--pdf` flag.

**Tech Stack:** TypeScript (strict, CommonJS `require`/`module.exports`, zero `any`; `import type` allowed; dynamic `import()` for ESM-only deps), Node 18+, Jest + ts-jest. Deterministic tests inject `loader`/`fetcher`/parsers; no real network or PDF binaries.

**Spec:** `docs/superpowers/specs/2026-05-30-pdf-session-ingestion-design.md`

**Conventions:** `'use strict'` first line; typed requires `const x = require('./m') as {...}`; tests in `tests/unit/research/<module>.test.ts`. Single test: `npx jest tests/unit/research/<file>.test.ts`. Build: `npm run build:check`. Lint: `npm run lint`.

---

## Task 1: `session.ts` — Claude/Codex jsonl → markdown (pure)

**Files:**
- Create: `lib/research/session.ts`
- Test: `tests/unit/research/session.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/unit/research/session.test.ts`:

```ts
'use strict';
const { sessionJsonlToMarkdown } = require('../../../lib/research/session');

describe('sessionJsonlToMarkdown', () => {
  it('renders Claude Code turns: roles, text, tool_use summary, tool_result', () => {
    const jsonl = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'How do I sort?' } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
        { type: 'text', text: 'Use Array.sort.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'node -e "console.log(1)"' } },
      ] } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [
        { type: 'tool_result', content: '1' },
      ] } }),
    ].join('\n');
    const md = sessionJsonlToMarkdown(jsonl);
    expect(md).toContain('## user');
    expect(md).toContain('How do I sort?');
    expect(md).toContain('## assistant');
    expect(md).toContain('Use Array.sort.');
    expect(md).toMatch(/> tool: Bash\(/);
    expect(md).toContain('1');
  });

  it('handles the Codex shape (top-level role/content string)', () => {
    const jsonl = [
      JSON.stringify({ role: 'user', content: 'hi' }),
      JSON.stringify({ role: 'assistant', content: 'hello' }),
    ].join('\n');
    const md = sessionJsonlToMarkdown(jsonl);
    expect(md).toContain('## user');
    expect(md).toContain('hi');
    expect(md).toContain('## assistant');
    expect(md).toContain('hello');
  });

  it('tolerates blank and unparseable lines', () => {
    const jsonl = ['', '{not json', JSON.stringify({ role: 'user', content: 'ok' }), '   '].join('\n');
    const md = sessionJsonlToMarkdown(jsonl);
    expect(md).toContain('## user');
    expect(md).toContain('ok');
  });

  it('throws when there are no parseable turns', () => {
    expect(() => sessionJsonlToMarkdown('\n{bad\n')).toThrow(/no.*turns|empty/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/session.test.ts`
Expected: FAIL — cannot find module `session`.

- [ ] **Step 3: Implement `lib/research/session.ts`:**

```ts
'use strict';

type Block = { type?: string; text?: string; name?: string; input?: unknown; content?: unknown };
type Content = string | Block[];

function truncate(s: string, n = 200): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function renderContent(content: Content): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text.trim());
    else if (b.type === 'tool_use') {
      parts.push(`> tool: ${b.name || 'tool'}(${truncate(JSON.stringify(b.input ?? {}))})`);
    } else if (b.type === 'tool_result') {
      const c = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
      parts.push(`> result: ${truncate(c)}`);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

/** Parse a Claude Code / Codex session .jsonl transcript into deterministic markdown. */
function sessionJsonlToMarkdown(text: string): string {
  const sections: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let obj: { message?: { role?: string; content?: Content }; role?: string; content?: Content };
    try { obj = JSON.parse(t); } catch { continue; }
    const turn = obj.message && obj.message.role ? obj.message : (obj.role ? obj : null);
    if (!turn || !turn.role) continue;
    const body = renderContent(turn.content ?? '');
    if (!body) continue;
    sections.push(`## ${turn.role}\n\n${body}`);
  }
  if (sections.length === 0) throw new Error('session: no parseable turns (empty or unrecognized transcript)');
  return sections.join('\n\n') + '\n';
}

module.exports = { sessionJsonlToMarkdown };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/session.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Build + commit**

```bash
npm run build:check
git add lib/research/session.ts tests/unit/research/session.test.ts
git commit -m "feat(research): session.ts — Claude/Codex jsonl → markdown (pdf/session task 1)"
```

---

## Task 2: `pdf.ts` — pdfjs text extraction (injectable loader)

**Files:**
- Modify: `package.json` (add `pdfjs-dist`)
- Create: `lib/research/pdf.ts`
- Test: `tests/unit/research/pdf.test.ts`

- [ ] **Step 1: Install the dep**

Run: `npm install --save pdfjs-dist`
Expected: `package.json` `dependencies` includes `pdfjs-dist`; lockfile updated.

- [ ] **Step 2: Write the failing test** — create `tests/unit/research/pdf.test.ts` (uses an injected fake loader; never loads real pdfjs):

```ts
'use strict';
const { pdfToMarkdown } = require('../../../lib/research/pdf');

// Build a fake pdfjs lib whose pages return the given text item arrays.
function fakeLoader(pages: string[][]) {
  return async () => ({
    getDocument: (_args: { data: Uint8Array }) => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async (n: number) => ({
          getTextContent: async () => ({ items: pages[n - 1].map((str) => ({ str })) }),
        }),
      }),
    }),
  });
}

describe('pdfToMarkdown', () => {
  it('extracts text per page, separated by blank lines', async () => {
    const md = await pdfToMarkdown(new Uint8Array([1, 2, 3]), {
      loader: fakeLoader([['Hello', 'world'], ['Second', 'page']]),
    });
    expect(md).toBe('Hello world\n\nSecond page');
  });

  it('throws on a zero-page document', async () => {
    await expect(pdfToMarkdown(new Uint8Array([1]), { loader: fakeLoader([]) }))
      .rejects.toThrow(/no pages/i);
  });

  it('throws when no text is extractable (scanned/image PDF)', async () => {
    await expect(pdfToMarkdown(new Uint8Array([1]), { loader: fakeLoader([[''], ['  ']]) }))
      .rejects.toThrow(/no extractable text/i);
  });

  it('surfaces a loader/parse failure (e.g. encrypted) as a clear error', async () => {
    const loader = async () => { throw new Error('PasswordException'); };
    await expect(pdfToMarkdown(new Uint8Array([1]), { loader }))
      .rejects.toThrow(/failed to load extractor|PasswordException/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/unit/research/pdf.test.ts`
Expected: FAIL — cannot find module `pdf`.

- [ ] **Step 4: Implement `lib/research/pdf.ts`:**

```ts
'use strict';

interface PdfPage { getTextContent(): Promise<{ items: Array<{ str?: string }> }>; }
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; }
interface PdfLib { getDocument(args: { data: Uint8Array }): { promise: Promise<PdfDoc> }; }
type Loader = () => Promise<PdfLib>;

/** Extract a PDF's text into markdown. `loader` defaults to a lazy dynamic import of ESM pdfjs. */
async function pdfToMarkdown(bytes: Uint8Array, opts: { loader?: Loader } = {}): Promise<string> {
  // pdfjs-dist current majors are ESM-only; dynamic import() works from CommonJS.
  const loader: Loader = opts.loader
    || (() => (import('pdfjs-dist/legacy/build/pdf.mjs') as unknown) as Promise<PdfLib>);
  let lib: PdfLib;
  try { lib = await loader(); }
  catch (e) { throw new Error(`pdf: failed to load extractor — ${(e as Error).message}`, { cause: e }); }
  let doc: PdfDoc;
  try { doc = await lib.getDocument({ data: bytes }).promise; }
  catch (e) { throw new Error(`pdf: could not parse document — ${(e as Error).message}`, { cause: e }); }
  if (!doc.numPages || doc.numPages < 1) throw new Error('pdf: document has no pages');
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str || '').join(' ').replace(/[ \t]+/g, ' ').trim();
    if (text) pages.push(text);
  }
  const md = pages.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!md) throw new Error('pdf: no extractable text (scanned or image-only PDF?)');
  return md;
}

module.exports = { pdfToMarkdown };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/research/pdf.test.ts`
Expected: PASS (all 4).

- [ ] **Step 6: Build + commit**

```bash
npm run build:check
git add package.json package-lock.json lib/research/pdf.ts tests/unit/research/pdf.test.ts
git commit -m "feat(research): pdf.ts — pdfjs text extraction via injectable lazy loader (pdf/session task 2)"
```

---

## Task 3: `fetch.ts` — `httpResolve` refactor + binary `httpGetBytes`

**Files:**
- Modify: `lib/research/fetch.ts`
- Test: `tests/unit/research/fetch.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `tests/unit/research/fetch.test.ts`:

```ts
describe('httpGetBytes', () => {
  const { httpGetBytes } = require('../../../lib/research/fetch');
  const resp = (status: number, body: string, headers: Record<string, string> = {}) => ({
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    text: async () => body,
  });

  it('returns a Buffer of the body on 200', async () => {
    const fetcher = async () => resp(200, 'PDFBYTES');
    const r = await httpGetBytes('https://example.com/x.pdf', { fetcher });
    expect(Buffer.isBuffer(r.bytes)).toBe(true);
    expect(r.bytes.toString()).toBe('PDFBYTES');
  });

  it('re-validates a redirect target (blocks metadata host)', async () => {
    const fetcher = async () => resp(302, '', { location: 'http://169.254.169.254/' });
    await expect(httpGetBytes('https://example.com/a.pdf', { fetcher })).rejects.toThrow(/private|loopback|link-local/i);
  });

  it('enforces the byte size cap', async () => {
    const fetcher = async () => resp(200, 'x'.repeat(50));
    await expect(httpGetBytes('https://example.com/x.pdf', { fetcher, maxBytes: 10 })).rejects.toThrow(/too large|size/i);
  });
});
```

Also confirm the existing `httpGet` tests still pass after the refactor (they exercise `httpResolve` indirectly).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/fetch.test.ts -t httpGetBytes`
Expected: FAIL — `httpGetBytes is not a function`.

- [ ] **Step 3: Refactor `httpGet` into `httpResolve` + add `httpGetBytes`** in `lib/research/fetch.ts`.

First extend the `FetchResponse` interface to allow binary reads (optional, so existing text-only fakes still satisfy it):
```ts
export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}
```

Replace the whole existing `httpGet` function with this trio:
```ts
/** Resolve a URL through manual redirects (each hop SSRF-guarded) to a 2xx response. */
async function httpResolve(url: string, opts: HttpOpts = {}): Promise<{ resp: FetchResponse; finalUrl: string; maxBytes: number }> {
  const fetcher: Fetcher = opts.fetcher || ((globalThis as { fetch?: Fetcher }).fetch as Fetcher);
  const maxBytes = opts.maxBytes ?? 5_000_000;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = assertFetchableUrl(url).toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let resp: FetchResponse;
    try {
      resp = await fetcher(current, { redirect: 'manual', signal: ctrl.signal });
    } catch (e) {
      throw new Error(`request failed: ${(e as Error).message}`, { cause: e });
    } finally {
      clearTimeout(timer);
    }
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) throw new Error(`redirect (${resp.status}) with no Location header`);
      current = assertFetchableUrl(new URL(loc, current).toString()).toString();
      continue;
    }
    if (resp.status < 200 || resp.status >= 300) throw new Error(`HTTP ${resp.status}`);
    const cl = resp.headers.get('content-length');
    if (cl && Number(cl) > maxBytes) throw new Error(`response too large (${cl} bytes > ${maxBytes})`);
    return { resp, finalUrl: current, maxBytes };
  }
  throw new Error(`too many redirects (> ${maxRedirects})`);
}

/** GET text (≤5 MB default). */
async function httpGet(url: string, opts: HttpOpts = {}): Promise<{ body: string; finalUrl: string; etag: string | null }> {
  const { resp, finalUrl, maxBytes } = await httpResolve(url, opts);
  const body = await resp.text();
  if (body.length > maxBytes) throw new Error(`response too large (> ${maxBytes} bytes)`);
  return { body, finalUrl, etag: resp.headers.get('etag') };
}

/** GET binary bytes (≤25 MB default — for PDFs). */
async function httpGetBytes(url: string, opts: HttpOpts = {}): Promise<{ bytes: Buffer; finalUrl: string; etag: string | null }> {
  const { resp, finalUrl, maxBytes } = await httpResolve(url, { maxBytes: 25_000_000, ...opts });
  if (!resp.arrayBuffer) throw new Error('response has no binary body');
  const bytes = Buffer.from(await resp.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error(`response too large (> ${maxBytes} bytes)`);
  return { bytes, finalUrl, etag: resp.headers.get('etag') };
}
```

Update the exports line to include `httpGetBytes` (keep the others):
```ts
module.exports = { detectSource, slugFor, httpGet, httpGetBytes, arxivAtomToMarkdown, fetchSource };
```

- [ ] **Step 4: Run tests to verify pass (new + existing httpGet)**

Run: `npx jest tests/unit/research/fetch.test.ts`
Expected: PASS (httpGet redirect/size/non-2xx tests still green; new httpGetBytes tests green).

- [ ] **Step 5: Build + commit**

```bash
npm run build:check
git add lib/research/fetch.ts tests/unit/research/fetch.test.ts
git commit -m "feat(research): fetch.ts — httpResolve refactor + binary httpGetBytes (pdf/session task 3)"
```

---

## Task 4: `fetch.ts` — `pdf`/`session` detection + slug + `fetchSource` branches

**Files:**
- Modify: `lib/research/fetch.ts`
- Test: `tests/unit/research/fetch.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/research/fetch.test.ts`:

```ts
describe('detectSource — pdf/session', () => {
  const { detectSource } = require('../../../lib/research/fetch');
  it('local .pdf suffix → pdf (even if non-existent)', () => {
    expect(detectSource(tmp(), 'paper.pdf')).toEqual({ kind: 'pdf', ref: 'paper.pdf' });
    expect(detectSource(tmp(), 'docs/paper.pdf').kind).toBe('pdf');
  });
  it('remote non-arXiv .pdf URL → pdf', () => {
    expect(detectSource(tmp(), 'https://example.com/a/x.pdf')).toEqual({ kind: 'pdf', ref: 'https://example.com/a/x.pdf' });
  });
  it('local .jsonl suffix → session', () => {
    expect(detectSource(tmp(), 'sess.jsonl')).toEqual({ kind: 'session', ref: 'sess.jsonl' });
  });
  it('--pdf flag on an arXiv id/URL → pdf body (ref = bare id)', () => {
    expect(detectSource(tmp(), '2401.12345', { pdfBody: true })).toEqual({ kind: 'pdf', ref: '2401.12345' });
    expect(detectSource(tmp(), 'https://arxiv.org/abs/2401.12345', { pdfBody: true })).toEqual({ kind: 'pdf', ref: '2401.12345' });
  });
  it('arXiv pdf URL WITHOUT --pdf stays metadata (slice-2 unchanged)', () => {
    expect(detectSource(tmp(), 'https://arxiv.org/pdf/2401.12345')).toEqual({ kind: 'arxiv', ref: '2401.12345' });
  });
});

describe('fetchSource — pdf/session', () => {
  const { fetchSource } = require('../../../lib/research/fetch');

  it('local pdf → markdown via injected pdfToMarkdown, staged + sidecar', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'p.pdf'), 'binarybytes');
    const r = await fetchSource(cwd, 'p.pdf', { pdfToMarkdown: async () => 'Extracted body' });
    expect(r.kind).toBe('pdf');
    const md = fs.readFileSync(r.filePath, 'utf8');
    expect(md).toContain('Extracted body');
    expect(md).toMatch(/_Source: p\.pdf_/);
  });

  it('arXiv pdf body (--pdf) fetches arxiv.org/pdf/<id> as bytes', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    let fetchedUrl = '';
    const fetcher = async (url: string) => { fetchedUrl = url; return { status: 200, headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode('PDF').buffer, text: async () => 'PDF' }; };
    const r = await fetchSource(cwd, '2401.12345', { pdfBody: true, fetcher, pdfToMarkdown: async () => 'Body text' });
    expect(fetchedUrl).toBe('https://arxiv.org/pdf/2401.12345');
    expect(r.slug).toBe('arxiv-pdf-2401.12345');
    expect(fs.readFileSync(r.filePath, 'utf8')).toContain('Body text');
  });

  it('session jsonl → markdown, staged', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 's.jsonl'), JSON.stringify({ role: 'user', content: 'hi' }));
    const r = await fetchSource(cwd, 's.jsonl', {});
    expect(r.kind).toBe('session');
    expect(r.slug).toMatch(/^session-s-[0-9a-f]{8}$/);
    expect(fs.readFileSync(r.filePath, 'utf8')).toContain('## user');
  });

  it('pdf extraction empty → error', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'p.pdf'), 'x');
    await expect(fetchSource(cwd, 'p.pdf', { pdfToMarkdown: async () => '   ' })).rejects.toThrow(/empty/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/fetch.test.ts -t "pdf/session"`
Expected: FAIL — detection returns wrong kinds; `fetchSource` has no pdf/session branch.

- [ ] **Step 3: Add the typed requires for the parsers** near the top of `lib/research/fetch.ts` (after the `assertFetchableUrl` require):
```ts
const { pdfToMarkdown: defaultPdfToMarkdown } = require('./pdf') as {
  pdfToMarkdown: (bytes: Uint8Array, opts?: Record<string, unknown>) => Promise<string>;
};
const { sessionJsonlToMarkdown } = require('./session') as {
  sessionJsonlToMarkdown: (text: string) => string;
};
```

- [ ] **Step 4: Replace `detectSource`** with the suffix-first precedence (adds an `arxivIdFrom` helper + `opts.pdfBody`). Replace the whole existing `detectSource` function and add `arxivIdFrom` above it:

```ts
function arxivIdFrom(s: string): string | null {
  if (/^arxiv:/i.test(s)) { const id = s.replace(/^arxiv:/i, ''); return ARXIV_BARE.test(id) ? id : null; }
  if (ARXIV_BARE.test(s)) return s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.hostname === 'arxiv.org' || u.hostname.endsWith('.arxiv.org')) {
        const m = s.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
        return m ? m[1] : null;
      }
    } catch { return null; }
  }
  return null;
}

function detectSource(cwd: string, input: string, opts: { pdfBody?: boolean } = {}): DetectedSource {
  const s = input.trim();
  const isUrl = /^https?:\/\//i.test(s);
  const arxiv = arxivIdFrom(s);
  // 1. --pdf on an arXiv id/URL → pdf body
  if (opts.pdfBody && arxiv) return { kind: 'pdf', ref: arxiv };
  // 2. local .pdf suffix
  if (!isUrl && /\.pdf$/i.test(s)) return { kind: 'pdf', ref: s };
  // 3. remote non-arXiv .pdf URL
  if (isUrl && !arxiv) {
    let u: URL;
    try { u = new URL(s); } catch { return { kind: 'unknown', ref: s }; }
    if (/\.pdf$/i.test(u.pathname)) return { kind: 'pdf', ref: s };
  }
  // 4. local .jsonl suffix
  if (!isUrl && /\.jsonl$/i.test(s)) return { kind: 'session', ref: s };
  // 5. existing local path (.md files, directories)
  if (fs.existsSync(path.resolve(cwd, s))) return { kind: 'local', ref: s };
  // 6. arXiv metadata (no --pdf)
  if (arxiv) return { kind: 'arxiv', ref: arxiv };
  // 7. other http(s) URL → web
  if (isUrl) {
    try { new URL(s); } catch { return { kind: 'unknown', ref: s }; }
    return { kind: 'web', ref: s };
  }
  // 8. path-like local
  if (/\.md$/i.test(s) || s.includes('/') || s.includes('\\')) return { kind: 'local', ref: s };
  return { kind: 'unknown', ref: s };
}
```

(Delete the old `detectSource`; the slice-2 detection tests still pass under this version.)

- [ ] **Step 5: Extend `slugFor`** to handle `pdf` and `session` (add the two branches before the final web branch):
```ts
function slugFor(d: DetectedSource): string {
  if (d.kind === 'arxiv') return `arxiv-${d.ref.replace(/[^\w.]/g, '')}`;
  if (d.kind === 'pdf') {
    if (ARXIV_BARE.test(d.ref)) return `arxiv-pdf-${d.ref.replace(/[^\w.]/g, '')}`;
    const base = path.basename(d.ref.split('?')[0]).replace(/\.pdf$/i, '')
      .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'doc';
    return `pdf-${base}-${crypto.createHash('sha1').update(d.ref).digest('hex').slice(0, 8)}`;
  }
  if (d.kind === 'session') {
    const base = path.basename(d.ref).replace(/\.jsonl$/i, '')
      .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'session';
    return `session-${base}-${crypto.createHash('sha1').update(d.ref).digest('hex').slice(0, 8)}`;
  }
  const host = new URL(d.ref).hostname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
  return `web-${host}-${crypto.createHash('sha1').update(d.ref).digest('hex').slice(0, 8)}`;
}
```

- [ ] **Step 6: Add pdf/session branches to `fetchSource`.** Extend `FetchSourceOpts` and add the branches before the final `writeStaging`. Update the opts interface:
```ts
interface FetchSourceOpts {
  fetcher?: Fetcher;
  htmlToMd?: (html: string, url: string) => string;
  pdfBody?: boolean;
  pdfToMarkdown?: (bytes: Uint8Array, opts?: Record<string, unknown>) => Promise<string>;
}
```

In `fetchSource`, after the existing `arxiv`/`web` branches' `if/else` chain, add `pdf` and `session` as additional branches (use `else if`). The full branch set becomes:
```ts
  if (d.kind === 'arxiv') {
    const { body } = await httpGet(`${ARXIV_API}${encodeURIComponent(d.ref)}`, { fetcher: opts.fetcher });
    markdown = arxivAtomToMarkdown(body, d.ref);
    canonicalUrl = `https://arxiv.org/abs/${d.ref}`;
  } else if (d.kind === 'web') {
    const html = (await httpGet(d.ref, { fetcher: opts.fetcher })).body;
    const conv = (opts.htmlToMd || defaultHtmlToMd)(html, d.ref).trim();
    if (!conv) throw new Error(`web: extraction produced empty content for ${d.ref}`);
    markdown = `${conv}\n\n_Source: ${d.ref}_\n`;
    canonicalUrl = d.ref;
  } else if (d.kind === 'pdf') {
    const toMd = opts.pdfToMarkdown || defaultPdfToMarkdown;
    let bytes: Buffer;
    if (/^https?:\/\//i.test(d.ref)) {
      bytes = (await httpGetBytes(d.ref, { fetcher: opts.fetcher })).bytes;
      canonicalUrl = d.ref;
    } else if (ARXIV_BARE.test(d.ref)) {
      canonicalUrl = `https://arxiv.org/pdf/${d.ref}`;
      bytes = (await httpGetBytes(canonicalUrl, { fetcher: opts.fetcher })).bytes;
    } else {
      bytes = fs.readFileSync(path.resolve(cwd, d.ref));
      canonicalUrl = d.ref;
    }
    const text = (await toMd(new Uint8Array(bytes))).trim();
    if (!text) throw new Error(`pdf: extraction produced empty content for ${d.ref}`);
    markdown = `${text}\n\n_Source: ${canonicalUrl}_\n`;
  } else if (d.kind === 'session') {
    const raw = fs.readFileSync(path.resolve(cwd, d.ref), 'utf8');
    const conv = sessionJsonlToMarkdown(raw).trim();
    if (!conv) throw new Error(`session: no parseable turns in ${d.ref}`);
    markdown = `${conv}\n\n_Source: ${d.ref}_\n`;
    canonicalUrl = d.ref;
  } else {
    throw new Error(`fetchSource: unsupported kind ${d.kind}`);
  }
```
(Replace the existing `if (d.kind === 'arxiv') { ... } else { ...web... }` block with the full chain above. `defaultHtmlToMd`, `ARXIV_API`, `httpGetBytes` are already in scope.)

- [ ] **Step 7: Run tests to verify pass**

Run: `npx jest tests/unit/research/fetch.test.ts && npm run build:check`
Expected: all PASS (slice-2 detection/arxiv/web tests + new pdf/session tests); build OK.

- [ ] **Step 8: Commit**

```bash
git add lib/research/fetch.ts tests/unit/research/fetch.test.ts
git commit -m "feat(research): fetch.ts — pdf/session detection, slugs, fetchSource branches (pdf/session task 4)"
```

---

## Task 5: wire `cmdIngest` `--pdf` flag + bin parsing

**Files:**
- Modify: `lib/research/cli-kb.ts`
- Modify: `bin/grd-tools.ts` (ingest case)
- Test: `tests/unit/research/cli-kb.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append inside the `cmdIngest remote routing` describe in `tests/unit/research/cli-kb.test.ts`:

```ts
    it('routes a local .pdf through fetchSource then ingest', async () => {
      const cwd = tmp();
      const calls: string[] = [];
      const deps = {
        ingest: async (_c: string, p: string) => { calls.push(`ingest:${p}`); return { status: 'compiled', files: 1, detail: 'ok' }; },
        fetchSource: async (_c: string, input: string) => { calls.push(`fetch:${input}`); return { filePath: '/abs/pdf-x.md', slug: 'pdf-x', kind: 'pdf' }; },
      };
      const res = await captureOutputAsync(() => cmdIngest(cwd, 'paper.pdf', true, deps));
      expect(res.exitCode).toBe(0);
      expect(calls).toEqual(['fetch:paper.pdf', 'ingest:/abs/pdf-x.md']);
    });

    it('passes pdfBody=true to fetchSource when the --pdf flag is set', async () => {
      const cwd = tmp();
      let sawPdfBody = false;
      const deps = {
        ingest: async () => ({ status: 'compiled', files: 1, detail: 'ok' }),
        fetchSource: async (_c: string, _i: string, o: { pdfBody?: boolean }) => { sawPdfBody = !!(o && o.pdfBody); return { filePath: '/abs/arxiv-pdf.md', slug: 'arxiv-pdf-2401.00001', kind: 'pdf' }; },
      };
      const res = await captureOutputAsync(() => cmdIngest(cwd, '2401.00001', true, deps, true));
      expect(res.exitCode).toBe(0);
      expect(sawPdfBody).toBe(true);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/cli-kb.test.ts -t "pdf"`
Expected: FAIL — `cmdIngest` has no `pdfBody` param; `fetchSource` not called with pdfBody.

- [ ] **Step 3: Thread `pdfBody` through `cmdIngest`** in `lib/research/cli-kb.ts`. Update the `detectSource`/`fetchSource` typed require to accept opts (detectSource already does in fetch.ts; reflect it in the require type):
```ts
const { detectSource, fetchSource } = require('./fetch') as {
  detectSource: (cwd: string, input: string, opts?: { pdfBody?: boolean }) => { kind: 'local' | 'arxiv' | 'web' | 'pdf' | 'session' | 'unknown'; ref: string };
  fetchSource: (cwd: string, input: string, opts?: Record<string, unknown>)
    => Promise<{ filePath: string; slug: string; kind: string }>;
};
```

Change the `cmdIngest` signature and detection/fetch calls to pass `pdfBody`:
```ts
async function cmdIngest(cwd: string, inputPath: string, raw: boolean, deps: IngestDeps = {}, pdfBody = false): Promise<never> {
  if (!inputPath) error('ingest: a local .md/.pdf/.jsonl path, an arXiv id/URL, or an http(s) URL is required');
  const run = deps.ingest || ingest;
  const fetchRemote = deps.fetchSource || fetchSource;

  const detected = detectSource(cwd, inputPath, { pdfBody });
  let ingestPath = inputPath;
  if (detected.kind === 'unknown') {
    error(`ingest: unrecognized input "${inputPath}" — expected a local .md/.pdf/.jsonl path, an arXiv id/URL, or an http(s) URL`);
  }
  if (detected.kind !== 'local') {
    try {
      const fetched = await fetchRemote(cwd, inputPath, { pdfBody });
      ingestPath = fetched.filePath;
    } catch (e) {
      error(`ingest: fetch failed — ${(e as Error).message}`);
    }
  }

  const res = await run(cwd, ingestPath);
  const warn = statusWarning(res.status, res.detail);
  if (warn) process.stderr.write(warn + '\n');
  if (res.status === 'compile_failed') error(`ingest: compile failed — ${res.detail}`);
  return output(res, raw, raw ? JSON.stringify(res) : `ingest: ${res.status} (${res.files} files)\n`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/cli-kb.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 5: Parse `--pdf` in the bin ingest case.** In `bin/grd-tools.ts`, replace the `case 'ingest'` block:
```ts
    case 'ingest': {
      const { cmdIngest } = require('../lib/research/cli-kb') as {
        cmdIngest: (cwd: string, p: string, raw: boolean, deps?: Record<string, unknown>, pdfBody?: boolean) => Promise<never>;
      };
      const pdfBody = args.includes('--pdf');
      const target = args.slice(1).find((a) => !a.startsWith('--')) || '';
      await cmdIngest(cwd, target, raw, {}, pdfBody);
      break;
    }
```

- [ ] **Step 6: Build + commit**

```bash
npm run build:check
git add lib/research/cli-kb.ts bin/grd-tools.ts tests/unit/research/cli-kb.test.ts
git commit -m "feat(research): cmdIngest --pdf flag + bin parsing for PDF body / pdf+session routing (pdf/session task 5)"
```

---

## Task 6: CJS/ESM interop test, coverage thresholds, docs, full verification

**Files:**
- Create: `tests/unit/research/pdf.interop.test.ts`
- Modify: `jest.config.js`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the real-runtime pdfjs interop test** — create `tests/unit/research/pdf.interop.test.ts` (runs in a child `node` process because jest's loader can't handle ESM-only pdfjs; must FAIL, not skip, on a packaging regression):

```ts
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

describe('pdfjs-dist CJS/ESM interop (real node runtime)', () => {
  it('dynamically imports pdfjs legacy ESM build and exposes getDocument', () => {
    const script = `
      (async () => {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (typeof pdfjs.getDocument !== 'function') { console.error('no getDocument'); process.exit(2); }
        console.log('OK');
      })().catch((e) => { console.error(e.message); process.exit(3); });
    `;
    const out = execFileSync('node', ['--input-type=module', '-e', script], {
      cwd: path.join(__dirname, '..', '..', '..'),
      encoding: 'utf8',
    });
    expect(out).toMatch(/OK/);
  });
});
```

- [ ] **Step 2: Run the interop test**

Run: `npx jest tests/unit/research/pdf.interop.test.ts`
Expected: PASS (prints OK). If it fails with a module-resolution error, confirm the installed pdfjs-dist exposes `legacy/build/pdf.mjs` (adjust the import path to the installed build entry if the package layout differs, e.g. `pdfjs-dist/legacy/build/pdf.min.mjs`).

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: clean (prefix unused args with `_`; ensure thrown errors in `catch` use `{ cause: e }` per the repo's `preserve-caught-error` rule, as done in `pdf.ts`/`fetch.ts`).

- [ ] **Step 4: Measure coverage for the new files**

Run:
```bash
npx jest tests/unit/research/ --coverage --collectCoverageFrom='lib/research/pdf.ts' --collectCoverageFrom='lib/research/session.ts' --coverageThreshold='{}' 2>&1 | grep -E "pdf\.ts|session\.ts|% Stmts"
```
Note the measured `% Lines / % Funcs / % Branch`.

- [ ] **Step 5: Add per-file coverage thresholds** to `jest.config.js` (after the `./lib/research/fetch.ts` line), set a few points BELOW the Step-4 actuals (the default dynamic-import loader in `pdf.ts` is not unit-tested, so its funcs/branches are lower):
```js
    './lib/research/session.ts': { lines: 90, functions: 100, branches: 80 },
    './lib/research/pdf.ts': { lines: 80, functions: 75, branches: 60 },
```
Adjust the literals to sit just under the Step-4 actuals if those are lower; never above measured.

- [ ] **Step 6: Document the feature** in `CLAUDE.md` — extend the "Remote ingestion (arXiv / web)" subsection's first sentence to include PDF + sessions, and append:
```markdown

`gd ingest` also accepts a **PDF** (local `.pdf`, a direct `.pdf` URL, or `gd ingest --pdf
<arxiv-id|url>` to fetch + extract an arXiv paper's body via pdfjs-dist, lazy-loaded through a
dynamic ESM import) and a **Claude Code / Codex session transcript** (`.jsonl` → readable
markdown via the GRD-native parser in `lib/research/session.ts`). Both normalize to a staging
`.md` and run through the same pipeline. arXiv ids/URLs without `--pdf` stay metadata-only.
```

- [ ] **Step 7: Full research suite + build + lint**

Run: `npx jest tests/unit/research/ && npm run build:check && npm run lint`
Expected: all PASS; build OK; lint clean. (`git diff --name-only main` should show only `lib/research/{pdf,session,fetch,cli-kb}.ts`, `bin/grd-tools.ts`, the new tests, `package.json`/lock, `jest.config.js`, `CLAUDE.md`, docs.)

- [ ] **Step 8: Commit**

```bash
git add jest.config.js CLAUDE.md tests/unit/research/pdf.interop.test.ts
git commit -m "test(research): pdfjs interop test, coverage thresholds, docs (pdf/session task 6)"
```

---

## Self-review notes (author)

- **Spec coverage:** session parser (T1), pdf extractor (T2), binary fetch (T3), detection+slug+fetchSource branches (T4), cmdIngest/bin `--pdf` (T5), interop/coverage/docs (T6). Deterministic body (no timestamp), suffix-before-existing-path precedence, arXiv-unchanged-without-`--pdf`, dynamic-import ESM pdfjs, 25 MB binary cap — all covered.
- **Type consistency:** `DetectedSource{kind,ref}` (kind now includes `pdf`/`session`); `pdfToMarkdown(Uint8Array,opts?)→Promise<string>` identical in `pdf.ts`, the `fetch.ts` require, and the injected test fakes; `sessionJsonlToMarkdown(string)→string`; `httpGetBytes→{bytes:Buffer,...}`; `fetchSource(cwd,input,opts)` opts gains `pdfBody`/`pdfToMarkdown`; `cmdIngest(...,pdfBody=false)`.
- **Carried risk:** pdfjs ESM packaging (localized to the lazy loader + interop test); PDF fidelity (empty→error); session schema drift (tolerant parser).
```
