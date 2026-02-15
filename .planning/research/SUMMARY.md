# Research Summary: Multi AI-Backend Detection & Model Selection

**Domain:** Cross-platform AI coding CLI plugin adaptation
**Researched:** 2026-02-16
**Overall confidence:** MEDIUM

## Executive Summary

GRD currently operates exclusively within Claude Code, using its `Task()` API with `subagent_type` and `model` parameters, `${CLAUDE_PLUGIN_ROOT}` for file references, and abstract model names (opus/sonnet/haiku) resolved from a MODEL_PROFILES table. The target is to make GRD work across four backends: Claude Code, OpenAI Codex CLI, Google Gemini CLI, and OpenCode.

Each backend has a fundamentally different architecture for extensibility. Claude Code uses a plugin system with `plugin.json`, command markdown files, and agent markdown files with YAML frontmatter. Codex CLI uses a skills system with `SKILL.md` files and `config.toml`. Gemini CLI uses an extensions system with `gemini-extension.json`, agents in `.gemini/agents/`, and `settings.json`. OpenCode uses a plugin/agent system with `opencode.json` config and agent markdown files in `.opencode/agents/`. The good news: all four converge on markdown-with-YAML-frontmatter for agent definitions, and all support some form of sub-agent spawning.

Runtime detection is feasible for all four backends using environment variables: Claude Code sets `CLAUDE_CODE_*` variables, Codex sets `CODEX_HOME` and `CODEX_THREAD_ID`, Gemini CLI sets `GEMINI_*` variables, and OpenCode sets `OPENCODE` and `AGENT` variables. The recommended approach is an environment-based detection waterfall in `grd-tools.js` that identifies the active backend and maps abstract model tiers (opus/sonnet/haiku) to backend-specific model names.

The critical architectural insight is that GRD's core value (file-based workflow state in `.planning/`) is backend-agnostic. The `bin/grd-tools.js` CLI is pure Node.js with zero external deps -- it runs identically everywhere. The backend-specific layer is thin: (1) environment detection, (2) model name mapping, and (3) command/agent file format adaptation. This separation means the migration is primarily a configuration/adapter problem, not a rewrite.

## Key Findings

**Stack:** Node.js CLI (`grd-tools.js`) stays unchanged. Add a `lib/backend.js` module for detection + model mapping. Generate backend-specific agent/command files from shared templates.
**Architecture:** Three-layer adapter pattern: Detection -> Model Resolution -> Agent Format. Core business logic untouched.
**Research landscape:** All four backends are converging on similar patterns (markdown agents, MCP integration, YAML frontmatter). Oh-My-OpenCode already demonstrates a Claude Code compatibility layer for OpenCode.
**Critical pitfall:** Sub-agent spawning APIs are fundamentally different. Claude Code uses `Task()` in-process. Codex uses `codex exec --profile`. Gemini CLI exposes agents as callable tools. OpenCode uses `@mention` or automatic delegation. GRD command files cannot be shared verbatim -- they need backend-specific orchestration layers.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Backend Detection & Model Resolution** - Foundation phase
   - Addresses: Runtime detection, model name mapping, config schema extension
   - Avoids: Premature agent format work (detection must come first)
   - Rationale: Everything else depends on knowing which backend is running

2. **Agent/Command Format Adaptation** - Format translation phase
   - Addresses: Converting GRD command markdown to backend-specific formats
   - Avoids: Writing N copies of each command (use template/generation approach)
   - Rationale: Commands are the user-facing interface; they must work natively in each backend

3. **Sub-Agent Spawning Abstraction** - The hard problem
   - Addresses: Translating Task() calls to codex exec, Gemini tool delegation, OpenCode @mention
   - Avoids: Trying to make one orchestration format work everywhere
   - Rationale: This is where backends diverge most; needs per-backend orchestrator adapters

4. **Integration Testing & Cross-Backend Validation** - Verification phase
   - Addresses: End-to-end workflows on each backend
   - Avoids: Assuming detection + mapping + format = working system
   - Rationale: Combinatorial complexity requires dedicated validation

**Phase ordering rationale:**
- Detection (Phase 1) is a dependency for everything else
- Format adaptation (Phase 2) can be validated independently per backend
- Spawning abstraction (Phase 3) is the riskiest and needs detection + format in place
- Integration testing (Phase 4) validates the full stack

**Research flags for phases:**
- Phase 3: Likely needs deeper research -- sub-agent spawning varies widely and Codex/Gemini APIs are still evolving
- Phase 1: Standard pattern, unlikely to need additional research

**Integration phase needed:** Yes -- cross-backend compatibility is inherently an integration problem

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Node.js CLI is backend-agnostic by design |
| Features | MEDIUM | Backend APIs still evolving (especially Codex skills, Gemini sub-agents) |
| Architecture | HIGH | Adapter pattern is well-established for this class of problem |
| Research Landscape | MEDIUM | Oh-My-OpenCode validates the approach; Codex sub-agents still experimental |
| Pitfalls | HIGH | Sub-agent spawning divergence is the known hard problem |

## Gaps to Address

- Codex CLI's skills system is still evolving rapidly; verify SKILL.md format stability
- Gemini CLI sub-agents are marked "experimental"; verify stability before investing
- OpenCode's `OPENCODE` environment variable was merged in PR #1780 but exact value needs runtime verification
- Claude Code's `CLAUDE_PLUGIN_ROOT` has known issues in command markdown files (GitHub issue #9354)
- None of the backends have a stable "plugin marketplace" for GRD distribution yet
