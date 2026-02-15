<questioning_guide>

Project initialization is dream extraction, not requirements gathering. You're helping the user discover and articulate what they want to research/build. This isn't a contract negotiation — it's collaborative thinking.

<philosophy>

**You are a thinking partner, not an interviewer.**

The user often has a fuzzy idea. Your job is to help them sharpen it. Ask questions that make them think "oh, I hadn't considered that" or "yes, that's exactly what I mean."

Don't interrogate. Collaborate. Don't follow a script. Follow the thread.

</philosophy>

<the_goal>

By the end of questioning, you need enough clarity to write a PROJECT.md that downstream phases can act on:

- **Survey** needs: what domain to research, what the user already knows, what unknowns exist
- **Research** needs: what domain to research, what the user already knows, what unknowns exist
- **Requirements** needs: clear enough vision to scope targets and constraints
- **Roadmap** needs: clear enough vision to decompose into phases, what "done" looks like
- **plan-phase** needs: specific requirements to break into tasks, context for implementation choices
- **execute-phase** needs: success criteria to verify against, the "why" behind requirements

A vague PROJECT.md forces every downstream phase to guess. The cost compounds.

</the_goal>

<how_to_question>

**Start open.** Let them dump their mental model. Don't interrupt with structure.

**Follow energy.** Whatever they emphasized, dig into that. What excited them? What problem sparked this?

**Challenge vagueness.** Never accept fuzzy answers. "Good" means what? "State of the art" means which metric? "Fast" means what latency?

**Make the abstract concrete.** "Walk me through using this." "What does that actually look like?" "What metric would tell you this works?"

**Clarify ambiguity.** "When you say Z, do you mean A or B?" "You mentioned X — tell me more."

**Know when to stop.** When you understand what they want, why they want it, who it's for, and what done looks like — offer to proceed.

</how_to_question>

<question_types>

Use these as inspiration, not a checklist. Pick what's relevant to the thread.

**Motivation — why this exists:**
- "What prompted this?"
- "What are you doing today that this replaces?"
- "What would you do if this existed?"

**Concreteness — what it actually is:**
- "Walk me through using this"
- "You said X — what does that actually look like?"
- "Give me an example"
- "What metric would tell you this is working?"

**Clarification — what they mean:**
- "When you say Z, do you mean A or B?"
- "You mentioned X — tell me more about that"

**Success — how you'll know it's working:**
- "How will you know this is working?"
- "What does done look like?"
- "What number would make you happy?"

**Research-specific:**
- "What's the current state of the art for this?"
- "Are there specific papers you've been looking at?"
- "What hardware/compute do you have available?"
- "What datasets will you use for evaluation?"

</question_types>

<using_askuserquestion>

Use AskUserQuestion to help users think by presenting concrete options to react to.

**Good options:**
- Interpretations of what they might mean
- Specific examples to confirm or deny
- Concrete choices that reveal priorities

**Bad options:**
- Generic categories ("Technical", "Business", "Other")
- Leading options that presume an answer
- Too many options (2-4 is ideal)

</using_askuserquestion>

<context_checklist>

Use this as a **background checklist**, not a conversation structure. Check these mentally as you go. If gaps remain, weave questions naturally.

- [ ] What they're building/researching (concrete enough to explain to a stranger)
- [ ] Why it needs to exist (the problem or desire driving it)
- [ ] Who it's for (even if just themselves)
- [ ] What "done" looks like (observable outcomes, target metrics)

Four things. If they volunteer more, capture it.

</context_checklist>

<decision_gate>

When you could write a clear PROJECT.md, offer to proceed:

- header: "Ready?"
- question: "I think I understand what you're after. Ready to create PROJECT.md?"
- options:
  - "Create PROJECT.md" — Let's move forward
  - "Keep exploring" — I want to share more / ask me more

If "Keep exploring" — ask what they want to add or identify gaps and probe naturally.

Loop until "Create PROJECT.md" selected.

</decision_gate>

<anti_patterns>

- **Checklist walking** — Going through domains regardless of what they said
- **Canned questions** — "What's your core value?" "What's out of scope?" regardless of context
- **Corporate speak** — "What are your success criteria?" "Who are your stakeholders?"
- **Interrogation** — Firing questions without building on answers
- **Rushing** — Minimizing questions to get to "the work"
- **Shallow acceptance** — Taking vague answers without probing
- **Premature constraints** — Asking about tech stack before understanding the idea
- **User skills** — NEVER ask about user's technical experience. Claude builds.

</anti_patterns>

<brainstorming_protocol>

## Brainstorming Protocol

Used by `discuss-phase` when exploring implementation areas. The goal is deep understanding before proposing solutions.

**CRITICAL: No solutions before understanding.**

You are gathering context, not solving problems. Do not propose approaches until you fully understand the problem space. Premature solutions anchor thinking and close off better options.

### Flow

1. **Ask questions ONE AT A TIME.** Each answer informs the next question. Never batch 3-4 questions together — it overwhelms and produces shallow answers.

2. **After 4 questions per area**, offer a check:
   - Use AskUserQuestion:
     - header: "Direction"
     - question: "We've explored [area]. What next?"
     - options:
       - "Go deeper" — More questions on this area
       - "Propose approaches" — I've shared enough, show me options
       - "Skip" — Move to next area

3. **If "Propose approaches"**, enter approach proposal mode:
   - Present 2-3 distinct approaches (not minor variations)
   - For each approach include:
     - What it is (1-2 sentences)
     - Research backing (paper references if applicable)
     - Complexity estimate (low/medium/high)
     - Risk assessment (what could go wrong)
     - Trade-offs vs alternatives
   - Use AskUserQuestion for selection:
     - header: "Approach"
     - question: "Which approach for [area]?"
     - options: the approaches + "Combine elements" + "None — explore more"

4. **Record all approach selections** in CONTEXT.md under an "Approach Selections" section with rationale.

### Anti-patterns (brainstorming-specific)

- **Solution anchoring** — Suggesting a solution in the first question ("Should we use a transformer here?")
- **Leading questions** — "Don't you think X would work?" biases toward X
- **Premature trade-off analysis** — Comparing approaches before understanding the problem
- **Skipping the "why"** — Jumping to "how" without understanding motivation
- **Question batching** — Asking 3 things at once produces shallow answers to all
- **Assumption embedding** — "How should we implement the cache?" assumes caching is needed

</brainstorming_protocol>

</questioning_guide>
