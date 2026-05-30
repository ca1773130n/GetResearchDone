'use strict';

interface PdfPage { getTextContent(): Promise<{ items: Array<{ str?: string }> }>; }
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; }
interface PdfLib { getDocument(args: { data: Uint8Array }): { promise: Promise<PdfDoc> }; }
type Loader = () => Promise<PdfLib>;

/** Extract a PDF's text into markdown. `loader` defaults to a lazy dynamic import of ESM pdfjs. */
async function pdfToMarkdown(bytes: Uint8Array, opts: { loader?: Loader } = {}): Promise<string> {
  // pdfjs-dist current majors are ESM-only; dynamic import() works from CommonJS.
  const loader: Loader = opts.loader
    || (() => (import('pdfjs-dist/legacy/build/pdf.mjs') as unknown) as Promise<PdfLib>);
  let lib: PdfLib;
  try { lib = await loader(); }
  catch (e) { throw new Error(`pdf: failed to load extractor — ${(e as Error).message}`, { cause: e }); }
  let doc: PdfDoc;
  try { doc = await lib.getDocument({ data: bytes }).promise; }
  catch (e) { throw new Error(`pdf: could not parse document — ${(e as Error).message}`, { cause: e }); }
  if (!doc.numPages || doc.numPages < 1) throw new Error('pdf: document has no pages');
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str || '').join(' ').replace(/[ \t]+/g, ' ').trim();
    if (text) pages.push(text);
  }
  const md = pages.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!md) throw new Error('pdf: no extractable text (scanned or image-only PDF?)');
  return md;
}

module.exports = { pdfToMarkdown };
