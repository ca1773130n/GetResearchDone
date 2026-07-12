# Phase 101 — Eval Results

**Run:** 2026-07-12 · Tier 1 + Tier 2 (per 101-EVAL.md) · Tier 3 deferred by design

## Tier 1 — Sanity

| Check | Command | Result |
|-------|---------|--------|
| Type check | `npm run build:check` | ✓ exit 0 (verified by executors 101-02/03/04) |
| Lint | `npm run lint` | ✓ clean |
| types+thread suites | `npx jest tests/unit/research/types.test.ts tests/unit/research/thread.test.ts` | ✓ 14 passed |
| checkpoints suite | `npx jest tests/unit/research/checkpoints.test.ts` | ✓ 32 passed |
| gates/bench/config suites | `npx jest gates bench config` | ✓ 7 + 46 + 6 passed |
| orchestrator/cli suites | `npx jest orchestrator cli` | ✓ 62 passed |

**Tier 1 verdict: PASS (6/6)**

## Tier 2 — Proxy

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| checkpoints.ts per-file coverage | 90 / 100 / 80 (lines/fn/branch) | 98.36 / 100 / 86.4 | ✓ |
| Caller-audit (5 runResearch/resumeResearch sites) | test exists + green | portfolio/bench/cli/cli-kb/index enumerated; comment-line false-positives stripped | ✓ |
| 0.4.16 fixture bit-identical round-trip + resume | byte-equal | `JSON.stringify(thread,null,2) === raw` for both fixtures; resume path green | ✓ |
| Full suite, additive-only ("zero behavior change" proxy) | all green, no pre-existing expectation edits | 159/159 suites, 5421 passed, 3 skipped, exit 0 (TMPDIR outside repo) | ✓ |

**Tier 2 verdict: PASS (4/4)**

## Tier 3 — Deferred (as planned)

| ID | Item | Validates at |
|----|------|--------------|
| DEFER-101-01 | Live interactive pause/resume E2E | Phase 102 (first emission site) |
| DEFER-101-02 | Panel fallback | Phase 105 |
| DEFER-101-03 | Full R1/R3/R4/R5 milestone suite | Phase 105 |

## Notes

- Fixture provenance (checker warning follow-up): FALLBACK hand-authored path was used, disclosed in 101-01-SUMMARY.md, field-checked against `git show 3c179fe:lib/research/thread.ts`.
- No jest per-file threshold lowered; one ADDED (checkpoints.ts).
- Verdict: **targets met — proceed to verification.**
