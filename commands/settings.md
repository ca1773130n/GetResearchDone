---
description: Configure GRD workflow agents, model profile, git isolation, execution teams, code review, confirmation gates, research gates, and autonomous mode
---

<purpose>
Interactive configuration of all GRD settings via multi-question prompt: workflow agents (research, plan_check, verifier), model profile, git worktree isolation, execution teams, code review (timing, severity, auto-fix), confirmation gates, research gates, autonomous mode, and tracker integration. Updates .planning/config.json with user preferences.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="ensure_and_load_config">
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js config-ensure-section
INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js state load)
```
</step>

<step name="read_current">
```bash
cat .planning/config.json
```

Parse current values:
- `workflow.research` — spawn researcher during plan-phase (default: `true`)
- `workflow.plan_check` — spawn plan checker during plan-phase (default: `true`)
- `workflow.verifier` — spawn verifier during execute-phase (default: `true`)
- `model_profile` — which model each agent uses (default: `"balanced"`)
- `git.branching_strategy` — branching approach (default: `"none"`)
- `git.worktree_dir` — worktree directory location (default: `".worktrees/"`)
- `git.default_completion_action` — action after phase execution (default: `"ask"`)
- `autonomous_mode` — YOLO mode, skip all gates (default: `false`)
- `execution.use_teams` — parallel teammate execution (default: `false`)
- `execution.max_concurrent_teammates` — max teammates when teams enabled (default: `4`)
- `code_review.enabled` — whether auto code review is on (default: `true`)
- `code_review.timing` — review timing: per_wave or per_phase (default: `"per_wave"`)
- `code_review.severity_gate` — minimum severity to block (default: `"blocker"`)
- `code_review.auto_fix_warnings` — auto-fix warning-level findings (default: `false`)
- `confirmation_gates.commit_confirmation` — confirm before git commit (default: `false`)
- `confirmation_gates.file_deletion` — confirm before deleting files (default: `false`)
- `confirmation_gates.phase_completion` — confirm before marking phase complete (default: `false`)
- `confirmation_gates.target_adjustment` — confirm before adjusting eval targets (default: `false`)
- `confirmation_gates.approach_change` — confirm before changing approach (default: `false`)
- `research_gates.verification_design` — pause for EVAL.md review (default: `false`)
- `research_gates.method_selection` — pause for method choice review (default: `false`)
- `research_gates.baseline_review` — pause for baseline review (default: `false`)
</step>

<step name="present_settings">
Use AskUserQuestion with current values pre-selected:

```
AskUserQuestion([
  {
    question: "Which model profile for agents?",
    header: "Model",
    multiSelect: false,
    options: [
      { label: "Quality", description: "Opus everywhere except verification (highest cost)" },
      { label: "Balanced (Recommended)", description: "Opus for planning, Sonnet for execution/verification" },
      { label: "Budget", description: "Sonnet for writing, Haiku for research/verification (lowest cost)" }
    ]
  },
  {
    question: "Spawn Plan Researcher? (researches domain before planning)",
    header: "Research",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Research phase goals before planning" },
      { label: "No", description: "Skip research, plan directly" }
    ]
  },
  {
    question: "Spawn Plan Checker? (verifies plans before execution)",
    header: "Plan Check",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify plans meet phase goals" },
      { label: "No", description: "Skip plan verification" }
    ]
  },
  {
    question: "Spawn Execution Verifier? (verifies phase completion)",
    header: "Verifier",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Verify must-haves after execution" },
      { label: "No", description: "Skip post-execution verification" }
    ]
  },
  {
    question: "Use worktree isolation for phase execution?",
    header: "Git Isolation",
    multiSelect: false,
    options: [
      { label: "Yes", description: "Each phase runs in a separate git worktree (recommended for active development)" },
      { label: "No (Default)", description: "Execute directly on current branch, no isolation" }
    ]
  },
  {
    question: "Enable autonomous (YOLO) mode?",
    header: "Autonomous Mode",
    multiSelect: false,
    options: [
      { label: "No (Recommended)", description: "Confirm at decision points" },
      { label: "Yes", description: "Agent makes all decisions, skip all gates" }
    ]
  },
  {
    question: "Use Agent Teams for parallel plan execution?",
    header: "Execution Teams",
    multiSelect: false,
    options: [
      { label: "No (Default)", description: "Execute plans sequentially in a single agent" },
      { label: "Yes", description: "Spawn parallel teammate agents for each wave" }
    ]
  },
  {
    question: "Automatic code review timing?",
    header: "Code Review",
    multiSelect: false,
    options: [
      { label: "Per Wave (Default)", description: "Review after each execution wave completes" },
      { label: "Per Phase", description: "Review once after entire phase execution" },
      { label: "Disabled", description: "No automatic code review" }
    ]
  },
  {
    question: "Minimum severity to block execution?",
    header: "Review Severity Gate",
    multiSelect: false,
    options: [
      { label: "Blocker (Default)", description: "Only blockers halt execution" },
      { label: "Critical", description: "Blockers and critical issues halt execution" },
      { label: "Warning", description: "All non-info issues halt execution" }
    ]
  },
  {
    question: "Auto-fix warnings found during code review?",
    header: "Auto-fix Warnings",
    multiSelect: false,
    options: [
      { label: "No (Default)", description: "Report warnings but do not auto-fix" },
      { label: "Yes", description: "Automatically fix warning-level review findings" }
    ]
  },
  {
    question: "Confirmation gates — pause for human approval at these points?",
    header: "Confirmation Gates",
    multiSelect: true,
    options: [
      { label: "Commit Confirmation", description: "Confirm before each git commit" },
      { label: "File Deletion", description: "Confirm before deleting files" },
      { label: "Phase Completion", description: "Confirm before marking phase complete" },
      { label: "Target Adjustment", description: "Confirm before adjusting evaluation targets" },
      { label: "Approach Change", description: "Confirm before changing implementation approach" }
    ]
  },
  {
    question: "Research gates — pause for human review at these checkpoints?",
    header: "Research Gates",
    multiSelect: true,
    options: [
      { label: "Verification Design", description: "Review EVAL.md before execution" },
      { label: "Method Selection", description: "Review method choice before planning" },
      { label: "Baseline Review", description: "Review baseline assessment before setting targets" }
    ]
  },
  {
    question: "Issue tracker provider?",
    header: "Tracker",
    multiSelect: false,
    options: [
      { label: "None (Recommended)", description: "No tracker integration" },
      { label: "GitHub Issues", description: "Sync phases/plans to GitHub Issues (requires gh CLI)" },
      { label: "Jira", description: "Sync phases/plans to Jira (requires API token or OAuth)" }
    ]
  }
])
```

**Conditional: Worktree sub-options (if user selected "Yes" for Git Isolation)**

If user selected "Yes" for Git Isolation, ask follow-up questions:

```
AskUserQuestion([
  {
    question: "Worktree directory location?",
    header: "Worktree Directory",
    multiSelect: false,
    options: [
      { label: ".worktrees/ (Default)", description: "Project-local .worktrees/ directory" },
      { label: "Custom", description: "Specify a custom directory path" }
    ]
  },
  {
    question: "Default action when phase execution completes?",
    header: "Completion Action",
    multiSelect: false,
    options: [
      { label: "Ask each time (Default)", description: "Present merge/PR/keep/discard options after execution" },
      { label: "Merge locally", description: "Auto-merge worktree branch into base branch" },
      { label: "Create PR", description: "Auto-push and create pull request" },
      { label: "Keep branch", description: "Leave worktree in place for manual review" }
    ]
  }
])
```

If "Custom" is selected for Worktree Directory, prompt the user for the custom directory path (free-text input).

**Conditional: Execution Teams sub-options (if user selected "Yes" for Execution Teams)**

If user selected "Yes" for Execution Teams, ask follow-up question:

```
AskUserQuestion([
  {
    question: "Maximum concurrent teammates?",
    header: "Team Size",
    multiSelect: false,
    options: [
      { label: "2", description: "Conservative — lower resource usage" },
      { label: "4 (Default)", description: "Balanced concurrency" },
      { label: "6", description: "Higher parallelism for large phases" }
    ]
  }
])
```
</step>

<step name="update_config">
Merge new settings into existing config.json:

```json
{
  ...existing_config,
  "model_profile": "quality" | "balanced" | "budget",
  "autonomous_mode": true|false,
  "workflow": {
    "research": true/false,
    "plan_check": true/false,
    "verifier": true/false
  },
  "git": {
    "branching_strategy": "none" | "phase",
    "worktree_dir": ".worktrees/" | custom_path,
    "default_completion_action": "ask" | "merge" | "pr" | "keep"
  },
  "execution": {
    "use_teams": true/false,
    "max_concurrent_teammates": 2|4|6
  },
  "code_review": {
    "enabled": timing !== "disabled",
    "timing": "per_wave" | "per_phase",
    "severity_gate": "blocker" | "critical" | "warning",
    "auto_fix_warnings": true/false
  },
  "confirmation_gates": {
    "commit_confirmation": true/false,
    "file_deletion": true/false,
    "phase_completion": true/false,
    "target_adjustment": true/false,
    "approach_change": true/false
  },
  "research_gates": {
    "verification_design": true/false,
    "method_selection": true/false,
    "baseline_review": true/false
  },
  "tracker": {
    "provider": "none" | "github" | "mcp-atlassian"
  }
}
```

**Mapping rules:**

Git Isolation:
- "Yes" -> `branching_strategy: "phase"`, write `worktree_dir` and `default_completion_action`
- "No" -> `branching_strategy: "none"` (omit worktree_dir and default_completion_action)

Worktree Directory:
- ".worktrees/ (Default)" -> `worktree_dir: ".worktrees/"`
- "Custom" -> `worktree_dir: <user-provided path>`

Completion Action:
- "Ask each time (Default)" -> `default_completion_action: "ask"`
- "Merge locally" -> `default_completion_action: "merge"`
- "Create PR" -> `default_completion_action: "pr"`
- "Keep branch" -> `default_completion_action: "keep"`

Execution Teams:
- "Yes" -> `use_teams: true`, write `max_concurrent_teammates` from follow-up
- "No" -> `use_teams: false`

Code Review Timing:
- "Per Wave (Default)" -> `timing: "per_wave"`, `enabled: true`
- "Per Phase" -> `timing: "per_phase"`, `enabled: true`
- "Disabled" -> `enabled: false`

Review Severity Gate:
- "Blocker (Default)" -> `severity_gate: "blocker"`
- "Critical" -> `severity_gate: "critical"`
- "Warning" -> `severity_gate: "warning"`

Confirmation Gates (multi-select — each selected label maps to `true`):
- "Commit Confirmation" -> `commit_confirmation: true`
- "File Deletion" -> `file_deletion: true`
- "Phase Completion" -> `phase_completion: true`
- "Target Adjustment" -> `target_adjustment: true`
- "Approach Change" -> `approach_change: true`
- Unselected gates default to `false`

Write updated config to `.planning/config.json`.
</step>

<step name="confirm">
Display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD ► SETTINGS UPDATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Setting              | Value |
|----------------------|-------|
| Model Profile        | {quality/balanced/budget} |
| Plan Researcher      | {On/Off} |
| Plan Checker         | {On/Off} |
| Execution Verifier   | {On/Off} |
| Git Isolation        | {On/Off} |
| Worktree Directory   | {path or N/A} |
| Completion Action    | {ask/merge/pr/keep or N/A} |
| Agent Teams          | {On/Off} |
| Max Teammates        | {N or N/A} |
| Code Review          | {Per Wave/Per Phase/Off} |
| Severity Gate        | {blocker/critical/warning} |
| Auto-fix Warnings    | {On/Off} |
| Autonomous Mode      | {On/Off} |
| Gate: Eval Design    | {On/Off} |
| Gate: Method Select  | {On/Off} |
| Gate: Baseline Review| {On/Off} |
| Gate: Commit Confirm | {On/Off} |
| Gate: File Deletion  | {On/Off} |
| Gate: Phase Complete | {On/Off} |
| Gate: Target Adjust  | {On/Off} |
| Gate: Approach Change| {On/Off} |
| Tracker              | {None/GitHub/Jira} |

These settings apply to future /grd:plan-phase and /grd:execute-phase runs.

Quick commands:
- /grd:set-profile <profile> — switch model profile
- /grd:yolo — toggle autonomous mode
- /grd:plan-phase --research — force research
- /grd:plan-phase --skip-research — skip research
- /grd:plan-phase --skip-verify — skip plan check
```
</step>

</process>

<success_criteria>
- [ ] Current config read with all sections (workflow, git, execution, code_review, confirmation_gates, research_gates, tracker)
- [ ] User presented with 13+ questions (profile + 3 workflow toggles + git isolation + autonomous mode + execution teams + 3 code review + confirmation gates + research gates + tracker)
- [ ] Conditional sub-options asked for worktree (directory + completion action) and teams (max teammates)
- [ ] Config updated with all sections: git (branching_strategy, worktree_dir, default_completion_action), execution (use_teams, max_concurrent_teammates), code_review (enabled, timing, severity_gate, auto_fix_warnings), confirmation_gates (5 toggles), research_gates, tracker
- [ ] All settings displayed in confirmation summary table
- [ ] Changes confirmed to user
</success_criteria>
