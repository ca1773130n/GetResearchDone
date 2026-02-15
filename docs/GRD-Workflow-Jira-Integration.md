# GRD Workflow — Jira (mcp-atlassian) Integration

## Mapping Hierarchy

| GRD Concept | Jira Object | Config Key |
|-------------|-------------|------------|
| Roadmap | Plan (conceptual) | — |
| Milestone | Epic | `milestone_issue_type` |
| Phase | Task (child of Epic) | `phase_issue_type` |
| Plan | Sub-task (child of Task) | `plan_issue_type` |

## Full Workflow with Tracker Operations

```mermaid
flowchart TD
    subgraph INIT["Initialization"]
        NP["/grd:new-project\nPROJECT.md + config.json"]
        SURVEY["/grd:survey\nLANDSCAPE.md"]
        NP --> SURVEY
    end

    subgraph ROADMAP["Roadmap Creation"]
        PP["/grd:product-plan\ngrd-roadmapper → ROADMAP.md"]
        J_EPIC["JIRA: CREATE Epic per milestone\n+ Task per phase\nprepare-roadmap-sync → MCP create_issue\n→ record-mapping → TRACKER.md"]
        PP --> J_EPIC
    end

    subgraph PHASE_MGMT["Phase Management"]
        ADD["/grd:add-phase\nor /grd:insert-phase"]
        REM["/grd:remove-phase"]
        SYNC_MAN["/grd:sync\nManual trigger"]
        RESCHED["JIRA: UPDATE dates\nprepare-reschedule → MCP update_issue\nCascade shifted dates"]
        ADD -. "auto_sync on" .-> RESCHED
        ADD -. "no auto-sync" .-> SYNC_MAN
        REM -. "orphaned Task stays\nno auto-delete" .-> NOSYNC["No Jira operation"]
    end

    subgraph PLANNING["Phase Planning"]
        PLAN["/grd:plan-phase N\ngrd-planner → PLAN.md files"]
        J_SUBTASK["JIRA: CREATE Sub-task per plan\nprepare-phase-sync → MCP create_issue\n→ record-mapping\nSub-tasks linked to parent Task"]
        PLAN --> J_SUBTASK
    end

    subgraph EXECUTION["Phase Execution"]
        EXEC["/grd:execute-phase N\ngrd-executor starts"]
        J_PROG["JIRA: TRANSITION Task\n→ In Progress\nMCP transition_issue"]
        EXEC --> J_PROG

        DONE_EXEC["Execution complete\nSUMMARY.md written"]
        J_SUM["JIRA: ADD COMMENT on Task\nMCP add_comment\nposts SUMMARY.md content"]
        DONE_EXEC --> J_SUM
    end

    subgraph EVAL["Evaluation"]
        EVALR["/grd:eval-report N\ngrd-eval-reporter → EVAL.md"]
        J_EVAL["JIRA: ADD COMMENT on Task\nMCP add_comment\nposts eval results"]
        EVALR --> J_EVAL
    end

    subgraph VERIFY["Verification"]
        VER["/grd:verify-phase N\ngrd-verifier → VERIFICATION.md"]
        J_VER["JIRA: ADD COMMENT on Task\nMCP add_comment\nposts verification"]
        VER --> J_VER
    end

    subgraph COMPLETE["Phase Completion"]
        PHASE_DONE["Phase complete"]
        J_DONE["JIRA: TRANSITION Task\n→ Done\nMCP transition_issue"]
        PHASE_DONE --> J_DONE
    end

    subgraph MILESTONE["Milestone Completion"]
        MS["/grd:complete-milestone\nArchive"]
        MS_NOTE["JIRA: TRANSITION Epic → Done\nMCP transition_issue"]
        MS --> MS_NOTE
    end

    %% Main flow
    INIT --> ROADMAP --> PHASE_MGMT
    ROADMAP --> PLANNING
    PLANNING --> EXECUTION --> EVAL --> VERIFY --> COMPLETE
    COMPLETE --> MS

    %% Iteration loop
    J_EVAL -. "targets not met?\n/grd:iterate" .-> PLAN

    %% Sync manual
    SYNC_MAN --> J_EPIC

    style NP fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style SURVEY fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style PP fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style ADD fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style REM fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style PLAN fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style EXEC fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style EVALR fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style VER fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style PHASE_DONE fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style MS fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style SYNC_MAN fill:#dbeafe,stroke:#2563eb,color:#1e3a5f

    style J_EPIC fill:#d1fae5,stroke:#059669,color:#064e3b
    style J_SUBTASK fill:#d1fae5,stroke:#059669,color:#064e3b

    style J_PROG fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    style J_DONE fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    style MS_NOTE fill:#ffedd5,stroke:#ea580c,color:#7c2d12

    style J_SUM fill:#ede9fe,stroke:#7c3aed,color:#3b0764
    style J_EVAL fill:#ede9fe,stroke:#7c3aed,color:#3b0764
    style J_VER fill:#ede9fe,stroke:#7c3aed,color:#3b0764

    style RESCHED fill:#ffedd5,stroke:#ea580c,color:#7c2d12
    style NOSYNC fill:#f3f4f6,stroke:#9ca3af,color:#4b5563
```

## Color Legend

| Color | Meaning |
|-------|---------|
| Blue | GRD commands/steps |
| Green | Jira CREATE operations (Epic, Task, Sub-task) |
| Orange | Jira TRANSITION operations (In Progress, Done) |
| Purple | Jira COMMENT operations (Summary, Eval, Verification) |
| Gray | No Jira operation |

## Data Flow: Prepare → Execute → Record

```mermaid
flowchart LR
    subgraph PREPARE["1. Prepare (grd-tools.js)"]
        P1["prepare-roadmap-sync\nor prepare-phase-sync"]
        P2["Parse ROADMAP.md / PLAN.md\nDiff against TRACKER.md"]
        P1 --> P2
        P3[/"JSON operations list\n{action, type, summary, ...}"/]
        P2 --> P3
    end

    subgraph EXECUTE["2. Execute (Claude Agent)"]
        E1["Read operations list"]
        E2["For each 'create' op:\nMCP create_issue"]
        E3["For transitions:\nMCP transition_issue"]
        E4["For comments:\nMCP add_comment"]
        E1 --> E2 & E3 & E4
    end

    subgraph MCP["mcp-atlassian Server"]
        M1["Jira REST API\n(auth handled by MCP)"]
    end

    subgraph RECORD["3. Record (grd-tools.js)"]
        R1["record-mapping\n--type milestone/phase/plan\n--key PROJ-1\n--url URL"]
        R2[("TRACKER.md\nIdempotency map")]
        R1 --> R2
    end

    P3 --> E1
    E2 & E3 & E4 --> M1
    M1 --> R1

    style PREPARE fill:#f0f9ff,stroke:#0284c7
    style EXECUTE fill:#fefce8,stroke:#ca8a04
    style MCP fill:#fdf2f8,stroke:#db2777
    style RECORD fill:#f0fdf4,stroke:#16a34a
```

## Jira Object Hierarchy

```mermaid
flowchart TD
    EPIC["Epic\n(Milestone: v1.0)"]
    TASK1["Task\n(Phase 1: Research)"]
    TASK2["Task\n(Phase 2: Implement)"]
    TASK3["Task\n(Phase 3: Evaluate)"]
    SUB1A["Sub-task\n(Plan 1-01)"]
    SUB1B["Sub-task\n(Plan 1-02)"]
    SUB2A["Sub-task\n(Plan 2-01)"]
    SUB2B["Sub-task\n(Plan 2-02)"]
    SUB3A["Sub-task\n(Plan 3-01)"]

    EPIC --> TASK1 & TASK2 & TASK3
    TASK1 --> SUB1A & SUB1B
    TASK2 --> SUB2A & SUB2B
    TASK3 --> SUB3A

    style EPIC fill:#fef3c7,stroke:#d97706,color:#78350f
    style TASK1 fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style TASK2 fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style TASK3 fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
    style SUB1A fill:#f3f4f6,stroke:#6b7280,color:#374151
    style SUB1B fill:#f3f4f6,stroke:#6b7280,color:#374151
    style SUB2A fill:#f3f4f6,stroke:#6b7280,color:#374151
    style SUB2B fill:#f3f4f6,stroke:#6b7280,color:#374151
    style SUB3A fill:#f3f4f6,stroke:#6b7280,color:#374151
```

## Jira Object Lifecycle

```mermaid
stateDiagram-v2
    state "Phase Task Lifecycle" as phase {
        [*] --> Created: product-plan / sync
        Created --> ToDo: Default state
        ToDo --> InProgress: execute-phase start
        InProgress --> Done: Phase verified

        state InProgress {
            [*] --> Executing
            Executing --> SummaryPosted: SUMMARY.md comment
            SummaryPosted --> EvalPosted: EVAL.md comment
            EvalPosted --> VerificationPosted: VERIFICATION.md comment
        }
    }

    note right of phase
        Epic (Milestone) transitions to Done
        when all child Tasks are Done
        (/grd:complete-milestone)
    end note
```

## Operation Matrix

| GRD Command | Jira Operation | MCP Tool | Object |
|-------------|---------------|----------|--------|
| `/grd:product-plan` | CREATE Epic per milestone + Task per phase | `create_issue` | Epic, Task |
| `/grd:sync roadmap` | CREATE missing Epics + Tasks | `create_issue` | Epic, Task |
| `/grd:add-phase` | UPDATE dates (reschedule) | `update_issue` | Task (dates) |
| `/grd:insert-phase` | UPDATE dates (reschedule) | `update_issue` | Task (dates) |
| `/grd:sync reschedule` | UPDATE dates (cascade) | `update_issue` | Epic, Task (dates) |
| `/grd:remove-phase` | (none — orphaned Task stays) | — | — |
| `/grd:plan-phase N` | CREATE Sub-task per plan | `create_issue` | Sub-task → Task |
| `/grd:sync phase N` | CREATE missing Sub-tasks | `create_issue` | Sub-task → Task |
| `/grd:execute-phase N` (start) | TRANSITION → In Progress | `transition_issue` | Task |
| `/grd:execute-phase N` (end) | ADD COMMENT (summary) | `add_comment` | Task |
| `/grd:eval-report N` | ADD COMMENT (eval) | `add_comment` | Task |
| `/grd:verify-phase N` | ADD COMMENT (verification) | `add_comment` | Task |
| Phase verified | TRANSITION → Done | `transition_issue` | Task |
| `/grd:complete-milestone` | TRANSITION → Done | `transition_issue` | Epic |
