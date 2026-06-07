# Life-Harness Phase E — Collective Layer (SKETCH)

**Date:** 2026-06-07
**Status:** DRAFT sketch — for operator review; not yet planned.
**Builds on:** `2026-06-06-life-harness-rounds-grd-host.md` (this repo) and the
canonical rounds design in autoresearch-core, whose §10 explicitly deferred
"cross-project primitive propagation". Naming follows Agented's life-harness
phase ladder (its Phase E: "proven primitives propagate beyond their origin
project").

## 1. Problem

`gd` is installed globally; many projects use GRD. Today a round patches only
the repo it runs in:

- in the **GRD checkout** → improves GRD itself (true self-improvement);
- in a **downstream project** → improves only that project's own files.

A downstream project cannot patch GRD's primitives (they live in the npm
global / plugin cache — not a git repo; the kernel's path guards forbid it,
deliberately). So evidence about *GRD's own behavior* that accrues in
downstream projects — "the executor prompt failed me this way", "this gate
fires too eagerly" — never reaches GRD's evolution.

## 2. Shape: two flows through existing channels

```
downstream project A ─┐  upstream candidates        GRD repo round
downstream project B ─┼─→ CLAUDE_PLUGIN_DATA/ ─────→ CompositeFindingsSource
downstream project C ─┘  harness/upstream/*.jsonl    → patch → review → merge
                                                            │
        gd update / plugin update  ←── npm release ←────────┘
        (gd reapply-patches reconciles local mods)
```

**Flow 1 — evidence upstream (new, small).** After a round persists in any
downstream project, the driver emits findings that are *about GRD itself* as
`UpstreamCandidate` records into `CLAUDE_PLUGIN_DATA/harness/upstream/`.
Selection v1 is a conservative heuristic: findings whose content references
`gd `/`/grd:` commands, GRD agent names, or harness vocabulary — plus the
round's own outcome metadata (a rejected patch in project A is signal for
GRD). No LLM call, no network; CLAUDE_PLUGIN_DATA is local-machine state GRD
already owns.

**Flow 2 — aggregation in the GRD repo (new, small).** When the repo is the
upstream root (explicit `harness.upstream_root: true` in GRD's own
`.planning/config.json` — no magic detection), the driver binds a
`CompositeFindingsSource`: local Tesserae findings + pending upstream
candidates. Candidates arrive as ordinary `Finding`s with
`source="upstream:<project>:<session>"`, so proposal rationales cite their
origin. Consumed candidates are marked (status flip), and the same content
seen from N projects is deduped with a count — repetition across projects is
*stronger* evidence, and `select_evidence` ordering can use it later.

**Flow 3 — primitives downstream (no new machinery).** Proven patches merge
to GRD main, ship via the normal npm/plugin release; `gd update` +
`gd reapply-patches` already reconcile local modifications. Phase E adds
nothing here in v1.

## 3. Data model

`CLAUDE_PLUGIN_DATA/harness/upstream/<origin-slug>.jsonl`, one record per line:

```json
{"id": "<16-hex content hash>", "origin": "<project dir name>",
 "created_at": "...", "kind": "takeaway", "content": "...",
 "source_session": "claude-code:...", "gd_version": "0.4.3",
 "round_id": "20260607-...", "round_status": "rejected|applied|evaluated",
 "status": "pending|consumed"}
```

- `id` = content hash → cross-project dedupe + occurrence counting.
- No transcript text leaves the project — only the already-distilled finding.
- TTL: candidates older than `harness.upstream_ttl_days` (default 90) are
  ignored and pruned on read.

## 4. Config

| Key | Where | Default | Meaning |
|---|---|---|---|
| `harness.upstream_emit` | downstream projects | `true` | emit candidates after each round |
| `harness.upstream_root` | GRD repo only | unset | this repo consumes candidates |
| `harness.upstream_ttl_days` | upstream root | `90` | staleness cutoff |

Kill switch and review-mode semantics are unchanged and apply to both sides.

## 5. Kernel impact

**None required.** `Finding.source` already carries provenance;
`select_evidence` is unchanged in v1. Future (explicitly out of scope): an
occurrence-weighted evidence ranking in the kernel — would be a minor-version
API addition under the version-lock policy.

## 6. Surface

- `gd harness upstream list` — pending candidates by origin, with counts.
- `gd harness upstream clear [--origin <slug>]` — manual prune.
- Round records gain `upstream_emitted: N` / `upstream_consumed: N` fields
  (additive JSON, no schema break).

## 7. Safety notes

- Candidates are local-machine artifacts from the operator's own projects,
  but they still enter a proposal prompt — treat as untrusted text: the
  existing kernel guards (path validation, deny-list, eval gate, review
  default) are the containment; a candidate can *suggest* but never *apply*.
- An origin project cannot force anything: candidates are evidence, not
  patches.
- `upstream_emit` is per-project and a single flag to turn off.

## 8. Open questions (for review)

1. Should rejected-patch hashes from the GRD repo propagate *down* so
   downstream rounds stop re-proposing locally what GRD already refuted?
   (Lean yes, later — needs a hash namespace per target repo.)
2. Heuristic vs LLM classification of "about GRD" — v1 heuristic will have
   false negatives; is that acceptable until volume justifies a classifier?
3. Occurrence weighting in `select_evidence` — kernel change; defer until
   real multi-project data exists.

## 9. Estimated size

~200 lines total across `bin/harness_driver.py` (emit + composite source +
upstream store), `lib/commands/harness.ts` (upstream subcommands), plus
tests. No kernel release needed.
