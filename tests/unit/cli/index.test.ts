'use strict';

import { parseFlags, classifyCommand } from '../../../lib/cli/index';

describe('argument parsing', () => {
  it('extracts --json flag', () => {
    const flags = parseFlags(['plan-phase', '3', '--json']);
    expect(flags.json).toBe(true);
    expect(flags.positional).toEqual(['plan-phase', '3']);
  });

  it('extracts --help flag', () => {
    const flags = parseFlags(['--help']);
    expect(flags.help).toBe(true);
  });

  it('extracts --version flag', () => {
    const flags = parseFlags(['--version']);
    expect(flags.version).toBe(true);
  });

  it('extracts --cwd value', () => {
    const flags = parseFlags(['progress', '--cwd', '/tmp/project']);
    expect(flags.cwd).toBe('/tmp/project');
  });

  it('extracts --backend value', () => {
    const flags = parseFlags(['evolve', '--backend', 'codex']);
    expect(flags.backend).toBe('codex');
  });

  it('extracts --verbose flag', () => {
    const flags = parseFlags(['execute-phase', '3', '--verbose']);
    expect(flags.verbose).toBe(true);
  });

  it('collects positional args', () => {
    const flags = parseFlags(['survey', 'neural', 'rendering']);
    expect(flags.positional).toEqual(['survey', 'neural', 'rendering']);
  });

  it('collects unknown flags in passthrough', () => {
    const flags = parseFlags(['state', 'record-metric', '--phase', '3', '--duration', '5min']);
    expect(flags.positional).toEqual(['state', 'record-metric']);
    expect(flags.passthrough).toContain('--phase');
    expect(flags.passthrough).toContain('--duration');
  });
});

describe('command classification', () => {
  it('classifies tool commands', () => {
    expect(classifyCommand('state')).toBe('tool');
    expect(classifyCommand('verify')).toBe('tool');
    expect(classifyCommand('scaffold')).toBe('tool');
    expect(classifyCommand('frontmatter')).toBe('tool');
    expect(classifyCommand('version')).toBe('tool');
    expect(classifyCommand('dashboard')).toBe('tool');
    expect(classifyCommand('health')).toBe('tool');
  });

  it('classifies agent commands', () => {
    expect(classifyCommand('new-project')).toBe('agent');
    expect(classifyCommand('plan-phase')).toBe('agent');
    expect(classifyCommand('execute-phase')).toBe('agent');
    expect(classifyCommand('autopilot')).toBe('agent');
    expect(classifyCommand('survey')).toBe('agent');
    expect(classifyCommand('evolve')).toBe('agent');
  });

  it('classifies evolve with subcommand as tool', () => {
    expect(classifyCommand('evolve', 'discover')).toBe('tool');
    expect(classifyCommand('evolve', 'state')).toBe('tool');
    expect(classifyCommand('evolve', undefined)).toBe('agent');
  });

  it('returns unknown for unrecognized commands', () => {
    expect(classifyCommand('foobar')).toBe('unknown');
  });
});
