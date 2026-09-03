'use strict';

function extractTaggedJson<T>(stdout: string, tag: string): T | null {
  const idx = stdout.indexOf(`__${tag}__`);
  if (idx === -1) return null;
  const rest = stdout.slice(idx + tag.length + 4);
  const start = rest.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < rest.length; i++) {
    const ch = rest[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(rest.slice(start, i + 1)) as T; } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * Stopwords dropped before measuring the advisory refutation overlap. Deliberately a local
 * copy: the sibling list at lib/commands/select-candidate.ts is module-private and carries
 * plan-vocabulary terms ('phase', 'roadmap', 'summary') that mean nothing to a hypothesis.
 */
const OVERLAP_STOP: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'this', 'that', 'then', 'than',
  'are', 'was', 'were', 'has', 'have', 'had', 'will', 'would', 'should', 'not', 'but',
]);

/** Content tokens (>=3 chars, stopwords dropped) — the unit the advisory overlap is measured in. */
function _overlapTokens(text: string): Set<string> {
  const set = new Set<string>();
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g);
  if (!matches) return set;
  for (const t of matches) if (!OVERLAP_STOP.has(t)) set.add(t);
  return set;
}

/**
 * ADVISORY token-Jaccard overlap between a hypothesis statement and its refutationCondition.
 * Computed for the audit trail and returned beside the candidate; NOTHING branches on it, by
 * design. The mandated template ("If X is the cause, then changing Y makes the effect
 * disappear / changing Z makes it worse") reuses most of the statement's tokens by
 * construction, so a near-restatement gate would fire hardest on the BEST-formed answers.
 * Branch on this only once a threshold has been tuned against data.
 */
function _refutationOverlap(statement: string, refutationCondition: string): number {
  const a = _overlapTokens(statement);
  const b = _overlapTokens(refutationCondition);
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * A REQUIRED free-text field, or '' when it is absent, blank, or not a string. Type-guarding
 * before trimming is load-bearing twice over. `String(o.statement)` on a non-string THREW out of
 * the parser (`text.toLowerCase is not a function`, raised inside _refutationOverlap); the throw
 * escaped spawnAndParse — whose parse call sits outside its try — so the retry budget was
 * bypassed and the whole run died with an uncaught stack trace instead of a clean errExit. And
 * `String(o.refutationCondition)` quietly minted plausible audit text: an object became the
 * literal '[object Object]', `["z"]` became 'z', `true` became 'true' — each then admitted as a
 * valid falsifiability condition and written into the record W2 exists to make trustworthy.
 * A non-string is a malformed block, so it is rejected, never coerced.
 */
function _requiredText(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** An OPTIONAL free-text field, verbatim; a non-string degrades to '' rather than coercing. */
function _optionalText(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * Parse a __HYPOTHESIS__ block. Admission test (W2), applied in addition to the pre-existing
 * statement requirement: a candidate whose `refutationCondition` is absent or empty is REJECTED
 * — the block parses to null, which spawnAndParse treats as a parse miss and retries within its
 * existing budget. The test is STRUCTURAL ONLY: the field is present and non-empty, or it is
 * not. No similarity threshold, no LLM judge — nothing that puts a model back on the admission
 * path. `refutationOverlap` rides along as advisory metadata and gates nothing.
 *
 * Returning null loses WHICH rule failed; `describeHypothesisRejection` recovers it for the
 * terminal error message, and is the only thing that should ever re-derive it.
 */
function parseHypothesisOutput(stdout: string):
  { statement: string; rationale: string; predictedOutcome: string;
    refutationCondition: string; refutationOverlap: number } | null {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'HYPOTHESIS');
  if (!o) return null;
  const statement = _requiredText(o.statement);
  if (!statement) return null;
  const refutationCondition = _requiredText(o.refutationCondition);
  if (!refutationCondition) return null;
  return {
    statement,
    rationale: _optionalText(o.rationale),
    predictedOutcome: _optionalText(o.predictedOutcome),
    refutationCondition,
    refutationOverlap: _refutationOverlap(statement, refutationCondition),
  };
}

/**
 * Why `parseHypothesisOutput` rejected this stdout, as one operator-facing clause — or null if
 * it would in fact parse. Called ONLY on the terminal failure path. It exists because the two
 * rejections are indistinguishable from a null return, and the generic "expected a
 * __HYPOTHESIS__ block" wording actively misleads on the commoner of the two: it prints, as its
 * own excerpt, the well-formed block it claims is absent. Kept in lockstep with the rules above.
 */
function describeHypothesisRejection(stdout: string): string | null {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'HYPOTHESIS');
  if (!o) return 'no __HYPOTHESIS__ block, or the block is not valid JSON';
  if (!_requiredText(o.statement)) {
    return 'the __HYPOTHESIS__ block has no non-empty string `statement`';
  }
  if (!_requiredText(o.refutationCondition)) {
    return 'the __HYPOTHESIS__ block is missing a non-empty string `refutationCondition` '
      + '(the W2 falsifiability admission test — state the observation that would show the '
      + 'hypothesis false)';
  }
  return null;
}

/**
 * Parse a __HYPOTHESES__ block (Phase 104 multi-candidate) into a ranked, capped candidates
 * array. Mirrors parseClarifyOutput's degrade contract: a missing/empty/malformed block, an
 * absent/non-array `candidates`, or invalid JSON yields { candidates: [] } — NEVER null, NEVER
 * throws (the caller degrades to the single-block cold path). Candidates are kept in emit (rank)
 * order; entries with no statement are dropped; rationale/predictedOutcome default to '' but do
 * not drop the entry. The array is capped to `n` (default 5 = config clamp max), order preserved.
 *
 * W2 admission test: an entry whose `refutationCondition` is absent or empty is ALSO dropped —
 * structurally, on presence alone. When that empties the array the caller degrades exactly as it
 * already does for a missing block. `sourceNodeIds` is deliberately NOT read here: grounding
 * retrieval degrades silently upstream, so a provenance requirement would reject candidates on
 * precisely the path where provenance is unavailable.
 *
 * `droppedForRefutation` counts the entries the admission test removed, and is REPORTED, not
 * merely returned: dropping below the caller's >=2 threshold silently converts a configured
 * human-in-the-loop selection into an unattended auto-pick — no checkpoint, no record of the
 * candidates the operator never saw. The count is what lets the orchestrator say so.
 */
function parseHypothesesOutput(stdout: string, n?: number):
  { candidates: Array<{ statement: string; rationale: string; predictedOutcome: string;
    refutationCondition: string; refutationOverlap: number }>; droppedForRefutation: number } {
  const cap = typeof n === 'number' && n > 0 ? n : 5;
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'HYPOTHESES');
  if (!o || !Array.isArray(o.candidates)) return { candidates: [], droppedForRefutation: 0 };
  const candidates: Array<{ statement: string; rationale: string; predictedOutcome: string;
    refutationCondition: string; refutationOverlap: number }> = [];
  let droppedForRefutation = 0;
  for (const rawCand of o.candidates as unknown[]) {
    if (candidates.length >= cap) break;
    if (!rawCand || typeof rawCand !== 'object') continue;
    const c = rawCand as Record<string, unknown>;
    const statement = _requiredText(c.statement);
    if (!statement) continue;
    const refutationCondition = _requiredText(c.refutationCondition);
    if (!refutationCondition) { droppedForRefutation++; continue; } // W2 admission — presence only
    candidates.push({
      statement,
      rationale: _optionalText(c.rationale),
      predictedOutcome: _optionalText(c.predictedOutcome),
      refutationCondition,
      refutationOverlap: _refutationOverlap(statement, refutationCondition),
    });
  }
  return { candidates, droppedForRefutation };
}

function parsePlanOutput(stdout: string):
  { procedure: string; metricKey: string; comparator: string; target: number;
    language: string; scriptPath: string; baseline?: number } | null {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'PLAN');
  if (!o || !o.metricKey || !o.scriptPath) return null;
  // This object literal is a WHITELIST: a field the agent emits and this literal omits is
  // dropped here, silently and invisibly to tsc, because the orchestrator casts the result
  // `as ExperimentPlan` and the new field is optional. W2 shipped completely inert this way
  // and W8's `baseline` did too. Adding a field to ExperimentPlan means adding it HERE.
  const baseline = typeof o.baseline === 'number' && Number.isFinite(o.baseline)
    ? o.baseline
    : undefined;
  return {
    procedure: String(o.procedure || ''),
    metricKey: String(o.metricKey),
    comparator: String(o.comparator || '>='),
    target: Number(o.target ?? 0),
    language: String(o.language || 'shell'),
    scriptPath: String(o.scriptPath),
    // Omit the key entirely when absent, so a plan.json without a baseline is byte-identical
    // to one written before W8 — the "unset means the current path exactly" claim rests on it.
    ...(baseline === undefined ? {} : { baseline }),
  };
}

function parseTakeawayOutput(stdout: string):
  { kind: string; content: string; confidence: number; evidence: string; failureClass: string } | null {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'TAKEAWAY');
  if (!o || !o.content) return null;
  return {
    kind: String(o.kind || 'domain_fact'),
    content: String(o.content),
    confidence: Number(o.confidence ?? 0.5),
    evidence: String(o.evidence || ''),
    failureClass: String(o.failureClass || 'none'),
  };
}

/** A single normalized clarification dimension (maps 1:1 to a checkpoint question). */
export interface ClarifyDimension {
  ask: string;
  options: Array<{ label: string; description?: string; recommended?: boolean }>;
  freeform?: boolean;
}

/**
 * Parse a __CLARIFY__ block into normalized dimensions (Phase 103 SEED). Zero ambiguous
 * dimensions is the well-formed-question path — a missing/empty/malformed block, a missing
 * `dimensions` array, or any dimension with no usable options yields fewer/zero dimensions;
 * this parser NEVER surfaces junk. Caps at 4 dimensions; each surviving dimension is
 * guaranteed to have >=1 option with EXACTLY one recommended (checkpoint validation contract).
 */
function parseClarifyOutput(stdout: string): { dimensions: ClarifyDimension[] } {
  const o = extractTaggedJson<Record<string, unknown>>(stdout, 'CLARIFY');
  if (!o || !Array.isArray(o.dimensions)) return { dimensions: [] };
  const dimensions: ClarifyDimension[] = [];
  for (const rawDim of o.dimensions as unknown[]) {
    if (dimensions.length >= 4) break; // cap
    if (!rawDim || typeof rawDim !== 'object') continue;
    const d = rawDim as Record<string, unknown>;
    const ask = typeof d.ask === 'string' ? d.ask.trim() : '';
    if (!ask) continue;
    const rawOpts = Array.isArray(d.options) ? (d.options as unknown[]) : [];
    const options: ClarifyDimension['options'] = [];
    for (const rawOpt of rawOpts) {
      if (!rawOpt || typeof rawOpt !== 'object') continue;
      const op = rawOpt as Record<string, unknown>;
      const label = typeof op.label === 'string' ? op.label.trim() : '';
      if (!label) continue;
      const opt: ClarifyDimension['options'][number] = { label };
      if (typeof op.description === 'string') opt.description = op.description;
      if (op.recommended === true) opt.recommended = true;
      options.push(opt);
    }
    if (options.length === 0) continue; // a dimension needs >=1 option
    // Exactly one recommended: if none marked, mark the first (checkpoint validation requires it).
    if (options.filter((op) => op.recommended === true).length !== 1) {
      for (const op of options) delete op.recommended;
      options[0].recommended = true;
    }
    const dim: ClarifyDimension = { ask, options };
    if (typeof d.freeform === 'boolean') dim.freeform = d.freeform;
    dimensions.push(dim);
  }
  return { dimensions };
}

module.exports = {
  extractTaggedJson, parseHypothesisOutput, describeHypothesisRejection, parseHypothesesOutput,
  parsePlanOutput, parseTakeawayOutput, parseClarifyOutput,
};
