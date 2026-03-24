---
phase: 88-serial-merge-queue-and-conflict-resolution
plan: "01"
subsystem: autopilot
tags: [merge-queue, concurrency, post-phase-pipeline, serialization]
dependency_graph:
  requires: [lib/autopilot.ts]
  provides: [createMergeQueue, restructured-runPostPhasePipeline, concurrent-wave-loop]
  affects: [lib/autopilot.ts, tests/unit/autopilot.test.ts]
tech_stack:
  added: []
  patterns: [promise-chain-tail, FIFO-async-queue, Promise.all-concurrent-launch]
key_files:
  created: []
  modified:
    - lib/autopilot.ts
    - tests/unit/autopilot.test.ts
decisions:
  - Promise-chain tail pattern for MergeQueue — zero external dependencies, arrival-order guaranteed
  - mergeQueue shared across all waves (not per-wave) for strictest serialization
  - runStep4 async closure captures prUrl from Steps 1-3 before entering queue
  - stoppedAt uses first failure (not last) to preserve meaningful error attribution
  - Pipeline worktree cleanup moved to after all Promise.all results processed
metrics:
  duration: "~15 minutes"
  completed: "2026-03-24"
  tasks_completed: 2
  files_modified: 2
---

# Phase 88 Plan 01: Serial Merge Queue and Conflict Resolution Summary

Implemented `createMergeQueue()` FIFO serialization primitive and restructured the autopilot wave loop so post-phase pipelines (simplify, PR creation, code review) run concurrently across phases while only the rebase+merge step is serialized through the shared queue.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Implement createMergeQueue and restructure runPostPhasePipeline | e241764 | lib/autopilot.ts |
| 2 | Add unit tests for merge queue serialization | 51ed2bf | tests/unit/autopilot.test.ts |

## What Was Built

### createMergeQueue()

A FIFO async serialization primitive using a promise-chain tail pattern:

- `MergeQueue` interface with `enqueue<T>(fn: () => Promise<T>): Promise<T>`
- `createMergeQueue()` factory — maintains a `tail` promise; each enqueue appends via `tail.then(() => fn())`
- Error isolation: failed functions suppress errors on the chain tail so subsequent functions still execute
- Zero external dependencies — pure TypeScript using only native Promises

### runPostPhasePipeline() restructure

- Added `mergeQueue?: MergeQueue` to opts parameter
- Step 4 (rebase, conflict resolution, force-push, gh pr merge) extracted into `runStep4` async closure
- When `mergeQueue` provided: `return mergeQueue.enqueue(runStep4)`
- When no `mergeQueue` provided: `return runStep4()` — fully backward compatible
- `prUrl` from Step 2 is captured before entering the queue (Steps 1-3 still run outside queue)

### Autopilot wave loop

- Single `mergeQueue` created before the wave loop — shared across all waves
- After execution tasks complete, successful phases launch `runPostPhasePipeline` concurrently
- `pipelineTasks` array collects `{ phaseNum, wtPath, promise }` tuples
- `await Promise.all(pipelineTasks.map(t => t.promise))` awaits all concurrent pipelines
- Worktree cleanup moved to after all pipeline results processed
- `stoppedAt` uses first failure encountered (non-destructive assignment)

## Verification

- `npm run build:check` — TypeScript compiles with no errors
- `npx jest tests/unit/autopilot.test.ts` — 176 tests passing (172 original + 4 new)
- `createMergeQueue` tests:
  - Single function executes immediately
  - FIFO ordering with varying delays
  - Concurrent enqueue — never more than 1 running simultaneously
  - Error isolation — failure does not block subsequent enqueued functions

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `lib/autopilot.ts` modified with createMergeQueue, MergeQueue interface, restructured runPostPhasePipeline, concurrent wave loop
- [x] `tests/unit/autopilot.test.ts` has createMergeQueue in imports and 4-test describe block
- [x] Commits e241764 and 51ed2bf exist
- [x] 176 tests pass
- [x] TypeScript compiles cleanly

## Self-Check: PASSED
