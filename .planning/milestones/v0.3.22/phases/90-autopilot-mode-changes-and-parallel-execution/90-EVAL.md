# Phase 90 Evaluation Plan

## Tier 1: Sanity Checks

| Check | Command | Pass Criteria |
|-------|---------|---------------|
| TypeScript compiles | `npm run build:check` | Exit code 0, zero errors |
| Lint passes | `npm run lint` | Exit code 0, zero warnings |
| Unit tests pass | `npx jest tests/unit/autopilot.test.ts --no-coverage` | All tests pass, exit code 0 |

## Tier 2: Proxy Metrics

| Metric | Command | Target | Rationale |
|--------|---------|--------|-----------|
| Autopilot test count | `npx jest tests/unit/autopilot.test.ts --no-coverage --verbose 2>&1 \| grep -c 'PASS\|FAIL\|✓\|✕'` | >= previous count + 6 new tests | 90-01 adds ~3, 90-02 adds ~4, 90-03 adds ~2 |
| No stale flags | `grep -r '\-\-resume\|\-\-from \|\-\-to ' lib/ commands/ \| grep -i autopilot \| wc -l` | 0 | SC2: no --resume/--from/--to |
| atomicWriteFileSync exists | `grep -c 'atomicWriteFileSync' lib/autopilot.ts` | >= 3 | 1 definition + 2 call sites (writeStatusMarker, updateStateProgress) |
| No .tmp artifacts | `find .planning -name '*.tmp' \| wc -l` | 0 | SC4: temp files cleaned up |
| Full test suite | `npm test` | All pass, exit code 0 | Zero regressions across all modules |
| Milestone mode logic | `npx jest tests/unit/autopilot.test.ts -t "milestone mode" --no-coverage` | Pass | SC1: milestone mode default verified |
| Atomic write tests | `npx jest tests/unit/autopilot.test.ts -t "atomic write" --no-coverage` | Pass | SC4: write-to-temp-then-rename verified |
| buildWaves tests | `npx jest tests/unit/autopilot.test.ts -t "buildWaves" --no-coverage` | Pass | SC3: wave grouping verified |

## Tier 3: Deferred Validations

| Validation | When | How |
|-----------|------|-----|
| Real parallel worktree execution with concurrent writes | Phase 91 E2E test | Run 2+ phases through full autopilot v2 loop with mocked git/gh; verify STATUS.md not corrupted |
| Concurrent appendFileSync stress test for autopilot.log | Future | Spawn N concurrent appenders, verify no interleaving within single log lines |
| Live milestone-mode autopilot on real project | Next autopilot run | Run `gd autopilot` on GRD itself; verify auto-resume, wireup, and atomic writes in production |

## Success Criteria Mapping

| SC | Requirement | Eval Tier | Status |
|----|------------|-----------|--------|
| SC1: Milestone mode default | REQ-171 | Tier 2 (milestone mode test) | Verify via 90-01 |
| SC2: Flag cleanup | REQ-170, REQ-171 | Tier 2 (grep for stale flags) | Verify via 90-01 |
| SC3: Parallel worktree execution | REQ-173 | Tier 2 (buildWaves tests) | Verify via 90-03 |
| SC4: Atomic writes | REQ-174 | Tier 2 (atomic write tests + grep) | Implement via 90-02 |
| SC5: Milestone wireup | REQ-172 | Tier 2 (buildWireupPrompt test) | Verify via 90-03 |
