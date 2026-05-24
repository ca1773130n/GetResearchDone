# {{PROJECT_NAME}}

**Project shape:** Self-contained CLI tool with golden-file tests
**Template:** `cli-tool` from GRD starters

## Goal

Ship a {{LANGUAGE}} CLI that exposes {{N_VERBS}} core verbs
({{VERB_LIST}}), each tested with golden-file snapshots, packaged for
{{DISTRIBUTION_CHANNEL}}.

## Concepts (ontology)

verb · positional argument · flag · subcommand · golden file ·
snapshot test · stdin / stdout / stderr contract · exit code · help
text · packaging manifest

## Targets

- **Primary:** all {{N_VERBS}} verbs have golden-file tests covering
  happy + 2 sad paths; `--help` text rendered by each verb passes
  golden-file diff
- **Secondary:** binary / package installs cleanly on macOS + Linux
  via `{{DISTRIBUTION_CHANNEL}}`
- **Constraint:** no runtime dependencies outside the standard library
  + at most 2 well-known third-party packages
