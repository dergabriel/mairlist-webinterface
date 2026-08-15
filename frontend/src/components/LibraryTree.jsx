import { useState } from "react";
import {
  Folder, FolderOpen, Users, Tag, HardDrive, Library,
} from "lucide-react";
import {
  ALL_FILTER, collectDescendants, findFolder, filterItemsByTree,
  TreeRow, ListSection, AttributesSection,
} from "./treeUtils";

export { ALL_FILTER, collectDescendants, findFolder, filterItemsByTree };

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
