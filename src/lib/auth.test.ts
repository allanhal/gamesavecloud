import test from "node:test";
import assert from "node:assert/strict";
import { tokenMatches } from "./auth";

test("tokenMatches rejects when server token is unset", () => {
  const previous = process.env.GAMESYNC_TOKEN;
  delete process.env.GAMESYNC_TOKEN;

  try {
    assert.equal(tokenMatches("candidate"), false);
  } finally {
    process.env.GAMESYNC_TOKEN = previous;
  }
});

test("tokenMatches accepts exact matches and rejects mismatches", () => {
  const previous = process.env.GAMESYNC_TOKEN;
  process.env.GAMESYNC_TOKEN = "secret-token";

  try {
    assert.equal(tokenMatches("secret-token"), true);
    assert.equal(tokenMatches("wrong-token"), false);
    assert.equal(tokenMatches("secret-token-longer"), false);
  } finally {
    process.env.GAMESYNC_TOKEN = previous;
  }
});
