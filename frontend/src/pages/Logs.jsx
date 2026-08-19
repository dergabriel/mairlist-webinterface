import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard, Settings as SettingsIcon, Database, Copy, ListMusic,
  Users, Tag, ScrollText, LogOut, RefreshCw,
} from "lucide-react";
import { getLogs } from "../lib/api";

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

const inputClass =
  "rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700";

const pad2 = (n) => String(n).padStart(2, "0");

const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const formatTime = (starttime) => {
  if (!starttime) return "–";
  const match = /(\d{2}):(\d{2}):(\d{2})/.exec(starttime);
  return match ? `${match[1]}:${match[2]}:${match[3]}` : starttime;
};

const formatDuration = (sec) => {
  if (sec == null) return "–";
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}`;
};

const PAGE_SIZE = 200;

export default function Logs({ onNavigate }) {
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [logs, setLogs] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (targetDate) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getLogs({ date: targetDate, limit: PAGE_SIZE, offset: 0 });
      setLogs(rows);
      setOffset(rows.length);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      setError(e.message || "Logs konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const rows = await getLogs({ date, limit: PAGE_SIZE, offset });
      setLogs((prev) => [...prev, ...rows]);
      setOffset((prev) => prev + rows.length);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      setError(e.message || "Logs konnten nicht geladen werden");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-100">
      <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900 px-3 py-4">
        <div className="mb-6 px-2 text-sm font-semibold tracking-wide">
          <span className="text-zinc-100">mAirList</span>{" "}
          <span className="rounded bg-orange-500 px-1.5 py-0.5 text-xs font-bold text-zinc-950">DB</span>
        </div>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Playout</div>
        <nav className="mb-5 space-y-0.5">
          <NavItem icon={LayoutDashboard} label="Übersicht" onClick={() => onNavigate?.("dashboard")} />
          <NavItem icon={SettingsIcon} label="Einstellungen" onClick={() => onNavigate?.("settings")} />
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
          <NavItem icon={Tag} label="Gruppen" onClick={() => onNavigate?.("groups")} />
          <NavItem icon={ScrollText} label="Logs" active onClick={() => onNavigate?.("logs")} />
          <NavItem icon={SettingsIcon} label="Einstellungen" onClick={() => onNavigate?.("settings")} />
        </nav>

        <div className="mt-auto pt-4">
          <NavItem icon={LogOut} label="Abmelden" onClick={() => onNavigate?.("login")} />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
              <ScrollText size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Logs</h1>
          </div>
          <button
            onClick={() => load(date)}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-green-700/60 text-green-500 transition-colors hover:bg-green-600/10"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </header>

        <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
          <span className="ml-auto text-xs text-zinc-500">{logs.length} Einträge</span>
        </div>

        <div className="flex-1 overflow-auto px-6 py-6">
          {error && (
            <div className="mb-4 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">Zeit</th>
                  <th className="px-4 py-2.5 font-medium">Station</th>
                  <th className="px-4 py-2.5 font-medium">Studio</th>
                  <th className="px-4 py-2.5 font-medium">Titel</th>
                  <th className="px-4 py-2.5 font-medium">Dauer</th>
                  <th className="px-4 py-2.5 font-medium">Hörer Start</th>
                  <th className="px-4 py-2.5 font-medium">Hörer Stop</th>
                  <th className="px-4 py-2.5 font-medium">Info</th>
                </tr>
              </thead>
              <tbody className="bg-zinc-950">
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-zinc-600">Lädt…</td>
                  </tr>
                )}
                {!loading && logs.map((log, i) => (
                  <tr
                    key={`${log.starttime}-${i}`}
                    className="border-b border-zinc-800 transition-colors last:border-b-0 hover:bg-zinc-900/50"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">{formatTime(log.starttime)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-100">{log.station}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-100">{log.studio || "–"}</td>
                    <td className="px-4 py-2.5 text-zinc-100">{log.item || "–"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">{formatDuration(log.duration)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">{log.listeners_start ?? "–"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">{log.listeners_stop ?? "–"}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{log.info || "–"}</td>
                  </tr>
                ))}
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-zinc-600">
                      Keine Einträge für diesen Tag
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!loading && hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {loadingMore ? "Lädt…" : "Mehr laden"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
