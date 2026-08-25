import type { Recipe, Platform } from "./types";
import { allRecipes } from "./load";

export * from "./types";
export * from "./resolve";
export * from "./heuristics";
export * from "./load";

/** Every recipe currently on disk. Add a game by dropping a .json in a recipe folder. */
export const recipes = (): Recipe[] => allRecipes();

export const getRecipe = (id: string) => allRecipes().find((r) => r.id === id) ?? null;

export function findByAppId(platform: Platform, appId: string): Recipe | null {
  return allRecipes().find((r) => r.platforms[platform]?.appId === appId) ?? null;
}

/** Loose name match, for when we only have a display name from a launcher. */
export function findByName(name: string): Recipe | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const n = norm(name);
  return allRecipes().find((r) => norm(r.name) === n || r.id === n) ?? null;
}
