# Autopilot Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `lib/autopilot.ts` (2,702 lines, 34 exports) into 4 focused modules along the natural seams identified in `docs/architecture/RISKS.md` finding O1.

**Architecture:** Sequential extractions on a single branch. Each extraction is its own commit so a regression can be bisected to a single module. Tests must pass after every commit.

**Tech Stack:** TypeScript strict, CommonJS, jest with ts-jest, Node 20. Standard GRD conventions (`'use strict'`, JSDoc, typed require, no `any`).

**Spec reference:** `docs/superpowers/specs/2026-04-12-autopilot-decomposition-design.md`

**Worktree:**
```bash
git worktree add .worktrees/autopilot-decomp -b refactor/autopilot-decomposition
cd .worktrees/autopilot-decomp
```

**Critical rules:**
- After each extraction, ALL existing tests must pass before committing.
- If a test breaks because of import paths, update the test (it's a structural change, not a logic change).
- If a test breaks because the extracted code's behavior changed, STOP and report — that means the extraction wasn't pure.
- Use `require('./autopilot-foo')` style with typed casts. Match the existing GRD pattern.
- All function signatures stay identical. Only the file location changes.
- The orchestrator (`autopilot.ts`) re-exports any symbols that other modules in `lib/` or `bin/` import from `./autopilot`. We do NOT update import sites elsewhere — they continue to import from `./autopilot`.

---

## File Structure

**New files:**
```
lib/autopilot-pipeline.ts     # ~900 lines — runPostPhasePipeline + step helpers
lib/autopilot-waves.ts        # ~600 lines — wave splitting + write-intent locks + merge queue
lib/autopilot-milestone.ts    # ~400 lines — multi-milestone loop helpers
```

**Modified files:**
```
lib/autopilot.ts              # 2,702 → ~600 lines (orchestrator only)
jest.config.js                # +3 per-file coverage thresholds
docs/CHANGELOG.md             # Unreleased entry
```

**Test files:** unchanged. `tests/unit/autopilot.test.ts` continues to exercise the orchestrator + the 3 helpers transitively.

---

## Pre-flight: Map autopilot.ts before touching it

### Task 0: Inventory

- [ ] **Step 0.1: Get an authoritative function inventory**

```bash
grep -n "^export function\|^function \|^export async function\|^async function \|^module.exports" lib/autopilot.ts > /tmp/autopilot-inventory.txt
cat /tmp/autopilot-inventory.txt | head -50
```

For every function, classify it into one of 4 buckets:
- **O** = stays in orchestrator (autopilot.ts)
- **P** = pipeline (autopilot-pipeline.ts)
- **W** = waves (autopilot-waves.ts)
- **M** = milestone (autopilot-milestone.ts)

Use these heuristics:
- `runAutopilot`, `cmdAutopilot`, `runMultiMilestoneAutopilot`, top-level config loaders → **O**
- `runPostPhasePipeline`, `_runPlanStep`, `_runExecuteStep`, `_runVerifyStep`, `_runPostPipelineStep`, anything writing `phase-finalize` markers → **P**
- `_splitIntoWaves`, `_acquireWriteIntent`, merge queue helpers, write-intent file lock → **W**
- `_isAllPhasesComplete`, `resolveNextMilestone`, `_finalizeMilestone` → **M**
- Pure prompt builders shared across pipeline steps → **O** (kept central, imported by P)
- Functions called from BOTH P and W → put in W if W is the primary caller; otherwise O

Write the classified inventory to `/tmp/autopilot-classification.md` for reference. Don't commit it.

- [ ] **Step 0.2: Identify external consumers**

```bash
grep -rn "require(['\"].*autopilot['\"]\\|from ['\"].*autopilot['\"]" lib/ bin/ tests/ 2>/dev/null | head -20
```

Note which symbols are imported from `./autopilot` (or `../lib/autopilot`) by other modules. Those symbols MUST remain importable from `./autopilot` after decomposition — re-export them from autopilot.ts even if their definition moves.

---

## Task 1: Extract autopilot-waves.ts (smallest, no dependencies)

Start with the leaf module — wave splitting and merge queue have no internal deps on other autopilot logic, so the extraction is pure.

- [ ] **Step 1.1: Identify the wave/merge functions and their helpers**

From the inventory in Task 0, list every function tagged **W**. Verify they don't reference any autopilot-specific module-level state (counters, caches, etc.). If they do, that state moves with them — or stays in autopilot.ts and is passed in as a parameter.

- [ ] **Step 1.2: Create lib/autopilot-waves.ts**

Skeleton:

```typescript
'use strict';

/**
 * GRD Autopilot/Waves -- Wave-splitting algorithm, write-intent file
 * locks, and merge queue helpers. Extracted from lib/autopilot.ts as
 * part of the post-gsd-2 decomposition.
 *
 * No dependencies on other autopilot modules — these helpers are
 * pure-ish (file I/O for locks, but no orchestration logic).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { /* relevant types from ./types */ } from './types';

// ─── Wave splitting ───────────────────────────────────────────────

export function _splitIntoWaves(
  // ... same signature as in autopilot.ts ...
): WaveResult[] {
  // ... copy verbatim from autopilot.ts ...
}

// ─── Write-intent file locks ──────────────────────────────────────

export function _acquireWriteIntent(/* ... */) { /* ... */ }
export function _releaseWriteIntent(/* ... */) { /* ... */ }

// ─── Merge queue ──────────────────────────────────────────────────

export function _enqueueMerge(/* ... */) { /* ... */ }
export function _processMergeQueue(/* ... */) { /* ... */ }

module.exports = {
  _splitIntoWaves,
  _acquireWriteIntent,
  _releaseWriteIntent,
  _enqueueMerge,
  _processMergeQueue,
};
```

Replace `// ... copy verbatim from autopilot.ts ...` with the actual function bodies. Preserve every comment, every guard, every log line.

- [ ] **Step 1.3: Update autopilot.ts to import from the new module**

In `lib/autopilot.ts`:

1. Delete the function definitions for the symbols that moved.
2. Add a typed `require` near the top of the file:

```typescript
const {
  _splitIntoWaves,
  _acquireWriteIntent,
  _releaseWriteIntent,
  _enqueueMerge,
  _processMergeQueue,
} = require('./autopilot-waves') as {
  _splitIntoWaves: (/* signature */) => /* return */;
  _acquireWriteIntent: (/* signature */) => /* return */;
  _releaseWriteIntent: (/* signature */) => /* return */;
  _enqueueMerge: (/* signature */) => /* return */;
  _processMergeQueue: (/* signature */) => /* return */;
};
```

3. If any of the moved functions were in `module.exports` at the bottom, keep them there (re-export from the imported binding). External consumers continue to import from `./autopilot`.

- [ ] **Step 1.4: Run autopilot tests**

```bash
npx jest tests/unit/autopilot.test.ts 2>&1 | tail -15
```

Expected: 248 tests pass. If anything fails, the extraction wasn't pure — diagnose, fix, retry.

- [ ] **Step 1.5: Run lint and build**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 1.6: Add per-file coverage threshold**

Open `jest.config.js`. Add:

```javascript
'./lib/autopilot-waves.ts': { lines: 80, functions: 90, branches: 70 },
```

Adjust thresholds based on actual measured coverage from the autopilot test suite.

- [ ] **Step 1.7: Commit**

```bash
git add lib/autopilot.ts lib/autopilot-waves.ts jest.config.js
git commit -m "refactor(autopilot): extract waves + merge queue → autopilot-waves.ts

First of three extractions decomposing lib/autopilot.ts. Pulls out
_splitIntoWaves, _acquireWriteIntent, _releaseWriteIntent, and merge
queue helpers into a new lib/autopilot-waves.ts. These are leaf
helpers with no dependencies on other autopilot logic.

autopilot.ts re-exports the symbols via typed require so external
consumers keep working without changes.

All 248 autopilot unit tests pass unchanged. Adds per-file coverage
threshold for the new module.

Spec: docs/superpowers/specs/2026-04-12-autopilot-decomposition-design.md"
```

---

## Task 2: Extract autopilot-milestone.ts

Pull out the multi-milestone loop helpers. These have one external dep (roadmap.ts, state.ts — both already exist) and no deps on the new waves module.

- [ ] **Step 2.1: Identify the milestone functions**

From Task 0's inventory, list every function tagged **M**.

- [ ] **Step 2.2: Create lib/autopilot-milestone.ts**

Same pattern as Task 1 — skeleton with imports, copied function bodies, module.exports at the bottom.

- [ ] **Step 2.3: Update autopilot.ts**

Same pattern: delete moved definitions, add typed require, preserve external exports.

- [ ] **Step 2.4: Run autopilot tests**

```bash
npx jest tests/unit/autopilot.test.ts 2>&1 | tail -15
```

Expected: 248 tests pass.

- [ ] **Step 2.5: Lint, build, threshold**

```bash
npm run lint && npm run build:check
```

Add to `jest.config.js`:

```javascript
'./lib/autopilot-milestone.ts': { lines: 80, functions: 90, branches: 70 },
```

- [ ] **Step 2.6: Commit**

```bash
git add lib/autopilot.ts lib/autopilot-milestone.ts jest.config.js
git commit -m "refactor(autopilot): extract milestone helpers → autopilot-milestone.ts

Second of three extractions. Pulls out _isAllPhasesComplete,
resolveNextMilestone, _finalizeMilestone, and the multi-milestone
loop helpers. Depends only on existing lib/roadmap and lib/state.

All 248 autopilot unit tests pass unchanged.

Spec: docs/superpowers/specs/2026-04-12-autopilot-decomposition-design.md"
```

---

## Task 3: Extract autopilot-pipeline.ts (largest, most complex)

The biggest extraction. Contains the per-phase pipeline (plan → execute → verify → post-pipeline → phase-finalize) and depends on autopilot-waves (already extracted).

- [ ] **Step 3.1: Identify the pipeline functions**

From Task 0's inventory, list every function tagged **P**.

Verify they:
- Use `_splitIntoWaves` and friends from `./autopilot-waves` (not from autopilot.ts directly)
- Call `completePhaseAfterPostPipeline` from `./phase-complete`
- Call `scheduler.spawn` via the scheduler argument (not via a global)

- [ ] **Step 3.2: Create lib/autopilot-pipeline.ts**

Same pattern. The require list at the top will be longer because pipeline depends on waves + scheduler + phase-complete + backend (for getEffectiveTierForDispatch) + types.

Watch for shared prompt-builder functions — those stay in autopilot.ts (orchestrator) and are imported into the pipeline module.

- [ ] **Step 3.3: Update autopilot.ts**

This is the biggest delete — ~900 lines removed. After this, autopilot.ts should be down to ~600 lines (orchestrator + shared prompt builders + the 3 typed requires).

- [ ] **Step 3.4: Run autopilot tests**

```bash
npx jest tests/unit/autopilot.test.ts 2>&1 | tail -15
```

Expected: 248 tests pass. If anything breaks, this is the most likely place for it. Common failure modes:
- A function in pipeline calls a sibling function that wasn't moved — fix by either moving it too or importing from autopilot.ts.
- A pipeline function uses module-level state from autopilot.ts — same fix.
- A test imports a now-moved function from `./autopilot` — re-export from autopilot.ts.

- [ ] **Step 3.5: Lint, build, threshold**

Add to `jest.config.js`:

```javascript
'./lib/autopilot-pipeline.ts': { lines: 80, functions: 90, branches: 70 },
```

- [ ] **Step 3.6: Commit**

```bash
git add lib/autopilot.ts lib/autopilot-pipeline.ts jest.config.js
git commit -m "refactor(autopilot): extract per-phase pipeline → autopilot-pipeline.ts

Third and largest extraction. Pulls out runPostPhasePipeline plus
plan/execute/verify/post-pipeline step helpers and the Spec 3
phase-finalize wire-up. Depends on autopilot-waves (extracted in
prior commit), phase-complete, scheduler, backend.

After this commit, lib/autopilot.ts is the orchestrator only —
runAutopilot, runMultiMilestoneAutopilot, scheduler+config loading,
and shared prompt builders. Down from 2,702 lines to ~600.

All 248 autopilot unit tests pass unchanged.

Spec: docs/superpowers/specs/2026-04-12-autopilot-decomposition-design.md"
```

---

## Task 4: Cleanup, format, scan

- [ ] **Step 4.1: Final autopilot.ts cleanup**

Read autopilot.ts top-to-bottom. Verify:
- No dead code (functions that became unused after extraction)
- Imports are tidy and grouped
- The `module.exports` at the bottom contains every symbol that external consumers import from `./autopilot`
- File header JSDoc reflects the new responsibility (orchestrator only)

If any of the new modules have dead exports, remove them and update consumers.

- [ ] **Step 4.2: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: 4,239 tests pass (1 pre-existing metrics-cli failure may or may not still exist post-fix; check current main).

- [ ] **Step 4.3: Lint, build, format check**

```bash
npm run lint && npm run build:check
npm run format:check 2>&1 | tail -5
```

If format check fails on the decomposition files, run prettier scoped:

```bash
npx prettier --write lib/autopilot.ts lib/autopilot-pipeline.ts lib/autopilot-waves.ts lib/autopilot-milestone.ts jest.config.js
git add -u
git commit -m "chore: apply prettier formatting to decomposed autopilot files"
```

- [ ] **Step 4.4: Scan check**

```bash
node bin/gd.js scan --all 2>&1 | tail -3
```

- [ ] **Step 4.5: CHANGELOG entry**

In `docs/CHANGELOG.md` `## [Unreleased]` section, add to `### Changed`:

```markdown
- **`lib/autopilot.ts` decomposed into 4 modules** — 2,702 lines split
  into orchestrator + `lib/autopilot-pipeline.ts` (per-phase pipeline) +
  `lib/autopilot-waves.ts` (wave splitting + merge queue + write-intent
  locks) + `lib/autopilot-milestone.ts` (multi-milestone loop helpers).
  Pure restructure — no behavior changes. Resolves audit finding O1
  from `docs/architecture/RISKS.md`.
```

```bash
git add docs/CHANGELOG.md
git commit -m "docs: changelog entry for autopilot decomposition"
```

- [ ] **Step 4.6: Update RISKS.md**

In `docs/architecture/RISKS.md`, find the O1 entry. Change its status to:

```markdown
**Status:** Fixed in <merge SHA> (decomposed into autopilot-pipeline.ts, autopilot-waves.ts, autopilot-milestone.ts).
```

```bash
git add docs/architecture/RISKS.md
git commit -m "docs: mark O1 (autopilot decomposition) as resolved in RISKS.md"
```

- [ ] **Step 4.7: Verify final commit chain**

```bash
git log --oneline main..HEAD
```

Expected: 5–7 commits (3 extractions + cleanup + changelog + risks update + optional format).

---

## Final verification

- [ ] **All checks:**

```bash
npm test 2>&1 | tail -10
npm run lint
npm run build:check
node bin/gd.js scan --all 2>&1 | tail -3
wc -l lib/autopilot.ts lib/autopilot-pipeline.ts lib/autopilot-waves.ts lib/autopilot-milestone.ts
```

Expected:
- All tests pass
- Lint clean
- Build clean
- Scan clean
- `lib/autopilot.ts` < 800 lines (was 2,702)
- 3 new files with reasonable sizes (none > 1,000 lines)

If everything is green, the decomposition is complete. Merge to main with `--no-ff`.
