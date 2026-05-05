import { createFileRoute, redirect } from '@tanstack/react-router';

/** Landing route — for now, immediately funnels to /login. */
export const Route = createFileRoute('/_public/')({
  beforeLoad: () => {
    throw redirect({ to: '/login' });
  },
});
