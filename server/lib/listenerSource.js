// Hörerzahl-Quelle: laut.fm oder eine benutzerdefinierte JSON-URL.
// Ergebnis wird kurz zwischengespeichert, damit häufige Dashboard-Polls
// nicht bei jedem Request die externe Quelle neu abfragen.

const dns = require("dns").promises;

const CACHE_TTL_MS = 30 * 1000;
const FETCH_TIMEOUT_MS = 5000;

let cache = { key: null, value: null, expiresAt: 0 };

// SSRF-Schutz: die custom-URL kommt aus den Settings und wuerde den Server
// sonst beliebige interne Adressen abfragen lassen (Cloud-Metadata,
// Nachbardienste im LAN). Geprueft wird die aufgeloeste IP, nicht der
// Hostname - sonst genuegt ein Name, der auf 127.0.0.1 zeigt.
function isBlockedIp(ip) {
  const v4 = ip.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // inkl. 169.254.169.254
    return false;
  }
  const v6 = ip.toLowerCase().split("%")[0];
  if (v6 === "::1" || v6 === "::") return true;
  if (/^f[cd]/.test(v6)) return true; // unique local
  if (/^fe[89ab]/.test(v6)) return true; // link local
  return false;
}

async function assertUrlAllowed(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL nicht erlaubt (ungültige Adresse)");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL nicht erlaubt (nur http und https)");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (/\.local$/i.test(hostname) || /^localhost$/i.test(hostname)) {
    throw new Error("URL nicht erlaubt (interne Adressen sind gesperrt)");
  }
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("URL nicht erlaubt (Hostname nicht auflösbar)");
  }
  if (addresses.some((a) => isBlockedIp(a.address))) {
    throw new Error("URL nicht erlaubt (interne Adressen sind gesperrt)");
  }
}

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
      await assertUrlAllowed(url);
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
