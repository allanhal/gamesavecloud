import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Recipe } from "./types";

/**
 * Recipes are plain .json files, one game per file, so a new game is a new file
 * and nothing has to be rebuilt. They are read from, in order:
 *
 *   1. the bundled `games` folder shipped with the app
 *   2. every folder passed to `addRecipeDir` (the app adds its data folder)
 *   3. $GSC_RECIPES_DIR, for one-off overrides
 *
 * Later folders win on a duplicate id, so a user file overrides a bundled one.
 */
/** __dirname when bundled to CJS, the module URL when run as ESM through tsx */
const here = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

/** src/ when running from source, dist/ when bundled — the copy sits beside both */
const builtinDirs = [path.join(here, "..", "games"), path.join(here, "games")];

const extraDirs: string[] = [];
let cache: Recipe[] | null = null;

/** Register another folder of .json recipes. Safe to call before or after a read. */
export function addRecipeDir(dir: string): void {
  if (!extraDirs.includes(dir)) { extraDirs.push(dir); cache = null; }
}

/** Drop the cache; the next lookup re-reads every folder from disk. */
export const reloadRecipes = () => { cache = null; };

export function recipeDirs(): string[] {
  const env = process.env.GSC_RECIPES_DIR;
  return [...builtinDirs, ...extraDirs, ...(env ? [env] : [])];
}

/** A recipe with no id, name or platforms cannot be matched against anything. */
function validate(r: any, file: string): Recipe | null {
  if (!r || typeof r.id !== "string" || typeof r.name !== "string") {
    console.warn(`recipe ${file}: needs a string "id" and "name" — skipped`);
    return null;
  }
  if (!r.platforms || typeof r.platforms !== "object") {
    console.warn(`recipe ${file}: needs a "platforms" object — skipped`);
    return null;
  }
  for (const [platform, cfg] of Object.entries<any>(r.platforms)) {
    if (!cfg || !Array.isArray(cfg.saves)) {
      console.warn(`recipe ${file}: platform "${platform}" needs a "saves" array — skipped`);
      return null;
    }
  }
  return r as Recipe;
}

function readDir(dir: string): Recipe[] {
  let names: string[];
  try { names = fs.readdirSync(dir); } catch { return []; }   // missing folder is normal
  const out: Recipe[] = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    const file = path.join(dir, name);
    try {
      const parsed = validate(JSON.parse(fs.readFileSync(file, "utf8")), file);
      if (parsed) out.push(parsed);
    } catch (e: any) {
      console.warn(`recipe ${file}: ${e.message} — skipped`);
    }
  }
  return out;
}

export function allRecipes(): Recipe[] {
  if (cache) return cache;
  const byId = new Map<string, Recipe>();
  for (const dir of recipeDirs()) for (const r of readDir(dir)) byId.set(r.id, r);
  cache = [...byId.values()];
  return cache;
}
