import type { Citation } from './domain.js';

// ============================================================================
// PDF upload + indexing SSE events
// (POST /v1/documents — body is multipart, response is text/event-stream)
// ============================================================================
export type UploadEvent =
  | { event: 'created'; data: { documentId: string; r2Key: string } }
  | { event: 'parsed'; data: { pages: number; totalChars: number } }
  | { event: 'chunked'; data: { chunkCount: number } }
  | { event: 'embedding'; data: { batchIndex: number; totalBatches: number } }
  | { event: 'ready'; data: { documentId: string; chunkCount: number } }
  | { event: 'error'; data: { code: string; message: string } };

export type UploadEventName = UploadEvent['event'];

// ============================================================================
// Chat (RAG) SSE events
// (POST /v1/documents/:id/chat — JSON body, text/event-stream response)
// ============================================================================
export type ChatEvent =
  | { event: 'token'; data: { content: string } }
  | { event: 'done'; data: { messageId: string; citations: Citation[] } }
  | { event: 'error'; data: { code: string; message: string; retryAfterSeconds?: number } };

export type ChatEventName = ChatEvent['event'];
