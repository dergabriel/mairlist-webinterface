import {
  ChevronRight, ChevronDown, Tag, SlidersHorizontal,
} from "lucide-react";

// --- Helpers ---

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

// Ids of a folder and every one of its descendants — used to stop a folder
// being dropped/moved into its own subtree.
export const collectFolderAndDescendantIds = (folder) => [
  folder.id,
  ...collectDescendants(folder),
];

// --- Filter state ---
//
// One bundled filter object drives the item list, whichever tree section it
// came from. `kind` says which branch is active; the rest of the fields are
// only meaningful for their matching kind.
export const ALL_FILTER = { kind: "all" };

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

// --- Generic tree row ---
//
// One row shared by every tree section (folders, artists, types, attributes,
// storages, everything). `dropTarget`/`dropHandlers` are only wired up for
// virtual folders — the only nodes items can be dropped onto.
export function TreeRow({
  id, label, level, icon: Icon, openIcon: OpenIcon, hasChildren, isOpen, isActive,
  muted, onClick, onToggle, isDropTarget, isDragOver, dropHandlers,
}) {
  return (
    <button
      onClick={onClick}
      {...(isDropTarget ? dropHandlers : {})}
      className={`group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm transition-colors ${
        isActive
          ? "border-l-2 border-orange-500 bg-zinc-800/60 text-zinc-100"
          : "border-l-2 border-transparent text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
      } ${isDragOver ? "bg-orange-500/10 outline outline-1 outline-orange-500/70" : ""} ${
        muted ? "opacity-40" : ""
      }`}
      style={{ paddingLeft: `${level * 14 + 8}px` }}
    >
      {hasChildren ? (
        onToggle && isOpen ? <ChevronDown size={14} className="shrink-0 text-zinc-500" />
               : hasChildren ? <ChevronRight size={14} className="shrink-0 text-zinc-500" />
               : <span className="w-[14px] shrink-0" />
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

// --- Generic section (Artists / Storages): a header node that loads a flat
// list on first expand, each entry a leaf that sets the filter on click ---

export function ListSection({
  label, icon, sectionKey, expanded, onToggle, entries, loading,
  renderEntry, level = 0,
}) {
  const isOpen = expanded.has(sectionKey);
  const hasChildren = true;

  return (
    <div>
      <TreeRow
        id={sectionKey} label={label} level={level} icon={icon}
        hasChildren={hasChildren} isOpen={isOpen} isActive={false}
        onClick={() => onToggle(sectionKey)}
        onToggle={hasChildren}
      />
      {isOpen && (
        <div>
          {loading && (
            <div className="px-3 py-1.5 text-xs text-zinc-600" style={{ paddingLeft: `${(level + 1) * 14 + 8}px` }}>
              Lädt…
            </div>
          )}
          {!loading && entries.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-zinc-600" style={{ paddingLeft: `${(level + 1) * 14 + 8}px` }}>
              Keine Einträge
            </div>
          )}
          {!loading && entries.map((entry) => renderEntry(entry, level + 1))}
        </div>
      )}
    </div>
  );
}

// --- Attributes section: keys expand to their distinct values ---

export function AttributesSection({ expanded, onToggle, attributeKeys, loading, filterState, onSelectValue, level = 0 }) {
  const isOpen = expanded.has("attributes");

  return (
    <div>
      <TreeRow
        id="attributes" label="Attributes" level={level} icon={SlidersHorizontal}
        hasChildren isOpen={isOpen} isActive={false}
        onClick={() => onToggle("attributes")}
        onToggle
      />
      {isOpen && (
        <div>
          {loading && (
            <div className="px-3 py-1.5 text-xs text-zinc-600" style={{ paddingLeft: `${(level + 1) * 14 + 8}px` }}>
              Lädt…
            </div>
          )}
          {!loading && attributeKeys.length === 0 && (
            <div className="px-3 py-1.5 text-xs text-zinc-600" style={{ paddingLeft: `${(level + 1) * 14 + 8}px` }}>
              Keine Attribute
            </div>
          )}
          {!loading && attributeKeys.map((attr) => {
            const keyToken = `attr:${attr.key}`;
            const keyOpen = expanded.has(keyToken);
            return (
              <div key={attr.key}>
                <TreeRow
                  id={keyToken} label={attr.key} level={level + 1} icon={Tag}
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
                      key={value} id={`${keyToken}:${value}`} label={value} level={level + 2}
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
