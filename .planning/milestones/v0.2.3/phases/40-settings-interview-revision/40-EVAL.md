---
phase: 40-settings-interview-revision
eval_designer: Claude (grd-eval-planner)
designed: 2026-02-21
verification_level: sanity
---

# Evaluation Plan: Phase 40 — Settings Interview Revision

**Designed:** 2026-02-21
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Markdown skill revision (`commands/settings.md`)
**Reference documents:** REQ-77, REQ-78, REQ-79, REQ-80 (no academic papers — this is a UX/configuration feature)

## Evaluation Overview

Phase 40 modifies a single markdown skill definition (`commands/settings.md`) — the interactive configuration interview that runs when a user invokes `/grd:settings`. The change is purely textual: questions are added, one question is replaced, the config merge template is expanded, and the confirmation display table is extended. There is no compiled code, no library function, and no automated test suite that exercises this file directly.

Because this is a markdown skill (not executable JS), the standard verification pyramid inverts: Level 1 sanity checks carry the primary verification burden and are the only tier that can be executed in-phase. Level 2 proxy metrics are limited to structural pattern matching — they serve as mechanically-verifiable proxies for the question coverage the interviewer will present to users. Level 3 deferred validation is the only way to confirm end-to-end behavior: the interview must actually run with a real Claude Code session writing a real `config.json`.

The five success criteria from the ROADMAP align directly with the four requirements (REQ-77 through REQ-80) and one integration requirement (full config.json output). All five criteria are verifiable at the text level in-phase via sanity checks; behavioral confirmation (does the interview actually work?) is deferred to Phase 41.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Old 3-way branching question absent | REQ-77 / ROADMAP SC-1 | Direct breakage risk if old conflicting question remains |
| New Yes/No isolation question present | REQ-77 / ROADMAP SC-1 | Core UX change — missing this means the revision is incomplete |
| Worktree sub-options present | REQ-77 / ROADMAP SC-1 | Sub-options are conditional on Yes; their absence means isolation is not configurable |
| Execution teams questions present | REQ-78 / ROADMAP SC-2 | Previously unconfigurable via interview |
| Code review questions present | REQ-79 / ROADMAP SC-3 | Previously unconfigurable via interview |
| Confirmation gate multi-select present | REQ-80 / ROADMAP SC-4 | All 5 toggles must appear in a multi-select |
| Config merge template covers all sections | ROADMAP SC-5 / 40-01-PLAN.md Task 3 | If the template omits a section, the interview silently drops that config |
| Confirm step summary table covers all settings | 40-01-PLAN.md Task 3 | User cannot verify what was saved without seeing it |
| Old `git.branching_strategy: "milestone"` option absent | REQ-77 / Phase 38 alignment | "Per Milestone" strategy was removed from the git model in Phase 38 |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 8 checks | Presence/absence of required text sections in `commands/settings.md` |
| Proxy (L2) | 3 metrics | Structural completeness — field name coverage in config template and summary table |
| Deferred (L3) | 2 validations | End-to-end interview execution producing a valid, complete `config.json` |

## Level 1: Sanity Checks

**Purpose:** Verify basic textual correctness of the revised skill file. These MUST ALL PASS before proceeding.

### S1: Old 3-way branching question removed

- **What:** The old `"Git branching strategy?"` question with its three options (None/Per Phase/Per Milestone) no longer appears in the file
- **Command:** `grep -c "Git branching strategy" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md`
- **Expected:** `0` (zero matches)
- **Failure means:** The old question was not removed. It will conflict with the new Yes/No isolation question and expose a removed git model option ("Per Milestone") that no longer exists in the config schema.

### S2: New worktree isolation question present

- **What:** The replacement question `"Use worktree isolation for phase execution?"` is present with Yes/No options
- **Command:** `grep -c "Use worktree isolation for phase execution" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md`
- **Expected:** `1` (exactly one occurrence — the question definition)
- **Failure means:** The core replacement question is missing. Task 1 was not completed.

### S3: Worktree sub-options present (worktree_dir and default_completion_action)

- **What:** Sub-option questions for `worktree_dir` (directory location) and `default_completion_action` (merge/PR/keep/discard) exist as conditional follow-ups
- **Command:** `grep -c "Worktree Directory\|Completion Action\|worktree_dir\|default_completion_action" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md`
- **Expected:** `>= 4` (at least one occurrence each for: header label "Worktree Directory", header label "Completion Action", field name "worktree_dir", field name "default_completion_action")
- **Failure means:** The sub-options for worktree isolation are missing. Users who select "Yes" have no way to configure the directory or completion behavior.

### S4: Execution teams questions present

- **What:** Questions for `use_teams` and `max_concurrent_teammates` appear in the interview (REQ-78)
- **Command:** `grep -c "Agent Teams\|use_teams\|max_concurrent_teammates\|Maximum concurrent teammates" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md`
- **Expected:** `>= 3` (references to: the question about Agent Teams, "use_teams" field, "max_concurrent_teammates" field)
- **Failure means:** Execution settings remain inaccessible via the interview. REQ-78 not satisfied.

### S5: Code review questions present

- **What:** Questions for `timing`, `severity_gate`, and `auto_fix_warnings` appear in the interview (REQ-79)
- **Command:** `grep -c "severity_gate\|auto_fix_warnings\|Severity Gate\|Auto-fix\|code review timing\|Automatic code review" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md`
- **Expected:** `>= 4` (references to severity gate, auto-fix warnings, timing question — at least one match per concept)
- **Failure means:** Code review settings remain inaccessible via the interview. REQ-79 not satisfied.

### S6: Confirmation gates multi-select with all 5 toggles present

- **What:** A multi-select question covering all 5 confirmation gates (commit_confirmation, file_deletion, phase_completion, target_adjustment, approach_change) is present (REQ-80)
- **Command:** `grep -c "commit_confirmation\|file_deletion\|phase_completion\|target_adjustment\|approach_change" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md`
- **Expected:** `5` (exactly one match per field name — in the read_current parsing section and/or config template)
- **Failure means:** One or more confirmation gate toggles are missing. Users cannot configure all gates. REQ-80 partially or fully unsatisfied.

### S7: Config merge template includes all new sections

- **What:** The `update_config` step's JSON template includes `git`, `execution`, `code_review`, and `confirmation_gates` sections with their sub-fields
- **Command:** `grep -c "\"execution\"\|\"code_review\"\|\"confirmation_gates\"\|\"worktree_dir\"\|\"use_teams\"" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md`
- **Expected:** `>= 5` (at least one match per key: "execution", "code_review", "confirmation_gates", "worktree_dir", "use_teams")
- **Failure means:** The config write step silently omits one or more sections. Running the interview will not update those config fields even if the user answered the questions.

### S8: Confirmation display table includes new settings rows

- **What:** The `confirm` step's summary table includes rows for the new settings (Git Isolation, Agent Teams, Code Review timing, severity gate, auto-fix, confirmation gates)
- **Command:** `grep -c "Git Isolation\|Agent Teams\|Severity Gate\|Auto-fix\|Gate: Commit\|Gate: File\|Gate: Phase\|Gate: Target\|Gate: Approach" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md`
- **Expected:** `>= 7` (at least one occurrence each for: Git Isolation, Agent Teams, Severity Gate, Auto-fix, Gate: Commit Confirm, Gate: File Deletion, Gate: Phase Complete — or equivalent labels)
- **Failure means:** The user sees a confirmation display that does not show the settings they just configured. UX regression: settings are written but not confirmed.

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Phase 41.

## Level 2: Proxy Metrics

**Purpose:** Structural verification of completeness — mechanically counting field name coverage in the config template and summary table as a proxy for "all settings are wired end-to-end."

**IMPORTANT:** Proxy metrics are NOT validated substitutes for live interview execution. A file that passes all pattern matches may still produce incorrect behavior if the mapping logic is wrong. These are coverage proxies only.

### P1: Config template field coverage

- **What:** The `update_config` step's JSON template covers all 10 new config fields that must be written
- **How:** Count occurrences of each required field name in the file; compare against the expected set of 10 fields
- **Command:**
  ```bash
  for field in worktree_dir default_completion_action use_teams max_concurrent_teammates timing severity_gate auto_fix_warnings commit_confirmation file_deletion phase_completion target_adjustment approach_change; do
    count=$(grep -c "$field" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md 2>/dev/null || echo 0)
    echo "$field: $count"
  done
  ```
- **Target:** All 12 field names appear at least once (10 new fields + target_adjustment + approach_change are the full set from config.json)
- **Evidence:** `config.json` at the project root defines these exact field names under `execution`, `code_review`, and `confirmation_gates` sections — verified by reading `.planning/config.json`
- **Correlation with full metric:** MEDIUM — presence in the template does not verify correct value mapping (e.g., "Ask each time" -> `"ask"` vs `null`), but absent fields are definitively broken
- **Blind spots:** Mapping logic errors (wrong values assigned to fields), conditional logic errors (worktree sub-options not shown when isolation=Yes), and JSON syntax errors in the template
- **Validated:** No — awaiting deferred validation at Phase 41

### P2: Summary table row coverage

- **What:** The `confirm` step summary table has a row for every configurable setting (new and existing)
- **How:** Count the table row patterns (`| Setting` prefix) vs. the known required setting count; compare against expected minimum of 18 rows from the plan's target table
- **Command:**
  ```bash
  grep -c "^| " /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md
  ```
- **Target:** >= 18 table rows (matching the 21-row table specified in Task 3 of 40-01-PLAN.md, minus header and separator rows)
- **Evidence:** The plan's Task 3 explicitly specifies the summary table with 21 rows covering all settings. Row count is a reliable proxy for coverage because each configurable setting maps to exactly one table row.
- **Correlation with full metric:** MEDIUM — row count does not verify row correctness (a row for "Git Isolation" might still show wrong values at runtime)
- **Blind spots:** Row labels that don't match the actual setting rendered at runtime, conditional rows (Worktree Directory N/A when isolation is Off) that may appear as present in static analysis but be invisible to the user
- **Validated:** No — awaiting deferred validation at Phase 41

### P3: read_current step parses all new fields

- **What:** The `read_current` step explicitly lists all new config fields to parse with their defaults
- **How:** Check that the read_current step references all 10 new fields by name with their default values
- **Command:**
  ```bash
  grep -A 30 "read_current" /Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md | grep -c "default\|Default"
  ```
- **Target:** >= 10 default value references in or near the read_current step (one per new field)
- **Evidence:** The plan's Task 2 explicitly lists all 10 new fields with their defaults (e.g., `execution.use_teams` default: false, `code_review.timing` default: "per_wave"). Without parsing these fields, the interview cannot pre-select current values, breaking the "current values pre-selected" UX guarantee stated in the existing skill.
- **Correlation with full metric:** LOW-to-MEDIUM — grep for "default" in this context is noisy; a more reliable check would be field-by-field grepping, which is covered by P1
- **Blind spots:** Does not verify that defaults are applied correctly when fields are absent from config.json (new installations)
- **Validated:** No — awaiting deferred validation at Phase 41

## Level 3: Deferred Validations

**Purpose:** Full behavioral verification requiring live Claude Code session execution of `/grd:settings`.

### D1: End-to-end interview produces valid config.json with all sections — DEFER-40-01

- **What:** Running `/grd:settings` end-to-end produces a `config.json` that contains all expected sections (`git`, `execution`, `code_review`, `confirmation_gates`) with correct field values matching user selections
- **How:** In a test project with a minimal `config.json`, run `/grd:settings` interactively, make specific selections for each new question, then inspect the resulting `config.json` to verify field values match selections
- **Why deferred:** The skill is a markdown instruction set executed by Claude Code's agent runtime. It cannot be invoked from a script or unit test. Execution requires an interactive Claude Code session.
- **Validates at:** Phase 41 (Command and Documentation Updates — integration phase)
- **Depends on:** Phase 40 fully executed (settings.md revised), a Claude Code session, and a test project directory with `.planning/config.json`
- **Target:** `config.json` after interview contains:
  - `git.branching_strategy` set correctly based on Yes/No answer
  - `git.worktree_dir` present and non-empty when isolation=Yes
  - `git.default_completion_action` set to one of `ask|merge|pr|keep` when isolation=Yes
  - `execution.use_teams` is boolean
  - `execution.max_concurrent_teammates` is 2, 4, or 6
  - `code_review.timing` is one of `per_wave|per_phase`
  - `code_review.enabled` is boolean and consistent with timing selection
  - `code_review.severity_gate` is one of `blocker|critical|warning`
  - `code_review.auto_fix_warnings` is boolean
  - All 5 `confirmation_gates.*` fields are boolean
- **Risk if unmet:** The settings interview is the primary UX surface for configuring GRD features. If it produces malformed config, users configuring execution teams or code review will get silently incorrect behavior. Fallback: direct `config.json` editing (documented in CLAUDE.md), but this is a regression in the product UX.
- **Fallback:** If the config merge step has bugs, a targeted fix to `commands/settings.md` update_config mapping logic can be applied in Phase 41 itself before the documentation update.

### D2: Old "Per Milestone" branching option is absent from live interview — DEFER-40-02

- **What:** When `/grd:settings` runs, the user is NOT presented with a "Per Milestone" git option. The old 3-way branching model (None/Per Phase/Per Milestone) does not appear.
- **How:** Observe the live interview output during Phase 41 integration validation. Confirm only Yes/No options appear for git isolation.
- **Why deferred:** Cannot observe interview presentation from static file analysis — the question UI is rendered by Claude Code's AskUserQuestion at runtime.
- **Validates at:** Phase 41 (when `/grd:settings` is run end-to-end as part of D1 above)
- **Depends on:** Same as D1 — live session execution
- **Target:** Git isolation question presents exactly 2 options (Yes / No). No third option.
- **Risk if unmet:** Users may attempt to select a "Per Milestone" option that no longer exists in the config schema (removed in Phase 38), leading to a config write with `branching_strategy: "milestone"` that the Phase 38 code may not handle correctly.
- **Fallback:** If old question text survives, it can be removed in Phase 41 as part of the documentation update pass.

## Ablation Plan

**No ablation plan** — Phase 40 modifies a single monolithic skill file with no sub-components to isolate. The file either contains the required questions or it does not. There are no competing implementation strategies or component-level contributions to analyze.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing questions count | Current `commands/settings.md` has 8 questions | 8 questions | Static count of AskUserQuestion options in current file |
| Existing config sections covered | Current update_config writes 5 sections | 5 sections (model_profile, workflow, git, research_gates, tracker) | Reading current settings.md update_config step |
| Existing summary table rows | Current confirm step has 10 table rows | 10 rows | Static count in current confirm step |

**After Phase 40:**

| Metric | Before | Target After |
|--------|--------|--------------|
| Interview question groups | 8 | 12+ (adds git sub-options, execution, code review, confirmation gates) |
| Config sections written | 5 | 7 (adds expanded git, execution, code_review, confirmation_gates; replaces old git) |
| Summary table rows | 10 | >= 18 |

## Evaluation Scripts

**Location of evaluation code:**

No dedicated evaluation scripts. All sanity checks use `grep` and `wc` against the modified file.

**How to run all sanity checks:**

```bash
FILE=/Users/edward.seo/dev/private/project/harness/GetResearchDone/commands/settings.md

echo "=== S1: Old branching question removed ==="
count=$(grep -c "Git branching strategy" "$FILE" 2>/dev/null || echo 0)
echo "Expected: 0 | Got: $count"

echo ""
echo "=== S2: New worktree isolation question present ==="
count=$(grep -c "Use worktree isolation for phase execution" "$FILE" 2>/dev/null || echo 0)
echo "Expected: 1 | Got: $count"

echo ""
echo "=== S3: Worktree sub-options present ==="
count=$(grep -c "Worktree Directory\|Completion Action\|worktree_dir\|default_completion_action" "$FILE" 2>/dev/null || echo 0)
echo "Expected: >=4 | Got: $count"

echo ""
echo "=== S4: Execution teams questions present ==="
count=$(grep -c "Agent Teams\|use_teams\|max_concurrent_teammates\|Maximum concurrent teammates" "$FILE" 2>/dev/null || echo 0)
echo "Expected: >=3 | Got: $count"

echo ""
echo "=== S5: Code review questions present ==="
count=$(grep -c "severity_gate\|auto_fix_warnings\|Severity Gate\|Auto-fix\|Automatic code review" "$FILE" 2>/dev/null || echo 0)
echo "Expected: >=4 | Got: $count"

echo ""
echo "=== S6: All 5 confirmation gate fields present ==="
count=$(grep -c "commit_confirmation\|file_deletion\|phase_completion\|target_adjustment\|approach_change" "$FILE" 2>/dev/null || echo 0)
echo "Expected: 5 | Got: $count"

echo ""
echo "=== S7: Config merge template covers new sections ==="
count=$(grep -c "\"execution\"\|\"code_review\"\|\"confirmation_gates\"\|\"worktree_dir\"\|\"use_teams\"" "$FILE" 2>/dev/null || echo 0)
echo "Expected: >=5 | Got: $count"

echo ""
echo "=== S8: Summary table includes new setting rows ==="
count=$(grep -c "Git Isolation\|Agent Teams\|Severity Gate\|Auto-fix\|Gate: Commit\|Gate: File\|Gate: Phase\|Gate: Target\|Gate: Approach" "$FILE" 2>/dev/null || echo 0)
echo "Expected: >=7 | Got: $count"
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Old branching question removed | PENDING | | |
| S2: New isolation question present | PENDING | | |
| S3: Worktree sub-options present | PENDING | | |
| S4: Execution teams questions present | PENDING | | |
| S5: Code review questions present | PENDING | | |
| S6: All 5 confirmation gates present | PENDING | | |
| S7: Config template covers all sections | PENDING | | |
| S8: Summary table covers new settings | PENDING | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Config template field coverage | 12 field names found | PENDING | PENDING | |
| P2: Summary table row coverage | >= 18 rows | PENDING | PENDING | |
| P3: read_current parses new fields | >= 10 default references | PENDING | PENDING | |

### Ablation Results

N/A — single skill file, no ablation applicable.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-40-01 | End-to-end interview produces valid config.json | PENDING | Phase 41 |
| DEFER-40-02 | "Per Milestone" option absent from live interview | PENDING | Phase 41 |

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM

**Justification:**

- Sanity checks: ADEQUATE — 8 pattern-match checks cover the key structural requirements directly mapped from ROADMAP success criteria. Each check is specific, reproducible, and has a clear pass/fail threshold.
- Proxy metrics: WEAKLY-EVIDENCED — proxy metrics are pattern counts in a markdown file. They can confirm that field names appear somewhere in the file but cannot verify correct wiring, conditional logic, or runtime behavior. The correlation between "field name present" and "field is correctly written to config.json" is MEDIUM at best.
- Deferred coverage: PARTIAL — two deferred items cover the critical behavioral gaps (does the interview actually run correctly? does the old option disappear?), but they cannot be collected until Phase 41 provides a live execution opportunity.

**What this evaluation CAN tell us:**

- Whether all required question text exists in the skill file
- Whether the config merge template references all required field names
- Whether the confirmation display mentions all new settings
- Whether the old 3-way branching question was removed from the file

**What this evaluation CANNOT tell us:**

- Whether the conditional logic (show sub-options when isolation=Yes) functions correctly at runtime — deferred to Phase 41
- Whether value mappings are correct (e.g., "Ask each time" -> `"ask"` vs. omitting the field) — deferred to Phase 41
- Whether the interview correctly pre-selects current config values when re-run — deferred to Phase 41
- Whether the generated config.json is valid JSON after the merge — deferred to Phase 41
- Whether Claude Code's AskUserQuestion renders the multi-select for confirmation gates as intended — deferred to Phase 41

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-21*
