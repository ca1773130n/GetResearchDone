# PDF / Session Import (Design)

- **Date:** 2026-05-30
- **Status:** Brainstormed; ready for Codex review + plan
- **Depends on:** SP2-B ingest/synthesize (merged), SP2-C seeding (merged), arXiv/web ingestion (merged, slice 2).
- **Slice 3 of 4** remaining SP2 deferred slices (then SP2-D hybrid retrieval).

## Motivation

Two more input adapters into the research KB, both feeding the existing normalize→`ingest()`
backbone established in slice 2:
1. **PDF** — ingest a paper's full body (local `.pdf`, a direct `.pdf` URL, or an arXiv PDF via
   a `--pdf` flag). Completes the "arXiv body text" deferred from slice 2.
2. **Session import** — ingest GRD's own past Claude Code / Codex session transcripts
   (`.jsonl`) so prior reasoning becomes grounding for the loop.

## Locked decisions (from brainstorming)

1. **Both adapters in one slice.**
2. **PDF extraction:** `pdfjs-dist`, lazy-loaded. Because current pdfjs majors are **ESM-only**,
   the lazy loader uses dynamic `await import('pdfjs-dist/legacy/build/pdf.mjs')` (works from
   CommonJS), not `require()`.
3. **arXiv unchanged by default:** arXiv ids/URLs still ingest metadata+abstract (slice 2). Full
   PDF body only via an explicit `.pdf` file, a direct non-arXiv `.pdf` URL, or `gd ingest --pdf
   <arxiv-id|url>`.
4. **Session import:** GRD-native `.jsonl` → markdown → `ingest()` (no coupling to Tesserae's
   own sessions-import project).

## Architecture

Same backbone as slice 2: two new `detectSource` kinds (`pdf`, `session`); each normalized to a
deterministic staging `.md` at `.planning/fetched/<slug>.md` (outside the compile root,
provenance sidecar), then handed to the unchanged `ingest()`. Parser-heavy logic lives in two
new focused modules so `fetch.ts` stays the orchestrator.

| Unit | Change | Purpose |
|---|---|---|
| **`lib/research/pdf.ts`** (new) | new | `pdfToMarkdown(bytes, opts?): Promise<string>` — lazy-loads pdfjs (dynamic import), extracts text per page → markdown. `loader` injectable for tests. |
| **`lib/research/session.ts`** (new) | new | `sessionJsonlToMarkdown(text): string` — pure parser: Claude Code / Codex `.jsonl` → readable transcript markdown. |
| `lib/research/fetch.ts` | extend | `detectSource` adds `pdf` + `session`; refactor the guard+redirect+caps loop into `httpResolve`; add `httpGetBytes` (binary sibling of `httpGet`); `fetchSource` routes pdf/session → stage. |
| `lib/research/cli-kb.ts` `cmdIngest` | extend | accept a `pdfBody?` flag (and inject `fetchSource`/parsers for tests); route the new kinds. |
| `bin/grd-tools.ts` ingest case | extend | parse `--pdf` and pass it to `cmdIngest`; use the first non-flag arg as the path. |
| `package.json` | add dep | `pdfjs-dist` (lazy, ESM via dynamic import). |

### Detection (revised precedence)

`detectSource(cwd, input, opts?: { pdfBody?: boolean })`. The suffix-based `pdf`/`session` rules
**must run before the existing-local-path check** — otherwise an existing `paper.pdf` is
classified `local` and `ingest()` (which only collects `.md`) silently ignores it. Full order:

1. **`pdfBody` + arXiv input** (`arxiv:`/bare id/`arxiv.org/abs|pdf/<id>`) → `pdf` (ref = the
   bare arXiv id). Checked first so `--pdf` overrides the slice-2 metadata route.
2. **local `.pdf` suffix** (exists or not) → `pdf` (ref = path).
3. **`http(s)` URL whose path ends `.pdf`, host ≠ `arxiv.org`** → `pdf` (ref = url).
4. **local `.jsonl` suffix** → `session` (ref = path).
5. existing local path → `local` (covers `.md` files and directories — slice 1/2 behavior).
6. arXiv id/`arxiv:`/`arxiv.org/abs|pdf/<id>` **without `pdfBody`** → `arxiv` (metadata; slice 2
   unchanged).
7. other `http(s)://` URL → `web`.
8. path-like local (`.md` suffix or contains a separator) → `local`.
9. else → `unknown`.

`fetchSource` re-derives the PDF sub-source from `ref` (no extra field needed): `ref` matching
the bare-arXiv-id pattern → fetch `https://arxiv.org/pdf/<id>`; `ref` starting `http(s)://` →
`httpGetBytes(ref)`; otherwise a local path → `fs.readFileSync`. A `.pdf`/`.jsonl` that doesn't
exist still classifies by suffix, so the read reports a clear not-found error.

### Shared HTTP refactor (DRY)

Extract the guard + manual-redirect + caps loop into `httpResolve(url, opts) → FetchResponse`
(re-validates every hop via `assertFetchableUrl`). `httpGet` wraps it with `.text()`;
`httpGetBytes` wraps it with `.arrayBuffer()` → `Buffer`. PDF byte cap defaults to 25 MB
(papers are larger than web pages); text cap stays 5 MB.

### Data flow

1. `cmdIngest` detects kind (+ `pdfBody`). Local `.md` → `ingest()` directly.
2. `pdf`/`session`/`arxiv`/`web` → `fetchSource()` → staging `.md` → `ingest()`.
3. `fetchSource` by kind:
   - **pdf-local:** `fs.readFileSync` → `pdfToMarkdown(bytes)` → stage
   - **pdf-remote / pdf-arxiv:** `httpGetBytes(url)` → `pdfToMarkdown` → stage (arXiv builds
     `https://arxiv.org/pdf/<id>`)
   - **session:** read `.jsonl` text → `sessionJsonlToMarkdown` → stage
4. Staging md body carries a `_Source: <path-or-url>_` line; **no fetch timestamp** (preserves
   ingest content-hash idempotency). Provenance (`kind`, canonicalUrl/path) → sidecar.

### Staging slugs

`pdf-<basenameSlug>-<sha1(ref).slice(0,8)>`, `arxiv-pdf-<id>`,
`session-<basenameSlug>-<sha1(ref).slice(0,8)>`. Distinct sources never collide.

## PDF extraction (`pdf.ts`)

`pdfToMarkdown(bytes: Uint8Array, opts?: { loader?: () => Promise<PdfLib> }): Promise<string>`:
- `loader` defaults to `() => import('pdfjs-dist/legacy/build/pdf.mjs')`; injectable.
- `getDocument({ data: bytes })` → iterate `1..numPages`, `page.getTextContent()`, join item
  `str`s with spaces, separate pages with a blank line; collapse runs of >2 newlines.
- No heading inference (PDF text lacks reliable structure).
- **Errors (throw):** 0 pages; empty extracted text (scanned/image-only PDF); encrypted
  (`PasswordException`); non-PDF/garbage bytes (loader/getDocument throws).
- Deterministic: identical bytes → identical markdown.

## Session normalization (`session.ts`)

`sessionJsonlToMarkdown(text: string): string` — pure, no I/O:
- Split on newlines; `JSON.parse` each non-empty line; **skip** blank/unparseable lines.
- Recognize a turn from either `{ message: { role, content } }` (Claude Code) or
  `{ role, content }` (Codex); `content` may be a string or an array of blocks.
- Block rendering: text → as-is; `tool_use` → `> tool: <name>(<short, truncated args>)`;
  `tool_result` → truncated text. Other block types → skipped.
- Output: `## <role>` section per turn, in file order.
- **Error (throw):** no parseable turns / empty.
- Deterministic: derived purely from file content (transcript timestamps are source content,
  kept as-is) → byte-identical md on re-ingest of the same file.

## Error handling

Every failure → a deterministic `ingest: <reason>` message and exit 1; nothing is staged.
- PDF: parse failure, empty text, encrypted, non-PDF bytes.
- remote PDF: reuses `httpGet`/`httpGetBytes` errors (timeout, non-2xx, oversize >25 MB,
  redirect-guard rejection, DNS/TLS).
- session: file unreadable, no parseable turns, empty.

## Testing (deterministic; inject `loader`/`fetcher`; pure session parser)

- **`session.ts`**: Claude Code jsonl → md (roles/text/tool-summary); Codex jsonl shape; tolerant
  of interspersed bad/blank lines; empty/no-turns → throws.
- **`pdf.ts`**: injected fake `loader` returning a stub doc with N pages → md; 0-page and
  empty-text → throws; loader-throws (encrypted) surfaced as a clear error.
- **`fetch.ts`**: detection for local `.pdf`, remote `.pdf` (non-arXiv), local `.jsonl`, and
  `pdfBody` arXiv; `httpGetBytes` (binary, redirect-guard re-validation, 25 MB cap) with a fake
  fetcher returning `arrayBuffer`; `fetchSource` pdf/session branches write staging md + sidecar;
  deterministic-body check (two runs byte-identical).
- **`cli-kb.ts`**: `cmdIngest` routes pdf/session to `fetchSource` then `ingest`; `--pdf` arXiv
  body path; unrecognized/error paths; all offline via injected fakes.
- **CJS/ESM interop (real `node` subprocess; must FAIL not skip):** `await
  import('pdfjs-dist/legacy/build/pdf.mjs')` and run `getDocument` on a tiny inline PDF buffer,
  asserting extracted text. Catches an ESM/packaging regression in the real runtime.
- Per-file coverage thresholds for `pdf.ts` + `session.ts` set just below measured actuals (the
  default dynamic-import loader is not unit-tested).

## Scope / non-goals (YAGNI)

- No OCR (scanned/image-only PDFs → clear empty-text error, not silent junk).
- No PDF column/layout/table reconstruction; linear text extraction only.
- No multi-file or batch ingestion in one invocation (one source per `gd ingest`).
- No session-id resolution / config-dir discovery — the user passes the `.jsonl` path directly.
- No streaming; whole-file/whole-response in memory under the size caps.

## Open risks

1. **PDF extraction fidelity** is layout-dependent; multi-column papers may interleave text.
   Acceptable for KG grounding; empty extraction → error rather than junk.
2. **pdfjs ESM packaging** could shift across majors; the dynamic-import loader + the
   real-`node` interop test localize and detect any breakage. The metadata-only arXiv path
   (slice 2) is unaffected and remains the dependency-free default.
3. **Session jsonl schema drift** across Claude Code / Codex versions; the parser is tolerant
   (skips unrecognized lines/blocks) and errors only when nothing parses.
