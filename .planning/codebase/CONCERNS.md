# Concerns & Technical Debt

**Analysis Date:** 2026-02-12

## Critical Issues

**None identified** — No critical blockers detected during codebase scan.

## Technical Debt

### Monolithic CLI Tool
- **Location:** `bin/grd-tools.js` (5632 lines)
- **Description:** Single file handles 80+ CLI subcommands with 845+ function definitions. Contains state management, phase operations, roadmap parsing, frontmatter CRUD, verification suite, tracker integration, template scaffolding, and more.
- **Severity:** High
- **Impact:** Difficult to maintain, test, and extend. High cognitive load for contributors.
- **Suggested Fix:** Extract into modular structure:
  - `lib/state.js` — STATE.md operations
  - `lib/roadmap.js` — ROADMAP.md parsing
  - `lib/phase.js` — Phase lifecycle
  - `lib/tracker.js` — GitHub/Jira sync
  - `lib/frontmatter.js` — YAML CRUD
  - `lib/verify.js` — Verification suite
  - Keep `bin/grd-tools.js` as thin CLI router

### Synchronous File I/O Throughout
- **Location:** `bin/grd-tools.js` (multiple occurrences)
- **Description:** Extensive use of `fs.readFileSync()` and `fs.writeFileSync()` for all file operations. At least 10+ occurrences detected.
- **Severity:** Medium
- **Impact:** Blocks event loop, poor performance on large files/directories, not suitable for concurrent operations.
- **Suggested Fix:** Migrate to async `fs.promises` API for better performance and scalability.

### Error Handling Inconsistency
- **Location:** `bin/grd-tools.js`
- **Description:** While 145 error handling blocks exist (try/catch/throw), many file operations lack explicit error handling. Some errors use `error()` helper, others throw directly.
- **Severity:** Medium
- **Impact:** Inconsistent error messages, potential crashes on malformed input or missing files.
- **Suggested Fix:** Standardize error handling pattern across all commands. Add validation for all user inputs.

### No Input Validation/Sanitization
- **Location:** `bin/grd-tools.js`
- **Description:** User inputs from CLI args are used directly in file paths, git commands, and regex operations without sanitization.
- **Severity:** Medium
- **Impact:** Potential for path traversal, command injection, or regex DoS if malicious input provided.
- **Suggested Fix:** Add input validation layer:
  - Whitelist phase number format
  - Sanitize file paths (prevent `../`)
  - Validate all flags before use

### VERSION File Out of Sync
- **Location:** `VERSION` (contains `0.0.3`), `.claude-plugin/plugin.json` (contains `0.0.3`), `CHANGELOG.md` (latest is `0.0.4`)
- **Description:** VERSION file not updated to match latest CHANGELOG.md entry.
- **Severity:** Low
- **Impact:** Self-update system may report incorrect version. Confusing for users checking version.
- **Suggested Fix:** Update `VERSION` file to `0.0.4` or establish version bump checklist.

### Git Config Mutation Risk
- **Location:** `bin/grd-tools.js` (git commit operations)
- **Description:** Direct `execSync()` calls for git operations without safeguards against destructive commands.
- **Severity:** Low
- **Impact:** While documented safety protocols exist in agent prompts, nothing prevents git config changes or force operations if called incorrectly.
- **Suggested Fix:** Add git operation whitelist in grd-tools.js. Block `git config`, `git push --force`, `git reset --hard` unless explicitly enabled.

## Security Considerations

### No .gitignore File
- **Location:** Root directory
- **Description:** No `.gitignore` file detected in repository root.
- **Severity:** Medium
- **Impact:** Risk of accidentally committing sensitive files (`.env`, credentials, API tokens, `.DS_Store`, `node_modules`, etc.).
- **Suggested Fix:** Add `.gitignore` with standard exclusions:
  ```
  .env
  .env.*
  *.key
  *.pem
  credentials.*
  secrets.*
  .DS_Store
  node_modules/
  grd-local-patches/
  ```

### Command Injection Risk via execSync
- **Location:** `bin/grd-tools.js:119` (`execSync` import from `child_process`)
- **Description:** Uses `execSync()` for git operations with string concatenation. User input could be interpolated into shell commands.
- **Severity:** Medium
- **Impact:** If user-controlled phase names or paths are passed to git commands without escaping, shell injection is possible.
- **Suggested Fix:** Migrate to `execFileNoThrow()` pattern (as suggested by security hook) or use `execFileSync()` with argument arrays instead of shell strings.

### Environment Variable Usage Without Validation
- **Location:** `bin/grd-tools.js:2234` (`process.env.HOME`)
- **Description:** `process.env.HOME` used for path expansion without null check.
- **Severity:** Low
- **Impact:** Could crash if `HOME` is undefined (rare, but possible in containerized environments).
- **Suggested Fix:** Add fallback or validation: `const home = process.env.HOME || '/tmp'`

### Deprecated GitHub Integration Config
- **Location:** `.planning/config.json` (`github_integration` field)
- **Description:** Config contains deprecated `github_integration` section. CHANGELOG.md indicates it was replaced by `tracker` section in v0.0.2.
- **Severity:** Low
- **Impact:** Config migration may not have completed. Could cause confusion or errors in tracker sync.
- **Suggested Fix:** Remove `github_integration` from config.json or add migration warning in grd-tools.js.

## Performance Risks

### Large Excalidraw Diagrams in Repo
- **Location:** `GRD-Workflow.excalidraw.md` (3195 lines), `GRD-Hierarchy.excalidraw.md` (2420 lines), `GRD-Dataflow.excalidraw.md` (1765 lines)
- **Description:** Untracked Excalidraw markdown files containing embedded diagrams total ~7400 lines.
- **Severity:** Low
- **Impact:** Inflates repo size, slows git operations, may not need to be versioned.
- **Suggested Fix:** Add `*.excalidraw.md` to `.gitignore` or move to separate docs directory if needed for reference.

### No Dependency Lock
- **Location:** Root directory
- **Description:** No `package.json` or `package-lock.json` detected. Node.js code uses only built-in modules (`fs`, `path`, `crypto`, `child_process`).
- **Severity:** Very Low
- **Impact:** None currently — all dependencies are Node.js built-ins. If external deps added later, version drift could occur.
- **Suggested Fix:** Add `package.json` with Node.js version requirement if distributing standalone.

## Missing Infrastructure

### No Automated Tests
- **Location:** Entire codebase
- **Description:** No test files detected (`.test.js`, `.spec.js`, `test_*.js`, `pytest.ini`, `jest.config.*`).
- **Severity:** High
- **Impact:** 5632-line CLI tool with complex state management has no automated tests. High regression risk on changes.
- **Priority:** High
- **Suggested Fix:** Add test suite:
  - Unit tests for `grd-tools.js` core functions (frontmatter, phase parsing, state updates)
  - Integration tests for CLI commands with fixture `.planning/` directories
  - Use Jest or Vitest for JavaScript testing

### No CI/CD Pipeline
- **Location:** `.github/workflows/` (missing)
- **Description:** No GitHub Actions workflows detected.
- **Severity:** Medium
- **Impact:** No automated testing, linting, or release validation.
- **Priority:** Medium
- **Suggested Fix:** Add basic GitHub Actions workflow:
  - Run tests on PR
  - Validate manifest integrity
  - Check version file consistency

### No Linting Configuration
- **Location:** Root directory
- **Description:** No ESLint, Prettier, or other linting config detected.
- **Severity:** Low
- **Impact:** Inconsistent code style, potential bugs from unused vars or missing returns.
- **Priority:** Low
- **Suggested Fix:** Add `.eslintrc.json` with Node.js best practices config.

### No EditorConfig
- **Location:** Root directory
- **Description:** No `.editorconfig` file for consistent formatting across editors.
- **Severity:** Very Low
- **Impact:** Minor — indentation/whitespace inconsistencies for contributors.
- **Priority:** Low

## Improvement Opportunities

### Extract Shared Utilities
- **Location:** `bin/grd-tools.js` (functions like `normalizePhaseName`, `extractFrontmatter`, `readVersion`)
- **Benefit:** Reusable utilities across GRD ecosystem. Easier to test in isolation.
- **Effort:** Low
- **Approach:** Create `lib/utils.js` and export common helpers.

### Add Command Help/Documentation in CLI
- **Location:** `bin/grd-tools.js`
- **Benefit:** Better developer experience. Currently relies on massive header comment.
- **Effort:** Low
- **Approach:** Add `--help` flag handler that prints usage for each subcommand.

### Modularize Template System
- **Location:** `templates/` directory (41 markdown files)
- **Benefit:** Templates could be programmatically loaded and validated. Enable custom template directories.
- **Effort:** Medium
- **Approach:** Create `lib/templates.js` with `loadTemplate(name)`, `fillTemplate(name, data)`, `validateTemplate(content, schema)`.

### Add JSON Schema Validation for Configs
- **Location:** `.planning/config.json`, `grd-file-manifest.json`
- **Benefit:** Catch config errors early, provide better error messages, enable IDE autocomplete.
- **Effort:** Medium
- **Approach:** Add JSON Schema files in `schemas/` directory. Use Ajv for validation.

### Implement Watch Mode for Development
- **Location:** New feature
- **Benefit:** Auto-reload on config changes, helpful for template/agent development.
- **Effort:** Medium
- **Approach:** Add `grd-tools.js watch` command using `fs.watch()` or chokidar.

### CLI Output Formatting
- **Location:** `bin/grd-tools.js` (JSON output with `--raw` flag)
- **Benefit:** Current JSON output is functional but not human-friendly. Add pretty-print mode.
- **Effort:** Low
- **Approach:** Add `--format json|table|yaml` flag, use libraries like `cli-table3` or `yaml`.

### Dependency Audit System
- **Location:** New feature
- **Benefit:** Track Node.js version requirements, warn on unsupported versions.
- **Effort:** Low
- **Approach:** Add `engines` field to future `package.json`. Check `process.version` in grd-tools.js.

## TODOs Found in Code

**None** — No TODO, FIXME, HACK, or XXX comments found in source code (`bin/*.js`).

Note: Template and documentation files contain TODO references for demonstration purposes, but no actual implementation TODOs exist.

---

*Concerns audit: 2026-02-12*
