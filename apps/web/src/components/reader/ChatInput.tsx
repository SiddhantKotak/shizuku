export interface ChatInputProps {
  /** Bound to `chatStore.drafts[documentId]`. */
  value: string;
  onChange: (next: string) => void;
  /** Wire to `useChatStream(documentId).send(value)`. */
  onSubmit: () => void;
  /** Wire to `useChatStream(documentId).abort()`. */
  onAbort: () => void;
  /** True while a stream for this document is in flight. */
  isStreaming: boolean;
  /** True if the chat is locked (cost limit / streaming on a different doc). */
  isDisabled: boolean;
  /** Optional caption shown below the input (used for "100/100 chats today"). */
  caption?: string | undefined;
}

/**
 * Composer at the bottom of the chat sidebar.
 *
 * **JSX user-built in Antigravity.** See ANTIGRAVITY_TODO.md → "Reader ·
 * ChatInput" for the full spec (resizing textarea, submit on Enter / newline
 * on Shift-Enter, send button morphs to "Stop" while streaming, character
 * counter at 1500/2000 chars, disabled state shows the caption).
 */
export function ChatInput(props: ChatInputProps): React.JSX.Element {
  return (
    <div data-todo-antigravity="reader-chat-input" className="border-t p-2">
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.isDisabled}
        placeholder={
          props.isDisabled ? props.caption ?? 'Chat is unavailable.' : 'Ask your pet…'
        }
        className="w-full resize-none rounded-cozy border border-ink/20 p-2 text-sm"
        rows={2}
      />
      <div className="mt-1 flex justify-end gap-2">
        {props.isStreaming ? (
          <button
            type="button"
            onClick={props.onAbort}
            className="rounded-cozy bg-rose-500 px-3 py-1 text-xs text-white"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={props.onSubmit}
            disabled={props.isDisabled || props.value.trim().length === 0}
            className="rounded-cozy bg-ember-500 px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
      {props.caption ? <p className="mt-1 text-[11px] text-ink/50">{props.caption}</p> : null}
    </div>
  );
}
