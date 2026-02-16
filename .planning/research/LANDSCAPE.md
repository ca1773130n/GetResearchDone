# Research Landscape: AI Coding CLI Multi-Backend Adaptation

**Domain:** Cross-platform plugin/extension systems for AI coding CLI tools
**Researched:** 2026-02-16
**Overall confidence:** MEDIUM

## Field Overview

The AI coding CLI landscape as of February 2026 is dominated by four tools: Anthropic's Claude Code, OpenAI's Codex CLI, Google's Gemini CLI, and the open-source OpenCode. Each has evolved its own extensibility architecture independently, but strong convergence patterns are emerging.

All four tools now support: (1) markdown-based agent/skill definitions with YAML frontmatter, (2) Model Context Protocol (MCP) for tool integration, (3) some form of sub-agent or task delegation, and (4) hierarchical configuration (global -> project -> session). The convergence on MCP is particularly notable -- it provides a universal tool integration layer that works across all backends.

The key divergence is in orchestration. Claude Code has the most mature sub-agent system with native `Task()` calls, model selection, and Agent Teams. Codex CLI takes a process-isolation approach with `codex exec`. Gemini CLI's sub-agents are experimental but leverage its built-in model routing (Auto, Pro, Flash). OpenCode's plugin system is the most flexible, with 41 lifecycle hooks and explicit multi-model support, but requires plugins (like oh-my-opencode) for sophisticated orchestration.

The "cross-backend plugin" problem is new. Oh-My-OpenCode is the only production example of a Claude Code compatibility layer for another backend. No equivalent exists for Codex or Gemini. The LiteLLM/Vercel AI SDK patterns for model abstraction in web applications provide useful architectural precedent, but they solve a different problem (API-level abstraction vs CLI tool adaptation).

## Key Approaches

### Approach 1: Native Plugin Per Backend
**Pattern:** Write separate plugin implementations for each backend, sharing only file-based state (.planning/).
**Used by:** Most plugins today (single-backend)
**Pros:** Native UX per backend, no abstraction overhead
**Cons:** N x maintenance cost, feature drift between backends
**Applicability to GRD:** Not recommended -- GRD has 43 commands and 18 agent types; maintaining 4 copies is unsustainable

### Approach 2: Compatibility Layer (Oh-My-OpenCode Pattern)
**Project:** oh-my-opencode (https://github.com/code-yeongyu/oh-my-opencode)
**Key idea:** Load Claude Code format files (`.claude/agents/`, hooks, commands) from within OpenCode via a compatibility adapter
**Implementation:** OpenCode plugin with 41 hooks that intercept lifecycle events and translate Claude Code conventions
**Pros:** Write once in Claude Code format, run on OpenCode
**Cons:** Only works Claude -> OpenCode direction; requires oh-my-opencode installed; compatibility is best-effort
**Applicability to GRD:** Useful for OpenCode specifically, but doesn't solve Codex or Gemini

### Approach 3: Generation/Adapter Pattern
**Pattern:** Maintain one canonical definition (GRD's own format) and generate backend-specific files at setup time
**Used by:** cc2all (the tool already syncing CLAUDE.md to GEMINI.md and AGENTS.md in the GRD repo)
**Pros:** Single source of truth; native files per backend; no runtime translation overhead
**Cons:** Generated files can drift if not re-synced; adds setup step
**Applicability to GRD:** Recommended approach. Already partially implemented (GEMINI.md sync).

### Approach 4: Universal Agent Protocol
**Pattern:** Define a universal agent format that all backends understand
**Used by:** Hypothetical; no production implementation exists
**Pros:** Write once, run anywhere
**Cons:** Lowest common denominator; each backend has unique features that would be lost
**Applicability to GRD:** Not viable -- backends have no shared agent protocol

### Approach 5: MCP-Based Orchestration
**Pattern:** Implement GRD as an MCP server; each backend connects via MCP
**Used by:** codex-subagents-mcp (https://github.com/leonardsellem/codex-subagents-mcp)
**Key idea:** Expose GRD operations as MCP tools callable from any backend
**Pros:** Universal integration point; MCP supported by all 4 backends
**Cons:** MCP is for tool integration, not orchestration; cannot express multi-step workflows or sub-agent spawning through MCP alone
**Applicability to GRD:** Useful as supplement (expose grd-tools.js as MCP server) but insufficient as primary approach

## Comparison Matrix

| Approach | Maintenance | Native UX | Orchestration | Maturity | Applicability |
|----------|-------------|-----------|---------------|----------|---------------|
| Native per backend | 4x | Excellent | Native | High | Poor for GRD scale |
| Compatibility layer | 1x (source) + adapter | Good (via compat) | Translated | Medium (OpenCode only) | Partial |
| Generation/Adapter | 1x (canonical) + setup | Native | Backend-specific generated | Low (novel) | Best fit |
| Universal protocol | 1x (universal) | Degraded | Lowest common denominator | None (theoretical) | Not viable |
| MCP orchestration | 1x (server) | Via MCP | Limited | Low | Supplementary |

## Per-Backend Detailed Analysis

### Claude Code (Anthropic)
**Maturity:** Production
**Plugin system:** `.claude-plugin/plugin.json` manifest, commands/, agents/
**Sub-agents:** `Task(prompt, subagent_type, model)` -- most mature API
**Agent Teams:** `TeamCreate()`, `TeamTask()` -- parallel team execution
**Model aliases:** opus, sonnet, haiku (short form)
**Detection:** `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_ACTION`, `CLAUDE_CODE_*` env vars
**Key constraint:** `CLAUDE_PLUGIN_ROOT` unreliable in command markdown (issue #9354)
**Distribution:** git clone into plugin directory
**Confidence:** HIGH

### Codex CLI (OpenAI)
**Maturity:** Production (skills stable, profiles stable)
**Plugin system:** Skills (`SKILL.md` + `agents/openai.yaml`), config profiles in `config.toml`
**Sub-agents:** `codex exec --profile <name> "<prompt>"` (process isolation)
**Agent Teams:** Not native; achievable via multiple `codex exec` calls
**Models:** gpt-5.3-codex (flagship), gpt-5.3-codex-spark (fast), gpt-5.2-codex (API)
**Detection:** `CODEX_HOME` env var, `CODEX_THREAD_ID` env var (set since recent update)
**Key constraint:** Skills loaded via metadata scanning; SKILL.md format must be precise
**Distribution:** `$skill-installer` or manual drop into `~/.codex/skills/` or `.agents/skills/`
**Confidence:** MEDIUM (skills stable but sub-agent patterns still evolving)

### Gemini CLI (Google)
**Maturity:** Extensions stable, sub-agents experimental
**Plugin system:** `gemini-extension.json` manifest, commands/, skills/, agents/, hooks/
**Sub-agents:** Agents defined as `.gemini/agents/*.md` with YAML frontmatter; exposed as callable tools
**Agent Teams:** Not supported
**Models:** gemini-3-pro, gemini-3-flash, gemini-2.5-pro, gemini-2.5-flash; Auto routing available
**Detection:** `GEMINI_CLI_HOME`, `GEMINI_API_KEY`, `GEMINI_MODEL` env vars
**Key constraint:** Sub-agents are experimental; `/model` does not override sub-agent models
**Distribution:** `gemini ext install` from npm registry or local path
**Confidence:** MEDIUM (extensions stable; sub-agents LOW confidence)

### OpenCode (Open Source)
**Maturity:** Plugins stable, agents stable
**Plugin system:** JS/TS plugins loaded from `.opencode/plugins/` or npm; 41 lifecycle hooks
**Sub-agents:** Agents in `.opencode/agents/*.md` or JSON config; invoked via `@mention` or automatic delegation
**Agent Teams:** Not native; oh-my-opencode adds multi-model parallel execution
**Models:** provider/model-id format (e.g., `anthropic/claude-sonnet-4-5`); 75+ providers via Models.dev
**Detection:** `OPENCODE` env var (PR #1780 merged Aug 2025); `AGENT` env var
**Key constraint:** Model IDs require provider prefix; most flexible but most complex config
**Distribution:** npm packages or local plugin files
**Confidence:** MEDIUM

## Trends and Directions

- **Rising:** MCP as universal tool integration; markdown+frontmatter as agent definition standard; oh-my-opencode compatibility pattern
- **Declining:** Proprietary plugin formats; backend-locked workflows
- **Emerging:** Cross-backend agent portability (this research); Codex profiles for agent persona; Gemini extension settings system; OpenCode's provider/model standardization via Models.dev

## Recommended Starting Points

Based on the landscape analysis:

1. **Generation/Adapter Pattern** -- Best balance of maintenance cost and native UX. Generate backend-specific files from canonical GRD templates. Already partially proven by cc2all CLAUDE.md -> GEMINI.md sync.

2. **Environment-based detection** -- All backends set identifiable environment variables. A detection waterfall is reliable and requires no user configuration.

3. **MCP as supplement** -- Expose `grd-tools.js` as an MCP server for universal tool access. This doesn't replace command/agent generation but provides a fallback integration path.

## Sources

- Claude Code sub-agents: https://code.claude.com/docs/en/sub-agents
- Claude Code settings (env vars): https://code.claude.com/docs/en/settings
- Claude Code env vars gist: https://gist.github.com/unkn0wncode/f87295d055dd0f0e8082358a0b5cc467
- Codex CLI docs: https://developers.openai.com/codex/cli/
- Codex CLI config reference: https://developers.openai.com/codex/config-reference/
- Codex skills: https://developers.openai.com/codex/skills
- Codex models: https://developers.openai.com/codex/models/
- Codex CLI reference: https://developers.openai.com/codex/cli/reference/
- Codex subagents MCP: https://github.com/leonardsellem/codex-subagents-mcp
- GPT-5.3-Codex-Spark: https://openai.com/index/introducing-gpt-5-3-codex-spark/
- Gemini CLI extensions: https://geminicli.com/docs/extensions/
- Gemini CLI extensions reference: https://geminicli.com/docs/extensions/reference
- Gemini CLI writing extensions: https://geminicli.com/docs/extensions/writing-extensions
- Gemini CLI sub-agents: https://geminicli.com/docs/core/subagents/
- Gemini CLI configuration: https://geminicli.com/docs/get-started/configuration/
- Gemini CLI model selection: https://geminicli.com/docs/cli/model/
- Gemini 3 on CLI: https://geminicli.com/docs/get-started/gemini-3/
- Gemini CLI extensions blog: https://blog.google/innovation-and-ai/technology/developers-tools/gemini-cli-extensions/
- Google Conductor extension: https://developers.googleblog.com/conductor-introducing-context-driven-development-for-gemini-cli/
- OpenCode docs: https://opencode.ai/docs/
- OpenCode plugins: https://opencode.ai/docs/plugins/
- OpenCode agents: https://opencode.ai/docs/agents/
- OpenCode models: https://opencode.ai/docs/models/
- OpenCode providers: https://opencode.ai/docs/providers/
- OpenCode config: https://opencode.ai/docs/config/
- OpenCode OPENCODE env var: https://github.com/sst/opencode/issues/1775
- Oh-My-OpenCode: https://github.com/code-yeongyu/oh-my-opencode
- Oh-My-OpenCode Claude compat: https://deepwiki.com/fractalmind-ai/oh-my-opencode/8.1-claude-code-compatibility
- LiteLLM routing: https://docs.litellm.ai/docs/routing
- Vercel AI SDK 6: https://vercel.com/blog/ai-sdk-6
