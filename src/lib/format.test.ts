import test from "node:test";
import assert from "node:assert/strict";
import { ago, bytes, stamp } from "./format";

test("bytes formats null and byte values", () => {
  assert.equal(bytes(null), "—");
  assert.equal(bytes(undefined), "—");
  assert.equal(bytes(0), "0 B");
  assert.equal(bytes(1023), "1023 B");
});

test("bytes formats larger units", () => {
  assert.equal(bytes(1024), "1.0 KB");
  assert.equal(bytes(10 * 1024), "10 KB");
  assert.equal(bytes(1536 * 1024), "1.5 MB");
  assert.equal(bytes(3 * 1024 ** 3), "3.0 GB");
});

test("ago formats recent relative times", () => {
  const originalNow = Date.now;
  Date.now = () => new Date("2026-08-18T12:00:00.000Z").getTime();

  try {
    assert.equal(ago(null), "never");
    assert.equal(ago("2026-08-18T11:59:45.000Z"), "just now");
    assert.equal(ago("2026-08-18T11:45:00.000Z"), "15m ago");
    assert.equal(ago("2026-08-18T09:00:00.000Z"), "3h ago");
    assert.equal(ago("2026-08-16T12:00:00.000Z"), "2d ago");
  } finally {
    Date.now = originalNow;
  }
});

test("stamp renders an absolute local timestamp, and nothing for null", () => {
  const s = stamp("2026-08-24T22:31:00.000Z");

  assert.equal(stamp(null), "");
  assert.match(s, /2026/);
  assert.notEqual(s, ago("2026-08-24T22:31:00.000Z"));
});
