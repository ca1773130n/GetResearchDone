# Feature Landscape: Multi AI-Backend Support

**Project:** GRD Multi AI-Backend Support
**Researched:** 2026-02-16

## Table Stakes (Must Have)

### F1: Runtime Backend Detection
Detect which AI coding CLI is running GRD without user configuration.

**Detection signals per backend:**
| Backend | Primary Signal | Secondary Signal | Confidence |
|---------|---------------|-----------------|------------|
| Claude Code | `CLAUDE_CODE_ENTRYPOINT` or `CLAUDE_CODE_*` env vars | `CLAUDE_PLUGIN_ROOT` env var | HIGH |
| Codex CLI | `CODEX_HOME` env var, `CODEX_THREAD_ID` env var | `~/.codex/config.toml` exists | HIGH |
| Gemini CLI | `GEMINI_CLI_HOME` env var, `GEMINI_*` env vars | `.gemini/` directory exists | MEDIUM |
| OpenCode | `OPENCODE` env var (set since PR #1780), `AGENT` env var | `.opencode/` directory, `opencode.json` exists | MEDIUM |

### F2: Abstract Model Resolution
Map GRD's abstract model tiers (opus/sonnet/haiku) to backend-specific model names.

**Requirements:**
- Default mappings for all four backends (sensible out-of-box)
- User-overridable per-backend model mapping in `.planning/config.json`
- `resolve-model` CLI command returns backend-appropriate model name
- Backward compatible: existing Claude Code behavior unchanged when no backend config present

### F3: CLI Tool Compatibility
`bin/grd-tools.js` must work identically across all backends.

**Requirements:**
- All 108 existing CLI commands work unchanged
- New `detect-backend` command outputs detected backend info as JSON
- New `resolve-model` enhancement: include backend in resolution
- New `setup` command for backend-specific file generation

### F4: Command File Adaptation
GRD command markdown files reference Claude Code-specific constructs (`Task()`, `subagent_type`, `${CLAUDE_PLUGIN_ROOT}`). These must work on each backend.

**Approach options:**
1. **Template generation** (recommended): Maintain one canonical source, generate backend-specific versions
2. **Runtime shim**: Interpret Claude Code format and translate at runtime
3. **N copies**: Maintain separate command files per backend (maintenance nightmare)

### F5: Agent Definition Portability
GRD defines 18+ agent types. Each backend has its own agent definition format.

**Format comparison:**

| Aspect | Claude Code | Codex CLI | Gemini CLI | OpenCode |
|--------|-------------|-----------|------------|----------|
| File location | `.claude/agents/*.md` | `~/.codex/skills/*/SKILL.md` | `.gemini/agents/*.md` | `.opencode/agents/*.md` |
| Config format | YAML frontmatter | YAML frontmatter | YAML frontmatter | YAML frontmatter or JSON |
| Model field | `model: sonnet` | N/A (profile-based) | `model: gemini-3-pro` | `model: provider/model-id` |
| Tools field | `tools: Read, Grep, Bash` | Via skill instructions | `tools: [read_file, grep_search]` | `tools: {...}` |
| System prompt | Markdown body | Markdown body after `---` | Markdown body | Markdown body |

## Differentiators (Should Have)

### F6: Backend-Aware Orchestration
Translate GRD's wave-based parallel execution to each backend's sub-agent spawning mechanism.

| Backend | Spawning Mechanism | Parallelism | Notes |
|---------|-------------------|-------------|-------|
| Claude Code | `Task(prompt, subagent_type, model)` | Native parallel Tasks | Best supported; current implementation |
| Codex CLI | `codex exec --profile <name> "<prompt>"` | External process spawning | Each exec is isolated; uses config.toml profiles |
| Gemini CLI | Agents exposed as callable tools; main agent delegates | Experimental; no explicit parallel | Sub-agents are experimental feature |
| OpenCode | `@agent-name` mention or automatic delegation | Via plugin hooks (oh-my-opencode pattern) | Subagents inherit model from parent unless overridden |

### F7: Setup Wizard
Interactive setup command that detects the current backend and generates appropriate config files.

**Generates:**
- Backend-specific agent definitions
- Backend-specific manifest/config files
- Model mapping defaults in `.planning/config.json`

### F8: Cross-Backend Config Sync
When `.planning/config.json` changes (e.g., model profile switch), automatically update backend-specific files.

### F9: Backend Capability Reporting
Report what each backend supports so GRD can gracefully degrade.

| Capability | Claude Code | Codex CLI | Gemini CLI | OpenCode |
|------------|-------------|-----------|------------|----------|
| Sub-agent spawning | Yes | Yes (via exec) | Experimental | Yes |
| Parallel sub-agents | Yes | Yes (process-level) | No | Yes (plugin) |
| Agent Teams | Yes | No | No | No |
| Model per agent | Yes | Via profiles | Yes | Yes |
| MCP integration | Yes | Yes | Yes | Yes |
| Hooks/lifecycle | Yes | No | Yes (limited) | Yes (41 hooks) |
| Background tasks | Yes | Yes (exec) | No | No |

## Anti-Features (Will Not Build)

### X1: Backend-Specific Core Logic
GRD's core lib/ modules must remain backend-agnostic. No `if (backend === 'codex')` in business logic.

### X2: Direct API Calls to AI Providers
GRD does not call OpenAI/Anthropic/Google APIs directly. It delegates to the hosting backend's native model invocation.

### X3: Universal Agent Protocol
Will not attempt to create a single agent format that all backends understand. Each backend has its own format; GRD generates native files.

### X4: Backend-Specific Command Syntax
Users should not need to learn different GRD commands per backend. The command interface stays identical; only the underlying execution mechanism changes.

### X5: Automatic Backend Switching
GRD detects the backend once at startup. It does not support switching backends mid-session or routing tasks to different backends simultaneously.

## Feature Priority Matrix

| Feature | Priority | Complexity | Backend Dependency |
|---------|----------|------------|-------------------|
| F1: Detection | P0 | Low | None (foundation) |
| F2: Model Resolution | P0 | Low | F1 |
| F3: CLI Compatibility | P0 | Low | F1 |
| F4: Command Adaptation | P1 | Medium | F1, F2 |
| F5: Agent Portability | P1 | Medium | F1, F2 |
| F6: Orchestration | P2 | High | F1, F2, F4, F5 |
| F7: Setup Wizard | P1 | Medium | F1 |
| F8: Config Sync | P2 | Low | F7 |
| F9: Capability Report | P2 | Low | F1 |
