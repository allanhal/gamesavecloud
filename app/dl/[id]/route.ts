import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { presignKey } from "@/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public on purpose: you need to download the installer on a fresh PC before
 * you have a token. The installer is useless without one.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("bad id", { status: 400 });

  const [rel] = await db.select().from(schema.releases).where(eq(schema.releases.id, id)).limit(1);
  if (!rel) return new NextResponse("unknown release", { status: 404 });

  return NextResponse.redirect(await presignKey(rel.key, 300));
}
