'use strict';
const { defaultEmbedder } = require('../../../lib/research/embedder');

describe('defaultEmbedder', () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; });

  it('resolves null when no API key env is set (degrade)', async () => {
    delete process.env.GRD_EMBED_API_KEY; delete process.env.OPENAI_API_KEY;
    const embed = defaultEmbedder();
    expect(await embed(['hello'])).toBeNull();
  });

  it('POSTs to the endpoint and parses embeddings when a key is set', async () => {
    process.env.GRD_EMBED_API_KEY = 'k';
    let sentAuth = ''; let sentBody: { input?: string[]; model?: string } = {};
    const fetchImpl = async (_url: string, init: { headers: Record<string, string>; body: string }) => {
      sentAuth = init.headers.Authorization; sentBody = JSON.parse(init.body);
      return { status: 200, json: async () => ({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }) };
    };
    const embed = defaultEmbedder({ fetchImpl });
    const vecs = await embed(['a', 'b']);
    expect(vecs).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(sentAuth).toBe('Bearer k');
    expect(sentBody.input).toEqual(['a', 'b']);
  });

  it('resolves null on a non-2xx response (degrade, no throw)', async () => {
    process.env.GRD_EMBED_API_KEY = 'k';
    const fetchImpl = async () => ({ status: 500, json: async () => ({}) });
    expect(await defaultEmbedder({ fetchImpl })(['a'])).toBeNull();
  });

  it('resolves null when the request throws', async () => {
    process.env.GRD_EMBED_API_KEY = 'k';
    const fetchImpl = async () => { throw new Error('network down'); };
    expect(await defaultEmbedder({ fetchImpl })(['a'])).toBeNull();
  });
});
