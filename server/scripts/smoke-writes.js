// Smoke-tests every write path in ../data/sqlRepository.js against a copy of
// the real .mldb (never run this against server/mairlist.mldb directly).
//
// Usage:
//   cp server/mairlist.mldb server/mairlist.test.mldb
//   DB_PATH=./server/mairlist.test.mldb node server/scripts/smoke-writes.js

const path = require("path");

if (!process.env.DB_PATH) {
  console.error("DB_PATH not set — refusing to guess. Point it at a throwaway copy of the .mldb.");
  process.exit(1);
}
if (path.basename(process.env.DB_PATH) === "mairlist.mldb") {
  console.error("DB_PATH points at mairlist.mldb — refusing to run writes against the real database.");
  process.exit(1);
}

const repo = require("../data/sqlRepository");

let pass = 0;
let fail = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`✅ ok   ${name}`);
    pass++;
  } else {
    console.log(`❌ FAIL ${name}${detail ? " — " + detail : ""}`);
    fail++;
  }
}

function run(name, fn) {
  try {
    fn();
  } catch (e) {
    console.log(`❌ FAIL ${name} — threw: ${e.message}`);
    fail++;
  }
}

console.log(`Using DB: ${process.env.DB_PATH}\n`);

// ---- folders ----

let folderA, folderB;
run("createFolder", () => {
  folderA = repo.createFolder("SmokeTest A", null);
  check("createFolder", folderA && folderA.name === "SmokeTest A" && folderA.parentId === null, JSON.stringify(folderA));
});

run("createFolder (nested)", () => {
  folderB = repo.createFolder("SmokeTest B", folderA.id);
  check("createFolder (nested)", folderB && folderB.parentId === folderA.id, JSON.stringify(folderB));
});

run("renameFolder", () => {
  const renamed = repo.renameFolder(folderB.id, "SmokeTest B renamed");
  check("renameFolder", renamed && renamed.name === "SmokeTest B renamed", JSON.stringify(renamed));
});

run("moveFolder", () => {
  const moved = repo.moveFolder(folderB.id, null);
  check("moveFolder", moved && moved.parentId === null, JSON.stringify(moved));
});

// ---- items ----

let itemId;
run("createItem", () => {
  const created = repo.createItem({
    title: "Smoke Test Item",
    artist: "Smoke Tester",
    type: "music",
    duration: 12.5,
    comment: "created by smoke-writes.js",
  });
  itemId = created && created.id;
  const fetched = itemId != null ? repo.getItemById(itemId) : null;
  check(
    "createItem",
    fetched && fetched.title === "Smoke Test Item" && fetched.artist === "Smoke Tester",
    JSON.stringify(fetched)
  );
});

run("updateItem", () => {
  repo.updateItem(itemId, { title: "Smoke Test Item (updated)" });
  const fetched = repo.getItemById(itemId);
  check("updateItem", fetched && fetched.title === "Smoke Test Item (updated)", JSON.stringify(fetched));
});

run("moveItemToFolder", () => {
  const moved = repo.moveItemToFolder(itemId, folderA.id);
  check("moveItemToFolder", moved && moved.folderId === folderA.id, JSON.stringify(moved));
});

// ---- playlist ----
// Use a date far in the future so we don't collide with real seeded data.
const testDate = "2099-01-01";
const testHour = 3;
const playlistId = `${testDate}-${String(testHour).padStart(2, "0")}`;

run("insertPlaylistItem", () => {
  const result = repo.insertPlaylistItem(playlistId, { itemId });
  const entry = result && result.entries.find((e) => String(e.itemId) === String(itemId));
  check("insertPlaylistItem", !!entry, JSON.stringify(result));
});

run("reorderPlaylist", () => {
  const before = repo.getPlaylistById(playlistId);
  const positions = before.entries.map((e) => e.position);
  const reversed = [...positions].reverse();
  const after = repo.reorderPlaylist(playlistId, reversed);
  check(
    "reorderPlaylist",
    after && after.entries.length === before.entries.length,
    `before=${JSON.stringify(positions)} after=${JSON.stringify(after && after.entries.map((e) => e.position))}`
  );
});

run("removePlaylistItem", () => {
  const before = repo.getPlaylistById(playlistId);
  const targetPos = before.entries.find((e) => String(e.itemId) === String(itemId)).position;
  const after = repo.removePlaylistItem(playlistId, targetPos);
  const stillThere = after && after.entries.some((e) => String(e.itemId) === String(itemId));
  check("removePlaylistItem", !stillThere, JSON.stringify(after));
});

// ---- cleanup ----

run("deleteItem (cleanup)", () => {
  const ok = repo.deleteItem(itemId);
  check("deleteItem (cleanup)", ok === true);
});

run("deleteFolder (cleanup, nested first)", () => {
  const okB = repo.deleteFolder(folderB.id);
  const okA = repo.deleteFolder(folderA.id);
  check("deleteFolder (cleanup)", okB === "ok" && okA === "ok", `B=${okB} A=${okA}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
