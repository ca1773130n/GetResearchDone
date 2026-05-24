# GRD internal benchmark fixtures

Reproducible task fixtures for measuring agent performance.

Each task ships as a self-contained subdirectory under
`tests/benchmark/tasks/<task-id>/`:

```
tasks/<id>/
├── prompt.md       # Task description (what the agent reads)
├── before/         # Starting code state (tree fixture, no `.git`)
├── after/          # Reference correct end state (for diff comparison)
└── verify.sh       # Pass/fail check: exits 0 = passed, non-zero = failed
```

The harness (`scripts/run-internal-bench.mjs`, planned) will:

1. Copy `before/` into a temp dir + `git init`
2. Hand the agent the contents of `prompt.md`
3. After the agent reports done, run `verify.sh` in the temp dir
4. Aggregate exit codes into a verdict file

## Populated tasks (4 of 30)

| ID | Bucket | Source | Verifies |
|---|---|---|---|
| `R1-segment-traversal` | refactor (easy) | codex r1, ported from PR #25 | filePath segment-based `..` check |
| `R2-prefixed-artifacts` | refactor (medium) | codex r2-r9, recurring pattern | All `*-PLAN.md` callers also accept bare `PLAN.md` |
| `R3-find-phase-resolver` | refactor (medium) | codex r2 | Route phaseArg through findPhaseInternal |
| `B1-padded-decimal-roadmap` | bug-fix | codex r1 PR #41 | Padded decimal `Phase 06.1` regex match |

Each fixture is small enough (≤300 LOC) that the cost per task run is
bounded.

## Adding a new task

```bash
mkdir -p tests/benchmark/tasks/<id>/{before,after}
cp -r <real-failing-repo>/. tests/benchmark/tasks/<id>/before/
cp -r <real-fixed-repo>/.   tests/benchmark/tasks/<id>/after/
cat > tests/benchmark/tasks/<id>/prompt.md <<EOF
# Task: <one-line description>

<2-5 paragraphs describing the symptom, what's expected, where to look>
EOF
cat > tests/benchmark/tasks/<id>/verify.sh <<EOF
#!/bin/sh
# Exit 0 if the fix is present, non-zero otherwise.
grep -q "split('/').includes('..')" lib/invariants.ts || exit 1
echo "verify: pass"
EOF
chmod +x tests/benchmark/tasks/<id>/verify.sh
```

The harness will be added in a follow-up cycle once enough tasks are
populated to make it worth automating.
