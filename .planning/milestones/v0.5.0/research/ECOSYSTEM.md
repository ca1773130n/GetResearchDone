# ECOSYSTEM — Prior Art for Interactive Research Steering (v0.5.0)

Researched: 2026-07-12. Scope: how other agent frameworks / Claude Code plugins do
socratic elicitation and human-in-the-loop (HITL) checkpoints, and what GRD should adopt
for the pre-loop interview + SEED/HYPOTHESIZE/DESIGN/DECIDE checkpoints.

---

## 1. Patterns table

| Pattern | Who uses it | Concrete rule | Adopt for GRD? |
|---|---|---|---|
| One-question-at-a-time interview | Superpowers `brainstorming` | Only ONE question per message; break topics into multiple questions; multiple-choice preferred over open-ended | YES for the pre-loop socratic interview (it is conversational, depth-first) |
| Batched structured questions | Claude Code AskUserQuestion; GRD plan-phase | 1–4 questions per call, 2–4 options each, header ≤12 chars, `Other` free-text always available, `multiSelect` for and-combinations | YES for in-loop checkpoints (cheap, single round-trip, matches plan-clarification precedent) |
| Recommended-first option ordering | AskUserQuestion convention; GRD plan-phase | Recommended option listed FIRST, label suffixed "(Recommended)" | YES — orchestrator must emit a `recommended` flag per option so both the human UI and the AI panel see the default |
| Hard question budget | Spec Kit `/clarify` (≤5 Qs); GRD plan-phase (≤4 Qs × 2 rounds) | Cap questions per session AND rounds; on budget exhaustion, fall back to recommended defaults silently | YES — reuse plan-phase numbers: max 4 questions/checkpoint, max 2 rounds, de-dupe by question TEXT not id |
| Answers recorded into the artifact | Spec Kit (`## Clarifications` section, session-dated, propagated into spec sections) | Answers are not chat ephemera — they are written into the governing document | YES — write answers into the thread state JSON (a `steering` array: checkpoint, question, answer, source human/panel, timestamp) AND reflect them in the research question / metric contract |
| Numbered elicitation menu (1–9) | BMAD advanced elicitation | Option 1 = "proceed", options 2–9 = reasoning lenses (pre-mortem, inversion, red-team, socratic…); agent halts until selection | PARTIAL — the "option 1 = proceed with default" idea maps to recommended-first; the reasoning-lens menu is overkill for v0.5.0 (note as future DESIGN-checkpoint enhancement: offer "red-team this design" as an option) |
| interrupt()/resume with typed payload | LangGraph HITL | `interrupt(value)` raises, state checkpointed under a thread id; `Command(resume=payload)` — payload becomes interrupt's return value inside the node | ALREADY ALIGNED — GRD's `status:'paused'` + `pendingGate` + `gd research resume <id>` is the same shape; extend `pendingGate` to a typed `pendingCheckpoint` carrying the question block |
| Schema-typed elicitation request | MCP elicitation (spec 2025-06-18) | Server sends `elicitation/create` with `message` + `requestedSchema` (flat object, primitive props only); response is `accept`/`decline`/`cancel` with content only on accept | YES for the checkpoint block shape: flat typed fields, and a three-way outcome (answered / skipped-use-defaults / abort-thread) |
| Pre-flight intent clarification | OpenAI Deep Research (intermediate model asks scope/format/constraint follow-ups before the loop); Gemini Deep Research (emits editable research PLAN for approval) | Clarify BEFORE committing compute; alternatively surface the whole plan for edit | YES — this is exactly the pre-SEED interview; DESIGN checkpoint = the "editable plan" variant |
| Optional gates at pipeline stage boundaries | Agent Laboratory, TinyScientist, HLER (AI-scientist family) | HITL gates at hypothesis selection, experiment approval, continue/stop; each gate individually optional; full-auto mode skips all | YES — validates the exact 4-checkpoint choice (SEED/HYPOTHESIZE/DESIGN/DECIDE) and per-gate config |
| One mechanism, two answerers | GRD lib/discussion.ts precedent; HLER "decision gates" | Same checkpoint payload answered by human (AskUserQuestion) or AI panel (multi-backend discussion) in autonomous mode | YES — core design of this milestone; checkpoint block must be answerer-agnostic |

---

## 2. Per-tool notes

### Superpowers `brainstorming` skill (read locally)
Source: `~/.claude-personal1/plugins/cache/.../skills/brainstorming/SKILL.md`.
- Hard gate: NO implementation until design presented and approved. Anti-pattern called out:
  "this is too simple to need a design" — even trivial ideas get a (short) design pass.
- Pacing: explore project context FIRST, then questions strictly one at a time; multiple
  choice preferred; "if a topic needs more exploration, break it into multiple questions".
- After questions: propose 2–3 approaches with trade-offs, LEAD with the recommendation.
- Present design in sections, get approval per section (incremental validation).
- Answers/design persisted to a dated spec file and committed; then a self-review pass
  (placeholder scan, contradiction check, ambiguity check) before the user review gate.
- Stop condition is implicit: stop asking when you can present a design ("once you believe
  you understand what you're building").
- Visual companion is offered just-in-time, never upfront — a good general principle:
  don't front-load ceremony.

### BMAD-method advanced elicitation
- After drafting each document section, agent MUST present a 1–9 menu: option 1 =
  "Proceed to next section"; options 2–9 = eight elicitation methods drawn from a method
  library (Pre-mortem, First Principles, Inversion, Red Team vs Blue Team, Socratic
  Questioning, Constraint Removal, Stakeholder Mapping, Analogical Reasoning).
- User picks a lens; the AI re-examines its own output through that lens. Free-text also
  accepted. The system halts until the user responds.
- Insight: elicitation here is *reflection selection*, not just Q&A — the human steers by
  choosing HOW the agent should critique itself. Cheap to emulate at the DESIGN checkpoint
  ("Red-team this design" as one option).
- Weakness for GRD: section-by-section halting is heavyweight; no defaults, so
  unattended runs deadlock. GRD must never block without a recommended-default fallback.

### GitHub Spec Kit `/speckit.clarify`
- Reads the spec, scans for ambiguities against a coverage taxonomy (edge cases,
  interactions, non-functional gaps), asks UP TO 5 targeted questions sequentially.
- Answers are "baked into the spec": a `## Clarifications` section with session-dated
  entries, AND the relevant spec sections are edited to reflect each answer (dual write:
  audit log + propagation).
- Positioned as a quality gate between /specify and /plan; skippable for exploratory work.
- Known issue (#1147): on some backends it presents "recommended actions with no
  clarifying question" — i.e., LLM question generation is flaky; validate the checkpoint
  block schema before surfacing, and skip malformed checkpoints rather than showing junk.
- Issue #617 (users asking to raise the 5-question limit) shows the cap should be
  config-tunable, but a default cap is right.

### Claude Code AskUserQuestion conventions
- 1–4 questions per call; 2–4 options per question; `header` ≤12 chars (tab label);
  `multiSelect: true` for select-many; UI always appends an "Other" free-text option.
- Recommended option: place FIRST and suffix label with "(Recommended)".
- Only available in interactive sessions — headless/SDK runs have no UI, which is exactly
  why the TS orchestrator must emit checkpoint blocks and let the skill layer ask
  (Spec Kit hit the same wall: issue #2181 asks it to adopt AskUserQuestion from its
  markdown prompts — GRD's skill-layer design is the pattern that works today).

### MCP elicitation spec (2025-06-18)
- Server→client `elicitation/create`: `{ message, requestedSchema }`; schema restricted to
  a FLAT object of primitive properties (string/number/boolean/enum) — deliberately not
  arbitrary JSON Schema, to keep client UIs renderable.
- Response: `action: accept | decline | cancel`; `content` only on accept. Three-way
  outcome matters: "decline" (skip this question, use default) is distinct from "cancel"
  (abort the whole operation).
- Security note: UIs must show WHO is asking; never elicit secrets.
- Adoptable: GRD checkpoint schema should be similarly flat + enum-oriented, and resume
  should accept `answers | skip (defaults) | abort`.

### LangGraph interrupts (HITL reference architecture)
- `interrupt(value)` inside a node throws a resumable exception; runtime checkpoints
  state keyed by thread id; `Command(resume=payload)` re-enters the node with payload as
  interrupt's return value.
- Requires a checkpointer or compile-time error — persistence is mandatory for HITL.
- Canonical actions on resume: approve / edit / redirect (not just yes-no).
- GRD equivalent already exists (thread JSON + `status:'paused'` + `pendingGate` in
  lib/research/gates.ts + `gd research resume <id>`). The v0.5.0 delta is: (a) the pause
  payload must carry the full question block, (b) resume must accept structured answers,
  (c) the answer must be routed back into the node that paused (e.g., DESIGN re-entry with
  an edited metric contract).

### AI-scientist-family HITL (Agent Laboratory, TinyScientist, HLER, ARIS)
- The AI Scientist v1/v2 are fully autonomous; the follow-on wave (Agent Laboratory 2025,
  TinyScientist, HLER 2026) explicitly adds OPTIONAL human gates because full autonomy
  produced misdirected/unreproducible work.
- Gate placement converges on: (1) scoping/hypothesis selection, (2) experiment/design
  approval before compute spend, (3) intermediate-result evaluation → pivot/refine/stop,
  (4) final artifact acceptance. This maps 1:1 onto GRD's SEED / HYPOTHESIZE+DESIGN /
  DECIDE / FINALIZE.
- Gates are per-checkpoint optional ("orange, optional" in TinyScientist's pipeline) —
  same as GRD's per-gate `research_gates` design.
- HLER frames gates as "human decision gates embedded within the pipeline" where humans
  select among machine-generated candidates — i.e., the agent always produces the option
  set; the human only picks. That keeps checkpoints cheap and answerable by an AI panel.

### Deep Research products (OpenAI / Gemini)
- OpenAI: a cheaper intermediate model runs the clarification interview (scope, output
  format, constraints) BEFORE the expensive research loop — "intent-to-planning".
- Gemini: skips Q&A; instead emits the full research plan for user review/edit before
  execution — "unified intent-planning".
- GRD can have both: pre-SEED interview = OpenAI style; DESIGN checkpoint (approve/edit
  the experiment plan + metric contract) = Gemini style.

---

## 3. Recommendations for GRD v0.5.0

1. **One checkpoint schema, two surfaces.** Orchestrator emits a typed
   `pendingCheckpoint` in the thread JSON (superset of today's `pendingGate`):
   `{ id, phase: 'seed'|'hypothesize'|'design'|'decide', message, questions: [{ ask,
   header (≤12 chars), options: [{ label, description, recommended? }], multiSelect? }] }`.
   Keep it MCP-elicitation-flat (enums + strings only) so any surface can render it.
   `commands/research.md` maps it 1:1 onto AskUserQuestion; autonomous mode maps it onto
   `lib/discussion.ts` panel prompts. Record `answeredBy: 'human' | 'panel' | 'defaults'`.

2. **Reuse the plan-clarification numbers verbatim** (proven in-repo, matches Spec Kit's
   ceiling): ≤4 questions per checkpoint, ≤2 rounds per checkpoint, de-dupe by question
   TEXT across rounds, recommended option first + "(Recommended)" label. On budget
   exhaustion or `decline`, proceed with recommended defaults — never deadlock (BMAD's
   failure mode).

3. **Three-way resume semantics** (from MCP elicitation): `gd research resume <id>`
   accepts answers (proceed with them), skip (proceed with recommended defaults), or
   abort (kill thread). Distinct from the existing binary gate approve/deny.

4. **Pre-loop interview is conversational; in-loop checkpoints are batched.** The
   pre-SEED socratic interview follows Superpowers pacing: context first, one question at
   a time, multiple-choice preferred, stop when the question is crisp enough to state a
   falsifiable metric target (that's the stop condition — not a fixed count). In-loop
   checkpoints use one batched AskUserQuestion call (cheap, resumable, panel-friendly).

5. **Record answers Spec Kit-style, twice.** (a) Append to a `steering` log in the thread
   state (question, answer, source, timestamp — audit trail, feeds LEARN/reflections);
   (b) propagate into the governing artifact: SEED answers rewrite the research question,
   DESIGN answers pin the metric/comparator/target (same pinning discipline as
   `research_max_debug_depth` re-plans), DECIDE answers set iterate/stop.

6. **Checkpoints offer machine-generated candidates, never open prompts** (HLER pattern):
   HYPOTHESIZE presents the ranked candidate hypotheses; DECIDE presents
   iterate/pivot/stop with the orchestrator's recommendation. This keeps the AI-panel
   answerer viable — a panel can pick among options far more reliably than it can
   free-associate.

7. **Auto-skip matrix identical to plan_clarification**: skip when `autonomous_mode`,
   under autopilot, `--no-gates`, or non-interactive spawn — but in autonomous runs route
   to the discussion panel instead of skipping outright (config:
   `research_gates.steering_fallback: 'defaults' | 'panel'`).

8. **Validate before surfacing** (Spec Kit #1147 lesson): if a checkpoint block fails
   schema validation (no questions, >4 questions, malformed options), log and proceed with
   defaults rather than showing a broken prompt.

9. **Future (not v0.5.0):** BMAD-style reasoning-lens option at the DESIGN checkpoint
   ("Red-team this design before running") as one extra option — zero schema change needed.

---

## Sources

- Superpowers brainstorming SKILL.md (local: `~/.claude-personal1/plugins/cache/temp_git_1783791133213_seui89/skills/brainstorming/SKILL.md`)
- [BMAD advanced elicitation docs](https://docs.bmad-method.org/explanation/advanced-elicitation/) · [SKILL.md](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/core-skills/bmad-advanced-elicitation/SKILL.md)
- [GitHub Spec Kit](https://github.com/github/spec-kit) · [clarify tutorial](https://codestandup.com/posts/2025/github-spec-kit-tutorial-specify-clarify-commands/) · [issue #617 question limit](https://github.com/github/spec-kit/issues/617) · [issue #1147 no-question bug](https://github.com/github/spec-kit/issues/1147) · [issue #2181 AskUserQuestion adoption](https://github.com/github/spec-kit/issues/2181)
- [Claude Code Agent SDK — user input / AskUserQuestion](https://code.claude.com/docs/en/agent-sdk/user-input) · [AskUserQuestion guide](https://www.atcyrus.com/stories/claude-code-ask-user-question-tool-guide)
- [MCP elicitation spec 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)
- [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [TinyScientist (arXiv 2510.06579)](https://arxiv.org/pdf/2510.06579) · [HLER (arXiv 2603.07444)](https://arxiv.org/pdf/2603.07444) · [ARIS (arXiv 2605.03042)](https://arxiv.org/html/2605.03042)
- [Deep research agent architectures (Zylos)](https://zylos.ai/research/2026-04-21-deep-research-agent-architectures) · [OpenAI deep research guide](https://developers.openai.com/api/docs/guides/deep-research) · [Gemini Deep Research](https://ai.google.dev/gemini-api/docs/interactions/deep-research)
