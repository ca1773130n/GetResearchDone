# Technology Stack

**Analysis Date:** 2026-03-01

## Languages

**Primary:**
- JavaScript (ES2022) — All source in `bin/` (4 files), `lib/` (23 modules), `tests/` (37 test files)
  - CommonJS (`require`/`module.exports`) throughout — no ESM
  - `'use strict'` at top of every file

**Secondary:**
- Markdown — Command definitions (`commands/`, 42 files), agent definitions (`agents/`, 20 files), template files (`templates/`, 27+ files), all `.planning/` documents
- YAML — Embedded as frontmatter in Markdown files in `commands/`, `agents/`, `.planning/milestones/`
- JSON — Configuration files: `package.json`, `.planning/config.json`, `grd-file-manifest.json`, `.claude-plugin/plugin.json`
- Shell — `tests/golden/capture.sh` for golden output snapshotting

## Runtime

**Environment:**
- Node.js >=18 (enforced via `package.json` `engines` field)
- Tested against Node 20 and 22 in CI matrix (`.github/workflows/ci.yml`); Node 18 no longer in CI matrix
- Module system: CommonJS only

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present (lockfileVersion 3)
- `npm ci` used in CI for reproducible installs

## Frameworks

**Testing:**
- Jest ^30.2.0 (resolved: 30.2.0)
  - Config: `jest.config.js`
  - Pattern: `**/tests/**/*.test.js`
  - Timeout: 15,000ms
  - Coverage: collected from `lib/**/*.js` only, output to `coverage/`
  - Per-file coverage thresholds enforced per-module (23 entries in `jest.config.js`)
  - Test suites: unit (28 files), integration (6 files), golden snapshot — 37 test files total

**Linting:**
- ESLint ^10.0.0 (resolved: 10.0.0) — flat config format
  - Config: `eslint.config.js`
  - Preset: `@eslint/js` recommended (`js.configs.recommended`)
  - ecmaVersion: 2022, globals: node + jest
  - Key rules: `no-unused-vars` with `argsIgnorePattern: '^_'`; `no-constant-condition` (checkLoops:false); `no-empty` (allowEmptyCatch:true)
  - Targets: `bin/` and `lib/` only
  - Runs as pre-commit hook; CI runs lint on Node 22 only

**Formatting:**
- Prettier ^3.8.1 (resolved: 3.8.1)
  - Config: `.prettierrc` — singleQuote:true, semi:true, trailingComma:'es5', tabWidth:2, printWidth:100, endOfLine:'lf'
  - Ignore: `.prettierignore` — excludes `coverage/`, `node_modules/`, `tests/fixtures/`, `tests/golden/`, `.planning/`, `*.md`
  - Targets: `bin/ lib/ tests/ jest.config.js`
  - CI checks format on Node 22 only

**Build/Bundler:**
- None — no transpilation or bundling. Source runs directly in Node.js.

## Key Dependencies

**Production Runtime:**
- Zero runtime npm dependencies.
- All production code uses Node.js built-ins exclusively:
  - `fs` — file I/O in all lib modules
  - `path` — path resolution in all modules
  - `os` — temp directory resolution in `lib/worktree.js`
  - `child_process` (`execFileSync`, `spawnSync`, `spawn`) — git CLI invocation in `lib/utils.js`, `lib/worktree.js`, `lib/backend.js`; `claude` CLI subprocess spawning in `lib/autopilot.js`
  - `crypto` — SHA256 hashing in `bin/grd-manifest.js`

**Development Dependencies (direct):**
- `jest` ^30.2.0 — test runner with coverage
- `@eslint/js` ^10.0.1 — ESLint rule presets
- `eslint` ^10.0.0 — linter
- `globals` ^17.3.0 — global variable definitions for ESLint
- `prettier` ^3.8.1 — formatter

**Notable Transitive Dev Dependencies:**
- `babel-jest` 30.2.0, `@babel/core` 7.29.0 — Jest JS transformation pipeline
- `istanbul-lib-coverage`, `istanbul-lib-instrument` — coverage instrumentation
- `v8-to-istanbul` 9.3.0 — V8 coverage format conversion
- `fsevents` 2.3.3 — macOS file watching (optional, Jest watch mode)

## lib/ Modules (23 total)

| Module | Purpose |
|--------|---------|
| `lib/autopilot.js` | Deterministic multi-phase orchestration via `claude -p` subprocesses (Phase 52) |
| `lib/backend.js` | Claude Code backend detection + capabilities |
| `lib/cleanup.js` | Phase-boundary quality analysis |
| `lib/commands.js` | CLI command routing + argument parsing |
| `lib/context.js` | Context optimization (plan index, snapshots) |
| `lib/deps.js` | Dependency management |
| `lib/evolve.js` | Self-evolving loop engine — work item discovery, state persistence, scoring (Phase 55) |
| `lib/frontmatter.js` | YAML frontmatter CRUD |
| `lib/gates.js` | Research + confirmation gates |
| `lib/long-term-roadmap.js` | LT milestone CRUD + protection rules |
| `lib/markdown-split.js` | Split large markdown files at heading boundaries; transparent read-through (Phase 53/54) |
| `lib/mcp-server.js` | MCP tool registration — ~90 tools |
| `lib/parallel.js` | Parallel execution engine |
| `lib/paths.js` | Milestone-scoped path resolution for `.planning/` |
| `lib/phase.js` | Phase lifecycle (add/insert/remove/complete) |
| `lib/requirements.js` | REQUIREMENTS.md parsing, listing, traceability, status updates (extracted from commands.js) |
| `lib/roadmap.js` | ROADMAP.md parsing + manipulation |
| `lib/scaffold.js` | Directory/file scaffolding |
| `lib/state.js` | STATE.md read/write/patch |
| `lib/tracker.js` | GitHub Issues / MCP Atlassian sync |
| `lib/utils.js` | Shared utilities (slug, date, markdown) |
| `lib/verify.js` | Plan/phase/commit verification suite |
| `lib/worktree.js` | Git worktree parallel execution |

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | npm manifest, scripts, `engines.node >=18` |
| `package-lock.json` | Dependency lockfile (lockfileVersion 3) |
| `jest.config.js` | Jest test config — pattern, coverage dir, per-file thresholds (23 entries), 15s timeout |
| `eslint.config.js` | ESLint flat config — recommended + custom rules |
| `.prettierrc` | Prettier options — singleQuote, semi, trailingComma, printWidth:100 |
| `.prettierignore` | Prettier exclusions |
| `.editorconfig` | Editor settings — 2-space indent, LF, UTF-8, trim trailing whitespace |
| `.gitignore` | Excludes `node_modules/`, `coverage/`, `.env*`, `dist/`, `*.tgz`, `.claude/`, `grd-local-patches/`, `.worktrees/` |
| `VERSION` | Plain-text version file (`0.2.8`), verified against `plugin.json` in release CI |
| `.claude-plugin/plugin.json` | Claude Code plugin manifest — registers `SessionStart`, `WorktreeCreate`, `WorktreeRemove` hooks; version `0.2.8` |
| `.planning/config.json` | Project runtime config — `model_profile`, gates, `tracker`, `eval_config`, `code_review`, `autonomous_mode` |
| `grd-file-manifest.json` | SHA256 hashes of all distributed files for self-update detection |
| `templates/config.json` | Default config template used when initializing new projects |

## CI/CD Pipeline

**Provider:** GitHub Actions (`.github/workflows/`)

**CI** (`.github/workflows/ci.yml`) — restructured into three sequential jobs:
- **lint** job: checkout → setup-node@22 → `npm ci` → lint → format:check
- **test** job (needs lint): Node.js 20 and 22 matrix — checkout → setup-node → `npm ci` → `npm test`
- **validate** job (needs test): pack+install validation (grd-tools CLI, MCP server JSON-RPC, `plugin.json`) → `npm audit --audit-level=moderate` (continue-on-error)
- Triggers: push/PR to `main`
- Node 18 removed from test matrix; lint/format runs on Node 22 only

**Release** (`.github/workflows/release.yml`):
- Trigger: manual `workflow_dispatch`
- Steps: version consistency check (VERSION == plugin.json == CHANGELOG.md entry) → `npm test` → extract changelog section → create GitHub Release (draft) via `softprops/action-gh-release@v2`

**Pre-commit hook:**
- `npm run lint` — prevents commits with ESLint errors

## Available npm Scripts

| Script | Command |
|--------|---------|
| `npm test` | `jest --coverage` |
| `npm run test:unit` | `jest tests/unit/ --coverage` |
| `npm run test:integration` | `jest tests/integration/` |
| `npm run test:watch` | `jest --watch` |
| `npm run lint` | `eslint bin/ lib/` |
| `npm run lint:fix` | `eslint --fix bin/ lib/` |
| `npm run format` | `prettier --write bin/ lib/ tests/ jest.config.js` |
| `npm run format:check` | `prettier --check bin/ lib/ tests/ jest.config.js` |

## Platform Requirements

**Development:**
- Node.js >=18
- npm (lockfileVersion 3 support)
- Git CLI (required for worktree and commit operations)
- `claude` CLI (required for autopilot/evolve loop — `lib/autopilot.js` spawns `claude -p` subprocesses)
- macOS/Linux/Windows (cross-platform; worktrees now use project-local `.worktrees/` instead of `os.tmpdir()`)
- Optional: `gh` CLI for GitHub Issues tracker integration and PR creation
- Optional: MCP Atlassian server for Jira integration

**Distribution:**
- Published as npm package `grd-tools` (UNLICENSED), version `0.2.8`
- Entrypoints: `grd-tools` → `bin/grd-tools.js`, `grd-mcp-server` → `bin/grd-mcp-server.js`
- Published files declared in `package.json` `files`: `bin/`, `lib/`, `commands/`, `agents/`, `.claude-plugin/plugin.json`
- `postinstall` in `bin/postinstall.js` creates `.planning/` directory structure with default `config.json` on first install

---

*Stack analysis: 2026-03-01*
