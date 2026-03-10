# State

**Updated:** 2026-03-11

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.
**Current focus:** v0.3.7 Claude Code Feature Sync — adopt effort levels, new hooks, ExitWorktree, SKILL_DIR, cron awareness
**Previous:** v0.3.6 Backend Ecosystem Sync (shipped 2026-03-11)

## Current Position

- **Active phase:** Not started (defining requirements)
- **Current plan:** N/A
- **Milestone:** v0.3.7 Claude Code Feature Sync
- **Status:** Requirements definition
- **Progress:** [░░░░░░░░░░] 0%
- **Next:** Define requirements and create roadmap

## Phase Summary

(No phases yet — milestone being defined)

## Shipped Milestones (v0.3.x series)

| Version | Name | Status |
|---------|------|--------|
| v0.3.0 | TypeScript Migration & Refactoring | Shipped (Phases 58-68, 44 plans) |
| v0.3.1 | Node v22 Compatibility Fix | Shipped (bugfix) |
| v0.3.2 | Autopilot & Evolve Fixes | Shipped (bugfix) |
| v0.3.3 | Evolve Dynamic Scanning & Dashboard Fix | Shipped (bugfix + feature) |
| v0.3.4 | Evolve Auto-Commit & PR Creation | Shipped (feature) |
| v0.3.5 | Evolve Stabilization & Product Ideation | Shipped (feature) |
| v0.3.6 | Backend Ecosystem Sync | Shipped (Phases 69-70, 4 plans) |

## Deferred Validations

| ID | Description | From Phase | Validates At | Status |
|----|-------------|-----------|-------------|--------|
| DEFER-08-01 | User acceptance testing of TUI dashboard commands | Phase 8 | post-v1.0 | PENDING |
| DEFER-30-01 | Full parallel execution with real teammate spawning on Claude Code | Phase 30 | Future | PARTIALLY RESOLVED |
| DEFER-43-01 | Live code-reviewer does not block on missing VERIFICATION.md | Phase 43 | Live run | PENDING |
| DEFER-43-02 | detectWebMcp() returns available:true with real MCP env | Phase 43 | Live MCP env | PENDING |
| DEFER-44-01 | execute-phase WebMCP health checks fire correctly at runtime | Phase 44 | Live MCP env | PENDING |
| DEFER-44-02 | grd-verifier populates VERIFICATION.md WebMCP section | Phase 44 | Live MCP env | PENDING |
| DEFER-44-03 | grd-eval-planner generates useWebMcpTool() for frontend phases | Phase 44 | Live MCP env | PENDING |
| DEFER-54-01 | Markdown splitting produces correct partials for real-world large files | Phase 54 | Future | CANNOT VALIDATE |
| DEFER-56-01 | Full evolve loop with sonnet-tier models produces meaningful improvements | Phase 56 | Future | PARTIALLY RESOLVED |
| DEFER-58-01 | Strict mode compatibility with full codebase | Phase 58 | Phase 65 | RESOLVED -- tsc --noEmit with strict:true passes across all lib/ and bin/ .ts files |
| DEFER-59-01 | CommonJS interop validated with all downstream consumers | Phase 59 | Phase 65 | RESOLVED -- All 23 CJS proxy .js files load via plain Node require() |
| DEFER-61-01 | Runtime CJS interop for 6 Phase 61 modules under plain node (no ts-jest) | Phase 61 | Phase 65 | RESOLVED -- All 6 Phase 61 modules load via .js proxy under plain Node |
| DEFER-61-02 | Real subprocess execution: gh CLI (tracker.ts), git (worktree.ts), claude CLI (autopilot.ts) typed interfaces validated | Phase 61 | Phase 65 | RESOLVED -- typed parameters and return values verified via function signature checks |
| DEFER-61-03 | Evolve loop EVOLVE-STATE.json schema round-trip against TypeScript interfaces | Phase 61 | Phase 65 | RESOLVED -- write/read round-trip validated through TypeScript interface |
| DEFER-62-01 | Barrel re-export backward compatibility under real CLI/MCP invocation | Phase 62 | Phase 65 | RESOLVED -- commands.js, context.js, evolve.js barrel re-exports verified (30+/40+/25+ functions) |
| DEFER-63-01 | Plugin manifest compatibility with dist/ paths under Claude Code runtime | Phase 63 | Phase 65 | RESOLVED -- plugin.json SessionStart fires via CJS proxy; dist/ build functional |
| DEFER-68-01 | Real Claude subprocess produces product-level feature ideas (discoverProductIdeationItems against live GRD codebase) | Phase 68 | Next real grd:evolve run | PENDING |
| DEFER-68-02 | Autoplan creates feature-oriented phases from product-ideation groups in real end-to-end cycle | Phase 68 | First real infinite evolve cycle post-phase-68 | PENDING |

## Performance Metrics

**Cumulative:**
- Milestones shipped: 24 (v0.0.5 through v0.3.6)
- Total tests: ~2,850
- Total lib/ modules: 25 (22 top-level .ts + 3 decomposed sub-module directories)
- Total commands: 40
- Total lib/ LOC: ~20,320

## Decisions

- **[58-01]** Dual tsconfig pattern: tsconfig.json for type-checking (noEmit:true), tsconfig.build.json for dist/ output (noEmit:false)
- **[58-01]** allowJs:true with checkJs:false enables incremental .js-to-.ts migration without breaking existing code
- **[58-01]** ES2022 target matching existing eslint ecmaVersion 2022
- **[58-02]** typescript-eslint unified package for flat config API (v8+ recommended approach)
- **[58-02]** Dual rule pattern: base no-unused-vars off for .ts, replaced by @typescript-eslint/no-unused-vars
- **[58-02]** no-require-imports disabled for CommonJS compatibility during migration
- **[58-02]** projectService:true for type-aware linting (v8+ recommended over project option)
- **[58-03]** ts-jest transform only for .ts files -- .js files remain untransformed via native CommonJS require()
- **[58-03]** Exclude .d.ts from coverage collection (type declarations, not executable code)
- **[58-03]** Per-file coverage thresholds extended for .ts modules alongside existing .js thresholds
- **[59-01]** Kept paths.js as thin CommonJS proxy instead of deleting -- Node.js CJS require() needs .js for extensionless resolution
- **[59-01]** import type for Node built-in types (e.g. Dirent from fs) when using CommonJS require() in .ts files
- **[59-01]** Pure type module pattern: module.exports = {} + export type/interface for dual JS/TS compatibility
- **[59-02]** Kept backend.js as thin CommonJS proxy (same pattern as paths.js) -- consistent DEFER-59-01 approach
- **[59-02]** Internal interfaces (DetectedModels, ModelCacheEntry) for cache types instead of inline annotations
- **[59-02]** Explicit 'as BackendId' narrowing after includes() guard -- TS cannot narrow via Array.includes()
- **[59-02]** Record<string, unknown> with nested type casts for raw config parsing -- avoids any
- **[59-03]** Kept utils.js as thin CommonJS proxy (consistent with paths.js, backend.js) -- required for runtime CJS resolution
- **[59-03]** Record<string, unknown> with explicit type casts for loadConfig JSON parsing -- avoids any
- **[59-03]** Typed error destructuring (err as { status?: number }) in execGit catch -- avoids any for non-standard Error properties
- **[59-03]** never return type for output() and error() functions that call process.exit()
- [Phase 69]: Gemini models updated: gemini-3-pro->3.1-pro, gemini-2.5-flash->3.1-flash-lite; Codex opus->gpt-5.4; OpenCode->claude-4-6; Gemini subagents GA+parallel; Codex hooks+teams enabled
- [Phase 69]: Phase 69 deferred: D1=Gemini CLI live model acceptance (gemini-3.1-pro, gemini-3.1-flash-lite), D2=Codex CLI gpt-5.4 acceptance, D3=OpenCode claude-opus-4-6/claude-sonnet-4-6 acceptance — manual CLI verification required
- **[70-01]** Phase 69 added no deprecation/migration code; deprecated model tests documented as N/A
- **[70-01]** worktree-parallel-e2e sequential fallback test switched from codex to gemini (codex now has teams:true)
- **[70-02]** CODEX_THREAD_ID kept for backward compat despite possible deprecation
- **[70-02]** OPENCODE_PID excluded from detection (process management var, not presence indicator)
- **[70-02]** CLAUDE.md confirmed clean — agent profiles use abstract tiers, no stale model names

## Known Bugs

None.

## Blockers

None.

## Session Continuity

- **Last action:** Started v0.3.7 milestone definition
- **Stopped at:** Defining requirements
- **Next action:** Create REQUIREMENTS.md and ROADMAP.md
- **Context needed:** Claude Code changelog v2.1.50-v2.1.72 researched; key features identified

## Accumulated Context

### v0.3.x Release History
- v0.3.0: Full TypeScript migration (Phases 58-68, 44 plans)
- v0.3.1: Node v22 compat — replaced `require() as {}` with destructuring annotations
- v0.3.2: Node v22 compat, autopilot nested session crash fix, phase sort order fix
- v0.3.3: Evolve outcome matching fix, autopilot env var stripping, dynamic dir scanning, dashboard fallback
- v0.3.4: Evolve auto-commit, PR creation, iteration feedback
- v0.3.5: Evolve real code enforcement, product-ideation filtering, batch size cap, saturated dim skipping, history dedup
- v0.3.6: Backend ecosystem sync — model mappings, capability flags, OpenCode status

### Claude Code Features Research (v2.1.50-v2.1.72)
- Effort levels: low/medium/high (v2.1.68/72), Opus 4.6 defaults medium, "ultrathink" for high
- HTTP hooks: POST JSON to URL (v2.1.63)
- New hook events: InstructionsLoaded, TeammateIdle/TaskCompleted with stop control (v2.1.69)
- agent_id/agent_type in hook events (v2.1.69)
- ${CLAUDE_SKILL_DIR} variable for skill self-reference (v2.1.69)
- ExitWorktree tool (v2.1.72)
- Auto-memory with /memory (v2.1.59)
- Cron/loop scheduling (v2.1.71)
- Project configs shared across worktrees (v2.1.63)
- /reload-plugins command (v2.1.69)
- Agent model parameter restored per-invocation (v2.1.72)

### Evolve Iterations
- 73 total evolve iterations run through v0.3.5
- Product ideation todo backlog: 857+ items
- All 5 code-quality dimensions fully saturated

---

*State managed by: Claude (grd-roadmapper)*
*Last updated: 2026-03-11*
