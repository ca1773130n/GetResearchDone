'use strict';

interface CliAdapter {
  binary: string;
  buildArgs(prompt: string, opts: { model?: string; verbose?: boolean }): string[];
}

const BUILTIN_ADAPTERS: Record<string, CliAdapter> = {
  claude: {
    binary: 'claude',
    buildArgs: (prompt, opts) => [
      '-p', prompt, '--verbose', '--dangerously-skip-permissions',
      ...(opts.model ? ['--model', opts.model] : []),
      '--output-format', 'json',
    ],
  },
  codex: {
    binary: 'codex',
    buildArgs: (prompt, opts) => [
      '--prompt', prompt, '--approval-mode', 'full-auto',
      ...(opts.model ? ['--model', opts.model] : []),
    ],
  },
  gemini: {
    binary: 'gemini',
    buildArgs: (prompt, opts) => [
      '-p', prompt, '--sandbox', 'off',
      ...(opts.model ? ['--model', opts.model] : []),
    ],
  },
  opencode: {
    binary: 'opencode',
    buildArgs: (prompt, opts) => [
      '--non-interactive', '--prompt', prompt,
      ...(opts.model ? ['--model', opts.model] : []),
    ],
  },
  overstory: {
    binary: 'ov',
    buildArgs: (prompt, opts) => [
      'run', '--prompt', prompt,
      ...(opts.model ? ['--model', opts.model] : []),
    ],
  },
};

function getAdapter(backend: string): CliAdapter {
  return BUILTIN_ADAPTERS[backend] || BUILTIN_ADAPTERS.claude;
}

function checkBackendAvailable(backend: string): boolean {
  const adapter = getAdapter(backend);
  try {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    execFileSync('which', [adapter.binary], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

module.exports = { getAdapter, checkBackendAvailable, BUILTIN_ADAPTERS };
export { getAdapter, checkBackendAvailable, CliAdapter, BUILTIN_ADAPTERS };
