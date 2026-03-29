---
phase: 91-integration-testing-and-validation
wave: all
plans_reviewed: [91-01, 91-02, 91-03]
timestamp: 2026-03-29T00:00:00Z
blockers: 0
warnings: 3
info: 4
verdict: warnings_only
---

# Code Review: Phase 91 — Integration Testing and Validation

## Verdict: WARNINGS ONLY

All three plans executed successfully. The test suite is structurally complete and all CI
gates pass. Three warnings concern (1) a coverage threshold regression that was silently
auto-fixed rather than documented as a deliberate deviation, (2) a missing "full success
path" test case specified in 91-01 Task 1, and (3) conditional assertions that reduce the
certainty of several test outcomes when the `create-pr` mock path is not intercepted.

## Stage 1: Spec Compliance

### Plan Alignment

**91-01:**

Plan Task 1 specified 7 specific test cases for `runPostPhasePipeline`. The implementation
delivers 7 new tests. However, the very first item specified was a **full success path**
test ("Mock all 4 steps to succeed ... Assert: result.status === 'completed'"). None of the
7 delivered tests assert `result.status === 'completed'` — every test either asserts failure
or uses conditional assertions that allow the pipeline to fail at an earlier step than
intended (because `execGit` in `utils.ts` cannot be intercepted via `jest.spyOn`).

The SUMMARY.md acknowledges the architectural constraint and documents the conditional
assertion pattern as an intentional design decision. The deviation is documented, but the
plan's core intent — proving the full success path with `status === 'completed'` — is only
achieved indirectly through the E2E test in 91-03. This is a meaningful gap between the
plan specification and what was delivered.

Plan Task 2 specified 4 merge queue integration tests; 5 were delivered (the structured
halt error test from Task 1 appears again). Coverage is adequate and no task is unexecuted.

**91-02:**

The plan specified 5 `parseWriteIntent` tests and 7 `buildWaves`/`compareWriteIntent`/
`formatWriteIntentMismatch` tests (12 total). The SUMMARY.md reports 12 delivered. A
deviation note states that tests 1, 3, and 5 of the buildWaves Task 2 spec (three-way
overlap, forceParallel three-way, partial overlap) were skipped because existing tests
already covered those cases. Only 4 genuinely new tests were added for Task 2 instead of 7.
The total count (5 + 4 + 1 compareWriteIntent + 1 formatWriteIntentMismatch multi-entry = 11
or 12 depending on counting) is borderline and the SUMMARY says "12 new edge-case unit
tests." The deviation is documented inline in the summary, so this is acceptable.

**91-03:**

Task 1 specifies the E2E test should assert merge order array equals `['48', '49']`. Test 4
("E2E — phase 48 completes execution before phase 49") does assert exactly `['48:merge',
'49:merge']` via `completionLog`, satisfying the requirement. Tests 1-3 use pure queue
composition or relaxed guards (`mergeOrder.length <= 2`) which do not test real pipeline
ordering through `runPostPhasePipeline`. This matches the plan's stated preference for
composition testing when full `runAutopilot` mocking is infeasible.

Task 2 (coverage threshold adjustment) documents that thresholds were unchanged because
actual coverage already passes. This is correct.

**WARNING: Coverage threshold was lowered (91-01), not raised.**

The plan for 91-03 Task 2 states "Only increase thresholds, never decrease." However
91-01 contains a commit (`c5869ef`) that *lowers* the `lib/autopilot.ts` functions
threshold from 93% to 91% and branches from 76% to 75%, citing a mismatch with actual
coverage from phases 87-88 work. The SUMMARY.md justifies this as "mirrors fix e4e7c63
already applied on main." This is a deviation from the stated plan policy. The lowering
may be correct but it is a threshold regression, not a ratchet-up, and should have been
called out as a plan deviation in 91-01 rather than treated as a mechanical auto-fix.

### Research Methodology

N/A — Phase 91 is a testing phase with no external research references.

### Context Decision Compliance

No CONTEXT.md was found for phase 91. No context decisions to verify.

### Known Pitfalls

No KNOWHOW.md pitfalls specific to this domain were flagged. The tests correctly document
the `execFileSync` destructured-reference limitation (both in code comments and SUMMARY.md),
which is the main known trap for this codebase's mock architecture.

### Eval Coverage

All EVAL.md metrics can be computed against the implementation:

- S1–S5 sanity checks: all pass per EVAL-RESULTS.md
- P1–P6 proxy metrics: all MET per EVAL-RESULTS.md
- DEFER-91-01 (manual coverage spot-check on lines 130–700): still PENDING; this is
  the only open item and it has a documented fallback. Not a blocker.

The EVAL.md listed `lib/autopilot.ts functions >= 93%` as the threshold, but the
jest.config.js enforced threshold was already lowered to 91% by 91-01. The EVAL.md
baseline section was not updated to reflect this change, causing a discrepancy between
the EVAL plan and the enforced threshold. This is an INFO-level documentation gap.

## Stage 2: Code Quality

### Architecture Consistency

All new test code follows existing patterns:
- `jest.spyOn` / `mockImplementation` / `mockRestore` consistent with other describe blocks
- `createAutopilotFixture()` and `createMockChild()` helpers reused appropriately
- `afterEach` cleanup pattern (tmpDir + spawnSpy restore) mirrors existing test structure
- `delay()` helper is defined locally per describe block; this creates three near-identical
  copies across `createMergeQueue`, `mergeQueue + runPostPhasePipeline integration`, and the
  E2E block. Not a blocker but slightly redundant.

No conflicting architectural patterns introduced.

### Reproducibility

N/A — This is a testing phase, not an experimental/research phase. No random seeds or
experiment tracking artifacts are required.

### Documentation (Technical Decisions)

The architectural constraint around `execFileSync` destructured references is thoroughly
documented:
- Two identical explanation blocks appear in `runPostPhasePipeline` and
  `mergeQueue + runPostPhasePipeline integration` test blocks (lines ~3944–3961 and
  ~4361–4367)
- The E2E describe block has a third explanation in the JSDoc comment

This is good practice for maintainability. The decision to accept quote-preservation
behavior in `parseWriteIntent` rather than stripping quotes is documented via test name and
comment (line 4657–4663). The `compareWriteIntent` Set-dedup behavior is similarly
documented (line 4742–4753).

**WARNING: "full success path" missing from runPostPhasePipeline tests.**

The 91-01 plan's most prominent test case was the full success path
(`result.status === 'completed'`). Due to the `execGit` mock limitation, this is only
approximated in the E2E describe block via `simulatePhase` composition (which uses
`createMergeQueue` directly, not `runPostPhasePipeline`). No test in the
`runPostPhasePipeline` describe block ever asserts `status === 'completed'`.

This means a regression in `runPostPhasePipeline`'s success return path (e.g., wrong
`status` field value on the resolved object) would not be caught by the 91-01 tests. The
tests are all failure-path or conditional tests. The gap is real and not merely theoretical.

**WARNING: Conditional assertions reduce test determinism.**

Several tests in `runPostPhasePipeline` and `mergeQueue + runPostPhasePipeline integration`
use the pattern `if (result.failedStep === 'X') { expect(...) }` without a fallback
assertion that the test reached the intended code path. For example, "code-review failure"
test (line 4015): if `execFileSync` spy does not intercept `gh pr create` (which can happen
depending on module load order), the test passes by taking the else branch and only
asserting `result.status === 'failed'` — which would also pass even if no meaningful code
path was exercised.

This is a known tradeoff given the mock architecture, and it is documented. However it means
some tests may silently pass without validating the code path they claim to test. This
reduces confidence in coverage claims for those paths.

### Deviation Documentation

SUMMARY.md key-files match git diff:
- 91-01: `tests/unit/autopilot.test.ts` and `jest.config.js` — both modified, both listed.
  Commits `ad344c7` and `c5869ef` are both present in git log. ✓
- 91-02: `tests/unit/autopilot.test.ts` — modified, listed. Commits `0ef18aa` and `ad344c7`
  (co-committed) present. ✓
- 91-03: `tests/unit/autopilot.test.ts` — modified, listed. Commit `81d6ce4` present. ✓

The 91-02 SUMMARY notes Task 2 changes were "co-committed with concurrent 91-01 agent
execution" in `ad344c7`. This means 91-01 commit `ad344c7` contains both the Task 1
runPostPhasePipeline tests (91-01) and the buildWaves/compareWriteIntent/
formatWriteIntentMismatch tests (91-02 Task 2). The commit message only mentions 91-01's
content. This is a minor documentation gap — the commit message does not reflect the full
scope of changes it contains.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 1 | Plan Alignment | Coverage threshold lowered (functions 93%→91%, branches 76%→75%) in 91-01 without explicit plan deviation record; plan policy stated "only increase thresholds, never decrease" |
| 2 | WARNING | 2 | Documentation | No `runPostPhasePipeline` test ever asserts `result.status === 'completed'`; the full success path specified in 91-01 Task 1 item 1 is untested at the function level |
| 3 | WARNING | 2 | Reproducibility | Conditional assertion pattern (`if (result.failedStep === 'X')`) in 7 tests means those tests may pass without exercising the stated code path if mock intercept fails silently |
| 4 | INFO | 1 | Eval Coverage | EVAL.md baselines still reference 93%/76% thresholds after 91-01 lowered them to 91%/75%; EVAL-RESULTS.md notes the discrepancy but EVAL.md itself was not updated |
| 5 | INFO | 2 | Architecture | `delay()` helper function is defined three times (createMergeQueue, mergeQueue integration, E2E blocks); could be extracted to a shared test helper |
| 6 | INFO | 2 | Deviation Documentation | Commit `ad344c7` contains changes for both 91-01 and 91-02 but commit message only references 91-01 content |
| 7 | INFO | 1 | Plan Alignment | 91-02 Task 2 delivered 4 new buildWaves tests instead of 7 (3 skipped as already covered by existing tests); deviation is documented inline in SUMMARY but spec count claimed "7 new tests" |

## Recommendations

**WARNING 1 (Coverage threshold lowered):** The threshold reduction is technically justified
(the phases 87-88 pipeline helpers cannot be covered without real process execution), but
future phases should treat coverage threshold reductions as explicit plan deviations
requiring a deviation record in the plan's SUMMARY.md under "Deviations from Plan" rather
than as "auto-fixes." Consider adding a note to KNOWHOW.md: "Coverage thresholds for
lib/autopilot.ts were intentionally lowered in 91-01 (functions 91%, branches 75%) because
post-phase pipeline helpers require real git remote for full coverage."

**WARNING 2 (Full success path untested):** Consider adding one test in the next phase that
modifies autopilot.ts to add that path, or extract the `simulatePhase` approach from the
E2E block into a dedicated `runPostPhasePipeline` success-path test using composition
(mock all `execFileSync` calls via module-level spy as `autopilot.ts` does call
`childProcess.execFileSync` directly for `gh pr merge`). The rebase and push calls that
cannot be intercepted could be exercised by having the fixture use a real local git remote
(bare clone) rather than no remote.

**WARNING 3 (Conditional assertions):** These are acceptable given the mock architecture
constraint, but consider adding `expect.hasAssertions()` or a minimum assertion count to
the tests that use `if (result.failedStep === 'X')`. This would fail the test if the spy
never intercepted the intended path, making the conditional deterministic rather than silently
vacuous. Example: add `expect(result.status).toBe('failed')` as an unconditional assertion
in every conditional test (some already do this, but not all).
