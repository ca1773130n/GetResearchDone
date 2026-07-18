'use strict';

import { buildToolArgs, runToolCommand } from '../../../lib/cli/tools';

// Mock the harness command module so `runToolCommand('harness', …)` dispatch
// can be asserted without spawning the driver (lazy-required inside tools.ts,
// so jest's registry mock intercepts it).
jest.mock('../../../lib/commands/harness', () => ({
  cmdHarnessRound: jest.fn(),
  cmdHarnessStatus: jest.fn(),
  cmdHarnessRevert: jest.fn(),
  cmdHarnessUpstream: jest.fn(),
  cmdHarnessConversion: jest.fn(),
}));

const harness = jest.requireMock('../../../lib/commands/harness') as {
  cmdHarnessRound: jest.Mock;
  cmdHarnessStatus: jest.Mock;
  cmdHarnessRevert: jest.Mock;
  cmdHarnessUpstream: jest.Mock;
  cmdHarnessConversion: jest.Mock;
};
const { captureError } = require('../../helpers/setup') as {
  captureError: (fn: () => void) => { stderr: string; exitCode: number };
};

describe('tool command delegation', () => {
  it('builds args for namespaced command', () => {
    const args = buildToolArgs('state', 'load', [], false);
    expect(args).toEqual(['state', 'load']);
  });

  it('builds args for standalone command', () => {
    const args = buildToolArgs('version', undefined, [], false);
    expect(args).toEqual(['version']);
  });

  it('does not append --raw when --json flag is set (JSON is the downstream default)', () => {
    const args = buildToolArgs('state', 'load', [], true);
    expect(args).toEqual(['state', 'load']);
  });

  it('passes through extra positional args', () => {
    const args = buildToolArgs('frontmatter', 'get', ['file.md', 'key'], false);
    expect(args).toEqual(['frontmatter', 'get', 'file.md', 'key']);
  });

  it('handles evolve tool subcommands', () => {
    const args = buildToolArgs('evolve', 'discover', [], false);
    expect(args).toEqual(['evolve', 'discover']);
  });

  it('forwards passthrough flags', () => {
    const args = buildToolArgs('state', 'record-metric', [], false, [
      '--phase',
      '3',
      '--duration',
      '5min',
    ]);
    expect(args).toEqual(['state', 'record-metric', '--phase', '3', '--duration', '5min']);
  });
});

describe('harness in-process dispatch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes 'conversion' to cmdHarnessConversion (raw = !jsonFlag)", () => {
    const res = runToolCommand('harness', 'conversion', [], false, '/repo');
    expect(harness.cmdHarnessConversion).toHaveBeenCalledTimes(1);
    expect(harness.cmdHarnessConversion).toHaveBeenCalledWith('/repo', true);
    expect(harness.cmdHarnessRound).not.toHaveBeenCalled();
    expect(res.exitCode).toBe(0);
  });

  it('errors on an unknown harness subcommand', () => {
    const { stderr, exitCode } = captureError(() => {
      runToolCommand('harness', 'bogus', [], false, '/repo');
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('unknown harness subcommand: bogus');
    expect(harness.cmdHarnessConversion).not.toHaveBeenCalled();
  });
});
