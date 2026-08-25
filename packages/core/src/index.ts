export * from "./config";
export * from "./scan";
export * from "./codec";
export * from "./api";
export * from "./sync";
export * from "./detect";
export * from "./launch";
export * from "./scanners/steam";
export * from "./scanners/epic";
export * from "./probe";
// recipe files (.json) — loading, extra folders, cache reset
export { addRecipeDir, reloadRecipes, recipeDirs, allRecipes, getRecipe, recipes } from "@gsc/recipes";
export type { Recipe, Platform, PlatformConfig } from "@gsc/recipes";

