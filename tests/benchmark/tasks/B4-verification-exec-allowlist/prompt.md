# Task B4: constrain verification-command execution

## Bucket

Bug-fix (security) — medium.

## Symptom

`runVerification` in `runner.ts` executes candidate-declared shell
commands to score them. It guards with a *blocklist* of dangerous
binaries (`rm`, `curl`, `wget`, `sudo`). This is bypassable: `/bin/rm`,
`./rm`, and any unlisted destructive tool (`node` running an arbitrary
script, `git`, `dd`, …) all run. Because this happens during candidate
*selection*, a candidate that will be rejected can still execute code.

## Expected fix

- Replace the blocklist with an **allowlist** of safe deterministic
  check tools (npx, npm, pnpm, yarn, node, tsx, tsc, eslint, jest,
  prettier).
- Reject any `argv[0]` containing a path separator (`/` or `\`) so
  absolute/relative paths cannot bypass the allowlist.
- Use `killSignal: 'SIGKILL'` on the timeout so a child ignoring
  SIGTERM cannot hang selection.

## Files

- `runner.ts` — `runVerification`

## Reference

Ported from the GRD v0.4 Phase 3 codex code review (P1, commit 79887eb).
