import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findByAppId, findByName, getRecipe, recipes, addRecipeDir, reloadRecipes } from "./index";

test("loads the bundled json recipes", () => {
  assert.deepEqual(
    recipes().map((recipe) => recipe.id).sort(),
    ["detroit-become-human", "hyper-echelon", "snowrunner"],
  );
});

test("every bundled recipe names save paths for each platform it claims", () => {
  for (const recipe of recipes()) {
    for (const [platform, cfg] of Object.entries(recipe.platforms)) {
      assert.ok(cfg?.saves?.length, `${recipe.id}/${platform} has no saves`);
    }
  }
});

test("looks up recipes by stable id", () => {
  const recipe = getRecipe("snowrunner");

  assert.equal(recipe?.name, "SnowRunner");
  assert.equal(getRecipe("missing"), null);
});

test("finds recipes by platform app id", () => {
  assert.equal(findByAppId("steam", "1465360")?.id, "snowrunner");
  assert.equal(findByAppId("steam", "1222140")?.id, "detroit-become-human");
  assert.equal(findByAppId("epic", "1465360"), null);
});

test("finds recipes by loose display name", () => {
  assert.equal(findByName("Detroit Become Human")?.id, "detroit-become-human");
  assert.equal(findByName("detroit-become-human")?.id, "detroit-become-human");
  assert.equal(findByName("Unknown Game"), null);
});

test("picks up a json dropped in a user folder, and skips broken files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsc-recipes-"));
  fs.writeFileSync(path.join(dir, "my-game.json"), JSON.stringify({
    id: "my-game", name: "My Game", platforms: { steam: { appId: "999", saves: ["<home>/mine"] } },
  }));
  fs.writeFileSync(path.join(dir, "broken.json"), "{ not json");
  fs.writeFileSync(path.join(dir, "no-saves.json"), JSON.stringify({
    id: "no-saves", name: "No Saves", platforms: { steam: { appId: "1" } },
  }));

  addRecipeDir(dir);
  reloadRecipes();

  assert.equal(findByAppId("steam", "999")?.name, "My Game");
  assert.equal(getRecipe("broken"), null);
  assert.equal(getRecipe("no-saves"), null);
});

test("a user recipe overrides a bundled one with the same id", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gsc-recipes-"));
  fs.writeFileSync(path.join(dir, "snowrunner.json"), JSON.stringify({
    id: "snowrunner", name: "SnowRunner", platforms: { steam: { appId: "1465360", saves: ["<home>/custom"] } },
  }));

  addRecipeDir(dir);
  reloadRecipes();

  assert.deepEqual(getRecipe("snowrunner")?.platforms.steam?.saves, ["<home>/custom"]);
});
