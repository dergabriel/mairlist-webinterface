// Hörerzahl-Quelle: laut.fm oder eine benutzerdefinierte JSON-URL.
// Ergebnis wird kurz zwischengespeichert, damit häufige Dashboard-Polls
// nicht bei jedem Request die externe Quelle neu abfragen.

const CACHE_TTL_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 5000;

let cache = { key: null, value: null, expiresAt: 0 };

function readPath(obj, pathStr) {
  const parts = pathStr.split(".").filter(Boolean);
  let value = obj;
  for (const part of parts) {
    if (value == null || typeof value !== "object") return undefined;
    value = value[part];
  }
  return value;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// getListenerCount(settings) -> { available: true, count } oder { available: false, error? }
async function getListenerCount(settings) {
  const source = settings.listenerSource || "none";
  if (source === "none") return { available: false };

  const cacheKey = source === "lautfm" ? `lautfm:${settings.lautfmStation}` : `custom:${settings.listenerUrl}:${settings.listenerJsonPath}`;
  if (cache.key === cacheKey && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  let result;
  try {
    if (source === "lautfm") {
      const station = (settings.lautfmStation || "").trim();
      if (!station) return { available: false, error: "Kein Stationsname hinterlegt" };
      const data = await fetchJson(`https://api.laut.fm/station/${encodeURIComponent(station)}`);
      const count = Number(data?.current_listeners);
      if (!Number.isFinite(count)) throw new Error("Antwort enthält keine gültige Hörerzahl");
      result = { available: true, count };
    } else if (source === "custom") {
      const url = (settings.listenerUrl || "").trim();
      const jsonPath = (settings.listenerJsonPath || "").trim();
      if (!url || !jsonPath) return { available: false, error: "URL oder JSON-Pfad fehlt" };
      const data = await fetchJson(url);
      const count = Number(readPath(data, jsonPath));
      if (!Number.isFinite(count)) throw new Error("Antwort enthält keine gültige Hörerzahl unter diesem Pfad");
      result = { available: true, count };
    } else {
      result = { available: false };
    }
  } catch (e) {
    result = { available: false, error: e.message };
  }

  cache = { key: cacheKey, value: result, expiresAt: Date.now() + CACHE_TTL_MS };
  return result;
}

module.exports = { getListenerCount };
