import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://user:password@localhost:5432/gamesavecloud_test";
process.env.R2_ENDPOINT ??= "http://localhost";
process.env.R2_ACCESS_KEY_ID ??= "test";
process.env.R2_SECRET_ACCESS_KEY ??= "test";
process.env.R2_BUCKET ??= "test";

const { app } = await import("./app");

test("API rejects requests when the bearer token is not configured", async () => {
  const previous = process.env.GAMESYNC_TOKEN;
  delete process.env.GAMESYNC_TOKEN;

  try {
    const res = await app.request("/api/v1/health");

    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "server misconfigured: GAMESYNC_TOKEN unset" });
  } finally {
    process.env.GAMESYNC_TOKEN = previous;
  }
});

test("API rejects missing or incorrect bearer tokens before route handlers run", async () => {
  const previous = process.env.GAMESYNC_TOKEN;
  process.env.GAMESYNC_TOKEN = "server-secret";

  try {
    const missing = await app.request("/api/v1/health");
    const wrong = await app.request("/api/v1/health", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    assert.equal(missing.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(await wrong.json(), { error: "unauthorized" });
  } finally {
    process.env.GAMESYNC_TOKEN = previous;
  }
});
