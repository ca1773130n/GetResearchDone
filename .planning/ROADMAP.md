# Roadmap: GRD

## Milestones

- v0.0.5 Production-Ready R&D Workflow Automation - Phases 1-8 (shipped 2026-02-15)
- v0.1.0 Setup Functionality & Usability - Phases 9-13 (shipped 2026-02-16)
- v0.1.1 Completeness, Interoperability & Distribution - Phases 14-18 (shipped 2026-02-16)
- v0.1.2 Developer Experience & Requirement Traceability - Phases 19-20 (shipped 2026-02-16)
- v0.1.3 MCP Completion & Branching Fix - Phases 21-22 (shipped 2026-02-17)
- v0.1.4 Slash Command Registration & Missing Commands (shipped 2026-02-17)
- v0.1.5 Long-Term Roadmap Redesign - Phases 23-25 (shipped 2026-02-17)
- v0.1.6 Phase Directory Collision Fix - Phase 26 (shipped 2026-02-19)
- v0.2.0 Git Worktree Parallel Execution - Phases 27-31 (shipped 2026-02-19)
- **v0.2.1 Hierarchical Planning Directory - Phases 32-36 (active)**

## Phases

<details>
<summary>v0.0.5 Production-Ready R&D Workflow Automation (Phases 1-8) - SHIPPED 2026-02-15</summary>

Phases 1-8 delivered security hardening, modularization, test infrastructure, CI/CD, linting, input validation, documentation, and TUI dashboard. See `.planning/milestones/v0.0.5-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.0 Setup Functionality & Usability (Phases 9-13) - SHIPPED 2026-02-16</summary>

Phases 9-13 delivered multi-backend detection, context init enrichment, hierarchical roadmap planning, milestone lifecycle management, and auto-cleanup quality analysis. See `.planning/milestones/v0.1.0-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.1 Completeness, Interoperability & Distribution (Phases 14-18) - SHIPPED 2026-02-16</summary>

Phases 14-18 delivered doc drift detection, deferred validation resolution, MCP server, npm distribution, and end-to-end integration validation. See `.planning/milestones/v0.1.1-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.2 Developer Experience & Requirement Traceability (Phases 19-20) - SHIPPED 2026-02-16</summary>

Phases 19-20 delivered requirement inspection commands, phase-detail requirement summaries, planning artifact search, and requirement status management. See `.planning/milestones/v0.1.2-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.3 MCP Completion & Branching Fix (Phases 21-22) - SHIPPED 2026-02-17</summary>

Phases 21-22 wired v0.1.2 CLI commands as MCP tools (102 total) and fixed execute-phase branching to always fork from latest base branch. See `.planning/milestones/v0.1.3-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.4 Slash Command Registration & Missing Commands - SHIPPED 2026-02-17</summary>

Added /grd:long-term-roadmap and /grd:requirement slash commands, added YAML frontmatter to 28 command files fixing skill registration (all 45 commands now discoverable), updated README command table from 24 to 45 commands.

</details>

<details>
<summary>v0.1.5 Long-Term Roadmap Redesign (Phases 23-25) - SHIPPED 2026-02-17</summary>

Phases 23-25 replaced the rigid Now/Next/Later tier system with a flat, ordered LT-N milestone model. Complete rewrite of lib/long-term-roadmap.js (18 new functions), 12 new subcommands (list, add, remove, update, refine, link, unlink, display, init, history, parse, validate), 12 new MCP tools (105 total), protection rules for shipped milestones, comprehensive tutorial, and full integration into agents and commands.

</details>

<details>
<summary>v0.1.6 Phase Directory Collision Fix (Phase 26) - SHIPPED 2026-02-19</summary>

Phase 26 added milestone-scoped phase directory archival and a validation gate system to prevent phase collisions across milestones. Phase directories are now archived to `.planning/milestones/{version}-phases/` during milestone completion. Pre-flight gates detect orphaned phases, stale artifacts, and milestone state inconsistencies before commands execute.

</details>

<details>
<summary>v0.2.0 Git Worktree Parallel Execution (Phases 27-31) - SHIPPED 2026-02-19</summary>

Phases 27-31 delivered worktree-isolated phase execution with parallel teammate spawning. New modules: lib/worktree.js (lifecycle management), lib/deps.js (dependency analysis with Kahn's algorithm), lib/parallel.js (parallel execution engine). PR workflow from worktrees, sequential fallback for non-Claude Code backends, 7 new MCP tools (112 total), 946-line E2E integration test suite, 144 new tests (1,577 total). See `.planning/milestones/v0.2.0-ROADMAP.md` for details.

</details>

### v0.2.1 Hierarchical Planning Directory (Phases 32-36)

**Goal:** Migrate all `.planning/` subdirectory paths to a strict milestone-scoped hierarchy via a centralized path resolver, eliminating scattered top-level directories.

---

#### Phase 32: Centralized Path Resolution Module

**Goal:** A single `lib/paths.js` module exists that all other modules can import to resolve any `.planning/` subdirectory path, with milestone-scoping and backward compatibility.

**Dependencies:** None (foundation phase)

**Requirements:** REQ-46, REQ-47, REQ-48, REQ-49, REQ-50, REQ-67

**Verification Level:** sanity

**Success Criteria:**
1. `lib/paths.js` exports all 7+ path resolver functions (`phasesDir`, `phaseDir`, `researchDir`, `codebaseDir`, `todosDir`, `quickDir`, `milestonesDir`) and each returns the correct absolute path under `.planning/milestones/{milestone}/`
2. `currentMilestone(cwd)` reads STATE.md and returns the active milestone name; returns `"anonymous"` when no milestone is active
3. `archivedPhasesDir(cwd, version)` returns the correct path for legacy archived milestone data (`.planning/milestones/{version}-phases/`)
4. All path functions accept explicit `cwd` and `milestone` parameters; `milestone` defaults to `currentMilestone(cwd)` when omitted
5. `tests/unit/paths.test.js` exists with >90% line coverage on `lib/paths.js`

---

#### Phase 33: lib/ Module Migration

**Goal:** Every lib/ module that constructs `.planning/` subdirectory paths uses `paths.js` instead of hardcoded strings, and all init functions output milestone-scoped paths in their JSON responses.

**Dependencies:** Phase 32

**Requirements:** REQ-51, REQ-52, REQ-53, REQ-54, REQ-55, REQ-56

**Verification Level:** proxy

**Success Criteria:**
1. Zero occurrences of hardcoded `.planning/phases/` path construction remain in `lib/phase.js`, `lib/commands.js`, `lib/context.js`, `lib/utils.js`, `lib/scaffold.js`, `lib/cleanup.js`, `lib/gates.js`, `lib/roadmap.js`, `lib/state.js`, `lib/tracker.js`, `lib/verify.js`
2. `grep -r "path.join.*\\.planning.*phases" lib/` returns only `lib/paths.js` (all other modules delegate to it)
3. All `cmdInit*` functions in `lib/context.js` include `phases_dir`, `research_dir`, `codebase_dir`, `quick_dir`, and `todos_dir` fields in their JSON output, and each points to a milestone-scoped directory
4. `bin/postinstall.js` `DIRECTORIES` array creates the new hierarchy structure (`.planning/milestones/anonymous/quick/`, `.planning/milestones/anonymous/research/`, `.planning/milestones/anonymous/todos/`)
5. All 1,577+ existing tests continue to pass (zero regressions confirmed by `npm test`)

---

#### Phase 34: Command & Agent Markdown Migration

**Goal:** All command and agent markdown files reference milestone-scoped paths by consuming them from init context output rather than hardcoding directory strings.

**Dependencies:** Phase 33

**Requirements:** REQ-57, REQ-58

**Verification Level:** sanity

**Success Criteria:**
1. Zero occurrences of hardcoded `.planning/phases/`, `.planning/research/`, `.planning/codebase/`, `.planning/todos/`, `.planning/quick/` in any `commands/*.md` file (paths consumed from init context variables instead)
2. Zero occurrences of hardcoded `.planning/phases/`, `.planning/research/`, `.planning/codebase/`, `.planning/todos/`, `.planning/quick/` in any `agents/*.md` file
3. All 20+ command markdown files and 14+ agent markdown files updated and syntactically valid
4. `npm test` passes with zero regressions

---

#### Phase 35: Migration Script & Archive Simplification

**Goal:** A `grd-tools migrate-dirs` command exists that moves existing top-level `.planning/` subdirectories to the new hierarchy, milestone completion no longer copies phase directories, and the migration is idempotent.

**Dependencies:** Phase 33

**Requirements:** REQ-59, REQ-60, REQ-61, REQ-62, REQ-63

**Verification Level:** proxy

**Success Criteria:**
1. `node bin/grd-tools.js migrate-dirs` moves `.planning/phases/`, `.planning/quick/`, `.planning/research/`, `.planning/codebase/`, `.planning/todos/` to their correct milestone-scoped locations using `currentMilestone()` from STATE.md
2. Running `migrate-dirs` a second time on an already-migrated directory produces no changes and exits successfully (idempotent)
3. `cmdMilestoneComplete` no longer copies phase directories to a separate archive location (phases are already under `.planning/milestones/{version}/phases/`)
4. Completed milestones are distinguishable from active ones (via rename to `{version}-archived/` or metadata marker)
5. Migration correctly detects and uses the current milestone from STATE.md for placing active artifacts

---

#### Phase 36: Test Updates, Documentation & Integration Validation

**Goal:** All tests pass against the new directory hierarchy with zero regressions, documentation reflects the new structure, and the full pipeline works end-to-end.

**Dependencies:** Phase 33, Phase 34, Phase 35

**Requirements:** REQ-64, REQ-65, REQ-66, REQ-68, REQ-69

**Verification Level:** proxy

**Success Criteria:**
1. All unit tests that previously constructed `.planning/phases/` paths now use the new milestone-scoped hierarchy and pass
2. All integration and golden tests updated to use the new hierarchy and pass
3. `npm test` reports all 1,577+ tests passing with zero regressions (REQ-66)
4. CLAUDE.md "Planning Directory" section accurately reflects the new hierarchy with `.planning/milestones/{milestone}/phases/`, `.planning/milestones/{milestone}/research/`, etc.
5. All `docs/` files referencing old directory structure are updated to reflect the new hierarchy

---

### v0.2.1 Progress

| Phase | Name | Status | Requirements |
|-------|------|--------|--------------|
| 32 | Centralized Path Resolution Module | Pending | REQ-46, REQ-47, REQ-48, REQ-49, REQ-50, REQ-67 |
| 33 | lib/ Module Migration | Pending | REQ-51, REQ-52, REQ-53, REQ-54, REQ-55, REQ-56 |
| 34 | Command & Agent Markdown Migration | Pending | REQ-57, REQ-58 |
| 35 | Migration Script & Archive Simplification | Pending | REQ-59, REQ-60, REQ-61, REQ-62, REQ-63 |
| 36 | Test Updates, Documentation & Integration Validation | Pending | REQ-64, REQ-65, REQ-66, REQ-68, REQ-69 |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 8 (DEFER-08-01) | User acceptance testing of TUI dashboard commands | post-v1.0 | Pending (not in scope) |
| Phase 30 (DEFER-30-01) | Full parallel execution with real teammate spawning on Claude Code | Future | PARTIALLY RESOLVED (v0.2.0, runtime gap) |
