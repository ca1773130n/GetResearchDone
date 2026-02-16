# Plugin Architecture Comparison: AI Coding CLIs

**Domain:** Multi-backend plugin system for AI coding assistants
**Researched:** 2026-02-16
**Overall confidence:** HIGH

## Executive Summary

The AI coding CLI landscape in 2026 features four major players (Claude Code, Codex CLI, Gemini CLI, OpenCode) with divergent plugin architectures. Claude Code offers the most mature and comprehensive plugin system with JSON manifests, directory-based structure, and extensive hook events. Codex CLI and Gemini CLI both rely on the AGENTS.md standard for instructions but differ in extensibility mechanisms. OpenCode uses TypeScript/JavaScript plugins with a hook-based system. No universal abstraction exists—cross-backend support requires adapter patterns and careful abstraction design.

## 1. Claude Code Plugin Architecture

### Manifest Format

**Location:** `.claude-plugin/plugin.json` (optional)
**Format:** JSON

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": { "name": "Author Name", "email": "author@example.com" },
  "commands": "./commands/",
  "agents": "./agents/",
  "skills": ["./skills/skill-one"],
  "hooks": "./hooks.json",
  "mcpServers": "./.mcp.json",
  "lspServers": "./.lsp.json"
}
```

**Auto-discovery:** If plugin.json is omitted, Claude Code auto-discovers components in default locations and derives plugin name from directory name.

### Directory Structure

```
plugin-name/
├── .claude-plugin/
│   └── plugin.json              # Plugin metadata (optional)
├── commands/                    # Legacy slash commands (markdown files)
├── agents/                      # Subagent definitions (markdown files)
├── skills/                      # Agent Skills (SKILL.md format)
│   └── skill-name/
│       └── SKILL.md
├── hooks/
│   └── hooks.json               # Hook configurations
├── .mcp.json                    # MCP server definitions
├── .lsp.json                    # LSP server configurations
└── scripts/                     # Hook scripts
```

**Critical constraint:** Only `plugin.json` goes in `.claude-plugin/`. All other directories must be at plugin root.

### Hook System

**Configuration:** JSON-based, extensive event catalog

**Available events:**
- `PreToolUse`, `PostToolUse`, `PostToolUseFailure`
- `PermissionRequest`, `UserPromptSubmit`
- `Notification`, `Stop`
- `SubagentStart`, `SubagentStop`
- `SessionStart`, `SessionEnd`
- `TeammateIdle` (Agent Teams)
- `TaskCompleted`
- `PreCompact` (conversation history compaction)

**Hook types:**
- `command`: Execute shell commands/scripts
- `prompt`: Evaluate prompt with LLM (uses `$ARGUMENTS` placeholder)
- `agent`: Run agentic verifier with tools

**Example:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh"
          }
        ]
      }
    ]
  }
}
```

**Async hooks (added ~Jan 25, 2026):** Set `"async": true` on command hooks to run in background without blocking execution.

### Environment Variables

**`${CLAUDE_PLUGIN_ROOT}`**: Absolute path to plugin directory. Works in JSON configs (hooks, MCP servers) but NOT in command markdown files.

**Caching behavior:** Plugins are copied to `~/.claude/plugins/cache/[marketplace]/[plugin-name]/[version]/` for security. Symlinks are followed during copy.

### Installation Scopes

| Scope | Settings File | Use Case |
|-------|--------------|----------|
| `user` | `~/.claude/settings.json` | Personal plugins (default) |
| `project` | `.claude/settings.json` | Team plugins via version control |
| `local` | `.claude/settings.local.json` | Project-specific, gitignored |
| `managed` | `managed-settings.json` | Read-only, managed plugins |

### Agent/Command Registration

**Agents:** Place markdown files in `agents/` with frontmatter:
```markdown
---
name: agent-name
description: When Claude should invoke this agent
---

System prompt for the agent...
```

**Commands/Skills:** Place markdown files in `commands/` (legacy) or `skills/<name>/SKILL.md` (preferred).

**Model parameters:** Not explicitly documented for spawning agents in plugin context. Agent Teams feature allows spawning but API details not in reference docs.

### Sources
- [Plugins reference - Claude Code Docs](https://code.claude.com/docs/en/plugins-reference)
- [How to Build Claude Code Plugins - DataCamp](https://www.datacamp.com/tutorial/how-to-build-claude-code-plugins)
- [claude-code/plugins/README.md](https://github.com/anthropics/claude-code/blob/main/plugins/README.md)
- [Anthropic Claude Code plugin architecture 2026](https://zircote.com/blog/2026/02/whats-new-in-claude-code-opus-4-6/)

---

## 2. Codex CLI Extension Architecture

### Instruction System: AGENTS.md

**Format:** Markdown (no schema required)
**Purpose:** Project guidance, working agreements, setup instructions

**Hierarchical loading order:**
1. **Global:** `~/.codex/AGENTS.override.md` or `~/.codex/AGENTS.md`
2. **Project:** Walk from Git root toward current directory
3. **Merge:** Global first, then project files from root downward

**Merge behavior:** Files closer to current directory override earlier guidance (appear later in combined prompt).

**Size limit:** Stops adding files when combined size reaches `project_doc_max_bytes` (default: 32 KiB).

**Configuration:**
- `project_doc_fallback_filenames`: Alternate filenames to check
- `project_doc_max_bytes`: Byte limit before truncation

**Location:** `~/.codex/config.toml`

### Agent Spawning: MCP Server Pattern

**Native multi-agent support:** Via OpenAI Agents SDK integration

**MCP-based sub-agents:** Claude-style sub-agents (reviewer, debugger, security) available via MCP server. Each call:
1. Spins up clean context in temp workdir
2. Injects persona via AGENTS.md
3. Runs `codex exec --profile <agent>` to preserve isolated state

**Orchestration tools:**
- `codex()`: Primary Codex invocation tool
- `codex-reply()`: Continuation tool
- Exposed via MCP server for Agents SDK

### MCP Integration

**Configuration:** `~/.codex/config.toml` or project-level
**Standard MCP support:** Same as Claude Code/Gemini CLI

### Feature Flags

**Management:** `codex features enable/disable` writes to `~/.codex/config.toml`
**Model selection:** `--model/-m` flag or config file

### Plugin/Extension System

**Status (2026):** No first-class plugin manifest system documented. Extensions happen via:
1. AGENTS.md for instructions
2. MCP servers for tools
3. Agents SDK for orchestration

**No equivalent to:** Claude Code's `.claude-plugin/plugin.json` or Gemini CLI's `gemini-extension.json`

### Sources
- [Use Codex with the Agents SDK](https://developers.openai.com/codex/guides/agents-sdk/)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [codex-subagents-mcp](https://github.com/leonardsellem/codex-subagents-mcp)
- [Codex CLI & Agent Skills Guide (2026)](https://itecsonline.com/post/codex-cli-agent-skills-guide-install-usage-cross-platform-resources-2026)

---

## 3. Gemini CLI Extension Architecture

### Manifest Format

**Location:** `gemini-extension.json` in extension directory
**Format:** JSON

```json
{
  "name": "extension-name",
  "version": "1.0.0",
  "mcpServers": { /* MCP server configs */ },
  "contextFileName": "CUSTOM.md",
  "settings": [
    {
      "name": "API Key",
      "description": "Your API key",
      "envVar": "MY_API_KEY"
    }
  ]
}
```

**Installation:** `gemini extensions install <github-url-or-path>`

**Settings prompting:** Extensions define settings that prompt user on installation, mapping to environment variables.

### GEMINI.md Context Files

**Format:** Markdown (similar to AGENTS.md but Gemini-specific)
**Purpose:** Project-specific instructions, persona, coding style

**Hierarchical loading order:**
1. **Global:** `~/.gemini/GEMINI.md`
2. **Ancestor scan:** Current working directory → parent directories → project root (.git)
3. **Downward scan:** Recursively through subdirectories from current folder

**Modularization:** Support for `@file.md` imports (relative/absolute paths)

**Extension context:** `contextFileName` in manifest specifies custom context file (defaults to `GEMINI.md` if present).

### Hook System (v0.26.0+)

**Support:** Full hooks support in extensions (added 2026)

**Behavior:** Hooks run synchronously—Gemini CLI waits for all matching hooks to complete before continuing.

**Bundling:** Extension authors can bundle hooks directly; users install with single command.

**Hook types:** Documentation mentions "hooks allow you to intercept and customize behavior" but specific event types not detailed in search results.

### Extension Components

Can package:
- Prompts
- MCP servers
- Custom commands
- Hooks
- Sub-agents
- Agent skills

### File Locations

- **Project-level:** Extensions installed to project directory
- **Global:** `~/.gemini/` for global config

### Sources
- [Gemini CLI extensions](https://geminicli.com/docs/extensions/)
- [Tailor Gemini CLI with hooks](https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/)
- [Making Gemini CLI extensions easier to use](https://developers.googleblog.com/making-gemini-cli-extensions-easier-to-use/)
- [Provide context with GEMINI.md files](https://geminicli.com/docs/cli/gemini-md/)

---

## 4. OpenCode Extension Architecture

### Plugin Format

**Type:** JavaScript/TypeScript modules
**Export:** Plugin functions

```javascript
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Hook implementations
  }
}
```

**Context object:**
- `project`: Current project info
- `client`: OpenCode SDK client for AI interactions
- `$`: Bun's shell API
- `directory`: Current working directory
- `worktree`: Git worktree path

### Configuration

**File:** `opencode.json`
```json
{
  "plugin": ["opencode-helicone-session", "@my-org/custom-plugin"]
}
```

**Plugin locations:**
- `.opencode/plugins/` (project)
- `~/.config/opencode/plugins/` (global)

**Dependencies:** `.opencode/package.json` for npm packages (Bun runs `bun install` at startup)

### Hook System

**40+ lifecycle hooks** documented in oh-my-opencode

**Event categories:**

| Category | Events |
|----------|--------|
| **Command** | `command.executed` |
| **File** | `file.edited`, `file.watcher.updated` |
| **Tool** | `tool.execute.before`, `tool.execute.after` |
| **Session** | `session.created`, `session.compacted`, `session.idle`, `session.error` |
| **Message** | `message.updated`, `message.removed` |
| **LSP** | `lsp.client.diagnostics`, `lsp.updated` |
| **Shell** | `shell.env` |
| **TUI** | `tui.prompt.append`, `tui.toast.show` |

**Example hook:** `experimental.session.compacting` fires before LLM generates continuation summary (inject domain-specific context).

### Custom Commands

**Status:** No explicit command registration API documented. Plugins can define custom tools via `tool` helper, available to OpenCode alongside built-in tools.

Custom commands stored as markdown files in config directories for quick predefined prompts.

### Agent Support

**Status:** No agent spawning/interaction API documented in plugin system. References exist in navigation but not in extension docs.

### AGENTS.md Support

**Compatibility:** OpenCode respects AGENTS.md standard (cross-compatible with Codex/Gemini)

### Sources
- [Plugins - OpenCode](https://opencode.ai/docs/plugins/)
- [Config - OpenCode](https://opencode.ai/docs/config/)
- [OpenCode Plugins Guide](https://gist.github.com/johnlindquist/0adf1032b4e84942f3e1050aba3c5e4a)
- [oh-my-opencode documentation](https://github.com/code-yeongyu/oh-my-opencode)

---

## Common Patterns Across Backends

### 1. Markdown-Based Instructions

**Universal pattern:** All backends support markdown instruction files

| Backend | File | Scope |
|---------|------|-------|
| Claude Code | `CLAUDE.md` | Project root (read by agent) |
| Codex CLI | `AGENTS.md` | Hierarchical (global + project) |
| Gemini CLI | `GEMINI.md` | Hierarchical (global + ancestor + descendant) |
| OpenCode | `AGENTS.md` | Standard AGENTS.md support |

**AGENTS.md standard:** Emerging as cross-platform standard stewarded by Agentic AI Foundation (Linux Foundation). Adopted by 40,000+ open-source projects. Recommendation: Use `AGENTS.md` as primary, symlink to backend-specific names for compatibility.

**Migration path:**
```bash
mv CLAUDE.md AGENTS.md
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md GEMINI.md
```

### 2. MCP (Model Context Protocol) Support

**Universal:** All backends support MCP servers for tool integration
**Configuration:** JSON-based MCP server definitions
**Behavior:** Similar across platforms

### 3. Configuration Scopes

**Multi-level config hierarchy:**
- **Global:** User home directory
- **Project:** Version-controlled
- **Local:** Gitignored project-specific

**Precedence:** Local > Project > Global (consistent pattern)

### 4. LSP Integration

**Claude Code:** First-class `.lsp.json` support in plugins
**Codex CLI:** LSP integration via IDE extension
**Gemini CLI:** Not documented in search results
**OpenCode:** LSP hooks available (`lsp.client.diagnostics`, `lsp.updated`)

---

## Incompatibilities and Workarounds

### 1. Plugin Manifest Formats

**Problem:** Three different manifest formats

| Backend | Manifest | Required |
|---------|----------|----------|
| Claude Code | `.claude-plugin/plugin.json` | No (auto-discovery) |
| Codex CLI | None | N/A |
| Gemini CLI | `gemini-extension.json` | Yes (for extensions) |
| OpenCode | `opencode.json` | Yes (for plugin list) |

**Workaround:** Multi-manifest approach
```
grd-plugin/
├── .claude-plugin/
│   └── plugin.json           # Claude Code
├── gemini-extension.json     # Gemini CLI
├── opencode.json             # OpenCode
├── package.json              # OpenCode dependencies
└── AGENTS.md                 # Universal instructions
```

### 2. Directory Structure Conventions

**Claude Code:** Strict `.claude-plugin/` + root-level components
**Others:** Flexible directory placement

**Workaround:** Design for Claude Code's strictest requirements; other backends are more permissive.

### 3. Hook Event Names

**Problem:** Different event vocabularies

| Event Type | Claude Code | OpenCode | Gemini CLI |
|------------|-------------|----------|------------|
| After tool use | `PostToolUse` | `tool.execute.after` | Not documented |
| Session start | `SessionStart` | `session.created` | Not documented |
| File edit | (via tool matcher) | `file.edited` | Not documented |

**Workaround:** Adapter layer that maps common events to backend-specific hooks.

### 4. Environment Variable Access

**Claude Code:** `${CLAUDE_PLUGIN_ROOT}` for plugin path (JSON only, not markdown)
**Codex CLI:** Standard env vars, no plugin-specific variables
**Gemini CLI:** Extension settings map to env vars
**OpenCode:** Context object provides paths (`directory`, `worktree`)

**Workaround:** Avoid relying on backend-specific env vars in shared code. Use relative paths or runtime path detection.

### 5. Agent Spawning APIs

**Problem:** No unified API

| Backend | Agent Spawning |
|---------|----------------|
| Claude Code | Agent Teams (frontmatter + auto-invocation) |
| Codex CLI | MCP + Agents SDK (`codex exec --profile`) |
| Gemini CLI | Sub-agents in extensions (format not documented) |
| OpenCode | No documented API |

**Workaround:** Abstract agent spawning behind backend-specific implementations. Cannot create universal agent spawning without per-backend code.

### 6. Model Parameter Formats

**Problem:** Each backend has different model selection mechanisms

| Backend | Model Selection |
|---------|----------------|
| Claude Code | Agent frontmatter (not detailed in reference) |
| Codex CLI | `--model/-m` flag or `config.toml` |
| Gemini CLI | CLI flags or config |
| OpenCode | Config file |

**Workaround:** Model selection stays at workflow orchestration layer, not in shared plugin code.

### 7. File Path Conventions

**Claude Code:** Plugin cache at `~/.claude/plugins/cache/`
**Codex CLI:** Config at `~/.codex/`
**Gemini CLI:** Config at `~/.gemini/`
**OpenCode:** Config at `~/.config/opencode/`

**Workaround:** Runtime detection of which backend is active, use appropriate paths.

---

## Cross-Backend Abstraction Surface

### High Compatibility Layer

**These work everywhere with minimal adaptation:**

1. **Markdown instructions** (AGENTS.md standard)
2. **MCP servers** (universal protocol)
3. **Bash scripts** (via hooks/commands)
4. **Static markdown commands** (if avoiding backend-specific features)

### Medium Compatibility Layer

**Requires abstraction but achievable:**

1. **Hook systems** (event name mapping required)
2. **Custom tools** (MCP for Claude/Gemini/Codex; OpenCode plugin `tool` helper)
3. **Configuration management** (unified config → backend-specific translation)

### Low Compatibility Layer

**Backend-specific, no abstraction possible:**

1. **Agent spawning** (completely different APIs)
2. **Model parameter tuning** (different configuration mechanisms)
3. **Plugin marketplace integration** (unique to each platform)
4. **Caching behavior** (implementation detail)

---

## Recommended Plugin Structure for Cross-Backend Support

```
grd-plugin/
├── .claude-plugin/
│   └── plugin.json           # Claude Code manifest
├── gemini-extension.json     # Gemini CLI manifest
├── opencode.json             # OpenCode plugin list
├── package.json              # OpenCode dependencies
├── AGENTS.md                 # Universal instructions (symlinked)
├── CLAUDE.md → AGENTS.md     # Symlink for backward compat
├── GEMINI.md → AGENTS.md     # Symlink for Gemini
├── commands/                 # Claude Code auto-discovery
│   └── common-commands.md
├── agents/                   # Claude Code subagents
│   └── reviewer.md
├── skills/                   # Claude Code agent skills
├── hooks/
│   ├── hooks.json            # Claude Code hooks
│   └── adapters/
│       ├── claude-hooks.sh
│       ├── gemini-hooks.sh
│       └── opencode-hooks.ts
├── .mcp.json                 # MCP servers (universal)
├── scripts/                  # Shared scripts
│   └── common-logic.sh
├── lib/
│   └── backend-adapter.js    # Runtime backend detection + adaptation
└── README.md
```

### Adapter Pattern

**Core principle:** Single source of truth for logic, backend-specific entry points

**Implementation:**
1. Shared business logic in `scripts/` and `lib/`
2. Backend-specific hooks/commands call shared logic
3. Runtime detection of active backend
4. Feature flags for backend-specific capabilities

**Example adapter:**
```javascript
// lib/backend-adapter.js
export function detectBackend() {
  if (process.env.CLAUDE_PLUGIN_ROOT) return 'claude';
  if (process.env.CODEX_SESSION_ID) return 'codex';
  // ... detection logic
}

export function getPluginRoot() {
  const backend = detectBackend();
  switch (backend) {
    case 'claude': return process.env.CLAUDE_PLUGIN_ROOT;
    case 'opencode': return __dirname; // OpenCode context provides directory
    default: return process.cwd();
  }
}

export function mapHookEvent(event, backend) {
  const eventMap = {
    'post-tool-use': {
      claude: 'PostToolUse',
      opencode: 'tool.execute.after'
    }
  };
  return eventMap[event]?.[backend] || event;
}
```

---

## Pitfalls for Multi-Backend Plugin Development

### 1. Assuming Universal Hook Events

**Trap:** Writing hooks with Claude Code event names and expecting them to work elsewhere
**Reality:** Each backend has different event vocabularies
**Prevention:** Use adapter layer with event mapping

### 2. Hardcoding File Paths

**Trap:** Using `${CLAUDE_PLUGIN_ROOT}` in shared code
**Reality:** Only works in Claude Code, only in JSON configs
**Prevention:** Runtime path detection, relative paths where possible

### 3. Relying on Auto-Discovery

**Trap:** Depending on Claude Code's auto-discovery without manifests
**Reality:** Other backends require explicit configuration
**Prevention:** Always provide manifests for all backends

### 4. Single Markdown Instruction File

**Trap:** Using only `CLAUDE.md` or only `GEMINI.md`
**Reality:** Fragments the developer community
**Prevention:** Adopt AGENTS.md standard with symlinks for backward compatibility

### 5. Backend-Specific Agent Spawning

**Trap:** Building workflows that rely on Claude Code Agent Teams or Codex Agents SDK
**Reality:** No equivalent in other backends
**Prevention:** Design for single-agent workflows, or provide degraded fallback experience

### 6. Assuming Synchronous Hooks

**Trap:** Writing hooks that must complete before agent continues
**Reality:** Claude Code supports async hooks (Jan 2026), unclear for others
**Prevention:** Design hooks to be idempotent and async-safe

### 7. Extension Discoverability

**Trap:** Assuming users will find plugin in one marketplace
**Reality:** Each backend has separate marketplace/discovery
**Prevention:** Publish to all relevant marketplaces, document manual installation

### 8. Version Skew

**Trap:** Plugin works with latest Claude Code but breaks on Codex CLI
**Reality:** Backends evolve at different rates
**Prevention:** Test against all supported backends, document minimum versions

### 9. Configuration Sprawl

**Trap:** Duplicating configuration across backend-specific files
**Reality:** Configuration drift and maintenance burden
**Prevention:** Single source of truth config, backend-specific transformations

### 10. Ignoring AGENTS.md Standard

**Trap:** Continuing to use backend-specific instruction files only
**Reality:** AGENTS.md is gaining traction (40k+ projects, Linux Foundation stewardship)
**Prevention:** Migrate to AGENTS.md now, use symlinks for transition period

---

## Performance and Capability Comparison (2026 Benchmarks)

| Backend | SWE-bench Verified | Context Window | Cost (sample task) | Speed (sample task) | Autonomy |
|---------|-------------------|----------------|-------------------|---------------------|----------|
| Claude Code | Not disclosed | Standard | $4.80 | 1h17m | Full autonomy |
| Codex CLI | Higher than Gemini | Standard | Not disclosed | Not disclosed | High |
| Gemini CLI | 63.8% | 1M tokens (largest) | $7.06 | Slower | Needs manual nudging |
| OpenCode | Not disclosed | Varies by model | Varies | Varies | Depends on model |

**Key takeaway:** Claude Code fastest with full autonomy; Gemini CLI largest context window; Codex CLI strong on real-world software engineering tasks.

---

## Recommendations for GRD Multi-Backend Support

### Phase 1: AGENTS.md Foundation
1. Migrate `CLAUDE.md` → `AGENTS.md`
2. Create symlinks: `CLAUDE.md`, `GEMINI.md` → `AGENTS.md`
3. Document AGENTS.md structure in GRD

### Phase 2: Multi-Manifest Support
1. Generate `gemini-extension.json` from GRD config
2. Generate `opencode.json` plugin list
3. Maintain `.claude-plugin/plugin.json` as source of truth
4. Create CLI tool: `grd manifest generate --backend [claude|gemini|opencode|all]`

### Phase 3: Hook Adapter Layer
1. Define GRD-standard hook events (backend-agnostic)
2. Implement adapters for each backend
3. Runtime backend detection
4. Event name mapping table
5. Graceful degradation when hooks unavailable

### Phase 4: MCP Universalization
1. MCP servers already universal
2. Ensure all GRD tools exposed via MCP
3. Test MCP integration on all backends
4. Document MCP setup per backend

### Phase 5: Testing Matrix
1. CI/CD testing against all four backends
2. Feature flag system for backend-specific capabilities
3. Graceful degradation documentation
4. Version compatibility matrix

### Phase 6: Documentation
1. Installation guide per backend
2. Feature availability matrix
3. Troubleshooting per backend
4. Migration guides (backend-to-backend)

---

## Open Questions and Research Gaps

### LOW Confidence Areas (WebSearch only, needs verification)

1. **Gemini CLI hook event types:** Specific hook events not documented in search results. Need official reference docs.

2. **OpenCode agent spawning API:** No documentation found. May not exist, or may be undocumented feature.

3. **Codex CLI plugin manifest:** No equivalent to `plugin.json` found. Unclear if planned or intentionally absent.

4. **Model parameter formats for agent spawning:** Claude Code Agent Teams API not detailed in reference docs. Need to test or find additional documentation.

5. **Gemini CLI sub-agent format:** Extensions can package "sub-agents" but format not detailed in search results.

### MEDIUM Confidence (Multiple sources, not official docs)

1. **AGENTS.md standard adoption:** Multiple sources cite 40k+ projects, Linux Foundation stewardship. Verify official AGENTS.md spec.

2. **Performance benchmarks:** Third-party comparisons available but not official vendor benchmarks.

3. **OpenCode hook count (40+):** From oh-my-opencode community project, not official OpenCode docs.

### Verification Needed

1. **Claude Code `${CLAUDE_PLUGIN_ROOT}` limitation:** Reported in GitHub issues (works in JSON, not markdown). Verify current behavior.

2. **Gemini CLI downward scan:** GEMINI.md loads from subdirectories recursively. Confirm precedence order.

3. **Codex CLI merge order:** "Files closer to current directory override earlier guidance." Test actual behavior.

---

## Confidence Assessment

| Area | Confidence | Sources |
|------|-----------|---------|
| Claude Code architecture | HIGH | Official docs, reference manual |
| Codex CLI AGENTS.md | HIGH | Official docs |
| Gemini CLI GEMINI.md | HIGH | Official docs |
| OpenCode plugins | MEDIUM | Official docs (high-level), community docs (details) |
| Hook event comparison | MEDIUM | Claude Code official, others partial |
| Agent spawning APIs | LOW | Limited documentation, community examples |
| Cross-backend patterns | MEDIUM | Multiple sources, inferred from documentation |
| Performance benchmarks | MEDIUM | Third-party comparisons |

---

## Sources

### Claude Code
- [Plugins reference - Claude Code Docs](https://code.claude.com/docs/en/plugins-reference)
- [How to Build Claude Code Plugins - DataCamp](https://www.datacamp.com/tutorial/how-to-build-claude-code-plugins)
- [claude-code/plugins/README.md](https://github.com/anthropics/claude-code/blob/main/plugins/README.md)
- [Anthropic Claude Code plugin architecture 2026](https://zircote.com/blog/2026/02/whats-new-in-claude-code-opus-4-6/)
- [BUG: Fix ${CLAUDE_PLUGIN_ROOT} in command markdown](https://github.com/anthropics/claude-code/issues/9354)
- [Plugin cache CLAUDE_PLUGIN_ROOT stale version issue](https://github.com/anthropics/claude-code/issues/15642)

### Codex CLI
- [Use Codex with the Agents SDK](https://developers.openai.com/codex/guides/agents-sdk/)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [codex/AGENTS.md](https://github.com/openai/codex/blob/main/AGENTS.md)
- [codex-subagents-mcp](https://github.com/leonardsellem/codex-subagents-mcp)
- [Codex CLI & Agent Skills Guide (2026)](https://itecsonline.com/post/codex-cli-agent-skills-guide-install-usage-cross-platform-resources-2026)

### Gemini CLI
- [Gemini CLI extensions](https://geminicli.com/docs/extensions/)
- [Tailor Gemini CLI with hooks](https://developers.googleblog.com/tailor-gemini-cli-to-your-workflow-with-hooks/)
- [Making Gemini CLI extensions easier to use](https://developers.googleblog.com/making-gemini-cli-extensions-easier-to-use/)
- [Provide context with GEMINI.md files](https://geminicli.com/docs/cli/gemini-md/)
- [Gemini CLI Tutorial: Extensions](https://medium.com/google-cloud/gemini-cli-tutorial-series-part-11-gemini-cli-extensions-69a6f2abb659)
- [Practical Gemini CLI: GEMINI.md hierarchy](https://medium.com/google-cloud/practical-gemini-cli-instruction-following-gemini-md-hierarchy-part-1-3ba241ac5496)

### OpenCode
- [Plugins - OpenCode](https://opencode.ai/docs/plugins/)
- [Config - OpenCode](https://opencode.ai/docs/config/)
- [OpenCode Plugins Guide](https://gist.github.com/johnlindquist/0adf1032b4e84942f3e1050aba3c5e4a)
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)
- [GitHub - opencode-ai/opencode](https://github.com/opencode-ai/opencode)

### AGENTS.md Standard
- [AGENTS.md](https://agents.md/)
- [AGENTS.md: an open standard for AI coding agents](https://tessl.io/blog/the-rise-of-agents-md-an-open-standard-and-single-source-of-truth-for-ai-coding-agents/)
- [AGENTS.md: A New Standard for Unified Coding Agent Instructions](https://addozhang.medium.com/agents-md-a-new-standard-for-unified-coding-agent-instructions-0635fc5cb759)
- [AGENTS.md: One File to Guide Them All](https://layer5.io/blog/ai/agentsmd-one-file-to-guide-them-all/)

### Comparisons
- [Comparing Claude Code, OpenAI Codex, and Google Gemini CLI](https://www.deployhq.com/blog/comparing-claude-code-openai-codex-and-google-gemini-cli-which-ai-coding-assistant-is-right-for-your-deployment-workflow)
- [Claude Code vs. Codex vs. Gemini Code Assist: 2026 dev review](https://www.educative.io/blog/claude-code-vs-codex-vs-gemini-code-assist)
- [The 2026 Guide to Coding CLI Tools: 15 AI Agents Compared](https://www.tembo.io/blog/coding-cli-tools-comparison)
- [Comparing Codex CLI vs Claude Code vs Gemini CLI](https://medium.com/@dorangao/comparing-codex-cli-vs-claude-code-vs-gemini-cli-ai-coding-tools-in-your-terminal-1a238c329cbe)
