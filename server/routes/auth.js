const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const repo = process.env.DATA_SOURCE === "sqlite"
  ? require("../data/sqlRepository")
  : require("../data/repository");
const { requireAuth } = require("../middleware/auth");

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

module.exports = router;
