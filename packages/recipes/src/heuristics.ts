import fs from "node:fs";
import path from "node:path";
import { placeholders } from "./resolve";

export interface Guess {
  path: string;
  /** how much to trust this without the user confirming */
  confidence: "exact" | "high" | "medium";
  reason: string;
}

/**
 * Unity ships `<install>/<Something>_Data/app.info`: two lines, company then
 * product. That names the save folder exactly — this is a lookup, not a guess.
 */
export function unityGuess(installDir: string): Guess | null {
  let dataDir: string | undefined;
  try {
    dataDir = fs.readdirSync(installDir).find((d) => d.endsWith("_Data"));
  } catch { return null; }
  if (!dataDir) return null;

  const info = path.join(installDir, dataDir, "app.info");
  if (!fs.existsSync(info)) return null;

  const [company, product] = fs.readFileSync(info, "utf8").split(/\r?\n/);
  if (!company || !product) return null;

  const p = path.join(placeholders().winLocalLow, company.trim(), product.trim());
  return fs.existsSync(p)
    ? { path: p, confidence: "exact", reason: `Unity app.info → ${company.trim()}/${product.trim()}` }
    : null;
}

/**
 * Unreal projects save to %LOCALAPPDATA%/<Project>/Saved/SaveGames. The project
 * name comes from the shipped binary <install>/<Project>/Binaries/Win64/.
 */
export function unrealGuess(installDir: string): Guess | null {
  let project: string | undefined;
  try {
    project = fs.readdirSync(installDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !["Engine", "Binaries"].includes(d.name))
      .find((d) => fs.existsSync(path.join(installDir, d.name, "Binaries")))?.name;
  } catch { return null; }
  if (!project) return null;

  const p = path.join(placeholders().winLocalAppData, project, "Saved", "SaveGames");
  return fs.existsSync(p)
    ? { path: p, confidence: "high", reason: `Unreal project "${project}" → Saved/SaveGames` }
    : null;
}

/** Godot: %APPDATA%/Godot/app_userdata/<Project>. */
export function godotGuess(gameName: string): Guess | null {
  const p = path.join(placeholders().winAppData, "Godot", "app_userdata", gameName);
  return fs.existsSync(p) ? { path: p, confidence: "medium", reason: "Godot app_userdata" } : null;
}

/**
 * Steam Cloud games keep their synced files here. Path is exact and needs no
 * per-game knowledge — but Valve already syncs it, so it's a backup, not a fix.
 */
export function steamCloudGuess(steamRoot: string, steamUserId: string, appId: string): Guess | null {
  const p = path.join(steamRoot, "userdata", steamUserId, appId, "remote");
  return fs.existsSync(p)
    ? { path: p, confidence: "exact", reason: "Steam Cloud remote folder (Valve also syncs this)" }
    : null;
}

export function guessSaves(opts: {
  installDir?: string; gameName?: string;
  steamRoot?: string; steamUserId?: string; appId?: string;
}): Guess[] {
  const out: Guess[] = [];
  if (opts.installDir) {
    for (const g of [unityGuess(opts.installDir), unrealGuess(opts.installDir)]) if (g) out.push(g);
  }
  if (opts.gameName) { const g = godotGuess(opts.gameName); if (g) out.push(g); }
  if (opts.steamRoot && opts.steamUserId && opts.appId) {
    const g = steamCloudGuess(opts.steamRoot, opts.steamUserId, opts.appId); if (g) out.push(g);
  }
  return out;
}
