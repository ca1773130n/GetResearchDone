# Long-Term Roadmap Tutorial

GRD supports a **flat, ordered list** of long-term (LT) milestones for managing multi-milestone R&D projects. Each LT milestone groups one or more normal milestones from `ROADMAP.md` with full traceability. This tutorial walks through the full lifecycle: creating a roadmap, adding milestones, linking normal milestones, refining goals, and managing completed work.

## When to Use a Long-Term Roadmap

Use a long-term roadmap when your project has **multiple milestones** planned ahead. If you're working on a single milestone at a time, the default `ROADMAP.md` is sufficient.

- **Without long-term roadmap**: Standard single-milestone workflow via `ROADMAP.md`
- **With long-term roadmap**: Multi-milestone planning with CRUD operations, linking, and protection rules via `LONG-TERM-ROADMAP.md`

## The LT Milestone Model

Each LT milestone has:

| Field | Description |
|-------|-------------|
| **ID** | Auto-assigned `LT-1`, `LT-2`, etc. |
| **Name** | Short descriptive name |
| **Status** | `completed`, `active`, or `planned` |
| **Goal** | What this group of milestones achieves |
| **Normal milestones** | Linked versions from `ROADMAP.md` (e.g., `v0.1.0, v0.2.0 (planned)`) |

LT milestones are ordered by ID. Status flows naturally:

```
planned  ──>  active  ──>  completed
```

## Step 1: Create the Long-Term Roadmap

### Option A: Auto-initialize from existing milestones

If you already have milestones in `ROADMAP.md`, GRD can auto-group them:

```
/grd:long-term-roadmap init
```

This creates `LT-1` containing all existing milestones. Shipped versions are detected automatically from the `(shipped YYYY-MM-DD)` markers in `ROADMAP.md`.

### Option B: Start from scratch

```
/grd:long-term-roadmap
```

On first run (no `LONG-TERM-ROADMAP.md`), the command auto-initializes and then offers to add more milestones.

Either way, GRD generates `.planning/LONG-TERM-ROADMAP.md`:

```markdown
---
project: My Research Project
created: 2026-02-17
last_refined: 2026-02-17
---

# Long-Term Roadmap: My Research Project

## LT-1: Foundation
**Status:** completed
**Goal:** Build core pipeline with baseline accuracy
**Normal milestones:** v0.1.0, v0.1.1

## LT-2: Optimization
**Status:** active
**Goal:** Optimize model for production latency and accuracy targets
**Normal milestones:** v0.2.0 (planned)

## LT-3: Multi-Modal Support
**Status:** planned
**Goal:** Extend pipeline to handle image + text inputs
**Normal milestones:** (none yet)

## Refinement History

| Date | Action | Details |
|------|--------|---------|
| 2026-02-17 | Initial roadmap | Created 3 LT milestones |
```

## Step 2: View Current State

```
/grd:long-term-roadmap display
```

Output:

```
Long-Term Roadmap: My Research Project

[done]    LT-1: Foundation
          Build core pipeline with baseline accuracy
          Normal milestones: v0.1.0, v0.1.1

[active]  LT-2: Optimization
          Optimize model for production latency and accuracy targets
          Normal milestones: v0.2.0 (planned)

[planned] LT-3: Multi-Modal Support
          Extend pipeline to handle image + text inputs
          Normal milestones: (none yet)
```

Or get a compact list:

```
/grd:long-term-roadmap list
```

```
LT-1: Foundation [completed]
LT-2: Optimization [active]
LT-3: Multi-Modal Support [planned]
```

## Step 3: Add a New LT Milestone

```
/grd:long-term-roadmap add --name "Production Release" --goal "TypeScript migration, stable public API, full docs"
```

This appends `LT-4` to the roadmap. IDs auto-increment.

## Step 4: Link Normal Milestones

When you create a new milestone in `ROADMAP.md` (via `/grd:new-milestone`), link it to an LT milestone:

```
/grd:long-term-roadmap link --id LT-3 --version v0.3.0
```

Result: LT-3's normal milestones field becomes `v0.3.0 (planned)`.

As milestones ship, the `(planned)` annotation is automatically dropped when GRD detects the `(shipped YYYY-MM-DD)` marker in `ROADMAP.md`.

### Unlink a milestone

```
/grd:long-term-roadmap unlink --id LT-3 --version v0.3.0
```

**Protection rule:** You cannot unlink a shipped milestone. GRD checks `ROADMAP.md` for the shipped marker and refuses the operation:

```
Error: Cannot unlink v0.1.0 from LT-1: milestone is already shipped
```

## Step 5: Refine a Milestone

As you learn from research and experiments, refine upcoming milestones:

```
/grd:long-term-roadmap refine --id LT-3
```

This outputs the milestone's current context (name, status, goal, linked milestones) for discussion. After discussing refinements, apply changes:

```
/grd:long-term-roadmap update --id LT-3 --goal "Extend pipeline to handle image + text inputs with cross-modal attention"
```

You can update any field:

```
/grd:long-term-roadmap update --id LT-3 --name "Cross-Modal Pipeline"
/grd:long-term-roadmap update --id LT-2 --status completed
```

Valid statuses: `completed`, `active`, `planned`.

## Step 6: Remove an LT Milestone

```
/grd:long-term-roadmap remove --id LT-4
```

**Protection rule:** You cannot remove an LT milestone that has shipped normal milestones. GRD checks `ROADMAP.md` and refuses:

```
Error: Cannot remove LT-1: linked milestone(s) v0.1.0, v0.1.1 already shipped
```

This prevents accidentally deleting the record of completed work.

## Step 7: Track Refinement History

Every modification is logged in the Refinement History table:

```markdown
## Refinement History

| Date | Action | Details |
|------|--------|---------|
| 2026-02-17 | Initial roadmap | Created 3 LT milestones |
| 2026-02-20 | Updated LT-3 | Refined goal with cross-modal attention |
| 2026-03-01 | Linked v0.3.0 | Added to LT-3 |
| 2026-03-15 | Updated LT-2 | Status: completed |
```

Add entries manually if needed:

```
/grd:long-term-roadmap history --action "Reviewed roadmap" --details "Reprioritized LT-3 after survey results"
```

## Step 8: Validate

Check the roadmap for structural issues:

```
/grd:long-term-roadmap validate
```

Validates:
- No duplicate LT IDs
- All milestones have valid statuses (`completed`, `active`, `planned`)
- All milestones have goals
- Required frontmatter present

## Iterative Refinement: From LT Milestones to Shipped Code

The real power of the long-term roadmap is **progressive refinement** — you start with vague LT milestones and iteratively sharpen them into concrete normal milestones as you learn from research and execution. This section walks through the full cycle step by step.

### The Refinement Loop

```
┌─────────────────────────────────────────────────────┐
│                  LT Milestone (vague)                │
│                  "Add image support"                 │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │  1. Research     │  /grd:survey, /grd:deep-dive
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  2. Refine goal  │  /grd:long-term-roadmap refine
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  3. Decompose    │  /grd:new-milestone + link
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  4. Execute      │  /grd:plan-phase, /grd:execute-phase
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  5. Evaluate     │  /grd:complete-milestone
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────────────────┐
              │  LT goal met?               │
              │  YES → mark LT completed    │
              │  NO  → loop back to step 1  │
              └─────────────────────────────┘
```

Each pass through the loop produces a shipped normal milestone. You keep looping until the LT milestone's goal is satisfied.

### Full Walkthrough: Refining LT-3

Let's walk through a concrete scenario. You have this LT milestone:

```
LT-3: Multi-Modal Support [planned]
Goal: "Add image support somehow"
Normal milestones: (none yet)
```

Here's how you'd refine it into shipped code, command by command.

---

#### Step 1: Research the landscape

Before making any decisions, survey what's out there:

```
/grd:survey cross-modal attention mechanisms for image-text fusion
```

This scans arXiv, GitHub, and benchmarks, producing `.planning/research/LANDSCAPE.md` with a comparison of methods (early fusion, late fusion, cross-attention, etc.). For a specific paper that looks promising:

```
/grd:deep-dive "Flamingo: a Visual Language Model for Few-Shot Learning"
```

This creates a deep analysis at `.planning/research/deep-dives/flamingo.md` with method details, limitations, and production considerations.

You now know: cross-attention is the right approach, Flamingo's perceiver resampler is feasible, and MM-Bench is the standard evaluation.

---

#### Step 2: Refine the LT milestone goal

Use what you learned to sharpen the vague goal:

```
/grd:long-term-roadmap refine --id LT-3
```

This outputs LT-3's current state for discussion. Claude walks through what's changed and proposes refinements. After the discussion, apply the update:

```
/grd:long-term-roadmap update --id LT-3 \
  --goal "Cross-modal perceiver resampler for image+text fusion, targeting 78% on MM-Bench"
```

Optionally rename it if the scope has become clearer:

```
/grd:long-term-roadmap update --id LT-3 --name "Cross-Modal Fusion"
```

Your LT-3 now reads:

```
LT-3: Cross-Modal Fusion [active]
Goal: Cross-modal perceiver resampler for image+text fusion, targeting 78% on MM-Bench
Normal milestones: (none yet)
```

---

#### Step 3: Decompose into the first normal milestone

Now that the goal is concrete, decide what the **first** normal milestone should deliver. You don't need to plan all normal milestones upfront — just the next one.

Create the normal milestone:

```
/grd:new-milestone
```

During the interactive flow, you'll provide:
- **Version:** `v0.3.0`
- **Name:** "Image Encoder Integration"
- **Definition of Done:** Image encoder pipeline, perceiver resampler module, basic cross-attention, passes sanity checks on 100-sample subset

Then link it to the LT milestone:

```
/grd:long-term-roadmap link --id LT-3 --version v0.3.0
```

LT-3 now shows:

```
LT-3: Cross-Modal Fusion [active]
Goal: Cross-modal perceiver resampler for image+text fusion, targeting 78% on MM-Bench
Normal milestones: v0.3.0 (planned)
```

---

#### Step 4: Execute the normal milestone

Work through the normal milestone's phases using standard GRD commands:

```
/grd:discuss-phase 1      # Discuss implementation approach
/grd:plan-phase 1         # Create execution plans
/grd:execute-phase 1      # Execute with atomic commits
/grd:verify-phase 1       # Verify phase goals met
```

Repeat for each phase in the milestone. When all phases pass:

```
/grd:audit-milestone       # Cross-phase integration check
/grd:complete-milestone    # Tag, archive, update STATE.md
```

---

#### Step 5: Evaluate — is the LT goal met?

After shipping `v0.3.0`, assess where you stand against the LT-3 goal ("78% on MM-Bench"):

- You have the image encoder and perceiver resampler working
- Sanity checks pass on the 100-sample subset
- But you haven't run full MM-Bench evaluation yet, and fine-tuning is needed

**The LT goal is NOT met yet.** You need another normal milestone. Loop back to Step 1.

---

#### Step 6: Research again (second pass)

Your first milestone revealed that the perceiver resampler works but accuracy is low without fine-tuning. Research fine-tuning strategies:

```
/grd:survey visual instruction tuning for cross-modal models
```

Update the LANDSCAPE.md with new findings.

---

#### Step 7: Refine and decompose again

```
/grd:long-term-roadmap refine --id LT-3
```

The goal is still good, but you now know you need a second milestone for fine-tuning. Create it:

```
/grd:new-milestone
```

- **Version:** `v0.3.1`
- **Name:** "Visual Instruction Tuning"
- **Definition of Done:** Fine-tuned model achieves 78% on MM-Bench

Link it:

```
/grd:long-term-roadmap link --id LT-3 --version v0.3.1
```

LT-3 now shows:

```
LT-3: Cross-Modal Fusion [active]
Goal: Cross-modal perceiver resampler for image+text fusion, targeting 78% on MM-Bench
Normal milestones: v0.3.0, v0.3.1 (planned)
```

---

#### Step 8: Execute and evaluate again

Execute `v0.3.1` the same way (discuss → plan → execute → verify → audit → complete).

After shipping, run the full MM-Bench evaluation:

```
/grd:eval-report 3        # Collect evaluation results for the last phase
```

Result: 79.2% on MM-Bench. **The LT goal IS met.**

---

#### Step 9: Mark the LT milestone completed

```
/grd:long-term-roadmap update --id LT-3 --status completed
```

Final state:

```
LT-3: Cross-Modal Fusion [completed]
Goal: Cross-modal perceiver resampler for image+text fusion, targeting 78% on MM-Bench
Normal milestones: v0.3.0, v0.3.1
```

The next planned LT milestone automatically becomes the focus of your work.

---

### When to Split an LT Milestone

Sometimes during refinement you realize an LT milestone is too large or covers two distinct concerns. Signs:

- The goal has "and" connecting unrelated objectives
- Normal milestones within it don't build on each other
- Different team members would own different parts

**How to split:**

```
# Update the original to cover just the first concern
/grd:long-term-roadmap update --id LT-3 \
  --name "Image Fusion" \
  --goal "Cross-modal perceiver resampler for image+text fusion"

# Add a new LT milestone for the second concern
/grd:long-term-roadmap add \
  --name "Video Support" \
  --goal "Extend fusion pipeline to handle video frames with temporal attention"

# Move any normal milestones that belong to the new LT
/grd:long-term-roadmap unlink --id LT-3 --version v0.4.0
/grd:long-term-roadmap link --id LT-5 --version v0.4.0
```

### When to Add Unplanned Normal Milestones

Eval results sometimes reveal problems you didn't anticipate. When this happens:

```
# 1. Identify the gap from eval results
#    e.g., quantization dropped accuracy by 3%

# 2. Add a new LT milestone if needed, or reuse an existing one
/grd:long-term-roadmap add \
  --name "Accuracy Recovery" \
  --goal "Recover 3% accuracy loss from quantization via knowledge distillation"

# 3. Create and link the normal milestone
/grd:new-milestone
# Version: v0.3.2, Name: "Knowledge Distillation", DoD: Recover to 78%+ on MM-Bench

/grd:long-term-roadmap link --id LT-5 --version v0.3.2

# 4. Execute normally
/grd:plan-phase 1
/grd:execute-phase 1
# ...
```

Alternatively, if the gap fits within an existing LT milestone's goal, just add a new normal milestone there:

```
/grd:new-milestone
/grd:long-term-roadmap link --id LT-3 --version v0.3.2
```

### Summary: Commands in the Refinement Loop

| Step | What you do | Command |
|------|------------|---------|
| Research | Survey the landscape | `/grd:survey <topic>` |
| Research | Deep-dive a paper | `/grd:deep-dive <paper>` |
| Refine | Review LT milestone context | `/grd:long-term-roadmap refine --id LT-N` |
| Refine | Sharpen the goal | `/grd:long-term-roadmap update --id LT-N --goal "..."` |
| Decompose | Create a normal milestone | `/grd:new-milestone` |
| Decompose | Link to LT milestone | `/grd:long-term-roadmap link --id LT-N --version vX.Y.Z` |
| Execute | Plan and run phases | `/grd:plan-phase N`, `/grd:execute-phase N` |
| Execute | Ship the milestone | `/grd:complete-milestone` |
| Evaluate | Check if LT goal is met | `/grd:eval-report N`, `/grd:audit-milestone` |
| Complete | Mark LT milestone done | `/grd:long-term-roadmap update --id LT-N --status completed` |
| Iterate | Add more normal milestones | Loop back to Research step |

## CLI Reference

All operations via `grd-tools.js`:

```bash
# List all LT milestones
node bin/grd-tools.js long-term-roadmap list
node bin/grd-tools.js long-term-roadmap list --raw

# Display formatted roadmap
node bin/grd-tools.js long-term-roadmap display
node bin/grd-tools.js long-term-roadmap display --raw

# Add a new LT milestone
node bin/grd-tools.js long-term-roadmap add --name "Name" --goal "Goal text"

# Remove an LT milestone (protected)
node bin/grd-tools.js long-term-roadmap remove --id LT-3

# Update fields
node bin/grd-tools.js long-term-roadmap update --id LT-2 --goal "New goal"
node bin/grd-tools.js long-term-roadmap update --id LT-2 --status active
node bin/grd-tools.js long-term-roadmap update --id LT-2 --name "New Name"

# Link/unlink normal milestones
node bin/grd-tools.js long-term-roadmap link --id LT-2 --version v0.2.0
node bin/grd-tools.js long-term-roadmap unlink --id LT-2 --version v0.2.0

# Refine (outputs context for discussion)
node bin/grd-tools.js long-term-roadmap refine --id LT-3

# Auto-initialize from ROADMAP.md
node bin/grd-tools.js long-term-roadmap init --project "Project Name"

# Parse and validate
node bin/grd-tools.js long-term-roadmap parse
node bin/grd-tools.js long-term-roadmap validate

# Log refinement history
node bin/grd-tools.js long-term-roadmap history \
  --action "Refined LT-3" \
  --details "Updated goal after survey"
```

All commands output JSON by default. Pass `--raw` for plain text.

## Tips

- **Start rough, refine iteratively.** LT milestones should be vague initially. You'll sharpen them as you learn from executing earlier work.
- **Use research to drive refinement.** After `/grd:survey` or `/grd:deep-dive`, update upcoming LT milestones with what you learned.
- **Link early, link often.** Every normal milestone should be linked to an LT milestone for traceability.
- **Protection is intentional.** You can't remove or unlink shipped work. This preserves the audit trail of what was actually delivered.
- **One active LT milestone at a time** is recommended, but not enforced. Multiple active milestones are valid for parallel workstreams.
