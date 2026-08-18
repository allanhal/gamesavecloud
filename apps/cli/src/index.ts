#!/usr/bin/env -S npx tsx
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import {
  loadConfig, saveConfig, defaultConfig, configPath, loadState, stateKey,
  Api, syncGame, detectGames, toGameConfig, scanDir, manifestHashSync,
  launchGame, waitForExit, isGameRunning,
  type Config, type GameConfig,
} from "@gsc/core";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  b: (s: string) => `\x1b[1m${s}\x1b[0m`,
  g: (s: string) => `\x1b[32m${s}\x1b[0m`,
  y: (s: string) => `\x1b[33m${s}\x1b[0m`,
  r: (s: string) => `\x1b[31m${s}\x1b[0m`,
  c: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const bytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"]; let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
};

const ask = async (q: string) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(q);
  rl.close();
  return a.trim();
};

function need(): Config {
  const cfg = loadConfig();
  if (!cfg) { console.error(c.r("Not set up. Run: gamesync init")); process.exit(1); }
  return cfg;
}

function findGame(cfg: Config, name: string): GameConfig {
  const g = cfg.games.find((x) => x.id === name)
    ?? cfg.games.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!g) { console.error(c.r(`No game "${name}". Run: gamesync list`)); process.exit(1); }
  return g;
}

/* ── commands ──────────────────────────────────────────────────────── */

async function cmdInit(args: string[]) {
  const server = args[0]
    ?? (await ask("Server URL [https://gamesavecloud.vercel.app]: ") || "https://gamesavecloud.vercel.app");
  const token = args[1] ?? await ask("GAMESYNC_TOKEN: ");
  if (!token) { console.error(c.r("A token is required.")); process.exit(1); }

  const cfg = defaultConfig(server, token);
  try {
    const h = await new Api(cfg).health();
    console.log(c.g(`✓ connected — db ${h.db}, bucket ${h.bucket}`));
  } catch (e: any) {
    console.error(c.r(`✗ cannot reach server: ${e.message}`));
    process.exit(1);
  }
  saveConfig(cfg);
  console.log(`Saved ${c.dim(configPath())}`);
  console.log(`Device name: ${c.b(cfg.device)}`);
  console.log(`\nNext: ${c.c("gamesync detect")}`);
}

async function cmdDetect(args: string[]) {
  const cfg = need();
  const all = args.includes("--all");
  const auto = args.includes("--yes");

  console.log(c.dim("scanning Steam and Epic…"));
  const { steamRoot, epicRoot, games } = detectGames();
  console.log(`Steam: ${steamRoot ?? c.dim("not found")}`);
  console.log(`Epic:  ${epicRoot ?? c.dim("not found")}\n`);

  const found = games.filter((g) => all || g.savePath);
  if (!found.length) { console.log(c.y("No games detected.")); return; }

  const tierTag: Record<string, string> = {
    "recipe": c.g("recipe"), "steam-cloud": c.c("steam-cloud"),
    "engine": c.y("engine"), "none": c.dim("no match"),
  };

  for (const g of found) {
    const known = cfg.games.some((x) => x.id === g.id);
    console.log(`${known ? c.dim("[synced]") : "        "} ${c.b(g.name)}  ${tierTag[g.tier]}  ${c.dim(g.source)}`);
    console.log(`          ${g.savePath ? c.dim(g.savePath) : c.dim(g.reason)}`);
  }

  const addable = found.filter((g) => g.savePath && !cfg.games.some((x) => x.id === g.id));
  if (!addable.length) { console.log(`\n${c.dim("Nothing new to add.")}`); return; }

  console.log(`\n${addable.length} game(s) can be added.`);
  if (!auto) {
    const a = await ask("Add them all? [y/N] ");
    if (a.toLowerCase() !== "y") return;
  }
  for (const d of addable) {
    const gc = toGameConfig(d);
    if (gc) { cfg.games.push(gc); console.log(c.g(`+ ${gc.name}`)); }
  }
  saveConfig(cfg);
}

async function cmdAdd(args: string[]) {
  const cfg = need();
  const [name, dir] = args;
  if (!name || !dir) { console.error("usage: gamesync add <name> <save-folder>"); process.exit(1); }
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) { console.error(c.r(`No such folder: ${abs}`)); process.exit(1); }

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (cfg.games.some((g) => g.id === id)) { console.error(c.r(`Already added: ${id}`)); process.exit(1); }

  cfg.games.push({ id, name, path: abs, slot: 0, enabled: true, source: "manual" });
  saveConfig(cfg);
  await new Api(cfg).addGame(id, name).catch(() => {});
  console.log(c.g(`+ ${name}`), c.dim(abs));
}

function cmdList() {
  const cfg = need();
  if (!cfg.games.length) { console.log(c.dim("No games. Run: gamesync detect")); return; }
  for (const g of cfg.games) {
    const ok = fs.existsSync(g.path);
    console.log(`${g.enabled ? c.g("●") : c.dim("○")} ${c.b(g.name)} ${c.dim(`(${g.id}, ${g.source})`)}`);
    console.log(`  ${ok ? c.dim(g.path) : c.r(`${g.path}  — missing`)}`);
  }
}

function cmdRemove(args: string[]) {
  const cfg = need();
  const g = findGame(cfg, args[0] ?? "");
  cfg.games = cfg.games.filter((x) => x.id !== g.id);
  saveConfig(cfg);
  console.log(c.y(`removed ${g.name} from this PC's config (cloud data untouched)`));
}

async function cmdStatus() {
  const cfg = need();
  const api = new Api(cfg);
  const state = loadState();

  for (const g of cfg.games.filter((x) => x.enabled)) {
    const local = fs.existsSync(g.path) ? scanDir(g.path, { include: g.include, exclude: g.exclude }) : [];
    const localHash = local.length ? manifestHashSync(local) : "";
    const prev = state[stateKey(g.id, g.slot)];
    let remote: any = { version: 0, files: [] };
    try { remote = await api.latest(g.id, g.slot); } catch { /* offline */ }
    const remoteHash = remote.files.length ? manifestHashSync(remote.files) : "";

    let label: string;
    if (!fs.existsSync(g.path)) label = c.r("no local folder");
    else if (localHash === remoteHash && remote.version > 0) label = c.g("in sync");
    else if (remote.version === 0) label = c.y("never uploaded");
    else {
      const lc = localHash !== (prev?.syncedManifestHash ?? "");
      const rc = remote.version !== (prev?.syncedVersion ?? 0);
      label = lc && rc ? c.r("CONFLICT") : lc ? c.y("local ahead") : c.c("cloud ahead");
    }
    const size = local.reduce((n, f) => n + f.size, 0);
    console.log(`${label.padEnd(24)} ${c.b(g.name)} ${c.dim(`local v${prev?.syncedVersion ?? 0} · cloud v${remote.version} · ${local.length} files · ${bytes(size)}`)}`);
  }
}

async function cmdSync(args: string[]) {
  const cfg = need();
  const only = args.find((a) => !a.startsWith("-"));
  const resolve = args.includes("--keep-local") ? "local"
    : args.includes("--keep-cloud") ? "remote" : undefined;
  const verbose = args.includes("-v");

  const list = only ? [findGame(cfg, only)] : cfg.games.filter((g) => g.enabled);
  if (!list.length) { console.log(c.dim("Nothing to sync.")); return; }

  let conflicts = 0;
  for (const g of list) {
    process.stdout.write(`${c.b(g.name)} … `);
    try {
      const r = await syncGame(cfg, g, {
        resolve,
        onProgress: (m) => verbose && console.log(`\n  ${c.dim(m)}`),
      });
      switch (r.status) {
        case "in-sync": console.log(c.g(`in sync (v${r.remoteVersion})`)); break;
        case "pushed": console.log(c.g(`pushed v${r.localVersion}`) + c.dim(` — ${r.uploaded} blobs, ${bytes(r.uploadedBytes ?? 0)}`)); break;
        case "pulled": console.log(c.c(`pulled v${r.remoteVersion}`) + c.dim(` — ${r.downloaded} files`)); break;
        case "conflict": {
          conflicts++;
          const l = r.conflict!.local, rm = r.conflict!.remote as any;
          console.log(c.r("CONFLICT"));
          console.log(`  this PC   ${l.files} files  ${bytes(l.size)}`);
          console.log(`  cloud v${rm.version}  ${rm.fileCount ?? rm.files.length} files  ${bytes(Number(rm.totalSize ?? 0))}  ${rm.device ?? ""}`);
          console.log(c.dim(`  resolve: gamesync sync ${g.id} --keep-local | --keep-cloud`));
          break;
        }
        case "no-local-folder": console.log(c.r("no local folder and nothing in cloud")); break;
        case "up-to-date-empty": console.log(c.dim("empty")); break;
      }
    } catch (e: any) {
      console.log(c.r(`failed: ${e.message}`));
    }
  }
  if (conflicts) process.exitCode = 2;
}

async function cmdHistory(args: string[]) {
  const cfg = need();
  const g = findGame(cfg, args[0] ?? "");
  const h = await new Api(cfg).history(g.id, g.slot);
  console.log(`${c.b(g.name)} ${c.dim(`current v${h.currentVersion}`)}`);
  for (const s of h.snapshots) {
    const cur = s.version === h.currentVersion ? c.g(" ← current") : "";
    const pin = s.pinned ? c.c(" [pinned]") : "";
    console.log(`  v${String(s.version).padEnd(4)} ${new Date(s.createdAt).toLocaleString().padEnd(22)} ${bytes(Number(s.totalSize)).padStart(9)}  ${s.device ?? ""}${pin}${cur}`);
  }
}

async function cmdRestore(args: string[]) {
  const cfg = need();
  const g = findGame(cfg, args[0] ?? "");
  const version = Number(args[1]);
  if (!version) { console.error("usage: gamesync restore <game> <version>"); process.exit(1); }

  console.log(c.y(`Restoring ${g.name} to v${version}.`));
  console.log(c.dim("Your current local folder is copied to the backups dir first, and the"));
  console.log(c.dim("restore is recorded as a NEW cloud version — nothing is deleted."));
  if (!args.includes("--yes")) {
    const a = await ask("Continue? [y/N] ");
    if (a.toLowerCase() !== "y") return;
  }
  const api = new Api(cfg);
  const r = await api.rollback(g.id, g.slot, version);
  console.log(c.g(`cloud is now v${r.version} (copy of v${version})`));
  const res = await syncGame(cfg, g, { resolve: "remote", onProgress: (m) => console.log(c.dim(`  ${m}`)) });
  console.log(c.g(`local restored — ${res.downloaded ?? 0} files`));
}

async function cmdLaunch(args: string[]) {
  const cfg = need();
  const g = findGame(cfg, args[0] ?? "");

  if (isGameRunning(g.path)) { console.error(c.r("That game looks like it is already running.")); process.exit(1); }

  console.log(c.dim("syncing down before launch…"));
  const pre = await syncGame(cfg, g, { onProgress: (m) => console.log(c.dim(`  ${m}`)) });
  if (pre.status === "conflict") {
    console.error(c.r("Conflict — resolve before launching:"));
    console.error(c.dim(`  gamesync sync ${g.id} --keep-local | --keep-cloud`));
    process.exit(2);
  }

  // safety copy so a corrupted save is always one restore away
  await syncGame(cfg, g, { resolve: "local", pinned: true }).catch(() => {});

  console.log(c.g(`launching ${g.name}…`));
  launchGame(g);
  const ran = await waitForExit(g.installDir ?? g.path);
  if (!ran) { console.log(c.y("never saw the game process — syncing anyway")); }

  console.log(c.dim("game exited, syncing up…"));
  await new Promise((r) => setTimeout(r, 3000));   // let the last write land
  const post = await syncGame(cfg, g, { onProgress: (m) => console.log(c.dim(`  ${m}`)) });
  console.log(post.status === "pushed" ? c.g(`saved as v${post.localVersion}`) : c.dim(post.status));
}

async function cmdWatch(args: string[]) {
  const cfg = need();
  const idle = Number(args.find((a) => a.startsWith("--idle="))?.split("=")[1] ?? 15) * 1000;
  console.log(c.b("watching") + c.dim(` — syncs ${idle / 1000}s after writes stop, never while a game runs`));

  const lastHash = new Map<string, string>();
  for (;;) {
    for (const g of cfg.games.filter((x) => x.enabled && fs.existsSync(x.path))) {
      if (isGameRunning(g.installDir ?? g.path)) continue;
      const files = scanDir(g.path, { include: g.include, exclude: g.exclude });
      const h = files.length ? manifestHashSync(files) : "";
      const newestWrite = Math.max(0, ...files.map((f) => f.mtimeMs));
      if (Date.now() - newestWrite < idle) continue;
      if (lastHash.get(g.id) === h) continue;

      try {
        const r = await syncGame(cfg, g);
        if (r.status !== "in-sync") console.log(`${new Date().toLocaleTimeString()} ${c.b(g.name)} ${r.status}${r.status === "pushed" ? ` v${r.localVersion}` : ""}`);
        lastHash.set(g.id, h);
      } catch (e: any) {
        console.log(c.r(`${g.name}: ${e.message}`));
      }
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
}

function help() {
  console.log(`${c.b("gamesync")} — self-hosted cloud saves

  ${c.c("init")} [server] [token]     connect this PC to your server
  ${c.c("detect")} [--all] [--yes]    scan Steam and Epic for games
  ${c.c("add")} <name> <folder>       add a game manually
  ${c.c("remove")} <game>             stop syncing a game on this PC
  ${c.c("list")}                      games configured here
  ${c.c("status")}                    cloud vs local for every game
  ${c.c("sync")} [game] [-v]          sync everything (or one game)
       --keep-local | --keep-cloud    resolve a conflict
  ${c.c("history")} <game>            version list
  ${c.c("restore")} <game> <version>  roll back to a version
  ${c.c("launch")} <game>             sync ↓, play, sync ↑
  ${c.c("watch")} [--idle=15]         background sync daemon

config: ${c.dim(configPath())}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const run: Record<string, (a: string[]) => any> = {
  init: cmdInit, detect: cmdDetect, add: cmdAdd, remove: cmdRemove,
  list: cmdList, status: cmdStatus, sync: cmdSync, history: cmdHistory,
  restore: cmdRestore, launch: cmdLaunch, watch: cmdWatch,
};

if (!cmd || cmd === "help" || cmd === "--help") help();
else if (run[cmd]) await run[cmd](rest);
else { console.error(c.r(`unknown command: ${cmd}`)); help(); process.exit(1); }
