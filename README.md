# 🎛️ mAirList Webinterface

> Der komplette mAirListDB Datenbankclient im Browser. Plattformunabhängig, ohne lokale Installation. Bibliothek, Playlists, Cue Editor, Datei Upload, Mix Editor und Voice Tracking.

![Status](https://img.shields.io/badge/status-in%20arbeit-orange)
![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20Express-green)
![Frontend](https://img.shields.io/badge/frontend-React-blue)
![DB](https://img.shields.io/badge/db-SQLite%20%2F%20PostgreSQL-336791)

---

## 📖 Worum es geht

Der mAirList Datenbankclient läuft nur unter Windows. Für ein dezentral organisiertes Team ist das ein Hindernis, besonders wenn Moderatorinnen und Moderatoren mit Mac oder Linux arbeiten. Dieses Projekt bildet den **mAirListDB Client** im Browser ab.

**Scope, bewusst festgelegt:**

- ✅ **Drin:** alles, was der DB Client kann — Bibliothek, Playlists/Sendeplan, Item Editor, Cue Editor, Mix Editor, Voice Tracking, Upload, Storages, Benutzerverwaltung (eigene, unabhängige Rollen: readonly, studio, dj, vtdj, admin), Dashboard, Administration (Benutzer, Logs), Panel-Einstellungen
- 🔽 **Späte Phase:** Mini Scheduler (automatische Musikplanung mit Stundenvorlagen), Werbung/Kampagnen
- ❌ **Nicht drin:** Playout Steuerung (die Sendesoftware selbst), Reports/Sendeprotokolle/GEMA

Vorbild ist das 2023 begonnene Projekt **TubeLive**. Der Look ist in [`DESIGN.md`](DESIGN.md) als verbindliches Design System festgehalten.

## 📂 Weitere Doku

| Datei | Inhalt |
|---|---|
| [`docs/FEATURES.md`](docs/FEATURES.md) | Vollständiger Funktionskatalog nach mAirList Doku, mit Status je Funktion |
| [`DESIGN.md`](DESIGN.md) | Design System (Farben, Layout, Komponenten) |
| [`SETUP.md`](SETUP.md) | Lokale Entwicklung, Git, Projektstruktur |
| [`docs/SCHEMA.md`](docs/SCHEMA.md) | Echtes DB-Schema aus einer .mldb Datei |
| [`docs/FIELD-SEMANTICS.md`](docs/FIELD-SEMANTICS.md) | Bestätigte Einheiten und Feldformate |

---

## 🏗️ Architektur und Arbeitsmodus

Die mAirListDB läuft auf einem echten SQL Server (PostgreSQL, MariaDB/MySQL oder MSSQL). Direkter Datenbankzugriff ist möglich. Das Schema ist in [`docs/SCHEMA.md`](docs/SCHEMA.md) dokumentiert, Feldbedeutungen und Einheiten in [`docs/FIELD-SEMANTICS.md`](docs/FIELD-SEMANTICS.md).

**Aktueller Modus: echte SQLite-DB.** Die gesamte Oberfläche spricht nur mit der Zwischenschicht `server/data/repository.js` (Mock) oder `server/data/sqlRepository.js` (SQLite, aktiviert via `DATA_SOURCE=sqlite`). Umschalten per Umgebungsvariable, Frontend und API bleiben unverändert. DB-Pfad über `DB_PATH`, Standard `./mairlist.mldb`. Die `.mldb` Datei gehört nicht ins Repo (`.gitignore`).

## ⚠️ Grundregeln

1. **Schreiben nur gegen eine Kopie**, bis das Datenformat bewiesen stimmt. Ein Fehler beim Rückschreiben korrumpiert Cue Punkte oder Playlists und fällt unter Umständen erst on air auf.
2. **Risiko zuerst testen.** Die riskanteste Annahme früh prüfen, nicht nach Wochen Frontend Arbeit.
3. **Jede Phase endet lauffähig.**

---

## 🤝 Mitmachen

- Bugs und Feature-Requests als Issue auf GitHub
- PRs willkommen, bitte vorher ein Issue öffnen
- Vor Arbeit am Frontend: [`DESIGN.md`](DESIGN.md) lesen
- Vor Arbeit am Backend: [`docs/SCHEMA.md`](docs/SCHEMA.md) und [`docs/FIELD-SEMANTICS.md`](docs/FIELD-SEMANTICS.md) lesen
- Commit Messages auf Deutsch oder Englisch, Format: `feat:`, `fix:`, `docs:`, `refactor:`

---

## 🚦 Phasenplan (Kurzfassung)

Details je Phase in [`docs/FEATURES.md`](docs/FEATURES.md).

| Phase | Inhalt | Status |
|---|---|---|
| **A** | Kern-Oberfläche: Elemente Liste, Item Editor (6 Tabs), Cue Editor, Upload, Playlist Editor, lokale vs. DB Änderungen, Audio-Streaming via HTTP | ✅ gegen Mock, Audio-Streaming via HTTP |
| **B** | Bibliothek vervollständigen: Tree-Knoten (Artists, Types, Attribute, Everything), Suchoptionen, Ordnerverwaltung, konfigurierbare Spalten | ✅ fertig |
| **C** | Storage Verwaltung: Storages anlegen/bearbeiten, Synchronisation mit Abgleich, Import-Optionen, Dummy↔File | ✅ CRUD fertig — Synchronisation/Import-Optionen weiterhin offen |
| **D** | **Mix Editor**: Timeline über mehrere Items, Volume-Hüllkurven, Übergänge programmieren | ✅ Mix Editor fertig — Song-Drag, alle 17 Cue-Marker draggbar, Overlap-Visualisierung, Audio-Streaming, Fokus-Modus, Speichern als Playlist-Override oder global |
| **E** | **Voice Tracking**: VT Recorder im Browser, Preroll/Record/StartNext-Ablauf, Einbettung mit Hüllkurve | ⬜ |
| **F** | Mehrbenutzer: Login, Rollen (readonly, studio, dj, vtdj, admin), Konflikt-Erkennung bei Playlists, Logs | 🟡 Eigene Benutzerverwaltung (bcrypt, 5 Rollen, Bootstrap-Admin) fertig, Administration (Benutzer- und Logs-Verwaltung) fertig — Konflikt-Erkennung fehlt noch |
| **G** | Echte DB: SQLite (better-sqlite3), 12/12 Write-Paths verified | ✅ |
| **H** | Produktivbetrieb: Backup, Caddy, TLS, eingeschränkter DB User | ⬜ |
| **I** 🔽 | Mini Scheduler (Vorlagen, automatische Planung), Werbung/Kampagnen | ⬜ späte Phase |

---

## 🧱 Tech Stack

Backend Node.js und Express, Frontend React mit Tailwind im Look des `DESIGN.md`, Datenbank SQLite (aktuell via `better-sqlite3`), PostgreSQL/MariaDB/MSSQL (geplant, echter mAirList SQL Server), Waveform wavesurfer.js, Audio Aufnahme MediaRecorder API, Reverse Proxy Caddy mit TLS.

## 🤖 Hinweise zum Vibecoding

- **Kontext mitgeben:** `DESIGN.md`, `docs/FEATURES.md` und das Datenmodell (`server/data/mockData.js`) bei jedem Prompt referenzieren, sonst driftet der Look oder das Modell erfindet Felder. Für die DB-Anbindung zusätzlich `docs/SCHEMA.md` und `docs/FIELD-SEMANTICS.md` referenzieren.
- **Schreiboperationen nie ohne Testfall:** direkt wieder auslesen und vergleichen, bei Cue Punkten zählt Millisekunden Genauigkeit.
- **Flaschenhals ist nicht das Frontend**, sondern Schema Verständnis und korrektes Rückschreiben.
- **Repository ist die einzige Datenquelle**, nie direkt aus Routen oder Frontend in die DB schreiben.
- **Schreiben nur gegen eine Kopie** (`mairlist.test.mldb`), nie gegen die echte DB bis der Write-Beweis steht.
- **`.mldb` Dateien gehören nicht ins Repo**, immer in `.gitignore` prüfen bevor `git add`.

## 🔒 Sicherheitsstand

Folgendes ist bereits gehärtet (nicht nochmal anfassen):
- CORS eingeschränkt auf konkrete Origins, per `ALLOWED_ORIGINS` Env konfigurierbar
- JSON-Body auf 1 MB begrenzt
- Globaler Error Handler in `server/index.js`
- `ITEM_WRITABLE_FIELDS` Whitelist in `server/routes/library.js` und `server/data/repository.js`
- Multer Upload-Limit 500 MB, Extension-Filter
- Path-Traversal-Schutz in `resolveAudioPath()` und `uploadFile()`
- Strukturierte Fehlermeldungen vom Server in `frontend/src/lib/api.js`
- Datumsformat-Validierung bei `GET /api/playlists?date=`
- Eigene Benutzerverwaltung (`server/webinterface-auth.db`) statt mAirLists
  `auth.db`: Passwort-Hashing mit bcrypt statt MD5, siehe
  [Sicherheitsstand in `docs/FEATURES.md`](docs/FEATURES.md#-mehrbenutzer-und-administration)
- `dotenv` fest auf `16.4.5` gepinnt (`server/package.json`) — 17.x enthält
  einen Prompt-Injection-Payload, relevant für KI-Coding-Agenten