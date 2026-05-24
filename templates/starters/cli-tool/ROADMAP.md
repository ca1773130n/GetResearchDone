# Roadmap

## v0.1 — minimal CLI

- [ ] **Phase 1: command surface** — define the {{N_VERBS}} verbs;
  argparse / clap / commander scaffold; --help text for each verb;
  golden-file test for each `--help` rendering
- [ ] **Phase 2: core ops happy path** — implement each verb's happy
  path; golden-file snapshot test per verb
- [ ] **Phase 3: error path coverage** — invalid args, missing files,
  network failure where relevant; non-zero exit code + helpful stderr;
  golden-file snapshot per sad path

## v0.2 — packaging

- [ ] **Phase 4: packaging manifest** — package for
  {{DISTRIBUTION_CHANNEL}}; install round-trip test on macOS + Linux
