import fs from "node:fs";
import path from "node:path";
import { Api, type RemoteManifest } from "./api";
import { createHash } from "node:crypto";
import { scanDir, manifestHashSync, type ScannedFile } from "./scan";
import { encode, decode, pickCodec, type Codec } from "./codec";
import { configDir, loadState, saveState, stateKey, type Config, type GameConfig } from "./config";

export type SyncStatus =
  | "in-sync" | "pushed" | "pulled" | "conflict"
  | "no-local-folder" | "up-to-date-empty";

export interface SyncResult {
  game: string;
  status: SyncStatus;
  localVersion: number;
  remoteVersion: number;
  uploaded?: number;
  uploadedBytes?: number;
  downloaded?: number;
  detail?: string;
  conflict?: { local: { files: number; size: number }; remote: RemoteManifest };
}

/**
 * Transfers are reported as counts and bytes, not only a filename: a save can be
 * hundreds of files, and a bare name says nothing about how far along it is.
 * Rate and ETA are left to the caller, which knows the wall clock.
 */
export interface SyncProgress {
  phase: "checking" | "backup" | "uploading" | "downloading" | "finalizing";
  message: string;
  file?: string;
  /** files finished / files in this transfer */
  done?: number;
  total?: number;
  /** bytes moved / bytes to move, over the wire (so after compression) */
  bytesDone?: number;
  bytesTotal?: number;
}

export interface SyncOptions {
  /** on conflict, force one side instead of stopping */
  resolve?: "local" | "remote";
  /** mark the resulting snapshot as pinned (pre-launch safety copy) */
  pinned?: boolean;
  onProgress?: (p: SyncProgress) => void;
}

export async function syncGame(
  cfg: Config, game: GameConfig, opts: SyncOptions = {},
): Promise<SyncResult> {
  const api = new Api(cfg);
  const emit = opts.onProgress ?? (() => {});
  const log = (message: string, phase: SyncProgress["phase"] = "checking") => emit({ phase, message });
  const key = stateKey(game.id, game.slot);
  const state = loadState();
  const prev = state[key] ?? { syncedVersion: 0, syncedManifestHash: "", syncedAt: "" };

  const remote = await api.latest(game.id, game.slot);
  const remoteHash = remote.files.length ? manifestHashSync(remote.files) : "";

  if (!fs.existsSync(game.path)) {
    if (remote.version > 0) {
      log(`local folder missing — restoring v${remote.version}`);
      await pull(api, game, remote, emit);
      commitState(state, key, remote.version, remoteHash);
      await report(api, cfg, game, remote.version, remoteHash, remote);
      return { game: game.id, status: "pulled", localVersion: remote.version, remoteVersion: remote.version, downloaded: remote.files.length };
    }
    return { game: game.id, status: "no-local-folder", localVersion: 0, remoteVersion: 0 };
  }

  const local = scanDir(game.path, { include: game.include, exclude: game.exclude });
  const localHash = local.length ? manifestHashSync(local) : "";
  const localSize = local.reduce((n, f) => n + f.size, 0);

  if (local.length === 0 && remote.version === 0) {
    return { game: game.id, status: "up-to-date-empty", localVersion: 0, remoteVersion: 0 };
  }

  if (localHash === remoteHash && remote.version > 0) {
    commitState(state, key, remote.version, remoteHash);
    await report(api, cfg, game, remote.version, localHash, remote, local);
    return { game: game.id, status: "in-sync", localVersion: remote.version, remoteVersion: remote.version };
  }

  const localChanged = localHash !== prev.syncedManifestHash;
  const remoteChanged = remote.version !== prev.syncedVersion;

  if (localChanged && remoteChanged && opts.resolve !== "local" && opts.resolve !== "remote") {
    return {
      game: game.id, status: "conflict",
      localVersion: prev.syncedVersion, remoteVersion: remote.version,
      conflict: { local: { files: local.length, size: localSize }, remote },
    };
  }

  const wantPull = opts.resolve === "remote" || (!localChanged && remoteChanged);
  if (wantPull) {
    log(`pulling v${remote.version} (${remote.files.length} files)`);
    await pull(api, game, remote, emit);
    commitState(state, key, remote.version, remoteHash);
    await report(api, cfg, game, remote.version, remoteHash, remote);
    return { game: game.id, status: "pulled", localVersion: remote.version, remoteVersion: remote.version, downloaded: remote.files.length };
  }

  // push — baseVersion tells the server what we believe the cloud is at
  const base = opts.resolve === "local" ? remote.version : prev.syncedVersion;
  const up = await push(api, game, local, base, cfg.device, opts.pinned ?? false, emit);
  commitState(state, key, up.version, localHash);
  await report(api, cfg, game, up.version, localHash, remote, local);
  return {
    game: game.id, status: "pushed",
    localVersion: up.version, remoteVersion: up.version,
    uploaded: up.uploaded, uploadedBytes: up.uploadedBytes,
  };
}

/* ── push ──────────────────────────────────────────────────────────── */

async function push(
  api: Api, game: GameConfig, local: ScannedFile[], baseVersion: number,
  device: string, pinned: boolean, emit: (p: SyncProgress) => void,
) {
  const entries = local.map((f) => ({
    path: f.path, hash: f.hash, size: f.size, codec: pickCodec(f.path, f.size) as Codec,
  }));

  const uniq = [...new Map(entries.map((e) => [e.hash, e])).values()];
  const { missing } = await api.checkBlobs(uniq.map((e) => e.hash));
  emit({ phase: "checking", message: `${uniq.length} unique blobs, ${missing.length} to upload` });

  let uploadedBytes = 0;
  if (missing.length) {
    const need = uniq.filter((e) => missing.includes(e.hash));
    const { urls } = await api.uploadUrls(need.map((e) => ({ hash: e.hash, size: e.size })));
    // sizes are pre-compression, so the total is an upper bound — good enough for a bar
    const bytesTotal = need.reduce((n, e) => n + e.size, 0);
    let done = 0;

    // modest concurrency: enough to saturate a home uplink, not enough to stall it
    await pool(need, 4, async (e) => {
      const abs = path.join(game.path, e.path);
      const raw = fs.readFileSync(abs);
      const body = encode(raw, e.codec);
      const r = await fetch(urls[e.hash], { method: "PUT", body: new Uint8Array(body) });
      if (!r.ok) throw new Error(`upload failed for ${e.path}: HTTP ${r.status}`);
      uploadedBytes += body.length;
      done++;
      emit({
        phase: "uploading", message: `↑ ${e.path}`, file: e.path,
        done, total: need.length, bytesDone: uploadedBytes, bytesTotal,
      });
    });
  }

  emit({ phase: "finalizing", message: "writing the snapshot" });
  const res = await api.snapshot({
    game: game.id, slot: game.slot, baseVersion, files: entries, device, pinned,
  });
  return { version: res.version as number, uploaded: missing.length, uploadedBytes };
}

/* ── pull ──────────────────────────────────────────────────────────── */

async function pull(api: Api, game: GameConfig, remote: RemoteManifest, emit: (p: SyncProgress) => void) {
  backupLocal(game, emit);
  fs.mkdirSync(game.path, { recursive: true });

  const bytesTotal = remote.files.reduce((n: number, f: any) => n + Number(f.size ?? 0), 0);
  let bytesDone = 0;
  let done = 0;

  await pool(remote.files, 4, async (f: any) => {
    const abs = path.join(game.path, f.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const { url } = await api.downloadUrl(f.hash);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download failed for ${f.path}: HTTP ${r.status}`);
    const raw = decode(Buffer.from(await r.arrayBuffer()), (f.codec ?? "raw") as Codec);

    // the hash is over the RAW bytes, so this catches a wrong codec, a truncated
    // download, or a corrupted blob before it ever touches the real save file
    const got = createHash("sha256").update(raw).digest("hex");
    if (got !== f.hash) {
      throw new Error(
        `integrity check failed for ${f.path}: expected ${f.hash.slice(0, 12)}, got ${got.slice(0, 12)} ` +
        `(codec=${f.codec ?? "raw"}, ${raw.length} bytes) — refusing to write`,
      );
    }

    // write to a temp file then rename, so a crash never leaves a half-written save
    const tmp = `${abs}.gsc-tmp`;
    fs.writeFileSync(tmp, raw);
    fs.renameSync(tmp, abs);
    bytesDone += raw.length;
    done++;
    emit({
      phase: "downloading", message: `↓ ${f.path}`, file: f.path,
      done, total: remote.files.length, bytesDone, bytesTotal,
    });
  });

  emit({ phase: "finalizing", message: "tidying up files the snapshot does not have" });

  // remove local files the snapshot doesn't contain, so the folder matches exactly
  const keep = new Set(remote.files.map((f) => f.path));
  for (const f of scanDir(game.path, { include: game.include, exclude: game.exclude })) {
    if (!keep.has(f.path)) fs.rmSync(path.join(game.path, f.path), { force: true });
  }
}

/** Never overwrite a save without keeping a copy on disk first. */
function backupLocal(game: GameConfig, emit: (p: SyncProgress) => void) {
  if (!fs.existsSync(game.path)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(configDir(), "backups", game.id, stamp);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(game.path, dest, { recursive: true });
  emit({ phase: "backup", message: `local backup → ${dest}` });
}

/* ── helpers ───────────────────────────────────────────────────────── */

function commitState(state: any, key: string, version: number, hash: string) {
  state[key] = { syncedVersion: version, syncedManifestHash: hash, syncedAt: new Date().toISOString() };
  saveState(state);
}

/** Tell the server what this PC holds, so the web dashboard can compare. */
async function report(
  api: Api, cfg: Config, game: GameConfig, version: number, localHash: string,
  _remote: RemoteManifest, local?: ScannedFile[],
) {
  try {
    await api.reportState({
      device: cfg.device, game: game.id, slot: game.slot,
      syncedVersion: version, localManifestHash: localHash || null,
      localFileCount: local?.length ?? null,
      localSize: local ? local.reduce((n, f) => n + f.size, 0) : null,
      localPath: game.path,
    });
  } catch { /* reporting is best-effort — never fail a sync over it */ }
}

async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}
