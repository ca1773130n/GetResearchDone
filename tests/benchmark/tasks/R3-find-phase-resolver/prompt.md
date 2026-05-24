# Task R3: route phase args through findPhaseInternal

## Bucket

Refactor — medium.

## Symptom

`lib/commands/example.ts` exposes a CLI command that takes a phase id
(`gd example <N>`). Real phase directories use zero-padded names like
`01-test`, `02-deploy`, etc. The current code builds the phase path
with `path.join(phasesBase, phaseArg)` — so when a user passes the
canonical bare phase id (`1`), the lookup fails with "phase directory
not found" even though `01-test/` exists on disk.

The project has a canonical phase resolver
(`utils.findPhaseInternal(cwd, phase)`) that handles padding,
trailing-slug match, and dot-decimal phase ids (`01.10`).

## Expected fix

Replace the path-join with a call to `findPhaseInternal`:

```ts
const phaseInfo = findPhaseInternal(cwd, phaseArg);
if (!phaseInfo || !phaseInfo.found) {
  error(`Phase not found: ${phaseArg}`);
}
const phaseDir = path.join(cwd, phaseInfo.directory);
```

Note: `findPhaseInternal` returns `directory` (cwd-relative), so the
caller must resolve to absolute.

## Files

- `lib/commands/example.ts` — main command function

## Reference

This pattern was the source of 4 P2 findings (codex r2) across the
budget / blame / freshness / check-plans commands. The follow-up r4
caught a regression where the wrong field name (`dir` vs `directory`)
was used.
