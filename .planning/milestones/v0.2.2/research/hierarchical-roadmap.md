# Research: Hierarchical Long-Term Roadmap Planning

**Domain:** R&D project management and roadmap planning
**Researched:** 2026-02-16
**Overall confidence:** MEDIUM

## Executive Summary

GRD currently uses a linear milestone-by-milestone model where each milestone is defined, executed, and completed before planning the next. This research explores hierarchical long-term roadmap planning patterns to enable upfront multi-milestone planning with progressive refinement—defining rough milestones ahead while refining them incrementally as the project progresses.

Key findings:
- **Now-Next-Later framework** provides the best balance of structure and flexibility for R&D projects
- **Progressive elaboration** is a proven PM pattern for refining plans as information becomes available
- **Hybrid model** (long-term rough + current milestone detailed) is recommended over pure hierarchical
- **Minimal data model changes** required—add LONG-TERM-ROADMAP.md, keep existing ROADMAP.md structure
- **Backward compatibility** achievable through detection of LONG-TERM-ROADMAP.md presence

## Planning Model Comparison

### 1. Progressive (Current GRD Model)

**Structure:** One milestone at a time, defined fully before execution

**Flow:**
```
Define Milestone 1 → Execute → Complete → Archive
  → Define Milestone 2 → Execute → Complete → Archive
  → Define Milestone 3 → ...
```

**Strengths:**
- Maximum flexibility—each milestone informed by previous learnings
- No wasted planning on milestones that may change direction
- Simple data model and mental model
- Works well for exploratory R&D with high uncertainty

**Weaknesses:**
- No visibility into long-term trajectory
- Difficult to communicate multi-quarter roadmap to stakeholders
- Can't identify cross-milestone dependencies early
- Hard to align with organizational OKRs or annual planning cycles

**Best for:** Early-stage R&D, proof-of-concept work, exploratory research

---

### 2. Pure Hierarchical

**Structure:** All milestones defined upfront with full detail

**Flow:**
```
Define All Milestones (1-4) with detailed phases
  → Execute Milestone 1 → Execute Milestone 2 → ...
```

**Strengths:**
- Complete visibility into long-term plan
- Easy to sync with external trackers (Jira epics/roadmaps)
- Clear dependency mapping across milestones
- Straightforward stakeholder communication

**Weaknesses:**
- High upfront planning cost
- Brittle—later milestones often need replanning as learnings emerge
- Encourages waterfall thinking in R&D context
- Waste from detailed planning of uncertain future work

**Best for:** Well-understood domains, production engineering, regulated environments

---

### 3. Hybrid: Now-Next-Later with Progressive Refinement (RECOMMENDED)

**Structure:** Three tiers of planning granularity

**Flow:**
```
Long-term rough sketch (Later: 6-12 months out, rough goals)
  ↓
Near-term defined (Next: 1-2 milestones, requirements clear)
  ↓
Current detailed (Now: current milestone with full phase breakdown)
```

**Time Horizons (not fixed dates):**
- **Now:** Current milestone being executed (detailed phases, plans, verification)
- **Next:** 1-2 upcoming milestones (requirements defined, rough phase sketch)
- **Later:** 2-4 future milestones (goal statements, success criteria, open questions)

**Progressive Refinement Cadence:**
- **Continuous:** As current milestone progresses, Next milestones get refined
- **Milestone transition:** When completing Now, promote Next[0] → Now, Later[0] → Next
- **Quarterly review:** Adjust Later milestones based on learnings and strategy shifts

**Strengths:**
- Balances visibility with flexibility
- Minimal wasted planning (only refine what's approaching)
- Naturally adapts to R&D learning loops
- Good stakeholder communication without over-committing
- Supports both OKR alignment and agile iteration

**Weaknesses:**
- More complex data model than pure progressive
- Requires discipline to avoid over-refining Later milestones
- Refinement timing needs clear triggers

**Best for:** R&D projects with stakeholder visibility needs, multi-quarter projects, teams balancing exploration and delivery

---

## Industry Patterns: How PM Tools Handle Long-Term Planning

### Jira Advanced Roadmaps

**Hierarchy:** Initiative → Epic → Story → Task

**Progressive Elaboration:**
- Custom date ranges (multi-year views supported)
- Higher-level items (above Epic) can be added for long-term goals
- Dependencies visualized across hierarchy
- Scenarios allow "what-if" planning without commitment

**Key Insight:** Jira separates *planning horizon* (how far you look ahead) from *detail level* (how much you define). You can have a 12-month roadmap where only the first quarter has detailed stories.

**GRD Application:** Adopt the same separation—LONG-TERM-ROADMAP.md shows 3-4 milestones ahead, but only current milestone gets detailed phases.

### Scaled Agile Framework (SAFe)

**Planning Interval (PI) Structure:**
- PI Planning every 8-12 weeks (like GRD milestones)
- Roadmap shows 3 PIs: committed (detailed), next (refined), following (rough forecast)
- Product Management refines roadmap using completed PI objectives

**Key Insight:** SAFe uses a rolling 3-PI window with graduated detail levels. As PI completes, roadmap shifts: next → current, following → next, new PI added to following.

**GRD Application:** Use similar rolling window—complete Now milestone, promote Next → Now, add new Later milestone.

### Now-Next-Later Framework

**Time Horizons (not timelines):**
- **Now:** Immediate work with commitment (current sprint/milestone)
- **Next:** Near-term priorities being refined (next 1-2 milestones)
- **Later:** Long-term vision, no commitment (strategic direction)

**Refinement Flow:**
- Items flow from Later → Next → Now as they get refined
- No fixed dates in Later (avoids false precision)
- Continuous reprioritization based on learnings

**Key Insight:** The framework's "superpower is flexibility"—Later milestones can be reordered, merged, or replaced without breaking commitments. Only Now is committed work.

**GRD Application:** Perfect fit for R&D. Later milestones are "research goals we think we need" subject to change. Next milestones are "we're confident about the goal, refining the approach." Now is "executing with detailed plans."

---

## Proposed Data Model

### File Structure Changes

```
.planning/
├── PROJECT.md                    # Unchanged - product vision
├── LONG-TERM-ROADMAP.md          # NEW - multi-milestone roadmap with graduated detail
├── ROADMAP.md                    # Unchanged - current milestone detailed phases
├── STATE.md                      # Enhanced - tracks refinement history
├── MILESTONES.md                 # Enhanced - includes archived + future milestones
├── REQUIREMENTS.md               # Unchanged - current milestone requirements
└── research/                     # Unchanged
```

### LONG-TERM-ROADMAP.md Schema

```yaml
---
project: "GRD — Get Research Done"
roadmap_type: "hierarchical"  # or "progressive" for backward compat
created: "2026-02-16"
last_refined: "2026-02-16"
planning_horizon: "6 months"  # how far ahead Later extends
---

# Long-Term Roadmap: GRD

## Current Milestone (Now)

**Milestone:** v0.1.0 - Foundation
**Status:** In Progress (Phase 3 of 5)
**Start:** 2026-01-15
**Target:** 2026-03-01
**Detailed Plan:** See ROADMAP.md

### Goal
Establish core R&D workflow: research, planning, execution, evaluation with tiered verification.

### Success Criteria
- All Phase 6 tests passing
- Documentation complete
- First external user onboarded

### Open Questions
- None (fully refined)

---

## Next Milestones (1-2 upcoming, refined requirements)

### v0.2.0 - Agent Teams & Parallelization

**Status:** Next (Requirements defined, rough phases)
**Estimated Start:** 2026-03-01
**Estimated Duration:** 6 weeks
**Dependencies:** v0.1.0 complete

#### Goal
Enable parallel execution of independent phases and agent team collaboration for complex tasks.

#### Success Criteria
- Execute 3 independent phases in parallel
- Agent team successfully plans and executes a multi-component feature
- 30% reduction in end-to-end milestone time

#### Rough Phase Sketch
1. **Agent Team Protocol** — Define team communication patterns
2. **Parallel Execution Engine** — Dependency graph, scheduler
3. **Coordination Primitives** — Shared state, conflict resolution
4. **Integration** — E2E workflow with team + parallel execution

#### Open Questions
- Which agent team protocol: hierarchical (lead + workers) vs peer-to-peer?
- How to handle merge conflicts in parallel phase execution?

---

### v0.3.0 - Advanced Evaluation & Metrics

**Status:** Next (Requirements ~80% defined)
**Estimated Start:** 2026-04-15
**Estimated Duration:** 4 weeks
**Dependencies:** v0.2.0 complete

#### Goal
Richer evaluation framework with A/B testing, regression detection, and performance profiling.

#### Success Criteria
- Automated regression detection on 5 baseline metrics
- A/B test support with statistical significance calculation
- Performance profiling integrated into eval reports

#### Rough Phase Sketch
1. **Regression Detection** — Baseline tracking, delta thresholds
2. **A/B Testing Framework** — Experiment design, stat analysis
3. **Profiling Integration** — Hook into code execution, bottleneck identification

#### Open Questions
- Baseline storage: in-repo vs external database?
- How to handle non-deterministic metrics (LLM outputs)?

---

## Later Milestones (2+ quarters out, rough goals)

### v0.4.0 - Multi-Project Management

**Status:** Later (Goal defined, approach TBD)
**Estimated Timeline:** Q3 2026
**Dependencies:** v0.3.0 complete

#### Goal
Support multiple concurrent R&D projects with shared research knowledge base.

#### Success Criteria
- Manage 3+ projects in single workspace
- Cross-project research reuse
- Unified progress dashboard

#### Open Research Questions
- Monorepo vs separate repos per project?
- How to structure shared research knowledge graph?
- Dependency management across projects?

---

### v0.5.0 - Community & Marketplace

**Status:** Later (Vision statement)
**Estimated Timeline:** Q4 2026
**Dependencies:** v0.4.0 complete, user base >100

#### Goal
Enable sharing of research artifacts, phase templates, and evaluation frameworks.

#### Success Criteria
- 10+ published research landscapes
- 20+ reusable phase templates
- Community-contributed paper analyses

#### Open Research Questions
- Licensing and attribution model?
- Quality curation mechanism?
- Versioning strategy for shared artifacts?

---

## Milestone Dependency Graph

```
v0.1.0 (Now)
  ↓
v0.2.0 (Next) ──┐
  ↓             │ (parallel tracks possible)
v0.3.0 (Next) ──┘
  ↓
v0.4.0 (Later)
  ↓
v0.5.0 (Later)
```

**Notes:**
- v0.2.0 and v0.3.0 could potentially run in parallel if agent teams work
- v0.4.0 requires v0.3.0 for multi-project metric aggregation
- Later milestones subject to reprioritization based on user feedback

---

## Refinement History

| Date | Action | Details |
|------|--------|---------|
| 2026-02-16 | Initial roadmap | Defined v0.1.0 - v0.5.0 with Now-Next-Later tiers |

```

### STATE.md Enhancements

Add new section:

```markdown
## Roadmap Refinement History

**Current planning mode:** Hierarchical (LONG-TERM-ROADMAP.md present)

### Refinement Log

- **2026-02-16:** Initial long-term roadmap created with 5 milestones
- **2026-03-01:** v0.2.0 promoted from Next to Now, v0.6.0 added to Later
- **2026-03-15:** v0.4.0 reprioritized—swapped with v0.3.0 based on user feedback
```

### MILESTONES.md Enhancements

Add future milestones section:

```markdown
# Milestones

## Completed

(existing archive)

## Current

**v0.1.0 - Foundation** (Now)
- Status: In Progress (Phase 3 of 5)
- See ROADMAP.md for detailed phases

## Future

**v0.2.0 - Agent Teams** (Next)
- Status: Requirements defined
- See LONG-TERM-ROADMAP.md

**v0.3.0 - Advanced Evaluation** (Next)
- Status: Requirements ~80% defined
- See LONG-TERM-ROADMAP.md

**v0.4.0 - Multi-Project Management** (Later)
- Status: Goal defined
- See LONG-TERM-ROADMAP.md

**v0.5.0 - Community** (Later)
- Status: Vision statement
- See LONG-TERM-ROADMAP.md
```

---

## Proposed Command Changes

### New Commands

#### `/grd:long-term-roadmap`
**Purpose:** Create or update LONG-TERM-ROADMAP.md with multi-milestone planning

**Flow:**
1. Check if LONG-TERM-ROADMAP.md exists
2. If not, ask: "How many milestones do you want to plan ahead? (recommended: 3-5)"
3. For each milestone, gather:
   - Goal statement
   - Rough success criteria
   - Estimated timeline (relative or absolute)
   - Dependencies on previous milestones
4. Generate LONG-TERM-ROADMAP.md with Now-Next-Later tiers
5. Update STATE.md with refinement history entry

**Example usage:**
```
/grd:long-term-roadmap

Agent: "I'll help you create a long-term roadmap. How many milestones would you like to plan ahead?"
User: "4 milestones beyond the current one"
Agent: "Great. Let's start with the first Next milestone..."
```

#### `/grd:refine-milestone <N>`
**Purpose:** Promote a Next/Later milestone to more refined state

**Flow:**
1. Load milestone N from LONG-TERM-ROADMAP.md
2. Check current tier: Later or Next?
3. Run discussion flow similar to `/grd:discuss-phase` but for milestone level
4. If promoting Later → Next: define requirements, rough phases
5. If promoting Next → Now: create detailed ROADMAP.md, REQUIREMENTS.md
6. Update LONG-TERM-ROADMAP.md with refined details
7. Log refinement in STATE.md

**Example usage:**
```
/grd:refine-milestone v0.2.0

Agent: "Milestone v0.2.0 is currently in Next tier. I'll help refine it with detailed requirements and phase breakdown..."
```

#### `/grd:roadmap-promote`
**Purpose:** Complete current milestone and promote roadmap (Next → Now, Later → Next)

**Flow:**
1. Verify current milestone is complete (all phases done, verification passed)
2. Archive current milestone to MILESTONES.md
3. Promote Next[0] milestone to Now:
   - Create new ROADMAP.md from Next milestone's rough phases
   - Create REQUIREMENTS.md from Next milestone's success criteria
   - Update STATE.md
4. Shift remaining Next milestones down
5. Promote Later[0] to Next
6. Prompt: "Do you want to add a new Later milestone?"
7. Update LONG-TERM-ROADMAP.md

**Example usage:**
```
/grd:roadmap-promote

Agent: "Milestone v0.1.0 is complete. Promoting v0.2.0 to Now, v0.3.0 to Next[0]..."
```

#### `/grd:roadmap-sync`
**Purpose:** Sync LONG-TERM-ROADMAP.md to external tracker (GitHub/Jira)

**Mapping:**
- Each milestone → Epic in tracker
- Next milestones → Epics with rough description
- Later milestones → Epics with vision label
- Current milestone phases → Tasks (existing behavior)

**Flow:**
1. Read LONG-TERM-ROADMAP.md
2. For each milestone:
   - Check TRACKER.md for existing mapping
   - If not exists, create Epic in tracker
   - Update Epic description with goal, success criteria, status
   - Set timeline fields if defined
3. Update dependency links between Epics
4. Record mappings in TRACKER.md

### Enhanced Commands

#### `/grd:new-milestone` (Enhanced)
**Behavior Change:**
- If LONG-TERM-ROADMAP.md exists (hierarchical mode):
  - Check if next milestone is already defined in roadmap
  - If yes: promote Next → Now (like `/grd:roadmap-promote`)
  - If no: fall back to current progressive flow
- If LONG-TERM-ROADMAP.md doesn't exist (progressive mode):
  - Use current behavior (define milestone fresh)

#### `/grd:new-project` (Enhanced)
**New prompt:**
```
Agent: "How would you like to plan this project?
1. Progressive (define each milestone as you complete the previous one)
2. Hierarchical (define 3-5 milestones upfront with progressive refinement)

Recommendation: Use hierarchical if you need stakeholder visibility or have a clear multi-quarter vision. Use progressive for exploratory R&D."
```

If user chooses hierarchical: run `/grd:long-term-roadmap` after creating PROJECT.md

#### `/grd:product-plan` (Enhanced)
**Behavior Change:**
- If LONG-TERM-ROADMAP.md exists:
  - Load Next/Later milestones for context
  - Ask: "Should this planning inform future milestones in the roadmap?"
  - If yes: update LONG-TERM-ROADMAP.md with refined success criteria
- If not: use current behavior (plan current milestone only)

---

## Migration Strategy

### Goals
1. **Zero breaking changes** for existing GRD users
2. **Opt-in adoption** of hierarchical planning
3. **Seamless upgrade path** from progressive to hierarchical
4. **Downgrade path** if users want to revert

### Detection Logic

```javascript
// In grd-tools.js or workflow initialization
function getPlanningMode() {
  const longTermRoadmapExists = fs.existsSync('.planning/LONG-TERM-ROADMAP.md');

  if (longTermRoadmapExists) {
    const frontmatter = parseFrontmatter('.planning/LONG-TERM-ROADMAP.md');
    return frontmatter.roadmap_type || 'hierarchical';
  }

  return 'progressive';  // backward compatible default
}
```

### Migration Phases

#### Phase 1: Add Hierarchical Support (Opt-In)
**Changes:**
- Add LONG-TERM-ROADMAP.md template
- Add new commands: `/grd:long-term-roadmap`, `/grd:refine-milestone`, `/grd:roadmap-promote`
- Enhance existing commands with mode detection
- Update documentation with hierarchical examples

**Backward Compatibility:**
- All existing commands work unchanged if LONG-TERM-ROADMAP.md doesn't exist
- Existing projects continue in progressive mode
- No data model changes to existing files

**Adoption Path:**
```bash
# User with existing progressive project
/grd:long-term-roadmap  # Creates LONG-TERM-ROADMAP.md, enters hierarchical mode
# OR
/grd:new-project  # Prompt offers hierarchical option
```

#### Phase 2: Tracker Integration
**Changes:**
- Extend `/grd:sync` to sync LONG-TERM-ROADMAP.md milestones as Epics
- Add dependency graph visualization
- Support milestone date scheduling

**Backward Compatibility:**
- Progressive mode: sync only current milestone (existing behavior)
- Hierarchical mode: sync all milestones with appropriate labels (Now/Next/Later)

#### Phase 3: Advanced Features
**Changes:**
- Milestone dependency validation
- Cross-milestone impact analysis
- "What-if" scenario planning
- Automatic refinement reminders (e.g., "v0.2.0 starts in 2 weeks, ready to refine?")

**Backward Compatibility:**
- All features gated on hierarchical mode detection

### Rollback Path

If user wants to exit hierarchical mode:

```bash
# Option 1: Delete LONG-TERM-ROADMAP.md
rm .planning/LONG-TERM-ROADMAP.md
# System reverts to progressive mode

# Option 2: Set roadmap_type in frontmatter
# In LONG-TERM-ROADMAP.md:
roadmap_type: "progressive"
# System ignores Next/Later milestones
```

### Data Preservation

No data loss in any migration scenario:
- Progressive → Hierarchical: Current milestone stays in ROADMAP.md, gets reflected in LONG-TERM-ROADMAP.md as Now
- Hierarchical → Progressive: LONG-TERM-ROADMAP.md remains (can be referenced), current milestone still in ROADMAP.md
- All STATE.md, MILESTONES.md, phase files unchanged

---

## AI-Assisted Refinement Workflow

### Refinement Discussion Protocol

Similar to GRD's `/grd:discuss-phase` "no-solutions-before-questions" protocol, but for milestone level.

#### For Later → Next Refinement

**Agent questions (exploratory, not solution-oriented):**

1. **Goal Validation**
   - "Is the goal statement still accurate given what we learned in the last milestone?"
   - "What makes this milestone important *now* vs when we first defined it?"
   - "Are there dependencies on external factors (user feedback, tech maturity) we should validate?"

2. **Success Criteria**
   - "What does 'done' look like for this milestone?"
   - "What metrics would tell us we succeeded?"
   - "What would make us consider this milestone a failure, even if we build what's planned?"

3. **Scope & Constraints**
   - "What's explicitly *out of scope* for this milestone?"
   - "What constraints (time, resources, technical) do we need to work within?"
   - "Are there parallel efforts (other projects, external deps) that affect scope?"

4. **Risk & Open Questions**
   - "What don't we know yet that could change the approach?"
   - "What research or spikes are needed before we can plan phases?"
   - "Where are we most likely to be wrong in our assumptions?"

**Outcome:** Next milestone with:
- Refined goal statement
- Measurable success criteria (becomes REQUIREMENTS.md when promoted to Now)
- Rough phase sketch (3-7 phases)
- Documented open questions flagged for research

#### For Next → Now Refinement

**Agent questions (more detailed, preparing for execution):**

1. **Requirements Validation**
   - "Let's review each success criterion. Which are must-have vs nice-to-have?"
   - "Are there implicit requirements we should make explicit?"
   - "How will we validate each requirement (what tests/evals)?"

2. **Phase Breakdown**
   - "Looking at the rough phase sketch, what dependencies exist between phases?"
   - "Which phases have high uncertainty and might need deeper research first?"
   - "Are there opportunities to parallelize phases?"

3. **Verification Strategy**
   - "For each phase, what's the verification level (sanity/proxy/deferred)?"
   - "What metrics should we baseline before starting?"
   - "What integration risks should we plan for?"

4. **Resource Estimation**
   - "Which phases are likely to need agent teams vs single-agent execution?"
   - "Where do we expect to iterate (and budget time for it)?"
   - "What external dependencies (APIs, data, reviews) have lead time?"

**Outcome:** Now milestone with:
- Detailed REQUIREMENTS.md (traceability matrix)
- Full ROADMAP.md with phases, verification levels, dependencies
- Evaluation plan (what to baseline, what to measure)
- Risk mitigation strategies

### Automatic Refinement Triggers

**Time-based:**
- 2 weeks before estimated start of Next milestone → Prompt: "Time to refine v0.X.0?"

**Event-based:**
- Current milestone completes Phase 3 of 5 → Prompt: "v0.X.0 is progressing well. Ready to refine Next milestone while you have context?"
- Major learning invalidates Later milestone assumption → Prompt: "Recent research suggests v0.Y.0's approach may need rethinking. Review now or later?"

**User-triggered:**
- `/grd:refine-milestone <N>` (manual)
- `/grd:roadmap-review` (review all milestones, update statuses)

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Mitigation | Confidence |
|------|--------|------------|------------|
| Complexity creep in data model | Medium | Keep LONG-TERM-ROADMAP.md as separate file, don't modify existing schemas | HIGH |
| Confusion between ROADMAP.md and LONG-TERM-ROADMAP.md | Medium | Clear naming convention, docs, mode detection messages | MEDIUM |
| Sync conflicts if both files updated manually | Low | Validation commands, clear "source of truth" rules | HIGH |
| Over-engineering future milestones | High | Strong guardrails in prompts, Later tier explicitly low-detail | MEDIUM |

### Process Risks

| Risk | Impact | Mitigation | Confidence |
|------|--------|------------|------------|
| Users plan too far ahead (12+ months) | Medium | Recommend 3-5 milestones, warn against over-planning | MEDIUM |
| Refinement discipline breaks down | High | Automatic reminders, make refinement lightweight | LOW |
| False sense of certainty from detailed Later milestones | High | Clear tier labeling, "subject to change" warnings in outputs | MEDIUM |
| Backward compat breaks for progressive users | Critical | Thorough detection logic, extensive testing | HIGH |

### Adoption Risks

| Risk | Impact | Mitigation | Confidence |
|------|--------|------------|------------|
| Users don't see value of hierarchical mode | Medium | Good docs, clear use cases, showcase examples | MEDIUM |
| Too much cognitive overhead to manage both modes | Medium | Smart defaults, hide complexity when not needed | MEDIUM |
| Confusing when to use which mode | Low | Decision guide in docs, `/grd:new-project` prompt | HIGH |

### Recommended Risk Mitigations

1. **Phased rollout:** Ship hierarchical support as opt-in, collect feedback before making default
2. **Validation tooling:** Add `grd-tools.js validate roadmap-consistency` command
3. **Clear documentation:** Decision matrix for when to use progressive vs hierarchical
4. **Examples:** Include sample LONG-TERM-ROADMAP.md files in different states of refinement
5. **Escape hatches:** Easy way to "pause" hierarchical planning and focus on Now

---

## Comparison to Similar Tools

### Linear

**Roadmap Approach:**
- Projects contain Issues grouped into Cycles (sprints)
- Roadmap view shows upcoming Cycles across Projects
- Time-based (date-driven) planning

**Relevance to GRD:**
- Good for *delivery* roadmaps (dates matter)
- Less suitable for R&D (uncertainty in timelines)
- GRD should avoid hard dates in Later tier

### Jira Advanced Roadmaps

**Roadmap Approach:**
- Multi-level hierarchy (Initiative > Epic > Story)
- Scenarios allow "what-if" planning
- Dependencies visualized across levels

**Relevance to GRD:**
- Scenario planning too heavy for GRD's use case
- Dependency visualization useful (future feature)
- GRD's tier system simpler than full hierarchy

### Aha! Roadmaps

**Roadmap Approach:**
- Strategy (Goals) → Initiatives → Releases → Features
- Now-Next-Later view option
- Integrates product strategy with execution

**Relevance to GRD:**
- Strong alignment with GRD's approach
- GRD's PROJECT.md like Aha! Goals
- LONG-TERM-ROADMAP.md like Aha! Initiatives
- ROADMAP.md like Aha! Release plan

### SAFe (Scaled Agile)

**Roadmap Approach:**
- 3-PI rolling roadmap (committed, planned, forecasted)
- Quarterly PI Planning events refine next PI
- Clear refinement cadence

**Relevance to GRD:**
- Rolling window model applicable
- Refinement cadence inspiration (milestone transitions)
- GRD could adopt "committed/planned/forecasted" language

---

## Recommendations

### Recommended Approach: Hybrid Now-Next-Later

1. **Add LONG-TERM-ROADMAP.md** as opt-in feature
2. **Keep existing ROADMAP.md** for current milestone (no changes)
3. **Use graduated detail tiers:**
   - Now: Full detail (existing ROADMAP.md structure)
   - Next: Requirements + rough phases (1-2 milestones)
   - Later: Goals + open questions (2-4 milestones)
4. **Progressive refinement triggers:**
   - Automatic: time-based and event-based prompts
   - Manual: `/grd:refine-milestone`
5. **Backward compatibility:** Mode detection via LONG-TERM-ROADMAP.md presence

### Recommended Commands

**High Priority:**
- `/grd:long-term-roadmap` — Create/update long-term roadmap
- `/grd:refine-milestone <N>` — Promote milestone to next tier
- `/grd:roadmap-promote` — Complete Now, shift Next/Later

**Medium Priority:**
- Enhanced `/grd:new-project` with mode selection
- Enhanced `/grd:new-milestone` with auto-promotion
- `/grd:roadmap-review` — Review all milestones

**Low Priority (Future):**
- `/grd:roadmap-visualize` — Generate dependency graph
- `/grd:roadmap-what-if` — Scenario planning
- Auto-scheduling with date propagation

### Recommended Data Model

**Minimal changes:**
- Add LONG-TERM-ROADMAP.md (new file, doesn't affect existing)
- Enhance STATE.md with refinement log (backward compatible)
- Enhance MILESTONES.md with future section (backward compatible)

**No changes:**
- ROADMAP.md structure stays identical
- Phase files unchanged
- All existing workflows compatible

### Implementation Sequence

1. **Phase 1 (MVP):** Core hierarchical support
   - LONG-TERM-ROADMAP.md template
   - `/grd:long-term-roadmap` command
   - Mode detection in existing commands
   - Basic refinement workflow

2. **Phase 2:** Refinement automation
   - `/grd:refine-milestone` with discussion protocol
   - `/grd:roadmap-promote`
   - Automatic refinement reminders
   - Validation commands

3. **Phase 3:** Tracker integration
   - Sync milestones as Epics
   - Dependency mapping
   - Timeline scheduling

4. **Phase 4:** Advanced features
   - Visualization
   - Cross-milestone analysis
   - "What-if" planning

---

## Open Questions

1. **Should Later milestones have estimated dates at all?**
   - Pro: Helps with annual planning, stakeholder expectations
   - Con: False precision, dates will change
   - Recommendation: Use relative timing ("Q3 2026") or dependency-based ("after v0.X.0"), not specific dates

2. **How many milestones is "too many" to plan ahead?**
   - Research suggests 3-5 is sweet spot for most projects
   - R&D projects: lean toward 3 (high uncertainty)
   - Product projects: up to 5 (more predictable)
   - Recommendation: Soft limit of 5 Later milestones, warn if exceeded

3. **Should refinement be mandatory or optional?**
   - Mandatory: Ensures discipline, prevents drift
   - Optional: More flexible, less overhead
   - Recommendation: Optional with strong prompts/reminders (nudge, don't force)

4. **How to handle milestone reprioritization?**
   - If Next milestone becomes irrelevant, should it block promotion?
   - Recommendation: Allow "skip" or "defer" actions on Next milestones (move back to Later or archive)

5. **Should LONG-TERM-ROADMAP.md support multiple tracks (parallel milestone streams)?**
   - Example: "Core Features" track parallel to "Infrastructure" track
   - Adds complexity but enables true parallel planning
   - Recommendation: Not in MVP, consider for Phase 4 based on user feedback

---

## Sources

### Project Management Patterns
- [How to create a project roadmap that aligns teams in 2026](https://monday.com/blog/project-management/project-roadmap/)
- [Mastering Progressive Elaboration: A Game-Changer in Project Management](https://pmiuk.co.uk/mastering-progressive-elaboration-a-game-changer-in-project-management/)
- [Project roadmap | Atlassian](https://www.atlassian.com/agile/project-management/project-roadmap)
- [A Brief Primer On Progressive Elaboration In Agile – UPDATED 2026](https://agilityportal.io/blog/progressive-elaboration)
- [4 stages of an agile roadmap for 2026 | Future Processing](https://www.future-processing.com/blog/agile-roadmap/)

### OKR and Epic Planning
- [How to Write an Epic in Agile: Complete Guide (2026)](https://www.parallelhq.com/blog/how-to-write-epic-in-agile)
- [What Are Agile Epics? The Definitive Guide For 2026](https://monday.com/blog/rnd/agile-epics/)
- [How we use Milestones & Epics for the product management of Shortcut](https://www.shortcut.com/blog/how-we-use-milestones-epics-product-management-clubhouse)
- [Epics, Stories, and Initiatives | Atlassian](https://www.atlassian.com/agile/project-management/epics-stories-themes)

### Jira and Linear Roadmaps
- [Master Planning with Jira Advanced Roadmaps | Atlassian](https://www.atlassian.com/software/jira/guides/advanced-roadmaps/overview)
- [Advanced Roadmapping in Jira: Visualizing Long-Term Project Success](https://www.bairesdev.com/blog/jira-roadmaps-projects/)
- [Discover Advanced Roadmaps for Jira | Jira Software Data Center 11.3 | Atlassian Documentation](https://confluence.atlassian.com/jirasoftwareserver/discover-advanced-roadmaps-for-jira-1044784153.html)

### Agile Release Trains and SAFe
- [PI Planning - Scaled Agile Framework](https://framework.scaledagile.com/pi-planning)
- [Agile Release Trains Explained: A Practical Guide for 2026](https://monday.com/blog/rnd/agile-release-train/)
- [Roadmap - Scaled Agile Framework](https://framework.scaledagile.com/roadmap)
- [Agile planning in 2026: discover essential steps to success](https://monday.com/blog/rnd/agile-planning/)

### Milestone Dependencies and Parallel Tracks
- [Your Guide to Project Management Milestones and Dependencies](https://www.bigtime.net/blogs/planning-project-dependencies-and-milestones/)
- [How to draw a dependency diagram: a guide for project managers [2026]](https://monday.com/blog/project-management/dependencies-diagram/)
- [Project milestones: strategic planning and execution tips for 2026](https://monday.com/blog/project-management/project-milestones/)

### Now-Next-Later Framework
- [The Now-Next-Later Framework for Product Roadmaps](https://nalpeiron.com/blog/now-next-later-framework)
- [The Now, Next, and Later Roadmap: A Comprehensive Guide for Planning Ahead | LaunchNotes](https://www.launchnotes.com/blog/the-now-next-and-later-roadmap-a-comprehensive-guide-for-planning-ahead)
- [How to Create a Now-Next-Later Roadmap for a Product in Its Early Stages](https://www.netguru.com/blog/now-next-later-framework-product-roadmap)
- [Curves Ahead: Navigating Change with Now-Next-Later Roadmap](https://productschool.com/blog/product-strategy/now-next-later-roadmap)
- [Why I Invented the Now-Next-Later Roadmap | ProdPad](https://www.prodpad.com/blog/invented-now-next-later-roadmap/)

### AI-Assisted Planning
- [AddyOsmani.com - My LLM coding workflow going into 2026](https://addyosmani.com/blog/ai-coding-workflow/)
- [Brainstorming With AI](https://www.td.org/content/td-magazine/brainstorming-with-ai)
- [Generative AI Tools for Better Brainstorming | PMI Blog | PMI](https://www.pmi.org/blog/better-brainstorming-with-ai)

### Data Structures and Schema
- [Roadmaps show epics and milestones | GitLab Docs](https://docs.gitlab.com/user/group/roadmap/)
- [GitHub - SierraSoftworks/roadmap: Manage your project and team road maps in YAML](https://github.com/SierraSoftworks/roadmap)
- [Using YAML frontmatter - GitHub Docs](https://docs.github.com/en/contributing/writing-for-github-docs/using-yaml-frontmatter)
- [Markdown | Road map](https://roadmap.sierrasoftworks.com/tools/documentation/markdown/)

### Research Project Planning
- [Research project timeline: your step-by-step guide](https://www.officetimeline.com/timeline/educational/research)
- [Your Research Project Roadmap: Essential Steps for Ensuring for a Thorough Study - Dscout](https://dscout.com/people-nerds/research-project-roadmap)
- [Creating a 5-Year Research Plan - Center for Faculty Excellence | Montana State University](https://www.montana.edu/facultyexcellence/programs/earlycareersuccess/researchplan.html)

### Migration and Architecture
- [Phase F: Migration Planning - TOGAF](https://pubs.opengroup.org/architecture/togaf9-doc/arch/chap13.html)
- [Cloud transformation planning | Atlassian](https://www.atlassian.com/migration/plan)
- [Progressive Disclosure - NN/G](https://www.nngroup.com/articles/progressive-disclosure/)
- [Progressive Disclosure Matters: Applying 90s UX Wisdom to 2026 AI Agents](https://aipositive.substack.com/p/progressive-disclosure-matters)
