const crypto = require("crypto");
const express = require("express");
const router = express.Router();
const repo = process.env.DATA_SOURCE === "sqlite"
  ? require("../data/sqlRepository")
  : require("../data/repository");
const { requireAuth, requireScope } = require("../middleware/auth");
const {
  requireId, requireText, optionalText, requireObject, wrapValidation,
} = require("../lib/validate");
// Einzige Quelle der Wahrheit fuer die fuenf festen Rollen. Bisher wurde ein
// ungueltiger Wert in setUserPermissions() stillschweigend verworfen - hier
// gibt es dafuer jetzt einen 400 mit klarer Meldung.
const { ROLES } = require("../data/webAuthDb");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h

// Bewusst eine eigene Variable statt NODE_ENV: das Webinterface laeuft
// produktiv auch ueber reines HTTP, wo ein secure-Cookie das Login
// unmoeglich machen wuerde.
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: COOKIE_SECURE,
};

// Brute-Force-Schutz. Bewusst In-Memory und ohne zusaetzliche Dependency:
// das Webinterface laeuft als Einzelinstanz fuer ein kleines Team. Die
// Zaehler gehen bei einem Serverneustart verloren - fuer diesen Einsatzzweck
// akzeptiert, bei mehreren Instanzen braeuchte es einen gemeinsamen Store.
const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 5;
const LOGIN_LOCKOUT_MS = (Number(process.env.LOGIN_LOCKOUT_MINUTES) || 15) * 60 * 1000;

// Getrennt nach Benutzername und IP, weil sonst entweder viele Namen von
// einer IP oder ein Name von vielen IPs durchprobiert werden koennten.
const loginAttempts = new Map();

function attemptKeys(username, ip) {
  return [`user:${String(username).toLowerCase()}`, `ip:${ip}`];
}

function isLockedOut(username, ip) {
  const now = Date.now();
  return attemptKeys(username, ip).some((key) => {
    const entry = loginAttempts.get(key);
    if (!entry) return false;
    if (entry.expiresAt <= now) {
      loginAttempts.delete(key);
      return false;
    }
    return entry.count >= LOGIN_MAX_ATTEMPTS;
  });
}

function registerFailedAttempt(username, ip) {
  const now = Date.now();
  for (const key of attemptKeys(username, ip)) {
    const entry = loginAttempts.get(key);
    if (!entry || entry.expiresAt <= now) {
      loginAttempts.set(key, { count: 1, expiresAt: now + LOGIN_LOCKOUT_MS });
    } else {
      entry.count += 1;
    }
  }
}

function clearAttempts(username, ip) {
  for (const key of attemptKeys(username, ip)) loginAttempts.delete(key);
}

// Abgelaufene Eintraege verfallen zwar auch beim Zugriff, aber ohne
// periodischen Cleanup wuechse die Map bei gestreuten Angriffen unbegrenzt.
const attemptCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (entry.expiresAt <= now) loginAttempts.delete(key);
  }
}, LOGIN_LOCKOUT_MS);
attemptCleanup.unref();

function loadScopesForUser(userId) {
  return [...repo.getScopesByUserId(userId), ...repo.getScopesByGroupId(userId)];
}

// POST /api/auth/login -> { username, password } -> sets httpOnly "session" cookie
router.post("/login", (req, res, next) => {
  try {
    const body = req.body;
    const isObject = body !== null && typeof body === "object" && !Array.isArray(body);
    const { username, password } = isObject ? body : {};
    // Beides muss ein nicht-leerer String sein.
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return res.status(400).json({ error: "Benutzername und Passwort sind erforderlich" });
    }
    // Laengenbegrenzung haelt sehr grosse Eingaben vom teuren bcrypt-Vergleich fern.
    if (username.length > 200 || password.length > 200) {
      return res.status(400).json({ error: "Benutzername oder Passwort ist zu lang" });
    }

    // Neutrale Meldung, damit die Sperre nicht verraet ob es den Namen gibt.
    if (isLockedOut(username, req.ip)) {
      return res.status(429).json({ error: "Zu viele Fehlversuche, bitte später erneut versuchen" });
    }

    const user = repo.getUserByUsername(username);
    if (!user || !repo.verifyUserPassword(user, password)) {
      registerFailedAttempt(username, req.ip);
      return res.status(401).json({ error: "Ungültige Zugangsdaten" });
    }

    clearAttempts(username, req.ip);

    const sid = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    repo.createSession(user.id, sid, expiresAt);

    res.cookie("session", sid, {
      ...SESSION_COOKIE_OPTIONS,
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
    res.clearCookie("session", SESSION_COOKIE_OPTIONS);
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

router.get("/admin/users/:id", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const user = repo.getUserWithScopes(requireId(req.params.id, "id"));
  if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });
  res.json(user);
}));

router.post("/admin/users", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const body = requireObject(req.body);
  if (!body.name || !body.password) {
    return res.status(400).json({ error: "Name und Passwort sind erforderlich" });
  }
  const name = requireText(body.name, "Name", { maxLength: 200 });
  const password = requireText(body.password, "Passwort", { maxLength: 200 });
  const description = optionalText(body.description, "description");
  const role = optionalText(body.role, "role", { maxLength: 50 });
  if (role !== undefined && !ROLES.includes(role)) {
    return res.status(400).json({ error: `role muss einer von ${ROLES.join(", ")} sein` });
  }
  res.status(201).json(repo.createUser(name, description, password, role));
}));

router.put("/admin/users/:id", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const body = requireObject(req.body);
  if (!body.name) return res.status(400).json({ error: "Name ist erforderlich" });
  const user = repo.updateUser(
    requireId(req.params.id, "id"),
    requireText(body.name, "Name", { maxLength: 200 }),
    optionalText(body.description, "description")
  );
  if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });
  res.json(user);
}));

router.delete("/admin/users/:id", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const id = requireId(req.params.id, "id");
  if (String(req.user.id) === id) {
    return res.status(400).json({ error: "Der eigene Account kann nicht gelöscht werden" });
  }
  const deleted = repo.deleteUser(id);
  if (!deleted) return res.status(404).json({ error: "Benutzer nicht gefunden" });
  res.status(204).end();
}));

router.put("/admin/users/:id/password", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const body = requireObject(req.body);
  if (!body.password) return res.status(400).json({ error: "Passwort ist erforderlich" });
  const ok = repo.changeUserPassword(
    requireId(req.params.id, "id"),
    requireText(body.password, "Passwort", { maxLength: 200 })
  );
  if (!ok) return res.status(404).json({ error: "Benutzer nicht gefunden" });
  res.status(204).end();
}));

router.put("/admin/users/:id/permissions", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const { scopeId, permissions, role } = requireObject(req.body);
  const nextRole = role || permissions?.role;
  if (!nextRole) {
    return res.status(400).json({ error: "role ist erforderlich" });
  }
  const id = requireId(req.params.id, "id");
  const user = repo.getUserWithScopes(id);
  if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });
  const validRole = requireText(nextRole, "role", { maxLength: 50 });
  if (!ROLES.includes(validRole)) {
    return res.status(400).json({ error: `role muss einer von ${ROLES.join(", ")} sein` });
  }
  res.json(repo.setUserPermissions(id, scopeId ?? 1, validRole));
}));

// ---- admin: API tokens ----

router.get("/admin/users/:id/tokens", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const id = requireId(req.params.id, "id");
  const user = repo.getUserWithScopes(id);
  if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });
  res.json(repo.getTokensByUserId(id));
}));

router.post("/admin/users/:id/tokens", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const id = requireId(req.params.id, "id");
  const user = repo.getUserWithScopes(id);
  if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });
  const scopeId = req.body?.scopeId ?? user.scopes?.[0]?.scopeId ?? 1;
  res.status(201).json(repo.createToken(id, scopeId));
}));

router.delete("/admin/users/:id/tokens/:tokenId", requireAuth, requireScope("admin"), wrapValidation((req, res) => {
  const deleted = repo.deleteToken(requireId(req.params.tokenId, "tokenId"));
  if (!deleted) return res.status(404).json({ error: "Token nicht gefunden" });
  res.status(204).end();
}));

// Group management is not supported — the five fixed roles
// (readonly/studio/dj/vtdj/admin) replace the group concept.

module.exports = router;
