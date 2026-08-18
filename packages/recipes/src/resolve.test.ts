import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { firstExisting, placeholders, resolvePath } from "./resolve";

test("placeholders include explicit resolve context values", () => {
  const values = placeholders({
    installDir: "/games/SnowRunner",
    steamUserId: "12345",
  });

  assert.equal(values.installDir, "/games/SnowRunner");
  assert.equal(values.steamUserId, "12345");
});

test("resolvePath replaces known placeholders and leaves unknown placeholders intact", () => {
  const resolved = resolvePath("<installDir>/profiles/<steamUserId>/<unknown>", {
    installDir: "/games/SnowRunner",
    steamUserId: "12345",
  });

  assert.equal(resolved, path.normalize("/games/SnowRunner/profiles/12345/<unknown>"));
});

test("firstExisting returns the first resolved path that exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsc-recipes-"));
  const missing = path.join(root, "missing");
  const existing = path.join(root, "existing");
  fs.mkdirSync(existing);

  assert.equal(
    firstExisting(["<installDir>/missing", "<installDir>/existing"], { installDir: root }),
    existing,
  );
  assert.equal(firstExisting([missing]), null);
});

test("firstExisting skips templates with missing context placeholders", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gsc-recipes-"));
  const existing = path.join(root, "existing");
  fs.mkdirSync(existing);

  assert.equal(firstExisting(["<installDir>/anything", existing]), existing);
});
