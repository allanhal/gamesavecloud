import test from "node:test";
import assert from "node:assert/strict";
import { PRESIGN_TTL, blobKey } from "./r2";

test("blobKey fans hashes out under two levels of prefixes", () => {
  const hash = "abcdef123456";

  assert.equal(blobKey(hash), "blobs/ab/cd/abcdef123456");
});

test("presigned URLs expire after ten minutes", () => {
  assert.equal(PRESIGN_TTL, 600);
});
