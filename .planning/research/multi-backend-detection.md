# Multi-Backend Detection & Model Selection: Detailed Analysis

**Topic:** Runtime detection and adaptation for AI coding CLI tools
**Researched:** 2026-02-16
**Confidence:** MEDIUM (all backends verified via official docs; some env vars need runtime confirmation)

---

## 1. Per-Backend Analysis

### 1.1 Claude Code (Anthropic)

#### Plugin Loading
- **Manifest:** `.claude-plugin/plugin.json` in plugin root
- **Commands:** `commands/*.md` files -- markdown with process tags
- **Agents:** `.claude/agents/*.md` or `~/.claude/agents/*.md` -- markdown with YAML frontmatter
- **Skills:** `.claude/skills/` -- separate concept from agents
- **Discovery:** Claude Code scans plugin directories at session start; agents loaded at session start
- **Hook system:** `SessionStart`, `PreToolUse`, `PostToolUse`, `SubagentStart`, `SubagentStop`, `Stop`

#### Model Names
| Alias | Full Model | Tier |
|-------|-----------|------|
| `opus` | claude-opus-4-6 (current frontier) | Highest capability |
| `sonnet` | claude-sonnet-4-5 | Balanced |
| `haiku` | claude-haiku-4-5 | Fast/cheap |

Model specified in agent frontmatter: `model: sonnet`
Also configurable via `ANTHROPIC_MODEL` env var, `CLAUDE_CODE_SUBAGENT_MODEL` env var.

#### Agent Spawning
```
Task(
  prompt="...",
  subagent_type="grd-executor",
  model="sonnet",
  description="Execute plan 03-01"
)
```
- Subagents run in own context window with custom system prompt
- Cannot spawn sub-subagents (one level only)
- Foreground (blocking) or background (concurrent) execution
- Agent Teams: `TeamCreate()` for parallel multi-agent coordination

#### Environment Variables (Detection Signals)
| Variable | Presence | Notes |
|----------|----------|-------|
| `CLAUDE_CODE_ENTRYPOINT` | Set by Claude Code | Custom entry point identifier |
| `CLAUDE_CODE_ACTION` | Set by Claude Code | "acceptEdits", "plan", "bypassPermissions", "default" |
| `CLAUDE_CODE_ENABLE_TELEMETRY` | Set by Claude Code | Telemetry flag |
| `CLAUDE_CODE_SSE_PORT` | Set by Claude Code | SSE communication port |
| `CLAUDE_PLUGIN_ROOT` | Set for plugins | Plugin installation directory (unreliable in command MD) |
| `CLAUDE_CONFIG_DIR` | Set by Claude Code | Configuration directory |
| `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` | Set by Claude Code | Working directory control |

**Best detection signal:** Check for any `CLAUDE_CODE_*` prefixed environment variable.

#### Configuration
- **Global:** `~/.claude/settings.json`
- **Project:** `.claude/settings.json`
- **Plugin:** `.claude-plugin/plugin.json`
- **Format:** JSON

---

### 1.2 OpenAI Codex CLI

#### Plugin Loading (Skills System)
- **Manifest:** `SKILL.md` (required) + `agents/openai.yaml` (optional) per skill folder
- **Discovery paths:** `.agents/skills/` (project), `~/.agents/skills/` (user), `~/.codex/skills/.system/` (system), `/etc/codex/skills/` (admin)
- **Progressive disclosure:** Codex loads only name + description initially; full SKILL.md loaded when skill activates
- **Activation:** Explicit (`$skill-name`) or implicit (description matches user prompt)
- **Installation:** `$skill-installer` skill, manual directory copy, or `~/.codex/skills/`

#### SKILL.md Format
```yaml
---
name: grd-workflow
description: R&D workflow automation with paper-driven development and tiered evaluation.
---

[Instructions for Codex to follow when this skill is active]
```

#### agents/openai.yaml Format
```yaml
interface:
  display_name: "GRD Workflow"
  short_description: "R&D workflow automation"
  icon_small: "./assets/icon.svg"
  brand_color: "#3B82F6"
  default_prompt: "Use GRD to manage this research project"

policy:
  allow_implicit_invocation: true

dependencies:
  tools:
    - type: "mcp"
      value: "grd-tools"
      description: "GRD CLI tools"
      transport: "stdio"
      command: "node"
      args: ["bin/grd-tools.js", "mcp-server"]
```

#### Model Names
| Model | Tier | Availability |
|-------|------|-------------|
| `gpt-5.3-codex` | Flagship (opus tier) | CLI, App, IDE, Cloud |
| `gpt-5.3-codex-spark` | Fast (sonnet tier) | ChatGPT Pro users, CLI preview |
| `gpt-5.2-codex` | Previous gen | API workflows |
| `gpt-5.2` | General | API |
| `gpt-5.1-codex-max` | Extended thinking | API |

Model specified via: `--model gpt-5.3-codex` flag, `config.toml` `model` key, or `review_model` for review.

#### Agent Spawning
```bash
# Via codex exec (primary sub-agent mechanism)
codex exec --model gpt-5.3-codex --profile grd-executor "Execute plan 03-01"

# Via codex exec with full-auto
codex exec --full-auto --model gpt-5.3-codex-spark "Quick task description"
```
- Each `codex exec` runs in isolated process
- Profiles load named config variants from `config.toml`
- No native in-process sub-agent spawning
- MCP-based sub-agents possible via codex-subagents-mcp pattern

#### Environment Variables (Detection Signals)
| Variable | Presence | Notes |
|----------|----------|-------|
| `CODEX_HOME` | Always set | Defaults to `~/.codex`; user-configurable |
| `CODEX_THREAD_ID` | Set during execution | Session/thread identifier for scripts and skills |

**Best detection signal:** `CODEX_HOME` (always present), confirmed by `CODEX_THREAD_ID` (present in active sessions).

#### Configuration
- **User:** `~/.codex/config.toml`
- **Project:** `.codex/config.toml`
- **Admin:** `requirements.toml`
- **Format:** TOML
- **Schema:** Available at `https://developers.openai.com/codex/config-schema.json`

---

### 1.3 Google Gemini CLI

#### Plugin Loading (Extensions System)
- **Manifest:** `gemini-extension.json` in extension root
- **Components:** MCP servers, commands/, skills/, agents/, hooks/hooks.json, GEMINI.md
- **Discovery:** Installed via `gemini ext install <path-or-npm-package>`
- **Context file:** Extensions can specify `contextFileName` (default: `GEMINI.md`)
- **Settings:** Extensions can define user-prompted settings via `settings` array in manifest

#### gemini-extension.json Format
```json
{
  "name": "grd-workflow",
  "version": "0.1.0",
  "description": "R&D workflow automation for Gemini CLI",
  "mcpServers": {
    "grd-tools": {
      "command": "node",
      "args": ["${extensionPath}${/}bin${/}grd-tools.js", "mcp-server"],
      "cwd": "${extensionPath}"
    }
  },
  "contextFileName": "GEMINI.md",
  "settings": [
    {
      "name": "model_profile",
      "description": "GRD model profile (quality/balanced/budget)",
      "envVar": "GRD_MODEL_PROFILE"
    }
  ]
}
```

#### Variable Substitution in Manifests
- `${extensionPath}` -- Extension installation directory
- `${workspacePath}` -- Current workspace path
- `${/}` or `${pathSeparator}` -- OS-specific path separator

#### Model Names
| Model | Tier | Routing |
|-------|------|---------|
| `gemini-3-pro` | Flagship (opus tier) | Pro routing, or Auto for complex |
| `gemini-3-flash` | Fast (sonnet tier) | Auto routing for complex |
| `gemini-2.5-pro` | Previous pro | Fallback when Gemini 3 disabled |
| `gemini-2.5-flash` | Budget (haiku tier) | Auto routing for simple |

Model selection: `/model` command, `--model` flag, `settings.json` `model.name`, `GEMINI_MODEL` env var.
**Important:** `/model` does NOT override sub-agent models. Sub-agents use their own `model` field.

#### Agent Spawning (EXPERIMENTAL)
```yaml
# .gemini/agents/grd-executor.md
---
name: grd-executor
description: Executes GRD plans following structured methodology
model: gemini-3-flash
tools: [read_file, write_file, edit_file, run_shell_command, grep_search]
max_turns: 15
timeout_mins: 5
---

{System prompt for the agent}
```
- Agents exposed as callable tools to main agent
- Main agent delegates based on description matching
- Run in separate context loop (saves tokens)
- No explicit parallel spawning
- Experimental feature; uses YOLO mode for sub-agents

#### Environment Variables (Detection Signals)
| Variable | Presence | Notes |
|----------|----------|-------|
| `GEMINI_CLI_HOME` | Set by Gemini CLI | Root directory for config and storage |
| `GEMINI_API_KEY` | User-configured | API authentication |
| `GEMINI_MODEL` | Optional | Default model override |
| `GEMINI_SANDBOX` | Set by Gemini CLI | Sandbox mode flag |
| `GEMINI_SYSTEM_MD` | Optional | Custom system prompt path |
| `GEMINI_TELEMETRY_ENABLED` | Set by Gemini CLI | Telemetry flag |

**Best detection signal:** `GEMINI_CLI_HOME` (Gemini-specific, always present in Gemini CLI sessions).

#### Configuration
- **User:** `~/.gemini/settings.json`
- **Project:** `.gemini/settings.json`
- **System:** `/Library/Application Support/GeminiCli/settings.json` (macOS)
- **Format:** JSON
- **Env files:** `.gemini/.env` auto-loaded

---

### 1.4 OpenCode

#### Plugin Loading
- **Config:** `opencode.json` (project) or `~/.config/opencode/opencode.json` (global)
- **Plugin sources:** npm packages (auto-installed via Bun), local files in `.opencode/plugins/` or `~/.config/opencode/plugins/`
- **Hook system:** 41 lifecycle hooks across 7 event types (command, file, installation, LSP, message, permission, server, session, todo, shell, tool, TUI)
- **Context object:** `{ project, client, $, directory, worktree }` provided to plugin functions
- **Shell env hook:** `shell.env` hook for injecting environment variables

#### Agent Definition Format
```yaml
# .opencode/agents/grd-executor.md
---
description: Executes GRD plans following structured methodology
mode: subagent
model: anthropic/claude-sonnet-4-5
temperature: 0.3
---

{System prompt for the agent}
```

Or in `opencode.json`:
```json
{
  "agent": {
    "grd-executor": {
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-5",
      "prompt": "System prompt here..."
    }
  }
}
```

#### Model Names (provider/model-id format)
| Provider | Model | Tier |
|----------|-------|------|
| `anthropic/claude-opus-4-5` | Claude Opus 4.5 | Opus tier |
| `anthropic/claude-sonnet-4-5` | Claude Sonnet 4.5 | Sonnet tier |
| `anthropic/claude-haiku-4-5` | Claude Haiku 4.5 | Haiku tier |
| `openai/gpt-5.3-codex` | GPT-5.3 Codex | Opus tier |
| `openai/gpt-5.3-codex-spark` | GPT-5.3 Codex Spark | Sonnet tier |
| `google/gemini-3-pro` | Gemini 3 Pro | Opus tier |
| `google/gemini-3-flash` | Gemini 3 Flash | Sonnet tier |

Model selection: `opencode.json` `model` field, `--model` flag, `/models` command, last-used cache.
OpenCode is provider-agnostic -- the user's configured provider determines which models are available.

#### Agent Spawning
```
# User-initiated:
@grd-executor Execute plan 03-01

# Automatic delegation:
Primary agent delegates based on subagent description matching

# Plugin-mediated:
oh-my-opencode provides parallel agent execution via tool delegation
```
- Subagents get own session, tools, system prompt
- Can run with different LLM than parent
- If model not specified, inherits from parent agent
- Navigation between parent/child sessions via keybinds

#### Environment Variables (Detection Signals)
| Variable | Presence | Notes |
|----------|----------|-------|
| `OPENCODE` | Set since PR #1780 (Aug 2025) | Primary detection signal |
| `AGENT` | Set during middleware | Active for entire process lifetime |
| `OPENCODE_CONFIG` | Optional | Custom config file path |
| `OPENCODE_CONFIG_CONTENT` | Optional | Inline config content |

**Best detection signal:** `OPENCODE` env var (explicitly added for detection use case).

#### Configuration
- **Remote:** `.well-known/opencode` (lowest priority)
- **Global:** `~/.config/opencode/opencode.json`
- **Custom:** `OPENCODE_CONFIG` env var path
- **Project:** `opencode.json`
- **Local:** `.opencode/` directory
- **Inline:** `OPENCODE_CONFIG_CONTENT` env var
- **Format:** JSON/JSONC

---

## 2. Detection Strategy Comparison

### Detection Waterfall (Recommended)

```javascript
function detectBackend() {
  // 1. Explicit config override (highest priority)
  const config = loadConfig(cwd);
  if (config.backend) return config.backend;

  // 2. Environment variable detection
  if (hasEnvPrefix('CLAUDE_CODE_')) return 'claude';
  if (process.env.CODEX_HOME || process.env.CODEX_THREAD_ID) return 'codex';
  if (process.env.GEMINI_CLI_HOME) return 'gemini';
  if (process.env.OPENCODE || process.env.AGENT) return 'opencode';

  // 3. Filesystem clues (fallback)
  if (fs.existsSync('.claude-plugin/plugin.json')) return 'claude';
  if (fs.existsSync('.codex/config.toml')) return 'codex';
  if (fs.existsSync('.gemini/settings.json')) return 'gemini';
  if (fs.existsSync('opencode.json')) return 'opencode';

  // 4. Default (backward compatible)
  return 'claude';
}
```

### Strategy Comparison Table

| Strategy | Reliability | Speed | Requires User Config? | Notes |
|----------|-------------|-------|----------------------|-------|
| Env var detection | HIGH | Instant | No | Best primary signal |
| Config file override | HIGHEST | Fast (file read) | Yes | Useful for ambiguous environments |
| Filesystem clues | MEDIUM | Slow (stat calls) | No | Good fallback; may have false positives |
| Process inspection | LOW | Slow | No | Fragile; process names change |
| API probing | LOW | Very slow | No | Requires network; not recommended |

### Per-Signal Reliability

| Signal | Backend | Confidence | Notes |
|--------|---------|------------|-------|
| `CLAUDE_CODE_*` env vars | Claude | HIGH | Multiple variables; any one suffices |
| `CODEX_HOME` | Codex | HIGH | Documented, always present |
| `CODEX_THREAD_ID` | Codex | HIGH | Present in active sessions |
| `GEMINI_CLI_HOME` | Gemini | HIGH | Gemini-specific variable |
| `OPENCODE` | OpenCode | MEDIUM | Added in PR #1780; needs runtime verification |
| `AGENT` | OpenCode | LOW | Generic name; could collide with other tools |
| Filesystem `.claude-plugin/` | Claude | MEDIUM | Exists at rest, not just at runtime |
| Filesystem `.codex/` | Codex | LOW | User might have config from previous use |

---

## 3. Recommended Abstraction Approach

### Layer 1: Detection (`lib/backend.js`)

Pure function that examines environment and config to determine active backend. Returns one of: `'claude' | 'codex' | 'gemini' | 'opencode'`.

```javascript
const DETECTION_ORDER = [
  {
    name: 'claude',
    envCheck: () => Object.keys(process.env).some(k => k.startsWith('CLAUDE_CODE_')),
    fileCheck: (cwd) => fs.existsSync(path.join(cwd, '.claude-plugin', 'plugin.json')),
  },
  {
    name: 'codex',
    envCheck: () => !!process.env.CODEX_HOME || !!process.env.CODEX_THREAD_ID,
    fileCheck: () => fs.existsSync(path.join(process.env.HOME, '.codex', 'config.toml')),
  },
  {
    name: 'gemini',
    envCheck: () => !!process.env.GEMINI_CLI_HOME,
    fileCheck: (cwd) => fs.existsSync(path.join(cwd, '.gemini', 'settings.json')),
  },
  {
    name: 'opencode',
    envCheck: () => !!process.env.OPENCODE,
    fileCheck: (cwd) => fs.existsSync(path.join(cwd, 'opencode.json')),
  },
];
```

### Layer 2: Model Resolution

Extends existing `resolveModelInternal` to incorporate backend:

```javascript
function resolveModelInternal(cwd, agentType) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const profile = config.model_profile || 'balanced';
  const agentModels = MODEL_PROFILES[agentType];
  if (!agentModels) return getDefaultModel(backend);

  const tier = agentModels[profile]; // "opus", "sonnet", or "haiku"

  // Check user override
  if (config.backend_models?.[backend]?.[tier]) {
    return config.backend_models[backend][tier];
  }

  // Use built-in default
  return DEFAULT_BACKEND_MODELS[backend][tier];
}
```

### Layer 3: Agent/Command Generation

Setup-time generation of backend-specific files from canonical templates:

```
agents/_templates/grd-executor.md  (GRD canonical format)
    |
    v  lib/adapter.js
    |
    +-> .claude/agents/grd-executor.md      (Claude format)
    +-> .gemini/agents/grd-executor.md      (Gemini format)
    +-> .opencode/agents/grd-executor.md    (OpenCode format)
    +-> .codex/skills/grd/SKILL.md          (Codex skill format -- different structure)
```

### Orchestration Commands (The Hard Part)

For the ~8 orchestrator commands that spawn sub-agents, two options:

**Option A: Backend-specific command files** (recommended)
```
commands/execute-phase.md                 # Claude Code (canonical)
commands/codex/execute-phase.SKILL.md     # Codex adaptation
commands/gemini/execute-phase.md          # Gemini adaptation
commands/opencode/execute-phase.md        # OpenCode adaptation
```

**Option B: Runtime detection in command files**
The command file itself checks the backend and uses appropriate spawning. This is simpler but mixes backend logic into workflow logic.

**Recommendation:** Option A. Keep orchestration logic separate per backend. Share all non-orchestration logic via `grd-tools.js`.

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Env var detection fails (variable not set) | LOW | HIGH | Multi-signal detection with filesystem fallback |
| Model names change after release | CERTAIN | MEDIUM | User-overridable config; sensible but updatable defaults |
| Gemini sub-agents API changes | HIGH | MEDIUM | Keep Gemini orchestration simple; mark as experimental |
| Codex skills format changes | LOW | MEDIUM | SKILL.md format is stable; monitor changelog |
| OpenCode breaks plugin compat | LOW | LOW | OpenCode has stable plugin API; oh-my-opencode is proof |
| Testing all 4 backends in CI | CERTAIN | HIGH | Unit test detection logic; manual smoke test actual backends |
| Command file maintenance (4 versions x 8 files) | CERTAIN | MEDIUM | Template generation; shared logic in grd-tools.js |
| User confusion about setup | MEDIUM | MEDIUM | Setup wizard; clear per-backend docs |
| oh-my-opencode conflicts | LOW | LOW | Detect and document; avoid generating OpenCode files if compat layer present |

### Overall Risk Rating: MEDIUM

The detection and model mapping layers are low-risk. The sub-agent spawning adaptation is the primary risk area due to API divergence across backends. The recommended mitigation is to implement spawning per-backend rather than attempting a universal abstraction.

---

## 5. Implementation Priority

| Component | Effort | Value | Priority | Phase |
|-----------|--------|-------|----------|-------|
| `lib/backend.js` (detection) | Small | High | P0 | 1 |
| Model resolution enhancement | Small | High | P0 | 1 |
| `detect-backend` CLI command | Small | Medium | P0 | 1 |
| Agent template system | Medium | High | P1 | 2 |
| `setup --backend` command | Medium | High | P1 | 2 |
| Claude Code orchestration (existing) | None | High | N/A | Already done |
| Codex CLI orchestration | Large | Medium | P2 | 3 |
| OpenCode orchestration | Medium | Medium | P2 | 3 |
| Gemini CLI orchestration | Medium | Low | P3 | 3 |
| Cross-backend test suite | Large | High | P1 | 4 |
| MCP server for grd-tools.js | Medium | Medium | P3 | Future |
