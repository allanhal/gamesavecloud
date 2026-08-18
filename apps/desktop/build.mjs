import esbuild from "esbuild";
import fs from "node:fs";

const common = { bundle: true, platform: "node", target: "node20", sourcemap: true, logLevel: "info" };

// main + preload run in Node; electron itself stays external
await esbuild.build({
  ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs",
  format: "cjs", external: ["electron", "electron-updater"],
});
await esbuild.build({
  ...common, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs",
  format: "cjs", external: ["electron"],
});
// renderer is a normal browser bundle
await esbuild.build({
  bundle: true, entryPoints: ["src/renderer/index.tsx"], outfile: "dist/renderer.js",
  platform: "browser", target: "chrome120", format: "iife", sourcemap: true,
  minify: true, define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "css" }, logLevel: "info",
});
fs.copyFileSync("src/renderer/index.html", "dist/index.html");
console.log("desktop build complete");
