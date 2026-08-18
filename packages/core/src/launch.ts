import { spawn, execFileSync } from "node:child_process";
import type { GameConfig } from "./config";

/** Launcher URIs hand off to a child process, so we poll rather than wait on exit. */
export function launchGame(game: GameConfig): void {
  const uri = game.source === "steam" && game.appId
    ? `steam://rungameid/${game.appId}`
    : game.source === "epic" && game.appId
      ? `com.epicgames.launcher://apps/${game.appId}?action=launch&silent=true`
      : null;
  if (!uri) throw new Error(`don't know how to launch ${game.name} (${game.source})`);

  if (process.platform === "win32") spawn("cmd", ["/c", "start", "", uri], { detached: true, stdio: "ignore" }).unref();
  else spawn("open", [uri], { detached: true, stdio: "ignore" }).unref();
}

/** Any running process whose image path sits inside the game's install dir. */
export function isGameRunning(installDir: string): boolean {
  if (process.platform !== "win32") return false;
  try {
    const out = execFileSync("powershell", [
      "-NoProfile", "-Command",
      `Get-Process | Where-Object { $_.Path -like '${installDir.replace(/'/g, "''")}*' } | Select-Object -First 1 -ExpandProperty Id`,
    ], { encoding: "utf8", timeout: 15000 });
    return out.trim().length > 0;
  } catch { return false; }
}

export async function waitForExit(installDir: string, opts: { pollMs?: number; startupGraceMs?: number } = {}) {
  const poll = opts.pollMs ?? 5000;
  const grace = opts.startupGraceMs ?? 60000;
  const started = Date.now();

  // launchers take a while to hand off — don't call it "exited" before it starts
  let everRan = false;
  for (;;) {
    const running = isGameRunning(installDir);
    if (running) everRan = true;
    if (!running && (everRan || Date.now() - started > grace)) return everRan;
    await new Promise((r) => setTimeout(r, poll));
  }
}
