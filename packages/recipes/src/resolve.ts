import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

export interface ResolveCtx {
  installDir?: string;
  steamUserId?: string;
  steamRoot?: string;
  appId?: string;
}

/**
 * Windows redirects Documents/Saved Games to OneDrive on many machines, so we
 * read the real location from the registry rather than assuming %USERPROFILE%.
 */
function shellFolder(name: "Personal" | "{4C5C32FF-BB9D-43b0-B5B4-2D72E54EAAA4}", fallback: string): string {
  if (process.platform !== "win32") return fallback;
  try {
    const out = execFileSync("reg", [
      "query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", name,
    ], { encoding: "utf8" });
    const m = out.match(/REG_(?:EXPAND_)?SZ\s+(.+)/);
    if (m) return m[1].trim().replace(/%([^%]+)%/g, (_m: string, v: string) => process.env[v] ?? "");
  } catch { /* registry unavailable — fall through */ }
  return fallback;
}

export function placeholders(ctx: ResolveCtx = {}): Record<string, string> {
  const home = os.homedir();
  return {
    home,
    winAppData: process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
    winLocalAppData: process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"),
    winLocalLow: path.join(home, "AppData", "LocalLow"),
    winDocuments: shellFolder("Personal", path.join(home, "Documents")),
    winSavedGames: shellFolder("{4C5C32FF-BB9D-43b0-B5B4-2D72E54EAAA4}", path.join(home, "Saved Games")),
    winPublic: process.env.PUBLIC ?? "C:\\Users\\Public",
    installDir: ctx.installDir ?? "",
    steamUserId: ctx.steamUserId ?? "",
  };
}

export function resolvePath(template: string, ctx: ResolveCtx = {}): string {
  const vars = placeholders(ctx);
  const out = template.replace(/<([a-zA-Z]+)>/g, (m, k) => vars[k] ?? m);
  return path.normalize(out);
}

/** A template is unusable when a placeholder it names has no value here. */
function resolvable(t: string, ctx: ResolveCtx): boolean {
  const vars = placeholders(ctx);
  return [...t.matchAll(/<(\w+)>/g)].every((m) => vars[m[1]]);
}

/**
 * Where a save would go if the game had written one yet: the candidate whose
 * parent directory already exists, most specific first. Restoring a cloud save
 * onto a machine that has never launched the game needs this — the folder does
 * not exist, but its parent (Documents, LocalLow…) does.
 */
export function plannedPath(templates: string[], ctx: ResolveCtx = {}): string | null {
  for (const t of templates) {
    if (!resolvable(t, ctx)) continue;
    const p = resolvePath(t, ctx);
    if (p && fs.existsSync(path.dirname(p))) return p;
  }
  // nothing anchored to an existing parent — fall back to the first usable one
  const first = templates.find((t) => resolvable(t, ctx));
  return first ? resolvePath(first, ctx) : null;
}

/** Returns the first template that actually exists on disk. */
export function firstExisting(templates: string[], ctx: ResolveCtx = {}): string | null {
  for (const t of templates) {
    if (t.includes("<") && !placeholders(ctx)[t.match(/<(\w+)>/)?.[1] ?? ""]) continue;
    const p = resolvePath(t, ctx);
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}
