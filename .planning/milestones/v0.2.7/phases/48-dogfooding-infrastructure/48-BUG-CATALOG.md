# Bug Catalog: Phase 48 Dogfooding

Bugs discovered by running GRD CLI against testbed/. All bugs are in GRD source code (bin/, lib/), not testbed.

## Known Bugs (Pre-existing)

### BUG-48-001: currentMilestone() parsing failure
- **Source:** lib/paths.js, currentMilestone()
- **Symptom:** Returns "v0.0.5" instead of actual active milestone when STATE.md milestone field includes a name suffix
- **Trigger:** STATE.md format "v0.2.7 Self-Evolution" (version + name)
- **Impact:** All init workflows may return wrong milestone paths in certain STATE.md formats
- **Requirement:** REQ-112
- **Reproduction:** From GRD root: `node bin/grd-tools.js init plan-phase 48` -- check `current_milestone` field
- **Note:** Did NOT reproduce on testbed (testbed STATE.md format "v1.0.0 Initial Release" returned correct `milestone_version: "v1.0.0"`). Bug may be format-dependent.
- **Resolution:** NOT REPRODUCING. Investigated in Plan 49-03: regex `(v[\d.]+)` correctly extracts versions from "v0.2.7 Self-Evolution" and similar formats. Verified against both GRD and testbed STATE.md. 4 additional edge case tests added to tests/unit/paths.test.js.

## Discovered Bugs

### BUG-48-002: roadmap get-phase returns goal:null due to regex mismatch
- **Source:** lib/roadmap.js, cmdRoadmapGetPhase() line ~214 and cmdRoadmapAnalyze() line ~347
- **Symptom:** `goal` field always returns `null` even when goal text is present in ROADMAP.md
- **Trigger:** ROADMAP.md uses format `**Goal**: text` (colon after bold closing) but regex expects `**Goal:** text` (colon inside bold)
- **Impact:** Low -- goal text is still available in the `section` field, but structured `goal` extraction is broken for all phases
- **Regex:** `/\*\*Goal:\*\*\s*([^\n]+)/i` expects `**Goal:**` but actual format is `**Goal**:`
- **Reproduction:**
  ```bash
  cd testbed && node ../bin/grd-tools.js roadmap get-phase 1
  # Returns: "goal": null
  # Also fails on GRD's own ROADMAP:
  node bin/grd-tools.js roadmap get-phase 48
  # Returns: "goal": null
  ```
- **Fix:** Change regex to `/\*\*Goal:?\*\*:?\s*([^\n]+)/i` to handle both `**Goal:**` and `**Goal**:` formats
- **Resolution:** FIXED in Plan 49-01. Both `cmdRoadmapGetPhase()` and `analyzeRoadmap()` regexes updated. 4 regression tests added to tests/unit/roadmap.test.js.

### BUG-48-003: state-snapshot returns current_phase:null due to field name mismatch
- **Source:** lib/state.js, cmdStateSnapshot() line ~585
- **Symptom:** `current_phase`, `current_phase_name`, `total_phases` all return `null`
- **Trigger:** STATE.md uses `**Active phase:**` but parser looks for `**Current Phase:**`
- **Impact:** Medium -- state-snapshot cannot extract phase number from STATE.md, making programmatic phase tracking unreliable
- **Reproduction:**
  ```bash
  cd testbed && node ../bin/grd-tools.js state-snapshot
  # Returns: "current_phase": null, "current_phase_name": null, "total_phases": null
  ```
- **Note:** Both GRD's own STATE.md and testbed STATE.md use "Active phase" format, so this bug affects all projects
- **Resolution:** FIXED in Plan 49-01. `cmdStateSnapshot()` now tries "Active phase" first, falls back to "Current Phase". Parses "Phase N of M (Name)" format to extract phase number, name, and total. Also added "Current plan" (lowercase) support. 4 regression tests added to tests/unit/state.test.js.

### BUG-48-004: phase-plan-index returns objective:null and empty files_modified
- **Source:** lib/context.js, cmdPhasePlanIndex()
- **Symptom:** Plan index shows `objective: null` and `files_modified: []` even when plan has both `<objective>` tag and frontmatter `files_modified` array
- **Trigger:** Any plan with standard `<objective>` and frontmatter fields
- **Impact:** Low -- affects context optimization but plan files themselves are intact
- **Reproduction:**
  ```bash
  cd testbed && node ../bin/grd-tools.js phase-plan-index 1
  # Returns plans with "objective": null, "files_modified": []
  ```
- **Resolution:** FIXED in Plan 49-02. `cmdPhasePlanIndex()` now: (1) extracts objective from `<objective>` XML tag in body when not in frontmatter, searching body only (after `---` block) to avoid matching `<objective>` references in frontmatter strings; (2) checks `fm.files_modified` (underscore) in addition to `fm['files-modified']` (hyphen). 2 regression tests added to tests/unit/commands.test.js.

### BUG-48-005: state patch requires exact field name with spaces (no underscore mapping)
- **Source:** lib/state.js, cmdStatePatch() line ~152
- **Symptom:** `state patch --current_plan "1-01"` fails because regex looks for `**current_plan:**` literally
- **Trigger:** Using CLI field names with underscores (e.g., `current_plan`) when STATE.md uses spaces (e.g., `Current plan`)
- **Impact:** Low -- workaround is to use exact field name: `--"Current plan" "1-01"`
- **Reproduction:**
  ```bash
  cd testbed && node ../bin/grd-tools.js state patch --current_plan "1-01"
  # Returns: "failed": ["current_plan"]
  cd testbed && node ../bin/grd-tools.js state patch --"Current plan" "1-01"
  # Returns: "updated": ["Current plan"]
  ```
- **Resolution:** FIXED in Plan 49-02. Both `cmdStatePatch()` and `cmdStateUpdate()` now try underscore-to-space mapping when exact field name match fails. `--current_plan` maps to `**Current plan:**`, `--Active_phase` maps to `**Active phase:**`. 4 regression tests added to tests/unit/state.test.js.

## Summary

| Bug ID | Severity | Source | Status | Fixed In |
|--------|----------|--------|--------|----------|
| BUG-48-001 | High | lib/paths.js | NOT REPRODUCING -- regex correct, 4 edge case tests added | Plan 49-03 |
| BUG-48-002 | Low | lib/roadmap.js | FIXED -- goal regex handles both formats | Plan 49-01 |
| BUG-48-003 | Medium | lib/state.js | FIXED -- Active phase field parsing + Phase N of M format | Plan 49-01 |
| BUG-48-004 | Low | lib/commands.js | FIXED -- objective from XML tag, files_modified underscore key | Plan 49-02 |
| BUG-48-005 | Low | lib/state.js | FIXED -- underscore-to-space mapping in patch and update | Plan 49-02 |

---

*Catalog created: 2026-02-22 during Phase 48 dogfooding exercise*
