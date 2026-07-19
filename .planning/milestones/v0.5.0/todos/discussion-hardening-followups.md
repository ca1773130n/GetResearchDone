---
created: 2026-07-19
source: 105-REVIEW.md (phase 105 code review warning)
area: lib/discussion.ts
---

# Discussion panel hardening follow-ups

Two non-blocking gaps found during 105-04 live validation (see 105-04-VALIDATION.md):

1. `resolveElicitation` ignores its `question` argument in production — it forwards only
   `ck.context` to the panel, dropping the built panel question (options + "reply verbatim"
   instruction). The 105-04 literal-panel observation only worked because labels were
   surfaced through `ck.context`. Fix: forward `question` (or merge it into context).

2. codex/gemini backends return empty inside `runDiscussion` despite standalone auth
   working (`codex exec` succeeds directly). Investigate adapter invocation from within
   the discussion runner.
