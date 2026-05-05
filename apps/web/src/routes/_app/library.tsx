import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { DocumentCard } from '../../components/library/DocumentCard';
import { UploadButton } from '../../components/library/UploadButton';
import { useDeleteDocument, useDocuments } from '../../hooks/useDocuments';
import { usePdfUpload } from '../../hooks/usePdfUpload';
import { useUsage } from '../../hooks/useUsage';

export const Route = createFileRoute('/_app/library')({
  component: LibraryPage,
});

/**
 * /library — list of the user's PDFs + the upload affordance.
 *
 * Data wiring is here; visual layout (grid columns, card spacing, empty state)
 * is your Antigravity work — see ANTIGRAVITY_TODO.md → "Library · LibraryPage".
 */
function LibraryPage(): React.JSX.Element {
  const navigate = useNavigate();
  const docs = useDocuments();
  const usage = useUsage();
  const upload = usePdfUpload();
  const remove = useDeleteDocument();

  const allDocs = docs.data?.pages.flatMap((p) => p.documents) ?? [];
  const isLifetimeLimitHit = usage.data
    ? usage.data.pdfs.used >= usage.data.pdfs.limit
    : false;

  return (
    <main
      data-todo-antigravity="library-page"
      className="mx-auto max-w-3xl px-4 py-6"
    >
      <header className="flex items-center justify-between">
        <h1 className="font-pixel text-2xl">Library</h1>
        {usage.data ? (
          <span className="text-xs text-ink/60">
            {usage.data.pdfs.used} / {usage.data.pdfs.limit} PDFs
          </span>
        ) : null}
      </header>

      <div className="mt-4">
        <UploadButton
          onUpload={(file) => {
            void upload.upload(file).then(({ documentId }) => {
              // Auto-open the just-indexed PDF.
              void navigate({ to: '/reader/$pdfId', params: { pdfId: documentId } });
            });
          }}
          progress={upload.progress}
          isLifetimeLimitHit={isLifetimeLimitHit}
        />
      </div>

      <section className="mt-6 grid gap-2">
        {docs.isPending ? (
          <p className="text-xs text-ink/50">Loading…</p>
        ) : allDocs.length === 0 ? (
          <p className="text-xs text-ink/50">No PDFs yet — upload one to get started.</p>
        ) : (
          allDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onOpen={() => {
                void navigate({ to: '/reader/$pdfId', params: { pdfId: doc.id } });
              }}
              onDelete={() => remove.mutate(doc.id)}
              isDeleting={remove.isPending && remove.variables === doc.id}
            />
          ))
        )}
      </section>

      {docs.hasNextPage ? (
        <button
          type="button"
          onClick={() => void docs.fetchNextPage()}
          className="mt-4 rounded-cozy border px-3 py-1 text-xs"
        >
          {docs.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
    </main>
  );
}
