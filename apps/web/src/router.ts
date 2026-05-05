import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { queryClient } from './lib/api/queryClient';

/**
 * Single Router instance for the whole app. Type-augmented so anywhere we
 * import `router` we get full type safety across loaders + search params.
 */
export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0, // rely on TanStack Query's cache, not router prefetch
  defaultPendingMs: 200,
  defaultPendingMinMs: 300,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
