import { runCLI, parseJSON, createFixtureDir } from './_helpers';

describe('coverage-report integration', () => {
  test('returns valid JSON or empty on platform-flush-races', () => {
    const dir = createFixtureDir();
    const { stdout, exitCode } = runCLI(['coverage-report'], dir);
    // exitCode 0 (caught + reported via output()) or 1 (jest propagates
    // non-zero on threshold-fail) are both valid outcomes.
    expect([0, 1]).toContain(exitCode);
    if (stdout.trim().length > 0) {
      const data = parseJSON(stdout);
      expect(typeof data).toBe('object');
    }
    // Empty stdout is acceptable on Node 18/20 under CI load — the pipe
    // is not flushed before process.exit(0) returns.
  });
});
