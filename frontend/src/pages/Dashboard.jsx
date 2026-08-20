import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Music, HardDrive, Folder, Users, RefreshCw, AlertTriangle } from "lucide-react";
import { getDashboard } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Sidebar from "../components/Sidebar";

const pad2 = (n) => String(n).padStart(2, "0");

const formatTime = (value) => {
  if (!value) return "–";
  const match = /(\d{2}):(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}:${match[3]}` : value;
};

const formatDuration = (sec) => {
  if (sec == null) return "–";
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}`;
};

function StatTile({ icon: Icon, value, label }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4">
      <Icon size={20} className="shrink-0 text-orange-500" />
      <div className="min-w-0">
        <div className="text-2xl font-semibold text-orange-500">{value}</div>
        <div className="text-xs text-zinc-400">{label}</div>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100">{title}</div>
      {children}
    </div>
  );
}

function Badge({ ok, children }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        ok ? "bg-green-600/15 text-green-500" : "bg-yellow-600/15 text-yellow-500"
      }`}
    >
      {children}
    </span>
  );
}

export default function Dashboard({ onNavigate }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAdmin = user?.scopes?.some(
    (s) => s.UserLevel === "Admin" || s?.permissions?.UserLevel === "Admin"
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return getDashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = data?.stats;
  const recentLogs = data?.recentLogs ?? [];
  const todayPlaylist = data?.todayPlaylist ?? [];
  const system = data?.system;

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100">
      <Sidebar activePage="dashboard" onNavigate={onNavigate} user={user} />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
              <LayoutDashboard size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Übersicht</h1>
          </div>
          <button
            onClick={load}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-green-700/60 text-green-500 transition-colors hover:bg-green-600/10"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-6 py-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-red-900 bg-zinc-900 px-4 py-3 text-sm text-red-500">
              <AlertTriangle size={14} />
              <span>Daten konnten nicht geladen werden: {error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* Oben links: Statistiken */}
            <div className="grid grid-cols-2 gap-4">
              <StatTile icon={Music} value={loading ? "…" : stats?.totalItems ?? 0} label="Items" />
              <StatTile icon={HardDrive} value={loading ? "…" : stats?.totalStorages ?? 0} label="Storages" />
              <StatTile icon={Folder} value={loading ? "…" : stats?.totalFolders ?? 0} label="Ordner" />
              <StatTile icon={Users} value={loading ? "…" : stats?.totalUsers ?? 0} label="Benutzer" />
            </div>

            {/* Oben rechts: Heutige Playlist */}
            <Panel title="Heutige Playlist">
              <div className="overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="px-4 py-2 font-medium">Zeit</th>
                      <th className="px-4 py-2 font-medium">Titel</th>
                      <th className="px-4 py-2 font-medium">Artist</th>
                      <th className="px-4 py-2 font-medium">Dauer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && todayPlaylist.slice(0, 10).map((entry, i) => (
                      <tr
                        key={`${entry.itemId}-${i}`}
                        className="border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/50"
                      >
                        <td className="whitespace-nowrap px-4 py-2 text-zinc-500">{formatTime(entry.scheduledStart)}</td>
                        <td className="px-4 py-2 text-zinc-100">{entry.item?.title ?? "–"}</td>
                        <td className="px-4 py-2 text-zinc-400">{entry.item?.artist || "–"}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-zinc-400">{formatDuration(entry.item?.duration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!loading && todayPlaylist.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-zinc-600">Keine Playlist für heute</div>
                )}
              </div>
            </Panel>

            {/* Unten links: Letzte Wiedergaben */}
            <Panel title="Letzte Wiedergaben">
              <div className="overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="px-4 py-2 font-medium">Zeit</th>
                      <th className="px-4 py-2 font-medium">Titel</th>
                      <th className="px-4 py-2 font-medium">Station</th>
                      <th className="px-4 py-2 font-medium">Studio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && recentLogs.slice(0, 10).map((log, i) => (
                      <tr
                        key={`${log.starttime}-${i}`}
                        className="border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/50"
                      >
                        <td className="whitespace-nowrap px-4 py-2 text-zinc-500">{formatTime(log.starttime)}</td>
                        <td className="px-4 py-2 text-zinc-100">{log.item || "–"}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-zinc-400">{log.station}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-zinc-400">{log.studio || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!loading && recentLogs.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-zinc-600">Keine Wiedergaben</div>
                )}
              </div>
            </Panel>

            {/* Unten rechts: Systemstatus */}
            <Panel title="Systemstatus">
              <div className="space-y-3 px-4 py-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Data Source</span>
                  <Badge ok={system?.dataSource === "sqlite"}>{system?.dataSource ?? "–"}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Server</span>
                  <Badge ok>Online</Badge>
                </div>
                {isAdmin && system?.dbPath && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-zinc-400">DB-Pfad</span>
                    <span className="truncate text-right text-xs text-zinc-500">{system.dbPath}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Angemeldet als</span>
                  <span className="text-zinc-100">{user?.username ?? "–"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Rolle</span>
                  <span className="text-zinc-100">{isAdmin ? "Administrator" : "Benutzer"}</span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}
