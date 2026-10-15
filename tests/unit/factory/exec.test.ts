'use strict';
const { defaultExec } = require('../../../lib/factory/exec') as {
  defaultExec: (bin: string, args: string[], opts?: { cwd?: string; timeout?: number }) => string;
};

describe('defaultExec', () => {
  it('returns stdout and honours cwd, passing arguments without a shell', () => {
    const out = defaultExec(process.execPath, ['-e', 'process.stdout.write(process.cwd() + "|" + process.argv[1])', '$HOME;x'], { cwd: '/' });
    expect(out).toBe('/|$HOME;x');
  });

  it('throws with status and stderr on a nonzero exit', () => {
    let err: (Error & { status?: number; stderr?: string }) | undefined;
    try { defaultExec(process.execPath, ['-e', 'process.stderr.write("boom"); process.exit(3)']); } catch (e) { err = e as Error; }
    expect(err?.status).toBe(3);
    expect(err?.stderr).toBe('boom');
  });
});
