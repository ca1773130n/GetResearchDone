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

## Populated tasks (16 of 30)

The v0.5 promotion gate requires ≥16 internal-bench tasks; this set
meets that floor. Each fixture's `after/` tree passes its own
`verify.sh` and its `before/` tree fails it (the verifier discriminates).

| ID | Bucket | Source | Verifies |
|---|---|---|---|
| `R1-segment-traversal` | refactor (easy) | codex r1, ported from PR #25 | filePath segment-based `..` check |
| `R2-prefixed-artifacts` | refactor (medium) | codex r2-r9, recurring pattern | All `*-PLAN.md` callers also accept bare `PLAN.md` |
| `R3-find-phase-resolver` | refactor (medium) | codex r2 | Route phaseArg through findPhaseInternal |
| `R4-componentwise-phase-compare` | refactor (medium) | codex, recurring | Component-wise phase-id compare (01.10 > 01.9) |
| `R5-hardfail-before-cluster` | refactor (medium) | v0.4 P4 codex r1 P1 #4 | DEAD-ENDS hard-fail runs before clustering |
| `B1-padded-decimal-roadmap` | bug-fix | codex r1 PR #41 | Padded decimal `Phase 06.1` regex match |
| `B2-time-budget-zero-unlimited` | bug-fix | codex, recurring | `timeout: 0` means unlimited (≠ undefined) |
| `B3-empty-stdout-acceptance` | bug-fix | codex | Empty stdout is a valid acceptance state |
| `B4-verification-exec-allowlist` | bug-fix (security) | v0.4 P3 codex P1 | Allowlist + path-sep reject + SIGKILL |
| `B5-effort-knob-fallback` | bug-fix | v0.4 P3 codex P2 | Invalid effort falls back, no crash |
| `B6-slug-word-boundary` | bug-fix | v0.4 P3 codex P2 | Case-insensitive, word-boundary slug match |
| `B7-fail-closed-parser` | bug-fix | v0.4 P2 | Marker parser fails closed on bad count |
| `B8-bhfdr-order` | bug-fix (stats) | v0.4 P5 | BH-FDR preserves input order |
| `B9-settings-tool-routing` | bug-fix | v0.4 P3 codex P2 | `gd settings effort` routes as tool |
| `F1-dry-run-side-effect-free` | feature | codex | `--dry-run` writes nothing |
| `F2-plan-overwrite-guard` | feature (safety) | v0.4 P3 codex P2 | Refuse to clobber PLAN.md without `--force` |

Each fixture is small enough (≤300 LOC) that the cost per task run is
bounded. The v0.4 entries (R5, B4-B9, F2) are ported from this
milestone's per-phase codex code reviews — real bugs with known fixes,
which makes them honest agent-capability probes.

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
