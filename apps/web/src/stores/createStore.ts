import { create as zustandCreate, type StateCreator } from 'zustand';
import { devtools, persist, type DevtoolsOptions, type PersistOptions } from 'zustand/middleware';

export interface CreateStoreOpts<T, P = T> {
  name: string;
  /**
   * When set, the slice is persisted to localStorage. The second generic `P`
   * is the persisted shape — defaults to the full state, but `partialize`
   * can narrow it (e.g. omit transient flags like a `streaming` boolean).
   */
  persist?: Omit<PersistOptions<T, P>, 'name'>;
}

/**
 * Helper that wraps Zustand's `create` with consistent devtools + optional
 * localStorage persistence. Use everywhere instead of bare `create`.
 */
export function createStore<T, P = T>(initializer: StateCreator<T>, opts: CreateStoreOpts<T, P>) {
  const devtoolsOpts: DevtoolsOptions = { name: opts.name, enabled: import.meta.env.DEV };
  if (opts.persist) {
    return zustandCreate<T>()(
      devtools(persist(initializer, { name: opts.name, ...opts.persist }), devtoolsOpts),
    );
  }
  return zustandCreate<T>()(devtools(initializer, devtoolsOpts));
}
