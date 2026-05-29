# arXiv / Web Ingestion (Design)

- **Date:** 2026-05-28
- **Status:** Codex-reviewed (2×P1 + 4×P2 + 2×P3 folded in); ready for plan
- **Depends on:** SP2-B ingest/synthesize (merged), SP2-C seeding (merged).
- **Slice 2 of 4** remaining SP2 deferred slices (then PDF/session import → SP2-D hybrid retrieval).

## Motivation

`gd ingest` currently accepts only local markdown. This slice widens the input funnel: pull a
remote source (arXiv paper metadata, or a generic web page), normalize it to markdown, and feed
it through the **existing** ingest pipeline (hash → corpus copy → full-tree Tesserae compile →
per-file smoke-check). The scientific loop then grounds on that fetched knowledge.

## Locked decisions (from brainstorming + Codex review)

1. **Sources:** arXiv (by id or URL, via the structured Atom API) **and** generic `http(s)` web
   pages (HTML → markdown). PDF body extraction is a *separate later slice* — arXiv ingestion
   here is **metadata + abstract** only.
2. **Command surface:** overload `gd ingest <arg>` with auto-detection (local path | arXiv
   id/URL | `http(s)` URL). No new command.
3. **HTML → markdown:** `turndown` + `@mozilla/readability` + `jsdom`, **lazy-`require()`d**
   behind an `htmlToMd` adapter — loaded only when converting HTML. The arXiv path is
   **dependency-free**. (GRD is otherwise runtime-dependency-free; this keeps the common path
   lean and confines the heavy/ESM-risky deps to actual web ingestion.)

## Architecture

Reuse `ingest()` wholesale. A new `fetch.ts` fetches + normalizes a remote source into a
**stable, deterministic** staging markdown file *outside the compile root*, then calls the
existing `ingest(cwd, file)`. The remote path adds only *fetch + normalize*; all idempotency /
corpus / compile / smoke-check is reused.

| Unit | Change | Purpose |
|---|---|---|
| **`lib/research/fetch.ts`** (new) | new | `fetchSource(cwd, input, opts)` → detect type → validate → fetch → normalize → atomic-write `.planning/fetched/<slug>.md` → record provenance sidecar → return `{ filePath, slug, kind }`. Injectable `fetcher` + `htmlToMd`. |
| `lib/research/cli-kb.ts` `cmdIngest` | extend | detect input: existing local path → `ingest()` (today); arXiv id/URL or `http(s)` URL → `fetchSource()` then `ingest()` on the returned path. Inject `fetchSource` + `ingest` for offline CLI tests. |
| `lib/research/ingest.ts` | unchanged | reused as-is (staging file is a local `.md`). |
| `package.json` | add deps | `turndown`, `@mozilla/readability`, `jsdom` (lazy-loaded). |

`.gitignore` is **unchanged**: `.planning/fetched/` is committed (provenance); `corpus/` and
`.tesserae/` remain ignored as today.

### Staging is OUTSIDE the compile root (Codex P1)

`ingest()` compiles the full `.planning/research` tree, so a staging file placed under it would
be indexed twice (as itself + as its `corpus/` copy). The staging file therefore lives at
**`.planning/fetched/<slug>.md`** — a sibling of `research/`, **not** under the compile root.
`ingest()` copies it into `.planning/research/corpus/`, which is the only compiled artifact.
`.planning/fetched/` is committed (human-readable provenance of what was pulled).

### Source handling

- **arXiv** (`2401.12345`, `arxiv:<id>`, `arxiv.org/abs/<id>`, `arxiv.org/pdf/<id>`): fetch
  `https://export.arxiv.org/api/query?id_list=<id>` (Atom XML) → extract
  title/authors/abstract/categories/published via a small dependency-free parser → markdown.
- **Generic `http(s)` URL**: fetch HTML → `htmlToMd` adapter (lazy `require` of
  readability→main content, turndown→markdown, jsdom→DOM) → markdown.

### Normalized markdown is deterministic (Codex P3)

Staged md body = `# <title>\n\n_Source: <canonical-url>_\n\n<content>`. It contains **no fetch
timestamp** — a timestamp would change the bytes on every fetch and break ingest's content-hash
idempotency. Provenance that must not affect the content hash (`fetched_at`, `etag`, HTTP
status) is recorded only in a sidecar: `.planning/fetched/fetch-manifest.json`
(`{ slug, kind, canonicalUrl, fetchedAt, etag? }` per entry). The canonical source URL *is* in
the body (stable, useful provenance).

### Collision-resistant slug (Codex P2)

- arXiv: `arxiv-<id>` (ids are globally unique; strip version suffix consistently or keep it —
  keep `vN` so different versions are distinct sources).
- web: `web-<hostslug>-<sha1(canonicalUrl).slice(0,8)>` where `hostslug` is the sanitized host.
  The url-hash suffix guarantees distinct URLs never collapse to the same staging file / ingest
  manifest key, even if host+path sanitize to the same prefix.

### Detection precedence (Codex P2)

1. `fs.existsSync(input)` → local path → `ingest()` directly (today's behavior).
2. arXiv: `arxiv.org` `http(s)` URL (abs/pdf), or `arxiv:<id>`, or a **bare id matching
   `^\d{4}\.\d{4,5}(v\d+)?$`** with no path separators / `./` / file extension.
3. other `http(s)://` URL → generic web.
4. else → deterministic error (`ingest: unrecognized input "<x>" — expected a local .md path,
   an arXiv id/URL, or an http(s) URL`).

A nonexistent bare-id-looking string (e.g. `2401.12345`) is treated as arXiv — **documented**.

### Atomic staging write (Codex P2)

Write to `.planning/fetched/.<slug>.tmp` then `fs.renameSync` to the final path, so an
interrupted fetch never leaves a partial `.md` for `ingest()` to hash/compile. On any fetch or
normalize failure, nothing is written.

## Security — SSRF guard (Codex P1)

`assertFetchableUrl(url)` runs before every fetch **and on every redirect target**:
- scheme must be `http` or `https` (reject `file:`, `ftp:`, `data:`, etc.);
- reject embedded credentials (`user:pass@host`);
- reject host = `localhost`/`*.localhost`, loopback (`127.0.0.0/8`, `::1`), private
  (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, `fe80::/10`),
  unspecified (`0.0.0.0`, `::`);
- cap redirects at 5; re-validate each hop; never auto-follow to a non-http(s) target.

The arXiv host (`export.arxiv.org`) is fixed, so the arXiv path is inherently safe but still
passes through the same guard.

## Network error handling

All failures produce a deterministic, user-facing `ingest: <reason>` error and exit 1; nothing
is staged. Covered:
- request timeout (default 30s; `AbortController`);
- response size cap (default 5 MB; abort once exceeded);
- non-2xx HTTP status;
- DNS / connect / TLS failure;
- malformed arXiv Atom XML, or no `<entry>` for the id;
- empty arXiv abstract;
- empty/failed readability extraction on a web page;
- redirect limit exceeded or redirect to a guard-rejected target.

## Testing (deterministic; inject `fetcher` / `htmlToMd`; inject `fetchSource` into `cmdIngest`)

- **`fetch.ts`**
  - arXiv: canned Atom XML → markdown with title/authors/abstract/categories; no `<entry>` →
    error; empty abstract → error.
  - web: canned HTML via injected `htmlToMd` → markdown with title + source header.
  - slug determinism + collision resistance (two distinct URLs with same host+path prefix →
    different slugs; same URL → same slug).
  - deterministic body: two fetches of identical content → byte-identical staged md (idempotent
    under ingest).
  - atomic write: no partial file remains on a normalize failure.
  - SSRF guard: rejects `file://`, `http://localhost`, `http://127.0.0.1`, `http://10.0.0.1`,
    `http://169.254.169.254`, `http://user:pass@host`, and a redirect to any of these.
  - detection precedence: existing local path; `arxiv.org/abs/...`; bare `2401.12345`;
    `arxiv:...`; generic URL; non-arxiv bare string with a `/` is NOT treated as arXiv;
    unrecognized → error.
  - network errors: non-2xx, timeout (injected fetcher rejects/aborts), oversized response.
- **`cli-kb.ts`**: `cmdIngest` routes local vs arXiv vs URL to the correct path with injected
  fake `fetchSource` + `ingest`; offline; remote-fetch failure surfaces as exit-1.
- **CJS interop smoke test**: one test that lazy-`require()`s turndown + @mozilla/readability +
  jsdom and converts a trivial HTML string; `it.skip`-guarded if the deps are not installed, so
  the suite never hard-fails on environments without them.
- Per-file coverage threshold for `fetch.ts` set to deterministic-test actuals (the real Node
  `fetch` and the lazy dep adapter are not unit-tested directly).

## Scope / non-goals (YAGNI)

- No auth/custom headers/cookies; no JS-rendered (SPA) pages; no PDF body extraction; no caching
  beyond ingest's existing content-hash idempotency; no batch/multi-URL in one invocation
  (one source per `gd ingest`).

## Open risks

1. **Web extraction fidelity** is page-dependent; readability can mis-detect main content on
   unusual layouts. Mitigation: empty/failed extraction → clear error rather than ingesting junk.
2. **Dependency/ESM friction**: if a future major of readability/turndown ships ESM-only, the
   lazy `require` adapter is the single place to adapt (e.g. dynamic `import()`); arXiv ingestion
   is unaffected.
3. **arXiv API shape** could change; the parser is tolerant (regex/field extraction) and fails
   with a clear error rather than corrupting the KB.
