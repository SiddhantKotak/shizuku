import { useQuery } from '@tanstack/react-query';
import type { ChatMessage } from '@shizuku/types';
import { getChatHistory } from '../lib/api/chat';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

/**
 * GET /v1/documents/:id/chat — last 50 messages, oldest-first.
 *
 * The chat sidebar mounts this on document open; new messages from the SSE
 * stream are merged in via `queryClient.setQueryData(...)` from
 * `useChatStream`. So this query primarily handles the initial paint after
 * a refresh.
 */
export function useChatHistory(documentId: string) {
  return useQuery<ChatMessage[], ApiError>({
    queryKey: queryKeys.documents.chat(documentId),
    queryFn: () => getChatHistory(documentId),
    enabled: Boolean(documentId),
    staleTime: 30_000,
  });
}
