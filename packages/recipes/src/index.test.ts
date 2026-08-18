import test from "node:test";
import assert from "node:assert/strict";
import { findByAppId, findByName, getRecipe, recipes } from "./index";

test("exports the initial known recipes", () => {
  assert.deepEqual(
    recipes.map((recipe) => recipe.id).sort(),
    ["detroit-become-human", "snowrunner"],
  );
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
