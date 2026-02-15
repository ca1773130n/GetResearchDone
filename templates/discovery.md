# Discovery Template

Template for `.planning/phases/XX-name/DISCOVERY.md` - shallow research for library/option decisions.

**Purpose:** Answer "which library/option should we use" questions during mandatory discovery in plan-phase.

For deep ecosystem research ("how do experts build this"), use `/grd:research-phase` which produces RESEARCH.md.
For SoTA landscape research ("what methods exist"), use `/grd:survey` which produces LANDSCAPE.md.

---

## File Template

```markdown
---
phase: XX-name
type: discovery
topic: [discovery-topic]
---

<session_initialization>
Before beginning discovery, verify today's date:
!`date +%Y-%m-%d`

Use this date when searching for "current" or "latest" information.
</session_initialization>

<discovery_objective>
Discover [topic] to inform [phase name] implementation.

Purpose: [What decision/implementation this enables]
Scope: [Boundaries]
Output: DISCOVERY.md with recommendation
</discovery_objective>

<discovery_scope>
<include>
- [Question to answer]
- [Area to investigate]
</include>

<exclude>
- [Out of scope for this discovery]
</exclude>
</discovery_scope>

<discovery_protocol>

**Source Priority:**
1. **Context7 MCP** - For library/framework documentation (current, authoritative)
2. **Official Docs** - For platform-specific or non-indexed libraries
3. **WebSearch** - For comparisons, trends, community patterns (verify all findings)

**Confidence Levels:**
- HIGH: Context7 or official docs confirm
- MEDIUM: WebSearch + Context7/official docs confirm
- LOW: WebSearch only or training knowledge only (mark for validation)

</discovery_protocol>

<output_structure>
Create `.planning/phases/XX-name/DISCOVERY.md`:

```markdown
# [Topic] Discovery

## Summary
[2-3 paragraph executive summary]

## Primary Recommendation
[What to do and why]

## Alternatives Considered
[What else was evaluated and why not chosen]

## Key Findings

### [Category 1]
- [Finding with source]

## Code Examples
[Relevant implementation patterns, if applicable]

## Metadata

<metadata>
<confidence level="high|medium|low">
[Why this confidence level]
</confidence>

<sources>
- [Primary authoritative sources used]
</sources>

<open_questions>
[What couldn't be determined]
</open_questions>
</metadata>
```
</output_structure>

<success_criteria>
- All scope questions answered with authoritative sources
- Clear primary recommendation
- Ready to inform PLAN.md creation
</success_criteria>
```

<guidelines>
Same as GSD discovery template. See GSD discovery.md for full guidelines on when to use, when NOT to use, and when to use RESEARCH.md instead.

**R&D addition:** When to use LANDSCAPE.md instead:
- Paper comparison and SoTA analysis
- Multi-method evaluation
- Use `/grd:survey` for these
</guidelines>
