# Requirements Archive: v0.2.0 Git Worktree Parallel Execution

**Archived:** 2026-02-19
**Status:** SHIPPED

For current requirements, see `.planning/REQUIREMENTS.md`.

---

# Requirements: v0.2.0 — Git Worktree Parallel Execution

**Created:** 2026-02-19
**Milestone:** v0.2.0

## Feature 1: Git Worktree Phase Isolation

### REQ-40: Worktree Creation for Phase Execution
**Priority:** P0
**Category:** CLI/Workflow
When `execute-phase` starts, create a git worktree in a temp directory (`os.tmpdir()/grd-worktree-{milestone}-{phase}`). The worktree checks out a new phase branch. All plan execution operates within this worktree directory. `cmdInitExecutePhase` must output `worktree_path` and `worktree_branch` fields so the command template and executor agents can target the correct directory.

### REQ-41: PR Workflow from Worktree
**Priority:** P0
**Category:** CLI/Workflow
After plans complete in the worktree, push the branch and create a PR targeting the base branch. The execute-phase command template must include a PR creation step. The worktree path must be passed to executor agents so all file operations (read, write, edit, bash cwd) target the worktree directory rather than the main checkout.

### REQ-42: Worktree Lifecycle Management
**Priority:** P1
**Category:** CLI/Tooling
Clean up worktree and temp directory on phase completion (success or failure). Add `grd-tools worktree create/remove/list` subcommands for manual management. Handle edge cases: stale worktrees from crashed sessions, concurrent worktrees for parallel phases, disk space warnings.

## Feature 2: Parallel Phase Execution

### REQ-43: Phase Dependency Analysis
**Priority:** P1
**Category:** CLI/Planning
Analyze roadmap phases for parallelizability. Phases with no data/code dependencies can run concurrently. Add `depends_on` field to phase definitions in ROADMAP.md. `grd-tools phase analyze-deps` returns the dependency graph as JSON, identifying which phases can execute in parallel.

### REQ-44: Teammate Spawning for Parallel Phases
**Priority:** P0
**Category:** CLI/Execution
When backend is Claude Code (supports teams), `execute-phase` can accept multiple phase numbers. For independent phases (per dependency analysis), spawn teammate agents that each execute their phase in a separate worktree. Coordinate via shared task list. Report aggregate results when all parallel phases complete.

### REQ-45: Sequential Fallback for Non-Claude Code Backends
**Priority:** P2
**Category:** CLI/Execution
On non-Claude Code backends (no team support), parallel phases fall back to sequential execution. Same worktree isolation applies, just one phase at a time. Log a note that parallel execution is available on Claude Code backend.

---

## Traceability Matrix

| REQ | Feature | Priority | Phase | Status |
|-----|---------|----------|-------|--------|
| REQ-40 | Git Worktree Phase Isolation | P0 | Phase 27 | Pending |
| REQ-41 | Git Worktree Phase Isolation | P0 | Phase 28 | Pending |
| REQ-42 | Git Worktree Phase Isolation | P1 | Phase 27 | Pending |
| REQ-43 | Parallel Phase Execution | P1 | Phase 29 | Pending |
| REQ-44 | Parallel Phase Execution | P0 | Phase 30 | Pending |
| REQ-45 | Parallel Phase Execution | P2 | Phase 30 | Pending |

---

*Requirements defined: 2026-02-19*
*Traceability updated: 2026-02-19*
