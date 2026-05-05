import { env } from '../env';
import { createStore } from './createStore';

type AuthStatus = 'idle' | 'authenticating' | 'authenticated' | 'unauthenticated';

/**
 * Module-level promise that guards `bootstrap()` against the cold-start race:
 * `app.tsx` and `_public/oauth.callback.tsx` both kick off `bootstrap()` in
 * `useEffect` on the same render. Without this, the second caller's
 * `await store.bootstrap()` would resolve immediately (because the original
 * "guard" returned early), leaving status='authenticating' when the caller
 * checks it. The caller would then throw "bootstrap_failed" → bounce to login.
 *
 * With the in-flight promise: every concurrent caller awaits the SAME fetch.
 */
let bootstrapInflight: Promise<void> | null = null;

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  /** Coarse-grained user fields known synchronously (full user lives in TanStack Query). */
  userId: string | null;
  email: string | null;
  displayName: string | null;

  setSession: (
    accessToken: string,
    user: { id: string; email: string; displayName: string },
  ) => void;
  setAccessToken: (accessToken: string) => void;
  clear: () => void;
  /**
   * On cold start, ping /auth/refresh — if the refresh cookie is valid we get
   * a new access token and stay logged in. If not, we land at unauthenticated.
   */
  bootstrap: () => Promise<void>;
}

export const useAuthStore = createStore<AuthState>(
  (set, get) => ({
    status: 'idle',
    accessToken: null,
    userId: null,
    email: null,
    displayName: null,

    setSession: (accessToken, user) =>
      set({
        status: 'authenticated',
        accessToken,
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
      }),

    setAccessToken: (accessToken) => set({ accessToken, status: 'authenticated' }),

    clear: () =>
      set({
        status: 'unauthenticated',
        accessToken: null,
        userId: null,
        email: null,
        displayName: null,
      }),

    bootstrap: () => {
      // Already done — fast-path skip.
      if (get().status === 'authenticated' || get().status === 'unauthenticated') {
        return Promise.resolve();
      }
      // Coalesce concurrent callers onto the same fetch.
      if (bootstrapInflight) return bootstrapInflight;

      set({ status: 'authenticating' });
      bootstrapInflight = (async (): Promise<void> => {
        try {
          const res = await fetch(`${env.VITE_API_URL}/v1/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
          });
          if (!res.ok) {
            set({ status: 'unauthenticated' });
            return;
          }
          const json = (await res.json()) as { data: { accessToken: string } };
          set({ accessToken: json.data.accessToken, status: 'authenticated' });
          // Full /me hydration is the responsibility of useMe() in route loaders.
        } catch {
          set({ status: 'unauthenticated' });
        } finally {
          bootstrapInflight = null;
        }
      })();
      return bootstrapInflight;
    },
  }),
  // accessToken is intentionally NOT persisted — refresh cookie is source of truth
  { name: 'shizuku-auth' },
);
