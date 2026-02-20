# Technology Stack

**Analysis Date:** 2026-02-20

## Languages

**Primary:**
- JavaScript (ES2022) — All source in `bin/` (4 files), `lib/` (19 modules), `tests/` (31 test files)
  - CommonJS (`require`/`module.exports`) throughout — no ESM
  - `'use strict'` at top of every file

**Secondary:**
- Markdown — Command definitions (`commands/`, 45 files), agent definitions (`agents/`, 19 files), template files (`templates/`, 27+ files), all `.planning/` documents
- YAML — Embedded as frontmatter in Markdown files in `commands/`, `agents/`, `.planning/milestones/`
- JSON — Configuration files: `package.json`, `.planning/config.json`, `grd-file-manifest.json`, `.claude-plugin/plugin.json`
- Shell — `tests/golden/capture.sh` for golden output snapshotting

## Runtime

**Environment:**
- Node.js >=18 (enforced via `package.json` `engines` field)
- Tested against Node 18, 20, 22 in CI matrix (`.github/workflows/ci.yml`)
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
  - Per-file coverage thresholds enforced per-module (lines 8–73 of `jest.config.js`)
  - 1,631 total tests across unit, integration, golden, E2E suites

**Linting:**
- ESLint ^10.0.0 (resolved: 10.0.0) — flat config format
  - Config: `eslint.config.js`
  - Preset: `@eslint/js` recommended (`js.configs.recommended`)
  - ecmaVersion: 2022, globals: node + jest
  - Key rules: `no-unused-vars` with `argsIgnorePattern: '^_'`; `no-constant-condition` (checkLoops:false); `no-empty` (allowEmptyCatch:true)
  - Targets: `bin/` and `lib/` only
  - Runs as pre-commit hook; CI runs on Node >=20

**Formatting:**
- Prettier ^3.8.1 (resolved: 3.8.1)
  - Config: `.prettierrc` — singleQuote:true, semi:true, trailingComma:'es5', tabWidth:2, printWidth:100, endOfLine:'lf'
  - Ignore: `.prettierignore` — excludes `coverage/`, `node_modules/`, `tests/fixtures/`, `tests/golden/`, `.planning/`, `*.md`
  - Targets: `bin/ lib/ tests/ jest.config.js`
  - CI checks format on Node >=20

**Build/Bundler:**
- None — no transpilation or bundling. Source runs directly in Node.js.

## Key Dependencies

**Production Runtime:**
- Zero runtime npm dependencies.
- All production code uses Node.js built-ins exclusively:
  - `fs` — file I/O in all lib modules
  - `path` — path resolution in all modules
  - `os` — temp directory resolution in `lib/worktree.js`
  - `child_process` (`execFileSync`) — git CLI invocation in `lib/utils.js`, `lib/worktree.js`, `lib/backend.js`
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

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | npm manifest, scripts, `engines.node >=18` |
| `package-lock.json` | Dependency lockfile (lockfileVersion 3) |
| `jest.config.js` | Jest test config — pattern, coverage dir, per-file thresholds, 15s timeout |
| `eslint.config.js` | ESLint flat config — recommended + custom rules |
| `.prettierrc` | Prettier options — singleQuote, semi, trailingComma, printWidth:100 |
| `.prettierignore` | Prettier exclusions |
| `.editorconfig` | Editor settings — 2-space indent, LF, UTF-8, trim trailing whitespace |
| `.gitignore` | Excludes `node_modules/`, `coverage/`, `.env*`, `dist/`, `*.tgz`, `.claude/`, `grd-local-patches/` |
| `VERSION` | Plain-text version file (`0.2.2`), verified against `plugin.json` in release CI |
| `.claude-plugin/plugin.json` | Claude Code plugin manifest — registers `SessionStart` hook, version `0.2.2` |
| `.planning/config.json` | Project runtime config — `model_profile`, gates, `tracker`, `eval_config`, `code_review`, `autonomous_mode` |
| `grd-file-manifest.json` | SHA256 hashes of all distributed files for self-update detection |
| `templates/config.json` | Default config template used when initializing new projects |

## CI/CD Pipeline

**Provider:** GitHub Actions (`.github/workflows/`)

**CI** (`.github/workflows/ci.yml`):
- Triggers: push/PR to `main`
- Matrix: Node.js 18, 20, 22 on `ubuntu-latest`
- Steps: checkout → setup-node → `npm ci` → lint (Node >=20 only) → format:check (Node >=20 only) → `npm test` → pack+install validation → `npm audit --audit-level=moderate` (continue-on-error)
- Pack validation unpacks tarball in temp dir, verifies `grd-tools.js` runs, MCP server responds to JSON-RPC `initialize`, and `plugin.json` exists

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
- macOS/Linux/Windows (cross-platform; `lib/worktree.js` handles macOS `/tmp` → `/private/tmp` symlink)
- Optional: `gh` CLI for GitHub Issues tracker integration
- Optional: MCP Atlassian server for Jira integration

**Distribution:**
- Published as npm package `grd-tools` (UNLICENSED)
- Entrypoints: `grd-tools` → `bin/grd-tools.js`, `grd-mcp-server` → `bin/grd-mcp-server.js`
- Published files declared in `package.json` `files`: `bin/`, `lib/`, `commands/`, `agents/`, `.claude-plugin/plugin.json`
- `postinstall` in `bin/postinstall.js` creates `.planning/` directory structure with default `config.json` on first install

---

*Stack analysis: 2026-02-20*
