---
description: Execute all plans in a phase using wave-based parallel execution
argument-hint: <phase number>
---

<purpose>
Execute all plans in a phase using wave-based parallel execution. Orchestrator stays lean — delegates plan execution to subagents. After execution, auto-triggers eval report if EVAL.md exists and tracks experiment parameters in commit messages.
</purpose>

<core_principle>
Orchestrator coordinates, not executes. Each subagent loads the full execute-plan context. Orchestrator: discover plans -> analyze deps -> group waves -> spawn agents -> handle checkpoints -> collect results -> trigger eval.
</core_principle>

<required_reading>
Read STATE.md before any operation to load project context.
</required_reading>

<process>

<step name="initialize" priority="first">
Load all context in one call:

```bash
INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js init execute-phase "${PHASE_ARG}")
```

Parse JSON for: `executor_model`, `verifier_model`, `reviewer_model`, `commit_docs`, `parallelization`, `branching_strategy`, `branch_name`, `base_branch`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `plans`, `incomplete_plans`, `plan_count`, `incomplete_count`, `state_exists`, `roadmap_exists`, `autonomous_mode`, `use_teams`, `code_review_enabled`, `code_review_timing`, `code_review_severity_gate`, `team_timeout_minutes`, `max_concurrent_teammates`.

**If `phase_found` is false:** Error — phase directory not found.
**If `plan_count` is 0:** Error — no plans found in phase.
**If `state_exists` is false but `.planning/` exists:** Offer reconstruct or continue.

When `parallelization` is false, plans within a wave execute sequentially.
</step>

<step name="setup_worktree" condition="branching_strategy != none">
Create an isolated worktree for this phase execution using pre-computed fields from init:

1. **Check for uncommitted changes on current branch:**
   ```bash
   DIRTY=$(git status --porcelain)
   ```
   If non-empty: warn "Uncommitted changes detected. Stash or commit before worktree creation." Stop.

2. **Create worktree:**
   ```bash
   WT_RESULT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js worktree create --phase "${PHASE_NUMBER}" --slug "${PHASE_SLUG}")
   ```
   Parse JSON result for `path` and `branch`. If `error` field present: report error and stop.
   Store: `WORKTREE_PATH` = result.path, `WORKTREE_BRANCH` = result.branch

3. **Verify worktree is ready:**
   ```bash
   ls "${WORKTREE_PATH}/.planning" && echo "Worktree ready"
   ```

All executor agents will receive `WORKTREE_PATH` and operate within it.
The main checkout remains clean on its original branch.

**When `branching_strategy` is `"none"`:** Skip this step entirely. Continue on the current directory with no worktree isolation (backwards compatible).
</step>

<step name="validate_phase">
From init JSON: `phase_dir`, `plan_count`, `incomplete_count`.

Report: "Found {plan_count} plans in {phase_dir} ({incomplete_count} incomplete)"
</step>

<step name="discover_and_group_plans">
Load plan inventory with wave grouping in one call:

```bash
PLAN_INDEX=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js phase-plan-index "${PHASE_NUMBER}")
```

Parse JSON for: `phase`, `plans[]` (each with `id`, `wave`, `autonomous`, `objective`, `files_modified`, `task_count`, `has_summary`), `waves` (map of wave number -> plan IDs), `incomplete`, `has_checkpoints`.

**Filtering:** Skip plans where `has_summary: true`. If `--gaps-only`: also skip non-gap_closure plans. If all filtered: "No matching incomplete plans" -> exit.

Report:
```
## Execution Plan

**Phase {X}: {Name}** — {total_plans} plans across {wave_count} waves

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 01-01, 01-02 | {from plan objectives, 3-8 words} |
| 2 | 01-03 | ... |
```
</step>

<step name="create_phase_team" condition="use_teams=true">
**Only when `use_teams: true` from init.**

Create an Agent Team for this phase:

```
TeamCreate(
  team_name="grd-phase-${PHASE_NUMBER}-${PHASE_SLUG}",
  description="Executing phase ${PHASE_NUMBER}: ${PHASE_NAME}"
)
```

The team lead (this orchestrator) coordinates all executor teammates and handles checkpoint mediation.
</step>

<step name="execute_waves_teams" condition="use_teams=true">
**Alternative to `execute_waves` — only when `use_teams: true`.**

Execute each wave in sequence using Agent Teams coordination.

**For each wave:**

1. **Describe what's being built (same as standard flow).**

2. **Spawn executor teammates** (up to `max_concurrent_teammates`):

   ```
   Task(
     subagent_type="grd:grd-executor",
     model="{executor_model}",
     team_name="grd-phase-${PHASE_NUMBER}-${PHASE_SLUG}",
     name="executor-${PLAN_ID}",
     prompt="
       <objective>
       Execute plan ${plan_number} of phase ${phase_number}-${phase_name}.
       Commit each task atomically. Create SUMMARY.md. Update STATE.md.
       Track experiment parameters in commit messages where applicable.
       </objective>

       <team_coordination>
       You are part of team: grd-phase-${PHASE_NUMBER}-${PHASE_SLUG}
       Team lead: orchestrator
       If you hit a checkpoint, use SendMessage to report to team lead.
       Wait for team lead's response before continuing.
       </team_coordination>

       <worktree>
       Working directory: ${WORKTREE_PATH}
       All file operations (Read, Write, Edit) and Bash commands MUST use this
       directory as the working root. Use absolute paths prefixed with this directory
       for all file operations. For Bash commands, use: cd "${WORKTREE_PATH}" && ...
       If WORKTREE_PATH is not set (branching_strategy=none), use the normal project root.
       </worktree>

       <execution_context>
       @${CLAUDE_PLUGIN_ROOT}/references/execute-plan.md
       @${CLAUDE_PLUGIN_ROOT}/templates/summary.md
       @${CLAUDE_PLUGIN_ROOT}/references/checkpoints.md
       @${CLAUDE_PLUGIN_ROOT}/references/tdd.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - Plan: ${phase_dir}/${plan_file}
       - State: .planning/STATE.md
       - Config: .planning/config.json (if exists)
       </files_to_read>

       <experiment_tracking>
       When committing tasks that involve experiment parameters (hyperparameters, model configs, dataset splits, etc.):
       - Include key parameters in commit message body
       - Format: param: value on separate lines
       </experiment_tracking>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] Experiment parameters tracked in commits
       - [ ] SUMMARY.md created in plan directory
       - [ ] STATE.md updated with position and decisions
       </success_criteria>
     "
   )
   ```

3. **Create and assign tasks:**

   For each plan in this wave:
   ```
   TaskCreate(subject="Execute plan ${PLAN_ID}", description="...")
   TaskUpdate(taskId=..., owner="executor-${PLAN_ID}")
   ```

4. **Monitor via TaskList** until all wave tasks show `completed`.

5. **Handle teammate messages:**
   - **Checkpoint messages:** Present checkpoint to user, get response, SendMessage response back to teammate
   - **Completion messages:** Verify via spot-checks (same as standard flow)
   - **Failure messages:** Report to user, ask "Retry?" or "Continue?"

6. **Spot-check results** (same as standard `execute_waves` step 4).

7. **Code review (if `code_review_timing="per_wave"` and `code_review_enabled=true`):**

   ```
   Task(
     subagent_type="grd:grd-code-reviewer",
     model="{reviewer_model}",
     team_name="grd-phase-${PHASE_NUMBER}-${PHASE_SLUG}",
     name="reviewer-wave-${WAVE}",
     prompt="
       Review wave ${WAVE} of phase ${PHASE_NUMBER}.
       Plans reviewed: ${PLAN_IDS_IN_WAVE}
       Phase directory: ${PHASE_DIR}

       Read each plan's PLAN.md and SUMMARY.md.
       Produce ${PHASE_NUMBER}-${WAVE}-REVIEW.md in ${PHASE_DIR}.
     "
   )
   ```

   **Handle review verdict:**
   - `pass`: Proceed to next wave
   - `blocker_found` and `severity_gate="blocker"` or `severity_gate="warning"`:
     Present blockers to user. Options: "Fix and re-run wave" / "Acknowledge and continue" / "Stop execution"
   - `warnings_only` and `severity_gate="warning"`:
     Present warnings to user. Same options.
   - `severity_gate="none"`: Log review, always continue.

8. **Proceed to next wave.**
</step>

<step name="execute_waves" condition="use_teams=false">
**Standard execution — when `use_teams: false` (default).**

Execute each wave in sequence. Within a wave: parallel if `PARALLELIZATION=true`, sequential if `false`.

**For each wave:**

1. **Describe what's being built (BEFORE spawning):**

   Read each plan's `<objective>`. Extract what's being built and why.

   ```
   ---
   ## Wave {N}

   **{Plan ID}: {Plan Name}**
   {2-3 sentences: what this builds, technical approach, why it matters}

   Spawning {count} agent(s)...
   ---
   ```

2. **Spawn executor agents:**

   Pass paths only — executors read files themselves with their fresh 200k context.
   This keeps orchestrator context lean (~10-15%).

   ```
   Task(
     subagent_type="grd:grd-executor",
     model="{executor_model}",
     prompt="
       <objective>
       Execute plan {plan_number} of phase {phase_number}-{phase_name}.
       Commit each task atomically. Create SUMMARY.md. Update STATE.md.
       Track experiment parameters in commit messages where applicable.
       </objective>

       <worktree>
       Working directory: ${WORKTREE_PATH}
       All file operations (Read, Write, Edit) and Bash commands MUST use this
       directory as the working root. Use absolute paths prefixed with this directory
       for all file operations. For Bash commands, use: cd "${WORKTREE_PATH}" && ...
       If WORKTREE_PATH is not set (branching_strategy=none), use the normal project root.
       </worktree>

       <execution_context>
       @${CLAUDE_PLUGIN_ROOT}/references/execute-plan.md
       @${CLAUDE_PLUGIN_ROOT}/templates/summary.md
       @${CLAUDE_PLUGIN_ROOT}/references/checkpoints.md
       @${CLAUDE_PLUGIN_ROOT}/references/tdd.md
       </execution_context>

       <files_to_read>
       Read these files at execution start using the Read tool:
       - Plan: {phase_dir}/{plan_file}
       - State: .planning/STATE.md
       - Config: .planning/config.json (if exists)
       </files_to_read>

       <experiment_tracking>
       When committing tasks that involve experiment parameters (hyperparameters, model configs, dataset splits, etc.):
       - Include key parameters in commit message body
       - Format: `param: value` on separate lines
       - Example: `feat(03-02): train baseline model\n\nlr: 0.001\nbatch_size: 32\nepochs: 50`
       </experiment_tracking>

       <success_criteria>
       - [ ] All tasks executed
       - [ ] Each task committed individually
       - [ ] Experiment parameters tracked in commits
       - [ ] SUMMARY.md created in plan directory
       - [ ] STATE.md updated with position and decisions
       </success_criteria>
     "
   )
   ```

3. **Wait for all agents in wave to complete.**

4. **Report completion — spot-check claims first:**

   For each SUMMARY.md:
   - Verify first 2 files from `key-files.created` exist on disk
   - Check `git log --oneline --all --grep="{phase}-{plan}"` returns >=1 commit
   - Check for `## Self-Check: FAILED` marker

   If ANY spot-check fails: report which plan failed, route to failure handler — ask "Retry plan?" or "Continue with remaining waves?"

   If pass:
   ```
   ---
   ## Wave {N} Complete

   **{Plan ID}: {Plan Name}**
   {What was built — from SUMMARY.md}
   {Notable deviations, if any}

   {If more waves: what this enables for next wave}
   ---
   ```

5. **Handle failures:**

   **Known Claude Code bug (classifyHandoffIfNeeded):** If an agent reports "failed" with error containing `classifyHandoffIfNeeded is not defined`, this is a Claude Code runtime bug — not a GRD or agent issue. The error fires in the completion handler AFTER all tool calls finish. In this case: run the same spot-checks as step 4 (SUMMARY.md exists, git commits present, no Self-Check: FAILED). If spot-checks PASS -> treat as **successful**. If spot-checks FAIL -> treat as real failure below.

   For real failures: report which plan failed -> ask "Continue?" or "Stop?" -> if continue, dependent plans may also fail. If stop, partial completion report.

6. **Execute checkpoint plans between waves** — see `<checkpoint_handling>`.

7. **Proceed to next wave.**
</step>

<step name="checkpoint_handling">
Plans with `autonomous: false` require user interaction.

**Flow:**

1. Spawn agent for checkpoint plan
2. Agent runs until checkpoint task or auth gate -> returns structured state
3. Agent return includes: completed tasks table, current task + blocker, checkpoint type/details, what's awaited
4. **Present to user:**
   ```
   ## Checkpoint: [Type]

   **Plan:** 03-03 Dashboard Layout
   **Progress:** 2/3 tasks complete

   [Checkpoint Details from agent return]
   [Awaiting section from agent return]
   ```
5. User responds: "approved"/"done" | issue description | decision selection
6. **Spawn continuation agent (NOT resume)** using continuation-prompt.md template
7. Continuation agent verifies previous commits, continues from resume point
8. Repeat until plan completes or user stops
</step>

<step name="aggregate_results">
After all waves:

```markdown
## Phase {X}: {Name} Execution Complete

**Waves:** {N} | **Plans:** {M}/{total} complete

| Wave | Plans | Status |
|------|-------|--------|
| 1 | plan-01, plan-02 | Complete |
| CP | plan-03 | Verified |
| 2 | plan-04 | Complete |

### Plan Details
1. **03-01**: [one-liner from SUMMARY.md]
2. **03-02**: [one-liner from SUMMARY.md]

### Issues Encountered
[Aggregate from SUMMARYs, or "None"]
```
</step>

<step name="push_and_create_pr" condition="branching_strategy != none">
Push the worktree branch and create a PR:

1. **Collect plan summaries for PR body:**
   Read each SUMMARY.md in the phase directory. Extract the one-liner from each.
   Build a PR body:
   ```
   ## Phase ${PHASE_NUMBER}: ${PHASE_NAME}

   **Milestone:** ${MILESTONE_VERSION}

   ### Plans Completed
   ${for each plan: "- **${plan_id}:** ${one_liner}"}

   ### Verification
   See ${PHASE_DIR}/${PHASE_NUMBER}-VERIFICATION.md
   ```

2. **Push branch and create PR:**
   ```bash
   PR_RESULT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js worktree push-pr \
     --phase "${PHASE_NUMBER}" \
     --title "Phase ${PHASE_NUMBER}: ${PHASE_NAME} (${MILESTONE_VERSION})" \
     --body "${PR_BODY}" \
     --base "${BASE_BRANCH}")
   ```
   Parse JSON for `pr_url`, `error`.

   If `error`: report "PR creation failed: ${error}". The branch may still have been pushed.
   Offer: "Retry PR creation?" or "Continue without PR (branch pushed)?" or "Skip PR entirely?"

   If success: report "PR created: ${pr_url}"

3. **Report PR:**
   ```
   ## PR Created

   **URL:** ${pr_url}
   **Branch:** ${WORKTREE_BRANCH} -> ${BASE_BRANCH}
   **Phase:** ${PHASE_NUMBER}: ${PHASE_NAME}
   ```
</step>

<step name="tracker_sync">
**Sync phase status to issue tracker (non-blocking):**

Check tracker config provider first. **For GitHub:**
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker sync-phase "${PHASE_NUMBER}" --raw 2>/dev/null || true
```

**For mcp-atlassian** (see @${CLAUDE_PLUGIN_ROOT}/references/mcp-tracker-protocol.md):
```bash
OPS=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker prepare-phase-sync "${PHASE_NUMBER}" --raw)
```
For each `"create"` operation, call MCP `create_issue`, then `record-mapping`.

This updates the tracker with any new plans created during execution. If no tracker is configured, this is a no-op.
</step>

<step name="code_review_per_phase" condition="code_review_timing=per_phase AND code_review_enabled=true">
**Run code review across all plans in the phase.**

Only when `code_review_timing: "per_phase"` and `code_review_enabled: true`. Skipped if `timing: "per_wave"` (already reviewed per wave) or `timing: "disabled"`.

```
Task(
  subagent_type="grd:grd-code-reviewer",
  model="{reviewer_model}",
  prompt="
    Review all plans in phase ${PHASE_NUMBER}.
    Plans: ${ALL_PLAN_IDS}
    Phase directory: ${PHASE_DIR}

    Read each plan's PLAN.md and SUMMARY.md.
    Produce ${PHASE_NUMBER}-REVIEW.md in ${PHASE_DIR}.
  "
)
```

**Handle review verdict** (same as per-wave handling):
- `pass`: Continue to eval
- `blocker_found`: Present to user, get acknowledgement before proceeding
- `warnings_only`: Present if `severity_gate="warning"`, else continue
</step>

<step name="teardown_phase_team" condition="use_teams=true">
**Only when `use_teams: true`.**

After all execution and review complete, shut down the team:

1. Send shutdown requests to all remaining teammates:
   ```
   SendMessage(type="shutdown_request", recipient="executor-{plan_id}", content="Phase execution complete")
   ```
   For each teammate still active.

2. Wait for shutdown confirmations.

3. Delete the team:
   ```
   TeamDelete()
   ```
</step>

<step name="auto_trigger_eval">
**After execution completes, check for EVAL.md:**

```bash
ls "${PHASE_DIR}"/*-EVAL.md 2>/dev/null
```

**If EVAL.md exists:**

Display:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD ► RUNNING EVALUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Read EVAL.md and run Tier 1 (sanity) and Tier 2 (proxy) checks automatically.
Record results in `{phase}-EVAL-RESULTS.md`.

**If eval results < targets:**

```
## Eval Results Below Targets

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| [metric] | [target] | [actual] | BELOW |

---

**Options:**
- /grd:iterate — re-evaluate approach and iterate
- /grd:plan-phase {X} --gaps — plan targeted fixes
- Continue to verification anyway
```

**If eval results >= targets:** Report success, continue to verification.

**If no EVAL.md:** Skip eval, proceed to verification.
</step>

<step name="verify_phase_goal">
Verify phase achieved its GOAL, not just completed tasks.

```
Task(
  prompt="Verify phase {phase_number} goal achievement.
Phase directory: {phase_dir}
Phase goal: {goal from ROADMAP.md}
Check must_haves against actual codebase. Create VERIFICATION.md.",
  subagent_type="grd:grd-verifier",
  model="{verifier_model}"
)
```

Read status:
```bash
grep "^status:" "$PHASE_DIR"/*-VERIFICATION.md | cut -d: -f2 | tr -d ' '
```

| Status | Action |
|--------|--------|
| `passed` | -> update_roadmap |
| `human_needed` | Present items for human testing, get approval or feedback |
| `gaps_found` | Present gap summary, offer `/grd:plan-phase {phase} --gaps` |

**If gaps_found:**
```
## Phase {X}: {Name} — Gaps Found

**Score:** {N}/{M} must-haves verified
**Report:** {phase_dir}/{phase}-VERIFICATION.md

### What's Missing
{Gap summaries from VERIFICATION.md}

---
## Next Up

`/grd:plan-phase {X} --gaps`
`/grd:iterate` — if eval results also below target

<sub>`/clear` first -> fresh context window</sub>

Also: `cat {phase_dir}/{phase}-VERIFICATION.md` — full report
Also: `/grd:verify-work {X}` — manual testing first
```

Gap closure cycle: `/grd:plan-phase {X} --gaps` reads VERIFICATION.md -> creates gap plans with `gap_closure: true` -> user runs `/grd:execute-phase {X} --gaps-only` -> verifier re-runs.
</step>

<step name="update_roadmap">
Mark phase complete in ROADMAP.md (date, status).

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "docs(phase-{X}): complete phase execution" --files .planning/ROADMAP.md .planning/STATE.md .planning/phases/{phase_dir}/*-VERIFICATION.md .planning/REQUIREMENTS.md
```
</step>

<step name="cleanup_worktree" condition="branching_strategy != none">
Remove the worktree after PR creation (or on any failure path):

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js worktree remove --phase "${PHASE_NUMBER}"
```

This is idempotent — if the worktree was already removed (crash, manual cleanup), it returns success with `already_gone: true`.

**IMPORTANT:** This step MUST run even if earlier steps failed. Treat it as a finally block. If the orchestrator encounters any error after worktree creation, it should still attempt cleanup before reporting the error.
</step>

<step name="offer_next">

**If more phases:**
```
## Next Up

**Phase {X+1}: {Name}** — {Goal}

`/grd:plan-phase {X+1}`

<sub>`/clear` first for fresh context</sub>
```

**If milestone complete:**
```
MILESTONE COMPLETE!

All {N} phases executed.

`/grd:complete-milestone`
```
</step>

</process>

<context_efficiency>
Orchestrator: ~10-15% context. Subagents: fresh 200k each. No polling (Task blocks). No context bleed.
</context_efficiency>

<failure_handling>
- **classifyHandoffIfNeeded false failure:** Agent reports "failed" but error is `classifyHandoffIfNeeded is not defined` -> Claude Code bug, not GRD. Spot-check (SUMMARY exists, commits present) -> if pass, treat as success
- **Agent fails mid-plan:** Missing SUMMARY.md -> report, ask user how to proceed
- **Dependency chain breaks:** Wave 1 fails -> Wave 2 dependents likely fail -> user chooses attempt or skip
- **All agents in wave fail:** Systemic issue -> stop, report for investigation
- **Checkpoint unresolvable:** "Skip this plan?" or "Abort phase execution?" -> record partial progress in STATE.md
- **Worktree cleanup on failure:** After any failure, always run worktree cleanup (`cleanup_worktree` step) before stopping. Worktree removal is idempotent and safe to call even if the worktree was never created. This prevents stale worktrees from accumulating in tmpdir.
</failure_handling>

<resumption>
Re-run `/grd:execute-phase {phase}` -> discover_plans finds completed SUMMARYs -> skips them -> resumes from first incomplete plan -> continues wave execution.

STATE.md tracks: last completed plan, current wave, pending checkpoints.

On resumption, check if a worktree already exists for this phase (via `worktree list`). If it does, reuse it instead of creating a new one. If it doesn't, create a fresh one. The `setup_worktree` step handles this: if `worktree create` returns an `error` with "already exists", parse the existing worktree path from the error response and reuse it.
</resumption>
