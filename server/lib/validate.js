// Kleine Eingabepruefungen fuer die Route-Handler. Bewusst ohne zusaetzliche
// Dependency (kein joi/zod) und bewusst grosszuegig: die Pruefungen sollen
// kaputte Anfragen mit einem sauberen 400 abfangen, nicht legitime Aufrufe
// des Frontends aussperren.
//
// Konvention: jede Funktion gibt bei Erfolg den (ggf. normalisierten) Wert
// zurueck und wirft sonst einen ValidationError. Die Handler fangen das
// zentral ueber den Error-Handler bzw. wrapValidation() ab.

// Freitext wird auf diese Laenge begrenzt, damit niemand ein Megabyte
// durch die Repository-Schicht schiebt.
const MAX_TEXT_LENGTH = 500;

// IDs sind je nach Backend numerisch (mock/sqlite) oder ein String
// (mAirListDB-API). Deshalb wird hier bewusst NUR auf "vorhanden und
// plausibel kurz" geprueft und kein Format erzwungen.
const MAX_ID_LENGTH = 200;

const PLAYLIST_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
  }
}

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

// ---- IDs ----

// Pflicht-ID (z.B. req.params.id). Erlaubt Zahlen und Strings, lehnt nur
// Leeres, Objekte/Arrays und absurd lange Werte ab.
function requireId(value, label = "id") {
  if (isMissing(value)) throw new ValidationError(`${label} ist erforderlich`);
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ValidationError(`${label} ist ungültig`);
  }
  const str = String(value).trim();
  if (!str) throw new ValidationError(`${label} ist erforderlich`);
  if (str.length > MAX_ID_LENGTH) throw new ValidationError(`${label} ist ungültig`);
  return str;
}

// Optionale ID (z.B. ?folderId= oder body.parentId). Fehlt der Wert, ist das
// in Ordnung - dann kommt undefined zurueck.
function optionalId(value, label = "id") {
  if (isMissing(value)) return undefined;
  return requireId(value, label);
}

// ---- Datum / Playlist-ID ----

function requireDate(value, label = "date") {
  if (isMissing(value)) throw new ValidationError(`${label} ist erforderlich`);
  if (typeof value !== "string" || !DATE_RE.test(value)) {
    throw new ValidationError(`${label} muss im Format YYYY-MM-DD sein`);
  }
  return value;
}

function optionalDate(value, label = "date") {
  if (isMissing(value)) return undefined;
  return requireDate(value, label);
}

function requirePlaylistId(value, label = "Playlist-ID") {
  if (isMissing(value)) throw new ValidationError(`${label} ist erforderlich`);
  if (typeof value !== "string" || !PLAYLIST_ID_RE.test(value)) {
    throw new ValidationError(`${label} muss im Format YYYY-MM-DD-HH sein`);
  }
  return value;
}

// ---- Zahlen ----

// Ganzzahl >= 0 mit Obergrenze. Fehlt der Wert, wird fallback geliefert.
function optionalCount(value, label, { fallback, max }) {
  if (isMissing(value)) return fallback;
  const num = Number(value);
  if (!Number.isInteger(num)) throw new ValidationError(`${label} muss eine ganze Zahl sein`);
  if (num < 0) throw new ValidationError(`${label} darf nicht negativ sein`);
  if (max !== undefined && num > max) {
    throw new ValidationError(`${label} darf höchstens ${max} sein`);
  }
  return num;
}

// Positionen in Playlists sind 1-basierte Ganzzahlen.
function requirePosition(value, label = "position") {
  if (isMissing(value)) throw new ValidationError(`${label} ist erforderlich`);
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw new ValidationError(`${label} muss eine positive ganze Zahl sein`);
  }
  return num;
}

// ---- Text ----

function requireText(value, label, { maxLength = MAX_TEXT_LENGTH } = {}) {
  if (typeof value !== "string") throw new ValidationError(`${label} ist erforderlich`);
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(`${label} ist erforderlich`);
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${label} darf höchstens ${maxLength} Zeichen lang sein`);
  }
  return trimmed;
}

function optionalText(value, label, { maxLength = MAX_TEXT_LENGTH } = {}) {
  if (isMissing(value)) return undefined;
  if (typeof value !== "string") throw new ValidationError(`${label} ist ungültig`);
  if (value.length > maxLength) {
    throw new ValidationError(`${label} darf höchstens ${maxLength} Zeichen lang sein`);
  }
  return value;
}

// ---- Objekte ----

// Stellt sicher, dass ein Body ueberhaupt ein Objekt ist, bevor darauf
// zugegriffen wird. Arrays gelten hier nicht als Objekt.
function requireObject(value, label = "Body") {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${label} muss ein Objekt sein`);
  }
  return value;
}

function optionalObject(value, label) {
  if (isMissing(value)) return undefined;
  return requireObject(value, label);
}

// Array von IDs (z.B. Container-Inhalt neu setzen). Jedes Element geht
// durch requireId, ein leeres Array ist erlaubt (Container leeren).
function requireIdArray(value, label = "ids") {
  if (!Array.isArray(value)) throw new ValidationError(`${label} muss ein Array sein`);
  return value.map((id, i) => requireId(id, `${label}[${i}]`));
}

// Verpackt einen Handler so, dass ein ValidationError als 400 mit
// verstaendlicher Meldung beantwortet wird, statt als 500 im Error-Handler
// zu landen. Alles andere geht wie gehabt an next().
function wrapValidation(handler) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch((err) => {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        next(err);
      });
  };
}

module.exports = {
  ValidationError,
  MAX_TEXT_LENGTH,
  requireId,
  optionalId,
  requireDate,
  optionalDate,
  requirePlaylistId,
  optionalCount,
  requirePosition,
  requireText,
  optionalText,
  requireObject,
  optionalObject,
  requireIdArray,
  wrapValidation,
};
