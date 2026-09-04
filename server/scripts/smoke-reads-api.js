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

  const allFolders = await run("getFolders (all, flat)", () => repo.getFolders());

  await run("getFolderTree", async () => {
    const tree = await repo.getFolderTree();
    if (!Array.isArray(tree) || tree.length === 0) {
      throw new Error("expected a non-empty array of root folders");
    }
    for (const root of tree) {
      if (!Array.isArray(root.children)) {
        throw new Error(`root folder ${root.id} (${root.name}) is missing a children array`);
      }
    }

    const countNodes = (nodes) =>
      nodes.reduce((sum, node) => sum + 1 + countNodes(node.children), 0);
    const treeCount = countNodes(tree);
    const flatCount = allFolders ? allFolders.length : null;
    if (flatCount != null && treeCount !== flatCount) {
      throw new Error(`tree has ${treeCount} folders but getFolders() returned ${flatCount}`);
    }

    return { rootFolders: tree.length, totalFolders: treeCount };
  });

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

  const item = await repo.getItemById(itemId);
  await run("getAudioStream (default)", async () => {
    const result = await repo.getAudioStream(item, "default");
    if (!result || !result.buffer || result.buffer.length === 0) {
      throw new Error("expected non-empty buffer");
    }
    return { bytes: result.buffer.length, contentType: result.contentType };
  });

  // No size comparison against "default" here: transcoding is disabled
  // server-side (TranscodeLowEnabled=off in dbserver.ini), so ?quality=low
  // currently returns the same original file as ?quality=default — not a
  // bug in our code, just server config (see docs/MAIRLISTDB-API.md).
  await run("getAudioStream (low)", async () => {
    const result = await repo.getAudioStream(item, "low");
    if (!result || !result.buffer || result.buffer.length === 0) {
      throw new Error("expected non-empty buffer");
    }
    if (!result.contentType) {
      throw new Error("expected a contentType");
    }
    return { bytes: result.buffer.length, contentType: result.contentType };
  });

  await run("getArtists", () => repo.getArtists());
  await run("getTitles", () => repo.getTitles());

  // Simulates the browser's dashboard page load, which fires ~12 requests
  // in parallel. Without the concurrency limiter in apiRepository.js this
  // exceeds the mAirListDB Server's MaxCachedConnections (default 5) and
  // the server responds with 500 "database is locked".
  await run("parallel load (12x getFolders)", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => repo.getFolders(folderId))
    );
    if (results.some((r) => !Array.isArray(r))) {
      throw new Error("one or more parallel requests did not return an array");
    }
    return { requests: results.length };
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
