# GRD — Get Research Done

[![CI](https://github.com/ca1773130n/GRD/actions/workflows/ci.yml/badge.svg)](https://github.com/ca1773130n/GRD/actions/workflows/ci.yml)

R&D workflow automation plugin for [Claude Code](https://claude.com/claude-code). Built for projects where research papers drive implementation, quantitative evaluation matters, and autonomous iteration is the norm.

## What is GRD?

GRD brings research rigor to AI-assisted software development:

- **Paper-driven development** — survey SoTA, deep-dive papers, assess feasibility before coding
- **Tiered verification** — sanity checks in-phase, proxy metrics for quick feedback, deferred evaluation at integration
- **Autonomous iteration** — YOLO mode lets the agent plan, execute, evaluate, and iterate without supervision
- **Multi-backend scheduling** — rate-limit-aware routing across Claude, Codex, Gemini, OpenCode, and Overstory with EWMA token prediction
- **Scale-adaptive ceremony** — light/standard/full agent configurations based on phase complexity

## Quick Start

```bash
# Install as Claude Code plugin
claude plugin add https://github.com/ca1773130n/GRD.git

# Initialize a new R&D project
/grd:new-project

# Or jump straight in
/grd:survey "topic"          # Survey state of the art
/grd:plan-phase 1            # Plan the first phase
/grd:execute-phase 1         # Execute it
/grd:autopilot               # Let it run autonomously
```

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
| `/grd:new-project` | Initialize R&D project |
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
| `/grd:settings` | Configure workflow and preferences |
| `/grd:help` | Full command reference |

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

Built on [GSD (Get Shit Done)](https://github.com/coleam00/get-shit-done) by Cole Medin. Extended for R&D workflows by Cameleon X.
