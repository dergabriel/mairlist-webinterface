const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const repo = process.env.DATA_SOURCE === "sqlite"
  ? require("../data/sqlRepository")
  : require("../data/repository");
const { requireAuth, requireScope } = require("../middleware/auth");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

function loadScopesForUser(userId) {
  return [...repo.getScopesByUserId(userId), ...repo.getScopesByGroupId(userId)];
}

// POST /api/auth/login -> { username, password } -> sets httpOnly "session" cookie
router.post("/login", (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Benutzername und Passwort sind erforderlich" });
    }

    const user = repo.getUserByUsername(username);
    if (!user || !repo.verifyUserPassword(user, password)) {
      return res.status(401).json({ error: "Ungültige Zugangsdaten" });
    }

    const sid = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    repo.createSession(user.id, sid, expiresAt);

    res.cookie("session", sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      expires: new Date(expiresAt),
    });

    res.json({ user: { id: user.id, username: user.username, scopes: loadScopesForUser(user.id) } });
  } catch (e) { next(e); }
});

// POST /api/auth/logout -> clears the session
router.post("/logout", (req, res, next) => {
  try {
    const sid = req.cookies?.session;
    if (sid) repo.deleteSession(sid);
    res.clearCookie("session");
    res.status(204).end();
  } catch (e) { next(e); }
});

// GET /api/auth/me -> current user, or 401 if not logged in
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

// ---- admin: user management ----
// All routes below require an authenticated session with the "admin" scope
// (UserLevel "Admin" or LibraryPermissions "All" — see middleware/auth.js).

router.get("/admin/users", requireAuth, requireScope("admin"), (req, res, next) => {
  try {
    res.json(repo.getUsers());
  } catch (e) { next(e); }
});

router.get("/admin/users/:id", requireAuth, requireScope("admin"), (req, res, next) => {
  try {
    const user = repo.getUserWithScopes(req.params.id);
    if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });
    res.json(user);
  } catch (e) { next(e); }
});

router.post("/admin/users", requireAuth, requireScope("admin"), (req, res, next) => {
  try {
    const { name, description, password } = req.body || {};
    if (!name || !password) {
      return res.status(400).json({ error: "Name und Passwort sind erforderlich" });
    }
    res.status(201).json(repo.createUser(name, description, password));
  } catch (e) { next(e); }
});

router.put("/admin/users/:id", requireAuth, requireScope("admin"), (req, res, next) => {
  try {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: "Name ist erforderlich" });
    const user = repo.updateUser(req.params.id, name, description);
    if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });
    res.json(user);
  } catch (e) { next(e); }
});

router.delete("/admin/users/:id", requireAuth, requireScope("admin"), (req, res, next) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ error: "Der eigene Account kann nicht gelöscht werden" });
    }
    const deleted = repo.deleteUser(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Benutzer nicht gefunden" });
    res.status(204).end();
  } catch (e) { next(e); }
});

router.put("/admin/users/:id/password", requireAuth, requireScope("admin"), (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: "Passwort ist erforderlich" });
    const ok = repo.changeUserPassword(req.params.id, password);
    if (!ok) return res.status(404).json({ error: "Benutzer nicht gefunden" });
    res.status(204).end();
  } catch (e) { next(e); }
});

router.put("/admin/users/:id/permissions", requireAuth, requireScope("admin"), (req, res, next) => {
  try {
    const { scopeId, permissions } = req.body || {};
    if (!scopeId || !permissions) {
      return res.status(400).json({ error: "scopeId und permissions sind erforderlich" });
    }
    const user = repo.getUserWithScopes(req.params.id);
    if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });
    res.json(repo.setUserPermissions(req.params.id, scopeId, permissions));
  } catch (e) { next(e); }
});

module.exports = router;
