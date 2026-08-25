import { contextBridge, ipcRenderer } from "electron";

/** The only surface the renderer gets — no Node, no fs, no direct IPC. */
contextBridge.exposeInMainWorld("gsc", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  connect: (server: string, token: string) => ipcRenderer.invoke("config:connect", server, token),

  status: () => ipcRenderer.invoke("games:status"),
  detect: () => ipcRenderer.invoke("games:detect"),
  cloudGames: () => ipcRenderer.invoke("games:cloud"),
  adopt: (game: unknown, folder: string) => ipcRenderer.invoke("games:adopt", game, folder),
  probe: (name: string, installDir?: string, appId?: string, source?: string) =>
    ipcRenderer.invoke("games:probe", name, installDir, appId, source),
  copy: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  add: (detected: unknown) => ipcRenderer.invoke("games:add", detected),
  addManual: (name: string, folder: string) => ipcRenderer.invoke("games:addManual", name, folder),
  remove: (id: string) => ipcRenderer.invoke("games:remove", id),
  toggle: (id: string, enabled: boolean) => ipcRenderer.invoke("games:toggle", id, enabled),
  setPath: (id: string, folder: string) => ipcRenderer.invoke("games:setPath", id, folder),

  sync: (opts?: unknown) => ipcRenderer.invoke("sync:run", opts),
  history: (id: string) => ipcRenderer.invoke("history:get", id),
  restore: (id: string, version: number) => ipcRenderer.invoke("history:restore", id, version),
  launch: (id: string) => ipcRenderer.invoke("game:launch", id),

  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  openConfigDir: () => ipcRenderer.invoke("shell:openConfigDir"),
  openPath: (p: string) => ipcRenderer.invoke("shell:openPath", p),
  openWeb: () => ipcRenderer.invoke("shell:openWeb"),

  recipesDir: () => ipcRenderer.invoke("recipes:dir"),
  openRecipes: () => ipcRenderer.invoke("recipes:open"),
  reloadRecipes: () => ipcRenderer.invoke("recipes:reload"),
  saveRecipe: (id: string, json: string) => ipcRenderer.invoke("recipes:save", id, json),

  quit: () => ipcRenderer.invoke("app:quit"),
  logError: (text: string) => ipcRenderer.send("log:error", text),
  openLogs: () => ipcRenderer.invoke("log:open"),
  appVersion: () => ipcRenderer.invoke("app:version"),
  portableDir: () => ipcRenderer.invoke("app:portable"),

  onProgress: (cb: (p: any) => void) => ipcRenderer.on("sync:progress", (_e, p) => cb(p)),
  onDone: (cb: (r: any) => void) => ipcRenderer.on("sync:done", (_e, r) => cb(r)),
  onBackground: (cb: () => void) => ipcRenderer.on("sync:background", () => cb()),
});
