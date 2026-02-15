# Security Model

GRD executes git and GitHub CLI commands on behalf of users. This document describes the defense-in-depth measures that prevent command injection, path traversal, and destructive operations.

## Shell Execution Policy

All external process calls use Node.js `execFileSync` with argument arrays. The `execSync` function (which invokes a shell) is not imported or used anywhere in the codebase.

`execFileSync` passes arguments directly to the target process without invoking a shell. This prevents injection via shell metacharacters such as semicolons, pipes, dollar-parens, and backticks. User-provided strings (issue titles, comment bodies, file paths) are passed as discrete array elements, never interpolated into a command string.

## Git Operation Whitelist

GRD enforces a subcommand whitelist on all git operations executed through `execGit`.

**Allowed commands:** add, commit, log, status, diff, show, rev-parse, cat-file, check-ignore, ls-files, branch, checkout, merge, rebase, cherry-pick, tag, stash, remote, fetch, pull.

**Blocked commands:** config, push, clean. These are blocked by default because they can modify global state, push to remotes without explicit user intent, or destroy untracked files.

**Blocked flags:** --force, -f, --hard, --delete, -D. These flags are blocked across all subcommands because they enable destructive, non-recoverable operations.

**Override mechanism:** Internal callers can pass `{ allowBlocked: true }` as the third argument to `execGit` to bypass the whitelist. No current call site uses this override; it exists for future cases where a blocked operation is explicitly user-initiated.

## Input Validation

Three validation functions guard inputs before they reach child processes:

**Phase names** (`validatePhaseName`): Accepts only alphanumeric characters, dots, and hyphens matching the pattern `/^\d+(\.\d+)?(-[a-zA-Z0-9-]+)?$/`. Rejects path traversal sequences (`..`, `/`, `\`). The `normalizePhaseName` function also applies inline traversal guards.

**File paths** (`validateFilePath`): Resolves the path and verifies it is contained within the project directory. Rejects null bytes (`\0`). Prevents writes outside the project boundary.

**Git refs** (`validateGitRef`): Accepts only safe characters (`/^[a-zA-Z0-9._\-\/~^]+$/`). Rejects leading dashes to prevent flag injection. Rejects empty or excessively long refs.

## Environment Safety

`process.env.HOME` is accessed with a fallback to `os.homedir()` to prevent null-reference errors in restricted environments. All GRD state files are scoped to the `.planning/` directory within the project root.

## GitHub CLI Security

All `gh` CLI interactions use `execFileSync` with argument arrays, matching the git execution model. The `ghExec` helper in `createGitHubTracker` accepts an array of arguments and passes them directly to the `gh` binary. Authentication checks use the same pattern. All GitHub operations are non-blocking: failures return null or `{ success: false }` rather than throwing.

## Reporting Vulnerabilities

If you discover a security issue in GRD, please open a GitHub issue with the label `security`. For sensitive vulnerabilities, contact the maintainers directly rather than filing a public issue.
