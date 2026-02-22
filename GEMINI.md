# Auto-synced from Claude Code (cc2all)
# Do not edit — changes will be overwritten


# [Project rules from CLAUDE.md]

# GRD — Get Research Done

R&D workflow automation for Claude Code. Paper-driven development, tiered evaluation, autonomous iteration loops.

## Architecture

```
.planning/
├── PROJECT.md              # Product vision, research objectives, quality targets
├── ROADMAP.md              # Phase structure with verification levels
├── STATE.md                # Living memory with baselines, deferred validations
├── BASELINE.md             # Current quantitative performance metrics
├── PRODUCT-QUALITY.md      # Product-level quality targets and gaps
├── REQUIREMENTS.md         # Requirements with traceability
├── config.json             # GRD configuration
├── TRACKER.md              # Issue tracker mapping (created at runtime)
├── research/               # Persistent research knowledge base
│   ├── LANDSCAPE.md        # SoTA map (methods, benchmarks, trends)
│   ├── PAPERS.md           # Paper index with summaries
│   ├── BENCHMARKS.md       # Evaluation metrics and datasets
│   ├── KNOWHOW.md          # Paper→production gap knowledge
│   └── deep-dives/         # Individual paper analyses
│       └── {paper-slug}.md
├── phases/
│   └── {NN}-{name}/
│       ├── {NN}-RESEARCH.md    # Phase research with paper references
│       ├── {NN}-CONTEXT.md     # User decisions from discuss-phase
│       ├── {NN}-{MM}-PLAN.md   # Execution plan with verification_level
│       ├── {NN}-{MM}-SUMMARY.md # Execution results with experiment data
│       ├── {NN}-{MM}-REVIEW.md # Code review findings (per wave)
│       ├── {NN}-EVAL.md        # Tiered evaluation plan and results
│       └── {NN}-VERIFICATION.md # Tiered verification report
├── codebase/               # Codebase analysis (from map-codebase)
└── todos/                  # Captured ideas
```

## R&D Workflow

```
Idea → Survey → Feasibility → Product Plan → Roadmap
  → [per phase: Research → Plan → Execute → Review → Eval → Iterate?]
  → Integration → Product Verification → Done
         ↑                                    ↑
         └──── LANDSCAPE.md continuously ─────┘
```

## Tiered Verification

R&D phases use three verification levels:

| Level | Name | When | Example |
|-------|------|------|---------|
| 1 | Sanity | Always in-phase | Format checks, crash tests, distribution viz |
| 2 | Proxy | Indirect in-phase | Small-subset eval, ablation reproduction |
| 3 | Deferred | Integration only | Full PSNR/SSIM/LPIPS on complete pipeline |

Deferred validations are tracked in STATE.md and automatically collected at integration phases.

## Autonomous Mode (YOLO)

Toggle with `/grd:yolo`. When enabled:
- All research gates → disabled
- All confirmation gates → disabled
- Agent makes its own decisions using available context
- All decisions are logged for review

## Tracker Integration (GitHub / MCP Atlassian)

When `tracker.provider` is `"github"` or `"mcp-atlassian"` in config:
- One-way push: GRD → Tracker (GRD is source of truth)
- Mapping: Milestone → Epic, Phase → Task (child of Epic), Plan → Sub-task (child of Task)
- Status updates, eval results, and verification posted as comments on phase Tasks
- Idempotency via `.planning/TRACKER.md` mapping file
- All tracker calls non-blocking (never blocks workflow)
- MCP Atlassian uses prepare/execute/record pattern (agents call MCP tools directly)
- Date scheduling: milestone `**Start:**`/`**Target:**` + phase `**Duration:** Nd` → computed dates synced to Jira Plans timeline
- Cascade reschedule: phase add/insert → automatic date shift for subsequent phases via `prepare-reschedule`

## Key Commands

### Research
- `/grd:survey <topic>` — SoTA landscape scan
- `/grd:deep-dive <paper>` — Paper deep analysis
- `/grd:compare-methods` — Method comparison matrix
- `/grd:feasibility <approach>` — Paper→production gap analysis

### Planning & Execution
- `/grd:new-project` — Initialize R&D project
- `/grd:product-plan` — Product-level planning
- `/grd:discuss-phase <N>` — Brainstorming with no-solutions-before-questions protocol
- `/grd:plan-phase <N>` — Phase planning with research context
- `/grd:execute-phase <N>` — Phase execution (supports Agent Teams)
- `/grd:plan-milestone-gaps` — Create phases to close gaps from milestone audit

### Evaluation
- `/grd:assess-baseline` — Current performance baseline
- `/grd:eval-plan <N>` — Design tiered evaluation
- `/grd:eval-report <N>` — Collect and analyze results
- `/grd:iterate <N>` — Iteration loop on failed metrics

### Integration
- `/grd:sync [roadmap | phase <N> | status | reschedule]` — Sync GRD state to issue tracker
- `/grd:tracker-setup` — Configure GitHub Issues or MCP Atlassian integration

## Agent Model Profiles

| Agent | Quality | Balanced | Budget |
|-------|---------|----------|--------|
| grd-planner | opus | opus | sonnet |
| grd-executor | opus | sonnet | sonnet |
| grd-surveyor | opus | sonnet | sonnet |
| grd-deep-diver | opus | sonnet | haiku |
| grd-eval-planner | opus | opus | sonnet |
| grd-product-owner | opus | opus | sonnet |
| grd-code-reviewer | opus | sonnet | haiku |
| grd-verifier | sonnet | sonnet | haiku |

## Configuration

`.planning/config.json` controls:
- `research_gates` — Human review points for research decisions
- `autonomous_mode` — YOLO mode toggle
- `tracker` — Issue tracker integration (GitHub Issues / MCP Atlassian)
- `eval_config` — Default metrics and baseline tracking
- `code_review` — Auto code review (enabled, timing, severity gate)
- `execution` — Agent Teams toggle, timeout, concurrency limits
- Standard GSD settings (parallelization, gates, safety)

## CLI Tooling (`grd-tools.js`)

Deterministic operations delegated from commands to `bin/grd-tools.js`. All commands output JSON (with `--raw` for plain text).

### State Management
- `state load` — Full config + state + roadmap status
- `state get [section]` — Read STATE.md field or section
- `state patch --field val` — Batch update fields
- `state advance-plan` — Increment plan counter
- `state record-metric --phase N --plan M --duration Xmin` — Record execution metrics
- `state add-decision --summary "..." [--phase N]` — Log decision
- `state add-blocker / resolve-blocker` — Track blockers

### Verification Suite
- `verify plan-structure <file>` — Validate PLAN.md structure + frontmatter
- `verify phase-completeness <phase>` — Check plans have summaries
- `verify references <file>` — Validate @-refs and file paths
- `verify commits <hash>...` — Batch verify git commits
- `verify artifacts <plan>` — Check must_haves.artifacts exist
- `verify key-links <plan>` — Validate must_haves.key_links

### Phase & Roadmap
- `phase add/insert/remove/complete` — Phase lifecycle operations
- `roadmap get-phase <N> / analyze` — Roadmap queries
- `milestone complete [--name]` — Archive milestone
- `validate consistency` — Phase numbering + disk/roadmap sync

### Scaffold
- `scaffold context/uat/verification/phase-dir/research-dir/eval/baseline`

### Context Optimization
- `phase-plan-index <N>` — Index plans with waves and status
- `state-snapshot` — Structured STATE.md parse
- `summary-extract <path> [--fields]` — Extract structured summary data
- `history-digest` — Aggregate all SUMMARY.md metrics
- `progress [json|table|bar]` — Render progress in multiple formats

### Frontmatter CRUD
- `frontmatter get/set/merge/validate` — YAML frontmatter operations

### Tracker
- `tracker get-config/sync-roadmap/sync-phase/update-status/add-comment/sync-status/prepare-roadmap-sync/prepare-phase-sync/record-mapping/record-status/schedule/prepare-reschedule`

### Workflow Init (21 workflows)
- `init execute-phase/plan-phase/new-project/new-milestone/quick/resume/verify-work/phase-op/todos/milestone-op/plan-milestone-gaps/map-codebase/progress`
- `init survey/deep-dive/feasibility/eval-plan/eval-report/assess-baseline/product-plan/iterate`

## Self-Update

- `/grd:update` — Check for updates, display changelog, backup modifications, pull latest
- `/grd:reapply-patches` — Restore local modifications after update
- `bin/grd-manifest.js` — SHA256-based file tracking (`generate`, `detect`, `save-patches`, `load-patches`)
