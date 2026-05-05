/**
 * Centralized query-key factory. Every TanStack Query hook uses these so that
 * cross-cutting invalidations (e.g. invalidate all of a user's data on logout)
 * are easy to write and grep.
 */
export const queryKeys = {
  all: ['shizuku'] as const,

  me: () => [...queryKeys.all, 'me'] as const,
  pet: () => [...queryKeys.all, 'pet'] as const,

  documents: {
    all: () => [...queryKeys.all, 'documents'] as const,
    list: () => [...queryKeys.documents.all(), 'list'] as const,
    detail: (id: string) => [...queryKeys.documents.all(), 'detail', id] as const,
    chat: (id: string) => [...queryKeys.documents.all(), 'chat', id] as const,
    highlights: (id: string) => [...queryKeys.documents.all(), 'highlights', id] as const,
    bookmarks: (id: string) => [...queryKeys.documents.all(), 'bookmarks', id] as const,
    progress: (id: string) => [...queryKeys.documents.all(), 'progress', id] as const,
  },

  pomodoro: {
    list: () => [...queryKeys.all, 'pomodoro', 'list'] as const,
  },

  quests: {
    today: () => [...queryKeys.all, 'quests', 'today'] as const,
  },

  stats: {
    range: (range: 'today' | 'week' | 'all') => [...queryKeys.all, 'stats', range] as const,
  },

  streak: () => [...queryKeys.all, 'streak'] as const,
  usage: () => [...queryKeys.all, 'usage'] as const,
} as const;
