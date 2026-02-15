# Continuation Format

Standard format for presenting next steps after completing a command or workflow.

## Core Structure

```
---

## ▶ Next Up

**{identifier}: {name}** — {one-line description}

`{command to copy-paste}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `{alternative option 1}` — description
- `{alternative option 2}` — description

---
```

## Format Rules

1. **Always show what it is** — name + description, never just a command path
2. **Pull context from source** — ROADMAP.md for phases, PLAN.md `<objective>` for plans
3. **Command in inline code** — backticks, easy to copy-paste, renders as clickable link
4. **`/clear` explanation** — always include, keeps it concise but explains why
5. **"Also available" not "Other options"** — sounds more app-like
6. **Visual separators** — `---` above and below to make it stand out

## Variants

### Execute Next Plan

```
---

## ▶ Next Up

**02-03: Implement Attention Module** — Add multi-head attention with position encoding

`/grd:execute-phase 2`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- Review plan before executing
- `/grd:list-phase-assumptions 2` — check assumptions

---
```

### Plan a Phase

```
---

## ▶ Next Up

**Phase 2: Implement SwinIR** — Port architecture and train on our dataset

`/grd:plan-phase 2`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/grd:discuss-phase 2` — gather context first
- `/grd:research-phase 2` — investigate unknowns
- `/grd:eval-plan 2` — design evaluation criteria first
- Review roadmap

---
```

### Phase Complete, Ready for Evaluation

```
---

## ✓ Phase 3 Complete (implement)

3/3 plans executed | Tier 2 proxy: PSNR 30.2 dB

## ▶ Next Up

**Phase 4: Evaluate SwinIR** — Full benchmark evaluation on all datasets

`/grd:plan-phase 4`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/grd:eval-plan 4` — design evaluation plan
- `/grd:assess-baseline` — update baseline before eval
- Review Phase 3 results

---
```

### After Evaluation (Iteration Decision)

```
---

## Eval Complete: Phase 4

PSNR: 30.2 dB (target: 30.0 ✓) | SSIM: 0.883 (target: 0.900 ✗)

## ▶ Next Up

**Iterate on SSIM** — Address perceptual quality gap

`/grd:iterate`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/grd:survey` — re-survey for perceptual loss techniques
- `/grd:progress` — review full project status
- Continue to integration (accept current metrics)

---
```

### Milestone Complete

```
---

## Milestone v1.0 Complete

All 6 phases shipped | PSNR: 30.2 dB | SSIM: 0.891

## ▶ Next Up

**Start v1.1** — questioning → survey → requirements → roadmap

`/grd:new-milestone`

<sub>`/clear` first → fresh context window</sub>

---
```

## Pulling Context

### For phases (from ROADMAP.md):

```markdown
### Phase 2: Implement SwinIR
**Goal**: Port architecture and train on our dataset
**Type**: implement
```

Extract: `**Phase 2: Implement SwinIR** — Port architecture and train on our dataset`

### For plans (from PLAN.md `<objective>`):

```xml
<objective>
Implement multi-head attention with relative position encoding.

Purpose: Core component of SwinIR architecture.
Output: Attention module passing Tier 1 sanity check.
</objective>
```

Extract: `**02-03: Implement Attention Module** — Add multi-head attention with position encoding`

## Anti-Patterns

### Don't: Command-only (no context)

```
## To Continue

Run `/clear`, then paste:
/grd:execute-phase 2
```

User has no idea what 02-03 is about.

### Don't: Missing /clear explanation

```
`/grd:plan-phase 3`

Run /clear first.
```

Doesn't explain why. User might skip it.

### Don't: Fenced code blocks for commands

Use inline backticks instead — fenced blocks inside templates create nesting ambiguity.
