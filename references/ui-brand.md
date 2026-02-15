<ui_patterns>

Visual patterns for user-facing GRD output. Orchestrators @-reference this file.

## Stage Banners

Use for major workflow transitions.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD ► {STAGE NAME}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Stage names (uppercase):**
- `QUESTIONING`
- `SURVEYING`
- `RESEARCHING`
- `DEFINING REQUIREMENTS`
- `CREATING ROADMAP`
- `PLANNING PHASE {N}`
- `EXECUTING WAVE {N}`
- `EVALUATING`
- `VERIFYING (TIER {N})`
- `ASSESSING BASELINE`
- `ITERATING`
- `PHASE {N} COMPLETE`
- `MILESTONE COMPLETE`

---

## Checkpoint Boxes

User action required. 62-character width.

```
╔══════════════════════════════════════════════════════════════╗
║  CHECKPOINT: {Type}                                          ║
╚══════════════════════════════════════════════════════════════╝

{Content}

──────────────────────────────────────────────────────────────
→ {ACTION PROMPT}
──────────────────────────────────────────────────────────────
```

**Types:**
- `CHECKPOINT: Verification Required` → `→ Type "approved" or describe issues`
- `CHECKPOINT: Decision Required` → `→ Select: option-a / option-b`
- `CHECKPOINT: Action Required` → `→ Type "done" when complete`
- `CHECKPOINT: Eval Results` → `→ Review metrics and type "continue" or "iterate"`
- `CHECKPOINT: Research Gate` → `→ Review findings and type "proceed" or "pivot"`

---

## Status Symbols

```
✓  Complete / Passed / Verified
✗  Failed / Missing / Blocked
◆  In Progress
○  Pending
⚡ Auto-approved
⚠  Warning
△  Deferred (verification postponed)
↻  Iterating (re-running with changes)
```

---

## Progress Display

**Phase/milestone level:**
```
Progress: ████████░░ 80%
```

**Task level:**
```
Tasks: 2/4 complete
```

**Plan level:**
```
Plans: 3/5 complete
```

**Evaluation level:**
```
Eval: Tier 1 ✓ | Tier 2 ◆ | Tier 3 ○
```

**Baseline comparison:**
```
PSNR: 28.5 → 30.2 dB (+1.7 dB ✓ target: 30.0)
SSIM: 0.85 → 0.88 (+0.03 ✗ target: 0.90)
```

---

## Spawning Indicators

```
◆ Spawning researcher...

◆ Spawning 4 researchers in parallel...
  → Stack research
  → Architecture research
  → Landscape survey
  → Baseline assessment

✓ Researcher complete: STACK.md written

◆ Spawning eval pipeline...
  → Tier 1: Sanity check
  → Tier 2: Proxy evaluation
  △ Tier 3: Deferred to phase completion
```

---

## Next Up Block

Always at end of major completions.

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**{Identifier}: {Name}** — {one-line description}

`{copy-paste command}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- `/grd:alternative-1` — description
- `/grd:alternative-2` — description

───────────────────────────────────────────────────────────────
```

---

## Eval Results Box

Use after evaluation completes.

```
┌──────────────────────────────────────────────────────────────┐
│  EVAL RESULTS: Phase {N} — {Name}                            │
├──────────────────────────────────────────────────────────────┤
│  Tier: {1|2|3}  Runtime: {duration}                          │
│                                                              │
│  Metric       Baseline    Result      Delta    Target        │
│  ──────────   ────────    ──────      ─────    ──────        │
│  PSNR         28.5 dB     30.2 dB     +1.7     30.0  ✓      │
│  SSIM         0.850       0.883       +0.033   0.900 ✗      │
│  Latency      45 ms       42 ms       -3       <50   ✓      │
│                                                              │
│  Verdict: PRIMARY MET (1/1) | SECONDARY MISSED (0/1)        │
└──────────────────────────────────────────────────────────────┘

Decision: Continue with note (secondary tracked in KNOWHOW.md)
```

---

## Error Box

```
╔══════════════════════════════════════════════════════════════╗
║  ERROR                                                       ║
╚══════════════════════════════════════════════════════════════╝

{Error description}

**To fix:** {Resolution steps}
```

---

## Tables

```
| Phase | Type     | Status | Eval Tier | Progress |
|-------|----------|--------|-----------|----------|
| 1     | survey   | ✓      | T1        | 100%     |
| 2     | implement| ◆      | T2        | 60%      |
| 3     | evaluate | ○      | T3        | 0%       |
| 4     | integrate| ○      | T2        | 0%       |
```

---

## Iteration Display

```
───────────────────────────────────────────────────────────────
 GRD ► ITERATING (Attempt 2/3)
───────────────────────────────────────────────────────────────

Trigger: SSIM 0.883 < target 0.900
Action: Re-survey for perceptual loss techniques
Scope: Phase 3 re-plan with loss function change

Previous attempts:
  1. L1 loss only → SSIM 0.850
  2. L1 + VGG perceptual → SSIM 0.883 (current)
───────────────────────────────────────────────────────────────
```

---

## Anti-Patterns

- Varying box/banner widths
- Mixing banner styles (`===`, `---`, `***`)
- Skipping `GRD ►` prefix in banners
- Random emoji
- Missing Next Up block after completions
- Showing raw metric numbers without baseline comparison
- Omitting eval tier in verification displays

</ui_patterns>
