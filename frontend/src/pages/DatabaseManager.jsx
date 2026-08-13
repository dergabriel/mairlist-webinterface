import { useState, useMemo } from "react";
import {
  LayoutDashboard, Settings, Database, Copy, ListMusic,
  Users, Tag, ScrollText, Folder, FolderOpen, ChevronRight,
  ChevronDown, RefreshCw, Plus, Search, Pencil, Trash2, ArrowUpDown,
} from "lucide-react";

// --- Mock data (mirrors the backend repository, embedded for the frontend-only pass) ---

const FOLDERS = [
  { id: "all", name: "Alle Elemente", parentId: null, special: true },
  { id: "import", name: "# Import", parentId: null, special: true },
  { id: 10, name: "Beiträge", parentId: null },
  { id: 11, name: "aktuell", parentId: 10 },
  { id: 12, name: "zeitlos", parentId: 10 },
  { id: 20, name: "Musik", parentId: null },
  { id: 21, name: "A - Heavy Current", parentId: 20 },
  { id: 22, name: "B - Medium Current", parentId: 20 },
  { id: 23, name: "C - Light", parentId: 20 },
  { id: 24, name: "D - Recurrent", parentId: 20 },
  { id: 25, name: "E - 2010s", parentId: 20 },
  { id: 26, name: "N - New Music", parentId: 20 },
  { id: 27, name: "V - Virale Songs", parentId: 20 },
  { id: 30, name: "Verpackung", parentId: null },
  { id: 31, name: "Meme Dropper", parentId: 30 },
  { id: 32, name: "Showopener", parentId: 30 },
  { id: 33, name: "Sweeper", parentId: 30 },
  { id: 34, name: "Themes", parentId: 30 },
  { id: 35, name: "Vollblock Halbblock", parentId: 30 },
];

const ITEMS = [
  { id: 476, title: "Mood", artist: "24kGoldn & Iann Dior", type: "Music", length: 140.533, folderId: 21, updatedAt: "2023-12-19T22:52:59", comment: "" },
  { id: 492, title: "Your Love (9PM)", artist: "ATB & Topic & A7S", type: "Music", length: 150.053, folderId: 21, updatedAt: "2023-12-19T22:34:10", comment: "" },
  { id: 598, title: "Sweet Dreams", artist: "Alan Walker & Imanbek", type: "Music", length: 138.819, folderId: 22, updatedAt: "2023-12-19T23:02:56", comment: "" },
  { id: 477, title: "When I'm Gone", artist: "Alesso & Katy Perry", type: "Music", length: 161.267, folderId: 21, updatedAt: "2023-12-19T23:04:41", comment: "" },
  { id: 478, title: "Follow You", artist: "Alle Farben & Alexander Tidebrink", type: "Music", length: 170.16, folderId: 24, updatedAt: "2023-12-19T23:06:29", comment: "" },
  { id: 479, title: "Castle", artist: "Alle Farben & Hugel & Fast Boy", type: "Music", length: 146.586, folderId: 24, updatedAt: "2023-12-19T23:07:50", comment: "" },
  { id: 480, title: "Fading", artist: "Alle Farben & ILIRA", type: "Music", length: 207.013, folderId: 24, updatedAt: "2023-12-19T23:09:14", comment: "" },
  { id: 481, title: "Little Hollywood", artist: "Alle Farben & Janieck", type: "Music", length: 184.2, folderId: 24, updatedAt: "2023-12-19T23:10:32", comment: "" },
  { id: 482, title: "Different for Us", artist: "Alle Farben & Jordan Powers", type: "Music", length: 185.08, folderId: 24, updatedAt: "2023-12-19T23:11:46", comment: "" },
  { id: 483, title: "As Far as Feelings Go", artist: "Alle Farben & Justin Jesso", type: "Music", length: 209.64, folderId: 24, updatedAt: "2023-12-19T22:33:43", comment: "" },
  { id: 599, title: "Alright", artist: "Alle Farben & Kiddo", type: "Music", length: 169, folderId: 24, updatedAt: "2023-12-19T22:39:20", comment: "" },
  { id: 484, title: "Forgot How to Love", artist: "Alle Farben & Moss Kena", type: "Music", length: 149.055, folderId: 24, updatedAt: "2023-12-19T22:33:45", comment: "" },
  { id: 469, title: "KIDS", artist: "Alle Farben & Vize & Graham Candy", type: "Music", length: 184.691, folderId: 24, updatedAt: "2023-12-19T22:34:02", comment: "" },
  { id: 616, title: "All By Myself", artist: "Alok & Sigala & Ellie Goulding", type: "Music", length: 171.747, folderId: 26, updatedAt: "2023-12-19T22:42:58", comment: "" },
  { id: 490, title: "2002", artist: "Anne-Marie", type: "Music", length: 186.987, folderId: 25, updatedAt: "2023-12-19T22:34:05", comment: "" },
  { id: 701, title: "Showopener Kurz", artist: "", type: "Jingle", length: 4.2, folderId: 32, updatedAt: "2023-12-18T14:10:00", comment: "Standard Opener" },
  { id: 845, title: "Autohaus Becker Spot", artist: "", type: "Advertising", length: 30.0, folderId: 30, updatedAt: "2026-01-05T09:00:00", comment: "Kampagne Frühjahr 2026" },
  { id: 901, title: "Hook Pool Heavy Current", artist: "", type: "Container", containerType: "Hook", length: 15.0, folderId: 20, updatedAt: "2026-02-01T10:00:00", comment: "Zufälliger Hook aus A - Heavy Current" },
  { id: 902, title: "Regio Auseinanderschaltung", artist: "", type: "Container", containerType: "Regio", length: 120.0, folderId: null, updatedAt: "2026-02-01T10:05:00", comment: "Regionale Werbung und Verkehr" },
  { id: 903, title: "Nachrichten zur vollen Stunde", artist: "", type: "Container", containerType: "Nachrichten", length: 180.0, folderId: null, updatedAt: "2026-02-01T10:10:00", comment: "Lädt aktuelle News beim Abspielen" },
];

// --- Helpers ---

const collectDescendants = (folderId) => {
  const direct = FOLDERS.filter((f) => f.parentId === folderId).map((f) => f.id);
  return direct.reduce((acc, id) => [...acc, id, ...collectDescendants(id)], []);
};

const formatDate = (iso) => iso.replace("T", "  ");

const formatLength = (sec) => {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

// --- Tree node ---

function TreeNode({ folder, level, expanded, onToggle, activeId, onSelect }) {
  const children = FOLDERS.filter((f) => f.parentId === folder.id);
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

function NavItem({ icon: Icon, label, active }) {
  return (
    <button
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

// --- Main app ---

export default function MairListDB() {
  const [expanded, setExpanded] = useState(new Set([20, 30]));
  const [activeFolder, setActiveFolder] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "id", dir: "asc" });
  const [selected, setSelected] = useState(new Set());

  const roots = FOLDERS.filter((f) => f.parentId === null);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const activeFolderName =
    FOLDERS.find((f) => f.id === activeFolder)?.name || "Alle Elemente";

  const visibleItems = useMemo(() => {
    let list = [...ITEMS];

    if (activeFolder !== "all") {
      if (activeFolder === "import") {
        list = [];
      } else {
        const ids = new Set([activeFolder, ...collectDescendants(activeFolder)]);
        list = list.filter((i) => ids.has(i.folderId));
      }
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
  }, [activeFolder, search, sort]);

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
          <NavItem icon={ListMusic} label="Playlist" />
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
        {roots.map((folder) => (
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
          <button className="flex h-9 w-9 items-center justify-center rounded-md border border-green-700/60 text-green-500 transition-colors hover:bg-green-600/10">
            <RefreshCw size={16} />
          </button>
        </header>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <button className="flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500">
            <Plus size={16} />
            <span>Neues Element</span>
          </button>

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
                <Th label="Länge" sortKey="length" sort={sort} onSort={onSort} />
                <Th label="Aktualisiert" sortKey="updatedAt" sort={sort} onSort={onSort} />
                <Th label="Kommentar" sortKey="comment" sort={sort} onSort={onSort} />
                <th className="px-4 py-3 text-right font-medium text-zinc-400">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
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
                    {item.type}
                    {item.containerType && <span className="text-zinc-600">{` (${item.containerType})`}</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{formatLength(item.length)}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(item.updatedAt)}</td>
                  <td className="px-4 py-3 text-zinc-500">{item.comment || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button className="flex h-7 w-7 items-center justify-center rounded bg-green-600 text-white transition-colors hover:bg-green-500">
                        <Pencil size={13} />
                      </button>
                      <button className="flex h-7 w-7 items-center justify-center rounded bg-red-600 text-white transition-colors hover:bg-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleItems.length === 0 && (
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
    </div>
  );
}
