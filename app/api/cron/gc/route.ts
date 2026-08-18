import { NextRequest, NextResponse } from "next/server";
import { app } from "@/server/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Cron calls this daily; it forwards to the token-protected /gc route. */
export async function GET(req: NextRequest) {
  const isCron = req.headers.get("user-agent")?.includes("vercel-cron")
    ?? false;
  const auth = req.headers.get("authorization");
  const token = process.env.GAMESYNC_TOKEN!;
  if (!isCron && auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const res = await app.request("/api/v1/gc", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}
