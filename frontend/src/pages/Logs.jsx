// TODO (Phase F): Logs-Daten von GET /api/logs laden (Backend-Route noch nicht vorhanden).
// Aktuell werden MOCK_LOGS mit hartkodiertem Inhalt angezeigt.
// Das hardcodierte Referenzdatum wurde durch Date.now() ersetzt,
// damit Zeitraumfilter auch nach dem 15.08.2026 noch sinnvoll funktionieren.

import { useMemo, useState } from "react";
import {
  LayoutDashboard, Settings as SettingsIcon, Database, Copy, ListMusic,
  Users, Tag, ScrollText, LogOut, ArrowUpDown,
} from "lucide-react";

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

const MOCK_LOGS = [
  { id: 1, timestamp: "2026-08-15T08:12:03", user: "admin", action: "Login", details: "Anmeldung erfolgreich" },
  { id: 2, timestamp: "2026-08-15T08:14:41", user: "admin", action: "Item angelegt", details: "\"Sommerhit 2026\" (ID 4821) in Elemente" },
  { id: 3, timestamp: "2026-08-15T08:20:17", user: "j.schmidt", action: "Cue-Punkt geändert", details: "Fade In auf 00:03.200 gesetzt (\"Sommerhit 2026\")" },
  { id: 4, timestamp: "2026-08-15T08:31:55", user: "j.schmidt", action: "Playlist gespeichert", details: "Stunde 09:00, 14 Einträge" },
  { id: 5, timestamp: "2026-08-14T22:03:12", user: "m.weber", action: "Login", details: "Anmeldung erfolgreich" },
  { id: 6, timestamp: "2026-08-14T22:05:48", user: "m.weber", action: "Item gelöscht", details: "\"Jingle_alt_v2\" (ID 3390) entfernt" },
  { id: 7, timestamp: "2026-08-14T21:47:29", user: "admin", action: "Ordner angelegt", details: "\"Werbung/Q3\" in Elemente-Baum" },
  { id: 8, timestamp: "2026-08-14T19:15:03", user: "j.schmidt", action: "Cue-Punkt geändert", details: "Cue Out auf 03:41.005 gesetzt (\"Herbstregen\")" },
  { id: 9, timestamp: "2026-08-14T18:02:44", user: "m.weber", action: "Playlist gespeichert", details: "Stunde 19:00, 11 Einträge" },
  { id: 10, timestamp: "2026-08-13T14:22:10", user: "admin", action: "Benutzer angelegt", details: "Neuer Benutzer \"t.klein\" mit Rolle Redakteur" },
  { id: 11, timestamp: "2026-08-13T11:08:37", user: "t.klein", action: "Login", details: "Anmeldung erfolgreich" },
  { id: 12, timestamp: "2026-08-13T11:19:52", user: "t.klein", action: "Item angelegt", details: "\"Nachrichten 12 Uhr\" (ID 4822) in Elemente" },
  { id: 13, timestamp: "2026-08-12T09:44:01", user: "m.weber", action: "Item angelegt", details: "\"Wetterbericht Abend\" (ID 4790) in Elemente" },
  { id: 14, timestamp: "2026-08-12T08:55:19", user: "admin", action: "Login", details: "Anmeldung erfolgreich" },
  { id: 15, timestamp: "2026-08-11T16:30:44", user: "j.schmidt", action: "Playlist gespeichert", details: "Stunde 17:00, 9 Einträge" },
];

const ACTIONS = [...new Set(MOCK_LOGS.map((l) => l.action))].sort();

const PERIODS = [
  { value: "today", label: "Heute" },
  { value: "7days", label: "Letzte 7 Tage" },
  { value: "all", label: "Alles" },
];

const inputClass =
  "rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-700";

const formatTimestamp = (iso) => iso.replace("T", "  ");

const isWithinDays = (iso, days, now) => {
  const diffMs = now - new Date(iso);
  return diffMs <= days * 24 * 60 * 60 * 1000;
};

export default function Logs({ onNavigate }) {
  const [actionFilter, setActionFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [sortDir, setSortDir] = useState("desc");

  const filtered = useMemo(() => {
    // Kein hardcodiertes Datum: Date.now() als Referenz für Zeitraumfilter
    const now = new Date();
    return MOCK_LOGS.filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (periodFilter === "today") {
        return new Date(log.timestamp).toDateString() === now.toDateString();
      }
      if (periodFilter === "7days") {
        return isWithinDays(log.timestamp, 7, now);
      }
      return true;
    });
  }, [actionFilter, periodFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered].sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
    return sortDir === "desc" ? arr.reverse() : arr;
  }, [filtered, sortDir]);

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
          <NavItem icon={Tag} label="Gruppen" />
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
        </header>

        {/* Mock-Banner, nur im Dev sichtbar */}
        {import.meta.env.DEV && (
          <div className="border-b border-orange-500/20 bg-orange-500/10 px-6 py-2 text-xs text-orange-400">
            Dev-Modus: Statische Mock-Logs (Phase F: GET /api/logs noch nicht implementiert)
          </div>
        )}

        <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className={inputClass}
          >
            <option value="all">Alle Aktionen</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className={inputClass}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <span className="ml-auto text-xs text-zinc-500">{sorted.length} Einträge</span>
        </div>

        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="overflow-hidden rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-zinc-400">
                  <th className="px-4 py-2.5 font-medium">
                    <button
                      onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                      className="flex items-center gap-1.5 transition-colors hover:text-zinc-200"
                    >
                      Zeitstempel
                      <ArrowUpDown size={13} className={sortDir ? "text-orange-500" : ""} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 font-medium">Benutzer</th>
                  <th className="px-4 py-2.5 font-medium">Aktion</th>
                  <th className="px-4 py-2.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="bg-zinc-950">
                {sorted.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-zinc-800 transition-colors last:border-b-0 hover:bg-zinc-900/50"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-500">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-100">{log.user}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-zinc-100">{log.action}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{log.details}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-600">
                      Keine Einträge für diesen Filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}