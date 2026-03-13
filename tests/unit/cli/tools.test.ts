'use strict';

import { buildToolArgs } from '../../../lib/cli/tools';

describe('tool command delegation', () => {
  it('builds args for namespaced command', () => {
    const args = buildToolArgs('state', 'load', [], false);
    expect(args).toEqual(['state', 'load']);
  });

  it('builds args for standalone command', () => {
    const args = buildToolArgs('version', undefined, [], false);
    expect(args).toEqual(['version']);
  });

  it('appends --raw when --json flag is set', () => {
    const args = buildToolArgs('state', 'load', [], true);
    expect(args).toEqual(['state', 'load', '--raw']);
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
    const args = buildToolArgs('state', 'record-metric', [], false, ['--phase', '3', '--duration', '5min']);
    expect(args).toEqual(['state', 'record-metric', '--phase', '3', '--duration', '5min']);
  });
});
