"use client";

import { useActionState, useState } from "react";
import { addGame } from "../../app/actions";
import { Button, Panel } from "./ui";

export default function AddGame() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addGame, null);

  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>Add game</Button>;

  return (
    <Panel className="absolute right-6 z-10 mt-2 w-72 p-4">
      <form action={action} className="space-y-2">
        <input name="name" placeholder="SnowRunner" required autoFocus
          className="w-full rounded-lg border border-[var(--color-line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
        <input name="slug" placeholder="slug (optional)"
          className="w-full rounded-lg border border-[var(--color-line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
        {state?.error && <p className="text-xs text-[var(--color-danger)]">{state.error}</p>}
        <div className="flex gap-2">
          <Button disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </form>
    </Panel>
  );
}
