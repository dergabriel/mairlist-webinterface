import { Fragment, useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ListMusic,
  ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Pencil, AlertTriangle, Save, Sliders,
  Plus, Trash2, CalendarDays, GripVertical, Search, Music, Megaphone, Box, X,
  ArrowUp, ArrowDown, CircleDot, Wand2, Mic, Download, Upload, Layers,
} from "lucide-react";
import {
  getPlaylistsByDate, getPlaylistById, reorderPlaylist,
  insertPlaylistItem, removePlaylistItem, searchItems,
  getTree, getItems, getStorages, getArtists, getItemTypes, getAttributeKeys,
  getFolderChildren, getDashboard, updateContainerContents,
} from "../lib/api";
import { useAppData } from "../lib/AppDataContext";
import { useAuth } from "../lib/AuthContext";
import LibraryTree, { ALL_FILTER, filterItemsByTree } from "../components/LibraryTree";
import Sidebar from "../components/Sidebar";
import { isContainerItem, itemRowClass } from "../lib/itemRowStyle";

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

// --- Toolbar button ---

function ToolbarButton({ icon: Icon, label, onClick, disabled, variant = "default", title }) {
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
      title={title}
      className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
        disabled ? "disabled:text-zinc-600" : ""
      } ${variantClass}`}
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
  onMixEditor, mixEditorDisabled,
  loading,
}) {
  const [showGoTo, setShowGoTo] = useState(false);

  const shiftDate = (deltaDays) => {
    const d = parseDateStr(selectedDate);
    d.setDate(d.getDate() + deltaDays);
    onDateChange(toDateStr(d));
  };

  const allHours = useMemo(() => Array.from({ length: 24 }, (_, h) => h), []);

  const shiftHour = (direction) => {
    if (activeHour == null) {
      onHourChange(direction > 0 ? allHours[0] : allHours[allHours.length - 1]);
      return;
    }
    let nextIdx = activeHour + direction;
    if (nextIdx < 0) nextIdx = allHours.length - 1;
    if (nextIdx >= allHours.length) nextIdx = 0;
    onHourChange(allHours[nextIdx]);
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
            aria-label="Vorherige Stunde"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            title="Vorherige Stunde"
          >
            <ChevronLeft size={16} />
          </button>
          <select
            value={activeHour ?? ""}
            onChange={(e) => onHourChange(Number(e.target.value))}
            className={`${inputClass} py-1.5 disabled:opacity-40`}
          >
            {allHours.map((h) => (
              <option key={h} value={h}>
                {hoursWithData.has(h) ? "● " : "  "}
                {pad2(h)}:00 Uhr
              </option>
            ))}
          </select>
          <button
            onClick={() => shiftHour(1)}
            aria-label="Nächste Stunde"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            title="Nächste Stunde"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <ToolbarButton icon={Wand2} label="Generate" disabled title="Kommt in Phase Mini Scheduler" />
          <ToolbarButton icon={Mic} label="VT" disabled title="Kommt in Phase Voice Tracking" />
          <ToolbarButton icon={Plus} label="Insert" onClick={onInsert} disabled={activeHour == null} />
          <ToolbarButton icon={Trash2} label="Delete" onClick={onDelete} disabled={deleteDisabled} variant="danger" />
          <ToolbarButton icon={Sliders} label="Mix Editor" onClick={onMixEditor} disabled={mixEditorDisabled} />
          <ToolbarButton icon={Download} label="Import" disabled title="Nicht geplant" />
          <ToolbarButton icon={Upload} label="Export" disabled title="Nicht geplant" />
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

// Only Hook-/AutoHookContainer content is editable in this step (see
// docs/MAIRLISTDB-API.md's "Gegenüberstellung" — News-/Region-Container use
// different, not-yet-supported write shapes). containerType carries the raw
// Class string (HookContainer/AutoHookContainer/...), set by
// mapApiItemToInternal / isContainerClass.
const HOOK_CONTAINER_RE = /^(Hook|AutoHook)Container$/;

function isHookContainerItem(item) {
  return HOOK_CONTAINER_RE.test(item?.containerType || "");
}

// --- Container content editor (inline, inside an expanded container row) ---
// Self-contained: its own drag&drop/search/save state, deliberately not
// wired into the main playlist's drag&drop (PlaylistTable's dragPosition/
// dragOverPosition) to avoid cross-talk between the two reorder contexts.

function ContainerEditor({ containerItem, onSaved, onCancel }) {
  const [rows, setRows] = useState(() => containerItem.subItems || []);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      searchItems(query, ["title", "artist"])
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = (item) => {
    setRows((prev) => [...prev, item]);
    setQuery("");
    setResults([]);
  };

  const handleDrop = (targetIndex) => {
    if (dragIndex == null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateContainerContents(
        containerItem.internalId,
        rows.map((r) => r.internalId)
      );
      onSaved(updated);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="border-b border-zinc-800/60 bg-zinc-900/30">
      <td />
      <td colSpan={8} className="py-3 pl-10 pr-4">
        <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Container-Inhalt bearbeiten
          </div>

          {rows.length === 0 && (
            <div className="py-2 text-xs italic text-zinc-600">Keine Elemente</div>
          )}

          <ul className="divide-y divide-zinc-800/60">
            {rows.map((row, index) => (
              <li
                key={`${row.internalId}-${index}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverIndex(index);
                }}
                onDragLeave={() => setDragOverIndex((i) => (i === index ? null : i))}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(index);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={`flex items-center gap-2 py-1.5 text-sm ${
                  dragOverIndex === index ? "border-t-2 border-t-orange-500" : ""
                }`}
              >
                <GripVertical size={13} className="shrink-0 cursor-grab text-zinc-600 active:cursor-grabbing" />
                <span className="w-10 shrink-0 text-zinc-600">{row.internalId ?? "-"}</span>
                <TypeIcon type={row.type} />
                <span className="flex-1 truncate text-zinc-200">{row.title || "-"}</span>
                <span className="text-zinc-500">{row.artist || ""}</span>
                <span className="w-12 shrink-0 text-right text-zinc-500">{formatLength(row.duration || 0)}</span>
                <button
                  onClick={() => removeRow(index)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                  title="Entfernen"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>

          <div className="relative mt-3">
            <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5">
              <Search size={13} className="shrink-0 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Element suchen und hinzufügen…"
                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
              />
            </div>
            {query.trim() && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 shadow-xl">
                {searching && (
                  <div className="px-3 py-2 text-xs text-zinc-600">Suche…</div>
                )}
                {!searching && results.length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-600">Keine Treffer</div>
                )}
                {!searching && results.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    <TypeIcon type={item.type} />
                    <span className="flex-1 truncate">{item.title}</span>
                    <span className="text-xs text-zinc-500">{item.artist}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            {saveError && <span className="mr-auto text-xs text-red-500">Speichern fehlgeschlagen: {saveError}</span>}
            <button
              onClick={onCancel}
              disabled={saving}
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
            >
              {saving ? "Speichert…" : "Speichern"}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// --- Playlist table (main area) ---

// Drag payload MIME type used to recognize an "insert from the library
// panel" drop (as opposed to an internal row-reorder drag, which carries no
// dataTransfer payload at all — see the row's own onDragStart below). Kept
// as a real dataTransfer type (not a side-channel ref) so the browser shows
// the correct drop-allowed cursor and onDragOver can check
// e.dataTransfer.types without needing the dragged item's data yet.
const LIBRARY_ITEM_DRAG_TYPE = "application/x-mairlist-item-id";

function PlaylistTable({
  playlist, loading, error,
  selectedPositions, onSelect, onEditItem,
  onReorder, onDelete, isApiMode, onContainerSaved, onInsertItem,
}) {
  const [dragPosition, setDragPosition] = useState(null);
  const [dragOverPosition, setDragOverPosition] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [expandedPositions, setExpandedPositions] = useState(() => new Set());
  const [editingPosition, setEditingPosition] = useState(null);

  const toggleExpanded = (position) => {
    setExpandedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  };

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

  const handleDrop = (targetPosition, e) => {
    // A drop carrying the library-item MIME type is an "insert from the
    // library panel below" drop, not an internal row reorder — dragPosition
    // stays null for that case (its onDragStart never fires; the drag
    // originates in LibraryPanel instead). Handled as its own branch so it
    // can't be swallowed by the `dragPosition == null` bail-out below.
    if (e?.dataTransfer?.types?.includes(LIBRARY_ITEM_DRAG_TYPE)) {
      setDragOverPosition(null);
      const raw = e.dataTransfer.getData(LIBRARY_ITEM_DRAG_TYPE);
      if (raw) {
        try {
          const item = JSON.parse(raw);
          onInsertItem?.(item, targetPosition);
        } catch {
          // malformed payload — ignore, nothing to insert
        }
      }
      return;
    }

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
              const isSelected = selectedPositions.has(entry.position);
              const isDragOver = dragOverPosition === entry.position;
              const isContainer = isContainerItem(entry.item);
              const isExpanded = isContainer && expandedPositions.has(entry.position);
              const subItems = entry.item?.subItems || [];
              const isEditable = isApiMode && isHookContainerItem(entry.item);
              const isEditing = isEditable && editingPosition === entry.position;
              return (
                <Fragment key={entry.position}>
                <tr
                  onClick={(e) => onSelect(entry.position, e)}
                  onDoubleClick={() =>
                    entry.item &&
                    onEditItem?.(entry.item.internalId, { playlistId: playlist.id, position: entry.position })
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!selectedPositions.has(entry.position)) onSelect(entry.position, e);
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
                    handleDrop(entry.position, e);
                  }}
                  onDragEnd={() => {
                    setDragPosition(null);
                    setDragOverPosition(null);
                  }}
                  className={`cursor-pointer select-none border-b border-zinc-800/60 transition-colors ${
                    isSelected
                      ? "bg-orange-500/20 hover:bg-orange-500/25"
                      : `${itemRowClass(entry.item)} hover:bg-zinc-900/50`
                  } ${isDragOver ? "border-t-2 border-t-orange-500" : ""}`}
                >
                  <td className="px-2 py-2.5 text-zinc-600">
                    <div className="flex items-center gap-1">
                      {isContainer ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(entry.position);
                          }}
                          className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500 hover:text-zinc-200"
                          title={isExpanded ? "Einklappen" : "Aufklappen"}
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <GripVertical size={14} className="cursor-grab active:cursor-grabbing" />
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-zinc-600">{entry.position}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{entry.scheduledStart}</td>
                  <td className="px-3 py-2.5 text-zinc-500">{entry.item?.internalId ?? "-"}</td>
                  <td className="px-3 py-2.5 text-zinc-600">{entry.item?.externalId ?? "-"}</td>
                  <td className="px-3 py-2.5 text-zinc-100">
                    <span className="inline-flex items-center gap-1.5">
                      {isContainerItem(entry.item) && (
                        <Layers
                          size={13}
                          className="shrink-0 text-violet-400"
                          title="Container (enthält weiteren Inhalt)"
                        />
                      )}
                      {entry.item?.title || "–"}
                      {entry.overrides && Object.keys(entry.overrides).length > 0 && (
                        <CircleDot
                          size={9}
                          className="shrink-0 text-orange-500"
                          title="Lokal geändert (nur für diese Stunde)"
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-500">{entry.item?.artist || "-"}</td>
                  <td className="px-3 py-2.5">{entry.item && <TypeIcon type={entry.item.type} />}</td>
                  <td className="px-3 py-2.5 text-zinc-400">
                    {entry.item ? formatLength(entry.item.duration) : "-"}
                  </td>
                </tr>
                {isExpanded && isEditing && (
                  <ContainerEditor
                    containerItem={entry.item}
                    onCancel={() => setEditingPosition(null)}
                    onSaved={(updatedItem) => {
                      setEditingPosition(null);
                      onContainerSaved?.(entry.position, updatedItem);
                    }}
                  />
                )}
                {isExpanded && !isEditing && isEditable && (
                  <tr className="border-b border-zinc-800/60 bg-zinc-900/20">
                    <td colSpan={9} className="py-1.5 pl-12 pr-3">
                      <button
                        onClick={() => setEditingPosition(entry.position)}
                        className="flex items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                      >
                        <Pencil size={12} />
                        <span>Bearbeiten</span>
                      </button>
                    </td>
                  </tr>
                )}
                {isExpanded && !isEditing && subItems.length === 0 && (
                  <tr className="border-b border-zinc-800/60 bg-zinc-900/20">
                    <td colSpan={9} className="py-2 pl-12 pr-3 text-xs italic text-zinc-600">
                      Keine Sub-Elemente
                    </td>
                  </tr>
                )}
                {isExpanded && !isEditing && subItems.map((subItem, subIndex) => (
                  <tr
                    key={`${entry.position}-${subIndex}`}
                    className="border-b border-zinc-800/60 bg-zinc-900/20 text-zinc-400"
                  >
                    <td className="px-2 py-2 text-zinc-700" />
                    <td className="px-2 py-2" />
                    <td className="px-3 py-2 text-zinc-600">-</td>
                    <td className="px-3 py-2">{subItem.internalId ?? "-"}</td>
                    <td className="px-3 py-2">{subItem.externalId ?? "-"}</td>
                    <td className="border-l-2 border-l-zinc-700 py-2 pl-6 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        {isContainerItem(subItem) && (
                          <Layers size={12} className="shrink-0 text-violet-400" />
                        )}
                        {subItem.title || "–"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{subItem.artist || "-"}</td>
                    <td className="px-3 py-2">
                      <TypeIcon type={subItem.type} />
                    </td>
                    <td className="px-3 py-2">{formatLength(subItem.duration)}</td>
                  </tr>
                ))}
                </Fragment>
              );
            })}
            {playlist.entries.length === 0 && (
              <tr
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(LIBRARY_ITEM_DRAG_TYPE)) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(1, e);
                }}
              >
                <td colSpan={9} className="px-4 py-16 text-center text-sm text-zinc-600">
                  Keine Einträge in dieser Stunde
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
            if (entry?.item) {
              onEditItem?.(entry.item.internalId, { playlistId: playlist.id, position: entry.position });
            }
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

// --- Library panel (bottom): tree on the left, filtered item list on the
// right with a search field beneath it that narrows within the tree
// selection (falls back to a full-text DB search when no tree filter is
// picked and a query is typed). ---

function LibraryPanel({ onInsert, insertDisabled }) {
  const [tree, setTree] = useState([]);
  const [items, setItems] = useState([]);
  const [storages, setStorages] = useState([]);
  const [artists, setArtists] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [attributeKeys, setAttributeKeys] = useState([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [filterState, setFilterState] = useState(ALL_FILTER);
  const [folderItems, setFolderItems] = useState(null); // direct items of the selected folder, lazily loaded
  const [folderItemsLoading, setFolderItemsLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const { getCached } = useAppData();

  useEffect(() => {
    setTreeLoading(true);
    setTreeError(null);
    Promise.all([
      getCached("folders", getTree),
      getCached("items", getItems),
      getCached("storages", getStorages),
      getCached("artists", getArtists),
      getCached("types", getItemTypes),
      getCached("attributes", getAttributeKeys),
    ])
      .then(([treeData, itemsData, storagesData, artistsData, typesData, attrData]) => {
        setTree(treeData);
        setItems(itemsData);
        setStorages(storagesData);
        setArtists(artistsData);
        setItemTypes(typesData);
        setAttributeKeys(attrData);
      })
      .catch((err) => setTreeError(err.message))
      .finally(() => setTreeLoading(false));
  }, [getCached]);

  // Lazily load the selected folder's direct items on demand instead of
  // relying on the fully preloaded `items` array, fetched once per folder
  // and cached under folder:${id} (invalidated by any library write).
  useEffect(() => {
    if (filterState.kind !== "folder") {
      setFolderItems(null);
      return;
    }
    let cancelled = false;
    setFolderItemsLoading(true);
    getCached(`folder:${filterState.folderId}`, () => getFolderChildren(filterState.folderId))
      .then((data) => { if (!cancelled) setFolderItems(data.items); })
      .catch(() => { if (!cancelled) setFolderItems([]); })
      .finally(() => { if (!cancelled) setFolderItemsLoading(false); });
    return () => { cancelled = true; };
  }, [filterState, getCached]);

  // Free-text query goes to the search API (title/artist/comment); tree
  // selection alone filters the already-loaded item list client-side.
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    const handle = setTimeout(() => {
      searchItems(query, ["title", "artist", "comment"])
        .then(setSearchResults)
        .catch((err) => setSearchError(err.message))
        .finally(() => setSearchLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const visibleItems = useMemo(() => {
    const base = searchResults != null ? searchResults : items;
    if (filterState.kind === "all" || searchResults != null) return base;
    if (filterState.kind === "folder") {
      // Direct items only, lazily fetched per folder (see effect above) —
      // no longer includes descendant items from the preloaded `items` array.
      return folderItems || [];
    }
    return filterItemsByTree(base, tree, filterState);
  }, [items, tree, filterState, searchResults, folderItems]);

  return (
    <div className="flex h-full">
      <aside className="w-[180px] shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900/50 py-2 pr-1">
        <LibraryTree
          tree={tree} storages={storages} artists={artists}
          itemTypes={itemTypes} attributeKeys={attributeKeys}
          filterState={filterState} onFilterChange={setFilterState}
          expanded={expanded} onExpandedChange={setExpanded}
          loading={treeLoading} error={treeError}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-zinc-950">
              <tr className="border-b border-zinc-800">
                <th className="px-4 py-2 text-left font-medium text-zinc-400">ID</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-400">Ext. ID</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-400">Titel</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-400">Artist</th>
                <th className="w-10 px-4 py-2 text-left font-medium text-zinc-400">Typ</th>
                <th className="px-4 py-2 text-left font-medium text-zinc-400">Dauer</th>
              </tr>
            </thead>
            <tbody>
              {searchLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-600">Suche…</td>
                </tr>
              )}
              {!searchLoading && searchError && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-red-500">
                    Suche fehlgeschlagen: {searchError}
                  </td>
                </tr>
              )}
              {!searchLoading && !searchError && (treeLoading || folderItemsLoading) && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-600">Lade Elemente…</td>
                </tr>
              )}
              {!searchLoading && !searchError && !treeLoading && !folderItemsLoading && visibleItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-600">Keine Treffer.</td>
                </tr>
              )}
              {!searchLoading && !searchError && !treeLoading && !folderItemsLoading && visibleItems.map((item) => (
                <tr
                  key={item.id}
                  draggable={!insertDisabled}
                  onDragStart={(e) => {
                    if (insertDisabled) return;
                    // Full item JSON (not just the id) so the drop target
                    // (PlaylistTable) can insert it without an extra lookup
                    // round-trip — see LIBRARY_ITEM_DRAG_TYPE.
                    e.dataTransfer.setData(LIBRARY_ITEM_DRAG_TYPE, JSON.stringify(item));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onDoubleClick={() => !insertDisabled && onInsert(item)}
                  title={insertDisabled ? undefined : "Doppelklick oder Ziehen zum Einfügen"}
                  className={`border-b border-zinc-800/60 transition-colors ${
                    insertDisabled ? "text-zinc-600" : "cursor-pointer hover:bg-zinc-900/50"
                  }`}
                >
                  <td className="px-4 py-2 text-zinc-500">{item.internalId}</td>
                  <td className="px-4 py-2 text-zinc-600">{item.externalId ?? "-"}</td>
                  <td className="px-4 py-2 text-zinc-100">
                    <span className="inline-flex items-center gap-1.5">
                      {isContainerItem(item) && (
                        <Layers size={13} className="shrink-0 text-violet-400" title="Container" />
                      )}
                      {item.title}
                    </span>
                  </td>
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

        <div className="flex items-center gap-2 border-t border-zinc-800 px-4 py-2">
          <Search size={14} className="text-zinc-500" />
          <input
            id="playlist-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Elemente durchsuchen (Titel, Artist, Kommentar)…"
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
            <span className="text-xs text-zinc-600">Stunde wählen, um Elemente einzufügen</span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main page ---

export default function Playlist({ onEditItem, onNavigate }) {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [hourSummaries, setHourSummaries] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [hoursError, setHoursError] = useState(null);

  const [activeHour, setActiveHour] = useState(null);
  const [playlist, setPlaylist] = useState(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState(null);
  const [selectedPositions, setSelectedPositions] = useState(() => new Set());
  // Last position clicked without Ctrl, used as the single "primary"
  // selection anchor for Insert/Delete (which act on one slot).
  const [selectedPosition, setSelectedPosition] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isApiMode, setIsApiMode] = useState(false);

  useEffect(() => {
    getDashboard()
      .then((data) => setIsApiMode(data?.system?.dataSource === "api"))
      .catch(() => setIsApiMode(false));
  }, []);

  const hoursWithData = useMemo(
    () => new Set(hourSummaries.filter((s) => s.hasEntries).map((s) => s.hour)),
    [hourSummaries]
  );

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

  // Date changed: reload hour summaries, then land on the first hour with
  // entries (falling back to 00:00 if the whole day is empty).
  useEffect(() => {
    setActiveHour(null);
    setPlaylist(null);
    setSelectedPosition(null);
    setSelectedPositions(new Set());
    loadHours(selectedDate).then((summaries) => {
      if (summaries.length > 0) {
        const landingHour = summaries.find((s) => s.hasEntries)?.hour ?? summaries[0].hour;
        setActiveHour(landingHour);
        loadEntries(landingHour, summaries);
      }
    });
  }, [selectedDate, loadHours, loadEntries]);

  const changeHour = (hour) => {
    setActiveHour(hour);
    setSelectedPosition(null);
    setSelectedPositions(new Set());
    loadEntries(hour, hourSummaries);
  };

  // Normal click selects exactly this row; Ctrl/Cmd+click toggles it into
  // (or out of) the current multi-selection.
  const handleSelect = (position, e) => {
    if (e?.ctrlKey || e?.metaKey) {
      setSelectedPositions((prev) => {
        const next = new Set(prev);
        if (next.has(position)) next.delete(position);
        else next.add(position);
        return next;
      });
      setSelectedPosition(position);
      return;
    }
    setSelectedPositions(new Set([position]));
    setSelectedPosition(position);
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
      setSelectedPositions(new Set());
    } catch (err) {
      setEntriesError(err.message);
    }
  };

  const handleMixEditor = () => {
    if (!playlist || selectedPositions.size < 2) return;
    const items = playlist.entries
      .filter((e) => selectedPositions.has(e.position) && e.item)
      .sort((a, b) => a.position - b.position)
      // Flatten each playlist entry into a single object: the global item's
      // fields, with any per-slot overrides layered on top (mirrors
      // ItemEditor's applyOverrides), plus the entry's playlist position —
      // the Mix Editor works with one flat "track" shape, not entry/item pairs.
      .map((e) => ({
        ...e.item,
        cue: { ...e.item.cue, ...(e.overrides?.cue || {}) },
        position: e.position,
      }));
    onNavigate?.("mixeditor", { items, playlistId: playlist.id, hour: activeHour });
  };

  // dropPosition comes from a library-panel drag&drop onto a specific
  // playlist row (see PlaylistTable's onInsertItem); double-click insertion
  // (LibraryPanel's onInsert) omits it and falls back to the current
  // selection, as before.
  const handleInsertResult = async (item, dropPosition) => {
    if (!playlist) return;
    try {
      const updated = await insertPlaylistItem(playlist.id, {
        itemId: item.id,
        afterPosition: dropPosition ?? selectedPosition ?? playlist.entries.length,
      });
      setPlaylist(updated);
    } catch (err) {
      setEntriesError(err.message);
    }
  };

  // After a container's contents are saved, patch just that entry's item in
  // place — cheaper than reloading the whole hour, and consistent with how
  // other mutations here (reorder/insert/remove) already return the updated
  // playlist without a full reload.
  const handleContainerSaved = (position, updatedItem) => {
    if (!playlist) return;
    setPlaylist((prev) => ({
      ...prev,
      entries: prev.entries.map((e) =>
        e.position === position ? { ...e, item: updatedItem } : e
      ),
    }));
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
      <Sidebar activePage="playlist" onNavigate={onNavigate} user={user} />

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
              onMixEditor={handleMixEditor}
              mixEditorDisabled={selectedPositions.size < 2}
              loading={hoursLoading || entriesLoading}
            />

            <PlaylistTable
              playlist={playlist}
              loading={entriesLoading}
              error={entriesError}
              selectedPositions={selectedPositions}
              onSelect={handleSelect}
              onEditItem={onEditItem}
              onReorder={applyReorder}
              onDelete={handleDelete}
              isApiMode={isApiMode}
              onContainerSaved={handleContainerSaved}
              onInsertItem={handleInsertResult}
            />

            <div className="h-[220px] shrink-0 border-t border-zinc-800 bg-zinc-900/30">
              <LibraryPanel onInsert={handleInsertResult} insertDisabled={!playlist} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
