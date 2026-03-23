'use strict';

/**
 * GRD Cross-Backend Dispatch Primitive and Discussion Orchestration
 *
 * Provides two layers of functionality:
 *
 * 1. dispatchToBackend() — the foundational function for multi-backend
 *    discussions. Spawns any configured AI CLI backend with a structured prompt
 *    and returns a typed BackendResponse. Used by higher-level discussion
 *    orchestration to route turns to multiple backends and synthesize results.
 *
 * 2. runDiscussion() — the complete discussion round orchestration function.
 *    Dispatches to all participants sequentially, synthesizes, runs optional
 *    additional rounds, writes a markdown history file, and returns a
 *    DiscussionResult.
 *
 * Supported dispatchable backends: claude, codex, gemini, opencode.
 * Meta-backends (overstory, superpowers, grd) are not dispatchable.
 *
 * NOTE: Dispatch uses execFileSync which blocks the event loop. Each
 * participant is dispatched sequentially. For ≤4 participants this is
 * acceptable. True parallelism would require execFile (async) or worker threads.
 *
 * @module discussion
 */

import type {
  BackendId,
  BackendResponse,
  DispatchOptions,
  BackendAvailability,
  DiscussionResult,
  DiscussionRoundEntry,
  RunDiscussionOptions,
} from './types';

const { execFileSync } = require('child_process') as {
  execFileSync: (
    file: string,
    args: string[],
    options: {
      timeout: number;
      encoding: string;
      cwd: string;
      stdio: string[];
      maxBuffer: number;
    }
  ) => string;
};

const fs = require('fs') as {
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  writeFileSync: (path: string, data: string, encoding: string) => void;
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: string) => string;
  existsSync: (path: string) => boolean;
};

const path = require('path') as {
  join: (...parts: string[]) => string;
  dirname: (p: string) => string;
  sep: string;
};

const { detectAvailableBackends } = require('./backend') as {
  detectAvailableBackends: (cwd?: string) => Record<BackendId, BackendAvailability>;
};

const { discussionsDir } = require('./paths') as {
  discussionsDir: (cwd: string, milestone?: string | null) => string;
};

// --- Constants ---------------------------------------------------------------

/**
 * Sonnet-tier model ceiling for primary-backend discussion subagent spawns.
 * Mirrors the pattern from lib/wireup/state.ts and lib/evolve/state.ts.
 * REQ-149: discussion subagents must not exceed sonnet tier.
 */
const DISCUSSION_SONNET_MODEL: string = 'sonnet';

/**
 * Default dispatch timeout: 5 minutes.
 */
const DEFAULT_DISPATCH_TIMEOUT_MS: number = 5 * 60 * 1000;

/**
 * CLI binary name and argument builder for each dispatchable backend.
 * Only the four backends with known CLI invocation conventions are included.
 */
const BACKEND_CLI_MAP: Record<
  string,
  { bin: string; buildArgs: (prompt: string, model?: string) => string[] }
> = {
  claude: {
    bin: 'claude',
    buildArgs: (prompt: string, model?: string): string[] => [
      '--print',
      '-p',
      prompt,
      ...(model ? ['--model', model] : []),
    ],
  },
  codex: {
    bin: 'codex',
    buildArgs: (prompt: string, _model?: string): string[] => ['-q', prompt],
  },
  gemini: {
    bin: 'gemini',
    buildArgs: (prompt: string, _model?: string): string[] => [prompt],
  },
  opencode: {
    bin: 'opencode',
    buildArgs: (prompt: string, _model?: string): string[] => [prompt],
  },
};

// --- Functions ---------------------------------------------------------------

/**
 * Dispatch a prompt to a backend CLI subprocess and return a typed response.
 *
 * Validates the backend is dispatchable and currently available on PATH before
 * spawning. Times out after `options.timeout_ms` (default 5 minutes) and
 * returns a structured error response instead of throwing.
 *
 * @param backendId - Which backend CLI to invoke (must be in BACKEND_CLI_MAP)
 * @param prompt - The full prompt string to send to the backend
 * @param options - Optional dispatch configuration (timeout, cwd, model override)
 * @returns A BackendResponse with response_text populated on success, or
 *          stderr populated with an error description on failure
 */
function dispatchToBackend(
  backendId: BackendId,
  prompt: string,
  options?: DispatchOptions & { _availability?: Record<BackendId, BackendAvailability> }
): BackendResponse {
  const cliEntry = BACKEND_CLI_MAP[backendId as string];

  if (!cliEntry) {
    return {
      backend: backendId,
      response_text: '',
      duration_ms: 0,
      stderr: `Backend "${backendId}" is not dispatchable`,
    };
  }

  const cwd: string = options?.cwd ?? process.cwd();
  const availability: Record<BackendId, BackendAvailability> =
    options?._availability ?? detectAvailableBackends(cwd);
  if (!availability[backendId]?.available) {
    return {
      backend: backendId,
      response_text: '',
      duration_ms: 0,
      stderr: `Backend "${backendId}" is not available on PATH`,
    };
  }

  const timeout: number = options?.timeout_ms ?? DEFAULT_DISPATCH_TIMEOUT_MS;
  const args: string[] = cliEntry.buildArgs(prompt, options?.model);
  const start: number = Date.now();

  try {
    const stdout: string = execFileSync(cliEntry.bin, args, {
      timeout,
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      backend: backendId,
      response_text: stdout.trim(),
      duration_ms: Date.now() - start,
      stderr: '',
    };
  } catch (err: unknown) {
    const duration_ms: number = Date.now() - start;
    const error = err as {
      killed?: boolean;
      signal?: string;
      stderr?: string;
      message?: string;
    };

    if (error.killed || error.signal === 'SIGTERM') {
      return {
        backend: backendId,
        response_text: '',
        duration_ms,
        stderr: `Dispatch timed out after ${timeout}ms`,
      };
    }

    return {
      backend: backendId,
      response_text: '',
      duration_ms,
      stderr: error.stderr || error.message || 'Unknown dispatch error',
    };
  }
}

/**
 * Build the synthesis prompt from the original topic and round 1 entries.
 *
 * Internal helper — not exported.
 *
 * @param topic - The original discussion topic/question
 * @param roundEntries - Entries from round 1 (mix of BackendResponse and skipped)
 * @returns A formatted prompt string for the synthesizer backend
 */
function buildSynthesisPrompt(topic: string, roundEntries: DiscussionRoundEntry[]): string {
  const responseSections = roundEntries
    .map((entry) => {
      if ('skipped' in entry) {
        return `### ${entry.backend} Response\n[SKIPPED]`;
      }
      return `### ${entry.backend} Response\n${entry.response_text}`;
    })
    .join('\n\n');

  return [
    'You are synthesizing responses from multiple AI backends on the following topic:',
    '',
    '## Topic',
    topic,
    '',
    '## Responses',
    '',
    responseSections,
    '',
    '## Instructions',
    'Synthesize the above responses. Identify areas of consensus, disagreement, and unique insights. Provide a unified recommendation.',
  ].join('\n');
}

/**
 * Build the markdown content for a discussion history file.
 *
 * Internal helper — not exported.
 *
 * @param result - The completed DiscussionResult
 * @param phase - Phase identifier used in the header
 * @param type - Discussion type label used in the header
 * @returns Formatted markdown string for writing to disk
 */
function buildDiscussionMarkdown(result: DiscussionResult, phase: string, type: string): string {
  const lines: string[] = [];

  lines.push(`# Discussion: ${result.topic}`, '');
  lines.push(
    `**Phase:** ${phase}  **Type:** ${type}  **Participants:** ${result.participants.join(', ')}`
  );
  lines.push(
    `**Synthesizer:** ${result.synthesis.backend}  **Rounds:** ${result.rounds.length}  **Duration:** ${result.duration_ms}ms`
  );
  lines.push(`**Timestamp:** ${new Date().toISOString()}`, '');

  for (let i = 0; i < result.rounds.length; i++) {
    lines.push(`## Round ${i + 1}`, '');
    for (const entry of result.rounds[i]) {
      if ('skipped' in entry) {
        lines.push(`### ${entry.backend} Response`, `[SKIPPED: ${entry.reason}]`, '---', '');
      } else {
        lines.push(`### ${entry.backend} Response`, entry.response_text, '---', '');
      }
    }
    // Insert synthesis after round 1
    if (i === 0) {
      lines.push(`## Synthesis (${result.synthesis.backend})`, '', result.synthesis.response_text, '');
    }
  }

  // Outcome (repeat synthesis)
  lines.push('## Outcome', '', result.synthesis.response_text, '');

  return lines.join('\n');
}

/**
 * Dispatch a prompt to all participants and collect results.
 * Skips unavailable participants with a `{ skipped: true }` entry.
 */
function dispatchRound(
  participants: BackendId[],
  prompt: string,
  availability: Record<BackendId, BackendAvailability>,
  dispatchOpts: DispatchOptions & { _availability?: Record<BackendId, BackendAvailability> }
): DiscussionRoundEntry[] {
  return participants.map((participant): DiscussionRoundEntry => {
    if (!availability[participant]?.available) {
      return { backend: participant, skipped: true, reason: `Backend "${participant}" is not available` };
    }
    return dispatchToBackend(participant, prompt, dispatchOpts);
  });
}

/**
 * Run a multi-backend discussion and return a structured result.
 *
 * Dispatches the topic to all participants (see module-level NOTE on
 * concurrency), synthesizes responses, optionally runs additional
 * rounds, writes a markdown history file, and returns a typed DiscussionResult.
 *
 * Unavailable participants produce `{ skipped: true, reason }` entries;
 * the discussion continues with the remaining available participants.
 *
 * @param topic - The question or topic posed to all participants
 * @param participants - Backend IDs to include in the discussion
 * @param options - Optional configuration (rounds, synthesizer, timeout, paths, labels)
 * @returns A DiscussionResult with all rounds, synthesis, and the path to the written file
 */
async function runDiscussion(
  topic: string,
  participants: BackendId[],
  options?: RunDiscussionOptions
): Promise<DiscussionResult> {
  // Destructure options with defaults
  const {
    rounds = 2,
    synthesizer = 'claude' as BackendId,
    timeout_per_round_seconds = 180,
    cwd = process.cwd(),
    phase = 'unknown',
    type = 'discussion',
    milestone = null,
  } = options ?? {};

  // Clamp rounds to valid range 1-3
  const clampedRounds: number = Math.min(Math.max(rounds, 1), 3);

  // Record start time
  const start: number = Date.now();

  // Get backend availability
  const availability: Record<BackendId, BackendAvailability> = detectAvailableBackends(cwd);

  // Build discussion filename and resolve directory
  // Sanitize phase/type to prevent path traversal via path separators
  const safePhase = phase.replace(/[/\\]/g, '_');
  const safeType = type.replace(/[/\\]/g, '_');
  const filename = `discussion-${safePhase}-${safeType}-${Date.now()}.md`;
  const dir = discussionsDir(cwd, milestone);

  const timeoutMs: number = timeout_per_round_seconds * 1000;

  const dispatchOpts = { timeout_ms: timeoutMs, cwd, _availability: availability };

  // --- Round 1: Parallel dispatch to all participants ---
  const round1Results = dispatchRound(participants, topic, availability, dispatchOpts);

  // --- Synthesis ---
  const synthPrompt = buildSynthesisPrompt(topic, round1Results);
  const synthesis: BackendResponse = dispatchToBackend(synthesizer, synthPrompt, dispatchOpts);

  // --- Additional rounds (round 2+) ---
  const allRounds: DiscussionRoundEntry[][] = [round1Results];

  for (let roundNum = 2; roundNum <= clampedRounds; roundNum++) {
    const roundPrompt = [
      'You are participating in a multi-round discussion on the following topic:',
      '',
      '## Topic',
      topic,
      '',
      '## Synthesis from Previous Round',
      synthesis.response_text,
      '',
      '## Instructions',
      'Please respond to the synthesis above. Do you agree, disagree, or have additional insights to add?',
    ].join('\n');

    allRounds.push(dispatchRound(participants, roundPrompt, availability, dispatchOpts));
  }

  // --- Build result ---
  const duration_ms: number = Date.now() - start;
  const filePath = path.join(dir, filename);

  const result: DiscussionResult = {
    topic,
    participants,
    rounds: allRounds,
    synthesis,
    duration_ms,
    discussion_file: filePath,
  };

  // --- Write history file (BEFORE return) ---
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buildDiscussionMarkdown(result, phase, type), 'utf-8');

  return result;
}

/**
 * List all discussion filenames in the discussions directory for a milestone.
 *
 * @param cwd - Working directory (project root)
 * @param milestone - Optional milestone version string; defaults to current milestone
 * @returns Array of filenames in the discussions directory, or empty array if not found
 */
function listDiscussions(cwd: string, milestone?: string | null): string[] {
  const dir = discussionsDir(cwd, milestone);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir);
}

/**
 * Read the content of a specific discussion file.
 *
 * @param filename - Filename of the discussion (not full path)
 * @param cwd - Working directory (project root)
 * @param milestone - Optional milestone version string; defaults to current milestone
 * @returns UTF-8 content of the discussion file, or null if not found
 */
function readDiscussion(
  filename: string,
  cwd: string,
  milestone?: string | null
): string | null {
  const dir = discussionsDir(cwd, milestone);
  const filePath = path.join(dir, filename);
  if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
    throw new Error('Invalid filename: path would escape discussions directory');
  }
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

// --- Exports -----------------------------------------------------------------

module.exports = {
  dispatchToBackend,
  runDiscussion,
  listDiscussions,
  readDiscussion,
  DISCUSSION_SONNET_MODEL,
  BACKEND_CLI_MAP,
  DEFAULT_DISPATCH_TIMEOUT_MS,
};
