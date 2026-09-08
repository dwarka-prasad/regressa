"use client";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { signup } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary w-full" type="submit" disabled={pending}>{pending ? "Creating..." : "Create account"}</button>;
}

export default function SignupPage() {
  const [state, action] = useFormState(signup, undefined);
  return (
    <form action={action} className="card space-y-4 animate-fade-up">
      <div><h1>Create your workspace</h1><p className="mt-1 text-sm text-muted">Free plan, no card required.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Name</label><input className="input" name="name" autoComplete="name" /></div>
        <div><label className="label">Organization</label><input className="input" name="org" placeholder="Acme AI" /></div>
      </div>
      <div><label className="label">Email</label><input className="input" name="email" type="email" required autoComplete="email" /></div>
      <div><label className="label">Password</label><input className="input" name="password" type="password" minLength={8} required autoComplete="new-password" placeholder="At least 8 characters" /></div>
      {state?.error && <p className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{state.error}</p>}
      <Submit />
      <p className="text-center text-sm text-muted">Already have one? <Link className="link" href="/login">Sign in</Link></p>
    </form>
  );
}
