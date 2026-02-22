# Evaluation Plan: Phase 54 — Markdown Splitting Infrastructure

**Designed:** 2026-02-22
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Token-threshold markdown splitting with index file reassembly, transparent reader integration
**Reference papers:** None — this is a software engineering phase, not a research phase. Metrics are derived from requirements and codebase conventions.

## Evaluation Overview

Phase 54 introduces `lib/markdown-split.js` with six exported functions and wires a transparent `safeReadMarkdown()` integration across `state.js`, `roadmap.js`, `context.js`, `tracker.js`, and `paths.js`. The phase is driven by REQ-60 (auto-detect and split files exceeding ~25,000 tokens) and REQ-61 (index format with transparent reassembly for all readers).

This is a pure software engineering phase with no paper-derived metrics. Evaluation focuses on three verifiable properties: (1) the splitting module operates correctly on synthetic inputs without errors, (2) splitting and reassembly form a lossless round-trip, and (3) the reader integration is truly transparent — callers see no difference from a single-file read.

The critical limitation of in-phase evaluation is that we cannot verify behavior on real-world large files (STATE.md, ROADMAP.md at production scale). That deferred validation is tracked as DEFER-54-01 and will be resolved in Phase 57. The proxy metrics in this plan — test coverage, round-trip correctness on synthetic payloads, and idempotency — are well-evidenced as quality proxies given the purely algorithmic nature of the feature.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit test pass rate | Codebase convention: TDD, 1,983 tests baseline | Tests are the primary correctness signal for all lib/ modules |
| Line coverage >= 85% | jest.config.js per-file thresholds (enforced in CI) | Project policy; all new lib/ modules must meet floor |
| Round-trip fidelity (split + reassemble = original) | REQ-61 correctness requirement | Direct measure of the fundamental guarantee |
| Idempotency (re-split of split file = no change) | REQ-61 success criteria item 5 | Prevents runaway file proliferation |
| Index marker presence (<!-- GRD-INDEX -->) | Plan 54-01 spec | Required format for format detection |
| Threshold boundary (files below limit untouched) | REQ-60 success criteria | Core conditional — wrong threshold = spurious splits |
| No regressions in existing test suite | Phase 57 integration gate (baseline: 1,983 tests) | New readers must not break existing callers |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic module load, format correctness, crash-free operation |
| Proxy (L2) | 4 | Test coverage, round-trip fidelity, idempotency, threshold correctness |
| Deferred (L3) | 1 | Real-world large file splitting validated at Phase 57 |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module loads without errors
- **What:** `lib/markdown-split.js` can be required with no import-time exceptions
- **Command:** `node -e "const m = require('./lib/markdown-split'); console.log(Object.keys(m).sort().join(','))"`
- **Expected:** Comma-separated list containing: `estimateTokens,findSplitBoundaries,isIndexFile,readMarkdownWithPartials,reassembleFromIndex,splitMarkdown`
- **Failure means:** Module has a syntax error, missing dependency, or incomplete exports — blocks all downstream work

### S2: Token estimator produces plausible values
- **What:** `estimateTokens()` returns a numeric estimate in the expected range for known inputs
- **Command:** `node -e "const {estimateTokens} = require('./lib/markdown-split'); const t = estimateTokens('hello world'); console.log(typeof t === 'number' && t > 0 && t < 10)"`
- **Expected:** `true`
- **Failure means:** Token estimation is broken or returns wrong type — all threshold decisions will be incorrect

### S3: Small file is left untouched by splitMarkdown
- **What:** A file well below the 25,000-token threshold produces a result indicating no split is needed
- **Command:** `node -e "const {splitMarkdown} = require('./lib/markdown-split'); const res = splitMarkdown('# Title\n\nSmall content.', {threshold: 25000}); console.log(res.split_performed === false || res.parts === undefined || (Array.isArray(res.parts) && res.parts.length === 0))"`
- **Expected:** `true` (the function signals no-op for sub-threshold files)
- **Failure means:** Splitting is triggered on small files — every GRD planning file would be unnecessarily fragmented

### S4: Index marker is present in index output
- **What:** When a file is split, the output index string contains the `<!-- GRD-INDEX -->` marker
- **Command:** `node -e "const {splitMarkdown} = require('./lib/markdown-split'); const bigContent = '## Section\\n\\n' + 'word '.repeat(30000); const res = splitMarkdown(bigContent, {threshold: 1000}); const index = Array.isArray(res.index) ? res.index : res.index_content; console.log(typeof res.index_content === 'string' ? res.index_content.includes('GRD-INDEX') : JSON.stringify(res).includes('GRD-INDEX'))"`
- **Expected:** `true`
- **Failure means:** Index format is malformed — `isIndexFile()` won't be able to detect split files and reassembly will fail silently

### S5: isIndexFile correctly classifies content
- **What:** `isIndexFile()` returns true for index-marker content and false for normal markdown
- **Command:** `node -e "const {isIndexFile} = require('./lib/markdown-split'); console.log(isIndexFile('<!-- GRD-INDEX -->\n') + ',' + isIndexFile('# Normal file\n\nContent here.'))"`
- **Expected:** `true,false`
- **Failure means:** Reader integration cannot distinguish between single-file and split formats — all reads will either always or never attempt reassembly

### S6: Unit tests pass with zero failures
- **What:** The complete unit test file for `lib/markdown-split.js` runs without any failures
- **Command:** `npx jest tests/unit/markdown-split.test.js --verbose 2>&1 | tail -20`
- **Expected:** Output shows `Tests: N passed, 0 failed` with no error traces
- **Failure means:** The implementation does not match the spec — do not proceed to Plan 54-02 reader integration

**Sanity gate:** ALL six sanity checks must pass. Any failure blocks progression to Plan 54-02 (Reader Integration).

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality and correctness.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Results should be treated with appropriate skepticism until DEFER-54-01 is resolved.

### P1: Test coverage >= 85% lines on lib/markdown-split.js
- **What:** The fraction of lines in `lib/markdown-split.js` executed during unit tests
- **How:** Run Jest with coverage collection on the new module
- **Command:** `npx jest tests/unit/markdown-split.test.js --coverage --coverageDirectory=coverage/phase-54 2>&1 | grep 'markdown-split'`
- **Target:** >= 85% lines (project-wide floor from `jest.config.js`). Aim for >= 90% given the algorithmic nature of this module.
- **Evidence:** All 20 existing lib/ modules have per-file thresholds enforced in `jest.config.js`. Consistent 85%+ coverage has caught regressions in Phases 50-53 for this project.
- **Correlation with full metric:** HIGH — low coverage on an algorithmic splitting module directly predicts undiscovered edge cases. The module has no I/O side effects (pure logic), making coverage a reliable proxy.
- **Blind spots:** Coverage does not catch semantic correctness. A test could cover a line while asserting the wrong thing. Only the round-trip test (P2) catches semantic failures.
- **Validated:** No — awaiting confirmation that coverage holds with real-world inputs (Phase 57)

### P2: Round-trip fidelity on synthetic payloads
- **What:** Splitting a synthetic large file and then reassembling it produces content identical to the original
- **How:** Use a temporary directory to write partials, call splitMarkdown, write each partial to disk, call reassembleFromIndex, compare to original
- **Command:** `node -e "
const fs = require('fs');
const os = require('os');
const path = require('path');
const {splitMarkdown, reassembleFromIndex} = require('./lib/markdown-split');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-rt-'));
const content = Array.from({length: 50}, (_, i) => '## Section ' + i + '\n\n' + 'paragraph '.repeat(200)).join('\n\n');
const result = splitMarkdown(content, {threshold: 5000, basename: 'TEST'});
fs.writeFileSync(path.join(tmpDir, 'TEST.md'), result.index_content);
result.parts.forEach((part, i) => fs.writeFileSync(path.join(tmpDir, 'TEST-part' + (i+1) + '.md'), part.content));
const reassembled = reassembleFromIndex(path.join(tmpDir, 'TEST.md'));
console.log(reassembled.trim() === content.trim() ? 'PASS' : 'FAIL');
fs.rmSync(tmpDir, {recursive: true});
"`
- **Target:** `PASS`
- **Evidence:** REQ-61 success criteria item 4 explicitly states "round-trip integrity: splitting a file and then reading it back produces identical logical content to the original unsplit file." This test directly operationalizes that requirement.
- **Correlation with full metric:** HIGH — round-trip identity on synthetic content is the best available proxy for correct reassembly on real-world files. The algorithm is deterministic, so a synthetic pass strongly predicts real-world correctness.
- **Blind spots:** The synthetic payload uses simple repeated patterns. Real-world STATE.md and ROADMAP.md contain frontmatter, YAML-like fields, nested markdown, HTML comments, and unicode characters. Edge cases in parsing these may not be caught by this proxy.
- **Validated:** No — awaiting DEFER-54-01 validation at Phase 57

### P3: Idempotency on already-split input
- **What:** Running splitMarkdown on an index file (already split) produces no change
- **How:** Generate a split, then pass the index file through splitMarkdown again and verify no new split occurs
- **Command:** `node -e "
const fs = require('fs');
const os = require('os');
const path = require('path');
const {splitMarkdown, isIndexFile} = require('./lib/markdown-split');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-idem-'));
const content = Array.from({length: 50}, (_, i) => '## Section ' + i + '\n\n' + 'word '.repeat(200)).join('\n\n');
const result = splitMarkdown(content, {threshold: 5000, basename: 'TEST'});
fs.writeFileSync(path.join(tmpDir, 'TEST.md'), result.index_content);
result.parts.forEach((part, i) => fs.writeFileSync(path.join(tmpDir, 'TEST-part' + (i+1) + '.md'), part.content));
const indexContent = fs.readFileSync(path.join(tmpDir, 'TEST.md'), 'utf-8');
const result2 = splitMarkdown(indexContent, {threshold: 5000, basename: 'TEST'});
console.log(result2.split_performed === false ? 'PASS' : 'FAIL: split triggered on index file');
fs.rmSync(tmpDir, {recursive: true});
"`
- **Target:** `PASS`
- **Evidence:** REQ-61 success criteria item 5 states "the split operation is idempotent (re-running on already-split files produces no changes)." Without idempotency, any automated trigger (file-save hooks, CI pre-processing) would multiply partials infinitely.
- **Correlation with full metric:** HIGH — this is a direct functional requirement test, not an indirect proxy.
- **Blind spots:** Only tests one idempotency condition. Does not test re-running on a file that was partially split (some partials missing). Does not test concurrent writes.
- **Validated:** No — awaiting Phase 57

### P4: Reader integration transparency (no regressions on existing tests)
- **What:** After wiring safeReadMarkdown() into state.js, roadmap.js, context.js, tracker.js, and paths.js, all existing unit tests continue to pass
- **How:** Run the full test suite after Plan 54-02 integration is complete
- **Command:** `npx jest --testPathIgnorePatterns=tests/unit/markdown-split.test.js 2>&1 | tail -10`
- **Target:** All 1,983 existing tests pass. Zero new failures.
- **Evidence:** Reader integration is declared transparent in REQ-61. The strongest available proxy for "callers see no difference" is that all existing tests (which make real reads from state.js, roadmap.js, etc.) continue to pass unchanged. Existing tests use fixture files that are all sub-threshold — so they exercise the no-split branch of safeReadMarkdown().
- **Correlation with full metric:** MEDIUM — existing tests exercise the no-split path only. They do not exercise the split-path reassembly in reader context. The deferred validation (DEFER-54-01) covers the split-path in readers.
- **Blind spots:** Existing tests use small fixture files. The integration gate (no regressions) only validates the code path where files are below threshold and safeReadMarkdown delegates to standard fs.readFileSync. The split-path code in readers is not exercised.
- **Validated:** No — reader split-path not validated until Phase 57

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or real-world inputs not available in-phase.

### D1: Real-world large file splitting — DEFER-54-01
- **What:** Markdown splitting produces correct partials when applied to real-world large files (STATE.md, ROADMAP.md) at production scale. Specifically: partials are coherent at heading boundaries, index links resolve correctly on disk, reassembled content is identical to original, and the GRD workflow continues to function normally after splitting.
- **How:** At Phase 57, generate or use genuinely large STATE.md and ROADMAP.md files (>25,000 tokens), run the split via the `markdown-split` CLI command, verify each partial file, reassemble via `readMarkdownWithPartials`, diff against original, then run a full GRD workflow operation (e.g., `state load`, `roadmap get-phase`) on the split files and confirm the output matches the pre-split baseline.
- **Why deferred:** No production-scale planning files exist during Phase 54 development. The evolve loop (Phases 55-56) will grow STATE.md and ROADMAP.md over time. Phase 57 has real evolved files to test against.
- **Validates at:** Phase 57 (Integration & Validation)
- **Depends on:** Phase 55 (evolve loop may grow planning files to real split-inducing sizes), Phase 57 integration test suite
- **Target:** Reassembled content SHA256 matches original file SHA256. All GRD readers return correct parsed data (same as reading the unsplit file). No data loss or reordering at split boundaries.
- **Risk if unmet:** Markdown files used by the evolve loop may silently corrupt when split and reassembled — iteration state, phase plans, and roadmap content could be lost. This would require a bug fix phase before evolve can be trusted in production.
- **Fallback:** If split-path reassembly has bugs, revert reader integration to single-file only and re-implement reassembly with a stricter boundary detection algorithm. Budget: 1 bug-fix phase (Phase 57 can absorb this if caught early).

## Ablation Plan

**No ablation plan** — Phase 54 implements a single coherent feature (markdown splitting + reader integration) with no independent sub-components that can be individually disabled and compared. The six functions in `lib/markdown-split.js` are mutually dependent; disabling any one would prevent meaningful evaluation of the rest.

The closest thing to an ablation is the distinction between Plan 54-01 (core module TDD) and Plan 54-02 (reader integration). S6 (unit tests pass) serves as the gate between these two plans and provides that isolation naturally.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing test suite | All 1,983 tests passing before Phase 54 starts | 1,983/1,983 pass | STATE.md (Performance Metrics) |
| lib/ coverage floor | Per-file 85% lines for all lib/ modules | >= 85% per file | jest.config.js |
| Zero regression | After reader integration, existing tests unchanged | 0 new failures | Phase 54 success criteria #4 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/markdown-split.test.js    (created during Plan 54-01 execution)
```

**How to run sanity checks (all Level 1):**
```bash
node -e "const m = require('./lib/markdown-split'); console.log(Object.keys(m).sort().join(','))"
npx jest tests/unit/markdown-split.test.js --verbose
```

**How to run proxy metrics:**
```bash
# P1: Coverage
npx jest tests/unit/markdown-split.test.js --coverage

# P2: Round-trip fidelity (inline script, see command above)
# P3: Idempotency (inline script, see command above)

# P4: Regression check after Plan 54-02
npx jest 2>&1 | tail -5
```

**How to run full test suite (regression gate):**
```bash
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module loads | | | |
| S2: Token estimator | | | |
| S3: Small file untouched | | | |
| S4: Index marker present | | | |
| S5: isIndexFile classifies | | | |
| S6: Unit tests pass | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Line coverage | >= 85% | | | |
| P2: Round-trip fidelity | PASS | | | |
| P3: Idempotency | PASS | | | |
| P4: Regression (existing suite) | 0 new failures | | | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-54-01 | Real-world large file splitting (STATE.md, ROADMAP.md at scale) | PENDING | Phase 57 |

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM-HIGH

**Justification:**
- Sanity checks: Adequate — 6 checks cover module loading, format correctness, and unit test passage. These are executable without any external dependencies.
- Proxy metrics: Well-evidenced — round-trip fidelity (P2) and idempotency (P3) directly test the core algorithmic properties stated in the requirements. Coverage (P1) is a strong proxy given the purely algorithmic module. Regression testing (P4) is a strong proxy for reader transparency on the no-split code path.
- Deferred coverage: Partial — DEFER-54-01 covers the split-path in reader context (the most risky integration point). The deferred validation is well-specified with a concrete SHA256-based correctness criterion.

**What this evaluation CAN tell us:**
- Whether the splitting algorithm works correctly on synthetic inputs of controlled size and structure
- Whether the index format is correctly produced and detected
- Whether existing readers continue to work for sub-threshold files after integration
- Whether test coverage meets the project-mandated floor

**What this evaluation CANNOT tell us:**
- Whether boundary detection works correctly for real GRD planning file content (nested YAML, HTML comments, frontmatter blocks, unicode headings) — addressed by DEFER-54-01 at Phase 57
- Whether the 25,000-token threshold is correctly calibrated for GRD's actual file growth patterns — only observable after evolve loop runs (Phase 57)
- Whether reassembly in reader context (state.js, roadmap.js) produces correctly parsed data — the split-path in readers is not exercised by existing tests (addressed by DEFER-54-01)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-22*
