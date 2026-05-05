import type { Bookmark } from '@shizuku/types';

export interface BookmarkPanelProps {
  bookmarks: Bookmark[];
  /** Wire to scroll the PDFViewer to the page (sets `currentPage` in route search). */
  onJumpTo: (page: number) => void;
  /** Wire to `useDeleteBookmark().mutate(bookmarkId)`. */
  onDelete: (bookmarkId: string) => void;
}

/**
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Reader ·
 * BookmarkPanel" for the full spec (sticky header, empty state copy,
 * pencil-icon edit affordance for label rename).
 */
export function BookmarkPanel(props: BookmarkPanelProps): React.JSX.Element {
  return (
    <div data-todo-antigravity="reader-bookmark-panel" className="p-2 text-sm">
      <h3 className="mb-2 font-medium">Bookmarks</h3>
      {props.bookmarks.length === 0 ? (
        <p className="text-xs text-ink/50">No bookmarks yet.</p>
      ) : (
        <ul className="space-y-1">
          {props.bookmarks.map((b) => (
            <li key={b.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => props.onJumpTo(b.page)}
                className="flex-1 text-left underline"
              >
                p.{b.page} {b.label ? `— ${b.label}` : ''}
              </button>
              <button
                type="button"
                onClick={() => props.onDelete(b.id)}
                className="text-xs text-ink/50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
