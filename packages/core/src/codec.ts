import { gzipSync, gunzipSync } from "node:zlib";

export type Codec = "raw" | "gzip";

/**
 * Compression is per-blob and recorded server-side, so the codec can change
 * later without rewriting anything already stored.
 * gzip is a Node builtin — no native module, which keeps the Electron build simple.
 */
export function encode(buf: Buffer, codec: Codec): Buffer {
  return codec === "gzip" ? gzipSync(buf, { level: 6 }) : buf;
}

export function decode(buf: Buffer, codec: Codec): Buffer {
  return codec === "gzip" ? gunzipSync(buf) : buf;
}

/** Already-compressed formats gain nothing and cost CPU — skip them. */
const INCOMPRESSIBLE = /\.(zip|7z|rar|gz|zst|png|jpg|jpeg|webp|mp4|ogg|mp3|bk2)$/i;

export function pickCodec(relPath: string, size: number): Codec {
  if (size < 512) return "raw";
  if (INCOMPRESSIBLE.test(relPath)) return "raw";
  return "gzip";
}
