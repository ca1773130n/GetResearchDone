---
phase: 97-transitive-citation-graph-traversal
plan: 02
subsystem: citations-gates
tags: [citations, gates, transitive, auto-retrieval, config]
dependency_graph:
  requires: ["97-01"]
  provides: ["fetchExternalPaper", "checkTransitiveCitationGate", "transitive_citation_gate-config"]
  affects: ["lib/citations.ts", "lib/gates.ts", "lib/types.ts", "lib/utils.ts"]
tech_stack:
  added: []
  patterns: ["injectable-fetchFn", "arXiv-first-SS-fallback", "warning-severity-gate", "typed-require"]
key_files:
  created: []
  modified:
    - lib/citations.ts
    - lib/gates.ts
    - lib/types.ts
    - lib/utils.ts
    - tests/unit/citations.test.ts
    - tests/unit/gates.test.ts
decisions:
  - "fetchExternalPaper uses injectable fetchFn pattern (same as resolveCitations) — timeoutMs hardcoded to 5000, no ApiConfig argument"
  - "checkTransitiveCitationGate produces warning (not error) severity violations — transitive dependencies are informational, not blocking"
  - "transitive_citation_gate default is false — opt-in via config, consistent with citation_gate pattern"
  - "traverseCitationGraph called via typed require inside checkTransitiveCitationGate to avoid circular import at module load time"
metrics:
  duration: "6 minutes"
  completed: "2026-03-25"
  tasks_completed: 2
  files_modified: 6
---

# Phase 97 Plan 02: fetchExternalPaper + transitive citation gate

External paper auto-retrieval via arXiv/Semantic Scholar and a warning-severity transitive citation gate wired end-to-end from config to GATE_REGISTRY.

## What Was Built

### Task 1: fetchExternalPaper in lib/citations.ts

Added `fetchExternalPaper(slug, fetchFn?)` after `resolveCitations`. The function:

- Uses the same injectable `fetchFn` pattern established in Phase 93, with `defaultFetchFn` as the default
- arXiv-first strategy: queries `export.arxiv.org/api/query?search_query=ti:{slug}&max_results=1`, extracts summary using `extractArxivSummary`
- Semantic Scholar fallback (only when arXiv summary is null): queries `api.semanticscholar.org/graph/v1/paper/search?query={slug}&limit=1`, extracts abstract using `extractSemanticAbstract`
- On success: returns `CitationNode{slug, title: slug, resolved: true, priority: 'normal', technique_summary: summary, missing_components: [], borrowed_components: []}`
- On failure (both APIs null): writes `[grd] WARNING: fetchExternalPaper: could not resolve "{slug}" from arXiv or Semantic Scholar\n` to `process.stderr`, returns `null`
- Wrapped in outer `try/catch` — returns `null` on any thrown error
- Exported from `module.exports`

3 new tests in `tests/unit/citations.test.ts` under `describe('fetchExternalPaper')`:
1. arXiv success path — returns resolved CitationNode
2. arXiv null → SS success fallback — returns resolved CitationNode
3. Both APIs null — returns null + writes WARNING to stderr

### Task 2: transitive_citation_gate config key + checkTransitiveCitationGate

**lib/types.ts**: Added `transitive_citation_gate?: boolean` to `GrdConfig` interface with JSDoc.

**lib/utils.ts**: Added `'transitive_citation_gate'` to `KNOWN_CONFIG_KEYS` set and `transitive_citation_gate: false` default in `loadConfig()`.

**lib/gates.ts**:
- Added `import type { TraversalOptions, TraversalResult, CitationGraph }` from types
- Implemented `checkTransitiveCitationGate(cwd, _opts)` following the `checkCitationGate` pattern:
  - Returns empty violations if `transitive_citation_gate !== true` (default disabled)
  - Returns empty violations if `PAPERS.md` does not exist (non-blocking)
  - Calls `buildCitationGraph` then `traverseCitationGraph` (via typed require to avoid circular import)
  - Emits `GateViolation{code: 'CITATION_UNRESOLVED_TRANSITIVE', severity: 'warning'}` for each `unresolved_leaves` node
  - Entire traversal wrapped in try/catch — non-blocking on any error
- Registered in `GATE_CHECKS` as `'transitive-citation-gate'`
- Registered in `GATE_REGISTRY['plan-phase']` after `'citation-gate'`
- Exported from `module.exports`

4 new tests in `tests/unit/gates.test.ts` under `describe('checkTransitiveCitationGate')`:
1. Returns empty when flag is false (default) — no PAPERS.md needed
2. Returns empty when flag is true but PAPERS.md absent
3. Returns `CITATION_UNRESOLVED_TRANSITIVE` warning violations for unresolved leaf nodes
4. Registry check: `'transitive-citation-gate'` in `GATE_REGISTRY['plan-phase']`

## Verification Results

```
PASS tests/unit/citations.test.ts
PASS tests/unit/gates.test.ts
Tests: 118 passed, 118 total

citations.ts: lines=97.45%, branches=87.68%, functions=89.28%
gates.ts:     lines=100%,  branches=81.92%, functions=100%
```

All thresholds met:
- gates.ts: lines=100% (threshold: 100%), functions=100% (threshold: 100%), branches=81.92% (threshold: >=81%) — PASS
- citations.ts: lines=97.45% (threshold: >=85%) — PASS

lint: clean | build:check: clean

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `lib/citations.ts` exports `fetchExternalPaper`
- [x] `lib/gates.ts` exports `checkTransitiveCitationGate`
- [x] `GATE_REGISTRY['plan-phase']` includes `'transitive-citation-gate'`
- [x] `GrdConfig.transitive_citation_gate` field in `lib/types.ts`
- [x] `'transitive_citation_gate'` in `KNOWN_CONFIG_KEYS` and `loadConfig` default in `lib/utils.ts`
- [x] 3 citations tests pass, 4 gates tests pass (118 total)
- [x] npm run build:check passes
- [x] npm run lint passes
- [x] gates.ts lines=100%, functions=100%, branches>=81%

## Self-Check: PASSED
