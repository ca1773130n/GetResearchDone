# GRD Quickstart

> **Prefer a hands-on tutorial?** See [examples/taskmark/](../examples/taskmark/) — a guided walkthrough that uses GRD to improve a real CLI tool. Quick Path (5 min) or Deep Path (30 min).

## What is GRD?

**Get Research Done** — R&D workflow automation for Claude Code. It manages the full research lifecycle: surveying papers, planning experiments, executing with atomic commits, evaluating with tiered metrics, and iterating until targets are met.

## The Workflow

```
Idea → Survey → Deep-Dive → Feasibility → Baseline → Product Plan → Roadmap
  → [per phase: Research → Plan → Execute → Eval → Iterate?]
  → Verification → Done
```

## New R&D Project (full flow)

```
 1. /grd:new-project              # Define what you're building/researching
 2. /grd:survey "your topic"      # Scan papers, repos, benchmarks → LANDSCAPE.md
 3. /grd:deep-dive "paper title"  # Deep analysis of promising papers
 4. /grd:feasibility "method"     # Can this work in production?
 5. /grd:assess-baseline          # Measure current performance → BASELINE.md
 6. /grd:product-plan             # High-level roadmap from research findings
 7. /grd:plan-phase 1             # Break phase 1 into executable plans
 8. /grd:execute-phase 1          # Run plans with parallel agents, atomic commits
 9. /grd:eval-report 1            # Compare results against targets
10. /grd:iterate 1                # Loop if targets missed
```

## Quick Task (skip research)

```
/grd:quick "implement feature X"
```

## Autonomous Batch Run

```
/grd:yolo on
/grd:execute-phase 1
/grd:eval-report 1
```

## Key Commands by Category

| Category | Commands |
|----------|----------|
| **Research** | `survey`, `deep-dive`, `compare-methods`, `feasibility` |
| **Planning** | `new-project`, `product-plan`, `long-term-roadmap`, `discuss-phase`, `plan-phase` |
| **Execution** | `execute-phase`, `quick` |
| **Evaluation** | `eval-plan`, `eval-report`, `assess-baseline`, `iterate` |
| **Verification** | `verify-phase`, `verify-work`, `gd-tools verify mechanical` (PLAN.md mechanical bundle) |
| **Navigation** | `progress`, `help`, `settings`, `set-profile`, `yolo`, `gd-tools think` (project briefing) |
| **Self-monitoring** | `gd health` (drift score), `gd-tools dead-end add / promote-from-phase`, `gd-tools genome init / show / snapshot`, `gd-tools plan-tournament score` |
| **Forensics** | `gd diagnose <N>`, `gd impact <N>`, `gd blame <N>`, `gd budget <N>`, `gd estimate <N>`, `gd estimate-phase <N>`, `gd check-plans`, `gd check-assumptions`, `gd freshness`, `gd rollback <N>`, `gd forecast-phase <N>`, `gd deps`, `gd deps-risk` |
| **Knowledge** | `gd knowhow rank \| audit \| dedup \| aggregate`, `gd knowledge search`, `gd import-knowhow`, `gd import-knowledge`, `gd export-research`, `gd import-research` |
| **Eval + monitoring** | `gd eval diff <A> <B>` (or `<A> latest`), `gd research-gaps`, `gd tail [-f]`, `gd watch` |
| **Lifecycle** | `pause-work`, `resume-project`, `complete-milestone`, `new-milestone` |

## Key Files

```
.planning/
├── PROJECT.md          # Vision, objectives, targets
├── ROADMAP.md          # Phase structure
├── STATE.md            # Living memory (position, decisions, blockers)
├── BASELINE.md         # Current performance metrics
├── DEAD-ENDS.md        # Falsified approaches (planner refuses to re-propose)
├── GENOME.md           # Project-scoped strategy snapshot (heuristics + dated cycle snapshots)
├── config.json         # All GRD settings
├── research/
│   ├── LANDSCAPE.md    # SoTA map
│   ├── PAPERS.md       # Paper index
│   └── deep-dives/     # Individual paper analyses
└── phases/
    └── {N}-{name}/
        ├── PLAN.md, SUMMARY.md, EVAL.md, VERIFICATION.md
```

Each `VERIFICATION.md` contains a `<reflection>` block: `hypothesis`,
`predicted_outcome`, `actual_outcome`, and a `verdict` of
`confirmed` / `partial` / `falsified`. Falsified reflections are
auto-promotable to `DEAD-ENDS.md`.

## Configuration Highlights

- **Model profiles:** `/grd:set-profile quality|balanced|budget` — control cost vs quality
- **Autonomous mode:** `/grd:yolo on` — agent makes all decisions, no checkpoints
- **Code review:** Enabled by default (`per_wave`), produces REVIEW.md with BLOCKER/WARNING/INFO
- **Agent Teams:** Opt-in via `execution.use_teams: true` in config.json for parallel teammate coordination

## Tips

- Run `/grd:progress` anytime to see where you are and what to do next
- Use `/grd:discuss-phase N` before `plan-phase` to clarify gray areas
- `/grd:pause-work` saves full context; `/grd:resume-work` restores it across sessions
- `/grd:help <command>` gives detailed help for any specific command

## Resume After Break

```
/grd:resume-work
```

## Check Where You Are

```
/grd:progress
```
