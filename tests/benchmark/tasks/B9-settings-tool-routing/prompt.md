# Task B9: route `gd settings effort` as a tool command

## Bucket

Bug-fix — easy.

## Symptom

`gd settings effort <thrifty|balanced|deep>` is implemented as an
in-process tool subcommand, but the classifier's `SETTINGS_TOOL_SUBS`
set omits `'effort'`. So `classify('settings', 'effort')` returns
`'agent'` and the command misroutes — it never writes config.json.

## Expected fix

Add `'effort'` to `SETTINGS_TOOL_SUBS` (alongside `token_profile` and
`phase_complete_llm_fallback`).

## Files

- `classify.ts` — `SETTINGS_TOOL_SUBS`

## Reference

Ported from GRD v0.4 Phase 3 codex code review (P2, commit 79887eb).
