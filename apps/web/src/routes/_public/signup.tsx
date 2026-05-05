import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_public/signup')({
  component: SignupPage,
});

function SignupPage(): React.JSX.Element {
  // TODO(week-2): real SignupForm — RHF + Zod + useSignup mutation.
  return (
    <div className="w-full max-w-md rounded-cozy bg-surface-raised p-8 shadow-cozy">
      <h1 className="font-pixel text-3xl text-ink">Welcome to Shizuku</h1>
      <p className="mt-2 text-sm text-ink/70">Signup (placeholder — implement in Antigravity)</p>
    </div>
  );
}
