# Architecture: Multi AI-Backend Support

**Project:** GRD Multi AI-Backend Support
**Researched:** 2026-02-16

## Current Architecture

```
User runs /grd:command
    |
    v
commands/*.md (Claude Code command format)
    |
    v
bin/grd-tools.js (Node.js CLI, 108 commands)
    |                          |
    v                          v
lib/*.js (10 modules)    Task(subagent_type, model)
    |                          |
    v                          v
.planning/ files          Claude Code runtime
```

**Key coupling points to Claude Code:**
1. `${CLAUDE_PLUGIN_ROOT}` in command files and hooks
2. `Task(prompt, subagent_type, model)` calls in command files
3. `TeamCreate()` in execute-phase.md
4. `.claude-plugin/plugin.json` manifest
5. Model names: `opus`, `sonnet`, `haiku` (Claude-specific aliases)
6. Agent files in `.claude/agents/` format

## Proposed Architecture

### Three-Layer Adapter Pattern

```
User runs /grd:command (or backend equivalent)
    |
    v
[Backend Adapter Layer]
    |-- commands/claude/*.md     (Claude Code Task() format)
    |-- skills/codex/SKILL.md   (Codex skill format)
    |-- .gemini/agents/*.md     (Gemini agent format)
    |-- .opencode/agents/*.md   (OpenCode agent format)
    |
    v
[Detection + Resolution Layer]  <-- NEW: lib/backend.js
    |-- detectBackend()         -> "claude" | "codex" | "gemini" | "opencode"
    |-- resolveModel(tier)      -> backend-specific model name
    |-- getCapabilities()       -> { parallel, teams, hooks, ... }
    |
    v
[Core Layer]  (unchanged)
    |-- bin/grd-tools.js        (108+ commands)
    |-- lib/*.js                (10 modules, backend-agnostic)
    |-- .planning/              (file-based state)
```

### Detection Flow

```
detectBackend():
    1. Check CLAUDE_CODE_ENTRYPOINT or CLAUDE_CODE_* env vars -> "claude"
    2. Check CODEX_HOME or CODEX_THREAD_ID env vars -> "codex"
    3. Check GEMINI_CLI_HOME or GEMINI_* env vars -> "gemini"
    4. Check OPENCODE or AGENT env vars -> "opencode"
    5. Check config.json backend field (explicit override) -> configured value
    6. Check filesystem clues (.claude-plugin/ exists, etc.) -> inferred
    7. Default -> "claude" (backward compatible)
```

### Model Resolution Flow

```
resolveModel(agentType):
    1. backend = detectBackend()
    2. config = loadConfig(cwd)
    3. profile = config.model_profile || "balanced"
    4. tier = MODEL_PROFILES[agentType][profile]  // "opus", "sonnet", "haiku"
    5. IF config.backend_models?.[backend]?.[tier]:
         return config.backend_models[backend][tier]  // user override
    6. ELSE:
         return DEFAULT_BACKEND_MODELS[backend][tier]  // built-in default
```

### Module Design: `lib/backend.js`

```javascript
// New module: lib/backend.js

const BACKEND_DETECTION = [
  { name: 'claude',   envVars: ['CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_ACTION'] },
  { name: 'codex',    envVars: ['CODEX_HOME', 'CODEX_THREAD_ID'] },
  { name: 'gemini',   envVars: ['GEMINI_CLI_HOME', 'GEMINI_API_KEY'] },
  { name: 'opencode', envVars: ['OPENCODE', 'AGENT'] },
];

const DEFAULT_BACKEND_MODELS = {
  claude:   { opus: 'opus',           sonnet: 'sonnet',              haiku: 'haiku' },
  codex:    { opus: 'gpt-5.3-codex',  sonnet: 'gpt-5.3-codex-spark', haiku: 'gpt-5.3-codex-spark' },
  gemini:   { opus: 'gemini-3-pro',   sonnet: 'gemini-3-flash',      haiku: 'gemini-2.5-flash' },
  opencode: { opus: 'anthropic/claude-opus-4-5', sonnet: 'anthropic/claude-sonnet-4-5', haiku: 'anthropic/claude-haiku-4-5' },
};

const BACKEND_CAPABILITIES = {
  claude:   { subagents: true,  parallel: true,  teams: true,  hooks: true,  mcp: true  },
  codex:    { subagents: true,  parallel: true,  teams: false, hooks: false, mcp: true  },
  gemini:   { subagents: 'experimental', parallel: false, teams: false, hooks: true, mcp: true },
  opencode: { subagents: true,  parallel: true,  teams: false, hooks: true,  mcp: true  },
};

exports = {
  detectBackend,
  resolveBackendModel,
  getBackendCapabilities,
  DEFAULT_BACKEND_MODELS,
  BACKEND_CAPABILITIES,
};
```

### Command Adaptation Strategy

GRD commands contain orchestration logic that uses backend-specific APIs. The strategy:

**Option A: Template Generation (recommended)**
```
templates/commands/*.md.ejs  (canonical source with template markers)
    |
    v
node bin/grd-tools.js setup --backend codex
    |
    v
Generated: .codex/skills/grd-execute-phase/SKILL.md
Generated: .codex/skills/grd-plan-phase/SKILL.md
...
```

**Option B: Orchestration Shim**
```
commands/*.md  (keep Claude Code format as canonical)
    |
    v
lib/adapter.js translates at setup time:
    - Task() -> codex exec --profile
    - Task() -> Gemini agent delegation
    - Task() -> OpenCode @mention
    - ${CLAUDE_PLUGIN_ROOT} -> backend-specific path
```

**Recommendation:** Option B (Orchestration Shim). Reason: maintaining one canonical source in Claude Code format minimizes drift. The adapter translates only the backend-specific constructs. The shim runs at setup/install time, not runtime.

### Agent Format Mapping

All four backends use markdown with YAML frontmatter, but fields differ:

```
GRD Agent Definition (canonical):
---
name: grd-executor
description: Executes plans following structured methodology
model_tier: sonnet       # GRD abstract tier, not backend-specific
tools: [read, write, edit, bash, grep, glob]
---
{system prompt}

    |
    v (adapter generates)

Claude Code (.claude/agents/grd-executor.md):
---
name: grd-executor
description: Executes plans following structured methodology
model: sonnet
tools: Read, Write, Edit, Bash, Grep, Glob
---
{system prompt}

Codex CLI (.codex/skills/grd-executor/SKILL.md):
---
name: grd-executor
description: Executes plans following structured methodology
---
{system prompt with tool usage instructions inline}

Gemini CLI (.gemini/agents/grd-executor.md):
---
name: grd-executor
description: Executes plans following structured methodology
model: gemini-3-flash
tools: [read_file, write_file, edit_file, run_shell_command, grep_search]
---
{system prompt}

OpenCode (.opencode/agents/grd-executor.md):
---
description: Executes plans following structured methodology
mode: subagent
model: anthropic/claude-sonnet-4-5
---
{system prompt}
```

### Sub-Agent Spawning Abstraction

This is the hardest problem. Each backend spawns differently:

```
Claude Code:
  Task(prompt="...", subagent_type="grd-executor", model="sonnet")

Codex CLI:
  codex exec --profile grd-executor "prompt text"
  # Profile defined in ~/.codex/config.toml

Gemini CLI:
  # Main agent naturally delegates to grd-executor sub-agent
  # Based on agent description matching task
  # No explicit spawn API from extensions

OpenCode:
  # @grd-executor prompt text
  # Or automatic delegation based on agent description
  # Via plugin hook: tool.execute interceptor
```

**Architecture decision:** GRD's command files (orchestrators) must be backend-specific at the orchestration layer. The workflow logic (wave detection, plan grouping, checkpoint handling) stays shared via `grd-tools.js` commands. Only the "spawn agent" calls are backend-specific.

### File System Layout (after setup)

```
project-root/
├── .planning/              # GRD state (backend-agnostic, shared)
│   ├── config.json         # Includes backend_models mapping
│   └── ...
├── .claude-plugin/         # Claude Code plugin manifest
│   └── plugin.json
├── .claude/agents/         # Claude Code agent definitions
│   ├── grd-executor.md
│   ├── grd-planner.md
│   └── ...
├── .codex/skills/          # Codex skill definitions (generated)
│   └── grd/
│       └── SKILL.md
├── .gemini/agents/         # Gemini agent definitions (generated)
│   ├── grd-executor.md
│   └── ...
├── .opencode/agents/       # OpenCode agent definitions (generated)
│   ├── grd-executor.md
│   └── ...
├── agents/                 # GRD canonical agent templates
│   ├── _templates/         # Backend-agnostic agent definitions
│   │   ├── grd-executor.md
│   │   └── ...
│   └── ...
├── commands/               # Claude Code commands (canonical)
│   └── *.md
├── bin/grd-tools.js        # Core CLI (backend-agnostic)
├── lib/
│   ├── backend.js          # NEW: detection + model mapping
│   ├── adapter.js          # NEW: format translation
│   └── *.js                # Existing modules (unchanged)
└── GEMINI.md               # Already exists (synced from CLAUDE.md)
```

## Component Boundaries

| Component | Responsibility | Backend-Specific? |
|-----------|---------------|-------------------|
| `lib/backend.js` | Detection, model mapping, capabilities | Yes (by design) |
| `lib/adapter.js` | Agent/command file generation | Yes (by design) |
| `lib/utils.js` | MODEL_PROFILES, resolveModel | Modified: calls backend.js for final model name |
| `lib/context.js` | Init context for workflows | Modified: includes backend info in context |
| `bin/grd-tools.js` | CLI router | Modified: new `detect-backend` and `setup` commands |
| `commands/*.md` | Orchestration logic | Claude Code format (canonical) |
| `.planning/` | State files | No (fully backend-agnostic) |
| `agents/_templates/` | Canonical agent definitions | No (translated by adapter) |

## Data Flow: Model Resolution

```
User runs /grd:execute-phase 3
    |
    v
Orchestrator calls: node grd-tools.js init execute-phase 3
    |
    v
lib/context.js:
    backend = detectBackend()           // "codex"
    config = loadConfig(cwd)            // .planning/config.json
    profile = config.model_profile      // "balanced"

    executor_tier = MODEL_PROFILES['grd-executor']['balanced']  // "sonnet"
    executor_model = resolveBackendModel(backend, executor_tier, config)
        // Checks config.backend_models.codex.sonnet first
        // Falls back to DEFAULT_BACKEND_MODELS.codex.sonnet
        // Returns "gpt-5.3-codex-spark"

    return { backend, executor_model, ... }
    |
    v
Orchestrator receives:
    { backend: "codex", executor_model: "gpt-5.3-codex-spark", ... }
    |
    v
Backend-specific spawning:
    codex exec --model gpt-5.3-codex-spark "Execute plan 03-01..."
```
