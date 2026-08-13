import { useState, useMemo, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Settings, Database, Copy, ListMusic,
  Users, Tag, ScrollText, Folder, FolderOpen, ChevronRight,
  ChevronDown, RefreshCw, Plus, Search, Pencil, Trash2, ArrowUpDown,
  AlertTriangle, X, Upload,
} from "lucide-react";
import { getTree, getItems, getStorages, createItem, deleteItem, uploadFile } from "../lib/api";

// --- Helpers ---

const collectDescendants = (folder) =>
  (folder.children || []).reduce(
    (acc, child) => [...acc, child.id, ...collectDescendants(child)],
    []
  );

const findFolder = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findFolder(node.children || [], id);
    if (found) return found;
  }
  return null;
};

const formatDate = (iso) => iso.replace("T", "  ");

const formatLength = (sec) => {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// --- Tree node ---

function TreeNode({ folder, level, expanded, onToggle, activeId, onSelect }) {
  const children = folder.children || [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = activeId === folder.id;

  return (
    <div>
      <button
        onClick={() => { onSelect(folder.id); if (hasChildren) onToggle(folder.id); }}
        className={`group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm transition-colors ${
          isActive
            ? "border-l-2 border-orange-500 bg-zinc-800/60 text-zinc-100"
            : "border-l-2 border-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: `${level * 14 + 8}px` }}
      >
        {hasChildren ? (
          isOpen ? <ChevronDown size={14} className="shrink-0 text-zinc-500" />
                 : <ChevronRight size={14} className="shrink-0 text-zinc-500" />
        ) : (
          <span className="w-[14px] shrink-0" />
        )}
        {folder.special ? (
          <Folder size={15} className="shrink-0 text-zinc-500" />
        ) : isOpen ? (
          <FolderOpen size={15} className="shrink-0 text-orange-500/80" />
        ) : (
          <Folder size={15} className="shrink-0 text-zinc-500" />
        )}
        <span className="truncate">{folder.name}</span>
      </button>
      {hasChildren && isOpen && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id} folder={child} level={level + 1}
              expanded={expanded} onToggle={onToggle}
              activeId={activeId} onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Nav item ---

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

// --- Sortable header cell ---

function Th({ label, sortKey, sort, onSort, className = "" }) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-4 py-3 text-left font-medium text-zinc-400 ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1.5 transition-colors hover:text-zinc-200"
      >
        <span>{label}</span>
        <ArrowUpDown size={12} className={active ? "text-orange-500" : "text-zinc-600"} />
      </button>
    </th>
  );
}

// --- New item types (mirrors server/data/mockData.js ITEM_TYPES) ---

const ITEM_TYPES = [
  { key: "music", label: "Musik" },
  { key: "jingle", label: "Jingle" },
  { key: "advertising", label: "Werbung" },
  { key: "container", label: "Container" },
  { key: "stream", label: "Stream" },
  { key: "dummy", label: "Dummy" },
];

// --- Dialogs ---

const inputClass =
  "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-700";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200">
            <X size={15} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function NewItemDialog({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [type, setType] = useState("music");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onCreate({ title: title.trim(), artist: artist.trim(), type });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title="Neues Element" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Title</span>
          <input
            className={inputClass} value={title} autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel des Elements"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Interpret</span>
          <input
            className={inputClass} value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Interpret"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Type</span>
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            {ITEM_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Element konnte nicht angelegt werden: {error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Abbrechen
          </button>
          <button
            type="submit" disabled={!title.trim() || saving}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {saving ? "Wird angelegt…" : "Anlegen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const AUDIO_ACCEPT = ".wav,.mp3,.aac,.flac,.ogg";

function UploadDialog({ storages, onClose, onUpload }) {
  const [storageId, setStorageId] = useState(storages[0]?.id ?? "");
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!file || !storageId) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload({ file, storageId, title: title.trim() });
    } catch (err) {
      setError(err.message);
      setUploading(false);
    }
  };

  return (
    <Modal title="Datei hochladen" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Storage</span>
          <select
            className={inputClass} value={storageId}
            onChange={(e) => setStorageId(e.target.value)}
          >
            {storages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Audiodatei</span>
          <input
            type="file" accept={AUDIO_ACCEPT} className={inputClass}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Titel (optional)</span>
          <input
            className={inputClass} value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Standard: Dateiname ohne Endung"
          />
        </label>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Upload fehlgeschlagen: {error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Abbrechen
          </button>
          <button
            type="submit" disabled={!file || !storageId || uploading}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {uploading ? "Lädt hoch…" : "Hochladen"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDeleteDialog({ item, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <Modal title="Element löschen" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-300">
          „{item.title}“{item.artist ? `  ·  ${item.artist}` : ""} (ID {item.internalId}) wird endgültig gelöscht.
        </p>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Element konnte nicht gelöscht werden: {error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Abbrechen
          </button>
          <button
            onClick={confirm} disabled={deleting}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {deleting ? "Wird gelöscht…" : "Löschen"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- Main app ---

export default function MairListDB({ onEditItem, onNavigate }) {
  const [tree, setTree] = useState([]);
  const [items, setItems] = useState([]);
  const [storages, setStorages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [expanded, setExpanded] = useState(new Set([20, 30]));
  const [activeFolder, setActiveFolder] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "id", dir: "asc" });
  const [selected, setSelected] = useState(new Set());

  const [showNewItem, setShowNewItem] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([getTree(), getItems(), getStorages()])
      .then(([treeData, itemsData, storagesData]) => {
        setTree(treeData);
        setItems(itemsData);
        setStorages(storagesData);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (data) => {
    const created = await createItem(data);
    setShowNewItem(false);
    await loadData();
    onEditItem?.(created.internalId);
  };

  const handleUpload = async (data) => {
    const created = await uploadFile(data);
    setShowUpload(false);
    await loadData();
    onEditItem?.(created.internalId);
  };

  const handleDelete = async () => {
    await deleteItem(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
  };

  const rootFolder = { id: "all", name: "Alle Elemente", special: true, children: [] };

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const activeFolderName =
    (activeFolder === "all" ? rootFolder : findFolder(tree, activeFolder))?.name || "Alle Elemente";

  const visibleItems = useMemo(() => {
    let list = [...items];

    if (activeFolder !== "all") {
      const folder = findFolder(tree, activeFolder);
      const ids = new Set([activeFolder, ...(folder ? collectDescendants(folder) : [])]);
      list = list.filter((i) => ids.has(i.folderId));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.artist.toLowerCase().includes(q) ||
          i.comment.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let av = a[sort.key], bv = b[sort.key];
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [items, tree, activeFolder, search, sort]);

  const onSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );

  const allChecked = visibleItems.length > 0 && visibleItems.every((i) => selected.has(i.id));
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(visibleItems.map((i) => i.id)));
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

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
          <NavItem icon={Database} label="Elemente" active />
          <NavItem icon={Copy} label="Vorlagen" />
          <NavItem icon={ListMusic} label="Playlist" onClick={() => onNavigate?.("playlist")} />
        </nav>

        <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Administration</div>
        <nav className="space-y-0.5">
          <NavItem icon={Users} label="Benutzer" />
          <NavItem icon={Tag} label="Gruppen" />
          <NavItem icon={ScrollText} label="Logs" />
        </nav>
      </aside>

      {/* Library tree */}
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900/50 py-3 pr-2">
        <TreeNode
          folder={rootFolder} level={0}
          expanded={expanded} onToggle={toggle}
          activeId={activeFolder} onSelect={setActiveFolder}
        />
        {loading && <div className="px-3 py-2 text-sm text-zinc-600">Lade Ordner…</div>}
        {!loading && error && (
          <div className="px-3 py-2 text-sm text-red-500">Baum nicht verfügbar</div>
        )}
        {!loading && !error && tree.map((folder) => (
          <TreeNode
            key={folder.id} folder={folder} level={0}
            expanded={expanded} onToggle={toggle}
            activeId={activeFolder} onSelect={setActiveFolder}
          />
        ))}
      </aside>

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
              <Database size={18} className="text-zinc-950" />
            </div>
            <h1 className="text-lg font-semibold">Datenbank-Verwaltung</h1>
          </div>
          <button
            onClick={loadData}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-green-700/60 text-green-500 transition-colors hover:bg-green-600/10"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </header>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewItem(true)}
              className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500"
            >
              <Plus size={16} />
              <span>Neues Element</span>
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              <Upload size={16} />
              <span>Datei hochladen</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Suchen im Ordner"
                className="w-56 rounded-md border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-700"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400">
              <span>{selected.size} selected</span>
              <ChevronDown size={14} />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 pb-6">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-zinc-950">
              <tr className="border-b border-zinc-800">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox" checked={allChecked} onChange={toggleAll}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-orange-500"
                  />
                </th>
                <Th label="ID" sortKey="id" sort={sort} onSort={onSort} />
                <Th label="Title" sortKey="title" sort={sort} onSort={onSort} />
                <Th label="Typ" sortKey="type" sort={sort} onSort={onSort} />
                <Th label="Länge" sortKey="duration" sort={sort} onSort={onSort} />
                <Th label="Aktualisiert" sortKey="updatedAt" sort={sort} onSort={onSort} />
                <Th label="Kommentar" sortKey="comment" sort={sort} onSort={onSort} />
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm text-zinc-600">
                    Lade Elemente…
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm">
                    <div className="flex flex-col items-center gap-2 text-red-500">
                      <AlertTriangle size={20} />
                      <span>Elemente konnten nicht geladen werden: {error}</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !error && visibleItems.map((item) => (
                <tr key={item.id} className="border-b border-zinc-800/60 transition-colors hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox" checked={selected.has(item.id)} onChange={() => toggleOne(item.id)}
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-orange-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{item.id}</td>
                  <td className="px-4 py-3">
                    <span className="text-zinc-100">{item.title}</span>
                    {item.artist && <span className="text-zinc-500">{"  ·  " + item.artist}</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {capitalize(item.type)}
                    {item.containerType && <span className="text-zinc-600">{` (${capitalize(item.containerType)})`}</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{formatLength(item.duration)}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(item.updatedAt)}</td>
                  <td className="px-4 py-3 text-zinc-500">{item.comment || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEditItem?.(item.internalId)}
                        className="flex h-7 w-7 items-center justify-center rounded bg-green-600 text-white transition-colors hover:bg-green-500"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="flex h-7 w-7 items-center justify-center rounded bg-red-600 text-white transition-colors hover:bg-red-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !error && visibleItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm text-zinc-600">
                    Keine Elemente in „{activeFolderName}“.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {showNewItem && (
        <NewItemDialog onClose={() => setShowNewItem(false)} onCreate={handleCreate} />
      )}
      {showUpload && (
        <UploadDialog storages={storages} onClose={() => setShowUpload(false)} onUpload={handleUpload} />
      )}
      {deleteTarget && (
        <ConfirmDeleteDialog
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
