import { useEffect, useRef } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFPage } from './PDFPage';

export interface PDFViewerProps {
  doc: PDFDocumentProxy;
  /** Currently displayed page (1-based). Drives initial scroll + scroll-to-page. */
  currentPage: number;
  /** Fired when the user scrolls to a new page (debounced). */
  onPageChange: (page: number) => void;
  /** CSS pixel width per page (zoom). */
  pageWidth: number;
}

/**
 * Virtualized PDF page list. Uses react-virtuoso so we don't try to render
 * 500 canvases at once. PDFPage renders a single page lazily as it scrolls
 * into view.
 *
 * Wiring is here; visual chrome (page numbers, page break separators, scroll
 * shadows) is your Antigravity work.
 */
export function PDFViewer(props: PDFViewerProps): React.JSX.Element {
  const ref = useRef<VirtuosoHandle>(null);

  // Programmatic scroll when `currentPage` changes from outside (TOC click,
  // bookmark jump, citation pill click).
  useEffect(() => {
    ref.current?.scrollToIndex({
      index: Math.max(0, props.currentPage - 1),
      align: 'start',
      behavior: 'smooth',
    });
  }, [props.currentPage]);

  return (
    <div data-todo-antigravity="reader-pdf-viewer" className="h-full">
      <Virtuoso
        ref={ref}
        totalCount={props.doc.numPages}
        rangeChanged={(range) => {
          // Use the top-most visible page as the "current" one.
          props.onPageChange(range.startIndex + 1);
        }}
        itemContent={(index) => (
          <PDFPage doc={props.doc} pageNumber={index + 1} width={props.pageWidth} />
        )}
        // Estimated item size keeps initial scroll math reasonable; the real
        // height is measured after first render.
        defaultItemHeight={Math.round(props.pageWidth * 1.4)}
      />
    </div>
  );
}
