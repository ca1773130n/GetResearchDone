---
description: Create or display long-term roadmap
argument-hint: [--refine <version> | --promote <version>]
---

<purpose>
Manage the hierarchical Now/Next/Later long-term roadmap. On first run (no LONG-TERM-ROADMAP.md), launches an interactive wizard to define milestones. On subsequent runs, displays the current roadmap. Supports refinement and promotion of milestones through tiers.
</purpose>

<process>

## Step 0: Detect Mode

```bash
MODE=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap mode --raw)
```

This returns the current planning mode: `progressive` (no LONG-TERM-ROADMAP.md) or `hierarchical` (file exists).

Parse `$ARGUMENTS` for flags:
- `--refine <version>` — jump to **Refine Flow**
- `--promote <version>` — jump to **Promote Flow**
- No flags — **Display or Create Flow**

---

## Display or Create Flow

### If hierarchical mode (LONG-TERM-ROADMAP.md exists):

**Display the current roadmap:**

```bash
DISPLAY=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap display --raw)
```

Present the formatted output to the user, then offer actions:

```
---

## Actions

- `/grd:long-term-roadmap --refine <version>` — refine a milestone with more detail
- `/grd:long-term-roadmap --promote <version>` — move a milestone up a tier
- `/grd:new-milestone` — start executing the Now milestone

---
```

Done.

### If progressive mode (no LONG-TERM-ROADMAP.md):

**Launch the creation wizard.**

**Step 1: Load context**

Read in parallel:
- `.planning/PROJECT.md` — project vision and goals
- `.planning/config.json` — check `autonomous_mode`

**Step 2: Gather milestones**

Check if `autonomous_mode` is true in config. If YOLO mode, synthesize milestones from PROJECT.md context and skip questioning.

Otherwise, present the wizard:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD >>> LONG-TERM ROADMAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Ask inline (freeform):

"Describe 3-5 milestones for your project. For each, give a version number, a name, and a rough goal. The first one becomes your active (Now) milestone."

Wait for response. If the user's response is vague, probe for:
- Version numbers (v0.1.0, v0.2.0, etc.)
- Concrete goals for each milestone
- Rough timeline or ordering
- Dependencies between milestones

**Step 3: Planning horizon**

Use AskUserQuestion:
- header: "Horizon"
- question: "What's your planning horizon?"
- options:
  - "3 months" — Short sprint
  - "6 months (Recommended)" — Standard R&D cycle
  - "12 months" — Long-term research program

**Step 4: Generate the roadmap**

Structure milestones into the format expected by `generateLongTermRoadmap`:
- First milestone = Now (status: "In Progress")
- Milestones 2-3 = Next (status: "Next")
- Remaining = Later (status: "Later")

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap generate \
  --project "<project_name>" \
  --horizon "<planning_horizon>" \
  --milestones '<JSON array of milestone objects>'
```

Each milestone object: `{"version":"v0.1.0","name":"Core Pipeline","status":"In Progress","goal":"Build the core pipeline","start":"2026-02-17"}`

If the CLI `generate` subcommand doesn't accept `--milestones` directly, construct the markdown content manually using the schema from the tutorial and write it to `.planning/LONG-TERM-ROADMAP.md`.

**Step 5: Validate**

```bash
VALID=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap validate --raw)
```

If validation fails, fix issues and re-validate.

**Step 6: Display result**

```bash
DISPLAY=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap display --raw)
```

Present the formatted roadmap.

**Step 7: Log history**

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap history \
  --action "Initial roadmap" \
  --details "Defined <N> milestones: <version list>"
```

**Step 8: Commit**

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "docs: create long-term roadmap" --files .planning/LONG-TERM-ROADMAP.md
```

Present completion:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GRD >>> LONG-TERM ROADMAP CREATED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<DISPLAY output>

## Next Steps

- `/grd:long-term-roadmap --refine <version>` — add detail to a Next/Later milestone
- `/grd:new-milestone` — start working on the Now milestone
```

---

## Refine Flow

Triggered by `--refine <version>` argument.

**Step 1: Parse current state**

```bash
PARSED=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap parse)
TIER=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap tier --version <version> --raw)
```

If version not found, error: "Milestone `<version>` not found in LONG-TERM-ROADMAP.md"

**Step 2: Show current state of the milestone**

Display the milestone's current goal, success criteria, phase sketch, and open questions.

**Step 3: Gather refinements**

Use AskUserQuestion:
- header: "Refine"
- question: "What would you like to refine for <version>?"
- multiSelect: true
- options:
  - "Goal" — Sharpen the objective
  - "Success criteria" — Add measurable targets
  - "Phase sketch" — Break into implementation phases
  - "Open questions" — Update unknowns

For each selected area, ask inline (freeform) for the updated content.

**Step 4: Apply refinements**

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap refine \
  --version <version> \
  --updates '<JSON with updated fields>'
```

The updates JSON may include: `goal`, `success_criteria` (array), `rough_phases` (array), `open_questions` (array).

**Step 5: Log and commit**

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap history \
  --action "Refined <version>" \
  --details "<what was updated>"
```

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "docs: refine milestone <version>" --files .planning/LONG-TERM-ROADMAP.md
```

Display updated milestone state.

---

## Promote Flow

Triggered by `--promote <version>` argument.

**Step 1: Check current tier**

```bash
TIER=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap tier --version <version> --raw)
```

If tier is "now", error: "Milestone `<version>` is already the active (Now) milestone."

**Step 2: Confirm promotion**

Use AskUserQuestion:
- header: "Promote"
- question: "Promote <version> from <current_tier> to <target_tier>?"
- options:
  - "Promote" — Move up one tier
  - "Cancel" — Keep current tier

If "Cancel", exit.

**Step 3: Execute promotion**

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap promote --version <version>
```

**For Next -> Now promotion:**
- Warn if current Now milestone is not completed
- After promotion, suggest: `/grd:new-milestone` to set up phases for the new active milestone

**Step 4: Log and commit**

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap history \
  --action "Promoted <version>" \
  --details "<previous_tier> -> <new_tier>"
```

```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "docs: promote milestone <version>" --files .planning/LONG-TERM-ROADMAP.md
```

Display updated roadmap.

---

</process>

<success_criteria>
- [ ] Progressive mode: wizard creates LONG-TERM-ROADMAP.md with Now/Next/Later tiers
- [ ] Hierarchical mode: displays formatted roadmap overview
- [ ] --refine flag: gathers and applies milestone refinements
- [ ] --promote flag: moves milestone up one tier with confirmation
- [ ] All changes committed with history logged
- [ ] Validation passes after any modification
</success_criteria>
</process>
