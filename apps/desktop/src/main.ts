import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, clipboard } from "electron";
import path from "node:path";
import fs from "node:fs";
import {
  loadConfig, saveConfig, defaultConfig, configDir, setConfigDir, isPortable, loadState, stateKey,
  addRecipeDir, reloadRecipes,
  Api, syncGame, detectGames, toGameConfig, scanDir, manifestHashSync,
  launchGame, waitForExit, isGameRunning, findSaveCandidates, renderRecipe,
  type Config, type GameConfig,
} from "@gsc/core";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

/**
 * The app only ships portable, so a packaged build always keeps its data in
 * `gamesavecloud-data` beside the exe — copy that folder to another PC (or a
 * USB stick) and the config, sync state and recipes travel with it.
 *
 * `PORTABLE_EXECUTABLE_DIR` is set by the single-exe target, which unpacks
 * itself to a temp folder; the real exe location only comes from there.
 * Unwritable media (a read-only stick) falls back to %APPDATA% rather than
 * failing to start.
 */
function resolvePortable(): string | null {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR
    ?? (app.isPackaged ? path.dirname(app.getPath("exe")) : null);
  if (!exeDir) return null;   // dev run — use the normal config location

  const dataDir = path.join(exeDir, "gamesavecloud-data");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    // prove it is writable before committing — read-only media would break silently
    const probe = path.join(dataDir, ".write-test");
    fs.writeFileSync(probe, "ok");
    fs.rmSync(probe);
    return dataDir;
  } catch {
    return null;
  }
}

const portableDir = resolvePortable();
if (portableDir) setConfigDir(portableDir);

// user recipes live beside the config, so adding a game is dropping in a .json
const userRecipeDir = path.join(configDir(), "recipes");
addRecipeDir(userRecipeDir);

function createWindow() {
  win = new BrowserWindow({
    width: 1040, height: 720, minWidth: 860, minHeight: 560,
    backgroundColor: "#14161c",
    title: "gamesavecloud",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  win.on("close", (e) => {
    // closing hides to tray; quitting is explicit, so background sync survives
    if (!(app as any).isQuitting) { e.preventDefault(); win?.hide(); }
  });
}

function createTray() {
  const img = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoAAAr8wABm2H6cwAAAABJRU5ErkJggg==",
  );
  tray = new Tray(img);
  tray.setToolTip("gamesavecloud");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open", click: () => { win?.show(); } },
    { label: "Sync all now", click: () => syncAll() },
    { type: "separator" },
    { label: "Quit", click: () => { (app as any).isQuitting = true; app.quit(); } },
  ]));
  tray.on("click", () => win?.show());
}

/* ── helpers shared by IPC handlers ─────────────────────────────────── */

function cfgOrThrow(): Config {
  const c = loadConfig();
  if (!c) throw new Error("Not connected yet.");
  return c;
}

function send(channel: string, payload: unknown) {
  win?.webContents.send(channel, payload);
}

async function syncAll(opts: { only?: string; resolve?: "local" | "remote" } = {}) {
  const cfg = cfgOrThrow();
  const list = opts.only ? cfg.games.filter((g) => g.id === opts.only) : cfg.games.filter((g) => g.enabled);
  const results = [];
  for (const g of list) {
    send("sync:progress", { game: g.id, message: "syncing…" });
    try {
      results.push(await syncGame(cfg, g, {
        resolve: opts.resolve,
        onProgress: (m) => send("sync:progress", { game: g.id, message: m }),
      }));
    } catch (e: any) {
      results.push({ game: g.id, status: "error", detail: e.message, localVersion: 0, remoteVersion: 0 });
    }
  }
  send("sync:done", results);
  return results;
}

/** Cloud-vs-local for every configured game, without mutating anything. */
async function statusAll() {
  const cfg = cfgOrThrow();
  const api = new Api(cfg);
  const state = loadState();

  return Promise.all(cfg.games.map(async (g) => {
    const exists = fs.existsSync(g.path);
    const local = exists ? scanDir(g.path, { include: g.include, exclude: g.exclude }) : [];
    const localHash = local.length ? manifestHashSync(local) : "";
    const prev = state[stateKey(g.id, g.slot)];
    let remote: any = { version: 0, files: [] };
    let offline = false;
    try { remote = await api.latest(g.id, g.slot); } catch { offline = true; }
    const remoteHash = remote.files.length ? manifestHashSync(remote.files) : "";

    let status = "unknown";
    if (!exists) status = "no-folder";
    else if (offline) status = "offline";
    else if (localHash === remoteHash && remote.version > 0) status = "in-sync";
    else if (remote.version === 0) status = "never-uploaded";
    else {
      const lc = localHash !== (prev?.syncedManifestHash ?? "");
      const rc = remote.version !== (prev?.syncedVersion ?? 0);
      status = lc && rc ? "conflict" : lc ? "local-ahead" : "cloud-ahead";
    }

    return {
      ...g, status,
      exists,
      localFiles: local.length,
      localSize: local.reduce((n, f) => n + f.size, 0),
      localVersion: prev?.syncedVersion ?? 0,
      cloudVersion: remote.version,
      running: g.installDir ? isGameRunning(g.installDir) : false,
    };
  }));
}

/* ── IPC ────────────────────────────────────────────────────────────── */

ipcMain.handle("config:get", () => loadConfig());

ipcMain.handle("config:connect", async (_e, server: string, token: string) => {
  const cfg = defaultConfig(server, token);
  await new Api(cfg).health();          // throws if unreachable or token is wrong
  const existing = loadConfig();
  saveConfig({ ...cfg, games: existing?.games ?? [] });
  return loadConfig();
});

ipcMain.handle("games:status", () => statusAll());

ipcMain.handle("games:detect", () => detectGames());

/**
 * Searches the folders games actually save into, for titles no recipe covers.
 * Also returns a recipe snippet so a confirmed path can be contributed back.
 */
ipcMain.handle("games:probe", (_e, name: string, installDir?: string, appId?: string, source?: string) => {
  const candidates = findSaveCandidates(name, {
    extraRoots: installDir ? [installDir] : [],
    installDir,
  });
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    candidates,
    recipe: candidates.length
      ? renderRecipe({
          id, name,
          steamAppId: source === "steam" ? appId : undefined,
          epicAppName: source === "epic" ? appId : undefined,
          templates: candidates.slice(0, 3).map((c) => c.template),
        })
      : null,
  };
});

ipcMain.handle("games:add", async (_e, detected: any) => {
  const cfg = cfgOrThrow();
  const gc = toGameConfig(detected);
  if (!gc) throw new Error("That game has no usable save folder.");
  if (cfg.games.some((g) => g.id === gc.id)) throw new Error("Already added.");
  cfg.games.push(gc);
  saveConfig(cfg);
  await new Api(cfg).addGame(gc.id, gc.name).catch(() => {});
  return gc;
});

ipcMain.handle("games:addManual", async (_e, name: string, folder: string) => {
  const cfg = cfgOrThrow();
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (cfg.games.some((g) => g.id === id)) throw new Error("Already added.");
  const gc: GameConfig = { id, name, path: folder, slot: 0, enabled: true, source: "manual" };
  cfg.games.push(gc);
  saveConfig(cfg);
  await new Api(cfg).addGame(id, name).catch(() => {});
  return gc;
});

ipcMain.handle("games:remove", (_e, id: string) => {
  const cfg = cfgOrThrow();
  cfg.games = cfg.games.filter((g) => g.id !== id);
  saveConfig(cfg);
  return true;
});

ipcMain.handle("games:toggle", (_e, id: string, enabled: boolean) => {
  const cfg = cfgOrThrow();
  const g = cfg.games.find((x) => x.id === id);
  if (g) { g.enabled = enabled; saveConfig(cfg); }
  return true;
});

ipcMain.handle("games:setPath", (_e, id: string, folder: string) => {
  const cfg = cfgOrThrow();
  const g = cfg.games.find((x) => x.id === id);
  if (g) { g.path = folder; saveConfig(cfg); }
  return true;
});

ipcMain.handle("sync:run", (_e, opts) => syncAll(opts ?? {}));

ipcMain.handle("history:get", async (_e, id: string) => {
  const cfg = cfgOrThrow();
  const g = cfg.games.find((x) => x.id === id)!;
  return new Api(cfg).history(g.id, g.slot);
});

ipcMain.handle("history:restore", async (_e, id: string, version: number) => {
  const cfg = cfgOrThrow();
  const g = cfg.games.find((x) => x.id === id)!;
  await new Api(cfg).rollback(g.id, g.slot, version);
  return syncGame(cfg, g, { resolve: "remote", onProgress: (m) => send("sync:progress", { game: g.id, message: m }) });
});

ipcMain.handle("game:launch", async (_e, id: string) => {
  const cfg = cfgOrThrow();
  const g = cfg.games.find((x) => x.id === id)!;

  const pre = await syncGame(cfg, g);
  if (pre.status === "conflict") return { ok: false, reason: "conflict", conflict: pre.conflict };

  await syncGame(cfg, g, { resolve: "local", pinned: true }).catch(() => {});
  launchGame(g);
  send("sync:progress", { game: g.id, message: "waiting for the game to exit…" });

  await waitForExit(g.installDir ?? g.path);
  await new Promise((r) => setTimeout(r, 3000));
  const post = await syncGame(cfg, g, { onProgress: (m) => send("sync:progress", { game: g.id, message: m }) });
  return { ok: true, post };
});

ipcMain.handle("dialog:pickFolder", async () => {
  const r = await dialog.showOpenDialog(win!, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("clipboard:write", (_e, text: string) => clipboard.writeText(text));
ipcMain.handle("shell:openConfigDir", () => shell.openPath(configDir()));
ipcMain.handle("shell:openPath", (_e, p: string) => shell.openPath(p));
ipcMain.handle("app:portable", () => (isPortable() ? configDir() : null));

ipcMain.handle("recipes:dir", () => userRecipeDir);

/** Opens the folder so a user can drop in or edit a .json recipe. */
ipcMain.handle("recipes:open", () => {
  fs.mkdirSync(userRecipeDir, { recursive: true });
  shell.openPath(userRecipeDir);
});

ipcMain.handle("recipes:reload", () => { reloadRecipes(); });

/** Saves a probed recipe as <id>.json so the next detect run picks the game up. */
ipcMain.handle("recipes:save", (_e, id: string, json: string) => {
  const safe = id.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  if (!safe) throw new Error("That recipe has no usable id.");
  JSON.parse(json);   // refuse to write a file the loader would then skip
  fs.mkdirSync(userRecipeDir, { recursive: true });
  const file = path.join(userRecipeDir, `${safe}.json`);
  fs.writeFileSync(file, json);
  reloadRecipes();
  return file;
});
ipcMain.handle("app:version", () => app.getVersion());

ipcMain.handle("shell:openWeb", () => {
  const cfg = loadConfig();
  if (cfg) shell.openExternal(cfg.server);
});

/* ── background sync ────────────────────────────────────────────────── */

let timer: NodeJS.Timeout | null = null;
function startBackgroundSync() {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    const cfg = loadConfig();
    if (!cfg) return;
    for (const g of cfg.games.filter((x) => x.enabled)) {
      // never touch a save while its game is running
      if (g.installDir && isGameRunning(g.installDir)) continue;
      try { await syncGame(cfg, g); } catch { /* offline or conflict — the UI shows it */ }
    }
    win?.webContents.send("sync:background");
  }, 10 * 60 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startBackgroundSync();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { /* stay alive in the tray */ });
