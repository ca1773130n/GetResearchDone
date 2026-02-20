# Testing

**Analysis Date:** 2026-02-12

## Test Framework

**None detected.**

No test framework configuration found. The codebase does not currently include:
- Jest configuration (`jest.config.js`)
- Vitest configuration (`vitest.config.js`)
- Mocha/Chai setup
- Test runner scripts in package.json

## Test Files

**None detected.**

No test files found matching common patterns:
- `*.test.js`
- `*.spec.js`
- `test_*.js`
- `*_test.js`
- `tests/` directory

## Testing Strategy

The GRD codebase uses **self-verification through real-world execution** rather than traditional unit/integration tests.

### Verification Approach

**Live validation through CLI tools:**

The `bin/grd-tools.js` includes verification subcommands that validate real project state:

```bash
# Verify plan structure and frontmatter
verify plan-structure <file>

# Check all plans in phase have summaries
verify phase-completeness <phase>

# Validate @-references and file paths
verify references <file>

# Batch verify git commits exist
verify commits <hash1> [hash2] ...

# Check must_haves.artifacts exist on disk
verify artifacts <plan-file>

# Validate must_haves.key_links resolve
verify key-links <plan-file>
```

**Located in:** `bin/grd-tools.js` lines 1474+ (verification suite)

### Validation Points

**1. Plan structure validation:**
- Frontmatter YAML syntax
- Required fields present (phase, plan, type)
- Task structure (type, verification, done criteria)
- Must-haves structure (truths, artifacts, key_links)

**2. Reference validation:**
- `@file` references resolve to existing files
- File paths in must_haves exist
- Git commit hashes valid
- Cross-phase dependencies valid

**3. Phase completeness:**
- All plans have corresponding SUMMARY.md files
- Roadmap state matches disk state
- Phase numbering consistent

**4. Consistency checks:**
```bash
validate consistency
```
- Phase numbering (no gaps, correct decimal insertions)
- Disk/roadmap sync
- Plan counter matches actual plan count

### Manifest-Based Validation

**File integrity tracking** (`bin/grd-manifest.js`):

```bash
# Generate SHA256 manifest
node bin/grd-manifest.js generate

# Detect local modifications
node bin/grd-manifest.js detect

# Save patches before update
node bin/grd-manifest.js save-patches
```

**What it validates:**
- File additions/deletions/modifications
- SHA256 hash integrity
- Patch backup/restore correctness

## Test Patterns

### Pattern 1: Frontmatter Schema Validation

**Location:** `bin/grd-tools.js` (frontmatter validate command)

```javascript
frontmatter validate <file> --schema plan|summary|verification
```

**Schemas:**
- `plan`: Requires `phase`, `plan`, `type`, `autonomous`, `wave`
- `summary`: Requires `phase`, `plan`, `status`, `duration_minutes`
- `verification`: Requires `phase`, `verification_level`, `status`

### Pattern 2: File Existence Checks

**Location:** `bin/grd-tools.js` (verify artifacts/key-links)

```javascript
function cmdVerifyArtifacts(cwd, planPath, raw) {
  const artifacts = parseMustHavesBlock(content, 'artifacts');
  const missing = [];
  for (const artifact of artifacts) {
    if (!fs.existsSync(path.join(cwd, artifact.path))) {
      missing.push(artifact.path);
    }
  }
  return { missing };
}
```

### Pattern 3: Git Commit Validation

**Location:** `bin/grd-tools.js` (verify commits)

```javascript
function cmdVerifyCommits(cwd, hashes, raw) {
  const results = [];
  for (const hash of hashes) {
    try {
      execGit(cwd, ['rev-parse', '--verify', hash]);
      results.push({ hash, valid: true });
    } catch {
      results.push({ hash, valid: false });
    }
  }
  return results;
}
```

### Pattern 4: Summary File Validation

**Location:** `bin/grd-tools.js` (verify-summary)

Validates SUMMARY.md structure:
- Frontmatter present with required fields
- Objective section present
- Tasks section present
- Commits section with valid git hashes
- Optionally checks `files_modified` count

### Pattern 5: Safe File Operations

**Pattern used throughout:**
```javascript
function safeReadFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}
```

**Validation before writes:**
```javascript
if (fs.existsSync(path)) {
  // Read existing content first
  const existing = fs.readFileSync(path, 'utf-8');
  // Merge or update
  fs.writeFileSync(path, updated, 'utf-8');
}
```

## Test Commands

**Verification suite** (via grd-tools.js):

```bash
# Structure validation
node bin/grd-tools.js verify plan-structure .planning/phases/01-setup/01-01-PLAN.md

# Phase completeness
node bin/grd-tools.js verify phase-completeness 01

# Reference validation
node bin/grd-tools.js verify references .planning/phases/01-setup/01-01-PLAN.md

# Commit validation
node bin/grd-tools.js verify commits abc123 def456

# Artifact validation
node bin/grd-tools.js verify artifacts .planning/phases/01-setup/01-01-PLAN.md

# Key link validation
node bin/grd-tools.js verify key-links .planning/phases/01-setup/01-01-PLAN.md

# Consistency check
node bin/grd-tools.js validate consistency
```

**Manifest validation:**

```bash
# Check for modifications
node bin/grd-manifest.js detect

# Output format
{
  "version": "0.0.4",
  "total_tracked": 142,
  "modifications": [],
  "additions": [],
  "deletions": [],
  "clean": true
}
```

## CI Integration

**None detected.**

No CI configuration files found:
- No `.github/workflows/` directory
- No `.gitlab-ci.yml`
- No `circle.yml`
- No Travis CI config

**Plugin hooks** (`.claude-plugin/plugin.json`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js\" verify-path-exists .planning 2>/dev/null || true",
        "timeout": 5
      }
    ]
  }
}
```

This hook validates `.planning/` directory exists at session start.

## Coverage

**No coverage tooling detected.**

No coverage configuration or instrumentation:
- No `nyc` (Istanbul) config
- No `c8` config
- No coverage scripts in package.json

## Quality Gates

### Implicit Gates Through Execution

The GRD workflow includes verification gates enforced by agents:

**1. Plan checker** (`grd-plan-checker` agent):
- Validates plan structure before execution
- Checks frontmatter completeness
- Verifies task breakdown quality

**2. Verifier** (`grd-verifier` agent):
- Runs after phase execution
- Validates success criteria met
- Checks artifacts produced
- Verifies experiment results (for R&D phases)

**3. Code reviewer** (`grd-code-reviewer` agent):
- Reviews code changes per wave or per plan
- Severity gate: blocker/critical/warning
- Auto-fix option for warnings

**Configuration** (`.planning/config.json`):
```json
{
  "plan_checker": true,
  "verifier": true,
  "code_review_enabled": true,
  "code_review_timing": "per_wave",
  "code_review_severity_gate": "blocker"
}
```

## Self-Test Mechanisms

### 1. Config Validation

**Auto-initialization:**
```bash
node bin/grd-tools.js config-ensure-section
```

Creates `.planning/config.json` with valid defaults if missing.

### 2. State Consistency

**Automatic checks during workflow:**
- Phase numbering gaps detected
- Disk/roadmap sync verified
- Plan counters validated

### 3. Reference Integrity

**Cross-file reference validation:**
- `@file` references checked before plan execution
- File paths in must_haves verified before marking plan complete
- Commit hashes validated before summary acceptance

## Testing Philosophy

**"Living system validation"** — instead of unit tests, GRD validates:

1. **Structural correctness** through schema validation (frontmatter, YAML)
2. **Referential integrity** through cross-file checks (git commits, file paths)
3. **Workflow completeness** through phase/plan tracking (summaries, artifacts)
4. **File integrity** through SHA256 manifests (detect changes)

**Verification is embedded in the workflow:**
- Plans are verified before execution (`grd-plan-checker`)
- Work is verified after execution (`grd-verifier`)
- Code is reviewed during/after execution (`grd-code-reviewer`)
- State consistency validated on each operation

This approach validates **actual execution** rather than **mocked scenarios**, ensuring the tool works correctly in real projects.

---

*Testing analysis: 2026-02-12*
