'use strict';

const { spawnSync } = require('child_process') as typeof import('child_process');
const { getAdapter, checkBackendAvailable } = require('./adapters') as typeof import('./adapters');
const { formatJson, formatError } = require('./output') as typeof import('./output');

/**
 * Build the prompt string for an agent command.
 */
function buildPromptForCommand(command: string, args: string[]): string {
  const argsStr = args.length > 0 ? ' ' + args.join(' ') : '';
  return `/grd:${command}${argsStr}`;
}

interface AgentOpts {
  cwd: string;
  backend: string;
  json: boolean;
  verbose: boolean;
  model?: string;
  timeout?: number;
}

/**
 * Execute an agent command by spawning a backend subprocess.
 */
function runAgentCommand(command: string, args: string[], opts: AgentOpts): void {
  if (!checkBackendAvailable(opts.backend)) {
    const msg = `Backend "${opts.backend}" CLI not found. Install it or set --backend to an available option.`;
    if (opts.json) {
      process.stdout.write(formatError(msg, opts.backend, 1) + '\n');
    } else {
      process.stderr.write(`Error: ${msg}\n`);
    }
    process.exit(1);
  }

  const prompt = buildPromptForCommand(command, args);
  const adapter = getAdapter(opts.backend);
  const cliArgs = adapter.buildArgs(prompt, { model: opts.model, verbose: opts.verbose });

  const startTime = Date.now();
  const result = spawnSync(adapter.binary, cliArgs, {
    cwd: opts.cwd,
    stdio: opts.json ? 'pipe' : 'inherit',
    maxBuffer: 50 * 1024 * 1024,
    timeout: opts.timeout || 120 * 60 * 1000,
    env: { ...process.env },
  });

  const duration = Date.now() - startTime;
  const exitCode = result.status ?? 1;

  if (opts.json) {
    const stdout = result.stdout?.toString() || '';
    process.stdout.write(formatJson({
      status: exitCode === 0 ? 'ok' : 'error',
      output: stdout,
      meta: { backend: opts.backend, duration_ms: duration, exit_code: exitCode },
    }) + '\n');
  }

  process.exit(exitCode);
}

module.exports = { buildPromptForCommand, runAgentCommand };
export { buildPromptForCommand, runAgentCommand };
