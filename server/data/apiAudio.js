// ---- audio streaming ----
//
// Storages/Audio-Dateien (see docs/MAIRLISTDB-API.md): audio bytes live at
// GET /api/v1/storages/<storageId>/files/<filename>?quality=default|low.
// mapApiItemToInternal() doesn't populate storageId (the API has no such
// field on the item itself) — instead the full "/storages/<id>/files/<name>"
// path is stored in relativePath (from the API's Filename field). Parse it
// back out here rather than relying on item.storageId.
//
// getAudioStream() deliberately does its own fetch() rather than going
// through apiClient's apiRequest(): it needs the raw response (binary body,
// content-type header) rather than apiRequest()'s JSON-decoded result, and
// isn't part of the "database is locked" contention apiRequest()'s retry
// logic targets (it hits the storage/file layer, not the SQLite-backed
// item/folder/playlist endpoints) — so it stays outside the concurrency
// limiter and retry queue on purpose.

const { BASE_URL, REQUEST_TIMEOUT_MS, authHeader, ApiNotFoundError, ApiUnreachableError } = require("./apiClient");

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

module.exports = {
  resolveStorageFile,
  getAudioStreamUrl,
  getAudioStream,
};
