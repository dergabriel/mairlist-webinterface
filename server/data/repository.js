// Repository layer. This is the ONLY place that knows where data comes from.
//
// Right now it reads from mockData. When the real schema is available, we
// create a second implementation (e.g. sqlRepository.js) with the exact same
// function signatures, and switch via the DATA_SOURCE env variable. The API
// and the frontend never change.
//
// Interface (keep stable across implementations):
//   getFolderTree()          -> nested folder tree
//   getStorages()            -> array of storages
//   getItemTypes()           -> array of type strings
//   getArtists()             -> array of distinct artist names
//   getItems(filters)        -> array of items (filtered)
//   getItemById(id)          -> single item or null
//   searchItems(query, opts) -> array of items
//   createItem(data)         -> newly created item
//   updateItem(id, data)     -> updated item or null
//   deleteItem(id)           -> true if an item was deleted, false otherwise
//
// Writes currently mutate the in-memory mockData array (the "copy" per
// README's write-only-against-a-copy rule). Once the real schema is proven,
// only this file is swapped for a SQL-backed implementation.

const { storages, folders, items, ITEM_TYPES, CUE_POINTS } = require("./mockData");

function getFolderTree() {
  const byParent = (parentId) =>
    folders
      .filter((f) => f.parentId === parentId)
      .map((f) => ({ ...f, children: byParent(f.id) }));
  return byParent(null);
}

function getStorages() {
  return storages;
}

function getItemTypes() {
  // Only return types that actually have items, mirroring the mAirList tree.
  const used = new Set(items.map((i) => i.type));
  return ITEM_TYPES.filter((t) => used.has(t));
}

function getArtists() {
  const names = new Set(
    items.map((i) => i.artist).filter((a) => a && a.trim() !== "")
  );
  return [...names].sort((a, b) => a.localeCompare(b));
}

function getItems(filters = {}) {
  let result = [...items];
  if (filters.type) result = result.filter((i) => i.type === filters.type);
  if (filters.artist) result = result.filter((i) => i.artist === filters.artist);
  if (filters.folderId != null)
    result = result.filter((i) => i.folderId === Number(filters.folderId));
  if (filters.storageId != null)
    result = result.filter((i) => i.storageId === Number(filters.storageId));
  return result;
}

function getItemById(id) {
  return items.find((i) => i.id === id) || null;
}

function searchItems(query, opts = {}) {
  if (!query || query.trim() === "") return [];
  const q = query.toLowerCase();
  const fields = opts.fields || ["title", "artist", "comment"];
  return items.filter((item) =>
    fields.some((field) => {
      const value = item[field];
      return value && String(value).toLowerCase().includes(q);
    })
  );
}

// Cue point definitions (key, label, colour) for the cue editor.
function getCuePoints() {
  return CUE_POINTS;
}

// Assumption: internalId is the next integer after the current max, since
// there is no real ID generator yet. The real DB will assign this instead
// (auto-increment / sequence), so this logic disappears once SQL is wired up.
function nextInternalId() {
  const max = items.reduce((acc, i) => Math.max(acc, i.internalId), 0);
  return max + 1;
}

function emptyCue() {
  const base = {};
  for (const cp of CUE_POINTS) base[cp.key] = null;
  return base;
}

function createItem(data = {}) {
  const internalId = nextInternalId();
  const item = {
    id: String(internalId),
    internalId,
    externalId: data.externalId ?? null,
    type: data.type || "music",
    containerType: data.containerType,
    title: data.title || "",
    artist: data.artist || "",
    duration: data.duration != null ? Number(data.duration) : 0,
    endTime: data.endTime ?? null,
    storageId: data.storageId ?? null,
    relativePath: data.relativePath ?? null,
    folderId: data.folderId ?? null,
    comment: data.comment || "",
    color: data.color ?? null,
    cover: data.cover ?? null,
    cue: emptyCue(),
    attributes: data.attributes || {},
    updatedAt: new Date().toISOString(),
  };
  // TODO: replace with a real SQL INSERT once the schema is confirmed.
  items.push(item);
  return item;
}

function updateItem(id, data = {}) {
  const item = getItemById(id);
  if (!item) return null;
  // TODO: replace with a real SQL UPDATE once the schema is confirmed.
  Object.assign(item, data, { updatedAt: new Date().toISOString() });
  return item;
}

function deleteItem(id) {
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return false;
  // TODO: replace with a real SQL DELETE once the schema is confirmed.
  items.splice(index, 1);
  return true;
}

module.exports = {
  getFolderTree,
  getStorages,
  getItemTypes,
  getArtists,
  getItems,
  getItemById,
  searchItems,
  getCuePoints,
  createItem,
  updateItem,
  deleteItem,
};
