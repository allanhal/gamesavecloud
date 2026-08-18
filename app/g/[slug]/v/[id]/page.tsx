import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { requireSession } from "@/lib/auth";
import { bytes, ago } from "@/lib/format";
import { Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VersionPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  await requireSession();
  const { slug, id } = await params;

  const [snap] = await db.execute<any>(sql`
    select sn.*, g.name as "gameName" from snapshots sn
    join slots s on s.id = sn.slot_id join games g on g.id = s.game_id
    where sn.id = ${id}`);
  if (!snap) notFound();

  const files = await db.execute<any>(sql`
    select path, blob_hash as "hash", size from snapshot_files
    where snapshot_id = ${id} order by path`);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href={`/g/${slug}`} className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">
        ← {snap.gameName}
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Version {snap.version}</h1>
      <p className="text-sm text-[var(--color-muted)]">
        {snap.device ?? "—"} · {ago(snap.created_at)} · {files.length} files · {bytes(Number(snap.total_size))}
      </p>

      <Panel className="mt-6 divide-y divide-[var(--color-line)]">
        {files.map((f: any) => (
          <div key={f.path} className="flex items-center gap-4 px-4 py-2.5 text-sm">
            <span className="truncate font-mono text-xs">{f.path}</span>
            <span className="ml-auto shrink-0 tabular-nums text-[var(--color-muted)]">{bytes(Number(f.size))}</span>
            <a href={`/d/${f.hash}`} className="shrink-0 text-[var(--color-accent)] hover:underline">
              download
            </a>
          </div>
        ))}
      </Panel>
    </main>
  );
}
