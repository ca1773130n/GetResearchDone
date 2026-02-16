# GRD — Get Research Done

[![CI](https://github.com/ca1773130n/GRD/actions/workflows/ci.yml/badge.svg)](https://github.com/ca1773130n/GRD/actions/workflows/ci.yml)

R&D workflow automation plugin for [Claude Code](https://claude.com/claude-code). Forked from [GSD (Get Shit Done)](https://github.com/coleam00/get-shit-done) and extended for research-grade development.

## What is GRD?

GRD brings research rigor to AI-assisted software development. While GSD excels at shipping features fast, GRD is designed for projects where:

- **External papers and research** drive implementation decisions
- **Quantitative evaluation** (PSNR, SSIM, LPIPS, FID) matters more than "it works"
- **Iterative experimentation** is the norm — try, measure, pivot
- **Paper-to-production gaps** need explicit management
- **Autonomous operation** lets the agent iterate without constant supervision

## Core Concepts

### Research Knowledge Base (`.planning/research/`)

Persistent research knowledge that accumulates across phases:

| File | Purpose |
|------|---------|
| `LANDSCAPE.md` | SoTA map — methods, benchmarks, trends |
| `PAPERS.md` | Paper index with summaries |
| `BENCHMARKS.md` | Evaluation metrics and datasets |
| `KNOWHOW.md` | Paper→production gap knowledge |
| `deep-dives/*.md` | Individual paper deep analyses |

### Tiered Verification

Not every phase can be fully evaluated independently:

| Level | Name | Example |
|-------|------|---------|
| Sanity | Always doable | Format checks, crash tests |
| Proxy | Indirect measure | Small-subset eval, ablation reproduction |
| Deferred | Needs integration | Full pipeline PSNR/SSIM |

Deferred validations are tracked and automatically collected at integration phases.

### Hierarchical Roadmap (Now/Next/Later)

GRD supports multi-level planning with a hierarchical roadmap:

```
LONG-TERM-ROADMAP.md
  ├── Now   → Active milestone (full ROADMAP.md with phases)
  ├── Next  → Upcoming milestones (goals + rough phase sketch)
  └── Later → Future milestones (goals + open research questions)
```

Milestones flow through tiers as they mature: **Later** (rough idea) -> **Next** (refined plan) -> **Now** (active execution). Each promotion adds detail. See [Hierarchical Roadmap Tutorial](docs/hierarchical-roadmap-tutorial.md) for a walkthrough.

### Multi-Backend Support

GRD detects and adapts to multiple AI coding CLIs:

| Backend | Detection | Model Resolution |
|---------|-----------|-----------------|
| Claude Code | `CLAUDE_CODE_*` env vars | Native tier names |
| Codex CLI | `CODEX_HOME` env var | GPT-5.3 model names |
| Gemini CLI | `GEMINI_CLI_HOME` env var | Gemini model names |
| OpenCode | `OPENCODE` env var | Dynamic detection via `opencode models` |

Resolution priority: config overrides > dynamically detected models > hardcoded defaults. OpenCode is the only backend that supports runtime model discovery; others use static mappings.

### Autonomous Mode (YOLO)

Toggle headless operation where the agent:
- Makes all decisions using available context
- Skips human confirmation gates
- Logs all decisions for later review
- Enables continuous iteration loops

### Code Review

Automatic two-stage code review after execution:
- **Stage 1 — Spec compliance:** Plan alignment, research methodology match, pitfall avoidance, eval coverage
- **Stage 2 — Code quality:** Architecture consistency, reproducibility, documentation, deviation documentation
- Output: REVIEW.md with BLOCKER/WARNING/INFO severity levels

### Quality Analysis

Optional phase-boundary quality analysis (disabled by default):
- ESLint complexity violation detection
- Dead export scanning
- File size threshold checks
- Integrated into phase completion flow

### Agent Teams (Experimental)

Opt-in parallel execution using Claude Code Agent Teams:
- Named executor teammates per plan
- Team lead mediates checkpoints
- Configurable concurrency and timeouts

## R&D Workflow

```
Idea → Survey → Feasibility → Product Plan → Roadmap
  → [per phase: Research → Plan → Execute → Review → Eval → Iterate?]
  → Integration → Product Verification → Done
```

## Commands

### Research
| Command | Description |
|---------|-------------|
| `/grd:survey <topic>` | SoTA landscape scan |
| `/grd:deep-dive <paper>` | Paper deep analysis |
| `/grd:compare-methods` | Method comparison matrix |
| `/grd:feasibility <approach>` | Paper→production gap analysis |

### Planning & Execution
| Command | Description |
|---------|-------------|
| `/grd:new-project` | Initialize R&D project |
| `/grd:product-plan` | Product-level planning |
| `/grd:discuss-phase <N>` | Brainstorming with approach proposals |
| `/grd:plan-phase <N>` | Phase planning with research context |
| `/grd:execute-phase <N>` | Phase execution with wave parallelization |
| `/grd:quick <desc>` | Quick task with GRD guarantees |

### Hierarchical Roadmap
| Command | Description |
|---------|-------------|
| `/grd:long-term-roadmap` | Create or display long-term roadmap |
| `/grd:refine-milestone <V>` | Progressively refine a milestone |
| `/grd:promote-milestone <V>` | Move milestone up a tier (Later->Next->Now) |

### Evaluation
| Command | Description |
|---------|-------------|
| `/grd:assess-baseline` | Current performance baseline |
| `/grd:eval-plan <N>` | Design tiered evaluation |
| `/grd:eval-report <N>` | Collect and analyze results |
| `/grd:iterate <N>` | Iteration loop on failed metrics |

### Integration
| Command | Description |
|---------|-------------|
| `/grd:sync [roadmap\|phase N\|reschedule]` | Sync GRD state to issue tracker |
| `/grd:tracker-setup` | Configure GitHub Issues or MCP Atlassian |

### Verification & Navigation
| Command | Description |
|---------|-------------|
| `/grd:verify-phase <N>` | Tiered phase verification |
| `/grd:progress` | Project progress + metrics |
| `/grd:yolo` | Toggle autonomous mode |
| `/grd:help` | Full command reference |

## Installation

```bash
claude plugin add /path/to/GRD
```

Or from a remote repository:

```bash
claude plugin add https://github.com/ca1773130n/GRD.git
```

### Prerequisites

- Node.js 18+
- Claude Code CLI
- GitHub CLI (`gh`) — for GitHub Issues integration (optional)
- `gh-sub-issue` extension — for parent/child issues (optional)
- `mcp-atlassian` MCP server — for Jira integration (optional)

### Issue Tracker Setup

**GitHub Issues:**
```bash
gh auth login
gh extension install github/gh-sub-issue  # optional, for parent/child linking
# Configure via /grd:tracker-setup or set in .planning/config.json:
# "tracker": { "provider": "github" }
```

**MCP Atlassian (Jira):**
```bash
# 1. Add mcp-atlassian to your Claude Code MCP server configuration
# 2. Configure it with your Atlassian credentials (see mcp-atlassian docs)
# 3. Configure via /grd:tracker-setup or set in .planning/config.json:
# "tracker": { "provider": "mcp-atlassian", "mcp_atlassian": { "project_key": "PROJ" } }
```

## Configuration

`.planning/config.json` controls all behavior:

```json
{
  "research_gates": {
    "verification_design": true,
    "after_eval": true,
    "feasibility": true
  },
  "autonomous_mode": false,
  "tracker": {
    "provider": "none",
    "auto_sync": true,
    "github": { "default_labels": ["research", "implementation", "evaluation", "integration"] },
    "mcp_atlassian": { "project_key": "", "milestone_issue_type": "Epic", "phase_issue_type": "Task", "plan_issue_type": "Sub-task", "start_date_field": "customfield_10015", "default_duration_days": 7 }
  },
  "eval_config": {
    "default_metrics": ["PSNR", "SSIM", "LPIPS"],
    "baseline_tracking": true
  },
  "code_review": {
    "enabled": true,
    "timing": "per_wave",
    "severity_gate": "blocker"
  },
  "execution": {
    "use_teams": false,
    "team_timeout_minutes": 30,
    "max_concurrent_teammates": 4
  },
  "phase_cleanup": {
    "enabled": false,
    "refactoring": false,
    "doc_sync": false
  },
  "backend": "auto",
  "backend_models": {
    "opencode": { "opus": "anthropic/claude-opus-4-5" }
  }
}
```

### Research Gates

Control where human review is required:

| Gate | Default | Purpose |
|------|---------|---------|
| `verification_design` | `true` | Review EVAL.md before execution |
| `after_eval` | `true` | Review eval results interpretation |
| `feasibility` | `true` | Review paper→production gap analysis |

In YOLO mode, all gates are bypassed.

## Tooling Architecture

GRD uses a thin orchestrator pattern. Commands (`.md` prompt files) delegate deterministic operations to `bin/grd-tools.js`, keeping command files focused on orchestration intelligence while mechanical work happens in reliable Node.js code.

### `grd-tools.js` Capabilities

| Category | Commands | Purpose |
|----------|----------|---------|
| State | `state load/get/patch/advance-plan/record-metric/add-decision` | Atomic STATE.md operations |
| Verify | `verify plan-structure/phase-completeness/references/commits/artifacts/key-links` | Deterministic structural checks |
| Phase | `phase add/insert/remove/complete` | Phase lifecycle management |
| Roadmap | `roadmap get-phase/analyze` | Roadmap queries and analysis |
| Scaffold | `scaffold context/uat/verification/phase-dir/research-dir/eval/baseline` | Template generation |
| Progress | `progress json/table/bar` | Multi-format progress rendering |
| Parsers | `phase-plan-index/state-snapshot/summary-extract/history-digest` | Context-optimized data extraction |
| Frontmatter | `frontmatter get/set/merge/validate` | YAML frontmatter CRUD |
| Tracker | `tracker get-config/sync-roadmap/sync-phase/update-status/add-comment/prepare-*/schedule/prepare-reschedule` | GitHub/MCP Atlassian integration |
| Long-Term Roadmap | `long-term-roadmap parse/validate/display/mode/generate/refine/promote/tier/history` | Hierarchical milestone management |
| Backend | `detect-backend` | Backend detection with dynamic model resolution |
| Quality | `quality-analysis --phase N` | Phase-boundary code quality checks |
| Init | 21 workflow initializers | Context loading for commands |

All outputs are JSON by default (pass `--raw` for plain text). All tracker calls are non-blocking.

### Self-Update

GRD includes a self-update system for git-cloned installations:

| Command | Description |
|---------|-------------|
| `/grd:update` | Check for updates, display changelog, backup modifications, pull latest |
| `/grd:reapply-patches` | Restore local modifications after update |

The update system uses SHA256 manifests (`bin/grd-manifest.js`) to detect local modifications before updating, backs them up to `grd-local-patches/`, and supports intelligent merge after update.

## Credits

Built on [GSD (Get Shit Done)](https://github.com/coleam00/get-shit-done) by Cole Medin. Extended for R&D workflows by Cameleon X.
