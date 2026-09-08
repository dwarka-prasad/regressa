"use client";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { login } from "../actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" type="submit" disabled={pending}>{pending ? "Signing in..." : children}</button>;
}

export function LoginForm({ next, sso, error }: { next: string; sso: boolean; error?: string }) {
  const [state, action] = useFormState(login, undefined);
  return (
    <form action={action} className="card space-y-4 animate-fade-up">
      <div><h1>Welcome back</h1><p className="mt-1 text-sm text-muted">Sign in to your Regressa workspace.</p></div>
      <input type="hidden" name="next" value={next} />
      <div><label className="label">Email</label><input className="input" name="email" type="email" required autoComplete="email" placeholder="you@company.com" /></div>
      <div><label className="label">Password</label><input className="input" name="password" type="password" required autoComplete="current-password" /></div>
      {(state?.error || error) && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state?.error ?? `SSO sign-in failed: ${error}`}</p>}
      <Submit>Sign in</Submit>
      {sso && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <a className="btn-ghost w-full" href={`/api/auth/oidc/start?next=${encodeURIComponent(next)}`}>Continue with SSO</a>
        </>
      )}
      <p className="text-center text-sm text-muted">New here? <Link className="link" href="/signup">Create an account</Link></p>
    </form>
  );
}
