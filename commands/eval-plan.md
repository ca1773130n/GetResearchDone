---
description: Design evaluation plan for a phase — metrics, datasets, baselines, targets with tiered verification levels
argument-hint: <phase number or name>
---

<purpose>
Design a tiered evaluation plan for a research/development phase. Creates EVAL.md in the
phase directory with three verification tiers: sanity checks (fast, run always), proxy
metrics (medium cost, run per iteration), and deferred evaluations (expensive, run at
milestones). Includes metric definitions, target thresholds, baseline references, and
dataset specifications.
</purpose>

<context>
CLAUDE.md rules: @CLAUDE.md

**Project structure** (paths resolved via init):
- `${phase_dir}/` — phase directory
- `${phase_dir}/EVAL.md` — evaluation plan (output of this workflow)
- `${phase_dir}/PLAN.md` — phase execution plan
- `.planning/BASELINE.md` — current performance baseline
- `.planning/ROADMAP.md` — project roadmap with phase listing
- `${research_dir}/LANDSCAPE.md` — benchmark references
- `${research_dir}/deep-dives/` — paper-reported metrics
- `.planning/config.json` — GRD configuration (research_gates)

**Agent available:**
- `grd-eval-planner` — specialized evaluation design agent

**Research gate:**
- `research_gates.verification_design` — if true, pause for human review of eval plan before finalizing
</context>

<process>

## Step 0: INITIALIZE — Identify Phase and Load Context

0. **Run initialization**:
   ```bash
   INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js init eval-plan "$PHASE")
   ```
   Parse JSON for: `research_dir`, `phases_dir`, `phase_dir` (resolve from phases_dir + phase number), `landscape_exists`, `baseline_exists`, `autonomous_mode`, `research_gates`.

1. **Parse arguments**: Extract phase identifier from `$ARGUMENTS`
   - If phase number (e.g., "3"): resolve to `${phases_dir}/{N}-{name}/`
   - If phase name: match against ROADMAP.md
   - If empty: detect current active phase from ROADMAP.md (status: in-progress)
   - If no active phase: ASK user which phase to design evaluation for

2. **Validate phase exists**:
   ```bash
   ls ${phase_dir}/
   ```
   - If directory missing: STOP, suggest `/grd:plan-phase` first

3. **Load context**:
   - Read phase PLAN.md (goals, tasks, success criteria)
   - Read BASELINE.md (current metrics if available)
   - Read LANDSCAPE.md (benchmark references and SOTA numbers)
   - Read relevant deep-dives (reported metrics from papers)
   - Check for existing EVAL.md (updating vs creating)

4. **Read config**:
   - Load `research_gates.verification_design` — controls human review gate

**STEP_0_CHECKPOINT:**
- [ ] Phase identified and directory exists
- [ ] PLAN.md loaded with goals and success criteria
- [ ] Baseline loaded (or noted as unavailable)
- [ ] Benchmark references gathered
- [ ] Config loaded (research gate status known)

---

## Step 1: DISPLAY BANNER

```
╔══════════════════════════════════════════════════════════════╗
║  GRD >>> EVAL PLAN                                          ║
║                                                             ║
║  Phase: {N} — {phase_name}                                  ║
║  Goal: {phase_goal_summary}                                 ║
║  Baseline: {available | not assessed}                       ║
║  Benchmarks: {N from LANDSCAPE.md}                          ║
║  Research gate: {ON — will pause for review | OFF}          ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Step 2: SPAWN EVAL PLANNER AGENT

**Launch `grd-eval-planner` agent via Task tool:**

Use Task tool with `subagent_type="grd:grd-eval-planner"`:

```
Design tiered evaluation plan for phase: {N} — {phase_name}

PATHS:
research_dir: ${research_dir}
phases_dir: ${phases_dir}
phase_dir: ${phase_dir}

PHASE PLAN:
{PLAN.md content — goals, tasks, success criteria}

CURRENT BASELINE:
{BASELINE.md content, or "No baseline established yet"}

BENCHMARK REFERENCES:
{Relevant benchmarks from LANDSCAPE.md with SOTA numbers}

PAPER-REPORTED METRICS:
{Relevant metrics from deep-dives, or "No deep-dives available"}

DESIGN AN EVALUATION PLAN WITH THREE TIERS:

## Tier 1: SANITY CHECKS (run every commit / PR)
- Fast checks that catch obvious regressions
- Runtime target: < 60 seconds
- Examples: unit tests pass, output format valid, no crashes on sample input,
  basic metric above minimum threshold
- Define:
  - Check name, description, command to run, pass/fail criteria
  - Minimum threshold (fail-fast value)

## Tier 2: PROXY METRICS (run per iteration / daily)
- Medium-cost evaluations that approximate final quality
- Runtime target: < 30 minutes
- Examples: eval on small validation set, proxy metrics correlated with final metrics,
  A/B comparison with baseline on sample
- Define:
  - Metric name, description, evaluation command/script
  - Dataset: name, size, location, sampling strategy
  - Target threshold (where we want to be)
  - Baseline value (where we are now)
  - SOTA reference (best known result)

## Tier 3: DEFERRED EVALUATIONS (run at milestone / release)
- Expensive comprehensive evaluations
- Runtime target: hours or more (acceptable)
- Examples: full benchmark suite, human evaluation, production A/B test,
  cross-validation, ablation study
- Define:
  - Evaluation name, description, full protocol
  - Dataset: full benchmark specification
  - Target threshold, baseline, SOTA
  - Cost estimate (compute, time, human effort)
  - When to run (milestone trigger)

## For EACH metric, specify:
- Name and description
- Type: accuracy, latency, throughput, quality, cost
- Direction: higher-is-better or lower-is-better
- Baseline value (current, from BASELINE.md)
- Target value (goal for this phase)
- SOTA value (best known, from LANDSCAPE.md)
- Measurement method (exact command or script)
- Statistical requirements (confidence interval, N runs, significance test)

## Ablation plan:
- What components to ablate (toggle off individually)
- Expected impact of each ablation
- Minimum ablation set to run

OUTPUT FORMAT:
Return structured EVAL.md with clear sections for each tier,
metric definition tables, and evaluation protocol descriptions.
```

**STEP_2_CHECKPOINT:**
- [ ] Eval planner agent launched with full context
- [ ] Agent returned structured EVAL.md content
- [ ] All three tiers defined
- [ ] Metrics have baselines, targets, and measurement methods

---

## Step 3: VALIDATE EVAL PLAN

1. **Check tier completeness**:
   - Tier 1: at least 3 sanity checks defined
   - Tier 2: at least 2 proxy metrics with targets
   - Tier 3: at least 1 deferred evaluation with full protocol

2. **Check metric consistency**:
   - All targets are between baseline and SOTA (or justified if beyond)
   - Measurement methods are executable (actual commands, not pseudocode)
   - Statistical requirements are specified

3. **Check baseline references**:
   - Baseline values match BASELINE.md (if available)
   - SOTA values match LANDSCAPE.md / deep-dives

---

## Step 4: RESEARCH GATE — Human Review

**If `research_gates.verification_design` is true:**

```
╔══════════════════════════════════════════════════════════════╗
║  RESEARCH GATE: VERIFICATION DESIGN REVIEW                  ║
║                                                             ║
║  The evaluation plan is ready for review.                   ║
║  This gate pauses for human approval before finalizing.     ║
║                                                             ║
║  Please review the eval plan below and confirm:             ║
║    - Metrics are appropriate for the phase goals            ║
║    - Targets are realistic but ambitious                    ║
║    - Measurement methods are valid                          ║
║    - Tier assignments make sense                            ║
║                                                             ║
║  Options:                                                   ║
║    a) APPROVE — finalize eval plan as-is                    ║
║    b) MODIFY — specify changes                             ║
║    c) REJECT — redesign eval plan                          ║
║                                                             ║
╚══════════════════════════════════════════════════════════════╝
```

Display full EVAL.md content for review.
Wait for user response.

- If APPROVE: proceed to Step 5
- If MODIFY: apply user changes, re-validate, re-display
- If REJECT: re-run Step 2 with user feedback as additional context

**If gate is OFF or autonomous_mode is true**: Skip to Step 5.

---

## Step 5: DISPLAY EVAL PLAN SUMMARY

```
╔══════════════════════════════════════════════════════════════╗
║  EVAL PLAN SUMMARY                                          ║
╠══════════════════════════════════════════════════════════════╣
║                                                             ║
║  Phase: {N} — {phase_name}                                  ║
║                                                             ║
║  Tier 1 (Sanity):    {N} checks, < 60s runtime             ║
║  Tier 2 (Proxy):     {N} metrics, < 30min runtime          ║
║  Tier 3 (Deferred):  {N} evaluations, milestone-triggered  ║
║                                                             ║
║  Key targets:                                               ║
║    {metric_1}: {baseline} → {target} (SOTA: {sota})        ║
║    {metric_2}: {baseline} → {target} (SOTA: {sota})        ║
║                                                             ║
║  Ablation components: {N}                                   ║
║                                                             ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Step 6: WRITE EVAL.md

1. **Write evaluation plan**:
   - Path: `${phase_dir}/{N}-EVAL.md`
   - Include YAML frontmatter:
     ```yaml
     ---
     phase: {N}
     phase_name: {name}
     created: {YYYY-MM-DD}
     status: planned
     research_gate_approved: {true|false|skipped}
     ---
     ```
   - Include all three tiers with full metric definitions
   - Include ablation plan
   - Include `## Results` section (empty, populated by eval-report later)
   - Include `## History` section (empty, populated by iterate loop)

---

## Step 7: COMMIT

```bash
git add ${phase_dir}/*-EVAL.md
git commit -m "eval: design evaluation plan for phase {N} — {phase_name}"
```

---

## Step 8: ROUTE NEXT ACTION

| Condition | Suggestion |
|-----------|------------|
| Phase plan ready, eval plan ready | `/grd:execute-phase {N}` — start execution |
| Baseline not yet assessed | `/grd:assess-baseline` — establish baseline first |
| Need more research context | `/grd:deep-dive {paper}` for metric references |
| Ready for iteration | After execution, run `/grd:eval-report` |

</process>

<output>
**FILES_WRITTEN:**
- `${phase_dir}/{N}-EVAL.md` — tiered evaluation plan

**DISPLAY**: Eval plan summary with tiers, key targets, and next-step routing

**GIT**: Committed: `eval: design evaluation plan for phase {N} — {phase_name}`
</output>

<error_handling>
- **Phase directory missing**: STOP, direct to `/grd:plan-phase` first
- **No baseline available**: Proceed but mark all baseline values as "TBD — run assess-baseline"
- **No LANDSCAPE.md**: Proceed but mark SOTA values as "TBD — run survey"
- **Research gate timeout**: Save draft EVAL.md, user can resume review later
- **Targets unrealistic**: Flag with WARNING, suggest adjusting or providing justification
</error_handling>

<success_criteria>
- All three evaluation tiers defined with specific metrics
- Every metric has baseline (or TBD), target, and measurement method
- Measurement methods are executable commands (not pseudocode)
- Tier 1 checks are fast enough for CI integration
- Research gate honored when enabled
- EVAL.md is self-contained (new team member can run evaluations from it alone)
</success_criteria>
