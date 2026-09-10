// Shared HTTP client for the mAirListDB Server REST API: base config,
// concurrency limiter, retry-on-lock, auth, error types, and the central
// apiRequest() helper. Every other apiXxx.js module in this directory goes
// through apiRequest() here for JSON requests — nothing bypasses the
// concurrency limiter or retry logic except apiAudio.js's binary streaming
// fetch, which deliberately has its own handling (see there).

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
//
// `body` is sent as JSON. Some POST endpoints require
// application/x-www-form-urlencoded instead (see docs/MAIRLISTDB-API.md,
// "POST-Endpunkte (form-urlencoded)"); those pass `formBody` — an already
// encoded body string — instead of `body`. Both go through the same
// concurrency limiter and retry logic here; nothing bypasses apiRequest().
async function apiRequest(method, path, { query = {}, rawFlags = [], body, formBody, withStation = true } = {}) {
  return withConcurrencyLimit(() =>
    withRetry(() => doApiRequest(method, path, { query, rawFlags, body, formBody, withStation }))
  );
}

async function doApiRequest(method, path, { query = {}, rawFlags = [], body, formBody, withStation = true } = {}) {
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
        ...(formBody !== undefined
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
      },
      body: formBody !== undefined ? formBody : body !== undefined ? JSON.stringify(body) : undefined,
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

// Small one-time-warning helper shared by several apiXxx.js modules for
// "response had an unexpected shape, returning an empty array/value
// instead of crashing the caller" cases (getStorages, getArtists,
// getTitles, ...). Also backs emptyStub() below (same warnedOnce set, keyed
// by plain function name there instead of "<name>:unexpected-shape").
const warnedOnce = new Set();
function warnOnceUnexpectedShape(name) {
  const key = `${name}:unexpected-shape`;
  if (!warnedOnce.has(key)) {
    warnedOnce.add(key);
    console.warn(`[apiRepository] ${name}(): unerwartetes Antwortformat vom Server, liefert leeres Array`);
  }
}

// ---- stubs for endpoints the mAirListDB Server API has no counterpart
// for ----
//
// Named stubs (rather than a generic proxy) so each throws with the
// actual function name, and so library.js can call `repo.<name>()` the
// same way regardless of DATA_SOURCE.
function notImplemented(name) {
  return () => {
    throw new Error(`Diese Funktion ist im api-Modus noch nicht verfügbar: ${name}`);
  };
}

// Some callers (see getFolderChildren/getStorages/getItemTypes callers in
// the frontend) load several of these alongside real data in the same
// Promise.all — if any of them threw (as notImplemented() did), the whole
// batch rejected even though the real data had already loaded fine.
// Returning an empty result of the *correct shape* (matching
// sqlRepository.js's return type for the same function exactly, since the
// frontend spreads/iterates these) keeps that batch resolving.
// Deliberately synchronous (not async/Promise-returning) where the caller
// expects that — see individual usages.
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

module.exports = {
  BASE_URL,
  STATION,
  REQUEST_TIMEOUT_MS,
  apiRequest,
  authHeader,
  DatabaseLockedError,
  ApiNotFoundError,
  ApiUnreachableError,
  warnedOnce,
  warnOnceUnexpectedShape,
  notImplemented,
  emptyStub,
};
