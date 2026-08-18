import { z } from "zod";

/** sha256 of the RAW (uncompressed) file bytes. */
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, "must be lowercase hex sha256");

/** One file inside a snapshot. `path` is relative to the game's save root, forward slashes. */
export const FileEntry = z.object({
  path: z.string().min(1).max(1024).refine((p) => !p.includes("\\") && !p.startsWith("/") && !p.split("/").includes(".."), {
    message: "path must be relative, forward-slashed, no ..",
  }),
  hash: Sha256,
  size: z.number().int().nonnegative(),
  /** how the bytes are encoded in R2; the hash always refers to the RAW bytes */
  codec: z.enum(["raw", "gzip", "zstd"]).default("raw"),
});
export type FileEntry = z.infer<typeof FileEntry>;

export const BlobsCheckReq = z.object({ hashes: z.array(Sha256).min(1).max(1000) });
export const BlobsCheckRes = z.object({ missing: z.array(Sha256) });

export const UploadUrlsReq = z.object({
  blobs: z.array(z.object({ hash: Sha256, size: z.number().int().nonnegative() })).min(1).max(200),
});
export const UploadUrlsRes = z.object({ urls: z.record(Sha256, z.string().url()), expiresIn: z.number() });

export const SnapshotReq = z.object({
  game: z.string().min(1).max(128),
  slot: z.number().int().min(0).default(0),
  /** version this client last synced from. 0 = first ever push. */
  baseVersion: z.number().int().nonnegative(),
  files: z.array(FileEntry).max(5000),
  device: z.string().max(64).optional(),
  playtimeSeconds: z.number().int().nonnegative().optional(),
  /** marks pre-launch / pre-restore safety snapshots — never auto-pruned */
  pinned: z.boolean().default(false),
});
export type SnapshotReq = z.infer<typeof SnapshotReq>;

export const SnapshotRes = z.object({ snapshotId: z.string(), version: z.number().int() });

export const ConflictRes = z.object({
  error: z.literal("conflict"),
  baseVersion: z.number().int(),
  currentVersion: z.number().int(),
  remote: z.object({
    version: z.number().int(),
    device: z.string().nullable(),
    createdAt: z.string(),
    totalSize: z.number(),
    playtimeSeconds: z.number().nullable(),
  }),
});

/** One value identifying folder contents: sha256 over the sorted "path:hash" list. */
export async function manifestHash(files: { path: string; hash: string }[]): Promise<string> {
  const line = files
    .map((f) => `${f.path}:${f.hash}`)
    .sort()
    .join("\n");
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(line).digest("hex");
}

export const DeviceStateReq = z.object({
  device: z.string().min(1).max(64),
  game: z.string().min(1).max(128),
  slot: z.number().int().min(0).default(0),
  syncedVersion: z.number().int().nonnegative(),
  localManifestHash: z.string().nullable(),
  localFileCount: z.number().int().nonnegative().nullable(),
  localSize: z.number().int().nonnegative().nullable(),
  localPath: z.string().nullable(),
});
