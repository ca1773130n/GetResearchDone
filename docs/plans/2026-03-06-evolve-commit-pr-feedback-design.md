# Evolve: Auto-Commit, PR Creation, and Iteration Feedback

**Date:** 2026-03-06
**Status:** Approved

## Problem

The evolve command has three critical gaps:
1. EVOLUTION.md decisions/patterns/takeaways are always empty arrays — no learning is captured
2. No automatic commits after each iteration — changes can be lost
3. No PR creation per evolve run — changes sit in worktrees unreviewed

## Design

### 1. Structured Iteration Feedback

**Execute prompt change:** Add instructions telling the subprocess to write a JSON summary file after implementing changes:

File: `.planning/evolve-iteration-{N}.json`
```json
{
  "decisions": ["Used X pattern because Y"],
  "patterns": ["Found duplicated logic in A and B"],
  "takeaways": ["Module X needs refactoring"],
  "files_changed": ["src/foo.ts", "src/bar.ts"]
}
```

**Orchestrator change:** After execution, read this JSON file, populate the `decisions`, `patterns`, `takeaways` arrays passed to `writeEvolutionNotes()`, then delete the temp file.

### 2. Per-Iteration Commit + Single PR

After each iteration in `_runIterationStep`:
1. Check `git diff` for changes in `executionCwd`
2. If changes exist and `auto_commit` is enabled:
   - `git add -A`
   - `git commit -m "evolve(iteration-{N}): {group themes summary}"`
3. After ALL iterations complete (existing post-loop):
   - If `create_pr` is enabled and commits exist: push branch + create PR
   - Existing worktree cleanup flow continues

### 3. Evolve Settings Section

New config section in `.planning/config.json`:
```json
{
  "evolve": {
    "auto_commit": true,
    "create_pr": true
  }
}
```

Settings accessible via:
- `grd-tools.js config-set evolve.auto_commit true`
- `grd-tools.js config-set evolve.create_pr true`
- `/grd:settings` skill updated to support evolve subcommands

### Files to Modify

| File | Change |
|------|--------|
| `lib/evolve/_prompts.ts` | Update `buildBatchExecutePrompt` to include feedback JSON instructions |
| `lib/evolve/orchestrator.ts` | Read feedback JSON, auto-commit per iteration, pass real data to `writeEvolutionNotes` |
| `lib/evolve/cli.ts` | Read evolve config and pass to `runEvolve()` |
| `lib/evolve/types.ts` | Add `auto_commit` and `create_pr` to EvolveOptions |
| `lib/types.ts` | Add `evolve` section to GrdConfig interface |
| `commands/grd-settings.md` | Add evolve subcommands to settings skill |
| Tests | Update evolve tests for new behavior |
