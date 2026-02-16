# Hierarchical Roadmap Tutorial

GRD supports a **Now/Next/Later** hierarchical roadmap for managing multi-milestone R&D projects. This tutorial walks through the full lifecycle: creating a roadmap, refining rough milestones, and promoting them toward execution.

## When to Use Hierarchical Mode

Use hierarchical mode when your project has **multiple milestones** planned ahead. If you're working on a single milestone at a time, the default progressive mode (just `ROADMAP.md`) works fine.

GRD auto-detects the mode:
- **Progressive mode** (default): No `LONG-TERM-ROADMAP.md` exists. Standard single-milestone workflow.
- **Hierarchical mode**: `LONG-TERM-ROADMAP.md` exists. Multi-milestone planning with tier-based refinement.

## The Three Tiers

| Tier | Detail Level | What's Defined |
|------|-------------|----------------|
| **Now** | Full detail | Goals, success criteria, phases, `ROADMAP.md` with plans |
| **Next** | Medium detail | Goals, success criteria, rough phase sketch, open questions |
| **Later** | Rough sketch | Goals, open research questions, estimated timeline |

Milestones mature through tiers as you learn more:

```
Later  ──refine──>  Next  ──refine──>  Next (detailed)  ──promote──>  Now
```

## Step 1: Create the Long-Term Roadmap

```
/grd:long-term-roadmap
```

On first run, this launches an interactive wizard. You define 3-5 milestones with version numbers and rough goals. GRD generates `.planning/LONG-TERM-ROADMAP.md`:

```markdown
---
project: My Research Project
roadmap_type: hierarchical
created: 2026-02-16
last_refined: 2026-02-16
planning_horizon: 6 months
---

# Long-Term Roadmap: My Research Project

## Current Milestone (Now)

**Milestone:** v0.1.0 - Core Pipeline
**Status:** In Progress
**Start:** 2026-02-16
**Target:** 2026-03-15

### Goal
Build the core data processing pipeline with baseline accuracy.

### Success Criteria
- Pipeline processes 1000 samples/sec
- Baseline accuracy >= 85% on test set

---

## Next Milestones

### v0.2.0 - Model Optimization

**Status:** Next
**Estimated Start:** 2026-03-16
**Estimated Duration:** 6 weeks
**Dependencies:** v0.1.0

#### Goal
Optimize model for production latency and accuracy targets.

#### Rough Phase Sketch
1. Profile inference bottlenecks
2. Implement quantization
3. Benchmark against baselines

#### Open Questions
- Which quantization method works best for our architecture?
- What latency budget do we have?

---

## Later Milestones

### v0.3.0 - Multi-Modal Support

**Status:** Later
**Estimated Timeline:** Q3 2026
**Dependencies:** v0.2.0

#### Goal
Extend pipeline to handle image + text inputs.

#### Open Research Questions
- What fusion architecture works best for our domain?
- How much training data do we need for the multi-modal case?
```

The Now milestone maps directly to your active `ROADMAP.md`. Next and Later milestones live only in the long-term roadmap until promoted.

## Step 2: View Current State

Run the command again to see a formatted overview:

```
/grd:long-term-roadmap
```

Output:

```
Long-Term Roadmap: My Research Project
Planning Horizon: 6 months

[Now]  v0.1.0 - Core Pipeline  Status: In Progress
[Next] v0.2.0 - Model Optimization  Status: Next
[Later] v0.3.0 - Multi-Modal Support  Status: Later
```

## Step 3: Refine a Milestone

As you learn more (from research, experiments, or stakeholder feedback), refine upcoming milestones:

```
/grd:refine-milestone v0.2.0
```

This uses GRD's discussion protocol to progressively add detail. You can update:

- **Goal** — sharpen the objective
- **Success criteria** — add measurable targets
- **Rough phase sketch** — break into implementation phases
- **Open questions** — track unknowns that need resolution

Under the hood, GRD calls `long-term-roadmap refine` with your updates. The milestone's section in `LONG-TERM-ROADMAP.md` is edited in-place, preserving surrounding content.

### Example: Refining v0.2.0

Before refinement:
```markdown
#### Rough Phase Sketch
1. TBD
```

After discussing with the agent:
```markdown
#### Success Criteria
- Inference latency < 50ms at p99
- Accuracy drop < 1% from float32 baseline
- Model size < 200MB

#### Rough Phase Sketch
1. Profiling and bottleneck analysis
2. INT8 quantization with calibration
3. Knowledge distillation for accuracy recovery
4. Production benchmarking and A/B test design
```

## Step 4: Promote a Milestone

When a milestone is sufficiently refined, promote it up a tier:

```
/grd:promote-milestone v0.3.0
```

### Later -> Next Promotion

Promotes a rough idea into a plannable milestone:
- Adds `Estimated Start` and `Estimated Duration` fields (set to TBD)
- Adds `Rough Phase Sketch` section
- Converts `Open Research Questions` to `Open Questions`
- Moves the section from "Later Milestones" to "Next Milestones"

### Next -> Now Promotion

Promotes a refined milestone into the active slot:
- Replaces the current Now milestone (which should be completed or archived)
- Sets `Start` date (uses `Estimated Start` if available, otherwise today)
- Generates a full `ROADMAP.md` from the rough phase sketch
- Triggers the standard `/grd:new-milestone` flow for phase planning

## Step 5: Track Refinement History

Every refinement and promotion is logged in the Refinement History table at the bottom of `LONG-TERM-ROADMAP.md`:

```markdown
## Refinement History

| Date | Action | Details |
|------|--------|---------|
| 2026-02-16 | Initial roadmap | Defined v0.1.0, v0.2.0, v0.3.0 |
| 2026-02-20 | Refined v0.2.0 | Added success criteria and phase sketch |
| 2026-03-15 | Promoted v0.2.0 | Later -> Next |
| 2026-03-16 | Promoted v0.2.0 | Next -> Now |
```

## CLI Reference

All operations are available via `grd-tools.js` for scripting:

```bash
# Check current planning mode
node bin/grd-tools.js long-term-roadmap mode

# Parse and validate
node bin/grd-tools.js long-term-roadmap parse
node bin/grd-tools.js long-term-roadmap validate

# Display formatted roadmap
node bin/grd-tools.js long-term-roadmap display

# Check which tier a milestone is in
node bin/grd-tools.js long-term-roadmap tier --version v0.2.0

# Refine a milestone (JSON updates)
node bin/grd-tools.js long-term-roadmap refine \
  --version v0.2.0 \
  --updates '{"goal":"Optimize for production","success_criteria":["Latency < 50ms"]}'

# Promote a milestone
node bin/grd-tools.js long-term-roadmap promote --version v0.3.0

# Log a refinement action
node bin/grd-tools.js long-term-roadmap history \
  --action "Refined v0.2.0" \
  --details "Added success criteria and phase sketch"
```

All commands output JSON by default. Pass `--raw` for plain text.

## Tips

- **Start rough, refine iteratively.** Later milestones should be vague. That's the point. You'll refine them as you learn from executing earlier milestones.
- **Don't skip tiers.** A milestone should spend time in Next before being promoted to Now. This ensures adequate planning.
- **Use research to drive refinement.** After `/grd:survey` or `/grd:deep-dive`, refine upcoming milestones with what you learned.
- **One Now milestone at a time.** The Now tier maps to your active `ROADMAP.md`. Complete or archive it before promoting the next one.
- **Review the dependency graph.** The generated dependency graph at the bottom of `LONG-TERM-ROADMAP.md` helps visualize milestone ordering.
