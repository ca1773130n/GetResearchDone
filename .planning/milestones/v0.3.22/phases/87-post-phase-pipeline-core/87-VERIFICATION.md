---
status: passed
phase: 87
verified: 2026-03-24
---

# Phase 87: Post-Phase Pipeline Core — Verification

## Goal Verification

**Phase Goal:** Each autopilot phase completion triggers a 4-step sequential pipeline — simplify, PR creation, code review, rebase+merge — orchestrated by `runPostPhasePipeline()` with per-step timeouts and `--skip-post-pipeline` escape hatch.

**Status: PASSED**

## Success Criteria

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `buildSimplifyPrompt(phaseNum)` targets changed files, env vars stripped | ✓ PASS | lib/autopilot.ts:364 — prompt includes `git diff main...HEAD`; env stripping in `_buildSpawnConfig` lines 561-568 |
| 2 | `pushAndCreatePR()` reused from lib/worktree.ts, PR title follows convention | ✓ PASS | lib/worktree.ts:717 — function imported and called at lib/autopilot.ts:454 |
| 3 | `buildCodeReviewPrompt(prUrl)` targets PR diff, BLOCKER/WARNING classification | ✓ PASS | lib/autopilot.ts:369 — prompt includes PR URL, classifies as BLOCKER/WARNING, instructs fix+push |
| 4 | Rebase before merge, conflict subprocess, non-zero exit halts | ✓ PASS | lib/autopilot.ts:482 — `git rebase main`; conflict subprocess at 486; abort on failure at 492 |
| 5 | `runPostPhasePipeline` 4 steps, failure stops, `--skip-post-pipeline` | ✓ PASS | lib/autopilot.ts:421-542 — all 4 steps sequential; flag at line 1606 |

## Requirements Traceability

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-160: Simplify Step | ✓ MET | buildSimplifyPrompt at line 364, spawnStep at line 439 |
| REQ-161: PR Creation Step | ✓ MET | pushAndCreatePR reused at line 454 |
| REQ-162: Code Review Step | ✓ MET | buildCodeReviewPrompt at line 369, spawnStep at line 467 |
| REQ-163: Rebase and Merge Step | ✓ MET | Rebase at line 482, conflict resolution at 486, merge at 526 |
| REQ-164: Pipeline Orchestrator | ✓ MET | runPostPhasePipeline at line 421, --skip-post-pipeline at 1606 |

## Test Coverage

- **Type check:** `tsc --noEmit` — PASS
- **Lint:** `eslint bin/ lib/` — PASS
- **Tests:** 172/172 pass in autopilot.test.ts
- **Post-pipeline specific:** 7 tests (3 prompt builders + 3 pipeline failure + 1 flag parsing)

## Exports Verification

All functions properly exported in module.exports (lines 1806-1810):
- buildSimplifyPrompt ✓
- buildCodeReviewPrompt ✓
- buildConflictResolvePrompt ✓
- buildWireupPrompt ✓
- runPostPhasePipeline ✓
