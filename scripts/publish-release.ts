import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import postgres from "postgres";

/**
 * Uploads built installers to R2 and records them so /download can list them.
 * Usage: pnpm release [version] [--notes "..."]
 */
const RELEASE_DIR = path.join(process.cwd(), "apps/desktop/release");
const pkg = JSON.parse(fs.readFileSync("apps/desktop/package.json", "utf8"));
const version = process.argv[2]?.startsWith("-") ? pkg.version : (process.argv[2] ?? pkg.version);
const notesIdx = process.argv.indexOf("--notes");
const notes = notesIdx > -1 ? process.argv[notesIdx + 1] : null;

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1 });

const files = fs.readdirSync(RELEASE_DIR)
  .filter((f) => f.endsWith(".exe"))
  // skip the combined multi-arch installer; per-arch downloads are half the size
  .filter((f) => /-(x64|arm64)-setup\.exe$/.test(f));

if (!files.length) {
  console.error(`No per-arch installers in ${RELEASE_DIR}. Run: pnpm desktop:dist`);
  process.exit(1);
}

for (const filename of files) {
  const abs = path.join(RELEASE_DIR, filename);
  const size = fs.statSync(abs).size;
  const arch = filename.match(/-(x64|arm64)-setup\.exe$/)![1];

  const hash = createHash("sha256");
  await new Promise<void>((res, rej) =>
    fs.createReadStream(abs).on("data", (d) => hash.update(d)).on("end", () => res()).on("error", rej));
  const sha256 = hash.digest("hex");

  const key = `releases/${version}/${filename}`;
  process.stdout.write(`↑ ${filename} (${(size / 1e6).toFixed(0)} MB) `);

  await new Upload({
    client: s3,
    params: {
      Bucket: process.env.R2_BUCKET!, Key: key, Body: fs.createReadStream(abs),
      ContentType: "application/vnd.microsoft.portable-executable",
      ContentDisposition: `attachment; filename="${filename}"`,
    },
    queueSize: 4, partSize: 8 * 1024 * 1024,
  }).done();

  await sql`
    insert into releases (version, platform, arch, filename, key, size, sha256, notes)
    values (${version}, 'win', ${arch}, ${filename}, ${key}, ${size}, ${sha256}, ${notes})
    on conflict (version, platform, arch) do update set
      filename = excluded.filename, key = excluded.key, size = excluded.size,
      sha256 = excluded.sha256, notes = excluded.notes, created_at = now()`;

  // blockmap enables electron-updater's differential download
  const blockmap = `${abs}.blockmap`;
  if (fs.existsSync(blockmap)) {
    await new Upload({
      client: s3,
      params: {
        Bucket: process.env.R2_BUCKET!, Key: `${key}.blockmap`,
        Body: fs.createReadStream(blockmap), ContentType: "application/octet-stream",
      },
    }).done();
  }

  console.log(`✓ ${sha256.slice(0, 12)}…${fs.existsSync(blockmap) ? " +blockmap" : ""}`);
}

/*
 * Write our own latest.yml instead of shipping electron-builder's.
 * Its version points `path` at the combined multi-arch installer (169 MB), so
 * every user would download that rather than the 78 MB build for their CPU.
 */
const feedFiles = files.map((filename) => {
  const abs = path.join(RELEASE_DIR, filename);
  const sha512 = createHash("sha512").update(fs.readFileSync(abs)).digest("base64");
  return { url: filename, sha512, size: fs.statSync(abs).size, arch: filename.includes("-arm64-") ? "arm64" : "x64" };
});
const primary = feedFiles.find((f) => f.arch === "x64") ?? feedFiles[0];

const yml = [
  `version: ${version}`,
  "files:",
  ...feedFiles.flatMap((f) => [
    `  - url: ${f.url}`,
    `    sha512: ${f.sha512}`,
    `    size: ${f.size}`,
    `    arch: ${f.arch}`,
  ]),
  `path: ${primary.url}`,
  `sha512: ${primary.sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  "",
].join("\n");

await new Upload({
  client: s3,
  params: {
    Bucket: process.env.R2_BUCKET!, Key: `releases/${version}/latest.yml`,
    Body: yml, ContentType: "text/yaml",
  },
}).done();
console.log(`↑ latest.yml (update feed, ${feedFiles.length} archs, default ${primary.arch})`);

await sql.end();
console.log(`\npublished v${version} — https://gamesavecloud.vercel.app/download`);
