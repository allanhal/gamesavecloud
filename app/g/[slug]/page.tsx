import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { requireSession } from "@/lib/auth";
import { bytes, ago, stamp } from "@/lib/format";
import { Panel, Empty, Button } from "@/components/ui";
import SlotActions from "@/components/slot-actions";
import DangerZone from "@/components/danger-zone";

export const dynamic = "force-dynamic";

export default async function GamePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireSession();
  const { slug } = await params;

  const [game] = await db.execute<any>(sql`select * from games where slug = ${slug}`);
  if (!game) notFound();

  const slotRows = await db.execute<any>(sql`
    select s.id, s.slot, s.current_version as "currentVersion", s.updated_at as "updatedAt"
    from slots s where s.game_id = ${game.id} order by s.slot`);

  const snaps = await db.execute<any>(sql`
    select sn.id, sn.slot_id as "slotId", sn.version, sn.device, sn.total_size as "totalSize",
           sn.file_count as "fileCount", sn.pinned, sn.created_at as "createdAt",
           sn.playtime_seconds as "playtimeSeconds"
    from snapshots sn
    join slots s on s.id = sn.slot_id
    where s.game_id = ${game.id}
    order by sn.version desc`);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/games" className="text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]">← All games</Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">{game.name}</h1>
      <p className="text-sm text-[var(--color-muted)]">{game.slug}</p>

      {slotRows.length === 0 && (
        <div className="mt-6">
          <Empty title="No saves yet" hint="This game has no uploaded snapshots." />
        </div>
      )}

      {slotRows.map((slot: any) => {
        const versions = snaps.filter((s: any) => s.slotId === slot.id);
        return (
          <section key={slot.id} className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Slot {slot.slot} · current v{slot.currentVersion}
            </h2>
            <Panel className="mt-3 divide-y divide-[var(--color-line)]">
              {versions.map((v: any) => {
                const isCurrent = v.version === slot.currentVersion;
                return (
                  <div key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                    <span className="w-12 shrink-0 tabular-nums font-medium">v{v.version}</span>
                    {isCurrent && (
                      <span className="rounded-full border border-[var(--color-accent)]/40 px-2 py-0.5 text-xs text-[var(--color-accent)]">
                        current
                      </span>
                    )}
                    {v.pinned && (
                      <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
                        pinned
                      </span>
                    )}
                    <span className="tabular-nums">{bytes(Number(v.totalSize))}</span>
                    <span className="text-[var(--color-muted)]">{v.fileCount} files</span>
                    <span className="text-[var(--color-muted)]">{v.device ?? "—"}</span>
                    <span className="text-[var(--color-muted)]" title={new Date(v.createdAt).toISOString()}>
                      {ago(v.createdAt)} · {stamp(v.createdAt)}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <Link href={`/g/${slug}/v/${v.id}`}>
                        <Button variant="ghost">Files</Button>
                      </Link>
                      <SlotActions
                        slug={slug} slot={slot.slot} snapshotId={v.id}
                        version={v.version} pinned={v.pinned} isCurrent={isCurrent}
                      />
                    </div>
                  </div>
                );
              })}
            </Panel>
          </section>
        );
      })}

      <DangerZone slug={slug} name={game.name} />
    </main>
  );
}
