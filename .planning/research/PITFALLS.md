# Pitfalls: Multi AI-Backend Support

**Project:** GRD Multi AI-Backend Support
**Researched:** 2026-02-16

## P1: Sub-Agent Spawning is Fundamentally Different Per Backend

**Severity:** CRITICAL
**Confidence:** HIGH

GRD's orchestration commands (execute-phase, plan-phase, etc.) contain inline `Task()` calls with `subagent_type` and `model` parameters. This is a Claude Code-specific API. There is no cross-backend equivalent.

| Backend | Spawn Mechanism | In-Process? | Parallel? |
|---------|----------------|-------------|-----------|
| Claude Code | `Task(prompt, subagent_type, model)` | Yes | Yes |
| Codex CLI | `codex exec --profile name "prompt"` | No (subprocess) | Yes (multiple exec) |
| Gemini CLI | Agent exposed as tool; main agent delegates | Yes | No (sequential) |
| OpenCode | `@agent-name` or automatic delegation | Yes | Via plugin only |

**Impact:** Command files cannot be shared verbatim across backends. The orchestration layer must be backend-specific.

**Mitigation:**
1. Keep `grd-tools.js` as the shared brain (wave grouping, plan discovery, state management)
2. Generate backend-specific orchestrator files that call `grd-tools.js` for logic but use native spawning
3. For Gemini CLI (no parallel), fall back to sequential execution with a warning

## P2: Gemini CLI Sub-Agents are Experimental

**Severity:** HIGH
**Confidence:** MEDIUM

Gemini CLI's sub-agent system is explicitly marked as "experimental" in official docs. The API may change without notice.

**Evidence:**
- Gemini CLI docs state sub-agents are "currently an experimental feature"
- Sub-agent configuration enables YOLO mode by default for sub-agents
- No explicit parallel spawning support
- The `/model` command explicitly states it "does not override the model used by sub-agents"

**Impact:** Building deep Gemini CLI integration now may require rework when the API stabilizes. The extension system itself is stable, but sub-agent spawning is not.

**Mitigation:**
1. Implement Gemini support in two tiers: CLI tools (stable) and sub-agent orchestration (experimental)
2. Use Gemini extensions for config/discovery, but keep orchestration simple (sequential)
3. Mark Gemini sub-agent features as experimental in GRD docs
4. Design the adapter layer to be easily updated when Gemini stabilizes

## P3: CLAUDE_PLUGIN_ROOT is Unreliable in Command Markdown

**Severity:** HIGH
**Confidence:** HIGH

GitHub issue #9354 documents that `${CLAUDE_PLUGIN_ROOT}` is not set (empty/undefined) when referenced in plugin command markdown files. It only works in JSON configurations (hooks, MCP servers).

**Evidence:**
- GitHub issue opened October 2025, still relevant as of Claude Code v2.0.22+
- GRD's commands extensively use `${CLAUDE_PLUGIN_ROOT}` (found in 40+ command files)
- Currently works because Claude Code resolves it at command load time, not at runtime

**Impact:** If Anthropic changes how plugins work, or if we need to reference plugin root from generated files for other backends, this is fragile.

**Mitigation:**
1. For Claude Code: continue using `${CLAUDE_PLUGIN_ROOT}` as-is (it works in practice)
2. For other backends: use absolute paths resolved at setup time
3. Consider fallback: `process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..')`

## P4: Model Name Drift

**Severity:** MEDIUM
**Confidence:** HIGH

AI providers release new models frequently. Model names change (gpt-5.2-codex -> gpt-5.3-codex, gemini-2.5-pro -> gemini-3-pro). Hardcoded defaults will become stale.

**Evidence:**
- OpenAI released gpt-5.3-codex-spark on 2026-02-12 (4 days ago)
- Gemini 3 Pro/Flash just became available in Gemini CLI
- OpenCode supports 75+ providers via Models.dev; model IDs change per provider

**Impact:** Users will encounter stale model defaults that don't exist or are suboptimal.

**Mitigation:**
1. Make ALL model mappings configurable in `.planning/config.json`
2. Provide sensible defaults but document that they may need updating
3. `grd-tools.js detect-backend` should report available models when possible
4. Consider a `grd-tools.js update-models` command that fetches current model lists

## P5: OpenCode Environment Variable Naming Uncertainty

**Severity:** MEDIUM
**Confidence:** LOW

The `OPENCODE` environment variable was added in PR #1780 (merged August 2025), but the exact value and whether `AGENT` is also set needs runtime verification. The PR title says "add OPENCODE env var" but implementation details are not in the issue discussion.

**Impact:** Detection may fail if the variable name or value is different than expected.

**Mitigation:**
1. Test on actual OpenCode runtime before relying solely on `OPENCODE` env var
2. Use multiple detection signals: `OPENCODE` env var + `.opencode/` directory existence + `opencode.json` presence
3. Allow explicit backend override in config: `"backend": "opencode"`

## P6: Command File Maintenance Burden

**Severity:** HIGH
**Confidence:** HIGH

GRD has 43 command files. If each needs backend-specific versions, that's 43 x 4 = 172 files to maintain. Even with generation, the templates need testing.

**Impact:** Feature development velocity drops as every command change must be validated across 4 backends.

**Mitigation:**
1. NOT all commands need backend-specific versions. Only orchestrator commands that spawn sub-agents need adaptation (~8 files: execute-phase, plan-phase, new-project, new-milestone, verify-work, debug, quick, audit-milestone)
2. All other commands (40+ settings, inspection, research commands) work through `grd-tools.js` which is backend-agnostic
3. The orchestrator commands should be structured as: shared logic in grd-tools.js + thin backend-specific spawn wrapper

## P7: No Standard Plugin Distribution

**Severity:** MEDIUM
**Confidence:** HIGH

Each backend has a different distribution mechanism:
- Claude Code: git clone into plugin directory
- Codex CLI: skill-installer or manual drop into `~/.codex/skills/`
- Gemini CLI: `gemini ext install` from npm/registry
- OpenCode: npm packages or local files

**Impact:** Users must follow different installation procedures per backend. No single `npm install` works.

**Mitigation:**
1. Provide a unified `setup.sh` script that detects the backend and installs appropriately
2. Document per-backend installation in README
3. Consider publishing to npm as a secondary option (currently deferred per project constraints)

## P8: Codex CLI Profiles vs Claude Code Agent Types

**Severity:** MEDIUM
**Confidence:** MEDIUM

Codex CLI uses "profiles" defined in `config.toml` for model/behavior configuration. These are named configurations, not agent types. The sub-agent pattern (codex-subagents-mcp) creates profiles dynamically by writing AGENTS.md and using `codex exec --profile`.

**Impact:** GRD's agent-type-based model resolution needs to map to Codex profiles. Each GRD agent type (grd-executor, grd-planner, etc.) may need a corresponding Codex profile.

**Mitigation:**
1. `grd-tools.js setup --backend codex` generates profile entries in `config.toml`
2. Or: use `codex exec --model <model>` to override model per execution instead of profiles
3. Verify which approach Codex CLI actually supports for model-per-agent

## P9: Testing Complexity

**Severity:** HIGH
**Confidence:** HIGH

Testing multi-backend support requires either:
- Running actual instances of each CLI tool (heavy, flaky)
- Mocking environment variables and validating detection/resolution logic (lighter)
- End-to-end integration tests on CI with multiple backends installed (complex CI setup)

**Impact:** CI pipeline needs significant expansion. Test matrix grows from 3 (Node versions) to 3 x 4 (Node x backend).

**Mitigation:**
1. Unit tests for `lib/backend.js`: mock `process.env` to simulate each backend
2. Integration tests for generated files: validate format correctness per backend
3. Manual smoke testing on actual backends for initial release
4. Consider per-backend CI jobs only when backend-specific code changes

## P10: OpenCode's Oh-My-OpenCode Creates Parallel Ecosystem

**Severity:** LOW
**Confidence:** MEDIUM

Oh-My-OpenCode already provides Claude Code compatibility for OpenCode, including loading `.claude/agents/` files, translating hooks, and providing multi-model orchestration. If GRD generates OpenCode-native files AND oh-my-opencode also tries to load Claude Code files, there could be conflicts.

**Impact:** Users running both GRD and oh-my-opencode might see duplicate agents or conflicting behavior.

**Mitigation:**
1. Document that GRD's OpenCode support is standalone; oh-my-opencode is not required
2. If oh-my-opencode is detected, skip OpenCode-specific generation (use Claude format via compatibility layer)
3. Add detection: if oh-my-opencode plugin is installed, set backend to "opencode-claude-compat"

## Risk Summary

| Pitfall | Severity | Likelihood | Phase Impact |
|---------|----------|------------|-------------|
| P1: Spawning divergence | CRITICAL | Certain | Phase 3 |
| P2: Gemini experimental | HIGH | Likely | Phase 2-3 |
| P3: CLAUDE_PLUGIN_ROOT | HIGH | Possible | Phase 2 |
| P4: Model name drift | MEDIUM | Certain | Phase 1 (design) |
| P5: OpenCode env vars | MEDIUM | Possible | Phase 1 |
| P6: Maintenance burden | HIGH | Certain | Phase 2 (design) |
| P7: No standard distribution | MEDIUM | Certain | Phase 4 |
| P8: Codex profiles | MEDIUM | Likely | Phase 3 |
| P9: Testing complexity | HIGH | Certain | Phase 4 |
| P10: Oh-My-OpenCode conflict | LOW | Unlikely | Phase 2 |
