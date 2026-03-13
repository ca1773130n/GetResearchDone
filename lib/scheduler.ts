'use strict';

import type { BackendId, BackendAdapter, SpawnOpts } from './types';

// ─── Per-backend CLI Adapters ─────────────────────────────────────────────────

/**
 * Map of backend adapters for all supported CLI backends.
 * Each adapter encapsulates binary name, argument building, token parsing,
 * and rate-limit detection for a specific backend CLI.
 */
export const ADAPTERS: Record<BackendId, BackendAdapter> = {
  claude: {
    binary: 'claude',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['-p', prompt, '--verbose', '--dangerously-skip-permissions'];
      if (opts.maxTurns) {
        args.push('--max-turns', String(opts.maxTurns));
      }
      if (opts.model) {
        args.push('--model', opts.model);
      }
      args.push('--output-format', 'json');
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const totalMatch = stderr.match(/[Tt]otal.tokens:\s*(\d+)/);
      if (totalMatch) return parseInt(totalMatch[1], 10);
      const inputMatch = stderr.match(/input_tokens:\s*(\d+)/);
      const outputMatch = stderr.match(/output_tokens:\s*(\d+)/);
      if (inputMatch && outputMatch) {
        return parseInt(inputMatch[1], 10) + parseInt(outputMatch[1], 10);
      }
      return null;
    },
    isRateLimited(exitCode: number, stderr: string): boolean {
      if (exitCode === 0) return false;
      return /rate.limit|429|overloaded_error|too many requests/i.test(stderr);
    },
  },

  codex: {
    binary: 'codex',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['--prompt', prompt, '--approval-mode', 'full-auto'];
      if (opts.model) {
        args.push('--model', opts.model);
      }
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const match = stderr.match(/"total_tokens":\s*(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited(_exitCode: number, stderr: string): boolean {
      return /rate.limit|429|rate_limit_exceeded/i.test(stderr);
    },
  },

  gemini: {
    binary: 'gemini',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['-p', prompt, '--sandbox', 'off'];
      if (opts.model) {
        args.push('--model', opts.model);
      }
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const match = stderr.match(/tokenCount["\s:]*(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited(_exitCode: number, stderr: string): boolean {
      return /rate.limit|429|RESOURCE_EXHAUSTED|quota/i.test(stderr);
    },
  },

  opencode: {
    binary: 'opencode',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['--non-interactive', '--prompt', prompt];
      if (opts.model) {
        args.push('--model', opts.model);
      }
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const match = stderr.match(/(?:total_tokens|tokens?.used)[\s:"]*(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited(_exitCode: number, stderr: string): boolean {
      return /rate.limit|429|too many requests|quota/i.test(stderr);
    },
  },

  overstory: {
    binary: 'ov',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['run', '--prompt', prompt];
      if (opts.model) {
        args.push('--model', opts.model);
      }
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const match = stderr.match(/tokens?:\s*(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited(_exitCode: number, stderr: string): boolean {
      return /rate.limit|429|quota/i.test(stderr);
    },
  },
};

module.exports = { ADAPTERS };
