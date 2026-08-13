// Library API routes. These map HTTP endpoints onto the repository.
// The routes stay identical whether the repository serves mock or real data.

const express = require("express");
const router = express.Router();
const repo = require("../data/repository");

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

module.exports = router;
