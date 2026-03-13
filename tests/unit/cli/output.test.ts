'use strict';

import { formatJson, formatError } from '../../../lib/cli/output';

describe('cli output formatting', () => {
  it('formatJson wraps data in envelope', () => {
    const result = formatJson({ status: 'ok', data: { phase: 3 }, meta: { backend: 'claude', duration_ms: 1500 } });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ok');
    expect(parsed.data.phase).toBe(3);
    expect(parsed.meta.backend).toBe('claude');
  });

  it('formatError produces error envelope', () => {
    const result = formatError('something went wrong', 'claude', 1);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('error');
    expect(parsed.error).toBe('something went wrong');
    expect(parsed.meta.exit_code).toBe(1);
  });
});
