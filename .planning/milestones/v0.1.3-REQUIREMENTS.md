# Requirements Archive: v0.1.3 MCP Completion & Branching Fix

**Archived:** 2026-02-16
**Status:** SHIPPED

For current requirements, see `.planning/REQUIREMENTS.md`.

---

# Requirements: v0.1.3 — MCP Completion & Branching Fix

**Created:** 2026-02-16
**Milestone:** v0.1.3

## Feature 1: MCP Server Extension

### REQ-37: MCP Tools for New Commands
**Priority:** P1
**Category:** MCP
Add MCP tool definitions in COMMAND_DESCRIPTORS for all new CLI commands from v0.1.2 (requirement get, requirement list, requirement traceability, search, requirement update-status). Update MCP server test coverage to include new tools. Update docs/mcp-server.md with new tool entries.

## Feature 2: Execute-Phase Branching Fix

### REQ-38: Checkout Main & Pull Before Phase Branching
**Priority:** P0
**Category:** CLI/Workflow
When `branching_strategy` is not `"none"` in config, the `execute-phase` workflow must checkout `main` (or the configured base branch) and pull from remote before creating the phase/milestone branch. Currently `execute-phase` runs `git checkout -b $BRANCH_NAME` from whatever branch happens to be active, which after a completed milestone may be a stale phase branch. The fix ensures phase branches always fork from the latest main. The `cmdInitExecutePhase` context output must include a `base_branch` field (defaulting to `"main"`) so the command template can use it.

### REQ-39: Graceful Base Branch Handling
**Priority:** P1
**Category:** CLI/Workflow
The checkout-main-and-pull step must handle edge cases gracefully: uncommitted changes (stash or warn), pull conflicts (warn and continue), offline/no-remote scenarios (skip pull, continue from local main), and already-on-main (skip checkout). The step must never block phase execution — if checkout or pull fails, warn the user and continue on the current branch.

---

## Traceability Matrix

| REQ | Feature | Priority | Phase | Status |
|-----|---------|----------|-------|--------|
| REQ-37 | MCP Server Extension | P1 | Phase 21 | Pending |
| REQ-38 | Execute-Phase Branching | P0 | Phase 22 | Pending |
| REQ-39 | Execute-Phase Branching | P1 | Phase 22 | Pending |

---

*Requirements defined: 2026-02-16*
