# Discussion: We just merged two PRs (#19 phase-82 and #20 phase-86) into main and hit 3 merge conflicts in lib/discussion.ts. Both branches independently modified extractQuestion(), buildElicitationContext(), and resolveElicitation(). This keeps happening because our parallel phase execution model lets multiple phases touch the same files concurrently. What should we do? Options: (1) Implement Autopilot v2 with post-phase pipeline (simplify, PR, review, rebase+merge) so conflicts are caught early per-phase, (2) Add file-level dependency tracking between phases so overlapping phases run sequentially, (3) Add a pre-merge conflict detection step in the current autopilot before phases start, (4) Something else. Consider tradeoffs for a CLI tool codebase with 24 lib/ modules, 43 commands, 20 agents.

**Phase:** unknown  **Type:** discussion  **Participants:** claude, codex, opencode
**Synthesizer:** claude  **Rounds:** 1  **Duration:** 427283ms
**Timestamp:** 2026-03-24T03:46:24.535Z

## Round 1

### claude Response

---

### codex Response
Use a hybrid, centered on option 1.

`Autopilot v2` should become a real merge queue, because that solves the failure at the point it matters: integration with `main`. You already have most of it in [lib/autopilot.ts](/Users/neo/Developer/Projects/GetResearchDone/lib/autopilot.ts#L417) and [lib/autopilot.ts](/Users/neo/Developer/Projects/GetResearchDone/lib/autopilot.ts#L1243): execute phases in parallel, then serialize `simplify -> PR -> review -> rebase main -> merge`. That is the right backbone. The problem is that your current scheduler still decides parallelism only from roadmap dependencies, not code-surface overlap, as shown in [lib/parallel.ts](/Users/neo/Developer/Projects/GetResearchDone/lib/parallel.ts#L132). Two “independent” phases can still collide in `lib/discussion.ts`, and that’s exactly what happened around the elicitation helpers in [lib/discussion.ts](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L1022).

I would not do full option 2 by itself. File-level dependency tracking sounds clean, but for an AI-driven CLI codebase it becomes brittle fast: planned file lists drift, agents make opportunistic edits, and a strict file graph will either miss conflicts or serialize too much. With only ~24 `lib/` modules, the bigger issue is hotspot modules, not repo scale. Full file locking is too much machinery.

I would also not do option 3 by itself. Pre-merge conflict detection before phases start only tells you “these might conflict” against a snapshot that immediately goes stale once the first phase lands. It is useful as a warning, not as the primary control.

Recommended approach:
1. Make the post-phase pipeline mandatory/default in autopilot, not optional best-effort.
2. Add a lightweight touch manifest per phase at planning time: expected files or modules, plus a confidence level.
3. Use that manifest only to shape waves: if two phases both declare `lib/discussion.ts` or the same module, do not execute them concurrently.
4. Keep the serialized rebase-and-merge queue as the final gate, because semantic conflicts still exist even when files differ.
5. Add hotspot ownership guidance in planning prompts: if a phase edits a shared module, require extraction/new helper file unless the phase’s explicit goal is to modify that module.

So the answer is “option 1, plus a lighter version of option 2.” Not full file-level dependency tracking, and not pre-merge detection alone.

If you want, I can turn this into a concrete implementation plan for GRD:
- phase manifest schema
- scheduler changes
- autopilot merge-queue behavior
- tests for overlap gating and serialized integration
---

### opencode Response
Let me analyze your codebase structure and current phase execution model to give informed recommendations.
Now let me look at the current post-phase pipeline and how files are assigned to phases:
Based on my analysis, here's my recommendation for your 24-module CLI codebase:

## Tradeoff Analysis

| Option | Pros | Cons |
|--------|------|------|
| **1. Autopilot v2** | Clean history, conflicts caught per-phase | Major rewrite, changes PR-before-complete pattern |
| **2. File dependency tracking** | Prevents conflicts at source | Maintenance burden, hard to track dynamic dependencies |
| **3. Pre-merge conflict detection** | Quick to implement, minimal workflow change | Doesn't prevent, just detects early |
| **4. Phase ownership model** | Simple, leverages existing plan metadata | Requires discipline to declare files upfront |

## Recommended: Hybrid approach — **3 + 2 + 4**

For a codebase like yours, I'd recommend starting with the pragmatic combination:

### 1. **Phase file declarations** (Option 4) — minimal lift, high value
Your plans already have `files_modified` metadata. Enforce it:
- Parse `files_modified` from PLAN.md during wave building
- Detect overlap before spawning parallel phases → serialize conflicting phases

### 2. **Pre-merge conflict detection** (Option 3) — quick win
Add a pre-rebase check in `runPostPhasePipeline`:
```typescript
// Before rebase, check what main changed since branch fork
const conflictCheck = execGit(wtPath, ['merge-base', '--is-ancestor', 'main', 'HEAD']);
if (conflictCheck.exitCode !== 0) {
  // Branch is behind main — warn and optionally auto-serialize
}
```

### 3. **File ownership matrix** — the missing piece
Build a `lib/files.ts` module that tracks:
- Which lib/ modules are owned by which milestone phases
- Cross-reference during wave building to prevent parallel phases touching same modules

## Why not Option 1 (Autopilot v2)?

Your post-phase pipeline already does simplify → PR → review → rebase+merge. The gap isn't the pipeline structure — it's **wave building doesn't know what files phases touch**. Option 1 would be major surgery for marginal gain.

## Implementation path:

1. Add `lib/files.ts` with `buildFileOwnershipMatrix()` + `detectFileConflicts(phaseA, phaseB)` (~50 lines)
2. Hook into `buildWaves()` in `lib/autopilot.ts` to check conflicts before parallel spawning
3. Add `--force-parallel` flag for intentional overrides

This keeps your current workflow, adds minimal complexity, and prevents the exact conflict pattern you hit with phases 82/86.
---

## Synthesis (claude)

## Synthesis: Handling Parallel Phase Merge Conflicts

### Consensus

All backends agree on the core diagnosis: **the wave builder (`lib/parallel.ts`) lacks file-surface awareness**. It schedules phases based on roadmap dependencies alone, so "independent" phases collide on shared modules like `lib/discussion.ts`. All reject pure file-level locking (Option 2) as too rigid for an AI-driven codebase where agents make opportunistic edits.

### Disagreement

The split is on **where to invest**:

- **Codex** says Option 1 (Autopilot v2 merge queue) is the right backbone, with a lightweight touch manifest layered on top. The serialized rebase+merge queue is the final safety net because semantic conflicts exist even when files differ.
- **OpenCode** says Option 1 is over-engineering — the post-phase pipeline already does simplify/PR/review/rebase+merge, so the real gap is just wave building. Fix the scheduler, not the pipeline.

### Unique Insights

- **Codex**: Hotspot ownership guidance in planning prompts — if a phase edits a shared module, require extraction into a new helper file unless modifying that module is the explicit goal. This is a process-level fix that reduces conflicts at the source.
- **OpenCode**: A concrete `buildFileOwnershipMatrix()` utility (~50 lines) cross-referenced during wave building, plus a `--force-parallel` escape hatch for intentional overrides.

### Unified Recommendation

OpenCode is right that the pipeline structure isn't the problem — the scheduler is. Codex is right that a manifest + merge queue gives you defense in depth. Combine them:

1. **Phase file manifest** — Enforce `files_modified` declarations from PLAN.md. Already partially exists in your plan metadata. Low lift, high value.
2. **Wave builder conflict check** — In `buildWaves()`, cross-reference manifests. Phases touching the same `lib/` module go into sequential waves, not parallel. This is the fix that would have prevented the phase-82/86 collision.
3. **Serialize the merge gate** — The post-phase pipeline's rebase+merge step should already be serialized (not concurrent). Verify this is the case; if not, make it so. This catches conflicts the manifest missed.
4. **Hotspot extraction guidance** — Add to planning prompts: shared modules like `discussion.ts` should get new helper files extracted rather than edited in-place by unrelated phases.

Skip full Autopilot v2 rewrite for now. The current pipeline is structurally sound — the gap is narrow and surgical.

## Outcome

## Synthesis: Handling Parallel Phase Merge Conflicts

### Consensus

All backends agree on the core diagnosis: **the wave builder (`lib/parallel.ts`) lacks file-surface awareness**. It schedules phases based on roadmap dependencies alone, so "independent" phases collide on shared modules like `lib/discussion.ts`. All reject pure file-level locking (Option 2) as too rigid for an AI-driven codebase where agents make opportunistic edits.

### Disagreement

The split is on **where to invest**:

- **Codex** says Option 1 (Autopilot v2 merge queue) is the right backbone, with a lightweight touch manifest layered on top. The serialized rebase+merge queue is the final safety net because semantic conflicts exist even when files differ.
- **OpenCode** says Option 1 is over-engineering — the post-phase pipeline already does simplify/PR/review/rebase+merge, so the real gap is just wave building. Fix the scheduler, not the pipeline.

### Unique Insights

- **Codex**: Hotspot ownership guidance in planning prompts — if a phase edits a shared module, require extraction into a new helper file unless modifying that module is the explicit goal. This is a process-level fix that reduces conflicts at the source.
- **OpenCode**: A concrete `buildFileOwnershipMatrix()` utility (~50 lines) cross-referenced during wave building, plus a `--force-parallel` escape hatch for intentional overrides.

### Unified Recommendation

OpenCode is right that the pipeline structure isn't the problem — the scheduler is. Codex is right that a manifest + merge queue gives you defense in depth. Combine them:

1. **Phase file manifest** — Enforce `files_modified` declarations from PLAN.md. Already partially exists in your plan metadata. Low lift, high value.
2. **Wave builder conflict check** — In `buildWaves()`, cross-reference manifests. Phases touching the same `lib/` module go into sequential waves, not parallel. This is the fix that would have prevented the phase-82/86 collision.
3. **Serialize the merge gate** — The post-phase pipeline's rebase+merge step should already be serialized (not concurrent). Verify this is the case; if not, make it so. This catches conflicts the manifest missed.
4. **Hotspot extraction guidance** — Add to planning prompts: shared modules like `discussion.ts` should get new helper files extracted rather than edited in-place by unrelated phases.

Skip full Autopilot v2 rewrite for now. The current pipeline is structurally sound — the gap is narrow and surgical.
