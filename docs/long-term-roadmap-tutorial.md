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

## Breakdown Refinement Workflow

The real power of the long-term roadmap comes from progressive refinement as your project evolves. Here's the recommended workflow:

### 1. Start rough

Create LT milestones with vague goals. That's intentional — you don't know enough yet to be specific.

```
LT-1: Foundation        → "Get basic pipeline working"
LT-2: Optimization      → "Make it fast"
LT-3: Multi-Modal       → "Add image support somehow"
```

### 2. Research drives refinement

After running `/grd:survey` or `/grd:deep-dive`, refine upcoming milestones with what you learned:

```
/grd:long-term-roadmap update --id LT-3 \
  --goal "Cross-modal attention fusion per arxiv:2401.xxxxx, targeting 85% accuracy on MM-Bench"
```

### 3. Decompose into normal milestones

When an LT milestone becomes concrete enough, break it into normal milestones and link them:

```
# Create normal milestones via /grd:new-milestone, then link:
/grd:long-term-roadmap link --id LT-2 --version v0.2.0
/grd:long-term-roadmap link --id LT-2 --version v0.2.1
```

### 4. Track completion

As normal milestones ship, mark the LT milestone as completed:

```
/grd:long-term-roadmap update --id LT-2 --status completed
```

### 5. Iterate

After eval results, you might need to adjust the roadmap:

```
# Add an unplanned milestone for iteration
/grd:long-term-roadmap add --name "Accuracy Recovery" --goal "Recover 3% accuracy loss from quantization"
/grd:long-term-roadmap link --id LT-5 --version v0.2.2
```

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
