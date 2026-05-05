import { useChatHistory } from '../../hooks/useChatHistory';
import { useChatStream } from '../../hooks/useChatStream';
import { useUsage } from '../../hooks/useUsage';
import { useChatStore } from '../../stores/chatStore';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { UsageMeter } from './UsageMeter';

export interface PetChatSidebarProps {
  /** Document we're chatting about. */
  documentId: string;
}

/**
 * Sidebar shell — composes ChatMessage list + ChatInput + UsageMeter.
 *
 * **JSX user-built in Antigravity.** This file wires the data flow; the
 * VISUAL layout (sidebar width, header with pet sprite, scroll behavior,
 * empty-state illustration) is your Antigravity work — see ANTIGRAVITY_TODO.md
 * → "Reader · PetChatSidebar".
 */
export function PetChatSidebar(props: PetChatSidebarProps): React.JSX.Element {
  const history = useChatHistory(props.documentId);
  const usage = useUsage();
  const { send, abort, isStreaming } = useChatStream(props.documentId);

  const draft = useChatStore((s) => s.drafts[props.documentId] ?? '');
  const setDraft = useChatStore((s) => s.setDraft);
  const clearDraft = useChatStore((s) => s.clearDraft);
  const stream = useChatStore((s) => s.currentStream);
  const disabledUntil = useChatStore((s) => s.disabledUntil);

  const usageData = usage.data;
  const chatLimitHit = usageData ? usageData.chats.used >= usageData.chats.limit : false;
  const isOnCooldown = Date.now() < disabledUntil;
  const isLockedByOtherStream =
    stream !== null && stream.documentId !== props.documentId;

  const isDisabled = chatLimitHit || isOnCooldown || isLockedByOtherStream;

  const onSubmit = (): void => {
    const trimmed = draft.trim();
    if (!trimmed || isDisabled || isStreaming) return;
    clearDraft(props.documentId);
    void send(trimmed);
  };

  return (
    <aside
      data-todo-antigravity="reader-pet-chat-sidebar"
      className="flex h-full w-[360px] flex-col border-l bg-white"
    >
      <header className="flex items-center justify-between border-b p-2">
        <h2 className="font-pixel text-sm">Pet chat</h2>
        {usageData ? (
          <UsageMeter
            used={usageData.chats.used}
            limit={usageData.chats.limit}
            resetAt={usageData.chats.resetAt}
            label="chats today"
          />
        ) : null}
      </header>
      <div className="flex-1 overflow-y-auto p-2">
        {history.isPending ? (
          <p className="text-xs text-ink/50">Loading history…</p>
        ) : (history.data ?? []).length === 0 && !stream ? (
          <p className="text-xs text-ink/50">Ask your pet about this document.</p>
        ) : (
          (history.data ?? []).map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              liveBuffer={
                stream && m.id === stream.pendingId ? stream.buffer : undefined
              }
            />
          ))
        )}
      </div>
      <ChatInput
        value={draft}
        onChange={(v) => setDraft(props.documentId, v)}
        onSubmit={onSubmit}
        onAbort={abort}
        isStreaming={isStreaming}
        isDisabled={isDisabled}
        caption={
          chatLimitHit
            ? `Daily chat limit reached (${usageData?.chats.limit ?? 100}). Resets at midnight UTC.`
            : isOnCooldown
              ? 'Cooling down — try again in a moment.'
              : isLockedByOtherStream
                ? 'Another chat is in progress.'
                : undefined
        }
      />
    </aside>
  );
}
