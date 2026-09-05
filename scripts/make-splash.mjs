// Writes apps/desktop/src/renderer/splash.html with the logo inlined, so the
// splash window is a single self-contained file. Run: node scripts/make-splash.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require("sharp");
} catch {
  const hit = fs.readdirSync("node_modules/.pnpm").find((d) => d.startsWith("sharp@"));
  sharp = require(path.resolve(`node_modules/.pnpm/${hit}/node_modules/sharp`));
}

const svg = fs.readFileSync("scripts/make-icon.mjs", "utf8").match(/const svg = `([\s\S]*?)`;/)[1];
const logo = (await sharp(Buffer.from(svg)).resize(96, 96).png().toBuffer()).toString("base64");

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body {
    background: #14161c; color: #e8eaed;
    font-family: system-ui, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; user-select: none; -webkit-user-select: none;
    border: 1px solid rgba(255,255,255,.08); border-radius: 12px; box-sizing: border-box;
  }
  img { width: 72px; height: 72px; }
  .name { font-size: 16px; font-weight: 600; letter-spacing: .2px; }
  .msg { font-size: 12px; color: #9aa0a6; }
  .bar { width: 140px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.08); overflow: hidden; margin-top: 2px; }
  .bar > i { display: block; width: 40%; height: 100%; background: #4f79e6; border-radius: 2px; animation: slide 1.1s ease-in-out infinite; }
  @keyframes slide { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
</style>
</head>
<body>
  <img src="data:image/png;base64,${logo}" alt="" />
  <div class="name">gamesavecloud</div>
  <div class="msg">Starting up — loading your library…</div>
  <div class="bar"><i></i></div>
</body>
</html>
`;

const out = "apps/desktop/src/renderer/splash.html";
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB)`);
