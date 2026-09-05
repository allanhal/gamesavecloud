import { z } from "zod";
import { Hono } from "hono";
import { eq, and, sql, inArray, desc, lte, isNotNull } from "drizzle-orm";
import { db, schema } from "./db/index";
import { presignPut, presignGet, blobExists, deleteBlob, PRESIGN_TTL } from "./r2";
import { BlobsCheckReq, UploadUrlsReq, SnapshotReq, DeviceStateReq, manifestHash } from "@gsc/shared";

const { games, slots, blobs, snapshots, snapshotFiles, devices, deviceSlotState } = schema;

export const app = new Hono().basePath("/api/v1");

/** Single-user install: one shared bearer token, constant-time compared. */
app.use("*", async (c, next) => {
  const expected = process.env.GAMESYNC_TOKEN;
  if (!expected) return c.json({ error: "server misconfigured: GAMESYNC_TOKEN unset" }, 500);
  const got = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got), b = Buffer.from(expected);
  const ok = a.length === b.length && (await import("node:crypto")).timingSafeEqual(a, b);
  if (!ok) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.get("/health", async (c) => {
  const [{ now }] = await db.execute<{ now: string }>(sql`select now() as now`);
  return c.json({ ok: true, db: now, bucket: process.env.R2_BUCKET });
});

/* ── blobs ─────────────────────────────────────────────────────────── */

/** Which of these hashes do we NOT have yet? Client uploads only those. */
app.post("/blobs/check", async (c) => {
  const { hashes } = BlobsCheckReq.parse(await c.req.json());
  const have = await db.select({ hash: blobs.hash }).from(blobs).where(inArray(blobs.hash, hashes));
  const set = new Set(have.map((r) => r.hash));
  return c.json({ missing: hashes.filter((h) => !set.has(h)) });
});

app.post("/blobs/upload-urls", async (c) => {
  const { blobs: want } = UploadUrlsReq.parse(await c.req.json());
  const urls: Record<string, string> = {};
  await Promise.all(want.map(async (b) => { urls[b.hash] = await presignPut(b.hash); }));
  return c.json({ urls, expiresIn: PRESIGN_TTL });
});

app.get("/blobs/:hash/url", async (c) => {
  const hash = c.req.param("hash");
  const [row] = await db.select().from(blobs).where(eq(blobs.hash, hash)).limit(1);
  if (!row) return c.json({ error: "unknown blob" }, 404);
  return c.json({ url: await presignGet(hash), size: row.size, expiresIn: PRESIGN_TTL });
});

/* ── games & slots ─────────────────────────────────────────────────── */

app.get("/games", async (c) => c.json({ games: await db.select().from(games).orderBy(games.name) }));

app.get("/games/:slug/slots", async (c) => {
  const g = await getGame(c.req.param("slug"));
  if (!g) return c.json({ error: "unknown game" }, 404);
  return c.json({ slots: await db.select().from(slots).where(eq(slots.gameId, g.id)) });
});

app.get("/games/:slug/slots/:slot/history", async (c) => {
  const g = await getGame(c.req.param("slug"));
  if (!g) return c.json({ error: "unknown game" }, 404);
  const [s] = await db.select().from(slots)
    .where(and(eq(slots.gameId, g.id), eq(slots.slot, Number(c.req.param("slot")))));
  if (!s) return c.json({ error: "unknown slot" }, 404);
  const rows = await db.select().from(snapshots).where(eq(snapshots.slotId, s.id))
    .orderBy(desc(snapshots.version)).limit(100);
  return c.json({ currentVersion: s.currentVersion, snapshots: rows });
});

/* ── snapshots ─────────────────────────────────────────────────────── */

/**
 * Commit a folder snapshot. Rejects with 409 if another device already pushed
 * past `baseVersion` — we never silently clobber a save.
 */
app.post("/snapshots", async (c) => {
  const body = SnapshotReq.parse(await c.req.json());

  // every referenced blob must actually be in R2 before we record a snapshot,
  // otherwise a crashed upload leaves a version that can't be restored
  const hashes = [...new Set(body.files.map((f) => f.hash))];
  const known = new Set(
    (await db.select({ hash: blobs.hash }).from(blobs).where(inArray(blobs.hash, hashes))).map((r) => r.hash),
  );
  const unknown = hashes.filter((h) => !known.has(h));
  const verified: { hash: string; size: number; compressedSize: number; codec: string }[] = [];
  for (const h of unknown) {
    const compressed = await blobExists(h);
    if (compressed === null) return c.json({ error: "blob not uploaded", hash: h }, 400);
    const f = body.files.find((x) => x.hash === h)!;
    verified.push({ hash: h, size: f.size, compressedSize: compressed, codec: f.codec });
  }

  return await db.transaction(async (tx) => {
    const g = (await getGame(body.game, tx)) ?? (await tx.insert(games)
      .values({ slug: body.game, name: body.game }).returning())[0];

    let [s] = await tx.select().from(slots)
      .where(and(eq(slots.gameId, g.id), eq(slots.slot, body.slot)))
      .for("update");
    if (!s) [s] = await tx.insert(slots).values({ gameId: g.id, slot: body.slot }).returning();

    if (body.baseVersion !== s.currentVersion) {
      const [remote] = await tx.select().from(snapshots)
        .where(and(eq(snapshots.slotId, s.id), eq(snapshots.version, s.currentVersion)));
      return c.json({
        error: "conflict",
        baseVersion: body.baseVersion,
        currentVersion: s.currentVersion,
        remote: remote && {
          version: remote.version, device: remote.device,
          createdAt: remote.createdAt, totalSize: remote.totalSize,
          playtimeSeconds: remote.playtimeSeconds,
        },
      }, 409);
    }

    if (verified.length) {
      await tx.insert(blobs).values(verified).onConflictDoNothing();
    }

    const version = s.currentVersion + 1;
    const [snap] = await tx.insert(snapshots).values({
      slotId: s.id, version, device: body.device, playtimeSeconds: body.playtimeSeconds,
      totalSize: body.files.reduce((n, f) => n + f.size, 0),
      fileCount: body.files.length, pinned: body.pinned,
      manifestHash: await manifestHash(body.files),
      // stamp the version with the save's real "last modified" time when the
      // client sends it, so history reads as when the game was last played
      ...(body.savedAt ? { createdAt: new Date(body.savedAt) } : {}),
    }).returning();

    if (body.files.length) {
      await tx.insert(snapshotFiles).values(
        body.files.map((f) => ({ snapshotId: snap.id, path: f.path, blobHash: f.hash, size: f.size })),
      );
      // one ref per distinct blob in this snapshot
      await tx.update(blobs)
        .set({ refCount: sql`${blobs.refCount} + 1`, unreferencedAt: null })
        .where(inArray(blobs.hash, hashes));
    }

    await tx.update(slots).set({ currentVersion: version, updatedAt: new Date() }).where(eq(slots.id, s.id));
    return c.json({ snapshotId: snap.id, version });
  });
});

/** Full manifest — what the client needs to reconstruct a folder. */
app.get("/snapshots/:id", async (c) => {
  const id = c.req.param("id");
  const [snap] = await db.select().from(snapshots).where(eq(snapshots.id, id)).limit(1);
  if (!snap) return c.json({ error: "unknown snapshot" }, 404);
  const files = await manifestFiles(id);
  return c.json({ ...snap, files });
});

/** Latest manifest for a slot — the common case for `gamesync sync`. */
app.get("/games/:slug/slots/:slot/latest", async (c) => {
  const g = await getGame(c.req.param("slug"));
  if (!g) return c.json({ error: "unknown game" }, 404);
  const [s] = await db.select().from(slots)
    .where(and(eq(slots.gameId, g.id), eq(slots.slot, Number(c.req.param("slot")))));
  if (!s || s.currentVersion === 0) return c.json({ version: 0, files: [] });
  const [snap] = await db.select().from(snapshots)
    .where(and(eq(snapshots.slotId, s.id), eq(snapshots.version, s.currentVersion)));
  const files = await manifestFiles(snap.id);
  return c.json({ ...snap, files });
});

/** Manifest rows carry the codec so the client knows how to decode each blob. */
async function manifestFiles(snapshotId: string) {
  return db.select({
    path: snapshotFiles.path, hash: snapshotFiles.blobHash,
    size: snapshotFiles.size, codec: blobs.codec,
  }).from(snapshotFiles)
    .innerJoin(blobs, eq(blobs.hash, snapshotFiles.blobHash))
    .where(eq(snapshotFiles.snapshotId, snapshotId));
}

async function getGame(slug: string, tx: any = db) {
  const [g] = await tx.select().from(games).where(eq(games.slug, slug)).limit(1);
  return g ?? null;
}

/* ── device state (lets the dashboard compare cloud vs local) ──────── */

app.post("/devices/state", async (c) => {
  const b = DeviceStateReq.parse(await c.req.json());
  const id = b.device.toLowerCase();

  await db.insert(devices).values({ id, name: b.device, lastSeenAt: new Date() })
    .onConflictDoUpdate({ target: devices.id, set: { name: b.device, lastSeenAt: new Date() } });

  const g = await getGame(b.game);
  if (!g) return c.json({ error: "unknown game" }, 404);
  let [s] = await db.select().from(slots).where(and(eq(slots.gameId, g.id), eq(slots.slot, b.slot)));
  if (!s) [s] = await db.insert(slots).values({ gameId: g.id, slot: b.slot }).returning();

  const row = {
    deviceId: id, slotId: s.id, syncedVersion: b.syncedVersion,
    localManifestHash: b.localManifestHash, localFileCount: b.localFileCount,
    localSize: b.localSize, localPath: b.localPath, scannedAt: new Date(),
  };
  await db.insert(deviceSlotState).values(row).onConflictDoUpdate({
    target: [deviceSlotState.deviceId, deviceSlotState.slotId],
    set: { ...row, deviceId: undefined as any, slotId: undefined as any },
  });
  return c.json({ ok: true });
});

/* ── dashboard aggregates ──────────────────────────────────────────── */

/** Everything the games list needs, in one round trip. */
app.get("/overview", async (c) => {
  const rows = await db.execute<any>(sql`
    select g.id, g.slug, g.name, g.created_at as "createdAt",
           s.id as "slotId", s.slot, s.current_version as "currentVersion", s.updated_at as "updatedAt",
           cur.total_size as "size", cur.file_count as "fileCount",
           cur.device as "lastDevice", cur.created_at as "lastSyncAt",
           cur.manifest_hash as "cloudManifestHash",
           (select count(*)::int from snapshots x where x.slot_id = s.id) as "versionCount"
    from games g
    left join slots s on s.game_id = g.id
    left join snapshots cur on cur.slot_id = s.id and cur.version = s.current_version
    order by g.name, s.slot
  `);

  const state = await db.execute<any>(sql`
    select d.id as "deviceId", d.name as "deviceName", d.last_seen_at as "lastSeenAt",
           st.slot_id as "slotId", st.synced_version as "syncedVersion",
           st.local_manifest_hash as "localManifestHash", st.local_size as "localSize",
           st.local_path as "localPath", st.scanned_at as "scannedAt"
    from device_slot_state st join devices d on d.id = st.device_id
  `);

  const byGame = new Map<string, any>();
  for (const r of rows) {
    if (!byGame.has(r.slug)) byGame.set(r.slug, { id: r.id, slug: r.slug, name: r.name, slots: [] });
    if (!r.slotId) continue;
    const dev = state.filter((s: any) => s.slotId === r.slotId).map((s: any) => ({
      ...s,
      status: deviceStatus(s, r),
    }));
    byGame.get(r.slug).slots.push({ ...r, devices: dev });
  }
  return c.json({ games: [...byGame.values()] });
});

/** Cloud-vs-local verdict for one device on one slot. */
function deviceStatus(s: any, slot: any): string {
  if (!s.localManifestHash) return "unknown";
  if (s.localManifestHash === slot.cloudManifestHash) return "in-sync";
  if (s.syncedVersion < slot.currentVersion) {
    return s.localManifestHash && s.syncedVersion < slot.currentVersion ? "conflict-or-behind" : "behind";
  }
  return "local-ahead";
}

/** Storage economics: what dedup is actually saving you. */
app.get("/stats", async (c) => {
  const [b] = await db.execute<any>(sql`
    select count(*)::int as "blobCount",
           coalesce(sum(size),0)::bigint as "uniqueBytes",
           coalesce(sum(coalesce(compressed_size, size)),0)::bigint as "storedBytes",
           count(*) filter (where ref_count = 0)::int as "unreferenced"
    from blobs`);
  const [l] = await db.execute<any>(sql`
    select coalesce(sum(size),0)::bigint as "logicalBytes", count(*)::int as "fileRefs"
    from snapshot_files`);
  const [n] = await db.execute<any>(sql`
    select count(*)::int as "snapshots", (select count(*)::int from games) as "games"
    from snapshots`);
  const stored = Number(b.storedBytes), logical = Number(l.logicalBytes);
  return c.json({
    ...b, ...l, ...n,
    uniqueBytes: Number(b.uniqueBytes), storedBytes: stored, logicalBytes: logical,
    dedupRatio: stored > 0 ? logical / stored : 1,
    quotaBytes: 10 * 1024 ** 3,
  });
});

/* ── management ────────────────────────────────────────────────────── */

app.post("/games", async (c) => {
  const { slug, name } = z.object({
    slug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/, "lowercase, digits and dashes only"),
    name: z.string().min(1).max(200),
  }).parse(await c.req.json());
  const [g] = await db.insert(games).values({ slug, name })
    .onConflictDoUpdate({ target: games.slug, set: { name } }).returning();
  return c.json(g);
});

app.post("/snapshots/:id/pin", async (c) => {
  const { pinned } = z.object({ pinned: z.boolean() }).parse(await c.req.json());
  const [r] = await db.update(snapshots).set({ pinned })
    .where(eq(snapshots.id, c.req.param("id"))).returning();
  return r ? c.json(r) : c.json({ error: "unknown snapshot" }, 404);
});

/** Delete one version. Blobs are only unlinked here; the GC job removes them later. */
app.delete("/snapshots/:id", async (c) => {
  const id = c.req.param("id");
  return await db.transaction(async (tx) => {
    const [snap] = await tx.select().from(snapshots).where(eq(snapshots.id, id));
    if (!snap) return c.json({ error: "unknown snapshot" }, 404);

    const [slot] = await tx.select().from(slots).where(eq(slots.id, snap.slotId));
    if (slot && slot.currentVersion === snap.version) {
      return c.json({ error: "refusing to delete the current version — roll back first" }, 409);
    }

    const files = await tx.select({ hash: snapshotFiles.blobHash }).from(snapshotFiles)
      .where(eq(snapshotFiles.snapshotId, id));
    const hashes = [...new Set(files.map((f) => f.hash))];
    await tx.delete(snapshots).where(eq(snapshots.id, id));
    if (hashes.length) {
      await tx.update(blobs)
        .set({ refCount: sql`greatest(${blobs.refCount} - 1, 0)` })
        .where(inArray(blobs.hash, hashes));
      await tx.update(blobs).set({ unreferencedAt: new Date() })
        .where(and(inArray(blobs.hash, hashes), eq(blobs.refCount, 0)));
    }
    return c.json({ deleted: id, unlinkedBlobs: hashes.length });
  });
});

/** Roll a slot back to an older version by re-committing it as a new version. */
app.post("/games/:slug/slots/:slot/rollback", async (c) => {
  const { version } = z.object({ version: z.number().int().positive() }).parse(await c.req.json());
  const g = await getGame(c.req.param("slug"));
  if (!g) return c.json({ error: "unknown game" }, 404);

  return await db.transaction(async (tx) => {
    const [s] = await tx.select().from(slots)
      .where(and(eq(slots.gameId, g.id), eq(slots.slot, Number(c.req.param("slot"))))).for("update");
    if (!s) return c.json({ error: "unknown slot" }, 404);

    const [target] = await tx.select().from(snapshots)
      .where(and(eq(snapshots.slotId, s.id), eq(snapshots.version, version)));
    if (!target) return c.json({ error: "unknown version" }, 404);

    const files = await tx.select().from(snapshotFiles).where(eq(snapshotFiles.snapshotId, target.id));
    const next = s.currentVersion + 1;
    const [snap] = await tx.insert(snapshots).values({
      slotId: s.id, version: next, device: `rollback-to-v${version}`,
      totalSize: target.totalSize, fileCount: target.fileCount,
      manifestHash: target.manifestHash, playtimeSeconds: target.playtimeSeconds, pinned: true,
    }).returning();

    if (files.length) {
      await tx.insert(snapshotFiles).values(
        files.map((f) => ({ snapshotId: snap.id, path: f.path, blobHash: f.blobHash, size: f.size })),
      );
      await tx.update(blobs).set({ refCount: sql`${blobs.refCount} + 1`, unreferencedAt: null })
        .where(inArray(blobs.hash, [...new Set(files.map((f) => f.blobHash))]));
    }
    await tx.update(slots).set({ currentVersion: next, updatedAt: new Date() }).where(eq(slots.id, s.id));
    return c.json({ snapshotId: snap.id, version: next, rolledBackTo: version });
  });
});

app.delete("/games/:slug", async (c) => {
  const g = await getGame(c.req.param("slug"));
  if (!g) return c.json({ error: "unknown game" }, 404);
  // cascade drops slots/snapshots/snapshot_files; blob refcounts are rebuilt by GC
  await db.delete(games).where(eq(games.id, g.id));
  await db.execute(sql`
    update blobs b set ref_count = coalesce(x.n, 0),
      unreferenced_at = case when coalesce(x.n,0) = 0 then now() else null end
    from (select b2.hash, count(sf.snapshot_id) as n from blobs b2
          left join snapshot_files sf on sf.blob_hash = b2.hash group by b2.hash) x
    where x.hash = b.hash`);
  return c.json({ deleted: g.slug });
});

/* ── retention + garbage collection ────────────────────────────────── */

const GC_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Prunes old versions, then deletes R2 objects for blobs nothing references.
 * The grace period means a blob freed by a race is still recoverable for a day.
 */
app.post("/gc", async (c) => {
  const force = c.req.query("force") === "1";
  const keepRecent = Number(c.req.query("keep") ?? 10);

  // 1. retention: keep N newest + 1 per day for 30d + everything pinned
  const pruned = await db.execute<any>(sql`
    with ranked as (
      select sn.id, sn.slot_id, sn.version, sn.pinned, sn.created_at, s.current_version,
             row_number() over (partition by sn.slot_id order by sn.version desc) as rn,
             row_number() over (partition by sn.slot_id, date(sn.created_at) order by sn.version desc) as daily_rn
      from snapshots sn join slots s on s.id = sn.slot_id
    )
    delete from snapshots
    where id in (
      select id from ranked
      where pinned = false
        and version <> current_version
        and rn > ${keepRecent}
        and not (daily_rn = 1 and created_at > now() - interval '30 days')
    )
    returning id`);

  // 2. recompute refcounts from the join table — self-healing, cheap at this scale
  await db.execute(sql`
    update blobs b set ref_count = coalesce(x.n, 0),
      unreferenced_at = case
        when coalesce(x.n,0) = 0 then coalesce(b.unreferenced_at, now())
        else null end
    from (select b2.hash, count(sf.snapshot_id) as n from blobs b2
          left join snapshot_files sf on sf.blob_hash = b2.hash group by b2.hash) x
    where x.hash = b.hash`);

  // 3. delete R2 objects only after the grace period
  const cutoff = new Date(Date.now() - (force ? 0 : GC_GRACE_MS));
  const dead = await db.select({ hash: blobs.hash, size: blobs.size }).from(blobs)
    .where(and(eq(blobs.refCount, 0), isNotNull(blobs.unreferencedAt), lte(blobs.unreferencedAt, cutoff)))
    .limit(500);

  let freed = 0;
  for (const b of dead) {
    try { await deleteBlob(b.hash); } catch { /* already gone in R2 — still drop the row */ }
    await db.delete(blobs).where(eq(blobs.hash, b.hash));
    freed += Number(b.size);
  }

  return c.json({
    prunedSnapshots: pruned.length,
    deletedBlobs: dead.length,
    freedBytes: freed,
    graceHours: force ? 0 : GC_GRACE_MS / 3600000,
  });
});

/** Removes every blob row+object not referenced by any snapshot, ignoring grace. */
app.post("/admin/purge-orphans", async (c) => {
  const orphans = await db.execute<any>(sql`
    select b.hash from blobs b
    left join snapshot_files sf on sf.blob_hash = b.hash
    where sf.snapshot_id is null`);
  for (const o of orphans) {
    try { await deleteBlob(o.hash); } catch { /* not in R2 */ }
    await db.delete(blobs).where(eq(blobs.hash, o.hash));
  }
  return c.json({ purged: orphans.length });
});
