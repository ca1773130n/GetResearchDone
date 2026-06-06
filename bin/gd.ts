#!/usr/bin/env node
'use strict';

const { join } = require('path') as typeof import('path');
const { readFileSync, existsSync } = require('fs') as typeof import('fs');

const {
  parseFlags,
  classifyCommand,
}: {
  parseFlags: (argv: string[]) => {
    json: boolean;
    help: boolean;
    version: boolean;
    verbose: boolean;
    cwd?: string;
    backend?: string;
    model?: string;
    positional: string[];
    passthrough: string[];
  };
  classifyCommand: (command: string, subcommand?: string) => 'tool' | 'agent' | 'unknown';
} = require('../lib/cli/index');

const {
  runToolCommand,
}: {
  runToolCommand: (
    command: string,
    subcommand: string | undefined,
    extraArgs: string[],
    jsonFlag: boolean,
    cwd: string,
    passthrough?: string[]
  ) => { exitCode: number; stdout: string; stderr: string };
} = require('../lib/cli/tools');

const {
  runAgentCommand,
}: {
  runAgentCommand: (
    command: string,
    args: string[],
    opts: {
      cwd: string;
      backend: string;
      json: boolean;
      verbose: boolean;
      model?: string;
      timeout?: number;
    }
  ) => void;
} = require('../lib/cli/agent');

const flags = parseFlags(process.argv.slice(2));

// --version
if (flags.version) {
  try {
    // Handle both bin/ (source) and dist/bin/ (compiled) locations
    let pkgPath = join(__dirname, '..', 'package.json');
    if (!existsSync(pkgPath)) pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    process.stdout.write(`gd v${pkg.version}\n`);
  } catch {
    process.stdout.write('gd (unknown version)\n');
  }
  process.exit(0);
}

const command = flags.positional[0];
const subcommand = flags.positional[1];
const extraArgs = flags.positional.slice(2);

// --help with no command, or no command at all
if (!command || (flags.help && !command)) {
  printHelp();
  process.exit(0);
}

// Per-command --help
if (flags.help) {
  printCommandHelp(command);
  process.exit(0);
}

const cwd = flags.cwd || process.cwd();
let classification = classifyCommand(command, subcommand);

// Codex r23 P2: `gd execute-phase <N> --dry-run` should hit the tool
// dry-run preview, not the agent execute path. Override the agent
// classification when the user passes --dry-run on an agent command
// that exposes a tool-side dry-run handler.
const DRYRUN_TOOL_OVERRIDES = new Set(['execute-phase']);
if (
  classification === 'agent' &&
  DRYRUN_TOOL_OVERRIDES.has(command) &&
  (extraArgs.includes('--dry-run') || flags.passthrough.includes('--dry-run'))
) {
  classification = 'tool';
}

if (classification === 'tool') {
  const result = runToolCommand(command, subcommand, extraArgs, flags.json, cwd, flags.passthrough);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.exitCode);
} else if (classification === 'agent') {
  const { detectBackend }: { detectBackend: (cwd: string) => string } = require('../lib/backend');
  const backend = flags.backend || detectBackend(cwd);
  runAgentCommand(command, flags.positional.slice(1), {
    cwd,
    backend,
    json: flags.json,
    verbose: flags.verbose,
    model: flags.model,
  });
} else {
  process.stderr.write(`Unknown command: ${command}\nRun "gd --help" for usage.\n`);
  process.exit(1);
}

function printHelp(): void {
  process.stdout.write(`gd — Get Research Done CLI

Usage: gd <command> [args] [--json] [--help] [--version]

Hero verbs (the closed loop):
  init                 Bootstrap a new R&D project from a template
  plan-phase <N>       Compose PLAN.md (Ouroboros context auto-injected)
  execute-phase <N>    Run plans (wave-parallel + worktree-isolated)
  verify-phase <N>     Reflection-loop verifier with Evidence Standard
  autopilot            Run N phases end-to-end (the closed loop)
  evolve               Autonomous self-improvement loop
  harness              Life-harness round: evidence-driven self-improvement (round|status|revert)
  health               Drift score + blockers + Ouroboros status
  think                One-shot project briefing aggregating all primitives
  singularity          % of recent LOC authored by gd evolve itself

Workflow:
  new-milestone        Start a new milestone cycle
  autoplan             Auto-generate milestones from discoveries
  progress             Show project progress
  resume-project       Restore project context
  pause-work           Save work state for later
  quick                Execute small ad-hoc tasks

Research:
  survey <topic>       SoTA landscape scan
  deep-dive <paper>    Paper deep analysis
  compare-methods      Compare research methods
  feasibility <topic>  Paper-to-production gap analysis

Planning:
  product-plan         Product-level planning
  discuss-phase <N>    Brainstorm before planning
  add-phase            Add a new phase
  insert-phase         Insert phase between existing ones
  remove-phase         Remove an unstarted phase

Evaluation:
  assess-baseline      Current performance baseline
  eval-report <N>      Collect and analyze results
  iterate <N>          Iteration loop on failed metrics
  verify-work          Validate features with metrics

Configuration:
  settings             Configure workflow settings
  principles           Create/edit project principles
  discover [area]      Discover codebase standards
  tracker-setup        Configure issue tracker

Tools (deterministic, fast):
  state <sub>          State management
  verify <sub>         Verification suite (incl. \`verify mechanical\`)
  phase <sub>          Phase lifecycle ops
  scaffold <sub>       Directory scaffolding
  frontmatter <sub>    YAML frontmatter CRUD
  tracker <sub>        Issue tracker sync
  roadmap <sub>        Roadmap queries
  init <sub>           Workflow init contexts (internal)
  version              Print version
  phases               List all phases

Ouroboros primitives (see docs/ouroboros-loop.md):
  dead-end <sub>       DEAD-ENDS.md registry CRUD + promote-from-phase
  genome <sub>         GENOME.md init / show / snapshot
  plan-tournament      Score candidate PLAN.md files
  scan                 Prompt-injection scanner

Auxiliary (run \`gd <cmd> --help\` for details):
  diagnose, blame, budget, impact, freshness, rollback, estimate,
  estimate-phase, forecast-phase, check-plans, check-assumptions,
  deps, deps-risk, knowledge, knowhow, eval, tail, watch,
  research-gaps, import-knowhow, import-knowledge, export-research,
  import-research, metrics

Note: dashboard, health-check, coverage-report, phase-time-budget,
todo-duplicates, markdown-split, and setup are DEPRECATED — see
docs/DEPRECATIONS.md for the v0.4.x trim plan.

Global Flags:
  --json               Machine-parseable JSON output
  --help               Show help text
  --verbose            Extended output
  --version            Print version and exit
  --cwd <path>         Override working directory
  --backend <id>       Force a specific backend (agent commands only)
  --model <name>       Override model (agent commands only)

Run "gd <command> --help" for command-specific usage.
`);
}

function printCommandHelp(cmd: string): void {
  const resolvedCmd = cmd;
  // Handle both bin/ (source) and dist/bin/ (compiled) locations
  let cmdFile = join(__dirname, '..', 'commands', `${resolvedCmd}.md`);
  if (!existsSync(cmdFile)) cmdFile = join(__dirname, '..', '..', 'commands', `${resolvedCmd}.md`);
  if (existsSync(cmdFile)) {
    const content = readFileSync(cmdFile, 'utf-8');
    const match = content.match(/description:\s*(.+)/);
    if (match) {
      process.stdout.write(`gd ${cmd}: ${match[1].trim()}\n\n`);
    }
  }
  process.stdout.write(`Usage: gd ${cmd} [args] [--json] [--verbose]\n`);
}
