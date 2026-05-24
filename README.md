# GRD — Get Research Done

[![CI](https://github.com/ca1773130n/GetResearchDone/actions/workflows/ci.yml/badge.svg)](https://github.com/ca1773130n/GetResearchDone/actions/workflows/ci.yml)
[![Singularity](https://img.shields.io/badge/🔄_Singularity-92.2%25-e74c3c?style=flat-square)](docs/ouroboros-loop.md)
[![Ouroboros Paper](https://img.shields.io/badge/📄_Paper-Ouroboros_loop-blueviolet?style=flat-square)](docs/ouroboros-loop.md)

**GRD turns a research idea into a working, falsifiable feature — and remembers what didn't work.**

The closed-loop self-monitoring is the headline. Every plan commits to a *hypothesis + predicted outcome*; the verifier resolves it to `{confirmed, partial, falsified}` with evidence; falsified approaches auto-promote to a project-scoped `DEAD-ENDS.md` so the planner can never re-propose them. A drift score, a strategy GENOME, and an opt-in metric-driven refinement loop keep the agent grounded in the project's stated goal. See [Ouroboros loop](docs/ouroboros-loop.md) for the full technical report.

92.2% of GRD's most recent release window was written by `gd evolve` itself — measured deterministically by `gd singularity`, not LLM-judged.

## Why this exists

Autonomous coding agents (Aider, OpenHands, SWE-agent, Cursor) have converged on a plan → execute → verify loop that is *amnesic*. GRD adds four lightweight, deterministic, project-scoped primitives that turn each agent dispatch into a step in a learning loop:

| Primitive | What it does |
|---|---|
| **Falsifiable reflections** | Every plan must commit to `hypothesis` + `predicted_outcome`; verifier resolves to a verdict with evidence |
| **DEAD-ENDS registry** | Falsified hypotheses auto-promote; planner reads it and refuses to re-propose |
| **Drift score** | Weighted goal/constraint/ontology distance from project objective; computed from on-disk artifacts, not LLM judgment |
| **Strategy GENOME** | Project-scoped append-only registry of heuristics + dated snapshots; planner reads before composing each plan |

Behind those: multi-backend scheduling (Claude/Codex/Gemini/OpenCode/Overstory), worktree-isolated parallel phase execution, tiered verification (sanity/proxy/deferred), and a critique-agent refinement loop with automatic git-revert on metric regression.

## Quick Start

```bash
# Install as Claude Code plugin
claude plugin add https://github.com/ca1773130n/GRD.git

# Initialize a new R&D project
/grd:init

# Or jump straight in
/grd:survey "topic"          # Survey state of the art
/grd:plan-phase 1            # Plan the first phase
/grd:execute-phase 1         # Execute it
/grd:autopilot               # Let it run autonomously
```

### Hands-On Tutorial

New to GRD? The [TaskMark tutorial](examples/taskmark/) walks you through the full workflow by improving a real (deliberately imperfect) CLI tool. Two tracks: **Quick Path** (5 minutes) or **Deep Path** (30 minutes).

### Prerequisites

- Node.js 18+
- Claude Code CLI (or any supported backend)

### Optional Integrations

- GitHub CLI (`gh`) — for issue tracking
- MCP Atlassian — for Jira integration
- Overstory — for multi-agent orchestration

## Core Workflow

```
Idea → Survey → Feasibility → Product Plan → Roadmap
  → [per phase: Research → Plan → Execute → Review → Eval → Iterate?]
  → Integration → Product Verification → Done
```

## Commands (45+)

### Research
| Command | Description |
|---------|-------------|
| `/grd:survey <topic>` | SoTA landscape scan |
| `/grd:deep-dive <paper>` | Paper deep analysis |
| `/grd:compare-methods` | Method comparison matrix |
| `/grd:feasibility <approach>` | Paper-to-production gap analysis |

### Planning & Execution
| Command | Description |
|---------|-------------|
| `/grd:init` | Initialize R&D project |
| `/grd:plan-phase <N>` | Phase planning with research context |
| `/grd:execute-phase <N>` | Phase execution with wave parallelization |
| `/grd:autopilot` | Multi-phase autonomous execution |
| `/grd:quick <desc>` | Quick task with GRD guarantees |

### Evaluation
| Command | Description |
|---------|-------------|
| `/grd:assess-baseline` | Current performance baseline |
| `/grd:eval-report <N>` | Collect and analyze results |
| `/grd:iterate <N>` | Iteration loop on failed metrics |

### Navigation
| Command | Description |
|---------|-------------|
| `/grd:progress` | Project progress and smart routing |
| `gd-tools think` | One-shot project-state briefing (active phase, recent verdicts, drift, dead-ends, open todos) |
| `/grd:settings` | Configure workflow and preferences |
| `/grd:help` | Full command reference |

### Self-monitoring & self-improvement (Ouroboros integration)
| Command | Description |
|---------|-------------|
| `gd health` | Weighted drift score (goal / constraint / ontology) + blockers, with config-drift fix suggestions |
| `gd-tools dead-end add` | Record a falsified approach in `.planning/DEAD-ENDS.md` |
| `gd-tools dead-end promote-from-phase` | Auto-promote `verdict: falsified` reflections from a phase |
| `gd-tools genome init / show / snapshot` | Manage `.planning/GENOME.md` (project-scoped strategy snapshots) |
| `gd-tools plan-tournament score` | Score candidate PLAN.md files against the phase goal |
| `gd-tools verify mechanical` | Bundle the four PLAN.md mechanical checks (frontmatter, artifacts, exports, content) |

### Phase forensics & planning (added by autonomous evolve loop)
| Command | Description |
|---------|-------------|
| `gd diagnose <N>` | Phase failure post-mortem from VERIFICATION.md |
| `gd budget <N>` / `gd estimate <N>` / `gd estimate-phase <N>` | Token + cost forecast (markdown + `<task>` XML) |
| `gd blame <N>` | Map phase-range commits to plan tasks |
| `gd impact <N>` | BFS the phase dep graph from `Depends on` declarations |
| `gd deps` / `gd deps-risk` | Phase dependency graph visualizer and risk report |
| `gd check-plans [--phase N]` | Validate plan file references against disk |
| `gd check-assumptions <N>` | Validate `## Assumptions` blocks vs git diff |
| `gd freshness [<N>]` | Citation freshness scanner (RESEARCH.md / LANDSCAPE.md) |
| `gd rollback <N>` | Generate runnable `git revert` plan from `phase_branch_template` |
| `gd forecast-phase <N>` | Pre-execution file-touch forecast |

### Knowledge maintenance
| Command | Description |
|---------|-------------|
| `gd knowhow rank "<query>"` | TF-IDF relevance ranking across all KNOWHOW.md locations |
| `gd knowhow audit` / `gd knowhow dedup` / `gd knowhow aggregate` | Stale-entry audit, similarity-based dedup, cross-milestone aggregator |
| `gd knowledge search "<query>"` | Keyword search across milestone + per-phase KNOWHOW.md |
| `gd import-knowhow <src>` / `gd import-knowledge` | Import knowledge entries (`--dry-run` is side-effect free) |
| `gd export-research` / `gd import-research` | Bundle pack/unpack with archive pre-validation |

### Eval + live monitoring
| Command | Description |
|---------|-------------|
| `gd eval diff <A> <B>` / `gd eval diff <A> latest` | Side-by-side metric deltas (direction-aware for latency/error metrics) |
| `gd research-gaps` | Citation gap report across milestone + prefixed plans |
| `gd tail [-f]` | Tail / follow `.planning/autopilot/autopilot.log` |
| `gd watch` | Live execution monitor (autopilot.log-backed) |

## Architecture

GRD uses a thin orchestrator pattern: markdown skill files handle orchestration intelligence, while `bin/grd-tools.ts` handles all deterministic operations (state management, verification, scaffolding, tracker sync). The `gd` CLI provides a unified entry point for both tool and agent commands across backends.

```
bin/
├── grd-tools.ts        # Deterministic CLI (state, verify, scaffold, tracker)
├── gd.ts               # Unified CLI (agent + tool routing)
├── grd-mcp-server.ts   # MCP server exposing all tools
└── *.js                # Entry points (register tsx for .ts resolution)
lib/
├── scheduler.ts        # Cross-backend rate limit scheduler
├── autopilot.ts        # Multi-phase orchestration
├── evolve/             # Self-evolution loop
├── commands/           # CLI command handlers
├── context/            # Context optimization for agents
└── ...                 # 25+ TypeScript modules
```

All source is TypeScript with `strict: true`. Entry points use [tsx](https://github.com/privatenumber/tsx) for direct `.ts` resolution — no compilation needed for development.

## Configuration

`.planning/config.json` controls all behavior:

```json
{
  "autonomous_mode": false,
  "ceremony": { "default_level": "auto" },
  "code_review": { "enabled": true },
  "scheduler": {
    "backend_priority": ["claude", "gemini"],
    "free_fallback": { "backend": "opencode" }
  }
}
```

See `/grd:settings` for interactive configuration or `/grd:help` for full reference.

## MCP Server

GRD includes an MCP server exposing all CLI commands as structured tools:

```json
{
  "mcpServers": {
    "grd": { "command": "grd-mcp-server" }
  }
}
```

## Credits

Built on [GSD (Get Shit Done)](https://github.com/gsd-build/gsd-2) by Cole Medin (v1 heritage) and the gsd-build team (v2 patterns). Extended for R&D workflows by Cameleon X.

## Security

GRD scans its bundled markdown (`commands/`, `agents/`, `templates/`, `docs/`) for prompt injection patterns — system prompt markers, role overrides, hidden HTML directives, tool-call injection, and base64-obfuscated variants of the same. The scanner is available as a CLI:

```bash
gd scan              # scan staged .md files (use as pre-commit)
gd scan --all        # full repo sweep
gd scan --diff main  # scan .md files changed vs main (CI mode)
```

A CI job (`docs-check` in `.github/workflows/ci.yml`) blocks PRs that introduce unignored patterns. To install an opt-in pre-commit hook locally:

```bash
npm run hooks:install
```

Pattern set adopted from [gsd-2](https://github.com/gsd-build/gsd-2) v2.67 `scripts/docs-prompt-injection-scan.sh` and `scripts/base64-scan.sh`.
