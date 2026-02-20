---
description: Create executable phase plans with research, verification, and eval planning
argument-hint: <phase number>
---

<purpose>
Create executable phase prompts (PLAN.md files) for a roadmap phase with integrated research, verification, and eval planning. Default flow: Research (if needed) -> Plan -> Verify -> Eval Plan -> Done. Orchestrates grd-phase-researcher, grd-planner, grd-plan-checker, and grd-eval-planner agents with a revision loop (max 3 iterations). Loads research landscape context before planning.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.

@${CLAUDE_PLUGIN_ROOT}/references/ui-brand.md
</required_reading>

<process>

## 1. Initialize

Load all context in one call (include file contents to avoid redundant reads):

```bash
INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js init plan-phase "$PHASE" --include state,roadmap,requirements,context,research,verification,uat)
```

Parse JSON for: `researcher_model`, `planner_model`, `checker_model`, `research_enabled`, `plan_checker_enabled`, `commit_docs`, `phase_found`, `phase_dir`, `phase_number`, `phase_name`, `phase_slug`, `padded_phase`, `has_research`, `has_context`, `has_plans`, `plan_count`, `planning_exists`, `roadmap_exists`, `autonomous_mode`, `research_dir`, `phases_dir`, `codebase_dir`.

**File contents (from --include):** `state_content`, `roadmap_content`, `requirements_content`, `context_content`, `research_content`, `verification_content`, `uat_content`. These are null if files don't exist.

**If `planning_exists` is false:** Error — run `/grd:new-project` first.

## 1.5. Load Research Landscape Context

**Before any planning, load research context from `${research_dir}/`:**

```bash
LANDSCAPE=$(cat ${research_dir}/LANDSCAPE.md 2>/dev/null)
KNOWHOW=$(cat ${research_dir}/KNOWHOW.md 2>/dev/null)
BENCHMARKS=$(cat ${research_dir}/BENCHMARKS.md 2>/dev/null)
```

Also check for relevant deep-dive files:
```bash
ls ${research_dir}/deep-dives/*.md 2>/dev/null
```

Store as `research_landscape_context` — this will be passed to the planner agent.

## 2. Parse and Normalize Arguments

Extract from $ARGUMENTS: phase number (integer or decimal like `2.1`), flags (`--research`, `--skip-research`, `--gaps`, `--skip-verify`).

**If no phase number:** Detect next unplanned phase from roadmap.

**If `phase_found` is false:** Validate phase exists in ROADMAP.md. If valid, create the directory using `phase_slug` and `padded_phase` from init:
```bash
mkdir -p "${phases_dir}/${padded_phase}-${phase_slug}"
```

**Existing artifacts from init:** `has_research`, `has_plans`, `plan_count`.

## 3. Validate Phase

```bash
PHASE_INFO=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js roadmap get-phase "${PHASE}")
```

**If `found` is false:** Error with available phases. **If `found` is true:** Extract `phase_number`, `phase_name`, `goal` from JSON.

## 4. Load CONTEXT.md

Use `context_content` from init JSON (already loaded via `--include context`).

**CRITICAL:** Use `context_content` from INIT — pass to researcher, planner, checker, and revision agents.

If `context_content` is not null, display: `Using phase context from: ${PHASE_DIR}/*-CONTEXT.md`

## 5. Handle Research

**Skip if:** `--gaps` flag, `--skip-research` flag, or `research_enabled` is false (from init) without `--research` override.

**If `has_research` is true (from init) AND no `--research` flag:** Use existing, skip to step 6.

**If RESEARCH.md missing OR `--research` flag:**

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD ► RESEARCHING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

* Spawning researcher...
```

### Spawn grd-phase-researcher

```bash
PHASE_DESC=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js roadmap get-phase "${PHASE}" | jq -r '.section')
REQUIREMENTS=$(echo "$INIT" | jq -r '.requirements_content // empty' | grep -A100 "## Requirements" | head -50)
STATE_SNAP=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js state-snapshot)
```

Research prompt:

```markdown
PATHS:
research_dir: ${research_dir}
phases_dir: ${phases_dir}
phase_dir: ${phase_dir}
codebase_dir: ${codebase_dir}

<objective>
Research how to implement Phase {phase_number}: {phase_name}
Answer: "What do I need to know to PLAN this phase well?"
</objective>

<phase_context>
IMPORTANT: If CONTEXT.md exists below, it contains user decisions from /grd:discuss-phase.
- **Decisions** = Locked — research THESE deeply, no alternatives
- **Claude's Discretion** = Freedom areas — research options, recommend
- **Deferred Ideas** = Out of scope — ignore

{context_content}
</phase_context>

<research_landscape>
{research_landscape_context}
</research_landscape>

<additional_context>
**Phase description:** {phase_description}
**Requirements:** {requirements}
**Prior decisions:** {decisions}
</additional_context>

<output>
Write to: {phase_dir}/{phase}-RESEARCH.md
</output>
```

```
Task(
  prompt="First, read ${CLAUDE_PLUGIN_ROOT}/agents/grd-phase-researcher.md for your role and instructions.\n\n" + research_prompt,
  subagent_type="general-purpose",
  model="{researcher_model}",
  description="Research Phase {phase}"
)
```

### Handle Researcher Return

- **`## RESEARCH COMPLETE`:** Display confirmation, continue to step 6
- **`## RESEARCH BLOCKED`:** Display blocker, offer: 1) Provide context, 2) Skip research, 3) Abort

## 6. Check Existing Plans

```bash
ls "${PHASE_DIR}"/*-PLAN.md 2>/dev/null
```

**If exists:** Offer: 1) Add more plans, 2) View existing, 3) Replan from scratch.

## 7. Use Context Files from INIT

All file contents are already loaded via `--include` in step 1 (`@` syntax doesn't work across Task() boundaries):

```bash
STATE_CONTENT=$(echo "$INIT" | jq -r '.state_content // empty')
ROADMAP_CONTENT=$(echo "$INIT" | jq -r '.roadmap_content // empty')
REQUIREMENTS_CONTENT=$(echo "$INIT" | jq -r '.requirements_content // empty')
RESEARCH_CONTENT=$(echo "$INIT" | jq -r '.research_content // empty')
VERIFICATION_CONTENT=$(echo "$INIT" | jq -r '.verification_content // empty')
UAT_CONTENT=$(echo "$INIT" | jq -r '.uat_content // empty')
CONTEXT_CONTENT=$(echo "$INIT" | jq -r '.context_content // empty')
```

## 8. Spawn grd-planner Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD ► PLANNING PHASE {X}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

* Spawning planner...
```

Planner prompt:

```markdown
PATHS:
research_dir: ${research_dir}
phases_dir: ${phases_dir}
phase_dir: ${phase_dir}
codebase_dir: ${codebase_dir}

<planning_context>
**Phase:** {phase_number}
**Mode:** {standard | gap_closure}

**Project State:** {state_content}
**Roadmap:** {roadmap_content}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: If context exists below, it contains USER DECISIONS from /grd:discuss-phase.
- **Decisions** = LOCKED — honor exactly, do not revisit
- **Claude's Discretion** = Freedom — make implementation choices
- **Deferred Ideas** = Out of scope — do NOT include

{context_content}

**Research:** {research_content}

**Research Landscape:**
{research_landscape_context}

**Gap Closure (if --gaps):** {verification_content} {uat_content}
</planning_context>

<downstream_consumer>
Output consumed by /grd:execute-phase. Plans need:
- Frontmatter (wave, depends_on, files_modified, autonomous)
- Tasks in XML format
- Verification criteria
- must_haves for goal-backward verification
</downstream_consumer>

<quality_gate>
- [ ] PLAN.md files created in phase directory
- [ ] Each plan has valid frontmatter
- [ ] Tasks are specific and actionable
- [ ] Dependencies correctly identified
- [ ] Waves assigned for parallel execution
- [ ] must_haves derived from phase goal
</quality_gate>
```

```
Task(
  prompt="First, read ${CLAUDE_PLUGIN_ROOT}/agents/grd-planner.md for your role and instructions.\n\n" + filled_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Plan Phase {phase}"
)
```

## 9. Handle Planner Return

- **`## PLANNING COMPLETE`:** Display plan count. If `--skip-verify` or `plan_checker_enabled` is false (from init): skip to step 13. Otherwise: step 10.
- **`## CHECKPOINT REACHED`:** Present to user, get response, spawn continuation (step 12)
- **`## PLANNING INCONCLUSIVE`:** Show attempts, offer: Add context / Retry / Manual

## 10. Spawn grd-plan-checker Agent

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD ► VERIFYING PLANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

* Spawning plan checker...
```

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

Checker prompt:

```markdown
<verification_context>
**Phase:** {phase_number}
**Phase Goal:** {goal from ROADMAP}

**Plans to verify:** {plans_content}
**Requirements:** {requirements_content}

**Phase Context:**
IMPORTANT: Plans MUST honor user decisions. Flag as issue if plans contradict.
- **Decisions** = LOCKED — plans must implement exactly
- **Claude's Discretion** = Freedom areas — plans can choose approach
- **Deferred Ideas** = Out of scope — plans must NOT include

{context_content}
</verification_context>

<expected_output>
- ## VERIFICATION PASSED — all checks pass
- ## ISSUES FOUND — structured issue list
</expected_output>
```

```
Task(
  prompt=checker_prompt,
  subagent_type="grd:grd-plan-checker",
  model="{checker_model}",
  description="Verify Phase {phase} plans"
)
```

## 11. Handle Checker Return

- **`## VERIFICATION PASSED`:** Display confirmation, proceed to step 13.
- **`## ISSUES FOUND`:** Display issues, check iteration count, proceed to step 12.

## 12. Revision Loop (Max 3 Iterations)

Track `iteration_count` (starts at 1 after initial plan + check).

**If iteration_count < 3:**

Display: `Sending back to planner for revision... (iteration {N}/3)`

```bash
PLANS_CONTENT=$(cat "${PHASE_DIR}"/*-PLAN.md 2>/dev/null)
```

Revision prompt:

```markdown
<revision_context>
**Phase:** {phase_number}
**Mode:** revision

**Existing plans:** {plans_content}
**Checker issues:** {structured_issues_from_checker}

**Phase Context:**
Revisions MUST still honor user decisions.
{context_content}
</revision_context>

<instructions>
Make targeted updates to address checker issues.
Do NOT replan from scratch unless issues are fundamental.
Return what changed.
</instructions>
```

```
Task(
  prompt="First, read ${CLAUDE_PLUGIN_ROOT}/agents/grd-planner.md for your role and instructions.\n\n" + revision_prompt,
  subagent_type="general-purpose",
  model="{planner_model}",
  description="Revise Phase {phase} plans"
)
```

After planner returns -> spawn checker again (step 10), increment iteration_count.

**If iteration_count >= 3:**

Display: `Max iterations reached. {N} issues remain:` + issue list

Offer: 1) Force proceed, 2) Provide guidance and retry, 3) Abandon

## 13. Eval Planning Step

**After plan creation/verification, spawn grd-eval-planner to create EVAL.md:**

**Skip if:** `--skip-eval` flag is present.

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD ► DESIGNING EVALUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

* Spawning eval planner...
```

```
Task(
  prompt="
PATHS:
research_dir: ${research_dir}
phases_dir: ${phases_dir}
phase_dir: ${phase_dir}
codebase_dir: ${codebase_dir}

<eval_context>
**Phase:** {phase_number}: {phase_name}
**Phase Goal:** {goal from ROADMAP}
**Plans:** {plans summary}
**Benchmarks:** {BENCHMARKS content from research landscape}
**Requirements:** {requirements_content}
</eval_context>

<instructions>
Create EVAL.md with tiered verification plan:
1. Tier 1 (Sanity): Quick checks that run in seconds — type checks, lint, unit tests pass
2. Tier 2 (Proxy): Automated metrics that approximate real quality — test coverage, benchmark scores, output quality checks
3. Tier 3 (Deferred): Validations that require human/integration — user testing, real-world performance, domain expert review

For each tier:
- Define specific metrics with pass/fail thresholds
- Specify how to measure (commands, scripts, tools)
- Set targets based on BENCHMARKS.md if available

Write to: {phase_dir}/{phase}-EVAL.md
</instructions>
",
  subagent_type="grd:grd-eval-planner",
  model="{checker_model}",
  description="Design evaluation for Phase {phase}"
)
```

## 13.5. Research Gate: Verification Design Review

**Check research_gates.verification_design from config:**

```bash
VD_GATE=$(cat .planning/config.json 2>/dev/null | jq -r '.research_gates.verification_design // false')
```

**If `autonomous_mode` is true (YOLO):** Skip all gates, auto-approve.

**If verification_design gate is true:**

Use AskUserQuestion:
- header: "Eval Review"
- question: "EVAL.md created for Phase {X}. Review the verification design before proceeding?"
- options:
  - "Approve" — EVAL.md looks good, proceed
  - "Review" — Show me the EVAL.md contents
  - "Edit" — I want to adjust metrics/targets

**If "Review":** Display EVAL.md, then re-ask.
**If "Edit":** Let user provide feedback, update EVAL.md.
**If "Approve":** Continue.

**If verification_design gate is false:** Auto-approve.

## 13.7. Tracker Integration

**After plan creation, sync phase to issue tracker (non-blocking):**

Check tracker config provider first. **For GitHub:**
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker sync-phase "${PHASE}" --raw 2>/dev/null || true
```

**For mcp-atlassian** (see @${CLAUDE_PLUGIN_ROOT}/references/mcp-tracker-protocol.md):
```bash
OPS=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js tracker prepare-phase-sync "${PHASE}" --raw)
```
For each `"create"` operation, call MCP `create_issue`, then `record-mapping`.

This creates task issues for each plan in the configured tracker (GitHub Issues or MCP Atlassian). Idempotent — already-synced plans are skipped. If no tracker is configured, this is a no-op.

## 14. Present Final Status

Route to `<offer_next>`.

</process>

<offer_next>
Output this markdown directly (not as a code block):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD ► PHASE {X} PLANNED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Phase {X}: {Name}** — {N} plan(s) in {M} wave(s)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1    | 01, 02 | [objectives] |
| 2    | 03     | [objective]  |

Research: {Completed | Used existing | Skipped}
Verification: {Passed | Passed with override | Skipped}
Eval Plan: {Created | Skipped}

---

## Next Up

**Execute Phase {X}** — run all {N} plans

/grd:execute-phase {X}

<sub>/clear first -> fresh context window</sub>

---

**Also available:**
- cat ${phase_dir}/*-PLAN.md — review plans
- cat ${phase_dir}/*-EVAL.md — review eval plan
- /grd:plan-phase {X} --research — re-research first

---
</offer_next>

<success_criteria>
- [ ] .planning/ directory validated
- [ ] Phase validated against roadmap
- [ ] Phase directory created if needed
- [ ] Research landscape context loaded (LANDSCAPE.md, KNOWHOW.md, deep-dives)
- [ ] CONTEXT.md loaded early (step 4) and passed to ALL agents
- [ ] Research completed (unless --skip-research or --gaps or exists)
- [ ] grd-phase-researcher spawned with CONTEXT.md and research landscape
- [ ] Existing plans checked
- [ ] grd-planner spawned with CONTEXT.md + RESEARCH.md + research landscape
- [ ] Plans created (PLANNING COMPLETE or CHECKPOINT handled)
- [ ] grd-plan-checker spawned with CONTEXT.md
- [ ] Verification passed OR user override OR max iterations with user decision
- [ ] grd-eval-planner spawned to create EVAL.md with tiered verification
- [ ] Research gate honored (verification_design review if enabled, skipped in YOLO mode)
- [ ] GitHub issues created/updated (if gh available)
- [ ] User sees status between agent spawns
- [ ] User knows next steps
</success_criteria>
