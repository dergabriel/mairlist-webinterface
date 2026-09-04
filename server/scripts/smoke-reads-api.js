// Smoke-tests every read function in ../data/apiRepository.js against a
// live mAirListDB Server instance (port 8840 by default).
//
// Usage:
//   API_DB_BASE_URL=http://localhost:8840 API_DB_USER=... API_DB_PASSWORD=... \
//     node server/scripts/smoke-reads-api.js
//
// Optional: SMOKE_ITEM_ID (default 2605), SMOKE_FOLDER_ID (default omitted
// -> top-level), SMOKE_DATE (default today) to point the playlist checks at
// a specific hour.

if (!process.env.API_DB_USER || !process.env.API_DB_PASSWORD) {
  console.error("API_DB_USER / API_DB_PASSWORD not set — refusing to guess credentials.");
  process.exit(1);
}

const repo = require("../data/apiRepository");

let pass = 0;
let fail = 0;

async function run(name, fn) {
  try {
    const result = await fn();
    console.log(`✅ ok   ${name}`);
    if (result !== undefined) console.log(`        ${JSON.stringify(result).slice(0, 300)}`);
    pass++;
    return result;
  } catch (e) {
    console.log(`❌ FAIL ${name} — ${e.name || "Error"}: ${e.message}`);
    fail++;
    return null;
  }
}

async function main() {
  const itemId = process.env.SMOKE_ITEM_ID || "2605";
  const folderId = process.env.SMOKE_FOLDER_ID;
  const now = process.env.SMOKE_DATE ? new Date(process.env.SMOKE_DATE) : new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hour = now.getHours();

  console.log(`Base URL: ${process.env.API_DB_BASE_URL || "http://localhost:8840"}`);
  console.log(`Item ID: ${itemId}  Folder ID: ${folderId ?? "(top-level)"}  Playlist: ${year}-${month}-${day} ${hour}:00\n`);

  await run("getCapabilities", () => repo.getCapabilities());
  await run("getPermissions", () => repo.getPermissions());

  const folders = await run("getFolders (top-level)", () => repo.getFolders(folderId));

  if (folders && folders.length > 0) {
    await run("getFolders (child of first)", () => repo.getFolders(folders[0].id));
  }

  const items = await run("getItemsByFolder", () => repo.getItemsByFolder(folderId ?? (folders && folders[0] && folders[0].id)));

  await run("getItemById", async () => {
    const item = await repo.getItemById(itemId);
    if (!item) throw new Error(`item ${itemId} not found`);
    return item;
  });

  await run("getItemById (404 case)", async () => {
    const item = await repo.getItemById("999999999");
    if (item !== null) throw new Error("expected null for nonexistent item");
    return { ok: "returned null as expected" };
  });

  await run("getItemsByIds", () => repo.getItemsByIds([itemId]));
  await run("getItemFolders", () => repo.getItemFolders(itemId));
  await run("getItemRestrictions", () => repo.getItemRestrictions(itemId));
  await run("getItemHistory", () => repo.getItemHistory(itemId));

  await run("getPlaylistHour", () => repo.getPlaylistHour(year, month, day, hour));
  await run("getPlaylistAttributes", () => repo.getPlaylistAttributes(year, month, day, hour));

  await run("getArtists", () => repo.getArtists());
  await run("getTitles", () => repo.getTitles());

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
