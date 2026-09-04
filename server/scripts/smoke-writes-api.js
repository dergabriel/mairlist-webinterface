// Smoke-tests the write paths in ../data/apiRepository.js against a live
// mAirListDB Server instance (port 8840 by default).
//
// ⚠️ Only touches an uncritical test item's Markers.FadeOut (nudged and
// reset back to its original value) and re-writes an empty/unimportant
// playlist hour unchanged (to check the Version counter goes up) — never
// point SMOKE_ITEM_ID / SMOKE_DATE at anything currently on air.
//
// Usage:
//   API_DB_BASE_URL=http://localhost:8840 API_DB_USER=... API_DB_PASSWORD=... \
//     node server/scripts/smoke-writes-api.js
//
// Optional: SMOKE_ITEM_ID (default 2605), SMOKE_DATE (default far-future,
// to avoid touching a real scheduled hour), SMOKE_HOUR (default 3).

if (!process.env.API_DB_USER || !process.env.API_DB_PASSWORD) {
  console.error("API_DB_USER / API_DB_PASSWORD not set — refusing to guess credentials.");
  process.exit(1);
}

const repo = require("../data/apiRepository");

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

async function run(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.log(`❌ FAIL ${name} — threw: ${e.name || "Error"}: ${e.message}`);
    fail++;
  }
}

async function main() {
  const itemId = process.env.SMOKE_ITEM_ID || "2605";
  // Far-future date by default so we never accidentally rewrite a real,
  // currently-scheduled hour.
  const date = process.env.SMOKE_DATE ? new Date(process.env.SMOKE_DATE) : new Date("2099-01-01");
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = process.env.SMOKE_HOUR ? Number(process.env.SMOKE_HOUR) : 3;

  console.log(`Base URL: ${process.env.API_DB_BASE_URL || "http://localhost:8840"}`);
  console.log(`Item ID: ${itemId}  Playlist: ${year}-${month}-${day} ${hour}:00\n`);

  // ---- updateItem: nudge Markers.FadeOut, verify, reset ----

  await run("updateItem (FadeOut nudge + reset)", async () => {
    const original = await repo.getItemById(itemId);
    if (!original) throw new Error(`item ${itemId} not found`);

    const originalFadeOut = original.cue.fadeOut;
    if (originalFadeOut === null || originalFadeOut === undefined) {
      throw new Error(`item ${itemId} has no FadeOut marker set — pick a different SMOKE_ITEM_ID`);
    }

    const nudged = originalFadeOut + 0.01;

    const updated = await repo.updateItem(itemId, { cue: { fadeOut: nudged } });
    check(
      "updateItem applies FadeOut nudge",
      updated && Math.abs(updated.cue.fadeOut - nudged) < 0.0005,
      `expected ~${nudged}, got ${updated && updated.cue.fadeOut}`
    );

    const resetBack = await repo.updateItem(itemId, { cue: { fadeOut: originalFadeOut } });
    check(
      "updateItem resets FadeOut to original",
      resetBack && Math.abs(resetBack.cue.fadeOut - originalFadeOut) < 0.0005,
      `expected ~${originalFadeOut}, got ${resetBack && resetBack.cue.fadeOut}`
    );
  });

  // ---- createItem / deleteItem: confirm they're stubs, not silently broken ----

  await run("createItem (unimplemented stub)", async () => {
    let threw = false;
    try {
      await repo.createItem({});
    } catch (e) {
      threw = true;
    }
    check("createItem throws", threw);
  });

  await run("deleteItem (unimplemented stub)", async () => {
    let threw = false;
    try {
      await repo.deleteItem(itemId);
    } catch (e) {
      threw = true;
    }
    check("deleteItem throws", threw);
  });

  // ---- writeHour: rewrite an unimportant hour unchanged, check Version increments ----

  await run("writeHour (unchanged round-trip)", async () => {
    const before = await repo.getPlaylistHour(year, month, day, hour);
    const beforeVersion = Number(before?.VersionInfo?.Version ?? 0);

    const entries = (before?.Items || []).map((entry) => ({
      time: entry.Time?.Value,
      item: repo.mapApiItemToInternal(entry.Item),
    }));

    const newVersion = await repo.writeHour(year, month, day, hour, entries);
    check(
      "writeHour returns incremented Version",
      newVersion !== null && Number(newVersion) > beforeVersion,
      `before=${beforeVersion} after=${newVersion}`
    );

    const after = await repo.getPlaylistHour(year, month, day, hour);
    check(
      "writeHour preserves item count",
      (after?.Items || []).length === entries.length,
      `expected ${entries.length}, got ${(after?.Items || []).length}`
    );
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
