"use client";

import { useState, useTransition } from "react";
import { deleteGame } from "../../app/actions";
import { Panel, Button } from "./ui";

export default function DangerZone({ slug, name }: { slug: string; name: string }) {
  const [confirmText, setConfirmText] = useState("");
  const [pending, start] = useTransition();

  return (
    <Panel className="mt-10 border-[var(--color-danger)]/30 p-4">
      <h3 className="text-sm font-medium text-[var(--color-danger)]">Delete this game</h3>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Removes every slot and version for <strong>{name}</strong>. Save data in R2 is unlinked and
        removed by the next garbage-collection run. This cannot be undone.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
          placeholder={`type "${slug}" to confirm`}
          className="rounded-lg border border-[var(--color-line)] bg-black/20 px-3 py-1.5 text-sm outline-none focus:border-[var(--color-danger)]"
        />
        <Button variant="danger" disabled={confirmText !== slug || pending}
          onClick={() => start(() => deleteGame(slug))}>
          {pending ? "Deleting…" : "Delete game"}
        </Button>
      </div>
    </Panel>
  );
}
