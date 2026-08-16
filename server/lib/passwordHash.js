// Verifies passwords against mAirList's own auth_users.pw_hash / pw_salt
// scheme (NOT bcrypt — bcrypt is used only by the mock repository, see
// data/repository.js).
//
// UNVERIFIED: no official mAirList documentation for the exact hash formula
// was found, and no known plaintext/hash pair was available to confirm it
// empirically. This implements the most common Delphi/Indy-style convention
// (MD5 of salt+password, lowercase hex, matching pw_hash's 32-char length).
// Verify against a real known password before relying on this in production;
// if it's wrong, real-DB logins will always fail and the formula below needs
// to be corrected (try MD5(password+salt), repeated/keyed hashing, etc.).

const crypto = require("crypto");

function verifyPassword(password, pwSalt, pwHash) {
  if (!password || !pwHash) return false;
  const computed = crypto
    .createHash("md5")
    .update((pwSalt || "") + password, "utf8")
    .digest("hex");
  return computed === pwHash;
}

module.exports = { verifyPassword };
