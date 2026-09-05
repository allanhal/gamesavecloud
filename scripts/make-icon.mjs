// Generates apps/desktop/build/icon.ico from an inline SVG.
// Run: node scripts/make-icon.mjs
// sharp is a transitive dep; resolve it from the pnpm store if a bare import fails.
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

// Cloud + download arrow on a blue→indigo rounded square. Reads at 16px.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563eb"/>
      <stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="256" height="256" rx="56" ry="56" fill="url(#bg)"/>
  <g fill="#ffffff">
    <circle cx="126" cy="104" r="42"/>
    <circle cx="90" cy="126" r="28"/>
    <circle cx="166" cy="126" r="30"/>
    <rect x="86" y="120" width="86" height="36" rx="18"/>
  </g>
  <g fill="#2563eb">
    <rect x="118" y="120" width="20" height="44" rx="4"/>
    <path d="M96 156 L160 156 L128 196 Z"/>
  </g>
</svg>`;

const sizes = [16, 24, 32, 48, 64, 128, 256];
const outDir = "apps/desktop/build";
fs.mkdirSync(outDir, { recursive: true });

const pngs = [];
for (const s of sizes) {
  pngs.push({ size: s, buf: await sharp(Buffer.from(svg)).resize(s, s).png().toBuffer() });
}

// ICO container: 6-byte header + 16 bytes per entry + PNG payloads.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);          // reserved
header.writeUInt16LE(1, 2);          // type: icon
header.writeUInt16LE(pngs.length, 4);

const entries = Buffer.alloc(16 * pngs.length);
let offset = 6 + entries.length;
pngs.forEach((p, i) => {
  const e = i * 16;
  entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 0);  // width  (0 = 256)
  entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1);  // height
  entries.writeUInt8(0, e + 2);        // palette
  entries.writeUInt8(0, e + 3);        // reserved
  entries.writeUInt16LE(1, e + 4);     // color planes
  entries.writeUInt16LE(32, e + 6);    // bits per pixel
  entries.writeUInt32LE(p.buf.length, e + 8);
  entries.writeUInt32LE(offset, e + 12);
  offset += p.buf.length;
});

const ico = Buffer.concat([header, entries, ...pngs.map((p) => p.buf)]);
fs.writeFileSync(path.join(outDir, "icon.ico"), ico);
console.log(`wrote ${outDir}/icon.ico — ${sizes.join(",")}px, ${(ico.length / 1024).toFixed(1)} KB`);
