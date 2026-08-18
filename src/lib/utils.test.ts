import test from "node:test";
import assert from "node:assert/strict";
import { cn } from "./utils";

test("cn joins conditional class names", () => {
  assert.equal(cn("base", false && "hidden", null, "active"), "base active");
});

test("cn resolves conflicting tailwind classes", () => {
  assert.equal(cn("px-2 py-1", "px-4"), "py-1 px-4");
});
