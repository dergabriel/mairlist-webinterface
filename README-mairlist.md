# 🎛️ mAirList Webinterface

> Die komplette mAirList Datenbank im Browser. Plattformunabhängig, ohne lokale Installation, mit Datei Upload, Cue Editor, Mix Editor und Voice Tracking.

![Status](https://img.shields.io/badge/status-in%20arbeit-orange)
![Backend](https://img.shields.io/badge/backend-Node.js%20%2B%20Express-green)
![Frontend](https://img.shields.io/badge/frontend-React-blue)
![DB](https://img.shields.io/badge/db-PostgreSQL-336791)

---

## 📖 Worum es geht

Der mAirList Datenbankclient läuft nur unter Windows. Für ein dezentral organisiertes Team ist das ein Hindernis, besonders wenn Moderatorinnen und Moderatoren mit Mac oder Linux arbeiten. Dieses Projekt bildet die Funktionen des Datenbankclients im Browser ab, als vollwertiger Zugang zur **mAirListDB** selbst.

Vorbild ist das 2023 begonnene Projekt **TubeLive**, dessen Sourcecode nicht mehr existiert, dessen Look und Struktur aber über Screenshots dokumentiert sind. Der Look ist im `DESIGN.md` als verbindliches Design System festgehalten.

---

## 🧩 Ausgangslage

Die mAirListDB läuft auf einem echten SQL Server (PostgreSQL, MariaDB/MySQL oder Microsoft SQL Server), für Einzelplatz gibt es eine lokale `.mldb` Datei. Direkter Datenbankzugriff ist also möglich. Was fehlt, ist eine offizielle Doku des Schemas, die wir uns selbst erarbeiten.

**Aktueller Arbeitsmodus:** Frontend zuerst, mit Mock Daten. Die ganze Oberfläche spricht nur mit einer Zwischenschicht (`repository.js`). Sobald das echte Schema vorliegt, wird nur diese eine Datei auf SQL umgestellt, Frontend und API bleiben unverändert.

---

## ✨ Funktionsumfang und Status

Legende: ✅ fertig · 🚧 in Arbeit · ⬜ offen · 🔽 niedrige Priorität

### 📚 Elemente und Bibliothek

| Funktion | Status |
|---|---|
| Bibliotheks Baum, Ordner Navigation | ✅ |
| Item Liste mit Spalten, Sortierung | ✅ |
| Suche und Filter | ✅ |
| Mehrfachauswahl | ✅ |
| Minutenanzeige der Länge | ✅ |
| Neues Element anlegen | ⬜ |
| Element löschen | ⬜ |
| Ordner anlegen, umbenennen, verschieben | ⬜ |
| Storages verwalten | ⬜ |
| Synchronisation, Ordner scannen | ⬜ |

### 🧱 Element Typen

Der Bibliothek müssen alle Typen bewusst sein, nicht nur Tracks und Jingles:

| Typ | Beschreibung | Status |
|---|---|---|
| Music | normaler Track | ✅ |
| Jingle | Verpackung, Sweeper, Opener | ✅ |
| Advertising | Werbespot | ✅ |
| **Container: Hook** | zufälliger Hook aus einem Pool | ⬜ |
| **Container: Regio** | regionale Auseinanderschaltung | ⬜ |
| **Container: Nachrichten** | lädt zur vollen Stunde die News | ⬜ |
| Container: sonstige | weitere dynamische Container | ⬜ |
| Stream | Livestream Quelle | ⬜ |
| Dummy | Platzhalter | ⬜ |

### 🎚️ Item Editor (sechs Tabs)

| Tab | Inhalt | Status |
|---|---|---|
| Allgemein | Titel, Interpret, Type, Länge, Ende, IDs, Kommentar, Farbe, Cover | 🚧 |
| Wiedergabe | Abspieleinstellungen, Gain | ⬜ |
| Attribute | Key Value Attribute (Energy, Mood, BPM) | ⬜ |
| Sendeplanung | Rotationen, Zeitfenster, Regeln | ⬜ |
| Verlauf | wann lief das Item | ⬜ |
| Cue Editor | Waveform plus alle 17 Cue Punkte | 🚧 |

### 🔀 Playlist und Ablaufplanung

| Funktion | Status |
|---|---|
| Geplante Playlists anzeigen | ⬜ |
| Playlist bearbeiten, umsortieren | ⬜ |
| **Mix Editor** (siehe unten) | ⬜ |

Der **Mix Editor** ist die aufwendigste Playlist Funktion. Zwei Songs liegen gleichzeitig im Cue Editor, und man programmiert den Übergang zwischen ihnen, also wie das Ende des einen und der Anfang des nächsten ineinander laufen. Er baut technisch auf dem Cue Editor auf und kommt daher erst danach.

### 🎙️ Voice Tracking

Aufnahme im Browser, Timing gegen die Songenden, Einbettung als Item mit korrekten Overlaps. Königsdisziplin, kommt spät.

### 🖥️ Playout, Administration, Werbung

| Bereich | Funktionen | Status |
|---|---|---|
| Playout | Übersicht, Automation, Einstellungen | ⬜ |
| Administration | Benutzer, Gruppen und Rechte, Logs | ⬜ |
| Werbung | Kampagnen, Advertising | 🔽 |

### 🔐 Rahmen

Login und Authentifizierung, Refresh, Anbindung ans echte Backend statt Mock. ⬜

---

## ⚠️ Grundregeln

1. **Schreiben nur gegen eine Kopie**, bis das Datenformat bewiesen stimmt. Ein Fehler beim Rückschreiben korrumpiert Cue Punkte oder Playlists, und das fällt unter Umständen erst on air auf.
2. **Risiko zuerst testen.** Die riskanteste Annahme früh prüfen, nicht nach Wochen Frontend Arbeit.
3. **Jede Phase endet lauffähig.**

---

## 🚦 Phasen

Frontend zuerst mit Mock, dann Datenbank Anbindung, dann Schreiben.

- **0️⃣ Landkarte** ⬜ Schema Dump ziehen, `SCHEMA.md`. Aktuell blockiert, kein DB Zugriff.
- **1️⃣ Semantik Doku** ⬜ Feldbedeutungen per Diff Methode, `FIELD-SEMANTICS.md`.
- **2️⃣ Read only Oberfläche** 🚧 Elemente Liste steht, es fehlen Editor Ansichten, Playlist, Verwaltung.
- **3️⃣ Item Editor** 🚧 Allgemein und Cue Editor im Aufbau, restliche Tabs offen.
- **4️⃣ Backend Anbindung** ⬜ Mock durch echte API und SQL ersetzen.
- **5️⃣ Schreib Beweis** ⬜ ein Cue Punkt sauber in die Kopie schreiben.
- **6️⃣ Schreiben produktiv** ⬜ Metadaten, Upload, Cue Punkte, Ordner.
- **7️⃣ Playlist und Mix Editor** ⬜ Übergänge zwischen zwei Songs programmieren.
- **8️⃣ Voice Tracking** ⬜
- **9️⃣ Werbung** 🔽 niedrigste Priorität.
- **🔟 Produktivbetrieb** ⬜ Auth, Backup, Caddy, TLS, eingeschränkter DB User.

---

## 🧱 Tech Stack

Backend Node.js und Express, Frontend React mit Tailwind im Look des `DESIGN.md`, Datenbank PostgreSQL, Waveform wavesurfer.js, Audio Aufnahme MediaRecorder API, Reverse Proxy Caddy mit TLS.

---

## 🤖 Hinweise zum Vibecoding

- **Kontext mitgeben:** `DESIGN.md` und das Schema bei jedem Prompt mitliefern, sonst driftet der Look oder das Modell erfindet Spaltennamen.
- **Schreiboperationen nie ohne Testfall:** direkt wieder auslesen und vergleichen, bei Cue Punkten zählt Millisekunden Genauigkeit.
- **Flaschenhals ist nicht das Frontend**, sondern Schema Verständnis und korrektes Rückschreiben.
