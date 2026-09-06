# Deprecated and demoted commands

What is deprecated, what actually happened to it, and what to use instead.

This file was a *draft trim plan* for v0.4.x. The plan was executed only in
part, so it now records the surface as it really is at 0.6.0, verified against
`gd --help` and the CLI's own responses rather than against the plan.

## Removed: `gd evolve`

Deprecated 2026-06-06. **It no longer runs** — invoking it prints a redirect and
exits:

```
gd evolve is deprecated and no longer runs.
Self-improvement moved to the life-harness:  gd harness round
```

Use **`gd harness round`**: evidence from Tesserae session findings, eval-gated,
git-reversible, where evolve was a static scan whose discovery saturated.
`lib/evolve/` stays in-tree because `gd singularity` reads its history; removal
is tracked separately. Any document that still presents `gd evolve` as a live
verb is wrong.

## Deprecated but still routed

These print a warning on stderr and then do their old job. They are hidden from
`gd --help` but have **not** been removed.

| Command | Use instead |
|---|---|
| `gd dashboard` | `gd health` + `gd think` |
| `gd health-check` | `gd health` (this is a subset of it) |
| `gd coverage-report` | `npx jest --coverage` |
| `gd phase-time-budget` | `gd estimate-phase` |
| `gd todo-duplicates` | — one-off helper, no successor |
| `gd markdown-split` | — internal infrastructure, exposed by accident |
| `gd setup` | `gd init` |

**Their warning text is stale.** Each says "will be removed in v0.4.0", a
release that shipped long ago; 0.5.0 and 0.6.0 came and went with the commands
still in place. Removing them needs a decision about a real target version, so
the strings are left alone rather than made to name another date nobody is
committed to.

## The v0.4 trim plan, and what became of it

The plan came from a reality-check audit against Aider, OpenHands, SWE-agent,
Sakana, STORM and GPT-Researcher: peer agents expose 5–8 hero verbs, GRD exposed
60+. Its principle still stands — keep what supports the hero output, move the
rest behind the `gd-tools` router.

What actually happened:

- **Deprecation warnings**: done. The seven commands above warn and are hidden
  from top-level help.
- **The demotions**: partial. `dead-end`, `genome`, `plan-tournament` and `scan`
  are still top-level verbs in `gd --help`, not `gd-tools`-only.
- **`gd-tools` → `gd internal`**: never happened. `gd-tools` remains the router
  and `gd internal` does not exist.

So the surface is smaller than it was and larger than the plan wanted. Anyone
resuming this work should re-derive the demote list from `gd --help` rather than
from the original plan, which is now three releases old.

## Cross-references

- [architecture/CONFIG.md](architecture/CONFIG.md) — the `evolve` config block
  and its `harness` successor
- [CHANGELOG.md](CHANGELOG.md) — when each deprecation landed
