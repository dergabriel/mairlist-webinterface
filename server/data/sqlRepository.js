// SQL-backed repository. Same interface as repository.js (see comments
// there), backed by the real mAirList SQLite database via better-sqlite3.
//
// Only single station/subplaylist is used in practice (station=1,
// subplaylist=0) — the real DB only ever has one row for each, so both are
// hardcoded rather than threaded through every function signature.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { CUE_POINTS, ATTRIBUTE_DEFINITIONS } = require("./mockData");
const { verifyPassword, hashPassword } = require("../lib/passwordHash");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../mairlist.mldb");
const db = new Database(DB_PATH, { readonly: false });
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const STATION = 1;
const SUBPLAYLIST = 0;

// Fields a caller may set via createItem / updateItem. Mirrors repository.js.
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

// camelCase (code) <-> PascalCase (DB) cue marker types
const CUE_TO_DB = {
  cueIn: "CueIn", fadeIn: "FadeIn", ramp1: "Ramp1", ramp2: "Ramp2", ramp3: "Ramp3",
  loopIn: "LoopIn", loopOut: "LoopOut", hookIn: "HookIn", hookFade: "HookFade",
  hookOut: "HookOut", outro: "Outro", startNext: "StartNext", fadeOut: "FadeOut",
  fadeEnd: "FadeEnd", cueOut: "CueOut", preroll: "Preroll", anchor: "Anchor",
};
const DB_TO_CUE = Object.fromEntries(Object.entries(CUE_TO_DB).map(([k, v]) => [v, k]));

// item.type: DB PascalCase <-> code lowercase
const typeToCode = (t) => (t || "").toLowerCase();
const typeToDb = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

// Slot string -> { date, hour }. Midnight is stored bare ("2026-03-21"),
// every other hour carries a time component ("2026-03-21 08:00:00.000").
function parseSlot(slot) {
  if (!slot) return null;
  const dateStr = slot.slice(0, 10);
  if (slot.length === 10) return { date: dateStr, hour: 0 };
  const hourMatch = slot.match(/\s(\d{2}):/);
  return { date: dateStr, hour: hourMatch ? parseInt(hourMatch[1], 10) : 0 };
}

function buildSlot(date, hour) {
  if (hour === 0) return date;
  return `${date} ${String(hour).padStart(2, "0")}:00:00.000`;
}

function parsePlaylistId(id) {
  const match = /^(\d{4}-\d{2}-\d{2})-(\d{2})$/.exec(id);
  if (!match) return null;
  return { date: match[1], hour: parseInt(match[2], 10) };
}

const playlistId = (date, hour) => `${date}-${String(hour).padStart(2, "0")}`;

// ---- folders ----

function rowToFolder(row) {
  if (!row) return null;
  return { id: row.idx, name: row.name || "", parentId: row.parent == null ? null : row.parent };
}

function getFolderTree() {
  const all = db.prepare("SELECT idx, parent, name FROM folders").all();
  const byParent = (parentId) =>
    all
      .filter((f) => (f.parent == null ? null : f.parent) === parentId)
      .map((f) => ({ ...rowToFolder(f), children: byParent(f.idx) }));
  return byParent(null);
}

function getFolderById(id) {
  const row = db.prepare("SELECT idx, parent, name FROM folders WHERE idx = ?").get(Number(id));
  return rowToFolder(row);
}

// Direct (non-recursive) children of a folder: its immediate subfolders and
// the items filed directly under it via item_folders.
function getFolderChildren(id) {
  const folderId = Number(id);
  const folderRows = db.prepare("SELECT idx, parent, name FROM folders WHERE parent = ?").all(folderId);
  const itemIds = db.prepare("SELECT item FROM item_folders WHERE folder = ?").all(folderId).map((r) => r.item);
  return {
    folders: folderRows.map(rowToFolder),
    items: itemIds.map((itemId) => getItemById(itemId)).filter(Boolean),
  };
}

function collectFolderAndDescendants(id) {
  const ids = [id];
  const children = db.prepare("SELECT idx FROM folders WHERE parent = ?").all(id);
  for (const child of children) ids.push(...collectFolderAndDescendants(child.idx));
  return ids;
}

function createFolder(name, parentId) {
  const info = db
    .prepare("INSERT INTO folders (parent, name) VALUES (?, ?)")
    .run(parentId == null ? null : Number(parentId), (name || "").trim());
  return getFolderById(info.lastInsertRowid);
}

function renameFolder(id, name) {
  const folder = getFolderById(id);
  if (!folder) return null;
  db.prepare("UPDATE folders SET name = ? WHERE idx = ?").run((name || "").trim(), folder.id);
  return getFolderById(id);
}

function moveFolder(id, newParentId) {
  const folder = getFolderById(id);
  if (!folder) return null;

  const targetId = newParentId == null ? null : Number(newParentId);
  if (targetId != null && collectFolderAndDescendants(folder.id).includes(targetId)) {
    return false;
  }

  db.prepare("UPDATE folders SET parent = ? WHERE idx = ?").run(targetId, folder.id);
  return getFolderById(id);
}

function deleteFolder(id) {
  const folder = getFolderById(id);
  if (!folder) return "not_found";

  const hasSubfolders = db.prepare("SELECT 1 FROM folders WHERE parent = ? LIMIT 1").get(folder.id);
  const hasItems = db.prepare("SELECT 1 FROM item_folders WHERE folder = ? LIMIT 1").get(folder.id);
  if (hasSubfolders || hasItems) return "not_empty";

  db.prepare("DELETE FROM folders WHERE idx = ?").run(folder.id);
  return "ok";
}

// ---- storages ----

function rowToStorage(row) {
  if (!row) return null;
  return { id: row.idx, name: row.name || "", location: row.defaultLocation || "" };
}

function getStorages() {
  return db.prepare("SELECT idx, name, defaultLocation FROM storages").all().map(rowToStorage);
}

function getStorageById(id) {
  const row = db.prepare("SELECT idx, name, defaultLocation FROM storages WHERE idx = ?").get(Number(id));
  return rowToStorage(row);
}

function createStorage(name, location) {
  const info = db
    .prepare("INSERT INTO storages (name, defaultLocation) VALUES (?, ?)")
    .run((name || "").trim(), location || "");
  return getStorageById(info.lastInsertRowid);
}

function updateStorage(id, name, location) {
  const storage = getStorageById(id);
  if (!storage) return null;
  db.prepare("UPDATE storages SET name = ?, defaultLocation = ? WHERE idx = ?").run(
    (name || "").trim(),
    location || "",
    storage.id
  );
  return getStorageById(id);
}

function deleteStorage(id) {
  const storage = getStorageById(id);
  if (!storage) return { status: "not_found" };

  const { count } = db.prepare("SELECT COUNT(*) AS count FROM items WHERE storage = ?").get(storage.id);
  if (count > 0) return { status: "in_use", count };

  db.prepare("DELETE FROM storages WHERE idx = ?").run(storage.id);
  return { status: "ok" };
}

// ---- types / artists / attribute keys (static catalogues + derived) ----

function getItemTypes() {
  const rows = db.prepare(`
    SELECT DISTINCT type, COUNT(*) as count
    FROM items
    WHERE type IS NOT NULL AND type != ''
    GROUP BY type
    ORDER BY type
  `).all();
  return rows.map((r) => ({
    key: typeToCode(r.type),
    label: r.type,
    hasItems: r.count > 0,
    note: "",
  }));
}

function getArtists() {
  const rows = db
    .prepare("SELECT DISTINCT artist FROM items WHERE artist IS NOT NULL AND trim(artist) != ''")
    .all();
  return rows.map((r) => r.artist).sort((a, b) => a.localeCompare(b));
}

function getAttributeKeys() {
  const rows = db
    .prepare("SELECT DISTINCT name, value FROM item_attributes WHERE value IS NOT NULL AND value != ''")
    .all();
  const byKey = new Map();
  for (const row of rows) {
    if (!byKey.has(row.name)) byKey.set(row.name, new Set());
    byKey.get(row.name).add(String(row.value));
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => ({ key, values: [...values].sort((a, b) => a.localeCompare(b)) }));
}

// ---- items ----

function rowToItem(row) {
  if (!row) return null;

  const cueRows = db.prepare("SELECT type, value FROM item_cuemarkers WHERE item = ?").all(row.idx);
  const cue = {};
  for (const cp of CUE_POINTS) cue[cp.key] = null;
  for (const cr of cueRows) {
    const key = DB_TO_CUE[cr.type];
    if (key) cue[key] = cr.value;
  }

  const attrRows = db.prepare("SELECT name, value FROM item_attributes WHERE item = ?").all(row.idx);
  const attributes = {};
  for (const ar of attrRows) attributes[ar.name] = ar.value;

  const folderRow = db.prepare("SELECT folder FROM item_folders WHERE item = ? LIMIT 1").get(row.idx);

  return {
    id: String(row.idx),
    internalId: row.idx,
    externalId: row.externalid || null,
    type: typeToCode(row.type),
    containerType: null,
    title: row.title || "",
    artist: row.artist || "",
    duration: row.duration || 0,
    endTime: null,
    storageId: row.storage || null,
    relativePath: row.filename || null,
    folderId: folderRow ? folderRow.folder : null,
    comment: row.comment || "",
    color: row.color || null,
    cover: null,
    cue,
    playback: {
      gainDb: row.amplification || 0,
      normalizedLufs: row.level_loudness || null,
      segueMode: row.endtype || "normal",
    },
    attributes,
    updatedAt: row.updated || new Date().toISOString(),
    playHistory: [],
  };
}

const ITEM_COLUMNS =
  "idx, externalid, title, artist, type, duration, amplification, level_loudness, endtype, comment, color, storage, filename, updated";

function getItems(filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.type) {
    clauses.push("type = ?");
    params.push(typeToDb(filters.type));
  }
  if (filters.artist) {
    clauses.push("artist = ?");
    params.push(filters.artist);
  }
  if (filters.storageId != null) {
    clauses.push("storage = ?");
    params.push(Number(filters.storageId));
  }

  let rows = db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items${clauses.length ? " WHERE " + clauses.join(" AND ") : ""}`)
    .all(...params);

  let result = rows.map(rowToItem);

  if (filters.folderId != null) {
    result = result.filter((i) => i.folderId === Number(filters.folderId));
  }
  if (filters.attributeKey) {
    result = result.filter(
      (i) => String(i.attributes?.[filters.attributeKey] ?? "") === String(filters.attributeValue)
    );
  }

  return result;
}

function getItemById(id) {
  const row = db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE idx = ?`).get(Number(id));
  return rowToItem(row);
}

function getItemHistory(id) {
  const item = getItemById(id);
  if (!item) return null;

  const idStr = String(id);
  const rows = db
    .prepare(
      `SELECT slot FROM playlist
       WHERE station = ? AND subplaylist = ? AND (item = ? OR xmldata LIKE ?)
       ORDER BY slot DESC
       LIMIT 100`
    )
    .all(STATION, SUBPLAYLIST, Number(id), `%"${idStr}"%`);

  return rows
    .map((row) => {
      const parsed = parseSlot(row.slot);
      if (!parsed) return null;
      return { slot: row.slot, date: parsed.date, hour: parsed.hour };
    })
    .filter(Boolean);
}

function searchItems(query, opts = {}) {
  if (!query || query.trim() === "") return [];
  const q = `%${query.toLowerCase()}%`;
  const fields = opts.fields || ["title", "artist", "comment"];
  const validFields = fields.filter((f) => ["title", "artist", "comment"].includes(f));
  if (validFields.length === 0) return [];

  const where = validFields.map((f) => `lower(${f}) LIKE ?`).join(" OR ");
  const rows = db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE ${where}`)
    .all(...validFields.map(() => q));
  return rows.map(rowToItem);
}

function getCuePoints() {
  return CUE_POINTS;
}

function getAttributeDefinitions() {
  return ATTRIBUTE_DEFINITIONS;
}

function createItem(data = {}) {
  const safe = pickWritable(data);

  const insertItem = db.prepare(`
    INSERT INTO items (externalid, title, artist, type, duration, amplification, level_loudness, endtype, comment, color, storage, filename, created, updated)
    VALUES (@externalid, @title, @artist, @type, @duration, @amplification, @level_loudness, @endtype, @comment, @color, @storage, @filename, @now, @now)
  `);

  const run = db.transaction(() => {
    const now = new Date().toISOString();
    const info = insertItem.run({
      externalid: safe.externalId ?? null,
      title: safe.title || "",
      artist: safe.artist || "",
      type: typeToDb(safe.type || "music"),
      duration: safe.duration != null ? Number(safe.duration) : 0,
      amplification: safe.playback?.gainDb ?? 0,
      level_loudness: safe.playback?.normalizedLufs ?? null,
      endtype: safe.playback?.segueMode || "normal",
      comment: safe.comment || "",
      color: safe.color ?? null,
      storage: safe.storageId ?? null,
      filename: safe.relativePath ?? null,
      now,
    });
    const internalId = info.lastInsertRowid;

    if (safe.cue) writeCueMarkers(internalId, safe.cue);
    if (safe.attributes) writeAttributes(internalId, safe.attributes);
    if (safe.folderId != null) writeFolder(internalId, safe.folderId);

    return internalId;
  });

  const internalId = run();
  return getItemById(internalId);
}

function writeCueMarkers(itemId, cue) {
  const del = db.prepare("DELETE FROM item_cuemarkers WHERE item = ?");
  const ins = db.prepare("INSERT INTO item_cuemarkers (item, type, value) VALUES (?, ?, ?)");
  del.run(itemId);
  for (const [key, value] of Object.entries(cue)) {
    if (value == null) continue;
    const dbType = CUE_TO_DB[key];
    if (!dbType) continue;
    ins.run(itemId, dbType, Number(value));
  }
}

function writeAttributes(itemId, attributes) {
  const del = db.prepare("DELETE FROM item_attributes WHERE item = ?");
  const ins = db.prepare("INSERT INTO item_attributes (item, name, value) VALUES (?, ?, ?)");
  del.run(itemId);
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null || value === "") continue;
    ins.run(itemId, key, String(value));
  }
}

function writeFolder(itemId, folderId) {
  const del = db.prepare("DELETE FROM item_folders WHERE item = ?");
  del.run(itemId);
  if (folderId != null) {
    db.prepare("INSERT OR IGNORE INTO item_folders (item, folder) VALUES (?, ?)").run(itemId, Number(folderId));
  }
}

function updateItem(id, data = {}) {
  const existing = getItemById(id);
  if (!existing) return null;
  const safe = pickWritable(data);
  const internalId = Number(id);

  const run = db.transaction(() => {
    const now = new Date().toISOString();
    const fields = [];
    const params = { idx: internalId, now };

    if (safe.title !== undefined) { fields.push("title = @title"); params.title = safe.title; }
    if (safe.artist !== undefined) { fields.push("artist = @artist"); params.artist = safe.artist; }
    if (safe.type !== undefined) { fields.push("type = @type"); params.type = typeToDb(safe.type); }
    if (safe.duration !== undefined) { fields.push("duration = @duration"); params.duration = Number(safe.duration); }
    if (safe.comment !== undefined) { fields.push("comment = @comment"); params.comment = safe.comment; }
    if (safe.color !== undefined) { fields.push("color = @color"); params.color = safe.color; }
    if (safe.storageId !== undefined) { fields.push("storage = @storage"); params.storage = safe.storageId; }
    if (safe.relativePath !== undefined) { fields.push("filename = @filename"); params.filename = safe.relativePath; }
    if (safe.externalId !== undefined) { fields.push("externalid = @externalid"); params.externalid = safe.externalId; }
    if (safe.playback?.gainDb !== undefined) { fields.push("amplification = @amplification"); params.amplification = safe.playback.gainDb; }
    if (safe.playback?.normalizedLufs !== undefined) { fields.push("level_loudness = @level_loudness"); params.level_loudness = safe.playback.normalizedLufs; }
    if (safe.playback?.segueMode !== undefined) { fields.push("endtype = @endtype"); params.endtype = safe.playback.segueMode; }

    fields.push("updated = @now");

    db.prepare(`UPDATE items SET ${fields.join(", ")} WHERE idx = @idx`).run(params);

    if (safe.cue) writeCueMarkers(internalId, safe.cue);
    if (safe.attributes) writeAttributes(internalId, safe.attributes);
    if (safe.folderId !== undefined) writeFolder(internalId, safe.folderId);
  });

  run();
  return getItemById(id);
}

function deleteItem(id) {
  const internalId = Number(id);
  const existing = db.prepare("SELECT 1 FROM items WHERE idx = ?").get(internalId);
  if (!existing) return false;

  const run = db.transaction(() => {
    db.prepare("DELETE FROM item_cuemarkers WHERE item = ?").run(internalId);
    db.prepare("DELETE FROM item_attributes WHERE item = ?").run(internalId);
    db.prepare("DELETE FROM item_folders WHERE item = ?").run(internalId);
    db.prepare("DELETE FROM items WHERE idx = ?").run(internalId);
  });
  run();
  return true;
}

function moveItemToFolder(id, folderId) {
  const item = getItemById(id);
  if (!item) return null;
  writeFolder(Number(id), folderId == null ? null : Number(folderId));
  db.prepare("UPDATE items SET updated = ? WHERE idx = ?").run(new Date().toISOString(), Number(id));
  return getItemById(id);
}

// ---- upload ----

function sanitizeFilename(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const safeBase = base.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${safeBase}${ext}`;
}

function resolveStorageDir(storage) {
  const base = process.env.UPLOAD_BASE_DIR;
  if (!base) return storage.location;
  return path.join(base, storage.name);
}

function resolveAudioPath(id) {
  const item = getItemById(id);
  if (!item || item.storageId == null || !item.relativePath) return null;

  const storage = getStorages().find((s) => s.id === item.storageId);
  if (!storage) return null;

  const base = process.env.AUDIO_BASE_DIR
    ? path.join(process.env.AUDIO_BASE_DIR, storage.name)
    : storage.location;

  const relativeParts = item.relativePath.split(/[\\/]+/);
  const resolvedBase = path.resolve(base);
  const resolvedFile = path.resolve(path.join(base, ...relativeParts));

  if (!resolvedFile.startsWith(resolvedBase + path.sep)) return null;

  return resolvedFile;
}

function uploadFile(storageId, filename, buffer, title) {
  const storage = getStorages().find((s) => s.id === Number(storageId));
  if (!storage) return null;

  const safeFilename = sanitizeFilename(filename);
  const ext = path.extname(safeFilename);
  const derivedTitle = title && title.trim() !== "" ? title.trim() : path.basename(safeFilename, ext);

  const targetDir = resolveStorageDir(storage);

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

// ---- playlists ----

const emptyHourId = (date, hour) => `${date}-${String(hour).padStart(2, "0")}`;

function getPlaylistsByDate(date) {
  const rows = db
    .prepare("SELECT DISTINCT slot FROM playlist WHERE station = ? AND subplaylist = ? AND slot LIKE ?")
    .all(STATION, SUBPLAYLIST, `${date}%`);

  const hoursWithEntries = new Set();
  for (const row of rows) {
    const parsed = parseSlot(row.slot);
    if (parsed && parsed.date === date) {
      const hasEntries = db
        .prepare("SELECT 1 FROM playlist WHERE station = ? AND subplaylist = ? AND slot = ? AND item IS NOT NULL AND item != '' LIMIT 1")
        .get(STATION, SUBPLAYLIST, row.slot);
      if (hasEntries) hoursWithEntries.add(parsed.hour);
    }
  }

  return Array.from({ length: 24 }, (_, hour) => ({
    id: emptyHourId(date, hour),
    date,
    hour,
    hasEntries: hoursWithEntries.has(hour),
  }));
}

// getLogs({ date, limit, offset }) -> playlistlog entries joined with the
// item's title, newest first. `date` filters starttime to that calendar day.
function getLogs({ date, limit = 200, offset = 0 } = {}) {
  const clauses = ["station = ?"];
  const params = [STATION];

  if (date) {
    clauses.push("starttime >= ? AND starttime < ?");
    params.push(`${date} 00:00:00`, `${date} 23:59:59.999`);
  }

  params.push(Number(limit), Number(offset));

  const rows = db
    .prepare(`
      SELECT playlistlog.starttime, playlistlog.station, playlistlog.studio,
             items.title AS item, playlistlog.duration,
             playlistlog.listeners_start, playlistlog.listeners_stop, playlistlog.info
      FROM playlistlog
      LEFT JOIN items ON items.idx = playlistlog.item
      WHERE ${clauses.join(" AND ")}
      ORDER BY playlistlog.starttime DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params);

  return rows.map((r) => ({
    starttime: r.starttime,
    station: r.station,
    studio: r.studio,
    item: r.item,
    duration: r.duration,
    listeners_start: r.listeners_start,
    listeners_stop: r.listeners_stop,
    info: r.info,
  }));
}

// getDashboardStats() -> { totalItems, totalStorages, totalFolders, totalUsers }
function getDashboardStats() {
  return {
    totalItems: db.prepare("SELECT COUNT(*) AS count FROM items").get().count,
    totalStorages: db.prepare("SELECT COUNT(*) AS count FROM storages").get().count,
    totalFolders: db.prepare("SELECT COUNT(*) AS count FROM folders").get().count,
    totalUsers: db.prepare("SELECT COUNT(*) AS count FROM auth_users").get().count,
  };
}

// getRecentLogs(limit) -> last playlistlog entries, newest first, joined with
// the item's title.
function getRecentLogs(limit = 10) {
  const rows = db
    .prepare(`
      SELECT playlistlog.starttime, playlistlog.station, playlistlog.studio,
             items.title AS item, playlistlog.duration
      FROM playlistlog
      LEFT JOIN items ON items.idx = playlistlog.item
      WHERE playlistlog.station = ?
      ORDER BY playlistlog.starttime DESC
      LIMIT ?
    `)
    .all(STATION, Number(limit));

  return rows.map((r) => ({
    starttime: r.starttime,
    station: r.station,
    studio: r.studio,
    item: r.item,
    duration: r.duration,
  }));
}

// getTodayPlaylist() -> today's playlist entries across all hours, resolved
// against items and sorted by scheduled slot.
function getTodayPlaylist() {
  const today = new Date().toISOString().slice(0, 10);
  const hours = getPlaylistsByDate(today).filter((h) => h.hasEntries);

  const entries = [];
  for (const hour of hours) {
    const playlist = getPlaylistById(hour.id);
    for (const entry of playlist.entries) entries.push(entry);
  }
  return entries;
}

function getPlaylistById(id) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  const { date, hour } = parsed;
  const slot = buildSlot(date, hour);

  const rows = db
    .prepare("SELECT pos, item, xmldata FROM playlist WHERE station = ? AND subplaylist = ? AND slot = ? ORDER BY pos")
    .all(STATION, SUBPLAYLIST, slot);

  const entries = rows
    .filter((r) => r.item != null && r.item !== "")
    .map((r) => {
      let overrides;
      if (r.xmldata) {
        try {
          overrides = JSON.parse(r.xmldata);
        } catch {
          overrides = undefined;
        }
      }
      return {
        position: r.pos + 1,
        itemId: String(r.item),
        scheduledStart: "",
        overrides,
        item: getItemById(String(r.item)),
      };
    });

  resequenceEntries(entries, hour);

  return { id, date, hour, entries };
}

// In-memory recompute of scheduledStart, mirrors repository.js's resequence
// but operates on already-loaded entries (position stays DB-order based).
function resequenceEntries(entries, hour) {
  let cursorSeconds = hour * 3600;
  for (const entry of entries) {
    const h = String(Math.floor(cursorSeconds / 3600) % 24).padStart(2, "0");
    const m = String(Math.floor((cursorSeconds % 3600) / 60)).padStart(2, "0");
    const s = String(Math.floor(cursorSeconds % 60)).padStart(2, "0");
    entry.scheduledStart = `${h}:${m}:${s}`;
    cursorSeconds += entry.item ? entry.item.duration : 0;
  }
}

// Rewrites all rows for (date,hour) from an ordered list of { itemId, overrides? }.
// TODO: this is a full delete+reinsert of the hour, adequate for Phase G's
// proof of writes; a real implementation would prefer targeted position
// shifts to avoid clobbering starttime/state/uniqueid on live/aired slots.
function writeHour(date, hour, entryList) {
  const slot = buildSlot(date, hour);
  const del = db.prepare("DELETE FROM playlist WHERE station = ? AND subplaylist = ? AND slot = ?");
  // pos is the schema's position column (0-based); it is written explicitly
  // from each entry's array index below, so ordering survives the delete+reinsert.
  const ins = db.prepare(
    "INSERT INTO playlist (station, subplaylist, slot, pos, item, duration, xmldata) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const run = db.transaction(() => {
    del.run(STATION, SUBPLAYLIST, slot);
    entryList.forEach((entry, i) => {
      const item = getItemById(entry.itemId);
      ins.run(
        STATION,
        SUBPLAYLIST,
        slot,
        i,
        Number(entry.itemId),
        item ? item.duration : null,
        entry.overrides ? JSON.stringify(entry.overrides) : null
      );
    });
  });
  run();
}

function reorderPlaylist(id, order) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  const existing = getPlaylistById(id);
  if (!existing) return null;

  const byPosition = new Map(existing.entries.map((e) => [e.position, e]));
  if (order.length !== existing.entries.length) return null;
  const reordered = order.map((pos) => byPosition.get(Number(pos)));
  if (reordered.some((e) => !e)) return null;

  writeHour(parsed.date, parsed.hour, reordered);
  return getPlaylistById(id);
}

function insertPlaylistItem(id, { itemId, afterPosition }) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  if (!getItemById(itemId)) return null;

  const existing = getPlaylistById(id);
  if (!existing) return null;

  const insertAt = afterPosition == null ? existing.entries.length : Number(afterPosition);
  const list = existing.entries.map((e) => ({ itemId: e.itemId, overrides: e.overrides }));
  list.splice(insertAt, 0, { itemId: String(itemId) });

  writeHour(parsed.date, parsed.hour, list);
  return getPlaylistById(id);
}

function removePlaylistItem(id, position) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  const existing = getPlaylistById(id);
  if (!existing) return null;

  const index = existing.entries.findIndex((e) => e.position === Number(position));
  if (index === -1) return null;

  const list = existing.entries.map((e) => ({ itemId: e.itemId, overrides: e.overrides }));
  list.splice(index, 1);

  writeHour(parsed.date, parsed.hour, list);
  return getPlaylistById(id);
}

function savePlaylistItemOverrides(id, position, overrides) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  const existing = getPlaylistById(id);
  if (!existing) return null;

  const entry = existing.entries.find((e) => e.position === Number(position));
  if (!entry) return null;

  const list = existing.entries.map((e) => ({
    itemId: e.itemId,
    overrides: e.position === Number(position)
      ? (overrides == null || Object.keys(overrides).length === 0 ? undefined : overrides)
      : e.overrides,
  }));

  writeHour(parsed.date, parsed.hour, list);
  return getPlaylistById(id);
}

// ---- auth ----
//
// Real schema (see docs/SCHEMA.md / PRAGMA table_info, Phase F):
//   auth_users(id, name, description, pw_salt, pw_hash)
//   auth_user_scopes(user_id, scope_id, permissions)  -- permissions is a
//     JSON blob, e.g. {"LibraryPermissions":"All", "UserLevel":"Admin", ...}
//   auth_group_members(group_id, user_id) / auth_group_scopes(group_id, scope_id, permissions)
//     -- present but unused by any current row; kept as a secondary path so
//     group-based permissions work automatically once populated.
//   auth_sessions(id, user_id, scope_id, sid, expires, data)
//
// There are no named scope strings (auth_scopes.name is empty) — "scopes"
// here means the set of permission JSON blobs a user can see, merged from
// their own auth_user_scopes rows and any groups they belong to.

function getUserByUsername(username) {
  const row = db
    .prepare("SELECT id, name, pw_salt, pw_hash FROM auth_users WHERE name = ?")
    .get(username);
  if (!row) return null;
  return { id: row.id, username: row.name, pwSalt: row.pw_salt, pwHash: row.pw_hash };
}

function getUserById(id) {
  const row = db.prepare("SELECT id, name FROM auth_users WHERE id = ?").get(id);
  if (!row) return null;
  return { id: row.id, username: row.name };
}

function parsePermissions(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Direct grants: auth_user_scopes rows for this user.
function getScopesByUserId(userId) {
  const rows = db
    .prepare("SELECT permissions FROM auth_user_scopes WHERE user_id = ?")
    .all(userId);
  return rows.map((r) => parsePermissions(r.permissions)).filter(Boolean);
}

// Group grants: every group this user belongs to, via auth_group_scopes.
function getScopesByGroupId(userId) {
  const rows = db
    .prepare(
      `SELECT gs.permissions FROM auth_group_members gm
       JOIN auth_group_scopes gs ON gs.group_id = gm.group_id
       WHERE gm.user_id = ?`
    )
    .all(userId);
  return rows.map((r) => parsePermissions(r.permissions)).filter(Boolean);
}

function createSession(userId, sid, expiresAt) {
  db.prepare("INSERT INTO auth_sessions (user_id, scope_id, sid, expires) VALUES (?, 1, ?, ?)").run(
    userId,
    sid,
    expiresAt
  );
}

function getSessionBySid(sid) {
  const row = db
    .prepare("SELECT user_id, expires FROM auth_sessions WHERE sid = ?")
    .get(sid);
  if (!row) return null;
  return { userId: row.user_id, expiresAt: row.expires };
}

function deleteSession(sid) {
  db.prepare("DELETE FROM auth_sessions WHERE sid = ?").run(sid);
}

function verifyUserPassword(user, password) {
  return verifyPassword(password, user.pwSalt, user.pwHash);
}

// ---- admin: user management ----

function rowToUserSummary(row) {
  return { id: row.id, name: row.name, description: row.description || "" };
}

function getUsers() {
  return db.prepare("SELECT id, name, description FROM auth_users ORDER BY name").all().map(rowToUserSummary);
}

function getUserWithScopes(id) {
  const row = db.prepare("SELECT id, name, description FROM auth_users WHERE id = ?").get(Number(id));
  if (!row) return null;
  return { ...rowToUserSummary(row), scopes: getUserPermissions(id) };
}

function createUser(name, description, password) {
  const { pwSalt, pwHash } = hashPassword(password);
  const info = db
    .prepare("INSERT INTO auth_users (name, description, pw_salt, pw_hash) VALUES (?, ?, ?, ?)")
    .run((name || "").trim(), description || "", pwSalt, pwHash);
  return getUserWithScopes(info.lastInsertRowid);
}

function updateUser(id, name, description) {
  const row = db.prepare("SELECT id FROM auth_users WHERE id = ?").get(Number(id));
  if (!row) return null;
  db.prepare("UPDATE auth_users SET name = ?, description = ? WHERE id = ?").run(
    (name || "").trim(),
    description || "",
    Number(id)
  );
  return getUserWithScopes(id);
}

function deleteUser(id) {
  const row = db.prepare("SELECT id FROM auth_users WHERE id = ?").get(Number(id));
  if (!row) return false;
  const userId = Number(id);
  const run = db.transaction(() => {
    db.prepare("DELETE FROM auth_user_scopes WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM auth_group_members WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM auth_users WHERE id = ?").run(userId);
  });
  run();
  return true;
}

function changeUserPassword(id, password) {
  const row = db.prepare("SELECT id FROM auth_users WHERE id = ?").get(Number(id));
  if (!row) return false;
  const { pwSalt, pwHash } = hashPassword(password);
  db.prepare("UPDATE auth_users SET pw_salt = ?, pw_hash = ? WHERE id = ?").run(pwSalt, pwHash, Number(id));
  return true;
}

// auth_user_scopes rows for this user, joined with auth_scopes for its name.
function getUserPermissions(id) {
  const rows = db
    .prepare(
      `SELECT s.scope_id, sc.name AS scope_name, s.permissions
       FROM auth_user_scopes s
       JOIN auth_scopes sc ON sc.id = s.scope_id
       WHERE s.user_id = ?`
    )
    .all(Number(id));
  return rows.map((r) => ({
    scopeId: r.scope_id,
    scopeName: r.scope_name,
    permissions: parsePermissions(r.permissions),
  }));
}

// Upserts the permissions JSON blob for (userId, scopeId).
function setUserPermissions(id, scopeId, permissions) {
  const userId = Number(id);
  const existing = db
    .prepare("SELECT 1 FROM auth_user_scopes WHERE user_id = ? AND scope_id = ?")
    .get(userId, scopeId);
  const json = JSON.stringify(permissions);
  if (existing) {
    db.prepare("UPDATE auth_user_scopes SET permissions = ? WHERE user_id = ? AND scope_id = ?").run(
      json,
      userId,
      scopeId
    );
  } else {
    db.prepare("INSERT INTO auth_user_scopes (user_id, scope_id, permissions) VALUES (?, ?, ?)").run(
      userId,
      scopeId,
      json
    );
  }
  return getUserPermissions(id);
}

// ---- admin: API tokens ----
//
// auth_tokens(id, user_id, scope_id, token, refresh_token, auth_code,
// permissions, created, expires) — see PRAGMA table_info(auth_tokens).

function rowToToken(row) {
  return {
    id: row.id,
    userId: row.user_id,
    scopeId: row.scope_id,
    token: row.token,
    created: row.created,
    expires: row.expires,
  };
}

function getTokensByUserId(userId) {
  return db
    .prepare("SELECT id, user_id, scope_id, token, created, expires FROM auth_tokens WHERE user_id = ? ORDER BY created DESC")
    .all(Number(userId))
    .map(rowToToken);
}

function createToken(userId, scopeId) {
  const token = crypto.randomBytes(32).toString("hex");
  const info = db
    .prepare("INSERT INTO auth_tokens (user_id, scope_id, token) VALUES (?, ?, ?)")
    .run(Number(userId), scopeId, token);
  const row = db
    .prepare("SELECT id, user_id, scope_id, token, created, expires FROM auth_tokens WHERE id = ?")
    .get(info.lastInsertRowid);
  return rowToToken(row);
}

function deleteToken(tokenId) {
  const info = db.prepare("DELETE FROM auth_tokens WHERE id = ?").run(Number(tokenId));
  return info.changes > 0;
}

// ---- admin: group management ----

function rowToGroupSummary(row) {
  return { id: row.id, name: row.name, description: row.description || "" };
}

function getGroups() {
  return db.prepare("SELECT id, name, description FROM auth_groups ORDER BY name").all().map(rowToGroupSummary);
}

// auth_group_members rows for this group, joined with auth_users for their name.
function getGroupMembers(id) {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.description
       FROM auth_group_members gm
       JOIN auth_users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY u.name`
    )
    .all(Number(id));
  return rows.map(rowToUserSummary);
}

// auth_group_scopes rows for this group, joined with auth_scopes for its name.
function getGroupPermissions(id) {
  const rows = db
    .prepare(
      `SELECT s.scope_id, sc.name AS scope_name, s.permissions
       FROM auth_group_scopes s
       JOIN auth_scopes sc ON sc.id = s.scope_id
       WHERE s.group_id = ?`
    )
    .all(Number(id));
  return rows.map((r) => ({
    scopeId: r.scope_id,
    scopeName: r.scope_name,
    permissions: parsePermissions(r.permissions),
  }));
}

function getGroupById(id) {
  const row = db.prepare("SELECT id, name, description FROM auth_groups WHERE id = ?").get(Number(id));
  if (!row) return null;
  return { ...rowToGroupSummary(row), members: getGroupMembers(id), scopes: getGroupPermissions(id) };
}

function createGroup(name, description) {
  const info = db
    .prepare("INSERT INTO auth_groups (name, description) VALUES (?, ?)")
    .run((name || "").trim(), description || "");
  return getGroupById(info.lastInsertRowid);
}

function updateGroup(id, name, description) {
  const row = db.prepare("SELECT id FROM auth_groups WHERE id = ?").get(Number(id));
  if (!row) return null;
  db.prepare("UPDATE auth_groups SET name = ?, description = ? WHERE id = ?").run(
    (name || "").trim(),
    description || "",
    Number(id)
  );
  return getGroupById(id);
}

function deleteGroup(id) {
  const row = db.prepare("SELECT id FROM auth_groups WHERE id = ?").get(Number(id));
  if (!row) return false;
  const groupId = Number(id);
  const run = db.transaction(() => {
    db.prepare("DELETE FROM auth_group_scopes WHERE group_id = ?").run(groupId);
    db.prepare("DELETE FROM auth_group_members WHERE group_id = ?").run(groupId);
    db.prepare("DELETE FROM auth_groups WHERE id = ?").run(groupId);
  });
  run();
  return true;
}

function addGroupMember(groupId, userId) {
  db.prepare("INSERT OR IGNORE INTO auth_group_members (group_id, user_id) VALUES (?, ?)").run(
    Number(groupId),
    Number(userId)
  );
  return getGroupById(groupId);
}

function removeGroupMember(groupId, userId) {
  db.prepare("DELETE FROM auth_group_members WHERE group_id = ? AND user_id = ?").run(
    Number(groupId),
    Number(userId)
  );
  return getGroupById(groupId);
}

// Upserts the permissions JSON blob for (groupId, scopeId).
function setGroupPermissions(groupId, scopeId, permissions) {
  const gId = Number(groupId);
  const existing = db
    .prepare("SELECT 1 FROM auth_group_scopes WHERE group_id = ? AND scope_id = ?")
    .get(gId, scopeId);
  const json = JSON.stringify(permissions);
  if (existing) {
    db.prepare("UPDATE auth_group_scopes SET permissions = ? WHERE group_id = ? AND scope_id = ?").run(
      json,
      gId,
      scopeId
    );
  } else {
    db.prepare("INSERT INTO auth_group_scopes (group_id, scope_id, permissions) VALUES (?, ?, ?)").run(
      gId,
      scopeId,
      json
    );
  }
  return getGroupPermissions(groupId);
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
  getDashboardStats,
  getRecentLogs,
  getTodayPlaylist,
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
