# Git Planning Commit

Commit planning artifacts using the grd-tools CLI, which automatically checks `commit_docs` config and gitignore status.

## Commit via CLI

Always use `grd-tools.js commit` for `.planning/` files — it handles `commit_docs` and gitignore checks automatically:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "docs({scope}): {description}" --files .planning/STATE.md .planning/ROADMAP.md
```

The CLI will return `skipped` (with reason) if `commit_docs` is `false` or `.planning/` is gitignored. No manual conditional checks needed.

## Amend previous commit

To fold `.planning/` file changes into the previous commit:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "" --files .planning/codebase/*.md --amend
```

## Commit Message Patterns

| Command | Scope | Example |
|---------|-------|---------|
| plan-phase | phase | `docs(phase-03): create attention module plans` |
| execute-phase | phase | `docs(phase-03): complete attention module phase` |
| survey | research | `docs: complete SoTA survey for super-resolution` |
| assess-baseline | research | `docs: update baseline assessment` |
| new-milestone | milestone | `docs: start milestone v1.1` |
| remove-phase | chore | `chore: remove phase 17 (dashboard)` |
| insert-phase | phase | `docs: insert phase 16.1 (critical fix)` |
| add-phase | phase | `docs: add phase 07 (ablation study)` |

## When to Skip

- `commit_docs: false` in config
- `.planning/` is gitignored
- No changes to commit (check with `git status --porcelain .planning/`)
