import { useState } from "react";
import {
  Folder, FolderOpen, ChevronRight, ChevronDown, Users, Tag,
  SlidersHorizontal, HardDrive, Library,
} from "lucide-react";

// --- Shared filter helpers (mirrors DatabaseManager.jsx) ---

export const ALL_FILTER = { kind: "all" };

export const collectDescendants = (folder) =>
  (folder.children || []).reduce(
    (acc, child) => [...acc, child.id, ...collectDescendants(child)],
    []
  );

export const findFolder = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findFolder(node.children || [], id);
    if (found) return found;
  }
  return null;
};

export const filterItemsByTree = (items, tree, filterState) => {
  if (filterState.kind === "folder") {
    const folder = findFolder(tree, filterState.folderId);
    const ids = new Set([filterState.folderId, ...(folder ? collectDescendants(folder) : [])]);
    return items.filter((i) => ids.has(i.folderId));
  }
  if (filterState.kind === "artist") return items.filter((i) => i.artist === filterState.artist);
  if (filterState.kind === "type") return items.filter((i) => i.type === filterState.type);
  if (filterState.kind === "storage") return items.filter((i) => i.storageId === filterState.storageId);
  if (filterState.kind === "attribute") {
    return items.filter(
      (i) => String(i.attributes?.[filterState.attributeKey] ?? "") === filterState.attributeValue
    );
  }
  // "all" and "everything" both mean unfiltered.
  return items;
};

// --- Generic tree row (read-only: no drag/drop, no editing) ---

function TreeRow({ label, level, icon: Icon, openIcon: OpenIcon, hasChildren, isOpen, isActive, muted, onClick, onToggle }) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm transition-colors ${
        isActive
          ? "border-l-2 border-orange-500 bg-zinc-800/60 text-zinc-100"
          : "border-l-2 border-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
      } ${muted ? "opacity-40" : ""}`}
      style={{ paddingLeft: `${level * 14 + 8}px` }}
    >
      {hasChildren ? (
        onToggle && isOpen ? <ChevronDown size={14} className="shrink-0 text-zinc-500" />
               : <ChevronRight size={14} className="shrink-0 text-zinc-500" />
      ) : (
        <span className="w-[14px] shrink-0" />
      )}
      {isOpen && OpenIcon ? (
        <OpenIcon size={15} className="shrink-0 text-orange-500/80" />
      ) : (
        <Icon size={15} className="shrink-0 text-zinc-500" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

function FolderNode({ folder, level, expanded, onToggle, filterState, onSelect }) {
  const children = folder.children || [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = filterState.kind === "folder" && filterState.folderId === folder.id;

  return (
    <div>
      <TreeRow
        label={folder.name} level={level}
        icon={Folder} openIcon={folder.special ? undefined : FolderOpen}
        hasChildren={hasChildren} isOpen={isOpen} isActive={isActive}
        onClick={() => { onSelect(folder.id); if (hasChildren) onToggle(folder.id); }}
        onToggle={hasChildren}
      />
      {hasChildren && isOpen && (
        <div>
          {children.map((child) => (
            <FolderNode
              key={child.id} folder={child} level={level + 1}
              expanded={expanded} onToggle={onToggle}
              filterState={filterState} onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListSection({ label, icon, sectionKey, expanded, onToggle, entries, renderEntry, level = 0 }) {
  const isOpen = expanded.has(sectionKey);

  return (
    <div>
      <TreeRow
        label={label} level={level} icon={icon}
        hasChildren isOpen={isOpen} isActive={false}
        onClick={() => onToggle(sectionKey)}
        onToggle
      />
      {isOpen && (
        <div>
          {entries.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-zinc-600" style={{ paddingLeft: `${(level + 1) * 14 + 8}px` }}>
              Keine Einträge
            </div>
          )}
          {entries.map((entry) => renderEntry(entry, level + 1))}
        </div>
      )}
    </div>
  );
}

function AttributesSection({ expanded, onToggle, attributeKeys, filterState, onSelectValue, level = 0 }) {
  const isOpen = expanded.has("attributes");

  return (
    <div>
      <TreeRow
        label="Attributes" level={level} icon={SlidersHorizontal}
        hasChildren isOpen={isOpen} isActive={false}
        onClick={() => onToggle("attributes")}
        onToggle
      />
      {isOpen && (
        <div>
          {attributeKeys.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-zinc-600" style={{ paddingLeft: `${(level + 1) * 14 + 8}px` }}>
              Keine Attribute
            </div>
          )}
          {attributeKeys.map((attr) => {
            const keyToken = `attr:${attr.key}`;
            const keyOpen = expanded.has(keyToken);
            return (
              <div key={attr.key}>
                <TreeRow
                  label={attr.key} level={level + 1} icon={Tag}
                  hasChildren isOpen={keyOpen} isActive={false}
                  onClick={() => onToggle(keyToken)}
                  onToggle
                />
                {keyOpen && attr.values.map((value) => {
                  const isActive =
                    filterState.kind === "attribute" &&
                    filterState.attributeKey === attr.key &&
                    filterState.attributeValue === value;
                  return (
                    <TreeRow
                      key={value} label={value} level={level + 2}
                      icon={Tag} hasChildren={false} isOpen={false} isActive={isActive}
                      onClick={() => onSelectValue(attr.key, value)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Library tree: read-only navigation over folders / artists / types /
// attributes / storages / everything. Filters items list via onFilterChange.
// Extracted from DatabaseManager.jsx; unlike there, this version has no
// drag/drop or folder create/rename/delete — just selection.

export default function LibraryTree({
  tree, storages, artists, itemTypes, attributeKeys,
  filterState, onFilterChange,
  loading, error,
  expanded: expandedProp, onExpandedChange,
}) {
  const [expandedState, setExpandedState] = useState(() => new Set());
  const expanded = expandedProp ?? expandedState;
  const setExpanded = onExpandedChange ?? setExpandedState;

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const rootFolder = { id: "all", name: "Alle Elemente", special: true, children: [] };

  const selectFolder = (folderId) =>
    onFilterChange(folderId === "all" ? ALL_FILTER : { kind: "folder", folderId });
  const selectArtist = (artist) => onFilterChange({ kind: "artist", artist });
  const selectType = (type) => onFilterChange({ kind: "type", type });
  const selectStorage = (storageId) => onFilterChange({ kind: "storage", storageId });
  const selectAttribute = (attributeKey, attributeValue) =>
    onFilterChange({ kind: "attribute", attributeKey, attributeValue });
  const selectEverything = () => onFilterChange({ kind: "everything" });

  if (loading) return <div className="px-3 py-2 text-sm text-zinc-600">Lade Ordner…</div>;
  if (error) return <div className="px-3 py-2 text-sm text-red-500">Baum nicht verfügbar</div>;

  return (
    <div>
      <FolderNode
        folder={rootFolder} level={0}
        expanded={expanded} onToggle={toggle}
        filterState={filterState} onSelect={selectFolder}
      />

      <div className="py-1 pl-2 pr-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">Folders</span>
      </div>

      {tree.map((folder) => (
        <FolderNode
          key={folder.id} folder={folder} level={0}
          expanded={expanded} onToggle={toggle}
          filterState={filterState} onSelect={selectFolder}
        />
      ))}

      <ListSection
        label="Artists" icon={Users} sectionKey="artists"
        expanded={expanded} onToggle={toggle}
        entries={artists}
        renderEntry={(artist, level) => (
          <TreeRow
            key={artist} label={artist} level={level}
            icon={Users} hasChildren={false} isOpen={false}
            isActive={filterState.kind === "artist" && filterState.artist === artist}
            onClick={() => selectArtist(artist)}
          />
        )}
      />

      <ListSection
        label="Types" icon={Tag} sectionKey="types"
        expanded={expanded} onToggle={toggle}
        entries={itemTypes}
        renderEntry={(t, level) => (
          <TreeRow
            key={t.key} label={t.label} level={level}
            icon={Tag} hasChildren={false} isOpen={false}
            isActive={filterState.kind === "type" && filterState.type === t.key}
            muted={!t.hasItems}
            onClick={() => selectType(t.key)}
          />
        )}
      />

      <AttributesSection
        expanded={expanded} onToggle={toggle}
        attributeKeys={attributeKeys}
        filterState={filterState} onSelectValue={selectAttribute}
      />

      <ListSection
        label="Storages" icon={HardDrive} sectionKey="storages"
        expanded={expanded} onToggle={toggle}
        entries={storages}
        renderEntry={(storage, level) => (
          <TreeRow
            key={storage.id} label={storage.name} level={level}
            icon={HardDrive} hasChildren={false} isOpen={false}
            isActive={filterState.kind === "storage" && filterState.storageId === storage.id}
            onClick={() => selectStorage(storage.id)}
          />
        )}
      />

      <TreeRow
        label="Everything" level={0} icon={Library}
        hasChildren={false} isOpen={false}
        isActive={filterState.kind === "everything"}
        onClick={selectEverything}
      />
    </div>
  );
}
