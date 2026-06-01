# Claude JSON Decode + Rate-Limit/Health Rotation — Implementation Plan

> REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.
> **Spec:** `docs/superpowers/specs/2026-06-02-claude-json-ratelimit-rotation-design.md`

Conventions: `'use strict'`, CommonJS, zero `any`, typed requires; commit per task; footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `parseClaudeResult` + `detectFromStdout`

**Files:** `lib/scheduler.ts`, `lib/types.ts` (BackendAdapter optional method), test `tests/unit/scheduler.test.ts`

- [ ] **Test (fixtures = the 3 real probe shapes).** `parseClaudeResult`:
  - healthy array `[{type:system},{type:rate_limit_event,rate_limit_info:{status:'allowed'}},{type:assistant,...},{type:result,subtype:'success',is_error:false,result:'PROBE_OK'}]` → `{text:'PROBE_OK', isError:false, rateLimited:false, loggedOut:false, resetsAtMs:null}`
  - rate-limited (`is_error:true`, `rate_limit_event.rate_limit_info:{status:'rejected',resetsAt:1780606800}`, result:"You've hit your weekly limit") → `{isError:true, rateLimited:true, resetsAtMs:1780606800000, text:null}`
  - logged-out (`is_error:true`, result:"Not logged in · Please run /login", no rate_limit_event) → `{isError:true, loggedOut:true, rateLimited:false}`
  - single `{type:'result',result:'hi',is_error:false}` object → `text:'hi'`
  - plain `'hello'` → `{text:'hello', isError:false, rateLimited:false}`
  - garbage `'{bad'` → `{text:'{bad', isError:false}` (no throw)
  - `resetsAt` invalid (`'nope'` / `-1` / past) → `resetsAtMs:null`

  `detectFromStdout` (via `ADAPTERS.claude.detectFromStdout`): rejected → `{rateLimited:true, resetsAtMs:set, unhealthy:true}`; logged-out → `{unhealthy:true, rateLimited:false}`; healthy → `{unhealthy:false}`; `ADAPTERS.codex.detectFromStdout` is `undefined`.

- [ ] **Run → fail.**

- [ ] **Implement** in `lib/scheduler.ts` (near the adapters):

```ts
interface ClaudeResult { text: string | null; isError: boolean; rateLimited: boolean; loggedOut: boolean; resetsAtMs: number | null; }

export function parseClaudeResult(stdout: string): ClaudeResult {
  const base: ClaudeResult = { text: stdout, isError: false, rateLimited: false, loggedOut: false, resetsAtMs: null };
  const trimmed = (stdout || '').trim();
  if (!trimmed || (trimmed[0] !== '[' && trimmed[0] !== '{')) return base;
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { return base; }
  const events: Array<Record<string, unknown>> = Array.isArray(parsed)
    ? parsed as Array<Record<string, unknown>>
    : [parsed as Record<string, unknown>];
  const resultEv = events.find((e) => e && e.type === 'result') || (Array.isArray(parsed) ? undefined : events[0]);
  const isError = resultEv ? resultEv.is_error === true : false;
  let rateLimited = false; let resetsAtMs: number | null = null;
  for (const e of events) {
    if (e && e.type === 'rate_limit_event') {
      const info = e.rate_limit_info as { status?: string; resetsAt?: unknown } | undefined;
      if (info && info.status === 'rejected') {
        rateLimited = true;
        const secs = Number(info.resetsAt);
        if (Number.isFinite(secs) && secs > 0) resetsAtMs = secs * 1000;
      }
    }
  }
  const rawResult = resultEv && typeof resultEv.result === 'string' ? resultEv.result as string : null;
  const loggedOut = isError && !!rawResult && /not logged in|\/login/i.test(rawResult);
  // text: result string when healthy; else assistant content; else raw
  let text: string | null;
  if (!isError && rawResult) text = rawResult;
  else if (!isError) {
    const asst = events.filter((e) => e && e.type === 'assistant')
      .map((e) => { const m = e.message as { content?: Array<{ text?: string }> } | undefined; return (m?.content || []).map((c) => c.text || '').join(''); })
      .join('');
    text = asst || stdout;
  } else text = null;
  return { text, isError, rateLimited, loggedOut, resetsAtMs };
}
```

  Add to `_claudeAdapter`:
```ts
  detectFromStdout(stdout: string): { rateLimited: boolean; resetsAtMs: number | null; unhealthy: boolean } {
    const r = parseClaudeResult(stdout);
    return { rateLimited: r.rateLimited, resetsAtMs: r.resetsAtMs, unhealthy: r.rateLimited || r.loggedOut };
  },
```
  Add optional `detectFromStdout?(stdout: string): { rateLimited: boolean; resetsAtMs: number | null; unhealthy: boolean };` to `BackendAdapter` in `lib/types.ts`. Export `parseClaudeResult` in `module.exports`.

- [ ] **Run → pass; build:check; commit** `feat(scheduler): parseClaudeResult + claude detectFromStdout (rotation task 1)`.

---

### Task 2: Rotate on unhealthy + non-zero exit at exhaustion

**Files:** `lib/scheduler.ts` (~1193 post-spawn), test `tests/unit/scheduler.test.ts`

- [ ] **Test** (inject a fake claude adapter + spawn via the scheduler's existing test harness; two accounts): first account stdout = rate-limited array, second = healthy array → `scheduler.spawn` resolves from the second account, and the first account's `state.cooldown_until` ≈ `resetsAtMs`. Both accounts rate-limited → resolved `exitCode` is non-zero (not `0`). (Mirror the existing rotation tests' setup at scheduler.test.ts ~594+.)

- [ ] **Run → fail.**

- [ ] **Implement** at the post-spawn block (replace the `if (adapter.isRateLimited(...))` block ~1193):

```ts
      const det = adapter.detectFromStdout ? adapter.detectFromStdout(result.stdout || '') : null;
      const unhealthy = (det && det.unhealthy) || adapter.isRateLimited(result.exitCode, result.stderr || '');
      if (unhealthy) {
        const now = Date.now();
        const floor = now + Math.max(prediction.window_minutes || 60, 5) * 60 * 1000;
        state.cooldown_until = det && det.resetsAtMs && det.resetsAtMs > now ? det.resetsAtMs : floor;
        if (retryCount >= maxRetries) {
          return { ...result, exitCode: result.exitCode === 0 ? 1 : result.exitCode };
        }
        return _spawnWithRetry(prompt, opts, retryCount + 1);
      }
      return result;
```

- [ ] **Run → pass; build:check; lint; commit** `feat(scheduler): rotate on JSON-detected unhealthy + non-zero exhaustion exit (rotation task 2)`.

---

### Task 3: `computeSoonestRecovery` + fallback respect `cooldown_until`

**Files:** `lib/scheduler.ts`, test `tests/unit/scheduler.test.ts`

- [ ] **Test:** `computeSoonestRecovery` with an account that has a far-future `cooldown_until` and no samples → returns that cooldown when within `maxWaitMs` (and `null` when beyond). `resolveAccount` fallback: fallback backend's first account in cooldown, second not → returns the second (not the cooled first); all fallback accounts cooled → returns empty-config_dir default.

- [ ] **Run → fail.**

- [ ] **Implement:**
  - In `computeSoonestRecovery`, inside the account loop, before the `samples.length===0` continue, also consider cooldown: `if (state && state.cooldown_until && state.cooldown_until > now && state.cooldown_until < soonest) soonest = state.cooldown_until;` (so cooled accounts contribute their recovery even with no samples).
  - In `resolveAccount` fallback block, replace `fallbackAccounts[0]` selection with: pick the first `a` in `fallbackAccounts` whose `states.get(\`${fallbackBackend}/${a.config_dir}\`)?.cooldown_until` is absent or `<= now`; if none, fall through to the empty-config_dir default.

- [ ] **Run → pass; build:check; commit** `fix(scheduler): cooldown-aware recovery + fallback selection (rotation task 3)`.

---

### Task 4: `decodeSpawnStdout` handles the event array

**Files:** `lib/research/orchestrator.ts`, test `tests/unit/research/orchestrator.test.ts`

- [ ] **Test:** `decodeSpawnStdout('[{"type":"result","is_error":false,"result":"__HYPOTHESIS__ {...}"}]')` → returns the `result` string; an array with only an `assistant` event → returns its text; `'{"result":"x"}'` → `'x'`; plain `'hi'` → `'hi'`.

- [ ] **Run → fail.**

- [ ] **Implement:** extend `decodeSpawnStdout` — if `trimmed[0]==='['`, JSON.parse, find `type:'result'` with string `result` → return it; else concat `assistant` text; else fall through to raw. Keep the existing `{...}`/`.result` and raw paths. (Reuse the same logic shape as `parseClaudeResult`; do NOT import scheduler — keep orchestrator self-contained with a tiny inline parse.)

- [ ] **Run → pass; build:check; lint; commit** `fix(research): decodeSpawnStdout unwraps claude event array (rotation task 4)`.

---

### Task 5: Verify + finish

- [ ] `npx jest tests/unit/scheduler.test.ts tests/unit/research/` → pass; `npm run build:check`; `npm run lint`; `npm test` (full).
- [ ] Codex-rescue review of the diff (`codex exec --ignore-user-config </dev/null`).
- [ ] superpowers:finishing-a-development-branch → merge `--no-ff` + push.
- [ ] **Live re-run** `gd research "<bounded q>"` with the rotation config → confirm it rotates past logged-out `~/.claude` + limited personal1 to healthy personal2 and produces a real hypothesis.

---

## Self-Review
- Spec coverage: parse+detect (T1), rotate+P1-exhaustion (T2), P2a cooldown recovery/fallback (T3), Bug A decode (T4), verify+live (T5). ✓
- Types: `detectFromStdout?` optional on BackendAdapter (codex/gemini unaffected); `parseClaudeResult` exported. ✓
- No scheduler stdout mutation (other consumers safe). ✓
