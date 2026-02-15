# Research Template

Template for `.planning/phases/XX-name/{phase}-RESEARCH.md` - comprehensive ecosystem research before planning.

**Purpose:** Document what Claude needs to know to implement a phase well - not just "which library" but "how do experts build this." In R&D contexts, also covers paper implementations, algorithm details, and known failure modes.

---

## File Template

```markdown
# Phase [X]: [Name] - Research

**Researched:** [date]
**Domain:** [primary technology/problem domain]
**Confidence:** [HIGH/MEDIUM/LOW]

<user_constraints>
## User Constraints (from CONTEXT.md)

**CRITICAL:** If CONTEXT.md exists from /grd:discuss-phase, copy locked decisions here verbatim. These MUST be honored by the planner.

### Locked Decisions
[Copy from CONTEXT.md `## Decisions` section - these are NON-NEGOTIABLE]
- [Decision 1]
- [Decision 2]

### Claude's Discretion
[Copy from CONTEXT.md - areas where researcher/planner can choose]
- [Area 1]
- [Area 2]

### Deferred Ideas (OUT OF SCOPE)
[Copy from CONTEXT.md - do NOT research or plan these]
- [Deferred 1]
- [Deferred 2]

**If no CONTEXT.md exists:** Write "No user constraints - all decisions at Claude's discretion"
</user_constraints>

<research_summary>
## Summary

[2-3 paragraph executive summary]
- What was researched
- What the standard approach is
- Key recommendations

**Primary recommendation:** [one-liner actionable guidance]
</research_summary>

<standard_stack>
## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| [name] | [ver] | [what it does] | [why experts use it] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| [name] | [ver] | [what it does] | [use case] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| [standard] | [alternative] | [when alternative makes sense] |

**Installation:**
```bash
pip install [packages]
# or
npm install [packages]
```
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### Recommended Project Structure
```
src/
├── [folder]/        # [purpose]
├── [folder]/        # [purpose]
└── [folder]/        # [purpose]
```

### Pattern 1: [Pattern Name]
**What:** [description]
**When to use:** [conditions]
**Example:**
```python
# [code example from official docs]
```

### Anti-Patterns to Avoid
- **[Anti-pattern]:** [why it's bad, what to do instead]
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| [problem] | [what you'd build] | [library] | [edge cases, complexity] |

**Key insight:** [why custom solutions are worse in this domain]
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: [Name]
**What goes wrong:** [description]
**Why it happens:** [root cause]
**How to avoid:** [prevention strategy]
**Warning signs:** [how to detect early]
</common_pitfalls>

<code_examples>
## Code Examples

Verified patterns from official sources:

### [Common Operation 1]
```python
# Source: [Context7/official docs URL]
[code]
```
</code_examples>

<sota_updates>
## State of the Art (2025-2026)

What's changed recently:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| [old] | [new] | [date/version] | [what it means for implementation] |

**New tools/patterns to consider:**
- [Tool/Pattern]: [what it enables, when to use]

**Deprecated/outdated:**
- [Thing]: [why it's outdated, what replaced it]
</sota_updates>

<open_questions>
## Open Questions

Things that couldn't be fully resolved:

1. **[Question]**
   - What we know: [partial info]
   - What's unclear: [the gap]
   - Recommendation: [how to handle during planning/execution]
</open_questions>

<sources>
## Sources

### Primary (HIGH confidence)
- [Context7 library ID] - [topics fetched]
- [Official docs URL] - [what was checked]

### Secondary (MEDIUM confidence)
- [WebSearch verified with official source] - [finding + verification]

### Tertiary (LOW confidence - needs validation)
- [WebSearch only] - [finding, marked for validation during implementation]
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: [what]
- Ecosystem: [libraries explored]
- Patterns: [patterns researched]
- Pitfalls: [areas checked]

**Confidence breakdown:**
- Standard stack: [HIGH/MEDIUM/LOW] - [reason]
- Architecture: [HIGH/MEDIUM/LOW] - [reason]
- Pitfalls: [HIGH/MEDIUM/LOW] - [reason]
- Code examples: [HIGH/MEDIUM/LOW] - [reason]

**Research date:** [date]
**Valid until:** [estimate - 30 days for stable tech, 7 days for fast-moving]
</metadata>

---

*Phase: XX-name*
*Research completed: [date]*
*Ready for planning: [yes/no]*
```

---

## Guidelines

Same structure and principles as GSD research template.

**When to create:**
- Before planning phases in niche/complex domains
- When Claude's training data is likely stale or sparse
- When "how do experts do this" matters more than "which library"
- When implementing methods from research papers

**Structure:**
- Use XML tags for section markers (matches GRD templates)
- Seven core sections: summary, standard_stack, architecture_patterns, dont_hand_roll, common_pitfalls, code_examples, sources
- All sections required (drives comprehensive research)

**R&D additions:**
- Include paper references in sources section
- Note known reproduction issues in pitfalls
- Include algorithm-specific patterns in code examples
- Reference LANDSCAPE.md findings if available

**After creation:**
- File lives in phase directory: `.planning/phases/XX-name/{phase}-RESEARCH.md`
- Referenced during planning workflow
- plan-phase loads it automatically when present
