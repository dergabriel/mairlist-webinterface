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
//   getItemHistory(id)       -> play history array (newest first) or null
//   searchItems(query, opts) -> array of items
//   getAttributeDefinitions() -> predefined attribute schema
//   createItem(data)         -> newly created item
//   updateItem(id, data)     -> updated item or null
//   deleteItem(id)           -> true if an item was deleted, false otherwise
//   uploadFile(storageId, filename, buffer, title) -> newly created item, or null if storage unknown
//   getPlaylistsByDate(date)  -> array of { id, date, hour } for that date, sorted by hour
//   getPlaylistById(id)       -> { id, date, hour, entries } with entries' items resolved, or null
//   reorderPlaylist(id, order) -> playlist (as getPlaylistById) with entries in `order`, or null
//   insertPlaylistItem(id, { itemId, afterPosition }) -> playlist (as getPlaylistById), or null
//   removePlaylistItem(id, position) -> playlist (as getPlaylistById), or null
//
// Writes currently mutate the in-memory mockData array (the "copy" per
// README's write-only-against-a-copy rule). Once the real schema is proven,
// only this file is swapped for a SQL-backed implementation.

const fs = require("fs");
const path = require("path");
const { storages, folders, items, ITEM_TYPES, CUE_POINTS, ATTRIBUTE_DEFINITIONS, playlists } = require("./mockData");

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

// Play history, newest first. Returns null if the item itself doesn't exist,
// so the route can tell "no history" apart from "no such item".
function getItemHistory(id) {
  const item = getItemById(id);
  if (!item) return null;
  const history = item.playHistory || [];
  return [...history].sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
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

// Playlists for a given date, one per hour that has one, sorted by hour.
// Returns the summary shape { id, date, hour } — no entries, no resolved
// items — for the hour-list column in the UI.
function getPlaylistsByDate(date) {
  return playlists
    .filter((p) => p.date === date)
    .sort((a, b) => a.hour - b.hour)
    .map((p) => ({ id: p.id, date: p.date, hour: p.hour }));
}

// Single hour's playlist with entries resolved against `items`. Returns
// null if the playlist doesn't exist so the route can 404.
function getPlaylistById(id) {
  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) return null;
  const entries = [...playlist.entries]
    .sort((a, b) => a.position - b.position)
    .map((entry) => ({ ...entry, item: getItemById(entry.itemId) || null }));
  return { id: playlist.id, date: playlist.date, hour: playlist.hour, entries };
}

// Recomputes position (1-based, array order) and scheduledStart (cumulative
// item duration, starting at the top of the playlist's hour) for every entry
// in place. Called after any reorder/insert/remove so the two always agree
// with the actual entry order.
function resequence(playlist) {
  let cursorSeconds = playlist.hour * 3600;
  playlist.entries.forEach((entry, i) => {
    entry.position = i + 1;
    const h = String(Math.floor(cursorSeconds / 3600) % 24).padStart(2, "0");
    const m = String(Math.floor((cursorSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(cursorSeconds % 60)).padStart(2, "0");
    entry.scheduledStart = `${h}:${m}:${s}`;
    const item = getItemById(entry.itemId);
    cursorSeconds += item ? item.duration : 0;
  });
}

// Reorders a playlist's entries to match `order` (an array of the entries'
// current positions, in the desired new order), then recomputes position and
// scheduledStart for all of them. Returns the resolved playlist, or null if
// the playlist doesn't exist or `order` doesn't match its entries exactly.
function reorderPlaylist(id, order) {
  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) return null;

  const byPosition = new Map(playlist.entries.map((e) => [e.position, e]));
  if (order.length !== playlist.entries.length) return null;
  const reordered = order.map((pos) => byPosition.get(Number(pos)));
  if (reordered.some((e) => !e)) return null;

  // TODO: replace with a real SQL transaction (bulk position UPDATE) once the schema is confirmed.
  playlist.entries = reordered;
  resequence(playlist);
  return getPlaylistById(id);
}

// Inserts a new entry for `itemId` right after the entry currently at
// `afterPosition` (0 to insert at the very top), then recomputes position
// and scheduledStart for all entries. Returns the resolved playlist, or null
// if the playlist or item doesn't exist.
function insertPlaylistItem(id, { itemId, afterPosition }) {
  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) return null;
  if (!getItemById(itemId)) return null;

  const insertAt = afterPosition == null ? playlist.entries.length : Number(afterPosition);
  // TODO: replace with a real SQL INSERT (+ position shift) once the schema is confirmed.
  playlist.entries.splice(insertAt, 0, { position: 0, itemId, scheduledStart: "" });
  resequence(playlist);
  return getPlaylistById(id);
}

// Removes the entry at `position`, then recomputes position and
// scheduledStart for the remaining entries. Returns the resolved playlist,
// or null if the playlist doesn't exist or has no entry at that position.
function removePlaylistItem(id, position) {
  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) return null;

  const index = playlist.entries.findIndex((e) => e.position === Number(position));
  if (index === -1) return null;

  // TODO: replace with a real SQL DELETE (+ position shift) once the schema is confirmed.
  playlist.entries.splice(index, 1);
  resequence(playlist);
  return getPlaylistById(id);
}

// Predefined attribute schema (key, label, type, options) for the item
// editor's Attribute tab.
function getAttributeDefinitions() {
  return ATTRIBUTE_DEFINITIONS;
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

function emptyPlayback() {
  return {
    gainDb: 0,
    normalizedLufs: null,
    segueMode: "normal",
  };
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
    playback: emptyPlayback(),
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

// Sanitize an uploaded filename: keep the extension, replace anything that
// isn't alphanumeric/dot/dash/underscore in the base name with underscores.
function sanitizeFilename(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${safeBase}${ext}`;
}

// storage.location values are the real (Windows) mAirList paths. On a dev
// machine those drives don't exist, so UPLOAD_BASE_DIR can redirect writes to
// a local folder while keeping storage.location as the value stored on the
// item. Not set in production, where storage.location is used as-is.
function resolveStorageDir(storage) {
  const base = process.env.UPLOAD_BASE_DIR;
  if (!base) return storage.location;
  return path.join(base, storage.name);
}

// Writes the uploaded file into the given storage's location and creates a
// matching item. Returns null if the storage doesn't exist.
function uploadFile(storageId, filename, buffer, title) {
  const storage = storages.find((s) => s.id === Number(storageId));
  if (!storage) return null;

  const safeFilename = sanitizeFilename(filename);
  const ext = path.extname(safeFilename);
  const derivedTitle = title && title.trim() !== "" ? title.trim() : path.basename(safeFilename, ext);

  // TODO: replace with real SQL + real file system write
  const targetDir = resolveStorageDir(storage);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, safeFilename), buffer);

  return createItem({
    title: derivedTitle,
    storageId: storage.id,
    relativePath: safeFilename,
  });
}

module.exports = {
  getFolderTree,
  getStorages,
  getItemTypes,
  getArtists,
  getItems,
  getItemById,
  getItemHistory,
  searchItems,
  getCuePoints,
  getAttributeDefinitions,
  createItem,
  updateItem,
  deleteItem,
  uploadFile,
  getPlaylistsByDate,
  getPlaylistById,
  reorderPlaylist,
  insertPlaylistItem,
  removePlaylistItem,
};
