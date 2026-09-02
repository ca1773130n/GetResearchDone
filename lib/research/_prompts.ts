'use strict';
import type { Hypothesis, ExperimentResult, Verdict, Takeaway } from './types';

function buildHypothesizePrompt(
  thread: { id: string; question: string },
  priorHyps: Pick<Hypothesis, 'id' | 'statement' | 'verdict'>[],
  priorVerdict: Verdict | null,
  priorTakeaways: Pick<Takeaway, 'iteration' | 'kind' | 'content' | 'failureClass'>[] = [],
  pack = '',
  pivot = false,
): string {
  const history = priorHyps.length
    ? priorHyps.map((h) => `- ${h.id} [${h.verdict ?? 'open'}]: ${h.statement}`).join('\n')
    : '(none yet)';
  const learned = priorTakeaways.length
    ? priorTakeaways.map((t) => `- (iter ${t.iteration}, ${t.kind}, ${t.failureClass}): ${t.content}`).join('\n')
    : '(none yet)';
  return [
    'You are grd-hypothesizer. Generate ONE ranked, testable hypothesis for this research question.',
    '',
    `Research question: ${thread.question}`,
    '',
    'GROUND first: query the Tesserae knowledge graph (your primary knowledge base) for prior',
    'related findings, related work, and methods using the tesserae MCP tools (search_nodes,',
    'ask, node_context). Read .planning/DEAD-ENDS.md to avoid re-proposing falsified approaches.',
    ...(pack ? ['', 'A hybrid retriever pre-fetched this grounding from the KG — use it as a starting point:', pack] : []),
    '',
    'Prior hypotheses in this thread:',
    history,
    '',
    'Takeaways learned so far (use these to steer the next hypothesis):',
    learned,
    priorVerdict ? `\nThe last hypothesis was ${priorVerdict}. Revise — propose a DIFFERENT, more promising hypothesis informed by the takeaways above.` : '',
    pivot ? '\nPLATEAU: your last several hypotheses all failed to be supported. PIVOT HARD — propose a substantially different approach or angle, not a variation of prior attempts.' : '',
    '',
    'Emit exactly one final block (no prose after it):',
    '__HYPOTHESIS__',
    '{"statement": "...", "rationale": "...", "predictedOutcome": "..."}',
  ].join('\n');
}

/**
 * Multi-candidate HYPOTHESIZE prompt (Phase 104). Reuses the same grounding preamble as
 * buildHypothesizePrompt (research question, GROUND-first Tesserae/KG instruction, DEAD-ENDS
 * read, optional pack, prior hypotheses, takeaways, revise/pivot lines) but asks for up to N
 * ranked candidates and emits exactly one final __HYPOTHESES__ block ranked best-first. The
 * single-block buildHypothesizePrompt above is left untouched — this is the N>1 path only.
 */
function buildHypothesesPrompt(
  thread: { id: string; question: string },
  priorHyps: Pick<Hypothesis, 'id' | 'statement' | 'verdict'>[],
  priorVerdict: Verdict | null,
  priorTakeaways: Pick<Takeaway, 'iteration' | 'kind' | 'content' | 'failureClass'>[] = [],
  pack = '',
  pivot = false,
  n: number,
): string {
  const history = priorHyps.length
    ? priorHyps.map((h) => `- ${h.id} [${h.verdict ?? 'open'}]: ${h.statement}`).join('\n')
    : '(none yet)';
  const learned = priorTakeaways.length
    ? priorTakeaways.map((t) => `- (iter ${t.iteration}, ${t.kind}, ${t.failureClass}): ${t.content}`).join('\n')
    : '(none yet)';
  return [
    `You are grd-hypothesizer. Generate up to ${n} ranked, testable hypothesis candidates for this research question.`,
    '',
    `Research question: ${thread.question}`,
    '',
    'GROUND first: query the Tesserae knowledge graph (your primary knowledge base) for prior',
    'related findings, related work, and methods using the tesserae MCP tools (search_nodes,',
    'ask, node_context). Read .planning/DEAD-ENDS.md to avoid re-proposing falsified approaches.',
    ...(pack ? ['', 'A hybrid retriever pre-fetched this grounding from the KG — use it as a starting point:', pack] : []),
    '',
    'Prior hypotheses in this thread:',
    history,
    '',
    'Takeaways learned so far (use these to steer the next hypotheses):',
    learned,
    priorVerdict ? `\nThe last hypothesis was ${priorVerdict}. Revise — propose DIFFERENT, more promising hypotheses informed by the takeaways above.` : '',
    pivot ? '\nPLATEAU: your last several hypotheses all failed to be supported. PIVOT HARD — propose substantially different approaches or angles, not variations of prior attempts.' : '',
    '',
    `Rank the candidates best-first (rank 1 = most promising). Emit at most ${n} candidates.`,
    'Emit exactly one final block (no prose after it):',
    '__HYPOTHESES__',
    '{"candidates":[{"statement": "...", "rationale": "...", "predictedOutcome": "..."}]}',
  ].join('\n');
}

function buildExperimentPrompt(
  thread: { id: string; question: string },
  hypothesis: Pick<Hypothesis, 'id' | 'statement'>,
  iterDir: string,
): string {
  return [
    'You are grd-experiment-runner. Design ONE minimal, reproducible experiment that tests the hypothesis.',
    '',
    `Hypothesis (${hypothesis.id}): ${hypothesis.statement}`,
    '',
    `Write the experiment plan to ${iterDir}/PLAN.md and a runnable script to ${iterDir}/run.sh`,
    '(bash) or the same dir as run.py (python). The script MUST print its result as a final line:',
    '  __RESULT__ {"<metricKey>": <number>}',
    'Do NOT run the script yourself — the orchestrator runs it behind an execution gate.',
    'Pick a single numeric metricKey, a comparator (>=, <=, >, <, ==), and a target threshold.',
    '',
    'Emit exactly one final block (scriptPath = the absolute path where you wrote the script):',
    '__PLAN__',
    `{"procedure":"...","metricKey":"...","comparator":">=","target":0.0,"language":"shell","scriptPath":"${iterDir}/run.sh"}`,
  ].join('\n');
}

function buildLearnPrompt(
  thread: { id: string; question: string },
  hypothesis: Pick<Hypothesis, 'id' | 'statement'>,
  result: Pick<ExperimentResult, 'metrics' | 'failureClass'>,
  verdict: Verdict,
): string {
  return [
    'You are grd-knowledge-miner in research-takeaway mode. Extract ONE reusable takeaway',
    'from this experiment outcome that should steer the next hypothesis.',
    '',
    `Hypothesis (${hypothesis.id}): ${hypothesis.statement}`,
    `Verdict: ${verdict}`,
    `Metrics: ${JSON.stringify(result.metrics)}`,
    `Run failure class: ${result.failureClass}`,
    '',
    'kind in {success_pattern, failure_root_cause, constraint, domain_fact, tool_pattern}.',
    'failureClass in {H2 (interface), H3 (environment), H4 (trajectory), none}.',
    '',
    'Emit exactly one final block:',
    '__TAKEAWAY__',
    '{"kind":"...","content":"...","confidence":0.0,"evidence":"...","failureClass":"none"}',
  ].join('\n');
}

/**
 * SEED clarification prompt (Phase 103). Asks the hypothesizer to emit the dimensions still
 * missing from the falsifiable-metric-target triple (metric, comparator, target threshold) —
 * the same structural stop condition commands/research.md states for the human interview.
 * A question that already names the triple yields an empty dimensions array (zero-pause path).
 * Output is a single __CLARIFY__ block parsed by parseClarifyOutput.
 */
function buildClarifyPrompt(thread: { id: string; question: string }): string {
  return [
    'You are grd-hypothesizer in SEED-clarify mode. Before any hypothesis is formed, report which',
    'parts of the FALSIFIABLE METRIC TARGET this research question is still missing.',
    '',
    `Research question: ${thread.question}`,
    '',
    'The frontier is empty when, and only when, the question already names all three:',
    '  1. a single numeric METRIC (what exactly is measured, on what dataset/conditions)',
    '  2. a COMPARATOR from the enum: >=, <=, >, <, ==',
    '  3. a concrete numeric TARGET THRESHOLD, against a named baseline where one is needed',
    '',
    'Emit one dimension per element of that triple the question does not yet name. When all three',
    'are named, the dimensions array is empty and the loop proceeds.',
    '',
    'Raise a dimension only for a DECISION: the evidence permits more than one defensible',
    'choice AND the choice changes the experiment design. If .planning/ or the codebase',
    'already settles it, it is a FACT — read it and drop the dimension. Do not raise a',
    'dimension whose answer you could have read.',
    '',
    'Prefer multiple-choice options with exactly ONE marked recommended.',
    'Cap: at most 4 dimensions. Each dimension needs at least one option.',
    '',
    'Emit exactly one final block (no prose after it):',
    '__CLARIFY__',
    '{"dimensions":[{"ask":"...","options":[{"label":"...","description":"...","recommended":true}],"freeform":false}]}',
  ].join('\n');
}

module.exports = { buildHypothesizePrompt, buildHypothesesPrompt, buildExperimentPrompt, buildLearnPrompt, buildClarifyPrompt };
