import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PDFPageProps {
  doc: PDFDocumentProxy;
  /** 1-based page number. */
  pageNumber: number;
  /** CSS pixel width target (for zoom). PDF.js scales internally. */
  width: number;
}

/**
 * Renders a single PDF page to a canvas + a text-layer overlay.
 *
 * The text-layer is what `HighlightLayer` (in P9 follow-up) draws on top of —
 * each text-run is a `<span>` we can match a Range against. Without the
 * text-layer, highlights would have to use bounding-box coords (lossy).
 *
 * **JSX user-built in Antigravity for the wrapper** (page-number header,
 * loading state). The canvas + text-layer rendering itself is correct here
 * — don't gut the useEffect.
 */
export function PDFPage(props: PDFPageProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      const page = await props.doc.getPage(props.pageNumber);
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = props.width / baseViewport.width;
      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current;
      const textLayer = textLayerRef.current;
      if (!canvas || !textLayer) return;

      canvas.width = viewport.width * window.devicePixelRatio;
      canvas.height = viewport.height * window.devicePixelRatio;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const renderTask = page.render({ canvasContext: ctx, viewport });
      await renderTask.promise;
      if (cancelled) return;

      // Text layer
      textLayer.innerHTML = '';
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      const textContent = await page.getTextContent();
      // PDF.js's renderTextLayer in v4 wants a TextLayer instance.
      const TextLayerClass = (
        await import('pdfjs-dist').then((m) => m as unknown as { TextLayer?: unknown })
      ).TextLayer;
      if (TextLayerClass && typeof TextLayerClass === 'function') {
        // Use the new TextLayer API if available.
        const Cls = TextLayerClass as new (args: unknown) => { render: () => Promise<void> };
        const tl = new Cls({
          textContentSource: textContent,
          container: textLayer,
          viewport,
        });
        await tl.render();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.doc, props.pageNumber, props.width]);

  return (
    <div data-todo-antigravity="reader-pdf-page" className="relative my-4 mx-auto bg-white shadow">
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className="absolute inset-0 select-text text-transparent [&>span]:absolute [&>span]:whitespace-pre"
        data-page={props.pageNumber}
      />
    </div>
  );
}
