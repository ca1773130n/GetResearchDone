# Coding Conventions

**Analysis Date:** 2026-02-12

## Language

**Primary:** JavaScript (Node.js)
- Runtime: Node.js (detected via `#!/usr/bin/env node` shebangs)
- No transpilation (pure JS, no TypeScript)

## File Organization

**Directory structure:**
```
bin/              CLI utilities (grd-tools.js, grd-manifest.js)
agents/           Agent prompt templates (*.md)
commands/         Command prompt templates (*.md)
templates/        Document templates (*.md, config.json)
references/       Reference documentation (*.md)
.claude-plugin/   Plugin metadata (plugin.json)
```

**File naming:**
- CLI scripts: `kebab-case.js` (e.g., `grd-tools.js`, `grd-manifest.js`)
- Agent files: `kebab-case.md` (e.g., `grd-planner.md`, `grd-executor.md`)
- Command files: `kebab-case.md` (e.g., `execute-phase.md`, `new-project.md`)
- Templates: `kebab-case.md` or `UPPERCASE.md` (e.g., `roadmap.md`, `STATE.md`)
- Documentation: `UPPERCASE.md` for key docs (`CLAUDE.md`, `README.md`, `CHANGELOG.md`)

## Style

**Indentation:** 2 spaces (no tabs)

**Quotes:** Single quotes for strings in JavaScript
```javascript
const fs = require('fs');
const MANIFEST_FILE = 'grd-file-manifest.json';
```

**Semicolons:** Always used at end of statements

**Line length:** No strict limit observed, but generally stays under 120 characters for readability

## Naming Conventions

**Variables:** `camelCase`
```javascript
const configPath = path.join(cwd, '.planning', 'config.json');
const planStartTime = date();
```

**Constants:** `SCREAMING_SNAKE_CASE` for true constants
```javascript
const MODEL_PROFILES = { ... };
const MANIFEST_FILE = 'grd-file-manifest.json';
const PATCH_DIR = 'grd-local-patches';
const EXCLUDE = new Set([...]);
```

**Functions:** `camelCase` with descriptive names
```javascript
function loadConfig(cwd) { ... }
function extractFrontmatter(content) { ... }
function cmdStateLoad(cwd, raw) { ... }
```

**Function naming pattern:** Command handlers prefixed with `cmd`
```javascript
function cmdGenerateSlug(text, raw) { ... }
function cmdStateLoad(cwd, raw) { ... }
function cmdHistoryDigest(cwd, raw) { ... }
```

**Utility functions:** Simple descriptive names
```javascript
function safeReadFile(filePath) { ... }
function parseIncludeFlag(args) { ... }
function output(result, raw, rawValue) { ... }
```

**Phase normalization:** Phase numbers are zero-padded (e.g., `01`, `02`, `10`)
```javascript
function normalizePhaseName(phase) {
  // Returns "01", "02.1", etc.
  const padded = parts[0].padStart(2, '0');
}
```

## Code Patterns

### Argument Parsing

**CLI tool pattern** (`bin/grd-tools.js`):
```javascript
const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const raw = args.includes('--raw');
```

**Flag extraction:**
```javascript
function parseIncludeFlag(args) {
  const includeIndex = args.indexOf('--include');
  if (includeIndex === -1) return new Set();
  const includeValue = args[includeIndex + 1];
  return new Set(includeValue.split(',').map(s => s.trim()));
}
```

### Configuration Loading

**Config with defaults pattern:**
```javascript
function loadConfig(cwd) {
  const configPath = path.join(cwd, '.planning', 'config.json');
  const defaults = {
    model_profile: 'balanced',
    commit_docs: true,
    // ...
  };

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Merge with defaults
  } catch {
    return defaults;
  }
}
```

### File I/O

**Safe file reads:**
```javascript
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
```

**File writes:** Always with UTF-8 encoding
```javascript
fs.writeFileSync(path, content, 'utf-8');
```

### Output Patterns

**Dual output mode (JSON or raw):**
```javascript
function output(result, raw, rawValue) {
  if (raw && rawValue !== undefined) {
    process.stdout.write(String(rawValue));
  } else {
    process.stdout.write(JSON.stringify(result, null, 2));
  }
  process.exit(0);
}
```

**Error handling:**
```javascript
function error(message) {
  process.stderr.write(JSON.stringify({ error: message }, null, 2) + '\n');
  process.exit(1);
}
```

### Git Operations

**Exec pattern with proper escaping:**
```javascript
function execGit(cwd, args) {
  const escaped = args.map(a => {
    return a.includes(' ') || a.includes('"') || a.includes("'")
      ? `"${a.replace(/"/g, '\\"')}"`
      : a;
  });
  const stdout = execSync('git ' + escaped.join(' '), {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return stdout.trim();
}
```

### YAML Frontmatter Parsing

**Custom YAML parser** (no external dependencies):
```javascript
function extractFrontmatter(content) {
  const frontmatter = {};
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const lines = yaml.split('\n');
  let stack = [{ obj: frontmatter, key: null, indent: -1 }];

  // Manual parsing logic...
  return frontmatter;
}
```

## Error Handling

**Try-catch with fallbacks:**
```javascript
try {
  const content = fs.readFileSync(path, 'utf-8');
  // Process content
} catch {
  return null; // or default value
}
```

**Early returns for error conditions:**
```javascript
if (!fs.existsSync(manifestPath)) {
  return { error: 'No manifest found' };
}
```

**Exit codes:**
- `0` for success
- `1` for errors

## Documentation

### Inline Comments

**Section separators:**
```javascript
// ─── Model Profile Table ─────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────
```

**Block comments for complex logic:**
```javascript
// Extract a specific block from must_haves in raw frontmatter YAML
// Handles 3-level nesting: must_haves > artifacts/key_links > [{path, provides, ...}]
```

**Inline comments for clarity:**
```javascript
const blockLines = afterBlock.split('\n').slice(1); // skip the header line

// Stop at same or lower indent level (non-continuation)
if (indent <= 4 && line.trim() !== '') break;
```

### JSDoc

**File-level documentation:**
```javascript
/**
 * GRD Tools — CLI utility for GRD (Get Research Done) workflow operations
 *
 * Usage: node grd-tools.js <command> [args] [--raw]
 *
 * Atomic Commands:
 *   state load                         Load project config + state
 *   state update <field> <value>       Update a STATE.md field
 *   ...
 */
```

**No function-level JSDoc** — function names are self-documenting

### Markdown Documentation

**Structured templates** (`agents/*.md`, `commands/*.md`):
```markdown
---
name: agent-name
description: One-line description
tools: Read, Write, Bash
color: green
---

<role>
Description of agent's role
</role>

<process>
<step name="step_name">
Step details
</step>
</process>
```

**Frontmatter in Markdown:** YAML format with `---` delimiters

**Structured sections:** Use XML-style tags for agent/command structure (`<role>`, `<process>`, `<step>`)

## Import Organization

**Node.js requires at top of file:**
```javascript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
```

**No module bundling** — pure CommonJS requires

**No external dependencies** — entire codebase uses only Node.js built-ins

## Data Structures

**Model profiles:** Nested object with tier-based model selection
```javascript
const MODEL_PROFILES = {
  'grd-planner': { quality: 'opus', balanced: 'opus', budget: 'sonnet' },
  'grd-executor': { quality: 'opus', balanced: 'sonnet', budget: 'sonnet' },
  // ...
};
```

**Config objects:** Flat structure with nested sections
```javascript
{
  model_profile: 'balanced',
  commit_docs: true,
  tracker: {
    provider: 'mcp-atlassian',
    // ...
  }
}
```

## Markdown Conventions

**Headers:** ATX-style (`#`, `##`, `###`)

**Lists:**
- Unordered: `-` (dash)
- Ordered: `1.`, `2.`, `3.`

**Code blocks:** Triple backticks with language hints
````markdown
```bash
command here
```

```javascript
code here
```
````

**Emphasis:**
- Bold: `**text**`
- Italic: `*text*` (rare)
- Code: `` `text` ``

**File paths:** Always wrapped in backticks (`` `path/to/file.js` ``)

**Structured data in Markdown:** YAML frontmatter or XML-style tags

## Plugin System

**Plugin metadata** (`.claude-plugin/plugin.json`):
```json
{
  "name": "grd",
  "version": "0.0.3",
  "description": "Get Research Done — R&D workflow automation",
  "author": { "name": "Cameleon X" },
  "hooks": {
    "SessionStart": [ ... ]
  }
}
```

**Environment variable:** `CLAUDE_PLUGIN_ROOT` for plugin path resolution
```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js" command
```

## Version Control

**Semantic versioning:** `MAJOR.MINOR.PATCH` (e.g., `0.0.4`)

**Changelog format:** [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) standard

**Version file:** Plain text `VERSION` file at root

---

*Convention analysis: 2026-02-12*
