"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and, sql, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { COOKIE, tokenMatches } from "@/lib/auth";

const { games, slots, snapshots, snapshotFiles, blobs } = schema;

export async function login(_prev: unknown, form: FormData) {
  const token = String(form.get("token") ?? "");
  if (!tokenMatches(token)) return { error: "Wrong token." };
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/games");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

export async function addGame(_prev: unknown, form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim().toLowerCase()
    || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!name || !slug) return { error: "Name is required." };
  await db.insert(games).values({ slug, name })
    .onConflictDoUpdate({ target: games.slug, set: { name } });
  revalidatePath("/");
  return { ok: true };
}

export async function deleteGame(slug: string) {
  await db.delete(games).where(eq(games.slug, slug));
  await recountBlobs();
  revalidatePath("/");
  redirect("/games");
}

export async function setPinned(snapshotId: string, pinned: boolean, slug: string) {
  await db.update(snapshots).set({ pinned }).where(eq(snapshots.id, snapshotId));
  revalidatePath(`/g/${slug}`);
}

export async function deleteSnapshot(snapshotId: string, slug: string) {
  const [snap] = await db.select().from(snapshots).where(eq(snapshots.id, snapshotId));
  if (!snap) return { error: "unknown snapshot" };
  const [slot] = await db.select().from(slots).where(eq(slots.id, snap.slotId));
  if (slot?.currentVersion === snap.version) {
    return { error: "That is the current version — roll back to another version first." };
  }
  await db.delete(snapshots).where(eq(snapshots.id, snapshotId));
  await recountBlobs();
  revalidatePath(`/g/${slug}`);
  return { ok: true };
}

/** Rollback re-commits an old manifest as a NEW version, so nothing is ever lost. */
export async function rollback(slug: string, slot: number, version: number) {
  await db.transaction(async (tx) => {
    const [g] = await tx.select().from(games).where(eq(games.slug, slug));
    if (!g) throw new Error("unknown game");
    const [s] = await tx.select().from(slots)
      .where(and(eq(slots.gameId, g.id), eq(slots.slot, slot))).for("update");
    if (!s) throw new Error("unknown slot");
    const [target] = await tx.select().from(snapshots)
      .where(and(eq(snapshots.slotId, s.id), eq(snapshots.version, version)));
    if (!target) throw new Error("unknown version");

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
  });
  revalidatePath(`/g/${slug}`);
}

/** Recompute refcounts from the join table — cheap at our scale, and self-healing. */
async function recountBlobs() {
  await db.execute(sql`
    update blobs b set ref_count = coalesce(x.n, 0),
      unreferenced_at = case when coalesce(x.n,0) = 0 then now() else null end
    from (select b2.hash, count(sf.snapshot_id) as n from blobs b2
          left join snapshot_files sf on sf.blob_hash = b2.hash group by b2.hash) x
    where x.hash = b.hash`);
}
