---
description: Run the autoresearch loop — hypothesis -> experiment -> measure -> learn -> revise — on a research question
argument-hint: "\"<question>\" [--max-iterations N] [--no-gates] [deep-research] [ultracode] | resume <id> | status [<id>]"
---

**`deep-research` mode:** if `$ARGUMENTS` contains the bare keyword `deep-research` (or
`--deep-research`), do NOT run the autoresearch loop below. Set `ULTRACODE` = whether `ultracode`
/ `--ultracode` is also present; set `QUESTION` = the question with BOTH tokens removed. Run the
shared procedure below with `QUESTION` + `ULTRACODE`, then STOP. (The autoresearch loop is the
hypothesis→experiment→verdict cycle; deep-research is a parallel breadth pass — different modes.)

@${CLAUDE_PLUGIN_ROOT}/references/deep-research-flow.md

## Interactive SEED interview (pre-loop clarification)

Before starting a NEW `gd research "<question>"` thread, run a short socratic interview to
turn a vague question into one carrying a **falsifiable metric target**. This is a THIN
pre-CLI skill step (ask → refine → invoke) — no state machine, no answers file, no resume
plumbing. It mirrors `superpowers:brainstorming` and `plan-phase.md` §9 clarification in
spirit, and is DISTINCT from the in-loop "Interactive steering" checkpoint protocol below
(that one runs mid-loop against CLI JSON; this one runs before the thread exists).

**1. Trigger scope (fresh threads only).** Run this ONLY for a brand-new
`gd research "<question>"` start. SKIP it entirely — and invoke `gd research` with the
ORIGINAL question unchanged — when any of these apply:
   - `gd research resume <id>` or `gd research status [<id>]` (not a new thread)
   - the `deep-research` / `--deep-research` mode branch (different mode)
   - `--no-gates`, autopilot, or any non-interactive / unattended context (no human to ask)

**2. Context first.** Before asking anything, restate the user's question back to them and
identify the ambiguous dimension(s) that block a falsifiable experiment: *what exactly is
measured*, *against what baseline/target*, and *under what conditions*. Only ask about a
dimension that is genuinely unresolved — if the question already carries a testable metric,
skip straight to the handoff.

**3. ONE question at a time.** Call **AskUserQuestion** with a SINGLE multiple-choice
question per call (options preferred over free text). Offer a recommended-first option and an
"other / let me specify" escape. Ask any follow-ups ONE-BY-ONE — never batch several
questions into one interview turn.

**4. Stop condition (hard).** STOP asking the moment the refined question yields a
FALSIFIABLE METRIC TARGET — i.e. a single numeric **metric**, a **comparator**
(`>=`, `<=`, `>`, `<`, `==`), and a concrete **target threshold** the autoresearch loop can
test. Do not over-interview past that point.

**5. Once per thread.** The interview happens exactly ONCE, before the thread exists. It is
never re-run for the same thread (mid-loop clarification is the checkpoint protocol's job).

**6. Handoff (original preserved verbatim).** Invoke `gd research "<refined question>"`
passing the REFINED question as the argument. Preserve the ORIGINAL user question verbatim by
echoing it to the user, e.g. `Original: … → Refined: …`, so it is never silently discarded.

Run GRD's autoresearch loop on a research question:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js research $ARGUMENTS
```

The loop runs a hypothesis-centric scientific cycle to a verdict, persisting a research
thread under `.planning/research/threads/<id>/`:

1. GROUND — read prior findings from the Tesserae KG + local LANDSCAPE/KNOWHOW
2. HYPOTHESIZE — generate one ranked, testable hypothesis
3. DESIGN — write an experiment plan + runnable script
4. RUN — execute the script in a subprocess (behind an execution gate)
5. MEASURE — compare the metric against the plan's target -> verdict
6. LEARN — extract a typed takeaway (with H2/H3/H4 failure classification)
7. DECIDE — supported -> finalize; refuted/inconclusive -> revise hypothesis, loop
8. PERSIST — write FINDING.md and (behind a gate) sync to the shared Tesserae KG

## Subcommands
- `gd research "<question>"` — start a new thread
- `gd research resume <id>` — resume a gate-paused thread
- `gd research status [<id>]` — list threads or show one thread

## Flags
- `--max-iterations N` — cap loop iterations (default 5)
- `--no-gates` — run fully unattended (skip the execute + kg_write gates)
- `resume <id> --answers <file>` — resume a checkpoint-paused thread with answers written to
  `<file>` (see "Interactive steering" below); `gd research status <id>` shows pending
  questions for manual (skill-less) answering.

## Interactive steering (human-in-the-loop)

`gd research "<question>"` and `gd research resume <id>` return machine JSON by default.
This protocol is THIN — a parse→ask→write→resume loop, not a state machine — and mirrors
`plan-phase.md`'s §9 clarification handling verbatim in spirit.

1. After each `gd research ...` / `gd research resume ...` call, inspect
   `result.pendingCheckpoint` in the returned JSON. If it is absent or null, the loop
   finished or gate-paused normally — handle as today.
2. If `result.pendingCheckpoint` is present: parse it FROM THE CLI JSON ONLY. Never open
   `thread.json` or `checkpoints.jsonl` directly — the JSON payload is self-contained and
   version-safe (R10).
3. Call **AskUserQuestion** with all of `pendingCheckpoint.questions` in ONE call (max 4
   questions per call). For each question, list its `recommended:true` option FIRST, labeled
   "(Recommended)". If a question has `freeform:true`, tell the user they may type contract
   edits (`metricKey/comparator/target/language`, one `key: value` per line). Run at most 2
   rounds total; de-dupe by question `ask` TEXT (NOT `id` — ids are per-round labels, not
   stable across rounds). After 2 rounds, proceed with the recommended defaults instead of
   asking again.
4. Build an answers object shaped `{ "<questionId>": { "label": "<chosen option label>",
   "text": "<freeform text if any>" } }` and write it to a file (e.g.
   `.planning/research/threads/<id>/answers.json`) using the **Write tool**. Never pass
   answer text through the shell or argv (R8).
5. Resume with `gd research resume <id> --answers <that file>`. Re-inspect the newly
   returned `pendingCheckpoint` and repeat only if it represents a NEW checkpoint (a
   different point or round) — e.g. after the user chooses "Revise".
