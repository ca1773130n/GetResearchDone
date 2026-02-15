<purpose>
Interactive configuration of GRD workflow agents (research, plan_check, verifier), model profile selection, research gates, and autonomous mode via multi-question prompt. Updates .planning/config.json with user preferences.
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
- `workflow.research` — spawn researcher during plan-phase
- `workflow.plan_check` — spawn plan checker during plan-phase
- `workflow.verifier` — spawn verifier during execute-phase
- `model_profile` — which model each agent uses (default: `balanced`)
- `git.branching_strategy` — branching approach (default: `"none"`)
- `autonomous_mode` — YOLO mode, skip all gates (default: `false`)
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
    question: "Git branching strategy?",
    header: "Branching",
    multiSelect: false,
    options: [
      { label: "None (Recommended)", description: "Commit directly to current branch" },
      { label: "Per Phase", description: "Create branch for each phase (grd/phase-{N}-{name})" },
      { label: "Per Milestone", description: "Create branch for entire milestone (grd/{version}-{name})" }
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
    "branching_strategy": "none" | "phase" | "milestone"
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
| Git Branching        | {None/Per Phase/Per Milestone} |
| Autonomous Mode      | {On/Off} |
| Gate: Eval Design    | {On/Off} |
| Gate: Method Select  | {On/Off} |
| Gate: Baseline Review| {On/Off} |
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
- [ ] Current config read
- [ ] User presented with 8 settings (profile + 3 workflow toggles + git branching + autonomous mode + research gates + tracker)
- [ ] Config updated with all sections including research_gates and autonomous_mode
- [ ] Changes confirmed to user
</success_criteria>
