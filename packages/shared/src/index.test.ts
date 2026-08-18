import test from "node:test";
import assert from "node:assert/strict";
import { DeviceStateReq, FileEntry, Sha256, SnapshotReq, UploadUrlsReq, manifestHash } from "./index";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

test("Sha256 accepts lowercase hashes and rejects invalid values", () => {
  assert.equal(Sha256.safeParse(hashA).success, true);
  assert.equal(Sha256.safeParse("A".repeat(64)).success, false);
  assert.equal(Sha256.safeParse("abc").success, false);
});

test("FileEntry only accepts relative forward-slashed paths", () => {
  assert.equal(FileEntry.safeParse({ path: "profile/save.dat", hash: hashA, size: 12 }).success, true);
  assert.equal(FileEntry.safeParse({ path: "/profile/save.dat", hash: hashA, size: 12 }).success, false);
  assert.equal(FileEntry.safeParse({ path: "profile\\save.dat", hash: hashA, size: 12 }).success, false);
  assert.equal(FileEntry.safeParse({ path: "profile/../save.dat", hash: hashA, size: 12 }).success, false);
});

test("manifestHash is stable regardless of file order", async () => {
  const first = await manifestHash([
    { path: "b.sav", hash: hashB },
    { path: "a.sav", hash: hashA },
  ]);
  const second = await manifestHash([
    { path: "a.sav", hash: hashA },
    { path: "b.sav", hash: hashB },
  ]);

  assert.equal(first, second);
});

test("SnapshotReq applies safe defaults", () => {
  const parsed = SnapshotReq.parse({
    game: "snowrunner",
    baseVersion: 0,
    files: [],
  });

  assert.equal(parsed.slot, 0);
  assert.equal(parsed.pinned, false);
});

test("UploadUrlsReq enforces upload batch limits", () => {
  assert.equal(UploadUrlsReq.safeParse({ blobs: [] }).success, false);
  assert.equal(
    UploadUrlsReq.safeParse({
      blobs: [{ hash: hashA, size: 0 }],
    }).success,
    true,
  );
});

test("DeviceStateReq normalizes default slot but keeps nullable local fields", () => {
  const parsed = DeviceStateReq.parse({
    device: "Desktop",
    game: "snowrunner",
    syncedVersion: 3,
    localManifestHash: null,
    localFileCount: null,
    localSize: null,
    localPath: null,
  });

  assert.equal(parsed.slot, 0);
  assert.equal(parsed.localManifestHash, null);
});
