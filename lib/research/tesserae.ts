'use strict';

export type TesseraeStatus = 'compiled' | 'skipped_no_tesserae' | 'compile_failed' | 'partial';
export interface CompileResult { status: TesseraeStatus; detail: string; graphPath: string | null; }
export interface SmokeResult { found: boolean; nodeIds: string[]; detail: string; }

export interface TesseraeClient {
  isAvailable(): boolean;
  compile(cwd: string, sources: string[]): Promise<CompileResult>;
  querySmokeCheck(cwd: string, topic: string): Promise<SmokeResult>;
}

interface FakeOpts {
  available?: boolean;
  compileStatus?: TesseraeStatus;
  smoke?: SmokeResult;
}

function createFakeTesseraeClient(opts: FakeOpts): TesseraeClient {
  return {
    isAvailable: () => opts.available === true,
    compile: async (cwd: string) => {
      const status = opts.available === true ? (opts.compileStatus || 'compiled') : 'skipped_no_tesserae';
      let graphPath: string | null = null;
      if (status === 'compiled' || status === 'partial') {
        const dir = path.join(cwd, '.tesserae');
        fs.mkdirSync(dir, { recursive: true });
        graphPath = path.join(dir, 'graph.json');
        fs.writeFileSync(graphPath, JSON.stringify({ nodes: [{ id: 'fake', name: 'fake' }] }));
      }
      return { status, detail: 'fake', graphPath };
    },
    querySmokeCheck: async () => opts.smoke || { found: false, nodeIds: [], detail: 'fake' },
  };
}

const fs = require('fs');
const path = require('path');
// execFileSync only (NOT a shell): no shell is spawned, args are passed as an array.
const { execFileSync } = require('child_process');

type RunFn = (bin: string, args: string[], cwd: string) => string;
interface CliOpts { run?: RunFn; whichOk?: boolean; }

function tesseraeDir(cwd: string): string { return path.join(cwd, '.tesserae'); }
function graphJsonPath(cwd: string): string { return path.join(tesseraeDir(cwd), 'graph.json'); }
function sqlitePath(cwd: string): string { return path.join(tesseraeDir(cwd), 'sqlite.db'); }

// tesserae 0.12 `extract --extractor` (opt-in): builds the LLM concept/claim layer
// the deterministic default leaves sparse. Default (unset/unknown) → null = no flag
// = deterministic, so `gd ingest` keeps its current cost. selective-claude also reads
// optional include/limit knobs.
function readExtractorConfig(cwd: string): { extractor: string | null; include: string | null; limit: number | null } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_tesserae_extractor?: unknown;
      research_tesserae_extract_include?: unknown;
      research_tesserae_extract_limit?: unknown;
    };
    const v = raw.research_tesserae_extractor;
    const inc = raw.research_tesserae_extract_include;
    const lim = raw.research_tesserae_extract_limit;
    return {
      extractor: v === 'claude-cli' || v === 'selective-claude' ? v : null,
      include: typeof inc === 'string' && inc.length > 0 ? inc : null,
      limit: typeof lim === 'number' && Number.isInteger(lim) && lim > 0 ? lim : null,
    };
  } catch { return { extractor: null, include: null, limit: null }; }
}

function binaryResolves(): boolean {
  try { execFileSync('tesserae', ['--help'], { encoding: 'utf8', timeout: 15000 }); return true; }
  catch { return false; }
}

function createCliTesseraeClient(opts: CliOpts = {}): TesseraeClient {
  const run: RunFn = opts.run
    || ((bin, args, cwd) => execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 600000 }));
  const available = opts.whichOk !== undefined ? opts.whichOk : binaryResolves();

  return {
    isAvailable: () => available,

    async compile(cwd: string, sources: string[]): Promise<CompileResult> {
      if (!available) return { status: 'skipped_no_tesserae', detail: 'tesserae CLI not found', graphPath: null };
      fs.mkdirSync(tesseraeDir(cwd), { recursive: true });
      const graph = graphJsonPath(cwd);
      // tesserae 0.11.0 retired the bare `tesserae <paths>` form ("bare extraction
      // has moved → tesserae extract <paths>"). --distill is now a compile-only flag,
      // unsupported by `extract`, so it is dropped here (distilled memory is populated
      // by `tesserae refresh`/`compile --distill` at the project level, not corpus extract).
      const args = ['extract', ...sources, '-o', graph, '--sqlite-output', sqlitePath(cwd), '--changed-only', '--canonicalize'];
      const ex = readExtractorConfig(cwd);
      if (ex.extractor) {
        args.push('--extractor', ex.extractor);
        if (ex.include) args.push('--claude-include', ex.include);
        if (ex.limit !== null) args.push('--claude-limit', String(ex.limit));
      }
      try {
        run('tesserae', args, cwd);
        return { status: 'compiled', detail: 'compiled', graphPath: graph };
      } catch (e: unknown) {
        const err = e as { stderr?: string; message?: string };
        return { status: 'compile_failed', detail: err.stderr || err.message || String(e), graphPath: null };
      }
    },

    async querySmokeCheck(cwd: string, topic: string): Promise<SmokeResult> {
      const graph = graphJsonPath(cwd);
      if (!fs.existsSync(graph)) return { found: false, nodeIds: [], detail: 'no graph.json' };
      let nodes: Array<{ id?: string; name?: string; source_path?: string }> = [];
      try {
        const parsed = JSON.parse(fs.readFileSync(graph, 'utf8')) as { nodes?: typeof nodes };
        nodes = parsed.nodes || [];
      } catch { return { found: false, nodeIds: [], detail: 'unreadable graph.json' }; }
      const needle = topic.toLowerCase();
      const matched = nodes.filter((n) =>
        (n.name || '').toLowerCase().includes(needle) || (n.source_path || '').toLowerCase().includes(needle));
      return {
        found: matched.length > 0,
        nodeIds: matched.map((n) => String(n.id)).filter(Boolean),
        detail: `${matched.length} match(es)`,
      };
    },
  };
}

module.exports = { createFakeTesseraeClient, createCliTesseraeClient };
