import test from "node:test";
import assert from "node:assert/strict";
import { pathKey } from "./steam";

test("pathKey treats the registry and vdf spellings of one folder as equal", () => {
  // the registry answers with this, libraryfolders.vdf with the other
  assert.equal(
    pathKey("c:/program files (x86)/steam"),
    pathKey("C:\\Program Files (x86)\\Steam"),
  );
});

test("pathKey ignores a trailing separator and redundant segments", () => {
  assert.equal(pathKey("D:\\Games\\"), pathKey("D:\\Games"));
  assert.equal(pathKey("D:\\Games\\SteamLibrary\\..\\SteamLibrary"), pathKey("D:/Games/SteamLibrary"));
});

test("pathKey keeps distinct libraries apart", () => {
  assert.notEqual(pathKey("C:\\Steam"), pathKey("D:\\Steam"));
});
