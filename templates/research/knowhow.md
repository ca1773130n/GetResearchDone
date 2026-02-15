# Knowhow Template

Template for `.planning/research/KNOWHOW.md` - paper-to-production gap knowledge.

**Purpose:** Document the gap between what papers describe and what production implementation requires. Captures tricks, failure modes, and practical knowledge that papers omit but practitioners know.

**Downstream consumers:**
- `grd-planner` - uses knowhow to create realistic task estimates
- `grd-executor` - references during implementation to avoid known pitfalls
- `grd-feasibility-analyst` - assesses production viability

---

## File Template

```markdown
# Implementation Knowhow

**Project:** [project name]
**Domain:** [research domain]
**Last Updated:** [YYYY-MM-DD]

## Paper vs Production Reality

### [Method/Technique Name]

**What the paper says:**
[Brief description of the paper's claimed approach]

**What actually works:**
[What practitioners do differently]

**Hidden requirements:**
- [Requirement 1: e.g., "Needs 4x more VRAM than paper suggests due to gradient accumulation"]
- [Requirement 2: e.g., "Training diverges without warmup scheduler, not mentioned in paper"]
- [Requirement 3: e.g., "Published hyperparameters only work on their specific dataset split"]

**Known failure modes:**
- [Failure 1: e.g., "Checkerboard artifacts at 4x scale - use sub-pixel convolution, not deconv"]
- [Failure 2: e.g., "Color shift on real-world images - add color consistency loss"]

**Tricks that matter:**
- [Trick 1: e.g., "Progressive training from 2x to 4x improves stability"]
- [Trick 2: e.g., "L1 loss first 100k steps, then switch to perceptual loss"]
- [Trick 3: e.g., "EMA of model weights for evaluation, not training weights"]

---

### [Method/Technique Name 2]

**What the paper says:** [description]
**What actually works:** [reality]
**Hidden requirements:** [list]
**Known failure modes:** [list]
**Tricks that matter:** [list]

---

## Cross-Cutting Production Knowledge

### Training Stability

| Issue | Symptom | Fix | Source |
|-------|---------|-----|--------|
| [issue] | [what you see] | [how to fix] | [paper/blog/experience] |
| [issue] | [what you see] | [how to fix] | [source] |

### Data Pipeline

| Issue | Symptom | Fix | Source |
|-------|---------|-----|--------|
| [issue] | [what you see] | [how to fix] | [source] |

### Inference Optimization

| Technique | Speedup | Quality Impact | When to Use |
|-----------|---------|---------------|-------------|
| [technique] | [Nx faster] | [metric delta] | [conditions] |

### Reproducibility

| Paper | Reproducibility | Notes |
|-------|-----------------|-------|
| [paper] | EASY / HARD / IMPOSSIBLE | [what makes it easy/hard] |
| [paper] | EASY / HARD / IMPOSSIBLE | [notes] |

## Common Mistakes

### Mistake 1: [Name]
**What people try:** [the naive approach]
**Why it fails:** [root cause]
**What to do instead:** [correct approach]
**Time wasted:** [typical debugging time: hours/days]

### Mistake 2: [Name]
**What people try:** [approach]
**Why it fails:** [cause]
**What to do instead:** [fix]

## Resource Requirements

### Compute

| Task | GPU Memory | GPU Type | Wall Time | Cost Estimate |
|------|-----------|----------|-----------|---------------|
| Training (full) | [GB] | [type] | [hours] | [$] |
| Training (efficient) | [GB] | [type] | [hours] | [$] |
| Inference (single) | [GB] | [type] | [ms] | - |
| Evaluation (full) | [GB] | [type] | [hours] | [$] |

### Dependencies

| Dependency | Version | Why Pinned | Gotcha |
|-----------|---------|------------|--------|
| [package] | [version] | [reason] | [known issue] |

## Lessons Learned

[Accumulated project-specific knowledge from implementation attempts]

### [Date]: [Lesson]
**Context:** [What we were trying to do]
**Discovery:** [What we learned]
**Impact:** [How this changes our approach]

---

*Knowhow for: [project]*
*Last updated: [date]*
*Contributors: [who added knowledge]*
```

---

## Guidelines

**When to create:**
- After first `/grd:deep-dive` on a method we plan to implement
- After first failed implementation attempt (iteration learning)

**When to update:**
- After every implementation attempt (success or failure)
- After `/grd:deep-dive` reveals production considerations
- When discovering tricks during execution
- At iteration boundaries

**Content quality:**
- Every entry should save future time (not just document what happened)
- Include "time wasted" estimates to justify the knowledge
- Be specific: "learning rate 1e-4" not "use small learning rate"
- Include sources where applicable (GitHub issues, blog posts, personal experience)

**Size management:**
- Focus on knowledge that transfers across iterations
- Remove entries that become obvious after implementation
- Keep resource requirements current (update after each eval)

**This is the "institutional memory" of the project.** When an iteration fails and we try a new approach, this document ensures we don't repeat mistakes.
