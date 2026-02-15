<planning_config>

Configuration options for `.planning/` directory behavior in GRD projects.

<config_schema>

## Base Config (inherited from GSD)

```json
"planning": {
  "commit_docs": true,
  "search_gitignored": false
},
"git": {
  "branching_strategy": "none",
  "phase_branch_template": "grd/phase-{phase}-{slug}",
  "milestone_branch_template": "grd/{milestone}-{slug}"
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `commit_docs` | `true` | Whether to commit planning artifacts to git |
| `search_gitignored` | `false` | Add `--no-ignore` to broad rg searches |
| `git.branching_strategy` | `"none"` | Git branching approach: `"none"`, `"phase"`, or `"milestone"` |
| `git.phase_branch_template` | `"grd/phase-{phase}-{slug}"` | Branch template for phase strategy |
| `git.milestone_branch_template` | `"grd/{milestone}-{slug}"` | Branch template for milestone strategy |

## R&D Config (new)

```json
"research_gates": {
  "before_plan": true,
  "verification_design": true,
  "after_eval": true,
  "feasibility": false
},
"autonomous_mode": {
  "enabled": false,
  "max_iterations": 3,
  "stop_on_regression": true,
  "require_baseline": true
},
"tracker": {
  "provider": "none",
  "auto_sync": true,
  "github": {
    "project_board": "",
    "default_assignee": "",
    "default_labels": ["research", "implementation", "evaluation", "integration"],
    "auto_issues": true,
    "pr_per_phase": false
  },
  "mcp_atlassian": {
    "project_key": "",
    "milestone_issue_type": "Epic",
    "phase_issue_type": "Task",
    "plan_issue_type": "Sub-task"
  }
},
"eval_config": {
  "default_metrics": ["psnr", "ssim", "lpips"],
  "sanity_timeout": 60,
  "proxy_timeout": 300,
  "full_timeout": 3600,
  "baseline_file": ".planning/research/BASELINE.md",
  "benchmarks_file": ".planning/research/BENCHMARKS.md"
},
"code_review": {
  "enabled": true,
  "timing": "per_wave",
  "severity_gate": "blocker",
  "auto_fix_warnings": false
},
"execution": {
  "use_teams": false,
  "team_timeout_minutes": 30,
  "max_concurrent_teammates": 4
}
```

### research_gates

| Option | Default | Description |
|--------|---------|-------------|
| `before_plan` | `true` | Require LANDSCAPE.md review before planning implementation phases |
| `verification_design` | `true` | Require eval plan before evaluate phases |
| `after_eval` | `true` | Require eval results review before marking phase complete |
| `feasibility` | `false` | Require feasibility analysis before implementing new approaches |

**Gate behavior:**
- When `true`: Orchestrator pauses and checks for required artifact before proceeding
- When `false`: Orchestrator skips the check
- Gates are advisory by default; they create checkpoints, not hard blocks
- In autonomous mode, gates that would normally checkpoint are auto-approved unless `stop_on_regression` triggers

### autonomous_mode

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Toggle headless/autonomous execution |
| `max_iterations` | `3` | Maximum iteration loops before requiring human input |
| `stop_on_regression` | `true` | Halt autonomous execution if metrics regress from baseline |
| `require_baseline` | `true` | Must have BASELINE.md before entering autonomous mode |

**Autonomous mode behavior:**
- When `enabled: true`: Agent makes all decisions without human input
- Research gates are auto-approved
- Checkpoints are auto-resolved based on eval results
- Iteration loops trigger automatically when targets not met
- Stops after `max_iterations` or when targets met
- Always stops on regression if `stop_on_regression: true`

**Toggle at runtime:** `/grd:yolo` enables/disables autonomous mode

**Safety constraints:**
- Cannot delete or overwrite baseline without confirmation
- Cannot exceed `max_iterations` without human review
- Always records decisions in STATE.md for audit trail
- Regression detection is based on primary metrics only

### tracker

| Option | Default | Description |
|--------|---------|-------------|
| `provider` | `"none"` | Tracker provider: `"none"`, `"github"`, or `"mcp-atlassian"` |
| `auto_sync` | `true` | Automatically sync during roadmap/plan/execute/verify workflows |
| `github.project_board` | `""` | GitHub Project board URL or ID |
| `github.default_assignee` | `""` | Default assignee for created issues |
| `github.default_labels` | `[...]` | Labels applied to phase issues |
| `github.auto_issues` | `true` | Automatically create issues for phase tasks |
| `github.pr_per_phase` | `false` | Create PR per phase (requires branching_strategy: "phase") |
| `mcp_atlassian.project_key` | `""` | Jira project key (e.g., `PROJ`) |
| `mcp_atlassian.milestone_issue_type` | `"Epic"` | Jira issue type for milestones (Epics) |
| `mcp_atlassian.phase_issue_type` | `"Task"` | Jira issue type for phases (Tasks, children of Epic) |
| `mcp_atlassian.plan_issue_type` | `"Sub-task"` | Jira issue type for plans (Sub-tasks, children of Task) |

**When configured (provider != "none"):**
- Roadmap creation syncs phases to tracker (grd-roadmapper)
- Plan creation syncs plans to tracker (grd-planner, plan-phase)
- Execution updates status to in_progress/complete (grd-executor)
- Eval results posted as comments (grd-eval-reporter)
- Verification results posted as comments (grd-verifier)
- All calls are non-blocking (`2>/dev/null || true`)
- Idempotency via `.planning/TRACKER.md` mapping file

**Backward compatibility:** Old `github_integration` and `"jira"` provider configs are automatically migrated at read time. Old `epic_issue_type`/`task_issue_type` keys are auto-migrated to `milestone_issue_type`/`phase_issue_type`/`plan_issue_type`.

**MCP Atlassian authentication:** Handled transparently by the mcp-atlassian MCP server. No environment variables needed in GRD.

**GitHub authentication:** Uses `gh` CLI (authenticate via `gh auth login`)

### eval_config

| Option | Default | Description |
|--------|---------|-------------|
| `default_metrics` | `["psnr", "ssim", "lpips"]` | Metrics to track by default |
| `sanity_timeout` | `60` | Max seconds for Tier 1 sanity checks |
| `proxy_timeout` | `300` | Max seconds for Tier 2 proxy evaluation |
| `full_timeout` | `3600` | Max seconds for Tier 3 full evaluation |
| `baseline_file` | `".planning/research/BASELINE.md"` | Path to baseline assessment |
| `benchmarks_file` | `".planning/research/BENCHMARKS.md"` | Path to benchmarks reference |

### code_review

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Automatically run code review after execution |
| `timing` | `"per_wave"` | When to review: `"per_wave"` / `"per_phase"` / `"disabled"` |
| `severity_gate` | `"blocker"` | What blocks execution: `"blocker"` / `"warning"` / `"none"` |
| `auto_fix_warnings` | `false` | Auto-fix warning-level issues without user approval |

**Review behavior:**
- When `enabled: true` and `timing: "per_wave"`: Code reviewer runs after each wave completes, before proceeding to the next wave
- When `timing: "per_phase"`: Code reviewer runs once after all waves complete, before verification
- When `timing: "disabled"` or `enabled: false`: No automatic code review
- `severity_gate: "blocker"`: Only BLOCKER findings halt execution (user must acknowledge)
- `severity_gate: "warning"`: BLOCKER and WARNING findings halt execution
- `severity_gate: "none"`: Review runs but never blocks (informational only)
- Review output: `{phase}-{wave}-REVIEW.md` (per_wave) or `{phase}-REVIEW.md` (per_phase)

### execution

| Option | Default | Description |
|--------|---------|-------------|
| `use_teams` | `false` | Use Agent Teams for parallel wave execution (experimental) |
| `team_timeout_minutes` | `30` | Per-plan timeout in Teams mode |
| `max_concurrent_teammates` | `4` | Maximum parallel executor teammates per wave |

**Teams execution behavior:**
- When `use_teams: false` (default): Standard Task()-based wave execution (existing behavior, no regression)
- When `use_teams: true`: TeamCreate/SendMessage-based coordination with named teammates
- Teammates report checkpoints via SendMessage instead of exiting (team lead mediates)
- Team lead monitors via TaskList, handles failures, coordinates checkpoint resolution
- `team_timeout_minutes`: Per-plan execution timeout; exceeded plans are reported as failed
- `max_concurrent_teammates`: Limits concurrent executor agents to manage resource usage

</config_schema>

<commit_docs_behavior>

**When `commit_docs: true` (default):**
- Planning files committed normally
- SUMMARY.md, STATE.md, ROADMAP.md tracked in git
- Research artifacts (LANDSCAPE.md, BENCHMARKS.md, etc.) tracked
- Full history of planning and research decisions preserved

**When `commit_docs: false`:**
- Skip all `git add`/`git commit` for `.planning/` files
- User must add `.planning/` to `.gitignore`
- Useful for: OSS contributions, client projects, keeping planning private

**Using grd-tools (when available):**

```bash
# Commit with automatic commit_docs + gitignore checks:
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "docs: update state" --files .planning/STATE.md

# Load config via state load (returns JSON):
INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js state load)
```

**Auto-detection:** If `.planning/` is gitignored, `commit_docs` is automatically `false` regardless of config.json.

</commit_docs_behavior>

<search_behavior>

**When `search_gitignored: false` (default):**
- Standard rg behavior (respects .gitignore)
- Direct path searches work: `rg "pattern" .planning/` finds files
- Broad searches skip gitignored: `rg "pattern"` skips `.planning/`

**When `search_gitignored: true`:**
- Add `--no-ignore` to broad rg searches that should include `.planning/`
- Only needed when searching entire repo and expecting `.planning/` matches

</search_behavior>

<branching_strategy_behavior>

**Branching Strategies:**

| Strategy | When branch created | Branch scope | Merge point |
|----------|---------------------|--------------|-------------|
| `none` | Never | N/A | N/A |
| `phase` | At `execute-phase` start | Single phase | User merges after phase |
| `milestone` | At first `execute-phase` of milestone | Entire milestone | At `complete-milestone` |

**When `git.branching_strategy: "none"` (default):**
- All work commits to current branch
- Standard GRD behavior

**When `git.branching_strategy: "phase"`:**
- `execute-phase` creates/switches to a branch before execution
- Branch name from `phase_branch_template` (e.g., `grd/phase-03-attention-module`)
- All plan commits go to that branch
- User merges branches manually after phase completion
- `complete-milestone` offers to merge all phase branches
- Works well with `github_integration.pr_per_phase: true`

**When `git.branching_strategy: "milestone"`:**
- First `execute-phase` of milestone creates the milestone branch
- Branch name from `milestone_branch_template` (e.g., `grd/v1.0-baseline-model`)
- All phases in milestone commit to same branch
- `complete-milestone` offers to merge milestone branch to main

**Template variables:**

| Variable | Available in | Description |
|----------|--------------|-------------|
| `{phase}` | phase_branch_template | Zero-padded phase number (e.g., "03") |
| `{slug}` | Both | Lowercase, hyphenated name |
| `{milestone}` | milestone_branch_template | Milestone version (e.g., "v1.0") |

**R&D branching recommendation:**
- `phase` strategy for projects with multiple experimental approaches (easy to discard failed experiments)
- `milestone` strategy for iterative improvement (baseline v1 → improved v2 → final v3)
- `none` for solo research where git history is sufficient

</branching_strategy_behavior>

<research_gates_behavior>

## Research Gate Behavior

Gates create checkpoints at key decision points in the R&D workflow.

**before_plan gate:**
```
Triggered: Before plan-phase for implement/evaluate phase types
Checks: LANDSCAPE.md exists and has relevant methods
Action: Checkpoint asking user to confirm approach is informed by survey
Skip if: Phase type is survey or integrate
```

**verification_design gate:**
```
Triggered: Before execute-phase for evaluate phase types
Checks: EVAL plan exists for this phase
Action: Checkpoint asking user to confirm eval plan is adequate
Skip if: Phase type is survey or implement
```

**after_eval gate:**
```
Triggered: After eval-report completes
Checks: Primary metrics meet targets defined in eval plan
Action: Decision checkpoint with iterate/continue/pivot options
Skip if: All targets met (auto-approved with note)
```

**feasibility gate:**
```
Triggered: Before first implement phase of a new approach
Checks: Feasibility analysis exists in KNOWHOW.md
Action: Checkpoint presenting feasibility summary
Skip if: Approach was already implemented in previous iteration
```

**In autonomous mode:**
- `before_plan`: Auto-approved, logged to STATE.md
- `verification_design`: Auto-approved if EVAL plan exists, auto-created if not
- `after_eval`: Auto-triggers iteration if targets not met, auto-continues if met
- `feasibility`: Auto-approved, logged to STATE.md

</research_gates_behavior>

<setup_uncommitted_mode>

To use uncommitted mode:

1. **Set config:**
   ```json
   "planning": {
     "commit_docs": false,
     "search_gitignored": true
   }
   ```

2. **Add to .gitignore:**
   ```
   .planning/
   ```

3. **Existing tracked files:** If `.planning/` was previously tracked:
   ```bash
   git rm -r --cached .planning/
   git commit -m "chore: stop tracking planning docs"
   ```

</setup_uncommitted_mode>

</planning_config>
