# Research Methodology

Comprehensive guide to GRD's R&D workflow patterns. This is the authoritative reference for how GRD approaches research-to-production development.

<paper_driven_development>

## Paper-Driven Development

GRD follows a paper-driven development methodology where research papers inform implementation decisions at every stage.

### Core Workflow

```
Survey → Deep-Dive → Feasibility → Plan → Implement → Evaluate → Iterate
  ↑                                                                  │
  └──────────────────────── (if targets not met) ────────────────────┘
```

### 1. Survey Phase (`/grd:survey`)

**Purpose:** Scan the research landscape for a topic and build LANDSCAPE.md.

**Process:**
1. Search arXiv, Google Scholar, GitHub for recent papers
2. Categorize methods by approach (e.g., CNN-based, Transformer-based, Diffusion-based)
3. Extract key metrics from papers on standard benchmarks
4. Create Method Selection Matrix with ADOPT/EVALUATE/SKIP recommendations
5. Update PAPERS.md with paper index
6. Update LANDSCAPE.md with full survey results

**Output:** LANDSCAPE.md, PAPERS.md updated

**Agent:** grd-surveyor

**When to use:**
- Project initialization (first survey)
- Before implementing a new approach
- After iteration failure (re-survey for alternatives)
- Periodically to check for new publications

### 2. Deep-Dive Phase (`/grd:deep-dive`)

**Purpose:** Detailed analysis of a specific paper's method, code, and production viability.

**Process:**
1. Read paper thoroughly — method, experiments, limitations
2. Analyze code repository (if available) — quality, dependencies, discrepancies with paper
3. Identify unacknowledged limitations
4. Assess production requirements (compute, memory, latency)
5. Create adaptation plan (what to keep, modify, replace)
6. Assign verdict: ADOPT / EVALUATE / SKIP / ADAPT

**Output:** `.planning/research/deep-dives/[paper-slug].md`

**Agent:** grd-deep-diver

**When to use:**
- Paper moves from "interesting" to "implementation candidate"
- Before starting implementation of a paper's method
- When comparing top-2 candidate approaches

### 3. Feasibility Analysis (`/grd:feasibility`)

**Purpose:** Analyze the gap between paper description and production implementation.

**Process:**
1. Check compute requirements vs available hardware
2. Check dependency compatibility with existing stack
3. Assess licensing (paper, code, model weights)
4. Estimate integration effort (days/weeks)
5. Identify blocking issues (if any)
6. Update KNOWHOW.md with production considerations

**Output:** KNOWHOW.md updated, feasibility summary in deep-dive

**Agent:** grd-feasibility-analyst

**When to use:**
- After deep-dive recommends ADOPT or ADAPT
- Before committing to an implementation approach
- When `research_gates.feasibility` is enabled

### 4. Baseline Assessment (`/grd:assess-baseline`)

**Purpose:** Quantitative snapshot of current system performance.

**Process:**
1. Run evaluation on standard datasets with current code
2. Record all metrics (primary, secondary, system)
3. Record environment details (hardware, software versions)
4. Compare against published baselines
5. Update BASELINE.md and STATE.md

**Output:** BASELINE.md created/updated

**Agent:** grd-baseline-assessor

**When to use:**
- Project initialization (initial baseline)
- Before starting any new approach
- After major code changes
- At iteration boundaries

### 5. Implementation Phase (standard `/grd:plan-phase` + `/grd:execute-phase`)

**Purpose:** Implement the chosen approach with research context.

**Process:**
1. Plan with research context (LANDSCAPE.md, deep-dive, KNOWHOW.md)
2. Execute with tiered verification (Tier 1 sanity after each task)
3. Run Tier 2 proxy evaluation after implementation complete
4. Record experiment results in phase SUMMARY.md

**Phase type:** `implement`
**Verification level:** `proxy` (Tier 1 + Tier 2)

### 6. Evaluation Phase (`/grd:eval-plan` + `/grd:eval-report`)

**Purpose:** Full quantitative evaluation of implemented approach.

**Process:**
1. Create eval plan with metrics, datasets, targets, ablations
2. Run full evaluation on all datasets
3. Run ablation studies
4. Compare against baseline and published results
5. Apply decision matrix: continue / iterate / pivot
6. Update BENCHMARKS.md and BASELINE.md

**Phase type:** `evaluate`
**Verification level:** `full` (all tiers)

### 7. Iteration Loop (`/grd:iterate`)

**Purpose:** Re-evaluate and re-plan when targets are not met.

**Process:**
1. Analyze eval results — what missed and by how much
2. Consult decision matrix from eval plan
3. If minor miss: targeted fix within same approach
4. If major miss: re-survey for alternative approaches
5. If regression: revert to previous baseline and investigate
6. Create new implementation phase with lessons learned
7. Update KNOWHOW.md with iteration learnings

**Iteration limits:**
- Default max 3 iterations per approach
- Configurable via `autonomous_mode.max_iterations`
- After max iterations: require human decision to continue or pivot

</paper_driven_development>

<tiered_verification_design>

## Tiered Verification Design

GRD uses a 4-tier verification system to balance development speed with evaluation rigor.

### Tier Assignment by Phase Type

| Phase Type | Tier 1 (Sanity) | Tier 2 (Proxy) | Tier 3 (Full) | Deferred |
|------------|-----------------|----------------|---------------|----------|
| survey     | Yes             | No             | No            | No       |
| implement  | Yes             | Yes            | No            | Optional |
| evaluate   | Yes             | Yes            | Yes           | Optional |
| integrate  | Yes             | Yes            | No            | Optional |

### Tier Design Principles

**Tier 1 — Sanity (< 1 min)**
- Purpose: "Does the code run at all?"
- Run after every code change
- Checks: compilation, output shape, no NaN, basic smoke test
- Failure means: implementation bug, not approach failure
- Action on failure: fix code, re-run

**Tier 2 — Proxy (1-5 min)**
- Purpose: "Is this in the right ballpark?"
- Run after completing plan tasks
- Checks: metrics on small dataset, no regression from baseline
- Failure means: approach may have issues OR needs tuning
- Action on failure: check implementation, possibly iterate

**Tier 3 — Full (5-60 min)**
- Purpose: "Does this meet our targets?"
- Run at phase completion, milestone boundaries
- Checks: full metrics on all datasets, ablations, comparison to published results
- Failure means: approach does not meet targets
- Action on failure: apply decision matrix (iterate/pivot)

**Deferred**
- Purpose: "We cannot verify this now"
- Used when: dataset unavailable, hardware insufficient, external dependency missing
- Tracked in: STATE.md `Pending Validations`
- Resolved at: later phase or milestone boundary

### Verification in Plans

Plans should include verification tier in their structure:

```xml
<task type="auto">
  <name>Implement attention module</name>
  <files>src/models/attention.py</files>
  <action>Create multi-head attention with relative position encoding</action>
  <verify>Tier 1: model loads, forward pass produces correct shape</verify>
  <done>Attention module passes sanity check</done>
</task>
```

### Deferred Validation Protocol

When deferring verification:
1. Record in STATE.md with reason and target resolution phase
2. Create a reminder task in the resolution phase
3. Include deferred items in phase verification checklist
4. Resolve all deferred validations before milestone completion

</tiered_verification_design>

<experiment_tracking>

## Experiment Tracking

GRD tracks experiments through planning artifacts rather than external tools.

### Experiment Identity

Each experiment is identified by:
- Phase number + plan number (e.g., `03-01`)
- Approach description (from plan objective)
- Baseline it compares against (from BASELINE.md)

### What to Track

**Per experiment (in phase SUMMARY.md):**
```markdown
## Experiment Results

| Metric | Baseline | Result | Delta | Target | Status |
|--------|----------|--------|-------|--------|--------|
| PSNR   | 28.5 dB  | 30.2 dB| +1.7  | 30.0   | MET    |
| SSIM   | 0.850    | 0.883  | +0.033| 0.900  | NOT MET|

**Approach:** SwinIR with L1 + VGG perceptual loss
**Training:** 100k iterations, batch 8, lr 2e-4
**Key change from baseline:** Added perceptual loss, increased network depth
```

**Accumulated results (in BENCHMARKS.md):**
```markdown
## Result History

| Date | Phase | Method | PSNR | SSIM | Delta vs Baseline | Notes |
|------|-------|--------|------|------|-------------------|-------|
| 2025-01-15 | 02 | EDSR baseline | 28.5 | 0.850 | - | Initial |
| 2025-01-20 | 03 | SwinIR + L1 | 29.8 | 0.871 | +1.3/+0.021 | Better |
| 2025-01-25 | 04 | SwinIR + L1+VGG | 30.2 | 0.883 | +1.7/+0.033 | Current |
```

### Iteration History (in STATE.md)

```markdown
## Iteration History

| Iteration | Trigger | Action | Result | Date |
|-----------|---------|--------|--------|------|
| 1 | Initial approach | Implement EDSR | PSNR 28.5 (below 30.0 target) | 2025-01-15 |
| 2 | PSNR below target | Switch to SwinIR | PSNR 29.8 (closer) | 2025-01-20 |
| 3 | SSIM below target | Add perceptual loss | SSIM 0.883 (still below 0.90) | 2025-01-25 |
```

### Reproducibility Requirements

Every experiment must record:
1. **Git commit hash** — exact code state
2. **Reproduction command** — copy-pasteable
3. **Environment details** — hardware, software versions, CUDA version
4. **Random seed** — for deterministic reproduction
5. **Training duration** — wall time and iterations
6. **Hyperparameters** — all settings, not just those that differ from default

</experiment_tracking>

<iteration_loop_protocol>

## Iteration Loop Protocol

The iteration loop is GRD's core mechanism for systematic improvement.

### Trigger Conditions

Iteration is triggered when:
1. **Primary metric not met:** Result < target - tolerance
2. **Regression detected:** Result < baseline
3. **Manual trigger:** User runs `/grd:iterate`
4. **Autonomous mode:** Auto-triggered after eval

### Decision Matrix

| Result | Action | Scope |
|--------|--------|-------|
| All targets met | Continue to next phase | N/A |
| Primary met, secondary missed | Continue with note | Document in KNOWHOW.md |
| Primary missed by < tolerance | Minor iteration | Targeted fix, same approach |
| Primary missed by > tolerance | Major iteration | Re-survey, consider alternatives |
| Below baseline (regression) | Revert + investigate | Roll back, find root cause |

### Minor Iteration (targeted fix)

```
1. Identify specific metric gap
2. Consult KNOWHOW.md for known fixes
3. Modify implementation (hyperparameters, loss function, etc.)
4. Re-run Tier 2 proxy evaluation
5. If improved: proceed to Tier 3 full evaluation
6. If not: escalate to major iteration
```

### Major Iteration (approach review)

```
1. Re-survey literature for alternatives (/grd:survey)
2. Compare current approach vs alternatives (/grd:compare-methods)
3. Deep-dive into most promising alternative (/grd:deep-dive)
4. Feasibility check (/grd:feasibility)
5. Plan new implementation phase (/grd:plan-phase)
6. Execute with evaluation (/grd:execute-phase)
```

### Iteration Budget

- Default: 3 iterations per approach before requiring human decision
- Configurable via `autonomous_mode.max_iterations`
- Each iteration should have a clear hypothesis for why it will improve
- Record hypothesis and result in KNOWHOW.md lessons learned

### Anti-Patterns

- **Blind iteration:** Changing things without understanding why they fail
- **Hyperparameter fishing:** Random search without hypothesis
- **Ignoring KNOWHOW.md:** Repeating known mistakes
- **Iteration without baseline:** No way to measure improvement
- **Scope creep:** Iteration changes too many things at once

</iteration_loop_protocol>

<autonomous_mode_guidelines>

## Autonomous Mode Guidelines

Autonomous mode (`/grd:yolo`) enables headless execution where the agent makes all decisions.

### When to Use

- Well-understood problems with clear metrics
- Iterative improvement of established approaches
- Overnight/background execution
- When human review is not time-critical

### When NOT to Use

- Novel research directions (need human judgment)
- First implementation of a new approach
- When compute budget is limited (autonomous may burn through iterations)
- When results need human qualitative assessment

### Safety Mechanisms

1. **Regression stop:** Always stop if primary metrics regress from baseline
2. **Iteration cap:** Stop after `max_iterations` (default 3)
3. **Baseline requirement:** Cannot enter autonomous mode without BASELINE.md
4. **Audit trail:** All autonomous decisions logged in STATE.md
5. **Scope limit:** Autonomous mode only affects current phase, not roadmap

### Autonomous Decision Protocol

```
For each gate/checkpoint:
  1. Check if autonomous_mode.enabled
  2. If yes: apply automatic resolution rules
     - Research gates: auto-approve, log decision
     - Eval results: apply decision matrix automatically
     - Iteration: trigger if targets not met AND iterations < max
     - Stop: if regression OR max iterations reached
  3. If no: present checkpoint to user
  4. Always: record decision in STATE.md
```

### Exit Conditions

Autonomous mode exits when:
- All targets met (success)
- `max_iterations` reached (human review needed)
- Regression detected and `stop_on_regression: true`
- Fatal error (compilation failure, OOM, etc.)
- User manually interrupts

</autonomous_mode_guidelines>

<product_owner_hierarchy>

## Product Owner Hierarchy

The grd-product-owner agent manages high-level research direction.

### Responsibility Hierarchy

```
Product Owner (strategy)
  └── Planner (tactics)
        └── Executor (implementation)
              └── Verifier (quality)
```

### Product Owner Decisions

The product owner is responsible for:
1. **Target setting:** What metrics to achieve, by when
2. **Approach selection:** Which method to pursue from LANDSCAPE.md
3. **Resource allocation:** How many iterations to allow per approach
4. **Pivot decisions:** When to abandon an approach and try alternatives
5. **Milestone definition:** What constitutes a complete research milestone

### Product Plan (`/grd:product-plan`)

Creates high-level research plan:
```markdown
## Research Phases
1. Survey: Understand SoTA landscape
2. Baseline: Establish current performance
3. Implement V1: Port SwinIR architecture
4. Evaluate V1: Full benchmark evaluation
5. Iterate: Address metric gaps
6. Implement V2: Add proposed modifications
7. Evaluate V2: Final benchmark evaluation
8. Integrate: Production optimization
```

### Interaction with Planner

- Product owner sets WHAT to achieve and constraints
- Planner decides HOW to implement it (task design, wave structure)
- If planner identifies feasibility issue, escalate to product owner
- Product owner can override planner decisions at gates

</product_owner_hierarchy>

<github_projects_integration>

## GitHub Projects Integration

When `github_integration.enabled: true`, GRD syncs workflow state with GitHub.

### Phase → Issue Mapping

Each phase creates a GitHub issue:
```
Title: [Phase 03] Implement SwinIR attention module
Labels: implementation, phase-03
Body:
  Phase goal from ROADMAP.md
  Phase type: implement
  Verification level: proxy
  Tasks: (checklist from plan)
```

### Task → Issue Checklist

Plan tasks become checklist items in the phase issue:
```markdown
- [x] Task 1: Create attention module architecture
- [x] Task 2: Implement forward pass
- [ ] Task 3: Add position encoding
- [ ] Task 4: Tier 1 sanity check
```

### Eval Results → Comment

Evaluation results posted as issue comment:
```markdown
## Eval Results (Tier 2 - Proxy)

| Metric | Baseline | Result | Delta | Target | Status |
|--------|----------|--------|-------|--------|--------|
| PSNR   | 28.5     | 30.2   | +1.7  | 30.0   | MET    |

Decision: Continue to Tier 3 evaluation
```

### PR Per Phase

When `pr_per_phase: true` and `branching_strategy: "phase"`:
- Phase branch created at execute-phase start
- PR created at phase completion
- PR body includes phase SUMMARY.md content
- Eval results posted as PR comment

### Label Mapping

| Phase Type | Label | Color |
|------------|-------|-------|
| survey | `research` | blue |
| implement | `implementation` | green |
| evaluate | `evaluation` | orange |
| integrate | `integration` | purple |

</github_projects_integration>

<phase_types>

## Phase Type Reference

### survey
- **Purpose:** Research landscape exploration
- **Verification:** Tier 1 only (LANDSCAPE.md exists with content)
- **Typical agents:** grd-surveyor, grd-deep-diver
- **Output:** LANDSCAPE.md, PAPERS.md, deep-dive documents
- **Duration:** 1-2 sessions

### implement
- **Purpose:** Code a specific approach from research
- **Verification:** Tier 1 + Tier 2 (code runs, proxy metrics reasonable)
- **Typical agents:** grd-planner, grd-executor, grd-verifier
- **Output:** Working code, Tier 2 metrics
- **Duration:** 1-5 sessions

### evaluate
- **Purpose:** Full quantitative assessment
- **Verification:** All tiers (full metrics on all datasets)
- **Typical agents:** grd-eval-planner, grd-eval-reporter, grd-baseline-assessor
- **Output:** Full eval results, ablations, updated BENCHMARKS.md
- **Duration:** 1-3 sessions

### integrate
- **Purpose:** Combine approaches, optimize for production
- **Verification:** Tier 2 (integration works, no regression)
- **Typical agents:** grd-planner, grd-executor, grd-integration-checker
- **Output:** Integrated system, production benchmarks
- **Duration:** 1-3 sessions

</phase_types>
