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
  ElicitationDetection,
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
  const normalized = typeof raw === 'string' ? raw.toLowerCase() : '';
  return SEVERITY_VALUES.includes(normalized as Severity) ? (normalized as Severity) : 'warning';
}

function reviewFallbackMessage(response: BackendResponse): string {
  return response.stderr
    ? `Reviewer dispatch failed: ${response.stderr.slice(0, 200)}`
    : `Reviewer returned unparseable response: ${response.response_text.slice(0, 200)}`;
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
  if ((opts?.requireDifferentFromPrimary ?? true) && config.backend && reviewerBackend === (config.backend as BackendId)) {
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
      // Distinguish maxBuffer exceeded (fast kill) from timeout (near-timeout kill)
      const isTimeout = duration_ms >= timeout * 0.9;
      return {
        backend: backendId,
        response_text: '',
        duration_ms,
        stderr: isTimeout
          ? `Dispatch timed out after ${timeout}ms`
          : `Dispatch killed (maxBuffer exceeded or signal) after ${duration_ms}ms`,
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

  const allRounds: DiscussionRoundEntry[][] = [round1Results];

  // Synthesize after round 1, then re-synthesize after each additional round
  let synthPrompt = buildSynthesisPrompt(topic, round1Results);
  let synthesis: BackendResponse = dispatchToBackend(synthesizer, synthPrompt, dispatchOpts);

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

    const roundResults = dispatchRound(participants, roundPrompt, availability, dispatchOpts);
    allRounds.push(roundResults);

    // Re-synthesize incorporating the new round's responses
    synthPrompt = buildSynthesisPrompt(topic, roundResults);
    synthesis = dispatchToBackend(synthesizer, synthPrompt, dispatchOpts);
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
 * Check if the brainstormer backend is configured and available for a
 * discussion gate (before_planning or before_execution).
 *
 * Returns the brainstormer BackendId on success, or null to skip.
 */
function resolveBrainstormer(
  config: GrdConfig,
  gate: 'before_planning' | 'before_execution',
  cwd?: string
): BackendId | null {
  if (config.discussion?.enabled === false) return null;
  // before_planning defaults to true; before_execution must be explicitly true
  if (gate === 'before_planning' && config.discussion?.before_planning === false) return null;
  if (gate === 'before_execution' && config.discussion?.before_execution !== true) return null;
  if (!config.backend_roles?.brainstormer) return null;

  const brainstormerBackend: BackendId = config.backend_roles.brainstormer;
  const availability = detectAvailableBackends(cwd);
  if (!availability[brainstormerBackend]?.available) return null;

  return brainstormerBackend;
}

/**
 * Run a pre-planning discussion with the configured brainstormer backend.
 *
 * Checks config flags before dispatching. Returns null (silently skips)
 * when discussion is disabled, before_planning is false, or the brainstormer
 * backend is not configured or unavailable.
 *
 * REQ-138
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

  const brainstormer = resolveBrainstormer(config, 'before_planning', cwd);
  if (!brainstormer) return null;

  const reqLines = requirements.map((r) => `- ${r}`).join('\n');
  const topic = `Pre-planning discussion for phase goal: ${phaseGoal}\n\nRequirements:\n${reqLines}`;

  return runDiscussion(topic, [brainstormer], {
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
 */
function runPreExecutionDiscussion(options: {
  planSummary: string;
  cwd?: string;
  phase?: string;
  milestone?: string | null;
  config: GrdConfig;
}): DiscussionResult | null {
  const { planSummary, cwd, phase, milestone, config } = options;

  const brainstormer = resolveBrainstormer(config, 'before_execution', cwd);
  if (!brainstormer) return null;

  const topic = `Pre-execution discussion: surface implementation concerns for the following plan:\n\n${planSummary}`;

  return runDiscussion(topic, [brainstormer], {
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
      { description: reviewFallbackMessage(response), severity: 'warning' },
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
      { severity: 'warning', file: '', line_range: '', description: reviewFallbackMessage(response) },
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

// --- Elicitation Detection ---------------------------------------------------

/**
 * Clarification phrases that strongly indicate a backend is asking for input.
 * Matched case-insensitively.
 */
const CLARIFICATION_PHRASES = [
  'please clarify',
  'which approach',
  'could you specify',
  'would you prefer',
  'do you want',
];


/**
 * Detect elicitation patterns in backend output text.
 *
 * Parses the output line-by-line to find questions, numbered option lists,
 * or clarification phrases that indicate the backend is waiting for user input.
 * False-positive filters exclude questions inside code blocks, comments,
 * string literals, and markdown headers.
 *
 * Detection patterns (in priority order):
 *   1. direct_question: Line ends with '?' (not in code/comment context)
 *   2. numbered_options: 2+ consecutive lines matching /^\s*\d+[.)]\s+/
 *   3. clarification_phrase: Line contains known clarification keywords
 *   4. option_prompt: Line contains "Choose one", "Select an option", "Pick one"
 *
 * @param output - Full text output from a backend subprocess (may be multi-line)
 * @returns An ElicitationDetection on match, or null if no elicitation detected
 */
function detectElicitation(output: string): ElicitationDetection | null {
  if (!output) return null;

  const lines = output.split('\n');
  let inCodeBlock = false;


  // Option-prompt phrases (case-insensitive)
  const OPTION_PROMPTS = [
    'choose one',
    'select an option',
    'pick one',
  ];

  // Numbered option pattern: lines like "1. Foo", "2) Bar"
  const NUMBERED_OPTION_RE = /^\s*\d+[.)]\s+/;

  /**
   * Returns true if a '?' on this line appears to be inside a string literal.
   * Simple heuristic: count quote characters before the last '?'. If the
   * number of quotes before the '?' is odd, the '?' is likely inside a string.
   */
  function questionInString(line: string): boolean {
    const qIdx = line.lastIndexOf('?');
    if (qIdx === -1) return false;
    const before = line.slice(0, qIdx);
    // Count unescaped single quotes and double quotes separately
    const singleQuotes = (before.match(/(?<!\\)'/g) ?? []).length;
    const doubleQuotes = (before.match(/(?<!\\)"/g) ?? []).length;
    // If either count is odd, the '?' is inside a string
    return singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0;
  }

  const SKIPPED_PREFIXES = ['//', '/*', '*', '#', 'at ', 'Error:', 'Warning:'];

  function isSkippedContext(trimmed: string): boolean {
    return SKIPPED_PREFIXES.some((p) => trimmed.startsWith(p));
  }

  /**
   * Returns true if a line looks like a short rhetorical question
   * (single word followed by '?') that appears to be a sentence connector
   * rather than a standalone question to the user.
   * Pattern: one word ending with '?', not preceded by typical elicitation context.
   */
  function isRhetoricalQuestion(trimmed: string): boolean {
    // "Why?" or "Why? Because..." — single word before '?'
    return /^\w+\?/.test(trimmed) && trimmed.split(/\s+/).length <= 2;
  }

  // Pass 1: look for numbered option blocks (need 2+ consecutive matches)
  // We need to find these first to handle mixed patterns correctly.
  let consecutiveNumbered = 0;
  let numberedStart = -1;
  let numberedEnd = -1;

  {
    let blockDepth = 0;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('```')) {
        blockDepth = blockDepth === 0 ? 1 : 0;
      }
      if (blockDepth > 0) {
        consecutiveNumbered = 0;
        continue;
      }
      if (NUMBERED_OPTION_RE.test(lines[i])) {
        if (consecutiveNumbered === 0) numberedStart = i;
        consecutiveNumbered++;
        numberedEnd = i;
      } else {
        if (consecutiveNumbered >= 2) break; // found block
        consecutiveNumbered = 0;
        numberedStart = -1;
      }
    }
  }

  if (consecutiveNumbered >= 2 && numberedStart !== -1) {
    const questionLines = lines.slice(numberedStart, numberedEnd + 1);
    return {
      question: questionLines.join('\n'),
      patterns: ['numbered_options'],
      confidence: 'high',
    };
  }

  // Pass 2: scan line-by-line for other patterns
  for (const line of lines) {
    const trimmed = line.trim();

    // Track code block fences
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip commented/header/trace lines
    if (isSkippedContext(trimmed)) continue;

    // Skip empty lines
    if (trimmed.length === 0) continue;

    const lower = trimmed.toLowerCase();

    // Pattern: clarification_phrase
    for (const phrase of CLARIFICATION_PHRASES) {
      if (lower.includes(phrase)) {
        return {
          question: trimmed,
          patterns: ['clarification_phrase'],
          confidence: 'high',
        };
      }
    }

    // Pattern: direct_question — line ends with '?'
    if (trimmed.endsWith('?')) {
      if (questionInString(trimmed)) continue;
      if (isRhetoricalQuestion(trimmed)) continue;
      return {
        question: trimmed,
        patterns: ['direct_question'],
        confidence: 'high',
      };
    }

    // Pattern: option_prompt
    for (const phrase of OPTION_PROMPTS) {
      if (lower.includes(phrase)) {
        return {
          question: trimmed,
          patterns: ['option_prompt'],
          confidence: 'medium',
        };
      }
    }
  }

  return null;
}

// --- Elicitation Context Builder and Resolver --------------------------------

/**
 * Section budgets in characters for buildElicitationContext.
 * Total: ~32000 chars (~8K tokens).
 */
const ELICITATION_BUDGET = {
  question: 1000,
  phaseGoal: 1000,
  planSummary: 2000,
  recentChanges: 2000,
  projectState: 1000,
} as const;

/**
 * Truncate a string to maxChars, appending a truncation notice if needed.
 */
function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars) + '\n[... truncated ...]';
}

/**
 * Search milestones/MILESTONE/phases/PHASE*\/*-PLAN.md for an objective tag.
 * Returns the trimmed objective text or '' if not found.
 */
function findPlanObjective(milestonesDir: string, phase: string, milestone?: string): string {
  try {
    const milestones = milestone ? [milestone] : fs.readdirSync(milestonesDir);
    for (const ms of milestones) {
      const phasesPath = path.join(milestonesDir, ms, 'phases');
      let phaseEntries: string[];
      try { phaseEntries = fs.readdirSync(phasesPath); } catch { continue; }
      for (const entry of phaseEntries) {
        if (!entry.startsWith(phase)) continue;
        let planFiles: string[];
        try { planFiles = fs.readdirSync(path.join(phasesPath, entry)); } catch { continue; }
        const planFile = planFiles.find((f) => f.endsWith('-PLAN.md'));
        if (!planFile) continue;
        const content = fs.readFileSync(path.join(phasesPath, entry, planFile), 'utf-8');
        const objMatch = content.match(/<objective>([\s\S]*?)<\/objective>/);
        return objMatch ? objMatch[1].trim() : '';
      }
    }
  } catch { /* milestonesDir not readable */ }
  return '';
}

/**
 * Build a context string for elicitation resolution.
 *
 * Assembles up to 5 sections:
 *   - ## Question: the detected elicitation text
 *   - ## Phase Goal: extracted from ROADMAP.md for the given phase
 *   - ## Plan Summary: extracted from the active PLAN.md objective element
 *   - ## Recent Changes: git diff --stat HEAD~3..HEAD
 *   - ## Project State: current position from STATE.md
 *
 * All file reads are wrapped in try/catch — missing files silently omit the section.
 * Total output is kept under 32000 chars (~8K tokens).
 *
 * @param question - The elicitation question text to answer
 * @param options  - Configuration: cwd (project root), optional phase identifier
 * @returns A context string with clearly labeled sections
 */
function buildElicitationContext(
  question: string,
  options: { cwd: string; phase?: string; milestone?: string }
): string {
  const { cwd, phase, milestone } = options;
  const planningDir = path.join(cwd, '.planning');

  const sections: string[] = [];

  // ## Question
  sections.push('## Question\n' + truncate(question, ELICITATION_BUDGET.question));

  // ## Phase Goal — read from ROADMAP.md
  try {
    const roadmapPath = path.join(planningDir, 'ROADMAP.md');
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    let goalText = '';
    if (phase) {
      // Find the phase section and extract the goal line
      const lines = roadmapContent.split('\n');
      let inPhaseSection = false;
      const phaseRe = new RegExp(`Phase\\s+${phase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      for (const line of lines) {
        // Match headings containing the phase number
        if (line.match(phaseRe)) {
          inPhaseSection = true;
          continue;
        }
        if (inPhaseSection) {
          // Stop at next heading of same or higher level
          if (line.match(/^#{1,3}\s/)) break;
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            goalText += (goalText ? '\n' : '') + trimmed;
            if (goalText.length >= ELICITATION_BUDGET.phaseGoal) break;
          }
        }
      }
    }
    if (!goalText && roadmapContent.length > 0) {
      // Fallback: first non-empty paragraph from ROADMAP
      const paras = roadmapContent.split(/\n{2,}/);
      for (const para of paras) {
        const trimmed = para.trim();
        if (trimmed.length > 10) {
          goalText = trimmed;
          break;
        }
      }
    }
    if (goalText) {
      sections.push('## Phase Goal\n' + truncate(goalText, ELICITATION_BUDGET.phaseGoal));
    }
  } catch {
    // Missing ROADMAP.md — omit section
  }

  // Section: Plan Summary — read active PLAN.md objective
  if (phase) {
    const planText = findPlanObjective(path.join(planningDir, 'milestones'), String(phase), milestone);
    if (planText) {
      sections.push('## Plan Summary\n' + truncate(planText, ELICITATION_BUDGET.planSummary));
    }
  }

  // ## Recent Changes — git diff --stat HEAD~3..HEAD
  try {
    const diffStat = execFileSync('git', ['diff', '--stat', 'HEAD~3..HEAD'], {
      timeout: 10000,
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    });
    if (diffStat && diffStat.trim()) {
      sections.push(
        '## Recent Changes\n' + truncate(diffStat.trim(), ELICITATION_BUDGET.recentChanges)
      );
    }
  } catch {
    // Git not available or no history — omit section
  }

  // ## Project State — read STATE.md current position section
  try {
    const statePath = path.join(planningDir, 'STATE.md');
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    // Extract up to the first 1K chars; focus on position/current status
    const posMatch = stateContent.match(/(?:## Current Position|## Status|Current Plan:)[^\n]*([\s\S]{0,800})/i);
    const stateSnippet = posMatch
      ? posMatch[0].trim()
      : stateContent.slice(0, ELICITATION_BUDGET.projectState);
    sections.push('## Project State\n' + truncate(stateSnippet, ELICITATION_BUDGET.projectState));
  } catch {
    // Missing STATE.md — omit section
  }

  return sections.join('\n\n');
}

/**
 * Route an elicitation question through a single-round multi-backend discussion
 * and return the consensus answer text.
 *
 * Calls runDiscussion() with rounds=1 for speed. Falls back to the first
 * non-skipped participant response if synthesis fails. Returns '' when all
 * participants are unavailable.
 *
 * @param question     - The elicitation question to resolve
 * @param context      - Context string from buildElicitationContext()
 * @param options      - participants, synthesizer, and cwd
 * @returns The resolved answer text, or '' if resolution is not possible
 */
function resolveElicitation(
  question: string,
  context: string,
  options: {
    participants: BackendId[];
    synthesizer: BackendId;
    cwd: string;
  }
): string {
  const { participants, synthesizer, cwd } = options;

  const topic = [
    context,
    '',
    '## Instructions',
    'Based on the context above, answer the question concisely and make a concrete decision.',
    'Do not ask clarifying questions. Provide a direct, actionable answer.',
  ].join('\n');

  let result: DiscussionResult;
  try {
    result = runDiscussion(topic, participants, {
      rounds: 1,
      synthesizer,
      cwd,
      type: 'elicitation',
    });
  } catch {
    return '';
  }

  // Happy path: synthesis has response text
  const synthText =
    result.synthesis &&
    typeof result.synthesis.response_text === 'string'
      ? result.synthesis.response_text.trim()
      : '';
  if (synthText) return synthText;

  // Fallback: find first non-skipped round entry
  const round0 = result.rounds[0] as DiscussionRoundEntry[] | undefined;
  if (!round0) return '';

  for (const entry of round0) {
    if (!('skipped' in entry) && entry.response_text && entry.response_text.trim()) {
      return entry.response_text.trim();
    }
  }

  return '';
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
  detectElicitation,
  buildElicitationContext,
  resolveElicitation,
  DISCUSSION_SONNET_MODEL,
  BACKEND_CLI_MAP,
  DEFAULT_DISPATCH_TIMEOUT_MS,
};
