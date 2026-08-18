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

function Library({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    gsc().detect().then((d: any) => { setData(d); setBusy(false); });
  }, []);

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
        <button onClick={onClose}>Back</button>
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
                    </div>
                    {g.savePath
                      ? <button className="primary" disabled={adding === g.id} onClick={() => add(g)}>
                          {adding === g.id ? "Adding…" : "Sync this"}
                        </button>
                      : <button onClick={() => addWithFolder(g)}>Pick folder…</button>}
                  </div>
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
              <span className="muted">{new Date(s.createdAt).toLocaleString()}</span>
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

function UpdateBanner() {
  const [st, setSt] = useState<any>({ phase: "idle" });
  const [ver, setVer] = useState("");

  useEffect(() => {
    gsc().appVersion().then(setVer);
    gsc().updateState().then(setSt);
    gsc().onUpdateState(setSt);
  }, []);

  if (st.phase === "downloading") {
    return <div className="panel" style={{ padding: "8px 12px", marginBottom: 12, borderColor: "rgba(61,220,151,.4)" }}>
      Downloading update… {st.percent}%
    </div>;
  }
  if (st.phase === "ready") {
    return <div className="panel row" style={{ padding: "8px 12px", marginBottom: 12, borderColor: "rgba(61,220,151,.4)", justifyContent: "space-between" }}>
      <span>Update v{st.version} is ready to install.</span>
      <button className="primary" onClick={() => gsc().installUpdate()}>Restart and update</button>
    </div>;
  }
  if (st.phase === "error") {
    return <div className="panel" style={{ padding: "8px 12px", marginBottom: 12, borderColor: "rgba(229,72,77,.4)" }}>
      <span className="muted">Update check failed: {st.message}</span>
    </div>;
  }
  return <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
    v{ver}
    {" · "}
    <a href="#" style={{ color: "var(--accent)" }} onClick={(e) => { e.preventDefault(); gsc().checkUpdate().then(setSt); }}>
      {st.phase === "checking" ? "checking…" : st.phase === "none" ? "up to date — check again" : "check for updates"}
    </a>
  </div>;
}

function App() {
  const [cfg, setCfg] = useState<any>(undefined);
  const [games, setGames] = useState<any[]>([]);
  const [view, setView] = useState<"list" | "library">("list");
  const [historyFor, setHistoryFor] = useState<any>(null);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const c = await gsc().getConfig();
    setCfg(c);
    if (c) setGames(await gsc().status());
  }, []);

  useEffect(() => {
    refresh();
    gsc().onProgress((p: any) => setProgress((s) => ({ ...s, [p.game]: p.message })));
    gsc().onDone(() => { setProgress({}); setSyncing(false); refresh(); });
    gsc().onBackground(() => refresh());
  }, [refresh]);

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
          <button onClick={() => setView("library")}>Scan for games</button>
          <button className="primary" onClick={syncAll} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync all"}
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        This PC: <strong>{cfg.device}</strong> · <span className="mono">{cfg.server}</span>
      </p>
      <UpdateBanner />

      {games.length === 0 && (
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
                {progress[g.id] && <div style={{ color: "var(--accent)", fontSize: 12, marginTop: 4 }}>{progress[g.id]}</div>}
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
