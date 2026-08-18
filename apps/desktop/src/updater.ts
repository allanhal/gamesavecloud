import { autoUpdater } from "electron-updater";
import type { BrowserWindow } from "electron";
import { app, dialog } from "electron";

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string; notes?: string }
  | { phase: "downloading"; percent: number; version: string }
  | { phase: "ready"; version: string }
  | { phase: "none"; version: string }
  | { phase: "error"; message: string };

let state: UpdateState = { phase: "idle" };
export const getUpdateState = () => state;

export function initUpdater(getWin: () => BrowserWindow | null) {
  // the user chooses when to restart; silently swapping a running sync client is rude
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  const push = (s: UpdateState) => { state = s; getWin()?.webContents.send("update:state", s); };

  autoUpdater.on("checking-for-update", () => push({ phase: "checking" }));
  autoUpdater.on("update-available", (i) => push({ phase: "available", version: i.version, notes: typeof i.releaseNotes === "string" ? i.releaseNotes : undefined }));
  autoUpdater.on("update-not-available", () => push({ phase: "none", version: app.getVersion() }));
  autoUpdater.on("download-progress", (p) => push({ phase: "downloading", percent: Math.round(p.percent), version: state["version" as never] ?? "" }));
  autoUpdater.on("update-downloaded", (i) => push({ phase: "ready", version: i.version }));
  autoUpdater.on("error", (e) => push({ phase: "error", message: e?.message ?? String(e) }));

  // packaged builds only — in dev there is no installer to replace
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  }
}

export async function checkNow() {
  if (!app.isPackaged) { state = { phase: "none", version: app.getVersion() }; return state; }
  try { await autoUpdater.checkForUpdates(); } catch (e: any) { state = { phase: "error", message: e.message }; }
  return state;
}

export async function installNow(win: BrowserWindow | null) {
  if (state.phase !== "ready") return false;
  const { response } = await dialog.showMessageBox(win!, {
    type: "question",
    buttons: ["Restart and update", "Later"],
    defaultId: 0, cancelId: 1,
    message: `Update to v${state.version}?`,
    detail: "gamesavecloud will close and reopen. Any sync in progress will finish first.",
  });
  if (response !== 0) return false;
  (app as any).isQuitting = true;
  autoUpdater.quitAndInstall();
  return true;
}
