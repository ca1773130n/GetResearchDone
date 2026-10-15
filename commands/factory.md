---
description: Research factory — interview for a work order, then run experiments until a patch passes a hidden evaluation and a PR opens
argument-hint: "[<what should get better, and in which repo>] | status [<order-id>] | run <order-id>"
---

# /grd:factory

Turns one sentence about what should improve in a codebase into a validated work order,
then runs it. The human writes no JSON: this skill writes the draft, and deterministic
`gd factory` tool commands scan, measure, check and save it.

Tool commands (JSON by default):

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory status            # home, drafts, orders
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory scan <repo>
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory validate <id>
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory save <id>
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js factory run <id>
```

If `$ARGUMENTS` starts with `status` or `run`, run that tool command with the remaining
arguments, print the result, and stop. Typing `run <id>` yourself is the human's explicit confirmation to spend that
order's budget, so no further question is asked for it.

## The interview

Ask ONE question per AskUserQuestion call. Every question after the first offers options
backed by evidence you just gathered, with the recommended option first and labelled
"(Recommended)". Keep the draft at `<home>/drafts/<id>/draft.json`, where `<home>` comes
from `factory status`. Write it after every step. The human never edits it.

1. **Goal.** The only free-text question, unless `$ARGUMENTS` already answers it: what
   should get better, in which repo (absolute path). Derive `id` (lowercase, dashes, at
   most 63 characters) and `objective` (one sentence). Then offer "Accept all
   recommendations": if chosen, take the recommended option at steps 2 to 7, still
   running every command, and stop only at step 8.
2. **Environment.** Run `factory scan <repo>`. Offer `proposedImage` and `proposedSetup`.
   If the scan returned no image (ecosystem `unknown`), ask for the image and setup
   command. Offer `proposedMemory`; if `freeMemoryMb` is under 2048, say so.
3. **Metric and dev evaluation.** Offer the scan's `measurements` that fit the goal. The
   command must print `__RESULT__ {"<metric>": <number>}`. If none fits, offer to write a
   dev evaluation script into the repo outside any path you will make editable, and
   commit nothing: tell the human to commit it. Set `dev_eval.files` to every repo file
   the evaluation reads or runs (the scan's `files` for that measurement, plus the script
   itself).
4. **Target.** Write the draft with a provisional target and run `factory validate <id>`.
   Read `dev_eval` from the report: it gives the median (the typical
   value) and spread (how much repeat runs vary) on the unmodified code. Propose targets
   from it: a service-level objective (a target the project already states) found in the
   repo's docs, and 20 and 40 percent better than the median. If `noisy` is true, say the
   metric is too noisy to decide and propose raising `dev_eval.repeats` (how many times
   the measurement is run, so the median is steadier).
5. **Editable paths.** Propose `editable` globs (path patterns such as `dir/**`, meaning every
   file under `dir`) covering where the measured code path lives, found by reading the code. Evaluation files can never be included. Offer
   them as a multi-select so the human can trim.
6. **Hidden evaluation.** Recommended: write `<home>/drafts/<id>/hidden/eval.sh`, a
   held-out variant of the dev evaluation that differs in workload trace, seed or data
   split, and that measures from outside the process under test where possible. It runs
   in the same container image with the worktree at `/work` and must print
   `__RESULT__ {"<metric>": <number>}`. Never put it in the repo and never mention its
   path or contents outside this interview. Alternatively the human points at an existing
   script, which you copy there. Set `hidden_eval.script` to `hidden/eval.sh`.
7. **Budget.** Offer Small (3 candidates, hidden_queries 2, 120 minutes, recommended),
   Medium (8, 3, 360) and Large (20, 4, 720). Gloss: candidates is how many patches are
   tried, hidden_queries is how many times a patch may be checked against the held-out
   evaluation, the last number is the time limit. For each, estimate tokens as
   candidates × 5 spawns × 150,000 and say that the figure uses the scheduler's
   documented default per research spawn. Set `budget.tokens` to that estimate.
8. **Review.** Run `factory validate <id>` again. Show every check. If any fails, go back
   to the step it belongs to. When all pass, show a one-screen summary: objective, rule,
   baseline, editable paths, image, repeats, budget. On confirmation run `factory save
   <id>`, then offer to start `factory run <id>` now.

Never run `factory run` unless the human confirmed it in this conversation, either by typing
`run <id>` or by accepting the offer in step 8: it spends the budget.
