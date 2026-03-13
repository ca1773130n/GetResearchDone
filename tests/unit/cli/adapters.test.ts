'use strict';

import { getAdapter, checkBackendAvailable } from '../../../lib/cli/adapters';

describe('backend adapters', () => {
  it('returns claude adapter', () => {
    const adapter = getAdapter('claude');
    expect(adapter.binary).toBe('claude');
    const args = adapter.buildArgs('test prompt', {});
    expect(args).toContain('-p');
    expect(args).toContain('test prompt');
  });

  it('returns codex adapter', () => {
    const adapter = getAdapter('codex');
    expect(adapter.binary).toBe('codex');
  });

  it('returns gemini adapter', () => {
    const adapter = getAdapter('gemini');
    expect(adapter.binary).toBe('gemini');
  });

  it('returns opencode adapter', () => {
    const adapter = getAdapter('opencode');
    expect(adapter.binary).toBe('opencode');
  });

  it('returns overstory adapter', () => {
    const adapter = getAdapter('overstory');
    expect(adapter.binary).toBe('ov');
  });

  it('falls back to claude for unknown backend', () => {
    const adapter = getAdapter('unknown');
    expect(adapter.binary).toBe('claude');
  });

  it('builds claude args with model', () => {
    const adapter = getAdapter('claude');
    const args = adapter.buildArgs('test', { model: 'opus' });
    expect(args).toContain('--model');
    expect(args).toContain('opus');
    expect(args).toContain('--dangerously-skip-permissions');
  });
});
