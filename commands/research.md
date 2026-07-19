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
