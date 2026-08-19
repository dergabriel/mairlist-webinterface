// Repository layer. This is the ONLY place that knows where data comes from.
//
// Right now it reads from mockData. When the real schema is available, we
// create a second implementation (e.g. sqlRepository.js) with the exact same
// function signatures, and switch via the DATA_SOURCE env variable. The API
// and the frontend never change.
//
// Interface (keep stable across implementations):
//   getFolderTree()          -> nested folder tree
//   getFolderById(id)        -> single folder or null
//   getFolderChildren(id)    -> { folders, items } directly under the folder (not recursive)
//   createFolder(name, parentId) -> newly created folder
//   renameFolder(id, name)   -> updated folder or null
//   moveFolder(id, newParentId) -> updated folder, null if not found, false if it would create a cycle
//   deleteFolder(id)         -> "ok" | "not_empty" | "not_found"
//   getStorages()            -> array of storages
//   createStorage(name, location) -> newly created storage
//   updateStorage(id, name, location) -> updated storage or null
//   deleteStorage(id)        -> { status: "ok" | "in_use" | "not_found", count? }
//   getItemTypes()           -> array of type definitions, each flagged hasItems
//   getArtists()             -> array of distinct artist names
//   getAttributeKeys()       -> array of { key, values } computed from items in the library
//   getItems(filters)        -> array of items (filtered)
//   getItemById(id)          -> single item or null
//   getItemHistory(id)       -> play history array (newest first) or null
//   searchItems(query, opts) -> array of items
//   getAttributeDefinitions() -> predefined attribute schema (Item Editor Attribute tab)
//   createItem(data)         -> newly created item
//   updateItem(id, data)     -> updated item or null
//   deleteItem(id)           -> true if an item was deleted, false otherwise
//   moveItemToFolder(id, folderId) -> updated item or null
//   uploadFile(storageId, filename, buffer, title) -> newly created item, or null if storage unknown
//   getPlaylistsByDate(date)  -> array of all 24 hours { id, date, hour, hasEntries } for that date, sorted by hour
//   getPlaylistById(id)       -> { id, date, hour, entries } with entries' items resolved, or null
//   reorderPlaylist(id, order) -> playlist (as getPlaylistById) with entries in `order`, or null
//   insertPlaylistItem(id, { itemId, afterPosition }) -> playlist (as getPlaylistById), or null
//   removePlaylistItem(id, position) -> playlist (as getPlaylistById), or null
//   savePlaylistItemOverrides(id, position, overrides) -> playlist (as getPlaylistById), or null
//   getLogs({ date, limit, offset }) -> array of playlistlog entries, newest first
//
// Playlist entry overrides (mAirList calls these "volatile" changes): a
// playlist entry may carry an `overrides` object with a subset of item
// fields (cue, attributes, ...) that apply ONLY to that one entry, in that
// one hour. They are never merged into the global item here — entries are
// returned with `item` (the untouched global item) and `overrides` (the
// per-instance patch) as two separate keys, and it's the caller's job to
// layer them for display. This mirrors real mAirList: editing an item
// opened from a playlist is local to that slot unless explicitly written
// back to the database.
//
// Writes currently mutate the in-memory mockData array (the "copy" per
// README's write-only-against-a-copy rule). Once the real schema is proven,
// only this file is swapped for a SQL-backed implementation.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { storages, folders, items, ITEM_TYPES, CUE_POINTS, ATTRIBUTE_DEFINITIONS, playlists } = require("./mockData");

// ---- auth (mock) ----
//
// Mirrors the real sqlRepository's shape (permissions = array of JSON-like
// blobs), but with a single hardcoded admin user and no group. See
// server/lib/passwordHash.js for why the real repo can't use bcrypt.

const MOCK_USER = { id: 1, username: "admin" };
const MOCK_PERMISSIONS = [
  { Type: "TDBPermissions", UserLevel: "Admin", GeneralPermissions: "All", LibraryPermissions: "All" },
];
const mockSessions = new Map(); // sid -> { userId, expiresAt }

// ---- admin: user management (mock) ----
//
// Structure mirrors sqlRepository's admin functions, backed by an in-memory
// array instead of auth_users/auth_user_scopes. MOCK_USER (id 1, "admin")
// is always present and carries MOCK_PERMISSIONS under scope id 1, matching
// the single auth_scopes row the real DB has.

const mockUsers = [
  { id: MOCK_USER.id, name: MOCK_USER.username, description: "Administrator" },
];
let nextMockUserId = 2;
const mockUserScopes = new Map([
  [MOCK_USER.id, [{ scopeId: 1, scopeName: "", permissions: MOCK_PERMISSIONS[0] }]],
]);

function rowToUserSummary(u) {
  return { id: u.id, name: u.name, description: u.description || "" };
}

function getUsers() {
  return mockUsers.map(rowToUserSummary);
}

function getUserWithScopes(id) {
  const u = mockUsers.find((x) => x.id === Number(id));
  if (!u) return null;
  return { ...rowToUserSummary(u), scopes: getUserPermissions(id) };
}

function createUser(name, description) {
  const user = { id: nextMockUserId++, name: (name || "").trim(), description: description || "" };
  mockUsers.push(user);
  mockUserScopes.set(user.id, []);
  return getUserWithScopes(user.id);
}

function updateUser(id, name, description) {
  const u = mockUsers.find((x) => x.id === Number(id));
  if (!u) return null;
  u.name = (name || "").trim();
  u.description = description || "";
  return getUserWithScopes(id);
}

function deleteUser(id) {
  const index = mockUsers.findIndex((x) => x.id === Number(id));
  if (index === -1) return false;
  mockUsers.splice(index, 1);
  mockUserScopes.delete(Number(id));
  return true;
}

function changeUserPassword(id) {
  return mockUsers.some((x) => x.id === Number(id));
}

function getUserPermissions(id) {
  return mockUserScopes.get(Number(id)) || [];
}

function setUserPermissions(id, scopeId, permissions) {
  const userId = Number(id);
  const scopes = mockUserScopes.get(userId) || [];
  const existing = scopes.find((s) => s.scopeId === scopeId);
  if (existing) {
    existing.permissions = permissions;
  } else {
    scopes.push({ scopeId, scopeName: "", permissions });
  }
  mockUserScopes.set(userId, scopes);
  return scopes;
}

const mockTokens = new Map(); // userId -> array of token rows
let nextMockTokenId = 1;

function getTokensByUserId(userId) {
  return mockTokens.get(Number(userId)) || [];
}

function createToken(userId, scopeId) {
  const token = {
    id: nextMockTokenId++,
    userId: Number(userId),
    scopeId,
    token: crypto.randomBytes(32).toString("hex"),
    refreshToken: null,
    authCode: null,
    permissions: null,
    created: new Date().toISOString(),
    expires: null,
  };
  const list = mockTokens.get(Number(userId)) || [];
  list.push(token);
  mockTokens.set(Number(userId), list);
  return token;
}

function deleteToken(tokenId) {
  const id = Number(tokenId);
  for (const [userId, list] of mockTokens) {
    const index = list.findIndex((t) => t.id === id);
    if (index !== -1) {
      list.splice(index, 1);
      mockTokens.set(userId, list);
      return true;
    }
  }
  return false;
}

// ---- admin: group management (mock) ----
//
// Structure mirrors sqlRepository's admin group functions, backed by
// in-memory arrays/maps instead of auth_groups/auth_group_members/auth_group_scopes.

const mockGroups = [];
let nextMockGroupId = 1;
const mockGroupMembers = new Map(); // groupId -> array of userId
const mockGroupScopes = new Map(); // groupId -> array of { scopeId, scopeName, permissions }

function rowToGroupSummary(g) {
  return { id: g.id, name: g.name, description: g.description || "" };
}

function getGroups() {
  return mockGroups.map(rowToGroupSummary);
}

function getGroupMembers(id) {
  const memberIds = mockGroupMembers.get(Number(id)) || [];
  return mockUsers.filter((u) => memberIds.includes(u.id)).map(rowToUserSummary);
}

function getGroupPermissions(id) {
  return mockGroupScopes.get(Number(id)) || [];
}

function getGroupById(id) {
  const g = mockGroups.find((x) => x.id === Number(id));
  if (!g) return null;
  return { ...rowToGroupSummary(g), members: getGroupMembers(id), scopes: getGroupPermissions(id) };
}

function createGroup(name, description) {
  const group = { id: nextMockGroupId++, name: (name || "").trim(), description: description || "" };
  mockGroups.push(group);
  mockGroupMembers.set(group.id, []);
  mockGroupScopes.set(group.id, []);
  return getGroupById(group.id);
}

function updateGroup(id, name, description) {
  const g = mockGroups.find((x) => x.id === Number(id));
  if (!g) return null;
  g.name = (name || "").trim();
  g.description = description || "";
  return getGroupById(id);
}

function deleteGroup(id) {
  const index = mockGroups.findIndex((x) => x.id === Number(id));
  if (index === -1) return false;
  mockGroups.splice(index, 1);
  mockGroupMembers.delete(Number(id));
  mockGroupScopes.delete(Number(id));
  return true;
}

function addGroupMember(groupId, userId) {
  const gId = Number(groupId);
  const members = mockGroupMembers.get(gId) || [];
  if (!members.includes(Number(userId))) members.push(Number(userId));
  mockGroupMembers.set(gId, members);
  return getGroupById(gId);
}

function removeGroupMember(groupId, userId) {
  const gId = Number(groupId);
  const members = mockGroupMembers.get(gId) || [];
  mockGroupMembers.set(gId, members.filter((id) => id !== Number(userId)));
  return getGroupById(gId);
}

function setGroupPermissions(groupId, scopeId, permissions) {
  const gId = Number(groupId);
  const scopes = mockGroupScopes.get(gId) || [];
  const existing = scopes.find((s) => s.scopeId === scopeId);
  if (existing) {
    existing.permissions = permissions;
  } else {
    scopes.push({ scopeId, scopeName: "", permissions });
  }
  mockGroupScopes.set(gId, scopes);
  return scopes;
}

function getUserByUsername(username) {
  if (username !== MOCK_USER.username) return null;
  return { id: MOCK_USER.id, username: MOCK_USER.username };
}

function getUserById(id) {
  return id === MOCK_USER.id ? { id: MOCK_USER.id, username: MOCK_USER.username } : null;
}

function getScopesByUserId(userId) {
  return userId === MOCK_USER.id ? MOCK_PERMISSIONS : [];
}

function getScopesByGroupId() {
  return [];
}

function createSession(userId, sid, expiresAt) {
  mockSessions.set(sid, { userId, expiresAt });
}

function getSessionBySid(sid) {
  return mockSessions.get(sid) || null;
}

function deleteSession(sid) {
  mockSessions.delete(sid);
}

// Mock login only ever has one user/password ("admin"/"admin"), so a
// plaintext compare is enough — no need to pull bcrypt into the request path.
function verifyUserPassword(user, password) {
  return user.username === MOCK_USER.username && password === "admin";
}

// Fields a caller may set via createItem / updateItem.
// Prevents accidental overwrite of id, internalId, updatedAt etc.
const ITEM_WRITABLE_FIELDS = new Set([
  "type", "containerType", "title", "artist", "duration", "endTime",
  "storageId", "relativePath", "folderId", "comment", "color", "cover",
  "cue", "playback", "attributes",
  "scheduledStart", "scheduledEnd", "scheduledDays",
]);

function pickWritable(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([k]) => ITEM_WRITABLE_FIELDS.has(k))
  );
}

function getFolderTree() {
  const byParent = (parentId) =>
    folders
      .filter((f) => f.parentId === parentId)
      .map((f) => ({ ...f, children: byParent(f.id) }));
  return byParent(null);
}

function getFolderById(id) {
  return folders.find((f) => f.id === Number(id)) || null;
}

// Direct (non-recursive) children of a folder: its immediate subfolders and
// the items filed directly under it. Used to lazily populate the tree on
// expand instead of shipping the whole library up front.
function getFolderChildren(id) {
  const folderId = Number(id);
  return {
    folders: folders.filter((f) => f.parentId === folderId),
    items: items.filter((i) => i.folderId === folderId),
  };
}

function nextFolderId() {
  const max = folders.reduce((acc, f) => Math.max(acc, f.id), 0);
  return max + 1;
}

// Collects the ids of a folder and every descendant, used to guard against
// moving/deleting a folder into its own subtree.
function collectFolderAndDescendants(id) {
  const ids = [id];
  const children = folders.filter((f) => f.parentId === id);
  for (const child of children) ids.push(...collectFolderAndDescendants(child.id));
  return ids;
}

function createFolder(name, parentId) {
  const folder = {
    id: nextFolderId(),
    name: (name || "").trim(),
    parentId: parentId == null ? null : Number(parentId),
  };
  // TODO: replace with a real SQL INSERT once the schema is confirmed.
  folders.push(folder);
  return folder;
}

function renameFolder(id, name) {
  const folder = getFolderById(id);
  if (!folder) return null;
  // TODO: replace with a real SQL UPDATE once the schema is confirmed.
  folder.name = (name || "").trim();
  return folder;
}

// Moves a folder under newParentId. Returns null if the folder doesn't
// exist, or false if the move would create a cycle (target is the folder
// itself or one of its own descendants).
function moveFolder(id, newParentId) {
  const folder = getFolderById(id);
  if (!folder) return null;

  const targetId = newParentId == null ? null : Number(newParentId);
  if (targetId != null && collectFolderAndDescendants(folder.id).includes(targetId)) {
    return false;
  }

  // TODO: replace with a real SQL UPDATE once the schema is confirmed.
  folder.parentId = targetId;
  return folder;
}

// Deletes a folder. Returns "not_found", "not_empty" (has items or
// subfolders), or "ok".
function deleteFolder(id) {
  const folder = getFolderById(id);
  if (!folder) return "not_found";

  const hasSubfolders = folders.some((f) => f.parentId === folder.id);
  const hasItems = items.some((i) => i.folderId === folder.id);
  if (hasSubfolders || hasItems) return "not_empty";

  // TODO: replace with a real SQL DELETE once the schema is confirmed.
  const index = folders.findIndex((f) => f.id === folder.id);
  folders.splice(index, 1);
  return "ok";
}

function getStorages() {
  return storages;
}

function nextStorageId() {
  const max = storages.reduce((acc, s) => Math.max(acc, s.id), 0);
  return max + 1;
}

function createStorage(name, location) {
  const storage = { id: nextStorageId(), name: (name || "").trim(), location: location || "" };
  storages.push(storage);
  return storage;
}

function updateStorage(id, name, location) {
  const storage = storages.find((s) => s.id === Number(id));
  if (!storage) return null;
  storage.name = (name || "").trim();
  storage.location = location || "";
  return storage;
}

function deleteStorage(id) {
  const storage = storages.find((s) => s.id === Number(id));
  if (!storage) return { status: "not_found" };

  const count = items.filter((i) => i.storageId === storage.id).length;
  if (count > 0) return { status: "in_use", count };

  const index = storages.findIndex((s) => s.id === storage.id);
  storages.splice(index, 1);
  return { status: "ok" };
}

function getItemTypes() {
  // Return full type definitions. Mark which types have items in the library,
  // mirroring the mAirList tree (only used types are shown there).
  const used = new Set(items.map((i) => i.type));
  return ITEM_TYPES.map((t) => ({ ...t, hasItems: used.has(t.key) }));
}

function getArtists() {
  const names = new Set(
    items.map((i) => i.artist).filter((a) => a && a.trim() !== "")
  );
  return [...names].sort((a, b) => a.localeCompare(b));
}

// Attribute keys actually present in the library, each with the distinct
// values seen across all items, computed from `items[].attributes` (a
// free-form VARCHAR key/value store per docs/SCHEMA.md item_attributes, not
// the fixed ATTRIBUTE_DEFINITIONS catalogue). Drives the Attributes tree node.
function getAttributeKeys() {
  const byKey = new Map();
  for (const item of items) {
    for (const [key, value] of Object.entries(item.attributes || {})) {
      if (value == null || value === "") continue;
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key).add(String(value));
    }
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({ key, values: [...values].sort((a, b) => a.localeCompare(b)) }));
}

function getItems(filters = {}) {
  let result = [...items];
  if (filters.type) result = result.filter((i) => i.type === filters.type);
  if (filters.artist) result = result.filter((i) => i.artist === filters.artist);
  if (filters.folderId != null)
    result = result.filter((i) => i.folderId === Number(filters.folderId));
  if (filters.storageId != null)
    result = result.filter((i) => i.storageId === Number(filters.storageId));
  if (filters.attributeKey)
    result = result.filter(
      (i) => String(i.attributes?.[filters.attributeKey] ?? "") === String(filters.attributeValue)
    );
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
  const safe = pickWritable(data);
  const internalId = nextInternalId();
  const item = {
    id: String(internalId),
    internalId,
    externalId: safe.externalId ?? null,
    type: safe.type || "music",
    containerType: safe.containerType,
    title: safe.title || "",
    artist: safe.artist || "",
    duration: safe.duration != null ? Number(safe.duration) : 0,
    endTime: safe.endTime ?? null,
    storageId: safe.storageId ?? null,
    relativePath: safe.relativePath ?? null,
    folderId: safe.folderId ?? null,
    comment: safe.comment || "",
    color: safe.color ?? null,
    cover: safe.cover ?? null,
    cue: emptyCue(),
    playback: emptyPlayback(),
    attributes: safe.attributes || {},
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
  Object.assign(item, pickWritable(data), { updatedAt: new Date().toISOString() });
  return item;
}

function deleteItem(id) {
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return false;
  // TODO: replace with a real SQL DELETE once the schema is confirmed.
  items.splice(index, 1);
  return true;
}

// Moves an item into a (virtual) folder, or clears it (folderId == null).
// Returns the updated item, or null if it doesn't exist.
function moveItemToFolder(id, folderId) {
  const item = getItemById(id);
  if (!item) return null;
  // TODO: replace with real SQL (item_folders n:m table per docs/SCHEMA.md).
  item.folderId = folderId == null ? null : Number(folderId);
  item.updatedAt = new Date().toISOString();
  return item;
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

// Resolves the absolute audio file path for an item: storage.location (the
// real, Windows-style mAirList path) joined with the item's relativePath.
// AUDIO_BASE_DIR overrides storage.location for local dev, same idea as
// UPLOAD_BASE_DIR above, so test MP3s can live under a plain relative folder
// instead of a Windows drive that doesn't exist locally. Windows separators
// in relativePath are normalised so it also resolves correctly on macOS/Linux.
// Returns null if the item doesn't exist, has no storage, or no file path.
function resolveAudioPath(id) {
  const item = getItemById(id);
  if (!item || item.storageId == null || !item.relativePath) return null;

  const storage = storages.find((s) => s.id === item.storageId);
  if (!storage) return null;

  const base = process.env.AUDIO_BASE_DIR
    ? path.join(process.env.AUDIO_BASE_DIR, storage.name)
    : storage.location;

  // Normalise Windows-style separators, then resolve.
  // Path-Traversal-Schutz: aufgelöster Pfad muss innerhalb von base liegen.
  const relativeParts = item.relativePath.split(/[\\/]+/);
  const resolvedBase = path.resolve(base);
  const resolvedFile = path.resolve(path.join(base, ...relativeParts));

  if (!resolvedFile.startsWith(resolvedBase + path.sep)) return null;

  return resolvedFile;
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

  // Path-Traversal-Schutz: Zielverzeichnis muss innerhalb von UPLOAD_BASE_DIR liegen
  if (process.env.UPLOAD_BASE_DIR) {
    const resolvedBase = path.resolve(process.env.UPLOAD_BASE_DIR);
    const resolvedTarget = path.resolve(targetDir);
    if (!resolvedTarget.startsWith(resolvedBase + path.sep)) return null;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, safeFilename), buffer);

  return createItem({
    title: derivedTitle,
    storageId: storage.id,
    relativePath: safeFilename,
  });
}

// Synthetic id used for an hour that has no playlist record yet. Stable per
// date+hour so the frontend can select an empty hour and, if an item is
// inserted, insertPlaylistItem() can find/materialize the same record.
const emptyHourId = (date, hour) => `${date}-${String(hour).padStart(2, "0")}`;

// All 24 hours (00-23) for a given date, sorted by hour. Every hour is
// included so the UI can render the full day; hasEntries marks which ones
// actually have a playlist with entries.
function getPlaylistsByDate(date) {
  const byHour = new Map(playlists.filter((p) => p.date === date).map((p) => [p.hour, p]));
  return Array.from({ length: 24 }, (_, hour) => {
    const existing = byHour.get(hour);
    return {
      id: existing ? existing.id : emptyHourId(date, hour),
      date,
      hour,
      hasEntries: !!existing && existing.entries.length > 0,
    };
  });
}

// Single hour's playlist with entries resolved against `items`. Returns
// null if the id is neither an existing playlist nor a valid synthetic
// empty-hour id, so the route can 404.
function getPlaylistById(id) {
  const playlist = playlists.find((p) => p.id === id);
  if (playlist) {
    const entries = [...playlist.entries]
      .sort((a, b) => a.position - b.position)
      // `overrides` is passed through as-is (undefined if never set) — NOT
      // merged into `item`. The global item stays untouched; merging the two
      // for display is the frontend's job, per entry, on demand.
      .map((entry) => ({ ...entry, item: getItemById(entry.itemId) || null }));
    return { id: playlist.id, date: playlist.date, hour: playlist.hour, entries };
  }

  const empty = parseEmptyHourId(id);
  if (!empty) return null;
  return { id, date: empty.date, hour: empty.hour, entries: [] };
}

// Sets (or clears, if `overrides` is null/empty) the volatile per-instance
// overrides on the entry at `position`. These values apply only to this one
// playlist slot and are never written into the global item. Returns the
// resolved playlist, or null if the playlist or entry doesn't exist.
function savePlaylistItemOverrides(id, position, overrides) {
  const playlist = playlists.find((p) => p.id === id);
  if (!playlist) return null;

  const entry = playlist.entries.find((e) => e.position === Number(position));
  if (!entry) return null;

  // TODO: replace with a real SQL UPDATE (playlist_entry.overrides) once the schema is confirmed.
  if (overrides == null || Object.keys(overrides).length === 0) {
    delete entry.overrides;
  } else {
    entry.overrides = overrides;
  }
  return getPlaylistById(id);
}

// Parses a synthetic empty-hour id back into { date, hour }, or null if it
// isn't one.
function parseEmptyHourId(id) {
  const match = /^(\d{4}-\d{2}-\d{2})-(\d{2})$/.exec(id);
  if (!match) return null;
  return { date: match[1], hour: Number(match[2]) };
}

// Finds the playlist record for `id`, creating an empty one from a
// synthetic empty-hour id if it doesn't exist yet. Returns null if `id` is
// neither a known playlist nor a valid empty-hour id.
function getOrCreatePlaylist(id) {
  let playlist = playlists.find((p) => p.id === id);
  if (playlist) return playlist;

  const empty = parseEmptyHourId(id);
  if (!empty) return null;
  playlist = { id, date: empty.date, hour: empty.hour, entries: [] };
  playlists.push(playlist);
  return playlist;
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
// if the playlist doesn't exist (or can't be created from `id`) or the item
// doesn't exist. `id` may be a synthetic empty-hour id, in which case the
// playlist record is created on first insert.
function insertPlaylistItem(id, { itemId, afterPosition }) {
  const playlist = getOrCreatePlaylist(id);
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

// getLogs({ date, limit, offset }) -> array of playlistlog entries, newest first.
// No mock playlistlog data exists yet, so this always returns an empty array.
function getLogs() {
  return [];
}

module.exports = {
  getFolderTree,
  getFolderById,
  getFolderChildren,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  getStorages,
  createStorage,
  updateStorage,
  deleteStorage,
  getItemTypes,
  getArtists,
  getAttributeKeys,
  getItems,
  getItemById,
  getItemHistory,
  searchItems,
  getCuePoints,
  getAttributeDefinitions,
  createItem,
  updateItem,
  deleteItem,
  moveItemToFolder,
  uploadFile,
  resolveAudioPath,
  getPlaylistsByDate,
  getPlaylistById,
  reorderPlaylist,
  insertPlaylistItem,
  removePlaylistItem,
  savePlaylistItemOverrides,
  getLogs,
  getUserByUsername,
  getUserById,
  getScopesByUserId,
  getScopesByGroupId,
  createSession,
  getSessionBySid,
  deleteSession,
  verifyUserPassword,
  getUsers,
  getUserWithScopes,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword,
  getUserPermissions,
  setUserPermissions,
  getTokensByUserId,
  createToken,
  deleteToken,
  getGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  setGroupPermissions,
};