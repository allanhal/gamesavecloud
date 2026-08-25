import fs from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * One command per release: bump, verify, push. CI does the rest — it builds on
 * a Windows runner and publishes to R2 (which is what /download reads) plus a
 * GitHub Release, because the version in apps/desktop/package.json changed.
 *
 * Usage: pnpm ship [patch|minor|major|<version>] [--notes "..."] [--dry]
 */
const PKG = "apps/desktop/package.json";
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const notesIdx = args.indexOf("--notes");
const notes = notesIdx > -1 ? args[notesIdx + 1] : null;
const bump = args.find((a) => !a.startsWith("--") && a !== notes) ?? "patch";

const run = (cmd: string, argv: string[]) =>
  execFileSync(cmd, argv, { stdio: "inherit", encoding: "utf8" });
const read = (cmd: string, argv: string[]) =>
  execFileSync(cmd, argv, { encoding: "utf8" }).trim();

if (read("git", ["status", "--porcelain"])) {
  console.error("Working tree is dirty — commit or stash first.");
  process.exit(1);
}
const branch = read("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") {
  console.error(`On ${branch}; releases publish from main.`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
const [maj, min, pat] = pkg.version.split(".").map(Number);
const next = /^\d+\.\d+\.\d+$/.test(bump) ? bump
  : bump === "major" ? `${maj + 1}.0.0`
  : bump === "minor" ? `${maj}.${min + 1}.0`
  : bump === "patch" ? `${maj}.${min}.${pat + 1}`
  : null;
if (!next) { console.error(`Unknown bump "${bump}" — use patch, minor, major or a version.`); process.exit(1); }
console.log(`${pkg.version} → ${next}`);

// verify before touching anything, so a failure leaves the tree clean
run("pnpm", ["test"]);
run("pnpm", ["exec", "tsc", "--noEmit", "-p", "tsconfig.json"]);

if (dry) { console.log("--dry: nothing written"); process.exit(0); }

pkg.version = next;
fs.writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);

/** An "## Unreleased" heading becomes this version; otherwise add a stub. */
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync("CHANGELOG.md", changelog.includes("## Unreleased")
  ? changelog.replace("## Unreleased", `## ${next} — ${date}`)
  : changelog.replace("# Changelog\n", `# Changelog\n\n## ${next} — ${date}\n\n${notes ?? "Portable Windows build."}\n`));

run("git", ["add", PKG, "CHANGELOG.md"]);
run("git", ["commit", "-m", `chore: release ${next}${notes ? `\n\n${notes}` : ""}`]);
run("git", ["push", "origin", "main"]);

console.log(`\npushed ${next} — CI builds on Windows, then publishes:`);
console.log("  https://gamesavecloud.vercel.app/download   (public)");
console.log(`  gh release view desktop-v${next}            (archive, private repo)`);
console.log("\nwatch it:  pnpm ship:watch");
