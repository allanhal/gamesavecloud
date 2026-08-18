import type { Recipe, Platform } from "./types";
import snowrunner from "./games/snowrunner";
import detroit from "./games/detroit-become-human";

export * from "./types";
export * from "./resolve";
export * from "./heuristics";

/** Add one line here per new recipe. */
export const recipes: Recipe[] = [snowrunner, detroit];

const byId = new Map(recipes.map((r) => [r.id, r]));
export const getRecipe = (id: string) => byId.get(id) ?? null;

export function findByAppId(platform: Platform, appId: string): Recipe | null {
  return recipes.find((r) => r.platforms[platform]?.appId === appId) ?? null;
}

/** Loose name match, for when we only have a display name from a launcher. */
export function findByName(name: string): Recipe | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const n = norm(name);
  return recipes.find((r) => norm(r.name) === n || r.id === n) ?? null;
}
