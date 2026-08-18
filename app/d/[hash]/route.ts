import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { presignGet } from "@/server/r2";
import { COOKIE, tokenMatches } from "@/lib/auth";

export const runtime = "nodejs";

/** Redirects to a short-lived R2 URL. Bytes never pass through the function. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ hash: string }> }) {
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  if (!tokenMatches(v)) return new NextResponse("unauthorized", { status: 401 });

  const { hash } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(hash)) return new NextResponse("bad hash", { status: 400 });
  return NextResponse.redirect(await presignGet(hash));
}
