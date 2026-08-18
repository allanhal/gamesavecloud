import fs from "node:fs";
import { findByAppId, findByName, firstExisting, guessSaves } from "@gsc/recipes";
import { scanSteam } from "./scanners/steam";
import { scanEpic } from "./scanners/epic";
import type { GameConfig } from "./config";

export type MatchTier = "recipe" | "steam-cloud" | "engine" | "none";

export interface DetectedGame {
  id: string;
  name: string;
  source: "steam" | "epic";
  appId?: string;
  installDir: string;
  savePath: string | null;
  tier: MatchTier;
  reason: string;
  /** Valve already syncs this one; ours is a versioned backup on top */
  steamCloud?: boolean;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Detection is two independent problems: finding installed games (fully
 * solvable from launcher manifests) and finding their save folders (needs a
 * recipe, an engine heuristic, or the user). Tier says which one answered.
 */
export function detectGames(): { steamRoot: string | null; epicRoot: string | null; games: DetectedGame[] } {
  const steam = scanSteam();
  const epic = scanEpic();
  const out: DetectedGame[] = [];
  const userId = steam.userIds[0];

  for (const g of steam.games) {
    const recipe = findByAppId("steam", g.appId) ?? findByName(g.name);
    let savePath: string | null = null;
    let tier: MatchTier = "none";
    let reason = "no recipe — pick the folder manually";

    if (recipe?.platforms.steam?.saves) {
      savePath = firstExisting(recipe.platforms.steam.saves, { installDir: g.installDir, steamUserId: userId });
      if (savePath) { tier = "recipe"; reason = `recipe: ${recipe.id}`; }
    }
    if (!savePath) {
      const guesses = guessSaves({
        installDir: g.installDir, gameName: g.name,
        steamRoot: steam.root ?? undefined, steamUserId: userId, appId: g.appId,
      });
      if (guesses.length) {
        savePath = guesses[0].path;
        tier = guesses[0].reason.includes("Steam Cloud") ? "steam-cloud" : "engine";
        reason = guesses[0].reason;
      }
    }

    out.push({
      id: recipe?.id ?? slugify(g.name), name: g.name, source: "steam",
      appId: g.appId, installDir: g.installDir, savePath, tier, reason,
      steamCloud: tier === "steam-cloud",
    });
  }

  for (const g of epic.games) {
    const recipe = findByName(g.name);
    let savePath: string | null = null;
    let tier: MatchTier = "none";
    let reason = "no recipe — pick the folder manually";

    if (recipe?.platforms.epic?.saves) {
      savePath = firstExisting(recipe.platforms.epic.saves, { installDir: g.installDir });
      if (savePath) { tier = "recipe"; reason = `recipe: ${recipe.id}`; }
    }
    if (!savePath) {
      const guesses = guessSaves({ installDir: g.installDir, gameName: g.name });
      if (guesses.length) { savePath = guesses[0].path; tier = "engine"; reason = guesses[0].reason; }
    }

    if (out.some((o) => o.id === (recipe?.id ?? slugify(g.name)))) continue;  // already found via Steam
    out.push({
      id: recipe?.id ?? slugify(g.name), name: g.name, source: "epic",
      // AppName is what com.epicgames.launcher://apps/<id> needs to launch
      appId: g.appName, installDir: g.installDir, savePath, tier, reason,
    });
  }

  return { steamRoot: steam.root, epicRoot: epic.root, games: out };
}

export function toGameConfig(d: DetectedGame): GameConfig | null {
  if (!d.savePath || !fs.existsSync(d.savePath)) return null;
  return {
    id: d.id, name: d.name, path: d.savePath, slot: 0,
    enabled: true, source: d.source, appId: d.appId, installDir: d.installDir,
  };
}
