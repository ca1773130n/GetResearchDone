# Wiring mattpocock/skills' agentic-engineering philosophy into GRD

**Date:** 2026-09-02
**Status:** Design / implementation triage
**Source:** `mattpocock/skills` (checkout at `~/.blackhole/GetResearchDone/2026-09-02/mattpocock-skills`)
**Scope:** eleven accepted changes (W1-W10, with W4 split into W4a and W4) across `commands/`, `agents/`, `references/`, `lib/research/`, `lib/knowledge.ts`, `lib/commands/`, `bin/`

## Caveat upfront

The source repository is a suite of Claude Code skills for a single author's
workflow. Its packaging - buckets, plugin manifest arrays, docs-page templates,
symlink dev loops - is a solution to *his* distribution problem, not to GRD's.
What transfers is the **discipline**. The source states the premise - a written
instruction is a probability, not a guarantee - and then repeatedly reaches for
a checkable artifact instead of a stronger adjective. *"Artifact-shaped rather
than emphatic"* is **this document's** name for that move; the source never uses
the phrase. Every change below is that move applied at a seam GRD already has.
Nothing below adds a directory, a tier, a manifest key, or a second loading
contract.

Every file path and line number in this document was verified against the
working tree on 2026-09-02. Where the source proposals cited a wrong line, a
wrong file, or a wrong description of current behaviour, the correction is
recorded in **Verified anchors** and the change is scoped to what is actually
there.

---

## 1. What mattpocock/skills actually gets right

Nine principles, stated as mechanisms. The names in the first column are this
document's shorthand - the source names none of them. Everything inside
quotation marks is verbatim from the file cited beside it.

| # | Principle | Mechanism | Source |
| --- | --- | --- | --- |
| 1.1 | Artifact-shaped gates, never emphatic ones | A written instruction is a probability, not a guarantee, and the fix is not a stronger adjective. The docs record a model reading the rule and ignoring it anyway - *"I knew the skill said 'one test at a time, watch it fail for the right reason'. I read it. I just defaulted to my normal habit."* What the source reaches for instead is a step precondition that is a **named artifact** a parser or a human can check: `diagnosing-bugs` does not say "be rigorous", it says *"No red-capable command, no Phase 2."* | `docs/engineering/tdd.md:59`; `skills/engineering/diagnosing-bugs/SKILL.md:66` |
| 1.2 | Falsifiability is an admission test at the moment of proposal | A hypothesis is rejected at birth, not reviewed for quality afterwards: *"Each hypothesis must be **falsifiable**: state the prediction it makes. ... If you cannot state the prediction, the hypothesis is a vibe: discard or sharpen it."* The prediction uses a fixed template naming two opposite directions: `Format: "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."` Cost: one required field. Payoff: an unfalsifiable idea never consumes an experiment. | `skills/engineering/diagnosing-bugs/SKILL.md:92-96` |
| 1.3 | The oracle must be independent of the thing under test | An assertion that recomputes the expected value the way the code does passes by construction. Reproduced in full below - it is the one principle W3 and W8 are reasoned directly against. | `skills/engineering/tdd/SKILL.md:31` |
| 1.4 | A findings tool needs a channel for "I found nothing" | A system built to emit findings is biased toward emitting them, and the source names its own bias rather than claiming to have removed it: *"The skill is built to output findings, so the framing pushes it toward producing candidates rather than concluding that nothing is wrong."* The mitigation is a graded strength badge (`Strong` / `Worth exploring` / `Speculative`), and the calibration reading is the useful part: *"a report where everything is `Speculative` is the skill telling you it found nothing, in the only way it knows how."* | `skills/engineering/improve-codebase-architecture/SKILL.md:50`; `docs/engineering/improve-codebase-architecture.md:80` |
| 1.5 | Every finding carries a citation, or it is not checkable | *"Sub-agent output is a hypothesis, not evidence."* Each finding must therefore name a standards rule, a quoted hunk, or a spec line. The point is not politeness: an uncited finding costs a reader the whole investigation to verify, so it will not be verified. | `docs/engineering/code-review.md:68`; `skills/engineering/code-review/SKILL.md` |
| 1.6 | A durable record is gated conjunctively, and never deleted | Writing to permanent memory is refused by default, on three tests that must all pass: *"If a decision is easy to reverse, skip it: you'll just reverse it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record beyond 'we did the obvious thing.'"* Coverage explicitly does not qualify - *"Material that was merely covered. Coverage is not learning. Wait for evidence."* And a contradicting later record marks the earlier one *"`Status: superseded by LR-NNNN` rather than deleting it"*, because *"the history of how understanding evolved is itself useful signal."* | `skills/engineering/domain-modeling/ADR-FORMAT.md:37`; `skills/productivity/teach/LEARNING-RECORD-FORMAT.md:40`, `:46` |
| 1.7 | Steer by the positive; terminate on a structural condition | *"steering by prohibition drags the forbidden behaviour into context and makes it more available, not less. Don't think of an elephant ... the negation is a weak modifier the strongly-activated concept overruns, so the ban half-reads as an instruction to do the thing."* Termination is structural too, not felt: *"A workflow spec is done when an implementer agent could build it without asking a single question"* is checkable; "when it seems clear enough" is not. | `skills/productivity/writing-for-agents/SKILL.md:74`; `skills/in-progress/loop-me/SKILL.md:27` (draft bucket, see **Sources**) |
| 1.8 | Restating the environment is a cache, and it goes stale | *"a document that restates it is a **cache**: a copy of a lookup, earning its load only when the lookup is expensive. Cache what the agent cannot find by looking."* The corollary antipattern is a router that lies: *"a new skill it never mentions, or a stale one it still routes to."* A hand-typed catalog of a directory is a cache with no invalidation. | `skills/productivity/writing-for-agents/SKILL.md:79` |
| 1.9 | A pointer's wording is the mechanism, and a dead pointer is a no-op | *"The pointer's wording, not its target, decides when the agent reaches the material, and how reliably. A must-have target behind a weakly worded pointer is a variance bug: sharpen the wording first, and inline the material only if sharpening fails."* Two named failures follow: **duplication** - *"the same meaning in more than one place ... inflates a meaning's prominence on the ladder past its real rank"* - and **sediment** - *"stale layers that settle because adding feels safe and removing feels risky, until you must core down through them to find what is still live."* | `skills/productivity/writing-for-agents/SKILL.md:12`, `:78`, `:80` |

One quote is reproduced in full, because W3 and W8 are argued directly from it:

> "the assertion recomputes the expected value the way the code does ... so it
> passes by construction and can never disagree with the code. Expected values
> must come from an independent source of truth: a known-good literal, a worked
> example, the spec."

Generalised: a measurement produced by the artifact being measured cannot
disconfirm it. That is exactly the shape of a one-script experiment which both
computes and reports the number it is judged on.

---

## 2. Where GRD stands against each principle

| Principle | GRD position | Evidence |
| --- | --- | --- |
| 1.1 Artifact-shaped gates | **Better than source, on one path.** GRD's verdict is pure arithmetic over a pinned `(metricKey, comparator, target)` with no LLM on the control path, and the metric contract is overwritten back to the committed value across every debug retry so the goalposts cannot move. The source has no equivalent; its gates are prompts. | `lib/research/verdict.ts:18-34`; `lib/research/orchestrator.ts:1211-1214` |
| 1.1 (cont.) | **Better, structurally.** Privilege separation is enforced by tool grants, not by an invocation flag: `grd-experiment-runner` is denied Bash, so it cannot run the experiment it designs. | `agents/grd-experiment-runner.md` frontmatter; `agents/grd-research-evaluator.md:8-11` |
| 1.2 Falsifiability as admission | **Gap.** The hypothesis contract is `{statement, rationale, predictedOutcome}`. Nothing asks what would refute it, and `predictedOutcome` is compared to nothing by any code - it surfaces only as free text in a DEAD-ENDS evidence line. The agent card asserts falsifiability in one sentence and requires nothing. | `lib/research/types.ts:108-119`; `lib/research/promote.ts:62`; `agents/grd-hypothesizer.md:26-30` (30 lines total) |
| 1.3 Independent oracle | **Gap.** `ExperimentPlan` is one script producing one number, with no baseline, no seed, no repetitions. The code admits the seed gap in a comment: *"GRD records no seed ... so a `seed_recorded` field would always be false and is omitted."* | `lib/research/types.ts:121-129`; `lib/research/reconstructability.ts:6-8` |
| 1.4 Calibration channel | **Partial.** The research loop has an advisory structural score appended to FINDING.md and correctly forbids it from gating. The code reviewer has nothing: severities are BLOCKER/WARNING/INFO only, so an unrun check falls through to the template's default fill-ins (`{findings or "Adequate."}`, `{findings or "SUMMARY.md matches git history."}`) and reads as a pass. | `lib/research/reconstructability.ts:3-5`, `lib/research/orchestrator.ts:436-460`; `agents/grd-code-reviewer.md:250-254` (fill-ins), `:271-288` (severity enum) |
| 1.5 Citations on findings | **Better, in one agent; absent in its sibling.** `agents/grd-verifier.md:37-76` is the strongest prompt in the repo: four enumerated evidence kinds, a banned-phrasings list, and "if a check did not produce a line you can quote, the check did not run". `grd-code-reviewer.md` mirrors none of it and can assert a BLOCKER with no file:line. | `agents/grd-verifier.md:37-76`; `agents/grd-code-reviewer.md` (no `evidence_standard`) |
| 1.6 Conjunctive write gate | **Gap, and the current gate is a self-report.** The entire write gate on GRD's durable memory is `KNOWHOW_KINDS.has(t.kind) && t.confidence >= 0.5`, where `confidence` is a float the writing agent invented about its own output in the same turn. | `lib/research/promote.ts:46` |
| 1.6 Supersede, never delete | **Gap, and worse than the proposals claimed.** On a `pattern_name` collision `appendKnowhowEntries` silently overwrites when `e.phase_number >= current.phase_number`. Research-loop entries all carry `phase_number: 0`, so `0 >= 0` holds and a corrected belief destroys its predecessor with no record. | `lib/knowledge.ts:128-160`; `lib/research/promote.ts:34-42` |
| 1.6 (dead ends) | **Better than source.** `.planning/DEAD-ENDS.md` has an upsert-by-slug with an active/reopened transition *and* a hard deterministic consumer: a candidate plan citing a dead-end slug is scored `-Infinity` and filtered before selection, with no LLM on the path. The source's `.out-of-scope/` registry is read by a prompt. | `lib/dead-ends.ts:349-411`; `lib/commands/select-candidate.ts:222-254` (detection), `:467-469` (`-Infinity` scoring), `:580` (the sink that sorts hard-fails to the bottom) |
| 1.7 Positive steering | **Inverted, at the highest-leverage prompt.** `buildClarifyPrompt` tells the agent that will form the hypothesis: *"Do NOT invent ambiguity: if the question is already precise enough to design an experiment, emit an EMPTY dimensions array - that is the expected, common case."* Prohibition plus a stated expectation of finding nothing. | `lib/research/_prompts.ts:151-155` |
| 1.7 (termination) | **Better, in the human-facing half.** `commands/research.md:41-44` already states the structural stop: stop the moment a metric, a comparator from the enum, and a target threshold exist. The machine path does not use it. | `commands/research.md:41-44` vs `lib/research/_prompts.ts:151-155` |
| 1.8 Environment caching | **Gap.** `commands/help.md` hand-types the command catalog. 12 of 48 shipped commands are absent from it (`autopilot`, `autoplan`, `discover`, `evolve`, `harness`, `long-term-roadmap`, `migrate`, `principles`, `requirement`, `research`, `resume-project`, `wireup`), `/grd:resume-work` is advertised three times and does not exist, and line 366 tells the model to read command metadata "{from plugin.json}", which carries only identity and hooks. All 48 command files already carry `description:`; 39 carry `argument-hint:`. | `commands/help.md:157`, `:317`, `:366`; `commands/pause-work.md:72`; `.claude-plugin/plugin.json` |
| 1.9 Dead pointers | **Two confirmed.** `commands/init.md:137` says "Consult `questioning.md`" and `:146` says "mentally check the context checklist from `questioning.md`", and `init.md` contains zero `@${CLAUDE_PLUGIN_ROOT}` includes. `commands/execute-phase.md:32` names "the `execute-plan.md` context block" in prose the executor never receives. | `commands/init.md:137`, `:146`; `commands/execute-phase.md:32` |
| 1.9 Duplication | **Confirmed, with observed drift.** Four near-identical `grd-executor` Task() blocks in `execute-phase.md`, one per cell of the teams x isolation matrix. The two team variants dropped the concrete commit example and the backticks that the two standard variants still carry. | `commands/execute-phase.md:175`, `:248`, `:409`, `:474`; drift at `:227-231` vs `:452-457` |
| 1.9 Sediment | **Confirmed, 1,123 lines; 1,240 with the seventh.** Six reference files have zero `@`-include sites and zero bare-name citations anywhere outside the file manifest and a structure diagram. A seventh is reachable only through one of them. | See **Verified anchors** |

---

## 3. Verified anchors

Only the claims where checking the tree **changed a decision**, plus the two
anchor sets no W-section restates. Claims that survived the check unchanged are
cited inline where they are used, not listed here.

| Claim | Correction | Evidence |
| --- | --- | --- |
| "autopilot never produces VERIFICATION.md, so E7's call site is a no-op" | **Corrected in substance, conclusion preserved.** `lib/autopilot.ts` does contain zero matches for verify/VERIFICATION/grd-verifier, but that is because it delegates: `lib/autopilot.ts:593` builds a prompt invoking the `grd:execute-phase` skill, and `commands/execute-phase.md:914-972` (`<step name="verify_phase_goal">`) spawns `grd:grd-verifier` at `:933`. Autopilot **does** reach verification. E7's TS call site is still wrong, for a different reason: autopilot does not own the step. | `lib/autopilot.ts:593`; `commands/execute-phase.md:914`, `:933` |
| There are two VERIFICATION.md-producing paths, not one | **Corrected.** P1 asserted `commands/verify-phase.md` is the only producer. `commands/execute-phase.md:933` spawns `grd:grd-verifier` with its own inline prompt and does not pass `verify-phase.md`'s body. Both call sites are needed. | `commands/verify-phase.md:271`, `:293`; `commands/execute-phase.md:914`, `:974` |
| `agents/*.md` can carry `@${CLAUDE_PLUGIN_ROOT}` includes | **Line numbers corrected; still unproven by test.** Five agent files already do: `grd-planner.md:706`, `:1533-1534`; `grd-verifier.md:850-851`; `grd-executor.md:640-641`; `grd-roadmapper.md:322-323`; `grd-eval-reporter.md:532-533`. The proposals cited `grd-planner.md:1531` and `grd-executor.md:449`; the real lines are above. House idiom, but no test covers resolution in a subagent spawn, and `commands/plan-phase.md:227` documents that `@` does not cross Task() boundaries for *commands*. | as listed |
| E6's "skip or duplicate on collision" | **Corrected.** Current behaviour is **silent overwrite**: `if (!current \|\| e.phase_number >= current.phase_number) byName.set(...)`. Research entries all set `phase_number: 0`, so a later entry with the same 200-char `pattern_name` prefix wins and the earlier one is gone. That overwrite is the actual defect. | `lib/knowledge.ts:145-147`; `lib/research/promote.ts:34-42` |
| Superseded entries must be filterable at one place | **Corrected file.** The injection funnel is `buildKnowledgeInjectionBlock` / `selectTopEntries` in `lib/knowledge.ts`, called from `lib/context/execute.ts:425` and again for the planner at `:726`. The filter belongs in `lib/knowledge.ts`, not in `lib/context/execute.ts`. | `lib/knowledge.ts:176`, `:243`; `lib/context/execute.ts:423-428`, `:726` |
| The reconstructability rendering lives in `finding.ts` | **Corrected.** `buildFinding` does not touch reconstructability. The score is appended by `reconstructabilitySection` in the orchestrator, at `:863` and `:1324` - which is where W8's baseline delta belongs, not in `finding.ts`. | `lib/research/finding.ts`; `lib/research/orchestrator.ts:436-460` |
| `bin/harness_driver.py` offers the round proposer a target that does not exist | **Confirmed, and the proposed one-line fix corrected.** `PROPOSAL_INSTRUCTIONS` line 210 lists "skill markdown"; there is no `skills/` directory and no `skills` key in `.claude-plugin/plugin.json`. The predicate is `if (/^(commands\|agents\|skills\|hooks)\//.test(n)) return 'prompt';` - so it would classify a hypothetical `skills/` path as `prompt`, but **`references/` is not in the alternation** and `_classifyPath('references/questioning.md')` returns `'code'` (run verbatim, 2026-09-02). Retargeting the proposer at `references/` is therefore a two-file change, not one string. | `bin/harness_driver.py:210`; `lib/commands/harness-conversion.ts:123` |
| Six reference files are orphaned; a seventh transitively | **Count corrected to 6+1 - 1,123 lines for the six, 1,240 with the seventh.** Zero `@`-includes and zero bare-name citations: `research-methodology.md` (541), `planning-config.md` (384), `phase-argument-parsing.md` (61), `decimal-phase-calculation.md` (65), `git-planning-commit.md` (40), `model-profile-resolution.md` (32). `model-profiles.md` (117) is reachable only from `model-profile-resolution.md:15`. The proposals claimed 8-9 files / 1,476 lines; `git-integration.md` is genuinely reachable via `references/execute-plan.md:9`, and `questioning.md` is a live dead-pointer case, not a deletion candidate. | per-file include scan, 2026-09-02 |
| `docs/DEPRECATIONS.md` is a general deprecation register | **Corrected, and the proposed use of it dropped.** It exists but its content is a "Command surface trim plan (DRAFT for v0.4.x)" - not a file register. Recording the deletions there would need a new section, and outside `grd-file-manifest.json:637-647` and `.planning/codebase/STRUCTURE.md:269-281` the seven files have **zero referrers** in the tree (`model-profiles.md` also appears in one archived v0.3.7 phase summary, which is history, not a load site). Announcing the removal of a file nothing loads is a document nobody reads; the two live indexes must be updated in the same commit, the commit message carries the seven names, and `git log` is the register. | `docs/DEPRECATIONS.md:1-9`; `grd-file-manifest.json:637-647`; `.planning/codebase/STRUCTURE.md:269-281`; repo-wide referrer scan, 2026-09-02 |

---

## 4. The wiring

Eleven changes, ordered by leverage per line - ten numbered W1-W10, with W4
split into an independent bug fix (**W4a**) and the philosophy change it was
riding in. Effort is S (under a day), M (a day or two), L (a week). None adds a
directory; exactly one adds a config key, and that one adds it because the
behaviour it introduces is irreversible in the artifact it writes.

### W1. Auto-promote falsified phase reflections into DEAD-ENDS

**Principle:** 1.1 (artifact-shaped gate), 1.6 (only genuine rejections enter the KB).

**What.** `cmdDeadEndPromoteFromPhase` is finished, idempotent by the slug
upsert, and refuses `confirmed`/`partial`/`unknown` with a stated reason. It is
called by nothing but a human typing a CLI subcommand, while the research-level
path promotes automatically (`lib/research/promote.ts:84-86`). Two steps:

1. Extract a pure `promoteFalsifiedFromPhase(cwd, phase): { action, slug, skipped, reason }`
   out of the CLI wrapper. `cmdDeadEndPromoteFromPhase` becomes a thin formatter.
   This matters: `output()` and `error()` in `lib/utils.ts` *are* the
   `process.exit` abstraction and must not sit on a library call path.
2. Add one non-blocking step at **both** producing call sites:
   `commands/execute-phase.md` between `<step name="verify_phase_goal">` (:914)
   and `<step name="update_roadmap">` (:974), which covers autopilot; and
   `commands/verify-phase.md` between `<step name="create_report">` (:271) and
   `<step name="tracker_comment">` (:293), which covers `/grd:verify-phase`.
   Both run `node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js dead-end promote-from-phase --phase <N>`
   and report the returned `action` / `skipped.reason`. Double invocation is safe
   because the slug upsert is idempotent.
3. Gate the write on `research_gates.auto_promote_falsified`, **default false**.
   Unset or false, the step runs in dry-run: it prints the entry it *would*
   write and writes nothing. This is the one config key in the plan, and it is
   here because the failure mode is otherwise permanent, silent and
   un-switchable - see **Risk**. It mirrors `research_gates.interactive`, which
   already defaults off (`lib/research/checkpoints.ts:355`).

**Files.** `lib/dead-ends.ts`, `bin/grd-tools.ts`, `commands/execute-phase.md`,
`commands/verify-phase.md`, `tests/unit/dead-ends.test.ts`.

**Effort.** S.

**Risk.** Populating DEAD-ENDS harder makes `select-candidate` reject more
candidate plans, and the consequence is `-Infinity`
(`lib/commands/select-candidate.ts:467-469`), not a warning: there is no tier
between "allowed" and "excluded". A loosely written `verdict: falsified` row
permanently forbids every future plan citing that slug, and nothing in the
pipeline surfaces the exclusion at the moment it bites. That is why step 3
exists. "Watch the first ten auto-promotions" is human vigilance substituting
for a gate, which is the substitution principle 1.1 says does not work; the
default-false key is the artifact-shaped form of the same caution. Keep
`parseReflectionSection`'s strict requirements unchanged, and log every
auto-promotion (dry-run or real) at the phase boundary. W2 is the upstream fix
for vague slugs.

**How you would know it worked.** With `auto_promote_falsified` unset, a phase
whose VERIFICATION.md carries `verdict: falsified` prints the entry it would
write and `.planning/DEAD-ENDS.md` is byte-identical afterwards. With the key
true, the same phase gains the entry with no human action, and a second run
reports `updated`, not a duplicate. A phase with `verdict: confirmed` writes
nothing either way and the step prints a skip reason.

### W2. Require a refutation condition on every hypothesis, enforced in the parser

**Principle:** 1.2 (falsifiability as an admission test), 1.1 (artifact, not exhortation).

**What.** Add `refutationCondition` - the observation that would show the
hypothesis false - to the emitted JSON in both `buildHypothesizePrompt`
(`__HYPOTHESIS__`) and `buildHypothesesPrompt` (`__HYPOTHESES__`), phrased with
the source's template **carrying both branches**: *"If \<X\> is the cause, then
\<changing Y\> will make the bug disappear / \<changing Z\> will make it
worse."* Both directions are named on purpose - a prediction that only points
one way is half the template. Add `refutationCondition?: string` to `Hypothesis`
(optional in the type even though the prompt requires it, matching the
back-compat pattern at `types.ts:100-105`, so pre-0.5.0 threads still load).
Enforce it in `parseHypothesisOutput` / `parseHypothesesOutput`
(`lib/research/agent-io.ts:32`, `:51`) with a **structural** admission test
only: drop a candidate whose `refutationCondition` is absent or empty. Nothing
else. Zero surviving candidates is already handled - the orchestrator treats an
empty candidate set as a parse miss, `spawnAndParse` retries, and the
multi-candidate branch degrades to the single-block path. Do not reach for an
LLM judge here; that would put a model back on the admission path.

**Explicitly not a near-restatement check.** An earlier draft dropped candidates
whose `refutationCondition` overlapped `statement` above a Jaccard threshold,
borrowing the shape at `select-candidate.ts:249`. Two reasons it is out. First,
the mandated template maximises exactly what such a check punishes: "If X is the
cause, then changing Y makes the bug disappear" reuses most of the statement's
tokens by construction, so the rule would fire hardest on the best-formed
answers. Second, the borrowed mechanism is advisory *by design* - the comment at
`select-candidate.ts:247-248` reads "Advisory Jaccard always computed for the
audit trail ... Threshold 0.6 is a v0.4 guess; Phase 5 may tune from data" - and
promoting a self-described guess into a silent blocking gate is the opposite of
an artifact-shaped one. Compute the overlap and **log** it beside the candidate,
mirroring `checkDeadEnds`'s advisory array; branch on it only once a threshold
has been tuned against data.

Fold in the surviving half of E3's provenance rule: pass the retrieved-node
count into the prompt and require the rationale to say so when it is zero,
rather than inventing related work. `sourceNodeIds` stays **optional** and is
never a parse-miss trigger - the grounding retrieval degrades silently
(`orchestrator.ts:1055-1058`), so a mandatory field would be `[]` on exactly
the path where it matters.

Thread `refutationCondition` into the DEAD-ENDS evidence line
(`lib/research/promote.ts:53-62`) so a refuted hypothesis records what refuted
it. Update `agents/grd-hypothesizer.md` in the same commit; note that its
output contract has already drifted from `_prompts.ts` (the agent file knows
nothing about `__HYPOTHESES__` or `__CLARIFY__`), so the edit doubles as a
drift repair.

**Files.** `lib/research/_prompts.ts`, `lib/research/types.ts`,
`lib/research/agent-io.ts`, `lib/research/promote.ts`,
`agents/grd-hypothesizer.md`, `tests/unit/research/_prompts.test.ts`,
`tests/unit/research/agent-io.test.ts`, `tests/unit/research/promote.test.ts`.

**Effort.** M.

**Risk.** Parser-level rejection burns retries on loosely-complying models.
Bound it by reusing `spawnAndParse`'s existing retry budget rather than adding
one. With the near-restatement clause dropped, the admission test has no tunable
threshold and no judgement call left in it: a field is present or it is not.
Does not touch the verdict path, so kernel parity is unaffected.

**How you would know it worked.** `.planning/research/threads/<id>/ledger` shows
a `refutationCondition` on every hypothesis; a synthetic run where the agent
omits the field is rejected and retried; the overlap score is present in the
ledger and gates nothing; the DEAD-ENDS evidence line
for a refuted hypothesis names the observation rather than only the prediction.

### W3. Separate "the design was never testable" from "the run broke"

**Principle:** 1.1 (a symptom that yields a structural verdict), 1.3 (the design must be able to disconfirm).

**What.** `evaluateVerdict` returns `inconclusive` for two unrelated failures: a
nonzero exit (an engineering failure) and a metric key the script never emitted
(a design failure - the plan committed to be judged on a number its own script
does not produce). The debug retry loop is written
`for (let attempt = 1; attempt <= debugDepth && result.exitCode !== 0; attempt++)`
(`orchestrator.ts:1215`), so the case that indicts DESIGN gets no repair attempt
at all and `detectPlateau` counts it as one more failed iteration.

Add a non-verdict discriminator `cause?: 'run_failed' | 'metric_absent'` to
`MeasureOutcome` (`types.ts:151`), set beside the existing `detail` string.
Leave the `Verdict` union and every returned verdict value byte-identical -
this is additive metadata beside the arithmetic, not a change to it, and
`parity-vectors.test.ts:33` asserts only `.verdict`.

Route `cause === 'metric_absent'` to `designResolution = 'revise'`
(`orchestrator.ts:892-914`, consumed at `:1035`), **not** to the debug loop. A
script that never emits its committed metric is a design fault and belongs back
at the station that caused it; the revise path already re-runs DESIGN on the
same hypothesis and emits a checkpoint at the incremented round. Share the
bound with `research_max_debug_depth` rather than adding a config key. Surface
`cause` in `buildLearnPrompt` so the takeaway names a design fault rather than
an environment fault.

Feed `cause` into `detectPlateau`'s input **with a named branch**, or not at
all: N consecutive `metric_absent` iterations terminate the thread with its own
terminal reason (the harness cannot design a measurable experiment for this
question) instead of counting toward the ordinary plateau window, which reads as
"the hypotheses keep getting refuted" and is a different diagnosis. A `cause`
that only makes two streaks *distinguishable* without changing what happens next
is a field written for a reader who does not exist - the same objection this
document raises against E2 in section 5.

**Files.** `lib/research/verdict.ts`, `lib/research/types.ts`,
`lib/research/orchestrator.ts`, `lib/research/_prompts.ts`,
`tests/unit/research/verdict.test.ts`, `tests/unit/research/orchestrator.test.ts`.

**Effort.** M.

**Risk.** The verdict path is version-locked to the vendored
`autoresearch-core` kernel (`kernel-contract.test.ts`, `parity-vectors.test.ts`,
`vendor-autoresearch-core.test.ts`). Adding a new `Verdict` value would break
parity; this deliberately adds only an optional sibling field, and the parity
suite asserts nothing but the verdict string -
`expect(evaluateVerdict(plan, result).verdict).toBe(c.expect_verdict)`
(`tests/unit/research/parity-vectors.test.ts:33`) - so an added sibling on
`MeasureOutcome` is invisible to it. Assert in the
verdict tests that the returned verdict string is unchanged for both causes.
Second risk: a re-plan that keeps producing an unmeasurable design burns
iterations, so the depth bound must be *shared with*, not additive to,
`research_max_debug_depth`.

**How you would know it worked.** A thread whose script prints the wrong metric
key re-enters DESIGN with the same hypothesis instead of consuming a fresh one;
`plan.json` for the second attempt carries the same committed metric contract;
the parity vectors still pass unchanged.

### W4a. Make the code reviewer's shipped checks executable

**Principle:** 1.1 (a check whose command cannot run is not a gate).

**What.** Three checks in `agents/grd-code-reviewer.md` cannot run today, for
reasons that have nothing to do with epistemics. `${FILES_MODIFIED}` is
interpolated at `:101` and `:170` and `${FIRST_COMMIT}^..${LAST_COMMIT}` at
`:198`; none of the three variables is defined in the file or documented as
prompt-injected. And the "pattern consistency" block at `:151-154` is a fenced
bash block containing two comment lines and no command. Derive the variables
from `git diff --name-only` inside `<step name="load_context">` (`:34`), and
either fill the empty block with the check it was meant to hold or delete it.

This is a bug fix with no dependencies, no philosophy attached, and no shared
files with anything else in the first slice. It was originally step 4 of W4,
which is hard-gated on the top open question in section 7; sequencing an
independent fix behind a blocked change is how a one-line repair waits a month.

**Files.** `agents/grd-code-reviewer.md`.

**Effort.** S.

**Risk.** Near zero. The failure being fixed is that a command interpolates an
undefined variable; the worst outcome of a wrong derivation is that the same
check still does not run, which is the status quo.

**How you would know it worked.** Running the three commands from a review
transcript against a real branch produces output rather than an empty or
malformed `git diff` argument, and the pattern-consistency block either executes
something or is gone.

### W4. One evidence standard, shared by both claim-making agents, with an honest "not checked"

**Principle:** 1.5 (citations), 1.4 (calibration channel), 1.9 (duplication is an antipattern).

**What.** `agents/grd-verifier.md:37-76` already holds the best epistemic
artifact in the repo. `agents/grd-code-reviewer.md` mirrors none of it, so a
BLOCKER can be asserted with no file:line and no command output. Three edits
(the fourth, fixing the unrunnable commands, has been split out as **W4a** and
ships in the first slice):

1. Move `<evidence_standard>` into `references/verification-patterns.md` as a
   single copy and `@`-include it from both `agents/grd-verifier.md` and
   `agents/grd-code-reviewer.md`. That file's only current `@`-include site is
   `commands/verify-phase.md:31` - it is *not* included from
   `agents/grd-verifier.md`, so both agent includes are new. This is house idiom
   (`agents/grd-verifier.md:850-851` and four other agents already `@`-include
   references). **Verify the include resolves in a subagent spawn before
   deleting the inline copy** - `commands/plan-phase.md:227` documents that `@`
   does not cross Task() boundaries for commands, and GRD already carries two
   dead citations. Pasting a second copy instead, as the winning proposal
   originally specified, would manufacture exactly the drift the change exists
   to prevent.
2. Add a fourth severity `UNVERIFIED` to `<severity_definitions>` (`:271-288`),
   defined as "the check did not run, or produced no line I can quote", and
   change the REVIEW.md template defaults at `:250-254` so an unrun check renders
   as UNVERIFIED rather than as `{findings or "Adequate."}` and
   `{findings or "SUMMARY.md matches git history."}`, both of which read as a
   pass.
3. Add an Evidence column to the findings table (`:256-261`), one of the four
   evidence kinds per row.

Preserve `<step name="artifact_exclusions">` (`:58-67`) verbatim, or the
false-positive class it kills comes back.

**Files.** `references/verification-patterns.md`, `agents/grd-code-reviewer.md`,
`agents/grd-verifier.md`, `tests/unit/agent-audit.test.ts`.

**Effort.** M.

**Risk.** Reviews get noisier before they get better: checks that have been
quietly passing will start reporting UNVERIFIED. That is the point, and it
belongs in the release note. The include-resolution check is a hard gate on
step 1; if it fails, keep both copies and open a separate issue rather than
shipping a dead pointer.

**How you would know it worked.** A review run against a branch with no
runnable test command produces UNVERIFIED rows rather than "Adequate."; every
BLOCKER row carries a file:line or a quoted command line; deleting the inline
`<evidence_standard>` from `grd-verifier.md` leaves verifier output unchanged
(the resolution proof).

### W5. Invert the SEED clarify prompt to a positive structural terminator

**Principle:** 1.7 (steer by the positive; terminate on a structural condition), plus the facts/decisions split.

**What.** One function. `buildClarifyPrompt` currently tells the agent that will
form the hypothesis: *"Do NOT invent ambiguity: if the question is already
precise enough to design an experiment, emit an EMPTY dimensions array - that
is the expected, common case."* That is steering by prohibition plus a stated
expectation of finding nothing, at the only in-CLI ambiguity squeeze GRD has.

Replace it with the positive structural test, which is the same stop condition
`commands/research.md:41-44` already states for the human-facing interview:
*the SEED frontier is empty when, and only when, the question already names a
single numeric metric, a comparator from the enum, and a concrete target
threshold; emit the dimensions still missing from that triple.* Delete the
"expected, common case" clause.

Add the admissibility rule the gate currently lacks: a question that
`.planning/` or the codebase can answer is looked up, never asked. Facts are the
agent's job; only decisions go to the human. This is the cheapest way to keep a
sharper prompt from raising question volume.

Keep everything else unchanged: the 4-dimension cap, exactly one recommended
option per dimension (`validateCheckpoint` requires it), and the never-pause-
unattended invariant.

**Files.** `lib/research/_prompts.ts`, `tests/unit/research/_prompts.test.ts`.

**Effort.** S.

**Risk.** More questions surface for interactive users. Bounded by the existing
4-dimension cap and by `research_gates.interactive.enabled` defaulting to
`false` (`lib/research/checkpoints.ts:355`). The unattended path cannot pause
at all, so REQ-208 is untouched. No new agent, no new round budget, no test-
count change.

**How you would know it worked.** Feed a deliberately vague question
("does caching help?") with `interactive.enabled: true`: the frontier is
non-empty and names the missing metric/comparator/target. Feed a precise one
("top-1 accuracy on CIFAR-10 >= 0.92 vs the ResNet-18 baseline"): the frontier
is empty and the loop proceeds without pausing.

### W6. Supersede instead of overwrite in KNOWHOW, then replace the self-reported write gate

**Principle:** 1.6 (supersede never delete; conjunctive artifact-derived gate; coverage is not knowledge).

Ship in two commits. The first is safe and changes no write rate.

**W6a - supersede.** On a `pattern_name` collision, `appendKnowhowEntries`
currently overwrites silently when `e.phase_number >= current.phase_number`
(`lib/knowledge.ts:145-147`). Every research-loop entry carries
`phase_number: 0` and a `pattern_name` that is the takeaway content truncated
to 200 characters (`lib/research/promote.ts:34-42`), so `0 >= 0` holds and a
corrected belief destroys its predecessor with no record. Change it to mark the
existing entry `superseded_by:` and append the new one, reusing `addDeadEnd`'s
existing upsert-with-reopen shape (`lib/dead-ends.ts:349-411`) rather than
inventing a second one. Two constraints: `parseKnowhowEntries` documents a
lossless roundtrip guarantee (`lib/knowledge.ts:62-63`), so the new field must
survive parse/format; and superseded entries must become **un-injectable** in
`selectTopEntries` / `buildKnowledgeInjectionBlock` (`lib/knowledge.ts:176`,
`:243`) or the planner sees both versions of a corrected belief.

**W6b - the gate.** `selectKnowhowTakeaways` is `KNOWHOW_KINDS.has(t.kind) &&
t.confidence >= 0.5` (`lib/research/promote.ts:46`). The confidence is a float
the writing agent invented about its own output in the same turn, gating a
permanent record. Replace it with a conjunction over artifacts already on disk,
all three required: (1) the takeaway's `evidence` string is non-empty and
resolves to something recorded - the takeaway already carries `iteration`, so
the join to an iteration directory or a `result.json` metric line is free;
(2) that iteration reached a settled verdict, `supported` or `refuted`, never
`inconclusive`, because a takeaway mined from an experiment that measured
nothing is coverage, not knowledge; (3) the content is not already present under
the same `pattern_name` (handled by W6a). Keep `confidence` on `Takeaway` as
reported metadata; it stops being the gate.

**Files.** `lib/knowledge.ts`, `lib/types.ts`, `lib/research/promote.ts`,
`tests/unit/knowledge.test.ts`, `tests/unit/research/promote.test.ts`.

**Effort.** M (S for W6a, S-M for W6b).

**Risk.** W6a's risk is the parser: keep it tolerant of an absent
`superseded_by` so existing KNOWHOW.md files load unchanged, and cover the
roundtrip in `knowledge.test.ts`. W6b will drop the write rate, possibly
sharply. That is the intended effect and should be **reported**, not treated as
a regression - `promoteThreadKnowledge` already returns `knowhowAdded`. Ship
W6b behind the existing `research_persist_knowledge` gate and compare the count
across one portfolio run before and after.

**How you would know it worked.** W6a: run two threads producing the same
200-character content prefix; both entries survive, the older one carries
`superseded_by`, and `buildKnowledgeInjectionBlock` returns only the newer.
W6b: a thread whose only iteration ended `inconclusive` writes zero KNOWHOW
entries and says so in the returned count.

### W7. Invalidate the help catalog with a test, not a generator

**Principle:** 1.8 (restating the environment is a cache; a router that lies).

**What.** `commands/help.md:32-219` hand-types the command surface and has
drifted: 12 shipped commands are missing, `/grd:resume-work` is advertised in
three places - `help.md:157`, `help.md:317`, and `commands/pause-work.md:72`
("To resume: /grd:resume-work"), the last being the exit instruction a user
reads at the end of every pause - and none of them exists; the file is
`commands/resume-project.md`. `help.md:366` instructs the model to read
per-command detail "{from plugin.json}", which carries only identity and hooks.

The defect is **drift**, and drift is fixed by invalidation, not by generation.
Add one test in `tests/unit/` asserting both directions of the mapping:

1. every `commands/*.md` basename appears somewhere in `commands/help.md`, so a
   newly added command announces itself rather than being silently absent;
2. every `/grd:<name>` string in `help.md` resolves to an existing
   `commands/<name>.md`, which catches the phantom.

Then hand-edit the 12 missing rows once, delete the three `/grd:resume-work`
citations (fixing `pause-work.md` to say `/grd:resume-project`), and delete the
`{from plugin.json}` instruction. The test prevents recurrence; the catalog
stays authored, which keeps its curation - category grouping, the workflow
diagram (`:225-286`), the quick start (`:292-321`) - where a human wrote it.

An earlier draft built a `grd-tools` subcommand plus a new `lib/commands/`
module plus a test to render a 411-line markdown file no code path consumes.
That is a code generator answering a lint problem: the same 13 defects are
caught by assertion (1) and assertion (2) alone, with nothing generated and no
new module in the tree. Do **not** add a `category:` key to the frontmatter
schema either; the curation stays authored, which is what keeps the schema at
two fields across all 48 files.

**Files.** `commands/help.md`, `commands/pause-work.md`, `tests/unit/` (one new
test).

**Effort.** S.

**Risk.** Low, and bounded to the test's own strictness. The one judgement call
is assertion (1)'s matching rule: match on the `/grd:<name>` token rather than
on a bare basename, or a command whose name is a substring of another
(`research` inside `deep-research`) passes vacuously.

**How you would know it worked.** `/grd:research` and `/grd:harness` appear in
`/grd:help` output. Adding a stub command file makes the new test fail with the
missing command named. Grepping the repo for `resume-work` returns nothing.

### W8. Declare a baseline, and only if it lands with its consumer

**Principle:** 1.3 (independent oracle).

**What.** An `ExperimentPlan` is one script producing one number, and that
script both computes and reports the number it is judged on. Add **one**
optional field to `ExperimentPlan` (`types.ts:121-129`): `baseline?: number` -
the value the metric is claimed to improve on, plus where it came from. Ask for
it in `buildExperimentPrompt` with the independence rule stated: the baseline
must come from a source outside the script under test - a recorded prior
iteration, a published number, a control arm - never from the same run.

**It ships with its consumer in the same commit, or it does not ship.** The
consumer: render the measured-vs-baseline delta beside the verdict line in
`reconstructabilitySection` (`lib/research/orchestrator.ts:436-460`, which is
where the score is actually appended to FINDING.md), and pass the delta into
`buildLearnPrompt` so the takeaway can name the margin rather than only the
verdict. A margin is what distinguishes "cleared the target by 0.001" from
"cleared it by 0.3", and nothing in GRD currently says which happened. If that
consumer will not fit in the commit, **defer W8 entirely** - under the same rule
that killed the CONTEXT.md glossary in section 5.

**Cut from an earlier draft: `seed` and a graded label.** The draft added
`seed?: number` and extended `scoreReconstructability` with `seed_recorded` and
`baseline_declared`, then rendered a `strong` / `single-run` / `structural-only`
badge beside the verdict. Both are out.

- `seed` was to be declared and then *not plumbed anywhere*: the draft states
  "no change to `lib/research/runner.ts`", so nothing seeds the run.
  `seed_recorded` would flip true the moment a designing agent types a number,
  while reproducibility is exactly as it was. That is a measurement produced by
  the artifact being measured - principle 1.3, turned against this document. The
  comment at `reconstructability.ts:6-8` is honest *because* it refuses to score
  a field nothing enforces; leave it verbatim.
- The graded label is appended to FINDING.md, explicitly forbidden from gating,
  and read by no code. Section 5 kills the glossary for being exactly that, and
  section 7 names `.planning/thoughts/` and `knowledge-stats.json` as the two
  existing instances. A third does not become acceptable by being shorter.

**Files.** `lib/research/types.ts`, `lib/research/_prompts.ts`,
`lib/research/orchestrator.ts`, `tests/unit/research/orchestrator.test.ts`.

**Effort.** S.

**Risk.** Low: the field is optional and unset means the current path
byte-identically. Two things must survive the edit unchanged - the hard rule at
`reconstructability.ts:3-5` that the structural score is advisory and never
gates, and the always-false-seed comment at `:6-8`.

**How you would know it worked.** A thread whose plan declares no baseline
renders FINDING.md exactly as before the change and returns the same verdict; a
thread declaring one renders the measured-vs-baseline delta beside the verdict
and the LEARN takeaway names the margin. The verdict arithmetic is untouched in
both cases.

### W9. Fix the two dead pointers and collapse the four-times-duplicated executor prompt

**Principle:** 1.9 (a convention documented where nobody loads it is not a convention; duplication).

**What.** Two defects in `commands/`.

1. `init.md:137` says "Consult `questioning.md` for techniques" and `:146` says
   "mentally check the context checklist from `questioning.md`", and `init.md`
   contains zero `@${CLAUDE_PLUGIN_ROOT}` includes. The model is told to consult
   a 185-line file it was never given. Add
   `@${CLAUDE_PLUGIN_ROOT}/references/questioning.md` to init.md's context block
   and make the two citations name the loaded block rather than a bare filename.
2. `execute-phase.md` carries four near-identical `grd-executor` Task() prompt
   blocks (`:175`, `:248`, `:409`, `:474`), one per cell of the teams x
   isolation matrix, repeating the same `<objective>`, `<phase_context>`,
   `<execution_context>`, `<paths>`, `<files_to_read>`, `<experiment_tracking>`
   and `<success_criteria>` across roughly 250 of the file's 1,027 lines. They
   have already drifted: the two team variants (`:227-231`) dropped the concrete
   commit example and the backticks the two standard variants carry
   (`:452-457`). All four already `@`-include `references/execute-plan.md`
   (`:207`, `:278`, `:432`, `:495`), so hoist the invariant body into that file
   and leave only the `<worktree>` vs `<native_isolation>` delta and the two team
   params inline.

**Files.** `commands/init.md`, `commands/execute-phase.md`,
`references/execute-plan.md`.

**Effort.** M.

**Risk.** The executor hoist is the one change here that can silently regress
dispatch. `references/execute-plan.md` is also included by
`agents/grd-planner.md:706` and `templates/phase-prompt.md:42`, so anything
moved into it lands in those two contexts as well - check that the hoisted
content is appropriate there before moving it, or scope the move to a new
sibling reference. **Land it with a before/after diff of the four rendered
prompts, not by inspection.** The init.md include adds 185 lines to a 1,508-line
command; acceptable because the instruction to use them already exists and
currently fails, but it argues for eventually trimming init.md's config-wizard
half rather than growing it.

**How you would know it worked.** The four rendered executor prompts are
byte-equivalent before and after modulo the isolation delta. A `/grd:init` run
quotes a technique from `questioning.md` rather than paraphrasing.

### W10. Hygiene: delete the sediment, retarget the harness proposer, unpin the agent count

**Principle:** 1.9 (sediment), 1.8 (a pointer to nothing).

Three changes with nothing between them.

1. **Delete the orphans.** Six reference files have zero `@`-include sites and
   zero bare-name citations anywhere: `research-methodology.md` (541 lines),
   `planning-config.md` (384, a restatement of `.planning/config.json` that
   `lib/planning-config` already owns), `phase-argument-parsing.md` (61),
   `decimal-phase-calculation.md` (65), `git-planning-commit.md` (40),
   `model-profile-resolution.md` (32) - 1,123 lines. `model-profiles.md` (117)
   is reachable only from `model-profile-resolution.md:15` and goes with it:
   1,240 lines for the seven. Where a file encodes a live algorithm rather than
   a restatement, move it into `lib/` or the one command that needs it instead
   of deleting. Update `grd-file-manifest.json:637-647` and
   `.planning/codebase/STRUCTURE.md:269-281` in the same commit - those are live
   indexes that would otherwise point at nothing - and re-run the orphan scan
   immediately before committing, because a file that gained an include since
   2026-09-02 is not an orphan. Put the seven filenames in the commit message.
   **No `docs/DEPRECATIONS.md` entry and no single-release bundling**: outside
   those two indexes the files have zero referrers, so a register announcing the
   removal of a file no command ever loaded is itself a document nobody reads,
   and `git log` already is the record. **Do not touch `questioning.md`** - it is
   a live dead-pointer case fixed by W9, not an orphan.
2. **Retarget the harness proposer - two files, not one string.**
   `bin/harness_driver.py:210` tells the round proposer to target
   "commands/*.md, agents/*.md, skill markdown, .planning/config.json,
   lib/**.ts". There is no `skills/` tree, so "skill markdown" names nothing and
   the proposer is offered a target it can never hit. Two edits:
   (a) `bin/harness_driver.py:210` - replace "skill markdown" with
   `references/*.md`, the real shared-prompt surface;
   (b) `lib/commands/harness-conversion.ts:123` - extend the alternation from
   `/^(commands|agents|skills|hooks)\//` to
   `/^(commands|agents|references|hooks)\//`. Without (b) the retarget is
   incoherent: `_classifyPath('references/questioning.md')` returns `'code'`
   today, so a patch touching the newly-offered surface would be classified as a
   code change, not a prompt change, and counted against the wrong conversion
   bucket. `skills` drops out of the alternation in the same edit - no `skills/`
   tree exists, and leaving it in is the same dead pointer one line lower.
3. **Unpin the agent count.** `tests/unit/agent-audit.test.ts:17-18` asserts
   `expect(agentFiles.length).toBe(28)` (and `agents/` does contain exactly 28
   files today), which makes every agent addition a test edit. Replace it with a
   structural schema check, and extend the same file to assert that any agent
   emitting severity-graded findings carries the W4 evidence-standard include.
   The file already parses every agent's frontmatter, so the marginal cost is
   near zero.

**Files.** `references/` (7 deletions), `grd-file-manifest.json`,
`.planning/codebase/STRUCTURE.md`, `bin/harness_driver.py`,
`lib/commands/harness-conversion.ts`,
`tests/unit/commands/harness-conversion.test.ts`,
`tests/unit/agent-audit.test.ts`.

**Effort.** S.

**Risk.** Deleting files breaks any local patch a user carries, and
`/grd:reapply-patches` exists precisely because users patch this tree. Delete
hard with no alias (an alias is a duplicated pointer paying permanent load);
`/grd:reapply-patches` fails loudly on a missing file whether or not a register
mentions it, which is why the register is not worth writing. The one real
correctness risk is in item 2(b): `_classifyPath` feeds the conversion
accounting, so add a unit case pinning `references/x.md -> prompt` and
`lib/x.ts -> code` in the same commit.

**How you would know it worked.** The orphan scan returns empty. `npm test`
passes with 28 agents and still passes when a 29th is added without editing the
test. `gd harness round` proposes a patch touching `references/` and
`gd harness conversion` classifies it as `prompt` - which, after 2(b), it does.

---

## 5. Deliberately not imported

| Rejected | Reason |
| --- | --- |
| **A `skills/` tier as a model-invoked disclosure layer** | The source's central mechanic, and the single biggest thing deliberately not imported. GRD genuinely lacks on-demand loading: `references/` is spliced at author-chosen include sites, so a 541-line file is either always in context or never. But adding the tier is a platform migration, not an import - 18 reference files need trigger-shaped descriptions, two loading contracts must coexist indefinitely alongside 48 commands' `@`-includes, and nothing changes behaviour on day one. It also rests on an unverified premise: there is no `skills/` directory and no `skills` key in `.claude-plugin/plugin.json`, and nothing establishes that this plugin loads model-invoked skills at all. The source's own ADR 0002 is a worked example of verifying exactly that before committing (symlinks tested, found to be dropped on install); that discipline was not applied. The two genuinely broken parts of the problem - the dead pointers and the sediment - are fixed lazily by W9 and W10. |
| **`disable-model-invocation` and the user-invoked-only invariant** | The source's hardest architectural rule exists to protect human agency in a fleet of interactive slash commands. GRD's value proposition is the opposite: `gd autopilot`, `gd harness round`, and the portfolio path must reach every station autonomously, and REQ-208 guarantees the loop never pauses unattended. Importing it would break the product. GRD already has the stronger form of the same boundary, enforced structurally rather than by a flag: `grd-experiment-runner` is denied Bash so it cannot run the experiment it designs. |
| **The typed `constraints` record on `ResearchThread` (E2)** | `foldSeedAnswers` (`orchestrator.ts:802-814`) destroys the structure it paid to obtain by string-concatenating clarify answers into `refinedQuestion`. The diagnosis is right and the residual gap is real. The change was killed because its only checkable consumer was a substring match of a `dimension` token against `plan.procedure`, which reports "honored" when the designer merely echoed the word, written to `plan.json` where a later change will inevitably promote it to a gate. A weak oracle with no consumer is a document nobody reads with extra steps. Revisit only alongside a real consumer; do not ship the record on its own. |
| **N-run repetitions and median-of-N in `lib/research/runner.ts` (E5)** | The one L-effort item touching the sandboxed run path behind the `execute` gate. It multiplies wall-clock and docker cost per iteration against a rate-limit-bound scheduler, and a mis-specified median-of-N tie-break makes the verdict non-reproducible - strictly worse than the single-run honesty problem it fixes. W8 keeps the reachable half of the principle - an independent baseline the run cannot manufacture - and drops the harness. Its own calibration-label half was cut for the reason given in W8: a label no gate reads is the artifact this document rejects elsewhere. |
| **A `grd-interrogator` agent and a SEED round budget (E1)** | Adds a 29th agent, a test edit, and a second pause path to a station that does not run at all under the default `interactive.enabled: false`. The entire behavioural leverage of E1 is the prompt rewrite, which is W5, a one-function edit. |
| **Promoting falsified reflections from `lib/autopilot.ts` (E7 as wired)** | Wrong call site. Autopilot delegates verification to the `grd:execute-phase` skill (`lib/autopilot.ts:593`) and does not own the step; a TS call there would sit beside a pipeline that never writes the artifact it parses. The function extraction survives as part of W1; the call sites come from the two markdown steps that actually produce VERIFICATION.md. |
| **Mandatory `sourceNodeIds` on the hypothesis contract (E3, provenance half)** | The grounding retrieval it depends on is wrapped in `catch { /* degrade */ }` (`orchestrator.ts:1055-1058`), so on an empty or rate-limited Tesserae KG the required field is `[]` and the requirement is a no-op that costs a parse retry. The honest half - instruct the rationale to say when zero nodes were retrieved rather than invent related work - is folded into W2. |
| **A parallel `.out-of-scope/` refusal registry** | Attractive after five consecutive evolve rounds of 100% false positives - a store of "we already decided not to" is the obvious answer to a discovery loop that keeps re-proposing dead work. (An earlier draft cited "857 pending todos" here; that figure is stale session memory, not the tree. The working tree holds **4** pending todos, all under `.planning/milestones/v0.4/todos/pending/`, and 6 todo files across all three milestone todo directories. The smaller backlog strengthens the rejection, not the case for a registry.) Rejected because GRD already has this store, with the only hard deterministic gate in the repo reading it (`select-candidate.ts:222-254` detects, `:467-469` scores `-Infinity`, `:580` sinks it). A second registry would split the artifact that gate depends on. The transferable half is a `kind: falsified | out-of-scope` discriminator on the existing entries, so a scope refusal stops masquerading as an empirical dead end. Later change, not a new directory. |
| **Design-It-Twice: N parallel sub-agents under different named constraints** | GRD already runs forced divergence one station earlier - `buildHypothesesPrompt` produces N ranked candidates and `select-candidate` scores them deterministically. A second N-way fan-out at DESIGN multiplies spawn cost against a rate-limit-bound scheduler to diverge over a runnable script for one pinned metric. W3 is the cheaper import of the same principle: route an unmeasurable design back to a re-plan instead of counting it as evidence. |
| **A `CONTEXT.md` glossary with `_Avoid_:` alias bans** | GRD has real term drift (phase/plan/round/iteration, harness/evolve, finding/insight/takeaway) and the mechanic is cheap. Rejected because GRD's demonstrated failure mode is write-only knowledge artifacts: `knowledge-stats.json` is written on every injection and read by nothing, and `lib/think.ts:25-26` says in its own docstring that nothing consumes `.planning/thoughts/`. A glossary no gate reads would be the third. Import it only alongside a consumer. |
| **The repo-wide em-dash ban and the docs-page template** | A textbook no-op by the source's own model-relative test: it costs context on every turn and would not change what any agent does in this repo. It also steers by prohibition, which the same document names as a failure mode. |
| **Labelling every work unit HITL or AFK** | `research_gates.interactive` already carries per-station flags (seed/hypothesize/design/decide) plus a defined unattended fallback - the same information in a form the loop actually reads. |
| **Naming the author, or stripping attribution** | The source's "never name the author" rule is correct for opinionated technical docs and actively wrong for a research harness. GRD's entire evidence discipline is provenance: `source_node_ids`, `file:line`, verbatim command output, `research:<threadId>#iter<n>`. W2 adds more of it. |

---

## 6. Sequencing

### First slice - ships on its own

> **Close the phase-level falsification loop, stop the SEED prompt from steering
> the loop away from finding ambiguity, and make the code reviewer's shipped
> checks executable.**

W1, W4a and W5. They share no files with each other, all three are S, and each
changes agent behaviour on the day it lands - W1 by writing DEAD-ENDS entries a
human currently has to type a CLI subcommand to get, W5 by changing what the
SEED station asks for, W4a by making three review commands run at all. Their
file lists and effort are in W1, W4a and W5 above and are not restated here.

Do **not** touch `lib/autopilot.ts` in this slice. It does not own the
verification step (`lib/autopilot.ts:593` delegates to the `grd:execute-phase`
skill), so a TypeScript call there would duplicate what the two markdown steps
already cover - the one fact about this slice that none of the three W-sections
states on its own.

### Order for the rest

| Order | Change | Rationale |
| --- | --- | --- |
| 2 | **W2** (refutation condition) | Upstream fix for W1's one real risk: a vague hypothesis yields a vague slug that matches too broadly. Ship it close behind. |
| 3 | **W10** (hygiene) | Independent of everything, S effort, and W10's audit-test unpin is a precondition for adding assertions in W4. |
| 4 | **W4** (shared evidence standard) | Gated on the include-resolution check. If that fails, everything after it still ships - and W4a has already landed the part that was never gated on anything. |
| 5 | **W3** (metric_absent routing) | Touches the verdict module, so it wants a quiet week and a parity-vector run of its own. |
| 6 | **W6a** (supersede) then **W6b** (write gate) | W6a is safe and changes no write rate. Hold W6b until one portfolio run has produced a before/after `knowhowAdded` count. |
| 7 | **W7** (help catalog test) | Independent; ships whenever. |
| 8 | **W8** (baseline + its consumer) | Independent; wants W3 landed first so `cause` and the baseline delta read coherently in FINDING.md. Ships only if the delta consumer ships with it. |
| 9 | **W9** (pointers and executor hoist) | Last, because the executor hoist is the only change here that can silently regress dispatch and it wants the four-prompt diff done carefully rather than quickly. |

---

## 7. Risks and open questions

| Risk / question | Why it matters |
| --- | --- |
| **Does an `@`-include inside an agent `.md` resolve in a subagent spawn?** | W4 depends on it. Five agent files already rely on the pattern, but no test covers it, and `commands/plan-phase.md:227` documents that `@` does not cross Task() boundaries for commands. Prove it empirically before deleting the inline `<evidence_standard>`, or the strongest prompt in the repo becomes the third dead citation. **W4a is deliberately not behind this question** - it touches only `agents/grd-code-reviewer.md` and ships in the first slice. |
| **W1 makes DEAD-ENDS hungrier, and the consequence is `-Infinity`.** | A loosely written `verdict: falsified` row permanently forbids every future plan citing that slug (`select-candidate.ts:467-469`), with no warning tier between "allowed" and "excluded" and nothing surfacing the exclusion when it bites. This is why W1 ships behind `research_gates.auto_promote_falsified`, default false, dry-running until a human flips it - the only config key in the plan. Reviewing the dry-run output is a human reading a log, which is fine; *relying* on a human to read it is the substitution principle 1.1 rules out, which is what the key replaces. |
| **W6b's write-rate drop is indistinguishable from a bug at a glance.** | Report `knowhowAdded` explicitly in the release note with a before/after count, or the next person to look will "fix" the gate back to a self-report. |
| **`references/execute-plan.md` has three consumers, not one.** | `commands/execute-phase.md` (x4), `agents/grd-planner.md:706`, and `templates/phase-prompt.md:42`. W9's hoist lands in all three. Either verify the hoisted content is correct in the planner and template contexts, or hoist into a new sibling reference included only by the four executor blocks. |
| **Deleting references collides with `/grd:reapply-patches`.** | That command exists because users patch this tree. It fails loudly on a missing file, which is the whole notification mechanism - re-run the orphan scan immediately before the commit and name the seven files in the commit message. No `DEPRECATIONS.md` entry: outside `grd-file-manifest.json` and `.planning/codebase/STRUCTURE.md` these files have zero referrers, so a register announcing them is one more write-only artifact. |
| **`agents/grd-hypothesizer.md` is already dead documentation for the CLI path.** | The agent card knows nothing about `__HYPOTHESES__` or `__CLARIFY__`, both of which live only in `lib/research/_prompts.ts`. W2 repairs the drift for its own fields but does not close the underlying split: two copies of one contract, one of which is authoritative only for Task-tool spawns. A test asserting the sentinel declared in `agents/*.md` matches the sentinel parsed in `lib/research/` would pin it. Out of scope here; worth a follow-up. |
| **`.planning/thoughts/` and `knowledge-stats.json` remain write-only.** | Neither is touched by this plan. They are the standing evidence for the CONTEXT.md rejection above, and they are the reason any future knowledge artifact must arrive with its consumer. |

## 8. Sources

| Source | Use in this document |
| --- | --- |
| `mattpocock/skills` - `skills/productivity/writing-for-agents/SKILL.md` | Pointer construction, the disclosure ladder, positive steering, no-ops, sediment, duplication, caching the environment. |
| `mattpocock/skills` - `skills/engineering/diagnosing-bugs/SKILL.md` | Artifact-shaped gates, falsifiable-hypothesis format, tagged instrumentation. |
| `mattpocock/skills` - `skills/engineering/tdd/SKILL.md` | The anti-tautology rule (independent source of truth for expected values). |
| `mattpocock/skills` - `skills/engineering/code-review/SKILL.md`, `docs/engineering/code-review.md` | Citations per finding, graded findings, reviewing context vs authoring context. |
| `mattpocock/skills` - `skills/engineering/improve-codebase-architecture/SKILL.md`, `docs/engineering/improve-codebase-architecture.md` | The calibration channel and the strength badge. The badge itself is defined in `SKILL.md:50`; both quotes in principle 1.4 are from the docs page, `:80`. |
| `mattpocock/skills` - `skills/in-progress/loop-me/SKILL.md` | The structural definition-of-done quoted in principle 1.7 (`:27`). **Draft, not promoted**: per `.agents/adr/0002`, the `in-progress/` bucket is deliberately excluded from the plugin manifest, so this is the author's working material rather than shipped guidance - weigh it accordingly. The point it supports is grounded independently in GRD's own `commands/research.md:41-44`, which W5 uses. |
| `mattpocock/skills` - `skills/engineering/domain-modeling/ADR-FORMAT.md`, `skills/productivity/teach/LEARNING-RECORD-FORMAT.md` | Conjunctive write gate, coverage-is-not-knowledge, supersede-never-delete. |
| `mattpocock/skills` - `docs/engineering/tdd.md`, `.agents/adr/0002-*.md` | The probabilistic-instruction observation, and the discipline of verifying a platform assumption before committing to it. |
| Local GRD tree, verified 2026-09-02 | Authoritative for every file path, line number, and behavioural claim above. Where a source proposal disagreed with the tree, the tree wins and the disagreement is recorded in **Verified anchors**. |
