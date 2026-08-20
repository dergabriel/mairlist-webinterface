require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const libraryRoutes = require("./routes/library");
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: nur vom lokalen Vite-Dev-Server und dem eigenen Host erlauben.
// Für Produktion ALLOWED_ORIGINS per Env setzen, z.B. "https://radio.example.com"
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:4173').split(',');

app.use(
  cors({
    origin: (origin, callback) => {
      // Kein Origin = same-origin oder curl/Postman im Dev-Betrieb: erlauben
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: Origin nicht erlaubt: ${origin}`));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  })
);

// JSON-Body auf 1 MB begrenzen, verhindert Memory-DoS
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", dataSource: process.env.DATA_SOURCE || "mock" });
});

app.use("/api/auth", authRoutes);
app.use("/api", libraryRoutes);

// Frontend statisch ausliefern (production build unter frontend/dist)
const FRONTEND_DIST = path.join(__dirname, "../frontend/dist");
app.use(express.static(FRONTEND_DIST));

// SPA-Fallback: alle nicht-API-Routen an index.html weiterreichen
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

// Globaler Error Handler — fängt alle unbehandelten Fehler aus Routen.
// Besonders wichtig sobald repository.js auf async DB-Calls umgestellt wird.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || "Interner Serverfehler" });
});

app.listen(PORT, () => {
  console.log(`mAirList webinterface API running on http://localhost:${PORT}`);
  console.log(`Data source: ${process.env.DATA_SOURCE || "mock"}`);
  console.log(`CORS allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
});