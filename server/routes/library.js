// Library API routes. These map HTTP endpoints onto the repository.
// The routes stay identical whether the repository serves mock or real data.

const express = require("express");
const multer = require("multer");
const router = express.Router();
const repo = require("../data/repository");

const ALLOWED_AUDIO_EXTENSIONS = new Set(["wav", "mp3", "aac", "flac", "ogg"]);

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
      return cb(new Error("Nicht unterstützter Dateityp"));
    }
    cb(null, true);
  },
});

// GET /api/tree -> folder tree for the sidebar
router.get("/tree", (req, res) => {
  res.json(repo.getFolderTree());
});

// GET /api/storages
router.get("/storages", (req, res) => {
  res.json(repo.getStorages());
});

// GET /api/types
router.get("/types", (req, res) => {
  res.json(repo.getItemTypes());
});

// GET /api/artists
router.get("/artists", (req, res) => {
  res.json(repo.getArtists());
});

// GET /api/items?type=&artist=&folderId=&storageId=
router.get("/items", (req, res) => {
  const { type, artist, folderId, storageId } = req.query;
  res.json(repo.getItems({ type, artist, folderId, storageId }));
});

// GET /api/items/:id
router.get("/items/:id", (req, res) => {
  const item = repo.getItemById(req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
});

// GET /api/items/:id/history -> play history, newest first
router.get("/items/:id/history", (req, res) => {
  const history = repo.getItemHistory(req.params.id);
  if (history === null) return res.status(404).json({ error: "Item not found" });
  res.json(history);
});

// GET /api/search?q=&fields=title,artist
router.get("/search", (req, res) => {
  const { q, fields } = req.query;
  const opts = fields ? { fields: fields.split(",") } : {};
  res.json(repo.searchItems(q, opts));
});

// GET /api/cuepoints -> cue point definitions for the cue editor
router.get("/cuepoints", (req, res) => {
  res.json(repo.getCuePoints());
});

// GET /api/attributes/definitions -> predefined attribute schema for the item editor
router.get("/attributes/definitions", (req, res) => {
  res.json(repo.getAttributeDefinitions());
});

// POST /api/items -> create a new item
router.post("/items", (req, res) => {
  const item = repo.createItem(req.body);
  res.status(201).json(item);
});

// PUT /api/items/:id -> update an existing item
router.put("/items/:id", (req, res) => {
  const item = repo.updateItem(req.params.id, req.body);
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
});

// POST /api/upload -> upload an audio file (multipart/form-data), copy it into
// the chosen storage, and create a matching item. Fields: file, storageId, title?
router.post("/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Keine Datei übermittelt" });

    const { storageId, title } = req.body;
    if (!storageId) return res.status(400).json({ error: "storageId ist erforderlich" });

    const item = repo.uploadFile(storageId, req.file.originalname, req.file.buffer, title);
    if (!item) return res.status(400).json({ error: "Unbekannter Storage" });

    res.status(201).json(item);
  });
});

// DELETE /api/items/:id -> delete an item
router.delete("/items/:id", (req, res) => {
  const deleted = repo.deleteItem(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Item not found" });
  res.status(204).end();
});

module.exports = router;
