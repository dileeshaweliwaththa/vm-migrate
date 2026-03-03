const express = require("express");
const fs      = require("fs");
const path    = require("path");

const app      = express();
const PORT     = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE  = path.join(DATA_DIR, "db.json");

// Ensure data directory exists
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "dist")));

// GET /api/data  — return stored VM data
app.get("/api/data", (req, res) => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      return res.json(data);
    }
    res.json(null); // first run — no data yet
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/data  — save VM data
app.post("/api/data", (req, res) => {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(req.body, null, 2), "utf8");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback — serve index.html for any unknown route
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log(`VM Tracker running on port ${PORT}`));
