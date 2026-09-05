// Smoke-tests the write paths in ../data/apiRepository.js against a live
// mAirListDB Server instance (port 8840 by default).
//
// ⚠️ Only touches an uncritical test item's Markers.FadeOut (nudged and
// reset back to its original value) and rewrites a far-future, unused
// playlist hour (default 2099-01-01, hour 3) — first unchanged (to check
// the Version counter goes up), then via reorderPlaylist/insertPlaylistItem/
// removePlaylistItem, verifying no entry (including Class:"Dummy"
// placeholders like hour-start markers) loses or gets fields overwritten,
// and always restoring the hour's exact original entries afterwards (even
// if an assertion above fails, via a finally block). Never point
// SMOKE_ITEM_ID / SMOKE_DATE at anything currently on air or scheduled.
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
  //
  // Items[] entries are the API's real, FLAT shape (Title/Artist/Duration/
  // Class directly on each entry, no {Class:"Playlist", Time, Item}
  // wrapper — see docs/MAIRLISTDB-API.md) — writeHour() takes that same
  // raw shape now, so round-tripping it unchanged is just "write back
  // exactly what GET returned".

  await run("writeHour (unchanged round-trip)", async () => {
    const before = await repo.getPlaylistHour(year, month, day, hour);
    const beforeVersion = Number(before?.VersionInfo?.Version ?? 0);
    const rawEntries = before?.Items || [];

    const newVersion = await repo.writeHour(year, month, day, hour, rawEntries);
    check(
      "writeHour returns incremented Version",
      newVersion !== null && Number(newVersion) > beforeVersion,
      `before=${beforeVersion} after=${newVersion}`
    );

    const after = await repo.getPlaylistHour(year, month, day, hour);
    check(
      "writeHour preserves item count",
      (after?.Items || []).length === rawEntries.length,
      `expected ${rawEntries.length}, got ${(after?.Items || []).length}`
    );
  });

  // ---- playlist write ops: reorder / insert / remove round-trip on a
  // throwaway test hour, verifying no fields (incl. Dummy placeholders)
  // are lost, then restoring the original state. ----
  //
  // ⚠️ Never point SMOKE_DATE at a real, currently-scheduled hour — this
  // section fully rewrites the target hour's playlist multiple times.

  await run("playlist write ops (reorder/insert/remove round-trip)", async () => {
    const playlistId = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}-${String(hour).padStart(2, "0")}`;

    const original = await repo.getPlaylistById(playlistId);
    if (!original) throw new Error(`playlist ${playlistId} not found`);
    const originalRaw = (await repo.getPlaylistHour(year, month, day, hour))?.Items || [];

    // Snapshot fingerprints (Title + Class + DatabaseID/FixTime) to check
    // nothing — including Dummy entries' Title/FixTime/Timing/State/
    // Customized/FixTimeFrame — gets lost or blanked out by a round-trip.
    const fingerprint = (raw) =>
      raw.map((e) => JSON.stringify({
        Class: e.Class, Title: e.Title, DatabaseID: e.DatabaseID,
        FixTime: e.FixTime, Timing: e.Timing, State: e.State,
        Customized: e.Customized, FixTimeFrame: e.FixTimeFrame,
      }));
    const originalFingerprint = fingerprint(originalRaw);

    try {
      if (original.entries.length < 2) {
        console.log(
          `        (skipped: hour ${playlistId} has ${original.entries.length} entr${original.entries.length === 1 ? "y" : "ies"}, need >= 2 to test reorder — insert/remove still run)`
        );
      } else {
        // Reorder: swap the first two positions, write, re-read, verify.
        const positions = original.entries.map((e) => e.position);
        const swapped = [positions[1], positions[0], ...positions.slice(2)];

        const reordered = await repo.reorderPlaylist(playlistId, swapped);
        check("reorderPlaylist returns a playlist", !!reordered);
        if (reordered) {
          check(
            "reorderPlaylist actually swapped the first two entries",
            reordered.entries[0]?.item?.id === original.entries[1]?.item?.id ||
              reordered.entries[0]?.itemId === original.entries[1]?.itemId,
            "first entry after reorder does not match expected swap"
          );
        }

        const afterReorderRaw = (await repo.getPlaylistHour(year, month, day, hour))?.Items || [];
        check(
          "reorderPlaylist preserves entry count",
          afterReorderRaw.length === originalRaw.length,
          `expected ${originalRaw.length}, got ${afterReorderRaw.length}`
        );
        check(
          "reorderPlaylist preserves all entry fields (incl. Dummy) as a set",
          fingerprint(afterReorderRaw).sort().join("|") === [...originalFingerprint].sort().join("|"),
          "fingerprints differ after reorder — a field was lost or altered"
        );

        // Restore original order before moving on.
        await repo.reorderPlaylist(playlistId, positions);
      }

      // Insert: add the smoke item at the end, verify it appears with
      // correct fields, then remove it again by position.
      const beforeInsert = await repo.getPlaylistById(playlistId);
      const inserted = await repo.insertPlaylistItem(playlistId, { itemId });
      check("insertPlaylistItem returns a playlist", !!inserted);
      check(
        "insertPlaylistItem appends one entry",
        inserted && inserted.entries.length === beforeInsert.entries.length + 1,
        `expected ${beforeInsert.entries.length + 1}, got ${inserted && inserted.entries.length}`
      );
      const lastEntry = inserted && inserted.entries[inserted.entries.length - 1];
      check(
        "inserted entry resolves the correct item",
        lastEntry?.item?.id === String(itemId),
        `expected item id ${itemId}, got ${lastEntry?.item?.id}`
      );

      const removed = await repo.removePlaylistItem(playlistId, inserted.entries.length);
      check("removePlaylistItem returns a playlist", !!removed);
      check(
        "removePlaylistItem restores original entry count",
        removed && removed.entries.length === beforeInsert.entries.length,
        `expected ${beforeInsert.entries.length}, got ${removed && removed.entries.length}`
      );
    } finally {
      // Always restore the exact original raw entries, regardless of
      // which assertions above passed or failed.
      await repo.writeHour(year, month, day, hour, originalRaw);
      const restoredRaw = (await repo.getPlaylistHour(year, month, day, hour))?.Items || [];
      check(
        "test hour restored to original state",
        fingerprint(restoredRaw).sort().join("|") === [...originalFingerprint].sort().join("|"),
        "restore did not reproduce the original fingerprint — MANUAL CHECK NEEDED"
      );
    }
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
