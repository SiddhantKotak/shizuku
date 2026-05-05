import type { DocumentMeta } from '@shizuku/types';

export interface DocumentCardProps {
  doc: DocumentMeta;
  /** Wire to `navigate({ to: '/reader/$pdfId', params: { pdfId: doc.id } })`. */
  onOpen: () => void;
  /** Wire to `useDeleteDocument().mutate(doc.id)`. Show a confirm. */
  onDelete: () => void;
  /** True while the deletion is in flight (disable the card). */
  isDeleting?: boolean | undefined;
}

/**
 * One row in /library.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Library ·
 * DocumentCard" for the spec (cover-art placeholder, title, page count,
 * upload date, indexStatus pill, delete action with confirm).
 */
export function DocumentCard(props: DocumentCardProps): React.JSX.Element {
  const isReady = props.doc.indexStatus === 'ready';
  return (
    <article
      data-todo-antigravity="library-document-card"
      className="flex items-center gap-3 rounded-cozy border p-3"
    >
      <div className="flex-1 truncate">
        <h3 className="truncate font-medium">{props.doc.title}</h3>
        <p className="text-xs text-ink/60">
          {props.doc.pageCount ?? '—'} pages · {props.doc.indexStatus}
        </p>
      </div>
      {isReady ? (
        <button
          type="button"
          onClick={props.onOpen}
          className="rounded-cozy bg-ember-500 px-3 py-1 text-xs text-white"
        >
          Open
        </button>
      ) : (
        <span className="text-xs text-ink/50">{props.doc.indexStatus}…</span>
      )}
      <button
        type="button"
        onClick={props.onDelete}
        disabled={props.isDeleting}
        className="text-xs text-ink/50 underline disabled:opacity-50"
      >
        {props.isDeleting ? 'Deleting…' : 'Delete'}
      </button>
    </article>
  );
}
