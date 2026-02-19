---
description: Mark a milestone version as complete and archive it
argument-hint: [--name milestone-name]
---

<purpose>
Mark a shipped version (v1.0, v1.1, v2.0) as complete. Creates historical record in MILESTONES.md, performs full PROJECT.md evolution review, reorganizes ROADMAP.md with milestone groupings, and tags the release in git.
</purpose>

<required_reading>
1. templates/milestone.md
2. templates/milestone-archive.md
3. `.planning/ROADMAP.md`
4. `.planning/REQUIREMENTS.md`
5. `.planning/PROJECT.md`
</required_reading>

<process>

<step name="verify_readiness">
```bash
ROADMAP=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js roadmap analyze)
```

Verify all phases complete (`disk_status === 'complete'`), `progress_percent` should be 100%.

Present milestone summary with phase/plan breakdown.

<if mode="yolo">
Auto-approve: proceed to gather_stats.
</if>

<if mode="interactive">
Confirm: "Ready to mark this milestone as shipped? (yes / wait / adjust scope)"
</if>
</step>

<step name="gather_stats">
Calculate milestone statistics: phases, plans, tasks, files modified, LOC, timeline, git range.
</step>

<step name="extract_accomplishments">
```bash
for summary in .planning/phases/*-*/*-SUMMARY.md; do
  node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js summary-extract "$summary" --fields one_liner | jq -r '.one_liner'
done
```

Extract 4-6 key accomplishments.
</step>

<step name="evolve_project_full_review">
Full PROJECT.md evolution review: "What This Is" accuracy, Core Value check, Requirements audit (move shipped to Validated, add new to Active), Context update, Key Decisions audit, Constraints check.
</step>

<step name="archive_milestone">
```bash
ARCHIVE=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js milestone complete "v[X.Y]" --name "[Milestone Name]")
```

The CLI handles: creating milestones directory, archiving ROADMAP.md and REQUIREMENTS.md, **archiving all phase directories** to `.planning/milestones/v[X.Y]-phases/`, creating/appending MILESTONES.md entry, updating STATE.md.

After archival, handle: reorganize ROADMAP.md, full PROJECT.md evolution, delete originals.
</step>

<step name="handle_branches">
Check branching strategy and offer merge options. Handle squash merge, merge with history, delete without merging, or keep branches.
</step>

<step name="bump_versions">
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js version bump v[X.Y]
```

Bump VERSION, package.json, and .claude-plugin/plugin.json to match the milestone version.
</step>

<step name="git_tag">
```bash
git tag -a v[X.Y] -m "v[X.Y] [Name] ..."
```
Ask: "Push tag to remote? (y/n)"
</step>

<step name="git_commit_milestone">
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "chore: complete v[X.Y] milestone" --files .planning/milestones/v[X.Y]-ROADMAP.md .planning/milestones/v[X.Y]-REQUIREMENTS.md .planning/MILESTONES.md .planning/PROJECT.md .planning/STATE.md VERSION package.json .claude-plugin/plugin.json
```
</step>

<step name="update_lt_roadmap">
Check if LONG-TERM-ROADMAP.md exists and update LT milestone status:

```bash
LT_LIST=$(node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap list --raw 2>/dev/null || true)
```

**If LT roadmap exists:**
1. Check if v[X.Y] is linked to any LT milestone
2. If linked, check if all normal milestones in that LT milestone are now shipped
3. If all shipped, update LT milestone status to `completed`:
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap update --id [LT-N] --status completed
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap history --action "Completed LT-N" --details "All normal milestones shipped"
```
4. If the next LT milestone exists and is `planned`, update to `active`:
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js long-term-roadmap update --id [LT-N+1] --status active
```
5. Commit changes:
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "docs: update LT roadmap after v[X.Y] completion" --files .planning/LONG-TERM-ROADMAP.md
```
</step>

<step name="offer_next">
```
Milestone v[X.Y] [Name] complete

---

## Next Up

**Start Next Milestone** — questioning -> research -> requirements -> roadmap

`/grd:new-milestone`

<sub>`/clear` first -> fresh context window</sub>

---
```
</step>

</process>

<success_criteria>
- [ ] MILESTONES.md entry created
- [ ] PROJECT.md full evolution review completed
- [ ] ROADMAP.md reorganized with milestone grouping
- [ ] Archives created
- [ ] Phase directories archived to .planning/milestones/v[X.Y]-phases/
- [ ] .planning/phases/ directory is empty
- [ ] REQUIREMENTS.md deleted (fresh for next milestone)
- [ ] STATE.md updated
- [ ] Git tag created
- [ ] Milestone commit made
- [ ] LT roadmap status updated (if applicable)
- [ ] User knows next step (/grd:new-milestone)
</success_criteria>
