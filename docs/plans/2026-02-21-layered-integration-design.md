# Layered Integration Design: Borrowing Best Features from Competing Frameworks

**Date:** 2026-02-21
**Status:** Approved
**Approach:** Layered Integration (independent layers that slot into existing GRD architecture)

## Problem Statement

GRD has a unique R&D moat (research pipeline, tiered evaluation, living memory, tracker integration, iteration loops) that no competitor matches. However, competing frameworks have innovations worth adopting:

- **Spec Kit**: Constitution/principles layer that shapes all agent behavior
- **Agent OS**: Standards discovery from existing codebases
- **BMAD**: Scale-adaptive ceremony that adjusts process weight to task complexity
- **Claude Flow**: Smart model routing by task complexity

Additionally, GRD has 45 commands with notable overlaps (3 status commands, 3 config commands) that hurt discoverability.

## Competitive Analysis Summary

| Framework | Stars | Core Strength | GRD Advantage |
|-----------|-------|---------------|---------------|
| Superpowers | 56.4k | Disciplined dev workflow, TDD, brainstorming | No R&D, no milestones, no state persistence |
| BMAD | 36.7k | Multi-agent personas, scale-adaptive, quality gates | No research, no tiered eval, no tracker |
| Agent OS | 3.9k | Standards extraction and injection | No orchestration, no execution, no eval |
| Spec Kit | 16k | Constitution, cross-artifact validation, 17+ agents | No R&D, no iteration loops, experimental |
| Claude Flow | — | 60+ agent swarm, model routing | Usability issues, over-engineered, aspirational claims |

## Design: Five Layers

### Layer 1: Constitution (PRINCIPLES.md)

**File:** `.planning/PRINCIPLES.md`

**Purpose:** Project-level principles that shape all agent behavior. Natural language guidance above configuration, below project vision.

**Content structure:**
```markdown
# Project Principles

## Coding Philosophy
- [e.g., "Prefer composition over inheritance"]
- [e.g., "No ORM — raw SQL with parameterized queries"]

## Testing Requirements
- [e.g., "Every public function must have a unit test"]
- [e.g., "Integration tests for all API endpoints"]

## Architecture Constraints
- [e.g., "No external dependencies without team approval"]
- [e.g., "All state changes go through the event bus"]

## Documentation Standards
- [e.g., "JSDoc for public APIs only, no inline comments for obvious code"]

## Communication Style
- [e.g., "Commit messages follow Conventional Commits"]
```

**Creation:** Optional step during `/grd:new-project` questioning. Also creatable standalone via `/grd:principles`.

**Propagation:** Every `grd-tools init *` call reads PRINCIPLES.md and includes it in the init JSON under `principles`. All agents receive it in their context.

**Complexity cost:** One new file, one new optional step in `new-project`, one new field in init JSON.

---

### Layer 2: Standards Discovery

**Location:** `.planning/standards/` with `index.yml` catalog

#### 2a. `/grd:discover` — Quick interactive discovery

1. User runs `/grd:discover [area]` (e.g., "api", "database", "frontend")
2. Scans 5-10 representative files in that area
3. For each pattern found: presents to user, asks "Is this a standard to enforce?"
4. Confirmed patterns written to `.planning/standards/{area}/{pattern-name}.md`
5. `standards/index.yml` updated with descriptions

**Standard file format:**
```markdown
---
area: api
tags: [response-format, error-handling]
---
# API Response Envelope

All API endpoints return: { data: T, error: null, meta: { requestId, timestamp } }
Errors use: { data: null, error: { code, message, details }, meta: { ... } }

**Why:** Consistent client-side parsing. Frontend relies on this shape.
```

#### 2b. `map-codebase --standards` — Deep extraction

New `standards` focus area for existing `map-codebase` command. Spawns parallel mapper agents for comprehensive scan. Writes to same `.planning/standards/` location.

#### 2c. Auto-injection into agent context

`grd-tools init *` scans `standards/index.yml`, matches relevant standards to current task context (using area tags + phase focus), includes in init JSON under `relevant_standards`. Agents receive only relevant standards.

**Index format:**
```yaml
api:
  response-format:
    description: API response envelope structure
    tags: [api, response, error-handling]
  authentication:
    description: JWT token validation and refresh patterns
    tags: [api, auth, security]
database:
  migrations:
    description: Migration naming and rollback conventions
    tags: [database, migrations, schema]
```

---

### Layer 3: Scale-Adaptive Ceremony

Three ceremony levels that control which agents run:

| Level | Name | When | Agents Used |
|-------|------|------|-------------|
| Light | Quick work | 1 plan, no research, small scope | planner (quick mode) + executor |
| Standard | Normal phase | 2-4 plans, some research | researcher + planner + checker + executor + verifier |
| Full | Complex R&D | 5+ plans, heavy research, experiments | All agents, all gates, review per wave, eval, verification |

#### Auto-inference logic

Computed by `grd-tools init *`:
```
Signals -> ceremony_level:
- Phase has <= 1 plan in roadmap           -> light
- Phase description < 50 words             -> light
- Phase has research references            -> standard+
- Phase has experiments/eval targets       -> full
- Phase has 5+ plans                       -> full
- User explicitly set level                -> override
```

#### User override

In `config.json`:
```json
{
  "ceremony": {
    "default_level": "auto",
    "phase_overrides": {
      "3": "full"
    }
  }
}
```

Per-command: `/grd:plan-phase 3 --ceremony light`

#### Impact on commands

- `plan-phase` at "light": skips researcher + checker + eval-planner. Planner runs quick mode.
- `execute-phase` at "light": skips verifier + code reviewer.
- `execute-phase` at "standard": code review per-phase, not per-wave.
- `verify-phase` at "light": sanity only. At "standard": sanity + proxy. At "full": all tiers.

#### Impact on `/grd:quick`

Quick mode becomes smarter with context-aware routing:
1. If task relates to a specific phase -> workspace in that phase's directory
2. If cross-cutting or unrelated -> workspace in `anonymous/quick/`
3. If no milestone/phase exists -> workspace in `anonymous/quick/`

Updates STATE.md, creates SUMMARY.md in the appropriate location, follows principles + standards. Quick mode is "do this task with my project's conventions, commit properly, and leave a trail."

---

### Layer 4: Smart Model Routing (Revised)

**Philosophy:** Ceremony level controls WHICH agents are skipped, not WHICH model they use. When an agent runs, it runs at full quality.

The existing 3-profile system (Quality/Balanced/Budget) is unchanged:

| Agent | Quality | Balanced | Budget | Skipped at light? |
|-------|---------|----------|--------|-------------------|
| grd-planner | opus | opus | sonnet | No (always runs) |
| grd-executor | opus | sonnet | sonnet | No (always runs) |
| grd-code-reviewer | opus | sonnet | sonnet | Yes |
| grd-verifier | sonnet | sonnet | haiku | Yes (sanity-only at light) |
| grd-checker | opus | sonnet | sonnet | Yes |
| grd-eval-planner | opus | opus | sonnet | Yes |
| grd-researcher | opus | sonnet | sonnet | Yes |

Cost savings come from fewer agent invocations at lower ceremony levels, not from degrading model quality.

---

### Layer 5: Command Consolidation

#### Commands merged (8 removed)

| Current | Merge Into | Rationale |
|---------|-----------|-----------|
| `/grd:dashboard` | `/grd:progress` | Both show project status |
| `/grd:health` | `/grd:progress` | Health indicators become a section in progress |
| `/grd:phase-detail N` | `/grd:progress --phase N` | Detail drill-down becomes a flag |
| `/grd:yolo` | `/grd:settings` | YOLO toggle moves into settings |
| `/grd:set-profile` | `/grd:settings` | Profile selection moves into settings |
| `/grd:research-phase N` | `/grd:plan-phase N` | Research already integrated into plan-phase |
| `/grd:eval-plan N` | `/grd:plan-phase N` | Eval planning already auto-triggered |
| `/grd:audit-milestone` | `/grd:complete-milestone` | Audit runs as first step of completion |

#### Commands added (2 new)

| New | Purpose |
|-----|---------|
| `/grd:discover` | Standards discovery (lightweight, interactive) |
| `/grd:principles` | Create/edit PRINCIPLES.md standalone |

#### Net effect: 45 -> 39 commands

#### Commands NOT consolidated (intentional)

- `discuss-phase` stays separate from `plan-phase` (brainstorming vs planning)
- `verify-phase` stays separate from `verify-work` (code verification vs conversational UAT)
- Research commands (`survey`, `deep-dive`, `compare-methods`, `feasibility`) stay separate
- Phase lifecycle commands (`add-phase`, `insert-phase`, `remove-phase`) stay separate

## Implementation Strategy

Each layer is independently testable and shippable. Suggested order:

1. **Constitution layer** — simplest, additive only, high impact on agent quality
2. **Scale-adaptive ceremony** — most impactful for daily workflow, enables command consolidation
3. **Command consolidation** — natural consequence of ceremony layer
4. **Standards discovery** — new capability, can build incrementally
5. **Model routing revision** — smallest change, just adjusts skip/include logic

## Non-Goals

- No plugin architecture — layers are built-in, not pluggable
- No new agent types — existing agents gain ceremony-awareness
- No breaking changes to `.planning/` directory structure
- No changes to existing PLAN.md / SUMMARY.md / VERIFICATION.md formats
- No multi-platform support (stays Claude Code-only for now)
