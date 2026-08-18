import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { desc } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { COOKIE, tokenMatches } from "@/lib/auth";
import { bytes } from "@/lib/format";
import { Panel, Button } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  // signed-in users go straight to their games
  const v = (await cookies()).get(COOKIE)?.value ?? "";
  if (tokenMatches(v)) redirect("/games");

  const [latest] = await db.select().from(schema.releases)
    .orderBy(desc(schema.releases.createdAt)).limit(1);

  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">gamesavecloud</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        Self-hosted cloud saves for PC games. Sync Steam and Epic saves between your
        machines, with full version history so a corrupted save is one click from fixed.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/download">
          <Button>Download for Windows{latest ? ` — v${latest.version}` : ""}</Button>
        </Link>
        <Link href="/login"><Button variant="ghost">Sign in to dashboard</Button></Link>
      </div>

      {latest && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          {bytes(Number(latest.size))} · unsigned build · Windows 10/11
        </p>
      )}

      <Panel className="mt-10 p-5">
        <h2 className="text-sm font-medium">How it works</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-[var(--color-muted)]">
          <li>Files are addressed by hash, so a new version only uploads what changed.</li>
          <li>A version is a whole-folder snapshot — never half-old and half-new.</li>
          <li>If two PCs both changed a save, you pick; nothing is silently overwritten.</li>
          <li>Downloads verify their hash and refuse to write on a mismatch.</li>
        </ul>
      </Panel>
    </main>
  );
}
