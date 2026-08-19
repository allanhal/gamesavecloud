import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { bytes } from "@/lib/format";
import { Panel, Button, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const ARCH_LABEL: Record<string, string> = {
  x64: "64-bit (Intel or AMD)",
  arm64: "Windows on ARM (Snapdragon, Surface Pro X)",
};

const KIND: Record<string, { title: string; blurb: string }> = {
  installer: {
    title: "Installer",
    blurb: "Installs to your user folder, adds a Start menu shortcut, and updates itself.",
  },
  zip: {
    title: "Portable (zip)",
    blurb: "Extract and run — no install. Settings and sync state live in a gamesavecloud-data folder next to the exe, so the whole folder travels with you. Does not auto-update.",
  },
  portable: {
    title: "Portable (single exe)",
    blurb: "One self-extracting executable. Same portable data folder, no install. Does not auto-update.",
  },
};

export default async function DownloadPage() {
  const rows = await db.select().from(schema.releases)
    .orderBy(desc(schema.releases.createdAt), desc(schema.releases.arch));

  const byVersion = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byVersion.has(r.version)) byVersion.set(r.version, [] as any);
    byVersion.get(r.version)!.push(r);
  }
  const versions = [...byVersion.entries()];
  const [latestVersion, latestBuilds] = versions[0] ?? [null, []];

  // NSIS built anywhere but Windows can ship a broken uninstaller
  const crossBuiltInstaller = latestBuilds.some(
    (b) => (b.kind ?? "installer") === "installer" && b.builtOn !== "win32",
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">gamesavecloud for Windows</h1>
        <Link href="/"><Button variant="ghost">Dashboard</Button></Link>
      </div>
      <p className="mt-2 text-[var(--color-muted)]">
        Scans Steam and Epic, syncs your saves, and keeps every version so a corrupted
        save is one click from being restored.
      </p>

      {versions.length === 0 && (
        <div className="mt-8">
          <Empty title="No builds published yet" hint="Run `pnpm desktop:dist` then `pnpm release`." />
        </div>
      )}

      {latestVersion && (
        <section className="mt-8">
          <div className="flex items-baseline gap-3">
            <h2 className="font-medium">Latest — v{latestVersion}</h2>
            <span className="text-xs text-[var(--color-muted)]">
              {new Date(latestBuilds[0].createdAt).toLocaleDateString()}
            </span>
          </div>
          {latestBuilds[0].notes && (
            <p className="mt-1 text-sm text-[var(--color-muted)]">{latestBuilds[0].notes}</p>
          )}

          {crossBuiltInstaller && (
            <Panel className="mt-4 border-[var(--color-danger)]/40 p-4">
              <p className="text-sm font-medium text-[var(--color-danger)]">
                Use the portable build for now
              </p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                This installer was cross-built from macOS, and its uninstaller fails an
                integrity check on Windows. NSIS generates the uninstaller by running the
                compiled installer, which does not survive being built through wine. The
                portable zip below has no installer and is unaffected. A Windows-built
                installer is coming from CI.
              </p>
            </Panel>
          )}

          <div className="mt-4 space-y-5">
            {(["installer", "zip", "portable"] as const).map((kind) => {
              const builds = latestBuilds.filter((b) => (b.kind ?? "installer") === kind);
              if (!builds.length) return null;
              const meta = KIND[kind];
              return (
                <div key={kind}>
                  <h3 className="text-sm font-medium">{meta.title}</h3>
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">{meta.blurb}</p>
                  <div className="mt-2 space-y-2">
                    {builds.map((r) => (
                      <Panel key={r.id} className="flex flex-wrap items-center gap-4 p-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{ARCH_LABEL[r.arch] ?? r.arch}</div>
                          <div className="mt-0.5 truncate font-mono text-xs text-[var(--color-muted)]">
                            {r.filename} · {bytes(Number(r.size))}
                            {kind === "installer" && r.builtOn !== "win32" && " · cross-built"}
                          </div>
                        </div>
                        <a href={`/dl/${r.id}`}>
                          <Button
                            variant={
                              kind === "installer"
                                ? (r.builtOn === "win32" ? "default" : "ghost")
                                : (crossBuiltInstaller && kind === "zip" ? "default" : "ghost")
                            }
                          >
                            Download
                          </Button>
                        </a>
                      </Panel>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[var(--color-muted)]">
              Verify your download (SHA-256)
            </summary>
            <div className="mt-2 space-y-1">
              {latestBuilds.map((r) => (
                <div key={r.id} className="overflow-x-auto whitespace-nowrap">
                  <code className="font-mono text-xs text-[var(--color-muted)]">
                    {r.filename}: {r.sha256}
                  </code>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              In PowerShell: <code className="font-mono">Get-FileHash .\{"{file}"}.exe -Algorithm SHA256</code>
            </p>
          </details>

          <Panel className="mt-6 border-[var(--color-warn)]/30 p-4">
            <p className="text-sm font-medium text-[var(--color-warn)]">Windows SmartScreen warning</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              These builds are unsigned, so Windows shows “Windows protected your PC”.
              Click <strong>More info → Run anyway</strong>. Signing needs a code-signing
              certificate, which is on the roadmap.
            </p>
          </Panel>
        </section>
      )}

      {versions.length > 1 && (
        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted)]">
            Earlier versions
          </h2>
          <Panel className="mt-3 divide-y divide-[var(--color-line)]">
            {versions.slice(1).flatMap(([v, builds]) =>
              builds.map((r) => (
                <div key={r.id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                  <span className="w-16 font-medium">v{v}</span>
                  <span className="text-[var(--color-muted)]">{r.arch}</span>
                  <span className="text-[var(--color-muted)]">{bytes(Number(r.size))}</span>
                  <a href={`/dl/${r.id}`} className="ml-auto text-[var(--color-accent)] hover:underline">
                    download
                  </a>
                </div>
              )),
            )}
          </Panel>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--color-muted)]">
          After installing
        </h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--color-muted)]">
          <li>
            Portable zip: extract anywhere, then run <code className="font-mono">gamesavecloud.exe</code>.
            Keep the <code className="font-mono">gamesavecloud-data</code> folder beside it when you move or update.
          </li>
          <li>Open gamesavecloud and paste your <code className="font-mono">GAMESYNC_TOKEN</code>.</li>
          <li>Click <strong>Scan for games</strong> to find your Steam and Epic library.</li>
          <li>Add the games you want synced, then <strong>Sync all</strong>.</li>
          <li>Use <strong>Play</strong> to launch — it syncs down first and back up on exit.</li>
        </ol>
      </section>
    </main>
  );
}
