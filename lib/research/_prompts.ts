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
 * SEED clarification prompt (Phase 103). Asks the hypothesizer to surface ONLY genuinely
 * ambiguous, high-impact dimensions that block a falsifiable metric target (what is measured,
 * baseline/target, conditions). An already-unambiguous question MUST yield an empty dimensions
 * array (zero-pause path). Output is a single __CLARIFY__ block parsed by parseClarifyOutput.
 */
function buildClarifyPrompt(thread: { id: string; question: string }): string {
  return [
    'You are grd-hypothesizer in SEED-clarify mode. Before any hypothesis is formed, decide',
    'whether this research question is precise enough to become a FALSIFIABLE experiment with a',
    'concrete metric target — or whether it is genuinely ambiguous in a way that would change the',
    'experiment design.',
    '',
    `Research question: ${thread.question}`,
    '',
    'Identify ONLY genuinely ambiguous, high-impact dimensions that block a falsifiable metric',
    'target: what exactly is measured, the baseline and target threshold, and the conditions/',
    'dataset. Prefer multiple-choice options with exactly ONE marked recommended. Do NOT invent',
    'ambiguity: if the question is already precise enough to design an experiment, emit an EMPTY',
    'dimensions array — that is the expected, common case.',
    '',
    'Cap: at most 4 dimensions. Each dimension needs at least one option.',
    '',
    'Emit exactly one final block (no prose after it):',
    '__CLARIFY__',
    '{"dimensions":[{"ask":"...","options":[{"label":"...","description":"...","recommended":true}],"freeform":false}]}',
  ].join('\n');
}

module.exports = { buildHypothesizePrompt, buildExperimentPrompt, buildLearnPrompt, buildClarifyPrompt };
