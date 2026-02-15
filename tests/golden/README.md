# Golden Reference Tests

Golden references capture the exact CLI output of `bin/grd-tools.js` **before** any modularization changes. They serve as the regression safety net for Phase 3 (modularize-grd-tools).

## What are golden references?

Each file in `output/` is the stdout captured from running a specific `grd-tools.js` command against a controlled fixture directory. After modularization, running the same commands must produce byte-identical output (with exceptions noted below).

## Directory structure

```
tests/golden/
  capture.sh              # Script to regenerate all golden references
  README.md               # This file
  output/                 # Read-only command outputs
    state-load.json
    state-get.json
    resolve-model.json
    frontmatter-get.json
    ...
  output/mutating/        # State-mutating command outputs (run in isolated temp dirs)
    state-patch.json
    state-advance-plan.json
    phase-add.json
    commit.json
    ...
```

## How to regenerate

```bash
bash tests/golden/capture.sh
```

The script is idempotent -- it cleans up previous output before capturing. It creates temporary fixture directories, runs all commands, and saves output.

## How to diff after modularization

After making changes to `bin/grd-tools.js` or extracting modules to `lib/`:

```bash
# 1. Save current output
cp -r tests/golden/output tests/golden/output-before

# 2. Regenerate
bash tests/golden/capture.sh

# 3. Diff
diff -r tests/golden/output-before tests/golden/output
```

If the diff is empty, modularization preserved exact behavior.

## Known non-deterministic fields

Some outputs contain values that change between runs:

- **`current-timestamp*.json`** and **`current-timestamp.txt`** -- timestamps vary by definition
- **Git commit hashes** in `mutating/commit.json` and `mutating/verify-commits.json` -- depend on temp repo
- **Absolute paths** in some outputs -- depend on temp directory location

When comparing, either:
- Exclude these files from the diff
- Use a JSON-aware diff that ignores timestamp and path fields
- Normalize paths before comparison

## Fixture structure

The capture script creates a minimal `.planning/` directory with:
- `config.json` -- balanced profile, phase branching
- `STATE.md` -- one active phase, one decision
- `ROADMAP.md` -- two phases across one milestone
- `phases/01-test/01-01-PLAN.md` -- minimal plan with frontmatter
- `phases/01-test/01-01-SUMMARY.md` -- minimal summary
- `phases/02-build/02-01-PLAN.md` -- incomplete phase (no summary)
- `todos/pending/sample.md` -- one pending todo

## Skipped commands

Commands that require external services are not captured:
- `tracker sync-roadmap` -- requires GitHub CLI or Jira
- `tracker sync-phase` -- requires GitHub CLI or Jira
- `tracker update-status` -- requires GitHub CLI or Jira
- `tracker add-comment` -- requires GitHub CLI or Jira
- Other tracker mutation commands

These are noted in the capture script output as `SKIP` entries.
