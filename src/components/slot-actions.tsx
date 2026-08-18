"use client";

import { useState, useTransition } from "react";
import { rollback, setPinned, deleteSnapshot } from "../../app/actions";
import { Button } from "./ui";

export default function SlotActions({ slug, slot, snapshotId, version, pinned, isCurrent }: {
  slug: string; slot: number; snapshotId: string; version: number; pinned: boolean; isCurrent: boolean;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-xs text-[var(--color-danger)]">{err}</span>}

      <Button variant="ghost" disabled={pending}
        onClick={() => start(() => setPinned(snapshotId, !pinned, slug))}>
        {pinned ? "Unpin" : "Pin"}
      </Button>

      {!isCurrent && (
        <Button disabled={pending}
          onClick={() => {
            if (!confirm(`Restore v${version}? This creates a new version — nothing is deleted.`)) return;
            start(() => rollback(slug, slot, version));
          }}>
          Restore
        </Button>
      )}

      {!isCurrent && (
        <Button variant="danger" disabled={pending}
          onClick={() => {
            if (!confirm(`Permanently delete v${version}? This cannot be undone.`)) return;
            start(async () => {
              const r = await deleteSnapshot(snapshotId, slug);
              if (r?.error) setErr(r.error);
            });
          }}>
          Delete
        </Button>
      )}
    </div>
  );
}
