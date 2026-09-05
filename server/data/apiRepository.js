// mAirListDB Server REST API-backed repository (read-only, Phase 1).
//
// Alternative to sqlRepository.js: instead of opening the .mldb file
// directly with better-sqlite3, this talks to the mAirListDB Server's HTTP
// API (see docs/MAIRLISTDB-API.md). Structurally avoids the SQLite-locking
// contention with mAirList, because it never touches the .mldb file itself.
//
// NOT wired up anywhere yet — sqlRepository.js remains the active
// implementation. This file exists in parallel for validation (see
// server/scripts/smoke-reads-api.js) before any switchover.
//
// Read functions here mirror sqlRepository.js's *item* return shape
// (same field names, so the frontend needs no changes once DATA_SOURCE
// switches), but folder/search functions use signatures matching the API's
// natural shape (getFolders(parentId), getItemsByFolder(folderId), ...)
// rather than sqlRepository.js's getFolderTree()/getItems(filters) — the
// two repositories are not yet interface-identical.

const BASE_URL = process.env.API_DB_BASE_URL || "http://localhost:8840";
const API_USER = process.env.API_DB_USER;
const API_PASSWORD = process.env.API_DB_PASSWORD;

// Only single-station setups are handled today; kept as a named constant
// (not hardcoded inline) so a future multi-station caller has one place to
// override it.
const STATION = process.env.API_DB_STATION || "1";

const REQUEST_TIMEOUT_MS = 10000;

// ---- concurrency limiter ----
//
// The mAirListDB Server's dbserver.ini caps MaxCachedConnections at 5 by
// default; past that it returns HTTP 500 "database is locked" under
// concurrent load (e.g. ~12 parallel requests firing off the dashboard on
// page load). We stay under that cap (default 3) so other clients (the
// real mAirList client) still have headroom. Small hand-rolled queue
// instead of a dependency: an active-request counter plus a FIFO list of
// resolvers waiting for a free slot.
const MAX_CONCURRENT = Number(process.env.API_DB_MAX_CONCURRENT) || 3;

let activeRequests = 0;
const waitQueue = [];

function acquireSlot() {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitQueue.push(resolve));
}

function releaseSlot() {
  const next = waitQueue.shift();
  if (next) {
    next();
  } else {
    activeRequests--;
  }
}

async function withConcurrencyLimit(fn) {
  await acquireSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

// ---- retry on transient "database is locked" errors ----
//
// Only retries the specific SQLite contention error the server surfaces
// under load (500 + "database is locked" in the body) — any other error
// (404, 401, network failure, unrelated 500s) passes straight through.
const RETRY_DELAYS_MS = [300, 600, 1200];

function isDatabaseLockedError(err) {
  return err instanceof DatabaseLockedError;
}

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isDatabaseLockedError(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

class DatabaseLockedError extends Error {
  constructor(path, status, body) {
    super(`mAirListDB Server: ${path} failed with ${status} (database is locked)`);
    this.name = "DatabaseLockedError";
    this.status = status;
    this.body = body;
  }
}

class ApiNotFoundError extends Error {
  constructor(path) {
    super(`mAirListDB Server: resource not found: ${path}`);
    this.name = "ApiNotFoundError";
  }
}

class ApiUnreachableError extends Error {
  constructor(url, cause) {
    super(`mAirListDB Server nicht erreichbar unter ${url}`);
    this.name = "ApiUnreachableError";
    this.cause = cause;
  }
}

function authHeader() {
  const token = Buffer.from(`${API_USER}:${API_PASSWORD}`).toString("base64");
  return `Basic ${token}`;
}

// Central request helper. `query` is a plain object of query params;
// station is appended automatically unless the caller already set it or
// explicitly passes station: null to omit it (e.g. /permissions,
// /capabilities have no station scoping per the API docs). `rawFlags` is
// an array of bare query flags sent without a value or "=" (e.g. the API's
// `?artists&...` / `?titles&...` distinct-list flags) — URLSearchParams
// can't express a valueless flag (it always serializes `set(k, "")` as
// `k=`), so these are appended to the built query string directly.
async function apiRequest(method, path, { query = {}, rawFlags = [], body, withStation = true } = {}) {
  return withConcurrencyLimit(() =>
    withRetry(() => doApiRequest(method, path, { query, rawFlags, body, withStation }))
  );
}

async function doApiRequest(method, path, { query = {}, rawFlags = [], body, withStation = true } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, value);
  }
  if (withStation && !params.has("station")) params.set("station", STATION);

  const qs = [...rawFlags, params.toString()].filter(Boolean).join("&");
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ""}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiUnreachableError(BASE_URL, err);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new ApiNotFoundError(path);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 500 && /database is locked/i.test(text)) {
      throw new DatabaseLockedError(path, response.status, text);
    }
    throw new Error(`mAirListDB Server: ${method} ${path} failed with ${response.status}${text ? `: ${text}` : ""}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

// ---- item field mapping (API PascalCase <-> internal camelCase) ----
//
// Mirrors sqlRepository.js's CUE_TO_DB / DB_TO_CUE and rowToItem() so the
// two repositories return items in the same shape.

const CUE_TO_DB = {
  cueIn: "CueIn", fadeIn: "FadeIn", ramp1: "Ramp1", ramp2: "Ramp2", ramp3: "Ramp3",
  loopIn: "LoopIn", loopOut: "LoopOut", hookIn: "HookIn", hookFade: "HookFade",
  hookOut: "HookOut", outro: "Outro", startNext: "StartNext", fadeOut: "FadeOut",
  fadeEnd: "FadeEnd", cueOut: "CueOut", preroll: "Preroll", anchor: "Anchor",
};
const DB_TO_CUE = Object.fromEntries(Object.entries(CUE_TO_DB).map(([k, v]) => [v, k]));

const typeToCode = (t) => (t || "").toLowerCase();

function mapMarkersToInternal(markers) {
  const cue = {};
  for (const key of Object.keys(CUE_TO_DB)) cue[key] = null;
  if (!markers) return cue;
  for (const [dbKey, value] of Object.entries(markers)) {
    const key = DB_TO_CUE[dbKey];
    if (key) cue[key] = value;
  }
  return cue;
}

// Maps one API item object (as returned by GET /api/v1/items/<id>, or
// nested under Item in playlist/folder responses) to the internal item
// shape used throughout the app (same fields as sqlRepository.js's
// rowToItem()).
//
// `folderId` is not part of the item response itself (see docs) — pass it
// in explicitly when the caller already knows which folder the item came
// from (e.g. getItemsByFolder). Otherwise it's left null; use
// getItemFolders(id) to look up an item's folder assignments.
function mapApiItemToInternal(apiItem, folderId = null) {
  if (!apiItem) return null;

  // Dummy playlist slots (Class: "Dummy", e.g. hour-start placeholders)
  // carry no DatabaseID — leave id/internalId null instead of the bogus
  // "undefined"/NaN that String()/Number() would otherwise produce.
  const hasDatabaseId = apiItem.DatabaseID !== undefined && apiItem.DatabaseID !== null;

  return {
    id: hasDatabaseId ? String(apiItem.DatabaseID) : null,
    internalId: hasDatabaseId ? Number(apiItem.DatabaseID) : null,
    externalId: null,
    type: typeToCode(apiItem.Type),
    containerType: apiItem.Class === "Container" ? apiItem.Class : null,
    title: apiItem.Title || "",
    artist: apiItem.Artist || "",
    duration: apiItem.Duration || 0,
    endTime: null,
    storageId: null,
    relativePath: apiItem.Filename || null,
    folderId,
    comment: "",
    color: null,
    cover: null,
    cue: mapMarkersToInternal(apiItem.Markers),
    playback: {
      // API's Amplification is already a dB gain value (negative = below
      // unity), same convention as sqlRepository.js's amplification column
      // -> gainDb. No sign/scale conversion applied.
      gainDb: apiItem.Amplification ?? 0,
      normalizedLufs: apiItem.Levels?.Loudness ?? null,
      segueMode: "normal",
    },
    attributes: apiItem.Attributes || {},
    updatedAt: new Date().toISOString(),
    playHistory: [],
  };
}

// Inverse of mapMarkersToInternal(): only writes markers that actually
// have a value (not undefined/null) into the API object. The internal
// cue object always has all CUE_TO_DB keys present (initialized to null
// by mapMarkersToInternal for markers absent in the API response), so a
// naive full round-trip would send e.g. `HookIn: null` for markers the
// item never had — safer to omit them entirely than risk the server
// interpreting a null/0 as "set this marker to zero".
function mapMarkersToApi(cue) {
  const markers = {};
  if (!cue) return markers;
  for (const [key, dbKey] of Object.entries(CUE_TO_DB)) {
    const value = cue[key];
    if (value !== undefined && value !== null) markers[dbKey] = value;
  }
  return markers;
}

// Inverse of mapApiItemToInternal(). Only fields the API is known to
// accept are written back (Title, Artist, Duration, Type, Markers,
// Amplification, Attributes, Filename, DatabaseID, Class) — internal
// fields with no API counterpart (folderId, comment, color, cover,
// endTime, storageId, externalId, playHistory, updatedAt,
// playback.normalizedLufs/segueMode) are deliberately left out, since
// it's unverified whether the server ignores unknown fields on PUT or
// rejects them.
function mapInternalItemToApi(internalItem) {
  return {
    Class: internalItem.containerType === "Container" ? "Container" : "File",
    DatabaseID: String(internalItem.internalId ?? internalItem.id),
    Title: internalItem.title ?? "",
    Artist: internalItem.artist ?? "",
    Duration: internalItem.duration ?? 0,
    Type: internalItem.type
      ? internalItem.type.charAt(0).toUpperCase() + internalItem.type.slice(1)
      : "",
    Filename: internalItem.relativePath ?? undefined,
    Amplification: internalItem.playback?.gainDb ?? 0,
    Markers: mapMarkersToApi(internalItem.cue),
    Attributes: internalItem.attributes || {},
  };
}

function rowToFolder(apiFolder) {
  if (!apiFolder) return null;
  return {
    id: apiFolder.ID,
    name: apiFolder.Name || "",
    parentId: apiFolder.Parent === "root" || apiFolder.Parent == null ? null : apiFolder.Parent,
  };
}

// ---- folders ----

async function getFolders(parentId) {
  const query = parentId != null ? { parent: parentId } : {};
  const data = await apiRequest("GET", "/api/v1/folders", { query });
  const list = Array.isArray(data) ? data : data?.Folders || [];
  return list.map(rowToFolder);
}

// ---- items ----

async function getItemsByFolder(folderId) {
  const data = await apiRequest("GET", "/api/v1/items", { query: { folder: folderId } });
  const list = Array.isArray(data) ? data : data?.Items || [];
  // The API doesn't echo the folder back on each item, but since we
  // queried this exact folder, every returned item belongs to it.
  return list.map((apiItem) => mapApiItemToInternal(apiItem, folderId ?? null));
}

// sqlRepository.js's getItems(filters) can list the whole library
// (no folderId) via a plain SQL scan; the API has no such unfiltered
// items endpoint (GET /api/v1/items always requires folder=<id> or
// ids=<id,...>, see docs/MAIRLISTDB-API.md). So folderId is required
// here — the frontend always supplies one when browsing library.js's
// GET /api/items (the folder tree UI), and the remaining filters
// (type/artist/storageId/attributeKey+Value) are applied client-side
// on top of that folder's items, mirroring sqlRepository.js's own
// post-query filtering for folderId/attributeKey there.
async function getItems(filters = {}) {
  if (filters.folderId == null) return [];

  let result = await getItemsByFolder(filters.folderId);

  if (filters.type) {
    result = result.filter((i) => i.type === typeToCode(filters.type));
  }
  if (filters.artist) {
    result = result.filter((i) => i.artist === filters.artist);
  }
  if (filters.storageId != null) {
    result = result.filter((i) => resolveStorageFile(i)?.storageId === String(filters.storageId));
  }
  if (filters.attributeKey) {
    result = result.filter(
      (i) => String(i.attributes?.[filters.attributeKey] ?? "") === String(filters.attributeValue)
    );
  }

  return result;
}

async function getItemById(id) {
  if (id === null || id === undefined || id === "") return null;
  try {
    const data = await apiRequest("GET", `/api/v1/items/${encodeURIComponent(id)}`);
    // No folder field on the single-item response (see docs) — folderId
    // stays null here. Call getItemFolders(id) if the folder assignment
    // is needed.
    return mapApiItemToInternal(data);
  } catch (err) {
    if (err instanceof ApiNotFoundError) return null;
    throw err;
  }
}

async function getItemsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const data = await apiRequest("GET", "/api/v1/items", {
    query: { ids: ids.join(","), icons: "true" },
  });
  const list = Array.isArray(data) ? data : data?.Items || [];
  // No folder field on this response either (see docs) — folderId stays
  // null, consistent with getItemById. Must not pass map's index arg
  // through as folderId.
  return list.map((apiItem) => mapApiItemToInternal(apiItem));
}

// Response is a bare array of folder ID strings, e.g. ["8"] — not folder
// objects (unlike the `Folders` array embedded in
// /api/v1/items?folder=<id> responses). Resolve each ID against the full
// folder tree (getFolders()) to return proper { id, name, parentId }
// folder objects.
async function getItemFolders(itemId) {
  const data = await apiRequest("GET", `/api/v1/items/${encodeURIComponent(itemId)}/folders`);
  const ids = Array.isArray(data) ? data : data?.Folders || [];
  const allFolders = await getFolders();
  const byId = new Map(allFolders.map((f) => [String(f.id), f]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

// Mirrors sqlRepository.js's updateItem's writable-field set (see also
// ITEM_WRITABLE_FIELDS in server/routes/library.js). Only fields the API
// round-trip actually supports (see mapInternalItemToApi) are applied;
// folderId/comment/color/cover etc. are accepted here (for interface
// parity with sqlRepository.js) but silently have no effect, since the
// API has no per-item field for them.
const API_WRITABLE_FIELDS = new Set([
  "title", "artist", "type", "duration", "relativePath", "cue", "playback", "attributes",
]);

function pickWritable(changes) {
  return Object.fromEntries(
    Object.entries(changes || {}).filter(([key]) => API_WRITABLE_FIELDS.has(key))
  );
}

async function updateItem(id, changes) {
  const current = await apiRequest("GET", `/api/v1/items/${encodeURIComponent(id)}`);
  if (!current) return null;

  const safe = pickWritable(changes);
  const merged = { ...current };

  if (safe.title !== undefined) merged.Title = safe.title;
  if (safe.artist !== undefined) merged.Artist = safe.artist;
  if (safe.type !== undefined) merged.Type = safe.type.charAt(0).toUpperCase() + safe.type.slice(1);
  if (safe.duration !== undefined) merged.Duration = Number(safe.duration);
  if (safe.relativePath !== undefined) merged.Filename = safe.relativePath;
  if (safe.playback?.gainDb !== undefined) merged.Amplification = safe.playback.gainDb;
  if (safe.attributes !== undefined) merged.Attributes = { ...(merged.Attributes || {}), ...safe.attributes };
  if (safe.cue !== undefined) {
    merged.Markers = { ...(merged.Markers || {}), ...mapMarkersToApi(safe.cue) };
  }

  await apiRequest("PUT", `/api/v1/items/${encodeURIComponent(id)}`, { body: merged });

  return getItemById(id);
}

// Endpoint not verified against the live server (CreateItems capability
// is advertised, but no creation request has been observed in traffic —
// see docs/MAIRLISTDB-API.md "Offene Punkte"). Deliberately not guessing
// a path.
async function createItem() {
  throw new Error(
    "createItem über API noch nicht implementiert — Endpunkt nicht verifiziert, siehe docs/MAIRLISTDB-API.md offene Punkte"
  );
}

// No delete endpoint observed in traffic — see docs/MAIRLISTDB-API.md.
async function deleteItem() {
  throw new Error(
    "deleteItem über API noch nicht implementiert — Endpunkt nicht verifiziert, siehe docs/MAIRLISTDB-API.md offene Punkte"
  );
}

async function getItemRestrictions(itemId) {
  return apiRequest("GET", `/api/v1/items/${encodeURIComponent(itemId)}/restrictions`);
}

async function getItemHistory(itemId) {
  return apiRequest("GET", `/api/v1/items/${encodeURIComponent(itemId)}/history`);
}

// ---- audio streaming ----
//
// Storages/Audio-Dateien (see docs/MAIRLISTDB-API.md): audio bytes live at
// GET /api/v1/storages/<storageId>/files/<filename>?quality=default|low.
// mapApiItemToInternal() doesn't populate storageId (the API has no such
// field on the item itself) — instead the full "/storages/<id>/files/<name>"
// path is stored in relativePath (from the API's Filename field). Parse it
// back out here rather than relying on item.storageId.
const STORAGE_FILE_PATH_RE = /^\/storages\/([^/]+)\/files\/(.+)$/;

function resolveStorageFile(item) {
  if (!item) return null;
  if (item.storageId != null && item.relativePath) {
    return { storageId: item.storageId, filename: item.relativePath };
  }
  const match = STORAGE_FILE_PATH_RE.exec(item.relativePath || "");
  if (!match) return null;
  return { storageId: match[1], filename: match[2] };
}

// Builds the mAirListDB Server URL for an item's audio file. Does not embed
// credentials in the URL — callers that need to authenticate (i.e.
// getAudioStream below) add the Basic Auth header themselves. Not meant to
// be handed to the browser directly, since the DBServer requires auth this
// URL alone doesn't carry.
function getAudioStreamUrl(item, quality = "default") {
  const file = resolveStorageFile(item);
  if (!file) return null;
  const path = `/api/v1/storages/${encodeURIComponent(file.storageId)}/files/${encodeURIComponent(file.filename)}`;
  return `${BASE_URL}${path}?quality=${encodeURIComponent(quality)}`;
}

// Fetches the audio file from the mAirListDB Server (Basic Auth) and returns
// { buffer, contentType }, for our own server to proxy through to the
// browser — keeps DBServer credentials out of the frontend.
async function getAudioStream(item, quality = "default") {
  const file = resolveStorageFile(item);
  if (!file) return null;

  const path = `/api/v1/storages/${encodeURIComponent(file.storageId)}/files/${encodeURIComponent(file.filename)}`;
  const url = `${BASE_URL}${path}?quality=${encodeURIComponent(quality)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: authHeader() },
      signal: controller.signal,
    });
  } catch (err) {
    throw new ApiUnreachableError(BASE_URL, err);
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new ApiNotFoundError(path);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`mAirListDB Server: GET ${path} failed with ${response.status}${text ? `: ${text}` : ""}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

// ---- playlists ----

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Seconds-since-midnight -> "HH:MM:SS", wrapping past 24h. Mirrors
// sqlRepository.js's resequenceEntries() cursor formatting.
function secondsToClock(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600) % 24).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
  return `${h}:${m}:${s}`;
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

const playlistHourId = (date, hour) => `${date}-${String(hour).padStart(2, "0")}`;

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

const PLAYLIST_ID_RE = /^(\d{4}-\d{2}-\d{2})-(\d{2})$/;

function parsePlaylistId(id) {
  const match = PLAYLIST_ID_RE.exec(id);
  if (!match) return null;
  return { date: match[1], hour: parseInt(match[2], 10) };
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
// into separate entries. See docs/FEATURES.md: nested Container
// sub-items aren't editable/expandable yet in api-mode.
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

// ---- permissions / capabilities ----
// No station scoping documented for these two endpoints.

async function getPermissions() {
  return apiRequest("GET", "/api/v1/permissions", { withStation: false });
}

async function getCapabilities() {
  return apiRequest("GET", "/api/v1/capabilities", { withStation: false });
}

// ---- artists / titles (distinct-value search) ----
//
// docs/MAIRLISTDB-API.md documents these as `?artists&time=...&station=1` /
// `?titles&time=...&station=1` — `artists`/`titles` is a bare flag (no
// "=value"), which URLSearchParams cannot express (see apiRequest's
// `rawFlags`). Two fix attempts so far both still returned full item
// objects instead of a distinct name list against a live server:
//   1. sending `time=` as an empty string (malformed value)
//   2. omitting `time` entirely
// `rawFlags` now sends `artists`/`titles` as true bare flags (no previous
// attempt did this — both still went through URLSearchParams as `key=`),
// but the real `time` format is still unconfirmed. This is a known open
// point — see "Offene Punkte" in docs/MAIRLISTDB-API.md. Not a blocker:
// artists/titles search is a nice-to-have, not core functionality.

// Frontend expects a plain array here (Playlist.jsx/DatabaseManager.jsx
// set it straight into an `artists` state array and iterate it in
// LibraryTree's ListSection). Falling through to the raw unexpected
// payload (an object, per the TODO above) instead of an array broke
// that iteration in api-mode — same class of bug as the getStorages/
// getItemTypes/etc. stubs above, fixed the same way: empty array
// instead of a non-array value, with a one-time warning.
function warnOnceUnexpectedShape(name) {
  const key = `${name}:unexpected-shape`;
  if (!warnedOnce.has(key)) {
    warnedOnce.add(key);
    console.warn(`[apiRepository] ${name}(): unerwartetes Antwortformat vom Server, liefert leeres Array`);
  }
}

async function getArtists(searchTerm) {
  const data = await apiRequest("GET", "/api/v1/items", {
    rawFlags: ["artists"],
    query: searchTerm ? { q: searchTerm } : {},
  });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Artists)) return data.Artists;
  // Unexpected shape (likely still full item objects) — `time` format
  // remains unconfirmed, see comment above. Must not return a non-array
  // here; callers rely on Array methods (map/length) without guarding.
  warnOnceUnexpectedShape("getArtists");
  return [];
}

async function getTitles(searchTerm) {
  const data = await apiRequest("GET", "/api/v1/items", {
    rawFlags: ["titles"],
    query: searchTerm ? { q: searchTerm } : {},
  });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Titles)) return data.Titles;
  // Unexpected shape — see getArtists above.
  warnOnceUnexpectedShape("getTitles");
  return [];
}

// ---- not yet implemented via the mAirListDB Server API ----
//
// These have no counterpart in the API (folders are a flat parent-lookup
// via getFolders(parentId), not a tree/CRUD API; storages, item search,
// dashboard/log aggregation, and the mock-style playlist-by-date/id
// lookups have no matching endpoint at all). Named stubs (rather than a
// generic proxy) so each throws with the actual function name, and so
// library.js can call `repo.<name>()` the same way regardless of
// DATA_SOURCE.
function notImplemented(name) {
  return () => {
    throw new Error(`Diese Funktion ist im api-Modus noch nicht verfügbar: ${name}`);
  };
}

// Builds the same nested { id, name, parentId, children } tree shape as
// sqlRepository.js's getFolderTree(), from getFolders()'s flat list (which
// already normalizes parentId to null for root, matching rowToFolder there).
async function getFolderTree() {
  const all = await getFolders();
  const byParent = (parentId) =>
    all
      .filter((f) => f.parentId === parentId)
      .map((f) => ({ ...f, children: byParent(f.id) }));
  return byParent(null);
}

// No single-folder endpoint in the API (see docs/MAIRLISTDB-API.md) —
// getFolders() already fetches the complete 155-folder tree in one
// request, so look the id up in that flat list rather than adding a
// second round-trip.
async function getFolderById(id) {
  const all = await getFolders();
  return all.find((f) => String(f.id) === String(id)) ?? null;
}
const createFolder = notImplemented("createFolder");
const renameFolder = notImplemented("renameFolder");
const moveFolder = notImplemented("moveFolder");
const deleteFolder = notImplemented("deleteFolder");

// The functions below are loaded alongside getFolderTree() by the
// frontend (Playlist.jsx, DatabaseManager.jsx), sometimes inside the same
// Promise.all as the tree fetch — if any of them threw (as
// notImplemented() did), the whole batch rejected and the sidebar tree
// never rendered even though /api/tree itself had already succeeded.
// Returning an empty result of the *correct shape* (matching
// sqlRepository.js's return type for the same function — array vs.
// object — exactly, since the frontend spreads/iterates these) keeps
// that batch resolving; these have no equivalent single-shot endpoint in
// the mAirListDB Server API (see docs/MAIRLISTDB-API.md), so an empty
// result is the honest answer rather than a guess.
// Deliberately synchronous (not async/Promise-returning): the routes that
// call these (GET /api/storages, /api/types, /api/attributes, /api/items,
// /api/folders/:id/children in server/routes/library.js) do
// `res.json(repo.getX())` without awaiting, matching sqlRepository.js's
// synchronous functions of the same name. An async stub here would hand
// res.json() an unresolved Promise (serializes to `{}`), which is what
// broke DatabaseManager.jsx's `[...items]` spread in api-mode — items
// arrived as `{}` instead of `[]`, and `{}` isn't iterable.
const warnedOnce = new Set();
function emptyStub(name, emptyValue) {
  return () => {
    if (!warnedOnce.has(name)) {
      warnedOnce.add(name);
      console.warn(`[apiRepository] ${name}() ist im api-Modus noch nicht implementiert, liefert leeren Wert`);
    }
    // Return a fresh deep copy each call so callers can't mutate shared
    // state (emptyValue's array-valued properties, e.g. { folders: [],
    // items: [] }, would otherwise be the same array instance every call).
    return structuredClone(emptyValue);
  };
}

// sqlRepository.js: getFolderChildren(id) -> { folders: [], items: [] }.
// Direct (non-recursive) subfolders come from filtering the same
// getFolders() list getFolderById() uses; items come from the already
// existing getItemsByFolder(id).
async function getFolderChildren(id) {
  const all = await getFolders();
  const folders = all.filter((f) => String(f.parentId) === String(id));
  const items = await getItemsByFolder(id);
  return { folders, items };
}
const getStorages = emptyStub("getStorages", []);
const createStorage = notImplemented("createStorage");
const updateStorage = notImplemented("updateStorage");
const deleteStorage = notImplemented("deleteStorage");
const getItemTypes = emptyStub("getItemTypes", []);
const getAttributeKeys = emptyStub("getAttributeKeys", []);
const searchItems = notImplemented("searchItems");
const getCuePoints = notImplemented("getCuePoints");
const getAttributeDefinitions = notImplemented("getAttributeDefinitions");
const moveItemToFolder = notImplemented("moveItemToFolder");
const uploadFile = notImplemented("uploadFile");
const resolveAudioPath = notImplemented("resolveAudioPath");
const getLogs = notImplemented("getLogs");
const getDashboardStats = notImplemented("getDashboardStats");
const getRecentLogs = notImplemented("getRecentLogs");
const getTodayPlaylist = notImplemented("getTodayPlaylist");

module.exports = {
  ApiNotFoundError,
  ApiUnreachableError,
  mapApiItemToInternal,
  mapInternalItemToApi,
  getFolders,
  getItemsByFolder,
  getItemById,
  getItemsByIds,
  getItemFolders,
  getItemRestrictions,
  getItemHistory,
  getAudioStreamUrl,
  getAudioStream,
  updateItem,
  createItem,
  deleteItem,
  getPlaylistHour,
  getPlaylistAttributes,
  writeHour,
  getPermissions,
  getCapabilities,
  getArtists,
  getTitles,
  getFolderTree,
  getFolderById,
  getFolderChildren,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  getStorages,
  createStorage,
  updateStorage,
  deleteStorage,
  getItemTypes,
  getAttributeKeys,
  getItems,
  searchItems,
  getCuePoints,
  getAttributeDefinitions,
  moveItemToFolder,
  uploadFile,
  resolveAudioPath,
  getPlaylistsByDate,
  getPlaylistById,
  reorderPlaylist,
  insertPlaylistItem,
  removePlaylistItem,
  savePlaylistItemOverrides,
  getLogs,
  getDashboardStats,
  getRecentLogs,
  getTodayPlaylist,
};
