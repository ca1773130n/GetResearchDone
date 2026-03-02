---
phase: 64-test-suite-migration
plan: 02
subsystem: tests/unit
tags: [typescript, migration, testing, ts-jest]
dependency_graph:
  requires: [64-01]
  provides: [typed-unit-tests]
  affects: [tests/unit/]
tech_stack:
  added: []
  patterns: [typed-test-helpers, jest-spy-instance-cast, catch-block-typing]
key_files:
  created:
    - tests/unit/paths.test.ts
    - tests/unit/backend.test.ts
    - tests/unit/backend-real-env.test.ts
    - tests/unit/utils.test.ts
    - tests/unit/frontmatter.test.ts
    - tests/unit/gates.test.ts
    - tests/unit/deps.test.ts
    - tests/unit/scaffold.test.ts
    - tests/unit/state.test.ts
    - tests/unit/roadmap.test.ts
    - tests/unit/roadmap-roundtrip.test.ts
    - tests/unit/long-term-roadmap.test.ts
    - tests/unit/markdown-split.test.ts
    - tests/unit/verify.test.ts
    - tests/unit/postinstall.test.ts
    - tests/unit/validation.test.ts
  modified: []
  deleted:
    - tests/unit/paths.test.js
    - tests/unit/backend.test.js
    - tests/unit/backend-real-env.test.js
    - tests/unit/utils.test.js
    - tests/unit/frontmatter.test.js
    - tests/unit/gates.test.js
    - tests/unit/deps.test.js
    - tests/unit/scaffold.test.js
    - tests/unit/state.test.js
    - tests/unit/roadmap.test.js
    - tests/unit/roadmap-roundtrip.test.js
    - tests/unit/long-term-roadmap.test.js
    - tests/unit/markdown-split.test.js
    - tests/unit/verify.test.js
    - tests/unit/postinstall.test.js
    - tests/unit/validation.test.js
decisions:
  - Used jest.SpyInstance cast for process.stderr.write mocks to avoid TS2345 overload mismatch
  - Used Record<string, unknown> for JSON.parse result callbacks (find/map/filter) instead of any
  - Used explicit any for deeply-nested JSON objects (pkg, schedule) where Record<string, unknown> would require excessive casting
  - postinstall.test.ts header kept as bin/postinstall.js (bin files are CJS proxies)
metrics:
  duration: ~25min
  completed: 2026-03-02
  tests_migrated: 16
  tests_passing: 841
  type_annotations_added: ~65
---

# Phase 64 Plan 02: Unit Test File Migration Summary

Migrated all 16 unit test files from .test.js to .test.ts with TypeScript type annotations, achieving 841 passing tests with zero regressions and all coverage thresholds met.

## Task Results

| Task | Name | Commit | Tests | Status |
|------|------|--------|-------|--------|
| 1 | Foundation/utility test files (8) | de0852d | 481 | PASS |
| 2 | Data/domain layer test files (8) | c438288 | 360 | PASS |
| 3 | Full test suite verification | (verify only) | 841 | PASS |

## Migration Details

### Task 1: Foundation/Utility Files (8 files)

| File | Key Type Annotations |
|------|---------------------|
| paths.test.ts | `makeTmpDir(stateContent?: string): string`, `cleanTmpDir(dir: string): void`, `let tmpDir: string \| null` |
| backend.test.ts | `TempDirOpts` interface, `createTempDir(opts)`, `jest.SpyInstance` cast for readFileSyncSpy |
| backend-real-env.test.ts | `clearDetectionEnvVars(): void`, `let savedEnv: NodeJS.ProcessEnv` |
| utils.test.ts | Multiple `let fixtureDir: string`, `const savedEnv: Record<string, string \| undefined>`, stderr write cast |
| frontmatter.test.ts | `let fixtureDir: string`, `makeTmpDir(): string`, `removeTmpDir(dir: string): void` |
| gates.test.ts | `Object.entries(GATE_REGISTRY) as [string, string[]][]`, violation callback typed |
| deps.test.ts | `let fixtureDir: string`, `COMMAND_DESCRIPTORS.find` with `Record<string, unknown>` |
| scaffold.test.ts | `parseFirstJson(str: string): Record<string, unknown>` |

### Task 2: Data/Domain Layer Files (8 files)

| File | Key Type Annotations |
|------|---------------------|
| state.test.ts | `let fixtureDir: string` (13x), `let tmpDir: string` (3x), `parseFirstJson(str: string)`, filter callback `(l: string)` |
| roadmap.test.ts | `let schedule: any`, phase/milestone `.find`/`.map` callbacks with `Record<string, unknown>`, `jest.SpyInstance` cast |
| roadmap-roundtrip.test.ts | Header update only - no implicit any errors found |
| long-term-roadmap.test.ts | Error/warning `.some` callbacks `(e: string)`, milestone `.every` with `Record<string, unknown>` |
| markdown-split.test.ts | `let tmpDirs: string[]`, `generateLargeMarkdown(sectionCount: number)`, parts callback typed, stderrSpy cast |
| verify.test.ts | `let fixtureDir: string` (6x), errors `.find((e: string))`, artifacts `.find` with `Record<string, unknown>` |
| postinstall.test.ts | `let tmpDir: string`, `let pkg: any` |
| validation.test.ts | `let tmpDir: string`, `runCLI(args: string[])`, catch block `as { status?; stdout?; stderr? }` |

### Task 3: Verification

- All 16 migrated .ts test files: 841 tests passing
- Full test suite: 2661 passing (2 pre-existing failures in integration/npm-pack and integration/evolve-e2e unrelated to this migration)
- `npx tsc --noEmit`: 0 errors
- Coverage thresholds: all met (no regressions)

## Type Annotation Patterns Used

1. **`let` variable declarations**: `let fixtureDir: string`, `let tmpDir: string`, `let tmpDirs: string[]`
2. **Function parameters**: `(str: string)`, `(sectionCount: number)`, `(args: string[])`
3. **Callback parameters in array methods**: `.find((p: Record<string, unknown>) => ...)`, `.some((e: string) => ...)`
4. **Mock spy casts**: `(jest.spyOn(process.stderr, 'write') as jest.SpyInstance).mockImplementation(...)`
5. **Catch block typing**: `catch (e: unknown) { const err = e as { status?; stdout?; stderr? }; }`
6. **JSON.parse result access**: `let pkg: any` for deeply-nested property chains, `Record<string, unknown>` for shallow access

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- All 16 .ts test files exist
- All 16 .js originals deleted
- Commits de0852d and c438288 verified
- 841 tests passing across all 16 files
- tsc --noEmit passes with 0 errors
