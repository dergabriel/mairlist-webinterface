import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, Settings, Database, Copy, ListMusic,
  Users, Tag, ScrollText, Folder, FolderOpen, ChevronDown,
  RefreshCw, Plus, Search, Pencil, Trash2, ArrowUpDown,
  AlertTriangle, X, Upload, HardDrive, Library, Settings2,
  FolderPlus, FolderInput, LogOut,
} from "lucide-react";
import {
  getTree, getItems, getStorages, createItem, deleteItem, uploadFile,
  getArtists, getItemTypes, getAttributeKeys, moveItemToFolder,
  createFolder, renameFolder, moveFolder, deleteFolder, getFolderChildren,
  createStorage, updateStorage, deleteStorage,
} from "../lib/api";
import { useAppData } from "../lib/AppDataContext";
import { useAuth } from "../lib/AuthContext";
import {
  ALL_FILTER, collectFolderAndDescendantIds,
  findFolder, TreeRow, ListSection, AttributesSection,
} from "../components/treeUtils";

// --- Helpers ---

const formatDate = (iso) => iso.replace("T", "  ");

const formatLength = (sec) => {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Mirrors the server's permissionGrantsScope("admin"): UserLevel "Admin",
// GeneralPermissions "All", or LibraryPermissions "All" on any scope blob.
const canManageStorages = (user) =>
  (user?.scopes || []).some(
    (p) => p.UserLevel === "Admin" || p.GeneralPermissions === "All" || p.LibraryPermissions === "All"
  );

// --- Folder inline input (new subfolder / rename) ---

function InlineFolderInput({ level, initialValue = "", onSubmit, onCancel }) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <div
      className="flex items-center gap-1.5 py-1.5 pr-2"
      style={{ paddingLeft: `${level * 14 + 8}px` }}
    >
      <span className="w-[14px] shrink-0" />
      <Folder size={15} className="shrink-0 text-zinc-500" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-700"
      />
    </div>
  );
}

// --- Storage inline input (rename) ---

function InlineStorageInput({ level, initialValue = "", onSubmit, onCancel }) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  };

  return (
    <div
      className="flex items-center gap-1.5 py-1.5 pr-2"
      style={{ paddingLeft: `${level * 14 + 8}px` }}
    >
      <span className="w-[14px] shrink-0" />
      <HardDrive size={15} className="shrink-0 text-zinc-500" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
        }}
        className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-700"
      />
    </div>
  );
}

// --- Storage right-click context menu ---

function StorageContextMenu({ x, y, onClose, onRename, onDelete }) {
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
      className="fixed z-50 w-52 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
    >
      <button className={itemClass} onClick={onRename}>
        <Pencil size={13} />
        <span>Umbenennen</span>
      </button>
      <div className="my-1 border-t border-zinc-800" />
      <button className={`${itemClass} text-red-500 hover:text-red-400`} onClick={onDelete}>
        <Trash2 size={13} />
        <span>Löschen</span>
      </button>
    </div>
  );
}

// --- Folder right-click context menu ---

function FolderContextMenu({ x, y, onClose, onNewSubfolder, onRename, onMove, onDelete }) {
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
      className="fixed z-50 w-52 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 py-1 shadow-xl"
    >
      <button className={itemClass} onClick={onNewSubfolder}>
        <FolderPlus size={13} />
        <span>Neuer Unterordner</span>
      </button>
      <button className={itemClass} onClick={onRename}>
        <Pencil size={13} />
        <span>Umbenennen</span>
      </button>
      <button className={itemClass} onClick={onMove}>
        <FolderInput size={13} />
        <span>Verschieben</span>
      </button>
      <div className="my-1 border-t border-zinc-800" />
      <button className={`${itemClass} text-red-500 hover:text-red-400`} onClick={onDelete}>
        <Trash2 size={13} />
        <span>Löschen</span>
      </button>
    </div>
  );
}

// --- Folder tree branch (virtual folders, expandable, drop targets) ---

function FolderNode({
  folder, level, expanded, onToggle, filterState, onSelect,
  dragOverFolderId, onDragOverFolder, onDragLeaveFolder, onDropOnFolder,
  draggedFolderId, onFolderDragStart, onFolderDragEnd,
  editingState, onContextMenu, onInlineSubmit, onInlineCancel,
}) {
  const children = folder.children || [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = filterState.kind === "folder" && filterState.folderId === folder.id;
  const isDropTarget = !folder.special;
  const isEditingThis = editingState && editingState.folderId === folder.id && editingState.mode === "rename";
  const isAddingChild = editingState && editingState.folderId === folder.id && editingState.mode === "new-child";

  return (
    <div>
      {isEditingThis ? (
        <InlineFolderInput
          level={level}
          initialValue={folder.name}
          onSubmit={(value) => onInlineSubmit(folder.id, "rename", value)}
          onCancel={onInlineCancel}
        />
      ) : (
        <TreeRow
          id={folder.id} label={folder.name} level={level}
          icon={Folder} openIcon={folder.special ? undefined : FolderOpen}
          hasChildren={hasChildren} isOpen={isOpen} isActive={isActive}
          onClick={() => { onSelect(folder.id); if (hasChildren) onToggle(folder.id); }}
          onToggle={hasChildren}
          isDropTarget={isDropTarget}
          isDragOver={dragOverFolderId === folder.id}
          dropHandlers={{
            // dragenter is what reliably marks "over this target" — dragover
            // fires continuously but dragenter/dragleave pairs can outrun it
            // while the pointer crosses child elements (icon, label).
            onDragEnter: (e) => { e.preventDefault(); onDragOverFolder(folder.id); },
            onDragOver: (e) => e.preventDefault(),
            // Only clear when actually leaving the row, not when moving
            // between its children.
            onDragLeave: (e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) onDragLeaveFolder(folder.id);
            },
            onDrop: (e) => { e.preventDefault(); onDropOnFolder(folder.id); },
            ...(isDropTarget
              ? {
                  draggable: true,
                  onDragStart: (e) => {
                    e.dataTransfer.effectAllowed = "move";
                    onFolderDragStart(folder.id);
                  },
                  onDragEnd: onFolderDragEnd,
                }
              : {}),
            ...(isDropTarget ? { onContextMenu: (e) => onContextMenu(e, folder.id) } : {}),
          }}
        />
      )}
      {isAddingChild && (
        <InlineFolderInput
          level={level + 1}
          onSubmit={(value) => onInlineSubmit(folder.id, "new-child", value)}
          onCancel={onInlineCancel}
        />
      )}
      {hasChildren && isOpen && (
        <div>
          {children.map((child) => (
            <FolderNode
              key={child.id} folder={child} level={level + 1}
              expanded={expanded} onToggle={onToggle}
              filterState={filterState} onSelect={onSelect}
              dragOverFolderId={dragOverFolderId}
              onDragOverFolder={onDragOverFolder}
              onDragLeaveFolder={onDragLeaveFolder}
              onDropOnFolder={onDropOnFolder}
              draggedFolderId={draggedFolderId}
              onFolderDragStart={onFolderDragStart}
              onFolderDragEnd={onFolderDragEnd}
              editingState={editingState}
              onContextMenu={onContextMenu}
              onInlineSubmit={onInlineSubmit}
              onInlineCancel={onInlineCancel}
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

// --- Move folder dialog: pick a destination from the full folder tree ---

function MoveFolderPickerNode({ folder, level, disabledIds, selectedId, onSelect }) {
  const children = folder.children || [];
  const disabled = disabledIds.has(folder.id);
  const isSelected = selectedId === folder.id;

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(folder.id)}
        className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm transition-colors ${
          isSelected
            ? "border-l-2 border-orange-500 bg-zinc-800/60 text-zinc-100"
            : disabled
            ? "border-l-2 border-transparent text-zinc-700"
            : "border-l-2 border-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: `${level * 14 + 8}px` }}
      >
        <Folder size={15} className="shrink-0 text-zinc-500" />
        <span className="truncate">{folder.name}</span>
      </button>
      {children.map((child) => (
        <MoveFolderPickerNode
          key={child.id} folder={child} level={level + 1}
          disabledIds={disabledIds} selectedId={selectedId} onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function MoveFolderDialog({ tree, folder, onClose, onMove }) {
  const [selectedId, setSelectedId] = useState(folder.parentId ?? null);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState(null);

  const disabledIds = useMemo(() => new Set(collectFolderAndDescendantIds(folder)), [folder]);

  const confirm = async () => {
    setMoving(true);
    setError(null);
    try {
      await onMove(selectedId);
    } catch (err) {
      setError(err.message);
      setMoving(false);
    }
  };

  const unchanged = selectedId === (folder.parentId ?? null);

  return (
    <Modal title={`„${folder.name}“ verschieben`} onClose={onClose}>
      <div className="space-y-4">
        <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-950 p-2">
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm transition-colors ${
              selectedId === null
                ? "border-l-2 border-orange-500 bg-zinc-800/60 text-zinc-100"
                : "border-l-2 border-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
            }`}
            style={{ paddingLeft: "8px" }}
          >
            <Folder size={15} className="shrink-0 text-zinc-500" />
            <span className="truncate">Folders (Wurzel)</span>
          </button>
          {tree.map((f) => (
            <MoveFolderPickerNode
              key={f.id} folder={f} level={1}
              disabledIds={disabledIds} selectedId={selectedId} onSelect={setSelectedId}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Ordner konnte nicht verschoben werden: {error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Abbrechen
          </button>
          <button
            onClick={confirm} disabled={moving || unchanged}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {moving ? "Wird verschoben…" : "Verschieben"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteFolderDialog({ folder, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const isEmpty = (folder.children || []).length === 0 && !folder.hasItemsHint;

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
    <Modal title="Ordner löschen" onClose={onClose}>
      <div className="space-y-4">
        {isEmpty ? (
          <p className="text-sm text-zinc-300">
            Ordner „{folder.name}“ wird endgültig gelöscht.
          </p>
        ) : (
          <div className="flex items-center gap-2 text-sm text-orange-500">
            <AlertTriangle size={14} />
            <span>Ordner enthält noch Elemente oder Unterordner</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Ordner konnte nicht gelöscht werden: {error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Abbrechen
          </button>
          <button
            onClick={confirm} disabled={deleting || !isEmpty}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {deleting ? "Wird gelöscht…" : "Löschen"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// --- New storage dialog (no <form> tag, plain onChange/onClick handlers) ---

function NewStorageDialog({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), path: path.trim() });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title="Neuer Storage" onClose={onClose}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Name</span>
          <input
            className={inputClass} value={name} autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="Name des Storage"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400">Pfad</span>
          <input
            className={inputClass} value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="z. B. D:\Audios oder \\Server\Freigabe"
          />
        </label>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>Storage konnte nicht angelegt werden: {error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Abbrechen
          </button>
          <button
            type="button" onClick={submit} disabled={!name.trim() || saving}
            className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
          >
            {saving ? "Wird angelegt…" : "Speichern"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDeleteStorageDialog({ storage, onClose, onConfirm }) {
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
    <Modal title="Storage löschen" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-300">
          Storage „{storage.name}“ wirklich löschen?
        </p>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle size={14} />
            <span>{error}</span>
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
  const [artists, setArtists] = useState([]);
  const [itemTypes, setItemTypes] = useState([]);
  const [attributeKeys, setAttributeKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [expanded, setExpanded] = useState(new Set([20, 30]));
  const [filterState, setFilterState] = useState(ALL_FILTER);
  const [folderItems, setFolderItems] = useState(null); // direct items of the selected folder, lazily loaded
  const [folderItemsLoading, setFolderItemsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOptions, setSearchOptions] = useState({
    scope: "library", // "library" | "view"
    fields: { title: true, artist: true, comment: true },
    fullText: true,
  });
  const [showSearchOptions, setShowSearchOptions] = useState(false);
  const [sort, setSort] = useState({ key: "id", dir: "asc" });
  const [selected, setSelected] = useState(new Set());

  const [showNewItem, setShowNewItem] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [dragItemId, setDragItemId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [draggedFolderId, setDraggedFolderId] = useState(null);

  const [folderContextMenu, setFolderContextMenu] = useState(null); // { x, y, folderId }
  const [editingFolder, setEditingFolder] = useState(null); // { folderId, mode: "rename" | "new-child" }
  const [moveFolderTarget, setMoveFolderTarget] = useState(null); // folder node
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null); // folder node
  const [folderError, setFolderError] = useState(null);

  const [showNewStorage, setShowNewStorage] = useState(false);
  const [storageContextMenu, setStorageContextMenu] = useState(null); // { x, y, storageId }
  const [editingStorageId, setEditingStorageId] = useState(null);
  const [deleteStorageTarget, setDeleteStorageTarget] = useState(null); // storage
  const [storageError, setStorageError] = useState(null);

  const { getCached, invalidate } = useAppData();
  const { user } = useAuth();
  const canManageStorage = canManageStorages(user);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
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
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [getCached]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const handleCreate = async (data) => {
    const created = await createItem(data);
    setShowNewItem(false);
    invalidate("items");
    invalidate("folder:*");
    await loadData();
    onEditItem?.(created.internalId);
  };

  const handleUpload = async (data) => {
    const created = await uploadFile(data);
    setShowUpload(false);
    invalidate("items");
    invalidate("folder:*");
    await loadData();
    onEditItem?.(created.internalId);
  };

  const handleDelete = async () => {
    await deleteItem(deleteTarget.id);
    setDeleteTarget(null);
    invalidate("items");
    invalidate("folder:*");
    await loadData();
  };

  const handleDropOnFolder = async (folderId) => {
    setDragOverFolderId(null);
    const itemId = dragItemId;
    const sourceFolderId = draggedFolderId;
    setDragItemId(null);
    setDraggedFolderId(null);

    if (sourceFolderId != null) {
      if (sourceFolderId === folderId) return;
      const sourceFolder = findFolder(tree, sourceFolderId);
      if (sourceFolder && collectFolderAndDescendantIds(sourceFolder).includes(folderId)) {
        setFolderError("Ordner kann nicht in sich selbst oder einen Unterordner verschoben werden");
        return;
      }
      try {
        await moveFolder(sourceFolderId, folderId);
        invalidate("folders");
        invalidate("folder:*");
        await loadData();
      } catch (err) {
        setFolderError(err.message);
      }
      return;
    }

    if (!itemId) return;
    await moveItemToFolder(itemId, folderId);
    invalidate("items");
    invalidate("folder:*");
    await loadData();
  };

  const handleNewRootFolder = () => setEditingFolder({ folderId: "root", mode: "new-child" });

  const handleFolderContextMenu = (e, folderId) => {
    e.preventDefault();
    setFolderContextMenu({ x: e.clientX, y: e.clientY, folderId });
  };

  const handleInlineFolderSubmit = async (folderId, mode, value) => {
    setEditingFolder(null);
    try {
      if (mode === "rename") {
        await renameFolder(folderId, value);
      } else {
        const parentId = folderId === "root" ? null : folderId;
        await createFolder(value, parentId);
        if (parentId != null) setExpanded((prev) => new Set(prev).add(parentId));
      }
      invalidate("folders");
      invalidate("folder:*");
      await loadData();
    } catch (err) {
      setFolderError(err.message);
    }
  };

  const handleMoveFolder = async (newParentId) => {
    await moveFolder(moveFolderTarget.id, newParentId);
    setMoveFolderTarget(null);
    invalidate("folders");
    invalidate("folder:*");
    await loadData();
  };

  const handleDeleteFolder = async () => {
    await deleteFolder(deleteFolderTarget.id);
    setDeleteFolderTarget(null);
    invalidate("folders");
    invalidate("folder:*");
    await loadData();
  };

  const handleCreateStorage = async ({ name, path }) => {
    await createStorage(name, path);
    setShowNewStorage(false);
    invalidate("storages");
    invalidate("tree");
    await loadData();
  };

  const handleStorageContextMenu = (e, storageId) => {
    e.preventDefault();
    setStorageContextMenu({ x: e.clientX, y: e.clientY, storageId });
  };

  const handleRenameStorage = async (storageId, name) => {
    setEditingStorageId(null);
    const storage = storages.find((s) => s.id === storageId);
    try {
      await updateStorage(storageId, name, storage?.location || "");
      invalidate("storages");
      invalidate("tree");
      await loadData();
    } catch (err) {
      setStorageError(err.message);
    }
  };

  const handleDeleteStorage = async () => {
    try {
      await deleteStorage(deleteStorageTarget.id);
      setDeleteStorageTarget(null);
      invalidate("storages");
      invalidate("tree");
      await loadData();
    } catch (err) {
      if (err.status === 409) {
        throw new Error("Dieser Storage enthält noch Items und kann nicht gelöscht werden.");
      }
      throw err;
    }
  };

  const rootFolder = { id: "all", name: "Alle Elemente", special: true, children: [] };

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectFolder = (folderId) =>
    setFilterState(folderId === "all" ? ALL_FILTER : { kind: "folder", folderId });
  const selectArtist = (artist) => setFilterState({ kind: "artist", artist });
  const selectType = (type) => setFilterState({ kind: "type", type });
  const selectStorage = (storageId) => setFilterState({ kind: "storage", storageId });
  const selectAttribute = (attributeKey, attributeValue) =>
    setFilterState({ kind: "attribute", attributeKey, attributeValue });
  const selectEverything = () => setFilterState({ kind: "everything" });

  const activeFolderName =
    filterState.kind === "folder"
      ? findFolder(tree, filterState.folderId)?.name || "Alle Elemente"
      : filterState.kind === "artist" ? filterState.artist
      : filterState.kind === "type" ? capitalize(filterState.type)
      : filterState.kind === "storage" ? storages.find((s) => s.id === filterState.storageId)?.name || "Storage"
      : filterState.kind === "attribute" ? `${filterState.attributeKey}: ${filterState.attributeValue}`
      : filterState.kind === "everything" ? "Everything"
      : "Alle Elemente";

  const filteredByTree = useMemo(() => {
    let list = [...items];

    if (filterState.kind === "folder") {
      // Direct items only, lazily fetched per folder (see effect above) —
      // no longer includes descendant items from the preloaded `items` array.
      list = folderItems || [];
    } else if (filterState.kind === "artist") {
      list = list.filter((i) => i.artist === filterState.artist);
    } else if (filterState.kind === "type") {
      list = list.filter((i) => i.type === filterState.type);
    } else if (filterState.kind === "storage") {
      list = list.filter((i) => i.storageId === filterState.storageId);
    } else if (filterState.kind === "attribute") {
      list = list.filter(
        (i) => String(i.attributes?.[filterState.attributeKey] ?? "") === filterState.attributeValue
      );
    }
    // "all" and "everything" both mean unfiltered.

    return list;
  }, [items, tree, filterState, folderItems]);

  const visibleItems = useMemo(() => {
    // Advanced search: scope "view" searches within the tree-filtered list,
    // scope "library" searches the whole library regardless of the active
    // tree node.
    let list = search.trim()
      ? searchOptions.scope === "view" ? filteredByTree : [...items]
      : filteredByTree;

    if (search.trim()) {
      const q = search.toLowerCase();
      const fields = Object.entries(searchOptions.fields)
        .filter(([, on]) => on)
        .map(([field]) => field);
      list = list.filter((i) =>
        fields.some((field) => {
          const value = (i[field] || "").toLowerCase();
          return searchOptions.fullText ? value.includes(q) : value.startsWith(q);
        })
      );
    }

    list = [...list].sort((a, b) => {
      let av = a[sort.key], bv = b[sort.key];
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [items, filteredByTree, search, searchOptions, sort]);

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
          <NavItem icon={LayoutDashboard} label="Übersicht" onClick={() => onNavigate?.("dashboard")} />
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
          <NavItem icon={Users} label="Benutzer" onClick={() => onNavigate?.("users")} />
          <NavItem icon={Tag} label="Gruppen" />
          <NavItem icon={ScrollText} label="Logs" />
        </nav>

        <div className="mt-auto pt-4">
          <NavItem icon={LogOut} label="Abmelden" onClick={() => onNavigate?.("login")} />
        </div>
      </aside>

      {/* Library tree */}
      <aside className="w-64 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-900/50 py-3 pr-2">
        <FolderNode
          folder={rootFolder} level={0}
          expanded={expanded} onToggle={toggle}
          filterState={filterState} onSelect={selectFolder}
          dragOverFolderId={dragOverFolderId}
          onDragOverFolder={setDragOverFolderId}
          onDragLeaveFolder={(id) => setDragOverFolderId((cur) => (cur === id ? null : cur))}
          onDropOnFolder={handleDropOnFolder}
        />

        <div className="flex items-center justify-between py-1 pl-2 pr-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Folders</span>
          <button
            onClick={handleNewRootFolder}
            title="Neuer Ordner"
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-orange-500"
          >
            <Plus size={13} />
          </button>
        </div>

        {editingFolder?.folderId === "root" && editingFolder.mode === "new-child" && (
          <InlineFolderInput
            level={0}
            onSubmit={(value) => handleInlineFolderSubmit("root", "new-child", value)}
            onCancel={() => setEditingFolder(null)}
          />
        )}

        {loading && <div className="px-3 py-2 text-sm text-zinc-600">Lade Ordner…</div>}
        {!loading && error && (
          <div className="px-3 py-2 text-sm text-red-500">Baum nicht verfügbar</div>
        )}
        {!loading && !error && tree.map((folder) => (
          <FolderNode
            key={folder.id} folder={folder} level={0}
            expanded={expanded} onToggle={toggle}
            filterState={filterState} onSelect={selectFolder}
            dragOverFolderId={dragOverFolderId}
            onDragOverFolder={setDragOverFolderId}
            onDragLeaveFolder={(id) => setDragOverFolderId((cur) => (cur === id ? null : cur))}
            onDropOnFolder={handleDropOnFolder}
            draggedFolderId={draggedFolderId}
            onFolderDragStart={setDraggedFolderId}
            onFolderDragEnd={() => { setDraggedFolderId(null); setDragOverFolderId(null); }}
            editingState={editingFolder}
            onContextMenu={handleFolderContextMenu}
            onInlineSubmit={handleInlineFolderSubmit}
            onInlineCancel={() => setEditingFolder(null)}
          />
        ))}

        {!loading && !error && (
          <>
            <ListSection
              label="Artists" icon={Users} sectionKey="artists"
              expanded={expanded} onToggle={toggle}
              entries={artists} loading={false}
              renderEntry={(artist, level) => (
                <TreeRow
                  key={artist} id={`artist:${artist}`} label={artist} level={level}
                  icon={Users} hasChildren={false} isOpen={false}
                  isActive={filterState.kind === "artist" && filterState.artist === artist}
                  onClick={() => selectArtist(artist)}
                />
              )}
            />

            <ListSection
              label="Types" icon={Tag} sectionKey="types"
              expanded={expanded} onToggle={toggle}
              entries={itemTypes} loading={false}
              renderEntry={(t, level) => (
                <TreeRow
                  key={t.key} id={`type:${t.key}`} label={t.label} level={level}
                  icon={Tag} hasChildren={false} isOpen={false}
                  isActive={filterState.kind === "type" && filterState.type === t.key}
                  muted={!t.hasItems}
                  onClick={() => selectType(t.key)}
                />
              )}
            />

            <AttributesSection
              expanded={expanded} onToggle={toggle}
              attributeKeys={attributeKeys} loading={false}
              filterState={filterState} onSelectValue={selectAttribute}
            />

            <div>
              <div className="flex items-center justify-between py-1 pl-2 pr-1">
                <TreeRow
                  id="storages" label="Storages" level={0} icon={HardDrive}
                  hasChildren isOpen={expanded.has("storages")} isActive={false}
                  onClick={() => toggle("storages")}
                  onToggle
                />
                {canManageStorage && expanded.has("storages") && (
                  <button
                    onClick={() => setShowNewStorage(true)}
                    title="Neuer Storage"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-orange-500"
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>
              {expanded.has("storages") && (
                <div>
                  {storages.length === 0 && (
                    <div className="px-3 py-1.5 text-xs text-zinc-600" style={{ paddingLeft: "22px" }}>
                      Keine Einträge
                    </div>
                  )}
                  {storages.map((storage) =>
                    editingStorageId === storage.id ? (
                      <InlineStorageInput
                        key={storage.id} level={1} initialValue={storage.name}
                        onSubmit={(value) => handleRenameStorage(storage.id, value)}
                        onCancel={() => setEditingStorageId(null)}
                      />
                    ) : (
                      <div
                        key={storage.id}
                        onContextMenu={canManageStorage ? (e) => handleStorageContextMenu(e, storage.id) : undefined}
                      >
                        <TreeRow
                          id={`storage:${storage.id}`} label={storage.name} level={1}
                          icon={HardDrive} hasChildren={false} isOpen={false}
                          isActive={filterState.kind === "storage" && filterState.storageId === storage.id}
                          onClick={() => selectStorage(storage.id)}
                        />
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            <TreeRow
              id="everything" label="Everything" level={0} icon={Library}
              hasChildren={false} isOpen={false}
              isActive={filterState.kind === "everything"}
              onClick={selectEverything}
            />
          </>
        )}
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
            onClick={() => { invalidate(); loadData(); }}
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
            <div className="relative flex items-center">
              <Search size={15} className="absolute left-3 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchOptions.scope === "view" ? "Suchen im aktuellen View" : "Suchen in der Bibliothek"}
                className="w-56 rounded-md border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-9 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-700"
              />
              <button
                onClick={() => setShowSearchOptions((v) => !v)}
                className={`absolute right-2 flex h-5 w-5 items-center justify-center rounded transition-colors ${
                  showSearchOptions ? "text-orange-500" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <Settings2 size={14} />
              </button>

              {showSearchOptions && (
                <div className="absolute right-0 top-full z-10 mt-2 w-64 rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm shadow-xl">
                  <div className="mb-3">
                    <div className="mb-1.5 text-xs text-zinc-500">Suche in</div>
                    <div className="flex gap-1.5">
                      {[
                        { key: "library", label: "Bibliothek" },
                        { key: "view", label: "Aktueller View" },
                      ].map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => setSearchOptions((prev) => ({ ...prev, scope: opt.key }))}
                          className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
                            searchOptions.scope === opt.key
                              ? "bg-orange-500/10 text-orange-500"
                              : "bg-zinc-800/60 text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="mb-1.5 text-xs text-zinc-500">Felder</div>
                    <div className="space-y-1">
                      {[
                        { key: "title", label: "Titel" },
                        { key: "artist", label: "Artist" },
                        { key: "comment", label: "Kommentar" },
                      ].map((f) => (
                        <label key={f.key} className="flex items-center gap-2 text-zinc-300">
                          <input
                            type="checkbox"
                            checked={searchOptions.fields[f.key]}
                            onChange={(e) =>
                              setSearchOptions((prev) => {
                                const fields = { ...prev.fields, [f.key]: e.target.checked };
                                // Keep at least one field active — an empty
                                // selection would silently match nothing.
                                if (!Object.values(fields).some(Boolean)) return prev;
                                return { ...prev, fields };
                              })
                            }
                            className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900 accent-orange-500"
                          />
                          <span>{f.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Volltext (enthält)</span>
                    <button
                      onClick={() => setSearchOptions((prev) => ({ ...prev, fullText: !prev.fullText }))}
                      className={`relative h-5 w-9 rounded-full transition-colors ${
                        searchOptions.fullText ? "bg-orange-500" : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                          searchOptions.fullText ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </label>
                </div>
              )}
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
              {(loading || folderItemsLoading) && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm text-zinc-600">
                    Lade Elemente…
                  </td>
                </tr>
              )}
              {!loading && !folderItemsLoading && error && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm">
                    <div className="flex flex-col items-center gap-2 text-red-500">
                      <AlertTriangle size={20} />
                      <span>Elemente konnten nicht geladen werden: {error}</span>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && !folderItemsLoading && !error && visibleItems.map((item) => (
                <tr
                  key={item.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragItemId(item.id); }}
                  onDragEnd={() => { setDragItemId(null); setDragOverFolderId(null); }}
                  className="border-b border-zinc-800/60 transition-colors hover:bg-zinc-900/50"
                >
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
              {!loading && !folderItemsLoading && !error && visibleItems.length === 0 && (
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

      {folderContextMenu && (
        <FolderContextMenu
          x={folderContextMenu.x} y={folderContextMenu.y}
          onClose={() => setFolderContextMenu(null)}
          onNewSubfolder={() => {
            setExpanded((prev) => new Set(prev).add(folderContextMenu.folderId));
            setEditingFolder({ folderId: folderContextMenu.folderId, mode: "new-child" });
            setFolderContextMenu(null);
          }}
          onRename={() => {
            setEditingFolder({ folderId: folderContextMenu.folderId, mode: "rename" });
            setFolderContextMenu(null);
          }}
          onMove={() => {
            const folder = findFolder(tree, folderContextMenu.folderId);
            if (folder) setMoveFolderTarget(folder);
            setFolderContextMenu(null);
          }}
          onDelete={() => {
            const folder = findFolder(tree, folderContextMenu.folderId);
            if (folder) {
              const hasItems = items.some((i) => i.folderId === folder.id);
              setDeleteFolderTarget({ ...folder, hasItemsHint: hasItems });
            }
            setFolderContextMenu(null);
          }}
        />
      )}

      {moveFolderTarget && (
        <MoveFolderDialog
          tree={tree}
          folder={moveFolderTarget}
          onClose={() => setMoveFolderTarget(null)}
          onMove={handleMoveFolder}
        />
      )}

      {deleteFolderTarget && (
        <ConfirmDeleteFolderDialog
          folder={deleteFolderTarget}
          onClose={() => setDeleteFolderTarget(null)}
          onConfirm={handleDeleteFolder}
        />
      )}

      {folderError && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-md border border-red-900 bg-zinc-900 px-4 py-3 text-sm text-red-500 shadow-xl">
          <AlertTriangle size={14} />
          <span>{folderError}</span>
          <button onClick={() => setFolderError(null)} className="ml-2 text-zinc-500 hover:text-zinc-300">
            <X size={14} />
          </button>
        </div>
      )}

      {showNewStorage && (
        <NewStorageDialog onClose={() => setShowNewStorage(false)} onCreate={handleCreateStorage} />
      )}

      {storageContextMenu && (
        <StorageContextMenu
          x={storageContextMenu.x} y={storageContextMenu.y}
          onClose={() => setStorageContextMenu(null)}
          onRename={() => {
            setEditingStorageId(storageContextMenu.storageId);
            setStorageContextMenu(null);
          }}
          onDelete={() => {
            const storage = storages.find((s) => s.id === storageContextMenu.storageId);
            if (storage) setDeleteStorageTarget(storage);
            setStorageContextMenu(null);
          }}
        />
      )}

      {deleteStorageTarget && (
        <ConfirmDeleteStorageDialog
          storage={deleteStorageTarget}
          onClose={() => setDeleteStorageTarget(null)}
          onConfirm={handleDeleteStorage}
        />
      )}

      {storageError && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-md border border-red-900 bg-zinc-900 px-4 py-3 text-sm text-red-500 shadow-xl">
          <AlertTriangle size={14} />
          <span>{storageError}</span>
          <button onClick={() => setStorageError(null)} className="ml-2 text-zinc-500 hover:text-zinc-300">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
