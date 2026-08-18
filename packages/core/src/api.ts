import type { Config } from "./config";

export interface RemoteManifest {
  version: number;
  files: { path: string; hash: string; size: number }[];
  manifestHash?: string;
  device?: string | null;
  createdAt?: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: any) { super(message); }
}

export class Api {
  constructor(private cfg: Pick<Config, "server" | "token">) {}

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    const r = await fetch(`${this.cfg.server}/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    const json = text ? JSON.parse(text) : null;
    if (!r.ok) throw new ApiError(json?.error ?? `HTTP ${r.status}`, r.status, json);
    return json;
  }

  health = () => this.req("GET", "/health");
  games = () => this.req("GET", "/games");
  addGame = (slug: string, name: string) => this.req("POST", "/games", { slug, name });

  checkBlobs = (hashes: string[]): Promise<{ missing: string[] }> =>
    hashes.length ? this.req("POST", "/blobs/check", { hashes }) : Promise.resolve({ missing: [] });

  uploadUrls = (blobs: { hash: string; size: number }[]): Promise<{ urls: Record<string, string> }> =>
    this.req("POST", "/blobs/upload-urls", { blobs });

  downloadUrl = (hash: string): Promise<{ url: string; size: number }> =>
    this.req("GET", `/blobs/${hash}/url`);

  latest = (game: string, slot: number): Promise<RemoteManifest> =>
    this.req("GET", `/games/${encodeURIComponent(game)}/slots/${slot}/latest`);

  history = (game: string, slot: number) =>
    this.req("GET", `/games/${encodeURIComponent(game)}/slots/${slot}/history`);

  snapshot = (body: unknown) => this.req("POST", "/snapshots", body);
  snapshotById = (id: string): Promise<RemoteManifest> => this.req("GET", `/snapshots/${id}`);
  rollback = (game: string, slot: number, version: number) =>
    this.req("POST", `/games/${encodeURIComponent(game)}/slots/${slot}/rollback`, { version });

  reportState = (body: unknown) => this.req("POST", "/devices/state", body);
}
