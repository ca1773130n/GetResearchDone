# Technology Stack

**Analysis Date:** 2026-02-12

## Languages

**Primary:**
- JavaScript (Node.js) - All tooling and automation
  - `bin/grd-tools.js` - CLI utility for workflow operations
  - `bin/grd-manifest.js` - SHA256-based file tracking for self-update

**Secondary:**
- Markdown - All documentation, templates, commands, and agents
  - ~42 command files in `commands/`
  - ~19 agent definition files in `agents/`
  - ~27 template files in `templates/`
  - ~14 reference documentation files in `references/`

## Runtime

**Environment:**
- Node.js (#!/usr/bin/env node)
- Shell environment (bash/zsh) for command execution

**Package Manager:**
- Not detected - No package.json, requirements.txt, or other dependency manifest in codebase
- Node.js standard library only (fs, path, crypto, child_process)

## Frameworks

**Core:**
- Claude Code Plugin SDK - GRD is a Claude Code plugin
  - Version: 0.0.3
  - Plugin manifest: `.claude-plugin/plugin.json`

**ML/Research:**
- Not applicable - GRD is a workflow automation tool, not ML/research codebase

**Testing:**
- Not detected - No test files or testing framework config

**Build/Dev:**
- Git - Version control and branching strategy
  - Phase branching: `grd/phase-{phase}-{slug}`
  - Milestone branching: `grd/{milestone}-{slug}`

## Key Dependencies

**Critical:**
- Node.js built-ins only:
  - `fs` - File system operations
  - `path` - Path manipulation
  - `crypto` - SHA256 hashing for manifest system
  - `child_process` - Shell command execution

**Infrastructure:**
- Git CLI - Repository operations
- Claude Code Agent SDK - Agent spawning and lifecycle management

## Configuration

**Environment:**
- `.planning/config.json` - GRD project configuration
  - Model profiles (quality/balanced/budget)
  - Workflow toggles (research_gates, autonomous_mode)
  - Execution settings (parallelization, agent teams)
  - Tracker integration config
  - Code review settings

**Build:**
- `.claude-plugin/plugin.json` - Claude Code plugin manifest
  - SessionStart hook to verify `.planning` directory

## Platform Requirements

**Development:**
- Node.js runtime (no version constraint specified)
- Git CLI
- Claude Code (desktop app or CLI)
- Optional: `gh` CLI for GitHub Issues integration
- Optional: MCP Atlassian server for Jira integration

**Production:**
- Not applicable - Claude Code plugin (developer tool)
- Runs locally in Claude Code environment

---

*Stack analysis: 2026-02-12*
