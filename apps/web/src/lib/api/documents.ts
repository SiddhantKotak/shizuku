import type {
  Bookmark,
  CreateBookmarkBody,
  CreateHighlightBody,
  DocumentMeta,
  Highlight,
  ReadingProgress,
  SignedUrlResponse,
  UpdateHighlightBody,
} from '@shizuku/types';
import { apiFetch } from './client';

// -------- Documents (list/get/delete/signed-url) --------

export interface DocumentsListResponse {
  documents: DocumentMeta[];
  nextCursor: string | null;
}

export interface ListDocumentsArgs {
  cursor?: string | undefined;
  limit?: number | undefined;
}

export async function listDocuments(
  opts: ListDocumentsArgs = {},
): Promise<DocumentsListResponse> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return apiFetch<DocumentsListResponse>(`/v1/documents${qs ? `?${qs}` : ''}`);
}

export async function getDocument(id: string): Promise<DocumentMeta> {
  return apiFetch<DocumentMeta>(`/v1/documents/${id}`);
}

export async function deleteDocument(id: string): Promise<void> {
  await apiFetch<void>(`/v1/documents/${id}`, { method: 'DELETE' });
}

export async function getSignedUrl(id: string): Promise<SignedUrlResponse> {
  return apiFetch<SignedUrlResponse>(`/v1/documents/${id}/signed-url`);
}

// -------- Highlights --------

export async function listHighlights(documentId: string): Promise<Highlight[]> {
  return apiFetch<Highlight[]>(`/v1/documents/${documentId}/highlights`);
}

export async function createHighlight(
  documentId: string,
  body: CreateHighlightBody,
): Promise<Highlight> {
  return apiFetch<Highlight>(`/v1/documents/${documentId}/highlights`, {
    method: 'POST',
    body,
  });
}

export async function updateHighlight(
  documentId: string,
  highlightId: string,
  body: UpdateHighlightBody,
): Promise<Highlight> {
  return apiFetch<Highlight>(`/v1/documents/${documentId}/highlights/${highlightId}`, {
    method: 'PATCH',
    body,
  });
}

export async function deleteHighlight(documentId: string, highlightId: string): Promise<void> {
  await apiFetch<void>(`/v1/documents/${documentId}/highlights/${highlightId}`, {
    method: 'DELETE',
  });
}

// -------- Bookmarks --------

export async function listBookmarks(documentId: string): Promise<Bookmark[]> {
  return apiFetch<Bookmark[]>(`/v1/documents/${documentId}/bookmarks`);
}

export async function createBookmark(
  documentId: string,
  body: CreateBookmarkBody,
): Promise<Bookmark> {
  return apiFetch<Bookmark>(`/v1/documents/${documentId}/bookmarks`, {
    method: 'POST',
    body,
  });
}

export async function deleteBookmark(documentId: string, bookmarkId: string): Promise<void> {
  await apiFetch<void>(`/v1/documents/${documentId}/bookmarks/${bookmarkId}`, {
    method: 'DELETE',
  });
}

// -------- Reading progress --------

export async function getReadingProgress(documentId: string): Promise<ReadingProgress | null> {
  try {
    return await apiFetch<ReadingProgress>(`/v1/documents/${documentId}/reading-progress`);
  } catch (err) {
    const e = err as { status?: number };
    if (e.status === 404) return null;
    throw err;
  }
}

export async function putReadingProgress(
  documentId: string,
  currentPage: number,
): Promise<ReadingProgress> {
  return apiFetch<ReadingProgress>(`/v1/documents/${documentId}/reading-progress`, {
    method: 'PUT',
    body: { currentPage },
  });
}
