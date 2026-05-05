import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ensurePdfWorker, pdfjs } from './workerSetup';

/**
 * Load a PDF document from a signed R2 URL. The hook returns `null` while
 * loading and the `PDFDocumentProxy` once the doc is parsed. The proxy is
 * then passed into PDFViewer / PDFPage components.
 *
 * A loading task is created and held in a ref so it can be cancelled if
 * the URL changes mid-load (e.g. user navigates between PDFs quickly).
 */
export function usePdf(url: string | null): {
  doc: PDFDocumentProxy | null;
  error: Error | null;
  pageCount: number | null;
} {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!url) {
      setDoc(null);
      return;
    }
    ensurePdfWorker();
    let cancelled = false;
    const task = pdfjs.getDocument({ url, withCredentials: false });
    task.promise
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  return { doc, error, pageCount: doc?.numPages ?? null };
}
