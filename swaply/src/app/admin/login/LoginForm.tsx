"use client";
import { useActionState } from "react";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {} as { error?: string; email?: string });
  return (
    <form action={action} className="space-y-3">
      <input key={state?.email ?? ""} defaultValue={state?.email ?? ""} name="email" type="email" required autoComplete="username" placeholder="Email" className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 outline-none focus:border-accent" />
      <input name="password" type="password" required autoComplete="current-password" placeholder="Пароль" className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 outline-none focus:border-accent" />
      {state?.error && <p className="text-sm text-danger" data-testid="login-error">{state.error}</p>}
      <button disabled={pending} className="h-12 w-full rounded-2xl bg-accent font-semibold text-on-accent disabled:opacity-50">{pending ? "…" : "Увійти"}</button>
    </form>
  );
}
