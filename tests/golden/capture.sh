#!/usr/bin/env bash
#
# Golden Reference Capture Script
#
# Captures CLI output from bin/grd-tools.js for all commands before modularization.
# This output serves as the regression baseline: after refactoring, running the same
# commands must produce identical JSON/text output.
#
# Usage:
#   bash tests/golden/capture.sh
#
# Re-running overwrites previous captures (idempotent).

set -euo pipefail

# ─── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
GRD_TOOLS="${PROJECT_ROOT}/bin/grd-tools.js"
OUTPUT_DIR="${SCRIPT_DIR}/output"
MUTATING_DIR="${OUTPUT_DIR}/mutating"

# ─── Cleanup previous output ─────────────────────────────────────────────────

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}" "${MUTATING_DIR}"

# ─── Helper functions ─────────────────────────────────────────────────────────

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

capture() {
  local name="$1"
  local output_file="$2"
  shift 2
  echo "  CAPTURE: ${name} -> $(basename "${output_file}")"
  if "$@" > "${output_file}" 2>/dev/null; then
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    # Some commands exit non-zero but still produce valid output (e.g., validation failures)
    if [ -s "${output_file}" ]; then
      echo "    (exited non-zero but produced output -- kept)"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      echo "    FAILED: no output produced"
      rm -f "${output_file}"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  fi
}

skip() {
  local name="$1"
  local reason="$2"
  echo "  SKIP: ${name} -- ${reason}"
  SKIP_COUNT=$((SKIP_COUNT + 1))
}

# ─── Create temporary fixture directory ───────────────────────────────────────

create_fixture_dir() {
  local tmpdir="$1"

  # config.json
  cat > "${tmpdir}/.planning/config.json" << 'FIXTURE_EOF'
{
  "model_profile": "balanced",
  "commit_docs": true,
  "search_gitignored": false,
  "branching_strategy": "phase",
  "phase_branch_template": "grd/{milestone}/{phase}-{slug}",
  "milestone_branch_template": "grd/{milestone}-{slug}",
  "workflow": {
    "research": false,
    "plan_check": true,
    "verifier": true
  },
  "parallelization": true,
  "autonomous_mode": false,
  "code_review": {
    "enabled": true,
    "timing": "per_wave",
    "severity_gate": "blocker",
    "auto_fix_warnings": false
  }
}
FIXTURE_EOF

  # STATE.md
  cat > "${tmpdir}/.planning/STATE.md" << 'FIXTURE_EOF'
# State

**Updated:** 2026-01-15

## Current Position

- **Active phase:** 1 (01-test) -- IN PROGRESS
- **Current plan:** 01-01
- **Milestone:** M1: Foundation
- **Progress:** [=====-----] 50%

## Pending Decisions

None.

## Deferred Validations

| ID | Description | From Phase | Validates At | Status |
|----|-------------|-----------|-------------|--------|

## Key Decisions

| Date | Decision | Phase | Rationale |
|------|----------|-------|-----------|
| 2026-01-15 | Use balanced model profile | Planning | Cost-effective for infrastructure tasks |

## Blockers

None.

## Performance Metrics

| Phase-Plan | Duration | Tasks | Files |
|------------|----------|-------|-------|

## Session Continuity

- **Last action:** Initialized project
- **Next action:** Execute Phase 1
- **Context needed:** None

---

*State managed by: Claude (grd-executor)*
*Last updated: 2026-01-15*
FIXTURE_EOF

  # ROADMAP.md
  cat > "${tmpdir}/.planning/ROADMAP.md" << 'FIXTURE_EOF'
# Roadmap

**Project:** Golden Test Project
**Created:** 2026-01-15
**Updated:** 2026-01-15

## Milestone 1: Foundation
**Start:** 2026-01-15
**Target:** 2026-01-20
**Goal:** Establish project infrastructure

### Phase 1: Test Phase -- Setup and configuration
- **Duration:** 2d
- **Type:** implement
- **Scope:**
  - Create project structure
  - Configure tooling
- **Success criteria:**
  - Project structure exists
- **Risk:** Low
- **Plans:** 1 plan
  - [x] 01-01-PLAN.md -- Initial setup *(completed 2026-01-15)*

### Phase 2: Build Phase -- Core implementation
- **Duration:** 3d
- **Type:** implement
- **Scope:**
  - Build core features
- **Success criteria:**
  - Core features implemented
- **Risk:** Medium
- **Plans:** 1 plan
  - [ ] 02-01-PLAN.md -- Core build
FIXTURE_EOF

  # Phase directory with plan and summary (milestone-scoped)
  mkdir -p "${tmpdir}/.planning/milestones/anonymous/phases/01-test"

  cat > "${tmpdir}/.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md" << 'FIXTURE_EOF'
---
phase: 01-test
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/index.js
autonomous: true
verification_level: sanity

must_haves:
  truths:
    - "Project structure created"
  artifacts:
    - path: "src/index.js"
      provides: "Entry point"
  key_links: []
---

<objective>
Create project structure.
</objective>

<context>
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create project structure</name>
  <files>src/index.js</files>
  <action>Create entry point file.</action>
  <verify>File exists.</verify>
  <done>Entry point created.</done>
</task>

</tasks>

<verification>
Level 1 (Sanity): File exists.
</verification>

<success_criteria>
- src/index.js exists
</success_criteria>

<output>
After completion, create 01-01-SUMMARY.md
</output>
FIXTURE_EOF

  cat > "${tmpdir}/.planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md" << 'FIXTURE_EOF'
---
phase: 01-test
plan: 01
subsystem: infra
tags: [setup]

requires:
  - phase: none
    provides: none
provides:
  - project structure
affects: [02-build]

tech-stack:
  added: [node]
  patterns: [cli]

key-files:
  created: [src/index.js]
  modified: []

key-decisions:
  - "Used Node.js for CLI tooling"

patterns-established:
  - "CLI pattern: command + subcommand"

duration: 1min
completed: 2026-01-15
---

# Phase 1 Plan 01: Initial Setup Summary

**Created project structure with entry point and configuration.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-15T10:00:00Z
- **Completed:** 2026-01-15T10:01:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created src/index.js entry point

## Task Commits

1. **Task 1: Create project structure** - `abc1234` (feat)

## Files Created/Modified
- `src/index.js` - Entry point

## Decisions Made
Used Node.js for CLI tooling.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Ready for Phase 2.

---
*Phase: 01-test*
*Completed: 2026-01-15*
FIXTURE_EOF

  # Phase 2 directory (incomplete -- no summary)
  mkdir -p "${tmpdir}/.planning/milestones/anonymous/phases/02-build"

  cat > "${tmpdir}/.planning/milestones/anonymous/phases/02-build/02-01-PLAN.md" << 'FIXTURE_EOF'
---
phase: 02-build
plan: 01
type: execute
wave: 1
depends_on: [01-01]
files_modified:
  - src/core.js
autonomous: true
verification_level: sanity

must_haves:
  truths:
    - "Core module implemented"
  artifacts:
    - path: "src/core.js"
      provides: "Core module"
  key_links: []
---

<objective>
Build core module.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Build core</name>
  <files>src/core.js</files>
  <action>Implement core module.</action>
  <verify>Module exports correctly.</verify>
  <done>Core module exists.</done>
</task>

</tasks>

<verification>
Level 1 (Sanity): Module exists.
</verification>

<success_criteria>
- src/core.js exists
</success_criteria>
FIXTURE_EOF

  # Todos (milestone-scoped)
  mkdir -p "${tmpdir}/.planning/milestones/anonymous/todos/pending"
  mkdir -p "${tmpdir}/.planning/milestones/anonymous/todos/completed"

  cat > "${tmpdir}/.planning/milestones/anonymous/todos/pending/sample.md" << 'FIXTURE_EOF'
# Add logging utility

- **Priority:** low
- **Area:** infra
- **Captured:** 2026-01-15

Add a structured logging utility for debug output.
FIXTURE_EOF

  # Create a minimal src directory so verify-path-exists has something to check
  mkdir -p "${tmpdir}/src"
  echo "// entry point" > "${tmpdir}/src/index.js"
}

# ─── Read-only command captures ───────────────────────────────────────────────

echo ""
echo "=== Golden Reference Capture ==="
echo "=== $(date -u +"%Y-%m-%dT%H:%M:%SZ") ==="
echo ""

# Create fixture temp directory
FIXTURE_DIR=$(mktemp -d)
mkdir -p "${FIXTURE_DIR}/.planning"
create_fixture_dir "${FIXTURE_DIR}"

echo "[1/4] Capturing read-only commands..."

# -- State commands --
capture "state load" "${OUTPUT_DIR}/state-load.json" \
  node "${GRD_TOOLS}" state load
capture "state get" "${OUTPUT_DIR}/state-get.json" \
  node "${GRD_TOOLS}" state get
capture "state get section" "${OUTPUT_DIR}/state-get-decisions.json" \
  node "${GRD_TOOLS}" state get "Key Decisions"
capture "state-snapshot" "${OUTPUT_DIR}/state-snapshot.json" \
  node "${GRD_TOOLS}" state-snapshot

# -- Model resolution --
capture "resolve-model grd-executor" "${OUTPUT_DIR}/resolve-model.json" \
  node "${GRD_TOOLS}" resolve-model grd-executor

# -- Phase lookup --
capture "find-phase 1" "${OUTPUT_DIR}/find-phase.json" \
  node "${GRD_TOOLS}" find-phase 1

# -- Utility commands --
capture "generate-slug" "${OUTPUT_DIR}/generate-slug.json" \
  node "${GRD_TOOLS}" generate-slug "Hello World Test"
capture "current-timestamp" "${OUTPUT_DIR}/current-timestamp.txt" \
  node "${GRD_TOOLS}" current-timestamp --raw
capture "current-timestamp full" "${OUTPUT_DIR}/current-timestamp-full.json" \
  node "${GRD_TOOLS}" current-timestamp full
capture "current-timestamp date" "${OUTPUT_DIR}/current-timestamp-date.json" \
  node "${GRD_TOOLS}" current-timestamp date
capture "current-timestamp filename" "${OUTPUT_DIR}/current-timestamp-filename.json" \
  node "${GRD_TOOLS}" current-timestamp filename

# -- Path verification --
capture "verify-path-exists (exists)" "${OUTPUT_DIR}/verify-path-exists.json" \
  node "${GRD_TOOLS}" verify-path-exists src/index.js
capture "verify-path-exists (missing)" "${OUTPUT_DIR}/verify-path-exists-missing.json" \
  node "${GRD_TOOLS}" verify-path-exists nonexistent/file.txt

# -- Frontmatter commands --
capture "frontmatter get" "${OUTPUT_DIR}/frontmatter-get.json" \
  node "${GRD_TOOLS}" frontmatter get .planning/milestones/anonymous/phases/01-test/01-01-PLAN.md
capture "frontmatter get --field" "${OUTPUT_DIR}/frontmatter-get-field.json" \
  node "${GRD_TOOLS}" frontmatter get .planning/milestones/anonymous/phases/01-test/01-01-PLAN.md --field phase
capture "frontmatter validate plan" "${OUTPUT_DIR}/frontmatter-validate.json" \
  node "${GRD_TOOLS}" frontmatter validate .planning/milestones/anonymous/phases/01-test/01-01-PLAN.md --schema plan
capture "frontmatter validate summary" "${OUTPUT_DIR}/frontmatter-validate-summary.json" \
  node "${GRD_TOOLS}" frontmatter validate .planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md --schema summary

# -- Verification suite --
capture "verify plan-structure" "${OUTPUT_DIR}/verify-plan-structure.json" \
  node "${GRD_TOOLS}" verify plan-structure .planning/milestones/anonymous/phases/01-test/01-01-PLAN.md
capture "verify phase-completeness 1" "${OUTPUT_DIR}/verify-phase-completeness.json" \
  node "${GRD_TOOLS}" verify phase-completeness 1
capture "verify phase-completeness 2" "${OUTPUT_DIR}/verify-phase-completeness-incomplete.json" \
  node "${GRD_TOOLS}" verify phase-completeness 2
capture "verify references" "${OUTPUT_DIR}/verify-references.json" \
  node "${GRD_TOOLS}" verify references .planning/milestones/anonymous/phases/01-test/01-01-PLAN.md
capture "verify artifacts" "${OUTPUT_DIR}/verify-artifacts.json" \
  node "${GRD_TOOLS}" verify artifacts .planning/milestones/anonymous/phases/01-test/01-01-PLAN.md
capture "verify key-links" "${OUTPUT_DIR}/verify-key-links.json" \
  node "${GRD_TOOLS}" verify key-links .planning/milestones/anonymous/phases/01-test/01-01-PLAN.md

# -- Roadmap commands --
capture "roadmap get-phase 1" "${OUTPUT_DIR}/roadmap-get-phase.json" \
  node "${GRD_TOOLS}" roadmap get-phase 1
capture "roadmap analyze" "${OUTPUT_DIR}/roadmap-analyze.json" \
  node "${GRD_TOOLS}" roadmap analyze

# -- Index and digest --
capture "phase-plan-index 1" "${OUTPUT_DIR}/phase-plan-index.json" \
  node "${GRD_TOOLS}" phase-plan-index 1
capture "history-digest" "${OUTPUT_DIR}/history-digest.json" \
  node "${GRD_TOOLS}" history-digest
capture "summary-extract" "${OUTPUT_DIR}/summary-extract.json" \
  node "${GRD_TOOLS}" summary-extract .planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md
capture "summary-extract --fields" "${OUTPUT_DIR}/summary-extract-fields.json" \
  node "${GRD_TOOLS}" summary-extract .planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md --fields phase,duration

# -- Progress --
capture "progress json" "${OUTPUT_DIR}/progress-json.json" \
  node "${GRD_TOOLS}" progress json
capture "progress table" "${OUTPUT_DIR}/progress-table.txt" \
  node "${GRD_TOOLS}" progress table
capture "progress bar" "${OUTPUT_DIR}/progress-bar.txt" \
  node "${GRD_TOOLS}" progress bar

# -- Validation --
capture "validate consistency" "${OUTPUT_DIR}/validate-consistency.json" \
  node "${GRD_TOOLS}" validate consistency

# -- Todos --
capture "list-todos" "${OUTPUT_DIR}/list-todos.json" \
  node "${GRD_TOOLS}" list-todos

# -- Phases --
capture "phases list" "${OUTPUT_DIR}/phases-list.json" \
  node "${GRD_TOOLS}" phases list
capture "phases list --type" "${OUTPUT_DIR}/phases-list-type.json" \
  node "${GRD_TOOLS}" phases list --type plan
capture "phases list --phase" "${OUTPUT_DIR}/phases-list-phase.json" \
  node "${GRD_TOOLS}" phases list --phase 1

# -- Phase utilities --
capture "phase next-decimal 1" "${OUTPUT_DIR}/phase-next-decimal.json" \
  node "${GRD_TOOLS}" phase next-decimal 1

# -- Config --
capture "config-ensure-section" "${OUTPUT_DIR}/config-ensure-section.json" \
  node "${GRD_TOOLS}" config-ensure-section

# -- Tracker (read-only only) --
capture "tracker get-config" "${OUTPUT_DIR}/tracker-get-config.json" \
  node "${GRD_TOOLS}" tracker get-config

# -- Template --
capture "template fill summary" "${OUTPUT_DIR}/template-fill-summary.txt" \
  node "${GRD_TOOLS}" template fill summary --phase 1 --plan 01 --name "Test Plan"
capture "template fill plan" "${OUTPUT_DIR}/template-fill-plan.txt" \
  node "${GRD_TOOLS}" template fill plan --phase 1 --plan 01 --type execute --wave 1

# -- Init workflows (read-only context builders) --
capture "init execute-phase" "${OUTPUT_DIR}/init-execute-phase.json" \
  node "${GRD_TOOLS}" init execute-phase 1
capture "init plan-phase" "${OUTPUT_DIR}/init-plan-phase.json" \
  node "${GRD_TOOLS}" init plan-phase 1
capture "init new-project" "${OUTPUT_DIR}/init-new-project.json" \
  node "${GRD_TOOLS}" init new-project
capture "init resume" "${OUTPUT_DIR}/init-resume.json" \
  node "${GRD_TOOLS}" init resume
capture "init verify-work" "${OUTPUT_DIR}/init-verify-work.json" \
  node "${GRD_TOOLS}" init verify-work 1
capture "init phase-op" "${OUTPUT_DIR}/init-phase-op.json" \
  node "${GRD_TOOLS}" init phase-op 1
capture "init todos" "${OUTPUT_DIR}/init-todos.json" \
  node "${GRD_TOOLS}" init todos
capture "init milestone-op" "${OUTPUT_DIR}/init-milestone-op.json" \
  node "${GRD_TOOLS}" init milestone-op
capture "init map-codebase" "${OUTPUT_DIR}/init-map-codebase.json" \
  node "${GRD_TOOLS}" init map-codebase
capture "init progress" "${OUTPUT_DIR}/init-progress.json" \
  node "${GRD_TOOLS}" init progress

# -- Verify summary --
capture "verify-summary" "${OUTPUT_DIR}/verify-summary.json" \
  node "${GRD_TOOLS}" verify-summary .planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md

# Go back to project root for remaining captures
cd "${PROJECT_ROOT}"

# ─── Mutating command captures (isolated temp dirs) ───────────────────────────

echo ""
echo "[2/4] Capturing mutating commands (isolated temp dirs)..."

# --- state patch ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "state patch" "${MUTATING_DIR}/state-patch.json" \
  node "${GRD_TOOLS}" state patch --phase "1" --plan "02"
rm -rf "${MUTATE_DIR}"

# --- state advance-plan ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "state advance-plan" "${MUTATING_DIR}/state-advance-plan.json" \
  node "${GRD_TOOLS}" state advance-plan
rm -rf "${MUTATE_DIR}"

# --- state record-metric ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "state record-metric" "${MUTATING_DIR}/state-record-metric.json" \
  node "${GRD_TOOLS}" state record-metric --phase 01 --plan 01 --duration 2min --tasks 1 --files 1
rm -rf "${MUTATE_DIR}"

# --- state update-progress ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "state update-progress" "${MUTATING_DIR}/state-update-progress.json" \
  node "${GRD_TOOLS}" state update-progress
rm -rf "${MUTATE_DIR}"

# --- state add-decision ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "state add-decision" "${MUTATING_DIR}/state-add-decision.json" \
  node "${GRD_TOOLS}" state add-decision --summary "Test decision" --phase 1 --rationale "Testing"
rm -rf "${MUTATE_DIR}"

# --- state add-blocker ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "state add-blocker" "${MUTATING_DIR}/state-add-blocker.json" \
  node "${GRD_TOOLS}" state add-blocker --text "Test blocker"
rm -rf "${MUTATE_DIR}"

# --- state resolve-blocker ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
# First add a blocker, then resolve it
node "${GRD_TOOLS}" state add-blocker --text "Removable blocker" > /dev/null 2>&1 || true
capture "state resolve-blocker" "${MUTATING_DIR}/state-resolve-blocker.json" \
  node "${GRD_TOOLS}" state resolve-blocker --text "Removable blocker"
rm -rf "${MUTATE_DIR}"

# --- state record-session ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "state record-session" "${MUTATING_DIR}/state-record-session.json" \
  node "${GRD_TOOLS}" state record-session --stopped-at "Completed 01-01-PLAN.md"
rm -rf "${MUTATE_DIR}"

# --- state update ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "state update" "${MUTATING_DIR}/state-update.json" \
  node "${GRD_TOOLS}" state update "Active phase" "2 (02-build)"
rm -rf "${MUTATE_DIR}"

# --- frontmatter set ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "frontmatter set" "${MUTATING_DIR}/frontmatter-set.json" \
  node "${GRD_TOOLS}" frontmatter set .planning/milestones/anonymous/phases/01-test/01-01-PLAN.md --field wave --value 2
rm -rf "${MUTATE_DIR}"

# --- frontmatter merge ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "frontmatter merge" "${MUTATING_DIR}/frontmatter-merge.json" \
  node "${GRD_TOOLS}" frontmatter merge .planning/milestones/anonymous/phases/01-test/01-01-PLAN.md --data '{"wave": 3}'
rm -rf "${MUTATE_DIR}"

# --- phase add ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "phase add" "${MUTATING_DIR}/phase-add.json" \
  node "${GRD_TOOLS}" phase add "New testing phase"
rm -rf "${MUTATE_DIR}"

# --- phase insert ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "phase insert" "${MUTATING_DIR}/phase-insert.json" \
  node "${GRD_TOOLS}" phase insert 1 "Inserted phase after 1"
rm -rf "${MUTATE_DIR}"

# --- phase remove ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "phase remove" "${MUTATING_DIR}/phase-remove.json" \
  node "${GRD_TOOLS}" phase remove 2 --force
rm -rf "${MUTATE_DIR}"

# --- phase complete ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "phase complete" "${MUTATING_DIR}/phase-complete.json" \
  node "${GRD_TOOLS}" phase complete 1
rm -rf "${MUTATE_DIR}"

# --- todo complete ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "todo complete" "${MUTATING_DIR}/todo-complete.json" \
  node "${GRD_TOOLS}" todo complete sample.md
rm -rf "${MUTATE_DIR}"

# --- scaffold ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "scaffold context" "${MUTATING_DIR}/scaffold-context.json" \
  node "${GRD_TOOLS}" scaffold context --phase 1
rm -rf "${MUTATE_DIR}"

MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "scaffold phase-dir" "${MUTATING_DIR}/scaffold-phase-dir.json" \
  node "${GRD_TOOLS}" scaffold phase-dir --phase 3 --name "new-feature"
rm -rf "${MUTATE_DIR}"

# --- config-set ---
MUTATE_DIR=$(mktemp -d)
mkdir -p "${MUTATE_DIR}/.planning"
create_fixture_dir "${MUTATE_DIR}"
cd "${MUTATE_DIR}"
capture "config-set" "${MUTATING_DIR}/config-set.json" \
  node "${GRD_TOOLS}" config-set autonomous_mode true
rm -rf "${MUTATE_DIR}"

# ─── Git-dependent command captures ───────────────────────────────────────────

echo ""
echo "[3/4] Capturing git-dependent commands..."

GIT_DIR=$(mktemp -d)
mkdir -p "${GIT_DIR}/.planning"
create_fixture_dir "${GIT_DIR}"
cd "${GIT_DIR}"

# Initialize a git repo for git-dependent commands
git init -q
git add -A
git commit -q -m "Initial commit for golden tests"

INITIAL_HASH=$(git rev-parse --short HEAD)

# commit (creates a new file, stages, and commits via grd-tools)
echo "// new file" > "${GIT_DIR}/src/new.js"
capture "commit" "${MUTATING_DIR}/commit.json" \
  node "${GRD_TOOLS}" commit "test: golden reference commit" --files src/new.js

COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "none")

# verify commits
capture "verify commits" "${MUTATING_DIR}/verify-commits.json" \
  node "${GRD_TOOLS}" verify commits "${INITIAL_HASH}" "${COMMIT_HASH}"

rm -rf "${GIT_DIR}"

# ─── Skipped commands ─────────────────────────────────────────────────────────

echo ""
echo "[4/4] Noting skipped commands..."

skip "tracker sync-roadmap" "requires GitHub CLI or Jira"
skip "tracker sync-phase" "requires GitHub CLI or Jira"
skip "tracker update-status" "requires GitHub CLI or Jira"
skip "tracker add-comment" "requires GitHub CLI or Jira"
skip "tracker sync-status" "requires GitHub CLI or Jira"
skip "tracker prepare-roadmap-sync" "requires tracker config with provider"
skip "tracker prepare-phase-sync" "requires tracker config with provider"
skip "tracker record-mapping" "requires TRACKER.md setup"
skip "tracker record-status" "requires TRACKER.md setup"
skip "tracker schedule" "requires dates in ROADMAP.md milestones"
skip "tracker prepare-reschedule" "requires tracker config with provider"
skip "init new-milestone" "requires specific milestone state"
skip "init quick" "requires description arg (generates unique output)"
skip "milestone complete" "requires milestone state setup"

# ─── Cleanup fixture dir ─────────────────────────────────────────────────────

cd "${PROJECT_ROOT}"
rm -rf "${FIXTURE_DIR}"

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "=== Capture Summary ==="
TOTAL_FILES=$(find "${OUTPUT_DIR}" -type f | wc -l | tr -d ' ')
JSON_FILES=$(find "${OUTPUT_DIR}" -name "*.json" -type f | wc -l | tr -d ' ')
TXT_FILES=$(find "${OUTPUT_DIR}" -name "*.txt" -type f | wc -l | tr -d ' ')
echo "  Total files:   ${TOTAL_FILES}"
echo "  JSON files:    ${JSON_FILES}"
echo "  Text files:    ${TXT_FILES}"
echo "  Passed:        ${PASS_COUNT}"
echo "  Failed:        ${FAIL_COUNT}"
echo "  Skipped:       ${SKIP_COUNT}"
echo ""

# Validate at least 5 JSON files contain valid JSON
VALID_JSON=0
for f in $(find "${OUTPUT_DIR}" -name "*.json" -type f | head -20); do
  if node -e "JSON.parse(require('fs').readFileSync('${f}','utf-8'))" 2>/dev/null; then
    VALID_JSON=$((VALID_JSON + 1))
  fi
done
echo "  Valid JSON:    ${VALID_JSON} (of first 20 checked)"

if [ "${TOTAL_FILES}" -lt 20 ]; then
  echo ""
  echo "ERROR: Expected >= 20 output files, got ${TOTAL_FILES}"
  exit 1
fi

if [ "${VALID_JSON}" -lt 5 ]; then
  echo ""
  echo "ERROR: Expected >= 5 valid JSON files, got ${VALID_JSON}"
  exit 1
fi

if [ "${FAIL_COUNT}" -gt 0 ]; then
  echo ""
  echo "WARNING: ${FAIL_COUNT} captures failed (see above)"
fi

echo ""
echo "=== Golden references captured successfully ==="
echo ""
