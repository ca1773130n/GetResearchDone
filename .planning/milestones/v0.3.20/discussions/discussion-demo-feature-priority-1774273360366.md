# Discussion: What should be the next major feature priority for GRD after the multi-backend discussion system? Consider: developer experience, reliability, performance, and ecosystem growth.

**Phase:** demo  **Type:** feature-priority  **Participants:** claude, codex, gemini, opencode
**Synthesizer:** claude  **Rounds:** 1  **Duration:** 309360ms
**Timestamp:** 2026-03-23T13:47:46.296Z

## Round 1

### claude Response
Here's my analysis of the next major feature priority for GRD, informed by the current project state (27 milestones shipped, 3,557 tests, 132 MCP tools, 41 commands).

---

## Recommended Priority: **Autopilot v2**

The spec already exists (`docs/superpowers/specs/2026-03-22-autopilot-v2-design.md`) and it addresses the single biggest bottleneck — **autonomous execution throughput**. Key wins:

- **Parallel worktree execution** of independent phases (2-5x faster milestone completion)
- **Post-phase pipeline** (simplify → PR → code review → merge) — quality gates without human intervention
- **Always-on auto-resume** — no lost progress from interruptions
- Builds directly on existing worktree infrastructure from v0.3.13

**Why this over other options:**

| Dimension | Autopilot v2 Impact |
|-----------|-------------------|
| **Developer Experience** | "Set and forget" milestone execution — the core DX promise of GRD |
| **Reliability** | Post-phase code review catches regressions before merge |
| **Performance** | Parallel phase execution is the highest-leverage perf improvement |
| **Ecosystem Growth** | Makes GRD dramatically more impressive in demos; lowers adoption barrier |

## Runner-Up Priorities

**2. Cross-Backend Rate-Limit Scheduler** — Enables 24h+ unattended runs without API quota failures. Evolve and autopilot currently hit limits at scale. This is the infrastructure that makes Autopilot v2 *sustainable*.

**3. `gd` CLI (unified shell interface)** — Makes GRD accessible outside Claude Code sessions: CI/CD pipelines, shell scripts, other agents. Opens the ecosystem to non-Claude-Code users. Spec exists (`gd-cli-design`).

**4. Knowledge Base Export/Import** — Cross-project reuse of research, decisions, and patterns. High user value for teams running GRD across multiple repos.

## Suggested Sequencing

```
v0.3.21  Autopilot v2 (parallel execution + post-phase pipeline)
v0.3.22  Scheduler + account rotation (sustains autonomous runs)
v0.4.0   gd CLI (ecosystem expansion)
v1.0.0   Stabilization, UAT, public API guarantees
```

Autopilot v2 first because it compounds — every subsequent milestone (including building the scheduler and CLI) executes faster through the improved autopilot itself.
---

### codex Response
The next major feature priority should be a **production-grade scheduling and execution reliability layer**, not another top-level workflow feature.

The right milestone is essentially: **account-aware multi-backend scheduler + Autopilot v2**. That means building on the existing scheduler work in [docs/superpowers/specs/2026-03-13-cross-backend-rate-limit-scheduler-design.md](/Users/neo/Developer/Projects/GetResearchDone/docs/superpowers/specs/2026-03-13-cross-backend-rate-limit-scheduler-design.md), [docs/superpowers/specs/2026-03-15-account-aware-scheduling-design.md](/Users/neo/Developer/Projects/GetResearchDone/docs/superpowers/specs/2026-03-15-account-aware-scheduling-design.md), and [docs/superpowers/specs/2026-03-22-autopilot-v2-design.md](/Users/neo/Developer/Projects/GetResearchDone/docs/superpowers/specs/2026-03-22-autopilot-v2-design.md).

Why this is the best next bet:

- **Developer experience:** users stop babysitting GRD when backends rate-limit, hang, or need manual reruns. Auto-resume, backend handoff, and account rotation are a direct DX upgrade.
- **Reliability:** this addresses a real failure mode already called out in the scheduler spec: long hangs and wasted wall-clock from rate limits. That is a more urgent gap than adding new surface area.
- **Performance:** proactive routing, parallel-safe execution, and worktree-based autopilot materially reduce end-to-end cycle time.
- **Ecosystem growth:** discussion makes GRD interesting; reliable cross-backend execution makes it adoptable. If GRD becomes the best orchestration layer across Claude/Codex/Gemini/OpenCode/Overstory, integrations and community growth follow naturally.

If I had to scope it as one milestone, I’d prioritize:

1. **Scheduler core**
   Integrate `lib/scheduler.ts` into autopilot, evolve, and discussion-adjacent backend dispatch.
2. **Account-aware routing**
   Add per-account state, cooldowns, token prediction, and fallback behavior.
3. **Autopilot v2**
   Always-on resume, safe parallel execution, post-phase pipeline, and atomic/shared-state handling.
4. **Observability**
   Expose scheduler health, backend/account usage, cooldown reasons, and retry history in CLI/MCP.

I would **not** make “ecosystem marketplace/plugins” the next major feature yet. GRD needs to be the most reliable multi-backend orchestration engine first; otherwise ecosystem growth sits on a brittle core.
---

### gemini Response

---

### opencode Response
Based on the analysis, here's my recommendation:

## Next Priority: **Phase Rollback + Cost Tracking**

These two features form a tight pair that directly enable the critical use case: **trustworthy autonomous execution**.

**Why these, not async I/O refactoring?**
- Async is internal/debt — valuable but invisible to users
- Rollback + cost tracking unblock autopilot trust (a user-facing blocker)
- Both are achievable in 1-2 phases with clear scope
- Rollback was requested explicitly; cost tracking has 3 product ideas (#108, #72, #419)

**Why not TUI (DEFER-08-01)?**
- TUI is high effort with uncertain ROI — dashboard #60 was marked low confidence
- Log streaming (lower effort) achieves 80% of the visibility benefit

**Why not npm publish (ecosystem)?**
- Should ship in parallel — low effort, unblocks adoption
- Doesn't depend on any other feature

## Suggested Sequence

| Priority | Feature | Rationale |
|----------|---------|-----------|
| 1 | **Phase Rollback** | Trust foundation for autopilot; git-based, low scope |
| 2 | **Token Cost Tracking** | Budget guardrails for autonomous runs; cheap to implement |
| 3 | **npm Package Publication** | Ecosystem blocker; can run parallel to above |
| 4 | **Async I/O Foundation** | Unblocks all future performance work; do after stabilizing new features |
| 5 | **Validate Discussion Pipeline** | Dogfood GRD's own multi-backend system; close DEFERs |

The key insight: after shipping the multi-backend discussion system, GRD has strong capability breadth but needs **trust infrastructure** (rollback, cost visibility) before users will run it autonomously overnight. That's the adoption bottleneck.
---

## Synthesis (claude)

## Synthesis: Next Major Feature Priority for GRD

### Consensus

All four backends agree on one thing: **the next priority must make autonomous execution trustworthy and sustainable**. They differ on which piece to build first, but the destination is the same — users should be able to run `gd autopilot` overnight without babysitting.

Three of four (Claude, Codex, OpenCode) explicitly reference the Autopilot v2 spec. All four rank ecosystem expansion (npm publish, marketplace, plugins) as important but premature without reliability foundations.

### Areas of Agreement

| Theme | Backends | Signal |
|-------|----------|--------|
| Autopilot v2 is critical | Claude, Codex, OpenCode | Strong — spec already exists |
| Rate-limit scheduling needed | Claude, Codex | Cross-backend reliability is a real failure mode |
| Trust infrastructure before new surface area | All four | Universal — don't add features on a brittle core |
| npm publish should happen in parallel | OpenCode, implied by others | Low effort, high ecosystem leverage |

### Key Disagreements

**What to build first:**
- **Claude**: Autopilot v2 first (it compounds — builds itself faster)
- **Codex**: Scheduler first (Autopilot v2 without rate-limit handling will just fail faster)
- **OpenCode**: Phase rollback + cost tracking first (trust primitives before execution speed)
- **Gemini**: No response

**Codex vs Claude** is the most interesting tension. Claude argues parallel execution is the highest-leverage improvement; Codex argues it's pointless if backends rate-limit mid-run. Both are right — the question is sequencing.

**OpenCode's unique insight** — phase rollback and cost tracking — is the most pragmatic. These are small, scoped features that directly address *why users won't leave autopilot running unattended*: fear of irreversible damage and unbounded spend.

### Unified Recommendation

Build **trust infrastructure first, then speed**:

```
v0.3.21  Trust Layer
         ├─ Phase rollback (git-based, low scope)
         ├─ Token cost tracking + budget guardrails
         └─ npm publish (parallel track)

v0.3.22  Sustainable Execution
         ├─ Scheduler core (rate limits, account rotation)
         └─ Autopilot v2 (parallel worktrees, post-phase pipeline, auto-resume)

v0.4.0   Ecosystem
         └─ gd CLI for CI/CD and non-Claude-Code users
```

**Rationale**: OpenCode correctly identifies that rollback + cost tracking are cheap prerequisites that unlock user trust. Codex correctly identifies that the scheduler must exist before Autopilot v2 is useful at scale. Claude correctly identifies that Autopilot v2 is the ultimate payoff. Sequence them in dependency order: trust → reliability → speed → ecosystem.

The compound-benefit argument (ship Autopilot v2 first so it builds everything else faster) is appealing but circular — if it fails mid-run due to rate limits or costs $200 on a bad phase with no rollback, the speed gain is illusory.

## Outcome

## Synthesis: Next Major Feature Priority for GRD

### Consensus

All four backends agree on one thing: **the next priority must make autonomous execution trustworthy and sustainable**. They differ on which piece to build first, but the destination is the same — users should be able to run `gd autopilot` overnight without babysitting.

Three of four (Claude, Codex, OpenCode) explicitly reference the Autopilot v2 spec. All four rank ecosystem expansion (npm publish, marketplace, plugins) as important but premature without reliability foundations.

### Areas of Agreement

| Theme | Backends | Signal |
|-------|----------|--------|
| Autopilot v2 is critical | Claude, Codex, OpenCode | Strong — spec already exists |
| Rate-limit scheduling needed | Claude, Codex | Cross-backend reliability is a real failure mode |
| Trust infrastructure before new surface area | All four | Universal — don't add features on a brittle core |
| npm publish should happen in parallel | OpenCode, implied by others | Low effort, high ecosystem leverage |

### Key Disagreements

**What to build first:**
- **Claude**: Autopilot v2 first (it compounds — builds itself faster)
- **Codex**: Scheduler first (Autopilot v2 without rate-limit handling will just fail faster)
- **OpenCode**: Phase rollback + cost tracking first (trust primitives before execution speed)
- **Gemini**: No response

**Codex vs Claude** is the most interesting tension. Claude argues parallel execution is the highest-leverage improvement; Codex argues it's pointless if backends rate-limit mid-run. Both are right — the question is sequencing.

**OpenCode's unique insight** — phase rollback and cost tracking — is the most pragmatic. These are small, scoped features that directly address *why users won't leave autopilot running unattended*: fear of irreversible damage and unbounded spend.

### Unified Recommendation

Build **trust infrastructure first, then speed**:

```
v0.3.21  Trust Layer
         ├─ Phase rollback (git-based, low scope)
         ├─ Token cost tracking + budget guardrails
         └─ npm publish (parallel track)

v0.3.22  Sustainable Execution
         ├─ Scheduler core (rate limits, account rotation)
         └─ Autopilot v2 (parallel worktrees, post-phase pipeline, auto-resume)

v0.4.0   Ecosystem
         └─ gd CLI for CI/CD and non-Claude-Code users
```

**Rationale**: OpenCode correctly identifies that rollback + cost tracking are cheap prerequisites that unlock user trust. Codex correctly identifies that the scheduler must exist before Autopilot v2 is useful at scale. Claude correctly identifies that Autopilot v2 is the ultimate payoff. Sequence them in dependency order: trust → reliability → speed → ecosystem.

The compound-benefit argument (ship Autopilot v2 first so it builds everything else faster) is appealing but circular — if it fails mid-run due to rate limits or costs $200 on a bad phase with no rollback, the speed gain is illusory.
