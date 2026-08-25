import fs from "node:fs";
import { findByAppId, findByName, firstExisting, resolvePath, plannedPath, guessSaves, type Recipe, type Platform } from "@gsc/recipes";
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
  /** every recipe path that was checked and missed — the answer to "why not?" */
  tried?: string[];
  /** where the save would live if the game had written one — restore target */
  plannedPath?: string | null;
  /** Valve already syncs this one; ours is a versioned backup on top */
  steamCloud?: boolean;
}

/** The named platform's save list first, then every other platform's, deduped. */
function platformSaves(recipe: Recipe, first: Platform): string[][] {
  const order: Platform[] = [first, "steam", "epic", "gog", "xbox", "manual"];
  const seen = new Set<Platform>();
  const out: string[][] = [];
  for (const p of order) {
    if (seen.has(p)) continue;
    seen.add(p);
    const saves = recipe.platforms[p]?.saves;
    if (saves?.length) out.push(saves);
  }
  return out;
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

    const tried: string[] = [];
    let planned: string | null = null;
    if (recipe) {
      const ctx = { installDir: g.installDir, steamUserId: userId, appId: g.appId };
      for (const saves of platformSaves(recipe, "steam")) {
        savePath = firstExisting(saves, ctx);
        if (savePath) break;
        tried.push(...saves.map((t) => resolvePath(t, ctx)));
      }
      if (savePath) { tier = "recipe"; reason = `recipe: ${recipe.id}`; }
      else {
        reason = `recipe ${recipe.id} matched, but none of its folders exist yet`;
        planned = plannedPath(platformSaves(recipe, "steam")[0] ?? [], ctx);
      }
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
      tried: tried.length ? [...new Set(tried)] : undefined,
      plannedPath: planned,
    });
  }

  for (const g of epic.games) {
    // Epic manifests carry an AppName, so try that before falling back to the title
    const recipe = findByAppId("epic", g.appName) ?? findByName(g.name);
    let savePath: string | null = null;
    let tier: MatchTier = "none";
    let reason = "no recipe — pick the folder manually";
    const tried: string[] = [];
    let planned: string | null = null;

    if (recipe) {
      // a recipe written for Steam usually names the same folders, so try every
      // platform block rather than only the epic one
      const ctx = { installDir: g.installDir };
      for (const saves of platformSaves(recipe, "epic")) {
        savePath = firstExisting(saves, ctx);
        if (savePath) break;
        tried.push(...saves.map((t) => resolvePath(t, ctx)));
      }
      if (savePath) { tier = "recipe"; reason = `recipe: ${recipe.id}`; }
      else {
        reason = `recipe ${recipe.id} matched, but none of its folders exist yet`;
        planned = plannedPath(platformSaves(recipe, "epic")[0] ?? [], ctx);
      }
    }
    if (!savePath) {
      const guesses = guessSaves({ installDir: g.installDir, gameName: g.name });
      if (guesses.length) { savePath = guesses[0].path; tier = "engine"; reason = guesses[0].reason; }
    }

    out.push({
      id: recipe?.id ?? slugify(g.name), name: g.name, source: "epic",
      // AppName is what com.epicgames.launcher://apps/<id> needs to launch
      appId: g.appName, installDir: g.installDir, savePath, tier, reason,
      tried: tried.length ? [...new Set(tried)] : undefined,
      plannedPath: planned,
    });
  }

  // last line of defence: one card per game per store, whatever the scanners saw
  const seen = new Set<string>();
  const games = out.filter((g) => {
    const key = `${g.source}:${g.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { steamRoot: steam.root, epicRoot: epic.root, games };
}

export function toGameConfig(d: DetectedGame): GameConfig | null {
  if (!d.savePath || !fs.existsSync(d.savePath)) return null;
  return {
    id: d.id, name: d.name, path: d.savePath, slot: 0,
    enabled: true, source: d.source, appId: d.appId, installDir: d.installDir,
  };
}
