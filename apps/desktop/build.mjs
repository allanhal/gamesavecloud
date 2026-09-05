import esbuild from "esbuild";
import fs from "node:fs";

// import.meta is meaningless in CJS; the code only reads it on the ESM path
const common = {
  bundle: true, platform: "node", target: "node20", sourcemap: true, logLevel: "info",
  define: { "import.meta.url": "__filename" },
};

// main + preload run in Node; electron itself stays external
await esbuild.build({
  ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs",
  format: "cjs", external: ["electron"],
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
fs.copyFileSync("src/renderer/splash.html", "dist/splash.html");

// recipes stay loose .json beside the bundle so new games need no rebuild
const recipeSrc = "../../packages/recipes/games";
fs.rmSync("dist/games", { recursive: true, force: true });
fs.cpSync(recipeSrc, "dist/games", { recursive: true });
console.log(`copied ${fs.readdirSync("dist/games").length} recipes`);
console.log("desktop build complete");
