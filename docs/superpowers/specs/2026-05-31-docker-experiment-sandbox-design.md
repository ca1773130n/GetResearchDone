# Docker Experiment Sandbox — Design

> Sub-project #4 of the autoresearch harness: deepen the RUN station with an
> opt-in Docker-isolated experiment runner. Spec date: 2026-05-31.

## Goal

Add a Docker-isolated `Runner` alternative to the existing host-subprocess
runner so research-loop experiments (`run.sh` / `run.py`) execute inside a
container — same `Runner` interface, same `__RESULT__` stdout contract, with
graceful degradation to the subprocess runner when Docker is unavailable.

## Motivation

The current RUN station (`lib/research/runner.ts` `createSubprocessRunner`) runs
the generated experiment script directly on the host via `execFileSync(bin,
[scriptFile], { cwd: threadDir })`. It uses `execFileSync` (no shell) so the
script path cannot inject shell commands, but the script body itself runs
**unsandboxed**: full host filesystem access, full network, no resource limits.
The Docker sandbox contains experiment execution: filesystem isolation (only the
iteration dir is visible), no network by default, and CPU/memory/pids caps —
improving both safety and reproducibility.

## Non-Goals

- Replacing the subprocess runner (it remains the default).
- Supporting non-Docker container engines (podman, gVisor) — Docker CLI only.
- Building or publishing images — we pull public base images on demand.
- A "fail-closed / strict" mode — when docker is selected but unavailable we
  degrade to subprocess with a loud warning (decision below).

## Architecture

A new `createDockerRunner` implements the **existing synchronous `Runner`
interface** (`run(plan, threadDir): ExperimentResult`) by shelling out to the
`docker` CLI through an injectable exec function that mirrors `execFileSync`
semantics (returns stdout string; throws `{ status, stdout, stderr, signal }` on
failure). It reuses the shared `parseMetricsLine` and `classifyRunFailure`
helpers already in `runner.ts`.

A `selectRunner(cwd, { timeoutMs })` factory reads config and returns:

- the **docker runner** when `research_sandbox: "docker"` **and** the daemon is
  reachable; otherwise
- the **subprocess runner** (default, or degradation fallback).

The orchestrator's RUN line changes from:

```ts
const runner: Runner = opts.runner || createSubprocessRunner({ timeoutMs: opts.timeout });
```

to:

```ts
const runner: Runner = opts.runner || selectRunner(cwd, { timeoutMs: opts.timeout });
```

`opts.runner` injection (used by tests) is preserved and takes precedence over
config — tests never touch real Docker.

## The docker invocation (tight isolation posture)

```
docker run --rm --name <containerName> \
  --network none \
  --memory 512m --cpus 1 --pids-limit 256 \
  --cap-drop ALL --security-opt no-new-privileges --ipc none \
  --read-only --tmpfs /tmp \
  --mount type=bind,src=<iterDir>,dst=/work -w /work \
  [--user <uid>:<gid>]            # POSIX only
  --entrypoint <bin> <image> /work/<scriptBasename>
```

Where:

- `resolvedScriptPath` = `plan.scriptPath` if absolute, else
  `path.join(threadDir, plan.scriptPath)` (same resolution as the subprocess
  runner), then `fs.realpathSync`-normalized where the path exists.
- **Containment check (security):** `resolvedScriptPath` must resolve to a
  location **inside `threadDir`** (compare realpath-normalized prefixes with a
  trailing separator so `…/threadXfoo` cannot masquerade as `…/threadX`). A
  path outside `threadDir` (absolute elsewhere, or `../` escaping) is **rejected
  before any docker call** — `run` returns `exitCode 1`, `failureClass 'H3'`,
  `runner 'docker'`, and a stderr note. This closes the "hostile/malformed plan
  bind-mounts an arbitrary host dir RW" hole; the subprocess runner's looser
  resolution is not a regression because docker mounts a whole directory.
- `iterDir` = `path.dirname(resolvedScriptPath)` — **only that one directory is
  bind-mounted** (read-write, as `/work`). The thread dir's other contents, the
  repo, and the host FS are not visible to the container.
- `scriptBasename` = `path.basename(resolvedScriptPath)`.
- `bin` = `python3` for `plan.language === 'python'`, else `bash`. Passed via
  `--entrypoint` so a custom image's own `ENTRYPOINT` cannot intercept or
  reinterpret the command.
- `image` = validated `research_sandbox_image` override if set and valid, else
  the language default: `python:3.12-slim` (python) / `bash:5` (shell). **Image
  validation (security):** the value must match a conservative Docker
  reference regex and must not begin with `-` (so it can never be parsed as a
  `docker run` flag such as `--privileged`); an invalid value is ignored (falls
  back to the language default) with a stderr warning. The image always appears
  in the arg vector positioned after all options and immediately before the
  script arg, and `--entrypoint`/`--mount`/etc. are passed as separate array
  elements via `execFileSync` (never string-concatenated).
- `containerName` = `grd-exp-<threadId>-<iteration>-<startMs>` (deterministic
  within a run; lets us force-remove on timeout).
- `--network` value comes from `research_sandbox_network` (`none` default,
  `bridge` to allow network).
- `--memory` / `--cpus` come from validated config (defaults `512m` / `1`).
- `--pids-limit 256` is fixed (not a config knob — YAGNI).
- `--cap-drop ALL --security-opt no-new-privileges --ipc none`: cheap, fixed
  hardening defaults appropriate for running generated experiment code.
- `--read-only --tmpfs /tmp`: rootfs is read-only except the mounted `/work`
  and a writable `/tmp`. Scripts write outputs into `/work` (the iter dir).
- `--user <uid>:<gid>` is added only when `typeof process.getuid === 'function'`
  (POSIX), so container processes don't leave root-owned artifacts in the
  bind-mounted iter dir. Skipped on platforms without `getuid` (e.g. Windows /
  Docker Desktop handles mapping).

Timeout + cleanup: the exec call carries `timeout: timeoutMs` (default 120000),
matching the subprocess runner. With `--rm` the container is removed on normal
exit. On timeout `execFileSync` kills the `docker` CLI but the container can
keep running under the daemon, so the runner **always** issues a best-effort
`docker rm -f <containerName>` in the timeout/error path (errors from the
cleanup call are swallowed). This makes the docker timeout as effective as the
subprocess timeout rather than weaker.

## Result mapping

`ExperimentResult.runner` widens from the literal `'subprocess'` to
`'subprocess' | 'docker'` in `lib/research/types.ts`. The docker runner returns
`runner: 'docker'`; `metrics`, `exitCode`, `durationMs`, `stdoutExcerpt`, and
`failureClass` are produced exactly as in the subprocess runner via the shared
`parseMetricsLine` / `classifyRunFailure` helpers. Per-run docker errors (image
pull failure, transient daemon error) surface through `classifyRunFailure` on
stderr (typically classified `H4`).

## Degradation + warning

`selectRunner` probes the daemon once via the injectable exec:

```
docker version --format {{.Server.Version}}
```

with a short timeout (5s). This fails when the CLI is missing **or** the daemon
is down — exactly the conditions under which we must not run "sandboxed".

- `research_sandbox` unset or `"subprocess"` → return subprocess runner (no
  probe).
- `research_sandbox: "docker"` + probe succeeds → docker runner.
- `research_sandbox: "docker"` + probe fails → write a one-time loud warning to
  `process.stderr`:
  `[research] docker sandbox requested but unavailable — running UNSANDBOXED on host`
  and return the subprocess runner.

The loop never blocks. This matches GRD's graceful-degrade pattern (tesserae,
embedder, resurvey-fetch). The degradation is **also durably observable**:
`result.json` records `runner: "subprocess"` for an iteration that ran on the
host even though `research_sandbox: "docker"` was configured, so a reviewer can
detect after the fact that a run was not sandboxed (no separate flag needed). A
fail-closed mode is intentionally out of scope (see Non-Goals).

## Configuration

Read raw from `.planning/config.json` via a `readSandboxConfig(cwd)` helper that
mirrors `readResurveyConfig` (try/parse/clamp, defaults on any error). All keys
are registered in `KNOWN_CONFIG_KEYS` (`lib/utils.ts`) so `loadConfig` does not
drop them.

| Key | Type / values | Default |
| --- | --- | --- |
| `research_sandbox` | `"subprocess"` \| `"docker"` | `"subprocess"` |
| `research_sandbox_image` | string (overrides both languages) | unset → language default |
| `research_sandbox_memory` | string (docker `--memory`) | `"512m"` |
| `research_sandbox_cpus` | string (docker `--cpus`) | `"1"` |
| `research_sandbox_network` | `"none"` \| `"bridge"` | `"none"` |

Validation (all applied in `readSandboxConfig`, defaults on any failure):

- `research_sandbox`: anything other than `"docker"` → treated as `subprocess`.
- `research_sandbox_network`: anything other than `"bridge"` → `"none"`.
- `research_sandbox_image`: must be a non-empty string, must **not** start with
  `-`, and must match a conservative Docker reference regex
  (`^[a-z0-9]([a-z0-9._/-]*[a-z0-9])?(:[\w][\w.-]*)?(@sha256:[a-f0-9]{64})?$`,
  case-insensitive host allowed); otherwise ignored → language default + warn.
- `research_sandbox_memory`: must match Docker's size format
  (`^\d+(\.\d+)?\s*([bkmg])?$`, case-insensitive); otherwise → `"512m"`.
- `research_sandbox_cpus`: must parse to a finite number `> 0`; otherwise →
  `"1"`. Stored back as a string for the arg vector.

## Security considerations

This runner executes generated experiment code, so untrusted-ish input is
assumed. Each surface is constrained:

- **Image config → flag injection:** rejected by the leading-`-` check and the
  reference regex; the image can never be interpreted as a `docker run` option.
- **`plan.scriptPath` → arbitrary host mount:** rejected by the realpath
  containment check (must resolve inside `threadDir`); otherwise the run fails
  H3 before docker is invoked.
- **Command/entrypoint confusion:** `--entrypoint <bin>` pins the interpreter;
  the script path is a single positional arg element (no shell, no
  concatenation — `execFileSync` array form).
- **Container escape surface:** `--cap-drop ALL`, `--security-opt
  no-new-privileges`, `--ipc none`, `--read-only`, `--network none`, non-root
  `--user`, and resource caps reduce blast radius.
- **Resource exhaustion:** `--memory`/`--cpus`/`--pids-limit` caps plus the exec
  timeout with forced container removal.

The docker runner is never weaker than the existing subprocess runner on any
axis; degradation only ever returns to the subprocess runner's existing
behavior.

## Files

- **Create:** `lib/research/docker-runner.ts` — `createDockerRunner(opts)` +
  `dockerAvailable(exec, timeoutMs)` + `buildDockerArgs(...)` (pure, exported
  for testing) + `validateImage(value)` / containment helper (pure, exported).
- **Create:** `tests/unit/research/docker-runner.test.ts`.
- **Modify:** `lib/research/runner.ts` — add `selectRunner(cwd, { timeoutMs })`
  (reads config, probes daemon, degrades). Keep `createSubprocessRunner`,
  `parseMetricsLine`, `classifyRunFailure` exported and shared.
- **Modify:** `lib/research/orchestrator.ts` — swap the RUN-station runner
  construction to `selectRunner`; add `readSandboxConfig` (or import from
  runner.ts).
- **Modify:** `lib/research/types.ts` — widen `ExperimentResult.runner`.
- **Modify:** `lib/utils.ts` — add the 5 config keys to `KNOWN_CONFIG_KEYS`.
- **Modify:** `tests/unit/research/runner.test.ts` (if present) /
  `orchestrator.test.ts` — selection + degradation wiring.

## Testing strategy

Fully offline via an **injected fake exec** (no real Docker in CI):

- `buildDockerArgs` (pure): asserts the exact arg vector — `--rm`, `--name`,
  `--network none`/`bridge`, `--memory`/`--cpus`/`--pids-limit`, `--cap-drop
  ALL`, `--security-opt no-new-privileges`, `--ipc none`, `--read-only`,
  `--tmpfs /tmp`, `--mount type=bind,src=<iterDir>,dst=/work`, `-w /work`,
  `--user` present only when a uid is supplied, `--entrypoint <bin>`, image
  positioned immediately before the `/work/<script>` arg, image override
  honored, language defaults correct.
- Image validation: a value starting with `-` (`--privileged`) or otherwise
  non-conforming → falls back to the language default (and the arg vector never
  contains the injected flag); a valid `repo:tag`/`@sha256:` value is honored.
- Containment: a `scriptPath` resolving outside `threadDir` (absolute elsewhere
  or `../` escape) → `run` returns H3 with no exec call (assert the fake exec
  was never invoked); an in-`threadDir` path proceeds and mounts its dirname.
- Memory/cpus validation: bad `--memory` (`"lots"`) → `512m`; non-positive/NaN
  `--cpus` → `1`.
- `createDockerRunner.run`: fake exec returns stdout with `__RESULT__ {...}` →
  asserts `runner: 'docker'`, parsed metrics, `exitCode 0`, `failureClass none`;
  fake exec throws (non-zero status / stderr / SIGTERM) → asserts exitCode,
  failure classification (H2/H3/H4), `durationMs >= 0`.
- Timeout cleanup: fake exec throws with `signal: 'SIGTERM'` → asserts a
  follow-up `docker rm -f <name>` call is issued (and that a throw from that
  cleanup call is swallowed, not propagated).
- `dockerAvailable`: exec returns a version string → `true`; exec throws →
  `false`.
- `selectRunner`: config subprocess → subprocess runner (no probe); config
  docker + probe ok → docker runner; config docker + probe throws → subprocess
  runner **and** a stderr warning is emitted.
- Orchestrator wiring: inject a stub runner (existing pattern) to confirm RUN
  still calls `runner.run(plan, threadDir)` and writes `result.json` — unchanged
  behavior; plus a test that with no injected runner and default config it
  selects the subprocess path (no docker calls).

## Known limitations

- On timeout the runner issues a best-effort `docker rm -f <name>`; if that
  cleanup call itself fails (daemon gone), a stopped container could linger
  until the next `docker` GC. This is best-effort by design.
- `--read-only` rootfs + `--user` mapping assume the base image tolerates a
  non-writable rootfs (except `/tmp`/`/work`) and non-root execution. The slim
  defaults (`python:3.12-slim`, `bash:5`) do. Custom images that need a writable
  rootfs or root must adjust — documented, not auto-detected.
- Scripts requiring third-party packages (numpy, pandas, …) must set
  `research_sandbox_image` to an image that bundles them; the slim defaults are
  stdlib-only.
