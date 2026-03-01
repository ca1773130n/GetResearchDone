---
phase: 63-entry-points-mcp-server-migration
plan: 02
subsystem: bin/grd-tools
tags: [typescript-migration, cli-router, entry-point]
dependency_graph:
  requires: [lib/utils.ts, lib/state.ts, lib/frontmatter.ts, lib/roadmap.ts, lib/scaffold.ts, lib/verify.ts, lib/phase.ts, lib/tracker.ts, lib/worktree.ts, lib/deps.ts, lib/autopilot.ts, lib/evolve/index.ts, lib/parallel.ts, lib/markdown-split.ts, lib/context/index.ts, lib/commands/index.ts]
  provides: [bin/grd-tools.ts]
  affects: [bin/grd-tools.js]
tech_stack:
  added: []
  patterns: [require-as-typed-cast, route-descriptor-interface, readonly-subcommand-arrays]
key_files:
  created: [bin/grd-tools.ts]
  modified: [bin/grd-tools.js]
decisions:
  - "require-as typed cast for all 16 lib/ imports pointing to .ts files"
  - "RouteDescriptor interface for descriptor-based dispatch table"
  - "flag() helper uses single signature with optional fallback returning string | undefined"
  - "Subcommand arrays typed as readonly string[] with as string[] cast at validateSubcommand call sites"
  - "null coalescing (?? null) replaces passing undefined from flag() to functions expecting null"
  - "Evolve import uses lib/evolve/index.ts directly (not .js proxy)"
  - "Context import uses lib/context/index.ts directly (not .js proxy)"
  - "Commands import uses lib/commands/index.ts directly (not .js proxy)"
metrics:
  duration: 5min
  completed: 2026-03-02
---

# Phase 63 Plan 02: Migrate bin/grd-tools.js to TypeScript Summary

Fully typed CLI router with RouteDescriptor interface, 16 require-as typed imports, and CJS proxy -- all CLI smoke tests produce identical output to pre-migration.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create bin/grd-tools.ts with typed imports and ROUTE_DESCRIPTORS | 99519e0 | bin/grd-tools.ts |
| 2 | Convert bin/grd-tools.js to CJS proxy and verify CLI behavior | 395f8f2 | bin/grd-tools.js |

## Changes Made

### Task 1: bin/grd-tools.ts (1167 lines)

Migrated the entire 980-line bin/grd-tools.js to TypeScript:

- **RouteDescriptor interface** with typed handler signature: `(args: string[], cwd: string, raw: boolean) => void | unknown`
- **ROUTE_DESCRIPTORS** typed as `RouteDescriptor[]` with 22 descriptor entries
- **routeCommand()** typed: `(command: string, args: string[], cwd: string, raw: boolean) => Promise<void>`
- **flag() helper** typed: `(args: string[], name: string, fallback?: string) => string | undefined`
- **main()** typed: `async function main(): Promise<void>`
- **16 require-as typed casts** for lib/ imports: utils, frontmatter, state, roadmap, scaffold, verify, phase, tracker, worktree, deps, autopilot, evolve, parallel, markdown-split, context, commands
- **All subcommand arrays** typed as `readonly string[]`
- **Catch blocks** use `(e: unknown)` with `(e as Error).stack` pattern
- **patches object** typed as `Record<string, string>`
- Compiles clean under `strict:true` with zero `any` types in grd-tools.ts

### Task 2: bin/grd-tools.js CJS proxy (9 lines)

Converted the 980-line bin/grd-tools.js to a 9-line CJS proxy:

```javascript
#!/usr/bin/env node
'use strict';
require('./grd-tools.ts');
```

- package.json `bin.grd-tools` field unchanged (still `bin/grd-tools.js`)
- CLI smoke tests verified identical output: `state load`, `generate-slug`, `current-timestamp`, usage message

## Verification

- Level 1 (Sanity): `npx tsc --noEmit` -- PASS (zero errors)
- Level 1 (Sanity): `npx eslint bin/grd-tools.ts` -- PASS (zero warnings)
- Level 2 (Proxy): `node bin/grd-tools.js generate-slug "test slug"` -- `{"slug":"test-slug"}` -- PASS
- Level 2 (Proxy): `node bin/grd-tools.js current-timestamp date` -- `{"timestamp":"2026-03-01"}` -- PASS
- Level 2 (Proxy): `node bin/grd-tools.js state load` -- JSON output -- PASS
- Level 2 (Proxy): `node bin/grd-tools.js` (no args) -- Usage message -- PASS

## Deviations from Plan

### Minor Adjustments

**1. null coalescing pattern for flag() calls**
- **Issue:** Original JS used `flag(args, '--name', null)` passing null as fallback; TS flag() returns `string | undefined` when no fallback provided
- **Fix:** Used `flag(args, '--name') ?? null` pattern to convert undefined to null at call sites
- **Rationale:** Cleaner than overload signatures; preserves original null-passing behavior to downstream functions

**2. Decomposed module imports use .ts barrel directly**
- **Issue:** Plan suggested either `.js proxy` or `.ts barrel` for decomposed modules (commands, context, evolve)
- **Fix:** Used `lib/commands/index.ts`, `lib/context/index.ts`, `lib/evolve/index.ts` directly
- **Rationale:** Consistent with typed import approach; avoids untyped proxy hop

## Decisions Made

1. **require-as typed cast for all 16 lib/ imports** -- Each import gets explicit function signature types matching the .ts source
2. **RouteDescriptor interface** -- Local interface (not in types.ts) since it's only used by grd-tools.ts
3. **Single flag() signature** -- `(args: string[], name: string, fallback?: string)` with `?? null` at call sites, rather than overloaded signatures
4. **readonly string[] for subcommand arrays** -- With `as string[]` cast when passed to validateSubcommand (which expects mutable array parameter)
5. **Direct .ts barrel imports for decomposed modules** -- commands/index.ts, context/index.ts, evolve/index.ts

## Self-Check: PASSED

- [x] bin/grd-tools.ts exists (1167 lines, min 900 required)
- [x] bin/grd-tools.js exists (CJS proxy, 9 lines)
- [x] Commit 99519e0 exists
- [x] Commit 395f8f2 exists
- [x] tsc --noEmit passes
- [x] eslint passes
- [x] CLI smoke tests produce identical output
