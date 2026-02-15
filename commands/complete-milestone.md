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

The CLI handles: creating milestones directory, archiving ROADMAP.md and REQUIREMENTS.md, creating/appending MILESTONES.md entry, updating STATE.md.

After archival, handle: reorganize ROADMAP.md, full PROJECT.md evolution, delete originals.
</step>

<step name="handle_branches">
Check branching strategy and offer merge options. Handle squash merge, merge with history, delete without merging, or keep branches.
</step>

<step name="git_tag">
```bash
git tag -a v[X.Y] -m "v[X.Y] [Name] ..."
```
Ask: "Push tag to remote? (y/n)"
</step>

<step name="git_commit_milestone">
```bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js commit "chore: complete v[X.Y] milestone" --files .planning/milestones/v[X.Y]-ROADMAP.md .planning/milestones/v[X.Y]-REQUIREMENTS.md .planning/MILESTONES.md .planning/PROJECT.md .planning/STATE.md
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
- [ ] REQUIREMENTS.md deleted (fresh for next milestone)
- [ ] STATE.md updated
- [ ] Git tag created
- [ ] Milestone commit made
- [ ] User knows next step (/grd:new-milestone)
</success_criteria>
