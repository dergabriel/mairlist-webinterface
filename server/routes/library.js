// Library API routes. These map HTTP endpoints onto the repository.
// The routes stay identical whether the repository serves mock or real data.

const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const router = express.Router();
const repo = process.env.DATA_SOURCE === "sqlite"
  ? require("../data/sqlRepository")
  : process.env.DATA_SOURCE === "api"
  ? require("../data/apiRepository")
  : require("../data/repository");
const apiRepo = process.env.DATA_SOURCE === "api" ? require("../data/apiRepository") : null;
const { requireAuth, requireScope } = require("../middleware/auth");
const { getSettings, saveSettings } = require("../lib/settings");
const { getListenerCount } = require("../lib/listenerSource");
const {
  requireId, optionalId, requireDate, optionalDate, requirePlaylistId,
  optionalCount, requirePosition, requireText, optionalText,
  requireObject, optionalObject, wrapValidation,
} = require("../lib/validate");

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
  "type", "containerType", "title", "artist", "duration", "endTime",
  "storageId", "relativePath", "folderId", "comment", "color", "cover",
  "cue", "playback", "attributes",
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
router.get("/tree", requireScope("library.read"), async (req, res, next) => {
  try { res.json(await repo.getFolderTree()); } catch (e) { next(e); }
});

// POST /api/folders -> create a new folder. Body: { name, parentId? }
router.post("/folders", requireScope("library.write"), wrapValidation(async (req, res) => {
  const body = requireObject(req.body);
  const name = requireText(body.name, "name");
  const parentId = optionalId(body.parentId, "parentId");
  const folder = await repo.createFolder(name, parentId);
  res.status(201).json(folder);
}));

// PUT /api/folders/:id -> rename a folder. Body: { name }
router.put("/folders/:id", requireScope("library.write"), wrapValidation(async (req, res) => {
  const body = requireObject(req.body);
  const name = requireText(body.name, "name");
  const folder = await repo.renameFolder(requireId(req.params.id, "folderId"), name);
  if (!folder) return res.status(404).json({ error: "Folder not found" });
  res.json(folder);
}));

// PUT /api/folders/:id/move -> move a folder under a new parent. Body: { newParentId }
router.put("/folders/:id/move", requireScope("library.write"), wrapValidation(async (req, res) => {
  const body = requireObject(req.body);
  // newParentId darf null sein: das verschiebt den Ordner auf die oberste Ebene.
  const newParentId = body.newParentId === null ? null : optionalId(body.newParentId, "newParentId");
  const folder = await repo.moveFolder(requireId(req.params.id, "folderId"), newParentId);
  if (folder === null) return res.status(404).json({ error: "Folder not found" });
  if (folder === false) return res.status(400).json({ error: "Ordner kann nicht in sich selbst oder einen Unterordner verschoben werden" });
  res.json(folder);
}));

// DELETE /api/folders/:id -> delete an empty folder
router.delete("/folders/:id", requireScope("library.write"), wrapValidation(async (req, res) => {
  const result = await repo.deleteFolder(requireId(req.params.id, "folderId"));
  if (result === "not_found") return res.status(404).json({ error: "Folder not found" });
  if (result === "not_empty") return res.status(400).json({ error: "Ordner enthält noch Elemente oder Unterordner" });
  res.status(204).end();
}));

// GET /api/folders/:id/children -> direct items and subfolders of a folder (not recursive)
router.get("/folders/:id/children", requireScope("library.read"), wrapValidation(async (req, res) => {
  const folderId = requireId(req.params.id, "folderId");
  const folder = await repo.getFolderById(folderId);
  if (!folder) return res.status(404).json({ error: "Folder not found" });
  res.json(await repo.getFolderChildren(folderId));
}));

// GET /api/storages
router.get("/storages", requireScope("library.read"), async (req, res, next) => {
  try { res.json(await repo.getStorages()); } catch (e) { next(e); }
});

// POST /api/storages -> create a new storage. Body: { name, path }
router.post("/storages", requireScope("admin"), wrapValidation((req, res) => {
  const body = requireObject(req.body);
  const name = requireText(body.name, "name");
  // Pfade duerfen laenger sein als ein normales Freitextfeld.
  const location = optionalText(body.path, "path", { maxLength: 4000 });
  const storage = repo.createStorage(name, location);
  res.status(201).json(storage);
}));

// PUT /api/storages/:id -> rename/relocate a storage. Body: { name, path }
router.put("/storages/:id", requireScope("admin"), wrapValidation((req, res) => {
  const body = requireObject(req.body);
  const name = requireText(body.name, "name");
  const location = optionalText(body.path, "path", { maxLength: 4000 });
  const storage = repo.updateStorage(requireId(req.params.id, "storageId"), name, location);
  if (!storage) return res.status(404).json({ error: "Storage not found" });
  res.json(storage);
}));

// DELETE /api/storages/:id -> delete a storage (409 if items still reference it)
router.delete("/storages/:id", requireScope("admin"), wrapValidation((req, res) => {
  const result = repo.deleteStorage(requireId(req.params.id, "storageId"));
  if (result.status === "not_found") return res.status(404).json({ error: "Storage not found" });
  if (result.status === "in_use") {
    return res.status(409).json({ error: `Storage hat noch ${result.count} Items` });
  }
  res.status(204).end();
}));

// GET /api/types
router.get("/types", requireScope("library.read"), (req, res, next) => {
  try { res.json(repo.getItemTypes()); } catch (e) { next(e); }
});

// GET /api/artists
router.get("/artists", requireScope("library.read"), async (req, res, next) => {
  try { res.json(await repo.getArtists()); } catch (e) { next(e); }
});

// GET /api/attributes -> attribute keys present in the library, each with its distinct values
router.get("/attributes", requireScope("library.read"), async (req, res, next) => {
  try { res.json(await repo.getAttributeKeys()); } catch (e) { next(e); }
});

// GET /api/items?type=&artist=&folderId=&storageId=&attributeKey=&attributeValue=
router.get("/items", requireScope("library.read"), wrapValidation(async (req, res) => {
  res.json(await repo.getItems({
    type: optionalText(req.query.type, "type"),
    artist: optionalText(req.query.artist, "artist"),
    folderId: optionalId(req.query.folderId, "folderId"),
    storageId: optionalId(req.query.storageId, "storageId"),
    attributeKey: optionalText(req.query.attributeKey, "attributeKey"),
    attributeValue: optionalText(req.query.attributeValue, "attributeValue"),
  }));
}));

// GET /api/items/:id
router.get("/items/:id", requireScope("library.read"), wrapValidation(async (req, res) => {
  const item = await repo.getItemById(requireId(req.params.id, "itemId"));
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
}));

// GET /api/items/:id/history -> play history, newest first
router.get("/items/:id/history", requireScope("library.read"), wrapValidation(async (req, res) => {
  const history = await repo.getItemHistory(requireId(req.params.id, "itemId"));
  if (history === null) return res.status(404).json({ error: "Item not found" });
  res.json(history);
}));

// GET /api/items/:id/audio -> streams the item's audio file from storage,
// with Range support so the browser can seek. 404 if the item, its storage,
// or the file on disk isn't found.
router.get("/items/:id/audio", requireScope("library.read"), async (req, res, next) => {
  let itemId;
  try {
    itemId = requireId(req.params.id, "itemId");
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  if (process.env.DATA_SOURCE === "api") {
    (async () => {
      const item = await apiRepo.getItemById(itemId);
      if (!item) return res.status(404).json({ error: "Item not found" });

      const quality = req.query.quality === "low" ? "low" : "default";
      const result = await apiRepo.getAudioStream(item, quality);
      if (!result) return res.status(404).json({ error: "Für dieses Element ist keine Audiodatei hinterlegt" });

      const contentType = AUDIO_CONTENT_TYPES[path.extname(item.relativePath || "").toLowerCase()] || result.contentType;
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": result.buffer.length,
      });
      res.end(result.buffer);
    })().catch(next);
    return;
  }

  try {
    const item = await repo.getItemById(itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });

    const filePath = repo.resolveAudioPath(itemId);
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
router.get("/search", requireScope("library.read"), wrapValidation(async (req, res) => {
  const q = optionalText(req.query.q, "q");
  const fields = optionalText(req.query.fields, "fields", { maxLength: 200 });
  const opts = fields ? { fields: fields.split(",") } : {};
  res.json(await repo.searchItems(q, opts));
}));

// GET /api/cuepoints -> cue point definitions for the cue editor
router.get("/cuepoints", requireScope("library.read"), (req, res, next) => {
  try { res.json(repo.getCuePoints()); } catch (e) { next(e); }
});

// GET /api/attributes/definitions -> predefined attribute schema for the item editor
router.get("/attributes/definitions", requireScope("library.read"), async (req, res, next) => {
  try { res.json(await repo.getAttributeDefinitions()); } catch (e) { next(e); }
});

// POST /api/items -> create a new item
router.post("/items", requireScope("library.write"), wrapValidation(async (req, res) => {
  const item = await repo.createItem(pickWritableFields(requireObject(req.body)));
  res.status(201).json(item);
}));

// PUT /api/items/:id -> update an existing item
router.put("/items/:id", requireScope("library.write"), wrapValidation(async (req, res) => {
  const item = await repo.updateItem(
    requireId(req.params.id, "itemId"),
    pickWritableFields(requireObject(req.body))
  );
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
}));

// PUT /api/items/:id/folder -> move an item into a (virtual) folder. Body: { folderId }
router.put("/items/:id/folder", requireScope("library.write"), wrapValidation(async (req, res) => {
  const body = requireObject(req.body);
  // folderId darf null sein: das nimmt das Item aus jedem Ordner heraus.
  const folderId = body.folderId === null ? null : optionalId(body.folderId, "folderId");
  const item = await repo.moveItemToFolder(requireId(req.params.id, "itemId"), folderId);
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
}));

// POST /api/upload -> upload an audio file (multipart/form-data), copy it into
// the chosen storage, and create a matching item. Fields: file, storageId, title?
router.post("/upload", requireScope("library.write"), (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Keine Datei übermittelt" });

    let storageId, title;
    try {
      const body = requireObject(req.body, "Formulardaten");
      storageId = requireId(body.storageId, "storageId");
      title = optionalText(body.title, "title");
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    try {
      const item = repo.uploadFile(storageId, req.file.originalname, req.file.buffer, title);
      if (!item) return res.status(400).json({ error: "Unbekannter Storage" });
      res.status(201).json(item);
    } catch (e) { next(e); }
  });
});

// GET /api/playlists?date=YYYY-MM-DD -> all 24 hours for that date, each flagged hasEntries
router.get("/playlists", requireScope("library.read"), wrapValidation(async (req, res) => {
  res.json(await repo.getPlaylistsByDate(requireDate(req.query.date)));
}));

// GET /api/playlists/:id -> one hour's playlist with resolved items
router.get("/playlists/:id", requireScope("library.read"), wrapValidation(async (req, res) => {
  const playlist = await repo.getPlaylistById(requirePlaylistId(req.params.id));
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  res.json(playlist);
}));

// PUT /api/playlists/:id/reorder -> apply a new entry order. Body: { order: [position, ...] }
// repo.reorderPlaylist is async under DATA_SOURCE=api (round-trips through
// the mAirListDB Server) and sync under sqlite/mock — awaiting either is
// safe (await on a non-Promise resolves immediately).
router.put("/playlists/:id/reorder", requireScope("library.write"), wrapValidation(async (req, res) => {
  const body = requireObject(req.body);
  if (!Array.isArray(body.order)) return res.status(400).json({ error: "order (Array) ist erforderlich" });
  const order = body.order.map((pos) => requirePosition(pos, "order"));
  const playlist = await repo.reorderPlaylist(requirePlaylistId(req.params.id), order);
  if (!playlist) return res.status(400).json({ error: "Playlist oder Reihenfolge ungültig" });
  res.json(playlist);
}));

// POST /api/playlists/:id/items -> insert an item. Body: { itemId, afterPosition? }
router.post("/playlists/:id/items", requireScope("library.write"), wrapValidation(async (req, res) => {
  const body = requireObject(req.body);
  const itemId = requireId(body.itemId, "itemId");
  // afterPosition 0 heisst "ganz an den Anfang", fehlend "ans Ende" -
  // deshalb hier optionalCount (ab 0) statt requirePosition (ab 1).
  const afterPosition = optionalCount(body.afterPosition, "afterPosition", { fallback: undefined });
  const playlist = await repo.insertPlaylistItem(requirePlaylistId(req.params.id), { itemId, afterPosition });
  if (!playlist) return res.status(400).json({ error: "Playlist oder Item ungültig" });
  res.status(201).json(playlist);
}));

// DELETE /api/playlists/:id/items/:position -> remove the entry at that position
router.delete("/playlists/:id/items/:position", requireScope("library.write"), wrapValidation(async (req, res) => {
  const playlist = await repo.removePlaylistItem(
    requirePlaylistId(req.params.id),
    requirePosition(req.params.position)
  );
  if (!playlist) return res.status(404).json({ error: "Playlist oder Eintrag nicht gefunden" });
  res.json(playlist);
}));

// PUT /api/playlists/:id/items/:position/overrides -> set (or clear, with {}) this
// entry's volatile per-instance overrides. Body: { overrides: { cue?: {...}, attributes?: {...}, ... } }
router.put("/playlists/:id/items/:position/overrides", requireScope("library.write"), wrapValidation(async (req, res) => {
  const body = requireObject(req.body);
  const overrides = optionalObject(body.overrides, "overrides");
  const playlist = await repo.savePlaylistItemOverrides(
    requirePlaylistId(req.params.id),
    requirePosition(req.params.position),
    overrides
  );
  if (!playlist) return res.status(404).json({ error: "Playlist oder Eintrag nicht gefunden" });
  res.json(playlist);
}));

// GET /api/logs?date=YYYY-MM-DD&limit=200&offset=0 -> playout log entries, newest first
router.get("/logs", requireScope("library.read"), wrapValidation(async (req, res) => {
  res.json(await repo.getLogs({
    date: optionalDate(req.query.date),
    limit: optionalCount(req.query.limit, "limit", { fallback: 200, max: 500 }),
    offset: optionalCount(req.query.offset, "offset", { fallback: 0 }),
  }));
}));

// GET /api/dashboard -> stats, recent logs, today's playlist and system info for the overview page
router.get("/dashboard", requireScope("library.read"), async (req, res, next) => {
  try {
    res.json({
      stats: await repo.getDashboardStats(),
      recentLogs: await repo.getRecentLogs(10),
      todayPlaylist: await repo.getTodayPlaylist(),
      system: {
        dataSource: process.env.DATA_SOURCE || "mock",
        dbPath: process.env.DATA_SOURCE === "sqlite" ? (process.env.DB_PATH || "server/mairlist.mldb") : null,
      },
    });
  } catch (e) { next(e); }
});

// GET /api/settings -> current panel settings
router.get("/settings", (req, res, next) => {
  try { res.json(getSettings()); } catch (e) { next(e); }
});

// PUT /api/settings -> save panel settings
router.put("/settings", requireScope("admin"), wrapValidation((req, res) => {
  res.json(saveSettings(requireObject(req.body)));
}));

// GET /api/listeners -> current listener count from the configured source
router.get("/listeners", requireScope("library.read"), async (req, res, next) => {
  try {
    res.json(await getListenerCount(getSettings()));
  } catch (e) { next(e); }
});

// DELETE /api/items/:id -> delete an item
router.delete("/items/:id", requireScope("library.write"), wrapValidation(async (req, res) => {
  const deleted = await repo.deleteItem(requireId(req.params.id, "itemId"));
  if (!deleted) return res.status(404).json({ error: "Item not found" });
  res.status(204).end();
}));

module.exports = router;