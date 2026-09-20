// Shared container-content editors, used both inline in the Playlist table
// (expanded container row) and as a tab in ItemEditor (Bibliotheks-Ansicht).
// Extracted from Playlist.jsx without behavior changes; each editor renders
// as a <tr>/<td> by default (for the Playlist table) or, with `bare`, as a
// plain <div> (for ItemEditor's non-table tab layout) — the inner content is
// identical either way.
import { useState, useEffect, useMemo } from "react";
import { GripVertical, Search, X, Plus } from "lucide-react";
import {
  searchItems, updateContainerContents, updateRegionContainerContents,
  updateNewsContainerPackaging, updateNewsContainerContent,
} from "../lib/api";
import TypeIcon from "./TypeIcon";

const formatLength = (sec) => {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

// Hook-/AutoHookContainer, RegionContainer and NewsContainer packaging are
// editable (see docs/MAIRLISTDB-API.md's "Gegenüberstellung" — the News-
// Container's actual content, the Inhalt-Tab, is a different, unverified
// write shape and stays out of scope). containerType carries the raw Class
// string (HookContainer/AutoHookContainer/RegionContainer/NewsContainer/...),
// set by mapApiItemToInternal / isContainerClass.
const HOOK_CONTAINER_RE = /^(Hook|AutoHook)Container$/;

export function isHookContainerItem(item) {
  return HOOK_CONTAINER_RE.test(item?.containerType || "");
}

export function isRegionContainerItem(item) {
  return item?.containerType === "RegionContainer";
}

export function isNewsContainerItem(item) {
  return item?.containerType === "NewsContainer";
}

export function isEditableContainerItem(item) {
  return isHookContainerItem(item) || isRegionContainerItem(item) || isNewsContainerItem(item);
}

// --- Shared draggable item-row list, used by both the Hook-Container editor
// (one flat list) and the Region-Container editor (one list per region) ---

function ItemRowList({ rows, onChange }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

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
    onChange(rows.filter((_, i) => i !== index));
  };

  const addItem = (item) => {
    onChange([...rows, item]);
    setQuery("");
    setResults([]);
  };

  const handleDrop = (targetIndex) => {
    if (dragIndex == null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div>
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
    </div>
  );
}

// Wraps `body` in a Playlist-table row (default) or returns it as-is when
// `bare` is set (ItemEditor's plain div layout).
function EditorShell({ bare, body }) {
  if (bare) return body;
  return (
    <tr className="border-b border-zinc-800/60 bg-zinc-900/30">
      <td />
      <td colSpan={8} className="py-3 pl-10 pr-4">
        {body}
      </td>
    </tr>
  );
}

// --- Container content editor (inline, inside an expanded container row, or
// bare inside ItemEditor's tab) --- Self-contained: its own drag&drop/
// search/save state, deliberately not wired into the main playlist's
// drag&drop (PlaylistTable's dragPosition/dragOverPosition) to avoid
// cross-talk between the two reorder contexts.

export function ContainerEditor({ containerItem, onSaved, onCancel, bare }) {
  const [rows, setRows] = useState(() => containerItem.subItems || []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

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

  const body = (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Container-Inhalt bearbeiten
      </div>

      <ItemRowList rows={rows} onChange={setRows} />

      <div className="mt-3 flex items-center justify-end gap-2">
        {saveError && <span className="mr-auto text-xs text-red-500">Speichern fehlgeschlagen: {saveError}</span>}
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            Abbrechen
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
        >
          {saving ? "Speichert…" : "Speichern"}
        </button>
      </div>
    </div>
  );

  return <EditorShell bare={bare} body={body} />;
}

// --- Region-Container content editor (inline or bare) — a tab per region,
// same row-list per tab as the Hook-Container editor. Regions rarely get
// used in practice, so this stays deliberately plain: no "same length for
// all regions" or other comfort features the real mAirList client has. An
// empty region is a valid state, not an error. ---

export function RegionContainerEditor({ containerItem, onSaved, onCancel, bare }) {
  const [regionRows, setRegionRows] = useState(() => ({ ...(containerItem.regions || {}) }));
  const regionKeys = useMemo(
    () => Object.keys(regionRows).sort((a, b) => Number(a) - Number(b)),
    [regionRows]
  );
  const [activeRegion, setActiveRegion] = useState(() => regionKeys[0] || "1");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const addRegion = () => {
    const nextKey = String((regionKeys.reduce((max, k) => Math.max(max, Number(k)), 0)) + 1);
    setRegionRows((prev) => ({ ...prev, [nextKey]: [] }));
    setActiveRegion(nextKey);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const regions = Object.fromEntries(
        Object.entries(regionRows).map(([key, rows]) => [key, rows.map((r) => r.internalId)])
      );
      const updated = await updateRegionContainerContents(containerItem.internalId, regions);
      onSaved(updated);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Regionen-Container bearbeiten
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {regionKeys.map((key) => (
          <button
            key={key}
            onClick={() => setActiveRegion(key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              activeRegion === key
                ? "bg-orange-500/20 text-orange-400"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            Region {key}
          </button>
        ))}
        <button
          onClick={addRegion}
          className="flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          title="Neue Region hinzufügen"
        >
          <Plus size={12} />
          <span>Region</span>
        </button>
      </div>

      {regionKeys.includes(activeRegion) && (
        <ItemRowList
          rows={regionRows[activeRegion] || []}
          onChange={(next) => setRegionRows((prev) => ({ ...prev, [activeRegion]: next }))}
        />
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        {saveError && <span className="mr-auto text-xs text-red-500">Speichern fehlgeschlagen: {saveError}</span>}
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            Abbrechen
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
        >
          {saving ? "Speichert…" : "Speichern"}
        </button>
      </div>
    </div>
  );

  return <EditorShell bare={bare} body={body} />;
}

// --- News-Container editor (inline or bare) — two parts: four fixed role
// rows (Opener/MusicBed/Bumper/Closer, no ordering needed since roles are
// fixed slots, not a list) plus the actual news content (Content.Items, a
// draggable/reorderable list like the Hook-Container editor, via the shared
// ItemRowList). Both parts live in the same API object but under separate
// fields (Items vs. Content.Items, see docs/MAIRLISTDB-API.md's
// "Nachrichten-Container-Inhalt setzen") and are saved together through one
// button: packaging first, then content, each PUT preserving the other's
// current state server-round-trip-side (see apiItems.js's
// updateNewsContainerPackaging/updateNewsContainerContent). ---

const NEWS_ROLES = [
  { key: "Opener", label: "Opener" },
  { key: "MusicBed", label: "Musikbett" },
  { key: "Bumper", label: "Trenner" },
  { key: "Closer", label: "Closer" },
];

function RolePicker({ onPick, onCancel }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

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

  return (
    <div className="relative flex-1">
      <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5">
        <Search size={13} className="shrink-0 text-zinc-500" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Element suchen…"
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
        />
        <button
          onClick={onCancel}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title="Abbrechen"
        >
          <X size={12} />
        </button>
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
              onClick={() => onPick(item)}
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
  );
}

export function NewsContainerEditor({ containerItem, onSaved, onCancel, bare }) {
  const [roleItems, setRoleItems] = useState(() => ({ ...(containerItem.newsRoles || {}) }));
  const [contentRows, setContentRows] = useState(() => containerItem.newsContent || []);
  const [pickingRole, setPickingRole] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const setRole = (role, item) => {
    setRoleItems((prev) => ({ ...prev, [role]: item }));
    setPickingRole(null);
  };

  const clearRole = (role) => {
    setRoleItems((prev) => ({ ...prev, [role]: null }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = Object.fromEntries(
        NEWS_ROLES.map(({ key }) => [key, roleItems[key]?.internalId ?? null])
      );
      // Zwei getrennte PUTs (Verpackung, Inhalt) — jeder übernimmt den
      // jeweils anderen Teil serverseitig unverändert aus dem aktuellen
      // Zustand (siehe apiItems.js), sodass die Reihenfolge hier keine
      // Rolle spielt, solange beide nacheinander abgeschlossen werden.
      await updateNewsContainerPackaging(containerItem.internalId, payload);
      const updated = await updateNewsContainerContent(
        containerItem.internalId,
        contentRows.map((r) => r.internalId)
      );
      onSaved(updated);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Nachrichten-Container-Verpackung bearbeiten
      </div>

      <ul className="divide-y divide-zinc-800/60">
        {NEWS_ROLES.map(({ key, label }) => {
          const item = roleItems[key];
          const isPicking = pickingRole === key;
          return (
            <li key={key} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="w-20 shrink-0 text-zinc-500">{label}</span>
              {isPicking ? (
                <RolePicker onPick={(picked) => setRole(key, picked)} onCancel={() => setPickingRole(null)} />
              ) : item ? (
                <>
                  <TypeIcon type={item.type} />
                  <span className="flex-1 truncate text-zinc-200">{item.title || "-"}</span>
                  <span className="text-zinc-500">{item.artist || ""}</span>
                  <span className="w-12 shrink-0 text-right text-zinc-500">{formatLength(item.duration || 0)}</span>
                  <button
                    onClick={() => setPickingRole(key)}
                    className="rounded-md border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                  >
                    Ändern
                  </button>
                  <button
                    onClick={() => clearRole(key)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                    title="Entfernen"
                  >
                    <X size={13} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-xs italic text-zinc-600">Nicht gesetzt</span>
                  <button
                    onClick={() => setPickingRole(key)}
                    className="rounded-md border border-zinc-800 px-2 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                  >
                    Auswählen
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Nachrichten-Container-Inhalt bearbeiten
      </div>

      <ItemRowList rows={contentRows} onChange={setContentRows} />

      <div className="mt-3 flex items-center justify-end gap-2">
        {saveError && <span className="mr-auto text-xs text-red-500">Speichern fehlgeschlagen: {saveError}</span>}
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          >
            Abbrechen
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
        >
          {saving ? "Speichert…" : "Speichern"}
        </button>
      </div>
    </div>
  );

  return <EditorShell bare={bare} body={body} />;
}
