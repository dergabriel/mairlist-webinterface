import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Music, HardDrive, Folder, Users, RefreshCw, AlertTriangle, Headphones } from "lucide-react";
import { getDashboard, getListeners, getPlaylistsByDate, getPlaylistById } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import Sidebar from "../components/Sidebar";

const pad2 = (n) => String(n).padStart(2, "0");

const formatTime = (value) => {
  if (!value) return "–";
  const match = /(\d{2}):(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : value;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

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

function Panel({ title, children, className = "" }) {
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900 ${className}`}>
      <div className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100">{title}</div>
      {children}
    </div>
  );
}

// Findet aus einer Liste von Playlist-Einträgen (mit scheduledStart) denjenigen,
// dessen Startzeit am nächsten an "jetzt" liegt und in der Vergangenheit liegt.
function findCurrentEntry(entries, now) {
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  let best = null;
  let bestDelta = Infinity;
  for (const entry of entries) {
    const match = /(\d{2}):(\d{2}):(\d{2})/.exec(entry.scheduledStart || "");
    if (!match) continue;
    const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    if (seconds <= nowSeconds) {
      const delta = nowSeconds - seconds;
      if (delta < bestDelta) {
        bestDelta = delta;
        best = entry;
      }
    }
  }
  return best;
}

function findUpcomingEntries(entries, now, count) {
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return entries
    .map((entry) => {
      const match = /(\d{2}):(\d{2}):(\d{2})/.exec(entry.scheduledStart || "");
      if (!match) return null;
      const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      return { entry, seconds };
    })
    .filter((x) => x && x.seconds > nowSeconds)
    .sort((a, b) => a.seconds - b.seconds)
    .slice(0, count)
    .map((x) => x.entry);
}

export default function Dashboard({ onNavigate }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [listeners, setListeners] = useState(null);
  const [hourPlaylists, setHourPlaylists] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAdmin = user?.scopes?.some(
    (s) => s.UserLevel === "Admin" || s?.permissions?.UserLevel === "Admin"
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);

    const now = new Date();
    const date = todayKey();
    const currentHour = now.getHours();
    const hours = Array.from({ length: 8 }, (_, i) => currentHour + i).filter((h) => h < 24);

    return Promise.all([
      getDashboard(),
      getListeners().catch(() => ({ available: false })),
      getPlaylistsByDate(date).catch(() => []),
    ])
      .then(([dashboard, listenerData, dayHours]) => {
        setData(dashboard);
        setListeners(listenerData);

        const hasEntries = new Set(dayHours.filter((h) => h.hasEntries).map((h) => h.hour));
        return Promise.all(
          hours.map((hour) =>
            hasEntries.has(hour)
              ? getPlaylistById(`${date}-${pad2(hour)}`)
                  .then((playlist) => [hour, playlist])
                  .catch(() => [hour, null])
              : Promise.resolve([hour, { entries: [] }])
          )
        );
      })
      .then((results) => {
        const map = {};
        for (const [hour, playlist] of results) map[hour] = playlist;
        setHourPlaylists(map);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  const stats = data?.stats;
  const system = data?.system;

  const now = new Date();
  const currentHour = now.getHours();

  const allUpcomingEntries = useMemo(() => {
    const hours = Object.keys(hourPlaylists)
      .map(Number)
      .sort((a, b) => a - b);
    const entries = [];
    for (const hour of hours) {
      const playlist = hourPlaylists[hour];
      if (playlist?.entries) entries.push(...playlist.entries);
    }
    return entries;
  }, [hourPlaylists]);

  const currentEntry = useMemo(
    () => findCurrentEntry(hourPlaylists[currentHour]?.entries ?? [], now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hourPlaylists, currentHour]
  );

  const upcomingEntries = useMemo(
    () => findUpcomingEntries(allUpcomingEntries, now, 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allUpcomingEntries]
  );

  const hourTiles = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => currentHour + i)
      .filter((h) => h < 24)
      .map((hour) => ({
        hour,
        count: hourPlaylists[hour]?.entries?.length ?? null,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourPlaylists, currentHour]);

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

          <div className="space-y-6">
            {/* Sektion 1: Live-Cockpit */}
            <div className="grid grid-cols-5 gap-6">
              <Panel title="Läuft gerade" className="col-span-3">
                <div className="flex items-center gap-4 px-4 py-4">
                  {currentEntry?.item?.cover ? (
                    <img
                      src={`data:image/jpeg;base64,${currentEntry.item.cover}`}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-orange-500">
                      <Music size={28} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {currentEntry ? (
                      <>
                        <div className="truncate text-lg font-medium text-zinc-100">
                          {currentEntry.item?.title ?? "–"}
                        </div>
                        <div className="truncate text-sm text-zinc-400">{currentEntry.item?.artist || "–"}</div>
                      </>
                    ) : (
                      <div className="text-sm text-zinc-600">
                        {loading ? "Lädt…" : "Gerade läuft nichts Geplantes"}
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              <Panel title="Als Nächstes" className="col-span-2">
                <div className="divide-y divide-zinc-800">
                  {upcomingEntries.length === 0 && (
                    <div className="px-4 py-4 text-sm text-zinc-600">
                      {loading ? "Lädt…" : "Keine kommenden Einträge"}
                    </div>
                  )}
                  {upcomingEntries.map((entry, i) => (
                    <div key={`${entry.itemId}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="shrink-0 tabular-nums text-zinc-500">{formatTime(entry.scheduledStart)}</span>
                      <span className="min-w-0 flex-1 truncate text-zinc-100">
                        {entry.item?.title ?? "–"}
                        {entry.item?.artist && <span className="text-zinc-500"> — {entry.item.artist}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              {listeners?.available && (
                <div className="col-span-5 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4">
                  <Headphones size={20} className="shrink-0 text-orange-500" />
                  <div>
                    <div className="text-2xl font-semibold text-orange-500">{listeners.count}</div>
                    <div className="text-xs text-zinc-400">Aktuelle Hörer</div>
                  </div>
                </div>
              )}
            </div>

            {/* Sektion 2: Sende-Vorschau */}
            <div>
              <div className="mb-2 text-sm text-zinc-400">Sendeplanung — nächste Stunden</div>
              <div className="grid grid-cols-8 gap-3">
                {hourTiles.map(({ hour, count }) => {
                  const empty = count === 0;
                  return (
                    <div
                      key={hour}
                      className={`rounded-lg border px-3 py-3 text-center ${
                        empty ? "border-red-900/60 bg-zinc-900" : "border-zinc-800 bg-zinc-900"
                      }`}
                    >
                      <div className="text-sm font-medium text-zinc-100">{pad2(hour)}:00</div>
                      {empty ? (
                        <div className="mt-1 flex items-center justify-center gap-1 text-xs text-red-500">
                          <AlertTriangle size={12} />
                          <span>Keine Planung</span>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-zinc-400">
                          {count == null ? "…" : `${count} Einträge`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sektion 3: Bibliotheks-Statistiken */}
            <div className="grid grid-cols-4 gap-4">
              <StatTile icon={Music} value={loading ? "…" : stats?.totalItems ?? 0} label="Items" />
              <StatTile icon={HardDrive} value={loading ? "…" : stats?.totalStorages ?? 0} label="Storages" />
              <StatTile icon={Folder} value={loading ? "…" : stats?.totalFolders ?? 0} label="Ordner" />
              <StatTile icon={Users} value={loading ? "…" : stats?.totalUsers ?? 0} label="Benutzer" />
            </div>

            {isAdmin && system?.dbPath && (
              <div className="text-xs text-zinc-600">DB-Pfad: {system.dbPath}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
