const express = require("express");
const cors = require("cors");
const libraryRoutes = require("./routes/library");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", dataSource: process.env.DATA_SOURCE || "mock" });
});

app.use("/api", libraryRoutes);

app.listen(PORT, () => {
  console.log(`mAirList webinterface API running on http://localhost:${PORT}`);
  console.log(`Data source: ${process.env.DATA_SOURCE || "mock"}`);
});
