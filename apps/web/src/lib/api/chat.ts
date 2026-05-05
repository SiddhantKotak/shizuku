import type { ChatMessage } from '@shizuku/types';
import { apiFetch } from './client';

/** GET /v1/documents/:id/chat — last 50 messages, oldest-first. */
export async function getChatHistory(documentId: string): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/v1/documents/${documentId}/chat`);
}
