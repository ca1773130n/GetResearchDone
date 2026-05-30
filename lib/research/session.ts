'use strict';

type Block = { type?: string; text?: string; name?: string; input?: unknown; content?: unknown };
type Content = string | Block[];

function truncate(s: string, n = 200): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function renderContent(content: Content): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text.trim());
    else if (b.type === 'tool_use') {
      parts.push(`> tool: ${b.name || 'tool'}(${truncate(JSON.stringify(b.input ?? {}))})`);
    } else if (b.type === 'tool_result') {
      const c = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
      parts.push(`> result: ${truncate(c)}`);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

/** Parse a Claude Code / Codex session .jsonl transcript into deterministic markdown. */
function sessionJsonlToMarkdown(text: string): string {
  const sections: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let obj: { message?: { role?: string; content?: Content }; role?: string; content?: Content };
    try { obj = JSON.parse(t); } catch { continue; }
    const turn = obj.message && obj.message.role ? obj.message : (obj.role ? obj : null);
    if (!turn || !turn.role) continue;
    const body = renderContent(turn.content ?? '');
    if (!body) continue;
    sections.push(`## ${turn.role}\n\n${body}`);
  }
  if (sections.length === 0) throw new Error('session: no parseable turns (empty or unrecognized transcript)');
  return sections.join('\n\n') + '\n';
}

module.exports = { sessionJsonlToMarkdown };
