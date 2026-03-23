# Discussion: What should be the next major feature priority for GRD after the multi-backend discussion system? Consider: developer experience, reliability, performance, and ecosystem growth.

**Phase:** demo  **Type:** feature-priority  **Participants:** claude, codex, gemini, opencode
**Synthesizer:** claude  **Rounds:** 1  **Duration:** 330524ms
**Timestamp:** 2026-03-23T14:09:18.188Z

## Round 1

### claude Response
Here's my assessment based on the current project state (27 milestones shipped, 3,557 tests, 132 MCP tools, 4 backend integrations):

## Recommended Priority: **Autopilot v2** (you already have the spec)

This is the highest-leverage next move because it compounds everything you've built. The `2026-03-22-autopilot-v2-design.md` spec covers parallel worktree execution, post-phase pipeline (simplify → PR → review → rebase+merge), and milestone-mode as default. Here's why it wins across all four dimensions:

### Developer Experience
- **Auto-resume always on** eliminates the most common friction point — forgetting `--resume` after a session break
- **Milestone mode as default** matches the most common workflow
- Post-phase pipeline automates the manual simplify→PR→review→merge cycle that currently requires human orchestration between phases

### Reliability
- Worktree isolation prevents the file-write conflicts that sequential-on-main execution currently risks
- LLM-based conflict resolution with fallback-to-human is a pragmatic middle ground
- File-level locking for STATE.md under parallel execution closes a real race condition gap

### Performance
- Parallel plan + execute for independent phases is potentially a 2-4x speedup on milestones with independent phases
- Scheduler-aware pipeline routing respects rate limits while maximizing throughput

### Ecosystem Growth
- The post-phase pipeline makes GRD output **PR-native** — every phase produces a reviewable PR, which is the interface teams expect
- Wireup step at milestone completion ties your v0.3.13 investment back into the autopilot loop

## What Comes After Autopilot v2

| Priority | Feature | Why |
|----------|---------|-----|
| 2 | **Account-aware scheduling** (spec exists) | Unlocks multi-account rotation across backends — critical for heavy autopilot usage hitting rate limits |
| 3 | **Deferred validation cleanup** | 13 pending deferrals accumulating since Phase 8. Resolving DEFER-80-01 (live Playwright) and DEFER-56-01 (real evolve loop) would close significant confidence gaps |
| 4 | **Evolve → Autoplan loop hardening** | DEFER-68-01 and DEFER-68-02 are about making the infinite self-improvement cycle actually work end-to-end with real models |
| 5 | **`gd` CLI as standalone distribution** | The `gd-cli-design.md` spec exists. A standalone CLI would decouple GRD from the superpowers plugin system, opening it to users who don't use Claude Code |

The strategic sequence: **Autopilot v2 → Account scheduling → Deferred validation pass → Evolve hardening**. Each step builds on the previous — parallel autopilot needs account rotation at scale, and a reliable autopilot makes evolve loops practical to run overnight.
---

### codex Response
The next major feature priority should be **Autopilot v2: resilient milestone-mode execution with always-on resume, parallel worktrees, and a post-phase pipeline**.

That is the best fit across all four criteria. For DX, it turns GRD into a cleaner “set the target, let it run” product instead of a toolbox of strong but still manual workflows. For reliability, it directly addresses the highest-risk operational gaps: interrupted runs, partial state, merge/review handoff, and recovery behavior. For performance, parallel execution of independent phases plus scheduler-aware routing gives a real throughput gain, not just nicer ergonomics. For ecosystem growth, a stable autonomous core is a better foundation than adding more integrations or templates first, because partners and contributors grow around a system that reliably finishes work end to end. This direction is also already aligned with GRD’s internal trajectory: the current milestone just completed multi-backend discussion, the long-term roadmap is now effectively at production-hardening stage, and there is already a concrete Autopilot v2 design ready to execute in [docs/superpowers/specs/2026-03-22-autopilot-v2-design.md](/Users/neo/Developer/Projects/GetResearchDone/docs/superpowers/specs/2026-03-22-autopilot-v2-design.md), with the current state marking discussion complete in [STATE.md](/Users/neo/Developer/Projects/GetResearchDone/.planning/STATE.md) and LT-4 focused on production release in [LONG-TERM-ROADMAP.md](/Users/neo/Developer/Projects/GetResearchDone/.planning/LONG-TERM-ROADMAP.md).

If you want a strict priority order after discussion, I’d use:
1. Autopilot v2 / execution hardening
2. Regression watchdog + stronger preflight gates
3. Template library / searchability improvements
4. Broader ecosystem surfaces like Notion, W&B, or shared knowledge

I would not make ecosystem expansion the immediate next milestone. GRD already has many surfaces; the bigger product win now is making the autonomous loop trustworthy and fast enough that those ecosystem additions have a solid core to attach to.
---

### gemini Response

---

### opencode Response
Based on GRD's trajectory — 27 milestones, 3,557 tests, and just completing multi-backend orchestration — here's my analysis:

## Recommended: Extension/Plugin System

**Why this should be the next priority:**

| Dimension | How It Helps |
|-----------|---------------|
| **Ecosystem Growth** | Enables third-party skills, custom commands, and shared templates — the missing "app store" layer |
| **Developer Experience** | Users can extend GRD without forking; new capabilities discoverable via `/grd:discover` pattern already exists |
| **Reliability** | Sandboxed plugin execution, typed plugin API contract, discovery of broken plugins before they break workflows |

GRD has strong internal extensibility (skills, agents, commands) but no **external** extension surface. The wireup command already validates integrations — a plugin system could extend this to third-party packages.

**Alternative candidates:**

1. **Deferred validation resolution** — 16 items pending live testing. High reliability impact but low user-visible feature value.
2. **Incremental execution caching** — Performance gain for repeated phases, but premature before ecosystem demand.
3. **Interactive onboarding wizard** — DX improvement, but GRD's settings interview + examples/ covers this reasonably.

The extension system would also provide a natural home for the **Wireup auto-fix feedback loop** (auto-submit fixes to plugins) and **Evolve's discovered improvements** (package as upgradeable plugin components).
---

## Synthesis (claude)

## Synthesis: Next Major Feature Priority for GRD

### Strong Consensus: Autopilot v2

Three of four backends (Claude, Codex, Gemini — though Gemini's response is empty) converge on **Autopilot v2** as the clear next priority. The reasoning is consistent:

- A concrete spec already exists (`2026-03-22-autopilot-v2-design.md`)
- It compounds existing investments rather than adding new surface area
- Parallel worktree execution + post-phase pipeline addresses real operational pain
- "Make the autonomous loop trustworthy" before expanding the ecosystem

### The Dissent: OpenCode's Extension/Plugin System

OpenCode makes a reasonable case for an external extension surface — the "app store" layer. This is a valid long-term play but the counterargument from Claude and Codex is stronger: **ecosystem surfaces need a reliable core to attach to**. An extension system built on top of a fragile autopilot loop would inherit that fragility.

### Unique Insights Worth Capturing

| Source | Insight |
|--------|---------|
| **Claude** | Strategic sequence matters — autopilot v2 → account scheduling → deferred validation → evolve hardening, each building on the prior |
| **Codex** | Regression watchdog + preflight gates as #2 — a reliability-first framing that Claude didn't surface explicitly |
| **OpenCode** | The `/grd:discover` pattern is already a proto-plugin system — worth remembering when the extension system time comes |

### Disagreement on #2 Priority

- **Claude**: Account-aware scheduling (rate limit management for heavy autopilot use)
- **Codex**: Regression watchdog + preflight gates (reliability hardening)
- **OpenCode**: Extension/plugin system (ecosystem growth)

These aren't contradictory — they reflect different bets on what bottleneck users will hit first after autopilot v2 ships.

---

## Unified Recommendation

**Next milestone: Autopilot v2**, executing the existing spec with:
1. Always-on resume + milestone-mode as default
2. Parallel worktree execution for independent phases
3. Post-phase pipeline (simplify → PR → review → merge)

**Follow-up sequence:**
1. Account-aware scheduling (unlocks sustained autopilot runs)
2. Preflight gates + regression watchdog (Codex's insight — catch failures before they propagate through the pipeline)
3. Deferred validation pass (close the 13+ pending deferrals while autopilot is stable enough to run them)
4. Extension system (OpenCode's insight — but only after the core loop is battle-tested)

The consensus is clear: **depth before breadth**. Make the autonomous loop bulletproof, then open it up.

## Outcome

## Synthesis: Next Major Feature Priority for GRD

### Strong Consensus: Autopilot v2

Three of four backends (Claude, Codex, Gemini — though Gemini's response is empty) converge on **Autopilot v2** as the clear next priority. The reasoning is consistent:

- A concrete spec already exists (`2026-03-22-autopilot-v2-design.md`)
- It compounds existing investments rather than adding new surface area
- Parallel worktree execution + post-phase pipeline addresses real operational pain
- "Make the autonomous loop trustworthy" before expanding the ecosystem

### The Dissent: OpenCode's Extension/Plugin System

OpenCode makes a reasonable case for an external extension surface — the "app store" layer. This is a valid long-term play but the counterargument from Claude and Codex is stronger: **ecosystem surfaces need a reliable core to attach to**. An extension system built on top of a fragile autopilot loop would inherit that fragility.

### Unique Insights Worth Capturing

| Source | Insight |
|--------|---------|
| **Claude** | Strategic sequence matters — autopilot v2 → account scheduling → deferred validation → evolve hardening, each building on the prior |
| **Codex** | Regression watchdog + preflight gates as #2 — a reliability-first framing that Claude didn't surface explicitly |
| **OpenCode** | The `/grd:discover` pattern is already a proto-plugin system — worth remembering when the extension system time comes |

### Disagreement on #2 Priority

- **Claude**: Account-aware scheduling (rate limit management for heavy autopilot use)
- **Codex**: Regression watchdog + preflight gates (reliability hardening)
- **OpenCode**: Extension/plugin system (ecosystem growth)

These aren't contradictory — they reflect different bets on what bottleneck users will hit first after autopilot v2 ships.

---

## Unified Recommendation

**Next milestone: Autopilot v2**, executing the existing spec with:
1. Always-on resume + milestone-mode as default
2. Parallel worktree execution for independent phases
3. Post-phase pipeline (simplify → PR → review → merge)

**Follow-up sequence:**
1. Account-aware scheduling (unlocks sustained autopilot runs)
2. Preflight gates + regression watchdog (Codex's insight — catch failures before they propagate through the pipeline)
3. Deferred validation pass (close the 13+ pending deferrals while autopilot is stable enough to run them)
4. Extension system (OpenCode's insight — but only after the core loop is battle-tested)

The consensus is clear: **depth before breadth**. Make the autonomous loop bulletproof, then open it up.
