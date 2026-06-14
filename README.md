# GRD — Get Research Done

[![Singularity](https://img.shields.io/badge/🔄_Singularity-92.2%25-e74c3c?style=flat-square)](docs/ouroboros-loop.md)
[![Ouroboros Paper](https://img.shields.io/badge/📄_Paper-Ouroboros_loop-blueviolet?style=flat-square)](docs/ouroboros-loop.md)

**GRD runs a real research loop for you: it turns a question into a falsifiable hypothesis, designs and runs an experiment, measures the result, learns from it, and iterates to a verdict — remembering what didn't work.**

It is two things in one tool:

1. **An autoresearch loop** — `gd research "<question>"` drives a hypothesis-centric scientific cycle (hypothesize → experiment → measure → learn → revise) to a supported/exhausted verdict, grounded on a knowledge graph you build from papers, PDFs, web pages, and past sessions. **→ [Step-by-step tutorial](docs/autoresearch-tutorial.md)**
2. **An R&D engineering workflow** — survey → plan → execute → verify → iterate, with closed-loop self-monitoring (falsifiable reflections, a `DEAD-ENDS` registry, a drift score, and a strategy GENOME) so the agent stays grounded in the project's goal.

92.2% of one GRD release window was written by GRD itself — measured deterministically by `gd singularity`, not LLM-judged. See the [Ouroboros loop](docs/ouroboros-loop.md) technical report. That era's `gd evolve` (static code scanning) is now retired; self-improvement runs on the **life-harness** — `gd harness round` patches GRD's own primitives from evidence mined out of real sessions, eval-gated and git-reversible. As of v0.4.5 the harness grounds on Tesserae 0.9.0 AgentRunbook memory (distilled `Runbook` procedures + `Gotcha` failure-modes) as evidence, and its eval gate no longer crashes on lint/tsc/jest timeouts or missing tools.

---

## The autoresearch loop

```
            ┌─────────────────────── re-survey on plateau ──────────────────────┐
            ▼                                                                    │
SEED → GROUND → HYPOTHESIZE → DESIGN → RUN → MEASURE → LEARN → DECIDE → PERSIST → FINALIZE
                    │           │       │       │         │       │         │
              one testable   plan +  sandboxed  metric  typed   supported  FINDING.md
              hypothesis     script  experiment vs       takeaway →finalize +PAPER.md
              (KG-grounded)          (Docker/   target           else      +KNOWHOW/
                                      subprocess) →verdict        revise   DEAD-ENDS
```

- **Grounded, not hallucinated.** The hypothesizer grounds on a [Tesserae](docs/autoresearch-tutorial.md) knowledge graph you compile from real sources, plus a deterministic hybrid retriever (lexical + graph + optional semantic).
- **Falsifiable by contract.** Every iteration commits to a metric/comparator/target. The verdict is **deterministic** — no LLM-judged scoring on the control path.
- **Honest.** A loop that never reaches support is written up as a negative/inconclusive result, not hidden.
- **Safe by default.** Two checkpoint gates (before running experiment code, before writing to the shared KG); optional Docker isolation for experiment scripts.
- **Compounding.** Confirmed learnings promote to a shared `KNOWHOW.md`; falsified hypotheses promote to `DEAD-ENDS.md` so future threads don't repeat them.

```bash
gd research "Does retrieval-augmented prompting beat few-shot on our eval?"
```

That single command runs the loop to a verdict and leaves a complete, inspectable audit trail under `.planning/research/threads/<id>/`. **The [autoresearch tutorial](docs/autoresearch-tutorial.md) walks the whole thing end to end.**

### Research commands

| Command | Description |
|---------|-------------|
| `gd research "<question>"` | Start a new research thread; runs the loop to a verdict |
| `gd research resume <id>` | Resume a thread paused at a checkpoint gate |
| `gd research status [<id>]` | List threads, or show one thread's state |
| `gd research report <id>` | Generate a publication-style `PAPER.md` for a finished thread |
| `gd research portfolio [ids…]` | Advance multiple threads with bounded concurrency → ranked `PORTFOLIO.md` |
| `gd ingest <md\|arxiv\|url\|pdf\|session>` | Add a source to the knowledge graph (local md, arXiv id/URL, web URL, PDF, or `.jsonl` transcript) |
| `gd synthesize "<topic>"` | Layered synthesis over the KG; auto-emits ranked candidate hypotheses and can seed threads |
| `gd retrieve "<query>"` | Hybrid retrieval over the compiled graph (lexical + graph-structure + optional semantic) |

Flags: `--max-iterations N` (default 5), `--no-gates` (run unattended), `--json`.

---

## Quick Start

### Install

GRD is a Claude Code plugin and a standalone CLI.

```bash
# As a Claude Code plugin
claude plugin add https://github.com/ca1773130n/GetResearchDone.git

# Or as a global CLI (provides `gd`, `grd-tools`, `grd-mcp-server`)
npm install -g @jokerized/getresearchdone

# Register the MCP server into a harness's config (optional)
gd install claude
```

**Prerequisites:** Node.js 18+ and a supported backend CLI (Claude Code, Codex, Gemini, or OpenCode).

### Your first research thread

> **Prerequisite:** `gd research` spawns backend agents, so it needs a backend
> CLI authenticated **and** a `scheduler` block in `.planning/config.json`.
> `/grd:init` sets this up for you; see the
> [tutorial's Prerequisites](docs/autoresearch-tutorial.md#prerequisites) for a
> minimal hand-config.

```bash
gd research "Does X improve Y on our benchmark?"
# → pauses at the execute gate before running experiment code
gd research status                 # see the thread + where it paused
gd research resume <id>            # approve and continue
gd research report <id>            # once finished: write PAPER.md
```

Full walkthrough — grounding on papers, going unattended, deepening the loop, and reading the outputs — in the **[autoresearch tutorial](docs/autoresearch-tutorial.md)**.

### Hands-on engineering tutorial

New to GRD's R&D engineering side? The [TaskMark tutorial](examples/taskmark/) improves a real (deliberately imperfect) CLI tool — Quick Path (5 min) or Deep Path (30 min).

---

## The R&D engineering workflow

Beyond single research threads, GRD manages a full R&D project lifecycle with the same falsifiable discipline:

```
Idea → Survey → Feasibility → Product Plan → Roadmap
  → [per phase: Research → Plan → Execute → Review → Eval → Iterate?]
  → Integration → Product Verification → Done
```

| Phase | Command |
|---|---|
| Initialize a project | `/grd:init` |
| Survey the state of the art | `/grd:survey "<topic>"` |
| Plan a phase (research-backed) | `/grd:plan-phase <N>` |
| Execute a phase (wave-parallel, atomic commits) | `/grd:execute-phase <N>` |
| Run autonomously | `/grd:autopilot` |
| Ad-hoc task with GRD guarantees | `/grd:quick "<desc>"` |
| Self-improvement round (life-harness) | `gd harness round` |

### Closed-loop self-monitoring

Each agent dispatch is a step in a learning loop, via four deterministic, project-scoped primitives:

| Primitive | What it does |
|---|---|
| **Falsifiable reflections** | Every plan commits to `hypothesis` + `predicted_outcome`; the verifier resolves it to a verdict with evidence |
| **DEAD-ENDS registry** | Falsified hypotheses auto-promote; the planner reads it and refuses to re-propose them |
| **Drift score** | Weighted goal/constraint/ontology distance from the objective — from on-disk artifacts, not LLM judgment |
| **Strategy GENOME** | Project-scoped append-only registry of heuristics + dated snapshots, read before composing each plan |

Behind those: multi-backend scheduling (Claude / Codex / Gemini / OpenCode / Overstory), worktree-isolated parallel phase execution, tiered verification (sanity / proxy / deferred), and a critique-agent refinement loop with automatic git-revert on metric regression.

---

## Configuration

`.planning/config.json` controls all behavior. Autoresearch-specific keys:

| Key | Default | Effect |
|---|---|---|
| `research_gates` | `{execute:true, kg_write:true, plan_clarification:true}` | Per-gate checkpoints (override with `--no-gates`); `plan_clarification` (v0.4.5+) has `plan-phase` ask the user to resolve ambiguous design decisions before writing a plan |
| `research_max_candidates` | `3` | Cap on synthesis-seeded candidate threads |
| `research_plateau_window` | `3` | Consecutive non-supported verdicts that trigger a re-survey |
| `research_max_resurveys` | `2` | Cap on plateau re-surveys per thread |
| `research_resurvey_fetch` | `false` | On re-survey, fetch + ingest new sources first |
| `research_portfolio_concurrency` | `2` | Bounded concurrency for `gd research portfolio` |
| `research_sandbox` | `"subprocess"` | `"docker"` to isolate experiment scripts |
| `research_sandbox_image` / `_memory` / `_cpus` / `_network` | slim / `512m` / `1` / `none` | Docker sandbox knobs |
| `research_persist_knowledge` | `true` | Promote takeaways → `KNOWHOW.md` / `DEAD-ENDS.md` |
| `research_eval_report` | `false` | Opt-in per-iteration `EVAL.md` from a read-only evaluator |

Semantic retrieval is opt-in and only embeds when `GRD_EMBED_API_KEY` (or `OPENAI_API_KEY`) is set — otherwise zero network egress. See the [tutorial](docs/autoresearch-tutorial.md#configuration-reference) for the complete reference, and `/grd:settings` for interactive configuration.

---

## Architecture

GRD uses a thin orchestrator pattern: markdown skill files handle orchestration intelligence, while `bin/grd-tools.ts` handles all deterministic operations. The `gd` CLI is the unified entry point for both tool and agent commands across backends.

```
bin/
├── grd-tools.ts        # Deterministic CLI (state, verify, scaffold, research)
├── gd.ts               # Unified CLI (agent + tool routing)
├── harness_driver.py   # Life-harness round driver (logic: autoresearch-core, PyPI)
└── grd-mcp-server.ts   # MCP server exposing all tools
lib/
├── research/           # Autoresearch loop (orchestrator, ingest, synthesize,
│                       #   retrieve, runner, docker-runner, promote, eval, paper, portfolio)
├── scheduler.ts        # Cross-backend rate-limit scheduler
├── autopilot.ts        # Multi-phase orchestration
├── evolve/             # Legacy self-evolution loop (deprecated — see gd harness)
└── ...                 # 25+ TypeScript modules
```

All source is TypeScript with `strict: true`. Entry points use [tsx](https://github.com/privatenumber/tsx) for direct `.ts` resolution — no build step for development.

## MCP Server

GRD exposes all CLI commands as structured MCP tools:

```json
{ "mcpServers": { "grd": { "command": "grd-mcp-server" } } }
```

Run `gd install <harness>` to register it automatically. See [docs/mcp-server.md](docs/mcp-server.md).

## Security

GRD scans its bundled markdown for prompt-injection patterns (system-prompt markers, role overrides, hidden HTML directives, tool-call injection, and base64-obfuscated variants):

```bash
gd scan              # scan staged .md files (use as a pre-commit hook)
gd scan --all        # full repo sweep
gd scan --diff main  # scan .md changed vs main
```

Install the opt-in pre-commit hook with `npm run hooks:install`. Remote ingestion (`gd ingest <url>`) runs through a best-effort SSRF guard that blocks non-http(s) schemes, credentials-in-URL, and loopback/private/link-local/metadata hosts on the initial URL and every redirect hop.

## Credits

Built on [GSD (Get Shit Done)](https://github.com/gsd-build/gsd-2) by Cole Medin (v1 heritage) and the gsd-build team (v2 patterns). Extended for R&D and autoresearch workflows by Cameleon X.
