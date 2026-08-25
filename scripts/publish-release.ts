import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import postgres from "postgres";

/**
 * Uploads the built portable artifacts to R2 and records them so /download can
 * list them. The app ships portable only — there is no installer and no update
 * feed; a new version is a new download.
 * Usage: pnpm release [version] [--notes "..."]
 */
const RELEASE_DIR = path.join(process.cwd(), "apps/desktop/release");
const pkg = JSON.parse(fs.readFileSync("apps/desktop/package.json", "utf8"));
const version = process.argv[2]?.startsWith("-") ? pkg.version : (process.argv[2] ?? pkg.version);
const notesIdx = process.argv.indexOf("--notes");
const notes = notesIdx > -1 ? process.argv[notesIdx + 1] : null;

/** Artifacts built in CI are downloaded here, so the host OS must be stated. */
const builtOn = process.env.GSC_BUILT_ON ?? process.platform;

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });

/** portable = self-extracting exe, zip = extract-and-run */
function classify(f: string): { kind: "portable" | "zip"; arch: string } | null {
  let m = f.match(/-(x64|arm64)-portable\.exe$/);
  if (m) return { kind: "portable", arch: m[1] };
  m = f.match(/-(x64|arm64)-portable\.zip$/) ?? f.match(/-(x64|arm64)\.zip$/);
  if (m) return { kind: "zip", arch: m[1] };
  return null;
}

// the release dir keeps older builds, so match the version being published
const all = fs.readdirSync(RELEASE_DIR);
const files = all.filter((f) => classify(f) !== null && f.includes(`-${version}-`));

if (!files.length) {
  console.error(`No v${version} artifacts in ${RELEASE_DIR}. Run: pnpm desktop:dist`);
  process.exit(1);
}

for (const filename of files) {
  const abs = path.join(RELEASE_DIR, filename);
  const size = fs.statSync(abs).size;
  const { kind, arch } = classify(filename)!;

  const hash = createHash("sha256");
  await new Promise<void>((res, rej) =>
    fs.createReadStream(abs).on("data", (d) => hash.update(d)).on("end", () => res()).on("error", rej));
  const sha256 = hash.digest("hex");

  const key = `releases/${version}/${filename}`;
  process.stdout.write(`↑ ${filename} (${kind}, ${(size / 1e6).toFixed(0)} MB) `);

  await new Upload({
    client: s3,
    params: {
      Bucket: process.env.R2_BUCKET!, Key: key, Body: fs.createReadStream(abs),
      ContentType: kind === "zip" ? "application/zip" : "application/vnd.microsoft.portable-executable",
      ContentDisposition: `attachment; filename="${filename}"`,
    },
    queueSize: 4, partSize: 8 * 1024 * 1024,
  }).done();

  await sql`
    insert into releases (version, platform, arch, kind, built_on, filename, key, size, sha256, notes)
    values (${version}, 'win', ${arch}, ${kind}, ${builtOn}, ${filename}, ${key}, ${size}, ${sha256}, ${notes})
    on conflict (version, platform, arch, kind) do update set
      filename = excluded.filename, key = excluded.key, size = excluded.size,
      sha256 = excluded.sha256, notes = excluded.notes, built_on = excluded.built_on,
      created_at = now()`;

  console.log(`✓ ${sha256.slice(0, 12)}…`);
}

await sql.end();
console.log(`\npublished v${version} (built on ${builtOn}) — https://gamesavecloud.vercel.app/download`);
