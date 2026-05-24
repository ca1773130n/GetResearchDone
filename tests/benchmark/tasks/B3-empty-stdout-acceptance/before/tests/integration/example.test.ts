import { runCLI, parseJSON, createFixtureDir } from './_helpers';

describe('coverage-report integration', () => {
  test('returns valid JSON', () => {
    const dir = createFixtureDir();
    const { stdout, exitCode } = runCLI(['coverage-report'], dir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });
});
