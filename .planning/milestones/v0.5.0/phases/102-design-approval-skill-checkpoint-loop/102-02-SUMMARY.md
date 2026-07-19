---
phase: 102-design-approval-skill-checkpoint-loop
plan: 02
subsystem: research
tags: [cli, checkpoint, ask-user-question, human-in-the-loop, markdown-skill]

# Dependency graph
requires:
  - phase: 101
    provides: Checkpoint schema/types, resume --answers <file|-> plumbing, ResearchThread.pendingCheckpoint
provides:
  - "commands/research.md 'Interactive steering' protocol (parse pendingCheckpoint from CLI JSON -> AskUserQuestion -> Write answers file -> resume --answers)"
  - "renderCheckpointQuestions(t) human-render helper in lib/research/thread.ts"
  - "cmdResearchStatus human-path pending-checkpoint rendering (--json contract unchanged)"
affects: [103-seed-interview-decide-branch, 104-hypothesize-candidate-selection, 105-ai-panel-fallback-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin skill protocol: parse-from-JSON only, never re-read thread files (R10)"
    - "Answers written via Write tool to a file, never through shell/argv (R8)"
    - "output() raw=true is the machine/--json path for research subcommands (kept exact); raw=false (default) gains a human-render branch only when a specific field (pendingCheckpoint) is present, falling back to prior JSON behavior otherwise"

key-files:
  created: []
  modified:
    - commands/research.md
    - lib/research/thread.ts
    - lib/research/cli.ts
    - tests/unit/research/cli.test.ts

key-decisions:
  - "cmdResearchStatus's --json path (raw=true) is left byte-for-byte unchanged; only the raw=false (default) single-id path with a pendingCheckpoint diverges from output()'s JSON.stringify fallback into a direct process.stdout.write + process.exit(0) human render, per the plan's explicit fallback instruction"
  - "renderCheckpointQuestions sorts options recommended-first for readability, matching the AskUserQuestion ordering convention in the skill protocol"

patterns-established:
  - "De-dupe by checkpoint question ask TEXT (not id) across rounds — ids are per-round labels, mirrored from plan-phase.md section 9"

# Metrics
duration: ~35min
completed: 2026-07-19
---

# Phase 102 Plan 02: Skill Checkpoint Answering Surface Summary

**Added a thin AskUserQuestion-driven "Interactive steering" protocol to the research skill plus a human-readable `gd research status` rendering, giving both skill-driven and skill-less users a way to answer a paused DESIGN checkpoint without touching thread files directly.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- `commands/research.md` gained a full parse-JSON -> AskUserQuestion (max 4, recommended-first, 2 rounds, de-dupe-by-TEXT) -> Write-tool answers file -> `resume --answers` protocol, mirroring `plan-phase.md` section 9 verbatim in spirit
- `renderCheckpointQuestions` added to `lib/research/thread.ts` and wired into `cmdResearchStatus`'s human path, giving skill-less users (R10 escape hatch) a readable question/option/resume-hint block
- Confirmed and preserved the `--json` machine contract (`raw=true`) for `cmdResearchStatus` — the skill's own JSON parser is unaffected

## Task Commits

1. **Task 1: Add the "Interactive steering" section to commands/research.md** - `5eaabf1` (feat)
2. **Task 2: Render pending-checkpoint questions in gd research status** - `13665cc` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `commands/research.md` - Interactive steering protocol section + Flags pointer to `--answers`/`status <id>`
- `lib/research/thread.ts` - `renderCheckpointQuestions(t)` export, recommended-first option render, freeform hint, resume-hint line
- `lib/research/cli.ts` - `cmdResearchStatus` human-path branch (renderThreadLog + renderCheckpointQuestions via process.stdout.write/exit) when `!raw && t.pendingCheckpoint`; `--json` path untouched
- `tests/unit/research/cli.test.ts` - 3 new tests: `--json` contract intact, human path shows questions/recommended-marker/freeform-hint/resume-hint, no-checkpoint thread prints nothing extra

## Decisions Made
- Verified via smoke test that `raw=true` (grd-tools.js `--raw`, mapped from `gd`'s `--json`) is the machine path for research subcommands; `raw=false` is the default and previously always fell through to `output()`'s pretty-JSON branch. Rather than change that fallback globally, the human render is added as a narrow early-return only when a pending checkpoint exists, so all other existing status behavior (list view, no-checkpoint single-thread view) is byte-identical to before.

## Deviations from Plan
None - plan executed exactly as written. The plan anticipated needing a smoke-check to resolve output() raw-state ambiguity (Checker note in phase_context); resolved by reading `bin/grd-tools.ts`'s `raw = args.indexOf('--raw') !== -1` and the existing `cmdResearchStart`/`cmdResearchReport` comment ("gd CLI maps user --json to grd-tools --raw"), confirming `raw=true` is the JSON path to preserve untouched.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 102-01 (orchestrator DESIGN approval checkpoint emission) runs in parallel in the same working directory; this plan's files (`commands/research.md`, `lib/research/cli.ts`, `lib/research/thread.ts`, `tests/unit/research/cli.test.ts`) do not overlap with 102-01's (`lib/research/orchestrator.ts`, `tests/unit/research/orchestrator.test.ts`) — `orchestrator.ts` was left untouched/unstaged throughout.
- Full `tests/unit/research/` suite (42 files, 574 tests) passes, including `orchestrator.test.ts`, confirming no cross-plan interference at commit time.
- Level 3 verification (live skill AskUserQuestion -> Write file -> resume round-trip against an actual DESIGN checkpoint emission) is deferred to phase 102 verification, once 102-01's emission lands.

---
*Phase: 102-design-approval-skill-checkpoint-loop*
*Completed: 2026-07-19*
