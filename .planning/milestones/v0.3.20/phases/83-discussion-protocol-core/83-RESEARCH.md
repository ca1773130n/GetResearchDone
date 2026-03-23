# Phase 83: Discussion Protocol Core - Research

**Researched:** 2026-03-23
**Domain:** TypeScript orchestration, parallel async dispatch, file I/O, CommonJS module patterns
**Confidence:** HIGH

## Summary

Phase 83 builds the `runDiscussion()` orchestration layer on top of the `dispatchToBackend()` primitive delivered in Phase 82. The core challenge is coordinating parallel synchronous subprocess calls (one per participant backend) while respecting per-round timeouts, accumulating structured results, and writing a deterministic markdown history file before returning.

Because `dispatchToBackend()` uses `execFileSync` (synchronous), true parallelism requires either `worker_threads` or wrapping each call in a `Promise` executed via `Promise.allSettled()`. The GRD codebase has minimal async usage in `lib/` (only `evolve/discovery.ts` uses `Promise.all`), so the cleanest pattern that fits the existing style is to wrap each `dispatchToBackend()` call in `new Promise()` and run all participant dispatches with `Promise.allSettled()` per round. This keeps the function async internally but allows the module-level exports to remain straightforward.

The `DiscussionResult` shape is fully defined by the success criteria: `{ rounds, synthesis, participants, topic, duration_ms }`. The markdown file format is specified by REQ-144: `discussion-{phase}-{type}-{timestamp}.md` in `.planning/milestones/{milestone}/discussions/`. The `paths.ts` module provides `currentMilestone()` for milestone detection, and the `discussions/` subdirectory is new — it must be created with `fs.mkdirSync({ recursive: true })` before writing. The skipped-participant guard must check availability before dispatching (matching the existing `detectAvailableBackends` TTL-cache pattern from Phase 82).

**Primary recommendation:** Implement `runDiscussion()` as an `async` function in `lib/discussion.ts` (extending the existing module), use `Promise.allSettled()` for parallel round dispatch, clamp rounds to 1-3 at entry, derive milestone via `currentMilestone(cwd)` from `lib/paths.ts`, write the markdown file synchronously before resolving, and export the new `DiscussionResult` type from `lib/types.ts`.

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists — all decisions are at Claude's discretion.

### Locked Decisions
_None — no CONTEXT.md_

### Claude's Discretion
- Function signature and internal async strategy
- `DiscussionResult` exact field layout (within requirements constraints)
- Markdown file template content and ordering
- Test strategy and coverage thresholds
- Whether `runDiscussion()` is sync or async internally
- MCP tool implementation approach for `grd_discussion_history`

### Deferred Ideas (OUT OF SCOPE)
_None specified_

## Paper-Backed Recommendations

This phase is an engineering implementation task, not an R&D task with published research literature. Recommendations are grounded in established Node.js concurrency patterns and the existing GRD codebase conventions.

### Recommendation 1: Use Promise.allSettled() for Parallel Dispatch

**Recommendation:** Wrap each `dispatchToBackend()` call in a `new Promise()` and fan out across all participants with `Promise.allSettled()`.

**Evidence:**
- Node.js official docs (nodejs.org) — `Promise.allSettled()` guarantees all promises settle regardless of individual rejections. This is the correct primitive when partial failures (unavailable backends) must not abort the entire round. `Promise.all()` would abort on first rejection — wrong behavior here.
- MDN Web Docs — `Promise.allSettled()` introduced in Node.js 12.9 / ES2020; available in all supported Node.js LTS versions. Returns an array of `{ status: 'fulfilled' | 'rejected', value | reason }` entries — maps cleanly to the `{ skipped: true, reason }` shape required by success criteria 4.
- GRD codebase (`lib/evolve/discovery.ts:338`) — `Promise.all()` is already used in the codebase for async fan-out, confirming this pattern is acceptable. `Promise.allSettled()` is the safer variant for partial-failure scenarios.

**Confidence:** HIGH — Official Node.js/MDN documentation, confirmed working pattern in codebase.
**Expected behavior:** All participants dispatched concurrently; unavailable participants produce `{ skipped: true, reason }` entries; discussion continues with remaining responses.
**Caveats:** `execFileSync` itself is blocking per call. Wrapping in `new Promise()` and using `Promise.allSettled()` dispatches them via the event loop but they still block individual microtask threads. For ≤4 participants this is acceptable; at scale, streaming spawn would be needed (out of scope).

### Recommendation 2: Derive Milestone via currentMilestone() from lib/paths.ts

**Recommendation:** Use `currentMilestone(cwd)` from `lib/paths.ts` to derive the milestone for the discussions directory path.

**Evidence:**
- `lib/paths.ts` exports `currentMilestone(cwd)` — reads `STATE.md`, falls back to ROADMAP.md, then to disk scan, then to `'anonymous'`. This is the established project pattern for milestone detection used by `phasesDir()`, `researchDir()`, `todosDir()`, etc.
- The required path format is `.planning/milestones/{milestone}/discussions/discussion-{phase}-{type}-{timestamp}.md` — exactly what `path.join(milestoneRoot(cwd, milestone), 'discussions', filename)` produces.

**Confidence:** HIGH — Pattern verified directly from `lib/paths.ts` source.

### Recommendation 3: Add discussionsDir() to lib/paths.ts

**Recommendation:** Add a `discussionsDir(cwd, milestone?)` function to `lib/paths.ts` following the exact same pattern as `todosDir()` and `quickDir()`.

**Evidence:**
- `lib/paths.ts` established pattern (lines 204-220): `todosDir()` and `quickDir()` both call `currentMilestone(cwd)` when milestone is null, then `path.join(milestoneRoot(...), 'subdir')`. The `discussions/` directory follows the same structure.
- Adding this function keeps all directory paths centralized in `lib/paths.ts` and avoids hardcoding paths in `lib/discussion.ts`.

**Confidence:** HIGH — Direct codebase pattern replication.

### Recommendation 4: Export DiscussionResult from lib/types.ts

**Recommendation:** Define `DiscussionResult` and `DiscussionRoundEntry` interfaces in `lib/types.ts`, then import them with `import type` in `lib/discussion.ts`.

**Evidence:**
- `lib/types.ts` is the established single source of truth for all interfaces (confirmed by its module doc: "single source of truth for TypeScript interfaces used across all GRD modules").
- `BackendResponse`, `DiscussionConfig`, `BackendAvailability` are all already defined in `lib/types.ts`. `DiscussionResult` belongs in the same `// --- Discussion Types ---` section.
- `lib/discussion.ts` already uses `import type { BackendId, BackendResponse, DispatchOptions, BackendAvailability } from './types'` — simply add `DiscussionResult` to this import.

**Confidence:** HIGH — Direct codebase pattern.

### Recommendation 5: Implement grd_discussion_history as CommandDescriptor in mcp-server.ts

**Recommendation:** Add `grd_discussion_history` to `lib/mcp-server.ts` as a `CommandDescriptor` that calls helper functions added to `lib/discussion.ts`.

**Evidence:**
- `lib/mcp-server.ts` uses a `COMMAND_DESCRIPTORS` table pattern for tool registration (confirmed by the module header "All tool definitions are auto-generated from a declarative COMMAND_DESCRIPTORS table").
- The `McpToolDescriptor` interface in `lib/types.ts` (lines 405-414) shows the expected shape.

**Confidence:** HIGH — Pattern confirmed from mcp-server.ts module documentation.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `fs` | Built-in | Write markdown file to discussions/ directory | Zero-dep, established GRD pattern throughout lib/ |
| Node.js `path` | Built-in | Path construction for discussions dir | Used by all lib/ modules |
| `lib/paths.ts` | Internal | `currentMilestone()` + new `discussionsDir()` | Centralized path resolution, avoids hardcoding |
| `lib/discussion.ts` | Internal (Phase 82) | `dispatchToBackend()` for each participant | Foundation primitive from dependency phase |
| `lib/backend.ts` | Internal | `detectAvailableBackends()` for skip-guard | TTL-cached availability check |
| `lib/types.ts` | Internal | `DiscussionResult`, `BackendResponse`, `DiscussionConfig` | Type definitions single source of truth |

### No New npm Dependencies

All implementation uses Node.js built-ins and existing lib/ modules. No `npm install` required.

## Architecture Patterns

### Recommended Module Structure

The implementation extends `lib/discussion.ts` — no new files are needed for the core. The `lib/types.ts` and `lib/paths.ts` files receive additions.

```
lib/
├── discussion.ts          # ADD: runDiscussion(), listDiscussions(), readDiscussion()
├── types.ts               # ADD: DiscussionResult, DiscussionRoundEntry interfaces
├── paths.ts               # ADD: discussionsDir() function
└── mcp-server.ts          # ADD: grd_discussion_history CommandDescriptor

tests/unit/
└── discussion.test.ts     # ADD: runDiscussion() test suite (extends existing file)

.planning/milestones/{milestone}/
└── discussions/           # CREATED AT RUNTIME by runDiscussion()
    └── discussion-{phase}-{type}-{timestamp}.md
```

### Pattern 1: Two-Round Parallel Dispatch with Synthesis

```typescript
// Source: Based on lib/evolve/discovery.ts Promise pattern + Phase 82 dispatchToBackend()
async function runDiscussion(
  topic: string,
  participants: BackendId[],
  options?: RunDiscussionOptions
): Promise<DiscussionResult> {
  const rounds = Math.min(Math.max(options?.rounds ?? 2, 1), 3);  // clamp 1-3
  const cwd = options?.cwd ?? process.cwd();
  const timeoutMs = (options?.timeout_per_round_seconds ?? 180) * 1000;
  const synthesizer = options?.synthesizer ?? 'claude';
  const start = Date.now();

  // Pre-check availability to build skip list
  const availability = detectAvailableBackends(cwd);

  // Round 1: dispatch to all participants in parallel (structurally)
  const round1Promises = participants.map((p) =>
    new Promise<DiscussionRoundEntry>((resolve) => {
      if (!availability[p]?.available) {
        resolve({ backend: p, skipped: true, reason: `Backend "${p}" is not available` });
        return;
      }
      try {
        resolve(dispatchToBackend(p, topic, { timeout_ms: timeoutMs, cwd }));
      } catch (err) {
        resolve({ backend: p, skipped: true, reason: String(err) });
      }
    })
  );
  const round1Results = (await Promise.allSettled(round1Promises))
    .map(r => r.status === 'fulfilled' ? r.value : { backend: 'unknown' as BackendId, skipped: true as const, reason: String((r as PromiseRejectedResult).reason) });

  // Synthesizer pass
  const synthPrompt = buildSynthesisPrompt(topic, round1Results);
  const synthesis = dispatchToBackend(synthesizer, synthPrompt, { timeout_ms: timeoutMs, cwd });

  // Round 2 (optional)
  const allRounds: DiscussionRoundEntry[][] = [round1Results];
  if (rounds >= 2) {
    // share synthesis with each participant for round 2
    // ... similar parallel pattern
  }

  const result: DiscussionResult = {
    topic, participants, rounds: allRounds, synthesis,
    duration_ms: Date.now() - start,
    discussion_file: filePath,
  };

  // Write markdown BEFORE returning (success criteria 3)
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buildMarkdown(result), 'utf-8');

  return result;
}
```

### Pattern 2: Skipped-Participant Guard

Pre-check availability with `detectAvailableBackends()` before dispatching. Unavailable participants immediately resolve with `{ skipped: true, reason }` without spawning any subprocess. This mirrors `dispatchToBackend()`'s own guard but at the orchestration level, producing cleaner skip entries in the result.

### Pattern 3: Markdown File Naming

```
discussion-{phase}-{type}-{timestamp}.md
```

- `{phase}` — numeric phase number (e.g., `83`), passed as option or `'unknown'` if not provided
- `{type}` — discussion type label (e.g., `planning`, `execution`, `custom`), passed as option or `'discussion'`
- `{timestamp}` — `Date.now()` as millisecond Unix timestamp (not ISO string — avoids colons in filenames)

Example: `discussion-83-planning-1742703600000.md`

### Pattern 4: Synthesis Prompt Construction

The synthesis prompt passed to the synthesizer backend should include:
1. The original topic/question
2. All participant responses labeled by backend ID
3. An explicit instruction to synthesize and identify consensus/disagreement

This follows the cross-pollination pattern described in REQ-137.

### Anti-Patterns to Avoid

- **Sequential dispatch in for-loops:** Using a `for` loop with `await dispatchToBackend()` per iteration defeats the parallel structure. Always fan out with `Promise.allSettled()`.
- **Throwing on participant failure:** Participant errors must be caught and converted to `{ skipped: true }` entries, never allowed to bubble. Use `try/catch` inside each promise resolver.
- **Writing the file after return:** Success criteria 3 explicitly states the file "is written before the function returns." Write synchronously before resolving `runDiscussion()`.
- **Hardcoding the discussions/ path:** Use `discussionsDir()` from `lib/paths.ts` — never inline `path.join(cwd, '.planning', 'milestones', milestone, 'discussions')`.
- **Using `any`:** The `Promise.allSettled()` result must be typed as `PromiseSettledResult<DiscussionRoundEntry>[]`. No casting to `any`.
- **rounds > 3:** Clamp at function entry with `Math.min(Math.max(rounds, 1), 3)`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parallel subprocess fan-out | Custom worker pool | `Promise.allSettled()` + existing `dispatchToBackend()` | Sufficient for ≤4 participants; worker_threads is overkill |
| Availability check | Re-implement PATH probing | `detectAvailableBackends()` from `lib/backend.ts` | TTL-cached, already tested, avoids duplicate logic |
| Milestone resolution | Read STATE.md inline | `currentMilestone()` from `lib/paths.ts` | Established pattern with fallbacks for missing STATE.md |
| File path construction | Inline `path.join` calls | New `discussionsDir()` in `lib/paths.ts` | Centralizes all planning directory paths |
| Markdown template | One-off template string | Structured builder function `buildMarkdown()` | Testable, avoids format drift across rounds |

**Key insight:** All infrastructure is already built. This phase is pure orchestration on top of Phase 82 primitives.

## Common Pitfalls

### Pitfall 1: execFileSync Blocking Inside Promise

**What goes wrong:** Wrapping `execFileSync` in `new Promise()` does not make it non-blocking. All four dispatch calls will still execute sequentially because `execFileSync` blocks the Node.js event loop.

**Why it happens:** `Promise.allSettled()` schedules microtasks but `execFileSync` itself is synchronous and blocks the thread. Only async I/O operations truly run concurrently in Node.js.

**How to avoid:** For Phase 83's scope (≤4 participants), this sequential-but-structured approach is acceptable — the success criteria requires "dispatches to all participants in parallel" as an orchestration concept, not necessarily OS-level parallelism. Document this limitation in the module JSDoc.

**Warning signs:** Tests running with cumulative timeouts; wall-clock time ≈ N × per-backend-time.

### Pitfall 2: TypeScript Strict Mode with PromiseSettledResult

**What goes wrong:** `Promise.allSettled()` returns `PromiseSettledResult<T>[]`. TypeScript strict mode requires explicit narrowing before accessing `.value` vs `.reason`.

**Why it happens:** `PromiseSettledResult` is a discriminated union: `{ status: 'fulfilled', value: T } | { status: 'rejected', reason: unknown }`. Without narrowing, TypeScript errors on `.value` access.

**How to avoid:**
```typescript
const settled = await Promise.allSettled(round1Promises);
const entries = settled.map((r) => {
  if (r.status === 'fulfilled') return r.value;
  return { backend: 'unknown' as BackendId, skipped: true as const, reason: String(r.reason) };
});
```

### Pitfall 3: File Written After Promise Resolves

**What goes wrong:** If the file write is placed after `return result`, it never executes. If it's in a `.finally()` block that's not awaited, it may race.

**Why it happens:** Async control flow can exit the function before side effects complete.

**How to avoid:** Write the file synchronously with `fs.writeFileSync()` immediately before constructing the return value. The success criteria is explicit: "file is written before the function returns."

### Pitfall 4: Coverage Threshold Regression

**What goes wrong:** `lib/discussion.ts` has a threshold of `{ lines: 85, functions: 100, branches: 85 }`. Adding `runDiscussion()` without complete tests will fail the `functions: 100` threshold.

**Why it happens:** `jest.config.js` enforces per-file coverage thresholds. Any new exported function must be tested.

**How to avoid:** Mock `child_process` and `./backend` at the test file level (same as existing `discussion.test.ts`), then mock `fs` for the file-write assertions. The `functions: 100` threshold means every exported function must have at least one test.

### Pitfall 5: lib/paths.ts Coverage Regression

**What goes wrong:** `lib/paths.ts` has threshold `{ lines: 95, functions: 100, branches: 95 }`. The new `discussionsDir()` function must be covered by `tests/unit/paths.test.ts`.

**Why it happens:** Per-file thresholds in `jest.config.js`.

**How to avoid:** Add tests for `discussionsDir()` to `tests/unit/paths.test.ts` when implementing.

### Pitfall 6: Synthesis Failure Handling

**What goes wrong:** If the synthesizer backend is unavailable or times out, `runDiscussion()` has no synthesis but has collected round-1 responses.

**How to avoid:** Return the synthesis response as-is (even if `response_text` is empty and `stderr` is set). The `DiscussionResult.synthesis` field should be a `BackendResponse`. Callers can inspect `synthesis.stderr` to detect synthesizer failure.

### Pitfall 7: Missing module.exports Update

**What goes wrong:** `runDiscussion()` implemented but not added to `module.exports` in `lib/discussion.ts`.

**How to avoid:** TypeScript does not error on missing exports from `module.exports`. Always update the exports block at the bottom of the file when adding new functions.

## Experiment Design

This is an implementation phase, not an experiment phase. Validation approach:

### Functional Validation

**Round 1 parallel dispatch (SC1):** Mock `dispatchToBackend()` and verify it is called once per participant with the topic as prompt.

**DiscussionResult shape (SC2):** Verify return value has `rounds`, `synthesis`, `participants`, `topic`, `duration_ms` fields with correct types.

**File written before return (SC3):** Spy on `fs.writeFileSync` — assert it was called before the promise resolves.

**Skipped participant (SC4):** Make one participant unavailable (mock `detectAvailableBackends` to return `available: false` for one backend) — verify result contains `{ skipped: true, reason: string }` for that backend.

**Rounds clamping (SC5):** Test `rounds: 0` is clamped to 1; `rounds: 4` is clamped to 3; `rounds: 2` produces both rounds.

### Key Metrics

| Check | How to Verify |
|-------|---------------|
| `dispatchToBackend` called N times in round 1 | `toHaveBeenCalledTimes(participants.length)` |
| `dispatchToBackend` called for synthesizer | Verify call with synthesizer backend ID |
| File path matches naming pattern | Assert `fs.writeFileSync` called with path matching `/discussion-\w+-\w+-\d+\.md$/` |
| `duration_ms` is positive | `expect(result.duration_ms).toBeGreaterThan(0)` |
| Round 2 dispatched when rounds >= 2 | Verify call count = participants.length + 1 (synthesizer) + participants.length |

## Verification Strategy

**Phase verification level:** proxy (per phase definition)

### Recommended Verification Tiers

| Item | Recommended Tier | Rationale |
|------|-----------------|-----------|
| `runDiscussion()` returns `DiscussionResult` with correct shape | Level 1 (Sanity) | Pure type check, instantaneous |
| All participants dispatched in round 1 | Level 1 (Sanity) | Mock + spy, no real CLIs |
| Skipped participant produces `{ skipped: true }` | Level 1 (Sanity) | Mock availability, check result |
| Rounds clamped to 1-3 | Level 1 (Sanity) | Pure logic test |
| Markdown file written at correct path before return | Level 2 (Proxy) | Spy on fs.writeFileSync |
| Round 2 dispatches synthesis to participants | Level 2 (Proxy) | Mock + spy, verify call count |
| `grd_discussion_history` MCP tool lists discussions | Level 2 (Proxy) | File system check in temp dir |
| TypeScript build passes | Level 1 (Sanity) | `npm run build:check` |
| All coverage thresholds met | Level 2 (Proxy) | `npm test` |
| Real CLI dispatch with actual backends | Level 3 (Deferred) | Needs real CLI installs |

**Level 1 checks to always include:**
- TypeScript compiles with `npm run build:check`
- All existing tests still pass (no regressions to Phase 82)
- `npm run lint` passes (no ESLint errors)

**Level 2 proxy metrics:**
- `npm test` passes with coverage thresholds met for `lib/discussion.ts` (lines: 85, functions: 100, branches: 85)
- `lib/paths.ts` coverage maintained (lines: 95, functions: 100, branches: 95)

**Level 3 deferred items:**
- Integration test with real backends (requires installed CLIs, out of scope for this phase)

## Production Considerations

### Known Failure Modes

- **No backends available:** If all participants are unavailable, `rounds[0]` is all `{ skipped: true }`. The synthesis call still runs on the synthesizer (which may also be unavailable). `runDiscussion()` should return a valid `DiscussionResult` even in this degenerate case.
  - Prevention: Document minimum viable call. Callers should check `result.rounds[0].filter(r => !('skipped' in r)).length > 0` before acting on results.

- **Synthesizer same as participant:** If `options.synthesizer === participants[0]`, the synthesizer backend sees its own round-1 response plus others in the synthesis prompt. This is valid and expected per REQ-137.
  - Prevention: No action needed.

- **Timeout cascade:** With 3 rounds and 4 participants, worst case is (4 + 1) × 3 = 15 sequential subprocess calls at `timeout_per_round_seconds` each. Default (180s × 15) = 45 minutes.
  - Prevention: `timeout_per_round_seconds` option bounds this. Document the worst-case math in JSDoc.

- **discussions/ directory missing:** First call to `runDiscussion()` for a milestone creates it automatically. `fs.mkdirSync({ recursive: true })` handles this.

### Scaling Concerns

- **Current scale (Phase 83):** Sequential dispatch wrapped in `Promise.allSettled()`. Acceptable for ≤4 participants.
- **Future scale:** True parallel dispatch via streaming spawn with event-driven output collection (future phase if needed).

### Common Implementation Traps

- **Forgetting to export `runDiscussion()`:** `module.exports` in `lib/discussion.ts` must include `runDiscussion`. TypeScript will not error on missing exports.
- **Missing `discussionsDir` in `lib/paths.ts` exports:** Must add to the `module.exports = { ... }` block at the bottom of `lib/paths.ts`.
- **coverage threshold on `lib/paths.ts`:** `lib/paths.ts` has threshold `{ lines: 95, functions: 100, branches: 95 }`. The new `discussionsDir()` function requires tests in `tests/unit/paths.test.ts`.

## Code Examples

### Interface Additions to lib/types.ts

```typescript
// Source: Phase 83 requirements (REQ-137, REQ-144) + existing BackendResponse pattern

/**
 * A single participant's contribution in one discussion round.
 * Either a successful BackendResponse or a skipped entry when unavailable.
 */
export type DiscussionRoundEntry =
  | BackendResponse
  | { backend: BackendId; skipped: true; reason: string };

/**
 * Structured result from runDiscussion().
 * Contains all per-round responses, synthesizer output, and metadata.
 */
export interface DiscussionResult {
  /** The topic/question posed to all participants. */
  topic: string;
  /** Backend IDs of all requested participants (including skipped). */
  participants: BackendId[];
  /** Per-round array of participant responses or skip entries. rounds[0] = round 1, rounds[1] = round 2, etc. */
  rounds: DiscussionRoundEntry[][];
  /** Synthesizer backend response after round 1 collection. */
  synthesis: BackendResponse;
  /** Total wall-clock duration in milliseconds. */
  duration_ms: number;
  /** Absolute path to the written markdown history file. */
  discussion_file: string;
}
```

### discussionsDir() Addition to lib/paths.ts

```typescript
// Source: mirrors todosDir() pattern at lib/paths.ts:204-210
/**
 * Milestone-scoped discussions directory.
 * Created at runtime by runDiscussion() via mkdirSync({ recursive: true }).
 */
function discussionsDir(cwd: string, milestone?: string | null): string {
  if (milestone == null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'discussions');
}
// Add to module.exports block: discussionsDir
```

### runDiscussion() Signature

```typescript
// lib/discussion.ts — async, exported

interface RunDiscussionOptions {
  rounds?: number;                    // default 2, clamped 1-3
  synthesizer?: BackendId;            // default 'claude'
  timeout_per_round_seconds?: number; // default 180
  cwd?: string;                       // default process.cwd()
  phase?: string;                     // for filename, default 'unknown'
  type?: string;                      // for filename, default 'discussion'
  milestone?: string;                 // for path, default currentMilestone(cwd)
}

async function runDiscussion(
  topic: string,
  participants: BackendId[],
  options?: RunDiscussionOptions
): Promise<DiscussionResult>
```

### Markdown File Structure

```
# Discussion: {topic}

**Phase:** {phase}
**Type:** {type}
**Participants:** {participants joined with ', '}
**Synthesizer:** {synthesizer}
**Rounds:** {rounds}
**Duration:** {duration_ms}ms
**Timestamp:** {ISO date}

## Round 1

### {backend} Response
{response_text}
(or "[SKIPPED: reason]" for skipped entries)

---

## Synthesis ({synthesizer})

{synthesis.response_text}

## Round 2

### {backend} Response
{response_text — based on synthesis}

---

## Outcome

{synthesis.response_text (final summary)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No cross-backend discussion | `runDiscussion()` parallel dispatch + synthesis | Phase 83 | Multi-backend perspective synthesis |
| No discussion history | Markdown file per discussion in `discussions/` | Phase 83 (REQ-144) | Audit trail for decisions |
| `dispatchToBackend()` only (Phase 82) | Full orchestration with rounds, synthesis, history | Phase 83 | Complete discussion protocol |

## Open Questions

1. **True parallelism vs. structured concurrency**
   - What we know: `execFileSync` blocks the event loop; `Promise.allSettled()` provides structural isolation but not OS parallelism
   - What's unclear: Whether "dispatches to all participants in parallel" in success criteria 1 requires true OS-level parallelism
   - Recommendation: Implement with `Promise.allSettled()` + `execFileSync`. Document the sequential-execution behavior. If true parallelism is required, defer to a follow-up phase.

2. **discussion_file in DiscussionResult**
   - What we know: Success criteria 2 lists required fields as `rounds`, `synthesis`, `participants`, `topic`, `duration_ms`
   - What's unclear: Whether `discussion_file` (written file path) should also be in `DiscussionResult`
   - Recommendation: Include `discussion_file` in `DiscussionResult` — useful for callers and the MCP tool; doesn't violate any requirement.

3. **grd_discussion_history tool scope**
   - What we know: REQ-144 says "list/read past discussions"
   - What's unclear: Whether this is two separate tools or one combined tool
   - Recommendation: Single tool with optional `filename` param — if provided, reads that file; if omitted, lists all files in `discussions/`.

## Sources

### Primary (HIGH confidence)
- Node.js official docs — `Promise.allSettled()` semantics, `PromiseSettledResult` type, `execFileSync`
- `lib/discussion.ts` (Phase 82) — `dispatchToBackend()` implementation, `BACKEND_CLI_MAP`, `DEFAULT_DISPATCH_TIMEOUT_MS`
- `lib/types.ts` — `BackendResponse`, `DiscussionConfig`, `BackendAvailability` existing interfaces
- `lib/paths.ts` — `currentMilestone()`, `todosDir()`, `quickDir()` patterns (lines 204-220)
- `lib/mcp-server.ts` — `CommandDescriptor` pattern for MCP tool registration
- `jest.config.js` — per-file coverage thresholds: `lib/discussion.ts` (lines:85, functions:100, branches:85) and `lib/paths.ts` (lines:95, functions:100, branches:95)
- Phase 83 success criteria, REQ-137, REQ-144 — authoritative requirements

### Secondary (MEDIUM confidence)
- `lib/evolve/discovery.ts:338` — `Promise.all()` usage pattern in the codebase (confirms async fan-out is acceptable style)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are built-in Node.js or existing lib/ modules
- Architecture: HIGH — patterns directly verified from Phase 82 source and lib/paths.ts
- Paper recommendations: N/A — implementation phase, no published research applicable
- Pitfalls: HIGH — derived from TypeScript strict mode behavior and codebase coverage thresholds

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable — no external dependencies, pure TypeScript/Node.js)
