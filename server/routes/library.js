// Library API routes. These map HTTP endpoints onto the repository.
// The routes stay identical whether the repository serves mock or real data.

const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const router = express.Router();
const repo = process.env.DATA_SOURCE === "sqlite"
  ? require("../data/sqlRepository")
  : require("../data/repository");
const { requireAuth, requireScope } = require("../middleware/auth");

router.use(requireAuth);

const ALLOWED_AUDIO_EXTENSIONS = new Set(["wav", "mp3", "aac", "flac", "ogg"]);

const AUDIO_CONTENT_TYPES = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
};

// Felder die ein Client bei createItem/updateItem setzen darf.
// Schützt vor versehentlichem Überschreiben von id, createdAt etc.
const ITEM_WRITABLE_FIELDS = new Set([
  "title", "artist", "type", "comment", "color", "cover",
  "gain", "normalization", "segueMode",
  "folderId", "storageId", "filename",
  "attributes", "cueMarkers",
  "scheduledStart", "scheduledEnd", "scheduledDays",
]);

// Multer: max. 500 MB pro Datei, nur erlaubte Erweiterungen
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
      return cb(new Error("Nicht unterstützter Dateityp"));
    }
    cb(null, true);
  },
});

// Hilfsfunktion: filtert req.body auf ITEM_WRITABLE_FIELDS
function pickWritableFields(body) {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => ITEM_WRITABLE_FIELDS.has(key))
  );
}

// GET /api/tree -> folder tree for the sidebar
router.get("/tree", requireScope("library.read"), (req, res, next) => {
  try { res.json(repo.getFolderTree()); } catch (e) { next(e); }
});

// POST /api/folders -> create a new folder. Body: { name, parentId? }
router.post("/folders", requireScope("library.write"), (req, res, next) => {
  try {
    const { name, parentId } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "name ist erforderlich" });
    const folder = repo.createFolder(name.trim(), parentId);
    res.status(201).json(folder);
  } catch (e) { next(e); }
});

// PUT /api/folders/:id -> rename a folder. Body: { name }
router.put("/folders/:id", requireScope("library.write"), (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "name ist erforderlich" });
    const folder = repo.renameFolder(req.params.id, name.trim());
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(folder);
  } catch (e) { next(e); }
});

// PUT /api/folders/:id/move -> move a folder under a new parent. Body: { newParentId }
router.put("/folders/:id/move", requireScope("library.write"), (req, res, next) => {
  try {
    const { newParentId } = req.body;
    const folder = repo.moveFolder(req.params.id, newParentId);
    if (folder === null) return res.status(404).json({ error: "Folder not found" });
    if (folder === false) return res.status(400).json({ error: "Ordner kann nicht in sich selbst oder einen Unterordner verschoben werden" });
    res.json(folder);
  } catch (e) { next(e); }
});

// DELETE /api/folders/:id -> delete an empty folder
router.delete("/folders/:id", requireScope("library.write"), (req, res, next) => {
  try {
    const result = repo.deleteFolder(req.params.id);
    if (result === "not_found") return res.status(404).json({ error: "Folder not found" });
    if (result === "not_empty") return res.status(400).json({ error: "Ordner enthält noch Elemente oder Unterordner" });
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /api/folders/:id/children -> direct items and subfolders of a folder (not recursive)
router.get("/folders/:id/children", requireScope("library.read"), (req, res, next) => {
  try {
    const folder = repo.getFolderById(req.params.id);
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(repo.getFolderChildren(req.params.id));
  } catch (e) { next(e); }
});

// GET /api/storages
router.get("/storages", requireScope("library.read"), (req, res, next) => {
  try { res.json(repo.getStorages()); } catch (e) { next(e); }
});

// POST /api/storages -> create a new storage. Body: { name, path }
router.post("/storages", requireScope("admin"), (req, res, next) => {
  try {
    const { name, path: location } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "name ist erforderlich" });
    const storage = repo.createStorage(name.trim(), location);
    res.status(201).json(storage);
  } catch (e) { next(e); }
});

// PUT /api/storages/:id -> rename/relocate a storage. Body: { name, path }
router.put("/storages/:id", requireScope("admin"), (req, res, next) => {
  try {
    const { name, path: location } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "name ist erforderlich" });
    const storage = repo.updateStorage(req.params.id, name.trim(), location);
    if (!storage) return res.status(404).json({ error: "Storage not found" });
    res.json(storage);
  } catch (e) { next(e); }
});

// DELETE /api/storages/:id -> delete a storage (409 if items still reference it)
router.delete("/storages/:id", requireScope("admin"), (req, res, next) => {
  try {
    const result = repo.deleteStorage(req.params.id);
    if (result.status === "not_found") return res.status(404).json({ error: "Storage not found" });
    if (result.status === "in_use") {
      return res.status(409).json({ error: `Storage hat noch ${result.count} Items` });
    }
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /api/types
router.get("/types", requireScope("library.read"), (req, res, next) => {
  try { res.json(repo.getItemTypes()); } catch (e) { next(e); }
});

// GET /api/artists
router.get("/artists", requireScope("library.read"), (req, res, next) => {
  try { res.json(repo.getArtists()); } catch (e) { next(e); }
});

// GET /api/attributes -> attribute keys present in the library, each with its distinct values
router.get("/attributes", requireScope("library.read"), (req, res, next) => {
  try { res.json(repo.getAttributeKeys()); } catch (e) { next(e); }
});

// GET /api/items?type=&artist=&folderId=&storageId=&attributeKey=&attributeValue=
router.get("/items", requireScope("library.read"), (req, res, next) => {
  try {
    const { type, artist, folderId, storageId, attributeKey, attributeValue } = req.query;
    res.json(repo.getItems({ type, artist, folderId, storageId, attributeKey, attributeValue }));
  } catch (e) { next(e); }
});

// GET /api/items/:id
router.get("/items/:id", requireScope("library.read"), (req, res, next) => {
  try {
    const item = repo.getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (e) { next(e); }
});

// GET /api/items/:id/history -> play history, newest first
router.get("/items/:id/history", requireScope("library.read"), (req, res, next) => {
  try {
    const history = repo.getItemHistory(req.params.id);
    if (history === null) return res.status(404).json({ error: "Item not found" });
    res.json(history);
  } catch (e) { next(e); }
});

// GET /api/items/:id/audio -> streams the item's audio file from storage,
// with Range support so the browser can seek. 404 if the item, its storage,
// or the file on disk isn't found.
router.get("/items/:id/audio", requireScope("library.read"), (req, res, next) => {
  try {
    const item = repo.getItemById(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const filePath = repo.resolveAudioPath(req.params.id);
    if (!filePath) return res.status(404).json({ error: "Für dieses Element ist keine Audiodatei hinterlegt" });

    // Path-Traversal-Schutz: aufgelöster Pfad muss innerhalb von AUDIO_BASE_DIR liegen
    const baseDir = process.env.AUDIO_BASE_DIR;
    if (baseDir) {
      const resolvedBase = path.resolve(baseDir);
      const resolvedFile = path.resolve(filePath);
      if (!resolvedFile.startsWith(resolvedBase + path.sep)) {
        return res.status(403).json({ error: "Zugriff verweigert" });
      }
    }

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return res.status(404).json({ error: "Audiodatei nicht gefunden" });
    }

    const contentType = AUDIO_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Accept-Ranges": "bytes",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (match[1] === "" && match[2] === "")) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }

    const start = match[1] === "" ? stat.size - Number(match[2]) : Number(match[1]);
    const end = match[2] === "" ? stat.size - 1 : Math.min(Number(match[2]), stat.size - 1);

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }

    res.writeHead(206, {
      "Content-Type": contentType,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } catch (e) { next(e); }
});

// GET /api/search?q=&fields=title,artist
router.get("/search", requireScope("library.read"), (req, res, next) => {
  try {
    const { q, fields } = req.query;
    const opts = fields ? { fields: fields.split(",") } : {};
    res.json(repo.searchItems(q, opts));
  } catch (e) { next(e); }
});

// GET /api/cuepoints -> cue point definitions for the cue editor
router.get("/cuepoints", requireScope("library.read"), (req, res, next) => {
  try { res.json(repo.getCuePoints()); } catch (e) { next(e); }
});

// GET /api/attributes/definitions -> predefined attribute schema for the item editor
router.get("/attributes/definitions", requireScope("library.read"), (req, res, next) => {
  try { res.json(repo.getAttributeDefinitions()); } catch (e) { next(e); }
});

// POST /api/items -> create a new item
router.post("/items", requireScope("library.write"), (req, res, next) => {
  try {
    const item = repo.createItem(pickWritableFields(req.body));
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/items/:id -> update an existing item
router.put("/items/:id", requireScope("library.write"), (req, res, next) => {
  try {
    const item = repo.updateItem(req.params.id, pickWritableFields(req.body));
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (e) { next(e); }
});

// PUT /api/items/:id/folder -> move an item into a (virtual) folder. Body: { folderId }
router.put("/items/:id/folder", requireScope("library.write"), (req, res, next) => {
  try {
    const { folderId } = req.body;
    const item = repo.moveItemToFolder(req.params.id, folderId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/upload -> upload an audio file (multipart/form-data), copy it into
// the chosen storage, and create a matching item. Fields: file, storageId, title?
router.post("/upload", requireScope("library.write"), (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Keine Datei übermittelt" });

    const { storageId, title } = req.body;
    if (!storageId) return res.status(400).json({ error: "storageId ist erforderlich" });

    try {
      const item = repo.uploadFile(storageId, req.file.originalname, req.file.buffer, title);
      if (!item) return res.status(400).json({ error: "Unbekannter Storage" });
      res.status(201).json(item);
    } catch (e) { next(e); }
  });
});

// GET /api/playlists?date=YYYY-MM-DD -> all 24 hours for that date, each flagged hasEntries
router.get("/playlists", requireScope("library.read"), (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: "date ist erforderlich" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date muss im Format YYYY-MM-DD sein" });
    res.json(repo.getPlaylistsByDate(date));
  } catch (e) { next(e); }
});

// GET /api/playlists/:id -> one hour's playlist with resolved items
router.get("/playlists/:id", requireScope("library.read"), (req, res, next) => {
  try {
    const playlist = repo.getPlaylistById(req.params.id);
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });
    res.json(playlist);
  } catch (e) { next(e); }
});

// PUT /api/playlists/:id/reorder -> apply a new entry order. Body: { order: [position, ...] }
router.put("/playlists/:id/reorder", requireScope("library.write"), (req, res, next) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: "order (Array) ist erforderlich" });
    const playlist = repo.reorderPlaylist(req.params.id, order);
    if (!playlist) return res.status(400).json({ error: "Playlist oder Reihenfolge ungültig" });
    res.json(playlist);
  } catch (e) { next(e); }
});

// POST /api/playlists/:id/items -> insert an item. Body: { itemId, afterPosition? }
router.post("/playlists/:id/items", requireScope("library.write"), (req, res, next) => {
  try {
    const { itemId, afterPosition } = req.body;
    if (!itemId) return res.status(400).json({ error: "itemId ist erforderlich" });
    const playlist = repo.insertPlaylistItem(req.params.id, { itemId, afterPosition });
    if (!playlist) return res.status(400).json({ error: "Playlist oder Item ungültig" });
    res.status(201).json(playlist);
  } catch (e) { next(e); }
});

// DELETE /api/playlists/:id/items/:position -> remove the entry at that position
router.delete("/playlists/:id/items/:position", requireScope("library.write"), (req, res, next) => {
  try {
    const playlist = repo.removePlaylistItem(req.params.id, req.params.position);
    if (!playlist) return res.status(404).json({ error: "Playlist oder Eintrag nicht gefunden" });
    res.json(playlist);
  } catch (e) { next(e); }
});

// PUT /api/playlists/:id/items/:position/overrides -> set (or clear, with {}) this
// entry's volatile per-instance overrides. Body: { overrides: { cue?: {...}, attributes?: {...}, ... } }
router.put("/playlists/:id/items/:position/overrides", requireScope("library.write"), (req, res, next) => {
  try {
    const { overrides } = req.body;
    const playlist = repo.savePlaylistItemOverrides(req.params.id, req.params.position, overrides);
    if (!playlist) return res.status(404).json({ error: "Playlist oder Eintrag nicht gefunden" });
    res.json(playlist);
  } catch (e) { next(e); }
});

// GET /api/logs?date=YYYY-MM-DD&limit=200&offset=0 -> playout log entries, newest first
router.get("/logs", requireScope("library.read"), (req, res, next) => {
  try {
    const { date, limit, offset } = req.query;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date muss im Format YYYY-MM-DD sein" });
    }
    res.json(repo.getLogs({
      date,
      limit: limit ? Number(limit) : 200,
      offset: offset ? Number(offset) : 0,
    }));
  } catch (e) { next(e); }
});

// DELETE /api/items/:id -> delete an item
router.delete("/items/:id", requireScope("library.write"), (req, res, next) => {
  try {
    const deleted = repo.deleteItem(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Item not found" });
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;