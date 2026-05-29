# arXiv / Web Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overload `gd ingest <arg>` to accept an arXiv id/URL or an `http(s)` URL, fetch + normalize the source to markdown, and feed it through the existing `ingest()` pipeline.

**Architecture:** A new `lib/research/url-guard.ts` (SSRF guard, pure) and `lib/research/fetch.ts` (detect → fetch → normalize → atomic-write a deterministic staging `.md` at `.planning/fetched/<slug>.md`, outside the compile root) → then call the unchanged `ingest()` on that file. arXiv uses the dependency-free Atom API; generic web lazy-`require()`s turndown + @mozilla/readability + jsdom behind an injectable `htmlToMd` adapter. `cmdIngest` routes local vs remote.

**Tech Stack:** TypeScript (strict, CommonJS `require`/`module.exports`, zero `any`; `import type` allowed), Node 18+ `fetch`/`AbortController`, `net` for IP classification, Jest + ts-jest. Deterministic tests inject `fetcher` + `htmlToMd` (+ `fetchSource`/`ingest` into `cmdIngest`); no real network.

**Spec:** `docs/superpowers/specs/2026-05-28-arxiv-web-ingestion-design.md`

**Conventions:** `'use strict'` first line; `const x = require('./m') as { ... }` typed requires; tests in `tests/unit/research/<module>.test.ts`. Single test file: `npx jest tests/unit/research/<file>.test.ts`. Build: `npm run build:check`. Lint: `npm run lint`.

---

## Task 1: `url-guard.ts` — SSRF guard (pure, no network)

**Files:**
- Create: `lib/research/url-guard.ts`
- Test: `tests/unit/research/url-guard.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/unit/research/url-guard.test.ts`:

```ts
'use strict';
const { assertFetchableUrl, isBlockedHost } = require('../../../lib/research/url-guard');

describe('assertFetchableUrl', () => {
  it('accepts a normal public http(s) URL and returns a URL', () => {
    expect(assertFetchableUrl('https://export.arxiv.org/api/query').hostname).toBe('export.arxiv.org');
    expect(assertFetchableUrl('http://example.com/p').protocol).toBe('http:');
  });

  it('rejects non-http(s) schemes', () => {
    expect(() => assertFetchableUrl('file:///etc/passwd')).toThrow(/scheme/i);
    expect(() => assertFetchableUrl('ftp://example.com')).toThrow(/scheme/i);
    expect(() => assertFetchableUrl('data:text/html,x')).toThrow(/scheme/i);
  });

  it('rejects embedded credentials', () => {
    expect(() => assertFetchableUrl('http://user:pass@example.com')).toThrow(/credential/i);
  });

  it('rejects an invalid URL', () => {
    expect(() => assertFetchableUrl('not a url')).toThrow(/invalid url/i);
  });

  it('blocks localhost, loopback, private, link-local, metadata, unspecified', () => {
    for (const h of ['localhost', 'sub.localhost', '127.0.0.1', '10.0.0.1', '172.16.5.5',
      '192.168.1.1', '169.254.169.254', '0.0.0.0']) {
      expect(isBlockedHost(h)).toBe(true);
    }
  });

  it('blocks alternate IPv4 encodings via WHATWG normalization', () => {
    // new URL normalizes these to dotted-quad before our range check.
    expect(() => assertFetchableUrl('http://2130706433/')).toThrow(/private|loopback/i);   // 127.0.0.1
    expect(() => assertFetchableUrl('http://0177.0.0.1/')).toThrow(/private|loopback/i);    // 127.0.0.1
    expect(() => assertFetchableUrl('http://0x7f.0.0.1/')).toThrow(/private|loopback/i);    // 127.0.0.1
  });

  it('blocks IPv6 loopback, link-local, and IPv4-mapped loopback', () => {
    expect(() => assertFetchableUrl('http://[::1]/')).toThrow(/private|loopback/i);
    expect(() => assertFetchableUrl('http://[fe80::1]/')).toThrow(/private|loopback/i);
    expect(() => assertFetchableUrl('http://[::ffff:127.0.0.1]/')).toThrow(/private|loopback/i);
  });

  it('allows a public IPv4', () => {
    expect(isBlockedHost('93.184.216.34')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/url-guard.test.ts`
Expected: FAIL — cannot find module `url-guard`.

- [ ] **Step 3: Implement `lib/research/url-guard.ts`:**

```ts
'use strict';
const net = require('net') as { isIP: (s: string) => number };

function ipv4Blocked(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  if (a === 0 || a === 127 || a === 10) return true;       // unspecified-ish, loopback, private
  if (a === 169 && b === 254) return true;                  // link-local incl. 169.254.169.254 (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;         // 172.16/12
  if (a === 192 && b === 168) return true;                  // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true;        // CGNAT 100.64/10
  return false;
}

// Expand a (possibly ::-compressed, possibly IPv4-tailed) IPv6 to 16 bytes, or null if unparseable.
function ipv6Bytes(host: string): number[] | null {
  let s = host;
  let tail4: number[] = [];
  const lastColon = s.lastIndexOf(':');
  const lastSeg = s.slice(lastColon + 1);
  if (lastSeg.includes('.')) {
    const q = lastSeg.split('.').map(Number);
    if (q.length === 4 && q.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      tail4 = q;
      s = s.slice(0, lastColon + 1) + '0:0';
    }
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    const v = parseInt(g || '0', 16);
    if (Number.isNaN(v) || v < 0 || v > 0xffff) return null;
    bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  if (tail4.length === 4) bytes.splice(12, 4, ...tail4);
  return bytes.length === 16 ? bytes : null;
}

function ipv6Blocked(host: string): boolean {
  const b = ipv6Bytes(host);
  if (!b) return true;                                          // unparseable → block
  if (b.every((x) => x === 0)) return true;                     // ::
  if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;     // fe80::/10 link-local
  if ((b[0] & 0xfe) === 0xfc) return true;                      // fc00::/7 unique-local
  if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) {
    return ipv4Blocked(`${b[12]}.${b[13]}.${b[14]}.${b[15]}`); // ::ffff:a.b.c.d
  }
  return false;
}

/** True if the host is loopback/private/link-local/localhost. No DNS resolution (scoped out). */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  const kind = net.isIP(h);
  if (kind === 4) return ipv4Blocked(h);
  if (kind === 6) return ipv6Blocked(h);
  return false; // a non-IP hostname; we do not resolve it (DNS-rebinding residual is accepted)
}

/** Validate a URL is safe to fetch; returns the parsed URL or throws. */
function assertFetchableUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error(`invalid URL: ${raw}`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`unsupported scheme "${u.protocol}" (only http/https)`);
  }
  if (u.username || u.password) throw new Error('credentials in URL are not allowed');
  if (isBlockedHost(u.hostname)) {
    throw new Error(`refusing to fetch private/loopback/link-local host: ${u.hostname}`);
  }
  return u;
}

module.exports = { assertFetchableUrl, isBlockedHost };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/url-guard.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Build + commit**

```bash
npm run build:check
git add lib/research/url-guard.ts tests/unit/research/url-guard.test.ts
git commit -m "feat(research): url-guard.ts — SSRF guard for remote ingestion (arxiv/web task 1)"
```

---

## Task 2: `fetch.ts` — source detection + slug (pure)

**Files:**
- Create: `lib/research/fetch.ts`
- Test: `tests/unit/research/fetch.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/unit/research/fetch.test.ts`:

```ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectSource, slugFor } = require('../../../lib/research/fetch');

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-fetch-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('detectSource', () => {
  it('detects an existing local path first (cwd-relative)', () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, 'a.md'), '# x');
    expect(detectSource(cwd, 'a.md').kind).toBe('local');
  });
  it('detects a bare arXiv id and arxiv: prefix', () => {
    const cwd = tmp();
    expect(detectSource(cwd, '2401.12345')).toEqual({ kind: 'arxiv', ref: '2401.12345' });
    expect(detectSource(cwd, '2401.12345v2')).toEqual({ kind: 'arxiv', ref: '2401.12345v2' });
    expect(detectSource(cwd, 'arXiv:2401.12345')).toEqual({ kind: 'arxiv', ref: '2401.12345' });
  });
  it('detects arXiv abs/pdf URLs', () => {
    const cwd = tmp();
    expect(detectSource(cwd, 'https://arxiv.org/abs/2401.12345')).toEqual({ kind: 'arxiv', ref: '2401.12345' });
    expect(detectSource(cwd, 'https://arxiv.org/pdf/2401.12345v3')).toEqual({ kind: 'arxiv', ref: '2401.12345v3' });
  });
  it('detects a generic web URL', () => {
    const cwd = tmp();
    expect(detectSource(cwd, 'https://example.com/post')).toEqual({ kind: 'web', ref: 'https://example.com/post' });
  });
  it('does NOT treat a slash-containing non-existent string as arXiv', () => {
    const cwd = tmp();
    expect(detectSource(cwd, 'docs/2401.12345').kind).toBe('unknown');
  });
  it('returns unknown for unrecognized input', () => {
    const cwd = tmp();
    expect(detectSource(cwd, 'just-some-text').kind).toBe('unknown');
  });
});

describe('slugFor', () => {
  it('arxiv slug is stable and id-based', () => {
    expect(slugFor({ kind: 'arxiv', ref: '2401.12345v2' })).toBe('arxiv-2401.12345v2');
  });
  it('web slug embeds host and a url hash; distinct URLs never collide', () => {
    const a = slugFor({ kind: 'web', ref: 'https://example.com/a' });
    const b = slugFor({ kind: 'web', ref: 'https://example.com/b' });
    expect(a).toMatch(/^web-example-com-[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
    expect(slugFor({ kind: 'web', ref: 'https://example.com/a' })).toBe(a); // deterministic
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/fetch.test.ts`
Expected: FAIL — cannot find module `fetch`.

- [ ] **Step 3: Create `lib/research/fetch.ts` with detection + slug** (the rest is added in later tasks):

```ts
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertFetchableUrl } = require('./url-guard') as { assertFetchableUrl: (u: string) => URL };

export type SourceKind = 'local' | 'arxiv' | 'web' | 'unknown';
export interface DetectedSource { kind: SourceKind; ref: string; }

const ARXIV_BARE = /^\d{4}\.\d{4,5}(v\d+)?$/;

/** Classify an ingest argument. Existing local path wins; then arXiv; then http(s) URL. */
function detectSource(cwd: string, input: string): DetectedSource {
  const s = input.trim();
  if (fs.existsSync(path.resolve(cwd, s))) return { kind: 'local', ref: s };
  if (/^arxiv:/i.test(s)) {
    const id = s.replace(/^arxiv:/i, '');
    if (ARXIV_BARE.test(id)) return { kind: 'arxiv', ref: id };
  }
  if (ARXIV_BARE.test(s)) return { kind: 'arxiv', ref: s };
  if (/^https?:\/\//i.test(s)) {
    let host = '';
    try { host = new URL(s).hostname.toLowerCase(); } catch { return { kind: 'unknown', ref: s }; }
    if (host === 'arxiv.org' || host.endsWith('.arxiv.org')) {
      const m = s.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
      if (m) return { kind: 'arxiv', ref: m[1] };
    }
    return { kind: 'web', ref: s };
  }
  return { kind: 'unknown', ref: s };
}

/** Deterministic, collision-resistant staging slug for a detected source. */
function slugFor(d: DetectedSource): string {
  if (d.kind === 'arxiv') return `arxiv-${d.ref.replace(/[^\w.]/g, '')}`;
  const host = new URL(d.ref).hostname.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40);
  const h = crypto.createHash('sha1').update(d.ref).digest('hex').slice(0, 8);
  return `web-${host}-${h}`;
}

module.exports = { detectSource, slugFor };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/fetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Build + commit**

```bash
npm run build:check
git add lib/research/fetch.ts tests/unit/research/fetch.test.ts
git commit -m "feat(research): fetch.ts — source detection + collision-resistant slug (arxiv/web task 2)"
```

---

## Task 3: `fetch.ts` — `httpGet` (manual redirect, guard each hop, timeout, size cap)

**Files:**
- Modify: `lib/research/fetch.ts`
- Test: `tests/unit/research/fetch.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `tests/unit/research/fetch.test.ts`:

```ts
describe('httpGet', () => {
  const { httpGet } = require('../../../lib/research/fetch');
  const resp = (status: number, body: string, headers: Record<string, string> = {}) => ({
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    text: async () => body,
  });

  it('returns the body on 200', async () => {
    const fetcher = async () => resp(200, 'hello', { etag: 'W/"1"' });
    const r = await httpGet('https://example.com/x', { fetcher });
    expect(r.body).toBe('hello');
    expect(r.etag).toBe('W/"1"');
  });

  it('follows a redirect and re-validates the target', async () => {
    let calls = 0;
    const fetcher = async (url: string) => {
      calls++;
      if (url === 'https://example.com/a') return resp(302, '', { location: 'https://example.com/b' });
      return resp(200, 'final');
    };
    const r = await httpGet('https://example.com/a', { fetcher });
    expect(r.body).toBe('final');
    expect(calls).toBe(2);
  });

  it('rejects a redirect to a blocked host', async () => {
    const fetcher = async () => resp(302, '', { location: 'http://169.254.169.254/latest/meta-data/' });
    await expect(httpGet('https://example.com/a', { fetcher })).rejects.toThrow(/private|loopback|link-local/i);
  });

  it('throws on non-2xx', async () => {
    const fetcher = async () => resp(404, 'nope');
    await expect(httpGet('https://example.com/x', { fetcher })).rejects.toThrow(/HTTP 404/);
  });

  it('throws when the response exceeds the size cap', async () => {
    const fetcher = async () => resp(200, 'x'.repeat(20));
    await expect(httpGet('https://example.com/x', { fetcher, maxBytes: 10 })).rejects.toThrow(/too large|size/i);
  });

  it('throws too-many-redirects past the cap', async () => {
    const fetcher = async () => resp(302, '', { location: 'https://example.com/loop' });
    await expect(httpGet('https://example.com/loop', { fetcher, maxRedirects: 2 })).rejects.toThrow(/redirect/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/fetch.test.ts -t httpGet`
Expected: FAIL — `httpGet is not a function`.

- [ ] **Step 3: Add `httpGet` + types to `lib/research/fetch.ts`** (insert after the requires, before `module.exports`; also add to exports):

```ts
export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export type Fetcher = (url: string, init: { redirect: 'manual'; signal: AbortSignal }) => Promise<FetchResponse>;

interface HttpOpts { fetcher?: Fetcher; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; }

/** GET a URL with manual redirect handling; every hop passes the SSRF guard. */
async function httpGet(url: string, opts: HttpOpts = {}): Promise<{ body: string; finalUrl: string; etag: string | null }> {
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
      throw new Error(`request failed: ${(e as Error).message}`);
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
    const body = await resp.text();
    if (body.length > maxBytes) throw new Error(`response too large (> ${maxBytes} bytes)`);
    return { body, finalUrl: current, etag: resp.headers.get('etag') };
  }
  throw new Error(`too many redirects (> ${maxRedirects})`);
}
```

Update the exports line to:
```ts
module.exports = { detectSource, slugFor, httpGet };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/fetch.test.ts -t httpGet`
Expected: PASS.

- [ ] **Step 5: Build + commit**

```bash
npm run build:check
git add lib/research/fetch.ts tests/unit/research/fetch.test.ts
git commit -m "feat(research): fetch.ts httpGet — manual redirect, per-hop SSRF guard, timeout/size caps (arxiv/web task 3)"
```

---

## Task 4: `fetch.ts` — arXiv parse + `fetchSource` arXiv path (atomic write + sidecar)

**Files:**
- Modify: `lib/research/fetch.ts`
- Test: `tests/unit/research/fetch.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append:

```ts
describe('fetchSource — arXiv', () => {
  const { fetchSource } = require('../../../lib/research/fetch');
  const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>Attention Is All You Need</title>
    <summary>We propose the Transformer.</summary>
    <published>2017-06-12T00:00:00Z</published>
    <author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author>
    <category term="cs.CL"/></entry></feed>`;

  it('fetches arXiv metadata → deterministic markdown + sidecar (no timestamp in body)', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => ATOM });
    const r = await fetchSource(cwd, '2401.00001', { fetcher });
    expect(r.kind).toBe('arxiv');
    expect(r.filePath).toBe(path.join(cwd, '.planning/fetched/arxiv-2401.00001.md'));
    const md = fs.readFileSync(r.filePath, 'utf8');
    expect(md).toContain('# Attention Is All You Need');
    expect(md).toContain('Ashish Vaswani');
    expect(md).toContain('We propose the Transformer.');
    expect(md).toMatch(/_Source: https:\/\/arxiv\.org\/abs\/2401\.00001_/);
    expect(md).not.toMatch(/fetched_at|\d{4}-\d\d-\d\dT/); // no fetch timestamp in body
    const sidecar = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/fetched/fetch-manifest.json'), 'utf8'));
    expect(sidecar[0].slug).toBe('arxiv-2401.00001');
    expect(sidecar[0].kind).toBe('arxiv');
  });

  it('is deterministic: two fetches of identical metadata produce byte-identical markdown', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => ATOM });
    const a = await fetchSource(cwd, '2401.00001', { fetcher });
    const first = fs.readFileSync(a.filePath, 'utf8');
    const b = await fetchSource(cwd, '2401.00001', { fetcher });
    expect(fs.readFileSync(b.filePath, 'utf8')).toBe(first);
  });

  it('errors when the Atom feed has no entry', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => '<feed></feed>' });
    await expect(fetchSource(cwd, '2401.99999', { fetcher })).rejects.toThrow(/no.*entry|not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/fetch.test.ts -t "fetchSource — arXiv"`
Expected: FAIL — `fetchSource is not a function`.

- [ ] **Step 3: Add the arXiv parser, atomic write, sidecar, and `fetchSource` (arXiv branch)** to `lib/research/fetch.ts`. Add these helpers above `module.exports`:

```ts
function fetchedDir(cwd: string): string { return path.join(cwd, '.planning/fetched'); }
function sidecarPath(cwd: string): string { return path.join(fetchedDir(cwd), 'fetch-manifest.json'); }

function xmlTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
function xmlAll(block: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.push(m[1].replace(/\s+/g, ' ').trim());
  return out;
}

/** Parse an arXiv Atom feed entry into deterministic markdown. Throws if no entry. */
function arxivAtomToMarkdown(xml: string, id: string): string {
  const entry = (xml.match(/<entry[\s\S]*?<\/entry>/i) || [])[0];
  if (!entry) throw new Error(`arXiv: no entry found for ${id}`);
  const title = xmlTag(entry, 'title') || `arXiv:${id}`;
  const summary = xmlTag(entry, 'summary');
  if (!summary) throw new Error(`arXiv: empty abstract for ${id}`);
  const authors = xmlAll(entry, 'name');
  const published = xmlTag(entry, 'published');
  const cats: string[] = [];
  const catRe = /<category[^>]*term="([^"]+)"/gi;
  let cm: RegExpExecArray | null;
  while ((cm = catRe.exec(entry)) !== null) cats.push(cm[1]);
  const lines = [
    `# ${title}`,
    '',
    `_Source: https://arxiv.org/abs/${id}_`,
    '',
    authors.length ? `**Authors:** ${authors.join(', ')}` : '',
    published ? `**Published:** ${published}` : '',
    cats.length ? `**Categories:** ${cats.join(', ')}` : '',
    '',
    '## Abstract',
    '',
    summary,
    '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')); // collapse double blanks
  return lines.join('\n');
}

function writeStaging(cwd: string, slug: string, markdown: string): string {
  const dir = fetchedDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, `${slug}.md`);
  const tmpPath = path.join(dir, `.${slug}.tmp`);
  fs.writeFileSync(tmpPath, markdown);
  fs.renameSync(tmpPath, finalPath); // atomic
  return finalPath;
}

function recordSidecar(cwd: string, entry: { slug: string; kind: string; canonicalUrl: string; etag: string | null }): void {
  const p = sidecarPath(cwd);
  let all: Array<Record<string, unknown>> = [];
  try { all = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { all = []; }
  all = all.filter((e) => e.slug !== entry.slug);
  all.push({ ...entry, fetchedAt: new Date().toISOString() });
  fs.writeFileSync(p, JSON.stringify(all, null, 2));
}
```

Then add `fetchSource` itself (arXiv branch now; web branch in Task 5):

```ts
export interface FetchSourceResult { filePath: string; slug: string; kind: SourceKind; }
interface FetchSourceOpts { fetcher?: Fetcher; htmlToMd?: (html: string, url: string) => string; }

const ARXIV_API = 'https://export.arxiv.org/api/query?id_list=';

async function fetchSource(cwd: string, input: string, opts: FetchSourceOpts = {}): Promise<FetchSourceResult> {
  const d = detectSource(cwd, input);
  if (d.kind === 'local') throw new Error(`fetchSource called on a local path: ${input}`);
  if (d.kind === 'unknown') {
    throw new Error(`unrecognized input "${input}" — expected a local .md path, an arXiv id/URL, or an http(s) URL`);
  }
  const slug = slugFor(d);
  let markdown: string;
  let canonicalUrl: string;
  let etag: string | null = null;

  if (d.kind === 'arxiv') {
    const { body } = await httpGet(`${ARXIV_API}${encodeURIComponent(d.ref)}`, { fetcher: opts.fetcher });
    markdown = arxivAtomToMarkdown(body, d.ref);
    canonicalUrl = `https://arxiv.org/abs/${d.ref}`;
  } else {
    // web branch — implemented in Task 5
    throw new Error('web ingestion not yet implemented');
  }

  const filePath = writeStaging(cwd, slug, markdown);
  recordSidecar(cwd, { slug, kind: d.kind, canonicalUrl, etag });
  return { filePath, slug, kind: d.kind };
}
```

Update exports:
```ts
module.exports = { detectSource, slugFor, httpGet, arxivAtomToMarkdown, fetchSource };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/fetch.test.ts -t "fetchSource — arXiv"`
Expected: PASS.

- [ ] **Step 5: Build + commit**

```bash
npm run build:check
git add lib/research/fetch.ts tests/unit/research/fetch.test.ts
git commit -m "feat(research): fetch.ts — arXiv Atom→markdown, atomic staging write + provenance sidecar (arxiv/web task 4)"
```

---

## Task 5: web path — deps + lazy `htmlToMd` adapter + `fetchSource` web branch + CJS interop test

**Files:**
- Modify: `package.json` (add deps)
- Modify: `lib/research/fetch.ts`
- Test: `tests/unit/research/fetch.test.ts` (extend)
- Test: `tests/unit/research/html-to-md.interop.test.ts` (new)

- [ ] **Step 1: Install the runtime deps**

Run:
```bash
npm install --save turndown @mozilla/readability jsdom
```
Expected: `package.json` `dependencies` now lists `turndown`, `@mozilla/readability`, `jsdom`; `package-lock.json` updated.

- [ ] **Step 2: Write the failing web-branch test** — append to `tests/unit/research/fetch.test.ts`:

```ts
describe('fetchSource — web', () => {
  const { fetchSource } = require('../../../lib/research/fetch');

  it('fetches HTML → markdown via the injected htmlToMd adapter (deterministic, no timestamp)', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => '<html><body><h1>T</h1><p>Body</p></body></html>' });
    const htmlToMd = (_html: string, _url: string) => '# T\n\nBody';
    const r = await fetchSource(cwd, 'https://example.com/post', { fetcher, htmlToMd });
    expect(r.kind).toBe('web');
    expect(r.slug).toMatch(/^web-example-com-[0-9a-f]{8}$/);
    const md = fs.readFileSync(r.filePath, 'utf8');
    expect(md).toContain('# T');
    expect(md).toContain('Body');
    expect(md).toMatch(/_Source: https:\/\/example\.com\/post_/);
    expect(md).not.toMatch(/fetched_at|\d{4}-\d\d-\d\dT/);
  });

  it('errors when extraction yields empty content', async () => {
    const cwd = tmp(); fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const fetcher = async () => ({ status: 200, headers: { get: () => null }, text: async () => '<html></html>' });
    const htmlToMd = () => '   ';
    await expect(fetchSource(cwd, 'https://example.com/x', { fetcher, htmlToMd })).rejects.toThrow(/empty|extract/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/unit/research/fetch.test.ts -t "fetchSource — web"`
Expected: FAIL — throws "web ingestion not yet implemented".

- [ ] **Step 4: Implement the default `htmlToMd` adapter + web branch** in `lib/research/fetch.ts`.

Add the default adapter (lazy `require` so arXiv-only use never loads the heavy deps) above `fetchSource`:

```ts
/** Default HTML→markdown: lazy-loads readability+turndown+jsdom only when invoked. */
function defaultHtmlToMd(html: string, url: string): string {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { JSDOM } = require('jsdom') as { JSDOM: new (h: string, o?: { url?: string }) => { window: { document: unknown } } };
  const { Readability } = require('@mozilla/readability') as { Readability: new (d: unknown) => { parse(): { title?: string; content?: string } | null } };
  const TurndownService = require('turndown') as new () => { turndown(html: string): string };
  /* eslint-enable @typescript-eslint/no-var-requires */
  const dom = new JSDOM(html, { url });
  const article = new Readability((dom.window as { document: unknown }).document).parse();
  const td = new TurndownService();
  const title = article && article.title ? article.title : '';
  const bodyHtml = article && article.content ? article.content : html;
  const body = td.turndown(bodyHtml);
  return (title ? `# ${title}\n\n` : '') + body;
}
```

Replace the web branch placeholder in `fetchSource` with exactly this (single, deterministic
form — appends a stable `_Source:` line, no timestamp):

```ts
  } else {
    const html = (await httpGet(d.ref, { fetcher: opts.fetcher })).body;
    const conv = opts.htmlToMd || defaultHtmlToMd;
    const converted = conv(html, d.ref).trim();
    if (!converted) throw new Error(`web: extraction produced empty content for ${d.ref}`);
    markdown = `${converted}\n\n_Source: ${d.ref}_\n`;
    canonicalUrl = d.ref;
  }
```

- [ ] **Step 5: Run the web test to verify it passes**

Run: `npx jest tests/unit/research/fetch.test.ts -t "fetchSource — web"`
Expected: PASS.

- [ ] **Step 6: Write the CJS interop test** — create `tests/unit/research/html-to-md.interop.test.ts`:

```ts
'use strict';
// Enforces that the declared web-ingestion deps are require()-compatible under CommonJS.
// Must FAIL (not skip) if a dep regresses to ESM-only, so CI catches it.
describe('web-ingestion deps CJS interop', () => {
  it('lazy-requires jsdom + @mozilla/readability + turndown and converts trivial HTML', () => {
    const { JSDOM } = require('jsdom');
    const { Readability } = require('@mozilla/readability');
    const TurndownService = require('turndown');
    const dom = new JSDOM('<html><body><article><h1>Hi</h1><p>There</p></article></body></html>', { url: 'https://example.com/' });
    const parsed = new Readability(dom.window.document).parse();
    const md = new TurndownService().turndown((parsed && parsed.content) || '<p>There</p>');
    expect(md).toMatch(/There/);
  });
});
```

- [ ] **Step 7: Run the interop test + full fetch suite + build**

Run: `npx jest tests/unit/research/fetch.test.ts tests/unit/research/html-to-md.interop.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/research/fetch.ts tests/unit/research/fetch.test.ts tests/unit/research/html-to-md.interop.test.ts
git commit -m "feat(research): web ingestion — lazy readability+turndown+jsdom adapter + CJS interop test (arxiv/web task 5)"
```

---

## Task 6: wire `cmdIngest` — route local vs arXiv/web

**Files:**
- Modify: `lib/research/cli-kb.ts`
- Test: `tests/unit/research/cli-kb.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append inside the `cli-kb` describe in `tests/unit/research/cli-kb.test.ts` (the file already imports `captureOutputAsync`, `captureErrorAsync`, `cmdIngest`, `fs`, `path`, `tmp`):

```ts
  describe('cmdIngest remote routing', () => {
    it('routes a local path to ingest() (no fetch)', async () => {
      const cwd = tmp();
      let fetched = 0; let ingested = '';
      fs.writeFileSync(path.join(cwd, 'a.md'), '# x');
      const deps = {
        ingest: async (_c: string, p: string) => { ingested = p; return { status: 'compiled', files: 1, detail: 'ok' }; },
        fetchSource: async () => { fetched++; return { filePath: 'X', slug: 's', kind: 'web' }; },
      };
      const res = await captureOutputAsync(() => cmdIngest(cwd, 'a.md', true, deps));
      expect(res.exitCode).toBe(0);
      expect(fetched).toBe(0);
      expect(ingested).toBe('a.md');
    });

    it('routes an arXiv id through fetchSource then ingest', async () => {
      const cwd = tmp();
      const calls: string[] = [];
      const deps = {
        ingest: async (_c: string, p: string) => { calls.push(`ingest:${p}`); return { status: 'compiled', files: 1, detail: 'ok' }; },
        fetchSource: async (_c: string, input: string) => { calls.push(`fetch:${input}`); return { filePath: '/abs/arxiv-2401.00001.md', slug: 'arxiv-2401.00001', kind: 'arxiv' }; },
      };
      const res = await captureOutputAsync(() => cmdIngest(cwd, '2401.00001', true, deps));
      expect(res.exitCode).toBe(0);
      expect(calls).toEqual(['fetch:2401.00001', 'ingest:/abs/arxiv-2401.00001.md']);
    });

    it('exits 1 with a clear message when fetch fails', async () => {
      const cwd = tmp();
      const deps = {
        ingest: async () => ({ status: 'compiled', files: 1, detail: 'ok' }),
        fetchSource: async () => { throw new Error('HTTP 404'); },
      };
      const res = await captureErrorAsync(() => cmdIngest(cwd, 'https://example.com/x', true, deps));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/HTTP 404/);
    });

    it('exits 1 on unrecognized input', async () => {
      const cwd = tmp();
      const res = await captureErrorAsync(() => cmdIngest(cwd, 'just-text', true, {
        ingest: async () => ({ status: 'compiled', files: 1, detail: 'ok' }),
      }));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/unrecognized|expected/i);
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/cli-kb.test.ts -t "cmdIngest remote routing"`
Expected: FAIL — current `cmdIngest` ignores detection and calls `ingest()` with the raw arg.

- [ ] **Step 3: Wire detection + routing into `cmdIngest`** in `lib/research/cli-kb.ts`.

Add the `fetch` typed require near the other requires (after the `ingest` require, ~line 11):
```ts
const { detectSource, fetchSource } = require('./fetch') as {
  detectSource: (cwd: string, input: string) => { kind: 'local' | 'arxiv' | 'web' | 'unknown'; ref: string };
  fetchSource: (cwd: string, input: string, opts?: Record<string, unknown>)
    => Promise<{ filePath: string; slug: string; kind: string }>;
};
```

Extend `IngestDeps`:
```ts
interface IngestDeps {
  ingest?: (cwd: string, inputPath: string) => Promise<{ status: string; files: number; detail: string }>;
  fetchSource?: (cwd: string, input: string, opts?: Record<string, unknown>)
    => Promise<{ filePath: string; slug: string; kind: string }>;
}
```

Replace the body of `cmdIngest`:
```ts
async function cmdIngest(cwd: string, inputPath: string, raw: boolean, deps: IngestDeps = {}): Promise<never> {
  if (!inputPath) error('ingest: a local .md path, an arXiv id/URL, or an http(s) URL is required');
  const run = deps.ingest || ingest;
  const fetchRemote = deps.fetchSource || fetchSource;

  const detected = detectSource(cwd, inputPath);
  let ingestPath = inputPath;
  if (detected.kind === 'unknown') {
    error(`ingest: unrecognized input "${inputPath}" — expected a local .md path, an arXiv id/URL, or an http(s) URL`);
  }
  if (detected.kind !== 'local') {
    try {
      const fetched = await fetchRemote(cwd, inputPath);
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

Run: `npx jest tests/unit/research/cli-kb.test.ts -t "cmdIngest remote routing"`
Expected: PASS.

- [ ] **Step 5: Full cli-kb suite + build**

Run: `npx jest tests/unit/research/cli-kb.test.ts && npm run build:check`
Expected: all PASS (existing local-ingest + synthesize tests unaffected); build OK.

- [ ] **Step 6: Commit**

```bash
git add lib/research/cli-kb.ts tests/unit/research/cli-kb.test.ts
git commit -m "feat(research): cmdIngest routes local vs arXiv/web (auto-detect) (arxiv/web task 6)"
```

---

## Task 7: gitignore staging-temp, coverage thresholds, docs, full-suite verification

**Files:**
- Modify: `.gitignore`
- Modify: `jest.config.js`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Ignore the staging temp file pattern** in `.gitignore` (the committed `.md` staging files stay tracked; only the transient `.<slug>.tmp` should never be committed). Add under the Tesserae section:
```
# Transient fetch staging temp files (the final .planning/fetched/*.md are committed)
.planning/fetched/.*.tmp
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: clean. (Fix any `no-unused-vars` — prefix unused args with `_`; the `defaultHtmlToMd` lazy requires are wrapped in the eslint-disable block shown in Task 5.)

- [ ] **Step 3: Measure coverage for the new files**

Run:
```bash
npx jest tests/unit/research/ --coverage --collectCoverageFrom='lib/research/url-guard.ts' --collectCoverageFrom='lib/research/fetch.ts' --coverageThreshold='{}' 2>&1 | grep -E "url-guard|fetch\.ts|% Stmts"
```
Note the measured `% Lines / % Funcs / % Branch` for each.

- [ ] **Step 4: Add per-file coverage thresholds** to `jest.config.js` (in the `coverageThreshold` block, after the `./lib/research/seed.ts` line). Set each number a few points BELOW the measured actuals from Step 3 (the real Node `fetch` and the lazy dep adapter are not unit-tested, so `fetch.ts` funcs/branches will be lower than the pure modules):
```js
    './lib/research/url-guard.ts': { lines: 90, functions: 100, branches: 85 },
    './lib/research/fetch.ts': { lines: 85, functions: 90, branches: 70 },
```
Adjust the literals to sit just under the Step-3 actuals if those are lower; never set them above measured.

- [ ] **Step 5: Document the feature** in `CLAUDE.md` — extend the existing autoresearch section. Under `## Autoresearch Loop`, change the ingest sentence to mention remote sources, and add a short subsection before `## Gotchas`:
```markdown
### Remote ingestion (arXiv / web)

`gd ingest <arg>` auto-detects the argument: an existing local `.md` path (ingested as today),
an arXiv id/URL (`2401.12345`, `arxiv:<id>`, `arxiv.org/abs|pdf/<id>` → fetched via the
dependency-free Atom API as title/authors/abstract markdown), or an `http(s)` URL (fetched and
converted to markdown via lazy-loaded readability+turndown+jsdom). Remote sources are normalized
to a deterministic staging file at `.planning/fetched/<slug>.md` (committed; provenance in
`.planning/fetched/fetch-manifest.json`) and then run through the normal `ingest()` pipeline.
A best-effort SSRF guard (`url-guard.ts`) blocks non-http(s) schemes, credentials-in-URL, and
loopback/private/link-local/metadata hosts on the initial URL and every redirect hop.
```

- [ ] **Step 6: Full research suite + build + lint**

Run: `npx jest tests/unit/research/ && npm run build:check && npm run lint`
Expected: all PASS; build OK; lint clean.

- [ ] **Step 7: Commit**

```bash
git add .gitignore jest.config.js CLAUDE.md
git commit -m "chore(research): gitignore fetch temp, coverage thresholds, docs for remote ingestion (arxiv/web task 7)"
```

---

## Self-review notes (author)

- **Spec coverage:** SSRF guard (T1), detection+slug (T2), fetch mechanism/redirect/caps (T3), arXiv Atom→md + atomic write + sidecar (T4), web lazy-deps adapter + CJS interop (T5), cmdIngest routing (T6), gitignore/coverage/docs (T7). Deterministic body (no timestamp), provenance sidecar, staging outside compile root, collision-resistant slug, cwd-relative detection — all covered.
- **Type consistency:** `DetectedSource{kind,ref}`, `FetchSourceResult{filePath,slug,kind}`, `Fetcher`/`FetchResponse`, `httpGet → {body,finalUrl,etag}` used identically across fetch.ts and cli-kb.ts. `detectSource`/`fetchSource`/`httpGet`/`slugFor`/`arxivAtomToMarkdown` exported from fetch.ts and required where used.
- **Carried risk:** DNS-rebinding pinning intentionally out of scope (best-effort guard per spec); web extraction fidelity is page-dependent (empty → error).
```
