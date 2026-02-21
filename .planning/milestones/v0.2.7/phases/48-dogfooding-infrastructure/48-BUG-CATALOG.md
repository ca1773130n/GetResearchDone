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
- **Fix:** Change regex to `/\*\*Goal\*?\*?:?\*?\*?\s*:?\s*([^\n]+)/i` or simpler: handle both `**Goal:**` and `**Goal**:` formats

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

## Summary

| Bug ID | Severity | Source | Status |
|--------|----------|--------|--------|
| BUG-48-001 | High | lib/paths.js | Pre-existing (REQ-112), did not reproduce on testbed |
| BUG-48-002 | Low | lib/roadmap.js | New -- goal regex mismatch |
| BUG-48-003 | Medium | lib/state.js | New -- field name mismatch in snapshot parser |
| BUG-48-004 | Low | lib/context.js | New -- plan index extraction incomplete |
| BUG-48-005 | Low | lib/state.js | New -- no underscore-to-space field name mapping |

---

*Catalog created: 2026-02-22 during Phase 48 dogfooding exercise*
