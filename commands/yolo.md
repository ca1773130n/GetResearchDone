---
description: Toggle autonomous/headless mode — agent makes all decisions without human input
argument-hint: [on | off | status]
---

<purpose>
Toggle autonomous/headless mode (YOLO mode). When enabled, the agent makes all decisions
without human input — research gates are bypassed, confirmation prompts are auto-approved,
interview questions are self-answered using available context, and decisions are logged
but not paused for approval. This is for CI/CD, batch processing, or when the human
trusts the agent to operate independently.

CRITICAL: YOLO mode follows the same workflows but makes decisions itself rather than
asking the human. All decisions MUST be logged for post-hoc review.
</purpose>

<context>
CLAUDE.md rules: @CLAUDE.md

**Configuration:**
- `.planning/config.json` — master GRD configuration
  - `autonomous_mode`: boolean — master YOLO toggle
  - `research_gates`: object — per-workflow human review gates
  - `confirmation_gates`: object — per-action confirmation prompts
  - `yolo_decision_log`: string — path to decision log file

**Default research_gates (when YOLO is OFF):**
```json
{
  "survey_approval": false,
  "deep_dive_approval": false,
  "comparison_approval": false,
  "feasibility_approval": false,
  "verification_design": true,
  "product_plan_approval": false,
  "phase_plan_approval": false,
  "execution_approval": true
}
```

**Default confirmation_gates (when YOLO is OFF):**
```json
{
  "commit_confirmation": false,
  "file_deletion": true,
  "phase_completion": true,
  "target_adjustment": true,
  "approach_change": true
}
```
</context>

<process>

## Step 0: INITIALIZE — Read Current State

1. **Parse arguments**:
   - `on`: enable YOLO mode
   - `off`: disable YOLO mode
   - `status`: show current mode without changing
   - Empty: toggle (if on, turn off; if off, turn on)

2. **Load config**:
   - Read `.planning/config.json`
   - If missing: create with defaults (YOLO off)
   - Parse current `autonomous_mode`, `research_gates`, `confirmation_gates`

3. **Determine action**:
   ```
   CURRENT_MODE: {on | off}
   REQUESTED_ACTION: {enable | disable | status | toggle}
   TARGET_MODE: {on | off}
   ```

**STEP_0_CHECKPOINT:**
- [ ] Current config loaded
- [ ] Action determined
- [ ] Target mode identified

---

## Step 1: STATUS DISPLAY (always shown)

```
╔══════════════════════════════════════════════════════════════╗
║  GRD >>> YOLO MODE                                          ║
║                                                             ║
║  Current: {ON — autonomous | OFF — interactive}             ║
║                                                             ║
║  Research gates:                                            ║
║    survey_approval:       {on/off}                          ║
║    deep_dive_approval:    {on/off}                          ║
║    comparison_approval:   {on/off}                          ║
║    feasibility_approval:  {on/off}                          ║
║    verification_design:   {on/off}                          ║
║    product_plan_approval: {on/off}                          ║
║    phase_plan_approval:   {on/off}                          ║
║    execution_approval:    {on/off}                          ║
║                                                             ║
║  Confirmation gates:                                        ║
║    commit_confirmation:   {on/off}                          ║
║    file_deletion:         {on/off}                          ║
║    phase_completion:      {on/off}                          ║
║    target_adjustment:     {on/off}                          ║
║    approach_change:       {on/off}                          ║
║                                                             ║
╚══════════════════════════════════════════════════════════════╝
```

If action is `status`: stop here, display only.

---

## Step 2: ENABLE YOLO MODE (if target = on)

1. **Save pre-YOLO gate state** for restoration:
   - Store current `research_gates` as `_saved_research_gates`
   - Store current `confirmation_gates` as `_saved_confirmation_gates`

2. **Set autonomous mode**:
   ```json
   {
     "autonomous_mode": true,
     "research_gates": {
       "survey_approval": false,
       "deep_dive_approval": false,
       "comparison_approval": false,
       "feasibility_approval": false,
       "verification_design": false,
       "product_plan_approval": false,
       "phase_plan_approval": false,
       "execution_approval": false
     },
     "confirmation_gates": {
       "commit_confirmation": false,
       "file_deletion": false,
       "phase_completion": false,
       "target_adjustment": false,
       "approach_change": false
     }
   }
   ```

3. **Initialize decision log**:
   - Create `.planning/yolo-decisions.log` if not exists
   - Append session start entry:
     ```
     === YOLO SESSION START: {YYYY-MM-DD HH:MM:SS} ===
     Previous gates saved. All gates disabled.
     ```

4. **Display activation**:
   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║                                                             ║
   ║    ██    ██  ██████  ██       ██████                        ║
   ║     ██  ██  ██    ██ ██      ██    ██                       ║
   ║      ████   ██    ██ ██      ██    ██                       ║
   ║       ██    ██    ██ ██      ██    ██                       ║
   ║       ██     ██████  ███████  ██████                        ║
   ║                                                             ║
   ║  AUTONOMOUS MODE: ENABLED                                   ║
   ║                                                             ║
   ║  All research gates:      DISABLED                          ║
   ║  All confirmation gates:  DISABLED                          ║
   ║  Decision logging:        ENABLED                           ║
   ║  Decision log:            .planning/yolo-decisions.log      ║
   ║                                                             ║
   ║  The agent will:                                            ║
   ║    - Make all decisions without asking                      ║
   ║    - Self-answer interview questions from context           ║
   ║    - Auto-approve all gates                                 ║
   ║    - Log every decision for post-hoc review                 ║
   ║                                                             ║
   ║  To disable: /grd:yolo off                                 ║
   ║                                                             ║
   ╚══════════════════════════════════════════════════════════════╝
   ```

---

## Step 3: DISABLE YOLO MODE (if target = off)

1. **Restore saved gate states**:
   - Read `_saved_research_gates` from config
   - Read `_saved_confirmation_gates` from config
   - If no saved state: use defaults

2. **Set interactive mode**:
   ```json
   {
     "autonomous_mode": false,
     "research_gates": { ...restored_or_defaults... },
     "confirmation_gates": { ...restored_or_defaults... }
   }
   ```

3. **Close decision log session**:
   - Append to `.planning/yolo-decisions.log`:
     ```
     === YOLO SESSION END: {YYYY-MM-DD HH:MM:SS} ===
     Decisions made this session: {count}
     Gates restored to previous state.
     ===
     ```

4. **Display deactivation**:
   ```
   ╔══════════════════════════════════════════════════════════════╗
   ║  GRD >>> YOLO MODE DISABLED                                 ║
   ║                                                             ║
   ║  AUTONOMOUS MODE: OFF                                       ║
   ║                                                             ║
   ║  Research gates:      RESTORED to previous state            ║
   ║  Confirmation gates:  RESTORED to previous state            ║
   ║                                                             ║
   ║  Decisions made during YOLO session: {count}                ║
   ║  Review log: .planning/yolo-decisions.log                   ║
   ║                                                             ║
   ║  The agent will now pause at gates for human approval.      ║
   ║                                                             ║
   ╚══════════════════════════════════════════════════════════════╝
   ```

---

## Step 4: WRITE CONFIG

1. **Update `.planning/config.json`**:
   - Merge new settings into existing config
   - Preserve all non-gate settings (profile, project metadata, etc.)
   - Write atomically (write temp file, rename)

2. **Validate config after write**:
   - Re-read and parse to confirm valid JSON
   - Verify autonomous_mode matches target

---

## Step 5: COMMIT (optional)

If changes were made (not just status check):

```bash
git add .planning/config.json
git add .planning/yolo-decisions.log 2>/dev/null
git commit -m "config: {enable|disable} YOLO autonomous mode"
```

</process>

<yolo_decision_logging_protocol>
When YOLO mode is active, ALL other GRD workflows MUST log decisions to
`.planning/yolo-decisions.log` using this format:

```
[{YYYY-MM-DD HH:MM:SS}] WORKFLOW={workflow_name} DECISION={decision_type}
  Context: {brief context for the decision}
  Options: {what options were available}
  Chosen: {what was chosen}
  Rationale: {why this option was selected}
  Confidence: {HIGH|MEDIUM|LOW}
```

Decision types to log:
- GATE_BYPASS: a research or confirmation gate was auto-approved
- SELF_ANSWER: an interview question was answered from context
- APPROACH_SELECT: an approach/method was selected
- TARGET_SET: a target or threshold was decided
- SCOPE_DECISION: scope was expanded or narrowed
- ERROR_RECOVERY: an error was handled automatically
- ITERATION_DECISION: iterate/skip/adjust was decided
</yolo_decision_logging_protocol>

<output>
**FILES_UPDATED:**
- `.planning/config.json` — autonomous_mode and gates updated
- `.planning/yolo-decisions.log` — session start/end recorded

**DISPLAY**: Current mode status with all gate states

**GIT**: Optional commit: `config: {enable|disable} YOLO autonomous mode`
</output>

<error_handling>
- **config.json missing**: Create with defaults, then apply requested mode
- **config.json malformed**: Back up, recreate from defaults, apply requested mode
- **Saved gates missing on disable**: Use default gates (not all-off)
- **Decision log missing**: Create fresh log file
- **No .planning directory**: Create it: `mkdir -p .planning`
</error_handling>

<success_criteria>
- Mode toggle is atomic (no partial state)
- Gates are saved before YOLO enable and restored on disable
- Decision logging protocol is clear and machine-parseable
- Status display shows ALL gate states for transparency
- Config is valid JSON after every write
</success_criteria>
