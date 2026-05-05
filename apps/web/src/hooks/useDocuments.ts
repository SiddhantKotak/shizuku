import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  useInfiniteQuery,
} from '@tanstack/react-query';
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
import {
  createBookmark,
  createHighlight,
  deleteBookmark,
  deleteDocument,
  deleteHighlight,
  getDocument,
  getReadingProgress,
  getSignedUrl,
  listBookmarks,
  listDocuments,
  listHighlights,
  putReadingProgress,
  updateHighlight,
  type DocumentsListResponse,
} from '../lib/api/documents';
import { queryKeys } from '../lib/api/queryKeys';
import type { ApiError } from '../lib/api/errors';

export function useDocuments() {
  return useInfiniteQuery<
    DocumentsListResponse,
    ApiError,
    InfiniteData<DocumentsListResponse>,
    readonly unknown[],
    string | undefined
  >({
    queryKey: queryKeys.documents.list(),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => listDocuments({ cursor: pageParam ?? undefined, limit: 20 }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useDocument(id: string) {
  return useQuery<DocumentMeta, ApiError>({
    queryKey: queryKeys.documents.detail(id),
    queryFn: () => getDocument(id),
    enabled: Boolean(id),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteDocument,
    onSuccess: (_v, id) => {
      void qc.invalidateQueries({ queryKey: queryKeys.documents.list() });
      qc.removeQueries({ queryKey: queryKeys.documents.detail(id) });
    },
  });
}

/**
 * Fetch a fresh 15-min signed URL for the PDF. Re-fetched on demand by the
 * reader when a stale URL fails.
 */
export function useSignedUrl(id: string) {
  return useQuery<SignedUrlResponse, ApiError>({
    queryKey: [...queryKeys.documents.detail(id), 'signed-url'],
    queryFn: () => getSignedUrl(id),
    enabled: Boolean(id),
    staleTime: 13 * 60 * 1000, // refetch ~2 min before the 15-min URL expires
  });
}

// -------- Highlights --------

export function useHighlights(documentId: string) {
  return useQuery<Highlight[], ApiError>({
    queryKey: queryKeys.documents.highlights(documentId),
    queryFn: () => listHighlights(documentId),
    enabled: Boolean(documentId),
    staleTime: 30_000,
  });
}

export function useCreateHighlight(documentId: string) {
  const qc = useQueryClient();
  return useMutation<Highlight, ApiError, CreateHighlightBody>({
    mutationFn: (body) => createHighlight(documentId, body),
    onSuccess: (created) => {
      qc.setQueryData<Highlight[]>(
        queryKeys.documents.highlights(documentId),
        (prev) => (prev ?? []).concat(created),
      );
    },
  });
}

export function useUpdateHighlight(documentId: string) {
  const qc = useQueryClient();
  return useMutation<
    Highlight,
    ApiError,
    { highlightId: string; body: UpdateHighlightBody }
  >({
    mutationFn: ({ highlightId, body }) => updateHighlight(documentId, highlightId, body),
    onSuccess: (updated) => {
      qc.setQueryData<Highlight[]>(
        queryKeys.documents.highlights(documentId),
        (prev) => (prev ?? []).map((h) => (h.id === updated.id ? updated : h)),
      );
    },
  });
}

export function useDeleteHighlight(documentId: string) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (highlightId) => deleteHighlight(documentId, highlightId),
    onSuccess: (_v, highlightId) => {
      qc.setQueryData<Highlight[]>(
        queryKeys.documents.highlights(documentId),
        (prev) => (prev ?? []).filter((h) => h.id !== highlightId),
      );
    },
  });
}

// -------- Bookmarks --------

export function useBookmarks(documentId: string) {
  return useQuery<Bookmark[], ApiError>({
    queryKey: queryKeys.documents.bookmarks(documentId),
    queryFn: () => listBookmarks(documentId),
    enabled: Boolean(documentId),
    staleTime: 30_000,
  });
}

export function useCreateBookmark(documentId: string) {
  const qc = useQueryClient();
  return useMutation<Bookmark, ApiError, CreateBookmarkBody>({
    mutationFn: (body) => createBookmark(documentId, body),
    onSuccess: (created) => {
      qc.setQueryData<Bookmark[]>(
        queryKeys.documents.bookmarks(documentId),
        (prev) => [...(prev ?? []), created].sort((a, b) => a.page - b.page),
      );
    },
  });
}

export function useDeleteBookmark(documentId: string) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (bookmarkId) => deleteBookmark(documentId, bookmarkId),
    onSuccess: (_v, bookmarkId) => {
      qc.setQueryData<Bookmark[]>(
        queryKeys.documents.bookmarks(documentId),
        (prev) => (prev ?? []).filter((b) => b.id !== bookmarkId),
      );
    },
  });
}

// -------- Reading progress --------

export function useReadingProgress(documentId: string) {
  return useQuery<ReadingProgress | null, ApiError>({
    queryKey: queryKeys.documents.progress(documentId),
    queryFn: () => getReadingProgress(documentId),
    enabled: Boolean(documentId),
    staleTime: 30_000,
  });
}

export function usePutReadingProgress(documentId: string) {
  const qc = useQueryClient();
  return useMutation<ReadingProgress, ApiError, number>({
    mutationFn: (currentPage) => putReadingProgress(documentId, currentPage),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.documents.progress(documentId), updated);
      // Pages count toward streak/quests/pet XP — invalidate.
      void qc.invalidateQueries({ queryKey: queryKeys.streak() });
      void qc.invalidateQueries({ queryKey: queryKeys.quests.today() });
      void qc.invalidateQueries({ queryKey: queryKeys.stats.range('today') });
      void qc.invalidateQueries({ queryKey: queryKeys.pet() });
    },
  });
}
