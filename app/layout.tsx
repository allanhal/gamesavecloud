import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gamesavecloud",
  description: "Self-hosted cloud saves for PC games",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
