// Independent auth database for the webinterface — separate from mAirList's
// own auth.db (see sqlRepository.js's resolveAuthDb()). mAirList's login is
// disabled in production (ManagementLogin=off) and its MD5 hash scheme can't
// be relied on, so the webinterface manages its own users/sessions/tokens
// here, hashed with bcrypt, independent of mAirList's data and locking.

const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const DB_PATH = process.env.WEB_AUTH_DB_PATH || path.join(__dirname, "../webinterface-auth.db");
const db = new Database(DB_PATH, { readonly: false });
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
console.log(`Web Auth DB: ${DB_PATH}`);

db.exec(`
  CREATE TABLE IF NOT EXISTS web_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    pw_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'readonly',
    created TEXT NOT NULL,
    updated TEXT
  );

  CREATE TABLE IF NOT EXISTS web_sessions (
    sid TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    expires TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS web_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    created TEXT NOT NULL,
    expires TEXT
  );
`);

// The five roles this webinterface understands. "admin" maps to the
// mAirList-style UserLevel "Admin" (grants everything via
// middleware/auth.js's permissionGrantsScope); every other role maps to
// "User" there and is further distinguished only by ROLE_SCOPES below.
const ROLES = ["readonly", "studio", "dj", "vtdj", "admin"];

// Named scopes (as checked by requireScope() in routes) each role grants,
// beyond the "admin" UserLevel escape hatch. Kept here (not in
// middleware/auth.js) so the 5-role model lives entirely behind the
// permission-blob shape that middleware already understands.
const ROLE_SCOPES = {
  readonly: ["library.read"],
  studio: ["library.read"],
  dj: ["library.read", "library.write"],
  vtdj: ["library.read", "library.write"],
  admin: ["library.read", "library.write", "admin"],
};

function bootstrapAdmin() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM web_users").get();
  if (count > 0) return;

  const password = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const pwHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO web_users (username, description, pw_hash, role, created) VALUES (?, ?, ?, ?, ?)"
  ).run("admin", "Administrator", pwHash, "admin", now);

  console.log("=".repeat(60));
  console.log("Webinterface: Erster Start, Admin-Account angelegt.");
  console.log("  Benutzername: admin");
  if (process.env.INITIAL_ADMIN_PASSWORD) {
    console.log("  Passwort: (aus INITIAL_ADMIN_PASSWORD)");
  } else {
    console.log(`  Passwort: ${password}`);
    console.log("  Bitte sofort ändern!");
  }
  console.log("=".repeat(60));
}

bootstrapAdmin();

// permissions blob compatible with middleware/auth.js's permissionGrantsScope:
// UserLevel "Admin" grants everything; otherwise scope grants come from
// ROLE_SCOPES via LibraryPermissions/GeneralPermissions-style flags encoded
// as an explicit scopes array the middleware also understands through
// LibraryPermissions. We keep it simple: role "admin" -> UserLevel Admin,
// everything else -> UserLevel "User" plus explicit scope grants recognized
// by permissionGrantsScope's LibraryPermissions checks.
function roleToPermissions(role) {
  if (role === "admin") {
    return { Type: "TDBPermissions", UserLevel: "Admin", GeneralPermissions: "All", LibraryPermissions: "All", role };
  }
  const scopes = ROLE_SCOPES[role] || [];
  const libraryPermissions = scopes.includes("library.write")
    ? "ReadWrite"
    : scopes.includes("library.read")
    ? "Read"
    : "None";
  return { Type: "TDBPermissions", UserLevel: "User", GeneralPermissions: "None", LibraryPermissions: libraryPermissions, role };
}

function rowToUserSummary(row) {
  return { id: row.id, name: row.username, description: row.description || "", role: row.role };
}

function scopesForUser(row) {
  return [{ scopeId: 1, scopeName: "", permissions: roleToPermissions(row.role) }];
}

// ---- auth (login / session) ----

function getUserByUsername(username) {
  const row = db.prepare("SELECT id, username, pw_hash, role FROM web_users WHERE username = ?").get(username);
  if (!row) return null;
  return { id: row.id, username: row.username, pwHash: row.pw_hash, role: row.role };
}

function getUserById(id) {
  const row = db.prepare("SELECT id, username, role FROM web_users WHERE id = ?").get(Number(id));
  if (!row) return null;
  return { id: row.id, username: row.username, role: row.role };
}

function verifyUserPassword(user, password) {
  if (!password || !user?.pwHash) return false;
  return bcrypt.compareSync(password, user.pwHash);
}

function getScopesByUserId(userId) {
  const row = db.prepare("SELECT id, username, role FROM web_users WHERE id = ?").get(Number(userId));
  if (!row) return [];
  return scopesForUser(row).map((s) => s.permissions);
}

// Group-based permissions are not supported by this auth model (roles
// replace groups) — always empty, kept only so callers (routes/auth.js,
// middleware/auth.js) that merge direct + group scopes keep working.
function getScopesByGroupId() {
  return [];
}

function createSession(userId, sid, expiresAt) {
  db.prepare("INSERT INTO web_sessions (sid, user_id, expires) VALUES (?, ?, ?)").run(sid, Number(userId), expiresAt);
}

function getSessionBySid(sid) {
  const row = db.prepare("SELECT user_id, expires FROM web_sessions WHERE sid = ?").get(sid);
  if (!row) return null;
  return { userId: row.user_id, expiresAt: row.expires };
}

function deleteSession(sid) {
  db.prepare("DELETE FROM web_sessions WHERE sid = ?").run(sid);
}

// ---- admin: user management ----

function getUsers() {
  return db.prepare("SELECT id, username, description, role FROM web_users ORDER BY username").all().map(rowToUserSummary);
}

function getUserWithScopes(id) {
  const row = db.prepare("SELECT id, username, description, role FROM web_users WHERE id = ?").get(Number(id));
  if (!row) return null;
  return { ...rowToUserSummary(row), scopes: scopesForUser(row) };
}

function createUser(name, description, password, role) {
  const pwHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const info = db
    .prepare("INSERT INTO web_users (username, description, pw_hash, role, created) VALUES (?, ?, ?, ?, ?)")
    .run((name || "").trim(), description || "", pwHash, ROLES.includes(role) ? role : "readonly", now);
  return getUserWithScopes(info.lastInsertRowid);
}

function updateUser(id, name, description) {
  const row = db.prepare("SELECT id FROM web_users WHERE id = ?").get(Number(id));
  if (!row) return null;
  db.prepare("UPDATE web_users SET username = ?, description = ?, updated = ? WHERE id = ?").run(
    (name || "").trim(),
    description || "",
    new Date().toISOString(),
    Number(id)
  );
  return getUserWithScopes(id);
}

function deleteUser(id) {
  const row = db.prepare("SELECT id FROM web_users WHERE id = ?").get(Number(id));
  if (!row) return false;
  db.prepare("DELETE FROM web_users WHERE id = ?").run(Number(id));
  return true;
}

function changeUserPassword(id, password) {
  const row = db.prepare("SELECT id FROM web_users WHERE id = ?").get(Number(id));
  if (!row) return false;
  const pwHash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE web_users SET pw_hash = ?, updated = ? WHERE id = ?").run(pwHash, new Date().toISOString(), Number(id));
  return true;
}

function getUserPermissions(id) {
  const row = db.prepare("SELECT id, username, role FROM web_users WHERE id = ?").get(Number(id));
  if (!row) return [];
  return scopesForUser(row);
}

// Sets the user's role. `permissions` may be either a role string ("dj") or
// a permissions-shaped object carrying { role }, to stay call-compatible
// with the old (scopeId, permissions) signature used by routes/auth.js.
function setUserPermissions(id, scopeId, permissions) {
  const userId = Number(id);
  const role = typeof permissions === "string" ? permissions : permissions?.role;
  if (ROLES.includes(role)) {
    db.prepare("UPDATE web_users SET role = ?, updated = ? WHERE id = ?").run(role, new Date().toISOString(), userId);
  }
  return getUserPermissions(id);
}

// ---- admin: API tokens ----

function rowToToken(row) {
  return { id: row.id, userId: row.user_id, token: row.token, description: row.description || "", created: row.created, expires: row.expires };
}

function getTokensByUserId(userId) {
  return db
    .prepare("SELECT id, user_id, token, description, created, expires FROM web_tokens WHERE user_id = ? ORDER BY created DESC")
    .all(Number(userId))
    .map(rowToToken);
}

function createToken(userId, scopeId, description) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const info = db
    .prepare("INSERT INTO web_tokens (user_id, token, description, created) VALUES (?, ?, ?, ?)")
    .run(Number(userId), token, description || "", now);
  const row = db
    .prepare("SELECT id, user_id, token, description, created, expires FROM web_tokens WHERE id = ?")
    .get(info.lastInsertRowid);
  return rowToToken(row);
}

function deleteToken(tokenId) {
  const info = db.prepare("DELETE FROM web_tokens WHERE id = ?").run(Number(tokenId));
  return info.changes > 0;
}

module.exports = {
  ROLES,
  getUserByUsername,
  getUserById,
  verifyUserPassword,
  getScopesByUserId,
  getScopesByGroupId,
  createSession,
  getSessionBySid,
  deleteSession,
  getUsers,
  getUserWithScopes,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword,
  getUserPermissions,
  setUserPermissions,
  getTokensByUserId,
  createToken,
  deleteToken,
};
