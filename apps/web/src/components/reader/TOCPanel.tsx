import type { OutlineEntry } from '../../lib/pdf/outline';

export interface TOCPanelProps {
  entries: OutlineEntry[];
  /** Wire to scroll the PDFViewer to the page. */
  onJumpTo: (page: number) => void;
}

/**
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Reader ·
 * TOCPanel" for the spec (indented per `entry.level`, hover state, current-page
 * highlight).
 */
export function TOCPanel(props: TOCPanelProps): React.JSX.Element {
  if (props.entries.length === 0) {
    return (
      <div data-todo-antigravity="reader-toc-panel" className="p-2 text-xs text-ink/50">
        No table of contents in this PDF.
      </div>
    );
  }
  return (
    <div data-todo-antigravity="reader-toc-panel" className="p-2 text-sm">
      <h3 className="mb-2 font-medium">Contents</h3>
      <ul>
        {props.entries.map((e, idx) => (
          <li key={idx} style={{ paddingLeft: `${e.level * 12}px` }}>
            <button
              type="button"
              onClick={() => props.onJumpTo(e.page)}
              className="block w-full truncate text-left text-xs text-ink/80 hover:text-ember-600"
              title={e.title}
            >
              {e.title}
              <span className="ml-1 text-ink/40">p.{e.page}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
