"use client";

import { useActionState } from "react";
import { login } from "../actions";
import { Panel, Button } from "@/components/ui";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center px-6">
      <Panel className="w-full p-6">
        <h1 className="text-lg font-semibold">gamesavecloud</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Paste your <code>GAMESYNC_TOKEN</code> to continue.
        </p>
        <form action={action} className="mt-5 space-y-3">
          <input
            name="token" type="password" autoFocus required
            placeholder="64-character token"
            className="w-full rounded-lg border border-[var(--color-line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          {state?.error && <p className="text-sm text-[var(--color-danger)]">{state.error}</p>}
          <Button className="w-full justify-center" disabled={pending}>
            {pending ? "Checking…" : "Sign in"}
          </Button>
        </form>
      </Panel>
    </main>
  );
}
