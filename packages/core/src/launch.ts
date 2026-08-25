import { spawn, execFile } from "node:child_process";
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

/**
 * Any running process whose image path sits inside the game's install dir.
 *
 * Asynchronous on purpose: this shells out to PowerShell, and doing it
 * synchronously froze the main process for the length of every poll — long
 * enough that a quit landing mid-poll looked like the app had hung. The child
 * is killed when the signal aborts, so quitting never leaves one behind.
 */
export function isGameRunning(installDir: string, signal?: AbortSignal): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = execFile("powershell", [
      "-NoProfile", "-Command",
      `Get-Process | Where-Object { $_.Path -like '${installDir.replace(/'/g, "''")}*' } | Select-Object -First 1 -ExpandProperty Id`,
    ], { encoding: "utf8", timeout: 15000, windowsHide: true }, (err, out) => {
      resolve(!err && out.trim().length > 0);
    });
    const kill = () => child.kill();
    signal?.addEventListener("abort", kill, { once: true });
    child.on("close", () => signal?.removeEventListener("abort", kill));
  });
}

/** Resolves true once the game has run and exited, false if it never started. */
export async function waitForExit(
  installDir: string,
  opts: { pollMs?: number; startupGraceMs?: number; signal?: AbortSignal } = {},
): Promise<boolean> {
  const poll = opts.pollMs ?? 5000;
  const grace = opts.startupGraceMs ?? 60000;
  const started = Date.now();

  // launchers take a while to hand off — don't call it "exited" before it starts
  let everRan = false;
  for (;;) {
    if (opts.signal?.aborted) return everRan;
    const running = await isGameRunning(installDir, opts.signal);
    if (running) everRan = true;
    if (!running && (everRan || Date.now() - started > grace)) return everRan;
    // an unref'd timer never keeps the process alive on its own
    await new Promise<void>((r) => {
      const t = setTimeout(r, poll);
      if (typeof t.unref === "function") t.unref();
      opts.signal?.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true });
    });
  }
}
