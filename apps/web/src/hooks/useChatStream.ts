import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, Citation } from '@shizuku/types';
import { env } from '../env';
import { queryKeys } from '../lib/api/queryKeys';
import { streamSSE, type SseEvent } from '../lib/sse/sseClient';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';

/**
 * Pet-chat streaming hook.
 *
 * Glues the SSE consumer to:
 *   - chatStore (live token buffer, draft, disabledUntil)
 *   - TanStack Query (chat history cache, usage cache)
 *
 * Usage from a component:
 *
 *   const { send, abort, isStreaming } = useChatStream(documentId);
 *   send("What's on page 3?");
 *
 * The component reads `currentStream.buffer` from chatStore to render the
 * in-progress assistant bubble. After `done`, the assistant message is
 * patched into the chat history cache and the buffer is cleared.
 */

interface SendDoneEvent {
  messageId: string;
  citations: Citation[];
}
interface RefinableEvent {
  messageId: string;
  total: number;
}
interface ErrorEvent {
  code: string;
  message: string;
}

export interface UseChatStream {
  send: (message: string) => Promise<void>;
  abort: () => void;
  isStreaming: boolean;
}

export function useChatStream(documentId: string): UseChatStream {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Token batching: SSE deltas can arrive 50-100/sec from gpt-4o; we coalesce
  // into one render per animation frame so React doesn't thrash.
  const pendingDeltaRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const flushBuffer = useCallback(() => {
    rafRef.current = null;
    const delta = pendingDeltaRef.current;
    if (delta.length === 0) return;
    pendingDeltaRef.current = '';
    useChatStore.getState().appendBuffer(delta);
  }, []);

  const send = useCallback(
    async (message: string): Promise<void> => {
      if (isStreaming) return; // ignore double-submit; UI already disables
      // Abort any prior in-flight stream just in case (defensive).
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const pendingId = `pending_${Date.now()}`;
      const userMsgId = `local_user_${Date.now()}`;
      const accessToken = useAuthStore.getState().accessToken;

      // Optimistic: insert user msg + empty assistant msg into the chat
      // cache so the sidebar paints immediately.
      queryClient.setQueryData<ChatMessage[]>(
        queryKeys.documents.chat(documentId),
        (prev) => [
          ...(prev ?? []),
          makeLocalMessage({
            id: userMsgId,
            documentId,
            role: 'user',
            content: message,
          }),
          makeLocalMessage({
            id: pendingId,
            documentId,
            role: 'assistant',
            content: '',
          }),
        ],
      );
      useChatStore.getState().startStream(documentId, pendingId);
      setIsStreaming(true);

      try {
        await streamSSE({
          url: `${env.VITE_API_URL}/v1/documents/${documentId}/chat`,
          method: 'POST',
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ message }),
          signal: controller.signal,
          onEvent: (evt) => handleEvent(evt, { documentId, pendingId, queryClient, flushBuffer }),
        });
      } catch (err) {
        const e = err as Error & { code?: string; status?: number };
        if (e.name === 'AbortError') return; // user pressed stop — no toast
        if (e.code === 'cost_limit_exceeded') {
          // Lock the input until the next UTC midnight (server emits resetAt
          // in details, but for safety we just disable until the cache refetches).
          useChatStore.getState().setDisabledUntil(Date.now() + 60_000);
          void queryClient.invalidateQueries({ queryKey: queryKeys.usage() });
        }
        // Drop the optimistic assistant bubble; keep the user message so
        // they can edit + retry.
        queryClient.setQueryData<ChatMessage[]>(
          queryKeys.documents.chat(documentId),
          (prev) => (prev ?? []).filter((m) => m.id !== pendingId),
        );
        throw err;
      } finally {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        useChatStore.getState().endStream();
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [documentId, isStreaming, queryClient, flushBuffer],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    useChatStore.getState().abortStream();
  }, []);

  return { send, abort, isStreaming };
}

function handleEvent(
  evt: SseEvent,
  ctx: {
    documentId: string;
    pendingId: string;
    queryClient: ReturnType<typeof useQueryClient>;
    flushBuffer: () => void;
  },
): void {
  if (evt.event === 'token') {
    const { content } = evt.data as { content: string };
    if (typeof content !== 'string') return;
    // Append to the rAF-batched buffer.
    appendDelta(content, ctx.flushBuffer);
    return;
  }

  if (evt.event === 'done') {
    // Final: patch the cache so the pending row becomes the real row.
    const { messageId, citations } = evt.data as SendDoneEvent;
    const buffer = useChatStore.getState().currentStream?.buffer ?? '';
    ctx.queryClient.setQueryData<ChatMessage[]>(
      queryKeys.documents.chat(ctx.documentId),
      (prev) =>
        (prev ?? []).map((m) =>
          m.id === ctx.pendingId
            ? {
                ...m,
                id: messageId,
                content: buffer,
                citations,
              }
            : m,
        ),
    );
    void ctx.queryClient.invalidateQueries({ queryKey: queryKeys.usage() });
    void ctx.queryClient.invalidateQueries({ queryKey: queryKeys.streak() });
    void ctx.queryClient.invalidateQueries({ queryKey: queryKeys.quests.today() });
    void ctx.queryClient.invalidateQueries({ queryKey: queryKeys.stats.range('today') });
    void ctx.queryClient.invalidateQueries({ queryKey: queryKeys.pet() });
    return;
  }

  if (evt.event === 'refinable') {
    // Patch the message with judge verdict so the UI shows [Refine].
    const { messageId } = evt.data as RefinableEvent;
    ctx.queryClient.setQueryData<ChatMessage[]>(
      queryKeys.documents.chat(ctx.documentId),
      (prev) =>
        (prev ?? []).map((m) =>
          m.id === messageId ? { ...m, judgeVerdict: 'needs_refinement' } : m,
        ),
    );
    return;
  }

  if (evt.event === 'error') {
    const { code, message } = evt.data as ErrorEvent;
    // Surface via uiStore toast (lands in P11/P13 wave). For now, console.
    console.error('[chat:error]', code, message);
  }
}

function appendDelta(delta: string, flush: () => void): void {
  // Read mutable refs from outside via a closure hack — caller passes us the
  // batching function bound to its rafRef + pendingDeltaRef.
  // (This little dance keeps the hook re-render-stable.)
  const store = useChatStore.getState();
  if (!store.currentStream) return;
  // Append to the closure-bound buffer; flush is rAF-scheduled.
  pendingDeltaModule.value += delta;
  if (rafScheduledModule.value) return;
  rafScheduledModule.value = true;
  requestAnimationFrame(() => {
    rafScheduledModule.value = false;
    const flushed = pendingDeltaModule.value;
    pendingDeltaModule.value = '';
    if (flushed) {
      useChatStore.getState().appendBuffer(flushed);
    }
    flush();
  });
}

// Module-scope batching state — one in-flight stream at a time, so a single
// pair of refs is enough. Reset on each new send via the closure refs in the
// hook (safe because the hook also serializes via `isStreaming`).
const pendingDeltaModule = { value: '' };
const rafScheduledModule = { value: false };

function makeLocalMessage(
  args: Pick<ChatMessage, 'id' | 'documentId' | 'role' | 'content'>,
): ChatMessage {
  return {
    ...args,
    citations: null,
    parentMessageId: null,
    judgeVerdict: null,
    judgeScores: null,
    judgeIssues: null,
    createdAt: new Date().toISOString(),
  };
}
