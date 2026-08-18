import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface GameConfig {
  /** server-side slug — stable identity */
  id: string;
  name: string;
  /** absolute path to this PC's save folder */
  path: string;
  slot: number;
  enabled: boolean;
  source: "steam" | "epic" | "manual";
  appId?: string;
  /** install folder — used to detect whether the game is running */
  installDir?: string;
  include?: string[];
  exclude?: string[];
}

export interface Config {
  server: string;
  token: string;
  device: string;
  games: GameConfig[];
}

let override: string | null = null;

/**
 * Portable builds keep their data beside the executable instead of in %APPDATA%,
 * so copying the folder to another PC carries the config and sync state with it.
 */
export function setConfigDir(dir: string | null): void { override = dir; }
export const isPortable = () => override !== null;

/** %APPDATA%/gamesavecloud on Windows, ~/.config/gamesavecloud elsewhere. */
export function configDir(): string {
  if (override) return override;
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "gamesavecloud");
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "gamesavecloud");
}

export const configPath = () => path.join(configDir(), "config.json");
export const statePath = () => path.join(configDir(), "state.json");

export function loadConfig(): Config | null {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch { return null; }
}

export function saveConfig(c: Config): void {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(c, null, 2));
}

export function defaultConfig(server: string, token: string): Config {
  return { server: server.replace(/\/$/, ""), token, device: os.hostname(), games: [] };
}

/* ── local sync state (what this PC last pushed/pulled) ─────────────── */

export interface SlotState {
  syncedVersion: number;
  /** manifest hash at the moment of the last successful sync */
  syncedManifestHash: string;
  syncedAt: string;
}

export type State = Record<string, SlotState>;   // key: `${gameId}:${slot}`

export const stateKey = (gameId: string, slot: number) => `${gameId}:${slot}`;

export function loadState(): State {
  try { return JSON.parse(fs.readFileSync(statePath(), "utf8")); } catch { return {}; }
}

export function saveState(s: State): void {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(s, null, 2));
}
