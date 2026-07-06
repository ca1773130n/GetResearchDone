---
description: Deep research — decompose a question, fan out parallel KG-grounded researchers, adversarially verify claims, synthesize a cited report
argument-hint: "\"<question>\" [ultracode]"
---

<purpose>
Run a parallel, KG-grounded, adversarially-verified research pass on a question and write a
cited, confidence-rated report. GRD's native take on Claude Code's built-in `deep-research`
(Scope → parallel Search/Extract → 3-vote Verify → Synthesize), grounded on the **Tesserae
knowledge graph** + `LANDSCAPE.md` / `PAPERS.md` instead of raw web search, and reusing GRD's
`grd-surveyor` / `grd-deep-diver` research subagents.
</purpose>

<core_principle>
The orchestrator coordinates, it does not research. It decomposes the question, fans the work
out to parallel `Task()` subagents, adversarially verifies their claims, then synthesizes.
</core_principle>

## 1. Parse arguments
Extract `QUESTION` from `$ARGUMENTS` (the quoted question / topic). Set `ULTRACODE = true` if the
bare keyword `ultracode` (or `--ultracode`) is present anywhere in the args; strip it from
`QUESTION`. If `QUESTION` is empty after stripping, error with:
`usage: /grd:deep-research "<question>" [ultracode]`.

## 2. Run the deep-research flow
Follow the shared procedure with `QUESTION` and `ULTRACODE`:

@${CLAUDE_PLUGIN_ROOT}/references/deep-research-flow.md

## 3. Report
Print the executive summary and the path to the written report.
