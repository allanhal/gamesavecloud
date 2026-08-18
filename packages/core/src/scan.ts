import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export interface ScannedFile { path: string; hash: string; size: number; mtimeMs: number; }

const DEFAULT_EXCLUDE = ["**/*.log", "**/*.tmp", "**/Thumbs.db", "**/desktop.ini"];

/** Tiny glob matcher — enough for the `**\/*.ext` and `dir/**` patterns recipes use. */
function matches(rel: string, pattern: string): boolean {
  const rx = new RegExp(
    "^" + pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*\//g, "(?:.*/)?")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*")
      .replace(/\?/g, "[^/]") + "$",
    "i",
  );
  return rx.test(rel);
}

export function sha256File(abs: string): string {
  const h = createHash("sha256");
  const fd = fs.openSync(abs, "r");
  try {
    const buf = Buffer.alloc(1 << 20);
    let n: number;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return h.digest("hex");
}

/**
 * Walks a save folder and hashes every file. Paths are returned relative and
 * forward-slashed so the same save maps to the same key on any machine.
 */
export function scanDir(root: string, opts: { include?: string[]; exclude?: string[] } = {}): ScannedFile[] {
  const exclude = [...DEFAULT_EXCLUDE, ...(opts.exclude ?? [])];
  const out: ScannedFile[] = [];

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      if (!e.isFile()) continue;

      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (exclude.some((p) => matches(rel, p))) continue;
      if (opts.include?.length && !opts.include.some((p) => matches(rel, p))) continue;

      let st: fs.Stats;
      try { st = fs.statSync(abs); } catch { continue; }
      out.push({ path: rel, hash: sha256File(abs), size: st.size, mtimeMs: st.mtimeMs });
    }
  };

  if (!fs.existsSync(root)) return [];
  walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** One value identifying folder contents — same formula the server uses. */
export function manifestHashSync(files: { path: string; hash: string }[]): string {
  const line = files.map((f) => `${f.path}:${f.hash}`).sort().join("\n");
  return createHash("sha256").update(line).digest("hex");
}
