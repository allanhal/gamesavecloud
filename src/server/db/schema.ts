import { pgTable, text, integer, bigint, boolean, timestamp, uuid, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";

/** A game. Single-user install, so no owner column. */
export const games = pgTable("games", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("games_slug_idx").on(t.slug)]);

/** A save slot within a game. Holds the authoritative current version. */
export const slots = pgTable("slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id").notNull().references(() => games.id, { onDelete: "cascade" }),
  slot: integer("slot").notNull().default(0),
  currentVersion: integer("current_version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("slots_game_slot_idx").on(t.gameId, t.slot)]);

/**
 * Content-addressed blob. `hash` is sha256 of the RAW bytes; R2 stores the
 * zstd-compressed form at blobs/<aa>/<bb>/<hash>. refCount drives GC.
 */
export const blobs = pgTable("blobs", {
  hash: text("hash").primaryKey(),
  size: bigint("size", { mode: "number" }).notNull(),
  compressedSize: bigint("compressed_size", { mode: "number" }),
  /** how the bytes are encoded in R2: raw | gzip | zstd. Client decides, server records. */
  codec: text("codec").notNull().default("raw"),
  refCount: integer("ref_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** set when refCount hits 0; GC deletes from R2 only after the grace period */
  unreferencedAt: timestamp("unreferenced_at", { withTimezone: true }),
}, (t) => [index("blobs_unreferenced_idx").on(t.unreferencedAt)]);

/** An atomic point-in-time manifest of a whole save folder. */
export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  slotId: uuid("slot_id").notNull().references(() => slots.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  device: text("device"),
  playtimeSeconds: integer("playtime_seconds"),
  totalSize: bigint("total_size", { mode: "number" }).notNull(),
  fileCount: integer("file_count").notNull(),
  /** sha256 over the sorted "path:hash" list — one value that identifies folder contents */
  manifestHash: text("manifest_hash").notNull().default(""),
  /** pre-launch / pre-restore safety snapshots: never auto-pruned */
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("snapshots_slot_version_idx").on(t.slotId, t.version)]);

/** Files belonging to a snapshot. Many snapshots share the same blob rows. */
export const snapshotFiles = pgTable("snapshot_files", {
  snapshotId: uuid("snapshot_id").notNull().references(() => snapshots.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  blobHash: text("blob_hash").notNull().references(() => blobs.hash),
  size: bigint("size", { mode: "number" }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.snapshotId, t.path] }),
  index("snapshot_files_blob_idx").on(t.blobHash),
]);

/** A PC that syncs. Lets the dashboard say "Laptop is 2 versions behind". */
export const devices = pgTable("devices", {
  id: text("id").primaryKey(),           // hostname, lowercased
  name: text("name").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What a device last saw on its own disk for a slot. Written by `gamesync scan`
 * so the web dashboard can compare cloud vs local without disk access.
 */
export const deviceSlotState = pgTable("device_slot_state", {
  deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
  slotId: uuid("slot_id").notNull().references(() => slots.id, { onDelete: "cascade" }),
  /** cloud version this device last successfully synced to */
  syncedVersion: integer("synced_version").notNull().default(0),
  /** manifest hash of what is on that device's disk right now */
  localManifestHash: text("local_manifest_hash"),
  localFileCount: integer("local_file_count"),
  localSize: bigint("local_size", { mode: "number" }),
  localPath: text("local_path"),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.deviceId, t.slotId] })]);

/** Published desktop builds, served from R2 so the repo stays small. */
export const releases = pgTable("releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull(),
  platform: text("platform").notNull().default("win"),
  arch: text("arch").notNull(),
  filename: text("filename").notNull(),
  /** R2 object key */
  key: text("key").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("releases_version_arch_idx").on(t.version, t.platform, t.arch)]);
