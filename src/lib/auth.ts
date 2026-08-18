import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { timingSafeEqual } from "node:crypto";

export const COOKIE = "gsc_session";

export function tokenMatches(candidate: string): boolean {
  const expected = process.env.GAMESYNC_TOKEN ?? "";
  const a = Buffer.from(candidate), b = Buffer.from(expected);
  return expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** Call at the top of every protected page. Redirects instead of throwing. */
export async function requireSession() {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value ?? "";
  if (!tokenMatches(v)) redirect("/login");
}
