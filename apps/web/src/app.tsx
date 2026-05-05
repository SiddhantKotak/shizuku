import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { router } from './router';
import { queryClient } from './lib/api/queryClient';
import { useAuthStore } from './stores/authStore';

export function App(): React.JSX.Element {
  const bootstrapAuth = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrapAuth();
  }, [bootstrapAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
