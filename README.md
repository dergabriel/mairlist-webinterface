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
| [`docs/MAIRLISTDB-API.md`](docs/MAIRLISTDB-API.md) | Dokumentation der mAirListDB Server REST API (Port 8840), Basis für `server/data/apiRepository.js` (löst das SQLite-Locking-Problem mit parallel laufendem mAirList) |

---

## 🏗️ Architektur und Arbeitsmodus

Die mAirListDB läuft auf einem echten SQL Server (PostgreSQL, MariaDB/MySQL oder MSSQL). Direkter Datenbankzugriff ist möglich. Das Schema ist in [`docs/SCHEMA.md`](docs/SCHEMA.md) dokumentiert, Feldbedeutungen und Einheiten in [`docs/FIELD-SEMANTICS.md`](docs/FIELD-SEMANTICS.md).

**Aktueller Modus: echte SQLite-DB.** Die gesamte Oberfläche spricht nur mit der Zwischenschicht `server/data/repository.js` (Mock), `server/data/sqlRepository.js` (SQLite, aktiviert via `DATA_SOURCE=sqlite`) oder `server/data/apiRepository.js` (mAirListDB Server REST-API, aktiviert via `DATA_SOURCE=api`). Umschalten per Umgebungsvariable, Frontend und API bleiben unverändert. DB-Pfad über `DB_PATH`, Standard `./mairlist.mldb`. Die `.mldb` Datei gehört nicht ins Repo (`.gitignore`).

**Dritte Datenquelle: mAirListDB Server API (`DATA_SOURCE=api`).** Statt die `.mldb`-Datei direkt zu öffnen, spricht `apiRepository.js` mit dem mAirListDB Server über dessen REST-API (Port 8840, siehe [`docs/MAIRLISTDB-API.md`](docs/MAIRLISTDB-API.md)). Löst das SQLite-Locking-Problem ("database is locked" bei parallel laufendem mAirList) strukturell, da nicht mehr auf dieselbe Datei zugegriffen wird. Konfiguration über `API_DB_BASE_URL`, `API_DB_USER`, `API_DB_PASSWORD`, `API_DB_STATION` (siehe `server/.env.production.example`). Der api-Modus ist inzwischen für den Kern-Workflow produktiv nutzbar und live gegen die echte mAirList-Installation verifiziert: Ordnerbaum, Items lesen/bearbeiten/speichern, Audio-Streaming (über den DBServer, mit Transcoding-Option) und Playlist lesen/bearbeiten (umsortieren, einfügen, entfernen). Lese-Pfade (Folders/Items/Playlists/Audio-Proxy/Artists/Titles) und der zentrale Schreib-Pfad (`updateItem`, `writeHour`) sind mit 19 Smoke-Tests gegen die Produktivinstanz verifiziert (`server/scripts/smoke-reads-api.js`, `smoke-writes-api.js`). Was dort noch fehlt, ist in [`docs/FEATURES.md`](docs/FEATURES.md#-api-basierte-datenquelle-mairlistdb-server) klar als "noch nicht verfügbar" gelistet — betroffene Funktionen werfen einen sprechenden Fehler statt zu crashen oder falsche Daten zu liefern. Die Webinterface-eigene Benutzerverwaltung (`server/data/webAuthDb.js`) ist von `DATA_SOURCE` komplett unabhängig und funktioniert in allen drei Modi identisch.

Vier Erkenntnisse aus der Praxis, die die Doku geprägt haben (Details in [`docs/MAIRLISTDB-API.md`](docs/MAIRLISTDB-API.md) und [`docs/FEATURES.md`](docs/FEATURES.md#-api-basierte-datenquelle-mairlistdb-server)):

1. Playlist-Einträge kommen von der API **flach** — kein `{Class:"Playlist", Time, Item}`-Wrapper, wie eine frühere Doku-Version fälschlich annahm.
2. Playlist-Schreiboperationen laufen als Read-Modify-Write über die **rohen** API-Einträge, damit Dummy-Einträge (`Class:"Dummy"`, z. B. "PH Stundenanfang") und unbekannte Felder verlustfrei erhalten bleiben.
3. Ein Concurrency-Limit ist nötig (`API_DB_MAX_CONCURRENT`, Default 3): Bei ~12 parallelen Requests meldete der DBServer selbst "database is locked".
4. Eine async-Funktion aus `apiRepository.js` darf nicht von einem synchronen `res.json()` im Route-Handler aufgerufen werden — sonst wird ein unaufgelöstes Promise als `{}` statt der erwarteten Liste serialisiert.

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

Backend Node.js und Express, Frontend React mit Tailwind im Look des `DESIGN.md`, Datenbank SQLite (aktuell via `better-sqlite3`) oder wahlweise Zugriff über die mAirListDB Server REST-API (`server/data/apiRepository.js`, `DATA_SOURCE=api`), PostgreSQL/MariaDB/MSSQL (geplant, echter mAirList SQL Server), Waveform wavesurfer.js, Audio Aufnahme MediaRecorder API, Reverse Proxy Caddy mit TLS.

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