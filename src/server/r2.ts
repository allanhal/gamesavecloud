import { S3Client, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.R2_BUCKET!;
export const PRESIGN_TTL = 600; // 10 min

export const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/** Fan out into 256x256 prefixes so no single prefix gets hot. */
export const blobKey = (hash: string) => `blobs/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;

export const presignPut = (hash: string) =>
  getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: blobKey(hash) }), { expiresIn: PRESIGN_TTL });

export const presignGet = (hash: string) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: blobKey(hash) }), { expiresIn: PRESIGN_TTL });

/** Presign an arbitrary key — used for release installers, which aren't blobs. */
export const presignKey = (key: string, expiresIn = PRESIGN_TTL) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });

/** Returns stored (compressed) size, or null if the object isn't there. */
export async function blobExists(hash: string): Promise<number | null> {
  try {
    const r = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: blobKey(hash) }));
    return r.ContentLength ?? 0;
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return null;
    throw e;
  }
}

export const deleteBlob = (hash: string) =>
  s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: blobKey(hash) }));
