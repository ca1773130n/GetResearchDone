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
    compile: async () => ({
      status: opts.available === true ? (opts.compileStatus || 'compiled') : 'skipped_no_tesserae',
      detail: 'fake',
      graphPath: null,
    }),
    querySmokeCheck: async () => opts.smoke || { found: false, nodeIds: [], detail: 'fake' },
  };
}

module.exports = { createFakeTesseraeClient };
