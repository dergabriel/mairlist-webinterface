// Panel-eigene Einstellungen (nicht mAirList-Konfiguration), persistiert als
// server/settings.json. Datei wird mit Defaults angelegt falls nicht vorhanden.

const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(__dirname, "..", "settings.json");

const DEFAULT_SETTINGS = {
  stationName: "Mein Radio",
  dateFormat: "DD.MM.YYYY",
  timeFormat: "HH:mm:ss",
  defaultDate: "today",
  itemsPerPage: 50,
  audioBaseDir: "",
  uploadBaseDir: "",
  allowedOrigins: "",
};

function getSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(data) {
  const current = getSettings();
  const merged = { ...current, ...data };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

module.exports = { getSettings, saveSettings };
