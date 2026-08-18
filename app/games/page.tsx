import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { requireSession } from "@/lib/auth";
import { bytes, ago } from "@/lib/format";
import { Panel, Stat, StatusPill, Empty, Button } from "@/components/ui";
import { logout } from "../actions";
import AddGame from "@/components/add-game";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  await requireSession();

  const rows = await db.execute<any>(sql`
    select g.slug, g.name,
           s.id as "slotId", s.slot, s.current_version as "currentVersion", s.updated_at as "updatedAt",
           cur.total_size as "size", cur.file_count as "fileCount",
           cur.device as "lastDevice", cur.created_at as "lastSyncAt", cur.manifest_hash as "cloudHash",
           (select count(*)::int from snapshots x where x.slot_id = s.id) as "versionCount"
    from games g
    left join slots s on s.game_id = g.id
    left join snapshots cur on cur.slot_id = s.id and cur.version = s.current_version
    order by g.name, s.slot`);

  const devs = await db.execute<any>(sql`
    select st.slot_id as "slotId", d.name as "deviceName", st.synced_version as "syncedVersion",
           st.local_manifest_hash as "localHash", st.local_size as "localSize",
           st.local_path as "localPath", st.scanned_at as "scannedAt"
    from device_slot_state st join devices d on d.id = st.device_id`);

  const [stats] = await db.execute<any>(sql`
    select (select count(*)::int from games) as games,
           (select count(*)::int from snapshots) as snapshots,
           (select coalesce(sum(coalesce(compressed_size, size)),0)::bigint from blobs) as stored,
           (select coalesce(sum(size),0)::bigint from snapshot_files) as logical`);

  const stored = Number(stats.stored), logical = Number(stats.logical);
  const games = new Map<string, any>();
  for (const r of rows) {
    if (!games.has(r.slug)) games.set(r.slug, { slug: r.slug, name: r.name, slots: [] });
    if (r.slotId) games.get(r.slug).slots.push(r);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">gamesavecloud</h1>
          <p className="text-sm text-[var(--color-muted)]">Self-hosted cloud saves</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/download"><Button variant="ghost">Get the app</Button></Link>
          <form action={logout}><Button variant="ghost">Sign out</Button></form>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Games" value={String(stats.games)} />
        <Stat label="Versions" value={String(stats.snapshots)} />
        <Stat label="Stored in R2" value={bytes(stored)} sub="of 10 GB free tier" />
        <Stat
          label="Dedup saving"
          value={stored > 0 ? `${(logical / stored).toFixed(1)}×` : "—"}
          sub={`${bytes(logical)} logical`}
        />
      </section>

      <section className="relative mt-8 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted)]">Games</h2>
        <AddGame />
      </section>

      <div className="mt-3 space-y-3">
        {games.size === 0 && (
          <Empty title="No games yet" hint="Install the desktop app and scan, or add a game manually above." />
        )}
        {[...games.values()].map((g) => (
          <Panel key={g.slug} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link href={`/g/${g.slug}`} className="font-medium hover:text-[var(--color-accent)]">
                  {g.name}
                </Link>
                <div className="mt-0.5 text-xs text-[var(--color-muted)]">{g.slug}</div>
              </div>
              <Link href={`/g/${g.slug}`}><Button variant="ghost">Manage</Button></Link>
            </div>

            {g.slots.length === 0 && (
              <p className="mt-3 text-sm text-[var(--color-muted)]">No saves uploaded yet.</p>
            )}

            {g.slots.map((s: any) => {
              const mine = devs.filter((d: any) => d.slotId === s.slotId);
              return (
                <div key={s.slotId} className="mt-3 border-t border-[var(--color-line)] pt-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="text-[var(--color-muted)]">Slot {s.slot}</span>
                    <span className="tabular-nums">v{s.currentVersion}</span>
                    <span className="text-[var(--color-muted)]">{s.versionCount} versions</span>
                    <span className="tabular-nums">{bytes(Number(s.size))}</span>
                    <span className="text-[var(--color-muted)]">
                      {s.lastDevice ?? "—"} · {ago(s.lastSyncAt)}
                    </span>
                  </div>

                  {mine.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {mine.map((d: any) => (
                        <div key={d.deviceName} className="flex flex-wrap items-center gap-2 text-xs">
                          <StatusPill
                            status={
                              !d.localHash ? "unknown"
                                : d.localHash === s.cloudHash ? "in-sync"
                                : d.syncedVersion < s.currentVersion ? "conflict-or-behind"
                                : "local-ahead"
                            }
                          />
                          <span className="font-medium">{d.deviceName}</span>
                          <span className="text-[var(--color-muted)]">
                            synced v{d.syncedVersion} · local {bytes(Number(d.localSize))} · {ago(d.scannedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Panel>
        ))}
      </div>
    </main>
  );
}
