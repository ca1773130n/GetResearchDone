'use strict';
const { sessionJsonlToMarkdown } = require('../../../lib/research/session');

describe('sessionJsonlToMarkdown', () => {
  it('renders Claude Code turns: roles, text, tool_use summary, tool_result', () => {
    const jsonl = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'How do I sort?' } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
        { type: 'text', text: 'Use Array.sort.' },
        { type: 'tool_use', name: 'Bash', input: { command: 'node -e "console.log(1)"' } },
      ] } }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [
        { type: 'tool_result', content: '1' },
      ] } }),
    ].join('\n');
    const md = sessionJsonlToMarkdown(jsonl);
    expect(md).toContain('## user');
    expect(md).toContain('How do I sort?');
    expect(md).toContain('## assistant');
    expect(md).toContain('Use Array.sort.');
    expect(md).toMatch(/> tool: Bash\(/);
    expect(md).toContain('1');
  });

  it('handles the Codex shape (top-level role/content string)', () => {
    const jsonl = [
      JSON.stringify({ role: 'user', content: 'hi' }),
      JSON.stringify({ role: 'assistant', content: 'hello' }),
    ].join('\n');
    const md = sessionJsonlToMarkdown(jsonl);
    expect(md).toContain('## user');
    expect(md).toContain('hi');
    expect(md).toContain('## assistant');
    expect(md).toContain('hello');
  });

  it('tolerates blank and unparseable lines', () => {
    const jsonl = ['', '{not json', JSON.stringify({ role: 'user', content: 'ok' }), '   '].join('\n');
    const md = sessionJsonlToMarkdown(jsonl);
    expect(md).toContain('## user');
    expect(md).toContain('ok');
  });

  it('throws when there are no parseable turns', () => {
    expect(() => sessionJsonlToMarkdown('\n{bad\n')).toThrow(/no.*turns|empty/i);
  });
});
