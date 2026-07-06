# Deep Research — parallel, KG-grounded, adversarially-verified research flow

Shared procedure invoked by `/grd:deep-research` and by the `deep-research` keyword on
`/grd:survey` and `/grd:research`. The **orchestrator (the current Claude Code session)** runs
every step and dispatches parallel `Task()` subagents — all are leaf subagents; none nests.

Inputs:
- `QUESTION` — the research question/topic. The caller MUST have already stripped the
  `deep-research` / `--deep-research` and `ultracode` / `--ultracode` tokens from it.
- `ULTRACODE` — true when the caller saw the `ultracode` keyword.

GRD-native take on Claude Code's built-in `deep-research` topology (Scope → Search/Extract →
adversarial Verify → Synthesize): it grounds on the **Tesserae knowledge graph** +
`LANDSCAPE.md` / `PAPERS.md` and uses GRD's read-only `grd-deep-researcher` subagent, not raw web.

<config>
Read `.planning/config.json` once. Each key is optional; **if a key is missing or not a positive
integer, use the default**, then clamp to the stated range:
- `research_deepresearch_angles` — default 5, clamp 3–6.
- `research_deepresearch_verify_claims` — default 5, clamp 3–8.
- `research_deepresearch_votes` — default 3; must be ODD in {3, 5} (any other value → 3).
</config>

## 1. SCOPE — resolve the research dir, ground on the KG, decompose
Resolve the milestone-scoped research dir (same as `/grd:survey`):
```bash
INIT=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js init survey "$QUESTION")
```
Parse `research_dir` (+ `landscape_exists`, `papers_exists`, `researcher_model`). Read
`${research_dir}/LANDSCAPE.md` and `${research_dir}/PAPERS.md` if they exist. Then ground on the
Tesserae KG yourself — `mcp__plugin_tesserae_tesserae__ask` / `search_nodes` for `QUESTION` —
and collect the relevant node ids + snippets into a `KG_CONTEXT` block (may be empty if there is
no KG). Decompose `QUESTION` into N angles (N = `research_deepresearch_angles`), each a one-line
focus + a type: **BREADTH** (landscape) or **DEPTH** (specific paper/method).

## 2. RESEARCH — fan out N parallel subagents (in ONE message)
Dispatch all N `Task(subagent_type="grd:grd-deep-researcher")` calls **in a single message**
(parallel). Each prompt passes `QUESTION`, the angle's focus + type, and the `KG_CONTEXT` from
step 1. Each agent grounds on the KG + web and returns a claims block (3–5 falsifiable claims,
each with `source` + `quote` + `central|supporting|tangential` rating); it writes no files.
Under `ULTRACODE`: add `effort: "max"` + `model: "opus"` to each `Task()` and prefix each prompt
with `ultracode\n\n` (fires the native dynamic workflow).

## 3. VERIFY — adversarial vote (parallel, capped)
Flatten all returned claims; drop exact duplicates; rank by (`central` > `supporting` >
`tangential`, then source quality). Take the top `research_deepresearch_verify_claims`.
**Hard cap: never dispatch more than 24 verifier `Task()` total** — if `verify_claims × votes >
24`, reduce `verify_claims` until it fits. For each surviving claim, dispatch `votes`
**independent** `Task(subagent_type="general-purpose")` verifiers in parallel, each prompted:
> Try to **REFUTE** this claim using the Tesserae KG + web. Return `{ refuted: bool, confidence:
> high|medium|low, evidence: string }`. Default `refuted: true` if you cannot find supporting
> evidence.

Tally each claim — **deterministic; the COUNT decides, never an LLM judge**. Definitions:
- `refutes` = verifiers that returned a non-null result with `refuted: true`.
- `valid` = verifiers that returned a non-null result with `refuted: false`.
- errored / null verifiers count toward NEITHER.

Majority threshold `T = floor(votes / 2) + 1` (so 2 for votes=3, 3 for votes=5):
- `refutes >= T` → **refuted** (drop the claim);
- `valid >= T` AND `refutes < T` → **confirmed**;
- otherwise → **unverified** — the voter agents errored (an **infra** failure, NOT a negative
  finding). Keep it, flagged, so a rate-limit wipeout never reads as "found nothing".

## 4. SYNTHESIZE
Dispatch one `Task(subagent_type="general-purpose")` synthesizer with the confirmed / refuted /
unverified claim blocks (each with its vote tally + source + quote). Instruct it to: merge
semantic duplicates, group into findings, assign per-finding confidence (`high|medium|low`) from
the vote tallies + source quality, write a 3–5 sentence executive summary, and list caveats +
2–4 open questions — all with inline citations. Under `ULTRACODE`, dispatch it at `effort: "max"`
+ `model: "opus"` with an `ultracode\n\n` prefix.

## 5. PERSIST
Write the report to `${research_dir}/deep-research/<slug(QUESTION)>-<YYYY-MM-DD>.md` (create the
dir; write to a `.tmp` file then rename, for atomicity). The header records `QUESTION`, the
angles, and the confirmed / refuted / unverified counts. Print the report path.

## Failure salvage
Every fan-out filters dead subagents (skip null / errored results) and proceeds with partial
results. If SCOPE, RESEARCH, or SYNTHESIZE yields nothing usable, write whatever was gathered
plus a clear `incomplete (<reason>)` note rather than aborting — a partial report beats none.
