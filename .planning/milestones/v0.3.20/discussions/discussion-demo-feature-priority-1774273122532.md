# Discussion: What should be the next major feature priority for GRD after the multi-backend discussion system? Consider: developer experience, reliability, performance, and ecosystem growth.

**Phase:** demo  **Type:** feature-priority  **Participants:** claude, codex, gemini, opencode
**Synthesizer:** claude  **Rounds:** 1  **Duration:** 94335ms
**Timestamp:** 2026-03-23T13:40:13.318Z

## Round 1

### claude Response
Here's my analysis based on the current project state (27 milestones shipped, 3,557 tests, 132 MCP tools, 4 backends):

## Recommended Priority: **Autopilot v2 — Parallel Worktree Execution + Post-Phase Pipeline**

You already have the spec (`docs/superpowers/specs/2026-03-22-autopilot-v2-design.md`), and it hits all four dimensions:

### Why this first

**Developer Experience** — The post-phase pipeline (simplify, PR, code review, merge) eliminates the most tedious manual step in the GRD workflow today. Users currently have to babysit phase transitions. Auto-resume (always-on, no `--resume` flag) means interrupted sessions just pick up where they left off.

**Performance** — Parallel worktree execution for independent phases is the single biggest throughput multiplier available. You already have `lib/worktree.ts` and `lib/parallel.ts` infrastructure from v0.2.0. The spec explicitly builds on these rather than creating new systems.

**Reliability** — The shared-state synchronization design (file-level locking for `STATE.md`, separate status marker files per phase) directly addresses the race conditions that would otherwise emerge as parallelism increases. This is foundational for anything else that scales execution.

**Ecosystem Growth** — Milestone-mode autopilot (`--milestone` as default) makes GRD dramatically more accessible to new users. "Run `grd:autopilot` and walk away" is a compelling pitch that doesn't exist yet.

### After Autopilot v2, in order

| Priority | Feature | Rationale |
|----------|---------|-----------|
| 2 | **Deferred validation sweep** | 13 pending DEFERs, several from phase 43-44 (WebMCP) and 78-80 (wireup). Clearing these before v1.0 prevents technical debt compounding. |
| 3 | **Cross-project knowledge reuse** | Listed in LT-3's goal but not yet shipped. Evolve discoveries in one project should seed another — this is the "network effect" feature for ecosystem growth. |
| 4 | **Account-aware scheduling** | Spec exists (`2026-03-15-account-aware-scheduling-design.md`). With 4 backends and parallel execution, rate limit coordination becomes critical for reliability at scale. |
| 5 | **v1.0 stabilization** | LT-4's goal: public API guarantees, backward-compat contracts, full docs, marketplace publishing. Only after the above are solid. |

### What I'd deprioritize

- More backend integrations (4 is enough for now — depth over breadth)
- New agent types (the discussion system just added multi-agent coordination; let it mature)
- UI/dashboard work (DEFER-08-01 is correctly deferred to post-v1.0)

The Autopilot v2 spec is well-scoped and builds on proven infrastructure. It's the highest-leverage next step.
---

### codex Response

---

### gemini Response

---

### opencode Response

---

## Synthesis (claude)

## Synthesis: Next Major Feature Priority for GRD

### Assessment

Only Claude provided a response — Codex, Gemini, and OpenCode returned empty, so there's no cross-backend disagreement to resolve. The single recommendation is **Autopilot v2**.

### Verification Against Project State

The recommendation checks out:

- **The spec exists** — `docs/superpowers/specs/2026-03-22-autopilot-v2-design.md` is written and detailed (parallel worktree execution, post-phase pipeline, always-on auto-resume, milestone mode)
- **The current milestone (v0.3.20) is complete** — all 4 phases (82-85) done, 3,557 tests, ready for `/grd:complete-milestone`
- **13 deferred validations are pending** — Claude correctly flagged this as priority #2
- **Infrastructure exists** — `lib/worktree.ts` and `lib/parallel.ts` are already in place

### Unified Recommendation

**Autopilot v2 is the right next priority.** Here's why it scores well on all four dimensions:

| Dimension | Impact |
|-----------|--------|
| **Developer Experience** | Post-phase pipeline (simplify → PR → review → merge) eliminates manual babysitting; milestone-mode makes "run and walk away" the default |
| **Reliability** | File-level locking for `STATE.md`, separate status markers per phase — addresses race conditions before they become real bugs |
| **Performance** | Parallel worktree execution for independent phases is the biggest throughput multiplier available today |
| **Ecosystem Growth** | `grd:autopilot` with no args defaulting to milestone mode lowers the barrier dramatically for new users |

### Suggested Sequencing (post-Autopilot v2)

| # | Feature | Rationale |
|---|---------|-----------|
| 2 | Deferred validation sweep | 13 pending DEFERs — clear before v1.0 |
| 3 | Cross-project knowledge reuse | Network effect for ecosystem growth (LT-3 goal) |
| 4 | Account-aware scheduling | Rate limit coordination across 4 backends under parallel execution |
| 5 | v1.0 stabilization | Public API guarantees, docs, marketplace |

### What to Deprioritize

- More backend integrations (4 is sufficient — depth over breadth)
- New agent types (let the discussion system mature first)
- UI/dashboard work (correctly deferred to post-v1.0)

### Gap in the Synthesis

With only 1 of 4 backends responding, this "multi-backend discussion" didn't actually produce diverse perspectives. The recommendation is sound on its merits, but it would have been valuable to hear counterarguments — e.g., whether deferred validation sweep should come *before* Autopilot v2 to reduce compounding debt, or whether cross-project knowledge reuse has higher ecosystem leverage. Worth re-running the discussion once the other backends are properly connected.

## Outcome

## Synthesis: Next Major Feature Priority for GRD

### Assessment

Only Claude provided a response — Codex, Gemini, and OpenCode returned empty, so there's no cross-backend disagreement to resolve. The single recommendation is **Autopilot v2**.

### Verification Against Project State

The recommendation checks out:

- **The spec exists** — `docs/superpowers/specs/2026-03-22-autopilot-v2-design.md` is written and detailed (parallel worktree execution, post-phase pipeline, always-on auto-resume, milestone mode)
- **The current milestone (v0.3.20) is complete** — all 4 phases (82-85) done, 3,557 tests, ready for `/grd:complete-milestone`
- **13 deferred validations are pending** — Claude correctly flagged this as priority #2
- **Infrastructure exists** — `lib/worktree.ts` and `lib/parallel.ts` are already in place

### Unified Recommendation

**Autopilot v2 is the right next priority.** Here's why it scores well on all four dimensions:

| Dimension | Impact |
|-----------|--------|
| **Developer Experience** | Post-phase pipeline (simplify → PR → review → merge) eliminates manual babysitting; milestone-mode makes "run and walk away" the default |
| **Reliability** | File-level locking for `STATE.md`, separate status markers per phase — addresses race conditions before they become real bugs |
| **Performance** | Parallel worktree execution for independent phases is the biggest throughput multiplier available today |
| **Ecosystem Growth** | `grd:autopilot` with no args defaulting to milestone mode lowers the barrier dramatically for new users |

### Suggested Sequencing (post-Autopilot v2)

| # | Feature | Rationale |
|---|---------|-----------|
| 2 | Deferred validation sweep | 13 pending DEFERs — clear before v1.0 |
| 3 | Cross-project knowledge reuse | Network effect for ecosystem growth (LT-3 goal) |
| 4 | Account-aware scheduling | Rate limit coordination across 4 backends under parallel execution |
| 5 | v1.0 stabilization | Public API guarantees, docs, marketplace |

### What to Deprioritize

- More backend integrations (4 is sufficient — depth over breadth)
- New agent types (let the discussion system mature first)
- UI/dashboard work (correctly deferred to post-v1.0)

### Gap in the Synthesis

With only 1 of 4 backends responding, this "multi-backend discussion" didn't actually produce diverse perspectives. The recommendation is sound on its merits, but it would have been valuable to hear counterarguments — e.g., whether deferred validation sweep should come *before* Autopilot v2 to reduce compounding debt, or whether cross-project knowledge reuse has higher ecosystem leverage. Worth re-running the discussion once the other backends are properly connected.
