# Task B1: padded decimal phase headings in ROADMAP

## Bucket

Bug-fix.

## Symptom

A helper extracts the "Goal" line for a given phase from
`ROADMAP.md`. Phase headings in real roadmaps use forms like:

```
## Phase 6.1: ...
## Phase 06.1: ...
## Phase 6.10: ...
```

The current regex is `/Phase\s+\d+(?:\.\d+)?:/`. It matches
`Phase 6.1` but not `Phase 06.1` (zero-padded major) — and it
treats `Phase 6.10` and `Phase 6.1` as equivalent only when
`parseFloat` is involved downstream (where `01.10 === 01.1`).

For `phaseNum = "06.1"` the helper returns an empty goal because no
heading matches the literal string.

## Expected fix

Build the regex per-component with optional zero-padding:

```ts
function _phaseHeadingRe(phaseNum: string): RegExp {
  const parts = phaseNum.split('.').map((p) => `0*${p.replace(/^0+/, '')}`);
  return new RegExp(`Phase\\s+${parts.join('\\.')}\\s*:`, 'i');
}
```

This matches `Phase 06.1`, `Phase 6.1`, `Phase 6.01`, `Phase 06.01`
all as the same phase id, but keeps `Phase 6.10` distinct from
`Phase 6.1`.

## Files

- `lib/example.ts` — `_extractRoadmapGoal` function

## Reference

Codex r1 PR #41. The same pattern shows up in `lib/drift.ts` and
`lib/plan-tournament.ts`.
