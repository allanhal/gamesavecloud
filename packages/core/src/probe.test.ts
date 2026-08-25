import test from "node:test";
import assert from "node:assert/strict";
import { age } from "./probe";

test("age keeps today's writes apart instead of calling them all 0d", () => {
  const min = 60_000;

  assert.equal(age(Date.now() - 20_000), "just now");
  assert.equal(age(Date.now() - 12 * min), "12m ago");
  assert.equal(age(Date.now() - 5 * 60 * min), "5h ago");
  assert.equal(age(Date.now() - 3 * 24 * 60 * min), "3d ago");
});
