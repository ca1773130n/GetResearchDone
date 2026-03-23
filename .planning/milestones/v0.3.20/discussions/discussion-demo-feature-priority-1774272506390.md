# Discussion: What should be the next major feature priority for GRD after the multi-backend discussion system? Consider: developer experience, reliability, performance, and ecosystem growth.

**Phase:** demo  **Type:** feature-priority  **Participants:** claude, codex, gemini, opencode
**Synthesizer:** claude  **Rounds:** 1  **Duration:** 82822ms
**Timestamp:** 2026-03-23T13:29:40.388Z

## Round 1

### claude Response
Based on the project state — 27 milestones shipped, 3,557 tests, 132 MCP tools, 4 backends, and fresh discussion + wireup systems — here's my take on the next priority, organized by your four dimensions:

## Recommended: Observability & Session Replay (v0.4.0)

**Why this first:** GRD now has sophisticated multi-agent, multi-backend workflows (autopilot, evolve, wireup, discussion). But when something goes wrong mid-autopilot or a discussion round produces a bad synthesis, there's no structured way to understand *what happened*. This is the biggest gap between "impressive demo" and "production tool I trust unattended."

**What it includes:**
- Structured event log per phase execution (agent spawns, tool calls, decisions, durations)
- Session replay: `gd replay phase 85` to see the full execution trace
- Cost/token tracking per phase, per agent, per backend
- Anomaly detection: flag phases that took 3x longer or used 5x more tokens than similar past phases
- Dashboard integration: `gd health` surfaces trends, not just current state

**Impact:** Reliability + DX. Users can debug failed autopilot runs, optimize cost, and build trust in autonomous operation.

---

## Runner-up priorities (in order):

### 2. Deferred Validation Cleanup (reliability)
You have 13 pending deferred validations, some from Phase 8. Several are "live MCP env" dependent. A focused milestone to resolve or formally retire these would reduce technical debt and prove features actually work end-to-end.

### 3. Plugin Ecosystem & Distribution (ecosystem growth)
- npm install experience improvements (first-run wizard, `gd doctor`)
- Plugin registry or "recipes" — shareable `.planning/` templates for common project types
- CLAUDE.md generation from GRD project state (so non-GRD sessions inherit context)

### 4. Performance: Intelligent Caching (performance)
- Cache research/survey results across milestones (LANDSCAPE.md reuse)
- Skip-unchanged-phase detection in autopilot
- Incremental test selection (only run tests affected by phase changes)

### 5. Real-World Evolve Hardening (reliability + ecosystem)
The evolve loop is the most ambitious feature but has multiple deferred validations (DEFER-56-01, DEFER-68-01, DEFER-68-02). Hardening it with real-world runs, better failure recovery, and human-in-the-loop checkpoints would unlock GRD's unique "self-improving project" value proposition.

---

**My strong recommendation: Observability first.** It's a force multiplier — every subsequent feature (evolve hardening, deferred validation cleanup, performance optimization) becomes easier to build and debug when you can see what's actually happening inside multi-agent workflows. It also differentiates GRD from every other AI dev tool, which treats agent execution as a black box.
---

### codex Response

---

### gemini Response
[SKIPPED: Backend "gemini" is not available]
---

### opencode Response

---

## Synthesis (claude)

## Synthesis: Next Major Feature Priority for GRD

### Backend Participation
Only **Claude** provided a substantive response. Codex and OpenCode returned empty, Gemini was skipped. This itself is a data point — the discussion system's synthesis quality depends on backend participation rates, which ties into the reliability dimension.

### Claude's Analysis — Key Themes

**Top recommendation: Observability & Session Replay** — the argument is compelling: GRD now runs complex multi-agent workflows (autopilot, evolve, wireup, discussion) but offers no structured way to inspect what happened when things go wrong. This is the gap between "demo" and "trusted tool."

**Supporting priorities** (ranked):
1. Deferred validation cleanup (13 pending, some from Phase 8)
2. Plugin ecosystem & distribution
3. Intelligent caching for performance
4. Evolve loop hardening

### Unified Recommendation

**Observability is the right call**, and here's why it stands even without multi-backend consensus:

- **Force multiplier** — every other priority (evolve hardening, deferred validation cleanup, performance) becomes easier when you can see execution traces, token costs, and timing data
- **Trust enabler** — autopilot and evolve are GRD's differentiators, but users won't run them unattended without visibility into what happened
- **Debugging gap is real** — the discussion system we just built spawns parallel agents across backends; when synthesis quality is poor (like this round with 3 empty responses), there's no structured way to diagnose why
- **Differentiator** — no other AI dev tool exposes agent execution internals; this would be unique

### Suggested Scope for v0.4.0

| Component | Impact |
|-----------|--------|
| Structured event log per phase | Reliability |
| `gd replay <phase>` command | DX |
| Token/cost tracking per agent per backend | Performance |
| `gd health` trend surfacing | DX |
| Anomaly flagging (duration/cost outliers) | Reliability |

### Secondary Priority

**Deferred validation cleanup** should run in parallel — 13 pending validations (some 70+ phases old) represent real technical debt. A focused effort to resolve or retire them would pair well with observability work, since the new tracing infrastructure would help verify the validations themselves.

### Note on This Discussion Round

The fact that 3 of 4 backends returned nothing reinforces both the observability recommendation and the need for discussion system resilience — fallback strategies when backends don't participate, retry logic, and visibility into *why* a backend produced no output.

## Outcome

## Synthesis: Next Major Feature Priority for GRD

### Backend Participation
Only **Claude** provided a substantive response. Codex and OpenCode returned empty, Gemini was skipped. This itself is a data point — the discussion system's synthesis quality depends on backend participation rates, which ties into the reliability dimension.

### Claude's Analysis — Key Themes

**Top recommendation: Observability & Session Replay** — the argument is compelling: GRD now runs complex multi-agent workflows (autopilot, evolve, wireup, discussion) but offers no structured way to inspect what happened when things go wrong. This is the gap between "demo" and "trusted tool."

**Supporting priorities** (ranked):
1. Deferred validation cleanup (13 pending, some from Phase 8)
2. Plugin ecosystem & distribution
3. Intelligent caching for performance
4. Evolve loop hardening

### Unified Recommendation

**Observability is the right call**, and here's why it stands even without multi-backend consensus:

- **Force multiplier** — every other priority (evolve hardening, deferred validation cleanup, performance) becomes easier when you can see execution traces, token costs, and timing data
- **Trust enabler** — autopilot and evolve are GRD's differentiators, but users won't run them unattended without visibility into what happened
- **Debugging gap is real** — the discussion system we just built spawns parallel agents across backends; when synthesis quality is poor (like this round with 3 empty responses), there's no structured way to diagnose why
- **Differentiator** — no other AI dev tool exposes agent execution internals; this would be unique

### Suggested Scope for v0.4.0

| Component | Impact |
|-----------|--------|
| Structured event log per phase | Reliability |
| `gd replay <phase>` command | DX |
| Token/cost tracking per agent per backend | Performance |
| `gd health` trend surfacing | DX |
| Anomaly flagging (duration/cost outliers) | Reliability |

### Secondary Priority

**Deferred validation cleanup** should run in parallel — 13 pending validations (some 70+ phases old) represent real technical debt. A focused effort to resolve or retire them would pair well with observability work, since the new tracing infrastructure would help verify the validations themselves.

### Note on This Discussion Round

The fact that 3 of 4 backends returned nothing reinforces both the observability recommendation and the need for discussion system resilience — fallback strategies when backends don't participate, retry logic, and visibility into *why* a backend produced no output.
