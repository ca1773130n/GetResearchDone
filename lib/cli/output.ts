'use strict';

export interface JsonEnvelope {
  status: 'ok' | 'error';
  data?: unknown;
  output?: string;
  error?: string;
  meta: {
    backend?: string;
    duration_ms?: number;
    exit_code?: number;
  };
}

/**
 * Format a JSON envelope for --json output.
 */
export function formatJson(envelope: JsonEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

/**
 * Format an error as a JSON envelope.
 */
export function formatError(message: string, backend: string, exitCode: number): string {
  return formatJson({
    status: 'error',
    error: message,
    meta: { backend, exit_code: exitCode },
  });
}

/**
 * Write JSON envelope to stdout and exit.
 */
export function outputJson(envelope: JsonEnvelope): void {
  process.stdout.write(formatJson(envelope) + '\n');
  process.exit(envelope.status === 'ok' ? 0 : 1);
}

module.exports = { formatJson, formatError, outputJson };
