# Command surface trim plan (DRAFT for v0.4.x)

The reality-check audit (vs Aider / OpenHands / SWE-agent / Sakana /
STORM / GPT-Researcher) found that GRD's 60+ public CLI commands are
working against discoverability and onboarding. Peer agents expose 5–8
hero verbs. This document proposes the trim list for v0.4.x.

**Principle:** keep what supports the hero output. Move the rest behind
`gd-tools` (internal tool router) or deprecate entirely.

## Hero verbs (KEEP, promote to top-level surface)

These 9 verbs span the whole closed loop end-to-end. Everything else
exists in service of these:

| Verb | What it does |
|---|---|
| `gd init` | Bootstrap `.planning/` from a starter template |
| `gd plan-phase <N>` | Compose PLAN.md (planner reads Ouroboros context) |
| `gd execute-phase <N>` | Execute plans (wave-parallel + worktree-isolated) |
| `gd verify-phase <N>` | Reflection-loop verifier with Evidence Standard |
| `gd autopilot` | Run N phases end-to-end (the closed loop) |
| `gd evolve` | Autonomous self-improvement against this codebase |
| `gd health` | Drift score + blockers + Ouroboros status |
| `gd think` | One-shot project briefing aggregating everything |
| `gd singularity` | What % of recent LOC came from `gd evolve` |

## DEMOTE (move to `gd-tools` namespace; keep available)

Auxiliary commands useful for power users. Stay in the binary but stop
appearing in `gd --help` top-level listing. Surface only via
`gd-tools <cmd>`.

- `dead-end add` / `dead-end promote-from-phase`
- `genome init` / `genome show` / `genome snapshot`
- `plan-tournament score`
- `knowhow rank` / `knowhow audit` / `knowhow dedup` / `knowhow aggregate`
- `knowledge search`
- `eval diff`
- `import-knowhow` / `import-knowledge` / `export-research` / `import-research`
- `forecast-phase` / `freshness` / `rollback` / `estimate-phase` /
  `budget` / `blame` / `impact` / `check-plans` / `check-assumptions` /
  `deps` / `deps-risk` / `diagnose`
- `tail` / `watch` / `research-gaps`
- `metrics` / `scan` / `verify mechanical`

That's roughly **30 commands demoted** to `gd-tools` (still accessible
to those who know to look, hidden from new-user help).

## DEPRECATE (remove in v0.4.0, warn in v0.3.x)

Commands that have no clear successor in the hero-verb world AND
near-zero usage in test fixtures or example projects:

- `dashboard` (info also in `gd health` + `gd think`)
- `health-check` (subset of `gd health`)
- `coverage-report` (use `npx jest --coverage` directly)
- `phase-time-budget` (subsumed by `gd estimate-phase`)
- `todo-duplicates` (one-off helper; rarely used)
- `markdown-split` (internal infrastructure exposed by accident)
- `setup` (legacy bootstrap; `gd init` does this)

## DOC ONLY (keep, but document better — no action item, listed for
visibility)

These are correctly part of the surface but their docs are stale:

- `gd-tools state load` / `state get` / `state patch` / etc. — used
  heavily by skills; document the contract
- `gd-tools verify-summary` / `verify-references` / `verify-artifacts`
  — building blocks for skills

## Process

1. **v0.3.28** (next release): add deprecation warnings on stderr for
   the DEPRECATE bucket; demoted commands keep working but stop
   appearing in `gd --help`
2. **v0.4.0** (when the 9 hero verbs feel polished): delete the
   DEPRECATE list; rename `gd-tools` → `gd internal` for clarity
3. **v0.4.1**: hide `gd internal` from `gd --help`; only surfaces via
   `gd internal --help`

## Why this isn't done yet

Cutting 30+ commands needs:

1. Confirmation each command is unreferenced in any shipped agent /
   skill file (grep across `agents/` and `commands/`)
2. Migration notes for any internal tool that did rely on the demoted
   command
3. A `gd internal` namespace that doesn't collide with existing route
   classifications in `lib/cli/index.ts`

All three are mechanical; the work is a focused day, not a research
project. Open issue: assigned to v0.4.x scope.
