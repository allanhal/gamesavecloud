import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

process.env.DATABASE_URL ??= "postgres://user:password@localhost:5432/gamesavecloud_test";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("login page renders the token form", async () => {
  const { default: LoginPage } = await import("./page");
  const html = renderToStaticMarkup(<LoginPage />);

  assert.match(html, /gamesavecloud/);
  assert.match(html, /name="token"/);
  assert.match(html, /type="password"/);
  assert.match(html, /Sign in/);
});
