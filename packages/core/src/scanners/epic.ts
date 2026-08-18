import fs from "node:fs";
import path from "node:path";

export interface EpicGame {
  appName: string;
  name: string;
  installDir: string;
  catalogItemId?: string;
}

const MANIFEST_DIRS = [
  "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests",
  path.join(process.env.PROGRAMDATA ?? "", "Epic", "EpicGamesLauncher", "Data", "Manifests"),
];

export function scanEpic(): { root: string | null; games: EpicGame[] } {
  const dir = MANIFEST_DIRS.find((d) => d && fs.existsSync(d));
  if (!dir) return { root: null, games: [] };

  const games: EpicGame[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".item"))) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (!m.DisplayName || !m.InstallLocation) continue;
      games.push({
        appName: m.AppName ?? m.MainGameAppName ?? m.DisplayName,
        name: m.DisplayName,
        installDir: m.InstallLocation,
        catalogItemId: m.CatalogItemId,
      });
    } catch { /* malformed manifest — skip */ }
  }
  return { root: dir, games: games.sort((a, b) => a.name.localeCompare(b.name)) };
}
