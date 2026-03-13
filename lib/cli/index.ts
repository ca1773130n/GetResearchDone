'use strict';

interface Flags {
  json: boolean;
  help: boolean;
  version: boolean;
  verbose: boolean;
  cwd?: string;
  backend?: string;
  model?: string;
  positional: string[];
  passthrough: string[];
}

const TOOL_COMMANDS = new Set([
  'state', 'verify', 'phase', 'scaffold', 'frontmatter', 'tracker',
  'roadmap', 'init', 'milestone', 'validate', 'state-snapshot',
  'summary-extract', 'history-digest', 'phase-plan-index', 'detect-backend',
  'resolve-model', 'version', 'dashboard', 'health', 'health-check',
  'coverage-report', 'quality-analysis', 'todo', 'worktree', 'search',
  'generate-slug', 'config-set', 'config-diff', 'phase-detail', 'phase-risk',
  'phase-readiness', 'milestone-health', 'decision-timeline', 'parallel-progress',
  'find-phase', 'commit', 'verify-summary', 'template', 'current-timestamp',
  'list-todos', 'verify-path-exists', 'config-ensure-section', 'phases',
  'migrate-dirs', 'setup', 'citation-backlinks', 'eval-regression-check',
  'phase-time-budget', 'import-knowledge', 'todo-duplicates', 'markdown-split',
  'overstory', 'progress',
]);

const AGENT_COMMANDS = new Set([
  'new-project', 'new-milestone', 'plan-phase', 'execute-phase', 'verify-phase',
  'autopilot', 'autoplan', 'evolve', 'resume-project', 'pause-work', 'quick',
  'migrate', 'survey', 'deep-dive', 'compare-methods', 'feasibility',
  'product-plan', 'discuss-phase', 'list-phase-assumptions', 'long-term-roadmap',
  'add-phase', 'insert-phase', 'remove-phase', 'complete-milestone',
  'plan-milestone-gaps', 'assess-baseline', 'eval-report', 'iterate',
  'verify-work', 'settings', 'principles', 'discover', 'tracker-setup',
  'sync', 'check-todos', 'add-todo', 'map-codebase', 'update',
  'reapply-patches', 'help', 'debug', 'requirement',
]);

const EVOLVE_TOOL_SUBS = new Set(['run', 'discover', 'state', 'advance', 'reset']);

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    json: false, help: false, version: false, verbose: false,
    positional: [], passthrough: [],
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--json') { flags.json = true; }
    else if (arg === '--help' || arg === '-h') { flags.help = true; }
    else if (arg === '--version' || arg === '-v') { flags.version = true; }
    else if (arg === '--verbose') { flags.verbose = true; }
    else if (arg === '--cwd' && i + 1 < argv.length) { flags.cwd = argv[++i]; }
    else if (arg === '--backend' && i + 1 < argv.length) { flags.backend = argv[++i]; }
    else if (arg === '--model' && i + 1 < argv.length) { flags.model = argv[++i]; }
    else if (arg.startsWith('--')) {
      flags.passthrough.push(arg);
      // If the next arg doesn't start with --, treat it as the value for this flag
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        flags.passthrough.push(argv[++i]);
      }
    }
    else { flags.positional.push(arg); }
    i++;
  }

  return flags;
}

function classifyCommand(command: string, subcommand?: string): 'tool' | 'agent' | 'unknown' {
  if (command === 'evolve' && subcommand && EVOLVE_TOOL_SUBS.has(subcommand)) {
    return 'tool';
  }
  if (TOOL_COMMANDS.has(command)) return 'tool';
  if (AGENT_COMMANDS.has(command)) return 'agent';
  return 'unknown';
}

module.exports = { parseFlags, classifyCommand, TOOL_COMMANDS, AGENT_COMMANDS };
export { parseFlags, classifyCommand, Flags, TOOL_COMMANDS, AGENT_COMMANDS };
