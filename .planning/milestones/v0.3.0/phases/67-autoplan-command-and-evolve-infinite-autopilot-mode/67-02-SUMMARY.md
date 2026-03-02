---
phase: "67"
plan: "02"
subsystem: cli-mcp-routing
tags: [autoplan, cli-wiring, mcp-tools, skill-definition]
dependency_graph:
  requires: [67-01]
  provides: [autoplan-cli-route, autoplan-mcp-tools, autoplan-skill]
  affects: [bin/grd-tools.ts, lib/mcp-server.ts, commands/autoplan.md]
tech_stack:
  added: []
  patterns: [require-as-typed-import, mcp-tool-descriptor, skill-definition-frontmatter]
key_files:
  created:
    - commands/autoplan.md
  modified:
    - bin/grd-tools.ts
    - lib/mcp-server.ts
decisions:
  - "Autoplan MCP tools placed between multi-milestone-autopilot and evolve sections (follows command hierarchy: autopilot -> multi-milestone -> autoplan -> evolve)"
  - "grd_autoplan_run params mirror CLI flags with underscore naming convention (dry_run, pick_pct, max_turns)"
metrics:
  duration: "2min"
  completed: "2026-03-02T17:24Z"
---

# Phase 67 Plan 02: CLI Wiring and MCP Tool Registration Summary

Wired the autoplan module into all three access interfaces -- CLI routing, MCP server tool registration, and slash command skill definition -- making autoplan fully accessible from any GRD entry point.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add autoplan routing to bin/grd-tools.ts | 59bb79c | bin/grd-tools.ts |
| 2 | Register autoplan MCP tools and create skill definition | 5d54962 | lib/mcp-server.ts, commands/autoplan.md |

## Task Details

### Task 1: Add autoplan routing to bin/grd-tools.ts

Added the following routing entry points to the CLI:

1. **Import:** `require('../lib/autoplan')` with typed destructuring for `cmdAutoplan` and `cmdInitAutoplan`
2. **INIT_WORKFLOWS array:** Added `'autoplan'` after `'multi-milestone-autopilot'`
3. **Init routing:** Added `case 'autoplan'` calling `cmdInitAutoplan(cwd, raw)` after multi-milestone-autopilot case
4. **Command routing:** Added `case 'autoplan'` calling `await cmdAutoplan(cwd, args.slice(1), raw)` after multi-milestone-autopilot case
5. **TOP_LEVEL_COMMANDS:** Added `'autoplan'` for error suggestion matching

### Task 2: Register autoplan MCP tools and create skill definition

**MCP Tools (lib/mcp-server.ts):**
- `grd_autoplan_run` -- 6 parameters (dry_run, timeout, max_turns, model, pick_pct, name) mapped to CLI flags
- `grd_autoplan_init` -- Zero parameters, returns pre-flight context JSON

**Skill Definition (commands/autoplan.md):**
- Valid YAML frontmatter with description and argument-hint
- Documents all 6 CLI flags in table format
- Includes pre-flight context command, usage examples
- IMPORTANT note about background execution for long-running subprocess

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS -- zero type errors |
| `npx eslint bin/grd-tools.ts lib/mcp-server.ts` | PASS -- zero lint errors |
| `node bin/grd-tools.js init autoplan --raw` | PASS -- returns valid JSON with evolve state and config |
| `grep -c 'description:' commands/autoplan.md` | PASS -- 1 frontmatter entry |
| `grep -c 'grd_autoplan' lib/mcp-server.ts` | PASS -- 2 MCP tool registrations |

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **MCP tool placement:** Autoplan tools placed between multi-milestone-autopilot and evolve sections, following the natural command hierarchy (autopilot -> multi-milestone -> autoplan -> evolve).
2. **Parameter naming:** MCP tool params use underscore convention (`dry_run`, `pick_pct`, `max_turns`) matching existing MCP tool patterns throughout the codebase.

## Self-Check: PASSED
