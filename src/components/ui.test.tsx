import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Empty, Panel, Stat, StatusPill } from "./ui";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test("Button renders default and danger variants", () => {
  const defaultHtml = renderToStaticMarkup(<Button>Save</Button>);
  const dangerHtml = renderToStaticMarkup(<Button variant="danger">Delete</Button>);

  assert.match(defaultHtml, /bg-\[var\(--color-accent\)\]/);
  assert.match(defaultHtml, />Save<\/button>/);
  assert.match(dangerHtml, /text-\[var\(--color-danger\)\]/);
});

test("StatusPill renders known statuses and falls back to unknown", () => {
  assert.match(renderToStaticMarkup(<StatusPill status="in-sync" />), />In sync<\/span>/);
  assert.match(renderToStaticMarkup(<StatusPill status="not-real" />), />Not scanned<\/span>/);
});

test("Panel, Stat, and Empty render their expected content", () => {
  assert.match(renderToStaticMarkup(<Panel>Content</Panel>), />Content<\/div>/);
  assert.match(renderToStaticMarkup(<Stat label="Games" value="2" sub="tracked" />), /Games/);
  assert.match(renderToStaticMarkup(<Stat label="Games" value="2" sub="tracked" />), /tracked/);
  assert.match(renderToStaticMarkup(<Empty title="No games yet" hint="Run scan" />), /No games yet/);
});
