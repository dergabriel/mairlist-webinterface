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

  return {
    id: String(apiItem.DatabaseID),
    internalId: Number(apiItem.DatabaseID),
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

async function getItemById(id) {
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
  return list.map(mapApiItemToInternal);
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

async function getItemRestrictions(itemId) {
  return apiRequest("GET", `/api/v1/items/${encodeURIComponent(itemId)}/restrictions`);
}

async function getItemHistory(itemId) {
  return apiRequest("GET", `/api/v1/items/${encodeURIComponent(itemId)}/history`);
}

// ---- playlists ----

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

async function getArtists(searchTerm) {
  const data = await apiRequest("GET", "/api/v1/items", {
    rawFlags: ["artists"],
    query: searchTerm ? { q: searchTerm } : {},
  });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Artists)) return data.Artists;
  // TODO: unexpected shape (likely still full item objects) — `time`
  // format remains unconfirmed, see comment above.
  return data;
}

async function getTitles(searchTerm) {
  const data = await apiRequest("GET", "/api/v1/items", {
    rawFlags: ["titles"],
    query: searchTerm ? { q: searchTerm } : {},
  });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Titles)) return data.Titles;
  // TODO: unexpected shape (likely still full item objects) — `time`
  // format remains unconfirmed, see comment above.
  return data;
}

module.exports = {
  ApiNotFoundError,
  ApiUnreachableError,
  mapApiItemToInternal,
  getFolders,
  getItemsByFolder,
  getItemById,
  getItemsByIds,
  getItemFolders,
  getItemRestrictions,
  getItemHistory,
  getPlaylistHour,
  getPlaylistAttributes,
  getPermissions,
  getCapabilities,
  getArtists,
  getTitles,
};
