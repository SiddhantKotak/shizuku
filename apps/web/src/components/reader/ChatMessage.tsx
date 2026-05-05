import type { ChatMessage as ChatMessageType } from '@shizuku/types';

export interface ChatMessageProps {
  message: ChatMessageType;
  /** Streaming buffer to render IN PLACE of `message.content` while it's
   *  building. Set when `message.id === currentStream.pendingId`. */
  liveBuffer?: string | undefined;
  /** Wire to `useRefineChat().mutate({ documentId, messageId })`. */
  onRefine?: (() => void) | undefined;
  /** Whether refine is in flight (disable button). */
  isRefining?: boolean | undefined;
}

/**
 * Renders a single chat bubble.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Reader ·
 * ChatMessage" for the full spec (markdown w/ rehype-sanitize, citation
 * pills, per-role bubble styling, [Refine] affordance gated on
 * `message.judgeVerdict === 'needs_refinement'`).
 */
export function ChatMessage(props: ChatMessageProps): React.JSX.Element {
  const text = props.liveBuffer ?? props.message.content;
  const isAssistant = props.message.role === 'assistant';
  const showRefine =
    isAssistant &&
    props.message.judgeVerdict === 'needs_refinement' &&
    props.onRefine;
  return (
    <div
      data-todo-antigravity="reader-chat-message"
      data-role={props.message.role}
      className={`my-2 ${isAssistant ? 'pr-8' : 'pl-8 text-right'}`}
    >
      <div className="rounded-cozy bg-surface-raised p-3 text-sm">{text}</div>
      {showRefine ? (
        <button
          type="button"
          onClick={props.onRefine}
          disabled={props.isRefining}
          className="mt-1 text-xs text-ember-600 underline disabled:opacity-50"
        >
          {props.isRefining ? 'Refining…' : 'Refine'}
        </button>
      ) : null}
    </div>
  );
}
