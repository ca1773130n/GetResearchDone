# GRD Pattern Reference — for `gd research` + `lib/research/` implementation plan

Signatures-first. All paths absolute under `/Users/neo/Developer/Projects/GetResearchDone`.

---

## 1. Command wiring end-to-end

**Entry chain:** `bin/gd.js` → `bin/gd.ts` → `lib/cli/index.ts` (classify) → `lib/cli/tools.ts` (tool) OR `lib/cli/agent.ts` (agent).

`bin/gd.js` (4-line proxy — the ONLY entry shape):
```js
#!/usr/bin/env node
'use strict';
require('tsx/cjs');
require('./gd.ts');
```

`bin/gd.ts` dispatch core:
```ts
const { parseFlags, classifyCommand } = require('../lib/cli/index');
const { runToolCommand } = require('../lib/cli/tools');
const { runAgentCommand } = require('../lib/cli/agent');
const flags = parseFlags(process.argv.slice(2));
const command = flags.positional[0];
const classification = classifyCommand(command, subcommand); // 'tool'|'agent'|'unknown'
if (classification === 'tool') {
  const result = runToolCommand(command, subcommand, extraArgs, flags.json, cwd, flags.passthrough);
  process.stdout.write(result.stdout); process.exit(result.exitCode);
} else if (classification === 'agent') {
  const backend = flags.backend || detectBackend(cwd);
  runAgentCommand(command, flags.positional.slice(1), { cwd, backend, json, verbose, model });
}
```

**Router registration** (`lib/cli/index.ts`): add `'research'` to the `TOOL_COMMANDS` Set (deterministic) OR `AGENT_COMMANDS` Set (spawns a backend). Subcommand-aware tool routing uses pattern like `EVOLVE_TOOL_SUBS`/`SETTINGS_TOOL_SUBS`:
```ts
const EVOLVE_TOOL_SUBS = new Set(['run', 'discover', 'state', 'advance', 'reset']);
export function classifyCommand(command: string, subcommand?: string): 'tool'|'agent'|'unknown' {
  if (command === 'evolve' && subcommand && EVOLVE_TOOL_SUBS.has(subcommand)) return 'tool';
  if (TOOL_COMMANDS.has(command)) return 'tool';
  if (AGENT_COMMANDS.has(command)) return 'agent';
  return 'unknown';
}
module.exports = { parseFlags, classifyCommand, TOOL_COMMANDS, AGENT_COMMANDS, INIT_WORKFLOWS };
```

**Tool commands delegate to `bin/grd-tools.js`** via `runToolCommand` (`lib/cli/tools.ts:runToolCommand`), which runs `execFileSync('node', [grdTools, ...args])`. The actual command handler is a `case 'metrics':` in a big switch in `bin/grd-tools.ts`. So a deterministic `gd research` handler = new `case 'research':` in `bin/grd-tools.ts` that calls into `lib/research/`.

```ts
// runToolCommand signature (lib/cli/tools.ts)
export function runToolCommand(command, subcommand, extraArgs, jsonFlag, cwd, passthrough=[]):
  { exitCode: number; stdout: string; stderr: string }
// buildToolArgs adds --raw when jsonFlag set
```

**Agent commands** build prompt `/grd:${command}` and spawn the backend (`lib/cli/agent.ts:runAgentCommand` → `spawnSync(adapter.binary, ...)`).

---

## 2. lib/state.ts — frontmatter/STATE.md I/O

STATE.md uses `**Field:**` markdown, NOT YAML frontmatter. File I/O delegated to `lib/phase-io`:
```ts
const { readStateFile, writeStateFile } = require('./phase-io') as {
  readStateFile: (p: string) => string;
  writeStateFile: (p: string, content: string) => void;
};
// internal field helpers:
function stateExtractField(content: string, fieldName: string): string | null  // matches **Field:** value
function stateReplaceField(content: string, fieldName: string, newValue: string): string | null
```
Command fns (exported, all `(cwd, ...args, raw)` shape, terminate via `output()`/`error()`):
`cmdStateLoad(cwd, raw)`, `cmdStateGet(cwd, section, raw)`, `cmdStatePatch`, `cmdStateUpdate`, `cmdStateAdvancePlan`, `cmdStateRecordMetric`, `cmdStateUpdateProgress`, `cmdStateAddDecision`, `cmdStateAddBlocker`, `cmdStateResolveBlocker`, `cmdStateRecordSession`, `cmdStateSnapshot`.
Top of file: `const { loadConfig, safeReadMarkdown, output, error } = require('./utils');`
YAML frontmatter parsing for OTHER files lives in **`lib/frontmatter.ts`** (`extractFrontmatter`) — `lib/state.ts` imports it indirectly.

---

## 3. lib/scheduler.ts — agent dispatch + budget pressure

```ts
export interface Scheduler {
  readonly sessionKey: string;
  spawn(prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult>;
  getState(stateKey: string): BackendUsageState | undefined;
  getStates(): Map<string, BackendUsageState>;
  recordExternalSample(stateKey: string, sample: UsageSample): void;
  persistState(planningDir: string): void;
  loadPersistedState(planningDir: string): void;
}
export function createScheduler(config: SchedulerConfig | undefined, superpowers?: SuperpowersConfig): Scheduler | null
```
`SpawnOpts` (lib/types.ts:534): `{ timeout?, maxTurns?, model?, outputFormat?, captureOutput?, captureStderr?, cwd?, workItemId?, parallel?, agentType? }`
`SchedulerSpawnResult` (lib/types.ts:647): `{ exitCode: number; stdout?: string; stderr?: string; ... }`

**Call pattern** (from `lib/evolve/orchestrator.ts` & `lib/autopilot.ts`):
```ts
const scheduler = createScheduler(config.scheduler, config.superpowers);
const result = scheduler
  ? await scheduler.spawn(prompt, { model, maxTurns, timeout, agentType: 'grd-...', captureOutput: true })
  : await spawnClaudeAsync(executionCwd, prompt, { ... }); // null-scheduler fallback
```

**Budget pressure** (lib/scheduler.ts):
```ts
export function computeBudgetPressureLevel(states, priority, accounts, thresholds?): BudgetPressureLevel
// BudgetPressureLevel = 'none' | 'warning' | 'high' | 'critical'  (lib/types.ts:69)
export function isBudgetPressured(states, priority, accounts, thresholds?): boolean
export function logPressureTransition(sessionKey, current, agentType, baseTier, effectiveTier): void
```

---

## 4. lib/utils.ts — error() / output()

```ts
function output(result: unknown, raw: boolean, rawValue?: unknown): never {
  if (raw && rawValue !== undefined) process.stdout.write(String(rawValue));
  else process.stdout.write(JSON.stringify(result, null, 2));
  process.exit(0);
}
function error(message: string): never {
  process.stderr.write('Error: ' + message + '\n');
  process.exit(1);
}
```
Both return `never` (they `process.exit`). This is the intentional exit abstraction — do not replace.

---

## 5. lib/evolve/index.ts — orchestrator structure (mirror this for lib/research/)

`lib/evolve/index.ts` is a **barrel re-export only** — no logic:
```ts
'use strict';
const stateModule = require('./state');
const discoveryModule = require('./discovery');
const orchestratorModule = require('./orchestrator');
const cliModule = require('./cli');
module.exports = {
  EVOLVE_STATE_FILENAME: stateModule.EVOLVE_STATE_FILENAME,
  createWorkItem: stateModule.createWorkItem,
  readEvolveState: stateModule.readEvolveState,
  writeEvolveState: stateModule.writeEvolveState,
  runEvolve: orchestratorModule.runEvolve,
  cmdEvolve: cliModule.cmdEvolve,
  // ...44 symbols total
};
```
Submodule layout: `state.ts` (constants + state I/O + work-item factory), `discovery.ts` (engine), `scoring.ts`, `orchestrator.ts` (the loop), `_prompts.ts`, `cli.ts` (cmd* functions).

**The loop** (`lib/evolve/orchestrator.ts`):
```ts
async function runEvolve(cwd: string, options: EvolveOptions = {}): Promise<EvolveResult> {
  const { iterations = 1, pickPct, timeout, maxTurns, dryRun = false, autoCommit = true, createPr = true } = options;
  const evolveConfig: GrdConfig = loadConfig(cwd);
  const evolveScheduler = createScheduler(evolveConfig.scheduler);
  // loop: readEvolveState → discover → group → scheduler.spawn(execute) → spawn(review)
  //       → writeEvolutionNotes → advanceIteration → writeEvolveState (persists between iterations)
}
async function runInfiniteEvolve(cwd: string, options: InfiniteEvolveOptions = {}): Promise<InfiniteEvolveResult>
```
State persisted between iterations via `readEvolveState`/`writeEvolveState` (JSON state file in `.planning/`, path from `evolveStatePath`).

---

## 6. Agent definition format (`agents/*.md`)

`agents/grd-knowledge-miner.md` frontmatter:
```yaml
---
name: grd-knowledge-miner
description: Post-phase mining agent that extracts reusable patterns from phase execution output. Produces structured KNOWHOW.md entries for compounding improvements.
tools: Read, Write, Bash, Grep, Glob
color: yellow
effort: low
maxTurns: 15
---
```
`agents/grd-eval-reporter.md` frontmatter:
```yaml
---
name: grd-eval-reporter
description: Collects and reports quantitative evaluation results after phase execution. Runs scripts, compares against baselines and targets, updates EVAL.md.
tools: Read, Write, Edit, Bash, Grep, Glob
color: green
effort: medium
maxTurns: 25
---
```
Fields: `name`, `description`, `tools` (comma list), `color`, `effort` (low/medium/high), `maxTurns`. `disallowedTools` is OPTIONAL (array, e.g. `["Bash","Write"]`) — not present on these two. Body uses XML-ish tags: `<role>...</role>`, `<mining_heuristics>...</mining_heuristics>`, etc. `effort`/`maxTurns` are also injected programmatically from `EFFORT_PROFILES` in `lib/backend.ts` per profile.

---

## 7. Skill/command format (`commands/*.md`)

`commands/evolve.md`:
```markdown
---
description: Run autonomous self-improvement loop with sonnet-tier models
argument-hint: "[--iterations N] [--pick-pct N] [--dry-run] [--no-worktree] [--infinite]"
---

Run the evolve command to discover improvements and execute them autonomously:

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js evolve run $ARGUMENTS
```

The evolve loop uses a paired discover→execute architecture per iteration:
1. ...

Flags:
- `--iterations N` — Number of iterations (0 = unlimited)
...
```
Frontmatter = just `description` + `argument-hint`. Body: prose, a fenced `node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js <cmd> $ARGUMENTS` block, numbered steps, `## Flags`, plus `## Infinite Mode` etc. sections. `printCommandHelp` (bin/gd.ts) reads `description:` from this file for `gd <cmd> --help`.

---

## 8. Testing conventions

`jest.config.js`:
```js
module.exports = {
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/benchmark/tasks/'],
  collectCoverageFrom: ['lib/**/*.js', 'lib/**/*.ts', '!lib/**/*.d.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  coverageThreshold: {
    './lib/state.ts': { lines: 85, functions: 88, branches: 77 },
    './lib/evolve/index.ts': { lines: 85, functions: 94, branches: 70 },
    './lib/knowledge.ts': { lines: 85, functions: 100, branches: 75 },
    './lib/utils.ts': { lines: 92, functions: 95, branches: 85 },
    // ...per-file thresholds. ADD a './lib/research/index.ts' entry for the new module.
  },
};
```
Representative `tests/unit/state.test.ts`:
```ts
const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');
const { stateExtractField, cmdStateLoad, /* ... */ } = require('../../lib/state');
// describe/it; functions that call output()/error() are wrapped in captureOutput/captureError
```
Test helpers (`tests/helpers/`):
- `setup.ts`: `captureOutput(fn): CaptureResult`, `captureError(fn): CaptureErrorResult`, `captureErrorAsync(fn): Promise<...>` — spy on `process.exit`, capture stdout/stderr + exitCode (handle the EXIT_SENTINEL).
- `fixtures.ts`: `createFixtureDir(): string` (mkdtemp + cp `.planning` fixture), `cleanupFixtureDir(dir): void`, `FIXTURE_SOURCE`.
Tests mirror lib: `lib/research/index.ts` → `tests/unit/research.test.ts` (or `research/`).

---

## 9. Metrics counters (`lib/metrics.ts`)

```ts
export function incrementCounter(name: string, delta: number = 1): void
export function getCounters(): Record<string, number>
export function resetCounters(): void
module.exports = { incrementCounter, getCounters, resetCounters };
```
In-memory `Map`, process-lifetime. Reader = `case 'metrics':` in `bin/grd-tools.ts`:
```ts
const { getCounters } = require('../lib/metrics') as { getCounters: () => Record<string, number> };
const counters = getCounters();
output(counters, raw, JSON.stringify(counters, null, 2));
```
Callers do typed-require then `incrementCounter('research.something_total')`. Counter naming: `<area>.<event>_total` / `<area>.<x>.<level>`.

---

## 10. Config load + confirmation_gates

```ts
function loadConfig(cwd: string): GrdConfig  // reads .planning/config.json, merges defaults
export interface GrdConfig {
  model_profile: ModelProfileName;
  token_profile?: TokenProfileName;
  effort?: EffortAxisLevel;
  commit_docs: boolean; search_gitignored: boolean;
  branching_strategy: string; phase_branch_template: string; milestone_branch_template: string; base_branch: string;
  research: boolean; plan_checker: boolean; verifier: boolean; parallelization: boolean;
  code_review_enabled: boolean; code_review_timing: string;
  // ... confirmation_gates / research_gates objects, eval_config, execution, code_review, scheduler, superpowers
}
```
`confirmation_gates` and `research_gates` are nested objects (boolean flags). Actual config.json shape:
```json
"confirmation_gates": { "commit_confirmation": false, "file_deletion": false, "phase_completion": false, "target_adjustment": false, "approach_change": false },
"research_gates": { "survey_approval": false, "deep_dive_approval": false, "comparison_approval": false, "feasibility_approval": false, "verification_design": false, "product_plan_approval": false, "phase_plan_approval": false, "execution_approval": false }
```
`lib/utils.ts` (lines ~281-290) lists `'research_gates'`, `'confirmation_gates'`, `'_saved_research_gates'`, `'_saved_confirmation_gates'` as known config keys (preserved/saved). Gates are read directly off the config object: `config.confirmation_gates?.phase_completion`. Structural validators live in `lib/gates.ts` (`checkOrphanedPhases`, `checkPhaseInRoadmap`, ... — these are roadmap/state coherence gates, NOT the confirmation_gates UX flags). If `gd research` needs a research-specific gate, add a key to `research_gates`.

---

## 11. lib/knowledge.ts + lib/dead-ends.ts

`lib/knowledge.ts`:
```ts
interface KnowhowEntry { pattern_name; source; applicability; code_snippet; phase_number; created_at }
function formatKnowhowEntry(entry: KnowhowEntry): string   // -> "### <name>\n\n- **source:** ...\n- **applicability:** ...\n..."
function parseKnowhowEntries(content: string): KnowhowEntry[]   // splits on /(?=^### )/m
function appendKnowhowEntries(knowhowPath: string, entries: KnowhowEntry[]): void  // dedup by pattern_name
function selectTopEntries(...); function buildKnowledgeInjectionBlock(...)
module.exports = { formatKnowhowEntry, parseKnowhowEntries, appendKnowhowEntries, selectTopEntries, buildKnowledgeInjectionBlock };
```
`lib/dead-ends.ts`:
```ts
export interface DeadEndEntry { approach; slug; tried_in_phases: string[]; verdict; evidence: string[] }
export interface DeadEndAddOpts { approach; phase; verdict?; evidence?: string[]; notes? }
export interface ReflectionData { hypothesis; predicted_outcome; actual_outcome; verdict: 'confirmed'|'partial'|'falsified'|'unknown'|string; evidence: string[] }
function parseDeadEndsFile(content: string): ...
function serializeDeadEndsFile(...): string
function parseReflectionSection(...): ReflectionData
function cmdDeadEndAdd(cwd: string, opts: DeadEndAddOpts, raw: boolean): void  // validates --approach/--phase, slugs, writes
function cmdDeadEndPromoteFromPhase(...)
module.exports = { parseDeadEndsFile, serializeDeadEndsFile, parseReflectionSection, cmdDeadEndAdd, cmdDeadEndPromoteFromPhase };
```

---

## 12. TypeScript module conventions

- `'use strict';` first line of every file.
- CommonJS: `const x = require('./mod')`, `module.exports = { ... }`. NOT ESM (no `import`/`export default` for runtime; `import type` allowed for types only).
- Typed-require idiom:
  ```ts
  const { getCounters } = require('../lib/metrics') as { getCounters: () => Record<string, number> };
  ```
- **`.js` proxies are essentially GONE.** Only 2 of 47 lib modules have a `.js` (`lib/autoresearch.js`, `lib/got.js`); most (`state`, `utils`, `frontmatter`, `paths`, `knowledge`, `dead-ends`, `metrics`, `scheduler`, etc.) are pure `.ts` with NO `.js` proxy. `tsx/cjs` (registered in `bin/*.js`) resolves `.ts` directly. **For `lib/research/`: write only `.ts` files, no `.js` proxies.** Entry point pattern is the only place `.js` exists: `bin/grd-research.js` (4 lines: `require('tsx/cjs'); require('./grd-research.ts')`) — but note tool commands route through the existing `bin/grd-tools.js` switch, so a new bin file is only needed for an agent-style or standalone command.
- Strict TS, zero `any` (use `Record<string, unknown>` or interfaces), unused args prefixed `_`.
