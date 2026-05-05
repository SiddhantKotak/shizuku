import { createStore } from './createStore';

/**
 * Per-document chat draft + streaming-buffer state.
 *
 * Persistence: NOT persisted. Drafts and stream buffers are session-only.
 * Server state (history, judge verdicts) lives in TanStack Query.
 *
 * Concurrency: only one stream can be active at a time per documentId.
 * `currentStream` tracks the document the active stream belongs to. The
 * SPA disables the chat input on other documents while a stream runs.
 */

interface ChatStreamState {
  /** Document the stream is for. */
  documentId: string;
  /** Synthetic id we use for the in-progress assistant message. Replaced
   *  by the real `messageId` from `event: done` once the server commits. */
  pendingId: string;
  /** Live token buffer — render this in the assistant bubble while streaming. */
  buffer: string;
  /** Set when AbortController.abort() has been called. */
  aborted: boolean;
}

interface ChatState {
  /** Per-document input drafts (preserved across reader navigation). */
  drafts: Record<string, string>;
  /** Active stream state (or null if no stream is in flight). */
  currentStream: ChatStreamState | null;
  /** Until this timestamp the chat input is disabled (set on 429). */
  disabledUntil: number;

  setDraft: (documentId: string, draft: string) => void;
  clearDraft: (documentId: string) => void;

  startStream: (documentId: string, pendingId: string) => void;
  appendBuffer: (delta: string) => void;
  endStream: () => void;
  abortStream: () => void;
  setDisabledUntil: (ts: number) => void;
}

export const useChatStore = createStore<ChatState>(
  (set) => ({
  drafts: {},
  currentStream: null,
  disabledUntil: 0,

  setDraft: (documentId, draft) =>
    set((state) => ({ drafts: { ...state.drafts, [documentId]: draft } })),
  clearDraft: (documentId) =>
    set((state) => {
      const next = { ...state.drafts };
      delete next[documentId];
      return { drafts: next };
    }),

  startStream: (documentId, pendingId) =>
    set({ currentStream: { documentId, pendingId, buffer: '', aborted: false } }),
  appendBuffer: (delta) =>
    set((state) =>
      state.currentStream
        ? { currentStream: { ...state.currentStream, buffer: state.currentStream.buffer + delta } }
        : state,
    ),
  endStream: () => set({ currentStream: null }),
  abortStream: () =>
    set((state) =>
      state.currentStream
        ? { currentStream: { ...state.currentStream, aborted: true } }
        : state,
    ),
  setDisabledUntil: (ts) => set({ disabledUntil: ts }),
  }),
  { name: 'shizuku-chat' },
);
