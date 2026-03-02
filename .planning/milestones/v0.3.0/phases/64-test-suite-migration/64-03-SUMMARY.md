---
phase: 64
plan: 03
subsystem: tests
tags: [typescript, migration, unit-tests, type-annotations]
dependency_graph:
  requires: [64-01, 64-02]
  provides: [typed-unit-tests]
  affects: [tests/unit/]
tech_stack:
  added: []
  patterns: [ts-jest-cjs-proxy, any-typed-test-lambdas, error-as-any-casting]
key_files:
  created:
    - tests/unit/commands.test.ts
    - tests/unit/context.test.ts
    - tests/unit/context-backend-compat.test.ts
    - tests/unit/phase.test.ts
    - tests/unit/cleanup.test.ts
    - tests/unit/cleanup-noninterference.test.ts
    - tests/unit/parallel.test.ts
    - tests/unit/mcp-server.test.ts
    - tests/unit/tracker.test.ts
    - tests/unit/worktree.test.ts
    - tests/unit/autopilot.test.ts
    - tests/unit/evolve.test.ts
    - tests/unit/coverage-gaps.test.ts
    - tests/unit/setup.test.ts
    - tests/unit/agent-audit.test.ts
  modified:
    - jest.config.js
  deleted:
    - tests/unit/commands.test.js
    - tests/unit/context.test.js
    - tests/unit/context-backend-compat.test.js
    - tests/unit/phase.test.js
    - tests/unit/cleanup.test.js
    - tests/unit/cleanup-noninterference.test.js
    - tests/unit/parallel.test.js
    - tests/unit/mcp-server.test.js
    - tests/unit/tracker.test.js
    - tests/unit/worktree.test.js
    - tests/unit/autopilot.test.js
    - tests/unit/evolve.test.js
    - tests/unit/coverage-gaps.test.js
    - tests/unit/setup.test.js
    - tests/unit/agent-audit.test.js
    - lib/sample.ts
    - tests/unit/sample.test.ts
decisions:
  - Used `any` type for test lambda parameters and mock results to minimize noise while maintaining type safety on critical paths
  - Used `(err as any).code` pattern for Error properties not in base type
  - Used empty string instead of null for fixtureDir cleanup to avoid union type complexity
  - Removed sample.ts scaffolding from 64-01 as no longer needed
metrics:
  duration: 38min
  completed: 2026-03-02
---

# Phase 64 Plan 03: Unit Test Migration (15 Files) Summary

Migrated 15 unit test files from .test.js to .test.ts with TypeScript type annotations, achieving 1546 tests across the migrated files with zero regressions against the full 2387-test suite.

## Task Completion

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | Migrate 8 command/context layer tests | 7635ab8 | 1008 |
| 2 | Migrate 7 autonomous/specialized tests | f4f360f | 538 |
| 3 | Verify full suite + cleanup | 97667c6 | 2387 (full suite) |

## Migration Details

### Task 1: Command/Context Layer (8 files)

| File | Tests | Key Changes |
|------|-------|-------------|
| commands.test.ts | 231 | `parseFirstJson` returns `any`, `savedEnv: NodeJS.ProcessEnv`, `(err as any).stdout` |
| context.test.ts | 199 | `savedEnv: Record<string, string \| undefined>`, fixture dir typed |
| context-backend-compat.test.ts | 49 | Helper functions fully typed, `callInit` return type |
| phase.test.ts | 103 | `setCleanupConfig` overloads, `(err as any).code` |
| cleanup.test.ts | 107 | `makeQualityReport(options: any)`, mock return `true` |
| cleanup-noninterference.test.ts | 23 | `collectFileMtimes` typed with `Map<string, number>` |
| parallel.test.ts | 57 | `stderrWrites: (string \| Uint8Array)[]`, `fixtureDir = ''` pattern |
| mcp-server.test.ts | 239 | `let server: any`, `let tools: any`, `callTool` typed |

### Task 2: Autonomous/Specialized Layer (7 files)

| File | Tests | Key Changes |
|------|-------|-------------|
| tracker.test.ts | 87 | `stderrLines: string[]`, stderr mock returns `true` |
| worktree.test.ts | 103 | `cleanupTestRepo(repoDir: string)`, `setupBranches` typed |
| autopilot.test.ts | 85 | `spawnSyncSpy: any`, `captureOutputAsync(fn: () => Promise<void>)` |
| evolve.test.ts | 170 | `tmpDirs: string[]`, `captureEvolveOutput` helpers typed |
| coverage-gaps.test.ts | 67 | Required zero type changes (already type-safe) |
| setup.test.ts | 15 | `tmpDir: string`, empty string cleanup pattern |
| agent-audit.test.ts | 11 | `pluginJson: any` |

### Task 3: Verification and Cleanup

- Removed `lib/sample.ts` and `tests/unit/sample.test.ts` (scaffolding from 64-01)
- Removed `sample.ts` coverage threshold from jest.config.js
- Full unit test suite: 31 suites, 2387 tests, all passing
- Coverage thresholds maintained (no failures)

## Common TypeScript Patterns Applied

1. **TS7005/TS7006 (implicit any)**: Added explicit type annotations to `let` declarations and function parameters
2. **TS2322 (null not assignable to string)**: Used empty string `''` instead of `null` for cleanup patterns
3. **TS2339 (property not on type)**: Used `(err as any).code` for Error subtype properties
4. **TS2345 (mock return type)**: Changed `mockImplementation(() => {})` to `(() => true)` for write mocks
5. **TS7034 (array implicit any)**: Typed arrays explicitly: `string[]`, `(string | Uint8Array)[]`
6. **Lambda params**: Used `any` type for test assertion lambdas in `.filter`, `.map`, `.find`, etc.
7. **stderr/stdout mocks**: Typed data param as `(data: string | Uint8Array)` and added `return true`

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All 15 .ts files exist, all 3 commits verified, full test suite green.
