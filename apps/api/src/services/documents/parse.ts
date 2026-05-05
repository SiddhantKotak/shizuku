// pdf2json types lag the runtime; the runtime exports a default class.
// We lean on `unknown` + a narrow shape rather than wrestling with @types.
import PDFParser from 'pdf2json';
import type { PageText } from './chunk.js';

interface Pdf2JsonRun {
  T?: string;
}
interface Pdf2JsonText {
  R?: Pdf2JsonRun[];
}
interface Pdf2JsonPage {
  Texts?: Pdf2JsonText[];
}
interface Pdf2JsonOutput {
  Pages?: Pdf2JsonPage[];
}

/**
 * Extract per-page plain text from a PDF buffer.
 *
 * pdf2json output is awkward — every text run is URL-encoded and splattered
 * across nested arrays. We flatten + URL-decode here so the chunker can
 * work with a clean `{pageNumber, text}` shape.
 *
 * Edge cases handled:
 *   - Image-only pages (no Texts[]) → empty string for that page.
 *   - Encrypted PDFs → pdf2json emits an error event; we propagate.
 *   - Unicode escape sequences in `T` → decodeURIComponent.
 */
export function parsePdf(buffer: Buffer): Promise<PageText[]> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, true);

    // pdf2json's union event payload: either an `Error` directly or
    // `{ parserError: Error }` depending on which internal failure path
    // tripped. We coerce both to a single message string.
    parser.on('pdfParser_dataError', (errData: Error | { parserError: Error }) => {
      const message =
        errData instanceof Error ? errData.message : errData.parserError.message;
      reject(new Error(`pdf_parse_failed: ${message}`));
    });

    parser.on('pdfParser_dataReady', (pdfData: Pdf2JsonOutput) => {
      const pages = pdfData.Pages ?? [];
      const result: PageText[] = pages.map((page, idx) => {
        const text = (page.Texts ?? [])
          .flatMap((t) => (t.R ?? []).map((r) => r.T ?? ''))
          .map((t) => safeDecode(t))
          .join(' ');
        return { pageNumber: idx + 1, text };
      });
      resolve(result);
    });

    parser.parseBuffer(buffer);
  });
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
