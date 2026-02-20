# Technology Stack

**Project:** GRD Multi AI-Backend Support
**Researched:** 2026-02-16

## Recommended Stack

### Core (unchanged)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 18/20/22 | CLI runtime | Already tested across matrix; zero-dep constraint preserved |
| `bin/grd-tools.js` | existing | Deterministic CLI operations | Backend-agnostic by design; pure fs/path/child_process |
| Jest | existing | Test framework | Already 594 tests; add backend-specific test fixtures |

### New Modules
| Module | Purpose | Why |
|--------|---------|-----|
| `lib/backend.js` | Backend detection + model mapping | Single responsibility; isolates all backend-specific logic |
| `lib/adapter.js` | Agent/command format generation | Translates GRD's internal format to backend-specific files |

### Backend-Specific Config Files
| File | Backend | Purpose |
|------|---------|---------|
| `.claude-plugin/plugin.json` | Claude Code | Plugin manifest (existing) |
| `SKILL.md` + `agents/openai.yaml` | Codex CLI | Skill manifest for Codex discovery |
| `gemini-extension.json` | Gemini CLI | Extension manifest for Gemini CLI |
| `opencode.json` (plugin section) | OpenCode | Plugin registration for OpenCode |

### Supporting Infrastructure
| Technology | Purpose | When to Use |
|------------|---------|-------------|
| `config.toml` | Codex CLI config | Generated during Codex setup, not manually edited |
| `.gemini/agents/*.md` | Gemini sub-agents | Generated from GRD agent templates |
| `.opencode/agents/*.md` | OpenCode sub-agents | Generated from GRD agent templates |
| `.claude/agents/*.md` | Claude Code sub-agents | Generated from GRD agent templates |

## Model Name Mapping

The core challenge: each backend uses different model identifiers for equivalent capability tiers.

### GRD Abstract Tiers -> Backend Model Names

| GRD Tier | Claude Code | Codex CLI | Gemini CLI | OpenCode |
|----------|-------------|-----------|------------|----------|
| `opus` | `opus` | `gpt-5.3-codex` | `gemini-3-pro` | `anthropic/claude-opus-4-5` or `openai/gpt-5.3-codex` |
| `sonnet` | `sonnet` | `gpt-5.3-codex-spark` | `gemini-3-flash` | `anthropic/claude-sonnet-4-5` or `openai/gpt-5.3-codex-spark` |
| `haiku` | `haiku` | `gpt-5.3-codex-spark` | `gemini-2.5-flash` | Provider-dependent (cheapest available) |

**Notes:**
- Claude Code uses short aliases (opus, sonnet, haiku) natively
- Codex CLI uses full model names (gpt-5.3-codex); Codex-Spark is the "sonnet" tier
- Gemini CLI uses model names set via /model command or settings.json
- OpenCode uses provider/model-id format and supports all providers

### Model Mapping Configuration

Stored in `.planning/config.json` with backend overrides:

```json
{
  "model_profile": "balanced",
  "backend_models": {
    "claude": { "opus": "opus", "sonnet": "sonnet", "haiku": "haiku" },
    "codex": { "opus": "gpt-5.3-codex", "sonnet": "gpt-5.3-codex-spark", "haiku": "gpt-5.3-codex-spark" },
    "gemini": { "opus": "gemini-3-pro", "sonnet": "gemini-3-flash", "haiku": "gemini-2.5-flash" },
    "opencode": { "opus": "anthropic/claude-opus-4-5", "sonnet": "anthropic/claude-sonnet-4-5", "haiku": "anthropic/claude-haiku-4-5" }
  }
}
```

User can override any mapping. Defaults are sensible for each backend.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Detection | Environment variables | Config file declaration | Env vars are automatic; config requires manual setup |
| Model mapping | Config-driven with defaults | Hardcoded mapping table | Users need to override when new models launch |
| Agent format | Generate from templates | Shared markdown interpreted by shim | Each backend parses differently; native format is more reliable |
| Distribution | Git clone + setup script | npm package | Project constraint: no npm publish; git clone is current model |
| Sub-agent abstraction | Per-backend adapter | Universal agent protocol | No standard exists; adapters are the pragmatic choice |

## Installation

```bash
# GRD core (unchanged)
git clone <repo> && cd GetResearchDone
npm install  # dev deps only (jest, eslint)

# Backend-specific setup (run once per backend)
node bin/grd-tools.js setup --backend codex    # generates .codex/skills/grd/SKILL.md
node bin/grd-tools.js setup --backend gemini   # generates gemini-extension.json + .gemini/agents/
node bin/grd-tools.js setup --backend opencode # generates opencode.json plugin entry + .opencode/agents/
node bin/grd-tools.js setup --backend claude   # already configured via .claude-plugin/
```

## Sources

- Claude Code sub-agents docs: https://code.claude.com/docs/en/sub-agents
- Codex CLI skills: https://developers.openai.com/codex/skills
- Codex CLI config: https://developers.openai.com/codex/config-reference/
- Codex models: https://developers.openai.com/codex/models/
- Gemini CLI extensions: https://geminicli.com/docs/extensions/
- Gemini CLI sub-agents: https://geminicli.com/docs/core/subagents/
- Gemini CLI configuration: https://geminicli.com/docs/get-started/configuration/
- OpenCode plugins: https://opencode.ai/docs/plugins/
- OpenCode agents: https://opencode.ai/docs/agents/
- OpenCode models: https://opencode.ai/docs/models/
- Oh-My-OpenCode compatibility: https://deepwiki.com/fractalmind-ai/oh-my-opencode/8.1-claude-code-compatibility
