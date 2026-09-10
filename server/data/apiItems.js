// ---- items ----
//
// Item field mapping (API PascalCase <-> internal camelCase), items
// CRUD/search, item-folder assignment, item history, attribute schema
// (from /api/v1/config's StandardAttributes XML), and artists/titles
// distinct-value search — everything keyed off /api/v1/items and the
// item shape itself.

const { apiRequest, STATION, ApiNotFoundError, warnedOnce, warnOnceUnexpectedShape, notImplemented } = require("./apiClient");
const { CUE_TO_DB, DB_TO_CUE, typeToCode } = require("./shared");
const { getFolders } = require("./apiFolders");
const { resolveStorageFile } = require("./apiAudio");

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
// Whether an item is a container can NOT be read reliably off Type — e.g.
// the news container's Type is "News", indistinguishable from a plain news
// item by Type alone. Class is the only reliable signal: container classes
// all end in "Container" or "ContainerMarker" (Container, HookContainer,
// AutoHookContainer, NewsContainer, RegionContainer, AutoHookContainerMarker,
// ...). mapInternalItemToApi's round-trip only ever needs to distinguish
// "Container" from "File" on write, so the raw Class string is preserved
// here (not collapsed to a boolean) for the frontend to key its container
// styling off of.
function isContainerClass(apiClass) {
  return /(?:Container|ContainerMarker)$/.test(apiClass || "");
}

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
    containerType: isContainerClass(apiItem.Class) ? apiItem.Class : null,
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
    Class: isContainerClass(internalItem.containerType) ? internalItem.containerType : "File",
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

// GET /api/v1/items?search=<term>&fields=All&limit=<n>&station=<n> —
// verified via Wireshark (see docs/MAIRLISTDB-API.md). Response is the
// same extended item shape as ?folder=<id> (Folders/NextUse/LastUse/
// LastPlayed/EffectiveDuration included), so it's mapped the same way.
// No folder field is echoed back (the search spans the whole library),
// so folderId stays null here — same as getItemById/getItemsByIds.
//
// sqlRepository.js's searchItems(query, opts) accepts opts.fields to
// restrict the match to a subset of ["title", "artist", "comment"]; the
// API's `fields` parameter isn't documented to support that (only "All"
// has been observed), so a requested field restriction is reproduced
// client-side on top of the server's full-text results. `comment` is
// never populated by mapApiItemToInternal() (the API doesn't expose it),
// so restricting to just "comment" always yields an empty result here —
// consistent with there being no comment data to match against.
async function searchItems(query, opts = {}) {
  if (!query || query.trim() === "") return [];

  const limit = opts.limit || 50;
  const data = await apiRequest("GET", "/api/v1/items", {
    query: { search: query, fields: "All", limit },
  });
  const list = Array.isArray(data) ? data : data?.Items || [];
  let result = list.map((apiItem) => mapApiItemToInternal(apiItem, null));

  if (opts.fields) {
    const validFields = opts.fields.filter((f) => ["title", "artist", "comment"].includes(f));
    if (validFields.length === 0) return [];
    const q = query.toLowerCase();
    result = result.filter((item) =>
      validFields.some((f) => String(item[f] || "").toLowerCase().includes(q))
    );
  }

  return result;
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

// POST /api/v1/items?station=1 — VERIFIZIERT live gegen den mAirListDB
// Server (siehe docs/MAIRLISTDB-API.md): Pflichtfelder sind Class (ohne
// -> "Invalid playlist item class") und Filename (ohne -> "Invalid
// location type"); die Response ist ein nackter JSON-String mit der
// neuen Item-ID (z. B. "2634"), kein Objekt.
//
// mapInternalItemToApi() liefert bereits Class ("File"/"Container" via
// containerType) und Filename (aus relativePath), also reicht es, das
// interne Item durch dieselbe Mapping-Funktion wie updateItem/
// insertPlaylistItem zu schicken. DatabaseID wird dabei mitgeschickt
// (String(undefined) = "undefined"), ist beim Anlegen aber irrelevant —
// der Server vergibt ohnehin eine neue ID und ignoriert das Feld
// offenbar (bestätigt durch den Live-Test).
//
// Eine mitgegebene folderId wird nach dem Anlegen per
// assignItemsToFolder() nachgezogen (separater POST, siehe dort).
async function createItem(data = {}) {
  const apiItem = mapInternalItemToApi({
    ...data,
    containerType: data.containerType ?? null,
  });
  if (!apiItem.Filename) {
    throw new Error("createItem: relativePath (Filename) ist erforderlich");
  }

  const newId = await apiRequest("POST", "/api/v1/items", { body: apiItem });

  // Das Item existiert an dieser Stelle bereits — schlägt nur die
  // Ordner-Zuordnung fehl, wäre es falsch, den ganzen Aufruf scheitern zu
  // lassen (der Aufrufer würde das angelegte Item sonst nie zu sehen
  // bekommen und es bliebe verwaist zurück). Also loggen und mit dem
  // ordnerlosen Item weitermachen.
  if (data.folderId != null && data.folderId !== "") {
    try {
      await assignItemsToFolder(data.folderId, [newId]);
    } catch (err) {
      console.error(
        `createItem: Item ${newId} wurde angelegt, die Zuordnung zu Ordner ${data.folderId} ist aber fehlgeschlagen: ${err.message}`
      );
    }
  }

  return getItemById(String(newId));
}

// POST /api/v1/folders/<folderId>/items — VERIFIZIERT per
// Wireshark-Mitschnitt des offiziellen Clients (siehe
// docs/MAIRLISTDB-API.md, "POST-Endpunkte (form-urlencoded)"):
//
//   Content-Type: application/x-www-form-urlencoded
//   Body:         add&station=1&$doc=<urlencodiertes JSON-Array von IDs>
//
// `add` ist ein NACKTES Flag ohne Wert und zwingend erforderlich (fehlt
// es, antwortet der Server mit "Invalid operation"). `$doc` ist ein
// JSON-Array von ID-Strings, nicht eine einzelne ID — mehrere Items
// lassen sich also in einem Request zuordnen. application/json wird von
// diesem Endpunkt abgelehnt. Response: `null` bei Status 200.
async function assignItemsToFolder(folderId, itemIds) {
  const ids = (Array.isArray(itemIds) ? itemIds : [itemIds])
    .filter((id) => id != null && id !== "")
    .map((id) => String(id));
  if (ids.length === 0) return null;

  // Der Body wird von Hand gebaut statt per URLSearchParams: das nackte
  // `add`-Flag lässt sich damit nicht ausdrücken (set(k, "") wird immer
  // als `k=` serialisiert).
  const formBody = `add&station=${encodeURIComponent(STATION)}&$doc=${encodeURIComponent(JSON.stringify(ids))}`;

  // station steckt bereits im Body (so macht es auch der offizielle
  // Client), deshalb withStation: false — sonst stünde es doppelt im
  // Request.
  return apiRequest("POST", `/api/v1/folders/${encodeURIComponent(folderId)}/items`, {
    formBody,
    withStation: false,
  });
}

// POST /api/v1/folders/<folderId>/items mit `delete`-Flag — VERIFIZIERT
// per Wireshark-Mitschnitt des offiziellen Clients:
//
//   delete&station=1&$doc=["2639"]
//
// Gegenstück zu assignItemsToFolder(): entfernt die Items *aus diesem
// einen Ordner*, ohne sie zu löschen — die Zuordnung zu anderen Ordnern
// bleibt bestehen. `delete` ist wie `add` ein NACKTES Flag ohne Wert.
// Response: `null` bei Status 200.
async function removeItemFromFolder(folderId, itemIds) {
  const ids = (Array.isArray(itemIds) ? itemIds : [itemIds])
    .filter((id) => id != null && id !== "")
    .map((id) => String(id));
  if (ids.length === 0) return null;

  // Handgebauter Body wie in assignItemsToFolder(): das nackte
  // `delete`-Flag lässt sich mit URLSearchParams nicht ausdrücken.
  const formBody = `delete&station=${encodeURIComponent(STATION)}&$doc=${encodeURIComponent(JSON.stringify(ids))}`;

  return apiRequest("POST", `/api/v1/folders/${encodeURIComponent(folderId)}/items`, {
    formBody,
    withStation: false,
  });
}

// PUT /api/v1/items/<itemId>/folders — VERIFIZIERT per
// Wireshark-Mitschnitt des offiziellen Clients:
//
//   station=1&$doc=["5","189","7"]
//
// Setzt die KOMPLETTE Ordner-Zugehörigkeit eines Items in einem Request
// und ersetzt die bisherige Zuordnung vollständig. Kein Operations-Flag
// (anders als bei POST /folders/<id>/items) — der Endpunkt kennt nur
// "ersetzen". Ein leeres Array entfernt das Item aus allen Ordnern.
//
// Das ist die sauberste Operation für Ordner-Zugehörigkeit: idempotent
// und ohne Zwischenzustand, in dem das Item in zu vielen oder zu wenigen
// Ordnern liegt.
async function setItemFolders(itemId, folderIds) {
  const ids = (Array.isArray(folderIds) ? folderIds : [folderIds])
    .filter((id) => id != null && id !== "")
    .map((id) => String(id));

  const formBody = `station=${encodeURIComponent(STATION)}&$doc=${encodeURIComponent(JSON.stringify(ids))}`;

  return apiRequest("PUT", `/api/v1/items/${encodeURIComponent(itemId)}/folders`, {
    formBody,
    withStation: false,
  });
}

// Spiegelt sqlRepository.js's moveItemToFolder(id, folderId): dort löscht
// writeFolder() *alle* item_folders-Zeilen des Items und legt genau eine
// neue an (bzw. keine, wenn folderId null ist). Die Signatur hat bewusst
// keine sourceFolderId — auch der Aufruf aus routes/library.js und dem
// Frontend (Drag & Drop auf einen Ordner) kennt nur das Ziel.
//
// Deshalb wird hier PUT /api/v1/items/<id>/folders (setItemFolders)
// verwendet und NICHT das ebenfalls verifizierte `movefrom`-Flag von
// POST /folders/<id>/items:
//
//   - `movefrom=<quelle>` verschiebt nur aus EINEM Quellordner. Liegt das
//     Item in mehreren Ordnern, bliebe es in den übrigen liegen — das
//     widerspricht der Semantik des SQL-Pendants, das die Zuordnung
//     komplett ersetzt. Ein Nachbauen über getItemFolders() + je einen
//     Request pro Quellordner wäre zudem nicht atomar: bricht es in der
//     Mitte ab, liegt das Item in einer beliebigen Teilmenge der Ordner.
//   - PUT /items/<id>/folders setzt die Zugehörigkeit in einem einzigen,
//     idempotenten Request — kein Zwischenzustand, kein Vorab-Lesen.
//
// folderId == null entfernt das Item aus allen Ordnern (leeres $doc),
// analog zu writeFolder(wdb, id, null).
async function moveItemToFolder(id, folderId) {
  const item = await getItemById(id);
  if (!item) return null;

  await setItemFolders(id, folderId == null || folderId === "" ? [] : [folderId]);

  return getItemById(id);
}

// DELETE /api/v1/items/<id>?station=1 — VERIFIZIERT live gegen den
// mAirListDB Server (siehe docs/MAIRLISTDB-API.md): Response ist `null`
// bei Status 200.
async function deleteItem(id) {
  try {
    await apiRequest("DELETE", `/api/v1/items/${encodeURIComponent(id)}`);
    return true;
  } catch (err) {
    if (err instanceof ApiNotFoundError) return false;
    throw err;
  }
}

async function getItemRestrictions(itemId) {
  return apiRequest("GET", `/api/v1/items/${encodeURIComponent(itemId)}/restrictions`);
}

// Maps the API's history entries (PascalCase: Time, Duration, Studio,
// ListenersStart, ListenersStop, PlaybackID) to the { playedAt, show,
// moderator } shape the frontend's history tab actually reads (see
// ItemEditor.jsx's history table: entry.playedAt/entry.show/entry.moderator).
// sqlRepository.js's getItemHistory() returns { slot, date, hour } instead,
// which that same table doesn't read — a pre-existing mismatch in the
// sqlite path, left alone here (out of scope, and sqlRepository.js must not
// be touched). Time is an ISO timestamp ("2026-04-30T22:31:19") and maps
// directly to playedAt. The API has no per-entry show/moderator field —
// Studio is the closest concept but isn't an "airing show"/host either, so
// both stay null rather than guessing; the table already renders "-" for
// falsy values.
function mapApiHistoryEntry(entry) {
  if (!entry?.Time) return null;
  return { playedAt: entry.Time, show: null, moderator: null };
}

async function getItemHistory(itemId) {
  const data = await apiRequest("GET", `/api/v1/items/${encodeURIComponent(itemId)}/history`);
  if (!Array.isArray(data)) return [];
  return data.map(mapApiHistoryEntry).filter(Boolean);
}

// ---- attribute keys (from /api/v1/config's StandardAttributes XML) ----
//
// The API has no dedicated attribute-schema endpoint, but /api/v1/config's
// StandardAttributes field carries exactly this information as an XML
// string (see docs/MAIRLISTDB-API.md): one <StandardAttribute Name="..."
// Kind="DropDown|Check"?> per attribute, each optionally with a nested
// <Values><Value>...</Value></Values> list.
//
// Deliberately regex-based rather than a real XML parser: the project has
// no XML dependency yet (grepped package.json — none present), and this
// format is narrow and stable (attribute-defining tags only, no nesting
// beyond one Values level, no namespaces/CDATA/entities to worry about).
// Pulling in a parser dependency for one field wasn't worth it without
// checking with the user first; a small targeted extraction is safer than
// guessing at a library choice.
const STANDARD_ATTRIBUTE_RE = /<StandardAttribute\s+Name="([^"]*)"[^>]*?(\/>|>([\s\S]*?)<\/StandardAttribute>)/g;
const VALUE_RE = /<Value>([^<]*)<\/Value>/g;

function parseStandardAttributesXml(xml) {
  if (!xml) return [];
  const result = [];
  let match;
  STANDARD_ATTRIBUTE_RE.lastIndex = 0;
  while ((match = STANDARD_ATTRIBUTE_RE.exec(xml))) {
    const name = match[1];
    const inner = match[3] || "";
    const values = [];
    let valueMatch;
    VALUE_RE.lastIndex = 0;
    while ((valueMatch = VALUE_RE.exec(inner))) {
      values.push(valueMatch[1]);
    }
    if (name) result.push({ key: name, values });
  }
  return result;
}

async function getConfig() {
  return apiRequest("GET", "/api/v1/config");
}

// Mirrors sqlRepository.js's getAttributeKeys() -> [{ key, values }]. Unlike
// the SQL version (which derives `values` from actually-observed item
// attribute values), `values` here comes from the config schema's
// Kind="DropDown"/"Check" <Values> list where present — free-text
// attributes (no Kind) have no enumerable values and get values: [].
async function getAttributeKeys() {
  const config = await getConfig();
  return parseStandardAttributesXml(config?.StandardAttributes);
}

// Same StandardAttributes XML as getAttributeKeys, but reparsed to keep the
// Kind attribute (dropped by parseStandardAttributesXml) and mapped to the
// { key, label, type, options } shape sqlRepository.js's getAttributeDefinitions()
// returns (ATTRIBUTE_DEFINITIONS in mockData.js), which the Item Editor's
// Attribute tab expects: DropDown -> select, Check -> checkbox, no Kind ->
// free-text.
function mapStandardAttributeKind(kind) {
  if (kind === "DropDown") return "select";
  if (kind === "Check") return "checkbox";
  return "text";
}

function parseStandardAttributeDefinitionsXml(xml) {
  if (!xml) return [];
  const result = [];
  let match;
  STANDARD_ATTRIBUTE_RE.lastIndex = 0;
  while ((match = STANDARD_ATTRIBUTE_RE.exec(xml))) {
    const name = match[1];
    if (!name) continue;
    const attrsStr = match[0];
    const kindMatch = /\bKind="([^"]*)"/.exec(attrsStr.slice(0, attrsStr.indexOf(">") + 1));
    const kind = kindMatch ? kindMatch[1] : null;
    const inner = match[3] || "";
    const values = [];
    let valueMatch;
    VALUE_RE.lastIndex = 0;
    while ((valueMatch = VALUE_RE.exec(inner))) {
      values.push(valueMatch[1]);
    }
    const type = mapStandardAttributeKind(kind);
    result.push({
      key: name,
      label: name,
      type,
      ...(type === "select" || type === "checkbox" ? { options: values } : {}),
    });
  }
  return result;
}

async function getAttributeDefinitions() {
  const config = await getConfig();
  return parseStandardAttributeDefinitionsXml(config?.StandardAttributes);
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

// No /api/v1/itemtypes (or similar) endpoint documented or observed, and
// /api/v1/config has no item-type field either (only StandardAttributes,
// used by getAttributeKeys above). sqlRepository.js's getItemTypes() derives
// its list from `SELECT DISTINCT type, COUNT(*) ... GROUP BY type` over the
// full items table — the API has no equivalent whole-library scan (GET
// /api/v1/items always requires folder=<id> or ids=<id,...>, see docs), so
// getting real counts is impossible without walking all ~155 folders.
//
// Instead of an empty stub, this returns a hardcoded list built from live
// queries of the actual database. Keys are lowercased via typeToCode() to
// match the format item.type already uses (see mapApiItemToInternal above)
// and what updateItem's Type round-trip expects
// (`safe.type.charAt(0).toUpperCase() + ...`).
//
// Verified: 24 of the 27 types in the mAirList client dropdown (test items
// created per type, DB value read back via GET /api/v1/items/<id>). Not
// verified (not present in this install): Cartwall page, Custom 1-3. See
// "Item-Typen (Type-Feld)" in docs/MAIRLISTDB-API.md for the full table and
// the Container/Class caveat — Container is not a Type value, it's a
// separate concept keyed off the Class field.
const VERIFIED_ITEM_TYPES = [
  { db: "Music", label: "Musik" },
  { db: "Voice", label: "Moderation" },
  { db: "News", label: "Nachrichten" },
  { db: "Weather", label: "Wetter" },
  { db: "Traffic", label: "Verkehr" },
  { db: "Advertising", label: "Werbung" },
  { db: "Package", label: "Beitrag" },
  { db: "Jingle", label: "Jingle" },
  { db: "Sweeper", label: "Sweeper" },
  { db: "Drop", label: "Drop" },
  { db: "Trailer", label: "Trailer" },
  { db: "Promo", label: "Promo" },
  { db: "Sponsorship", label: "Sponsor-Jingle" },
  { db: "StationID", label: "Station-ID" },
  { db: "Bed", label: "Bett" },
  { db: "Instrumental", label: "Instrumental" },
  { db: "Show", label: "Sendung" },
  { db: "Stream", label: "Stream" },
  { db: "Playlist", label: "Playlist" },
  { db: "Command", label: "Befehl" },
  { db: "Break", label: "Unterbrechung" },
  { db: "Silence", label: "Stille" },
  { db: "Error", label: "Fehler" },
  { db: "Other", label: "Andere" },
  { db: "Dummy", label: "Platzhalter" },
];
function getItemTypes() {
  return VERIFIED_ITEM_TYPES.map((t) => ({
    key: typeToCode(t.db),
    label: t.label,
    hasItems: true,
    note: "",
  }));
}

const getCuePoints = notImplemented("getCuePoints");
const uploadFile = notImplemented("uploadFile");

module.exports = {
  mapMarkersToInternal,
  mapApiItemToInternal,
  mapMarkersToApi,
  mapInternalItemToApi,
  getItemsByFolder,
  getItems,
  getItemById,
  getItemsByIds,
  searchItems,
  getItemFolders,
  updateItem,
  createItem,
  assignItemsToFolder,
  removeItemFromFolder,
  setItemFolders,
  moveItemToFolder,
  deleteItem,
  getItemRestrictions,
  getItemHistory,
  getConfig,
  getAttributeKeys,
  getAttributeDefinitions,
  getArtists,
  getTitles,
  getItemTypes,
  getCuePoints,
  uploadFile,
};
