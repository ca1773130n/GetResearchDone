# 105-04 Live Sandbox Validation Record

**Phase:** 105 — AI-Panel Fallback + Hardening (v0.5.0 Integration Phase)
**Plan:** 105-04
**Date:** 2026-07-19
**Backend:** claude (loop), config-dir `/Users/neo/.claude-personal1`; codex panelist `/Users/neo/.codex-personal2`
**Sandbox:** throwaway `mktemp -d` (`/tmp/grd-sandbox-105-04.*`) with its own `.planning/` — GRD repo never touched.

This is the milestone Integration Phase collection step: exercising the v0.5.0 checkpoint
machinery against a **real Claude backend** and dispositioning every deferred live validation
that Phases 101–104 handed to Phase 105. Offline suites (105-01/02/03, 652 tests green) proved
correctness; this record proves the live UX/quality that only a real LLM spawn can judge.

---

## Repo cleanliness (Level 1: Sanity) — PASS

All live runs executed in a throwaway `mktemp -d` sandbox with its own `.planning/`. After all
passes, `git -C <repo> status --porcelain` shows **no** `.planning/research/threads/`, **no** root
`KNOWHOW.md`, and **no** `DEAD-ENDS.md` mutation. The only tracked `.planning/research/*.md` files
(competitive-landscape, gd-research-feature-patterns, ouroboros-integration) predate this run.
Sandbox config: `research_gates.interactive.{enabled:true, fallback:'panel'}`,
`research_max_candidates:3`, `research_sandbox:'subprocess'`.

---

## Pass 1 — Live interactive SEED clarify (DEFER-102-01)

`gd research "Does adding a one-line type annotation to each function reduce mypy errors in a
small Python module?" --interactive --max-iterations 1 --json`

**Result:** `status:"paused"` at `ck-1-seed-r1` (point `seed`, type `clarification`). The live
backend produced a **single, sharp, decision-relevant** clarifying question with 3 readable options
and a `recommended:true` marker:

> **q1:** "Which mypy configuration sets the error baseline? … under default mypy an unannotated
> module reports ~0 errors (nothing to reduce), whereas under `--disallow-untyped-defs/--strict`
> each unannotated function is itself an error that annotations remove."
> - **Strict (--disallow-untyped-defs or --strict)** — *recommended*
> - Default mypy settings
> - The module's existing mypy config

**Judgment:** UX coherent — one clear question, recommended option marked, options readable and
genuinely decision-changing. Answered via `--answers <file>` (`{"q1":{"label":"Strict …"}}`) and
resumed cleanly (no double-ask, `consumeAnswered` one-shot behaving as R5 predicts offline).

## Pass 1 (cont.) — Live N-candidate HYPOTHESIZE selection (DEFER-104-01 / DEFER-104-02)

After resuming past SEED, the loop paused at `ck-1-hypothesize-r1` (point `hypothesize`, type
`selection`, `freeform:true`) with **N=3 genuinely distinct, falsifiable** candidates:

1. **Monotonic reduction** — "adding one correct complete-signature annotation per function drives
   the `mypy --strict` error count monotonically down from ≥N to 0." *(recommended)*
2. **Not guaranteed monotonic** — "annotating a module with a latent type inconsistency removes N
   missing-annotation errors but surfaces M new type errors, so net change = M − N and total errors
   can rise when M > N."
3. **Completeness boundary** — "only a COMPLETE one-line signature reduces errors: a partial
   annotation still trips `--disallow-incomplete-defs`, so the per-function error persists."

Each candidate carries a distinct `statement` / `rationale` / `predictedOutcome`. They are not
paraphrases — they stake out three different, testable positions (affirmative, refuting,
boundary-condition). Selection prompt: one clear question ("Which hypothesis should iteration 1
test?"), recommended option marked, options readable, freeform escape hatch present.

**Judgment (DEFER-104-01):** candidates DISTINCT + each usable falsifiable hypothesis — RESOLVED.
**Judgment (DEFER-104-02):** selection UX coherent — RESOLVED.

---

## Pass 2 — Unattended `fallback:'panel'` autonomous run (DEFER-101-02)

`GRD_AUTOPILOT=1 gd research "Does sorting a 1000-element integer list with Python's sorted() run
faster than a hand-written bubble sort?" --max-iterations 1 --json`

**Result:** `status:"supported"`, `iterations:1` — the run **completed without ever pausing**.
`checkpoints.jsonl` shows both checkpoints resolved INLINE:

| checkpoint | point | type | answer | answeredBy |
|---|---|---|---|---|
| ck-1-hypothesize-r1 | hypothesize | selection | "…sorted() completes at least 100x faster…" | `default` |
| ck-1-design-r1 | design | approval | "Approve & run" / "Keep as designed" | `default` |

The `engagedPanel` gate fired (unattended + `fallback:'panel'`), `resolveCheckpointInline` ran
`answerViaDiscussion`, and — with the loop backend (claude) excluded from the panel and no
non-loop panelist producing a label-matching synthesis — it **degraded cleanly to recommended
defaults** (`answeredBy:'default'`, telemetry `research.checkpoint_panel_unavailable_total`). No
pause, no hang, verdict reached.

**Pass 2b** (added `codex` as a real panelist via `discussion.participants:["codex"]`): same
non-pausing outcome, again `answeredBy:'default'` — the codex prose synthesis did not line-match
an option label verbatim (Tier-1/Tier-2 match is exact/prefix on the option label), so the
degrade-safe path resolved to the recommended default.

**Judgment (DEFER-101-02):** The plan's truth #2 is an OR — *"answeredBy:'panel' present … OR
degrades to recommended defaults gracefully."* The **graceful-degrade branch is proven live** (twice):
unattended, non-pausing, inline resolution that never throws and always yields the recommended
default when the panel produces no matching decision. A literal `answeredBy:'panel'` record was not
observed because it requires a non-loop panelist whose free-text synthesis aligns verbatim with an
option label — finicky with real LLM prose in a single shot. The seam itself is exercised and
label-match is exhaustively covered offline by the 105-01/105-03 suites. **RESOLVED (degrade path);
literal panel-match label re-DEFERRED as low-value UX polish.**

---

## Deferred-Validation Disposition Table

| ID | Description | From | Disposition | Rationale |
|----|-------------|------|-------------|-----------|
| DEFER-104-01 | Live N-candidate generation quality | 104 | **RESOLVED** | Pass 1: 3 genuinely distinct, falsifiable candidates (affirmative / refuting / boundary) with full statement+rationale+predictedOutcome |
| DEFER-104-02 | Live human candidate selection UX | 104 | **RESOLVED** | Pass 1: coherent selection prompt — one question, recommended marked, options readable, freeform escape hatch |
| DEFER-102-01 | Live SEED/AskUserQuestion clarify UX | 102/103 | **RESOLVED** | Pass 1: live SEED clarification rendered one sharp decision-relevant question; answered via `--answers`, resumed with no double-ask |
| DEFER-101-02 | `fallback:'panel'` unattended answering | 101/105 | **RESOLVED** (degrade path) | Pass 2/2b: unattended non-pausing inline resolution proven; degrade-safe to recommended defaults. Literal `answeredBy:'panel'` label **re-DEFERRED** (needs multi-backend verbatim prose alignment; UX polish, seam covered offline) |
| DEFER-101-03 | Full R1–R5 milestone suite | 101/102/103 | **RESOLVED** | Offline by 105-03 (`tests/unit/research/milestone-verification.test.ts`, REQ-209, 652 tests green, no threshold lowered) |

**Re-deferred (single new item):** `DEFER-105-01` — observe a literal `answeredBy:'panel'` record
(panel synthesis verbatim-matching an option label) with ≥2 authenticated non-loop backends.
Low value: the panel seam + label-match logic are exhaustively covered offline; the live degrade
path is proven; this is qualitative UX polish, not a correctness gap.

---

## Verification Summary

- **Level 1 (Sanity):** GRD repo working tree clean after all sandbox runs — PASS.
- **Level 2 (Proxy):** candidate samples + `checkpoints.jsonl` excerpts + full DEFER disposition
  table present above — PASS.
- **Level 3 (Deferred):** human judgment on candidate distinctness + selection/steering UX quality —
  **awaiting the Task 2 human-verify checkpoint.**
