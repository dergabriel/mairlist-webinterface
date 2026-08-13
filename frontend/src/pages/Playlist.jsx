import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  LayoutDashboard, Settings, Database, Copy, ListMusic, Users, Tag, ScrollText,
  ChevronLeft, ChevronRight, RefreshCw, Pencil, AlertTriangle, Save, Sliders,
  Plus, Trash2, CalendarDays, GripVertical, Search, Music, Megaphone, Box, X,
  ArrowUp, ArrowDown,
} from "lucide-react";
import {
  getPlaylistsByDate, getPlaylistById, reorderPlaylist,
  insertPlaylistItem, removePlaylistItem, searchItems,
} from "../lib/api";

// --- Helpers ---

const pad2 = (n) => String(n).padStart(2, "0");

const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseDateStr = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const WEEKDAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const formatLongDate = (dateStr) => {
  const d = parseDateStr(dateStr);
  return `${WEEKDAY_NAMES[d.getDay()]}, ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};

const formatLength = (sec) => {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}`;
};

const formatTotalDuration = (sec) => {
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
};

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const TYPE_ICONS = {
  music: { Icon: Music, className: "text-green-500" },
  jingle: { Icon: ListMusic, className: "text-orange-500" },
  container: { Icon: Box, className: "text-blue-500" },
  advertising: { Icon: Megaphone, className: "text-zinc-400" },
};

function TypeIcon({ type }) {
  const entry = TYPE_ICONS[type] || { Icon: Music, className: "text-zinc-500" };
  const { Icon, className } = entry;
  return <Icon size={14} className={className} title={capitalize(type)} />;
}

const inputClass =
  "rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-700";

// --- Nav item (mirrors DatabaseManager/ItemEditor) ---

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

// --- Toolbar button ---

function ToolbarButton({ icon: Icon, label, onClick, disabled, variant = "default" }) {
  const variantClass =
    variant === "primary"
      ? "bg-green-600 text-white hover:bg-green-500 disabled:opacity-50"
      : variant === "danger"
      ? "border border-red-800/60 text-red-500 hover:bg-red-600/10 disabled:opacity-40"
      : "border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variantClass}`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

// --- Go-to date picker popover ---

function GoToDatePopover({ date, onClose, onSelect }) {
  const [value, setValue] = useState(date);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    if (value) onSelect(value);
  };

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-20 mt-2 rounded-md border border-zinc-800 bg-zinc-900 p-3 shadow-xl"
    >
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          type="date"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          className={`${inputClass} py-1.5`}
        />
        <button
          type="submit"
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-500"
        >
          Los
        </button>
      </form>
    </div>
  );
}

// --- Toolbar ---

function Toolbar({
  selectedDate, onDateChange,
  activeHour, hoursWithData, onHourChange,
  onSave, saving, saveError,
  onInsert, onDelete, deleteDisabled,
  loading,
}) {
  const [showGoTo, setShowGoTo] = useState(false);

  const shiftDate = (deltaDays) => {
    const d = parseDateStr(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    onDateChange(toDateStr(d));
  };

  const sortedHours = useMemo(() => [...hoursWithData].sort((a, b) => a - b), [hoursWithData]);

  const shiftHour = (direction) => {
    if (sortedHours.length === 0) return;
    if (activeHour == null) {
      onHourChange(direction > 0 ? sortedHours[0] : sortedHours[sortedHours.length - 1]);
      return;
    }
    const idx = sortedHours.indexOf(activeHour);
    let nextIdx = idx + direction;
    if (nextIdx < 0) nextIdx = sortedHours.length - 1;
    if (nextIdx >= sortedHours.length) nextIdx = 0;
    onHourChange(sortedHours[nextIdx]);
  };

  return (
    <div className="border-b border-zinc-800 px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Date navigation */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shiftDate(-1)}
            aria-label="Vorheriger Tag"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[240px] text-center text-sm font-medium text-zinc-100">
            {formatLongDate(selectedDate)}
          </span>
          <button
            onClick={() => shiftDate(1)}
            aria-label="Nächster Tag"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => onDateChange(toDateStr(new Date()))}
            className="ml-1 rounded-md border border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Heute
          </button>
          <div className="relative">
            <button
              onClick={() => setShowGoTo((v) => !v)}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              title="Gehe zu Datum"
            >
              <CalendarDays size={15} />
            </button>
            {showGoTo && (
              <GoToDatePopover
                date={selectedDate}
                onClose={() => setShowGoTo(false)}
                onSelect={(d) => {
                  onDateChange(d);
                  setShowGoTo(false);
                }}
              />
            )}
          </div>
        </div>

        {/* Hour navigation */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shiftHour(-1)}
            disabled={sortedHours.length === 0}
            aria-label="Vorherige belegte Stunde"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            title="Vorherige belegte Stunde"
          >
            <ChevronLeft size={16} />
          </button>
          <select
            value={activeHour ?? ""}
            onChange={(e) => onHourChange(Number(e.target.value))}
            disabled={sortedHours.length === 0}
            className={`${inputClass} py-1.5 disabled:opacity-40`}
          >
            {sortedHours.length === 0 && <option value="">Keine Stunden</option>}
            {sortedHours.map((h) => (
              <option key={h} value={h}>
                {pad2(h)}:00 Uhr
              </option>
            ))}
          </select>
          <button
            onClick={() => shiftHour(1)}
            disabled={sortedHours.length === 0}
            aria-label="Nächste belegte Stunde"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            title="Nächste belegte Stunde"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ToolbarButton icon={Plus} label="Insert" onClick={onInsert} disabled={activeHour == null} />
          <ToolbarButton icon={Trash2} label="Delete" onClick={onDelete} disabled={deleteDisabled} variant="danger" />
          <ToolbarButton icon={Sliders} label="Mix Editor" disabled />
          <ToolbarButton
            icon={RefreshCw}
            label={loading ? "Lädt…" : "Refresh"}
            onClick={() => onHourChange(activeHour)}
            disabled={activeHour == null}
          />
          <ToolbarButton
            icon={Save}
            label={saving ? "Speichert…" : "Save"}
            onClick={onSave}
            disabled={activeHour == null || saving}
            variant="primary"
          />
        </div>
      </div>
      {saveError && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-500">
          <AlertTriangle size={14} />
          <span>Speichern fehlgeschlagen: {saveError}</span>
        </div>
      )}
    </div>
  );
}

// --- Context menu ---

function ContextMenu({ x, y, onEdit, onDelete, onMoveUp, onMoveDown, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100";

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 w-44 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
    >
      <button className={itemClass} onClick={onEdit}>
        <Pencil size={13} />
        <span>Bearbeiten</span>
      </button>
      <button className={itemClass} onClick={onMoveUp}>
        <ArrowUp size={13} />
        <span>Nach oben</span>
      </button>
      <button className={itemClass} onClick={onMoveDown}>
        <ArrowDown size={13} />
        <span>Nach unten</span>
      </button>
      <div className="my-1 border-t border-zinc-800" />
      <button className={`${itemClass} text-red-500 hover:text-red-400`} onClick={onDelete}>
        <Trash2 size={13} />
        <span>Löschen</span>
      </button>
    </div>
  );
}

// --- Playlist table (main area) ---

function PlaylistTable({
  playlist, loading, error,
  selectedPosition, onSelect, onEditItem,
  onReorder, onDelete,
}) {
  const [dragPosition, setDragPosition] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const totalDuration = useMemo(() => {
    if (!playlist) return 0;
    return playlist.entries.reduce((acc, e) => acc + (e.item?.duration || 0), 0);
  }, [playlist]);

  const moveEntry = (position, direction) => {
    if (!playlist) return;
    const positions = playlist.entries.map((e) => e.position);
    const idx = positions.indexOf(position);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= positions.length) return;
    const next = [...positions];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    onReorder(next);
  };

  const handleDrop = (targetPosition) => {
    if (dragPosition == null || dragPosition === targetPosition || !playlist) {
      setDragPosition(null);
      setDragOverPosition(null);
      return;
    }
    const positions = playlist.entries.map((e) => e.position);
    const from = positions.indexOf(dragPosition);
    const to = positions.indexOf(targetPosition);
    const next = [...positions];
    next.splice(from, 1);
    next.splice(to, 0, dragPosition);
    onReorder(next);
    setDragPosition(null);
    setDragOverPosition(null);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
        Lade Einträge…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm">
        <div className="flex flex-col items-center gap-2 text-red-500">
          <AlertTriangle size={20} />
          <span>Einträge konnten nicht geladen werden: {error}</span>
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-600">
        Stunde wählen, um Einträge anzuzeigen.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-950">
            <tr className="border-b border-zinc-800">
              <th className="w-8 px-2 py-2.5" />
              <th className="w-10 px-2 py-2.5 text-left font-medium text-zinc-400">#</th>
              <th className="px-3 py-2.5 text-left font-medium text-zinc-400">Start</th>
              <th className="px-3 py-2.5 text-left font-medium text-zinc-400">ID</th>
              <th className="px-3 py-2.5 text-left font-medium text-zinc-400">Ext. ID</th>
              <th className="px-3 py-2.5 text-left font-medium text-zinc-400">Titel</th>
              <th className="px-3 py-2.5 text-left font-medium text-zinc-400">Artist</th>
              <th className="w-10 px-3 py-2.5 text-left font-medium text-zinc-400">Typ</th>
              <th className="px-3 py-2.5 text-left font-medium text-zinc-400">Dauer</th>
            </tr>
          </thead>
          <tbody>
            {playlist.entries.map((entry) => {
              const isSelected = selectedPosition === entry.position;
              const isDragOver = dragOverPosition === entry.position;
              return (
                <tr
                  key={entry.position}
                  onClick={() => onSelect(entry.position)}
                  onDoubleClick={() => entry.item && onEditItem?.(entry.item.internalId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onSelect(entry.position);
                    setContextMenu({ x: e.clientX, y: e.clientY, position: entry.position });
                  }}
                  draggable
                  onDragStart={() => setDragPosition(entry.position)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverPosition(entry.position);
                  }}
                  onDragLeave={() => setDragOverPosition((p) => (p === entry.position ? null : p))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(entry.position);
                  }}
                  onDragEnd={() => {
                    setDragPosition(null);
                    setDragOverPosition(null);
                  }}
                  className={`cursor-pointer select-none border-b border-zinc-800/60 transition-colors ${
                    isSelected ? "bg-orange-500/10 hover:bg-orange-500/15" : "hover:bg-zinc-900/50"
                  } ${isDragOver ? "border-t-2 border-t-orange-500" : ""}`}
                >
                  <td className="px-2 py-2.5 text-zinc-600">
                    <GripVertical size={14} className="cursor-grab active:cursor-grabbing" />
                  </td>
                  <td className="px-2 py-2.5 text-zinc-600">{entry.position}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{entry.scheduledStart}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{entry.item?.internalId ?? "-"}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{entry.item?.externalId ?? "-"}</td>
                  <td className="px-3 py-2.5 text-zinc-100">{entry.item?.title || "–"}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{entry.item?.artist || "-"}</td>
                  <td className="px-3 py-2.5">{entry.item && <TypeIcon type={entry.item.type} />}</td>
                  <td className="px-3 py-2.5 text-zinc-400">
                    {entry.item ? formatLength(entry.item.duration) : "-"}
                  </td>
                </tr>
              );
            })}
            {playlist.entries.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-sm text-zinc-600">
                  Keine Einträge für diese Stunde. Über die Suche unten Elemente einfügen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-zinc-800 px-6 py-2.5 text-sm">
        <span className="text-zinc-500">{playlist.entries.length} Einträge</span>
        <span className="text-zinc-400">
          Gesamtlaufzeit <span className="font-medium text-zinc-100">{formatTotalDuration(totalDuration)}</span>
        </span>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onEdit={() => {
            const entry = playlist.entries.find((e) => e.position === contextMenu.position);
            if (entry?.item) onEditItem?.(entry.item.internalId);
            setContextMenu(null);
          }}
          onDelete={() => {
            onDelete(contextMenu.position);
            setContextMenu(null);
          }}
          onMoveUp={() => {
            moveEntry(contextMenu.position, -1);
            setContextMenu(null);
          }}
          onMoveDown={() => {
            moveEntry(contextMenu.position, 1);
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
}

// --- Database search (bottom panel) ---

function SearchPanel({ onInsert, insertDisabled }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      searchItems(query, ["title", "artist", "comment"])
        .then((data) => {
          setResults(data);
          setSearched(true);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
        <Search size={14} className="text-zinc-500" />
        <input
          id="playlist-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Datenbank durchsuchen (Titel, Artist, Kommentar)…"
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X size={13} />
          </button>
        )}
        {insertDisabled && (
          <span className="text-xs text-zinc-600">Stunde wählen, um Ergebnisse einzufügen</span>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-zinc-950">
            <tr className="border-b border-zinc-800">
              <th className="px-4 py-2 text-left font-medium text-zinc-400">ID</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-400">Titel</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-400">Artist</th>
              <th className="w-10 px-4 py-2 text-left font-medium text-zinc-400">Typ</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-400">Dauer</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-600">Suche…</td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-red-500">
                  Suche fehlgeschlagen: {error}
                </td>
              </tr>
            )}
            {!loading && !error && searched && results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-600">Keine Treffer.</td>
              </tr>
            )}
            {!loading && !error && !searched && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-zinc-600">
                  Suchbegriff eingeben, um die Datenbank zu durchsuchen.
                </td>
              </tr>
            )}
            {!loading && !error && results.map((item) => (
              <tr
                key={item.id}
                onDoubleClick={() => !insertDisabled && onInsert(item)}
                title={insertDisabled ? undefined : "Doppelklick zum Einfügen"}
                className={`border-b border-zinc-800/60 transition-colors ${
                  insertDisabled ? "text-zinc-600" : "cursor-pointer hover:bg-zinc-900/50"
                }`}
              >
                <td className="px-4 py-2 text-zinc-500">{item.internalId}</td>
                <td className="px-4 py-2 text-zinc-100">{item.title}</td>
                <td className="px-4 py-2 text-zinc-500">{item.artist || "-"}</td>
                <td className="px-4 py-2">
                  <TypeIcon type={item.type} />
                </td>
                <td className="px-4 py-2 text-zinc-400">{formatLength(item.duration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Main page ---

export default function Playlist({ onEditItem, onNavigate }) {
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [hourSummaries, setHourSummaries] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursError, setHoursError] = useState(null);

  const [activeHour, setActiveHour] = useState(null);
  const [playlist, setPlaylist] = useState(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const hoursWithData = useMemo(() => new Set(hourSummaries.map((s) => s.hour)), [hourSummaries]);

  const loadHours = useCallback((date) => {
    setHoursLoading(true);
    setHoursError(null);
    return getPlaylistsByDate(date)
      .then((summaries) => {
        setHourSummaries(summaries);
        return summaries;
      })
      .catch((err) => {
        setHoursError(err.message);
        return [];
      })
      .finally(() => setHoursLoading(false));
  }, []);

  const loadEntries = useCallback((hour, summaries) => {
    const summary = summaries.find((s) => s.hour === hour);
    if (!summary) {
      setPlaylist(null);
      return Promise.resolve();
    }
    setEntriesLoading(true);
    setEntriesError(null);
    return getPlaylistById(summary.id)
      .then(setPlaylist)
      .catch((err) => setEntriesError(err.message))
      .finally(() => setEntriesLoading(false));
  }, []);

  // Date changed: reload hour summaries, then land on the first available hour.
  useEffect(() => {
    setActiveHour(null);
    setPlaylist(null);
    setSelectedPosition(null);
    loadHours(selectedDate).then((summaries) => {
      if (summaries.length > 0) {
        setActiveHour(summaries[0].hour);
        loadEntries(summaries[0].hour, summaries);
      }
    });
  }, [selectedDate, loadHours, loadEntries]);

  const changeHour = (hour) => {
    setActiveHour(hour);
    setSelectedPosition(null);
    loadEntries(hour, hourSummaries);
  };

  const applyReorder = async (order) => {
    if (!playlist) return;
    const previous = playlist;
    try {
      const updated = await reorderPlaylist(playlist.id, order);
      setPlaylist(updated);
    } catch (err) {
      setPlaylist(previous);
      setEntriesError(err.message);
    }
  };

  const handleDelete = async (position) => {
    const targetPosition = position ?? selectedPosition;
    if (!playlist || targetPosition == null) return;
    try {
      const updated = await removePlaylistItem(playlist.id, targetPosition);
      setPlaylist(updated);
      setSelectedPosition(null);
    } catch (err) {
      setEntriesError(err.message);
    }
  };

  const handleInsertResult = async (item) => {
    if (!playlist) return;
    try {
      const updated = await insertPlaylistItem(playlist.id, {
        itemId: item.id,
        afterPosition: selectedPosition ?? playlist.entries.length,
      });
      setPlaylist(updated);
    } catch (err) {
      setEntriesError(err.message);
    }
  };

  const handleInsertButton = () => {
    document.getElementById("playlist-search-input")?.focus();
  };

  const handleSave = async () => {
    // No pending local-only edits exist yet (every mutation round-trips the
    // API immediately), so Save just re-fetches to confirm server state.
    if (!playlist) return;
    setSaving(true);
    setSaveError(null);
    try {
      const fresh = await getPlaylistById(playlist.id);
      setPlaylist(fresh);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

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
          <NavItem icon={LayoutDashboard} label="Übersicht" />
          <NavItem icon={Settings} label="Einstellungen" />
        </nav>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Datenbank</div>
        <nav className="mb-5 space-y-0.5">
          <NavItem icon={Database} label="Elemente" onClick={() => onNavigate?.("list")} />
          <NavItem icon={Copy} label="Vorlagen" />
          <NavItem icon={ListMusic} label="Playlist" active onClick={() => onNavigate?.("playlist")} />
        </nav>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Administration</div>
        <nav className="space-y-0.5">
          <NavItem icon={Users} label="Benutzer" />
          <NavItem icon={Tag} label="Gruppen" />
          <NavItem icon={ScrollText} label="Logs" />
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
              <ListMusic size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Playlist</h1>
          </div>
        </header>

        {hoursError ? (
          <div className="flex flex-1 items-center justify-center text-sm">
            <div className="flex flex-col items-center gap-2 text-red-500">
              <AlertTriangle size={20} />
              <span>Stunden konnten nicht geladen werden: {hoursError}</span>
            </div>
          </div>
        ) : (
          <>
            <Toolbar
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              activeHour={activeHour}
              hoursWithData={hoursWithData}
              onHourChange={changeHour}
              onSave={handleSave}
              saving={saving}
              saveError={saveError}
              onInsert={handleInsertButton}
              onDelete={() => handleDelete()}
              deleteDisabled={selectedPosition == null}
              loading={hoursLoading || entriesLoading}
            />

            <PlaylistTable
              playlist={playlist}
              loading={entriesLoading}
              error={entriesError}
              selectedPosition={selectedPosition}
              onSelect={setSelectedPosition}
              onEditItem={onEditItem}
              onReorder={applyReorder}
              onDelete={handleDelete}
            />

            <div className="h-[200px] shrink-0 border-t border-zinc-800 bg-zinc-900/30">
              <SearchPanel onInsert={handleInsertResult} insertDisabled={!playlist} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
