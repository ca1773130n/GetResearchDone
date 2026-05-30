'use strict';
const { pdfToMarkdown } = require('../../../lib/research/pdf');

// Build a fake pdfjs lib whose pages return the given text item arrays.
function fakeLoader(pages: string[][]) {
  return async () => ({
    getDocument: (_args: { data: Uint8Array }) => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async (n: number) => ({
          getTextContent: async () => ({ items: pages[n - 1].map((str) => ({ str })) }),
        }),
      }),
    }),
  });
}

describe('pdfToMarkdown', () => {
  it('extracts text per page, separated by blank lines', async () => {
    const md = await pdfToMarkdown(new Uint8Array([1, 2, 3]), {
      loader: fakeLoader([['Hello', 'world'], ['Second', 'page']]),
    });
    expect(md).toBe('Hello world\n\nSecond page');
  });

  it('throws on a zero-page document', async () => {
    await expect(pdfToMarkdown(new Uint8Array([1]), { loader: fakeLoader([]) }))
      .rejects.toThrow(/no pages/i);
  });

  it('throws when no text is extractable (scanned/image PDF)', async () => {
    await expect(pdfToMarkdown(new Uint8Array([1]), { loader: fakeLoader([[''], ['  ']]) }))
      .rejects.toThrow(/no extractable text/i);
  });

  it('surfaces a loader/parse failure (e.g. encrypted) as a clear error', async () => {
    const loader = async () => { throw new Error('PasswordException'); };
    await expect(pdfToMarkdown(new Uint8Array([1]), { loader }))
      .rejects.toThrow(/failed to load extractor|PasswordException/i);
  });
});
