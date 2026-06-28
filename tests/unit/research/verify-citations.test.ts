'use strict';
const { verifyCitations } = require('../../../lib/research/verify-citations');

describe('verifyCitations', () => {
  it('resolves a bracketed citation whose name is present in relatedWork', () => {
    const bundle = { relatedWork: [{ name: 'RAG', description: 'd', source_path: 'corpus/x.md' }] };
    const r = verifyCitations('We build on [RAG] here.', bundle);
    expect(r).toEqual({ total: 1, resolved: 1, unresolved: [] });
  });

  it('flags a bracketed citation absent from relatedWork as unresolved', () => {
    const bundle = { relatedWork: [{ name: 'RAG', description: 'd', source_path: 'corpus/x.md' }] };
    const r = verifyCitations('We cite [Imaginary2099] which does not exist.', bundle);
    expect(r).toEqual({ total: 1, resolved: 0, unresolved: ['Imaginary2099'] });
  });

  it('returns zeros for an empty / citation-free paper', () => {
    expect(verifyCitations('', { relatedWork: [] })).toEqual({ total: 0, resolved: 0, unresolved: [] });
    expect(verifyCitations('No citations here at all.', { relatedWork: [] }))
      .toEqual({ total: 0, resolved: 0, unresolved: [] });
  });

  it('mixes resolved and unresolved citations and dedupes repeats', () => {
    const bundle = { relatedWork: [{ name: 'RAG', description: 'd', source_path: 'corpus/x.md' }] };
    const r = verifyCitations('First [RAG], again [RAG], and a fake [Bogus].', bundle);
    expect(r.total).toBe(2);
    expect(r.resolved).toBe(1);
    expect(r.unresolved).toEqual(['Bogus']);
  });

  it('resolves via case/punctuation normalization and substring containment', () => {
    const bundle = { relatedWork: [{ name: 'Smith et al. 2024', description: 'd', source_path: '' }] };
    const r = verifyCitations('See [smith et al., 2024] and [Smith].', bundle);
    expect(r.unresolved).toEqual([]);
    expect(r.resolved).toBe(2);
  });

  it('resolves against a source_path basename', () => {
    const bundle = { relatedWork: [{ name: '', description: 'd', source_path: 'corpus/transformers.md' }] };
    const r = verifyCitations('As shown in [transformers].', bundle);
    expect(r.resolved).toBe(1);
    expect(r.unresolved).toEqual([]);
  });

  it('resolves against KG node ids when present on the bundle', () => {
    const bundle = { relatedWork: [], kgNodeIds: ['node-alpha'] };
    const r = verifyCitations('Per [node-alpha], the result holds.', bundle);
    expect(r.resolved).toBe(1);
  });

  it('ignores markdown links [text](url), counting only true citations', () => {
    const bundle = { relatedWork: [{ name: 'RAG', description: 'd', source_path: '' }] };
    const r = verifyCitations('A [link](http://x) and a citation [RAG].', bundle);
    expect(r.total).toBe(1);
    expect(r.resolved).toBe(1);
  });

  it('skips whitespace-only and punctuation-only brackets', () => {
    const bundle = { relatedWork: [{ name: 'RAG', description: 'd', source_path: '' }] };
    const r = verifyCitations('Empty [   ] and punctuation [--] then [RAG].', bundle);
    expect(r.total).toBe(1);
    expect(r.resolved).toBe(1);
  });

  it('tolerates a bundle with no relatedWork / kgNodeIds fields', () => {
    const r = verifyCitations('A claim [Ghost].', {});
    expect(r).toEqual({ total: 1, resolved: 0, unresolved: ['Ghost'] });
  });
});
