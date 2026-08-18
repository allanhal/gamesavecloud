import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { presignKey, blobBucketKeyExists } from "@/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Update feed for electron-updater's "generic" provider.
 *
 * It fetches <base>/latest.yml, then requests each file named inside it relative
 * to the same base. Both are served here by redirecting to short-lived R2 URLs,
 * so the bucket stays private and the app needs no credentials.
 *
 * Public on purpose: an installed app has no token, and the payload is the same
 * installer already published on /download.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const name = path.join("/");

  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return new NextResponse("bad path", { status: 400 });
  }

  // latest.yml (and channel variants) are uploaded next to the installers
  if (name.endsWith(".yml")) {
    // newest version that actually has a feed file published
    const rows = await db.select().from(schema.releases);
    const versions = [...new Set(rows.map((r) => r.version))]
      .sort((a, b) => cmpSemver(b, a));
    for (const v of versions) {
      const key = `releases/${v}/${name}`;
      if (await blobBucketKeyExists(key)) {
        return NextResponse.redirect(await presignKey(key, 300));
      }
    }
    return new NextResponse("no update feed published", { status: 404 });
  }

  // installer or blockmap: look it up by filename
  const [rel] = await db.select().from(schema.releases)
    .where(eq(schema.releases.filename, name.replace(/\.blockmap$/, ""))).limit(1);
  if (!rel) return new NextResponse("unknown file", { status: 404 });

  const key = name.endsWith(".blockmap") ? `${rel.key}.blockmap` : rel.key;
  if (!(await blobBucketKeyExists(key))) return new NextResponse("not published", { status: 404 });
  return NextResponse.redirect(await presignKey(key, 300));
}

function cmpSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
