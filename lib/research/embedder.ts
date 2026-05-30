'use strict';

export type Embedder = (texts: string[]) => Promise<number[][] | null>;

type FetchImpl = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

/**
 * Returns an Embedder that calls an OpenAI-compatible embeddings endpoint when an API key env is
 * present, else resolves null (retrieval degrades to lexical+structure — no network egress).
 * Any non-2xx / thrown / malformed response also resolves null (never throws into retrieval).
 */
function defaultEmbedder(opts: { fetchImpl?: FetchImpl } = {}): Embedder {
  return async (texts: string[]): Promise<number[][] | null> => {
    const key = process.env.GRD_EMBED_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) return null;
    const model = process.env.GRD_EMBED_MODEL || 'text-embedding-3-small';
    const url = process.env.GRD_EMBED_URL || 'https://api.openai.com/v1/embeddings';
    const doFetch: FetchImpl = opts.fetchImpl || ((globalThis as { fetch?: FetchImpl }).fetch as FetchImpl);
    try {
      const resp = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ input: texts, model }),
      });
      if (resp.status < 200 || resp.status >= 300) {
        process.stderr.write(`Warning: embedder HTTP ${resp.status} — semantic retrieval disabled\n`);
        return null;
      }
      const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
      if (!data || !Array.isArray(data.data)) return null;
      const vecs = data.data.map((d) => d.embedding || []);
      return vecs.length === texts.length && vecs.every((v) => v.length > 0) ? vecs : null;
    } catch (e) {
      process.stderr.write(`Warning: embedder failed (${(e as Error).message}) — semantic retrieval disabled\n`);
      return null;
    }
  };
}

module.exports = { defaultEmbedder };
