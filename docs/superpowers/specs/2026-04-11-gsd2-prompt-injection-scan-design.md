---
milestone: gsd-2-selective-adoption
spec: 1 of 4
status: approved
date: 2026-04-11
owner: cameleon-x
---

# Prompt injection scanner for bundled markdown

## Milestone context

This is the first spec in the `gsd-2-selective-adoption` milestone. The milestone ports four patterns from [gsd-build/gsd-2](https://github.com/gsd-build/gsd-2) v2.67+ that GRD independently does not have, reimplemented in GRD's TypeScript style (approach A: read gsd-2 as reference, reimplement). The milestone explicitly rejects gsd-2's Pi SDK migration, `.gsd/` artifact schema, and VS Code extension — GRD is multi-backend by design and has already independently migrated from v1's markdown-prompts-in-`~/.claude/commands/` model to a TypeScript CLI.

The four specs in ship order:

1. **This spec — Prompt injection scanner for bundled markdown** (smallest, closes a real security gap)
2. Autopilot hardening — stuck-loop detection, idempotency keys, crash recovery (forthcoming spec, inspired by gsd-2 `auto-stuck-detection.ts`, `auto-idempotency.ts`, `auto-start.ts`)
3. Mechanical phase completion — fold complete-phase into post-gate aggregation (forthcoming spec, inspired by gsd-2 ADR-003)
4. Token optimization system — `token_profile` preference with complexity-based routing and budget pressure (forthcoming spec, inspired by gsd-2 v2.67 token optimization)

Attribution for all four specs lives in `CHANGELOG.md` and per-spec `## Attribution` sections. No source-file license headers — since approach A is "reimplement from reference," not "copy with attribution."

## Problem

GRD bundles 108 markdown files (45 commands, 22 agents, 41 templates) that are ingested as LLM context by users and by GRD's own subagents. None of these files are currently scanned for prompt injection patterns. A malicious contributor could merge a PR that embeds:

- System prompt markers (`<system-prompt>`, `<|im_start|>system`)
- Role/instruction overrides (`ignore previous instructions`, `you are now ...`)
- Hidden HTML directives (`<!-- PROMPT: ... -->`)
- Tool call injection (`<tool_call>`, `<function_calls>`)
- Base64-encoded versions of any of the above

Today these would ship unreviewed. gsd-2 solved this in v2.41 with `scripts/docs-prompt-injection-scan.sh` and `scripts/base64-scan.sh` — a pair of bash scanners gated by a CI `docs-check` job. This spec ports the same pattern set and threat model to GRD in idiomatic TypeScript.

A dry-run of the full 18-pattern set against GRD's 108 bundled markdown files (after stripping fenced code blocks and inline backticks, matching gsd-2's behavior) produces **1 hit**: a single benign false positive in `commands/init.md` line 1259 (`"where you are now so improvements are measurable"` matches the `you are now [a-z]` role-injection pattern). The scanner can ship with a one-entry ignorefile and zero additional engineering on the false-positive side.

## Goals

1. Scan bundled markdown in `commands/`, `agents/`, `templates/` (and any other `.md` files in the repo by request) for 18 prompt-injection patterns across 7 categories, matching gsd-2 v2.67's pattern set verbatim.
2. Scan base64-encoded content inside the same files for the same patterns, catching obfuscation bypasses.
3. Expose the scanner as a `gd scan` CLI subcommand with four modes: staged (pre-commit default), diff vs base (CI default), single file, and full repo sweep.
4. Gate PRs via a new `docs-check` job in `.github/workflows/ci.yml`.
5. Provide an opt-in pre-commit hook installer (`npm run hooks:install`) that wires `gd scan` into `.git/hooks/pre-commit`. Not installed by default — surprise-installing git hooks is hostile.
6. Ignorefile format is byte-for-byte compatible with gsd-2's `.prompt-injection-scanignore` so future pattern additions from upstream translate 1:1.
7. Ship with ~64 new jest tests meeting GRD's per-file coverage thresholds.
8. Fix the dead `coleam00/get-shit-done` link in `README.md` as part of this PR (trivial, related to the same attribution story).
9. Fix the stale CLAUDE.md claim about a pre-commit hook running lint — there is no installed hook in the repo today. Replace with accurate language describing the optional `hooks:install` path.

## Non-goals

- Detecting attacks inside `.planning/` content loaded at runtime (different threat model, different spec).
- Scanning non-markdown files (TypeScript, JSON, YAML). gsd-2's scanner is markdown-only and the threat surface is bundled prose that LLMs ingest as context.
- Glob matching in the ignorefile. Paths are matched as exact-prefix strings. Globs can be a follow-up todo.
- Nested encoding (base64 of base64, hex, rot13). An attacker who can double-encode has already defeated the first layer; out of scope for v1.
- Automatic docs-only PR detection to skip non-relevant CI jobs. The scan is fast enough on diff mode that always-running it isn't worth the complexity of detecting docs-only PRs.
- Upstreaming our implementation back to gsd-2 or sharing code with them. These are independent codebases.
- Integrating the scanner as a callable MCP tool in `bin/grd-mcp-server.ts`. Potentially useful (agents could scan untrusted docs they download), but that's a different threat model from "bundled markdown in the repo" and deserves its own spec.

## Architecture

Five new TypeScript modules under `lib/scan/`, one new CLI command under `lib/commands/scan.ts`, one dispatch entry in `bin/gd.ts`, one new script under `scripts/install-hooks.mjs`, one new CI job, one new ignorefile, and four doc/config files updated.

```
lib/scan/
├── patterns.ts         # 18 regex patterns as typed const (single source of truth)
├── strip-markdown.ts   # Pure: stripCodeBlocks(raw: string): string
├── ignorefile.ts       # Pure: loadIgnoreFile, isIgnored
├── injection.ts        # scanProse(files, opts) — applies patterns to stripped prose
└── base64.ts           # scanBase64(files, opts) — extracts base64 blobs, decodes, scans

lib/commands/
└── scan.ts             # Orchestrator — the only module that knows about CLI flags

bin/
└── gd.ts               # +1 subcommand dispatch entry

scripts/
└── install-hooks.mjs   # Opt-in pre-commit installer

.github/workflows/
└── ci.yml              # +1 job "docs-check"

tests/unit/scan/
├── patterns.test.ts
├── strip-markdown.test.ts
├── ignorefile.test.ts
├── injection.test.ts
└── base64.test.ts

tests/integration/
└── scan-cli.test.ts

tests/fixtures/scan/
├── positive-*.md       # One per pattern — should trigger
├── negative-*.md       # Code-block-wrapped variants — should not trigger
└── base64-*.md         # Base64-encoded pattern variants

.prompt-injection-scanignore   # New, at repo root, gsd-2 compatible format
```

### Module boundaries

- `patterns.ts` is a pure data export (`readonly InjectionPattern[]`). Adding or removing patterns requires zero code change elsewhere.
- `strip-markdown.ts` is a pure function `stripCodeBlocks(raw: string): string`. Testable in isolation. No imports from the rest of `lib/scan/`.
- `ignorefile.ts` exposes `loadIgnoreFile(path: string): IgnoreEntry[]` and `isIgnored(file: string, matchText: string, entries: IgnoreEntry[]): boolean`. Pure functions. No imports from the rest of `lib/scan/`.
- `injection.ts` and `base64.ts` both depend on `patterns`, `ignorefile`, and `strip-markdown`, but neither knows about CLI modes, process exit codes, or `--json` vs text rendering. They return structured report objects.
- `lib/commands/scan.ts` is the only module that knows about CLI flags (`--diff`, `--file`, `--all`, `--json`, `--raw`, `--injection-only`, `--base64-only`), `process.exit` codes, and output formatting. It composes the pure modules.

This means adding a third scanner in the future (e.g., a dedicated invisible-unicode scanner with whitelist rules beyond what regex #18 catches) is a drop-in: `scan.ts` composes one more module. The pure modules don't change.

## CLI surface — `gd scan`

```
gd scan                          # Scan staged .md files (pre-commit default)
gd scan --diff <base>            # Scan .md files changed vs <base> (CI mode)
gd scan --file <path>            # Scan a single file
gd scan --all                    # Full repo sweep: commands/, agents/, templates/, docs/
gd scan --injection-only         # Skip the base64 scanner
gd scan --base64-only            # Skip the prose scanner
gd scan --json                   # JSON report (GRD convention from CLAUDE.md)
gd scan --raw                    # Plain text report (matches grd-tools --raw)
gd scan --help                   # Help
```

**Default mode** with no args: `git diff --cached --name-only -- '*.md'` — matches pre-commit use. This is useless in CI (no staged files), so CI must pass `--diff`. This matches gsd-2's default behavior.

**Exit codes:**

- `0` — no unignored hits
- `1` — one or more unignored hits (CI failure signal, pre-commit block signal)
- `2` — configuration or argument error: invalid `--diff` base, unreadable ignorefile, unreadable file, invalid mode combination

**JSON report shape:**

```ts
interface ScanReport {
  version: 1;
  mode: "staged" | "diff" | "file" | "all";
  scanned: number;
  hits: ScanHit[];
  exitCode: 0 | 1 | 2;
}

interface ScanHit {
  file: string;          // path relative to repo root
  line: number;          // 1-indexed
  pattern: string;       // stable id from patterns.ts (e.g. "system_prompt_tag")
  label: string;         // human-readable label
  category: string;      // "Instruction override", etc.
  match: string;         // matched text, truncated to 80 chars
  ignored: boolean;      // true if an ignorefile entry suppressed this hit
  source: "prose" | "base64";  // which scanner found it
}
```

Ignored hits are emitted in JSON output for visibility but do not affect the exit code. Text output (default without `--json`) elides ignored hits unless `--raw` is specified, in which case they appear prefixed with `[IGNORED]`.

## CI integration

New job `docs-check` in `.github/workflows/ci.yml`:

```yaml
docs-check:
  name: Prompt injection scan
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    - run: npm ci
    - run: npx gd scan --diff origin/${{ github.base_ref || 'main' }}
```

- Runs on every PR and push to main.
- No `continue-on-error`. Hits fail the job and block the PR.
- `fetch-depth: 0` is required because `--diff` uses `git diff` against the base branch.

## Pre-commit hook installer (opt-in)

`scripts/install-hooks.mjs`:

1. Check if `.git/hooks/pre-commit` exists. If yes and not `--force`, error with a clear message.
2. Write a shell stub to `.git/hooks/pre-commit`:
   ```bash
   #!/usr/bin/env bash
   # Installed by `npm run hooks:install`
   exec npx gd scan
   ```
3. `chmod +x`.
4. Print confirmation.

Wired via `package.json`:

```json
"scripts": {
  "hooks:install": "node scripts/install-hooks.mjs"
}
```

Not installed via `postinstall`. Users who clone the repo opt in explicitly. The CLAUDE.md update in the rollout section documents this.

## Pattern definitions (`lib/scan/patterns.ts`)

18 patterns, verbatim from gsd-2 v2.67 (`scripts/docs-prompt-injection-scan.sh`). All run against prose with fenced code blocks and inline backtick spans already stripped.

| # | id | Label | Flags | Regex | Category |
|---|---|---|---|---|---|
| 1 | `system_prompt_tag` | System prompt tag | `i` | `<system-prompt>` | System prompt markers |
| 2 | `im_start_system` | im\_start system | `i` | `<\|im_start\|>system` | System prompt markers |
| 3 | `system_label` | SYSTEM label | `i` | `\[SYSTEM\]\s*:` | System prompt markers |
| 4 | `you_are_now` | You are now | `i` | `you are now [a-z]` | Role injection |
| 5 | `ignore_previous` | Ignore previous | `i` | `ignore (all )?previous instructions` | Instruction override |
| 6 | `ignore_prior` | Ignore prior | `i` | `ignore (all )?prior instructions` | Instruction override |
| 7 | `disregard_above` | Disregard above | `i` | `disregard (all )?(above\|previous\|prior)` | Instruction override |
| 8 | `forget_above` | Forget above | `i` | `forget (all )?(above\|previous\|prior) (instructions\|context\|rules)` | Instruction override |
| 9 | `new_instructions` | New instructions | `i` | `new instructions:` | Instruction override |
| 10 | `override_instructions` | Override instructions | `i` | `override (all )?instructions` | Instruction override |
| 11 | `new_role_is` | Your new role is | `i` | `your new role is` | Instruction override |
| 12 | `from_now_on` | From now on | `i` | `from now on,? (you (are\|will\|must\|should)\|act as)` | Instruction override |
| 13 | `html_prompt_comment` | HTML prompt comment | — | `<!--\s*(PROMPT\|INSTRUCTION\|SYSTEM\|OVERRIDE\|INJECT)\s*:` | Hidden HTML directives |
| 14 | `html_ignore_comment` | HTML ignore comment | — | `<!--\s*(ignore\|disregard\|forget\|override)` | Hidden HTML directives |
| 15 | `tool_call_tag` | Tool call tag | — | `(<tool_call>\|<function_call>\|<tool_use>)` | Tool call injection |
| 16 | `invoke_tag` | Invoke tag | — | `(<invoke\|<function_calls>)` | Tool call injection |
| 17 | `encoded_payload` | Encoded payload | `i` | `(eval\|exec\|decode)\((base64\|atob\|btoa)` | Encoded payload |
| 18 | `invisible_unicode` | Invisible unicode | — | `[\u200B\u200C\u200D\uFEFF]` | Obfuscation |

Exported shape:

```ts
export interface InjectionPattern {
  readonly id: string;            // stable slug, used as dictionary key in ignorefile matching
  readonly label: string;         // human-readable for reports
  readonly category: string;
  readonly regex: RegExp;
}

export const INJECTION_PATTERNS: readonly InjectionPattern[] = [...] as const;
```

A 3-line attribution comment at the top of `patterns.ts` credits gsd-2 v2.67 and links to the specific upstream file. Not an MIT license header — just provenance.

## Strip-markdown semantics (`lib/scan/strip-markdown.ts`)

Pure function. Matches gsd-2's awk logic exactly:

1. Any line whose trimmed start is ` ``` ` toggles an in-code flag and is replaced with an empty line (preserving line numbers).
2. Any line inside a fenced code block is replaced with an empty line.
3. On remaining lines, inline backtick spans matching `` /`[^`]+`/ `` (greedy, single backtick delimiters) are replaced with empty string.
4. Lines are joined with `\n` and returned.

**Edge cases covered by tests:**

- Nested fences: GFM does not support nesting; the outer fence closes on the first subsequent ` ``` `. We match this.
- Fence with language marker (` ```ts `): still counts as opening.
- Mid-line fence (` foo ``` bar ``` baz `): gsd-2 anchors at `^\s*\`\`\``, so mid-line fences are not treated as toggles. We match this behavior.
- Unclosed fence at EOF: all trailing lines remain "inside code" and are stripped.
- Multi-backtick spans (` ``code`` `): gsd-2's regex `/\`[^\`]+\`/` is a greedy leftmost match from one backtick to the next non-adjacent backtick. On a double-backtick inline span like `` ``x`` `` it matches the inner `` `x` `` (between the second and third backticks) and strips `x`, leaving `` ` ` `` outside the match. We match that bug-compatible behavior rather than being clever — staying bug-compatible reduces re-port cost if gsd-2 upstream adds patterns.

Line numbers returned in the report refer to the *original* file, not the stripped content, because we only replace-with-empty instead of deleting lines.

## Ignorefile format (`lib/scan/ignorefile.ts`)

File: `.prompt-injection-scanignore` at repo root. Format matches gsd-2 byte-for-byte.

```
# Comment lines begin with #
# Blank lines are ignored.

# File-scoped entry: filepath:regex
# Ignore matches of <regex> only when found in <filepath> (exact prefix match).
commands/init.md:you are now so improvements

# Global entry (no colon): ignore matches of <regex> in any file.
# (none needed for GRD at initial ship)
```

Parser types:

```ts
type IgnoreEntry =
  | { type: "file"; filePath: string; pattern: RegExp }
  | { type: "global"; pattern: RegExp };

export function loadIgnoreFile(path: string): IgnoreEntry[];
export function isIgnored(file: string, matchText: string, entries: IgnoreEntry[]): boolean;
```

**Path matching:** exact-prefix string comparison relative to repo root. No globs in v1.

**Precedence:** any entry that matches a given hit suppresses it. No ordering rules.

**Line parsing:** split on first `:`. If the left side exists as a file path on disk OR matches an existing file in the scanned set, it is a file-scoped entry. Otherwise it is treated as global. (This mirrors gsd-2's heuristic and handles the ambiguous case where a regex contains a colon.)

**Invalid lines:** log a warning to stderr and skip the line. Do not exit — a malformed ignorefile should not block legitimate scans.

**Initial ship entry** (the single known false positive):

```
commands/init.md:you are now so improvements
```

Matches the literal prose on line 1259: `"...Assess current code quality baseline? This measures where you are now so improvements are measurable."`

## Base64 scanner (`lib/scan/base64.ts`)

1. For each scanned file, extract contiguous runs of base64-alphabet characters `[A-Za-z0-9+/=]` of length ≥ 40. (Threshold chosen to match gsd-2 and avoid false matches on short alphanumeric strings.)
2. Attempt to decode each candidate using `Buffer.from(candidate, 'base64').toString('utf8')`. If decoding yields replacement characters (indicating invalid UTF-8) or fewer bytes than expected, skip.
3. Run the full 18-pattern set against the decoded text.
4. Report matches as hits on the line where the base64 blob *started* in the source file, with `source: "base64"` set in the report.

**Fixture tests:**

- Each of the 7 pattern categories, base64-encoded, embedded in a fixture markdown file: must be caught.
- Legitimate base64 (a small embedded PNG data URI): must not trigger.
- Padding variations (`=`, `==`, no padding): must all decode.
- Line-broken base64 (common in MIME-style embeds): must be normalized before decoding.

## Testing strategy

Total: ~64 new jest tests across 6 files. All in `tests/unit/scan/` except `scan-cli.test.ts` which lives in `tests/integration/`.

| File | Tests | Focus |
|---|---|---|
| `patterns.test.ts` | 36 | One positive + one negative (code-block-wrapped) per pattern |
| `strip-markdown.test.ts` | 7 | Fence toggling, language markers, mid-line, unclosed |
| `ignorefile.test.ts` | 6 | Parse valid, invalid, comments, blanks, file-scoped, global, precedence |
| `injection.test.ts` | 4 | Integration: fixture file → expected report structure (including ignored hits) |
| `base64.test.ts` | 6 | Each category encoded, legit base64 negative, padding variants, line-broken |
| `scan-cli.test.ts` | 5 | Spawn `gd scan --file fixture.md --json`, parse, assert exit codes 0/1/2, passthrough flag regression |

**Coverage thresholds:** `lib/scan/*` must meet the per-file thresholds already configured in `jest.config.js`. No threshold reductions.

**Fixtures:** `tests/fixtures/scan/` with `positive-<pattern-id>.md`, `negative-<pattern-id>.md`, `base64-<category>.md` files.

**Unicode pattern (#18) testing gotcha:** zero-width characters in source files break editors and git diff rendering. Solution: the fixture is built programmatically in the test body (`const fixture = "text" + "\u200B" + "more"`) rather than stored on disk.

**Cross-platform note:** CI runs ubuntu-latest. Local developers on macOS use the node runtime for everything — no bash-version issues like gsd-2's shell scanner has.

## Error handling

- **Unreadable file**: log to stderr with the path and error, exit 2.
- **Invalid ignorefile line**: log a warning, skip that line, continue scanning.
- **No files matched by mode filter** (e.g., `gd scan` with nothing staged): exit 0, report `{ scanned: 0, hits: [] }`. Not an error.
- **Binary file accidentally included via a `*.md` rename**: attempt UTF-8 decode; on failure, log a warning and skip.
- **Invalid `--diff` base** (e.g., branch does not exist): exit 2 with a clear message.
- **`gd scan` run outside a git repo with no `--file` flag**: exit 2 with a clear message.
- **No silent fallbacks.** No exception catches that convert failure into success. Exit code 2 propagates.

## Rollout checklist (single PR)

1. Create `lib/scan/patterns.ts`, `strip-markdown.ts`, `ignorefile.ts`, `injection.ts`, `base64.ts`.
2. Create `lib/commands/scan.ts` orchestrator.
3. Wire `scan` subcommand into `bin/gd.ts` dispatch table.
4. Register help entry wherever other `gd` commands register help.
5. Create `scripts/install-hooks.mjs`.
6. Add `scan`, `scan:all`, `hooks:install` scripts to `package.json`.
7. Create `.github/workflows/ci.yml` `docs-check` job.
8. Create `.prompt-injection-scanignore` at repo root with the single known entry.
9. Create `tests/unit/scan/*.test.ts` (5 files) and `tests/integration/scan-cli.test.ts`.
10. Create `tests/fixtures/scan/` with positive, negative, and base64 fixtures.
11. **Fix `README.md` dead link.** Current line 142 points to `github.com/coleam00/get-shit-done` which is HTTP 404. Replace with:
    > Built on [GSD (Get Shit Done)](https://github.com/gsd-build/gsd-2) by Cole Medin (v1 heritage) and the gsd-build team (v2 patterns). Extended for R&D workflows by Cameleon X.
    Add a new `## Security` section pointing to `gd scan --all` and `npm run hooks:install`.
12. **Fix CLAUDE.md stale claim.** Replace the line `"Pre-commit hook runs lint — commits fail on lint errors"` with: `"Pre-commit hook (optional, installed via 'npm run hooks:install') runs 'gd scan' on staged markdown to block prompt injection patterns before commit."`
13. **CHANGELOG entry:**
    > Add prompt injection scanner for bundled markdown (commands/, agents/, templates/). New `gd scan` CLI subcommand with staged / --diff / --file / --all modes, JSON report output, 18 patterns across 7 categories, base64 obfuscation detection, opt-in pre-commit hook installer. Patterns adopted from gsd-2 v2.67 `scripts/docs-prompt-injection-scan.sh` and `scripts/base64-scan.sh`. First spec in the `gsd-2-selective-adoption` milestone.
14. Run `npm test` — confirm 4038 existing tests still pass and ~64 new tests pass with thresholds met.
15. Run `npm run lint` — confirm clean.
16. Run `npm run build:check` — confirm type-clean.

## Out of scope (follow-up todos)

- **Glob matching in ignorefile.** Currently exact-prefix filepath match. Globs like `templates/**/*.md:pattern` can be a follow-up todo.
- **Docs-only PR detection** to skip non-markdown CI jobs. Not worth the complexity at GRD's current CI scale.
- **Scanning `.planning/` runtime content.** Different threat model (runtime-loaded context from user-authored files), needs its own spec.
- **MCP tool exposure** of the scanner for agents that download untrusted docs. Potentially useful, different threat model, separate spec.
- **Resolving the ~35 stale "see GSD original" references** scattered across `templates/`, `agents/`, `references/`, `CONVENTIONS.md`, `.codex/AGENTS.md`, `.opencode/AGENTS.md`, and `docs/CHANGELOG.md`. These point to a dead repo (`coleam00/get-shit-done`) for content that no longer exists. Separate todo tracked at the milestone level. The one reference in `README.md` is fixed in this spec's PR because it is user-visible; the rest are deferred.

## Attribution

Pattern set and threat model adopted from [gsd-build/gsd-2](https://github.com/gsd-build/gsd-2) v2.67, specifically:

- `scripts/docs-prompt-injection-scan.sh` (pattern definitions, strip-markdown behavior, CLI mode semantics, exit codes)
- `scripts/base64-scan.sh` (base64 extraction threshold, decoding approach, shared pattern set)
- `.prompt-injection-scanignore` (ignorefile format)
- `docs/dev/ci-cd-pipeline.md` section "Prompt Injection Scan (v2.41)" (CI integration pattern)

Reimplemented in TypeScript to match GRD's style (strict TypeScript, CommonJS, tsx-based entry points, jest with per-file coverage thresholds). No source files copied verbatim; no MIT license headers required. CHANGELOG entry credits the upstream source.

## Related specs (forthcoming)

- `2026-MM-DD-gsd2-autopilot-hardening-design.md` — Spec 2 of 4: stuck-loop detection, idempotency keys, crash recovery for `gd autopilot`.
- `2026-MM-DD-gsd2-mechanical-completion-design.md` — Spec 3 of 4: fold phase completion into post-gate mechanical aggregation, with LLM fallback for low-quality output.
- `2026-MM-DD-gsd2-token-optimization-design.md` — Spec 4 of 4: `token_profile` preference, complexity-based model routing, budget pressure thresholds.
