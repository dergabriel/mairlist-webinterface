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

module.exports = {
  getFolderTree,
  getStorages,
  getItemTypes,
  getArtists,
  getItems,
  getItemById,
  searchItems,
  getCuePoints,
};
