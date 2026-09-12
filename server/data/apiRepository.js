// mAirListDB Server REST API-backed repository (read-only, Phase 1).
//
// Alternative to sqlRepository.js: instead of opening the .mldb file
// directly with better-sqlite3, this talks to the mAirListDB Server's HTTP
// API (see docs/MAIRLISTDB-API.md). Structurally avoids the SQLite-locking
// contention with mAirList, because it never touches the .mldb file itself.
//
// NOT wired up anywhere yet — sqlRepository.js remains the active
// implementation. This file exists in parallel for validation (see
// server/scripts/smoke-reads-api.js) before any switchover.
//
// Read functions here mirror sqlRepository.js's *item* return shape
// (same field names, so the frontend needs no changes once DATA_SOURCE
// switches), but folder/search functions use signatures matching the API's
// natural shape (getFolders(parentId), getItemsByFolder(folderId), ...)
// rather than sqlRepository.js's getFolderTree()/getItems(filters) — the
// two repositories are not yet interface-identical.
//
// This file used to hold the entire implementation (~1460 lines covering
// items, folders, playlists, audio streaming, and more) in one place; it's
// now split by domain into apiClient.js / apiItems.js / apiFolders.js /
// apiPlaylists.js / apiAudio.js (see CODE-REVIEW.md 3.3). This file is now
// a facade: it re-exports every one of those modules' functions unchanged,
// plus the few functions that genuinely compose across domains (folders +
// items, or folders + storages + users) and so can't live in any single
// domain module without creating a circular require between them (see the
// comments on getFolderChildren/getDashboardStats/getTodayPlaylist below).
//
// module.exports below is byte-for-byte the same set of names the old
// single-file version exported — no caller in routes/ or scripts/ needed
// to change.

// Webinterface's own user store (bcrypt, separate SQLite file) — independent
// of DATA_SOURCE (see docs/FEATURES.md), used only for getDashboardStats()'s
// totalUsers below.
const webAuthDb = require("./webAuthDb");

const apiClient = require("./apiClient");
const apiItems = require("./apiItems");
const apiFolders = require("./apiFolders");
const apiPlaylists = require("./apiPlaylists");
const apiAudio = require("./apiAudio");

const { apiRequest, ApiNotFoundError, ApiUnreachableError, warnOnceUnexpectedShape, notImplemented, emptyStub } = apiClient;
const { getFolders } = apiFolders;
const { getItemsByFolder } = apiItems;
const { getPlaylistsByDate, getPlaylistById } = apiPlaylists;

// ---- permissions / capabilities ----
// No station scoping documented for these two endpoints.

async function getPermissions() {
  return apiRequest("GET", "/api/v1/permissions", { withStation: false });
}

async function getCapabilities() {
  return apiRequest("GET", "/api/v1/capabilities", { withStation: false });
}

// ---- folders + items composed ----
//
// getFolderChildren(id) needs both getFolders() (apiFolders.js) and
// getItemsByFolder() (apiItems.js). It stays here rather than in either of
// those two modules: apiItems.js already needs apiFolders.js's getFolders()
// (for getItemFolders()), so putting getFolderChildren in apiFolders.js
// would need apiFolders.js to import apiItems.js back — a circular
// require, which Node resolves inconsistently depending on which module
// is required first (verified: the second module in the cycle sees an
// incomplete, still-being-populated exports object from the first). The
// facade sits above both, so it can compose them without that risk.
//
// sqlRepository.js's getFolderChildren(id) -> { folders: [], items: [] }.
// Direct (non-recursive) subfolders come from filtering the same
// getFolders() list getFolderById() uses; items come from the already
// existing getItemsByFolder(id).
async function getFolderChildren(id) {
  const all = await getFolders();
  const folders = all.filter((f) => String(f.parentId) === String(id));
  const items = await getItemsByFolder(id);
  return { folders, items };
}

// ---- storages ----
//
// No /api/v1/storages endpoint has been observed in traffic (unlike
// /api/v1/folders, /items, /playlists — see docs/MAIRLISTDB-API.md), and
// there is no live server available in this environment to probe it
// against. EditStorages is an advertised capability though, so this tries
// the endpoint (mirroring /api/v1/folders' station-scoped GET convention)
// and falls back to the same honest empty-array stub as before on a 404 —
// self-verifying the first time this actually runs against the live
// server, without ever guessing at a response shape that turns out wrong.
// Verified live response shape (see docs/MAIRLISTDB-API.md): a `/folders`-
// style { value: [...], Count } wrapper, entries shaped like
// { ID, Name, Description, DefaultLocation, ItemCount }. Mapped down to
// { id, name, location } to match sqlRepository.js's getStorages() shape —
// Description/ItemCount aren't part of that shape and aren't used by any
// caller (ItemCount is summed separately in getDashboardStats() below).
function mapApiStorageToInternal(apiStorage) {
  if (!apiStorage) return null;
  return {
    id: apiStorage.ID ?? apiStorage.Id ?? apiStorage.id,
    name: apiStorage.Name ?? apiStorage.name ?? "",
    location: apiStorage.DefaultLocation ?? apiStorage.Path ?? apiStorage.Location ?? apiStorage.location ?? "",
  };
}

async function getStorages() {
  const data = await apiRequest("GET", "/api/v1/storages");
  const list = Array.isArray(data) ? data : data?.value || data?.Storages;
  if (!Array.isArray(list)) {
    warnOnceUnexpectedShape("getStorages");
    return [];
  }
  return list.map(mapApiStorageToInternal);
}
const createStorage = notImplemented("createStorage");
const updateStorage = notImplemented("updateStorage");
const deleteStorage = notImplemented("deleteStorage");
const resolveAudioPath = notImplemented("resolveAudioPath");

// No /api/v1/log(s) endpoint documented or observed — the only playout-
// history endpoint is per item (GET /api/v1/items/<id>/history, already
// used by getItemHistory), which doesn't scale to a library-wide log view
// (would mean one request per item). Switched from a throwing stub to an
// empty result (mirrors the getStorages/getItemTypes/getAttributeKeys
// pattern) so the Logs page renders empty instead of erroring; warns once
// so the gap stays visible in the server log.
const getLogs = emptyStub("getLogs", []);
const getRecentLogs = emptyStub("getRecentLogs", []);

// getDashboardStats() -> { totalItems, totalStorages, totalFolders,
// totalUsers }, mirroring sqlRepository.js's shape. totalFolders comes from
// getFolders() (already fetches the whole 155-folder tree in one request);
// totalUsers comes from the webinterface's own auth store, independent of
// DATA_SOURCE (see webAuthDb.js). totalItems has no whole-library counter of
// its own, but /api/v1/storages's ItemCount field (verified live, see
// docs/MAIRLISTDB-API.md) gives an exact sum without walking folders;
// totalStorages is just that same list's length.
async function getDashboardStats() {
  const [folders, storagesData] = await Promise.all([getFolders(), apiRequest("GET", "/api/v1/storages")]);
  const storagesList = Array.isArray(storagesData) ? storagesData : storagesData?.value || storagesData?.Storages || [];
  return {
    totalItems: storagesList.reduce((sum, s) => sum + (Number(s.ItemCount) || 0), 0),
    totalStorages: storagesList.length,
    totalFolders: folders.length,
    totalUsers: webAuthDb.getUsers().length,
  };
}

// getTodayPlaylist() -> today's playlist entries across all hours with
// entries, resolved against items. Unlike the other stubs on this page,
// this one is fully implementable: getPlaylistsByDate/getPlaylistById are
// both already working API-backed functions (apiPlaylists.js), so this
// just composes them the same way sqlRepository.js's getTodayPlaylist()
// does.
async function getTodayPlaylist() {
  const today = new Date().toISOString().slice(0, 10);
  const days = await getPlaylistsByDate(today);
  const hoursWithEntries = days.filter((h) => h.hasEntries);

  const entries = [];
  for (const hour of hoursWithEntries) {
    const playlist = await getPlaylistById(hour.id);
    for (const entry of playlist.entries) entries.push(entry);
  }
  return entries;
}

module.exports = {
  ApiNotFoundError,
  ApiUnreachableError,
  mapApiItemToInternal: apiItems.mapApiItemToInternal,
  mapInternalItemToApi: apiItems.mapInternalItemToApi,
  getFolders: apiFolders.getFolders,
  getItemsByFolder: apiItems.getItemsByFolder,
  getItemById: apiItems.getItemById,
  getItemsByIds: apiItems.getItemsByIds,
  getItemFolders: apiItems.getItemFolders,
  getItemRestrictions: apiItems.getItemRestrictions,
  getItemHistory: apiItems.getItemHistory,
  getAudioStreamUrl: apiAudio.getAudioStreamUrl,
  getAudioStream: apiAudio.getAudioStream,
  updateItem: apiItems.updateItem,
  updateContainerContents: apiItems.updateContainerContents,
  createItem: apiItems.createItem,
  deleteItem: apiItems.deleteItem,
  assignItemsToFolder: apiItems.assignItemsToFolder,
  removeItemFromFolder: apiItems.removeItemFromFolder,
  setItemFolders: apiItems.setItemFolders,
  getPlaylistHour: apiPlaylists.getPlaylistHour,
  getPlaylistAttributes: apiPlaylists.getPlaylistAttributes,
  writeHour: apiPlaylists.writeHour,
  getPermissions,
  getCapabilities,
  getConfig: apiItems.getConfig,
  getArtists: apiItems.getArtists,
  getTitles: apiItems.getTitles,
  getFolderTree: apiFolders.getFolderTree,
  getFolderById: apiFolders.getFolderById,
  getFolderChildren,
  createFolder: apiFolders.createFolder,
  renameFolder: apiFolders.renameFolder,
  moveFolder: apiFolders.moveFolder,
  deleteFolder: apiFolders.deleteFolder,
  getStorages,
  createStorage,
  updateStorage,
  deleteStorage,
  getItemTypes: apiItems.getItemTypes,
  getAttributeKeys: apiItems.getAttributeKeys,
  getItems: apiItems.getItems,
  searchItems: apiItems.searchItems,
  getCuePoints: apiItems.getCuePoints,
  getAttributeDefinitions: apiItems.getAttributeDefinitions,
  moveItemToFolder: apiItems.moveItemToFolder,
  uploadFile: apiItems.uploadFile,
  resolveAudioPath,
  getPlaylistsByDate: apiPlaylists.getPlaylistsByDate,
  getPlaylistById: apiPlaylists.getPlaylistById,
  reorderPlaylist: apiPlaylists.reorderPlaylist,
  insertPlaylistItem: apiPlaylists.insertPlaylistItem,
  removePlaylistItem: apiPlaylists.removePlaylistItem,
  savePlaylistItemOverrides: apiPlaylists.savePlaylistItemOverrides,
  getLogs,
  getDashboardStats,
  getRecentLogs,
  getTodayPlaylist,
};
