import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseVdf } from "./vdf";

export interface SteamGame {
  appId: string;
  name: string;
  installDir: string;
  libraryRoot: string;
}

/** Registry first (handles non-default installs), then the usual suspects. */
export function findSteamRoot(): string | null {
  if (process.platform === "win32") {
    for (const key of ["HKCU\\Software\\Valve\\Steam", "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam"]) {
      try {
        const out = execFileSync("reg", ["query", key, "/v", key.startsWith("HKCU") ? "SteamPath" : "InstallPath"], { encoding: "utf8" });
        const m = out.match(/REG_SZ\s+(.+)/);
        if (m) { const p = m[1].trim(); if (fs.existsSync(p)) return p; }
      } catch { /* key absent */ }
    }
  }
  const guesses = [
    "C:\\Program Files (x86)\\Steam",
    "C:\\Program Files\\Steam",
    path.join(process.env.HOME ?? "", "Library/Application Support/Steam"),
    path.join(process.env.HOME ?? "", ".steam/steam"),
    path.join(process.env.HOME ?? "", ".local/share/Steam"),
  ];
  return guesses.find((g) => g && fs.existsSync(g)) ?? null;
}

/**
 * Dedupe key for a folder. The registry hands back "c:/program files
 * (x86)/steam" while libraryfolders.vdf says "C:\\Program Files (x86)\\Steam" —
 * the same directory in two spellings, which used to scan every game twice.
 */
export function pathKey(p: string): string {
  // a drive letter or a backslash means Windows rules, whatever we run on
  const windows = process.platform === "win32" || /^[a-zA-Z]:|\\\\/.test(p);
  const norm = (windows ? path.win32 : path.posix).normalize(p).replace(/[\\/]+$/, "");
  return windows ? norm.toLowerCase() : norm;
}

export function steamLibraries(steamRoot: string): string[] {
  const vdf = path.join(steamRoot, "steamapps", "libraryfolders.vdf");
  const roots = new Map<string, string>([[pathKey(steamRoot), steamRoot]]);
  try {
    const parsed = parseVdf(fs.readFileSync(vdf, "utf8"));
    const lf = parsed.libraryfolders ?? parsed.LibraryFolders ?? {};
    for (const v of Object.values<any>(lf)) {
      const p = typeof v === "string" ? v : v?.path;
      if (p && fs.existsSync(p) && !roots.has(pathKey(p))) roots.set(pathKey(p), p);
    }
  } catch { /* single-library install */ }
  return [...roots.values()];
}

/** Steam user ids that have local data — used for Steam Cloud remote folders. */
export function steamUserIds(steamRoot: string): string[] {
  try {
    return fs.readdirSync(path.join(steamRoot, "userdata"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== "0" && /^\d+$/.test(d.name))
      .map((d) => d.name);
  } catch { return []; }
}

export function scanSteam(): { root: string | null; games: SteamGame[]; userIds: string[] } {
  const root = findSteamRoot();
  if (!root) return { root: null, games: [], userIds: [] };

  // by appId: a game can also be listed by two libraries after a move
  const byId = new Map<string, SteamGame>();
  for (const lib of steamLibraries(root)) {
    const dir = path.join(lib, "steamapps");
    let files: string[];
    try { files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }

    for (const f of files) {
      try {
        const st = parseVdf(fs.readFileSync(path.join(dir, f), "utf8")).AppState;
        if (!st?.appid || !st?.name) continue;
        // Steamworks redistributables and runtimes are not games
        if (/^(Steamworks|Proton|Steam Linux Runtime)/i.test(st.name)) continue;
        const appId = String(st.appid);
        if (byId.has(appId)) continue;
        byId.set(appId, {
          appId, name: st.name,
          installDir: path.join(dir, "common", st.installdir ?? st.name),
          libraryRoot: lib,
        });
      } catch { /* corrupt manifest — skip */ }
    }
  }
  const games = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { root, games, userIds: steamUserIds(root) };
}
