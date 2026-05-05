import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { BookmarkPanel } from '../../components/reader/BookmarkPanel';
import { PDFViewer } from '../../components/reader/PDFViewer';
import { PetChatSidebar } from '../../components/reader/PetChatSidebar';
import { TOCPanel } from '../../components/reader/TOCPanel';
import {
  useBookmarks,
  useDeleteBookmark,
  useDocument,
  usePutReadingProgress,
  useReadingProgress,
  useSignedUrl,
} from '../../hooks/useDocuments';
import { buildOutline, type OutlineEntry } from '../../lib/pdf/outline';
import { usePdf } from '../../lib/pdf/usePdf';

const searchSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
});

export const Route = createFileRoute('/_app/reader/$pdfId')({
  component: ReaderPage,
  validateSearch: (search) => searchSchema.parse(search),
});

const PAGE_WIDTH = 720;
const READING_PROGRESS_DEBOUNCE_MS = 30_000;

/**
 * /reader/$pdfId — the PDF reader view.
 *
 * Layout: TOC + Bookmarks (left rail) | PDFViewer (center) | PetChatSidebar (right).
 *
 * **Visual layout is your Antigravity work.** The data flow is wired here:
 *   - signed URL is fetched + handed to usePdf
 *   - currentPage in route search; debounced PUT to reading-progress
 *   - bookmarks + TOC + chat sidebar already plumbed
 */
function ReaderPage(): React.JSX.Element {
  const { pdfId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const docMeta = useDocument(pdfId);
  const signed = useSignedUrl(pdfId);
  const { doc } = usePdf(signed.data?.url ?? null);
  const bookmarks = useBookmarks(pdfId);
  const deleteBookmark = useDeleteBookmark(pdfId);
  const progress = useReadingProgress(pdfId);
  const putProgress = usePutReadingProgress(pdfId);

  const initialPage = search.page ?? progress.data?.currentPage ?? 1;
  const [currentPage, setCurrentPage] = useState(initialPage);

  // Sync page → URL (for shareable / refresh-stable state).
  useEffect(() => {
    void navigate({
      to: '/reader/$pdfId',
      params: { pdfId },
      search: { page: currentPage },
      replace: true,
    });
  }, [currentPage, pdfId, navigate]);

  // Debounced PUT — fire ≥30s after the latest page change. The server
  // ignores backward jumps for stat purposes anyway.
  useEffect(() => {
    const t = window.setTimeout(() => {
      putProgress.mutate(currentPage);
    }, READING_PROGRESS_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  useEffect(() => {
    if (!doc) return;
    void buildOutline(doc).then(setOutline);
  }, [doc]);

  const indexBlocked = useMemo(
    () =>
      docMeta.data &&
      docMeta.data.indexStatus !== 'ready' &&
      docMeta.data.indexStatus !== 'indexing',
    [docMeta.data],
  );

  if (docMeta.isPending || signed.isPending) return <Pending />;
  if (indexBlocked) return <IndexFailedShell />;
  if (!doc) return <Pending />;

  return (
    <div data-todo-antigravity="reader-page" className="flex h-screen">
      <aside className="w-56 overflow-y-auto border-r">
        <TOCPanel entries={outline} onJumpTo={(page) => setCurrentPage(page)} />
        <BookmarkPanel
          bookmarks={bookmarks.data ?? []}
          onJumpTo={(page) => setCurrentPage(page)}
          onDelete={(id) => deleteBookmark.mutate(id)}
        />
      </aside>
      <main className="flex-1 overflow-y-auto">
        <PDFViewer
          doc={doc}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          pageWidth={PAGE_WIDTH}
        />
      </main>
      <PetChatSidebar documentId={pdfId} />
    </div>
  );
}

function Pending(): React.JSX.Element {
  return (
    <div className="grid min-h-screen place-items-center">
      <p className="text-sm text-ink/70">Loading reader…</p>
    </div>
  );
}

function IndexFailedShell(): React.JSX.Element {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="rounded-cozy bg-surface-raised p-6 text-center">
        <h2 className="font-pixel text-lg">This PDF didn't index</h2>
        <p className="mt-2 text-sm text-ink/70">Delete and re-upload to retry.</p>
      </div>
    </div>
  );
}
