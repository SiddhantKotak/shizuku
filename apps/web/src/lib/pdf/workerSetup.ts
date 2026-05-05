/**
 * PDF.js worker registration. Must run BEFORE any `pdfjs.getDocument` call.
 *
 * The `?url` import tells Vite to emit the worker as a static asset and
 * return its public URL — which we hand to PDF.js. This is the only
 * pattern that works with both `vite dev` and `vite preview` / production
 * builds (the worker is in its own chunk; `pdfjs-dist`'s bundled CDN URL
 * doesn't survive Vite's tree-shaking).
 *
 * Pin `pdfjs-dist@^4.5` — earlier versions ship `.js` workers that ESM
 * can't import; later versions occasionally rename the worker filename.
 */
import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let registered = false;

export function ensurePdfWorker(): void {
  if (registered) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  registered = true;
}

export { pdfjs };
