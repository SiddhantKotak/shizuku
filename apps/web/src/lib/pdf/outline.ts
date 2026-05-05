import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Flat outline shape for the TOC panel. Nested children become sibling rows
 * with `level` ≥ 1 (the SPA renders an indent based on `level`).
 */
export interface OutlineEntry {
  title: string;
  page: number; // 1-based
  level: number; // 0 = top-level
}

/**
 * Build a flat outline from a PDF document. Entries that don't resolve to a
 * page (e.g. external links) are dropped. PDF.js's `dest` can be a string
 * (named destination) or an explicit array — we handle both via
 * `getPageIndex`.
 */
export async function buildOutline(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const raw = await doc.getOutline();
  if (!raw) return [];

  const out: OutlineEntry[] = [];
  async function walk(items: typeof raw, level: number): Promise<void> {
    for (const item of items) {
      try {
        let dest = item.dest;
        if (typeof dest === 'string') {
          const named = await doc.getDestination(dest);
          if (named) dest = named;
        }
        if (Array.isArray(dest) && dest.length > 0) {
          const ref = dest[0];
          if (ref && typeof ref === 'object' && 'num' in ref) {
            const idx = await doc.getPageIndex(ref);
            out.push({ title: item.title, page: idx + 1, level });
          }
        }
      } catch {
        /* skip un-resolvable entries */
      }
      if (item.items?.length) {
        await walk(item.items, level + 1);
      }
    }
  }
  await walk(raw, 0);
  return out;
}
