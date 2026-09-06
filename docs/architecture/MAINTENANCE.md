# GRD Maintainer Procedures

How-to guide for engineers extending or modifying the GRD codebase. Each section is a self-contained procedure with ordered steps and concrete file references.

**On the line numbers below:** file paths and symbol names are current, but the `(line N)` citations have drifted since they were written — several by 50–150 lines. Search for the named symbol; treat the number as a hint about where in the file to look, not as an address.

---

## Procedure 1: Adding a New CLI Command

Use `gd settings` as the reference implementation: it handles both agent-dispatch (no subcommand) and tool-dispatch subcommands.

1. **Decide the command type.** Tool commands are synchronous and return JSON. Agent commands spawn an AI subagent via `lib/context/`. Use `gd health` (`lib/commands/health.ts`) as a reference for a pure tool command.

2. **Implement the handler.** Create `lib/commands/foo.ts` (or `lib/foo.ts` for larger commands). Export a `cmdFoo(cwd: string, args: string[], raw: boolean): void` function. Use `output(result, raw)` for success and `error(message)` for failures — both are in `lib/utils.ts` and call `process.exit`.

3. **Register in `lib/cli/index.ts`.** Add the command name to `TOOL_COMMANDS` for tool-routed commands or to `AGENT_COMMANDS` for agent-dispatched commands. For hybrid commands with both tool and agent subcommands, add a case to `classifyCommand()`, following the `settings` pattern (`SETTINGS_TOOL_SUBS` plus the `command === 'settings' && ...` branch inside `classifyCommand`).

4. **Wire into `bin/grd-tools.ts`.** Import your handler with a typed `require` block (follow the existing import pattern near the top of the file), then add a `case 'foo':` block in the main switch statement (search for `case 'settings':` as a template). Parse `args[0]`, `args[1]` etc. for subcommands; call `error()` on invalid input.

5. **Add tests.** Create `tests/unit/foo.test.ts`. Use `captureOutput` / `captureError` from `tests/helpers/setup.ts` to intercept `process.exit`. Mirror the structure of `tests/unit/health.test.ts`.

6. **Update `CLAUDE.md`.** Add a row to the GD CLI table under `## Commands`.

---

## Procedure 2: Adding a New Subagent

GRD subagents are Markdown files with YAML frontmatter. The scheduler spawns them as `claude -p <prompt> --system-prompt agents/<name>.md`.

1. **Create `agents/<name>.md`** with frontmatter:
   ```yaml
   ---
   name: grd-my-agent
   description: One-line description of what this agent does.
   tools: Read, Write, Bash, Glob, Grep
   color: blue
   effort: medium
   ---
   ```
   See `agents/grd-planner.md` for a full example. The `effort` field is `low | medium | high` and is used by the backend when dispatching (Claude Code v2.1.68+).

2. **Add to `MODEL_PROFILES` in `lib/utils.ts`** (line 66). Map the agent name to tier assignments per profile: `{ quality: 'opus', balanced: 'sonnet', budget: 'haiku' }`. If omitted, the scheduler falls back to `sonnet` for all profiles.

3. **Add to `EFFORT_PROFILES` in `lib/backend.ts`** (line 243). Map the agent name to effort per profile: `{ quality: 'high', balanced: 'medium', budget: 'low' }`. This controls reasoning depth on backends that support the `effort` capability flag.

4. **Optionally add to `AGENT_BASELINE_COMPLEXITY` in `lib/complexity.ts`** (line 22). This seeds the adaptive model-tier routing. If omitted, the scheduler defaults to `'medium'` complexity. Use `'high'` for planners, `'low'` for lightweight checkers.

5. **Dispatch.** Agents are dispatched by autopilot/context init functions. If your agent is called from an orchestrator command, add a `cmdInit<Name>` function in the relevant `lib/context/*.ts` file. See `lib/context/agents.ts` for how existing agents are initialized. The command's skill file in `commands/<name>.md` specifies what prompt GRD sends when dispatching.

---

## Procedure 3: Adding a New Backend Adapter

Backends are the AI CLI tools GRD orchestrates (claude, codex, gemini, opencode, overstory).

1. **Add the identifier to `BackendId`** in `lib/types.ts` (line 21). Add it to the union type.

2. **Add to `VALID_BACKENDS`** in `lib/backend.ts` (line 61) and to `DEFAULT_BACKEND_MODELS` (line 76) with tier-to-model-name mappings.

3. **Add to `BACKEND_CAPABILITIES`** in `lib/backend.ts` (line 102). Copy the `codex` block as a template and set each capability flag accurately. Key flags: `native_worktree_isolation`, `effort`, `http_hooks`, `cron`, `mcp_elicitation`.

4. **Implement the adapter in `lib/scheduler.ts`.** Add an entry to `ADAPTERS` (line 66) implementing the `BackendAdapter` interface (`lib/types.ts` lines 599–604):
   - `binary`: the CLI executable name
   - `buildArgs(prompt, opts)`: returns the argument array to pass to the binary
   - `parseTokenUsage(stderr)`: returns token count from stderr, or `null`
   - `isRateLimited(exitCode, stderr)`: returns `true` if the error is a rate limit

5. **Add detection logic to `detectBackend()`** in `lib/backend.ts` (line 347). Follow the waterfall: config override → env var → filesystem clue. Add an environment variable entry to `ENV_VAR_MAP` in `lib/scheduler.ts` (line 146).

6. **If the backend supports multi-account rotation**, extend `SuperpowersConfig.accounts` in `lib/types.ts` (line 1144) — it is typed as `Partial<Record<AdapterBackendId, AccountConfig[]>>`, so new adapters are automatically included.

7. **Add tests** to `tests/unit/backend.test.ts` and `tests/unit/scheduler.test.ts` covering `detectBackend`, `buildArgs`, `parseTokenUsage`, and `isRateLimited` for the new backend.

---

## Procedure 4: Adding a New Preflight Gate

Gates run before commands execute and block on errors (or warn on warnings).

1. **Implement the check function** in `lib/gates.ts`. Follow the signature `(cwd: string, opts: GateOptions) => GateViolation[]`. Return violations with `code`, `severity` (`'error'` or `'warning'`), `message`, `fix`, and `context`. See `checkPhaseInRoadmap` (line 126) as a clean reference.

2. **Register the check** by adding it to `GATE_CHECKS` (line 548). Use a kebab-case name: `'my-new-gate': (cwd, opts) => checkMyNewGate(cwd, opts)`.

3. **Assign the gate to commands** in `GATE_REGISTRY` (line 533). Add your gate name to the arrays of the commands that should run it. Example: `'plan-phase': ['orphaned-phases', 'phase-in-roadmap', ..., 'my-new-gate']`.

4. **If the gate requires a config flag** (like `citation_gate`), guard the check body with `if (!config.citation_gate) return violations;` and add the config field following Procedure 5 below.

5. **Add tests** in `tests/unit/gates.test.ts` for the check function and for gate-registry wiring.

---

## Procedure 5: Adding a New Config Field

Use `token_profile` (Spec 4) as the reference end-to-end implementation.

1. **Add the field to `GrdConfig`** in `lib/types.ts` (line 371). Use `?:` for optional fields. Add a JSDoc comment explaining the semantics and default. Example: `token_profile?: TokenProfileName;` (line 378).

2. **Add the key to `KNOWN_CONFIG_KEYS`** in `lib/utils.ts` (line 244). This prevents the "unrecognized config key" warning when the field is present in `config.json`.

3. **Set the default in `loadConfig()`** in `lib/utils.ts` (line 313). Either set it explicitly in the defaults object or handle `undefined` at call sites.

4. **If user-settable via `gd settings`:**
   - Add the subcommand name to `SETTINGS_TOOL_SUBS` in `lib/cli/index.ts`.
   - Add a `case` block in `bin/grd-tools.ts` under `case 'settings':` that validates the value and calls `cmdConfigSet(cwd, 'field_name', value, raw)`.

5. **Document in `CLAUDE.md`** under the relevant section. Mention valid values, the default, and which `gd settings` subcommand to use.

6. **Add tests** to `tests/unit/utils.test.ts` (for `loadConfig` defaults) and `tests/unit/grd-tools.test.ts` (for the settings dispatch path).

---

## Procedure 6: Adding a Phase Lifecycle Hook

Autopilot's per-phase pipeline runs in `runPostPhasePipeline()`, which lives in **`lib/autopilot-pipeline.ts`** and is re-exported through `lib/autopilot.ts` — edit the pipeline module, not the re-export. Steps execute in sequence: simplify → create PR → code review → rebase & merge. Status markers are written at each step.

1. **Add a new step to `runPostPhasePipeline()`** in `lib/autopilot-pipeline.ts`. Insert a `spawnStep(...)` call (the helper is defined in the same file) at the appropriate position. Use `buildMyStepPrompt(phaseNum)` for the prompt builder function.

2. **Write status markers.** Call `writeStatusMarker(cwd, phaseNum, 'my-step', 'started')` before the step and `writeStatusMarker(cwd, phaseNum, 'my-step', 'completed' | 'failed')` after. Markers land in `.planning/autopilot/phase-<N>-my-step.json`.

3. **Return on failure.** If your step is blocking, return `{ status: 'failed', failedStep: 'my-step', reason: '...' }` on non-zero exit codes. Non-blocking steps (like `runKnowledgeMining`) catch errors and log without returning early.

4. **Gate with a config flag** if the hook is optional. Check `config.my_hook_enabled` before running, following the pattern in `runRefinementLoop()`, which checks `config.refinement_loop`.

5. **Add tests** in `tests/unit/autopilot.test.ts` covering the new step's success and failure paths.

---

## Procedure 7: Running the Test Suite

```bash
npm test                           # Full suite with coverage
npm run test:unit                  # Unit tests only
npx jest tests/unit/state.test.ts  # Single file
npx jest -t "should parse frontmatter"  # By test name
```

There is currently **no push/PR CI** — `.github/workflows/ci.yml` was removed during the autoresearch development phase, and the only workflows left are `release.yml` and `npm-publish.yml`, both manually triggered. The full suite runs unattended exactly once per release, inside `release.yml`. Until CI comes back, `npm test`, `npm run lint` and `npm run build:check` are your responsibility to run locally before merging. See `TESTING.md` for suite layout and current counts.

**Coverage thresholds** are enforced per file in `jest.config.js`. Do not lower them. Adding a new module requires a corresponding test file with matching thresholds.

**Test helpers** are in `tests/helpers/setup.ts`. Key utilities:
- `captureOutput(fn)` — captures stdout and exit code (for success paths)
- `captureError(fn)` — captures stderr and exit code (for error paths)
- `captureOutputAsync` / `captureErrorAsync` — async variants

Both mock `process.exit` with a sentinel throw so tests can assert on `exitCode` without killing the process.

**Temp project fixtures**: tests that need a real `.planning/` directory create a `tmp` directory via `fs.mkdtempSync(os.tmpdir())` and write minimal `STATE.md` / `ROADMAP.md` files. Clean up in `afterAll`. See `tests/unit/gates.test.ts` for a pattern.

**Fake timers**: some scheduler tests use Jest fake timers. Call `jest.useFakeTimers()` in `beforeEach` and `jest.useRealTimers()` in `afterEach` to avoid leaking timer state between suites.

---

## Procedure 8: Cutting a Release

Releasing GRD is two workflows and one human decision in the middle: `release.yml`
builds a **draft** GitHub release, a maintainer publishes it, and publishing it fires
`npm-publish.yml`, which pushes the package to npm.

### Step 1 — Bump four files together

`VERSION`, `package.json`, `.claude-plugin/plugin.json` and `package-lock.json` all
carry the version and must agree.

| File | Field | Enforced by |
|---|---|---|
| `VERSION` | whole file | — (it is the source of truth) |
| `package.json` | `version` | `tests/unit/postinstall.test.ts` (`version matches VERSION file`), plus `npm-publish.yml`'s tag-vs-`package.json` check |
| `.claude-plugin/plugin.json` | `version` | `tests/unit/postinstall.test.ts` **and** the `release.yml` version gate |
| `package-lock.json` | `.version` and `.packages[""].version` | nothing — see the warning below |

`npm version patch` (or `minor` / `major`) updates `package.json` and
`package-lock.json` together, but it does **not** know about `VERSION` or
`plugin.json` — there is no `version` lifecycle script — and by default it also
creates a commit and a `v<x.y.z>` git tag. Pass `--no-git-tag-version` and let
`release.yml` create the tag, or hand-edit all four files.

**`package-lock.json` is the one nothing catches.** No test asserts it and `npm ci`
does not fail on a version-only mismatch (verified: it installs happily), so a
hand-edited `package.json` leaves the lockfile behind silently. Run `npm install`
after the edit and commit the lockfile with the rest.

Verify locally before pushing:

```bash
node -e 'const fs=require("fs"),v=fs.readFileSync("VERSION","utf8").trim();
for (const f of ["package.json",".claude-plugin/plugin.json","package-lock.json"])
  console.log(f, require("./"+f).version === v ? "ok" : "MISMATCH");'
```

### Step 2 — Add the CHANGELOG section

`docs/CHANGELOG.md` must contain a `## [x.y.z]` heading for the new version.
`release.yml` greps for `[$VERSION]` and **fails the release** if there is no match,
then extracts everything under that heading as the release notes.

The extractor is a flag-based `awk`, not a range — deliberately. The version heading
matches both the start pattern and the end pattern `^## \[`, so a naive
`/start/,/end/` range closes on the line it opens and yields a one-line release note.
If you change the CHANGELOG heading format, that `awk` has to change with it. An
empty extraction also fails the run (`test -s release-notes.md`).

### Step 3 — Run the release workflow

```bash
gh workflow run release.yml          # workflow_dispatch only; runs on main by default
```

It checks out the ref, installs, runs the version gate, runs the **full suite**
(`npm test -- --coverageThreshold='{}'` — per-file coverage is deliberately not
re-enforced here; see the comment in the workflow), extracts the notes, and creates
the GitHub release for tag `v<x.y.z>` **as a draft**.

### Step 4 — A human publishes the draft

Review the draft release on GitHub and publish it. Nothing is on npm until you do.

### Step 5 — npm publish happens automatically, over OIDC

Publishing the release emits a `release: published` event that triggers
`.github/workflows/npm-publish.yml`. It verifies the tag matches `package.json`,
runs `npm ci` (so `prepublishOnly` → `npm run build` has its devDependencies), skips
with a loud notice if the version is already on the registry, and runs
`npm publish --access public`.

**Authentication is GitHub Actions OIDC trusted publishing.** Three things about it
that will cost you an afternoon if you don't know them:

- **There is no `NPM_TOKEN`, and there must not be one.** npm mints a short-lived
  credential from the `id-token: write` permission. Adding a token secret is a
  regression, not a fallback.
- **The trusted-publisher entry on npmjs.com pins the workflow FILENAME.** Renaming
  or moving `npm-publish.yml` breaks publishing with `ENEEDAUTH` / `E404 PUT` — an
  auth failure that reads like a missing package and explains nothing. If the file
  must be renamed, update the trusted publisher on npmjs.com in the same change.
- **Never add `registry-url:` to its `setup-node` step.** It makes setup-node write
  an `.npmrc` containing `_authToken=${NODE_AUTH_TOKEN}` with a placeholder value, so
  npm authenticates with garbage instead of OIDC and loses silently.

The job pins `node-version: "24"` because OIDC needs npm >= 11.5.1, and must run on
`ubuntu-latest` — npm OIDC does not support self-hosted runners. Provenance
attestations are generated automatically, which is why `--provenance` is absent.

For a re-run or a release published before the workflow existed, dispatch it manually
with the `tag` input (e.g. `v0.6.0`); the tag-vs-`package.json` check still applies.

---

## Procedure 9: Formatting, Linting, and Build-Check

| Command | What it does | When to run |
|---------|-------------|-------------|
| `npm run lint` | ESLint on `bin/` and `lib/` | Before every commit |
| `npm run lint:fix` | Auto-fix ESLint violations | After bulk refactors |
| `npm run build:check` | `tsc --noEmit` on the whole codebase | Before every commit |
| `npm run format:check` | Prettier dry-run | **Currently fails wholesale — see below** |
| `npm run format` | Prettier write on `bin/ lib/ tests/ jest.config.js` | **Do not run unscoped — see below** |

**The Prettier scripts are not currently usable as gates.** There is no Prettier
configuration file in the repository — no `.prettierrc` in any form, no `prettier` key in
`package.json`. `.editorconfig` exists but only sets indentation and line endings, not
quote style or print width. So Prettier falls back to its own defaults (double quotes,
`printWidth: 80`), which disagree with the codebase's actual style (single quotes, wider
lines). The measured result: `npx prettier --check bin/**/*.ts lib/**/*.ts` flags **160 of
168 files**, and `npm run format:check` exits 1 on a clean tree.

Two consequences:

- **Never run `npm run format` unscoped.** It would not merely add whitespace noise — it
  would rewrite the entire codebase from single to double quotes and reflow every line
  over 80 characters, in one unreviewable diff.
- **Treat `npm run format:check` as broken, not as a signal.** A failure from it says
  nothing about your change.

Until someone adds a Prettier config that matches the existing style (single quotes, a
realistic `printWidth`) and reformats once deliberately, format only what you touched, by
hand or with an explicit scope, and eyeball the diff:

```bash
npx prettier --write lib/mymodule.ts tests/unit/mymodule.test.ts   # then review the diff
```

Style is in practice enforced by ESLint and `tsc`, not Prettier. The ESLint config
(`eslint.config.js`) enforces `no-unused-vars` with an `^_` `argsIgnorePattern` for
intentionally unused args. TypeScript `strict: true` is enforced; zero `any` is the
project standard — use `Record<string, unknown>` or specific interfaces.

---

## Procedure 10: Committing and Pull Requests

This milestone uses **git worktrees** for parallel branch isolation. Each spec gets its own worktree at `.worktrees/<spec-slug>/`.

**Commit style**: Conventional Commits — `type(scope): message`. Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Examples from recent history: `fix(scan): unify ignorefile matching semantics`, `refactor(scan): dedupe types and helpers`.

**Branch naming**: `<type>/<slug>`, using the same type vocabulary as the commit prefix — `feat/artifact-shaped-gates`, `fix/dead-ends-fidelity`, `docs/autoresearch-tutorial-refresh`, `release/0.6.0`. (Older branches use a `<milestone-version>/<spec-slug>` scheme; that convention is no longer followed.)

**Merge strategy**: No-fast-forward merges (`git merge --no-ff`) to preserve branch topology. Note that recent PRs have in practice landed on `main` as squash merges (`fix: … (#75)`), so the history is currently mixed — confirm the intended strategy before merging rather than assuming either.

**Pre-commit hook** (optional, installed via `npm run hooks:install`): runs `gd scan` on staged markdown to block prompt injection patterns. Only this hook is installed by default. Run `npm run hooks:install` once per clone if you want it.

---

## Procedure 11: Debugging Autopilot Hangs

When `gd autopilot` stalls or appears hung:

1. **Check status markers.** Each phase step writes a JSON file to `.planning/autopilot/phase-<N>-<step>.json`. The most recent marker shows where autopilot stopped:
   ```bash
   ls -lt .planning/autopilot/*.json | head -10
   cat .planning/autopilot/phase-3-execute.json
   ```
   The `status` field will be `started`, `completed`, `failed`, or `skipped`.

2. **Check the autopilot log.** `lib/autopilot.ts` writes to `.planning/autopilot/autopilot.log` (line 1675). Tail it:
   ```bash
   tail -100 .planning/autopilot/autopilot.log
   ```

3. **Check scheduler state.** Token budget and backoff state live in `.planning/scheduler-state.json` (written by `lib/scheduler.ts` line 1114). Look for `cooldown_until` timestamps in the future, which indicate the scheduler is in exponential backoff.

4. **Run `gd health`.** This surfaces blockers, velocity issues, and configuration problems that may be causing a stall.

5. **Check for stale STATE.md locks.** `updateStateProgress()` in `lib/autopilot-pipeline.ts` guards `.planning/STATE.md` with an `O_EXCL` lock file at `.planning/STATE.md.lock`, retrying up to 50 times. A lock older than 30 seconds is treated as stale and deleted automatically, so a persistent `STATE.md.lock` means something is actively re-taking it — not that you need to delete it by hand.

---

## Procedure 12: Debugging Subprocess Issues

When a spawned backend process fails silently:

1. **Retrieve `SchedulerSpawnResult.stderr`.** The scheduler collects the subprocess stderr buffer in `SchedulerSpawnResult.stderr` (defined in `lib/types.ts` line 582). Callers that pass `captureOutput: true` in `SpawnOpts` get both `stdout` and `stderr` populated in the result.

2. **Log stderr from the call site.** The `spawnStep` wrapper lives in `lib/autopilot-pipeline.ts` (re-exported through `lib/autopilot.ts`) and returns the full `SchedulerSpawnResult`. Add a temporary `log(result.stderr ?? '')` call after the step to surface the subprocess output.

3. **Check `adapter.parseTokenUsage`** in `lib/scheduler.ts`. If the backend changed its stderr format, token parsing will silently return `null` (treated as 0 tokens). Verify the regex in the relevant adapter against actual subprocess output.

4. **Check `adapter.isRateLimited`** in `lib/scheduler.ts`. If a new error code isn't matched, the scheduler will not backoff and may retry with the same error. Extend the regex and add a test case.

5. **Run the binary manually** to see raw output:
   ```bash
   claude -p "echo hello" --verbose --dangerously-skip-permissions --output-format json 2>&1
   ```
   Compare against what `buildArgs` produces for the same backend.

---

## Cross-References

- `OVERVIEW.md` — Architecture overview, module map, data flow
- `MODULES.md` — Per-module descriptions and inter-module dependencies
- `API.md` — Exported function signatures and public contracts
- `CONFIG.md` — Configuration schema, all `GrdConfig` fields, and defaults
- `TESTING.md` — Test suite organization, coverage thresholds, helper patterns
- `BACKENDS.md` — Backend detection waterfall, capability flags, adapter interface
- `RISKS.md` — Known failure modes, workarounds, and architectural debt
