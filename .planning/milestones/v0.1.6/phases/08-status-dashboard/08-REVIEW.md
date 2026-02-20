---
phase: 08-status-dashboard
wave: all
plans_reviewed: [08-01, 08-02]
timestamp: 2026-02-15T12:00:00Z
blockers: 1
warnings: 4
info: 4
verdict: blocker_found
---

# Code Review: Phase 08 (Status Dashboard)

## Verdict: BLOCKERS FOUND

Phase 08 implements three read-only TUI commands (dashboard, phase-detail, health) with 658 lines of production code and 592 lines of tests (31 unit + 9 integration). All 533 tests pass with 91.5% line coverage on lib/commands.js. One functional bug found in decision-filtering logic due to a global regex misuse, plus several code quality warnings around performance, dead code, and inconsistent blocker counting logic.

## Stage 1: Spec Compliance

### Plan Alignment

**Plan 08-01 (Implementation):**
All tasks completed as specified. Commits `b305cc4` and `650695d` correspond to Task 1 and Task 2 respectively. Files modified match the plan exactly: `lib/commands.js`, `bin/grd-tools.js`, `commands/dashboard.md`, `commands/phase-detail.md`, `commands/health.md`. SUMMARY.md claims "no deviations" which matches the git diff.

**Plan 08-02 (Tests):**
All tasks completed. Commits `1d27edc` and `7f02bd3` correspond to Task 1 and Task 2. SUMMARY reports 31 unit tests (exceeds minimum of 22) and 9 integration tests (meets minimum of 9). Coverage at 91.5% exceeds the 80% threshold. No deviations documented.

No issues found.

### Research Methodology

N/A -- no research references in plans. This is a pure implementation phase.

### Known Pitfalls

N/A -- KNOWHOW.md does not exist in this project.

### Eval Coverage

08-EVAL.md exists and is well-structured with L1/L2/L3 tiers. All L1 sanity checks can be executed against the current implementation. L2 proxy metrics (coverage, test counts, JSON schema compliance) are measurable. L3 deferred validations (DEFER-08-01, DEFER-08-02) are properly tracked. Eval coverage is adequate.

No issues found.

## Stage 2: Code Quality

### Architecture

The three new functions follow the established `cmd*(cwd, ..., raw)` pattern used by all other commands in `lib/commands.js`. They use the standard `output()` function for JSON mode and `process.stdout.write()` + `process.exit(0)` for TUI mode, which matches the existing `cmdProgressRender` pattern. Imports reuse existing utilities (`safeReadFile`, `normalizePhaseName`, `extractFrontmatter`) without duplication.

CLI routes in `bin/grd-tools.js` follow the established switch-case dispatch pattern. Command markdown files follow the `<purpose>/<process>/<success_criteria>` structure matching existing command files like `commands/progress.md`.

See findings F1 (blocker), F4, F5, F6 below for specific code quality issues.

### Reproducibility

N/A -- no experimental code. All commands are deterministic read-only data aggregation.

### Documentation

Command markdown files provide adequate user-facing documentation with step-by-step process, bash commands, and navigation options. Inline code comments explain key parsing logic (milestone regex, blocker filtering, velocity computation). No issues found.

### Deviation Documentation

SUMMARY.md key-files match actual git diff output. Both plans report "no deviations" which is confirmed by comparing plan tasks against committed code. Commit messages are consistent with SUMMARY claims.

No issues found.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| F1 | BLOCKER | 2 | Code Quality | Global regex flag bug in `cmdPhaseDetail` decision filtering causes alternating match skips |
| F2 | WARNING | 2 | Code Quality | Inconsistent blocker counting between `cmdDashboard` and `cmdHealth` |
| F3 | WARNING | 2 | Code Quality | Redundant filesystem reads in `cmdDashboard` TUI plan listing (N*M readdirSync calls) |
| F4 | WARNING | 2 | Code Quality | Dead variable `hasSummary` on line 919 of `lib/commands.js` |
| F5 | WARNING | 2 | Code Quality | Active phase regex parsed inside phase loop instead of once outside |
| F6 | INFO | 2 | Architecture | `process.exit(0)` in TUI mode prevents function composition/testing of non-raw output |
| F7 | INFO | 2 | Test Coverage | Branch coverage at 70.53% -- several TUI rendering code paths uncovered |
| F8 | INFO | 1 | Eval Coverage | EVAL.md results template not yet filled in (expected -- eval-report not run yet) |
| F9 | INFO | 2 | Security | Path traversal protection confirmed via `normalizePhaseName` validation |

## Findings Detail

### F1: BLOCKER -- Global regex flag bug in cmdPhaseDetail decision filtering

**File:** `/Users/edward.seo/dev/private/project/harness/GRD/lib/commands.js`, line 1091

```javascript
const decisionPattern = new RegExp(`Phase\\s+${phaseNumber.replace('.', '\\.')}`, 'gi');
// ...
const rows = decisionsSection[1].split('\n').filter(r => r.includes('|') && decisionPattern.test(r));
```

The regex uses the `g` (global) flag. When `RegExp.prototype.test()` is called on a global regex, it advances `lastIndex` after each match. When used inside `Array.filter()`, this causes alternating true/false results -- every other matching row is incorrectly filtered out.

**Reproduction:**
```javascript
var re = /Phase\s+1/gi;
var rows = ["| Phase 1 | A |", "| Phase 1 | B |", "| Phase 1 | C |"];
rows.filter(r => re.test(r));
// Returns: ["| Phase 1 | A |", "| Phase 1 | C |"]  -- B is dropped
```

**Fix:** Remove the `g` flag from the regex. The `i` flag alone is sufficient:
```javascript
const decisionPattern = new RegExp(`Phase\\s+${phaseNumber.replace('.', '\\.')}`, 'i');
```

### F2: WARNING -- Inconsistent blocker counting between dashboard and health

**Files:** `/Users/edward.seo/dev/private/project/harness/GRD/lib/commands.js`, lines 849 and 1188-1193

`cmdDashboard` uses a regex negative lookahead to exclude "None":
```javascript
const items = blockersSection[1].match(/^-\s+(?!None)/gm);
```
This is case-sensitive -- `- none` would be counted as a blocker.

`cmdHealth` uses a post-filter with `.toLowerCase()`:
```javascript
if (text.toLowerCase() !== 'none' && text.toLowerCase() !== 'none.') {
    blockerItems.push(text);
}
```
This correctly handles all case variations.

**Impact:** If STATE.md contains `- none` (lowercase), `cmdDashboard` would report 1 active blocker while `cmdHealth` would report 0. The health command also handles the "None." variant (with period) which the dashboard regex does not account for when matching `- None.` -- though this specific case is handled because the negative lookahead only checks if the text starts with "None", and "None." does start with "None". Still, the approaches should be unified.

**Fix:** Use the health command's approach in both places, or make the dashboard regex case-insensitive: `/^-\s+(?!(?:none\.?)\s*$)/gim`.

### F3: WARNING -- Redundant filesystem reads in cmdDashboard TUI rendering

**File:** `/Users/edward.seo/dev/private/project/harness/GRD/lib/commands.js`, lines 913-936

In the TUI rendering section of `cmdDashboard`, for each plan file in each phase, the code calls `fs.readdirSync(phasesDir)` and then `fs.readdirSync(path.join(phasesDir, dirMatch2))` to check if a summary exists. This means for a project with 8 phases and 16 plans, approximately 32+ synchronous filesystem reads occur just for the TUI plan listing -- even though the same data was already read during the data-gathering phase above (lines 794-804).

The plan file data and summary existence information are already available in the `allPhases` array (which has `plan_files` and `summaries` count) and could be used directly instead of re-reading the filesystem.

**Fix:** Use the already-collected data. For per-plan summary detection, build a `Set` of summary file names during the initial read and reference it during TUI rendering.

### F4: WARNING -- Dead variable

**File:** `/Users/edward.seo/dev/private/project/harness/GRD/lib/commands.js`, line 919

```javascript
const hasSummary = planFilesForPhase.summaries > 0;
```

This variable is declared but never used. The code immediately proceeds to compute `planHasSummary` via filesystem reads instead. This appears to be leftover from an earlier approach that was replaced by the more precise per-plan check.

**Fix:** Remove the dead variable declaration on line 919.

### F5: WARNING -- Regex parsed inside loop

**File:** `/Users/edward.seo/dev/private/project/harness/GRD/lib/commands.js`, lines 815-816

```javascript
// Inside the while (pMatch = phaseRegex.exec(...)) loop:
const activePhaseMatch = stateContent.match(/\*\*Active phase:\*\*\s*(\d+)/i);
const activePhaseNum = activePhaseMatch ? activePhaseMatch[1] : null;
```

The active phase number is parsed from STATE.md on every iteration of the phase loop, but it never changes. This should be hoisted outside the loop for clarity and minor performance improvement.

**Fix:** Move the `activePhaseMatch` / `activePhaseNum` extraction above the `while` loop.

### F6: INFO -- process.exit(0) prevents function composition

The TUI rendering paths in all three commands call `process.exit(0)` after writing to stdout. This is consistent with the existing `cmdProgressRender` pattern, but it means the functions cannot be composed or tested in non-raw mode without intercepting `process.exit`. The unit tests work around this by capturing exit codes in the `captureOutput` helper. This is a known tradeoff documented in the SUMMARY's decisions.

### F7: INFO -- Branch coverage at 70.53%

While line coverage is excellent at 91.5%, branch coverage sits at 70.53%. Uncovered branches are concentrated in TUI rendering paths (lines 906, 719-722, 962-965, 989-992) and error edge cases. This is adequate for the current phase but could be improved by adding tests for the non-raw rendering paths with various data conditions.

### F8: INFO -- EVAL.md results template not filled

The 08-EVAL.md has a results template section that is not yet filled in (marked "To be filled by grd-eval-reporter after phase execution"). This is expected since `/grd:eval-report 8` has not been run yet.

### F9: INFO -- Security: Path traversal protection confirmed

`normalizePhaseName()` correctly rejects path traversal attempts (`../etc/passwd`, `1/../../`) with explicit error messages. The `cmdPhaseDetail` function passes user-supplied phase numbers through `normalizePhaseName()` before any filesystem operations. The `cwd` parameter comes from `process.cwd()` in the CLI router, not from user input. No injection risks identified.

## Recommendations

1. **F1 (BLOCKER):** Remove the `g` flag from the `decisionPattern` regex on line 1091 of `lib/commands.js`. Change `'gi'` to `'i'`. Add a unit test case that verifies multiple decisions for the same phase are all returned.

2. **F2 (WARNING):** Unify the blocker-counting logic between `cmdDashboard` (line 849) and `cmdHealth` (lines 1188-1193). The health command's approach is more robust -- adopt it in both places. Alternatively, extract a shared `parseBlockers(stateContent)` helper.

3. **F3 (WARNING):** Eliminate redundant `readdirSync` calls in the TUI plan listing (lines 913-936). The summary existence data is already available from the data-gathering phase. Build a `summarySet` per phase during the first read and reference it during TUI rendering.

4. **F4 (WARNING):** Delete the unused `hasSummary` variable on line 919 and remove the associated comment on line 918.

5. **F5 (WARNING):** Hoist the `activePhaseMatch` / `activePhaseNum` extraction (lines 815-816) above the `while (pMatch = phaseRegex.exec(...))` loop on line 762.

