# Task F1: add side-effect-free `--dry-run` to import-knowhow

## Bucket

Feature-add.

## Symptom

`lib/commands/import-knowhow.ts` ships a command that copies entries
from a source `KNOWHOW.md` into the project. Users want a `--dry-run`
that previews what would be imported without writing anything.

A previous attempt added `--dry-run` but left two side-effect bugs:

1. `fs.mkdirSync(destResearchDir, { recursive: true })` ran
   unconditionally at function entry, so a dry-run on a project with
   no `.planning/research/` directory still created the directory.
2. When the destination file already existed, the
   `destExists && !force` conflict path returned BEFORE the dry-run
   path ran, so `--dry-run --force` was required to even see a
   preview.

## Expected fix

- Defer `fs.mkdirSync(destResearchDir, { recursive: true })` until
  the actual copy site, gated on `!dryRun`.
- Skip the `destExists && !force` conflict block when `dryRun` is
  true. Dry-run should always be able to preview "would overwrite X"
  without requiring `--force`.

## Files

- `lib/commands/import-knowhow.ts`

## Reference

Codex r16 P2 (mkdir leak) + r24 P3 (conflict guard).
