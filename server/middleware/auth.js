// Session auth against auth_sessions, and scope checks against the
// mAirList-style permission blobs in auth_user_scopes / auth_group_scopes
// (see data/sqlRepository.js's "auth" section for the schema notes).
//
// Session token travels only as the httpOnly "session" cookie — never a
// header, never localStorage.

const repo = process.env.DATA_SOURCE === "sqlite"
  ? require("../data/sqlRepository")
  : require("../data/repository");

// Named scopes the app checks for (requireScope("library.read"/"library.write")),
// mapped onto the permission blob's fields. UserLevel "Admin" or
// GeneralPermissions "All" grants everything, regardless of LibraryPermissions.
function permissionGrantsScope(permission, scopeName) {
  if (!permission) return false;
  if (permission.UserLevel === "Admin" || permission.GeneralPermissions === "All") return true;

  if (scopeName === "admin") return permission.LibraryPermissions === "All";

  const lib = permission.LibraryPermissions;
  if (lib === "All") return true;
  if (scopeName === "library.read" && (lib === "Read" || lib === "ReadWrite")) return true;
  if (scopeName === "library.write" && lib === "ReadWrite") return true;
  return false;
}

function loadScopesForUser(userId) {
  const direct = repo.getScopesByUserId(userId);
  const viaGroup = repo.getScopesByGroupId(userId);
  return [...direct, ...viaGroup];
}

function requireAuth(req, res, next) {
  const sid = req.cookies?.session;
  if (!sid) return res.status(401).json({ error: "Nicht angemeldet" });

  const session = repo.getSessionBySid(sid);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    return res.status(401).json({ error: "Sitzung abgelaufen" });
  }

  const user = repo.getUserById(session.userId);
  if (!user) return res.status(401).json({ error: "Nicht angemeldet" });

  const scopes = loadScopesForUser(session.userId);
  req.user = { id: user.id, username: user.username, scopes };
  next();
}

function requireScope(scopeName) {
  return (req, res, next) => {
    const scopes = req.user?.scopes || [];
    const granted = scopes.some((p) => permissionGrantsScope(p, scopeName));
    if (!granted) return res.status(403).json({ error: "Keine Berechtigung" });
    next();
  };
}

module.exports = { requireAuth, requireScope };
