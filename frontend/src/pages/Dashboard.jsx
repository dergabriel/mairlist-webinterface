import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LayoutDashboard, Settings, Database, Copy, ListMusic, Users, Tag,
  ScrollText, HardDrive, Clock, RefreshCw, AlertTriangle, LogOut,
} from "lucide-react";
import { getItems, getPlaylistsByDate, getStorages, getPlaylistById } from "../lib/api";

// --- Helpers ---

const pad2 = (n) => String(n).padStart(2, "0");
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const formatDate = (iso) => iso.replace("T", "  ");
const formatHour = (h) => `${pad2(h)}:00`;

// --- Nav item (mirrors DatabaseManager/Playlist) ---

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
      }`}
    >
      <Icon size={16} className={active ? "text-orange-500" : ""} />
      <span>{label}</span>
    </button>
  );
}

// --- Info card ---

function InfoCard({ icon: Icon, label, value, subtitleClass = "text-zinc-400" }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500">
        <Icon size={18} className="text-zinc-950" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-lg font-semibold text-zinc-100">{value}</div>
        <div className={`text-xs ${subtitleClass}`}>{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate, onEditItem }) {
  const [items, setItems] = useState([]);
  const [storages, setStorages] = useState([]);
  const [hourSummaries, setHourSummaries] = useState([]);
  const [upcomingPlaylist, setUpcomingPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    const today = toDateStr(new Date());
    return Promise.all([getItems(), getStorages(), getPlaylistsByDate(today)])
      .then(([itemsData, storagesData, summaries]) => {
        setItems(itemsData);
        setStorages(storagesData);
        setHourSummaries(summaries);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const playlistsToday = useMemo(
    () => hourSummaries.filter((s) => s.hasEntries).length,
    [hourSummaries]
  );

  const lastUpdate = useMemo(() => {
    if (items.length === 0) return "-";
    const latest = items.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
    return formatDate(latest.updatedAt);
  }, [items]);

  const recentItems = useMemo(
    () => [...items].sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1)).slice(0, 5),
    [items]
  );

  const nextHourEntries = useMemo(() => {
    const currentHour = new Date().getHours();
    const summary = hourSummaries.find((s) => s.hour === currentHour && s.hasEntries)
      ?? hourSummaries.find((s) => s.hour > currentHour && s.hasEntries);
    return summary;
  }, [hourSummaries]);

  useEffect(() => {
    if (!nextHourEntries) {
      setUpcomingPlaylist(null);
      return;
    }
    getPlaylistById(nextHourEntries.id).then(setUpcomingPlaylist);
  }, [nextHourEntries]);

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100">
      {/* Nav sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 px-3 py-4">
        <div className="mb-6 px-2 text-sm font-semibold tracking-wide">
          <span className="text-zinc-100">mAirList</span>{" "}
          <span className="rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-zinc-950">DB</span>
        </div>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Playout</div>
        <nav className="mb-5 space-y-0.5">
          <NavItem icon={LayoutDashboard} label="Übersicht" active onClick={() => onNavigate?.("dashboard")} />
          <NavItem icon={Settings} label="Einstellungen" />
        </nav>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Datenbank</div>
        <nav className="mb-5 space-y-0.5">
          <NavItem icon={Database} label="Elemente" onClick={() => onNavigate?.("list")} />
          <NavItem icon={Copy} label="Vorlagen" />
          <NavItem icon={ListMusic} label="Playlist" onClick={() => onNavigate?.("playlist")} />
        </nav>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Administration</div>
        <nav className="space-y-0.5">
          <NavItem icon={Users} label="Benutzer" onClick={() => onNavigate?.("users")} />
          <NavItem icon={Tag} label="Gruppen" />
          <NavItem icon={ScrollText} label="Logs" />
        </nav>

        <div className="mt-auto pt-4">
          <NavItem icon={LogOut} label="Abmelden" onClick={() => onNavigate?.("login")} />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
              <LayoutDashboard size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Übersicht</h1>
          </div>
          <button
            onClick={loadData}
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

          {/* Info cards */}
          <div className="grid grid-cols-5 gap-4">
            <InfoCard icon={Database} label="Elemente gesamt" value={loading ? "…" : items.length} />
            <InfoCard icon={ListMusic} label="Playlists heute" value={loading ? "…" : playlistsToday} />
            <InfoCard icon={HardDrive} label="Storages" value={loading ? "…" : storages.length} />
            <InfoCard icon={Clock} label="Letztes Update" value={loading ? "…" : lastUpdate} />
            <InfoCard icon={Users} label="Hörer" value="--" subtitleClass="text-zinc-600" />
          </div>
          <div className="mb-6 mt-2 text-xs text-zinc-600">
            Hörerzahlen können später über eine externe API eingebunden werden (z.B. Icecast, Radio.co)
          </div>

          {/* Two columns */}
          <div className="mb-6 grid grid-cols-2 gap-6">
            {/* Recent items */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100">
                Letzte Elemente
              </div>
              <div className="divide-y divide-zinc-800">
                {!loading && recentItems.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-zinc-600">Keine Elemente</div>
                )}
                {recentItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onEditItem?.(item.internalId)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-zinc-800/50"
                  >
                    <div className="min-w-0">
                      <span className="truncate text-zinc-100">{item.title}</span>
                      {item.artist && <span className="text-zinc-500">{"  ·  " + item.artist}</span>}
                    </div>
                    <span className="shrink-0 pl-3 text-xs text-zinc-500">{formatDate(item.updatedAt)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Today */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900">
              <div className="border-b border-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100">
                Heute — {nextHourEntries ? formatHour(nextHourEntries.hour) : "-"}
              </div>
              <div className="divide-y divide-zinc-800">
                {!loading && (!upcomingPlaylist || upcomingPlaylist.entries.length === 0) && (
                  <div className="px-4 py-6 text-center text-sm text-zinc-600">Keine Einträge</div>
                )}
                {upcomingPlaylist?.entries.slice(0, 8).map((entry) => (
                  <div key={entry.position} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-12 shrink-0 text-zinc-500">
                      {String(entry.position).padStart(2, "0")}
                    </span>
                    <span className="truncate text-zinc-100">
                      {entry.item?.title ?? "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick access */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate?.("list")}
              className="flex items-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-500"
            >
              <Database size={16} />
              <span>Elemente öffnen</span>
            </button>
            <button
              onClick={() => onNavigate?.("playlist")}
              className="flex items-center gap-2 rounded-md border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              <ListMusic size={16} />
              <span>Playlist öffnen</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
