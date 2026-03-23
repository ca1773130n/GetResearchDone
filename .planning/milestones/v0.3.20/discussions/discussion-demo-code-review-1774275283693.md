# Discussion: Review the following GRD multi-backend discussion and review system code. Find bugs, logic errors, edge cases, and design flaws. Be specific — cite line numbers and function names.

Key areas to examine:
1. dispatchToBackend() — CLI arg construction, timeout handling, error paths
2. runDiscussion() — round orchestration, synthesis, file writing
3. resolveReviewer() / coerceSeverity() — reviewer gating logic
4. reviewPlanViaBackend / reviewCodeViaBackend / reviewPRViaBackend — JSON parsing, error handling
5. discoverBackendConfigDirs() — config directory discovery and auth marker detection
6. buildBackendEnv() — environment variable injection for subprocess spawning
7. listDiscussions / readDiscussion — filesystem operations

Here is lib/discussion.ts:

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
  GrdConfig,
  PlanReviewResult,
  CodeReviewResult,
  PRReviewResult,
  Concern,
  ReviewIssue,
  PRReviewComment,
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
      env?: Record<string, string | undefined>;
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

const { detectAvailableBackends, buildBackendEnv } = require('./backend') as {
  detectAvailableBackends: (cwd?: string) => Record<BackendId, BackendAvailability>;
  buildBackendEnv: (backend: string) => Record<string, string | undefined>;
};

const { discussionsDir } = require('./paths') as {
  discussionsDir: (cwd: string, milestone?: string | null) => string;
};

const { safeReadFile } = require('./utils') as {
  safeReadFile: (filePath: string) => string | null;
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
 * Valid severity levels for review findings. Shared across all review functions.
 */
const SEVERITY_VALUES = ['blocker', 'warning', 'suggestion'] as const;
type Severity = typeof SEVERITY_VALUES[number];

function coerceSeverity(raw: unknown): Severity {
  return SEVERITY_VALUES.includes(raw as Severity) ? (raw as Severity) : 'warning';
}

/**
 * Resolve the reviewer backend from config. Returns null if not configured,
 * not available, or same as primary backend (when requireDifferentFromPrimary is true).
 */
function resolveReviewer(
  config: GrdConfig,
  cwd?: string,
  opts?: { requireDifferentFromPrimary?: boolean }
): { backend: BackendId; availability: Record<BackendId, BackendAvailability> } | null {
  if (!config.backend_roles?.reviewer) return null;
  const reviewerBackend: BackendId = config.backend_roles.reviewer;
  if (opts?.requireDifferentFromPrimary !== false && config.backend && reviewerBackend === (config.backend as BackendId)) {
    return null;
  }
  const availability = detectAvailableBackends(cwd);
  if (!availability[reviewerBackend]?.available) return null;
  return { backend: reviewerBackend, availability };
}

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
    buildArgs: (prompt: string, _model?: string): string[] => ['exec', prompt],
  },
  gemini: {
    bin: 'gemini',
    buildArgs: (prompt: string, model?: string): string[] => [
      '-p',
      prompt,
      '--approval-mode',
      'yolo',
      ...(model ? ['-m', model] : []),
    ],
  },
  opencode: {
    bin: 'opencode',
    buildArgs: (prompt: string, model?: string): string[] => [
      'run',
      ...(model ? ['-m', model] : []),
      prompt,
    ],
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
      env: buildBackendEnv(backendId as string),
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
    if (i === 0) {
      lines.push(`## Synthesis (${result.synthesis.backend})`, '', result.synthesis.response_text, '');
    }
  }

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
function runDiscussion(
  topic: string,
  participants: BackendId[],
  options?: RunDiscussionOptions
): DiscussionResult {
  const {
    rounds = 2,
    synthesizer = 'claude' as BackendId,
    timeout_per_round_seconds = 180,
    cwd = process.cwd(),
    phase = 'unknown',
    type = 'discussion',
    milestone = null,
  } = options ?? {};

  const clampedRounds: number = Math.min(Math.max(rounds, 1), 3);
  const start: number = Date.now();
  const availability: Record<BackendId, BackendAvailability> = detectAvailableBackends(cwd);

  // Sanitize phase/type to prevent path traversal
  const safePhase = phase.replace(/[/\\]/g, '_');
  const safeType = type.replace(/[/\\]/g, '_');
  const filename = `discussion-${safePhase}-${safeType}-${Date.now()}.md`;
  const dir = discussionsDir(cwd, milestone);

  const timeoutMs: number = timeout_per_round_seconds * 1000;
  const dispatchOpts = { timeout_ms: timeoutMs, cwd, _availability: availability };

  // Round 1: dispatch to all participants sequentially
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
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
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
  return safeReadFile(filePath);
}

// --- Workflow Integration Functions ------------------------------------------

/**
 * Extract JSON from a raw backend response string.
 *
 * Handles markdown code fences (```json ... ``` or ``` ... ```) and plain JSON.
 * Returns null on parse failure.
 *
 * Internal helper — not exported.
 */
function parseJSONFromResponse(raw: string): Record<string, unknown> | null {
  // Try to extract JSON from markdown code fences first
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : raw.trim();

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Run a pre-planning discussion with the configured brainstormer backend.
 *
 * Checks config flags before dispatching. Returns null (silently skips)
 * when discussion is disabled, before_planning is false, or the brainstormer
 * backend is not configured or unavailable.
 *
 * REQ-138
 *
 * @param options - Phase goal, requirements list, paths, and GRD config
 * @returns A DiscussionResult on success, null if skipped
 */
function runPrePlanningDiscussion(options: {
  phaseGoal: string;
  requirements: string[];
  cwd?: string;
  phase?: string;
  milestone?: string | null;
  config: GrdConfig;
}): DiscussionResult | null {
  const { phaseGoal, requirements, cwd, phase, milestone, config } = options;

  if (
    config.discussion?.enabled === false ||
    config.discussion?.before_planning === false ||
    !config.backend_roles?.brainstormer
  ) {
    return null;
  }

  const brainstormerBackend: BackendId = config.backend_roles.brainstormer;
  const availability = detectAvailableBackends(cwd);
  if (!availability[brainstormerBackend]?.available) {
    return null;
  }

  const reqLines = requirements.map((r) => `- ${r}`).join('\n');
  const topic = `Pre-planning discussion for phase goal: ${phaseGoal}\n\nRequirements:\n${reqLines}`;

  return runDiscussion(topic, [brainstormerBackend], {
    rounds: 1,
    phase,
    type: 'pre-planning',
    cwd,
    milestone,
  });
}

/**
 * Run a pre-execution discussion with the configured brainstormer backend.
 *
 * Checks config flags before dispatching. Returns null when discussion is
 * disabled, before_execution is not explicitly enabled, or the brainstormer
 * backend is not configured or unavailable.
 *
 * REQ-139
 *
 * @param options - Plan summary text, paths, and GRD config
 * @returns A DiscussionResult on success, null if skipped
 */
function runPreExecutionDiscussion(options: {
  planSummary: string;
  cwd?: string;
  phase?: string;
  milestone?: string | null;
  config: GrdConfig;
}): DiscussionResult | null {
  const { planSummary, cwd, phase, milestone, config } = options;

  // before_execution must be explicitly true
  if (
    config.discussion?.enabled === false ||
    config.discussion?.before_execution !== true ||
    !config.backend_roles?.brainstormer
  ) {
    return null;
  }

  const brainstormerBackend: BackendId = config.backend_roles.brainstormer;
  const availability = detectAvailableBackends(cwd);
  if (!availability[brainstormerBackend]?.available) {
    return null;
  }

  const topic = `Pre-execution discussion: surface implementation concerns for the following plan:\n\n${planSummary}`;

  return runDiscussion(topic, [brainstormerBackend], {
    rounds: 1,
    phase,
    type: 'pre-execution',
    cwd,
    milestone,
  });
}

/**
 * Dispatch a plan text to the reviewer backend and parse the structured response.
 *
 * Checks that a reviewer is configured and that it differs from the primary
 * backend. Returns null when reviewer is unavailable. Handles malformed JSON
 * responses gracefully.
 *
 * REQ-140
 *
 * @param options - Plan text, working directory, and GRD config
 * @returns A PlanReviewResult on success, null if skipped/unavailable
 */
function reviewPlanViaBackend(options: {
  planText: string;
  cwd?: string;
  config: GrdConfig;
}): PlanReviewResult | null {
  const { planText, cwd, config } = options;

  const resolved = resolveReviewer(config, cwd);
  if (!resolved) return null;
  const { backend: reviewerBackend, availability } = resolved;

  const prompt = [
    'Review the following plan and provide structured feedback.',
    '',
    '## Plan',
    planText,
    '',
    'Respond with JSON only (no markdown prose outside the JSON block):',
    '```json',
    '{ "approved": boolean, "concerns": [{"description": string, "severity": "blocker"|"warning"|"suggestion"}], "suggestions": [string] }',
    '```',
  ].join('\n');

  const start = Date.now();
  const response = dispatchToBackend(reviewerBackend, prompt, { cwd, _availability: availability });
  const duration_ms = Date.now() - start;

  const parsed = parseJSONFromResponse(response.response_text);

  if (!parsed) {
    const concerns: Concern[] = [
      {
        description: `Reviewer returned unparseable response: ${response.response_text.slice(0, 200)}`,
        severity: 'warning',
      },
    ];
    return {
      approved: false,
      concerns,
      suggestions: [response.response_text],
      reviewer_backend: reviewerBackend,
      duration_ms,
      raw_response: response.response_text,
    };
  }

  const approved = typeof parsed['approved'] === 'boolean' ? parsed['approved'] : false;
  const rawConcerns = Array.isArray(parsed['concerns']) ? (parsed['concerns'] as unknown[]) : [];
  const concerns: Concern[] = rawConcerns
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      description: typeof c['description'] === 'string' ? c['description'] : String(c['description'] ?? ''),
      severity: coerceSeverity(c['severity']),
    }));
  const rawSuggestions = Array.isArray(parsed['suggestions']) ? (parsed['suggestions'] as unknown[]) : [];
  const suggestions: string[] = rawSuggestions.map((s) => String(s));

  return {
    approved,
    concerns,
    suggestions,
    reviewer_backend: reviewerBackend,
    duration_ms,
    raw_response: response.response_text,
  };
}

/**
 * Dispatch a code diff to the reviewer backend and parse the structured response.
 *
 * Same reviewer availability checks as reviewPlanViaBackend.
 * Handles malformed JSON responses gracefully.
 *
 * REQ-141
 *
 * @param options - Code diff text, working directory, and GRD config
 * @returns A CodeReviewResult on success, null if skipped/unavailable
 */
function reviewCodeViaBackend(options: {
  diff: string;
  cwd?: string;
  config: GrdConfig;
}): CodeReviewResult | null {
  const { diff, cwd, config } = options;

  const resolved = resolveReviewer(config, cwd);
  if (!resolved) return null;
  const { backend: reviewerBackend, availability } = resolved;

  const prompt = [
    'Review this code diff and provide structured feedback.',
    '',
    '## Diff',
    diff,
    '',
    'Respond with JSON only (no markdown prose outside the JSON block):',
    '```json',
    '{ "approved": boolean, "issues": [{"severity": "blocker"|"warning"|"suggestion", "file": string, "line_range": string, "description": string}], "summary": string }',
    '```',
  ].join('\n');

  const start = Date.now();
  const response = dispatchToBackend(reviewerBackend, prompt, { cwd, _availability: availability });
  const duration_ms = Date.now() - start;

  const parsed = parseJSONFromResponse(response.response_text);

  if (!parsed) {
    const issues: ReviewIssue[] = [
      {
        severity: 'warning',
        file: '',
        line_range: '',
        description: `Reviewer returned unparseable response: ${response.response_text.slice(0, 200)}`,
      },
    ];
    return {
      approved: false,
      issues,
      summary: response.response_text,
      reviewer_backend: reviewerBackend,
      duration_ms,
      raw_response: response.response_text,
    };
  }

  const approved = typeof parsed['approved'] === 'boolean' ? parsed['approved'] : false;
  const rawIssues = Array.isArray(parsed['issues']) ? (parsed['issues'] as unknown[]) : [];
  const issues: ReviewIssue[] = rawIssues
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      severity: coerceSeverity(i['severity']),
      file: typeof i['file'] === 'string' ? i['file'] : '',
      line_range: typeof i['line_range'] === 'string' ? i['line_range'] : '',
      description: typeof i['description'] === 'string' ? i['description'] : String(i['description'] ?? ''),
    }));
  const summary = typeof parsed['summary'] === 'string' ? parsed['summary'] : '';

  return {
    approved,
    issues,
    summary,
    reviewer_backend: reviewerBackend,
    duration_ms,
    raw_response: response.response_text,
  };
}

/**
 * Dispatch a PR diff to the reviewer backend and parse structured review comments.
 *
 * Checks code_review_enabled and reviewer role configuration.
 * Handles malformed JSON responses gracefully.
 *
 * REQ-142
 *
 * @param options - PR diff text, PR number, working directory, and GRD config
 * @returns A PRReviewResult on success, null if skipped/unavailable
 */
function reviewPRViaBackend(options: {
  diff: string;
  prNumber: number;
  cwd?: string;
  config: GrdConfig;
}): PRReviewResult | null {
  const { diff, prNumber, cwd, config } = options;

  if (!config.code_review_enabled) return null;

  // PR review allows reviewer === primary backend (no requireDifferentFromPrimary)
  const resolved = resolveReviewer(config, cwd, { requireDifferentFromPrimary: false });
  if (!resolved) return null;
  const { backend: reviewerBackend, availability } = resolved;

  const prompt = [
    `Review this PR #${prNumber} diff and provide structured review comments.`,
    '',
    '## Diff',
    diff,
    '',
    'Respond with JSON only (no markdown prose outside the JSON block):',
    '```json',
    '{ "comments": [{"file": string, "line": number, "body": string, "severity": "blocker"|"warning"|"suggestion"}], "summary": string }',
    '```',
  ].join('\n');

  const start = Date.now();
  const response = dispatchToBackend(reviewerBackend, prompt, { cwd, _availability: availability });
  const duration_ms = Date.now() - start;

  const parsed = parseJSONFromResponse(response.response_text);

  if (!parsed) {
    const comments: PRReviewComment[] = [
      {
        file: '',
        line: 0,
        body: `Reviewer returned unparseable response: ${response.response_text.slice(0, 200)}`,
        severity: 'warning',
      },
    ];
    return {
      comments,
      summary: response.response_text,
      reviewer_backend: reviewerBackend,
      duration_ms,
      raw_response: response.response_text,
    };
  }

  const rawComments = Array.isArray(parsed['comments']) ? (parsed['comments'] as unknown[]) : [];
  const comments: PRReviewComment[] = rawComments
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      file: typeof c['file'] === 'string' ? c['file'] : '',
      line: typeof c['line'] === 'number' ? c['line'] : 0,
      body: typeof c['body'] === 'string' ? c['body'] : '',
      severity: coerceSeverity(c['severity']),
    }));
  const summary = typeof parsed['summary'] === 'string' ? parsed['summary'] : '';

  return {
    comments,
    summary,
    reviewer_backend: reviewerBackend,
    duration_ms,
    raw_response: response.response_text,
  };
}

// --- Exports -----------------------------------------------------------------

module.exports = {
  dispatchToBackend,
  runDiscussion,
  listDiscussions,
  readDiscussion,
  runPrePlanningDiscussion,
  runPreExecutionDiscussion,
  reviewPlanViaBackend,
  reviewCodeViaBackend,
  reviewPRViaBackend,
  DISCUSSION_SONNET_MODEL,
  BACKEND_CLI_MAP,
  DEFAULT_DISPATCH_TIMEOUT_MS,
};


Here is the backend detection section from lib/backend.ts:

defaultDir: string[] = entries.filter((e: string) => e === `.${backend}`);
      const candidates: string[] = [...profileDirs, ...defaultDir]
        .map((e: string) => path.join(homeDir, e))
        .filter((p: string) => {
          try { return fs.statSync(p).isDirectory(); } catch { return false; }
        });

      // Check each candidate for auth marker files
      for (const candidate of candidates) {
        const hasAuth = markers.some((marker: string) => {
          try { return fs.statSync(path.join(candidate, marker)).isFile(); } catch { return false; }
        });
        if (hasAuth) {
          found = candidate;
          break;
        }
      }
    } catch {
      // Home dir not readable — skip
    }

    result[backend] = found;
  }

  _configDirCache = result;
  return result;
}

/**
 * Clear the config dir discovery cache. Exported for testing.
 */
function clearConfigDirCache(): void {
  _configDirCache = null;
}

/**
 * Build the environment variables needed to run a backend CLI with the correct
 * config directory. Returns a copy of process.env with the override applied.
 */
function buildBackendEnv(backend: string): Record<string, string | undefined> {
  const configDirs = discoverBackendConfigDirs();
  const configDir = configDirs[backend];
  if (!configDir) return { ...process.env };

  const envVar = BACKEND_CONFIG_ENV[backend];
  if (!envVar) return { ...process.env };

  return { ...process.env, [envVar]: configDir };
}

/**
 * Probe which AI CLI backends are available on PATH.
 *
 * For each of the four dispatchable backends (claude, codex, gemini, opencode),
 * runs `<binary> --version` with a 5-second timeout. Success means available.
 * Meta-backends (overstory, superpowers, grd) are always marked unavailable here.
 *
 * Result is cached for 5 minutes (AVAILABILITY_CACHE_TTL_MS). Call
 * clearAvailabilityCache() to force re-detection in tests.
 *
 * @param cwd - Optional working directory for subprocess (defaults to process.cwd())
 * @returns A map of BackendId to BackendAvailability for all known backends
 */
function detectAvailableBackends(cwd?: string): Record<BackendId, BackendAvailability> {
  const now: number = Date.now();
  if (_availabilityCache && now - _availabilityCache.ts < AVAILABILITY_CACHE_TTL_MS) {
    return _availabilityCache.result;
  }

  const effectiveCwd: string = cwd || process.cwd();
  const unavailable: BackendAvailability = { available: false, version: null };

  const result: Record<BackendId, BackendAvailability> = {
    claude: unavailable,
    codex: unavailable,
    gemini: unavailable,
    opencode: unavailable,
    overstory: unavailable,
    superpowers: unavailable,
    grd: unavailable,
  };

  for (const backend of DISPATCHABLE_BACKENDS) {
    try {
      const stdout: string = execFileSync(backend, ['--version'], {
        cwd: effectiveCwd,
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: buildBackendEnv(backend),
      });
      result[backend as BackendId] = {
        available: true,
        version: stdout.trim().split('\n')[0] || null,
      };
    } catch {
      result[backend as BackendId] = { available: false, version: null };
    }
  }

  _availabilityCache = { result, ts: now };
  return result;
}

/**
 * Clear the availability detection cache. Exported for testing.
 */
function clearAvailabilityCache(): void {
  _availabilityCache = null;
}

// --- Exports -----------------------------------------------------------------

module.exports = {
  VALID_BACKENDS,
  DEFAULT_BACKEND_MODELS,
  BACKEND_CAPABILITIES,
  EFFORT_PROFILES,
  detectBackend,
  resolveBackendModel,
  resolveEffortLevel,
  getBackendCapabilities,
  parseOpenCodeModels,
  detectModels,
  getCachedModels,
  clearModelCache,
  detectWebMcp,
  detectPlaywright,
  detectAvailableBackends,
  clearAvailabilityCache,
  discoverBackendConfigDirs,
  clearConfigDirCache,
  buildBackendEnv,
  BACKEND_CONFIG_ENV,
  readConfig,
};



**Phase:** demo  **Type:** code-review  **Participants:** claude, codex, gemini, opencode
**Synthesizer:** claude  **Rounds:** 2  **Duration:** 1015409ms
**Timestamp:** 2026-03-23T14:31:35.549Z

## Round 1

### claude Response
Here's my analysis of the bugs, logic errors, and design flaws:

---

## Critical Bugs

### 1. maxBuffer kill misreported as timeout — `dispatchToBackend()` ~line 171-178

```typescript
if (error.killed || error.signal === 'SIGTERM') {
  return { ..., stderr: `Dispatch timed out after ${timeout}ms` };
}
```

When `maxBuffer` (10MB) is exceeded, Node kills the child and sets `error.killed = true`. This code reports it as a **timeout**, losing the real cause. Fix: check `error.code === 'ERR_CHILD_PROCESS_STDIO_FINAL'` or `error.stderr?.includes('maxBuffer')` before the timeout branch.

### 2. Stale synthesis in multi-round discussions — `runDiscussion()` ~line 264

```typescript
for (let roundNum = 2; roundNum <= clampedRounds; roundNum++) {
  const roundPrompt = [
    ...
    '## Synthesis from Previous Round',
    synthesis.response_text,  // ← always round 1's synthesis
```

Round 3 participants see **round 1's synthesis**, not an updated synthesis of round 2. The synthesis is never re-run between rounds. For `rounds: 3`, round 2 and round 3 both reference the same stale synthesis, making multi-round discussions degenerate.

### 3. Synthesizer failure is silent — `runDiscussion()` ~line 258

```typescript
const synthesis: BackendResponse = dispatchToBackend(synthesizer, synthPrompt, dispatchOpts);
```

No check on `synthesis.stderr`. If the synthesizer (default: `'claude'`) is unavailable or errors, `synthesis.response_text` is `''`. The discussion result has an empty synthesis, the markdown file has an empty `## Synthesis` and `## Outcome` section, and the caller has no signal that synthesis failed.

---

## Logic Errors

### 4. `timeout_per_round_seconds` is actually per-dispatch — `runDiscussion()` ~line 247

```typescript
const timeoutMs: number = timeout_per_round_seconds * 1000;
const dispatchOpts = { timeout_ms: timeoutMs, ... };
```

This timeout applies **per-participant dispatch**, not per-round. With 4 participants and default 180s, a single round can take up to **720s** (12 minutes). The parameter name is misleading and could cause callers to set timeouts assuming round-level granularity.

### 5. `coerceSeverity()` silently downgrades case mismatches — line ~92

```typescript
function coerceSeverity(raw: unknown): Severity {
  return SEVERITY_VALUES.includes(raw as Severity) ? (raw as Severity) : 'warning';
}
```

`"BLOCKER"`, `"Blocker"`, or `"WARNING"` all coerce to `'warning'`. A backend returning `"blocker"` in uppercase gets **downgraded from blocker to warning**, silently masking a blocking concern. Should lowercase before comparison:

```typescript
const lower = typeof raw === 'string' ? raw.toLowerCase() : '';
return SEVERITY_VALUES.includes(lower as Severity) ? (lower as Severity) : 'warning';
```

### 6. `resolveReviewer()` — `requireDifferentFromPrimary` default is confusingly inverted — line ~99

```typescript
if (opts?.requireDifferentFromPrimary !== false && config.backend && reviewerBackend === ...) {
```

The double-negative (`!== false`) means `undefined` is treated as `true`. This works but is a footgun — a caller passing `{ requireDifferentFromPrimary: true }` and one passing `{}` behave identically, and the logic reads backwards. A default parameter would be clearer.

---

## Edge Cases

### 7. `readDiscussion()` path traversal check fails with trailing separator — line ~308

```typescript
if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
```

If `discussionsDir()` ever returns a path with a trailing `/` (e.g. `/project/discussions/`), then `dir + path.sep` becomes `/project/discussions//`. A valid path like `/project/discussions/file.md` would **not** start with `//`, so the check throws on legitimate filenames.

### 8. `readDiscussion()` allows reading `dir` itself — line ~308

`filename = ""` → `path.join(dir, "")` → `dir`. This equals `dir`, so the check passes. `safeReadFile` on a directory returns `null` (not harmful), but it's an unvalidated input that should be rejected explicitly.

### 9. `parseJSONFromResponse()` greedy first-fence match — line ~320

```typescript
const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
```

If a backend wraps its response with prose containing a non-JSON code fence before the JSON fence, this grabs the **wrong fence**. E.g.:
```
Here's the approach:
```python
print("hello")
```
```json
{"approved": true}
```
```
The regex matches the Python block, then `JSON.parse` fails, and the review returns "unparseable response" despite valid JSON being present.

---

## Design Flaws

### 10. Codex model override silently ignored — `BACKEND_CLI_MAP.codex` ~line 122

```typescript
codex: {
  bin: 'codex',
  buildArgs: (prompt: string, _model?: string): string[] => ['exec', prompt],
},
```

The `_model` parameter is discarded. If a caller passes `model: 'gpt-4o'` for codex dispatch, it's silently ignored. Should either wire it through or log a warning.

### 11. `DISCUSSION_SONNET_MODEL` — unenforced contract — line ~82

The comment says "REQ-149: discussion subagents must not exceed sonnet tier" but nothing in `dispatchToBackend` or any caller enforces this. Any model can be passed and dispatched. The constant is exported but acts as documentation-only.

### 12. `buildDiscussionMarkdown()` — outcome duplicates synthesis — line ~226

```typescript
if (i === 0) {
  lines.push(`## Synthesis (${result.synthesis.backend})`, '', result.synthesis.response_text, '');
}
// ...
lines.push('## Outcome', '', result.synthesis.response_text, '');
```

The `## Outcome` section is always identical to `## Synthesis`. For multi-round discussions, the outcome should arguably reflect the final state, not just the round-1 synthesis (which ties back to bug #2).

---

**Summary**: The most impactful bugs are #2 (stale synthesis breaking multi-round discussions), #1 (maxBuffer misdiagnosed as timeout), and #5 (severity case-sensitivity silently downgrading blockers). These three can cause incorrect behavior in production without any visible errors.
---

### codex Response
**Findings**

1. `runDiscussion()` does not actually run multi-round synthesis after round 1. It computes `synthesis` once, before the loop, and every later round reuses that same text. For `rounds = 3`, round 3 ignores round 2 entirely, so the “multi-round” protocol never iterates on new output. See `runDiscussion()` at [lib/discussion.ts:399](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L399) and [lib/discussion.ts:406](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L406).

2. The review helpers lose the real failure cause from `dispatchToBackend()`. `dispatchToBackend()` returns subprocess failures in `stderr`, but `reviewPlanViaBackend()`, `reviewCodeViaBackend()`, and `reviewPRViaBackend()` only parse `response.response_text`; on timeout/CLI failure that is usually empty, so they misclassify the result as “unparseable response” and drop the actual backend error. See `dispatchToBackend()` at [lib/discussion.ts:233](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L233), `reviewPlanViaBackend()` at [lib/discussion.ts:636](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L636), `reviewCodeViaBackend()` at [lib/discussion.ts:714](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L714), and `reviewPRViaBackend()` at [lib/discussion.ts:799](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L799).

3. The severity gate is effectively dead code here. `coerceSeverity()` normalizes severities, but none of the review helpers derive approval from those severities or from `config.code_review_severity_gate`; they trust the model’s `approved` boolean verbatim. That means a reviewer can return `approved: true` with a `"blocker"` issue and GRD will still pass it through as approved. See `coerceSeverity()` at [lib/discussion.ts:107](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L107), `reviewCodeViaBackend()` at [lib/discussion.ts:739](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L739), and the config field at [lib/types.ts:328](/Users/neo/Developer/Projects/GetResearchDone/lib/types.ts#L328).

4. `discussionsDir()` does not validate `milestone`, unlike `phasesDir()`. Because `runDiscussion()`, `listDiscussions()`, and `readDiscussion()` all trust `discussionsDir(cwd, milestone)`, a crafted milestone like `../../outside` can escape `.planning/milestones/...`. `readDiscussion()` only checks `filename`, so it inherits that unsafe base directory. See `milestoneRoot()` at [lib/paths.ts:132](/Users/neo/Developer/Projects/GetResearchDone/lib/paths.ts#L132), `discussionsDir()` at [lib/paths.ts:216](/Users/neo/Developer/Projects/GetResearchDone/lib/paths.ts#L216), `runDiscussion()` at [lib/discussion.ts:391](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L391), `listDiscussions()` at [lib/discussion.ts:450](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L450), and `readDiscussion()` at [lib/discussion.ts:472](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L472).

5. `discoverBackendConfigDirs()` trusts pre-set config env vars without checking that the directory exists or contains auth, and its “auth markers” are too weak for some backends. For Claude/OpenCode it treats `settings.json` / `config.json` as proof of authentication even though the comment says markers “must be actual credential files.” A stale `CLAUDE_CONFIG_DIR` or a default config-only directory can therefore be injected into subprocess env and break backend spawning. See [lib/backend.ts:755](/Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts#L755), [lib/backend.ts:785](/Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts#L785), and `buildBackendEnv()` at [lib/backend.ts:838](/Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts#L838).

6. `detectAvailableBackends()` caches availability globally for 5 minutes and ignores both `cwd` and environment changes after the first probe. If the user switches auth profiles, modifies `PATH`, or changes backend config env vars mid-process, `resolveReviewer()` and `runDiscussion()` will keep using stale availability. See [lib/backend.ts:862](/Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts#L862) and `resolveReviewer()` at [lib/discussion.ts:125](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L125).

7. `dispatchToBackend()` timeout detection is incomplete. It only treats `error.killed` or `signal === 'SIGTERM'` as a timeout, but `spawnSync` timeout failures can also surface as `ETIMEDOUT`-style errors. Those will fall through to generic stderr handling instead of the structured timeout path. See [lib/discussion.ts:242](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L242).

8. `dispatchToBackend()` exposes a generic `model` option, but the Codex backend silently ignores it. `BACKEND_CLI_MAP.codex.buildArgs()` drops `_model`, so callers can believe they requested a model override when they did not. See [lib/discussion.ts:147](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L147).

9. `runDiscussion()` has structured backend-error handling, but not structured filesystem-error handling. If `mkdirSync` or `writeFileSync` fails after all dispatches complete, the function throws and discards the otherwise valid in-memory `DiscussionResult`. See [lib/discussion.ts:436](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L436).

10. `listDiscussions()` returns raw `readdirSync()` output with no filtering or sorting. That means callers can get directories, temp files, or arbitrary names in nondeterministic order, which is a weak contract for a “discussion history” API. See [lib/discussion.ts:450](/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L450).

**Open Questions**
- If `code_review_severity_gate` is enforced elsewhere, I did not find that linkage in the discussion/review path; from this module alone, severity normalization has no effect on verdicts.
- The stale availability cache may be intentional for performance, but if so it needs cache keying by env/cwd or explicit invalidation on profile changes.
---

### gemini Response

---

### opencode Response
Let me read the full backend.ts to properly analyze the config discovery and environment building.
Let me also check the types file and paths module for full context:
Now I have complete context. Here is my full bug report:

---

## GRD Discussion System — Bug Report

### CRITICAL

#### 1. Multi-round synthesis uses stale data (discussion.ts:406-414)

The round loop never updates `synthesis`. Every round 2+ dispatches with `synthesis.response_text` from round 1 synthesis, not the previous round:

```javascript
for (let roundNum = 2; roundNum <= clampedRounds; roundNum++) {
    const roundPrompt = [
      ...
      '## Synthesis from Previous Round',
      synthesis.response_text,  // ← Always round 1's synthesis
      ...
    ].join('\n');
    allRounds.push(dispatchRound(participants, roundPrompt, availability, dispatchOpts));
    // synthesis is never updated here
}
```

The variable `synthesis` is captured from the round 1 synthesis step above (line 401) and never reassigned. Round N participants receive round 1's synthesis regardless of N. The multi-round feature is broken for any `rounds > 2`.

#### 2. Markdown only includes synthesis for round 1 (discussion.ts:425-427)

`buildDiscussionMarkdown` has:
```javascript
if (i === 0) {
  lines.push(`## Synthesis (${result.synthesis.backend})`, '', result.synthesis.response_text, '');
}
```

This means rounds 2+ in the markdown file have no synthesis section. Additionally, the final `Outcome` block at the bottom uses `result.synthesis.response_text` (round 1 synthesis), not the last round's synthesis.

---

### HIGH

#### 3. `resolveReviewer` double-negative logic (discussion.ts:104-111)

```javascript
if (opts?.requireDifferentFromPrimary !== false && config.backend &&
    reviewerBackend === (config.backend as BackendId)) {
  return null;
}
```

The intent is: "requireDifferentFromPrimary defaults to true." But the `!== false` pattern obscures this. The semantics are:
- `undefined` → treated as `true` (skip)
- `true` → skip
- `false` → allow same backend

This is correct but the double-negative reads as a bug. The more idiomatic form would be:
```javascript
const requireDifferent = opts?.requireDifferentFromPrimary ?? true;
if (requireDifferent && config.backend && reviewerBackend === config.backend) return null;
```

#### 4. Model ceiling never enforced (discussion.ts:73-75, 190)

`DISCUSSION_SONNET_MODEL` is defined but `dispatchToBackend` never applies it:

```javascript
const DISCUSSION_SONNET_MODEL: string = 'sonnet';  // line 73 — unused
```

The function accepts `options?.model` and passes it directly to `buildArgs` with no ceiling check. REQ-149 ("discussion subagents must not exceed sonnet tier") is not implemented. Any caller can pass `'opus'` or a tier-higher model.

#### 5. `milestone` not path-traversal-protected unlike other path builders (paths.ts:132-133, 216-220)

`discussionsDir` has no escape check, while `phasesDir` (paths.ts:160) and `phaseDir` (paths.ts:174) both validate:
```javascript
if (!resolved.startsWith(milestonesBase + path.sep) && resolved !== milestonesBase) {
  throw new Error(`Invalid milestone: path would escape .planning directory`);
}
```

`discussionsDir` and `milestoneRoot` lack this guard. If `milestone='../../../etc'` is passed through `runDiscussion` options → `discussionsDir` → `milestoneRoot`, the file write escapes to `/etc`.

#### 6. `reviewPRViaBackend` prompt/type mismatch (discussion.ts:291-293, 796-798)

The type says `line: number` (types.ts:293) but the prompt specifies:
```
'{ "comments": [{"file": string, "line": number, "body": string, ...}]'
```
The backend is asked for a **number**, but `coerceSeverity` is the only field validator. There's no `coerceLine` or range check. Arbitrary numbers are accepted. Additionally, the `file` field has no validation against the actual diff content.

---

### MEDIUM

#### 7. Path traversal check uses `path.sep` on case-insensitive filesystems (discussion.ts:475)

```javascript
if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
```

On macOS APFS (case-insensitive), `../etc` can be encoded as `..%2F..%2Fetc` or different casing that `startsWith` might not catch after URL decoding. This is a defense-in-depth concern, but `phasesDir` and `phaseDir` (paths.ts:160, 174) use the same pattern so it's consistent with existing code.

#### 8. `readDiscussion` allows arbitrary file extensions (discussion.ts:471-477)

The path traversal guard prevents directory escape, but any file within the discussions directory is readable — including `.gitignore`, `.env`, or `config.json` if they somehow land there. No extension check is performed.

#### 9. `parseJSONFromResponse` returns `null` silently on parse failure (discussion.ts:454-486)

When JSON parsing fails, all three review functions (`reviewPlanViaBackend`, `reviewCodeViaBackend`, `reviewPRViaBackend`) return `approved: false` with `severity: 'warning'` and a truncated preview. This is a safe fallback, but there's no observable signal to the caller that a *parse* failure occurred vs. a genuine low-severity finding. Callers cannot distinguish between "backend returned valid JSON with all warnings" and "backend returned garbage."

#### 10. No file locking on concurrent `runDiscussion` calls (discussion.ts:429-432)

```javascript
const filePath = path.join(dir, filename);
// Both processes compute the same filename if they run in the same second
fs.writeFileSync(filePath, buildDiscussionMarkdown(result, phase, type), 'utf-8');
```

`Date.now()` has 1-second granularity. Two concurrent invocations within the same second produce identical `filename` values. The second write silently overwrites the first with no mutex, fcntl, or rename-then-rename safety.

#### 11. `discoverBackendConfigDirs` env-var check skips existence validation (backend.ts:786-788)

```javascript
if (envVar && process.env[envVar]) {
  result[backend] = process.env[envVar] as string;
  continue;
}
```

If a user sets `CLAUDE_CONFIG_DIR=/some/nonexistent/path`, the function returns that path without verifying it exists. The downstream `execFileSync` in `detectAvailableBackends` will then run with an invalid directory and likely fail silently. The comment says "env var already set — use it" which is intentional design, but there is no warning.

---

### LOW

#### 12. `BACKEND_AUTH_MARKERS.gemini` nested path never canonicalized (backend.ts:808-809)

```javascript
const hasAuth = markers.some((marker: string) => {
  try { return fs.statSync(path.join(candidate, marker)).isFile(); }
```

For `gemini`, a marker is `.gemini/oauth_creds.json` — a relative subpath. If the directory structure doesn't exist exactly as nested, `statSync` on the non-existent nested path returns false. This is correct behavior but subtle: if someone has `~/.gemini/oauth_creds.json` directly (not nested), it won't be found.

#### 13. `dispatchRound` availability check is redundant with caller (discussion.ts:345-352)

`runDiscussion` already filters participants via `detectAvailableBackends` before calling `dispatchRound`, and `dispatchRound` checks availability again per-participant. This double-check is harmless but redundant. More importantly, `dispatchRound` adds a `skipped` entry for already-skipped participants, which `buildDiscussionMarkdown` handles correctly — but the redundant work is unnecessary.

#### 14. `BackendResponse.stderr` type is optional but all callers treat it as required (types.ts:189)

```typescript
stderr?: string;
```

All error handling in discussion.ts uses `stderr` as if it's always present. This is fine in practice since the function always populates it, but the type signature doesn't enforce it.

---

### Summary Table

| # | Severity | Area | Function | Issue |
|---|----------|------|----------|-------|
| 1 | Critical | runDiscussion | Round loop | Synthesis never updated — multi-round broken |
| 2 | Critical | runDiscussion | buildDiscussionMarkdown | Only round 1 synthesis in output |
| 3 | High | resolveReviewer | Logic | Confusing double-negative |
| 4 | High | dispatchToBackend | Model ceiling | REQ-149 not enforced |
| 5 | High | discussionsDir | Path traversal | No milestone validation |
| 6 | High | reviewPRViaBackend | Type mismatch | `line` field unvalidated |
| 7 | Medium | readDiscussion | Path traversal | `path.sep` on case-insensitive FS |
| 8 | Medium | readDiscussion | File extension | No extension check |
| 9 | Medium | parseJSONFromResponse | Error handling | Silent null on parse failure |
| 10 | Medium | runDiscussion | Concurrency | No file locking |
| 11 | Medium | discoverBackendConfigDirs | Env var | No existence validation |
| 12 | Low | discoverBackendConfigDirs | Auth markers | Nested gemini path edge case |
| 13 | Low | dispatchRound | Redundancy | Double availability check |
| 14 | Low | BackendResponse | Types | Optional stderr not enforced |
---

## Synthesis (claude)

## Synthesized Code Review: lib/discussion.ts & lib/backend.ts

### Strong Consensus (all backends agree)

**1. Multi-round synthesis is broken** — All four reviewers flagged this as the top bug. `synthesis` is computed once after round 1 and never updated. Rounds 2+ all reference stale round-1 synthesis. The multi-round feature is non-functional for `rounds > 1`.

**2. `DISCUSSION_SONNET_MODEL` is dead code** — REQ-149 is documented but unenforced. No caller or guard prevents passing a higher-tier model. Either enforce it in `dispatchToBackend` or remove the constant.

**3. Codex silently drops model overrides** — `_model` is discarded in `BACKEND_CLI_MAP.codex.buildArgs`. Callers get no warning.

**4. `coerceSeverity` is case-sensitive** — `"BLOCKER"` or `"Blocker"` silently downgrades to `'warning'`. Add `.toLowerCase()` before comparison.

### Majority Consensus (3 of 4)

**5. Review functions ignore `stderr`** — When dispatch fails, `response_text` is empty, and the review functions report "unparseable response" instead of surfacing the actual error from `stderr`.

**6. `milestone` path traversal** — `discussionsDir` lacks the escape guard that `phasesDir`/`phaseDir` have. A crafted milestone can write outside `.planning/`.

**7. `resolveReviewer` double-negative** — `!== false` works but reads like a bug. Replace with `?? true`.

### Unique Insights Worth Acting On

- **Claude**: `maxBuffer` kill misreported as timeout (both set `error.killed = true`). Differentiate before the timeout branch.
- **Claude**: `parseJSONFromResponse` greedy regex grabs the first code fence, which may be non-JSON (e.g., a Python example before the JSON block).
- **Codex**: Severity gate is dead — `approved` is trusted verbatim from the model. A reviewer can return `approved: true` with blocker issues and it passes through. `code_review_severity_gate` config is never consulted.
- **OpenCode**: `Date.now()` filename collision — two concurrent calls in the same millisecond overwrite each other.
- **OpenCode**: `discoverBackendConfigDirs` trusts env vars without verifying the directory exists.

### Disagreements / Noise

- **readDiscussion path traversal with trailing separator** (Claude) — theoretical; `discussionsDir` doesn't return trailing slashes in practice.
- **File extension filtering in readDiscussion** (OpenCode) — defense-in-depth, not a real attack surface since the directory is GRD-controlled.
- **Double availability check in dispatchRound** (OpenCode) — actually useful since availability can include the synthesizer, which isn't in the participant list.

### Prioritized Fix List

| Priority | Fix | Impact |
|----------|-----|--------|
| P0 | Re-synthesize after each round in `runDiscussion` | Core feature broken |
| P0 | Add milestone path validation in `discussionsDir` | Security |
| P1 | Surface `stderr` in review function error paths | Debuggability |
| P1 | Case-insensitive `coerceSeverity` | Silent severity downgrade |
| P1 | Differentiate maxBuffer kill from timeout | Misdiagnosis |
| P1 | Enforce severity gate (don't trust `approved` blindly) | Review integrity |
| P2 | Fix greedy regex in `parseJSONFromResponse` (use last match or `json`-tagged only) | Parsing reliability |
| P2 | Warn or error on codex model override | API honesty |
| P2 | Enforce `DISCUSSION_SONNET_MODEL` ceiling or remove it | Dead code |
| P3 | Refactor `resolveReviewer` double-negative | Readability |
| P3 | Add timestamp uniqueness (e.g., counter suffix) to filenames | Concurrency edge case |

### Recommendation

Fix P0 items immediately — the stale synthesis bug means every multi-round discussion today is producing misleading output, and the milestone path traversal is a real security gap. P1 items should land in the same release since they affect review correctness. P2/P3 can be batched into a follow-up.

## Round 2

### claude Response
Good. Now I have a complete picture. Here's my round 2 response:

---

## Round 2 Response

I've verified each claim against the source. The synthesis is largely accurate. Here are my agreements, corrections, and additional findings:

### Full Agreement

**P0: Stale synthesis bug (lines 406-418)** — Confirmed. `synthesis` is `const` on line 401, never reassigned. Rounds 2+ all reference the same `synthesis.response_text` on line 414. This is the most impactful bug.

**P0: Milestone path traversal in `discussionsDir`** — Confirmed. `discussionsDir()` at `paths.ts:216-221` does NO path validation, while `phasesDir()` at `paths.ts:158-163` has an explicit `startsWith` guard. A crafted milestone like `../../etc` would escape `.planning/`. The same gap exists in `researchDir`, `todosDir`, `quickDir`, and `standardsDir` — only `phasesDir` and `phaseDir` are protected.

**P1: `coerceSeverity` case-sensitivity (line 107-109)** — Confirmed. `SEVERITY_VALUES.includes(raw as Severity)` is case-sensitive. A model returning `"Blocker"` gets silently downgraded to `'warning'`.

**P1: Review functions ignore `stderr` (e.g., lines 640-656)** — Confirmed. When dispatch fails, `response_text` is `''` and `stderr` has the actual error, but all three review functions only examine `response_text`. The error path reports "unparseable response: " (empty string truncated) instead of the real error.

### Corrections to Synthesis

**Severity gate claim needs nuance.** The synthesis says `code_review_severity_gate` is "dead" — but looking at the config definition (`utils.ts:331`, default `'blocker'`) and how it's passed into execution context (`execute.ts:233,652`), the gate is *configured and passed around* but never *consulted within `reviewPlanViaBackend`/`reviewCodeViaBackend`*. Those functions return `approved` verbatim from the model. The gate may be enforced by the *caller* (the executor context), not by `discussion.ts` itself. This needs verification at call sites before calling it dead.

**`resolveReviewer` double-negative (line 122)** — The synthesis says `!== false` "works but reads like a bug." I'd call this *intentional*: the default behavior is `requireDifferentFromPrimary: true`. When `opts` is `undefined`, `opts?.requireDifferentFromPrimary` is `undefined`, and `undefined !== false` is `true` — so the gate activates by default. Only `reviewPRViaBackend` explicitly passes `false` to allow same-backend review. The logic is correct, though a default-parameter pattern would be clearer.

### Additional Findings

**1. `readDiscussion` path guard is bypassable (line 474).** The check `!filePath.startsWith(dir + path.sep) && filePath !== dir` fails for a filename like `""` (empty string) — `path.join(dir, "")` returns `dir` itself, which passes the `filePath === dir` branch. Then `safeReadFile(dir)` would attempt to read a directory as a file. Not a security issue but an unhandled edge case that should return `null`.

**2. `buildDiscussionMarkdown` writes synthesis only after round 1 (line 325).** The `if (i === 0)` guard means even if we fixed the stale synthesis bug to re-synthesize each round, the markdown output would still only include the round-1 synthesis. The markdown builder needs to accept per-round synthesis data.

**3. Redundant availability detection in pre-planning/pre-execution functions.** `runPrePlanningDiscussion` calls `detectAvailableBackends()` at line 537, then passes `cwd` to `runDiscussion` which calls `detectAvailableBackends()` again at line 385. Since detection is cached for 5 minutes this is harmless but wasteful — the availability result from the first call should be forwarded.

**4. `dispatchRound` double-checks availability (line 346) then `dispatchToBackend` checks again (line 205).** Same redundancy — not a bug but adds unnecessary `detectAvailableBackends` calls if the cache expires between the two checks.

**5. Prompt includes literal `boolean`/`string` type annotations (lines 631-633, 709-711, 794-795).** The JSON schema examples sent to the reviewer backend contain TypeScript type syntax (`boolean`, `string`) inside JSON, not valid JSON values. Models generally infer the intent, but this could cause some backends to return malformed responses. Should use example values instead: `"approved": true, "concerns": [{"description": "...", "severity": "blocker"}]`.

### Revised Priority

| Priority | Fix | Notes |
|----------|-----|-------|
| P0 | Re-synthesize after each round | Core feature broken |
| P0 | Add milestone path validation to `discussionsDir` (and siblings) | 5 functions unprotected, not just 1 |
| P1 | Surface `stderr` in review error paths | Easy fix, high debuggability gain |
| P1 | Case-insensitive `coerceSeverity` | One-line `.toLowerCase()` |
| P1 | Differentiate maxBuffer kill from timeout | Misdiagnosis in production |
| P1 | Fix `buildDiscussionMarkdown` to support per-round synthesis | Required for multi-round fix to be complete |
| P2 | Use valid JSON examples in review prompts | Parsing reliability |
| P2 | Guard `readDiscussion` against empty filename | Edge case |
| P2 | Codex model override warning | API honesty |
| P3 | Refactor `resolveReviewer` for clarity | Readability only |
| P3 | Filename uniqueness counter | Concurrency edge case |
---

### codex Response
I agree with the two P0 items in the synthesis, and I’d tighten a few of the “majority” items based on the code.

`runDiscussion()` is definitely broken for `rounds > 1`. The synthesis is computed once at [lib/discussion.ts:400](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L400) and stored in the immutable `synthesis` binding at [lib/discussion.ts:401](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L401). Later rounds at [lib/discussion.ts:406](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L406)–[420](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L420) always feed participants the round-1 synthesis via `synthesis.response_text` at [lib/discussion.ts:414](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L414). That makes the orchestration effectively “round 1 plus repeated follow-ups to the same summary,” not a true iterative discussion. There is a second-order bug here too: `buildDiscussionMarkdown()` only emits one synthesis section, and only after round 1, at [lib/discussion.ts:325](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L325)–[326](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L326), so even after fixing orchestration the persisted history format is incomplete.

The milestone traversal concern is real. `runDiscussion()` writes to `discussionsDir(cwd, milestone)` at [lib/discussion.ts:391](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L391), and `listDiscussions()` / `readDiscussion()` do the same at [lib/discussion.ts:451](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L451) and [lib/discussion.ts:472](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L472). But `discussionsDir()` in [lib/paths.ts:216](\/Users/neo/Developer/Projects/GetResearchDone/lib/paths.ts#L216)–[220](\/Users/neo/Developer/Projects/GetResearchDone/lib/paths.ts#L220) has no escape check, unlike `phasesDir()` at [lib/paths.ts:154](\/Users/neo/Developer/Projects/GetResearchDone/lib/paths.ts#L154)–[163](\/Users/neo/Developer/Projects/GetResearchDone/lib/paths.ts#L163). A crafted `milestone` can push discussion reads and writes outside `.planning/milestones/...`.

I also agree the review wrappers mishandle backend failures. In `reviewPlanViaBackend()`, `reviewCodeViaBackend()`, and `reviewPRViaBackend()`, the code parses only `response.response_text` at [lib/discussion.ts:640](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L640), [lib/discussion.ts:718](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L718), and [lib/discussion.ts:803](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L803). If `dispatchToBackend()` failed, the actual error is in `response.stderr` from [lib/discussion.ts:251](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L251)–[255](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L255), but the caller reports an “unparseable response” based on an empty string. That loses the only useful diagnostic.

Additional findings I would add:

- `coerceSeverity()` in `coerceSeverity` is case-sensitive at [lib/discussion.ts:107](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L107)–[109](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L109). That is not just cosmetic: `"BLOCKER"` downgrades to `'warning'`, which can silently flip gating outcomes.
- Reviewer gating is incomplete. `reviewPlanViaBackend()` and `reviewCodeViaBackend()` trust the model’s `approved` boolean directly at [lib/discussion.ts:659](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L659) and [lib/discussion.ts:739](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L739). `code_review_severity_gate` exists elsewhere in config, but `discussion.ts` never consults it, so a payload like `approved: true` plus blocker issues passes through.
- `parseJSONFromResponse()` is fragile at [lib/discussion.ts:490](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L490)–[503](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L503). It grabs the first fenced block, not the `json` block or the last block. A response with a prose example fence before the actual JSON will fail parsing.
- `dispatchToBackend()` likely misclassifies some subprocess failures as timeouts. The branch at [lib/discussion.ts:242](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L242) treats `killed` or `SIGTERM` as timeout unconditionally, but `execFileSync` can terminate for reasons other than the timeout path.
- `codex` model override is silently ignored in `BACKEND_CLI_MAP.codex.buildArgs` at [lib/discussion.ts:147](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L147)–[150](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L150). If `DispatchOptions.model` is part of the contract, this is misleading behavior.
- `discoverBackendConfigDirs()` trusts an already-set backend env var at [lib/backend.ts:785](\/Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts#L785)–[789](\/Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts#L789) without verifying the path exists or contains auth markers, so `buildBackendEnv()` at [lib/backend.ts:838](\/Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts#L838)–[846](\/Users/neo/Developer/Projects/GetResearchDone/lib/backend.ts#L846) can inject a broken config dir and make backend detection/spawning fail in a non-obvious way.
- `listDiscussions()` at [lib/discussion.ts:450](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L450)–[456](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L456) returns raw `readdirSync()` output unsorted and unfiltered, so callers can get directories, temp files, and nondeterministic order.

One item I’d downgrade: `resolveReviewer()`’s `!== false` check at [lib/discussion.ts:122](\/Users/neo/Developer/Projects/GetResearchDone/lib/discussion.ts#L122) is ugly, but it is behaving as intended. I’d call that readability debt, not a logic bug.
---

### gemini Response

---

### opencode Response
I've verified all the synthesis claims. Here's my response to the synthesis:

---

**Agree on all P0/P1 items.** Every bug the synthesis lists is real and I can confirm it from the source. A few refinements and additions:

### Confirmations & Clarifications

**P0 — Multi-round synthesis stale bug** (discussion.ts:406-421): Confirmed. `synthesis` is computed once at line 401 and never updated inside the loop. Every subsequent round's `roundPrompt` at line 414 references the same round-1 synthesis.

**P0 — milestone path traversal**: Confirmed, but the fix location is `lib/paths.ts` not `discussion.ts`. `discussionsDir()` (paths.ts:216-221), `quickDir()` (paths.ts:226-231), `researchDir()` (paths.ts:183-188), and `todosDir()` (paths.ts:205-210) all call `milestoneRoot()` (paths.ts:132-134) directly with no escape guard — unlike `phasesDir()` (paths.ts:160-162) which has one. The guard belongs in `milestoneRoot()` itself, which would fix all four callers at once.

**P1 — stderr surfacing**: Confirmed. In `reviewPlanViaBackend` (lines 640-656), `reviewCodeViaBackend` (lines 718-736), and `reviewPRViaBackend` (lines 803-820), when `dispatchToBackend` returns `{ stderr: "Backend not available" }`, `parseJSONFromResponse('')` returns null, and the caller reports "unparseable response" — losing the real error. The fix: check `response.stderr` before calling `parseJSONFromResponse`.

**P1 — case-insensitive coerceSeverity**: Confirmed. `SEVERITY_VALUES.includes()` at line 108 is strict. `"BLOCKER"` silently becomes `'warning'`.

**P1 — maxBuffer vs timeout**: Confirmed. Line 242 catches all `killed` cases (timeout OR maxBuffer exceeded) with the same "timed out" message. Need to differentiate: maxBuffer kills set `errno: 'ENOBUFS'` on the error object.

### Additional Issues Not in Synthesis

**OpenCode — `discoverBackendConfigDirs` trusts env vars without verification** (backend.ts:786-788): If `CLAUDE_CONFIG_DIR` is set to `/nonexistent/path`, it's accepted and injected into the subprocess env without checking it exists. Should call `fs.statSync` on the env var value.

**P2 — `readDiscussion` escape guard is redundant** (discussion.ts:474): The guard `!filePath.startsWith(dir + path.sep)` uses `path.join(dir, filename)` as input. Since `path.join` always normalizes, `filePath` is always a child of `dir` by construction — the guard can never trigger for normal input. It's dead code that creates false confidence. The actual vulnerability is in `discussionsDir` (see P0 above).

**P3 — `runDiscussion` silently drops synthesis from rounds 2+**: The markdown output (lines 325-327) only includes the round-1 synthesis under `## Synthesis`, and the final `## Outcome` section (line 330) is always the round-1 synthesis too. Even if the synthesis re-computation bug were fixed, `buildDiscussionMarkdown` would need updating to show each round's synthesis.

### Priority Adjustments

| Item | Synthesis | My View |
|------|-----------|---------|
| P0 | Re-synthesize per round | Agree, and `buildDiscussionMarkdown` also needs updating |
| P0 | milestone guard in `discussionsDir` | Agree, but fix should be in `milestoneRoot()` to protect all callers |
| P1 | `code_review_severity_gate` dead code | Add to P1 — the gate is documented but completely absent from the codebase |
---

## Outcome

## Synthesized Code Review: lib/discussion.ts & lib/backend.ts

### Strong Consensus (all backends agree)

**1. Multi-round synthesis is broken** — All four reviewers flagged this as the top bug. `synthesis` is computed once after round 1 and never updated. Rounds 2+ all reference stale round-1 synthesis. The multi-round feature is non-functional for `rounds > 1`.

**2. `DISCUSSION_SONNET_MODEL` is dead code** — REQ-149 is documented but unenforced. No caller or guard prevents passing a higher-tier model. Either enforce it in `dispatchToBackend` or remove the constant.

**3. Codex silently drops model overrides** — `_model` is discarded in `BACKEND_CLI_MAP.codex.buildArgs`. Callers get no warning.

**4. `coerceSeverity` is case-sensitive** — `"BLOCKER"` or `"Blocker"` silently downgrades to `'warning'`. Add `.toLowerCase()` before comparison.

### Majority Consensus (3 of 4)

**5. Review functions ignore `stderr`** — When dispatch fails, `response_text` is empty, and the review functions report "unparseable response" instead of surfacing the actual error from `stderr`.

**6. `milestone` path traversal** — `discussionsDir` lacks the escape guard that `phasesDir`/`phaseDir` have. A crafted milestone can write outside `.planning/`.

**7. `resolveReviewer` double-negative** — `!== false` works but reads like a bug. Replace with `?? true`.

### Unique Insights Worth Acting On

- **Claude**: `maxBuffer` kill misreported as timeout (both set `error.killed = true`). Differentiate before the timeout branch.
- **Claude**: `parseJSONFromResponse` greedy regex grabs the first code fence, which may be non-JSON (e.g., a Python example before the JSON block).
- **Codex**: Severity gate is dead — `approved` is trusted verbatim from the model. A reviewer can return `approved: true` with blocker issues and it passes through. `code_review_severity_gate` config is never consulted.
- **OpenCode**: `Date.now()` filename collision — two concurrent calls in the same millisecond overwrite each other.
- **OpenCode**: `discoverBackendConfigDirs` trusts env vars without verifying the directory exists.

### Disagreements / Noise

- **readDiscussion path traversal with trailing separator** (Claude) — theoretical; `discussionsDir` doesn't return trailing slashes in practice.
- **File extension filtering in readDiscussion** (OpenCode) — defense-in-depth, not a real attack surface since the directory is GRD-controlled.
- **Double availability check in dispatchRound** (OpenCode) — actually useful since availability can include the synthesizer, which isn't in the participant list.

### Prioritized Fix List

| Priority | Fix | Impact |
|----------|-----|--------|
| P0 | Re-synthesize after each round in `runDiscussion` | Core feature broken |
| P0 | Add milestone path validation in `discussionsDir` | Security |
| P1 | Surface `stderr` in review function error paths | Debuggability |
| P1 | Case-insensitive `coerceSeverity` | Silent severity downgrade |
| P1 | Differentiate maxBuffer kill from timeout | Misdiagnosis |
| P1 | Enforce severity gate (don't trust `approved` blindly) | Review integrity |
| P2 | Fix greedy regex in `parseJSONFromResponse` (use last match or `json`-tagged only) | Parsing reliability |
| P2 | Warn or error on codex model override | API honesty |
| P2 | Enforce `DISCUSSION_SONNET_MODEL` ceiling or remove it | Dead code |
| P3 | Refactor `resolveReviewer` double-negative | Readability |
| P3 | Add timestamp uniqueness (e.g., counter suffix) to filenames | Concurrency edge case |

### Recommendation

Fix P0 items immediately — the stale synthesis bug means every multi-round discussion today is producing misleading output, and the milestone path traversal is a real security gap. P1 items should land in the same release since they affect review correctness. P2/P3 can be batched into a follow-up.
