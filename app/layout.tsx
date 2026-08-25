import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gamesavecloud",
  description: "Self-hosted cloud saves for PC games",
};

const REPO = "https://github.com/allanhal/gamesavecloud";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col antialiased">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-[var(--color-line)] px-6 py-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
            <a className="hover:text-[var(--color-fg)] hover:underline" href={REPO}
              target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
            <a className="hover:text-[var(--color-fg)] hover:underline" href={`${REPO}/releases`}
              target="_blank" rel="noreferrer">
              Releases
            </a>
            <a className="hover:text-[var(--color-fg)] hover:underline" href={`${REPO}/blob/main/LICENSE`}
              target="_blank" rel="noreferrer">
              MIT licensed
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
