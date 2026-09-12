// ---- playlists ----

const { apiRequest } = require("./apiClient");
const { parsePlaylistId, playlistId, secondsToClock } = require("./shared");
const { getItemById, mapApiItemToInternal, mapInternalItemToApi, mapMarkersToApi } = require("./apiItems");

function pad2(n) {
  return String(n).padStart(2, "0");
}

async function getPlaylistHour(year, month, day, hour) {
  const path = `/api/v1/playlists/${year}/${pad2(month)}/${pad2(day)}/${pad2(hour)}/0`;
  const data = await apiRequest("GET", path);
  return data;
}

async function getPlaylistAttributes(year, month, day, hour) {
  const path = `/api/v1/playlists/${year}/${pad2(month)}/${pad2(day)}/${pad2(hour)}/0/attributes`;
  return apiRequest("GET", path);
}

// playlistHourId is this file's name for shared.js's playlistId() (same
// "YYYY-MM-DD-HH" format sqlRepository.js uses).
const playlistHourId = playlistId;

// Mirrors sqlRepository.js's getPlaylistsByDate(date): one entry per hour
// of the day (0-23), each flagged hasEntries. The API has no single
// per-day endpoint (only per-hour, see docs/MAIRLISTDB-API.md), so this
// loops getPlaylistHour() across all 24 hours — safe to fire concurrently
// since apiRequest() already serializes through the shared concurrency
// queue (MAX_CONCURRENT, default 3).
async function getPlaylistsByDate(date) {
  const [year, month, day] = date.split("-").map(Number);

  const hours = await Promise.all(
    Array.from({ length: 24 }, (_, hour) => getPlaylistHour(year, month, day, hour))
  );

  return hours.map((data, hour) => ({
    id: playlistHourId(date, hour),
    date,
    hour,
    hasEntries: Array.isArray(data?.Items) && data.Items.length > 0,
  }));
}

// Mirrors sqlRepository.js's getPlaylistById(id) -> { id, date, hour,
// entries: [{ position, itemId, scheduledStart, overrides, item }] }.
// `overrides` has no API counterpart (the API's PlaylistItemAttributes
// only appears on Container sub-items, not top-level slots — see
// docs/MAIRLISTDB-API.md) and stays undefined here.
//
// Contrary to what an earlier reading of the docs assumed, each entry in
// Items[] is NOT a { Class: "Playlist", Time: {...}, Item: {...} }
// wrapper — it IS the item itself, flat (Title/Artist/Duration/Class
// etc. directly on the entry), confirmed against a live server response.
// entry.Item ?? entry stays defensive in case some contexts do wrap it.
//
// Container items (Class: "Container", e.g. ad blocks) are mapped as a
// single playlist entry via mapApiItemToInternal (which already sets
// containerType from Class) — their nested Items list isn't flattened
// into separate entries, but mapApiItemToInternal does carry it along as
// item.subItems (one level deep) for the frontend to render expanded.
// See docs/FEATURES.md.
//
// Entries carry no per-slot start time as a rule — only some (e.g.
// Class: "Dummy" hour-start placeholders) have an explicit FixTime.
// scheduledStart is therefore computed cumulatively from the hour's
// start plus prior entries' durations (mirrors sqlRepository.js's
// resequenceEntries), using FixTime only where the API sets it.
async function getPlaylistById(id) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  const { date, hour } = parsed;
  const [year, month, day] = date.split("-").map(Number);

  const data = await getPlaylistHour(year, month, day, hour);
  const apiItems = Array.isArray(data?.Items) ? data.Items : [];

  let cursorSeconds = hour * 3600;
  const entries = apiItems.map((entry, index) => {
    const apiItem = entry.Item ?? entry;
    const item = mapApiItemToInternal(apiItem, null);

    const scheduledStart = entry.FixTime || secondsToClock(cursorSeconds);
    cursorSeconds += item ? item.duration : 0;

    return {
      position: index + 1,
      itemId: item ? item.id : null,
      scheduledStart,
      overrides: undefined,
      item,
    };
  });

  return { id, date, hour, entries };
}

// `items` is the full replacement list of RAW API entries for the hour
// (the same flat, un-normalized objects getPlaylistHour()'s Items[]
// contains — NOT internal { time, item } pairs) — not a diff. Loads the
// current hour first only to carry its VersionInfo through to the PUT
// (see docs: unverified whether the server requires this for conflict
// detection, sent along out of caution). Returns the new version number
// reported by the server; does not attempt to detect or resolve version
// conflicts (also unverified — see docs/MAIRLISTDB-API.md offene Punkte).
//
// Deliberately takes raw entries rather than internal { time, item }
// pairs run through mapInternalItemToApi(): Class: "Dummy" slots (hour-
// start markers etc.) have no DatabaseID and carry fields
// (Timing/State/Customized/FixTimeFrame/FixTime) that the internal item
// shape can't represent — reconstructing them from mapInternalItemToApi
// would corrupt or drop them. Callers (reorderPlaylist/insertPlaylistItem/
// removePlaylistItem/savePlaylistItemOverrides below) therefore read the
// raw Items[] array, splice/reorder it in place, and pass the result
// straight back here — only entries actually being inserted are built
// fresh via mapInternalItemToApi(); everything else round-trips untouched.
async function writeHour(year, month, day, hour, rawEntries) {
  const path = `/api/v1/playlists/${year}/${pad2(month)}/${pad2(day)}/${pad2(hour)}/0`;
  const current = await apiRequest("GET", path);

  const body = {
    Items: rawEntries || [],
    VersionInfo: current?.VersionInfo,
  };

  const result = await apiRequest("PUT", path, { body });
  return result?.Version ?? null;
}

// ---- playlist write operations (read-modify-write on raw Items[]) ----
//
// The API only exposes whole-hour reads/writes (no per-slot insert/
// remove/reorder endpoint), so each of these re-fetches the hour's raw
// entries, mutates the array in memory, writes the full array back, then
// re-reads via getPlaylistById() to return the normalized shape (mirrors
// sqlRepository.js's own read-modify-write via writeHour there).
//
// `position` throughout is 1-based and matches getPlaylistById()'s
// `entries[].position` (= raw array index + 1).

async function getRawPlaylistItems(year, month, day, hour) {
  const data = await getPlaylistHour(year, month, day, hour);
  return Array.isArray(data?.Items) ? data.Items : [];
}

async function reorderPlaylist(id, order) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  const { date, hour } = parsed;
  const [year, month, day] = date.split("-").map(Number);

  const rawItems = await getRawPlaylistItems(year, month, day, hour);
  if (!Array.isArray(order) || order.length !== rawItems.length) return null;

  const byPosition = new Map(rawItems.map((entry, index) => [index + 1, entry]));
  const reordered = order.map((pos) => byPosition.get(Number(pos)));
  if (reordered.some((e) => !e)) return null;

  await writeHour(year, month, day, hour, reordered);
  return getPlaylistById(id);
}

async function insertPlaylistItem(id, { itemId, afterPosition }) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  const { date, hour } = parsed;
  const [year, month, day] = date.split("-").map(Number);

  const item = await getItemById(itemId);
  if (!item) return null;

  const rawItems = await getRawPlaylistItems(year, month, day, hour);
  const insertAt = afterPosition == null ? rawItems.length : Number(afterPosition);

  const newRawEntry = mapInternalItemToApi(item);
  const next = [...rawItems];
  next.splice(insertAt, 0, newRawEntry);

  await writeHour(year, month, day, hour, next);
  return getPlaylistById(id);
}

async function removePlaylistItem(id, position) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  const { date, hour } = parsed;
  const [year, month, day] = date.split("-").map(Number);

  const rawItems = await getRawPlaylistItems(year, month, day, hour);
  const index = Number(position) - 1;
  if (index < 0 || index >= rawItems.length) return null;

  const next = [...rawItems];
  next.splice(index, 1);

  await writeHour(year, month, day, hour, next);
  return getPlaylistById(id);
}

// The API's per-slot volatile overrides (PlaylistItemAttributes) are only
// documented on Container sub-items, not top-level slots (see
// docs/MAIRLISTDB-API.md) — there is no verified top-level counterpart to
// write to. Best-effort: merge cue overrides directly into the raw
// entry's own Markers (the one per-slot field that's known to exist and
// round-trip), leave everything else on the raw entry untouched. Other
// override kinds (attributes, etc.) have no known target field and are
// silently dropped rather than guessed at.
async function savePlaylistItemOverrides(id, position, overrides) {
  const parsed = parsePlaylistId(id);
  if (!parsed) return null;
  const { date, hour } = parsed;
  const [year, month, day] = date.split("-").map(Number);

  const rawItems = await getRawPlaylistItems(year, month, day, hour);
  const index = Number(position) - 1;
  if (index < 0 || index >= rawItems.length) return null;

  const next = [...rawItems];
  const entry = { ...next[index] };
  if (overrides?.cue) {
    entry.Markers = { ...(entry.Markers || {}), ...mapMarkersToApi(overrides.cue) };
  }
  next[index] = entry;

  await writeHour(year, month, day, hour, next);
  return getPlaylistById(id);
}

module.exports = {
  getPlaylistHour,
  getPlaylistAttributes,
  writeHour,
  getPlaylistsByDate,
  getPlaylistById,
  reorderPlaylist,
  insertPlaylistItem,
  removePlaylistItem,
  savePlaylistItemOverrides,
};
