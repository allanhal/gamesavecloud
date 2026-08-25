import test from "node:test";
import assert from "node:assert/strict";
import { foldProgress, rateOf, etaOf } from "./progress";

test("a first event without a phase does not read the missing entry", () => {
  // this threw and blanked the window: undefined === undefined read state[game]
  const next = foldProgress({}, { game: "snowrunner", message: "syncing…" }, 1000);

  assert.equal(next.snowrunner.startedAt, 1000);
  assert.equal(next.snowrunner.startBytes, 0);
});

test("staying in one phase keeps the original start, so the rate is over the phase", () => {
  let s = foldProgress({}, { game: "g", phase: "uploading", bytesDone: 100 }, 1000);
  s = foldProgress(s, { game: "g", phase: "uploading", bytesDone: 600 }, 3000);

  assert.equal(s.g.startedAt, 1000);
  assert.equal(s.g.startBytes, 100);
  assert.equal(rateOf(s.g), 250);   // 500 bytes over 2s
});

test("changing phase restarts the measurement", () => {
  let s = foldProgress({}, { game: "g", phase: "uploading", bytesDone: 900 }, 1000);
  s = foldProgress(s, { game: "g", phase: "downloading", bytesDone: 10 }, 5000);

  assert.equal(s.g.startedAt, 5000);
  assert.equal(s.g.startBytes, 10);
});

test("eta needs a rate and something left to move", () => {
  const start = foldProgress({}, { game: "g", phase: "uploading", bytesDone: 0, bytesTotal: 1000 }, 1000);
  assert.equal(etaOf(start.g), null);

  const later = foldProgress(start, { game: "g", phase: "uploading", bytesDone: 500, bytesTotal: 1000 }, 3000);
  assert.equal(etaOf(later.g), 2);   // 500 left at 250 B/s
});
