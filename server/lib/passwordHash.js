// Verifies passwords against mAirList's own auth_users.pw_hash / pw_salt
// scheme (NOT bcrypt — bcrypt is used only by the mock repository, see
// data/repository.js).
//
// Verified: MD5(pw_salt + password), hex lowercase
// Confirmed against real mAirListDB test user (2026-08-16)

const crypto = require("crypto");

function verifyPassword(password, pwSalt, pwHash) {
  if (!password || !pwHash) return false;
  const computed = crypto
    .createHash("md5")
    .update((pwSalt || "") + password, "utf8")
    .digest("hex");
  return computed === pwHash;
}

// Same MD5(salt+password) scheme as verifyPassword, used when creating a
// user or changing a password. Salt is random hex, matching real auth_users rows.
function hashPassword(password) {
  const pwSalt = crypto.randomBytes(16).toString("hex");
  const pwHash = crypto
    .createHash("md5")
    .update(pwSalt + password, "utf8")
    .digest("hex");
  return { pwSalt, pwHash };
}

module.exports = { verifyPassword, hashPassword };
