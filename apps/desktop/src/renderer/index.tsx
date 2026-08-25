import React, { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";

declare global { interface Window { gsc: any } }
const gsc = () => window.gsc;

const bytes = (n: number) => {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB"]; let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
};

/** "9m ago" answers "recent?", the timestamp beside it answers "which run?". */
const ago = (d: string | number | Date) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

/** "8s", "2m 10s", "1h 4m" — short enough to sit inside a progress line. */
const duration = (secs: number) => {
  const s = Math.round(secs);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const STATUS: Record<string, { label: string; color: string }> = {
  "in-sync": { label: "In sync", color: "var(--accent)" },
  "local-ahead": { label: "Local changes", color: "var(--warn)" },
  "cloud-ahead": { label: "Cloud is newer", color: "#5aa9e6" },
  "conflict": { label: "Conflict", color: "var(--danger)" },
  "never-uploaded": { label: "Not uploaded", color: "var(--warn)" },
  "no-folder": { label: "Folder missing", color: "var(--danger)" },
  "offline": { label: "Offline", color: "var(--muted)" },
  "unknown": { label: "Unknown", color: "var(--muted)" },
};

function Pill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.unknown;
  return <span className="pill" style={{ color: s.color, borderColor: s.color + "66" }}>{s.label}</span>;
}

/* ── setup ──────────────────────────────────────────────────────────── */

function Setup({ onDone }: { onDone: () => void }) {
  const [server, setServer] = useState("https://gamesavecloud.vercel.app");
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true); setErr(null);
    try { await gsc().connect(server, token); onDone(); }
    catch (e: any) { setErr(e.message?.replace(/^Error invoking remote method '[^']+':\s*/, "") ?? "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 420, margin: "80px auto" }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>gamesavecloud</h1>
      <p className="muted" style={{ marginTop: 0 }}>Connect this PC to your save server.</p>
      <div className="panel" style={{ padding: 20, display: "grid", gap: 12 }}>
        <label className="muted" style={{ fontSize: 12 }}>Server URL</label>
        <input value={server} onChange={(e) => setServer(e.target.value)} />
        <label className="muted" style={{ fontSize: 12 }}>GAMESYNC_TOKEN</label>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
          placeholder="64-character token" onKeyDown={(e) => e.key === "Enter" && connect()} />
        {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}
        <button className="primary" onClick={connect} disabled={busy || !token}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
    </div>
  );
}

/* ── library (scan results) ─────────────────────────────────────────── */

/** Ranked guesses for a game whose save folder no recipe knows. */
function FindSaves({ game, onClose, onAdded }: { game: any; onClose: () => void; onAdded: () => void }) {
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    gsc().probe(game.name, game.installDir, game.appId, game.source)
      .then((r: any) => { setRes(r); setBusy(false); })
      .catch(() => setBusy(false));
  }, [game.name]);

  const use = async (p: string) => {
    try { await gsc().addManual(game.name, p); onAdded(); onClose(); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <div className="panel" style={{ padding: 14, marginTop: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>Where does {game.name} save?</strong>
        <button onClick={onClose}>Close</button>
      </div>

      {busy && <p className="muted">Searching Saved Games, Documents, AppData…</p>}

      {!busy && !res?.candidates?.length && (
        <div style={{ marginTop: 8 }}>
          <p className="muted">
            Nothing found. Play the game once so it writes a save, then try again —
            or pick the folder yourself.
          </p>
          <button onClick={async () => {
            const f = await gsc().pickFolder();
            if (f) use(f);
          }}>Pick folder…</button>
        </div>
      )}

      {!busy && res?.candidates?.map((cd: any, i: number) => (
        <div key={cd.path} className="panel" style={{ padding: 10, marginTop: 8 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <strong>#{i + 1}</strong>
                <span className="pill" style={{ color: i === 0 ? "var(--accent)" : "var(--muted)" }}>
                  score {cd.score}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {cd.files} files · {bytes(cd.bytes)} · newest {Math.round((Date.now() - cd.newestMs) / 86400000)}d ago
                </span>
              </div>
              <div className="mono" style={{ marginTop: 4, overflowWrap: "anywhere" }}>{cd.path}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{cd.why.join(", ")}</div>
            </div>
            <button className={i === 0 ? "primary" : ""} onClick={() => use(cd.path)}>Use this</button>
          </div>
        </div>
      ))}

      {!busy && res?.recipe && (
        <div style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Recipe for this game — save it as a .json in your recipes folder, or send it to have it built in
            </span>
            <div className="row" style={{ gap: 6 }}>
              <button onClick={() => { gsc().copy(res.recipe); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                {copied ? "Copied" : "Copy recipe"}
              </button>
              <button onClick={async () => {
                try { setSaved(await gsc().saveRecipe(game.name, res.recipe)); }
                catch (e: any) { alert(e.message); }
              }}>Save recipe</button>
            </div>
          </div>
          {saved && <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>saved to {saved}</div>}
          <pre className="mono muted" style={{
            marginTop: 6, padding: 10, background: "rgba(0,0,0,.25)",
            border: "1px solid var(--line)", borderRadius: 8, overflowX: "auto", fontSize: 11,
          }}>{res.recipe}</pre>
        </div>
      )}
    </div>
  );
}

function Library({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  // games with no save folder are the ones that need attention — never hide them
  const [showAll, setShowAll] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [probing, setProbing] = useState<string | null>(null);

  const scan = async () => {
    setBusy(true);
    // re-read the recipe folder first, so a .json added since launch counts
    await gsc().reloadRecipes();
    const d = await gsc().detect();
    setData(d);
    setBusy(false);
  };

  useEffect(() => { scan(); }, []);

  const add = async (g: any) => {
    setAdding(g.id);
    try { await gsc().add(g); onAdded(); }
    catch (e: any) { alert(e.message); }
    finally { setAdding(null); }
  };

  const addWithFolder = async (g: any) => {
    const folder = await gsc().pickFolder();
    if (!folder) return;
    try { await gsc().addManual(g.name, folder); onAdded(); }
    catch (e: any) { alert(e.message); }
  };

  const tierLabel: Record<string, [string, string]> = {
    "recipe": ["Exact recipe", "var(--accent)"],
    "steam-cloud": ["Steam Cloud folder", "#5aa9e6"],
    "engine": ["Detected by engine", "var(--warn)"],
    "none": ["Save folder unknown", "var(--muted)"],
  };

  const games = (data?.games ?? []).filter((g: any) => showAll || g.savePath);

  return (
    <div style={{ padding: 24 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Detected games</h2>
        <div className="row" style={{ gap: 6 }}>
          <button disabled={busy} onClick={scan}>{busy ? "Scanning…" : "Rescan"}</button>
          <button onClick={onClose}>Back</button>
        </div>
      </div>

      {busy && <p className="muted">Scanning Steam and Epic…</p>}

      {data && (
        <>
          <p className="muted" style={{ fontSize: 13 }}>
            Steam: <span className="mono">{data.steamRoot ?? "not found"}</span> ·{" "}
            Epic: <span className="mono">{data.epicRoot ?? "not found"}</span>
          </p>
          <label className="row muted" style={{ fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" style={{ width: 16 }} checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)} />
            Show games with no save folder found ({(data.games ?? []).filter((g: any) => !g.savePath).length})
          </label>
          {data.epicRoot && !(data.games ?? []).some((g: any) => g.source === "epic") && (
            <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
              Epic manifests were read but listed no installed game. Epic writes them on
              install, so a game moved or installed while the launcher was signed out can
              be missing — reopen the Epic launcher, then Rescan.
            </p>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            {games.map((g: any) => {
              const [tl, tc] = tierLabel[g.tier] ?? tierLabel.none;
              return (
                <div key={g.id + g.source} className="panel" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <strong>{g.name}</strong>
                        <span className="pill muted">{g.source}</span>
                        <span className="pill" style={{ color: tc, borderColor: tc + "66" }}>{tl}</span>
                      </div>
                      <div className="mono muted" style={{ marginTop: 4, overflowWrap: "anywhere" }}>
                        {g.savePath ?? g.reason}
                      </div>
                      {!g.savePath && g.tried?.length > 0 && (
                        <details style={{ marginTop: 4 }}>
                          <summary className="muted" style={{ fontSize: 12, cursor: "pointer" }}>
                            {g.tried.length} folder{g.tried.length === 1 ? "" : "s"} checked
                          </summary>
                          <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
                            {g.tried.map((t: string) => (
                              <div key={t} style={{ overflowWrap: "anywhere" }}>{t}</div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                    <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                      {g.savePath && (
                        <button className="primary" disabled={adding === g.id} onClick={() => add(g)}>
                          {adding === g.id ? "Adding…" : "Sync this"}
                        </button>
                      )}
                      <button onClick={() => setProbing(probing === g.id + g.source ? null : g.id + g.source)}>
                        {g.savePath ? "Other folder…" : "Find saves"}
                      </button>
                    </div>
                  </div>
                  {probing === g.id + g.source && (
                    <FindSaves game={g} onClose={() => setProbing(null)} onAdded={onAdded} />
                  )}
                </div>
              );
            })}
            {games.length === 0 && !busy && <p className="muted">Nothing found.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/* ── history ────────────────────────────────────────────────────────── */

function History({ game, onClose }: { game: any; onClose: () => void }) {
  const [h, setH] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { gsc().history(game.id).then(setH); }, [game.id]);

  const restore = async (v: number) => {
    if (!confirm(`Restore version ${v}?\n\nYour current save is copied to the backups folder first, and this is recorded as a new version — nothing is deleted.`)) return;
    setBusy(true);
    try { await gsc().restore(game.id, v); onClose(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>{game.name} — history</h2>
        <button onClick={onClose}>Back</button>
      </div>
      {!h && <p className="muted">Loading…</p>}
      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        {h?.snapshots?.map((s: any) => (
          <div key={s.id} className="panel row" style={{ padding: "10px 12px", justifyContent: "space-between" }}>
            <div className="row" style={{ gap: 12 }}>
              <strong style={{ width: 44 }}>v{s.version}</strong>
              {s.version === h.currentVersion && <span className="pill" style={{ color: "var(--accent)", borderColor: "var(--accent)66" }}>current</span>}
              {s.pinned && <span className="pill muted">pinned</span>}
              <span className="muted" title={new Date(s.createdAt).toISOString()}>
                {ago(s.createdAt)} · {new Date(s.createdAt).toLocaleString()}
              </span>
              <span className="muted">{bytes(Number(s.totalSize))}</span>
              <span className="muted">{s.device}</span>
            </div>
            {s.version !== h.currentVersion &&
              <button disabled={busy} onClick={() => restore(s.version)}>Restore</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── main ───────────────────────────────────────────────────────────── */

/** Bar, counts, rate and ETA for a running transfer; a plain line for the rest. */
function Progress({ p }: { p: any }) {
  const transferring = p.total > 0 && p.phase !== "finalizing";
  if (!transferring) {
    return <div style={{ color: "var(--accent)", fontSize: 12, marginTop: 4 }}>{p.message}</div>;
  }

  const pct = p.bytesTotal ? Math.min(100, Math.round((p.bytesDone / p.bytesTotal) * 100))
    : Math.round((p.done / p.total) * 100);

  // rate over this transfer, not since the first byte of the whole sync
  const secs = Math.max(0.001, (p.at - p.startedAt) / 1000);
  const moved = Math.max(0, (p.bytesDone ?? 0) - (p.startBytes ?? 0));
  const rate = secs > 0.5 ? moved / secs : 0;
  const left = p.bytesTotal ? Math.max(0, p.bytesTotal - p.bytesDone) : 0;
  const eta = rate > 0 && left > 0 ? left / rate : null;

  const verb = p.phase === "downloading" ? "Downloading" : p.phase === "uploading" ? "Uploading" : "Working";

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", transition: "width .2s" }} />
      </div>
      <div className="row" style={{ gap: 8, fontSize: 12, marginTop: 4, color: "var(--accent)" }}>
        <span>{verb} {p.done}/{p.total}</span>
        {p.bytesTotal > 0 && <span className="muted">{bytes(p.bytesDone)} / {bytes(p.bytesTotal)}</span>}
        {rate > 0 && <span className="muted">{bytes(rate)}/s</span>}
        {eta !== null && <span className="muted">~{duration(eta)} left</span>}
      </div>
      {p.file && (
        <div className="mono muted" style={{ fontSize: 11, marginTop: 2, overflowWrap: "anywhere" }}>{p.file}</div>
      )}
    </div>
  );
}

function StatusLine() {
  const [ver, setVer] = useState("");
  const [portable, setPortable] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<string>("");

  useEffect(() => {
    gsc().appVersion().then(setVer);
    gsc().portableDir().then(setPortable);
    gsc().recipesDir().then(setRecipes);
  }, []);

  return <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
    v{ver} · <span className="pill" style={{ color: "var(--warn)", borderColor: "rgba(232,176,75,.4)" }}>portable</span>{" "}
    {portable
      ? <>settings stored in <span className="mono">{portable}</span> — update by downloading a new zip</>
      : <>running from source — settings stored in the usual config folder</>}
    {recipes && <>
      {" · "}
      <a href="#" style={{ color: "var(--accent)" }} onClick={(e) => { e.preventDefault(); gsc().openRecipes(); }}>
        recipes folder
      </a>
    </>}
  </div>;
}

function App() {
  const [cfg, setCfg] = useState<any>(undefined);
  const [games, setGames] = useState<any[]>([]);
  const [view, setView] = useState<"list" | "library">("list");
  const [historyFor, setHistoryFor] = useState<any>(null);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [syncing, setSyncing] = useState(false);
  const [cloud, setCloud] = useState<any[]>([]);
  const [adopting, setAdopting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const c = await gsc().getConfig();
    setCfg(c);
    if (!c) return;
    setGames(await gsc().status());
    // saves synced from another PC show up here until this one adopts them
    gsc().cloudGames().then(setCloud).catch(() => setCloud([]));
  }, []);

  useEffect(() => {
    refresh();
    gsc().onProgress((p: any) => setProgress((s) => {
      // keep the first sighting of this transfer, so rate is measured over it
      const startedAt = s[p.game]?.phase === p.phase ? s[p.game].startedAt : Date.now();
      const startBytes = s[p.game]?.phase === p.phase ? s[p.game].startBytes ?? 0 : (p.bytesDone ?? 0);
      return { ...s, [p.game]: { ...p, startedAt, startBytes, at: Date.now() } };
    }));
    gsc().onDone(() => { setProgress({}); setSyncing(false); refresh(); });
    gsc().onBackground(() => refresh());
  }, [refresh]);

  const adopt = async (g: any, useFolder?: string) => {
    const folder = useFolder ?? g.suggestedPath ?? await gsc().pickFolder();
    if (!folder) return;
    setAdopting(g.id);
    try { await gsc().adopt(g, folder); await refresh(); }
    catch (e: any) { alert(e.message); }
    finally { setAdopting(null); }
  };

  const syncAll = async () => {
    setSyncing(true);
    try { await gsc().sync({}); } finally { setSyncing(false); refresh(); }
  };

  const syncOne = async (id: string, resolve?: "local" | "remote") => {
    setSyncing(true);
    try { await gsc().sync({ only: id, resolve }); } finally { setSyncing(false); refresh(); }
  };

  const launch = async (id: string) => {
    const r = await gsc().launch(id);
    if (!r.ok && r.reason === "conflict") alert("Resolve the conflict before launching.");
    refresh();
  };

  if (cfg === undefined) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  if (!cfg) return <Setup onDone={refresh} />;
  if (historyFor) return <History game={historyFor} onClose={() => { setHistoryFor(null); refresh(); }} />;
  if (view === "library") return <Library onClose={() => setView("list")} onAdded={refresh} />;

  return (
    <div style={{ padding: 24 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
        <h1 style={{ fontSize: 19, margin: 0 }}>gamesavecloud</h1>
        <div className="row">
          <button onClick={() => gsc().openWeb()}>Web dashboard</button>
          <button title="Close the app" onClick={() => gsc().quit()}>Quit</button>
          <button onClick={() => setView("library")}>Scan for games</button>
          <button className="primary" onClick={syncAll} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync all"}
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        This PC: <strong>{cfg.device}</strong> · <span className="mono">{cfg.server}</span>
      </p>
      <StatusLine />

      {cloud.length > 0 && (
        <div className="panel" style={{ padding: 14, marginTop: 16, borderColor: "rgba(90,169,230,.4)" }}>
          <strong style={{ fontSize: 14 }}>In your cloud, not set up on this PC</strong>
          <div className="muted" style={{ fontSize: 13, margin: "2px 0 10px" }}>
            These have saves in the cloud from another machine. Pick where each one lives
            here and it will be pulled down.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {cloud.map((g) => (
              <div key={g.id} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <strong>{g.name}</strong>
                    {g.source && <span className="pill muted">{g.source}</span>}
                  </div>
                  <div className="mono muted" style={{ fontSize: 12, marginTop: 2, overflowWrap: "anywhere" }}>
                    {g.suggestedPath
                      ?? (g.plannedPath
                        ? `${g.plannedPath} — not created yet`
                        : "no save folder found here — choose one")}
                  </div>
                  {!g.suggestedPath && g.plannedPath && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      The game is installed but has never saved. Restoring creates that
                      folder, the same one it would write to itself.
                    </div>
                  )}
                </div>
                <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                  {(g.suggestedPath || g.plannedPath) && (
                    <button className="primary" disabled={adopting === g.id}
                      onClick={() => adopt(g, g.suggestedPath ?? g.plannedPath)}>
                      {adopting === g.id ? "Setting up…" : g.suggestedPath ? "Set up here" : "Create folder and restore"}
                    </button>
                  )}
                  <button disabled={adopting === g.id} onClick={async () => {
                    const f = await gsc().pickFolder();
                    if (f) adopt(g, f);
                  }}>Choose folder…</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {games.length === 0 && cloud.length === 0 && (
        <div className="panel" style={{ padding: 32, textAlign: "center", marginTop: 20 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>No games yet</p>
          <p className="muted">Scan Steam and Epic to find your installed games.</p>
          <button className="primary" onClick={() => setView("library")}>Scan for games</button>
        </div>
      )}

      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {games.map((g) => (
          <div key={g.id} className="panel" style={{ padding: 14 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <strong>{g.name}</strong>
                  <Pill status={g.status} />
                  {g.running && <span className="pill" style={{ color: "var(--warn)" }}>running</span>}
                  <span className="pill muted">{g.source}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
                  local v{g.localVersion} · cloud v{g.cloudVersion} · {g.localFiles} files · {bytes(g.localSize)}
                </div>
                <div className="mono muted" style={{ marginTop: 3, overflowWrap: "anywhere" }}>{g.path}</div>
                {progress[g.id] && <Progress p={progress[g.id]} />}
              </div>

              <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                {g.appId && <button disabled={g.running} onClick={() => launch(g.id)}>Play</button>}
                <button onClick={() => setHistoryFor(g)}>History</button>
                <button disabled={syncing} onClick={() => syncOne(g.id)}>Sync</button>
              </div>
            </div>

            {g.status === "conflict" && (
              <div className="panel" style={{ padding: 10, marginTop: 10, borderColor: "rgba(229,72,77,.4)" }}>
                <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: 13 }}>
                  This PC and the cloud both changed since the last sync.
                </div>
                <div className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
                  Pick one. The other is kept in history and can be restored later.
                </div>
                <div className="row">
                  <button onClick={() => syncOne(g.id, "local")}>Keep this PC's save</button>
                  <button onClick={() => syncOne(g.id, "remote")}>Keep the cloud save</button>
                </div>
              </div>
            )}

            {g.status === "no-folder" && (
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={async () => {
                  const f = await gsc().pickFolder();
                  if (f) { await gsc().setPath(g.id, f); refresh(); }
                }}>Locate folder…</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {games.length > 0 && (
        <div className="row muted" style={{ marginTop: 20, fontSize: 12, gap: 16 }}>
          <button onClick={() => gsc().openConfigDir()}>Open config &amp; backups folder</button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
